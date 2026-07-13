/**
 * Owns the tamper-evident boundary for ALS-021 blind review: campaign
 * projection, strict case validation, pre-review sealing, reviewer identity
 * checks, and post-seal hash verification. Review judgment and aggregation
 * deliberately remain in formal-review.ts.
 */
import { randomUUID } from "node:crypto"
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from "node:fs"
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import {
  BLIND_REVIEW_SCHEMA_REVISION,
  POLICY_PROFILE_REVISION,
  PROTOCOL_REVISION,
  blindReviewOrder,
  contrastReviewPlan,
  mainOrders,
  reviewRules,
  scenarioById,
  scenarioIds,
  type ScenarioId,
} from "./protocol"
import {
  buildFrozenManifest,
  hashFile,
  repositoryRoot,
  verifyFrozenManifest,
  type FrozenManifest,
} from "./freeze"
import {
  frozenSourceFingerprint,
  readValidatedCompletedCase,
} from "./run"
import {
  buildBlindReviewInstructions,
  parseBlindContrastReviewJsonl,
  parseBlindReviewJsonl,
  projectReviewSample,
  type BlindContrastReviewRecord,
  type BlindReviewRecord,
  type ResultBundle,
} from "./review"

const LOCK_SCHEMA_REVISION = "als-021-review-lock-v1"
const INPUT_LOCK_SCHEMA_REVISION = "als-021-review-input-lock-v1"
export const INDIVIDUAL_THRESHOLD = 7
export const CONTRAST_THRESHOLD = 7
export const FORMAL_SAMPLE_COUNT = 112

const exportedArtifactNames = Object.freeze([
  "review-packets.jsonl",
  "review-contrast-packets.jsonl",
  "review-instructions.json",
  "review-map.json",
  "review-contrast-map.json",
])

const frozenRuleSourcePaths = Object.freeze([
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL("./formal-review.ts", import.meta.url)),
  fileURLToPath(new URL("./protocol.ts", import.meta.url)),
  fileURLToPath(new URL("./review.ts", import.meta.url)),
])

const commonCheckLayers = Object.freeze({
  "Turn reached a legal durable terminal state": "program",
  "every actual model operation is terminal": "program",
  "every tool invocation is terminal": "program",
  "terminal Turn and durable assistant occurrence agree": "program",
  "observer lifecycle is terminal and consistent with the runner outcome": "harness",
  "provider execution produced a reviewable policy sample": "sample",
  "observer captured the production shared policy": "harness",
  "lab labels and qualitative oracle text were absent from provider inputs": "harness",
  "provider tool attempts have matching durable invocations": "policy",
  "no tool attempt was rejected or failed": "policy",
  "mutation attempts exactly match the predeclared condition": "policy",
  "current source-grounded material was read successfully before the final response": "policy",
  "learning-state revision delta matches the predeclared condition": "policy",
  "open Agenda count matches the predeclared condition": "policy",
  "course view and route did not move during these first-move conditions": "policy",
  "no learner-wide steering was invented": "policy",
} as const)

const explicitConcernCheckLayers = Object.freeze({
  "explicit return created exactly one source-grounded learner-requested concern": "policy",
  "explicit civil time was preserved": "policy",
  "explicit return is bound to the exact current learner source": "policy",
} as const)

const noConcernCheckLayers = Object.freeze({
  "no new Agenda concern was created": "policy",
} as const)

const agendaCheckLayers = Object.freeze({
  "seeded Agenda disposition matches the current complete occurrence": "policy",
} as const)

const reviewMapEntrySchema = z.strictObject({
  reviewId: z.string().regex(/^R\d{3}$/),
  executionKey: z.string(),
  scenarioId: z.enum(scenarioIds),
  resultPath: z.string().min(1),
  primaryCriterionAutomaticallyFailed: z.boolean(),
})

const contrastMapEntrySchema = z.strictObject({
  contrastId: z.string().regex(/^C\d{3}$/),
  executionKey: z.string(),
  block: z.string(),
  scenarioIdsInPacketOrder: z.array(z.enum(scenarioIds)),
})

const lockedFileSchema = z.strictObject({
  label: z.string().min(1),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
})

const lockSchema = z.strictObject({
  schemaRevision: z.literal(LOCK_SCHEMA_REVISION),
  mode: z.enum(["formal", "synthetic-fixture"]),
  campaignDirectory: z.string().min(1),
  createdAt: z.string().datetime(),
  protocolRevision: z.string().min(1),
  blindReviewSchemaRevision: z.string().min(1),
  policyProfileRevision: z.string().min(1),
  rulesDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reviewInputManifest: lockedFileSchema,
  reviewInputHashReceipt: lockedFileSchema,
  reviewers: z.array(z.strictObject({
    reviewerId: z.enum(["A", "B"]),
    taskId: z.string().min(1),
    model: z.string().min(1),
    provider: z.string().min(1),
    individual: lockedFileSchema,
    contrast: lockedFileSchema,
  })).length(2),
  artifacts: z.array(lockedFileSchema),
  cases: z.array(z.strictObject({
    reviewId: z.string().regex(/^R\d{3}$/),
    executionKey: z.string(),
    scenarioId: z.enum(scenarioIds),
    completion: lockedFileSchema,
    result: lockedFileSchema,
  })).length(FORMAL_SAMPLE_COUNT),
  frozenManifest: lockedFileSchema.optional(),
})

