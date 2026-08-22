import { LearnerAdmission, Occurrence } from "@opencode-ai/core/learning-command"
import { admitModelWithLearningContext } from "@test/fixture/model-admission"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnEvent } from "@opencode-ai/schema/turn-event"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionTurnEvents } from "@/session/turn-events"
import { MessageID, PartID, SessionID } from "@/session/schema"

const model: SessionV1.User["model"] = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

type MaterializeTestSessionInput = {
  id?: SessionID
  parentID?: SessionID
  title?: string
  agent?: string
  model?: typeof model
  metadata?: typeof Session.Metadata.Type
  permission?: Session.Info["permission"]
  workspaceID?: Session.Info["workspaceID"]
  text?: string
  settle?: boolean
  limits?: Turn.Limits
  fork?: { sourceSessionID: SessionID; cutoffMessageID?: MessageID }
  time?: number
}

export const materializeTestSession = Effect.fn("Test.materializeSession")(function* (
  input?: MaterializeTestSessionInput,
) {
  if (input?.parentID) return yield* materializeTestChildSession({ ...input, parentID: input.parentID })
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  const sessionID = input?.id ?? SessionID.create()
  const turnID = Turn.ID.create()
  const inputID = Turn.InputID.create()
  const messageID = MessageID.ascending()
  const partID = PartID.ascending()
  const time = input?.time ?? Date.now()
  const selectedModel = input?.model ?? model
  const user: SessionV1.User = {
    id: messageID,
    role: "user",
    sessionID,
    agent: input?.agent ?? "repa",
    model: selectedModel,
    time: { created: time },
  }
  const part: SessionV1.TextPart = {
    id: partID,
    messageID,
    sessionID,
    type: "text",
    text: input?.text ?? "test session admission",
  }
  let admitted: TurnLifecycle.Admitted | undefined
  let terminal: Turn.Info | undefined
  const committed = yield* events.transaction((tx) =>
    Effect.gen(function* () {
      const sourceEventSequence = input?.fork
        ? yield* tx
            .select({ sequence: EventSequenceTable.seq })
            .from(EventSequenceTable)
            .where(eq(EventSequenceTable.aggregate_id, input.fork.sourceSessionID))
            .get()
            .pipe(
              Effect.flatMap((row) =>
                row
                  ? Effect.succeed(row.sequence)
                  : Effect.die(`Missing source frontier: ${input.fork!.sourceSessionID}`),
              ),
            )
        : undefined
      const plan = yield* sessions.prepareRootStart(tx, {
        targetSessionID: sessionID,
        turnID,
        session: {
          title: input?.title,
          parentID: input?.parentID,
          agent: user.agent,
          model: {
            id: selectedModel.modelID,
            providerID: selectedModel.providerID,
            variant: selectedModel.variant ?? "default",
          },
          metadata: input?.metadata,
          permission: input?.permission,
          workspaceID: input?.workspaceID,
        },
        ...(input?.fork
          ? {
              fork: {
                sourceSessionID: input.fork.sourceSessionID,
                sourceEventSequence: sourceEventSequence!,
                cutoffMessageID: input.fork.cutoffMessageID,
              },
            }
          : {}),
      })
      const commit = () =>
        Effect.gen(function* () {
          const presentationTime = user.time.created
          const occurrence = yield* Occurrence.admit(tx, {
            admission: LearnerAdmission.interactive({ instant: presentationTime }),
            sessionID,
            messageID,
            timeAdmitted: presentationTime,
          })
          admitted = yield* TurnLifecycle.admit(tx, {
            kind: "learner",
            turnID,
            sessionID,
            inputID,
            messageID,
            occurrenceID: occurrence.id,
            limits: input?.limits ?? { model: 8, tool: 16 },
            envelope: { source: "test_fixture" },
            policyBasis: { source: "test_fixture" },
            timeAdmitted: presentationTime,
          })
          if (input?.settle !== false) {
            terminal = yield* TurnLifecycle.settle(tx, {
              turnID,
              outcome: "interrupted",
              reason: "learner_interrupt",
              time: presentationTime,
            })
          }
        }).pipe(Effect.orDie)
      return {
        result: plan.session,
        events: [
          ...plan.events,
          {
            definition: SessionV1.Event.MessageUpdated,
            data: { sessionID, info: user },
          },
          {
            definition: SessionV1.Event.PartUpdated,
            data: { sessionID, part, time },
            options: { commit },
          },
          SessionTurnEvents.started(() => {
            if (!admitted) throw new Error(`Test Turn ${turnID} admission did not precede its event`)
            return admitted
          }),
          ...(input?.settle === false
            ? []
            : [
                {
                  definition: TurnEvent.Terminal,
                  data: {
                    get sessionID() {
                      if (!terminal) throw new Error(`Test Turn ${turnID} did not settle before its terminal event`)
                      return terminal.sessionID
                    },
                    get turnID() {
                      if (!terminal) throw new Error(`Test Turn ${turnID} did not settle before its terminal event`)
                      return terminal.id
                    },
                    get timestamp() {
                      if (!terminal?.terminal) throw new Error(`Test Turn ${turnID} has no terminal state`)
                      return terminal.terminal.time
                    },
                    get terminal() {
                      if (!terminal?.terminal) throw new Error(`Test Turn ${turnID} has no terminal state`)
                      return terminal.terminal
                    },
                  },
                },
              ]),
        ],
      }
    }),
  )
  if (!admitted) return yield* Effect.die(`Test Turn ${turnID} did not admit`)
  return { info: committed.result, user, part, turn: terminal ?? admitted.turn }
})

