import type { Database } from "@opencode-ai/core/database/database"
import { LearningInspection } from "@opencode-ai/core/learning-inspection"
import { MAX_LAZY_BYTES, MAX_LAZY_ITEMS, utf8Bytes } from "@opencode-ai/core/learning-context"
import type { LazyReadCapabilityID } from "@opencode-ai/core/learning-context"
import { waitForAbort } from "@opencode-ai/core/process"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { TurnLineage } from "@opencode-ai/core/turn-lineage"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import type { Tool } from "./tool"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export const LEARNING_INSPECTION_DEADLINE_MS = 5_000

export const LearningInspectionRequest = Schema.Union([
  Schema.Literal(true),
  Schema.Struct({
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(32))),
    cursor: Schema.optional(Schema.String),
    deletionRootSessionID: Schema.optional(Schema.String.check(Schema.isStartsWith("ses_"))),
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })
export type LearningInspectionRequest = typeof LearningInspectionRequest.Type
export const learningInspectionInput = { includeInspection: Schema.optional(LearningInspectionRequest) }

export function learningContextReadResult(input: {
  readonly capabilityID: LazyReadCapabilityID
  readonly title: string
  readonly metadata: Record<string, unknown>
  readonly value: unknown
  readonly lineageValue?: unknown
  readonly itemCount: number
}) {
  const output = JSON.stringify(input.value)
  const byteCount = utf8Bytes(output)
  const lineageValue = input.lineageValue ?? input.value
  if (input.itemCount > MAX_LAZY_ITEMS || byteCount > MAX_LAZY_BYTES) {
    const reason = input.itemCount > MAX_LAZY_ITEMS ? "item_limit" : "byte_limit"
    const unavailable = JSON.stringify({
      status: "over_budget",
      reason,
      observedBytes: byteCount,
      ceilingBytes: MAX_LAZY_BYTES,
      observedItems: input.itemCount,
      ceilingItems: MAX_LAZY_ITEMS,
    })
    return {
      title: `${input.title} unavailable`,
      metadata: {
        ...input.metadata,
        repaLineage: TurnLineage.readProjection(input.capabilityID, lineageValue, false),
        status: "over_budget",
        reason,
        observedBytes: byteCount,
        ceilingBytes: MAX_LAZY_BYTES,
        observedItems: input.itemCount,
        ceilingItems: MAX_LAZY_ITEMS,
        truncated: false,
      },
      output: unavailable,
    }
  }
  return {
    title: input.title,
    metadata: {
      ...input.metadata,
      repaLineage: TurnLineage.readProjection(input.capabilityID, lineageValue),
      status: "available",
      byteCount,
      itemCount: input.itemCount,
      truncated: false,
    },
    output,
  }
}

export function learningInspectionReadResult(
  tx: Transaction,
  input: Parameters<typeof learningContextReadResult>[0],
  context: Tool.Context,
  owner: Omit<LearningInspection.Projection["owner"], "kind" | "capabilityID" | "action" | "records">,
  request: LearningInspectionRequest = true,
) {
  const result = learningContextReadResult(input)
  const interaction = context.interaction
  if (
    !interaction ||
    interaction.assistantMessageID !== context.messageID ||
    interaction.candidate.callID !== context.callID
  ) {
    return Effect.die(new Error("Learning inspection requires one exact registered model operation"))
  }
  return LearningInspection.composeRead(tx, {
    source: {
      partID: interaction.candidate.partID,
      tool: input.capabilityID,
      action: typeof input.metadata.action === "string" ? input.metadata.action : "read",
      assistantMessageID: interaction.assistantMessageID,
      turnID: interaction.turnID,
      inputID: interaction.inputID,
    },
    readProjection: result.metadata.repaLineage,
    limit: typeof request === "object" ? (request.limit ?? 16) : 16,
    ...(typeof request === "object" && request.cursor ? { cursor: request.cursor } : {}),
    ...(typeof request === "object" && request.deletionRootSessionID
      ? { deletionRootSessionID: SessionSchema.ID.make(request.deletionRootSessionID) }
      : {}),
    owner,
  }).pipe(
    (effect) => boundedInspection(effect, context.abort),
    Effect.map((inspection) => attachInspection(result, input, inspection)),
    Effect.orDie,
  )
}