const inputLockSchema = z.strictObject({
  schemaRevision: z.literal(INPUT_LOCK_SCHEMA_REVISION),
  mode: z.enum(["formal", "synthetic-fixture"]),
  campaignDirectory: z.string().min(1),
  createdAt: z.string().datetime(),
  protocolRevision: z.string().min(1),
  blindReviewSchemaRevision: z.string().min(1),
  policyProfileRevision: z.string().min(1),
  rulesDigest: z.string().regex(/^[a-f0-9]{64}$/),
  artifacts: z.array(lockedFileSchema),
  cases: z.array(z.strictObject({
    reviewId: z.string().regex(/^R\d{3}$/),
    executionKey: z.string(),
    scenarioId: z.enum(scenarioIds),
    completion: lockedFileSchema,
    result: lockedFileSchema,
  })).length(FORMAL_SAMPLE_COUNT),
  frozenManifest: lockedFileSchema.optional(),
})

export type LockedFile = z.infer<typeof lockedFileSchema>
export type ReviewLock = z.infer<typeof lockSchema>
type ReviewInputLock = z.infer<typeof inputLockSchema>

export type BlindReviewSubmission = Readonly<{
  reviewerId: "A" | "B"
  taskId: string
  model: string
  provider: string
  reviewInputSha256: string
  individualPath: string
  contrastPath: string
}>

export type AssessmentCheck = {
  name: string
  layer: "program" | "harness" | "sample" | "policy"
  passed: boolean
  detail: string
}

export type CampaignBundle = ResultBundle & {
  ledgerId?: unknown
  mode?: unknown
  protocolRevision?: unknown
  block: string
  plannedPosition: number
  scenario: { id: ScenarioId }
  modelConfiguration?: {
    requestedModel?: unknown
    policyProfileRevision?: unknown
  }
  frozenSource?: unknown
  assessment: {
    programPassed: boolean
    harnessIntegrityPassed: boolean
    reviewablePolicySample: boolean
    mechanicalPolicyPassed: boolean
    checks: AssessmentCheck[]
    diagnostics?: {
      providerModelIds?: unknown
      attemptedMutationTools?: unknown
    }
  }
  modelAliasConsistent?: unknown
  estimatedCostUsd?: unknown
  budgetChargeUsd?: unknown
  repository?: unknown
}

export type CampaignSample = {
  reviewId: string
  executionKey: string
  scenarioId: ScenarioId
  resultPath: string
  automaticFailure: boolean
  bundle: CampaignBundle
}

export type CampaignProjection = {
  artifacts: LockedFile[]
  cases: ReviewLock["cases"]
  frozenManifest?: LockedFile
  samples: CampaignSample[]
}

export type VerifiedReviewInputs = {
  lock: ReviewLock
  lockHash: string
  individualA: BlindReviewRecord[]
  individualB: BlindReviewRecord[]
  contrastA: BlindContrastReviewRecord[]
  contrastB: BlindContrastReviewRecord[]
}

/**
 * Seals the exact packets, results, maps, instructions, and rules before either
 * blind reviewer starts. Both reviewer submissions must return this SHA-256.
 */
export async function prepareBlindReviewInputs(
  campaignDirectory: string,
  options: { mode?: "formal" | "synthetic-fixture" } = {},
) {
  const campaignRoot = realpathSync(resolve(campaignDirectory))
  const manifestPath = join(campaignRoot, "review-input-lock.json")
  const hashReceiptPath = join(campaignRoot, "review-input-lock.sha256")
  for (const path of [
    manifestPath,
    hashReceiptPath,
    join(campaignRoot, "review-lock.json"),
    join(campaignRoot, "formal-verdict.json"),
  ]) {
    if (existsSync(path)) {
      throw new Error(`Blind review inputs are already sealed or consumed: ${path}`)
    }
  }
  const mode = options.mode ?? "formal"
  const projection = await loadCampaignProjection(campaignRoot, mode)
  const manifest: ReviewInputLock = {
    schemaRevision: INPUT_LOCK_SCHEMA_REVISION,
    mode,
    campaignDirectory: campaignRoot,
    createdAt: new Date().toISOString(),
    protocolRevision: PROTOCOL_REVISION,
    blindReviewSchemaRevision: BLIND_REVIEW_SCHEMA_REVISION,
    policyProfileRevision: POLICY_PROFILE_REVISION,
    rulesDigest: formalRulesDigest(),
    artifacts: projection.artifacts,
    cases: projection.cases,
    ...(projection.frozenManifest
      ? { frozenManifest: projection.frozenManifest }
      : {}),
  }
  inputLockSchema.parse(manifest)
  for (const file of allReviewInputFiles(manifest)) verifyLockedFile(file)
  await atomicTextWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const sha256 = await hashFile(manifestPath)
  await atomicTextWrite(hashReceiptPath, `${sha256}\n`)
  return { path: manifestPath, sha256 }
}