const materializeTestChildSession = Effect.fn("Test.materializeChildSession")(function* (
  input: MaterializeTestSessionInput & { parentID: SessionID },
) {
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  const parent = yield* sessions.get(input.parentID).pipe(Effect.orDie)
  const selectedModel =
    input.model ??
    (parent.model
      ? {
          providerID: parent.model.providerID,
          modelID: parent.model.id,
          ...(parent.model.variant === "default" ? {} : { variant: parent.model.variant }),
        }
      : model)
  const time = input.time ?? Date.now()
  const agent = input.agent ?? parent.agent ?? "repa"
  const parentTurnID = Turn.ID.create()
  const parentInputID = Turn.InputID.create()
  const parentMessageID = MessageID.ascending()
  const parentPartID = PartID.ascending()
  const parentAssistantMessageID = MessageID.ascending()
  const parentTaskPartID = PartID.ascending()
  const callID = `test_child_${parentTaskPartID}`
  const parentUser: SessionV1.User = {
    id: parentMessageID,
    role: "user",
    sessionID: parent.id,
    agent,
    model: selectedModel,
    time: { created: time },
  }
  const parentPart: SessionV1.TextPart = {
    id: parentPartID,
    messageID: parentMessageID,
    sessionID: parent.id,
    type: "text",
    text: "delegate test child session",
  }
  const parentAssistant: SessionV1.Assistant = {
    id: parentAssistantMessageID,
    role: "assistant",
    parentID: parentMessageID,
    sessionID: parent.id,
    mode: "repa",
    agent,
    path: { cwd: parent.directory, root: parent.directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: selectedModel.modelID,
    providerID: selectedModel.providerID,
    variant: selectedModel.variant,
    time: { created: time + 1 },
  }
  const taskPart: SessionV1.ToolPart = {
    id: parentTaskPartID,
    messageID: parentAssistantMessageID,
    sessionID: parent.id,
    type: "tool",
    tool: "task",
    callID,
    state: {
      status: "pending",
      input: { description: "materialize test child" },
      raw: '{"description":"materialize test child"}',
    },
  }
  let parentAdmission: TurnLifecycle.Admitted | undefined
  let parentOperation: Turn.ModelOperation | undefined
  yield* events.transaction<undefined, EventV2.Definition>((tx) =>
    Effect.gen(function* () {
      const admitParent = () =>
        Effect.gen(function* () {
          const presentationTime = parentUser.time.created
          const occurrence = yield* Occurrence.admit(tx, {
            admission: LearnerAdmission.interactive({ instant: presentationTime }),
            sessionID: parent.id,
            messageID: parentMessageID,
            timeAdmitted: presentationTime,
          })
          parentAdmission = yield* TurnLifecycle.admit(tx, {
            kind: "learner",
            turnID: parentTurnID,
            sessionID: parent.id,
            inputID: parentInputID,
            messageID: parentMessageID,
            occurrenceID: occurrence.id,
            limits: { model: 1, tool: 1 },
            envelope: { source: "test_fixture_child_parent" },
            policyBasis: { source: "test_fixture" },
            timeAdmitted: presentationTime,
          })
        }).pipe(Effect.orDie)
      const admitModel = () =>
        admitModelWithLearningContext(tx, {
          turnID: parentTurnID,
          sessionID: parent.id,
          assistantMessageID: parentAssistantMessageID,
          requestEnvelope: { source: "test_fixture_child_parent" },
          contextFingerprint: TurnLifecycle.envelopeFingerprint({ source: "test_fixture_child_parent_context" }),
          snapshotFrontier: { sequence: 0, time: 0 },
          timeAdmitted: parentAssistant.time.created,
        }).pipe(
          Effect.flatMap((result) => {
            if (result.type !== "admitted") return Effect.die("Test parent model operation exhausted unexpectedly")
            return Effect.sync(() => {
              parentOperation = result.operation
            })
          }),
          Effect.orDie,
        )
      const sealTask = () =>
        Effect.gen(function* () {
          const modelTime = parentAssistant.time.created
          yield* TurnLifecycle.sealCandidateSet(tx, {
            turnID: parentTurnID,
            sessionID: parent.id,
            assistantMessageID: parentAssistantMessageID,
            candidates: [
              {
                partID: parentTaskPartID,
                callID,
                tool: "task",
                envelope: { description: "materialize test child" },
              },
            ],
            timeSealed: modelTime,
          })
          yield* TurnLifecycle.settleModel(tx, {
            turnID: parentTurnID,
            assistantMessageID: parentAssistantMessageID,
            state: "completed",
            time: modelTime,
          })
        }).pipe(Effect.orDie)
      return {
        result: undefined,
        events: [
          { definition: SessionV1.Event.MessageUpdated, data: { sessionID: parent.id, info: parentUser } },
          {
            definition: SessionV1.Event.PartUpdated,
            data: { sessionID: parent.id, part: parentPart, time },
            options: { commit: admitParent },
          },
          SessionTurnEvents.started(() => {
            if (!parentAdmission) throw new Error(`Test parent Turn ${parentTurnID} did not admit`)
            return parentAdmission
          }),
          {
            definition: SessionV1.Event.MessageUpdated,
            data: { sessionID: parent.id, info: parentAssistant },
            options: { commit: admitModel },
          },
          SessionTurnEvents.modelAdmitted(() => {
            if (!parentOperation) throw new Error(`Test parent model operation ${parentTurnID} did not admit`)
            return parentOperation
          }),
          { definition: SessionV1.Event.PartUpdated, data: { sessionID: parent.id, part: taskPart, time: time + 2 } },
          {
            definition: TurnEvent.CandidateSetSealed,
            data: {
              sessionID: parent.id,
              turnID: parentTurnID,
              assistantMessageID: parentAssistantMessageID,
              count: 1,
              get timestamp() {
                if (!parentOperation) throw new Error(`Test parent model operation ${parentTurnID} did not admit`)
                return parentOperation.timeAdmitted
              },
            },
            options: { commit: sealTask },
          },
          {
            definition: TurnEvent.ModelSettled,
            data: {
              sessionID: parent.id,
              turnID: parentTurnID,
              assistantMessageID: parentAssistantMessageID,
              state: "completed" as const,
              get timestamp() {
                if (!parentOperation) throw new Error(`Test parent model operation ${parentTurnID} did not admit`)
                return parentOperation.timeAdmitted
              },
            },
          },
        ],
      }
    }),
  )

  yield* events.transaction<undefined, EventV2.Definition>((tx) =>
    Effect.gen(function* () {
      const admission = yield* TurnLifecycle.admitTool(tx, {
        turnID: parentTurnID,
        sessionID: parent.id,
        assistantMessageID: parentAssistantMessageID,
        partID: parentTaskPartID,
        timeAdmitted: parentAssistant.time.created,
      }).pipe(Effect.orDie)
      if (admission.type !== "admitted") return yield* Effect.die("Test parent Task invocation was not admitted")
      const candidate = yield* TurnLifecycle.candidate(tx, {
        turnID: parentTurnID,
        partID: parentTaskPartID,
      }).pipe(Effect.orDie)
      return {
        result: undefined,
        events: [
          {
            definition: TurnEvent.CandidateDisposition,
            data: {
              sessionID: parent.id,
              turnID: parentTurnID,
              candidate,
              timestamp: admission.invocation.timeAdmitted,
            },
          },
          {
            definition: TurnEvent.ToolAdmitted,
            data: {
              sessionID: parent.id,
              turnID: parentTurnID,
              invocation: admission.invocation,
              timestamp: admission.invocation.timeAdmitted,
            },
          },
        ],
      }
    }),
  )

  const childSessionID = input.id ?? SessionID.create()
  const childTurnID = Turn.ID.create()
  const childInputID = Turn.InputID.create()
  const childMessageID = MessageID.ascending()
  const childPartID = PartID.ascending()
  const childUser: SessionV1.User = {
    id: childMessageID,
    role: "user",
    sessionID: childSessionID,
    agent,
    model: selectedModel,
    time: { created: time + 3 },
  }
  const childPart: SessionV1.TextPart = {
    id: childPartID,
    messageID: childMessageID,
    sessionID: childSessionID,
    type: "text",
    text: input.text ?? "test delegated task",
  }
  const admitted = yield* sessions.prepareChildStart({
    childSessionID,
    childTurnID,
    childInputID,
    parentSessionID: parent.id,
    parentTurnID,
    parentTaskPartID,
    parentModelMessageID: parentAssistantMessageID,
    delegatedCapability: { tools: ["test"] },
    depthLimit: 1,
    limits: input.limits ?? { model: 8, tool: 16 },
    envelope: { source: "test_fixture_child" },
    policyBasis: { source: "test_fixture" },
    timeAdmitted: time + 3,
    session: {
      title: input.title,
      agent,
      model: {
        id: selectedModel.modelID,
        providerID: selectedModel.providerID,
        variant: selectedModel.variant ?? "default",
      },
      metadata: input.metadata,
      permission: input.permission,
      workspaceID: input.workspaceID,
    },
    message: { info: childUser, parts: [childPart] },
  })
  const child = yield* sessions.get(childSessionID).pipe(Effect.orDie)
  if (input.settle === false) return { info: child, user: childUser, part: childPart, turn: admitted.turn }

  const terminal = yield* SessionTurnEvents.settle(events, {
    turnID: childTurnID,
    outcome: "interrupted",
    reason: "learner_interrupt",
    time: time + 4,
  })
  yield* sessions.updatePart({
    ...taskPart,
    state: {
      status: "completed",
      input: taskPart.state.input,
      output: JSON.stringify({ child_session_id: childSessionID, child_turn_id: childTurnID }),
      title: "materialize test child",
      metadata: { childSessionId: childSessionID, childTurnId: childTurnID },
      time: { start: time + 2, end: time + 5 },
    },
  })
  yield* events.transaction<undefined, EventV2.Definition>((tx) =>
    Effect.gen(function* () {
      yield* TurnLifecycle.recordChildResult(tx, {
        parentTurnID,
        parentSessionID: parent.id,
        parentTaskPartID,
        childTurnID,
        childSessionID,
        requestedOutput: { state: "incomplete", reason: "learner_interrupt" },
        timeSettled: time + 5,
      })
      const invocation = yield* TurnLifecycle.settleTool(tx, {
        turnID: parentTurnID,
        partID: parentTaskPartID,
        state: "completed",
        time: time + 5,
      })
      return {
        result: undefined,
        event: {
          definition: TurnEvent.ToolSettled,
          data: {
            sessionID: parent.id,
            turnID: parentTurnID,
            partID: parentTaskPartID,
            state: "completed" as const,
            timestamp: invocation.timeSettled ?? invocation.timeAdmitted,
          },
        },
      }
    }).pipe(Effect.orDie),
  )
  yield* SessionTurnEvents.settle(events, {
    turnID: parentTurnID,
    outcome: "completed",
    reason: "normal",
    time: time + 6,
  })
  return { info: child, user: childUser, part: childPart, turn: terminal }
})

export const materializeTestSessionInfo = (input?: Parameters<typeof materializeTestSession>[0]) =>
  materializeTestSession(input).pipe(Effect.map((seeded) => seeded.info))
