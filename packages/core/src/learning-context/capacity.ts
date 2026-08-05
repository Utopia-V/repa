import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import { TurnModelOperationTable } from "../turn/sql"
import type { MessageID } from "../v1/session"
import {
  CapacityConflictError,
  CapacityIntegrityError,
  SCHEMA_VERSION,
  canonicalFingerprint,
  canonicalJson,
  toJsonValue,
  utf8Bytes,
  type CapacityAssessment,
  type CapacityRead,
  type CapacityRemovableHistory,
} from "./schema"
import { TurnLearningContextCutTable, TurnModelCapacityTable } from "./sql"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export type CapacityInput = Readonly<{
  assistantMessageID: MessageID
  envelopeFingerprint: string
  retainedSteeringFingerprint: string
  learningContextFingerprint: string
  learningContextRenderedFingerprint: string
  providerToolSurfaceFingerprint: string
  providerToolSurfaceCanonicalBytes: number
  fixedEstimatedTokens: number
  removableEstimatedTokens: number
  removableHistory?: CapacityRemovableHistory
  contextLimitTokens?: number
  inputLimitTokens?: number
  outputReserveTokens?: number
}>

export type CapacityPreparation = Readonly<{
  assessment: CapacityAssessment
  canonicalAssessment: string
  assessmentBytes: number
}>

export function prepareCapacity(input: CapacityInput): CapacityPreparation {
  requireDigest(input.assistantMessageID, "envelopeFingerprint", input.envelopeFingerprint)
  requireDigest(input.assistantMessageID, "retainedSteeringFingerprint", input.retainedSteeringFingerprint)
  requireDigest(input.assistantMessageID, "learningContextFingerprint", input.learningContextFingerprint)
  requireDigest(
    input.assistantMessageID,
    "learningContextRenderedFingerprint",
    input.learningContextRenderedFingerprint,
  )
  requireDigest(input.assistantMessageID, "providerToolSurfaceFingerprint", input.providerToolSurfaceFingerprint)
  requireNonnegative(
    input.assistantMessageID,
    "providerToolSurfaceCanonicalBytes",
    input.providerToolSurfaceCanonicalBytes,
  )
  requireNonnegative(input.assistantMessageID, "fixedEstimatedTokens", input.fixedEstimatedTokens)
  requireNonnegative(input.assistantMessageID, "removableEstimatedTokens", input.removableEstimatedTokens)
  if (
    (input.removableEstimatedTokens === 0 && input.removableHistory !== undefined) ||
    (input.removableEstimatedTokens > 0 && !removableHistory(input.removableHistory))
  ) {
    invalid(input.assistantMessageID, "removable_history_invalid")
  }

  const limits = {
    contextLimitTokens: normalizeLimit(input.contextLimitTokens),
    inputLimitTokens: normalizeLimit(input.inputLimitTokens),
    outputReserveTokens: normalizeLimit(input.outputReserveTokens),
  }
  const invalidLimit = Object.entries({
    contextLimitTokens: input.contextLimitTokens,
    inputLimitTokens: input.inputLimitTokens,
    outputReserveTokens: input.outputReserveTokens,
  }).find((entry) => entry[1] !== undefined && (!Number.isSafeInteger(entry[1]) || Number(entry[1]) < 0))
  const total = input.fixedEstimatedTokens + input.removableEstimatedTokens
  const result = classifyCapacity({
    ...limits,
    fixedEstimatedTokens: input.fixedEstimatedTokens,
    removableEstimatedTokens: input.removableEstimatedTokens,
    invalidLimit: invalidLimit ? `${invalidLimit[0]}_invalid` : undefined,
  })
  const base = {
    schemaVersion: SCHEMA_VERSION,
    assistantMessageID: input.assistantMessageID,
    envelopeFingerprint: input.envelopeFingerprint,
    retainedSteeringFingerprint: input.retainedSteeringFingerprint,
    learningContextFingerprint: input.learningContextFingerprint,
    learningContextRenderedFingerprint: input.learningContextRenderedFingerprint,
    providerToolSurfaceFingerprint: input.providerToolSurfaceFingerprint,
    providerToolSurfaceCanonicalBytes: input.providerToolSurfaceCanonicalBytes,
    method: "canonical_utf8_bytes_as_conservative_token_upper_bound" as const,
    classification: result.classification,
    decision: result.decision,
    fixedEstimatedTokens: input.fixedEstimatedTokens,
    removableEstimatedTokens: input.removableEstimatedTokens,
    removableHistory: input.removableHistory ?? null,
    totalEstimatedTokens: total,
    contextLimitTokens: limits.contextLimitTokens,
    inputLimitTokens: limits.inputLimitTokens,
    outputReserveTokens: limits.outputReserveTokens,
    usableInputLimitTokens: result.usableInputLimitTokens,
    reason: result.reason,
  }
  const assessment = { ...base, fingerprint: canonicalFingerprint(toJsonValue(base)) } satisfies CapacityAssessment
  const canonicalAssessment = canonicalJson(toJsonValue(assessment))
  validateCapacity(assessment, input.assistantMessageID)
  return { assessment, canonicalAssessment, assessmentBytes: utf8Bytes(canonicalAssessment) }
}

