import { afterEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  aggregateFormalReviews,
  buildReviewDisagreements,
  lockBlindReviews,
  prepareBlindReviewInputs,
} from "./formal-review"
import {
  mainOrders,
  POLICY_PROFILE_REVISION,
  PROTOCOL_REVISION,
} from "./protocol"
import { formalAssessmentCheckLayers } from "./formal-review-lock"
import { hashFile, type FrozenManifest } from "./freeze"
import { exportBlindReviewPackets } from "./review"

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test("formal review lock preserves the denominator and applies the 7-of-8 boundary", async () => {
  const root = mkdtempSync(join(tmpdir(), "repa-als-021-formal-review-"))
  temporaryRoots.push(root)
  await writeFormalCampaign(root, (blockIndex, scenarioId) => !(
    blockIndex === 0 &&
    (scenarioId === "novice_worked_example" ||
      scenarioId === "capable_independent_prediction")
  ))
  await exportBlindReviewPackets(root)
  await prepareBlindReviewInputs(root, { mode: "synthetic-fixture" })
  const mapping = (await Bun.file(join(root, "review-map.json")).json()) as Array<{
    reviewId: string
    executionKey: string
    scenarioId: string
  }>
  const recordsA = mapping.map((entry) =>
    reviewRecord(
      entry.reviewId,
      entry.scenarioId === "novice_worked_example" &&
        entry.executionKey.startsWith("block-2:")
        ? "fail"
        : "pass",
      "reviewer A evidence",
    ),
  )
  const recordsB = recordsA.map((record) => ({
    ...record,
    evidence: "reviewer B used different words for the same ratings",
  }))
  const contrastPackets = (await Bun.file(
    join(root, "review-contrast-packets.jsonl"),
  ).text()).trim().split(/\r?\n/).map((line) => JSON.parse(line)) as Array<{
    contrastId: string
  }>
  const contrastsA = contrastPackets.map((packet) => ({
    contrastId: packet.contrastId,
    contrastFit: "pass",
    evidence: "reviewer A contrast evidence",
  }))
  const contrastsB = contrastsA.map((record) => ({
    ...record,
    evidence: "reviewer B contrast evidence",
  }))
  const reviewerPaths = await writeReviewerFiles(
    root,
    recordsA,
    recordsB,
    contrastsA,
    contrastsB,
  )

  await lockBlindReviews(root, reviewerPaths, { mode: "synthetic-fixture" })
  expect(await buildReviewDisagreements(root)).toEqual([])
  const adjudicationPath = join(root, "review-adjudication.jsonl")
  await Bun.write(adjudicationPath, "")
  const result = await aggregateFormalReviews(root, adjudicationPath)

  expect(result.conditions.capable_independent_prediction).toMatchObject({
    passedSamples: 7,
    totalSamples: 8,
    gatePassed: true,
  })
  expect(result.conditions.novice_worked_example).toMatchObject({
    passedSamples: 6,
    totalSamples: 8,
    gatePassed: false,
  })
  expect(result.conditions.capable_independent_prediction.automaticFailures).toBe(1)
  expect(result.overallPassed).toBe(false)

  await Bun.write(reviewerPaths[0]!.individualPath, "tampered\n")
  await expect(aggregateFormalReviews(root, adjudicationPath)).rejects.toThrow(
    "changed after review lock",
  )
})