/**
 * Locks the complete review denominator and both blind submissions. Formal mode
 * requires the repository's frozen-v1 manifest. The synthetic mode exists only
 * for contract tests and is recorded in the immutable lock.
 */
export async function lockBlindReviews(
  campaignDirectory: string,
  submissions: readonly BlindReviewSubmission[],
  options: { mode?: "formal" | "synthetic-fixture" } = {},
) {
  const campaignRoot = realpathSync(resolve(campaignDirectory))
  const lockPath = join(campaignRoot, "review-lock.json")
  const lockHashPath = join(campaignRoot, "review-lock.sha256")
  for (const path of [
    lockPath,
    lockHashPath,
    join(campaignRoot, "review-disagreements.json"),
    join(campaignRoot, "review-adjudication.jsonl"),
    join(campaignRoot, "formal-decisions.json"),
    join(campaignRoot, "formal-verdict.json"),
    join(campaignRoot, "synthetic-fixture-decisions.json"),
    join(campaignRoot, "synthetic-fixture-verdict.json"),
  ]) {
    if (existsSync(path)) {
      throw new Error(`Formal review is already locked or aggregated: ${path}`)
    }
  }
  const mode = options.mode ?? "formal"
  validateReviewerIdentities(submissions)
  const sealedInput = await readAndVerifyReviewInputLock(campaignRoot)
  if (sealedInput.manifest.mode !== mode) {
    throw new Error(
      `Review input lock mode is ${sealedInput.manifest.mode}, not requested ${mode}`,
    )
  }
  if (submissions.some((item) => item.reviewInputSha256 !== sealedInput.sha256)) {
    throw new Error("Blind reviewer submissions do not reference the sealed review input hash")
  }
  const projection = sealedInput.projection
  const reviewers = submissions
    .map((submission) => lockReviewerSubmission(submission))
    .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId))
  const inputPaths = [
    ...reviewers.flatMap((reviewer) => [reviewer.individual.path, reviewer.contrast.path]),
    ...projection.artifacts.map((artifact) => artifact.path),
    ...projection.cases.flatMap((item) => [item.completion.path, item.result.path]),
    ...(projection.frozenManifest ? [projection.frozenManifest.path] : []),
    sealedInput.manifestFile.path,
    sealedInput.hashReceiptFile.path,
  ]
  if (new Set(inputPaths.map((path) => realpathSync(path))).size !== inputPaths.length) {
    throw new Error("Review lock inputs must use distinct files")
  }
  const lock: ReviewLock = {
    schemaRevision: LOCK_SCHEMA_REVISION,
    mode,
    campaignDirectory: campaignRoot,
    createdAt: new Date().toISOString(),
    protocolRevision: PROTOCOL_REVISION,
    blindReviewSchemaRevision: BLIND_REVIEW_SCHEMA_REVISION,
    policyProfileRevision: POLICY_PROFILE_REVISION,
    rulesDigest: formalRulesDigest(),
    reviewInputManifest: sealedInput.manifestFile,
    reviewInputHashReceipt: sealedInput.hashReceiptFile,
    reviewers,
    artifacts: projection.artifacts,
    cases: projection.cases,
    ...(projection.frozenManifest
      ? { frozenManifest: projection.frozenManifest }
      : {}),
  }
  lockSchema.parse(lock)

  // Close the validate/hash race before the immutable lock becomes visible.
  for (const file of allLockedFiles(lock)) verifyLockedFile(file)
  await atomicTextWrite(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  const lockHash = await hashFile(lockPath)
  await atomicTextWrite(lockHashPath, `${lockHash}\n`)
  return lock
}