export function commitCapacity(tx: Transaction, preparation: CapacityPreparation) {
  return Effect.gen(function* () {
    const assessment = yield* decodeCapacityEffect(
      preparation.canonicalAssessment,
      preparation.assessment.assistantMessageID,
    )
    if (
      assessment.fingerprint !== preparation.assessment.fingerprint ||
      utf8Bytes(preparation.canonicalAssessment) !== preparation.assessmentBytes
    ) {
      return yield* Effect.fail(
        new CapacityIntegrityError({
          assistantMessageID: assessment.assistantMessageID,
          reason: "preparation_mismatch",
        }),
      )
    }
    const existing = yield* tx
      .select()
      .from(TurnModelCapacityTable)
      .where(eq(TurnModelCapacityTable.assistant_message_id, assessment.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.canonical_assessment !== preparation.canonicalAssessment ||
        existing.assessment_bytes !== preparation.assessmentBytes ||
        existing.assessment_fingerprint !== assessment.fingerprint
      ) {
        return yield* Effect.fail(new CapacityConflictError(assessment.assistantMessageID))
      }
      return { assessment, replay: true as const }
    }
    const [operation, cut] = yield* Effect.all([
      tx
        .select()
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.assistant_message_id, assessment.assistantMessageID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnLearningContextCutTable)
        .where(eq(TurnLearningContextCutTable.assistant_message_id, assessment.assistantMessageID))
        .get()
        .pipe(Effect.orDie),
    ])
    if (
      !operation ||
      !cut ||
      operation.retained_steering_cut_fingerprint !== assessment.retainedSteeringFingerprint ||
      cut.cut_fingerprint !== assessment.learningContextFingerprint ||
      cut.rendered_fingerprint !== assessment.learningContextRenderedFingerprint ||
      !capacityMatchesStoredProviderSurface(cut.canonical_cut, assessment)
    ) {
      return yield* Effect.fail(
        new CapacityIntegrityError({
          assistantMessageID: assessment.assistantMessageID,
          reason: "operation_context_mismatch",
        }),
      )
    }
    yield* tx
      .insert(TurnModelCapacityTable)
      .values({
        assistant_message_id: assessment.assistantMessageID,
        canonical_assessment: preparation.canonicalAssessment,
        assessment_bytes: preparation.assessmentBytes,
        assessment_fingerprint: assessment.fingerprint,
        envelope_fingerprint: assessment.envelopeFingerprint,
        classification: assessment.classification,
        decision: assessment.decision,
      })
      .run()
      .pipe(Effect.orDie)
    return { assessment, replay: false as const }
  })
}

function capacityMatchesStoredProviderSurface(canonicalCut: string, assessment: CapacityAssessment) {
  try {
    const cut = JSON.parse(canonicalCut) as {
      capabilityBasis?: {
        effectiveProviderToolSurfaceBinding?: {
          combinedFingerprint?: unknown
          combinedCanonicalBytes?: unknown
        }
      }
    }
    const surface = cut.capabilityBasis?.effectiveProviderToolSurfaceBinding
    return (
      surface?.combinedFingerprint === assessment.providerToolSurfaceFingerprint &&
      surface.combinedCanonicalBytes === assessment.providerToolSurfaceCanonicalBytes
    )
  } catch {
    return false
  }
}

export function readCapacity(
  tx: Transaction,
  assistantMessageID: MessageID,
): Effect.Effect<CapacityRead, CapacityIntegrityError> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnModelCapacityTable)
      .where(eq(TurnModelCapacityTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return { type: "not_found" as const, assistantMessageID }
    if (row.assessment_bytes !== utf8Bytes(row.canonical_assessment)) {
      return yield* Effect.fail(
        new CapacityIntegrityError({ assistantMessageID, reason: "stored_byte_count_mismatch" }),
      )
    }
    const assessment = yield* decodeCapacityEffect(row.canonical_assessment, assistantMessageID)
    if (
      assessment.fingerprint !== row.assessment_fingerprint ||
      assessment.envelopeFingerprint !== row.envelope_fingerprint ||
      assessment.classification !== row.classification ||
      assessment.decision !== row.decision
    ) {
      return yield* Effect.fail(
        new CapacityIntegrityError({ assistantMessageID, reason: "stored_projection_mismatch" }),
      )
    }
    return { type: "available" as const, assessment, canonicalAssessment: row.canonical_assessment }
  })
}

