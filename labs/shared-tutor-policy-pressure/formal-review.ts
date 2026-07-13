/**
 * Public ALS-021 formal-review entrypoint. It owns reviewer disagreement,
 * adjudication, verdict aggregation, and the CLI. The tamper-evident campaign
 * and reviewer-input boundary lives in formal-review-lock.ts.
 */
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"
import {
  blindReviewRatingFields,
  contrastReviewPlan,
  reviewRules,
  scenarioById,
  scenarioIds,
  type BlindReviewRatings,
  type ScenarioId,
} from "./protocol"
import { hashFile } from "./freeze"
import {
  type BlindContrastReviewRecord,
  type BlindReviewRecord,
} from "./review"
import {
  CONTRAST_THRESHOLD,
  FORMAL_SAMPLE_COUNT,
  INDIVIDUAL_THRESHOLD,
  allLockedFiles,
  assertProjectionMatchesLock,
  atomicTextWrite,
  loadCampaignProjection,
  lockBlindReviews,
  prepareBlindReviewInputs,
  readAndVerifyLock,
  readContrastReviewMap,
  readFileSnapshot,
  requiredCheck,
  verifyLockedFile,
  type CampaignSample,
  type VerifiedReviewInputs,
} from "./formal-review-lock"

export {
  lockBlindReviews,
  prepareBlindReviewInputs,
}
export type { BlindReviewSubmission } from "./formal-review-lock"

const VERDICT_SCHEMA_REVISION = "als-021-formal-verdict-v1"

type ListedBlindRatingField = (typeof blindReviewRatingFields)[number]
type EveryBlindRatingFieldIsListed = [
  Exclude<keyof BlindReviewRatings, ListedBlindRatingField>,
] extends [never] ? true : false
const everyBlindRatingFieldIsListed: EveryBlindRatingFieldIsListed = true
void everyBlindRatingFieldIsListed

const allowedResolutionByField = Object.freeze({
  situationFit: ["pass", "fail"],
  representationChange: ["pass", "fail", "not_applicable"],
  cognitiveRolePreserved: ["pass", "fail", "not_applicable"],
  currentRequestRespected: ["pass", "fail", "not_applicable"],
  directHelpDelivered: ["pass", "fail", "not_applicable"],
  boundaryProgress: ["pass", "fail", "not_applicable"],
  discriminationObservable: ["pass", "fail", "not_applicable"],
  durablePurposePreserved: ["pass", "fail", "not_applicable"],
  learnerAuthorshipGrounded: ["pass", "fail", "not_applicable"],
  answerLeakage: ["present", "absent", "not_applicable"],
  factualSeverity: ["none", "minor", "severe"],
  unsupportedLearningStateClaim: ["present", "absent"],
  contrastFit: ["pass", "fail"],
} as const satisfies Record<ListedBlindRatingField | "contrastFit", readonly string[]>)

const adjudicationRecordSchema = z.strictObject({
  key: z.string().min(1),
  resolved: z.string().min(1),
  evidence: z.string().min(1),
})

export type ReviewDisagreement = Readonly<{
  key: string
  kind: "individual" | "contrast"
  recordId: string
  field: string
  reviewerA: string
  reviewerB: string
}>