test("unclear ratings require exact adjudication and contrast gates include their components", async () => {
  const root = mkdtempSync(join(tmpdir(), "repa-als-021-formal-adjudication-"))
  temporaryRoots.push(root)
  await writeFormalCampaign(root, () => true)
  await exportBlindReviewPackets(root)
  await prepareBlindReviewInputs(root, { mode: "synthetic-fixture" })
  const mapping = (await Bun.file(join(root, "review-map.json")).json()) as Array<{
    reviewId: string
    executionKey: string
    scenarioId: string
  }>
  const recordsA = mapping.map((entry) =>
    reviewRecord(entry.reviewId, "pass", "reviewer A evidence"),
  )
  const recordsB = recordsA.map((record) => ({
    ...record,
    evidence: "reviewer B evidence",
  }))
  const unclearIndex = mapping.findIndex((entry) =>
    entry.scenarioId === "novice_worked_example"
  )
  recordsA[unclearIndex]!.durablePurposePreserved = "unclear"
  recordsB[unclearIndex]!.durablePurposePreserved = "unclear"
  const failedRepresentationIndex = mapping.findIndex((entry) =>
    entry.executionKey.startsWith("block-1:") &&
    entry.scenarioId === "failed_prose_represent"
  )
  recordsA[failedRepresentationIndex]!.representationChange = "fail"
  recordsB[failedRepresentationIndex]!.representationChange = "fail"

  const contrastPackets = (await Bun.file(
    join(root, "review-contrast-packets.jsonl"),
  ).text()).trim().split(/\r?\n/).map((line) => JSON.parse(line)) as Array<{
    contrastId: string
  }>
  const contrastsA = contrastPackets.map((packet) => ({
    contrastId: packet.contrastId,
    contrastFit: "pass",
    evidence: "reviewer A contrast evidence",
  }))
  const contrastsB = contrastsA.map((record) => ({
    ...record,
    evidence: "reviewer B contrast evidence",
  }))
  contrastsB[0]!.contrastFit = "fail"
  const reviewerPaths = await writeReviewerFiles(
    root,
    recordsA,
    recordsB,
    contrastsA,
    contrastsB,
  )
  await lockBlindReviews(root, reviewerPaths, { mode: "synthetic-fixture" })
  const disagreements = await buildReviewDisagreements(root)
  expect(disagreements.map((item) => item.key)).toEqual([
    `individual:${mapping[unclearIndex]!.reviewId}:durablePurposePreserved`,
    "contrast:C001:contrastFit",
  ])

  const adjudicationPath = join(root, "adjudication.jsonl")
  await Bun.write(adjudicationPath, "")
  await expect(aggregateFormalReviews(root, adjudicationPath)).rejects.toThrow(
    "exact disagreement queue",
  )
  await Bun.write(adjudicationPath, [
    {
      key: disagreements[0]!.key,
      resolved: "unclear",
      evidence: "Still unclear.",
    },
    {
      key: disagreements[1]!.key,
      resolved: "pass",
      evidence: "The visible moves remain distinct.",
    },
  ].map((item) => JSON.stringify(item)).join("\n") + "\n")
  await expect(aggregateFormalReviews(root, adjudicationPath)).rejects.toThrow(
    "Invalid adjudication resolution",
  )
  await Bun.write(adjudicationPath, [
    {
      key: disagreements[0]!.key,
      resolved: "not_applicable",
      evidence: "No durable write is visible in this packet.",
    },
    {
      key: disagreements[1]!.key,
      resolved: "pass",
      evidence: "The visible moves remain distinct.",
    },
  ].map((item) => JSON.stringify(item)).join("\n") + "\n")
  const result = await aggregateFormalReviews(root, adjudicationPath)

  expect(result.conditions.failed_prose_represent.passedSamples).toBe(7)
  expect(result.engineeringGates.historyPairSensitivity).toMatchObject({
    passed: 7,
    total: 8,
    gatePassed: true,
  })
  expect(result.conditions.return_reason_ablation.gatePassed).toBeNull()
  expect(result.overallPassed).toBe(true)
})

test("locked case results cannot be changed behind unchanged review packets", async () => {
  const root = mkdtempSync(join(tmpdir(), "repa-als-021-formal-result-lock-"))
  temporaryRoots.push(root)
  await writeFormalCampaign(root, () => true)
  await exportBlindReviewPackets(root)
  await prepareBlindReviewInputs(root, { mode: "synthetic-fixture" })
  const reviewerPaths = await writeAllPassReviewerFiles(root)
  await expect(exportBlindReviewPackets(root)).rejects.toThrow(
    "already sealed",
  )
  await expect(lockBlindReviews(root, reviewerPaths.map((reviewer, index) => ({
    ...reviewer,
    reviewInputSha256: index === 0 ? "0".repeat(64) : reviewer.reviewInputSha256,
  })), { mode: "synthetic-fixture" })).rejects.toThrow(
    "sealed review input hash",
  )
  await expect(lockBlindReviews(root, [
    reviewerPaths[0],
    { ...reviewerPaths[1], taskId: ` ${reviewerPaths[0].taskId} ` },
  ], { mode: "synthetic-fixture" })).rejects.toThrow(
    "distinct non-empty taskId",
  )
  await lockBlindReviews(root, reviewerPaths, { mode: "synthetic-fixture" })
  const mapping = (await Bun.file(join(root, "review-map.json")).json()) as Array<{
    resultPath: string
  }>
  const resultPath = mapping[0]!.resultPath
  const bundle = await Bun.file(resultPath).json()
  await Bun.write(resultPath, `${JSON.stringify({ ...bundle, outcome: { text: "tampered" } })}\n`)

  await expect(buildReviewDisagreements(root)).rejects.toThrow(
    "changed after review lock",
  )
})