function decodeCapacityEffect(
  canonicalAssessment: string,
  assistantMessageID: MessageID,
): Effect.Effect<CapacityAssessment, CapacityIntegrityError> {
  return Effect.try({
    try: () => decodeCapacity(canonicalAssessment, assistantMessageID),
    catch: (error) =>
      error instanceof CapacityIntegrityError
        ? error
        : new CapacityIntegrityError({ assistantMessageID, reason: "decoder_failed" }),
  })
}

export function decodeCapacity(canonicalAssessment: string, assistantMessageID: MessageID): CapacityAssessment {
  let parsed: unknown
  try {
    parsed = JSON.parse(canonicalAssessment)
  } catch {
    throw new CapacityIntegrityError({ assistantMessageID, reason: "canonical_json_invalid" })
  }
  if (canonicalJson(toJsonValue(parsed)) !== canonicalAssessment) {
    throw new CapacityIntegrityError({ assistantMessageID, reason: "canonical_json_not_canonical" })
  }
  validateCapacity(parsed, assistantMessageID)
  return parsed
}

function validateCapacity(value: unknown, assistantMessageID: MessageID): asserts value is CapacityAssessment {
  if (!record(value)) invalid(assistantMessageID, "malformed_assessment")
  const expected = [
    "schemaVersion",
    "assistantMessageID",
    "envelopeFingerprint",
    "retainedSteeringFingerprint",
    "learningContextFingerprint",
    "learningContextRenderedFingerprint",
    "providerToolSurfaceFingerprint",
    "providerToolSurfaceCanonicalBytes",
    "method",
    "classification",
    "decision",
    "fixedEstimatedTokens",
    "removableEstimatedTokens",
    "removableHistory",
    "totalEstimatedTokens",
    "contextLimitTokens",
    "inputLimitTokens",
    "outputReserveTokens",
    "usableInputLimitTokens",
    "reason",
    "fingerprint",
  ].sort()
  if (
    Object.keys(value).sort().join("\0") !== expected.join("\0") ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.assistantMessageID !== assistantMessageID ||
    ![
      value.envelopeFingerprint,
      value.retainedSteeringFingerprint,
      value.learningContextFingerprint,
      value.learningContextRenderedFingerprint,
      value.providerToolSurfaceFingerprint,
      value.fingerprint,
    ].every(digest) ||
    !nonnegative(value.providerToolSurfaceCanonicalBytes) ||
    value.method !== "canonical_utf8_bytes_as_conservative_token_upper_bound" ||
    !["capacity_known", "capacity_unknown", "capacity_invalid"].includes(String(value.classification)) ||
    !["fit", "uncertain", "history_overflow", "fixed_overflow", "invalid_limits"].includes(String(value.decision)) ||
    !nonnegative(value.fixedEstimatedTokens) ||
    !nonnegative(value.removableEstimatedTokens) ||
    (value.removableEstimatedTokens === 0 && value.removableHistory !== null) ||
    (Number(value.removableEstimatedTokens) > 0 && !removableHistory(value.removableHistory)) ||
    !nonnegative(value.totalEstimatedTokens) ||
    value.totalEstimatedTokens !== Number(value.fixedEstimatedTokens) + Number(value.removableEstimatedTokens) ||
    !limit(value.contextLimitTokens) ||
    !limit(value.inputLimitTokens) ||
    !limit(value.outputReserveTokens) ||
    !signedLimit(value.usableInputLimitTokens) ||
    (value.reason !== null && typeof value.reason !== "string")
  )
    invalid(assistantMessageID, "malformed_assessment")
  const base = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "fingerprint"))
  if (canonicalFingerprint(toJsonValue(base)) !== value.fingerprint) invalid(assistantMessageID, "fingerprint_mismatch")
  const expectedResult = classifyCapacity({
    contextLimitTokens: value.contextLimitTokens as number | null,
    inputLimitTokens: value.inputLimitTokens as number | null,
    outputReserveTokens: value.outputReserveTokens as number | null,
    fixedEstimatedTokens: value.fixedEstimatedTokens as number,
    removableEstimatedTokens: value.removableEstimatedTokens as number,
    invalidLimit: storedInvalidLimit(value),
  })
  if (
    value.classification !== expectedResult.classification ||
    value.decision !== expectedResult.decision ||
    value.usableInputLimitTokens !== expectedResult.usableInputLimitTokens ||
    value.reason !== expectedResult.reason
  )
    invalid(assistantMessageID, "classification_mismatch")
}