if (import.meta.main) {
  await formalReviewMain().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

export async function buildReviewDisagreements(campaignDirectory: string) {
  const inputs = await readAndVerifyLock(campaignDirectory)
  const verdictFileName = inputs.lock.mode === "formal"
    ? "formal-verdict.json"
    : "synthetic-fixture-verdict.json"
  const decisionsFileName = inputs.lock.mode === "formal"
    ? "formal-decisions.json"
    : "synthetic-fixture-decisions.json"
  if (
    existsSync(join(inputs.lock.campaignDirectory, verdictFileName)) ||
    existsSync(join(inputs.lock.campaignDirectory, decisionsFileName))
  ) {
    throw new Error("A formal verdict already exists; review it instead of overwriting it")
  }
  const disagreements = computeDisagreements(inputs)
  await atomicTextWrite(
    join(inputs.lock.campaignDirectory, "review-disagreements.json"),
    `${JSON.stringify({
      schemaRevision: "als-021-review-disagreements-v1",
      reviewLockSha256: inputs.lockHash,
      generatedAt: new Date().toISOString(),
      items: disagreements,
    }, null, 2)}\n`,
  )
  return disagreements
}

export async function aggregateFormalReviews(
  campaignDirectory: string,
  adjudicationPath: string,
) {
  const inputs = await readAndVerifyLock(campaignDirectory)
  const verdictFileName = inputs.lock.mode === "formal"
    ? "formal-verdict.json"
    : "synthetic-fixture-verdict.json"
  const decisionsFileName = inputs.lock.mode === "formal"
    ? "formal-decisions.json"
    : "synthetic-fixture-decisions.json"
  if (
    existsSync(join(inputs.lock.campaignDirectory, verdictFileName)) ||
    existsSync(join(inputs.lock.campaignDirectory, decisionsFileName))
  ) {
    throw new Error("A formal verdict already exists; review it instead of overwriting it")
  }
  const disagreements = computeDisagreements(inputs)
  const adjudicationInput = await readAdjudication(adjudicationPath, disagreements)
  const adjudication = adjudicationInput.records
  const projection = await loadCampaignProjection(
    inputs.lock.campaignDirectory,
    inputs.lock.mode,
  )
  assertProjectionMatchesLock(projection, inputs.lock)

  const reviewerA = byId(inputs.individualA, "reviewId")
  const reviewerB = byId(inputs.individualB, "reviewId")
  const contrastA = byId(inputs.contrastA, "contrastId")
  const contrastB = byId(inputs.contrastB, "contrastId")
  const sampleDecisions = projection.samples.map((sample) => {
    const recordA = reviewerA.get(sample.reviewId)!
    const recordB = reviewerB.get(sample.reviewId)!
    const resolved: Record<string, string> = {}
    const resolutionSource: Record<string, "agreement" | "adjudication"> = {}
    for (const field of blindReviewRatingFields) {
      const key = individualDisagreementKey(sample.reviewId, field)
      const decision = adjudication.get(key)
      resolved[field] = decision?.resolved ?? recordA[field]
      resolutionSource[field] = decision ? "adjudication" : "agreement"
      if (!decision && recordA[field] !== recordB[field]) {
        throw new Error(`Unresolved blind review disagreement: ${key}`)
      }
    }
    const ratings = resolved as BlindReviewRatings
    const requirements = reviewRules[sample.scenarioId].requiredRatings.map((requirement) => ({
      field: requirement.field,
      accepted: requirement.accepted,
      actual: ratings[requirement.field],
      passed: (requirement.accepted as readonly string[]).includes(
        ratings[requirement.field],
      ),
    }))
    const reviewerCriterionPassed = requirements.every((item) => item.passed)
    return {
      reviewId: sample.reviewId,
      executionKey: sample.executionKey,
      scenarioId: sample.scenarioId,
      resultPath: sample.resultPath,
      resultSha256: inputs.lock.cases.find(
        (item) => item.reviewId === sample.reviewId,
      )!.result.sha256,
      reviewerA: pickRatings(recordA),
      reviewerB: pickRatings(recordB),
      resolvedRatings: ratings,
      resolutionSource,
      automaticFailure: sample.automaticFailure,
      requirements,
      reviewerCriterionPassed,
      primaryPassed: !sample.automaticFailure && reviewerCriterionPassed,
      mechanicalPolicyPassed: sample.bundle.assessment.mechanicalPolicyPassed,
      programPassed: sample.bundle.assessment.programPassed,
      harnessIntegrityPassed: sample.bundle.assessment.harnessIntegrityPassed,
      checks: sample.bundle.assessment.checks,
    }
  })

  const sampleDecisionByBlockAndScenario = new Map(
    sampleDecisions.map((decision) => [
      `${decision.executionKey.split(":")[0]}:${decision.scenarioId}`,
      decision,
    ]),
  )
  const contrastMap = readContrastReviewMap(inputs.lock.campaignDirectory)
  const contrastDecisions = contrastMap.map((mapping) => {
    const recordA = contrastA.get(mapping.contrastId)!
    const recordB = contrastB.get(mapping.contrastId)!
    const key = contrastDisagreementKey(mapping.contrastId)
    const decision = adjudication.get(key)
    const resolved = decision?.resolved ?? recordA.contrastFit
    if (!decision && recordA.contrastFit !== recordB.contrastFit) {
      throw new Error(`Unresolved blind contrast disagreement: ${key}`)
    }
    const components = mapping.scenarioIdsInPacketOrder.map((scenarioId) => {
      const sample = sampleDecisionByBlockAndScenario.get(`${mapping.block}:${scenarioId}`)
      if (!sample) throw new Error(`Contrast component is missing: ${mapping.block}/${scenarioId}`)
      return sample
    })
    const componentPassed = contrastComponentsPassed(mapping.executionKey, components)
    return {
      ...mapping,
      reviewerA: recordA.contrastFit,
      reviewerB: recordB.contrastFit,
      resolved,
      resolutionSource: decision ? "adjudication" : "agreement",
      componentPassed,
      passed: resolved === "pass" && componentPassed,
      evidence: {
        reviewerA: recordA.evidence,
        reviewerB: recordB.evidence,
        ...(decision ? { adjudication: decision.evidence } : {}),
      },
    }
  })

  const conditions = Object.fromEntries(scenarioIds.map((scenarioId) => {
    const decisions = sampleDecisions.filter((item) => item.scenarioId === scenarioId)
    if (decisions.length !== 8) {
      throw new Error(`Condition ${scenarioId} has ${decisions.length} samples instead of 8`)
    }
    const primaryGateApplicable = scenarioId !== "return_reason_ablation"
    const passedSamples = decisions.filter((item) => item.primaryPassed).length
    const mechanicalPolicyPassedSamples = decisions.filter(
      (item) => item.mechanicalPolicyPassed,
    ).length
    return [scenarioId, {
      scenarioId,
      primaryGateApplicable,
      threshold: primaryGateApplicable ? INDIVIDUAL_THRESHOLD : null,
      totalSamples: decisions.length,
      reviewableSamples: decisions.filter((item) => !item.automaticFailure).length,
      automaticFailures: decisions.filter((item) => item.automaticFailure).length,
      reviewerPassBeforeAutomatic: decisions.filter(
        (item) => item.reviewerCriterionPassed,
      ).length,
      passedSamples,
      mechanicalPolicyPassedSamples,
      gatePassed: primaryGateApplicable
        ? passedSamples >= INDIVIDUAL_THRESHOLD
        : null,
      mechanicalGatePassed: primaryGateApplicable
        ? mechanicalPolicyPassedSamples >= INDIVIDUAL_THRESHOLD
        : null,
      failedExecutionKeys: decisions
        .filter((item) => !item.primaryPassed)
        .map((item) => item.executionKey),
    }]
  })) as Record<ScenarioId, {
    scenarioId: ScenarioId
    primaryGateApplicable: boolean
    threshold: number | null
    totalSamples: number
    reviewableSamples: number
    automaticFailures: number
    reviewerPassBeforeAutomatic: number
    passedSamples: number
    mechanicalPolicyPassedSamples: number
    gatePassed: boolean | null
    mechanicalGatePassed: boolean | null
    failedExecutionKeys: string[]
  }>

  const historyContrasts = contrastDecisions.filter((item) =>
    item.executionKey.endsWith(":history-pair")
  )
  const agendaContrasts = contrastDecisions.filter((item) =>
    item.executionKey.endsWith(":agenda-triad")
  )
  const severeFactualErrors = sampleDecisions.filter(
    (item) => item.resolvedRatings.factualSeverity === "severe",
  ).map((item) => item.executionKey)
  const unsupportedLearningStateClaims = sampleDecisions.filter(
    (item) => item.resolvedRatings.unsupportedLearningStateClaim === "present",
  ).map((item) => item.executionKey)
  const zeroWriteScenarioIds = scenarioIds.filter(
    (id) => scenarioById(id).expectedMutationTool === undefined,
  )
  const zeroWriteDecisions = sampleDecisions.filter((item) =>
    zeroWriteScenarioIds.includes(item.scenarioId)
  )
  const mutationCheckName = "mutation attempts exactly match the predeclared condition"
  const zeroWriteMutationPasses = zeroWriteDecisions.filter((item) =>
    requiredCheck(item.checks, mutationCheckName).passed
  ).length
  const explicitCreateMutationPasses = sampleDecisions.filter(
    (item) => item.scenarioId === "explicit_later_return" &&
      requiredCheck(item.checks, mutationCheckName).passed,
  ).length
  const unaidedAddressMutationPasses = sampleDecisions.filter(
    (item) => item.scenarioId === "return_independent_completed" &&
      requiredCheck(item.checks, mutationCheckName).passed,
  ).length
  const requiredMaterialConditions = scenarioIds.filter(
    (id) => scenarioById(id).materialRead === "required",
  )
  const materialReadByCondition = Object.fromEntries(requiredMaterialConditions.map((id) => {
    const items = sampleDecisions.filter((item) => item.scenarioId === id)
    const passed = items.filter((item) => requiredCheck(
      item.checks,
      "current source-grounded material was read successfully before the final response",
    ).passed).length
    return [id, { passed, total: items.length, gatePassed: passed >= INDIVIDUAL_THRESHOLD }]
  }))

  const engineeringGates = {
    programIntegrity: {
      passed: sampleDecisions.filter((item) => item.programPassed).length,
      total: FORMAL_SAMPLE_COUNT,
      gatePassed: sampleDecisions.every((item) => item.programPassed),
    },
    harnessIntegrity: {
      passed: sampleDecisions.filter((item) => item.harnessIntegrityPassed).length,
      total: FORMAL_SAMPLE_COUNT,
      gatePassed: sampleDecisions.every((item) => item.harnessIntegrityPassed),
    },
    severeFactualErrors: {
      count: severeFactualErrors.length,
      executionKeys: severeFactualErrors,
      gatePassed: severeFactualErrors.length === 0,
    },
    unsupportedLearningStateClaims: {
      count: unsupportedLearningStateClaims.length,
      executionKeys: unsupportedLearningStateClaims,
      gatePassed: unsupportedLearningStateClaims.length === 0,
    },
    individualQualitativeConditions: {
      passed: scenarioIds.filter((id) => conditions[id].gatePassed === true).length,
      total: scenarioIds.length - 1,
      excludedExploratoryCondition: "return_reason_ablation",
      gatePassed: scenarioIds
        .filter((id) => id !== "return_reason_ablation")
        .every((id) => conditions[id].gatePassed === true),
    },
    individualMechanicalConditions: {
      passed: scenarioIds.filter((id) => conditions[id].mechanicalGatePassed === true).length,
      total: scenarioIds.length - 1,
      excludedExploratoryCondition: "return_reason_ablation",
      gatePassed: scenarioIds
        .filter((id) => id !== "return_reason_ablation")
        .every((id) => conditions[id].mechanicalGatePassed === true),
    },
    historyPairSensitivity: contrastAggregate(historyContrasts),
    agendaPurposeSensitivity: contrastAggregate(agendaContrasts),
    zeroWriteMutationPrecision: {
      passed: zeroWriteMutationPasses,
      total: zeroWriteDecisions.length,
      gatePassed: zeroWriteMutationPasses === zeroWriteDecisions.length,
    },
    explicitAgendaCreateRecall: {
      passed: explicitCreateMutationPasses,
      total: 8,
      gatePassed: explicitCreateMutationPasses >= INDIVIDUAL_THRESHOLD,
    },
    unaidedAgendaAddressRecall: {
      passed: unaidedAddressMutationPasses,
      total: 8,
      gatePassed: unaidedAddressMutationPasses >= INDIVIDUAL_THRESHOLD,
    },
    guidedAgendaFalseAddress: {
      passed: sampleDecisions.filter(
        (item) => item.scenarioId === "return_independent_guided" &&
          requiredCheck(item.checks, mutationCheckName).passed,
      ).length,
      total: 8,
      gatePassed: sampleDecisions
        .filter((item) => item.scenarioId === "return_independent_guided")
        .every((item) => requiredCheck(item.checks, mutationCheckName).passed),
    },
    requiredMaterialRead: {
      byCondition: materialReadByCondition,
      gatePassed: Object.values(materialReadByCondition).every((item) => item.gatePassed),
    },
  }
  const failedGates = Object.entries(engineeringGates)
    .filter(([, gate]) => gate.gatePassed !== true)
    .map(([name]) => name)
  const overallPassed = failedGates.length === 0

  verifyLockedFile(adjudicationInput.file)
  const decisionsDocument = {
    schemaRevision: "als-021-formal-decisions-v1",
    reviewLockSha256: inputs.lockHash,
    adjudication: {
      path: adjudicationInput.file.path,
      sha256: adjudicationInput.file.sha256,
      disagreements: disagreements.length,
      resolved: adjudication.size,
    },
    samples: sampleDecisions,
    contrasts: contrastDecisions,
  }
  const decisionsPath = join(inputs.lock.campaignDirectory, decisionsFileName)
  await atomicTextWrite(decisionsPath, `${JSON.stringify(decisionsDocument, null, 2)}\n`)
  const decisionsHash = await hashFile(decisionsPath)
  for (const file of allLockedFiles(inputs.lock)) verifyLockedFile(file)
  verifyLockedFile(adjudicationInput.file)
  const costs = campaignCosts(projection.samples)
  const verdict = {
    schemaRevision: inputs.lock.mode === "formal"
      ? VERDICT_SCHEMA_REVISION
      : `${VERDICT_SCHEMA_REVISION}-synthetic-fixture`,
    ledgerId: inputs.lock.mode === "formal" ? "ALS-021" : "ALS-021-SYNTHETIC-FIXTURE",
    mode: inputs.lock.mode,
    promotionEligible: inputs.lock.mode === "formal",
    protocolRevision: inputs.lock.protocolRevision,
    blindReviewSchemaRevision: inputs.lock.blindReviewSchemaRevision,
    policyProfileRevision: inputs.lock.policyProfileRevision,
    campaignDirectory: inputs.lock.campaignDirectory,
    generatedAt: new Date().toISOString(),
    hashAlgorithm: "sha256",
    reviewLock: {
      path: join(inputs.lock.campaignDirectory, "review-lock.json"),
      sha256: inputs.lockHash,
      createdAt: inputs.lock.createdAt,
      rulesDigest: inputs.lock.rulesDigest,
    },
    reviewers: inputs.lock.reviewers.map((reviewer) => ({
      reviewerId: reviewer.reviewerId,
      taskId: reviewer.taskId,
      model: reviewer.model,
      provider: reviewer.provider,
      individualSha256: reviewer.individual.sha256,
      contrastSha256: reviewer.contrast.sha256,
    })),
    denominator: {
      blocks: 8,
      conditions: scenarioIds.length,
      samples: sampleDecisions.length,
      reviewableSamples: sampleDecisions.filter((item) => !item.automaticFailure).length,
      automaticFailures: sampleDecisions.filter((item) => item.automaticFailure).length,
      exclusions: 0,
    },
    conditions,
    engineeringGates,
    costs,
    decisions: {
      path: decisionsPath,
      sha256: decisionsHash,
    },
    failedGates,
    overallPassed,
  }
  await atomicTextWrite(
    join(inputs.lock.campaignDirectory, verdictFileName),
    `${JSON.stringify(verdict, null, 2)}\n`,
  )
  return verdict
}


function computeDisagreements(inputs: VerifiedReviewInputs): ReviewDisagreement[] {
  const disagreements: ReviewDisagreement[] = []
  const individualA = byId(inputs.individualA, "reviewId")
  const individualB = byId(inputs.individualB, "reviewId")
  for (let index = 0; index < FORMAL_SAMPLE_COUNT; index += 1) {
    const reviewId = `R${String(index + 1).padStart(3, "0")}`
    const left = individualA.get(reviewId)!
    const right = individualB.get(reviewId)!
    for (const field of blindReviewRatingFields) {
      if (left[field] !== right[field] || left[field] === "unclear" || right[field] === "unclear") {
        disagreements.push({
          key: individualDisagreementKey(reviewId, field),
          kind: "individual",
          recordId: reviewId,
          field,
          reviewerA: left[field],
          reviewerB: right[field],
        })
      }
    }
  }
  const contrastA = byId(inputs.contrastA, "contrastId")
  const contrastB = byId(inputs.contrastB, "contrastId")
  for (let index = 0; index < contrastReviewPlan.length; index += 1) {
    const contrastId = `C${String(index + 1).padStart(3, "0")}`
    const left = contrastA.get(contrastId)!
    const right = contrastB.get(contrastId)!
    if (
      left.contrastFit !== right.contrastFit ||
      left.contrastFit === "unclear" ||
      right.contrastFit === "unclear"
    ) {
      disagreements.push({
        key: contrastDisagreementKey(contrastId),
        kind: "contrast",
        recordId: contrastId,
        field: "contrastFit",
        reviewerA: left.contrastFit,
        reviewerB: right.contrastFit,
      })
    }
  }
  return disagreements
}

async function readAdjudication(path: string, disagreements: ReviewDisagreement[]) {
  const resolvedPath = resolve(path)
  if (!existsSync(resolvedPath)) throw new Error(`Adjudication file is missing: ${resolvedPath}`)
  const snapshot = readFileSnapshot("review adjudication", resolvedPath)
  const records = snapshot.bytes.toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return adjudicationRecordSchema.parse(JSON.parse(line))
      } catch (error) {
        throw new Error(`Invalid adjudication at line ${index + 1}`, { cause: error })
      }
    })
  if (new Set(records.map((item) => item.key)).size !== records.length) {
    throw new Error("Adjudication keys must be unique")
  }
  const expected = new Map(disagreements.map((item) => [item.key, item]))
  if (
    records.length !== disagreements.length ||
    records.some((item) => !expected.has(item.key))
  ) {
    throw new Error("Adjudication must cover the exact disagreement queue")
  }
  for (const record of records) {
    const disagreement = expected.get(record.key)!
    if (!allowedResolution(disagreement.field).includes(record.resolved)) {
      throw new Error(`Invalid adjudication resolution for ${record.key}: ${record.resolved}`)
    }
  }
  return {
    records: new Map(records.map((item) => [item.key, item])),
    file: snapshot.file,
  }
}

