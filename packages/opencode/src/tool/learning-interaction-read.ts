import { Database } from "@opencode-ai/core/database/database"
import { MAX_LAZY_BYTES } from "@opencode-ai/core/learning-context"
import { canonicalFingerprint, toJsonValue } from "@opencode-ai/core/learning-context"
import { LearningInspectionCursor } from "@opencode-ai/core/learning-inspection-cursor-schema"
import { PositiveInt } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { TurnLearningContext } from "@opencode-ai/core/turn/learning-context"
import { Turn } from "@opencode-ai/schema/turn"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import {
  learningContextReadResult,
  learningInspectionReadResult,
  operationControlInspectionReadResult,
  boundedInspection,
} from "./learning-context-read"
import { inspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import {
  hasSameTurnResetConflict,
  queryFingerprint,
  remainingCapacity,
  signSearch,
  source,
  verifyPriorCompletedToolCall,
  verifyPredecessor,
} from "./learning-interaction-search"
import { Tool } from "./tool"

export const LEARNING_INTERACTION_READ_TOOL_ID = "learning_interaction_read"
export const LEARNING_INTERACTION_READ_TOOL_IDS = [LEARNING_INTERACTION_READ_TOOL_ID] as const
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
const TERMINAL_ROOT_QUERY_FINGERPRINT = queryFingerprint({
  schemaVersion: 1,
  kind: "terminal_root_directory",
  scope: "learner_home",
})

const LearningInteractionReadInput = Schema.Union([
  LearningInspectionCursor.TerminalRootListInput,
  LearningInspectionCursor.MaterializeInput,
  LearningInspectionCursor.SkipInput,
  Schema.Struct({
    action: Schema.Literal("list_recent"),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  }),
  Schema.Struct({ action: Schema.Literal("inspect_current_context") }),
  Schema.Struct({ action: Schema.Literal("inspect_retained_steering_cut") }),
  Schema.Struct({ action: Schema.Literal("inspect_retained_steering_history") }),
  LearningInspectionCursor.RecentRangeInput,
  LearningInspectionCursor.RangeInput,
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearningInteractionReadTool = Tool.define<
  typeof LearningInteractionReadInput,
  Record<string, unknown>,
  Database.Service
>(
  LEARNING_INTERACTION_READ_TOOL_ID,
  Effect.gen(function* () {
    const database = yield* Database.Service
    return {
      description:
        "Inspect the current operation's immutable Context or retained-steering cut, discover terminal root Turns through a thin keyset directory, materialize one selected exact locator within explicit row/byte bounds, explicitly skip an oversized candidate while preserving the coverage gap, or read one exact pinned Message/Part range. After list_recent, prefer read_recent_range with the returned directoryCallID and entryIndex instead of copying the locator or its fingerprints. General retained-steering policy history remains unsupported. Continuations and compact recent-range reads are verified against immutable stored predecessor Tool results and cannot reset or erase gaps. The current Session remains directly discoverable. This tool never imports old transcript bodies into current history or changes Interaction state.",
      parameters: LearningInteractionReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearningInteractionReadInput, { additionalProperties: false }),
      execute: (input, context) => {
        const interaction = requireInteraction(context)
        if (input.action === "read_recent_range") {
          return database.db
            .transaction((tx) => executeRecentRange(tx, input, context))
            .pipe((effect) => boundedInspection(effect, context.abort), Effect.orDie)
        }
        if (
          input.action === "list_terminal_roots" ||
          input.action === "materialize_interaction_locator" ||
          input.action === "skip_interaction_candidate" ||
          input.action === "read_range"
        ) {
          return database.db
            .transaction((tx) => executeSearch(tx, input, context))
            .pipe((effect) => boundedInspection(effect, context.abort), Effect.orDie)
        }
        if (
          input.action === "inspect_current_context" ||
          input.action === "inspect_retained_steering_cut" ||
          input.action === "inspect_retained_steering_history"
        ) {
          return database.db
            .transaction((tx) => executeControlInspection(tx, input.action, context))
            .pipe((effect) => boundedInspection(effect, context.abort), Effect.orDie)
        }
        if (input.action === "list_recent") {
          return database.db
            .transaction((tx) =>
              TurnLearningContext.projectLearningContext(tx, {
                currentSessionID: SessionSchema.ID.make(context.sessionID),
                limit: input.limit ?? 64,
              }),
            )
            .pipe(
              (effect) => boundedInspection(effect, context.abort),
              Effect.map((page) => {
                const entries = page.entries.map((entry, entryIndex) => ({ entryIndex, ...entry }))
                return learningContextReadResult({
                  capabilityID: LEARNING_INTERACTION_READ_TOOL_ID,
                  title: "Recent Interaction locators",
                  metadata: {
                    action: input.action,
                    currentSessionID: context.sessionID,
                    count: page.entries.length,
                    countAtRead: page.countAtCut,
                    omitted: page.entries.length < page.countAtCut,
                  },
                  value: {
                    status: "available",
                    currentSessionID: context.sessionID,
                    countAtRead: page.countAtCut,
                    rangeReadHandle: {
                      directoryCallID: interaction.candidate.callID,
                      entryCount: entries.length,
                    },
                    entries,
                    omitted: page.entries.length < page.countAtCut,
                  },
                  itemCount: page.entries.length,
                })
              }),
              Effect.orDie,
            )
        }
        return Effect.die(new Error(`Unhandled Interaction read action`))
      },
    }
  }),
)

export function resolveRecentRangeLocator(
  tx: Transaction,
  input: LearningInspectionCursor.SearchInput & { action: "read_recent_range" },
  context: Tool.Context,
) {
  return Effect.gen(function* () {
    const predecessor = yield* verifyPriorCompletedToolCall(tx, {
      context,
      toolID: LEARNING_INTERACTION_READ_TOOL_ID,
      callID: input.directoryCallID,
      action: "list_recent",
    })
    if (predecessor.type !== "verified") return predecessor
    const owner = record(predecessor.output.ownerResult) ? predecessor.output.ownerResult : predecessor.output
    const handle = record(owner.rangeReadHandle) ? owner.rangeReadHandle : undefined
    const entries = Array.isArray(owner.entries) ? owner.entries : []
    if (
      handle?.directoryCallID !== input.directoryCallID ||
      handle.entryCount !== entries.length ||
      !Number.isSafeInteger(handle.entryCount)
    ) {
      return { type: "conflict" as const, reason: "predecessor_handle_mismatch" as const }
    }
    const entry = record(entries[input.entryIndex]) ? entries[input.entryIndex] : undefined
    if (!entry || entry.entryIndex !== input.entryIndex) {
      return { type: "conflict" as const, reason: "predecessor_entry_index" as const }
    }
    if (!Schema.is(LearningInspectionCursor.Locator)(entry.locator)) {
      return { type: "conflict" as const, reason: "predecessor_locator_shape" as const }
    }
    return { type: "verified" as const, partID: predecessor.partID, locator: entry.locator }
  })
}

function executeRecentRange(
  tx: Transaction,
  input: LearningInspectionCursor.SearchInput & { action: "read_recent_range" },
  context: Tool.Context,
) {
  return Effect.gen(function* () {
    const resolved = yield* resolveRecentRangeLocator(tx, input, context)
    if (resolved.type !== "verified") {
      return yield* searchResult(
        tx,
        context,
        {
          status:
            resolved.type === "source_unavailable_or_unresolved"
              ? "cursor_source_unavailable_or_unresolved"
              : "cursor_predecessor_conflict",
          reason:
            resolved.type === "source_unavailable_or_unresolved"
              ? "predecessor_part_unavailable_or_unproven"
              : resolved.reason,
          queryFingerprint: queryFingerprint({
            schemaVersion: 1,
            kind: "recent_interaction_range",
            directoryCallID: input.directoryCallID,
            entryIndex: input.entryIndex,
          }),
          noReadPerformed: true,
        },
        [],
        "compact recent Interaction binding failed before any range read",
      )
    }
    return yield* executeSearch(tx, { action: "read_range", locator: resolved.locator, limit: 64 }, context)
  })
}

function executeControlInspection(
  tx: Transaction,
  action: "inspect_current_context" | "inspect_retained_steering_cut" | "inspect_retained_steering_history",
  context: Tool.Context,
) {
  const arm = action === "inspect_current_context" ? "learning_context" : "retained_steering"
  return operationControlInspectionReadResult(
    tx,
    {
      capabilityID: LEARNING_INTERACTION_READ_TOOL_ID,
      title:
        action === "inspect_current_context"
          ? "Current immutable Context"
          : action === "inspect_retained_steering_history"
            ? "Retained-steering history unavailable"
            : "Current retained-steering cut",
      metadata: {
        action,
        status: action === "inspect_retained_steering_history" ? "read_shape_unsupported" : "available",
      },
      value: {
        status: "available",
        scope: "current_admitted_model_operation",
        ...(action === "inspect_retained_steering_cut"
          ? { generalPolicyHistory: "read_shape_unsupported" }
          : { correction: "later_operations_receive_a_new_cut" }),
      },
      lineageValue: [],
      itemCount: 1,
    },
    context,
    inspectionOwner(
      arm,
      action === "inspect_current_context"
        ? "exact immutable Context cut for the current model operation"
        : "exact immutable retained-steering cut for the current model operation",
    ),
    arm,
  )
}

export function rangeOffsetDecision(
  input: Readonly<{
    hasPredecessor: boolean
    priorWasRange: boolean
    expectedOffset?: number
    offset: number
    allowOffsetGap: boolean
  }>,
) {
  if (!input.hasPredecessor && input.offset !== 0) {
    return { type: "conflict" as const, reason: "nonzero_range_requires_predecessor" as const }
  }
  if (input.priorWasRange && input.expectedOffset === undefined) {
    return { type: "conflict" as const, reason: "range_was_already_complete" as const }
  }
  if (input.hasPredecessor && !input.priorWasRange && input.offset !== 0) {
    return { type: "conflict" as const, reason: "first_range_page_must_start_at_zero" as const }
  }
  const skipped = input.expectedOffset === undefined ? 0 : input.offset - input.expectedOffset
  if (skipped < 0) return { type: "conflict" as const, reason: "range_offset_rewinds" as const }
  if (skipped > 0 !== input.allowOffsetGap) {
    return { type: "conflict" as const, reason: "range_offset_not_exact_successor" as const }
  }
  return { type: "accepted" as const, skipped }
}

function executeSearch(
  tx: Transaction,
  input: Extract<
    Schema.Schema.Type<typeof LearningInteractionReadInput>,
    {
      action: "list_terminal_roots" | "materialize_interaction_locator" | "skip_interaction_candidate" | "read_range"
    }
  >,
  context: Tool.Context,
) {
  return Effect.gen(function* () {
    const queryID =
      input.action === "read_range"
        ? (input.predecessor?.queryFingerprint ??
          queryFingerprint({ schemaVersion: 1, kind: "exact_interaction_range", locator: input.locator }))
        : TERMINAL_ROOT_QUERY_FINGERPRINT
    const predecessor =
      "predecessor" in input && input.predecessor
        ? yield* verifyPredecessor(tx, {
            continuation: input.predecessor,
            toolID: LEARNING_INTERACTION_READ_TOOL_ID,
            queryFingerprint: queryID,
          })
        : undefined
    if (predecessor && predecessor.type !== "verified") {
      return yield* searchResult(
        tx,
        context,
        {
          status:
            predecessor.type === "source_unavailable_or_unresolved"
              ? "cursor_source_unavailable_or_unresolved"
              : "cursor_predecessor_conflict",
          reason: predecessor.type === "conflict" ? predecessor.reason : "predecessor_part_unavailable_or_unproven",
          queryFingerprint: queryID,
          noReadPerformed: true,
        },
        [],
        "cursor verification failed before any Interaction read",
      )
    }
    if (input.action === "list_terminal_roots") {
      const prior = predecessor?.type === "verified" ? predecessor.continuation : undefined
      if (
        !prior &&
        (yield* hasSameTurnResetConflict(tx, {
          context,
          toolID: LEARNING_INTERACTION_READ_TOOL_ID,
          queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
        }))
      ) {
        return yield* searchResult(
          tx,
          context,
          {
            status: "cursor_reset_conflict",
            reason: "same_turn_gap_cannot_restart_page_one",
            queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
            noReadPerformed: true,
          },
          [],
          "same-Turn page-one reset refused after a recorded coverage gap",
        )
      }
      const page = yield* TurnLearningContext.listTerminalRoots(tx, {
        limit: input.limit ?? 64,
        ...(prior?.lastKey
          ? { after: { timeTerminal: prior.lastKey.timeTerminal, turnID: Turn.ID.make(prior.lastKey.turnID) } }
          : {}),
      })
      const items = page.items.map((descriptor, index) => ({
        descriptor,
        before:
          index === 0
            ? prior?.lastKey
            : {
                timeTerminal: page.items[index - 1]!.timeTerminal,
                turnID: page.items[index - 1]!.turnID,
              },
      }))
      const capacity = yield* remainingCapacity(tx, context)
      const continuationPending = page.omitted
      const status =
        continuationPending && (capacity.model === 0 || capacity.tool === 0)
          ? "discovery_incomplete"
          : continuationPending
            ? "continuation_pending"
            : "complete"
      const payload = {
        status,
        queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
        items,
        omitted: page.omitted,
        capacity,
        continuationRequiresNewTurn: continuationPending && (capacity.model === 0 || capacity.tool === 0),
      }
      const search = signSearch(
        {
          schemaVersion: 1,
          queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
          source: source(context, capacity),
          ...(page.next ? { lastKey: page.next } : {}),
          ...(prior ? { parentOutputFingerprint: prior.outputFingerprint } : {}),
          completeSoFar: prior?.completeSoFar ?? true,
          gapCounts: prior?.gapCounts ?? { oversizedCandidateSkipped: 0, rangeItemsSkipped: 0 },
          gapFingerprint: prior?.gapFingerprint ?? canonicalFingerprint(toJsonValue([])),
          continuationPending,
        },
        payload,
      )
      return yield* searchResult(
        tx,
        context,
        { search },
        page.items,
        status === "complete" ? "bounded terminal-root directory complete" : "bounded terminal-root directory page",
      )
    }
    const prior = predecessor?.type === "verified" ? predecessor : undefined
    if (input.action !== "read_range" && (!prior || !candidateWasReturned(prior.payload, input.candidate))) {
      return yield* searchResult(
        tx,
        context,
        {
          status: "cursor_predecessor_conflict",
          reason: "candidate_not_bound_to_predecessor",
          queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
          noReadPerformed: true,
        },
        [],
        "candidate binding failed before any Interaction read",
      )
    }
    if (input.action === "materialize_interaction_locator") {
      if (!prior) return yield* Effect.die("Materialization lost its verified predecessor")
      const result = yield* TurnLearningContext.materializeInteractionLocator(tx, {
        descriptor: coreThinDescriptor(input.candidate.descriptor),
        maxRows: input.maxRows ?? 512,
        maxBytes: input.maxBytes ?? MAX_LAZY_BYTES,
      })
      const capacity = yield* remainingCapacity(tx, context)
      const overBudget = result.type === "interaction_locator_over_budget"
      const continuationPending = overBudget || prior.continuation.continuationPending
      const payload = {
        status:
          continuationPending && (capacity.model === 0 || capacity.tool === 0) ? "discovery_incomplete" : result.type,
        queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
        candidate: input.candidate,
        result,
        capacity,
        continuationRequiresNewTurn: continuationPending && (capacity.model === 0 || capacity.tool === 0),
      }
      const search = signSearch(
        {
          schemaVersion: 1,
          queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
          source: source(context, capacity),
          ...(overBudget
            ? input.candidate.before
              ? { lastKey: input.candidate.before }
              : {}
            : prior.continuation.lastKey
              ? { lastKey: prior.continuation.lastKey }
              : {}),
          parentOutputFingerprint: prior.continuation.outputFingerprint,
          completeSoFar: prior.continuation.completeSoFar,
          gapCounts: prior.continuation.gapCounts,
          gapFingerprint: prior.continuation.gapFingerprint,
          continuationPending,
        },
        payload,
      )
      return yield* searchResult(
        tx,
        context,
        { search },
        result.type === "available" ? [result.locator] : [input.candidate.descriptor],
        result.type === "available" ? "bounded exact Interaction locator" : "Interaction locator over budget",
      )
    }
    if (input.action === "read_range") {
      if (
        !prior &&
        (yield* hasSameTurnResetConflict(tx, {
          context,
          toolID: LEARNING_INTERACTION_READ_TOOL_ID,
          queryFingerprint: queryID,
        }))
      ) {
        return yield* searchResult(
          tx,
          context,
          {
            status: "cursor_reset_conflict",
            reason: "same_turn_gap_cannot_restart_range_zero",
            queryFingerprint: queryID,
            noReadPerformed: true,
          },
          [],
          "same-Turn range reset refused after a recorded coverage gap",
        )
      }
      if (prior && !locatorWasReturned(prior.payload, input.locator)) {
        return yield* searchResult(
          tx,
          context,
          {
            status: "cursor_predecessor_conflict",
            reason: "locator_not_bound_to_predecessor",
            queryFingerprint: queryID,
            noReadPerformed: true,
          },
          [],
          "exact Interaction locator was not bound to the supplied predecessor",
        )
      }
      const offset = input.offset ?? 0
      const priorRange = prior && record(prior.payload.result) && typeof prior.payload.result.offset === "number"
      const expectedOffset = priorRange ? prior.continuation.rangeNextOffset : undefined
      const offsetDecision = rangeOffsetDecision({
        hasPredecessor: Boolean(prior),
        priorWasRange: Boolean(priorRange),
        expectedOffset,
        offset,
        allowOffsetGap: input.allowOffsetGap === true,
      })
      if (offsetDecision.type === "conflict") {
        return yield* searchResult(
          tx,
          context,
          {
            status: "cursor_predecessor_conflict",
            reason: offsetDecision.reason,
            queryFingerprint: queryID,
            noReadPerformed: true,
          },
          [],
          "range offset is not the exact predecessor continuation",
        )
      }
      const skipped = offsetDecision.skipped
      const result = yield* TurnLearningContext.readExactRange(tx, {
        locator: coreLocator(input.locator),
        offset,
        maxItems: input.limit ?? 64,
        maxBytes: MAX_LAZY_BYTES,
      })
      const capacity = yield* remainingCapacity(tx, context)
      const rangePending = result.type === "available" && result.nextOffset !== undefined
      const continuationPending = rangePending || prior?.continuation.continuationPending === true
      const gapCounts = {
        oversizedCandidateSkipped: prior?.continuation.gapCounts.oversizedCandidateSkipped ?? 0,
        rangeItemsSkipped: (prior?.continuation.gapCounts.rangeItemsSkipped ?? 0) + skipped,
      }
      const gapFingerprint =
        skipped === 0
          ? (prior?.continuation.gapFingerprint ?? canonicalFingerprint(toJsonValue([])))
          : canonicalFingerprint(
              toJsonValue({
                prior: prior?.continuation.gapFingerprint,
                reason: "range_offset_skipped",
                expectedOffset,
                offset,
                skipped,
              }),
            )
      const payload = {
        status:
          continuationPending && (capacity.model === 0 || capacity.tool === 0)
            ? "discovery_incomplete"
            : skipped > 0 && !rangePending
              ? "non_atomic_search_incomplete"
              : result.type,
        queryFingerprint: queryID,
        result,
        capacity,
        continuationRequiresNewTurn: continuationPending && (capacity.model === 0 || capacity.tool === 0),
      }
      const search = signSearch(
        {
          schemaVersion: 1,
          queryFingerprint: queryID,
          source: source(context, capacity),
          ...(prior?.continuation.lastKey ? { lastKey: prior.continuation.lastKey } : {}),
          ...(prior ? { parentOutputFingerprint: prior.continuation.outputFingerprint } : {}),
          completeSoFar: (prior?.continuation.completeSoFar ?? true) && skipped === 0,
          gapCounts,
          gapFingerprint,
          continuationPending,
          ...(result.type === "available" && result.nextOffset !== undefined
            ? { rangeNextOffset: result.nextOffset }
            : {}),
        },
        payload,
      )
      return yield* searchResult(
        tx,
        context,
        { search },
        result.type === "available" ? [result.locator] : [input.locator],
        "bounded exact Interaction range",
      )
    }
    if (!prior) return yield* Effect.die("Skip lost its verified predecessor")
    const capacity = yield* remainingCapacity(tx, context)
    const gapFingerprint = canonicalFingerprint(
      toJsonValue({
        prior: prior.continuation.gapFingerprint,
        reason: "oversized_candidate_skipped",
        sessionID: input.candidate.descriptor.sessionID,
        turnID: input.candidate.descriptor.turnID,
      }),
    )
    const payload = {
      status: capacity.model === 0 || capacity.tool === 0 ? "discovery_incomplete" : "candidate_skipped",
      queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
      skipped: input.candidate.descriptor,
      gap: "oversized_candidate_skipped",
      capacity,
      continuationRequiresNewTurn: capacity.model === 0 || capacity.tool === 0,
    }
    const search = signSearch(
      {
        schemaVersion: 1,
        queryFingerprint: TERMINAL_ROOT_QUERY_FINGERPRINT,
        source: source(context, capacity),
        lastKey: {
          timeTerminal: input.candidate.descriptor.timeTerminal,
          turnID: input.candidate.descriptor.turnID,
        },
        parentOutputFingerprint: prior.continuation.outputFingerprint,
        completeSoFar: false,
        gapCounts: {
          oversizedCandidateSkipped: prior.continuation.gapCounts.oversizedCandidateSkipped + 1,
          rangeItemsSkipped: prior.continuation.gapCounts.rangeItemsSkipped,
        },
        gapFingerprint,
        continuationPending: true,
      },
      payload,
    )
    return yield* searchResult(
      tx,
      context,
      { search },
      [input.candidate.descriptor],
      "oversized Interaction candidate explicitly skipped with a permanent coverage gap",
    )
  })
}

function searchResult(
  tx: Transaction,
  context: Tool.Context,
  value: Readonly<Record<string, unknown>>,
  lineageValue: unknown,
  relation: string,
) {
  const search = record(value.search) ? value.search : undefined
  const payload = search && record(search.payload) ? search.payload : undefined
  const result = payload && record(payload.result) ? payload.result : undefined
  const work = result && record(result.work) ? result.work : undefined
  const databaseRowsUpperBound =
    typeof work?.databaseRowsUpperBound === "number" ? work.databaseRowsUpperBound : undefined
  const visitedRows = typeof work?.visitedRows === "number" ? work.visitedRows : result?.visitedRows
  const decodedBytes = typeof work?.decodedBytes === "number" ? work.decodedBytes : result?.decodedBytes
  const continuation =
    search && Schema.is(LearningInspectionCursor.Continuation)(search.continuation) ? search.continuation : undefined
  const capacity = payload && record(payload.capacity) ? payload.capacity : undefined
  const read = {
    capabilityID: LEARNING_INTERACTION_READ_TOOL_ID,
    title: "Interaction discovery",
    metadata: {
      action: "inspection_search",
      status:
        record(value.search) && record(value.search.payload) && typeof value.search.payload.status === "string"
          ? value.search.payload.status
          : typeof value.status === "string"
            ? value.status
            : "unavailable",
    },
    value,
    lineageValue,
    itemCount: Array.isArray(lineageValue) ? lineageValue.length : 0,
  } satisfies Parameters<typeof learningContextReadResult>[0]
  return learningInspectionReadResult(
    tx,
    read,
    context,
    inspectionOwner("learning_interaction", relation, [
      { label: "Discovery scope", value: "LearnerHome terminal root Turns; current Session included" },
      { label: "History semantics", value: "thin discovery carries no Message or Part body" },
      ...(typeof payload?.status === "string"
        ? [{ label: "Search status", value: payload.status }]
        : typeof value.status === "string"
          ? [{ label: "Search status", value: value.status }]
          : []),
      ...(continuation
        ? [
            {
              label: "Search coverage",
              value: `complete so far ${continuation.completeSoFar ? "yes" : "no"}; ${continuation.gapCounts.oversizedCandidateSkipped} oversized candidate(s) skipped; ${continuation.gapCounts.rangeItemsSkipped} range item(s) skipped; continuation ${continuation.continuationPending ? "pending" : "complete"}`,
            },
            {
              label: "Search predecessor",
              value: `Part ${continuation.source.partID}; output ${continuation.outputFingerprint}${continuation.parentOutputFingerprint ? `; parent ${continuation.parentOutputFingerprint}` : "; page-one root"}`,
            },
          ]
        : []),
      ...(capacity &&
      typeof capacity.model === "number" &&
      typeof capacity.tool === "number" &&
      record(capacity.observed) &&
      record(capacity.limit)
        ? [
            {
              label: "Search capacity",
              value: `remaining model ${capacity.model}, tool ${capacity.tool}; observed ${String(capacity.observed.model)}/${String(capacity.observed.tool)}; limits ${String(capacity.limit.model)}/${String(capacity.limit.tool)}`,
            },
          ]
        : []),
      ...(typeof visitedRows === "number" && typeof decodedBytes === "number"
        ? [
            {
              label: "Database work",
              value: `${visitedRows} visited row(s); ${decodedBytes} decoded byte(s)`,
            },
          ]
        : []),
      ...(typeof databaseRowsUpperBound === "number" && typeof decodedBytes === "number"
        ? [
            {
              label: "Database work bound",
              value: `at most ${databaseRowsUpperBound} exact-Turn row visits; ${decodedBytes} decoded byte(s)`,
            },
          ]
        : []),
    ]),
  )
}

function candidateWasReturned(payload: Record<string, unknown>, candidate: LearningInspectionCursor.Candidate) {
  const candidates = Array.isArray(payload.items) ? payload.items : record(payload.candidate) ? [payload.candidate] : []
  return candidates.some(
    (item) => record(item) && canonicalFingerprint(toJsonValue(item)) === canonicalFingerprint(toJsonValue(candidate)),
  )
}

function locatorWasReturned(payload: Record<string, unknown>, locator: LearningInspectionCursor.Locator) {
  const candidate =
    record(payload.result) && record(payload.result.locator)
      ? payload.result.locator
      : record(payload.locator)
        ? payload.locator
        : undefined
  return (
    candidate !== undefined &&
    canonicalFingerprint(toJsonValue(candidate)) === canonicalFingerprint(toJsonValue(locator))
  )
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function coreThinDescriptor(value: LearningInspectionCursor.ThinDescriptor): TurnLearningContext.ThinDescriptor {
  return {
    ...value,
    sessionID: SessionSchema.ID.make(value.sessionID),
    turnID: Turn.ID.make(value.turnID),
    terminalReason: value.terminalReason as Turn.TerminalReason | undefined,
    sessionParentID: value.sessionParentID ? SessionSchema.ID.make(value.sessionParentID) : undefined,
  }
}

function coreLocator(value: LearningInspectionCursor.Locator): TurnLearningContext.Locator {
  return {
    ...value,
    sessionID: SessionSchema.ID.make(value.sessionID),
    turnID: Turn.ID.make(value.turnID),
    inputID: value.inputID ? Turn.InputID.make(value.inputID) : undefined,
    terminalReason: value.terminalReason as Turn.TerminalReason | undefined,
    sessionParentID: value.sessionParentID ? SessionSchema.ID.make(value.sessionParentID) : undefined,
  }
}

function requireInteraction(context: Tool.Context) {
  if (
    !context.interaction ||
    context.interaction.assistantMessageID !== context.messageID ||
    context.interaction.candidate.callID !== context.callID
  ) {
    throw new Error("Learning-context Interaction reads require one exact registered model operation")
  }
  return context.interaction
}