test("formal v1 pre-review fails closed after production source evolves", async () => {
  const root = mkdtempSync(join(tmpdir(), "repa-als-021-formal-strict-path-"))
  temporaryRoots.push(root)
  const frozenManifestUrl = new URL("./frozen-v1.json", import.meta.url)
  const frozenSource = await Bun.file(frozenManifestUrl).json() as FrozenManifest
  expect(await hashFile(fileURLToPath(frozenManifestUrl))).toBe(
    "5f1a04c64afa1eeae3738e90be0efc7dbe89e01652d49ed81094cf33b74b86c6",
  )
  await writeStrictFormalCampaign(root, frozenSource)
  await exportBlindReviewPackets(root)

  await expect(prepareBlindReviewInputs(root)).rejects.toThrow(
    "Frozen formal source changed",
  )
  expect(await Bun.file(join(root, "review-input-lock.json")).exists()).toBe(false)
  expect(await Bun.file(join(root, "review-input-lock.sha256")).exists()).toBe(false)
})

function formalResult(
  blockIndex: number,
  position: number,
  scenarioId: (typeof mainOrders)[number][number],
  reviewablePolicySample: boolean,
) {
  return {
    block: `block-${blockIndex + 1}`,
    plannedPosition: position + 1,
    scenario: { id: scenarioId },
    providerCalls: [{ sequence: 1, request: { prompt: "opaque" }, streamParts: [] }],
    outcome: { text: "bounded response" },
    initialSnapshot: { agendaConcerns: [], sessions: [] },
    finalSnapshot: { agendaConcerns: [], sessions: [] },
    assessment: {
      programPassed: true,
      harnessIntegrityPassed: true,
      reviewablePolicySample,
      mechanicalPolicyPassed: reviewablePolicySample,
      checks: [
        {
          name: "fixture program integrity",
          layer: "program",
          passed: true,
          detail: "fixture",
        },
        {
          name: "fixture harness integrity",
          layer: "harness",
          passed: true,
          detail: "fixture",
        },
        {
          name: "fixture reviewable sample",
          layer: "sample",
          passed: reviewablePolicySample,
          detail: "fixture",
        },
        {
          name: "mutation attempts exactly match the predeclared condition",
          layer: "policy",
          passed: true,
          detail: "fixture",
        },
        {
          name: "current source-grounded material was read successfully before the final response",
          layer: "policy",
          passed: true,
          detail: "fixture",
        },
      ],
    },
  }
}

async function writeFormalCampaign(
  root: string,
  reviewable: (
    blockIndex: number,
    scenarioId: (typeof mainOrders)[number][number],
  ) => boolean,
) {
  for (const [blockIndex, order] of mainOrders.entries()) {
    for (const [position, scenarioId] of order.entries()) {
      const caseRoot = join(root, `block-${blockIndex + 1}`, `case-${position + 1}`)
      mkdirSync(caseRoot, { recursive: true })
      const resultPath = join(caseRoot, "attempt-01.result.json")
      await Bun.write(
        resultPath,
        JSON.stringify(formalResult(
          blockIndex,
          position,
          scenarioId,
          reviewable(blockIndex, scenarioId),
        )),
      )
      await Bun.write(join(caseRoot, "complete.json"), JSON.stringify({ resultPath }))
    }
  }
}