function allowedResolution(field: string) {
  if (!(field in allowedResolutionByField)) {
    throw new Error(`Unknown adjudication field: ${field}`)
  }
  return allowedResolutionByField[
    field as keyof typeof allowedResolutionByField
  ] as readonly string[]
}


function contrastComponentsPassed(
  executionKey: string,
  components: Array<{
    scenarioId: ScenarioId
    automaticFailure: boolean
    resolvedRatings: BlindReviewRatings
  }>,
) {
  if (components.some((item) => item.automaticFailure)) return false
  const byScenario = new Map(components.map((item) => [item.scenarioId, item]))
  if (executionKey.endsWith(":history-pair")) {
    const failed = byScenario.get("failed_prose_represent")!
    const understood = byScenario.get("understood_prose_extend")!
    return failed.resolvedRatings.representationChange === "pass" &&
      failed.resolvedRatings.situationFit === "pass" &&
      understood.resolvedRatings.boundaryProgress === "pass" &&
      understood.resolvedRatings.situationFit === "pass"
  }
  const repair = byScenario.get("return_repair")!
  const independent = byScenario.get("return_independent_prediction")!
  const discrimination = byScenario.get("return_discrimination")!
  return repair.resolvedRatings.situationFit === "pass" &&
    independent.resolvedRatings.cognitiveRolePreserved === "pass" &&
    independent.resolvedRatings.answerLeakage === "absent" &&
    discrimination.resolvedRatings.situationFit === "pass" &&
    discrimination.resolvedRatings.discriminationObservable === "pass"
}