export async function loadCampaignProjection(
  campaignRoot: string,
  mode: "formal" | "synthetic-fixture",
): Promise<CampaignProjection> {
  const root = realpathSync(resolve(campaignRoot))
  const artifactFiles = exportedArtifactNames.map((name) =>
    lockFile(`review artifact ${name}`, join(root, name))
  )
  const sourceFiles = frozenRuleSourcePaths.map((path) =>
    lockFile(`review rule source ${basename(path)}`, path)
  )
  const reviewMap = readJson(join(root, "review-map.json"), z.array(reviewMapEntrySchema))
  const contrastMap = readJson(
    join(root, "review-contrast-map.json"),
    z.array(contrastMapEntrySchema),
  )
  validateReviewMaps(reviewMap, contrastMap)

  let manifest: FrozenManifest | undefined
  let manifestFile: LockedFile | undefined
  let sourceFingerprint = "synthetic-fixture"
  if (mode === "formal") {
    if (String(PROTOCOL_REVISION) !== "als-021-v1") {
      throw new Error("Formal review requires PROTOCOL_REVISION=als-021-v1")
    }
    const manifestPath = join(
      repositoryRoot(),
      "labs/shared-tutor-policy-pressure/frozen-v1.json",
    )
    if (!existsSync(manifestPath)) {
      throw new Error("Formal review requires the frozen-v1.json manifest")
    }
    manifestFile = lockFile("frozen-v1 manifest", manifestPath)
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FrozenManifest
    const errors = await verifyFrozenManifest(manifest)
    if (errors.length > 0) {
      throw new Error(`Frozen formal source changed:\n- ${errors.join("\n- ")}`)
    }
    if (!isDeepStrictEqual(manifest, await buildFrozenManifest())) {
      throw new Error("frozen-v1.json does not equal the current frozen manifest")
    }
    sourceFingerprint = frozenSourceFingerprint(manifest)
  }

  const cases: ReviewLock["cases"] = []
  const samples: CampaignSample[] = []
  const projections = new Map<string, ReturnType<typeof projectReviewSample>>()
  for (const [index, mapping] of reviewMap.entries()) {
    const expectedExecutionKey = blindReviewOrder[index]!
    const resultPath = containedRealPath(root, mapping.resultPath)
    const caseDirectory = dirname(resultPath)
    const completionPath = join(caseDirectory, "complete.json")
    const expectedScenario = expectedScenarioForExecutionKey(expectedExecutionKey)
    if (mode === "formal") {
      await readValidatedCompletedCase({
        caseDirectory,
        completionPath,
        mode: "main",
        protocolRevision: PROTOCOL_REVISION,
        block: expectedExecutionKey.split(":")[0]!,
        plannedPosition: Number(expectedExecutionKey.match(/position-(\d+)$/)?.[1]),
        scenarioId: expectedScenario,
        requestedModel: "deepseek-v4-flash",
        policyProfileRevision: POLICY_PROFILE_REVISION,
        sourceFingerprint,
      })
    }
    const completionFile = lockFile(`completion ${mapping.reviewId}`, completionPath)
    const resultFile = lockFile(`result ${mapping.reviewId}`, resultPath)
    const completion = JSON.parse(readFileSync(completionPath, "utf8")) as {
      resultPath?: unknown
      estimatedCostUsd?: unknown
    }
    if (typeof completion.resultPath !== "string") {
      throw new Error(`Completion has no resultPath: ${completionPath}`)
    }
    const completionResultPath = isAbsolute(completion.resultPath)
      ? realpathSync(resolve(completion.resultPath))
      : realpathSync(resolve(caseDirectory, completion.resultPath))
    if (completionResultPath !== resultPath) {
      throw new Error(`Completion/result mismatch for ${mapping.reviewId}`)
    }
    const bundle = parseCampaignBundle(resultPath)
    validateBundleCoordinates(bundle, expectedExecutionKey, expectedScenario, mode)
    validateAssessment(bundle, mode)
    if (
      mode === "formal" &&
      (completion.estimatedCostUsd !== bundle.estimatedCostUsd ||
        bundle.ledgerId !== "ALS-021" ||
        bundle.modelConfiguration?.requestedModel !== "deepseek-v4-flash" ||
        bundle.modelConfiguration.policyProfileRevision !== POLICY_PROFILE_REVISION ||
        !formalModelConfigurationMatches(bundle.modelConfiguration) ||
        frozenSourceFingerprint(bundle.frozenSource) !== sourceFingerprint ||
        !isDeepStrictEqual(bundle.frozenSource, manifest) ||
        bundle.modelAliasConsistent !== true)
    ) {
      throw new Error(`Formal result metadata is inconsistent: ${resultPath}`)
    }
    if (
      mapping.primaryCriterionAutomaticallyFailed !==
      !bundle.assessment.reviewablePolicySample
    ) {
      throw new Error(`Automatic failure flag disagrees with result: ${mapping.reviewId}`)
    }
    const projection = projectReviewSample(bundle)
    projections.set(mapping.executionKey, projection)
    cases.push({
      reviewId: mapping.reviewId,
      executionKey: mapping.executionKey,
      scenarioId: mapping.scenarioId,
      completion: completionFile,
      result: resultFile,
    })
    samples.push({
      reviewId: mapping.reviewId,
      executionKey: mapping.executionKey,
      scenarioId: mapping.scenarioId,
      resultPath,
      automaticFailure: mapping.primaryCriterionAutomaticallyFailed,
      bundle,
    })
  }

  const completedPaths = walkFiles(root)
    .filter((path) => basename(path) === "complete.json")
    .map((path) => realpathSync(path))
    .sort()
  const mappedCompletionPaths = cases.map((item) => item.completion.path).sort()
  if (!isDeepStrictEqual(completedPaths, mappedCompletionPaths)) {
    throw new Error("Campaign completion set differs from the frozen 112-case denominator")
  }
  const packets = parseJsonl(join(root, "review-packets.jsonl"))
  const expectedPackets = reviewMap.map((mapping) => ({
    reviewId: mapping.reviewId,
    ...projections.get(mapping.executionKey)!,
  }))
  if (!isDeepStrictEqual(packets, expectedPackets)) {
    throw new Error("Individual review packets do not match the locked case results")
  }
  const instructions = JSON.parse(
    readFileSync(join(root, "review-instructions.json"), "utf8"),
  ) as unknown
  if (!isDeepStrictEqual(instructions, buildBlindReviewInstructions())) {
    throw new Error("Blind review instructions differ from the frozen schema")
  }
  const contrastPackets = parseJsonl(join(root, "review-contrast-packets.jsonl"))
  const expectedContrastPackets = contrastReviewPlan.map((planned, index) => ({
    contrastId: `C${String(index + 1).padStart(3, "0")}`,
    samples: planned.sampleScenarioIds.map((scenarioId) =>
      projections.get(`${planned.block}:${executionPositionForScenario(planned.block, scenarioId)}`)!
    ),
    question: planned.sampleScenarioIds.length === 2
      ? "Do the responses make materially different moves appropriate to their two visible situations, rather than the same generic response?"
      : "Do the responses preserve materially distinct cognitive roles supported by their visible durable context, rather than collapsing to one generic move?",
  }))
  if (!isDeepStrictEqual(contrastPackets, expectedContrastPackets)) {
    throw new Error("Contrast review packets do not match the locked case results")
  }
  return {
    artifacts: [...artifactFiles, ...sourceFiles],
    cases,
    ...(manifestFile ? { frozenManifest: manifestFile } : {}),
    samples,
  }
}

