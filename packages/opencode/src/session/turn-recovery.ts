import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { MessageTable, PartTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnModelOperationTable, TurnToolCandidateTable, TurnToolInvocationTable } from "@opencode-ai/core/turn/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnEvent } from "@opencode-ai/schema/turn-event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { RepresentationCommandRuntime } from "@/learning-command/representation-runtime"
import { and, asc, eq } from "drizzle-orm"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { SessionTurnEvents } from "./turn-events"

export class Service extends Context.Service<Service, true>()("@opencode/SessionTurnRecovery") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Constructing both Gate 8 runtimes completes their admitted-invocation and
    // Tool Part recovery before any running Turn is terminalized below.
    yield* LearningCommandRuntime.Service
    yield* RepresentationCommandRuntime.Service
    const events = yield* EventV2Bridge.Service
    yield* recover(events, Date.now()).pipe(Effect.orDie)
    return true as const
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [EventV2Bridge.node, LearningCommandRuntime.node, RepresentationCommandRuntime.node],
})

export function recover(events: EventV2.Interface, time: number) {
  return events
    .transaction<readonly Turn.Info[], EventV2.Definition>((tx) =>
      Effect.gen(function* () {
        const frontier = yield* LearningFrontier.read(tx)
        const recoveryTime = Math.max(time, frontier.time)
        const prepared: EventV2.PreparedEvent<EventV2.Definition>[] = []
        const models = yield* tx
          .select()
          .from(TurnModelOperationTable)
          .where(eq(TurnModelOperationTable.state, "running"))
          .orderBy(asc(TurnModelOperationTable.time_admitted), asc(TurnModelOperationTable.assistant_message_id))
          .all()
          .pipe(Effect.orDie)

        yield* Effect.forEach(
          models,
          (model) =>
            Effect.gen(function* () {
              const row = yield* tx
                .select()
                .from(MessageTable)
                .where(
                  and(eq(MessageTable.id, model.assistant_message_id), eq(MessageTable.session_id, model.session_id)),
                )
                .get()
                .pipe(Effect.orDie)
              if (!row)
                return yield* Effect.die(`Running model has no durable Assistant: ${model.assistant_message_id}`)
              const assistant = decodeAssistant({ ...row.data, id: row.id, sessionID: row.session_id })
              const candidates = yield* tx
                .select()
                .from(TurnToolCandidateTable)
                .where(eq(TurnToolCandidateTable.assistant_message_id, model.assistant_message_id))
                .orderBy(asc(TurnToolCandidateTable.emission_ordinal))
                .all()
                .pipe(Effect.orDie)

              if (!model.candidates_sealed) {
                const timeSealed = Math.max(
                  recoveryTime,
                  model.time_admitted,
                  ...candidates.map((candidate) => candidate.time_registered),
                )
                yield* tx
                  .update(TurnModelOperationTable)
                  .set({
                    candidates_sealed: true,
                    candidate_count: candidates.length,
                    time_candidates_sealed: timeSealed,
                  })
                  .where(
                    and(
                      eq(TurnModelOperationTable.assistant_message_id, model.assistant_message_id),
                      eq(TurnModelOperationTable.state, "running"),
                      eq(TurnModelOperationTable.candidates_sealed, false),
                    ),
                  )
                  .run()
                  .pipe(Effect.orDie)
                prepared.push({
                  definition: TurnEvent.CandidateSetSealed,
                  data: {
                    sessionID: model.session_id,
                    turnID: model.turn_id,
                    assistantMessageID: model.assistant_message_id,
                    count: candidates.length,
                    timestamp: DateTime.makeUnsafe(timeSealed),
                  },
                })
              }

              const completed = assistant.time.completed !== undefined
              const state = completed
                ? assistant.error?.name === "MessageAbortedError"
                  ? "interrupted"
                  : assistant.error
                    ? "failed"
                    : "completed"
                : "interrupted"
              const settled = yield* TurnLifecycle.settleModel(tx, {
                turnID: model.turn_id,
                assistantMessageID: model.assistant_message_id,
                state,
                time: Math.max(recoveryTime, assistant.time.completed ?? assistant.time.created),
              })
              if (!completed) {
                const timeCompleted = DateTime.toEpochMillis(settled.timeSettled ?? settled.timeAdmitted)
                const recovered = decodeAssistant({
                  ...assistant,
                  time: { ...assistant.time, completed: timeCompleted },
                  error: new SessionV1.AbortedError({ message: "Interrupted by startup recovery" }).toObject(),
                })
                prepared.push({
                  definition: SessionV1.Event.MessageUpdated,
                  data: { sessionID: recovered.sessionID, info: recovered },
                })
              }
              prepared.push({
                definition: TurnEvent.ModelSettled,
                data: {
                  sessionID: settled.sessionID,
                  turnID: settled.turnID,
                  assistantMessageID: settled.assistantMessageID,
                  state: settled.state,
                  timestamp: settled.timeSettled ?? settled.timeAdmitted,
                },
              })
            }),
          { discard: true },
        )

        const invocations = yield* tx
          .select()
          .from(TurnToolInvocationTable)
          .where(eq(TurnToolInvocationTable.state, "running"))
          .orderBy(asc(TurnToolInvocationTable.time_admitted), asc(TurnToolInvocationTable.part_id))
          .all()
          .pipe(Effect.orDie)
        yield* Effect.forEach(
          invocations,
          (invocation) =>
            Effect.gen(function* () {
              const row = yield* tx
                .select()
                .from(PartTable)
                .where(and(eq(PartTable.id, invocation.part_id), eq(PartTable.session_id, invocation.session_id)))
                .get()
                .pipe(Effect.orDie)
              if (!row) return yield* Effect.die(`Running Tool invocation has no durable Part: ${invocation.part_id}`)
              const part = toolPart(row)
              const state =
                part.state.status === "completed"
                  ? "completed"
                  : part.state.status === "error"
                    ? part.state.metadata?.interrupted === true
                      ? "interrupted"
                      : "failed"
                    : "interrupted"
              const settled = yield* TurnLifecycle.settleTool(tx, {
                turnID: invocation.turn_id,
                partID: invocation.part_id,
                state,
                time: Math.max(
                  recoveryTime,
                  "time" in part.state
                    ? "end" in part.state.time
                      ? part.state.time.end
                      : part.state.time.start
                    : recoveryTime,
                ),
              })
              if (part.state.status === "pending" || part.state.status === "running") {
                prepared.push(
                  partInterrupted(part, DateTime.toEpochMillis(settled.timeSettled ?? settled.timeAdmitted)),
                )
              }
              prepared.push({
                definition: TurnEvent.ToolSettled,
                data: {
                  sessionID: settled.sessionID,
                  turnID: settled.turnID,
                  partID: settled.partID,
                  state: settled.state,
                  timestamp: settled.timeSettled ?? settled.timeAdmitted,
                },
              })
            }),
          { discard: true },
        )

        const pending = yield* tx
          .select()
          .from(TurnToolCandidateTable)
          .where(eq(TurnToolCandidateTable.state, "pending_admission"))
          .orderBy(
            asc(TurnToolCandidateTable.time_registered),
            asc(TurnToolCandidateTable.assistant_message_id),
            asc(TurnToolCandidateTable.emission_ordinal),
          )
          .all()
          .pipe(Effect.orDie)
        const pendingParts = yield* Effect.forEach(pending, (candidate) =>
          Effect.gen(function* () {
            const row = yield* tx
              .select()
              .from(PartTable)
              .where(and(eq(PartTable.id, candidate.part_id), eq(PartTable.session_id, candidate.session_id)))
              .get()
              .pipe(Effect.orDie)
            if (!row) return yield* Effect.die(`Pending Tool candidate has no durable Part: ${candidate.part_id}`)
            return toolPart(row)
          }),
        )

        const recovered = yield* TurnLifecycle.recoverRunning(tx, recoveryTime)
        const dispositions = yield* Effect.forEach(pending, (candidate) =>
          TurnLifecycle.candidate(tx, { turnID: candidate.turn_id, partID: candidate.part_id }),
        )
        prepared.push(
          ...dispositions.map((candidate, index) =>
            candidateInterrupted(
              pendingParts[index]!,
              candidate.turnID,
              DateTime.toEpochMillis(candidate.timeTerminal ?? candidate.timeRegistered),
            ),
          ),
          ...dispositions.map((candidate) => ({
            definition: TurnEvent.CandidateDisposition,
            data: {
              sessionID: candidate.sessionID,
              turnID: candidate.turnID,
              candidate,
              timestamp: candidate.timeTerminal ?? candidate.timeRegistered,
            },
          })),
          ...recovered.map(SessionTurnEvents.terminal),
        )
        return prepared.length === 0 ? { result: recovered } : { result: recovered, events: prepared }
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((committed) => committed.result))
}

const decodeAssistant = Schema.decodeUnknownSync(SessionV1.Assistant)
const decodeToolPart = Schema.decodeUnknownSync(SessionV1.ToolPart)

function toolPart(row: typeof PartTable.$inferSelect): SessionV1.ToolPart {
  return decodeToolPart({
    ...row.data,
    id: row.id,
    messageID: row.message_id,
    sessionID: row.session_id,
  }) as unknown as SessionV1.ToolPart
}

function partInterrupted(part: SessionV1.ToolPart, time: number) {
  const metadata = "metadata" in part.state ? part.state.metadata : undefined
  const start = "time" in part.state ? part.state.time.start : time
  return {
    definition: SessionV1.Event.PartUpdated,
    data: {
      sessionID: part.sessionID,
      part: {
        ...part,
        state: {
          status: "error" as const,
          input: part.state.input,
          error: "Tool execution aborted",
          metadata: { ...metadata, interrupted: true },
          time: { start, end: time },
        },
      },
      time,
    },
  } satisfies EventV2.PreparedEvent<typeof SessionV1.Event.PartUpdated>
}

function candidateInterrupted(part: SessionV1.ToolPart, turnID: Turn.ID, time: number) {
  const metadata = "metadata" in part.state ? part.state.metadata : undefined
  const start = "time" in part.state ? part.state.time.start : time
  return {
    definition: SessionV1.Event.PartUpdated,
    data: {
      sessionID: part.sessionID,
      part: {
        ...part,
        metadata: { ...part.metadata, turnCandidateDisposition: "not_started_interrupted" },
        state: {
          status: "error" as const,
          input: part.state.input,
          error: "Tool not started: Turn interrupted during startup recovery",
          metadata: { ...metadata, turnID, disposition: "not_started_interrupted", notStarted: true },
          time: { start, end: time },
        },
      },
      time,
    },
  } satisfies EventV2.PreparedEvent<typeof SessionV1.Event.PartUpdated>
}

export * as SessionTurnRecovery from "./turn-recovery"