export function operationControlInspectionReadResult(
  tx: Transaction,
  input: Parameters<typeof learningContextReadResult>[0],
  context: Tool.Context,
  owner: Omit<LearningInspection.Projection["owner"], "kind" | "capabilityID" | "action" | "records">,
  arm: "learning_context" | "retained_steering",
) {
  const result = learningContextReadResult(input)
  const interaction = context.interaction
  if (
    !interaction ||
    interaction.assistantMessageID !== context.messageID ||
    interaction.candidate.callID !== context.callID
  ) {
    return Effect.die(new Error("Learning inspection requires one exact registered model operation"))
  }
  return LearningInspection.composeOperationControlRead(tx, {
    source: {
      partID: interaction.candidate.partID,
      tool: input.capabilityID,
      action: typeof input.metadata.action === "string" ? input.metadata.action : "read",
      assistantMessageID: interaction.assistantMessageID,
      turnID: interaction.turnID,
      inputID: interaction.inputID,
    },
    owner,
    arm,
  }).pipe(
    (effect) => boundedInspection(effect, context.abort),
    Effect.map((inspection) => attachInspection(result, input, inspection)),
    Effect.orDie,
  )
}

export function attachInspection(
  result: ReturnType<typeof learningContextReadResult>,
  input: Parameters<typeof learningContextReadResult>[0],
  inspection: LearningInspection.Projection,
) {
  const status = inspectionStatus(input.metadata)
  const projected = status ? { ...inspection, status } : inspection
  const output = JSON.stringify({ ownerResult: parseOutput(result.output), inspection: projected })
  const byteCount = utf8Bytes(output)
  if (byteCount > MAX_LAZY_BYTES) {
    return {
      ...result,
      title: `${input.title} inspection unavailable`,
      output: JSON.stringify({
        status: "inspection_output_over_budget",
        observedBytes: byteCount,
        ceilingBytes: MAX_LAZY_BYTES,
        recovery: "Retry with a smaller includeInspection.limit or a bound inspection cursor.",
      }),
      metadata: {
        ...result.metadata,
        status: "over_budget",
        reason: "inspection_byte_limit",
        observedBytes: byteCount,
        ceilingBytes: MAX_LAZY_BYTES,
        [LearningInspection.METADATA_KEY]: boundedInspectionFailure(projected),
      },
    }
  }
  return {
    ...result,
    output,
    metadata: { ...result.metadata, byteCount, [LearningInspection.METADATA_KEY]: projected },
  }
}

function parseOutput(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function inspectionStatus(value: unknown): LearningInspection.Projection["status"] | undefined {
  if (record(value) && value.found === false) return "not_found"
  const status = record(value) ? value.status : value
  if (
    [
      "not_found",
      "read_shape_unsupported",
      "stale_inspection",
      "integrity_validation_unavailable",
      "cursor_source_unavailable",
      "cursor_source_unavailable_or_unresolved",
      "cursor_predecessor_conflict",
      "cursor_reset_conflict",
      "interaction_locator_over_budget",
      "discovery_incomplete",
    ].includes(String(status))
  ) {
    return status as LearningInspection.Projection["status"]
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function boundedInspectionFailure(value: LearningInspection.Projection): LearningInspection.Projection {
  return {
    schemaVersion: 1,
    status: "integrity_validation_unavailable",
    source: value.source,
    owner: { ...value.owner, records: [], facts: [] },
    lineage: {
      coverage: "integrity_validation_unavailable",
      scope: { status: "integrity_unavailable", operationCount: 0, terminalSealedCount: 0 },
      contextCoverage: [],
      items: [],
      omitted: false,
      pendingGap: false,
    },
    deletionAudit: { status: "integrity_validation_unavailable", items: [], omitted: false },
    sessionDeletion: { status: "integrity_validation_unavailable" },
    administrativeHistory: {
      status: "integrity_validation_unavailable",
      members: [],
      laterLocalMessages: [],
      omitted: false,
    },
    nonCausality: "operational_lineage_not_per_record_answer_causality",
  }
}

export function boundedInspection<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(LEARNING_INSPECTION_DEADLINE_MS)])
  if (bounded.aborted) return waitForAbort(bounded)
  return Effect.raceFirst(effect, waitForAbort(bounded))
}
