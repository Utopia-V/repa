export * as LearningInspectionCursor from "./learning-inspection-cursor-schema"

import { Schema } from "effect"

const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const SessionID = Schema.String.check(Schema.isStartsWith("ses_"))
const TurnID = Schema.String.check(Schema.isStartsWith("trn_"))
const InputID = Schema.String.check(Schema.isStartsWith("tri_"))
const PartID = Schema.String.check(Schema.isStartsWith("prt_"))
const CallID = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192))
const TerminalReason = Schema.Literals([
  "normal",
  "provider_failure",
  "tool_runtime_failure",
  "permission_failure",
  "projection_failure",
  "owner_failure",
  "integrity_failure",
  "learner_interrupt",
  "ancestor_interrupt",
  "owner_handoff_failed",
  "owner_lost",
  "startup_recovery",
  "model_limit",
  "tool_limit",
])

export const Continuation = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  queryFingerprint: Digest,
  source: Schema.Struct({
    sessionID: SessionID,
    turnID: TurnID,
    inputID: InputID,
    partID: PartID,
    modelOrdinal: NonNegativeInt,
    toolOrdinal: NonNegativeInt,
  }),
  lastKey: Schema.optional(Schema.Struct({ timeTerminal: NonNegativeInt, turnID: TurnID })),
  parentOutputFingerprint: Schema.optional(Digest),
  completeSoFar: Schema.Boolean,
  gapCounts: Schema.Struct({ oversizedCandidateSkipped: NonNegativeInt, rangeItemsSkipped: NonNegativeInt }),
  gapFingerprint: Digest,
  continuationPending: Schema.Boolean,
  rangeNextOffset: Schema.optional(NonNegativeInt),
  outputFingerprint: Digest,
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export type Continuation = typeof Continuation.Type

export const ThinDescriptor = Schema.Struct({
  status: Schema.Literals(["available", "source_unavailable"]),
  sessionID: SessionID,
  turnID: TurnID,
  timeAdmitted: NonNegativeInt,
  timeTerminal: NonNegativeInt,
  terminalState: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
  terminalReason: Schema.optional(TerminalReason),
  sessionParentID: Schema.optional(SessionID),
  navigationHint: Schema.optional(
    Schema.Struct({ sessionTitle: Schema.String, trust: Schema.Literal("untrusted_navigation_hint") }),
  ),
  timeDeleted: Schema.optional(NonNegativeInt),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export type ThinDescriptor = typeof ThinDescriptor.Type

export const Candidate = Schema.Struct({
  descriptor: ThinDescriptor,
  before: Schema.optional(Schema.Struct({ timeTerminal: NonNegativeInt, turnID: TurnID })),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export type Candidate = typeof Candidate.Type

const Range = Schema.Struct({
  first: Schema.optional(Schema.String),
  last: Schema.optional(Schema.String),
  count: NonNegativeInt,
  fingerprint: Digest,
  chunks: Schema.Array(
    Schema.Struct({
      offset: NonNegativeInt,
      count: PositiveInt.check(Schema.isLessThanOrEqualTo(8)),
      fingerprint: Digest,
    }),
  ),
})

const PresentationProvenance = Schema.Struct({
  count: PositiveInt,
  kinds: Schema.Array(Schema.Literals(["origin", "compaction_replay", "fork_clone"])),
  fingerprint: Digest,
  historicalMessageOrPart: Schema.Boolean,
})

const LocatorCommon = {
  sessionID: SessionID,
  turnID: TurnID,
  inputID: Schema.optional(InputID),
  causalOccurrenceID: Schema.optional(Schema.String),
  timeAdmitted: NonNegativeInt,
  timeTerminal: NonNegativeInt,
  terminalState: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
  terminalReason: Schema.optional(TerminalReason),
  sessionParentID: Schema.optional(SessionID),
}

export const Locator = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    ...LocatorCommon,
    presentationProvenance: PresentationProvenance,
    messageRange: Range,
    partRange: Range,
  }),
  Schema.Struct({
    status: Schema.Literal("source_unavailable"),
    ...LocatorCommon,
    presentationProvenance: Schema.Literal("source_unavailable"),
    timeDeleted: NonNegativeInt,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })
export type Locator = typeof Locator.Type

export const TerminalRootListInput = Schema.Struct({
  action: Schema.Literal("list_terminal_roots"),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  predecessor: Schema.optional(Continuation),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const MaterializeInput = Schema.Struct({
  action: Schema.Literal("materialize_interaction_locator"),
  candidate: Candidate,
  predecessor: Continuation,
  maxRows: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(512))),
  maxBytes: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(32_768))),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const SkipInput = Schema.Struct({
  action: Schema.Literal("skip_interaction_candidate"),
  candidate: Candidate,
  predecessor: Continuation,
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const RangeInput = Schema.Struct({
  action: Schema.Literal("read_range"),
  locator: Locator,
  offset: Schema.optional(NonNegativeInt),
  allowOffsetGap: Schema.optional(Schema.Literal(true)),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  predecessor: Schema.optional(Continuation),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const RecentRangeInput = Schema.Struct({
  action: Schema.Literal("read_recent_range"),
  directoryCallID: CallID,
  entryIndex: NonNegativeInt.check(Schema.isLessThanOrEqualTo(63)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const SearchInput = Schema.Union([
  TerminalRootListInput,
  MaterializeInput,
  SkipInput,
  RangeInput,
  RecentRangeInput,
]).annotate({ parseOptions: { onExcessProperty: "error" } })
export type SearchInput = typeof SearchInput.Type

export function queryFingerprint(value: unknown) {
  return fingerprint(value)
}

export function signSearch(input: Omit<Continuation, "outputFingerprint">, payload: Readonly<Record<string, unknown>>) {
  const unsigned = {
    payload,
    continuation: { ...input, outputFingerprint: "0".repeat(64) },
  }
  const continuation = {
    ...input,
    outputFingerprint: fingerprint(unsigned),
  } satisfies Continuation
  return { payload, continuation }
}

export function verifyStoredSearch(outputBytes: string, continuation: Continuation) {
  const output = parse(outputBytes)
  const owner = record(output) && record(output.ownerResult) ? output.ownerResult : output
  const search = record(owner) && record(owner.search) ? owner.search : undefined
  if (!search || !record(search.payload) || !record(search.continuation)) {
    return { type: "conflict" as const, reason: "predecessor_output_shape" as const }
  }
  if (!Schema.is(Continuation)(search.continuation)) {
    return { type: "conflict" as const, reason: "predecessor_cursor_shape" as const }
  }
  const stored = search.continuation
  if (fingerprint(stored) !== fingerprint(continuation)) {
    return { type: "conflict" as const, reason: "predecessor_token_mismatch" as const }
  }
  const expected = fingerprint({
    payload: search.payload,
    continuation: { ...stored, outputFingerprint: "0".repeat(64) },
  })
  if (stored.outputFingerprint !== expected) {
    return { type: "conflict" as const, reason: "predecessor_output_fingerprint" as const }
  }
  return { type: "verified" as const, continuation: stored, payload: search.payload }
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(stableStringify(value)).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
