import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, PartTable } from "@opencode-ai/core/session/sql"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import {
  TurnModelOperationTable,
  TurnTable,
  TurnToolCandidateTable,
  TurnToolInvocationTable,
} from "@opencode-ai/core/turn/sql"
import { and, asc, eq, lte } from "drizzle-orm"
import { Effect } from "effect"
import { normalizeLearnerStateJudgment, type CompactLearnerStateCorrectionInput } from "@/learning-command/input"
import type { LearningCommandRuntime } from "@/learning-command/runtime"
import { LEARNER_STATE_JUDGMENT_READ_TOOL_ID } from "./learner-state-judgment-read"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export function resolveCompactLearnerStateCorrection(
  database: Database.Interface,
  input: CompactLearnerStateCorrectionInput,
  registration: LearningCommandRuntime.Registration,
) {
  return database.db.transaction((tx) => resolve(tx, input, registration))
}

function resolve(
  tx: Transaction,
  input: CompactLearnerStateCorrectionInput,
  registration: LearningCommandRuntime.Registration,
) {
  return Effect.gen(function* () {
    const currentTurn = yield* tx
      .select({ turn: TurnTable })
      .from(TurnTable)
      .where(and(eq(TurnTable.id, registration.turnID), eq(TurnTable.session_id, registration.sessionID)))
      .get()
      .pipe(Effect.orDie)
    if (
      !currentTurn ||
      currentTurn.turn.state !== "running" ||
      currentTurn.turn.current_input_id !== registration.inputID
    ) {
      return yield* fail("compact learner-state correction has no exact current running Turn/Input")
    }
    const predecessors = yield* tx
      .select({
        part: PartTable,
        candidate: TurnToolCandidateTable,
        invocation: TurnToolInvocationTable,
        operation: TurnModelOperationTable,
        turn: TurnTable,
      })
      .from(TurnToolCandidateTable)
      .innerJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, TurnToolCandidateTable.part_id))
      .innerJoin(PartTable, eq(PartTable.id, TurnToolCandidateTable.part_id))
      .innerJoin(
        TurnModelOperationTable,
        eq(TurnModelOperationTable.assistant_message_id, TurnToolCandidateTable.assistant_message_id),
      )
      .innerJoin(TurnTable, eq(TurnTable.id, TurnToolCandidateTable.turn_id))
      .where(
        and(
          eq(TurnToolCandidateTable.session_id, registration.sessionID),
          eq(TurnToolCandidateTable.call_id, input.currentReadCallID),
          eq(TurnToolCandidateTable.tool, LEARNER_STATE_JUDGMENT_READ_TOOL_ID),
          eq(TurnToolCandidateTable.state, "admitted"),
          eq(TurnToolInvocationTable.state, "completed"),
          lte(TurnTable.time_terminal, currentTurn.turn.time_admitted),
        ),
      )
      .all()
      .pipe(Effect.orDie)
    if (predecessors.length !== 1) {
      return yield* fail(
        predecessors.length === 0
          ? "compact learner-state correction current-read source is unavailable"
          : "compact learner-state correction current-read call is ambiguous",
      )
    }
    const predecessor = predecessors[0]!
    if (
      predecessor.turn.state !== "completed" ||
      predecessor.turn.time_terminal === null ||
      predecessor.operation.session_id !== registration.sessionID ||
      predecessor.operation.turn_id !== predecessor.candidate.turn_id ||
      predecessor.operation.assistant_message_id !== predecessor.candidate.assistant_message_id ||
      predecessor.candidate.session_id !== predecessor.invocation.session_id ||
      predecessor.candidate.turn_id !== predecessor.invocation.turn_id ||
      predecessor.candidate.assistant_message_id !== predecessor.invocation.assistant_message_id ||
      predecessor.part.session_id !== registration.sessionID ||
      predecessor.part.message_id !== predecessor.operation.assistant_message_id
    ) {
      return yield* fail("compact learner-state correction current-read identity is inconsistent")
    }
    const part = predecessor.part.data as Record<string, unknown>
    const state = record(part.state) ? part.state : undefined
    const readInput = record(state?.input) ? state.input : undefined
    if (
      part.type !== "tool" ||
      part.tool !== LEARNER_STATE_JUDGMENT_READ_TOOL_ID ||
      part.callID !== input.currentReadCallID ||
      state?.status !== "completed" ||
      readInput?.action !== "current" ||
      typeof state.output !== "string"
    ) {
      return yield* fail("compact learner-state correction predecessor is not one completed current read")
    }
    const output = parse(state.output)
    const ownerResult = record(output) && record(output.ownerResult) ? output.ownerResult : output
    const correctionHandle = record(ownerResult) && record(ownerResult.correctionHandle)
      ? ownerResult.correctionHandle
      : undefined
    const page = record(ownerResult) && record(ownerResult.page) ? ownerResult.page : undefined
    const items = page && Array.isArray(page.items) ? page.items : []
    const item = items.length === 1 && record(items[0]) ? items[0] : undefined
    const judgmentRef = item && record(item.judgmentRevisionRef) ? item.judgmentRevisionRef : undefined
    const currentHead = item && record(item.currentHead) ? item.currentHead : undefined
    const revision = item && record(item.revision) ? item.revision : undefined
    const snapshot = revision && record(revision.snapshot) ? revision.snapshot : undefined
    const subject = snapshot && record(snapshot.subject) ? snapshot.subject : undefined
    const scope = subject && record(subject.scope) ? subject.scope : undefined
    const anchors = scope && Array.isArray(scope.anchors) ? scope.anchors : []
    const exactBasis = snapshot && Array.isArray(snapshot.exactBasis) ? snapshot.exactBasis : []
    if (
      typeof readInput.judgmentID !== "string" ||
      correctionHandle?.currentReadCallID !== input.currentReadCallID ||
      judgmentRef?.judgmentID !== readInput.judgmentID ||
      typeof currentHead?.revisionID !== "string" ||
      !Number.isSafeInteger(currentHead.version) ||
      typeof currentHead.ownerCutFingerprint !== "string" ||
      currentHead.ownerCutFingerprint.length !== 64 ||
      revision?.id !== currentHead.revisionID ||
      typeof subject?.label !== "string" ||
      (scope?.type !== "learner_home" && scope?.type !== "anchored") ||
      (scope.type === "anchored" && anchors.some((anchor) => !record(anchor) || !record(anchor.ref))) ||
      exactBasis.some((basis) => !record(basis) || !record(basis.ref))
    ) {
      return yield* fail("compact learner-state correction current-read output is malformed")
    }
    const sourceText = yield* learnerText(tx, registration.sessionID, registration.parentUserMessageID)
    const start = sourceText.indexOf(input.sourceExcerpt)
    if (start < 0 || sourceText.indexOf(input.sourceExcerpt, start + input.sourceExcerpt.length) >= 0) {
      return yield* fail("compact learner-state correction excerpt is absent or ambiguous in current learner input")
    }
    const startByte = utf8Bytes(sourceText.slice(0, start))
    const full = {
      operation: "revise",
      judgmentID: readInput.judgmentID,
      expectedHead: {
        revisionID: currentHead.revisionID,
        version: currentHead.version as number,
        ownerCutFingerprint: currentHead.ownerCutFingerprint,
      },
      cause: {
        type: "learner_correction",
        excerpt: {
          text: input.sourceExcerpt,
          startByte,
          endByte: startByte + utf8Bytes(input.sourceExcerpt),
        },
      },
      snapshot: {
        subject: {
          label: subject.label,
          scope:
            scope.type === "learner_home"
              ? { type: "learner_home" }
              : {
                  type: "anchored",
                  anchors: anchors.map((anchor) => (anchor as { ref: Record<string, unknown> }).ref) as never,
                },
        },
        judgmentBody: input.judgmentBody,
        exactBasisRefs: exactBasis.map((basis) => (basis as { ref: Record<string, unknown> }).ref) as never,
        uncertaintyAndLimits: input.uncertaintyAndLimits,
        basisScope: snapshot!.basisScope === "whole_judgment" ? "whole_judgment" : undefined,
      },
      rationale: input.rationale,
    }
    return normalizeLearnerStateJudgment(full)
  })
}

function learnerText(
  tx: Transaction,
  sessionID: LearningCommandRuntime.Registration["sessionID"],
  messageID: LearningCommandRuntime.Registration["parentUserMessageID"],
) {
  return Effect.gen(function* () {
    const message = yield* tx
      .select({ data: MessageTable.data })
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), eq(MessageTable.id, messageID)))
      .get()
      .pipe(Effect.orDie)
    if (!message || message.data.role !== "user") {
      return yield* fail("compact learner-state correction source is not exact learner input")
    }
    const parts = yield* tx
      .select({ data: PartTable.data })
      .from(PartTable)
      .where(and(eq(PartTable.session_id, sessionID), eq(PartTable.message_id, messageID)))
      .orderBy(asc(PartTable.time_created), asc(PartTable.id))
      .all()
      .pipe(Effect.orDie)
    return parts
      .flatMap((part) => {
        if (part.data.type !== "text") return []
        const value = part.data as Omit<SessionV1.TextPart, "id" | "sessionID" | "messageID">
        return value.synthetic === true ? [] : [value.text]
      })
      .join("\n")
  })
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function parse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fail(message: string) {
  return Effect.die(new Error(message))
}