async function writeStrictFormalCampaign(root: string, frozenSource: FrozenManifest) {
  for (const [blockIndex, order] of mainOrders.entries()) {
    for (const [position, scenarioId] of order.entries()) {
      const caseRoot = join(root, `block-${blockIndex + 1}`, `case-${position + 1}`)
      mkdirSync(caseRoot, { recursive: true })
      const resultPath = join(caseRoot, "attempt-01.result.json")
      const checks = Object.entries(formalAssessmentCheckLayers(scenarioId)).map(
        ([name, layer]) => ({ name, layer, passed: true, detail: "formal fixture" }),
      )
      await Bun.write(resultPath, JSON.stringify({
        ledgerId: "ALS-021",
        mode: "main",
        protocolRevision: PROTOCOL_REVISION,
        block: `block-${blockIndex + 1}`,
        plannedPosition: position + 1,
        scenario: { id: scenarioId },
        modelConfiguration: {
          requestedModel: "deepseek-v4-flash",
          policyProfileRevision: POLICY_PROFILE_REVISION,
          provider: "deepseek",
          thinking: "disabled",
          temperature: "provider_default",
          providerSeed: null,
          maxModelSteps: 6,
          maxOutputTokensPerStep: 1_200,
          maxRetries: 0,
          timeoutMs: 90_000,
        },
        frozenSource,
        providerCalls: [{
          sequence: 1,
          request: { prompt: "opaque formal-path fixture" },
          streamParts: [],
        }],
        outcome: { text: "bounded response" },
        initialSnapshot: { agendaConcerns: [], sessions: [] },
        finalSnapshot: { agendaConcerns: [], sessions: [] },
        assessment: {
          programPassed: true,
          harnessIntegrityPassed: true,
          reviewablePolicySample: true,
          mechanicalPolicyPassed: true,
          checks,
        },
        modelAliasConsistent: true,
        estimatedCostUsd: 0,
        budgetChargeUsd: 0,
      }))
      await Bun.write(join(caseRoot, "complete.json"), JSON.stringify({
        resultPath,
        estimatedCostUsd: 0,
      }))
    }
  }
}

function reviewRecord(reviewId: string, situationFit: "pass" | "fail", evidence: string) {
  return {
    reviewId,
    situationFit,
    representationChange: "pass",
    cognitiveRolePreserved: "pass",
    currentRequestRespected: "pass",
    directHelpDelivered: "pass",
    boundaryProgress: "pass",
    discriminationObservable: "pass",
    durablePurposePreserved: "pass",
    learnerAuthorshipGrounded: "pass",
    answerLeakage: "absent",
    factualSeverity: "none",
    unsupportedLearningStateClaim: "absent",
    observedMove: "bounded move",
    evidence,
  }
}

async function writeReviewerFiles(
  root: string,
  recordsA: unknown[],
  recordsB: unknown[],
  contrastsA: unknown[],
  contrastsB: unknown[],
) {
  const reviewInputSha256 = (await Bun.file(
    join(root, "review-input-lock.sha256"),
  ).text()).trim()
  const writeJsonl = async (name: string, records: unknown[]) => {
    const path = join(root, name)
    await Bun.write(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`)
    return path
  }
  return [
    {
      reviewerId: "A",
      taskId: "reviewer-a-task",
      model: "review-model-a",
      provider: "provider-a",
      reviewInputSha256,
      individualPath: await writeJsonl("review-a.jsonl", recordsA),
      contrastPath: await writeJsonl("contrast-a.jsonl", contrastsA),
    },
    {
      reviewerId: "B",
      taskId: "reviewer-b-task",
      model: "review-model-b",
      provider: "provider-b",
      reviewInputSha256,
      individualPath: await writeJsonl("review-b.jsonl", recordsB),
      contrastPath: await writeJsonl("contrast-b.jsonl", contrastsB),
    },
  ] as const
}

async function writeAllPassReviewerFiles(root: string) {
  const mapping = (await Bun.file(join(root, "review-map.json")).json()) as Array<{
    reviewId: string
  }>
  const recordsA = mapping.map((entry) =>
    reviewRecord(entry.reviewId, "pass", "reviewer A evidence"),
  )
  const recordsB = recordsA.map((record) => ({
    ...record,
    evidence: "reviewer B evidence",
  }))
  const contrastPackets = (await Bun.file(
    join(root, "review-contrast-packets.jsonl"),
  ).text()).trim().split(/\r?\n/).map((line) => JSON.parse(line)) as Array<{
    contrastId: string
  }>
  const contrastsA = contrastPackets.map((packet) => ({
    contrastId: packet.contrastId,
    contrastFit: "pass",
    evidence: "reviewer A contrast evidence",
  }))
  const contrastsB = contrastsA.map((record) => ({
    ...record,
    evidence: "reviewer B contrast evidence",
  }))
  return writeReviewerFiles(root, recordsA, recordsB, contrastsA, contrastsB)
}