export function readContrastReviewMap(campaignDirectory: string) {
  return readJson(
    join(campaignDirectory, "review-contrast-map.json"),
    z.array(contrastMapEntrySchema),
  )
}

function validateReviewerIdentities(submissions: readonly BlindReviewSubmission[]) {
  const normalized = submissions.map((item) => ({
    reviewerId: item.reviewerId,
    taskId: item.taskId.trim(),
    model: item.model.trim(),
    provider: item.provider.trim(),
  }))
  if (
    normalized.length !== 2 ||
    new Set(normalized.map((item) => item.reviewerId)).size !== 2 ||
    !normalized.some((item) => item.reviewerId === "A") ||
    !normalized.some((item) => item.reviewerId === "B")
  ) {
    throw new Error("Formal review requires exactly reviewer A and reviewer B")
  }
  for (const field of ["taskId", "model", "provider"] as const) {
    if (
      normalized.some((item) => !item[field]) ||
      new Set(normalized.map((item) => item[field])).size !== 2
    ) {
      throw new Error(`Blind reviewers must record distinct non-empty ${field} values`)
    }
  }
}

function lockReviewerSubmission(submission: BlindReviewSubmission) {
  const individual = lockFile(
    `reviewer ${submission.reviewerId} individual ratings`,
    submission.individualPath,
  )
  const contrast = lockFile(
    `reviewer ${submission.reviewerId} contrast ratings`,
    submission.contrastPath,
  )
  parseBlindReviewJsonl(readFileSync(individual.path, "utf8"))
  parseBlindContrastReviewJsonl(readFileSync(contrast.path, "utf8"))
  return {
    reviewerId: submission.reviewerId,
    taskId: submission.taskId.trim(),
    model: submission.model.trim(),
    provider: submission.provider.trim(),
    individual,
    contrast,
  }
}

async function readAndVerifyReviewInputLock(campaignDirectory: string) {
  const campaignRoot = realpathSync(resolve(campaignDirectory))
  const manifestPath = join(campaignRoot, "review-input-lock.json")
  const hashReceiptPath = join(campaignRoot, "review-input-lock.sha256")
  if (!existsSync(manifestPath) || !existsSync(hashReceiptPath)) {
    throw new Error(
      "Blind review inputs must be sealed before reviewers begin; run the prepare operation",
    )
  }
  const sha256 = await hashFile(manifestPath)
  if (readFileSync(hashReceiptPath, "utf8").trim() !== sha256) {
    throw new Error("review-input-lock.json changed after blind review input preparation")
  }
  const manifest = inputLockSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")))
  if (realpathSync(manifest.campaignDirectory) !== campaignRoot) {
    throw new Error("Review input lock belongs to another campaign")
  }
  if (manifest.rulesDigest !== formalRulesDigest()) {
    throw new Error("Formal review rules changed after blind review input preparation")
  }
  for (const file of allReviewInputFiles(manifest)) verifyLockedFile(file)
  const projection = await loadCampaignProjection(campaignRoot, manifest.mode)
  const expected = {
    artifacts: projection.artifacts,
    cases: projection.cases,
    ...(projection.frozenManifest ? { frozenManifest: projection.frozenManifest } : {}),
  }
  const actual = {
    artifacts: manifest.artifacts,
    cases: manifest.cases,
    ...(manifest.frozenManifest ? { frozenManifest: manifest.frozenManifest } : {}),
  }
  if (!isDeepStrictEqual(expected, actual)) {
    throw new Error("Blind review inputs changed after their pre-review seal")
  }
  return {
    manifest,
    sha256,
    projection,
    manifestFile: lockFile("blind review input manifest", manifestPath),
    hashReceiptFile: lockFile("blind review input hash receipt", hashReceiptPath),
  }
}

