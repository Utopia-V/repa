import { existsSync, readdirSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, relative, resolve, join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import {
  BLIND_REVIEW_SCHEMA_REVISION,
  blindReviewFields,
  blindReviewOrder,
  contrastReviewPlan,
  reviewOperationalDefinitions,
} from "./protocol"

const blindReviewRecordSchema = z.strictObject({
  reviewId: z.string().regex(/^R\d{3}$/),
  situationFit: z.enum(["pass", "fail", "unclear"]),
  representationChange: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  cognitiveRolePreserved: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  currentRequestRespected: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  directHelpDelivered: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  boundaryProgress: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  discriminationObservable: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  durablePurposePreserved: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  learnerAuthorshipGrounded: z.enum(["pass", "fail", "not_applicable", "unclear"]),
  answerLeakage: z.enum(["present", "absent", "not_applicable", "unclear"]),
  factualSeverity: z.enum(["none", "minor", "severe", "unclear"]),
  unsupportedLearningStateClaim: z.enum(["present", "absent", "unclear"]),
  observedMove: z.string().min(1),
  evidence: z.string().min(1),
})

const blindContrastReviewRecordSchema = z.strictObject({
  contrastId: z.string().regex(/^C\d{3}$/),
  contrastFit: z.enum(["pass", "fail", "unclear"]),
  evidence: z.string().min(1),
})

export type BlindReviewRecord = z.infer<typeof blindReviewRecordSchema>
export type BlindContrastReviewRecord = z.infer<typeof blindContrastReviewRecordSchema>

export type ResultBundle = {
  block: string
  plannedPosition: number
  scenario: { id: string }
  providerCalls: Array<{
    sequence: number
    request: unknown
    streamParts: unknown[]
  }>
  outcome?: { text?: string }
  failure?: { name: string; message: string }
  initialSnapshot: AgendaSnapshot
  finalSnapshot: AgendaSnapshot
  assessment: { reviewablePolicySample: boolean }
}

type AgendaConcern = {
  id: string
  sourceItemId: string
  authorship: unknown
  target: unknown
  reason: string
  notBefore: number
  status: string
  version: number
}

type AgendaSnapshot = {
  agendaConcerns: AgendaConcern[]
  sessions: Array<{
    items: Array<{ itemId: string; role: string; content: string }>
  }>
}

if (import.meta.main) {
  await reviewMain().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

export async function exportBlindReviewPackets(campaignDirectory: string) {
  const campaignRoot = realpathSync(resolve(campaignDirectory))
  if (
    existsSync(join(campaignRoot, "review-input-lock.json")) ||
    existsSync(join(campaignRoot, "review-lock.json"))
  ) {
    throw new Error("Blind review artifacts are already sealed and cannot be re-exported")
  }
  const bundles = new Map<string, { path: string; bundle: ResultBundle }>()
  for (const completionPath of walk(campaignRoot).filter((candidate) =>
    basename(candidate) === "complete.json",
  )) {
    const completion = (await Bun.file(completionPath).json()) as { resultPath?: string }
    if (!completion.resultPath) throw new Error(`Completion has no resultPath: ${completionPath}`)
    const recordedPath = isAbsolute(completion.resultPath)
      ? resolve(completion.resultPath)
      : resolve(dirname(completionPath), completion.resultPath)
    if (!existsSync(recordedPath)) throw new Error(`Completed result is missing: ${recordedPath}`)
    const path = realpathSync(recordedPath)
    const pathFromRoot = relative(campaignRoot, path)
    if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      throw new Error(`Completion points outside the campaign: ${completionPath}`)
    }
    const bundle = (await Bun.file(path).json()) as ResultBundle
    const key = `${bundle.block}:position-${bundle.plannedPosition}`
    if (bundles.has(key)) throw new Error(`Duplicate formal result for ${key}`)
    bundles.set(key, { path, bundle })
  }
  const missing = blindReviewOrder.filter((key) => !bundles.has(key))
  if (missing.length > 0) {
    throw new Error(`Formal campaign is incomplete; missing ${missing.length} review samples`)
  }
  const expectedKeys = new Set(blindReviewOrder)
  const unexpected = [...bundles.keys()].filter((key) => !expectedKeys.has(key))
  if (unexpected.length > 0) {
    throw new Error(`Formal campaign contains ${unexpected.length} unexpected review samples`)
  }

  const packets = blindReviewOrder.map((key, index) => {
    const entry = bundles.get(key)!
    return {
      reviewId: `R${String(index + 1).padStart(3, "0")}`,
      ...projectReviewSample(entry.bundle),
    }
  })
  const mapping = blindReviewOrder.map((key, index) => {
    const entry = bundles.get(key)!
    return {
      reviewId: `R${String(index + 1).padStart(3, "0")}`,
      executionKey: key,
      scenarioId: entry.bundle.scenario.id,
      resultPath: entry.path,
      primaryCriterionAutomaticallyFailed:
        !entry.bundle.assessment.reviewablePolicySample,
    }
  })
  const instructions = buildBlindReviewInstructions()
  const byBlockAndScenario = new Map(
    [...bundles.values()].map((entry) => [
      `${entry.bundle.block}:${entry.bundle.scenario.id}`,
      entry,
    ]),
  )
  const contrastPackets = contrastReviewPlan.map((planned, index) => ({
    contrastId: `C${String(index + 1).padStart(3, "0")}`,
    samples: planned.sampleScenarioIds.map((scenarioId) => {
      const entry = byBlockAndScenario.get(`${planned.block}:${scenarioId}`)
      if (!entry) {
        throw new Error(`Formal campaign is missing contrast sample ${planned.block}/${scenarioId}`)
      }
      return projectReviewSample(entry.bundle)
    }),
    question: planned.sampleScenarioIds.length === 2
      ? "Do the responses make materially different moves appropriate to their two visible situations, rather than the same generic response?"
      : "Do the responses preserve materially distinct cognitive roles supported by their visible durable context, rather than collapsing to one generic move?",
  }))
  const contrastMapping = contrastReviewPlan.map((planned, index) => ({
    contrastId: `C${String(index + 1).padStart(3, "0")}`,
    executionKey: planned.executionKey,
    block: planned.block,
    scenarioIdsInPacketOrder: planned.sampleScenarioIds,
  }))

  await Bun.write(
    join(campaignDirectory, "review-packets.jsonl"),
    `${packets.map((packet) => JSON.stringify(packet)).join("\n")}\n`,
  )
  await Bun.write(
    join(campaignDirectory, "review-instructions.json"),
    `${JSON.stringify(instructions, null, 2)}\n`,
  )
  await Bun.write(
    join(campaignDirectory, "review-map.json"),
    `${JSON.stringify(mapping, null, 2)}\n`,
  )
  await Bun.write(
    join(campaignDirectory, "review-contrast-packets.jsonl"),
    `${contrastPackets.map((packet) => JSON.stringify(packet)).join("\n")}\n`,
  )
  await Bun.write(
    join(campaignDirectory, "review-contrast-map.json"),
    `${JSON.stringify(contrastMapping, null, 2)}\n`,
  )
  return { packets: packets.length, contrasts: contrastPackets.length }
}

export function projectReviewSample(bundle: ResultBundle) {
  return {
    modelBoundary: bundle.providerCalls.map((call) => ({
      sequence: call.sequence,
      request: call.request,
      streamParts: call.streamParts,
    })),
    finalAssistantText: bundle.outcome?.text ?? null,
    executionFailure: bundle.failure ?? null,
    durableAgendaChanges: projectDurableAgendaChanges(bundle),
  }
}

function projectDurableAgendaChanges(bundle: ResultBundle) {
  const initial = new Map(
    bundle.initialSnapshot.agendaConcerns.map((concern) => [concern.id, concern]),
  )
  const initialSourceItems = new Map(
    bundle.initialSnapshot.sessions.flatMap((session) =>
      session.items.map((item) => [item.itemId, item] as const),
    ),
  )
  const finalSourceItems = new Map(
    bundle.finalSnapshot.sessions.flatMap((session) =>
      session.items.map((item) => [item.itemId, item] as const),
    ),
  )
  const changes: Array<Record<string, unknown>> = bundle.finalSnapshot.agendaConcerns.flatMap((concern) => {
    const before = initial.get(concern.id)
    const afterProjection = visibleAgendaConcern(concern, finalSourceItems)
    const beforeProjection = before
      ? visibleAgendaConcern(before, initialSourceItems)
      : undefined
    if (beforeProjection && isDeepStrictEqual(beforeProjection, afterProjection)) {
      return []
    }
    return [{
      change: before ? "updated" : "created",
      ...(beforeProjection ? { before: beforeProjection } : {}),
      ...afterProjection,
    }]
  })
  const finalIds = new Set(bundle.finalSnapshot.agendaConcerns.map((concern) => concern.id))
  for (const concern of bundle.initialSnapshot.agendaConcerns) {
    if (!finalIds.has(concern.id)) {
      changes.push({
        change: "deleted",
        before: visibleAgendaConcern(concern, initialSourceItems),
      })
    }
  }
  return changes
}

function visibleAgendaConcern(
  concern: AgendaConcern,
  sourceItems: Map<string, { itemId: string; role: string; content: string }>,
) {
  const source = sourceItems.get(concern.sourceItemId)
  return {
    persisted: {
      authorship: concern.authorship,
      reason: concern.reason,
      notBefore: concern.notBefore,
      target: concern.target,
      status: concern.status,
      version: concern.version,
    },
    source: source ? { role: source.role, content: source.content } : null,
  }
}

export async function validateBlindReviewFile(path: string) {
  return parseBlindReviewJsonl(await Bun.file(path).text())
}

export function parseBlindReviewJsonl(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const records = lines.map((line, index) => {
    try {
      return blindReviewRecordSchema.parse(JSON.parse(line))
    } catch (error) {
      throw new Error(`Invalid blind review record at line ${index + 1}`, { cause: error })
    }
  })
  if (records.length !== blindReviewOrder.length) {
    throw new Error(`Expected ${blindReviewOrder.length} review records, received ${records.length}`)
  }
  if (new Set(records.map((record) => record.reviewId)).size !== records.length) {
    throw new Error("Blind review IDs must be unique")
  }
  const expectedReviewIds = new Set(
    blindReviewOrder.map((_, index) => `R${String(index + 1).padStart(3, "0")}`),
  )
  if (records.some((record) => !expectedReviewIds.has(record.reviewId))) {
    throw new Error("Blind review IDs must match the exact frozen set R001..R112")
  }
  return records
}

export async function validateBlindContrastReviewFile(path: string) {
  return parseBlindContrastReviewJsonl(await Bun.file(path).text())
}

export function parseBlindContrastReviewJsonl(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const records = lines.map((line, index) => {
    try {
      return blindContrastReviewRecordSchema.parse(JSON.parse(line))
    } catch (error) {
      throw new Error(`Invalid blind contrast review at line ${index + 1}`, {
        cause: error,
      })
    }
  })
  if (records.length !== contrastReviewPlan.length) {
    throw new Error(
      `Expected ${contrastReviewPlan.length} contrast reviews, received ${records.length}`,
    )
  }
  const expectedIds = new Set(
    contrastReviewPlan.map((_, index) => `C${String(index + 1).padStart(3, "0")}`),
  )
  if (
    new Set(records.map((record) => record.contrastId)).size !== records.length ||
    records.some((record) => !expectedIds.has(record.contrastId))
  ) {
    throw new Error("Contrast review IDs must match the exact frozen set C001..C016")
  }
  return records
}

export function buildBlindReviewInstructions() {
  return {
    schemaRevision: BLIND_REVIEW_SCHEMA_REVISION,
    fields: blindReviewFields,
    contrastFields: {
      contrastId: "exact packet ID C001..C016",
      contrastFit: "pass | fail | unclear",
      evidence: "short visible-response-grounded rationale",
    },
    operationalDefinitions: reviewOperationalDefinitions,
    procedure: [
      "Review only review-packets.jsonl and these generic definitions; do not inspect review-map.json or protocol scenario rules.",
      "Judge model-visible situation and behavior, not keywords. Cite short response-grounded evidence.",
      "Do not exclude packets with missing text or execution failure; score visible fields conservatively. The hidden aggregation counts every completed non-infrastructure packet.",
      "Return one JSON object per reviewId matching the frozen schema. Do not infer human learning.",
      "For review-contrast-packets.jsonl, judge only whether the visible responses make materially distinct situation-appropriate moves; return one JSON object per contrastId with contrastFit exactly pass, fail, or unclear, plus non-empty evidence.",
    ],
  }
}

async function reviewMain() {
  const operation = process.argv[2]
  const target = process.argv[3]
  if (
    !target ||
    (operation !== "export" && operation !== "validate" && operation !== "validate-contrast")
  ) {
    throw new Error(
      "Usage: bun run review.ts export <campaign-directory> | validate <review.jsonl> | validate-contrast <contrast-review.jsonl>",
    )
  }
  const path = resolve(target)
  if (!existsSync(path)) throw new Error(`Review target does not exist: ${path}`)
  if (operation === "export") {
    const result = await exportBlindReviewPackets(path)
    process.stdout.write(`Exported ${result.packets} blind review packets\n`)
  } else if (operation === "validate") {
    const records = await validateBlindReviewFile(path)
    process.stdout.write(`Validated ${records.length} blind review records\n`)
  } else {
    const records = await validateBlindContrastReviewFile(path)
    process.stdout.write(`Validated ${records.length} blind contrast reviews\n`)
  }
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}