function removableHistory(value: unknown): value is CapacityRemovableHistory {
  return (
    record(value) &&
    Object.keys(value).sort().join("\0") ===
      ["messageCount", "messageIDsFingerprint", "tailStartMessageID"].sort().join("\0") &&
    typeof value.tailStartMessageID === "string" &&
    value.tailStartMessageID.length > 0 &&
    Number.isSafeInteger(value.messageCount) &&
    Number(value.messageCount) > 0 &&
    digest(value.messageIDsFingerprint)
  )
}

function storedInvalidLimit(value: Record<string, unknown>) {
  const negative = ["contextLimitTokens", "inputLimitTokens", "outputReserveTokens"].find(
    (key) => typeof value[key] === "number" && Number(value[key]) < 0,
  )
  if (negative) return `${negative}_invalid`
  if (
    value.classification === "capacity_invalid" &&
    value.decision === "invalid_limits" &&
    ["contextLimitTokens_invalid", "inputLimitTokens_invalid", "outputReserveTokens_invalid"].includes(
      String(value.reason),
    )
  )
    return String(value.reason)
}

function classifyCapacity(input: {
  readonly contextLimitTokens: number | null
  readonly inputLimitTokens: number | null
  readonly outputReserveTokens: number | null
  readonly fixedEstimatedTokens: number
  readonly removableEstimatedTokens: number
  readonly invalidLimit?: string
}) {
  if (input.invalidLimit) {
    return {
      classification: "capacity_invalid" as const,
      decision: "invalid_limits" as const,
      usableInputLimitTokens: null,
      reason: input.invalidLimit,
    }
  }
  if (
    input.contextLimitTokens !== null &&
    input.contextLimitTokens > 0 &&
    input.outputReserveTokens !== null &&
    input.outputReserveTokens > input.contextLimitTokens
  ) {
    return {
      classification: "capacity_invalid" as const,
      decision: "invalid_limits" as const,
      usableInputLimitTokens: input.contextLimitTokens - input.outputReserveTokens,
      reason: "output_reserve_exhausts_context",
    }
  }
  const candidates = [
    input.inputLimitTokens !== null && input.inputLimitTokens > 0 ? input.inputLimitTokens : undefined,
    input.contextLimitTokens !== null &&
    input.contextLimitTokens > 0 &&
    input.outputReserveTokens !== null &&
    input.outputReserveTokens > 0
      ? input.contextLimitTokens - input.outputReserveTokens
      : undefined,
  ].filter((value): value is number => value !== undefined)
  const usableInputLimitTokens = candidates.length === 0 ? null : Math.min(...candidates)
  if (usableInputLimitTokens === null) {
    return {
      classification: "capacity_unknown" as const,
      decision: "uncertain" as const,
      usableInputLimitTokens,
      reason:
        input.contextLimitTokens !== null && input.contextLimitTokens > 0
          ? "output_reserve_unknown"
          : "model_input_capacity_unknown",
    }
  }
  if (input.fixedEstimatedTokens > usableInputLimitTokens) {
    return {
      classification: "capacity_invalid" as const,
      decision: "fixed_overflow" as const,
      usableInputLimitTokens,
      reason: "fixed_envelope_exceeds_usable_input",
    }
  }
  if (input.fixedEstimatedTokens + input.removableEstimatedTokens > usableInputLimitTokens) {
    return {
      classification: "capacity_known" as const,
      decision: "history_overflow" as const,
      usableInputLimitTokens,
      reason: "removable_history_exceeds_usable_input",
    }
  }
  return {
    classification: "capacity_known" as const,
    decision: "fit" as const,
    usableInputLimitTokens,
    reason: null,
  }
}

function normalizeLimit(value: number | undefined) {
  return value === undefined || !Number.isSafeInteger(value) ? null : value
}

function requireDigest(assistantMessageID: MessageID, field: string, value: string) {
  if (!digest(value)) invalid(assistantMessageID, `${field}_invalid`)
}

function requireNonnegative(assistantMessageID: MessageID, field: string, value: number) {
  if (!nonnegative(value)) invalid(assistantMessageID, `${field}_invalid`)
}

function invalid(assistantMessageID: MessageID, reason: string): never {
  throw new CapacityIntegrityError({ assistantMessageID, reason })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function limit(value: unknown) {
  return value === null || Number.isSafeInteger(value)
}

function signedLimit(value: unknown) {
  return value === null || Number.isSafeInteger(value)
}