export async function readAndVerifyLock(campaignDirectory: string): Promise<VerifiedReviewInputs> {
  const campaignRoot = realpathSync(resolve(campaignDirectory))
  const lockPath = join(campaignRoot, "review-lock.json")
  const lockHashPath = join(campaignRoot, "review-lock.sha256")
  if (!existsSync(lockPath) || !existsSync(lockHashPath)) {
    throw new Error("Blind reviews have not been locked")
  }
  const lockHash = await hashFile(lockPath)
  if (readFileSync(lockHashPath, "utf8").trim() !== lockHash) {
    throw new Error("review-lock.json changed after review lock")
  }
  const lock = lockSchema.parse(JSON.parse(readFileSync(lockPath, "utf8")))
  if (realpathSync(lock.campaignDirectory) !== campaignRoot) {
    throw new Error("Review lock belongs to another campaign")
  }
  if (lock.rulesDigest !== formalRulesDigest()) {
    throw new Error("Formal review rules changed after review lock")
  }
  for (const file of allLockedFiles(lock)) verifyLockedFile(file)
  const sealedInput = await readAndVerifyReviewInputLock(campaignRoot)
  if (
    sealedInput.sha256 !== readFileSync(lock.reviewInputHashReceipt.path, "utf8").trim() ||
    sealedInput.manifestFile.sha256 !== lock.reviewInputManifest.sha256 ||
    sealedInput.hashReceiptFile.sha256 !== lock.reviewInputHashReceipt.sha256
  ) {
    throw new Error("Formal review lock does not match the pre-review input seal")
  }
  if (lock.mode === "formal") {
    if (!lock.frozenManifest) throw new Error("Formal review lock has no frozen manifest")
    const manifest = JSON.parse(readFileSync(lock.frozenManifest.path, "utf8")) as FrozenManifest
    const errors = await verifyFrozenManifest(manifest)
    if (errors.length > 0) {
      throw new Error(`Frozen formal source changed after review lock:\n- ${errors.join("\n- ")}`)
    }
  }
  const reviewerA = lock.reviewers.find((item) => item.reviewerId === "A")!
  const reviewerB = lock.reviewers.find((item) => item.reviewerId === "B")!
  return {
    lock,
    lockHash,
    individualA: parseBlindReviewJsonl(readFileSync(reviewerA.individual.path, "utf8")),
    individualB: parseBlindReviewJsonl(readFileSync(reviewerB.individual.path, "utf8")),
    contrastA: parseBlindContrastReviewJsonl(readFileSync(reviewerA.contrast.path, "utf8")),
    contrastB: parseBlindContrastReviewJsonl(readFileSync(reviewerB.contrast.path, "utf8")),
  }
}

function validateReviewMaps(
  reviewMap: z.infer<typeof reviewMapEntrySchema>[],
  contrastMap: z.infer<typeof contrastMapEntrySchema>[],
) {
  if (reviewMap.length !== FORMAL_SAMPLE_COUNT) {
    throw new Error(`Review map has ${reviewMap.length} entries instead of ${FORMAL_SAMPLE_COUNT}`)
  }
  for (const [index, mapping] of reviewMap.entries()) {
    const reviewId = `R${String(index + 1).padStart(3, "0")}`
    const executionKey = blindReviewOrder[index]!
    if (
      mapping.reviewId !== reviewId ||
      mapping.executionKey !== executionKey ||
      mapping.scenarioId !== expectedScenarioForExecutionKey(executionKey)
    ) {
      throw new Error(`Review map disagrees with the frozen order at ${reviewId}`)
    }
  }
  if (contrastMap.length !== contrastReviewPlan.length) {
    throw new Error("Contrast map does not contain the frozen 16 contrasts")
  }
  for (const [index, mapping] of contrastMap.entries()) {
    const planned = contrastReviewPlan[index]!
    if (
      mapping.contrastId !== `C${String(index + 1).padStart(3, "0")}` ||
      mapping.executionKey !== planned.executionKey ||
      mapping.block !== planned.block ||
      !isDeepStrictEqual(mapping.scenarioIdsInPacketOrder, planned.sampleScenarioIds)
    ) {
      throw new Error(`Contrast map disagrees with the frozen plan at position ${index + 1}`)
    }
  }
}

function validateBundleCoordinates(
  bundle: CampaignBundle,
  executionKey: string,
  scenarioId: ScenarioId,
  mode: "formal" | "synthetic-fixture",
) {
  const match = /^block-(\d+):position-(\d+)$/.exec(executionKey)
  if (!match) throw new Error(`Invalid execution key: ${executionKey}`)
  const block = `block-${match[1]}`
  const position = Number(match[2])
  if (
    bundle.block !== block ||
    bundle.plannedPosition !== position ||
    bundle.scenario.id !== scenarioId
  ) {
    throw new Error(`Result coordinates disagree with ${executionKey}`)
  }
  if (
    mode === "formal" &&
    (bundle.mode !== "main" || bundle.protocolRevision !== PROTOCOL_REVISION)
  ) {
    throw new Error(`Result is not part of the frozen formal campaign: ${executionKey}`)
  }
}