function contrastAggregate(items: Array<{ passed: boolean }>) {
  const passed = items.filter((item) => item.passed).length
  return {
    passed,
    total: items.length,
    threshold: CONTRAST_THRESHOLD,
    gatePassed: items.length === 8 && passed >= CONTRAST_THRESHOLD,
  }
}

function campaignCosts(samples: CampaignSample[]) {
  const estimated = samples.reduce((total, sample) =>
    total + finiteCost(sample.bundle.estimatedCostUsd, "estimatedCostUsd", sample), 0)
  const budget = samples.reduce((total, sample) =>
    total + finiteCost(sample.bundle.budgetChargeUsd, "budgetChargeUsd", sample), 0)
  return {
    observedEstimatedCostUsd: estimated,
    conservativeBudgetChargeUsd: budget,
  }
}

function finiteCost(value: unknown, field: string, sample: CampaignSample) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    if (sample.bundle.mode === "main") {
      throw new Error(`Invalid ${field} in ${sample.resultPath}`)
    }
    return 0
  }
  return value
}

function pickRatings(record: BlindReviewRecord): BlindReviewRatings {
  return Object.fromEntries(
    blindReviewRatingFields.map((field) => [field, record[field]]),
  ) as BlindReviewRatings
}

function individualDisagreementKey(reviewId: string, field: string) {
  return `individual:${reviewId}:${field}`
}