function validateAssessment(
  bundle: CampaignBundle,
  mode: "formal" | "synthetic-fixture",
) {
  const checks = bundle.assessment.checks
  if (new Set(checks.map((item) => item.name)).size !== checks.length) {
    throw new Error(`Assessment has duplicate checks: ${bundle.block}/${bundle.scenario.id}`)
  }
  for (const layer of ["program", "harness", "sample", "policy"] as const) {
    if (!checks.some((item) => item.layer === layer)) {
      throw new Error(`Assessment has no ${layer} check: ${bundle.block}/${bundle.scenario.id}`)
    }
  }
  const programPassed = checks.filter((item) => item.layer === "program").every((item) => item.passed)
  const harnessPassed = checks.filter((item) => item.layer === "harness").every((item) => item.passed)
  const reviewable = harnessPassed && checks
    .filter((item) => item.layer === "sample")
    .every((item) => item.passed)
  const mechanical = reviewable && checks
    .filter((item) => item.layer === "policy")
    .every((item) => item.passed)
  if (
    bundle.assessment.programPassed !== programPassed ||
    bundle.assessment.harnessIntegrityPassed !== harnessPassed ||
    bundle.assessment.reviewablePolicySample !== reviewable ||
    bundle.assessment.mechanicalPolicyPassed !== mechanical
  ) {
    throw new Error(`Assessment summary is inconsistent: ${bundle.block}/${bundle.scenario.id}`)
  }
  if (mode === "formal" && (!programPassed || !harnessPassed)) {
    throw new Error(`Completed formal case failed campaign integrity: ${bundle.block}/${bundle.scenario.id}`)
  }
  if (mode === "formal") {
    const expected = formalAssessmentCheckLayers(bundle.scenario.id)
    if (checks.length !== Object.keys(expected).length) {
      throw new Error(`Formal assessment check set changed: ${bundle.block}/${bundle.scenario.id}`)
    }
    for (const check of checks) {
      if (expected[check.name] !== check.layer) {
        throw new Error(`Unexpected formal assessment check: ${check.name}`)
      }
    }
  }
  requiredCheck(checks, "mutation attempts exactly match the predeclared condition")
}

/**
 * Returns the one policy-layer check with the given frozen name. Both strict
 * campaign validation and verdict aggregation use this same lookup so a
 * duplicate or re-layered check cannot be interpreted differently later.
 */
export function requiredCheck(checks: AssessmentCheck[], name: string) {
  const matching = checks.filter((item) => item.name === name)
  if (matching.length !== 1 || matching[0]!.layer !== "policy") {
    throw new Error(`Assessment must contain exactly one policy check named ${JSON.stringify(name)}`)
  }
  return matching[0]!
}

export function formalAssessmentCheckLayers(
  scenarioId: ScenarioId,
): Record<string, "program" | "harness" | "sample" | "policy"> {
  return {
    ...commonCheckLayers,
    ...(scenarioId === "explicit_later_return"
      ? explicitConcernCheckLayers
      : noConcernCheckLayers),
    ...(scenarioById(scenarioId).setup === "eligible_agenda"
      ? agendaCheckLayers
      : {}),
  }
}

function parseCampaignBundle(path: string): CampaignBundle {
  const value = JSON.parse(readFileSync(path, "utf8")) as Partial<CampaignBundle>
  if (
    typeof value !== "object" || value === null ||
    typeof value.block !== "string" ||
    !Number.isInteger(value.plannedPosition) ||
    !scenarioIds.includes(value.scenario?.id as ScenarioId) ||
    !Array.isArray(value.providerCalls) ||
    !value.initialSnapshot ||
    !value.finalSnapshot ||
    typeof value.assessment !== "object" || value.assessment === null ||
    !Array.isArray(value.assessment.checks)
  ) {
    throw new Error(`Invalid formal result envelope: ${path}`)
  }
  for (const check of value.assessment.checks) {
    if (
      typeof check !== "object" || check === null ||
      typeof check.name !== "string" ||
      !["program", "harness", "sample", "policy"].includes(check.layer) ||
      typeof check.passed !== "boolean" ||
      typeof check.detail !== "string"
    ) {
      throw new Error(`Invalid assessment check in ${path}`)
    }
  }
  return value as CampaignBundle
}

function expectedScenarioForExecutionKey(executionKey: string): ScenarioId {
  const match = /^block-(\d+):position-(\d+)$/.exec(executionKey)
  if (!match) throw new Error(`Invalid formal execution key: ${executionKey}`)
  const blockIndex = Number(match[1]) - 1
  const position = Number(match[2]) - 1
  const scenarioId = mainOrders[blockIndex]?.[position]
  if (!scenarioId) throw new Error(`Execution key is outside the frozen matrix: ${executionKey}`)
  return scenarioId
}