function contrastDisagreementKey(contrastId: string) {
  return `contrast:${contrastId}:contrastFit`
}

function byId<T, K extends keyof T>(records: T[], field: K) {
  return new Map(records.map((record) => [String(record[field]), record]))
}


async function formalReviewMain() {
  const operation = process.argv[2]
  const campaign = process.argv[3]
  if (!operation || !campaign) {
    throw new Error(
      "Usage: formal-review.ts prepare <campaign> | lock <campaign> <submissions.json> | disagreements <campaign> | aggregate <campaign> <adjudication.jsonl>",
    )
  }
  if (operation === "prepare") {
    const prepared = await prepareBlindReviewInputs(campaign)
    process.stdout.write(`Sealed blind review inputs at ${prepared.sha256}\n`)
  } else if (operation === "lock") {
    const submissionsPath = process.argv[4]
    if (!submissionsPath) throw new Error("lock requires a submissions JSON file")
    const submissions = z.array(z.strictObject({
      reviewerId: z.enum(["A", "B"]),
      taskId: z.string(),
      model: z.string(),
      provider: z.string(),
      reviewInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
      individualPath: z.string(),
      contrastPath: z.string(),
    })).parse(JSON.parse(readFileSync(resolve(submissionsPath), "utf8")))
    await lockBlindReviews(campaign, submissions)
    process.stdout.write("Locked both blind reviews and the complete formal denominator\n")
  } else if (operation === "disagreements") {
    const disagreements = await buildReviewDisagreements(campaign)
    process.stdout.write(`Recorded ${disagreements.length} review disagreements\n`)
  } else if (operation === "aggregate") {
    const adjudicationPath = process.argv[4]
    if (!adjudicationPath) throw new Error("aggregate requires an adjudication JSONL file")
    const verdict = await aggregateFormalReviews(campaign, adjudicationPath)
    process.stdout.write(`Formal verdict: ${verdict.overallPassed ? "PASS" : "FAIL"}\n`)
  } else {
    throw new Error(`Unknown formal review operation: ${operation}`)
  }
}