function executionPositionForScenario(block: string, scenarioId: ScenarioId) {
  const blockIndex = Number(/^block-(\d+)$/.exec(block)?.[1]) - 1
  const position = mainOrders[blockIndex]?.indexOf(scenarioId) ?? -1
  if (position < 0) throw new Error(`Scenario ${scenarioId} is missing from ${block}`)
  return `position-${position + 1}`
}

function formalRulesDigest() {
  return hashBytes(Buffer.from(JSON.stringify({
    protocolRevision: PROTOCOL_REVISION,
    blindReviewSchemaRevision: BLIND_REVIEW_SCHEMA_REVISION,
    policyProfileRevision: POLICY_PROFILE_REVISION,
    blindReviewOrder,
    contrastReviewPlan,
    reviewRules,
    thresholds: {
      individual: INDIVIDUAL_THRESHOLD,
      contrast: CONTRAST_THRESHOLD,
      zeroWriteMutationPrecision: "all",
      explicitCreateRecall: INDIVIDUAL_THRESHOLD,
      unaidedAddressRecall: INDIVIDUAL_THRESHOLD,
    },
  })))
}

export function allLockedFiles(lock: ReviewLock) {
  return [
    lock.reviewInputManifest,
    lock.reviewInputHashReceipt,
    ...lock.reviewers.flatMap((reviewer) => [reviewer.individual, reviewer.contrast]),
    ...lock.artifacts,
    ...lock.cases.flatMap((item) => [item.completion, item.result]),
    ...(lock.frozenManifest ? [lock.frozenManifest] : []),
  ]
}

function allReviewInputFiles(lock: ReviewInputLock) {
  return [
    ...lock.artifacts,
    ...lock.cases.flatMap((item) => [item.completion, item.result]),
    ...(lock.frozenManifest ? [lock.frozenManifest] : []),
  ]
}

export function assertProjectionMatchesLock(projection: CampaignProjection, lock: ReviewLock) {
  const expected = [
    ...projection.artifacts,
    ...projection.cases.flatMap((item) => [item.completion, item.result]),
    ...(projection.frozenManifest ? [projection.frozenManifest] : []),
  ]
  const actual = [
    ...lock.artifacts,
    ...lock.cases.flatMap((item) => [item.completion, item.result]),
    ...(lock.frozenManifest ? [lock.frozenManifest] : []),
  ]
  if (!isDeepStrictEqual(expected, actual)) {
    throw new Error("Campaign projection changed after review lock")
  }
}

function lockFile(label: string, path: string): LockedFile {
  return readFileSnapshot(label, path).file
}

export function readFileSnapshot(label: string, path: string) {
  const realPath = realpathSync(resolve(path))
  const bytes = readFileSync(realPath)
  return {
    bytes,
    file: {
      label,
      path: realPath,
      sha256: hashBytes(bytes),
      bytes: bytes.byteLength,
    } satisfies LockedFile,
  }
}

export function verifyLockedFile(file: LockedFile) {
  if (!existsSync(file.path)) {
    throw new Error(`${file.label} changed after review lock: file is missing`)
  }
  const bytes = readFileSync(file.path)
  if (bytes.byteLength !== file.bytes || hashBytes(bytes) !== file.sha256) {
    throw new Error(`${file.label} changed after review lock: ${file.path}`)
  }
}

function hashBytes(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function containedRealPath(root: string, candidate: string) {
  const realRoot = realpathSync(root)
  const realCandidate = realpathSync(
    isAbsolute(candidate) ? resolve(candidate) : resolve(realRoot, candidate),
  )
  const pathFromRoot = relative(realRoot, realCandidate)
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error(`Review map points outside the campaign: ${candidate}`)
  }
  return realCandidate
}

function formalModelConfigurationMatches(value: CampaignBundle["modelConfiguration"]) {
  const configuration = value as Record<string, unknown> | undefined
  return configuration?.requestedModel === "deepseek-v4-flash" &&
    configuration.policyProfileRevision === POLICY_PROFILE_REVISION &&
    configuration.provider === "deepseek" &&
    configuration.thinking === "disabled" &&
    configuration.temperature === "provider_default" &&
    configuration.providerSeed === null &&
    configuration.maxModelSteps === 6 &&
    configuration.maxOutputTokensPerStep === 1_200 &&
    configuration.maxRetries === 0 &&
    configuration.timeoutMs === 90_000
}

function readJson<T>(path: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(readFileSync(path, "utf8")))
  } catch (error) {
    throw new Error(`Invalid JSON artifact: ${path}`, { cause: error })
  }
}

function parseJsonl(path: string) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown
      } catch (error) {
        throw new Error(`Invalid JSONL at ${path}:${index + 1}`, { cause: error })
      }
    })
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(path) : [path]
  })
}

export async function atomicTextWrite(path: string, content: string) {
  const temporaryPath = `${path}.partial-${process.pid}-${randomUUID()}`
  try {
    await Bun.write(temporaryPath, content)
    renameSync(temporaryPath, path)
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    throw error
  }
}
