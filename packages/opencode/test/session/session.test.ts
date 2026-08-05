import { describe, expect, test } from "bun:test"
import { admitModelWithLearningContext } from "@test/fixture/model-admission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Course } from "@opencode-ai/core/course"
import {
  CourseSelectionAcceptanceCommitSealTable,
  CourseSelectionAcceptanceEffectTable,
} from "@opencode-ai/core/course/sql"
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { Session as SessionNs } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideInstance, tmpdir, tmpdirScoped } from "../fixture/fixture"
import { materializeTestSession, materializeTestSessionInfo } from "../fixture/session"
import { testEffect } from "../lib/effect"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { GlobalBus } from "@/bus/global"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceStore } from "@/project/instance-store"
import { InstanceBootstrap } from "@/project/bootstrap"
import { Database } from "@opencode-ai/core/database/database"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnHistoricalInputPresentationTable, TurnInputTable, TurnTable } from "@opencode-ai/core/turn/sql"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnEvent } from "@opencode-ai/schema/turn-event"
import { LearnerAdmission, LearningCommand, Occurrence, type OccurrenceID } from "@opencode-ai/core/learning-command"
import {
  AdmittedLearnerOccurrenceTable,
  HistoricalLearningToolPresentationTable,
  LearnerOccurrenceTombstoneTable,
} from "@opencode-ai/core/learning-command/occurrence.sql"
import { LearningCommandInvocationTable } from "@opencode-ai/core/learning-command/sql"
import { LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { and, eq } from "drizzle-orm"
import {
  MessageTable,
  PartTable,
  SessionHistoricalMessagePresentationTable,
  SessionTable,
} from "@opencode-ai/core/session/sql"
import { join } from "path"

const sessionRoot = LayerNode.group([
  SessionNs.node,
  SessionRunState.node,
  Course.node,
  Database.node,
  EventV2Bridge.node,
  SessionProjector.node,
  CrossSpawnSpawner.node,
  InstanceStore.node,
])
const sessionReplacements: LayerNode.Replacements = [
  [RuntimeFlags.node, RuntimeFlags.layer({ experimentalWorkspaces: false })],
  [
    InstanceBootstrap.node,
    Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void })),
  ],
]
const it = testEffect(AppNodeBuilder.build(sessionRoot, sessionReplacements))
const pausedIdleEntered = Deferred.makeUnsafe<void>()
const releasePausedIdle = Deferred.makeUnsafe<void>()
const pausedIdleFinished = Deferred.makeUnsafe<void>()
const pausedStatusTransitions: SessionStatus.Info["type"][] = []
const pausedStatusObserved = new Map<SessionID, SessionStatus.Info>()
let pausedStatusIdleCalls = 0
const pausedStatusLayer = Layer.succeed(
  SessionStatus.Service,
  SessionStatus.Service.of({
    get: (sessionID) => Effect.succeed(pausedStatusObserved.get(sessionID) ?? { type: "idle" as const }),
    list: () => Effect.succeed(new Map(pausedStatusObserved)),
    set: (sessionID, value) =>
      Effect.sync(() => {
        pausedStatusTransitions.push(value.type)
        if (value.type === "idle") {
          pausedStatusObserved.delete(sessionID)
          return
        }
        pausedStatusObserved.set(sessionID, value)
      }),
    setIdleIf: (sessionID, current) =>
      Effect.gen(function* () {
        pausedStatusIdleCalls += 1
        if (pausedStatusIdleCalls === 1) {
          yield* Deferred.succeed(pausedIdleEntered, undefined)
          yield* Deferred.await(releasePausedIdle)
        }
        const published = yield* Effect.sync(() => {
          if (!current()) return false
          pausedStatusTransitions.push("idle")
          pausedStatusObserved.delete(sessionID)
          return true
        })
        if (pausedStatusIdleCalls === 1) yield* Deferred.succeed(pausedIdleFinished, undefined)
        return published
      }),
  }),
)
const idlePublicationIt = testEffect(
  AppNodeBuilder.build(LayerNode.group([sessionRoot, SessionStatus.node]), [
    ...sessionReplacements,
    [SessionStatus.node, pausedStatusLayer],
  ]),
)

function sessionLayer(filename: string) {
  return AppNodeBuilder.build(sessionRoot, [
    ...sessionReplacements,
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
}

const awaitDeferred = <T>(deferred: Deferred.Deferred<T>, message: string) =>
  Effect.race(
    Deferred.await(deferred),
    Effect.sleep("2 seconds").pipe(Effect.flatMap(() => Effect.fail(new Error(message)))),
  )

const remove = (id: SessionID) => SessionNs.use.remove(id)

const admitOccurrence = Effect.fn("test.admitOccurrence")(function* (
  sessionID: SessionID,
  messageID: MessageID,
  timeAdmitted?: number,
) {
  const events = yield* EventV2Bridge.Service
  const admitted = yield* events.transaction((tx) =>
    Effect.gen(function* () {
      const message = yield* tx
        .select({ time: MessageTable.time_created })
        .from(MessageTable)
        .where(eq(MessageTable.id, messageID))
        .get()
        .pipe(Effect.orDie)
      const sourceTime = timeAdmitted ?? message?.time
      if (sourceTime === undefined) return yield* Effect.die(`Missing learner message ${messageID}`)
      return yield* Occurrence.admit(tx, {
        admission: LearnerAdmission.interactive({ instant: sourceTime }),
        sessionID,
        messageID,
        timeAdmitted: sourceTime,
      }).pipe(
        Effect.map((result) => ({ result })),
        Effect.orDie,
      )
    }),
  )
  return admitted.result
})

const occurrencePresentation = Effect.fn("test.occurrencePresentation")(function* (
  sessionID: SessionID,
  messageID: MessageID,
) {
  const events = yield* EventV2Bridge.Service
  const presentation = yield* events.transaction((tx) =>
    Occurrence.resolvePresentation(tx, { sessionID, messageID }).pipe(
      Effect.map((result) => ({ result })),
      Effect.catchTag("LearningCommand.InvalidCausalSourceError", (error) =>
        error.reason === "missing_presentation" ? Effect.succeed({ result: undefined }) : Effect.fail(error),
      ),
      Effect.orDie,
    ),
  )
  return presentation.result
})

const admitRootTurn = Effect.fn("test.admitRootTurn")(function* (input: {
  sessionID: SessionID
  turnID: Turn.ID
  inputID: Turn.InputID
  messageID: MessageID
  envelope: Record<string, unknown>
}) {
  const events = yield* EventV2Bridge.Service
  const committed = yield* events.transaction((tx) =>
    Effect.gen(function* () {
      const occurrence = yield* Occurrence.resolvePresentation(tx, {
        sessionID: input.sessionID,
        messageID: input.messageID,
      }).pipe(Effect.orDie)
      const result = yield* TurnLifecycle.admit(tx, {
        kind: "learner",
        ...input,
        occurrenceID: occurrence.occurrenceID,
        limits: { model: 8, tool: 16 },
        policyBasis: { source: "test" },
        timeAdmitted: Date.now(),
      })
      return { result }
    }),
  )
  return committed.result
})

const recordCompletedModelSample = Effect.fn("test.recordCompletedModelSample")(function* (input: {
  sessionID: SessionID
  turnID: Turn.ID
  parentMessageID: MessageID
  directory: string
}) {
  const session = yield* SessionNs.Service
  const events = yield* EventV2Bridge.Service
  const time = Date.now()
  const assistant = yield* session.updateMessage({
    id: MessageID.ascending(),
    parentID: input.parentMessageID,
    role: "assistant" as const,
    sessionID: input.sessionID,
    mode: "repa",
    agent: "repa",
    path: { cwd: input.directory, root: input.directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ModelV2.ID.make("test"),
    providerID: ProviderV2.ID.make("test"),
    time: { created: time, completed: time + 2 },
    finish: "stop",
  })
  yield* events.transaction((tx) =>
    Effect.gen(function* () {
      const model = yield* admitModelWithLearningContext(tx, {
        turnID: input.turnID,
        sessionID: input.sessionID,
        assistantMessageID: assistant.id,
        requestEnvelope: { request: "sample current input before steering" },
        contextFingerprint: TurnLifecycle.envelopeFingerprint({ context: "steer boundary" }),
        snapshotFrontier: { sequence: 0, time: 0 },
        timeAdmitted: time,
      })
      if (model.type !== "admitted") return yield* Effect.die("steer-boundary model unexpectedly exhausted")
      yield* TurnLifecycle.sealCandidateSet(tx, {
        turnID: input.turnID,
        sessionID: input.sessionID,
        assistantMessageID: assistant.id,
        candidates: [],
        timeSealed: time + 1,
      })
      yield* TurnLifecycle.settleModel(tx, {
        turnID: input.turnID,
        assistantMessageID: assistant.id,
        state: "completed",
        time: time + 2,
      })
      return { result: undefined }
    }),
  )
})

const seedTurnFixture = Effect.fn("test.seedTurnFixture")(function* (title: string) {
  const session = yield* SessionNs.Service
  const seeded = yield* materializeTestSession({ title, text: title })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user" as const,
    sessionID: seeded.info.id,
    agent: "repa",
    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
    time: { created: Date.now() + 1 },
  })
  yield* session.updatePart({
    id: PartID.ascending(),
    messageID: user.id,
    sessionID: seeded.info.id,
    type: "text" as const,
    text: title,
  })
  yield* admitOccurrence(seeded.info.id, user.id)
  return { session, info: seeded.info, user }
})

const sessionEvidence = Effect.fn("test.sessionEvidence")(function* (sessionID: SessionID) {
  const database = yield* Database.Service
  const [sessions, turns, inputs, messages, parts, occurrences, events] = yield* Effect.all([
    database.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).all().pipe(Effect.orDie),
    database.db.select().from(TurnTable).where(eq(TurnTable.session_id, sessionID)).all().pipe(Effect.orDie),
    database.db.select().from(TurnInputTable).where(eq(TurnInputTable.session_id, sessionID)).all().pipe(Effect.orDie),
    database.db.select().from(MessageTable).where(eq(MessageTable.session_id, sessionID)).all().pipe(Effect.orDie),
    database.db.select().from(PartTable).where(eq(PartTable.session_id, sessionID)).all().pipe(Effect.orDie),
    database.db
      .select()
      .from(AdmittedLearnerOccurrenceTable)
      .where(eq(AdmittedLearnerOccurrenceTable.origin_session_id, sessionID))
      .all()
      .pipe(Effect.orDie),
    database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie),
  ])
  return {
    sessions: sessions.length,
    turns: turns.length,
    inputs: inputs.length,
    messages: messages.length,
    parts: parts.length,
    occurrences: occurrences.length,
    events: events.length,
    terminalEvents: events.filter((event) => event.type === EventV2.versionedType(TurnEvent.Terminal.type, 1)).length,
  }
})

const seedDelegatedStartFixture = Effect.fn("test.seedDelegatedStartFixture")(function* (title: string) {
  const fixture = yield* seedTurnFixture(title)
  const events = yield* EventV2Bridge.Service
  const parentTurnID = Turn.ID.create()
  yield* admitRootTurn({
    sessionID: fixture.info.id,
    turnID: parentTurnID,
    inputID: Turn.InputID.create(),
    messageID: fixture.user.id,
    envelope: { request: "delegate" },
  })

  const time = Date.now() + 10
  const assistant = yield* fixture.session.updateMessage({
    id: MessageID.ascending(),
    parentID: fixture.user.id,
    role: "assistant" as const,
    sessionID: fixture.info.id,
    mode: "repa",
    agent: "repa",
    path: { cwd: fixture.info.directory, root: fixture.info.directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ModelV2.ID.make("test"),
    providerID: ProviderV2.ID.make("test"),
    time: { created: time },
  })
  const taskPart = yield* fixture.session.updatePart({
    id: PartID.ascending(),
    messageID: assistant.id,
    sessionID: fixture.info.id,
    type: "tool" as const,
    tool: "task",
    callID: `task-${title}`,
    state: { status: "pending" as const, input: { prompt: "bounded child work" }, raw: "" },
  })
  yield* events.transaction((tx) =>
    Effect.gen(function* () {
      const model = yield* admitModelWithLearningContext(tx, {
        turnID: parentTurnID,
        sessionID: fixture.info.id,
        assistantMessageID: assistant.id,
        requestEnvelope: { request: "delegate model" },
        contextFingerprint: TurnLifecycle.envelopeFingerprint({ context: "delegate" }),
        snapshotFrontier: { sequence: 0, time: 0 },
        timeAdmitted: time,
      })
      if (model.type !== "admitted") return yield* Effect.die("parent model unexpectedly exhausted")
      yield* TurnLifecycle.sealCandidateSet(tx, {
        turnID: parentTurnID,
        sessionID: fixture.info.id,
        assistantMessageID: assistant.id,
        candidates: [{ partID: taskPart.id, callID: taskPart.callID, tool: "task", envelope: taskPart.state.input }],
        timeSealed: time + 1,
      })
      const tool = yield* TurnLifecycle.admitTool(tx, {
        turnID: parentTurnID,
        sessionID: fixture.info.id,
        assistantMessageID: assistant.id,
        partID: taskPart.id,
        timeAdmitted: time + 2,
      })
      if (tool.type !== "admitted") return yield* Effect.die("parent task unexpectedly rejected")
      return { result: undefined }
    }),
  )

  const childSessionID = SessionID.descending()
  const childTurnID = Turn.ID.create()
  const childMessageID = MessageID.ascending()
  const childTime = time + 3
  const childMessage: SessionV1.WithParts = {
    info: {
      id: childMessageID,
      role: "user",
      sessionID: childSessionID,
      agent: "general",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      time: { created: childTime },
    },
    parts: [
      {
        id: PartID.ascending(),
        messageID: childMessageID,
        sessionID: childSessionID,
        type: "text",
        text: "bounded child work",
      },
    ],
  }
  const capability = {
    version: 1,
    parent: [{ permission: "read", pattern: "*", action: "allow" as const }],
    profile: [{ permission: "read", pattern: "*", action: "allow" as const }],
    explicit: [{ permission: "read", pattern: "*", action: "allow" as const }],
  }
  const base = {
    childSessionID,
    childTurnID,
    childInputID: Turn.InputID.create(),
    parentSessionID: fixture.info.id,
    parentTurnID,
    parentTaskPartID: taskPart.id,
    parentModelMessageID: assistant.id,
    delegatedCapability: capability,
    depthLimit: 1,
    limits: { model: 2, tool: 2 },
    envelope: { prompt: "bounded child work", requestedOutput: "text" },
    policyBasis: { source: "gate12-test" },
    timeAdmitted: childTime,
    session: {
      title: "delegated child",
      agent: "general",
      model: { id: ModelV2.ID.make("test"), providerID: ProviderV2.ID.make("test"), variant: "default" },
      permission: capability.explicit,
    },
    message: childMessage,
  } as const
  return { fixture, parentTurnID, assistant, taskPart, childTime, childMessage, capability, base }
})

const settleDelegatedParent = Effect.fn("test.settleDelegatedParent")(function* (
  input: Effect.Success<ReturnType<typeof seedDelegatedStartFixture>>,
) {
  const database = yield* Database.Service
  yield* database.db.transaction((tx) =>
    Effect.gen(function* () {
      yield* TurnLifecycle.settleTool(tx, {
        turnID: input.parentTurnID,
        partID: input.taskPart.id,
        state: "completed",
        time: input.childTime + 2,
      })
      yield* TurnLifecycle.settleModel(tx, {
        turnID: input.parentTurnID,
        assistantMessageID: input.assistant.id,
        state: "completed",
        time: input.childTime + 2,
      })
      yield* TurnLifecycle.settle(tx, {
        turnID: input.parentTurnID,
        outcome: "completed",
        reason: "normal",
        time: input.childTime + 3,
      })
    }),
  )
})

const addNoEffectInvocation = Effect.fn("test.addNoEffectInvocation")(function* (
  sessionID: SessionID,
  parentUserMessageID: MessageID,
  occurrenceID: OccurrenceID,
) {
  const session = yield* SessionNs.Service
  const events = yield* EventV2Bridge.Service
  const stored = yield* session.get(sessionID)
  const time = Date.now()
  const assistant = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "assistant",
    parentID: parentUserMessageID,
    sessionID,
    mode: "repa",
    agent: "repa",
    path: { cwd: stored.directory, root: stored.directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ModelV2.ID.make("test"),
    providerID: ProviderV2.ID.make("test"),
    time: { created: time, completed: time },
    finish: "tool-calls",
  })
  const tool = yield* session.updatePart({
    id: PartID.ascending(),
    messageID: assistant.id,
    sessionID,
    type: "tool",
    tool: "accept_course_view_revision",
    callID: `call-${assistant.id}`,
    state: {
      status: "error",
      input: {},
      error: "Permission rejected",
      time: { start: time, end: time },
    },
  })
  yield* events.transaction((tx) =>
    Effect.gen(function* () {
      yield* tx
        .insert(LearningCommandInvocationTable)
        .values({
          part_id: tool.id,
          session_id: sessionID,
          parent_user_message_id: parentUserMessageID,
          assistant_message_id: assistant.id,
          provider_call_id: tool.callID,
          occurrence_id: occurrenceID,
          command_name: "accept_course_view_revision",
          command_version: 1,
          emission_ordinal: 0,
          capability_identity: "accept_course_view_revision",
          capability_version: 1,
          authorization_basis: "learner_request",
          input_fingerprint: "0".repeat(64),
          status: "admitted",
          time_admitted: time,
        })
        .run()
        .pipe(Effect.orDie)
      yield* tx
        .update(LearningCommandInvocationTable)
        .set({
          status: "error",
          settlement: {
            outcome: "error",
            code: "permission_rejected",
            settlementTime: time,
            settlementOrder: 0,
          },
          time_settled: time,
          settlement_order: 0,
        })
        .where(eq(LearningCommandInvocationTable.part_id, tool.id))
        .run()
        .pipe(Effect.orDie)
      return { result: undefined }
    }),
  )
  return { assistant, tool }
})

function expectDiedWith<A, E, R>(effect: Effect.Effect<A, E, R>, tag: string) {
  return Effect.gen(function* () {
    const exit = yield* effect.pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain(tag)
  })
}

describe("session.created event", () => {
  it.instance("should emit session.created event when session is created", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const received = yield* Deferred.make<SessionNs.Info>()

      const unsub = yield* events.listen((event) => {
        if (event.type === SessionNs.Event.Created.type)
          Deferred.doneUnsafe(
            received,
            Effect.succeed((event.data as typeof SessionNs.Event.Created.data.Type).info as SessionNs.Info),
          )
        return Effect.void
      })
      yield* Effect.addFinalizer(() => unsub)

      const info = yield* materializeTestSessionInfo()
      const receivedInfo = yield* awaitDeferred(received, "timed out waiting for session.created")

      expect(receivedInfo.id).toBe(info.id)
      expect(receivedInfo.projectID).toBe(info.projectID)
      expect(receivedInfo.directory).toBe(info.directory)
      expect(receivedInfo.path).toBe(info.path)
      expect(receivedInfo.title).toBe(info.title)

      yield* session.remove(info.id)
    }),
  )

  it.instance("session.created event should be emitted before session.updated", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const source = yield* EventV2Bridge.Service
      const events: string[] = []
      const received = yield* Deferred.make<string[]>()
      const push = (event: string) => {
        events.push(event)
        if (events.includes("created") && events.includes("updated")) {
          Deferred.doneUnsafe(received, Effect.succeed(events))
        }
      }

      const unsubscribe = yield* source.listen((event) => {
        if (event.type === SessionNs.Event.Created.type) push("created")
        if (event.type === SessionNs.Event.Updated.type) push("updated")
        return Effect.void
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      const info = yield* materializeTestSessionInfo()
      yield* session.setTitle({ sessionID: info.id, title: "updated" })
      const receivedEvents = yield* awaitDeferred(received, "timed out waiting for session created/updated events")

      expect(receivedEvents).toContain("created")
      expect(receivedEvents).toContain("updated")
      expect(receivedEvents.indexOf("created")).toBeLessThan(receivedEvents.indexOf("updated"))

      yield* session.remove(info.id)
    }),
  )

  it.instance("emits legacy global sync payload", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const received = yield* Deferred.make<{ syncEvent: EventV2.SerializedEvent }>()
      const listener = (event: { payload: { type?: string; syncEvent?: EventV2.SerializedEvent } }) => {
        if (event.payload.type === "sync" && event.payload.syncEvent)
          Deferred.doneUnsafe(received, Effect.succeed({ syncEvent: event.payload.syncEvent }))
      }
      GlobalBus.on("event", listener)
      yield* Effect.addFinalizer(() => Effect.sync(() => GlobalBus.off("event", listener)))

      const info = yield* materializeTestSessionInfo()
      const event = yield* awaitDeferred(received, "timed out waiting for legacy global sync event")

      expect(event.syncEvent).toMatchObject({
        type: EventV2.versionedType(SessionNs.Event.Created.type, 1),
        seq: 0,
        aggregateID: info.id,
        data: { sessionID: info.id },
      })

      yield* session.remove(info.id)
    }),
  )
})

describe("step-finish token propagation via event", () => {
  it.instance(
    "non-zero tokens propagate through PartUpdated event",
    () =>
      Effect.gen(function* () {
        const session = yield* SessionNs.Service
        const events = yield* EventV2Bridge.Service
        const info = yield* materializeTestSessionInfo()

        const messageID = MessageID.ascending()
        yield* session.updateMessage({
          id: messageID,
          sessionID: info.id,
          role: "user",
          time: { created: Date.now() },
          agent: "user",
          model: { providerID: "test", modelID: "test" },
          tools: {},
          mode: "",
        } as unknown as SessionV1.Info)

        // Event subscribers receive readonly Schema.Type payloads; `SessionV1.Part`
        // is the mutable domain type. Cast bridges the two — safe because the
        // test only reads the value afterwards.
        const received = yield* Deferred.make<SessionV1.Part>()
        const unsub = yield* events.listen((event) => {
          if (event.type === MessageV2.Event.PartUpdated.type)
            Deferred.doneUnsafe(
              received,
              Effect.succeed((event.data as typeof MessageV2.Event.PartUpdated.data.Type).part as SessionV1.Part),
            )
          return Effect.void
        })
        yield* Effect.addFinalizer(() => unsub)

        const tokens = {
          total: 1500,
          input: 500,
          output: 800,
          reasoning: 200,
          cache: { read: 100, write: 50 },
        }

        const partInput = {
          id: PartID.ascending(),
          messageID,
          sessionID: info.id,
          type: "step-finish" as const,
          reason: "stop",
          cost: 0.005,
          tokens,
        }

        yield* session.updatePart(partInput)
        const receivedPart = yield* awaitDeferred(received, "timed out waiting for message.part.updated")

        expect(receivedPart.type).toBe("step-finish")
        const finish = receivedPart as SessionV1.StepFinishPart
        expect(finish.tokens.input).toBe(500)
        expect(finish.tokens.output).toBe(800)
        expect(finish.tokens.reasoning).toBe(200)
        expect(finish.tokens.total).toBe(1500)
        expect(finish.tokens.cache.read).toBe(100)
        expect(finish.tokens.cache.write).toBe(50)
        expect(finish.cost).toBe(0.005)
        expect(receivedPart).not.toBe(partInput)

        yield* session.remove(info.id)
      }),
    { timeout: 30000 },
  )
})

describe("Session", () => {
  it.live("remove works without an instance", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const dir = yield* tmpdirScoped({ git: true })
      const info = yield* provideInstance(dir)(materializeTestSessionInfo({ title: "remove-without-instance" }))

      const removeExit = yield* remove(info.id).pipe(Effect.exit)
      expect(Exit.isSuccess(removeExit)).toBe(true)

      const getExit = yield* session.get(info.id).pipe(Effect.exit)
      expect(Exit.isFailure(getExit)).toBe(true)
    }),
  )

  it.instance("persists metadata and copies it on fork by default", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const meta = { source: "sdk", trace: { id: "abc" } }
      const created = yield* Effect.acquireRelease(
        materializeTestSessionInfo({ title: "with-meta", metadata: meta }),
        (info) => session.remove(info.id).pipe(Effect.ignore),
      )
      const saved = yield* session.get(created.id)
      const fork = yield* Effect.acquireRelease(
        materializeTestSessionInfo({ fork: { sourceSessionID: created.id } }),
        (info) => session.remove(info.id).pipe(Effect.ignore),
      )

      expect(saved.metadata).toEqual(meta)
      expect(fork.metadata).toEqual(meta)
      expect(fork.metadata).not.toBe(meta)
    }),
  )

  it.instance("keeps a no-effect physical identity until its whole Assistant owner is deleted", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const info = yield* materializeTestSessionInfo({ title: "no-effect ownership" })
      const user = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: info.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      const userPart = yield* session.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: info.id,
        type: "text",
        text: "accept this revision",
      })
      const occurrence = yield* admitOccurrence(info.id, user.id)
      expect(yield* session.updateMessage(structuredClone(user))).toEqual(user)
      yield* expectDiedWith(
        session.updateMessage({ ...user, agent: "changed-after-admission" }),
        "LearningCommand.InvalidCausalSourceError",
      )
      expect(yield* session.updatePart(structuredClone(userPart))).toEqual(userPart)
      yield* expectDiedWith(
        session.updatePart({ ...userPart, text: "changed after admission" }),
        "LearningCommand.InvalidCausalSourceError",
      )
      yield* expectDiedWith(
        session.removePart({ sessionID: info.id, messageID: user.id, partID: userPart.id }),
        "LearningCommand.InvalidCausalSourceError",
      )
      const invocation = yield* addNoEffectInvocation(info.id, user.id, occurrence.id)

      expect(yield* session.updatePart(structuredClone(invocation.tool))).toEqual(invocation.tool)
      yield* expectDiedWith(
        session.updatePart({
          ...invocation.tool,
          state: { ...invocation.tool.state, error: "Changed after settlement" },
        }),
        "LearningCommand.SettledPartImmutableError",
      )
      yield* expectDiedWith(
        session.removePart({
          sessionID: info.id,
          messageID: invocation.assistant.id,
          partID: invocation.tool.id,
        }),
        "LearningCommand.SettledPartImmutableError",
      )

      yield* session.removeMessage({ sessionID: info.id, messageID: user.id })
      expect(
        yield* database.db
          .select()
          .from(LearnerOccurrenceTombstoneTable)
          .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, occurrence.id))
          .get()
          .pipe(Effect.orDie),
      ).toMatchObject({ reason: "source_unavailable" })
      expect(
        yield* database.db
          .select()
          .from(AdmittedLearnerOccurrenceTable)
          .where(eq(AdmittedLearnerOccurrenceTable.id, occurrence.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeDefined()
      expect(yield* session.updatePart(structuredClone(invocation.tool))).toEqual(invocation.tool)

      yield* session.removeMessage({ sessionID: info.id, messageID: invocation.assistant.id })
      expect(
        yield* database.db
          .select()
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, invocation.tool.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(AdmittedLearnerOccurrenceTable)
          .where(eq(AdmittedLearnerOccurrenceTable.id, occurrence.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(LearnerOccurrenceTombstoneTable)
          .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, occurrence.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      yield* session.remove(info.id)
    }),
  )

  it.instance("freezes every durable-admitted learning Tool Part against ordinary transcript mutation", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const courses = yield* Course.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const course = yield* courses.createCourse({ title: "Admitted Part immutability" })
      const view = yield* courses.createView({
        courseID: course.id,
        name: "Main",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "root", title: "Recovery" }] },
      })
      const info = yield* materializeTestSessionInfo({ title: "admitted Part immutability" })
      const user = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: info.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: info.id,
        type: "text",
        text: "accept the revision",
      })
      const occurrence = yield* admitOccurrence(info.id, user.id)
      const assistant = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "assistant",
        parentID: user.id,
        sessionID: info.id,
        mode: "repa",
        agent: "repa",
        path: { cwd: info.directory, root: info.directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: Date.now() },
      })
      const canonical = {
        courseID: course.id,
        revisionID: view.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionRevisionID: null,
        expectedSelectionVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      }
      const tool = yield* session.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID: info.id,
        type: "tool",
        tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        callID: "admitted-part-call",
        state: { status: "pending", input: canonical, raw: JSON.stringify(canonical) },
      })
      const row = yield* database.db
        .select({ timeCreated: PartTable.time_created })
        .from(PartTable)
        .where(eq(PartTable.id, tool.id))
        .get()
        .pipe(Effect.orDie)
      if (!row) return yield* Effect.die("expected admitted learning Part")
      yield* events.transaction((tx) =>
        LearningCommand.reserveAcceptance(tx, {
          envelope: {
            occurrenceID: occurrence.id,
            turnID: Turn.ID.create(),
            inputID: Turn.InputID.create(),
            sessionID: info.id,
            parentUserMessageID: user.id,
            assistantMessageID: assistant.id,
            partID: tool.id,
            providerCallID: tool.callID,
            emissionOrdinal: 0,
            capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
            capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
            authorizationBasis: "learner_acceptance",
            timeAdmitted: row.timeCreated,
          },
          command: { ...canonical, expectedSelectionRevisionID: undefined },
        }).pipe(
          Effect.orDie,
          Effect.map((result) => ({ result })),
        ),
      )

      expect(yield* session.updatePart(structuredClone(tool))).toEqual(tool)
      yield* expectDiedWith(
        session.updatePart({
          ...tool,
          state: { ...tool.state, input: { ...canonical, expectedCourseVersion: 1 } },
        }),
        "LearningCommand.SettledPartImmutableError",
      )
      yield* expectDiedWith(
        session.updatePart({ ...tool, callID: "forged-call" }),
        "LearningCommand.SettledPartImmutableError",
      )
      yield* expectDiedWith(
        session.updatePart({
          ...tool,
          state: {
            status: "error",
            input: canonical,
            error: "forged terminal state",
            time: { start: row.timeCreated, end: row.timeCreated + 1 },
          },
        }),
        "LearningCommand.SettledPartImmutableError",
      )
      yield* expectDiedWith(
        session.updatePartDelta({
          sessionID: info.id,
          messageID: assistant.id,
          partID: tool.id,
          field: "state.raw",
          delta: "forged",
        }),
        "LearningCommand.SettledPartImmutableError",
      )
      expect(yield* session.getPart({ sessionID: info.id, messageID: assistant.id, partID: tool.id })).toEqual(tool)

      yield* session.removeMessage({ sessionID: info.id, messageID: assistant.id })
      yield* session.remove(info.id)
    }),
  )

  it.instance("preserves the first applied settlement and causal receipt across whole Session deletion", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const courses = yield* Course.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const course = yield* courses.createCourse({ title: "Applied retention" })
      const view = yield* courses.createView({
        courseID: course.id,
        name: "Main",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "root", title: "Transactions" }] },
      })
      const info = yield* materializeTestSessionInfo({ title: "applied retention" })
      const user = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: info.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: info.id,
        type: "text",
        text: "accept the main revision",
      })
      const occurrence = yield* admitOccurrence(info.id, user.id)
      const assistant = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "assistant",
        parentID: user.id,
        sessionID: info.id,
        mode: "repa",
        agent: "repa",
        path: { cwd: info.directory, root: info.directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: Date.now() },
      })
      const tool = yield* session.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID: info.id,
        type: "tool",
        tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        callID: "applied-call",
        state: { status: "pending", input: {}, raw: "{}" },
      })
      const invocation = {
        envelope: {
          occurrenceID: occurrence.id,
          turnID: Turn.ID.create(),
          inputID: Turn.InputID.create(),
          sessionID: info.id,
          parentUserMessageID: user.id,
          assistantMessageID: assistant.id,
          partID: tool.id,
          providerCallID: tool.callID,
          emissionOrdinal: 0,
          capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
          authorizationBasis: "learner_acceptance" as const,
          timeAdmitted: Date.now(),
        },
        command: {
          courseID: course.id,
          revisionID: view.revision.id,
          expectedCourseVersion: 0,
          expectedSelectionVersion: 0,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
        },
      }
      const admittedAt = invocation.envelope.timeAdmitted
      const settled = yield* events.transaction((tx) =>
        Effect.gen(function* () {
          expect(yield* LearningCommand.reserveAcceptance(tx, invocation)).toEqual({ type: "candidate" })
          const result = yield* LearningCommand.settleAcceptance(tx, {
            ...invocation,
            permission: { type: "allow" },
            settlement: { time: admittedAt + 1, order: 1 },
          })
          expect(result.type).toBe("settled")
          const terminal: SessionV1.ToolPart = {
            ...tool,
            state: {
              status: "completed",
              input: invocation.command,
              output: JSON.stringify(result.settlement),
              title: "Accepted Course View revision",
              metadata: {},
              time: { start: admittedAt, end: admittedAt + 1 },
            },
          }
          return {
            result: result.settlement,
            event: {
              definition: SessionV1.Event.PartUpdated,
              data: { sessionID: info.id, part: terminal, time: admittedAt + 1 },
            },
          }
        }).pipe(Effect.orDie),
      )
      expect(settled.result.outcome).toBe("applied")
      const committedSelection = (yield* courses.getCourse(course.id)).selection
      expect(committedSelection).toEqual({ revisionID: view.revision.id, version: 1 })
      const noEffect = yield* addNoEffectInvocation(info.id, user.id, occurrence.id)
      const terminal = yield* session.getPart({
        sessionID: info.id,
        messageID: assistant.id,
        partID: tool.id,
      })
      if (!terminal || terminal.type !== "tool" || terminal.state.status !== "completed") {
        return yield* Effect.die("expected completed applied Tool Part")
      }
      yield* expectDiedWith(
        session.updatePart({
          ...terminal,
          state: { ...terminal.state, output: `${terminal.state.output} changed` },
        }),
        "LearningCommand.SettledPartImmutableError",
      )
      yield* expectDiedWith(
        session.removePart({ sessionID: info.id, messageID: assistant.id, partID: tool.id }),
        "LearningCommand.SettledPartImmutableError",
      )
      yield* expectDiedWith(
        session.removeTranscript({ sessionID: info.id, messageIDs: [assistant.id], parts: [] }),
        "LearningCommand.AppliedAssistantImmutableError",
      )
      yield* expectDiedWith(
        session.removeMessage({ sessionID: info.id, messageID: assistant.id }),
        "LearningCommand.AppliedAssistantImmutableError",
      )

      yield* session.remove(info.id)
      expect((yield* courses.getCourse(course.id)).selection).toEqual(committedSelection)
      const invocationRow = yield* database.db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, tool.id))
        .get()
        .pipe(Effect.orDie)
      expect(invocationRow).toMatchObject({
        status: "applied",
        settlement: {
          outcome: "applied",
          effectID: settled.result.outcome === "applied" ? settled.result.effectID : undefined,
          committedSelection:
            settled.result.outcome === "applied" && "committedSelection" in settled.result
              ? settled.result.committedSelection
              : undefined,
        },
      })
      expect(
        yield* database.db
          .select()
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, noEffect.tool.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, info.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, info.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      const seal = yield* database.db
        .select()
        .from(CourseSelectionAcceptanceCommitSealTable)
        .where(eq(CourseSelectionAcceptanceCommitSealTable.invocation_part_id, tool.id))
        .get()
        .pipe(Effect.orDie)
      if (!seal) return
      expect(
        yield* database.db
          .select()
          .from(LearningCommandReceiptTable)
          .where(eq(LearningCommandReceiptTable.id, seal.receipt_id))
          .get()
          .pipe(Effect.orDie),
      ).toBeDefined()
      expect(
        yield* database.db
          .select()
          .from(CourseSelectionAcceptanceEffectTable)
          .where(eq(CourseSelectionAcceptanceEffectTable.id, seal.effect_id))
          .get()
          .pipe(Effect.orDie),
      ).toBeDefined()
      expect(
        yield* database.db
          .select()
          .from(LearnerOccurrenceTombstoneTable)
          .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, occurrence.id))
          .get()
          .pipe(Effect.orDie),
      ).toMatchObject({ reason: "source_unavailable" })
      expect(
        yield* database.db.select().from(PartTable).where(eq(PartTable.id, tool.id)).get().pipe(Effect.orDie),
      ).toBeUndefined()
    }),
  )

  test("reopens the exact applied settlement after whole Session deletion", async () => {
    await using tmp = await tmpdir()
    const filename = join(tmp.path, "session-deletion-reopen.sqlite")
    const persisted = await Effect.runPromise(
      provideInstance(tmp.path)(
        Effect.gen(function* () {
          const session = yield* SessionNs.Service
          const courses = yield* Course.Service
          const events = yield* EventV2Bridge.Service
          const database = yield* Database.Service
          const course = yield* courses.createCourse({ title: "Reopened applied retention" })
          const view = yield* courses.createView({
            courseID: course.id,
            name: "Main",
            expectedCourseVersion: 0,
            authorship: Course.Authorship.learnerAuthored(),
            revision: { items: [{ key: "root", title: "Durable transactions" }] },
          })
          const info = yield* materializeTestSessionInfo({ title: "reopened applied retention" })
          const user = yield* session.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID: info.id,
            agent: "repa",
            model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
            time: { created: Date.now() },
          })
          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: user.id,
            sessionID: info.id,
            type: "text",
            text: "accept the durable revision",
          })
          const occurrence = yield* admitOccurrence(info.id, user.id)
          const assistant = yield* session.updateMessage({
            id: MessageID.ascending(),
            role: "assistant",
            parentID: user.id,
            sessionID: info.id,
            mode: "repa",
            agent: "repa",
            path: { cwd: info.directory, root: info.directory },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: ModelV2.ID.make("test"),
            providerID: ProviderV2.ID.make("test"),
            time: { created: Date.now() },
          })
          const tool = yield* session.updatePart({
            id: PartID.ascending(),
            messageID: assistant.id,
            sessionID: info.id,
            type: "tool",
            tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
            callID: "reopen-applied-call",
            state: { status: "pending", input: {}, raw: "{}" },
          })
          const partRow = yield* database.db
            .select({ timeCreated: PartTable.time_created })
            .from(PartTable)
            .where(eq(PartTable.id, tool.id))
            .get()
            .pipe(Effect.orDie)
          if (!partRow) return yield* Effect.die("expected pending learning-command Part")
          const invocation = {
            envelope: {
              occurrenceID: occurrence.id,
              turnID: Turn.ID.create(),
              inputID: Turn.InputID.create(),
              sessionID: info.id,
              parentUserMessageID: user.id,
              assistantMessageID: assistant.id,
              partID: tool.id,
              providerCallID: tool.callID,
              emissionOrdinal: 0,
              capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
              capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
              authorizationBasis: "learner_acceptance" as const,
              timeAdmitted: partRow.timeCreated,
            },
            command: {
              courseID: course.id,
              revisionID: view.revision.id,
              expectedCourseVersion: 0,
              expectedSelectionVersion: 0,
              expectedViewVersion: 0,
              expectedRevisionVersion: 0,
            },
          }
          const settled = yield* events.transaction((tx) =>
            Effect.gen(function* () {
              expect(yield* LearningCommand.reserveAcceptance(tx, invocation)).toEqual({ type: "candidate" })
              const result = yield* LearningCommand.settleAcceptance(tx, {
                ...invocation,
                permission: { type: "allow" },
                settlement: { time: partRow.timeCreated + 1, order: 1 },
              })
              if (result.type !== "settled" || result.settlement.outcome !== "applied") {
                return yield* Effect.die("expected applied learning-command settlement")
              }
              return {
                result: result.settlement,
                event: {
                  definition: SessionV1.Event.PartUpdated,
                  data: {
                    sessionID: info.id,
                    part: {
                      ...tool,
                      state: {
                        status: "completed",
                        input: invocation.command,
                        output: JSON.stringify(result.settlement),
                        title: "Accepted Course View revision",
                        metadata: {},
                        time: { start: partRow.timeCreated, end: partRow.timeCreated + 1 },
                      },
                    } satisfies SessionV1.ToolPart,
                    time: partRow.timeCreated + 1,
                  },
                },
              }
            }).pipe(Effect.orDie),
          )
          const noEffect = yield* addNoEffectInvocation(info.id, user.id, occurrence.id)
          yield* session.remove(info.id)
          return {
            courseID: course.id,
            revisionID: view.revision.id,
            sessionID: info.id,
            occurrenceID: occurrence.id,
            appliedPartID: tool.id,
            noEffectPartID: noEffect.tool.id,
            effectID: settled.result.effectID,
          }
        }),
      ).pipe(Effect.provide(sessionLayer(filename)), Effect.scoped),
    )

    await Effect.runPromise(
      provideInstance(tmp.path)(
        Effect.gen(function* () {
          const courses = yield* Course.Service
          const database = yield* Database.Service
          expect((yield* courses.getCourse(persisted.courseID)).selection).toEqual({
            revisionID: persisted.revisionID,
            version: 1,
          })
          expect(
            yield* database.db
              .select()
              .from(LearningCommandInvocationTable)
              .where(eq(LearningCommandInvocationTable.part_id, persisted.appliedPartID))
              .get()
              .pipe(Effect.orDie),
          ).toMatchObject({ status: "applied", settlement: { effectID: persisted.effectID } })
          expect(
            yield* database.db
              .select()
              .from(LearningCommandReceiptTable)
              .where(eq(LearningCommandReceiptTable.invocation_part_id, persisted.appliedPartID))
              .get()
              .pipe(Effect.orDie),
          ).toBeDefined()
          expect(
            yield* database.db
              .select()
              .from(CourseSelectionAcceptanceEffectTable)
              .where(eq(CourseSelectionAcceptanceEffectTable.id, persisted.effectID))
              .get()
              .pipe(Effect.orDie),
          ).toBeDefined()
          expect(
            yield* database.db
              .select()
              .from(LearnerOccurrenceTombstoneTable)
              .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, persisted.occurrenceID))
              .get()
              .pipe(Effect.orDie),
          ).toMatchObject({ reason: "source_unavailable" })
          expect(
            yield* database.db
              .select()
              .from(LearningCommandInvocationTable)
              .where(eq(LearningCommandInvocationTable.part_id, persisted.noEffectPartID))
              .get()
              .pipe(Effect.orDie),
          ).toBeUndefined()
          expect(
            yield* database.db
              .select()
              .from(SessionTable)
              .where(eq(SessionTable.id, persisted.sessionID))
              .get()
              .pipe(Effect.orDie),
          ).toBeUndefined()
          expect(
            yield* database.db
              .select()
              .from(PartTable)
              .where(eq(PartTable.id, persisted.appliedPartID))
              .get()
              .pipe(Effect.orDie),
          ).toBeUndefined()
          expect(
            yield* database.db
              .select()
              .from(EventTable)
              .where(eq(EventTable.aggregate_id, persisted.sessionID))
              .get()
              .pipe(Effect.orDie),
          ).toBeUndefined()
          expect(
            yield* database.db
              .select()
              .from(EventSequenceTable)
              .where(eq(EventSequenceTable.aggregate_id, persisted.sessionID))
              .get()
              .pipe(Effect.orDie),
          ).toBeUndefined()
        }),
      ).pipe(Effect.provide(sessionLayer(filename)), Effect.scoped),
    )
  })

  it.instance("publishes Session deletion only after commit and rolls back a failed tombstone", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const committed = yield* materializeTestSessionInfo({ title: "committed deletion" })
      const observed = yield* Deferred.make<boolean>()
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== SessionNs.Event.Deleted.type) return Effect.void
        const data = event.data as typeof SessionNs.Event.Deleted.data.Type
        if (data.sessionID !== committed.id) return Effect.void
        return session.get(committed.id).pipe(
          Effect.as(false),
          Effect.catchTag("NotFoundError", () => Effect.succeed(true)),
          Effect.flatMap((deleted) => Deferred.succeed(observed, deleted)),
          Effect.asVoid,
        )
      })
      yield* Effect.addFinalizer(() => unsubscribe)
      yield* session.remove(committed.id)
      expect(yield* awaitDeferred(observed, "timed out waiting for committed deletion visibility")).toBe(true)

      const rolledBack = yield* materializeTestSessionInfo({ title: "rolled back deletion" })
      const future = Date.now() + 60_000
      const user = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: rolledBack.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: future },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: rolledBack.id,
        type: "text",
        text: "future admission",
      })
      yield* admitOccurrence(rolledBack.id, user.id, future)

      const deletion = yield* session.remove(rolledBack.id).pipe(Effect.exit)
      expect(Exit.isFailure(deletion)).toBe(true)
      expect((yield* session.get(rolledBack.id)).id).toBe(rolledBack.id)
      expect(yield* occurrencePresentation(rolledBack.id, user.id)).toBeDefined()
      const reopened = yield* materializeTestSessionInfo({ fork: { sourceSessionID: rolledBack.id } })
      expect(reopened.id).not.toBe(rolledBack.id)
      yield* session.remove(reopened.id)
    }),
  )

  it.instance("keeps a committed deletion closed and finishes visibility after caller interruption", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const state = yield* SessionRunState.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const info = yield* materializeTestSessionInfo({ title: "committed interrupted deletion" })
      const visibilityEntered = yield* Deferred.make<void>()
      const releaseVisibility = yield* Deferred.make<void>()
      const visibilityFinished = yield* Deferred.make<void>()
      const release = Deferred.succeed(releaseVisibility, undefined).pipe(Effect.asVoid)
      yield* Effect.addFinalizer(() => release)
      const unsubscribeBlocking = yield* events.listen((event) => {
        if (event.type !== SessionNs.Event.Deleted.type) return Effect.void
        const data = event.data as typeof SessionNs.Event.Deleted.data.Type
        if (data.sessionID !== info.id) return Effect.void
        return Deferred.succeed(visibilityEntered, undefined).pipe(Effect.andThen(Deferred.await(releaseVisibility)))
      })
      const unsubscribeObserved = yield* events.listen((event) => {
        if (event.type !== SessionNs.Event.Deleted.type) return Effect.void
        const data = event.data as typeof SessionNs.Event.Deleted.data.Type
        if (data.sessionID !== info.id) return Effect.void
        return Deferred.succeed(visibilityFinished, undefined).pipe(Effect.asVoid)
      })
      yield* Effect.addFinalizer(() => unsubscribeBlocking.pipe(Effect.andThen(unsubscribeObserved)))

      const deletion = yield* session.remove(info.id).pipe(Effect.forkChild)
      yield* awaitDeferred(visibilityEntered, "deletion did not reach postcommit visibility")
      yield* Fiber.interrupt(deletion)

      expect(yield* state.phase(info.id)).toBe("closed")
      expect(Exit.isFailure(yield* session.setTitle({ sessionID: info.id, title: "too late" }).pipe(Effect.exit))).toBe(
        true,
      )
      expect(
        yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, info.id)).get().pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, info.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, info.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()

      yield* release
      yield* awaitDeferred(visibilityFinished, "deletion visibility did not survive caller interruption")
    }),
  )

  it.instance("does not let a delayed Session patch recreate a deleted Event aggregate", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const info = yield* materializeTestSessionInfo({ title: "delayed patch" })
      const patchReady = yield* Deferred.make<void>()
      const releasePatch = yield* Deferred.make<void>()
      const originalPublish = events.publish
      const mutableEvents = events as { publish: typeof events.publish }
      mutableEvents.publish = (definition, data, options) =>
        definition.type === SessionNs.Event.Updated.type &&
        (data as typeof SessionNs.Event.Updated.data.Type).sessionID === info.id
          ? Deferred.succeed(patchReady, undefined).pipe(
              Effect.andThen(Deferred.await(releasePatch)),
              Effect.andThen(originalPublish(definition, data, options)),
            )
          : originalPublish(definition, data, options)
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(releasePatch, undefined).pipe(
          Effect.andThen(
            Effect.sync(() => {
              mutableEvents.publish = originalPublish
            }),
          ),
          Effect.asVoid,
        ),
      )

      const patch = yield* session
        .setTitle({ sessionID: info.id, title: "late title" })
        .pipe(Effect.exit, Effect.forkChild)
      yield* awaitDeferred(patchReady, "delayed patch did not reach Event publish")
      const deletion = yield* session.remove(info.id).pipe(Effect.exit, Effect.forkChild)
      const deletedBeforePatch = yield* Effect.race(
        Fiber.await(deletion).pipe(Effect.as(true)),
        Effect.sleep("150 millis").pipe(Effect.as(false)),
      )
      expect(deletedBeforePatch).toBe(false)

      yield* Deferred.succeed(releasePatch, undefined)
      expect(Exit.isSuccess(yield* Fiber.await(patch))).toBe(true)
      expect(Exit.isSuccess(yield* Fiber.await(deletion))).toBe(true)
      mutableEvents.publish = originalPublish
      expect(
        yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, info.id)).get().pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, info.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, info.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
    }),
  )

  it.instance("materializes a fork draft only with its first Turn and rolls the whole aggregate back on failure", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const source = yield* seedTurnFixture("atomic fork source")
      const sourceTurnID = Turn.ID.create()
      const sourceInputID = Turn.InputID.create()
      yield* admitRootTurn({
        sessionID: source.info.id,
        turnID: sourceTurnID,
        inputID: sourceInputID,
        messageID: source.user.id,
        envelope: { prompt: "source" },
      })
      yield* events.transaction((tx) =>
        TurnLifecycle.settle(tx, {
          turnID: sourceTurnID,
          outcome: "interrupted",
          reason: "learner_interrupt",
          time: Date.now(),
        }).pipe(Effect.map((result) => ({ result }))),
      )
      const frontier = yield* database.db
        .select({ sequence: EventSequenceTable.seq })
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, source.info.id))
        .get()
        .pipe(Effect.orDie)
      if (!frontier) throw new Error("Expected source event frontier")
      const fork = {
        sourceSessionID: source.info.id,
        sourceEventSequence: frontier.sequence,
      }

      const targetSessionID = SessionID.descending()
      const targetTurnID = Turn.ID.create()
      const targetInputID = Turn.InputID.create()
      const targetMessageID = MessageID.ascending()
      const targetPartID = PartID.ascending()
      yield* events.transaction((tx) =>
        Effect.gen(function* () {
          const plan = yield* session.prepareRootStart(tx, {
            targetSessionID,
            turnID: targetTurnID,
            session: { title: "atomic fork target" },
            fork,
          })
          const message = {
            id: targetMessageID,
            role: "user" as const,
            sessionID: targetSessionID,
            agent: "repa",
            model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
            time: { created: Date.now() },
          }
          const part = {
            id: targetPartID,
            messageID: targetMessageID,
            sessionID: targetSessionID,
            type: "text" as const,
            text: "first genuine request",
          }
          return {
            result: plan.session,
            events: [
              ...plan.events,
              { definition: SessionV1.Event.MessageUpdated, data: { sessionID: targetSessionID, info: message } },
              {
                definition: SessionV1.Event.PartUpdated,
                data: { sessionID: targetSessionID, part, time: message.time.created },
                options: {
                  commit: () =>
                    Effect.gen(function* () {
                      const occurrence = yield* Occurrence.admit(tx, {
                        admission: LearnerAdmission.interactive({ instant: message.time.created }),
                        sessionID: targetSessionID,
                        messageID: targetMessageID,
                        timeAdmitted: message.time.created,
                      })
                      yield* TurnLifecycle.admit(tx, {
                        kind: "learner",
                        turnID: targetTurnID,
                        sessionID: targetSessionID,
                        inputID: targetInputID,
                        messageID: targetMessageID,
                        occurrenceID: occurrence.id,
                        limits: { model: 8, tool: 16 },
                        envelope: { prompt: "first genuine request", fork },
                        policyBasis: { source: "test" },
                        timeAdmitted: message.time.created,
                      })
                    }).pipe(Effect.orDie, Effect.asVoid),
                },
              },
            ],
          }
        }),
      )

      const historical = yield* database.db
        .select()
        .from(SessionHistoricalMessagePresentationTable)
        .where(
          and(
            eq(SessionHistoricalMessagePresentationTable.session_id, targetSessionID),
            eq(SessionHistoricalMessagePresentationTable.source_message_id, source.user.id),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      expect(historical).toMatchObject({
        source_session_id: source.info.id,
        source_message_id: source.user.id,
        source_event_sequence: frontier.sequence,
      })
      expect(
        yield* database.db
          .select({ sourceTurnID: TurnHistoricalInputPresentationTable.source_turn_id })
          .from(TurnHistoricalInputPresentationTable)
          .where(eq(TurnHistoricalInputPresentationTable.message_id, historical!.message_id))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ sourceTurnID })
      expect(
        yield* database.db
          .select({ messageID: TurnInputTable.message_id })
          .from(TurnInputTable)
          .where(eq(TurnInputTable.turn_id, targetTurnID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([{ messageID: targetMessageID }])

      const failedSessionID = SessionID.descending()
      const failedTurnID = Turn.ID.create()
      const failedMessageID = MessageID.ascending()
      const failedPartID = PartID.ascending()
      const failure = yield* events
        .transaction((tx) =>
          Effect.gen(function* () {
            const plan = yield* session.prepareRootStart(tx, {
              targetSessionID: failedSessionID,
              turnID: failedTurnID,
              session: {},
              fork,
            })
            const message = {
              id: failedMessageID,
              role: "user" as const,
              sessionID: failedSessionID,
              agent: "repa",
              model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
              time: { created: Date.now() },
            }
            const part = {
              id: failedPartID,
              messageID: failedMessageID,
              sessionID: failedSessionID,
              type: "text" as const,
              text: "rollback",
            }
            return {
              result: plan.session,
              events: [
                ...plan.events,
                { definition: SessionV1.Event.MessageUpdated, data: { sessionID: failedSessionID, info: message } },
                {
                  definition: SessionV1.Event.PartUpdated,
                  data: { sessionID: failedSessionID, part, time: message.time.created },
                  options: { commit: () => Effect.die("injected fork-start failure") },
                },
              ],
            }
          }),
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(failure)).toBe(true)
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, failedSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select({ id: MessageTable.id })
          .from(MessageTable)
          .where(eq(MessageTable.session_id, failedSessionID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual([])

      yield* session.touch(source.info.id)
      const driftSessionID = SessionID.descending()
      const driftTurnID = Turn.ID.create()
      const drift = yield* Effect.flip(
        events.transaction((tx) =>
          session
            .prepareRootStart(tx, {
              targetSessionID: driftSessionID,
              turnID: driftTurnID,
              session: {},
              fork,
            })
            .pipe(Effect.map((plan) => ({ result: plan.session, events: plan.events }))),
        ),
      )
      expect(drift).toMatchObject({ _tag: "TurnAdmissionConflictError", turnID: driftTurnID })
      expect(
        yield* database.db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, driftSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
    }),
  )

  it.instance("fork copies admitted User lineage without inferring it for legacy history", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const source = yield* Effect.acquireRelease(materializeTestSessionInfo({ title: "source" }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )
      const linked = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: source.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: linked.id,
        sessionID: source.id,
        type: "text",
        text: "linked learner input",
      })
      const admitted = yield* admitOccurrence(source.id, linked.id)
      const legacy = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: source.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: legacy.id,
        sessionID: source.id,
        type: "text",
        text: "legacy learner input",
      })

      const fork = yield* Effect.acquireRelease(
        materializeTestSessionInfo({ fork: { sourceSessionID: source.id } }),
        (info) => session.remove(info.id).pipe(Effect.ignore),
      )
      const forked = yield* session.messages({ sessionID: fork.id })
      const linkedClone = forked.find((message) =>
        message.parts.some((part) => part.type === "text" && part.text === "linked learner input"),
      )
      const legacyClone = forked.find((message) =>
        message.parts.some((part) => part.type === "text" && part.text === "legacy learner input"),
      )

      expect(linkedClone?.info.role).toBe("user")
      expect(legacyClone?.info.role).toBe("user")
      if (!linkedClone || linkedClone.info.role !== "user" || !legacyClone || legacyClone.info.role !== "user") return
      const presentation = yield* occurrencePresentation(fork.id, linkedClone.info.id)
      expect(presentation?.occurrenceID).toBe(admitted.id)
      expect(presentation?.provenance).toBe("fork_clone")
      expect(presentation?.sourceMessageID).toBe(linked.id)
      expect(yield* occurrencePresentation(fork.id, legacyClone.info.id)).toBeUndefined()

      yield* session.remove(source.id)
      expect((yield* occurrencePresentation(fork.id, linkedClone.info.id))?.occurrenceID).toBe(admitted.id)
      const unavailable = yield* events.transaction((tx) =>
        Occurrence.requireAvailableSource(tx, {
          sessionID: fork.id,
          messageID: linkedClone.info.id,
          occurrenceID: admitted.id,
        }).pipe(
          Effect.flip,
          Effect.map((result) => ({ result })),
          Effect.orDie,
        ),
      )
      expect(unavailable.result).toMatchObject({ reason: "source_unavailable" })
    }),
  )

  it.instance("fork copies the durable per-message diff projection", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const source = yield* Effect.acquireRelease(materializeTestSessionInfo({ title: "diff source" }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )
      const user = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: source.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: source.id,
        type: "text",
        text: "preserve my derived diff",
      })
      const diffs = [
        {
          file: "lesson.ts",
          patch: "@@ -0,0 +1 @@\n+practice\n",
          additions: 1,
          deletions: 0,
          status: "added" as const,
        },
      ]
      yield* database.db
        .update(MessageTable)
        .set({ summary_diffs: diffs })
        .where(and(eq(MessageTable.id, user.id), eq(MessageTable.session_id, source.id)))
        .run()
        .pipe(Effect.orDie)

      const fork = yield* Effect.acquireRelease(
        materializeTestSessionInfo({ fork: { sourceSessionID: source.id } }),
        (info) => session.remove(info.id).pipe(Effect.ignore),
      )
      const clone = (yield* session.messages({ sessionID: fork.id })).find((message) =>
        message.parts.some((part) => part.type === "text" && part.text === "preserve my derived diff"),
      )
      expect(clone?.info.role).toBe("user")
      if (!clone || clone.info.role !== "user") return
      expect(yield* session.messageDiff({ sessionID: fork.id, messageID: clone.info.id })).toEqual(diffs)

      yield* session.remove(source.id)
      expect(yield* session.messageDiff({ sessionID: fork.id, messageID: clone.info.id })).toEqual(diffs)
    }),
  )

  it.instance("fork holds the source lifecycle before publishing its destination", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const state = yield* SessionRunState.Service
      const database = yield* Database.Service
      const source = yield* materializeTestSessionInfo({ title: "source lifecycle" })
      const user = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: source.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: source.id,
        type: "text",
        text: "copy while source is stable",
      })
      const admitted = yield* admitOccurrence(source.id, user.id)
      const settled = yield* addNoEffectInvocation(source.id, user.id, admitted.id)

      const destinationStarted = yield* Deferred.make<void>()
      const releaseDestination = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() => Deferred.succeed(releaseDestination, undefined).pipe(Effect.asVoid))

      const targetSessionID = SessionID.create()
      const forkFiber = yield* state
        .mutateThenAdmitGuarded(
          targetSessionID,
          [source.id],
          Deferred.succeed(destinationStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseDestination)),
            Effect.andThen(
              materializeTestSessionInfo({
                id: targetSessionID,
                fork: { sourceSessionID: source.id },
              }),
            ),
            Effect.map((forked) => Effect.succeed(forked)),
          ),
        )
        .pipe(Effect.forkChild)
      yield* awaitDeferred(destinationStarted, "fork did not acquire its source lifecycle guard")
      const deletion = yield* session.remove(source.id).pipe(Effect.exit)
      expect(Exit.isFailure(deletion)).toBe(true)
      if (Exit.isFailure(deletion)) expect(Cause.squash(deletion.cause)).toMatchObject({ _tag: "SessionBusyError" })
      expect((yield* session.get(source.id)).id).toBe(source.id)

      yield* Deferred.succeed(releaseDestination, undefined)
      const forked = yield* Fiber.join(forkFiber)
      const forkedMessages = yield* session.messages({ sessionID: forked.id })
      const userClone = forkedMessages.find((message) =>
        message.parts.some((part) => part.type === "text" && part.text === "copy while source is stable"),
      )
      const toolClone = forkedMessages
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.callID === settled.tool.callID)
      expect(userClone?.info.role).toBe("user")
      expect(toolClone).toBeDefined()
      if (!userClone || !toolClone) return
      expect((yield* occurrencePresentation(forked.id, userClone.info.id))?.provenance).toBe("fork_clone")
      expect(
        yield* database.db
          .select()
          .from(HistoricalLearningToolPresentationTable)
          .where(eq(HistoricalLearningToolPresentationTable.part_id, toolClone.id))
          .get()
          .pipe(Effect.orDie),
      ).toMatchObject({
        part_id: toolClone.id,
        session_id: forked.id,
        source_session_id: source.id,
        source_assistant_message_id: settled.assistant.id,
        source_part_id: settled.tool.id,
        provenance: "fork_clone",
      })

      yield* session.remove(forked.id)
      yield* session.remove(source.id)
    }),
  )

  it.instance("fork marks a settled Tool clone as historical without minting a physical invocation", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const source = yield* materializeTestSessionInfo({ title: "settled source" })
      const user = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: source.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: source.id,
        type: "text",
        text: "accept the revision",
      })
      const admitted = yield* admitOccurrence(source.id, user.id)
      const assistant = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "assistant",
        parentID: user.id,
        sessionID: source.id,
        mode: "repa",
        agent: "repa",
        path: { cwd: source.directory, root: source.directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: Date.now(), completed: Date.now() },
        finish: "tool-calls",
      })
      const settledAt = Date.now()
      const tool = yield* session.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID: source.id,
        type: "tool",
        tool: "accept_course_view_revision",
        callID: "settled-call",
        state: {
          status: "error",
          input: {},
          error: "Permission rejected",
          time: { start: settledAt, end: settledAt },
        },
      })
      yield* events.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .insert(LearningCommandInvocationTable)
            .values({
              part_id: tool.id,
              session_id: source.id,
              parent_user_message_id: user.id,
              assistant_message_id: assistant.id,
              provider_call_id: tool.callID,
              occurrence_id: admitted.id,
              command_name: "accept_course_view_revision",
              command_version: 1,
              emission_ordinal: 0,
              capability_identity: "accept_course_view_revision",
              capability_version: 1,
              authorization_basis: "learner_request",
              input_fingerprint: "0".repeat(64),
              status: "admitted",
              settlement: null,
              time_admitted: settledAt,
              time_settled: null,
              settlement_order: null,
            })
            .run()
            .pipe(Effect.orDie)
          yield* tx
            .update(LearningCommandInvocationTable)
            .set({
              status: "error",
              settlement: {
                outcome: "error",
                code: "permission_rejected",
                settlementTime: settledAt,
                settlementOrder: 0,
              },
              time_settled: settledAt,
              settlement_order: 0,
            })
            .where(eq(LearningCommandInvocationTable.part_id, tool.id))
            .run()
            .pipe(Effect.orDie)
          return { result: undefined }
        }),
      )

      const fork = yield* materializeTestSessionInfo({ fork: { sourceSessionID: source.id } })
      const clone = (yield* session.messages({ sessionID: fork.id }))
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.callID === tool.callID)
      expect(clone).toBeDefined()
      if (!clone) return
      const historical = (yield* database.db
        .select()
        .from(HistoricalLearningToolPresentationTable)
        .all()
        .pipe(Effect.orDie)).find((row) => row.part_id === clone.id)
      const invocations = yield* database.db.select().from(LearningCommandInvocationTable).all().pipe(Effect.orDie)
      expect(historical).toMatchObject({
        part_id: clone.id,
        session_id: fork.id,
        source_session_id: source.id,
        source_assistant_message_id: assistant.id,
        source_part_id: tool.id,
        provenance: "fork_clone",
      })
      expect(invocations.some((row) => row.part_id === clone.id)).toBe(false)

      yield* session.remove(source.id)
      expect(
        yield* database.db
          .select()
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, tool.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      expect(
        yield* database.db
          .select()
          .from(HistoricalLearningToolPresentationTable)
          .where(eq(HistoricalLearningToolPresentationTable.part_id, clone.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeDefined()
      yield* expectDiedWith(
        session.updatePart({
          ...clone,
          state: { ...clone.state, error: "cannot rewrite historical presentation" },
        }),
        "LearningCommand.HistoricalPresentationConflictError",
      )

      const secondFork = yield* materializeTestSessionInfo({ fork: { sourceSessionID: fork.id } })
      const secondClone = (yield* session.messages({ sessionID: secondFork.id }))
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.callID === tool.callID)
      expect(secondClone).toBeDefined()
      if (!secondClone) return
      expect(
        yield* database.db
          .select()
          .from(HistoricalLearningToolPresentationTable)
          .where(eq(HistoricalLearningToolPresentationTable.part_id, secondClone.id))
          .get()
          .pipe(Effect.orDie),
      ).toMatchObject({
        part_id: secondClone.id,
        session_id: secondFork.id,
        source_session_id: source.id,
        source_assistant_message_id: assistant.id,
        source_part_id: tool.id,
        provenance: "fork_clone",
      })
      expect(
        yield* database.db
          .select()
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, secondClone.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
      yield* session.remove(fork.id)
      expect(
        yield* database.db
          .select()
          .from(HistoricalLearningToolPresentationTable)
          .where(eq(HistoricalLearningToolPresentationTable.part_id, secondClone.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeDefined()
      yield* expectDiedWith(
        session.updatePart({
          ...secondClone,
          state: { ...secondClone.state, error: "cannot rewrite second-generation historical presentation" },
        }),
        "LearningCommand.HistoricalPresentationConflictError",
      )
      yield* session.remove(secondFork.id)
    }),
  )

  it.instance("omits metadata when not provided", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const created = yield* Effect.acquireRelease(materializeTestSessionInfo({ title: "empty-meta" }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )
      const saved = yield* session.get(created.id)

      expect(created.metadata).toBeUndefined()
      expect(saved.metadata).toBeUndefined()
    }),
  )

  it.instance("creates a delegated child Session and first Turn atomically after exact task admission", () =>
    Effect.gen(function* () {
      const delegated = yield* seedDelegatedStartFixture("delegated child admission")
      const fixture = delegated.fixture
      const database = yield* Database.Service
      const { parentTurnID, assistant, taskPart, childTime, childMessage, capability, base } = delegated
      const { childSessionID, childTurnID } = base

      const untrustedChild = yield* materializeTestSessionInfo({
        title: "legacy child without delegated lineage",
      })
      yield* database.db
        .update(SessionTable)
        .set({ parent_id: fixture.info.id })
        .where(eq(SessionTable.id, untrustedChild.id))
        .run()
        .pipe(Effect.orDie)
      const untrustedMessages = yield* fixture.session.messages({ sessionID: untrustedChild.id })
      const untrustedTurnID = Turn.ID.create()
      const untrustedMessageID = MessageID.ascending()
      const untrusted = yield* fixture.session
        .prepareChildStart({
          ...base,
          childSessionID: untrustedChild.id,
          childTurnID: untrustedTurnID,
          childInputID: Turn.InputID.create(),
          depthLimit: 1,
          message: {
            info: {
              ...childMessage.info,
              id: untrustedMessageID,
              sessionID: untrustedChild.id,
            },
            parts: childMessage.parts.map((part) => ({
              ...part,
              id: PartID.ascending(),
              messageID: untrustedMessageID,
              sessionID: untrustedChild.id,
            })),
          },
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(untrusted)).toBe(true)
      expect(yield* fixture.session.messages({ sessionID: untrustedChild.id })).toEqual(untrustedMessages)
      expect(yield* database.db.transaction((tx) => TurnLifecycle.lookup(tx, untrustedTurnID))).toEqual({
        type: "missing",
      })

      const rejectedSessionID = SessionID.descending()
      const rejected = yield* fixture.session
        .prepareChildStart({
          ...base,
          childSessionID: rejectedSessionID,
          childTurnID: Turn.ID.create(),
          childInputID: Turn.InputID.create(),
          depthLimit: 0,
          message: {
            ...childMessage,
            info: { ...childMessage.info, sessionID: rejectedSessionID },
            parts: childMessage.parts.map((part) => ({
              ...part,
              id: PartID.ascending(),
              sessionID: rejectedSessionID,
            })),
          },
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(rejected)).toBe(true)
      expect(
        yield* database.db
          .select()
          .from(SessionTable)
          .where(eq(SessionTable.id, rejectedSessionID))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()

      const admitted = yield* fixture.session.prepareChildStart({ ...base, depthLimit: 1 })
      expect(admitted.replay).toBe(false)
      expect(admitted.turn).toMatchObject({
        id: childTurnID,
        sessionID: childSessionID,
        admissionKind: "delegated_task",
        depth: 1,
        lineage: {
          parentTurnID,
          parentTaskPartID: taskPart.id,
          delegatedCapability: capability,
        },
      })
      expect((yield* fixture.session.get(childSessionID)).parentID).toBe(fixture.info.id)
      expect(yield* fixture.session.messages({ sessionID: childSessionID })).toHaveLength(1)

      const replay = yield* fixture.session.prepareChildStart({ ...base, depthLimit: 1 })
      expect(replay.replay).toBe(true)
      expect(yield* fixture.session.messages({ sessionID: childSessionID })).toHaveLength(1)

      yield* database.db.transaction((tx) =>
        TurnLifecycle.settle(tx, {
          turnID: childTurnID,
          outcome: "interrupted",
          reason: "learner_interrupt",
          time: childTime + 1,
        }),
      )
      yield* settleDelegatedParent(delegated)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  it.instance("interrupts pre-commit admission without durable rows, events, owner, or work", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("precommit admission interruption")
      const state = yield* SessionRunState.Service
      const database = yield* Database.Service
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const envelope = { request: "interrupt before commit" }
      const before = yield* sessionEvidence(fixture.info.id)
      const admissionEntered = yield* Deferred.make<void>()
      const releaseAdmission = yield* Deferred.make<void>()
      let workCalls = 0

      const starting = yield* state
        .startTurn({
          sessionID: fixture.info.id,
          turnID,
          envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
          admit: Effect.gen(function* () {
            yield* Deferred.succeed(admissionEntered, undefined)
            yield* Deferred.await(releaseAdmission)
            return yield* admitRootTurn({
              sessionID: fixture.info.id,
              turnID,
              inputID,
              messageID: fixture.user.id,
              envelope,
            })
          }),
          work: Effect.sync(() => {
            workCalls += 1
            return { outcome: "completed" as const, reason: "normal" as const }
          }),
        })
        .pipe(Effect.forkChild)

      yield* awaitDeferred(admissionEntered, "Turn admission did not reach the pre-commit boundary")
      yield* Fiber.interrupt(starting)
      const interrupted = yield* Fiber.await(starting)
      expect(Exit.isFailure(interrupted)).toBe(true)
      if (Exit.isFailure(interrupted)) expect(Cause.hasInterrupts(interrupted.cause)).toBe(true)
      expect(yield* sessionEvidence(fixture.info.id)).toEqual(before)
      expect(workCalls).toBe(0)
      expect(yield* database.db.transaction((tx) => TurnLifecycle.lookup(tx, turnID))).toEqual({
        type: "missing",
      })
      yield* state.assertNotBusy(fixture.info.id)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  it.instance("terminalizes a delegated child when post-commit owner installation fails without work", () =>
    Effect.gen(function* () {
      const delegated = yield* seedDelegatedStartFixture("delegated owner handoff failure")
      const state = yield* SessionRunState.Service
      const before = yield* sessionEvidence(delegated.base.childSessionID)
      let workCalls = 0

      const terminal = yield* state.startTurn({
        sessionID: delegated.base.childSessionID,
        turnID: delegated.base.childTurnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(delegated.base.envelope),
        admit: delegated.fixture.session.prepareChildStart(delegated.base),
        install: Effect.fail("child runner construction failed"),
        work: Effect.sync(() => {
          workCalls += 1
          return { outcome: "completed" as const, reason: "normal" as const }
        }),
      })

      expect(before).toEqual({
        sessions: 0,
        turns: 0,
        inputs: 0,
        messages: 0,
        parts: 0,
        occurrences: 0,
        events: 0,
        terminalEvents: 0,
      })
      expect(terminal).toMatchObject({
        id: delegated.base.childTurnID,
        sessionID: delegated.base.childSessionID,
        admissionKind: "delegated_task",
        state: "interrupted",
        terminal: { outcome: "interrupted", reason: "owner_handoff_failed" },
      })
      expect(yield* sessionEvidence(delegated.base.childSessionID)).toEqual({
        sessions: 1,
        turns: 1,
        inputs: 1,
        messages: 1,
        parts: 1,
        occurrences: 0,
        events: 5,
        terminalEvents: 1,
      })
      expect(workCalls).toBe(0)
      expect((yield* state.getTurn(delegated.base.childSessionID, delegated.base.childTurnID)).terminal).toEqual(
        terminal.terminal,
      )

      yield* settleDelegatedParent(delegated)
      yield* delegated.fixture.session.remove(delegated.fixture.info.id)
    }),
  )

  it.instance("settles root admission when caller cancellation wins a paused post-commit handoff", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("root postcommit handoff cancellation")
      const state = yield* SessionRunState.Service
      const database = yield* Database.Service
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const envelope = { request: "cancel paused root handoff" }
      const fingerprint = TurnLifecycle.envelopeFingerprint(envelope)
      const before = yield* sessionEvidence(fixture.info.id)
      const installEntered = yield* Deferred.make<void>()
      const releaseInstall = yield* Deferred.make<void>()
      let workCalls = 0

      const admit = admitRootTurn({
        sessionID: fixture.info.id,
        turnID,
        inputID,
        messageID: fixture.user.id,
        envelope,
      })
      const starting = yield* state
        .startTurn({
          sessionID: fixture.info.id,
          turnID,
          envelopeFingerprint: fingerprint,
          admit,
          install: Deferred.succeed(installEntered, undefined).pipe(Effect.andThen(Deferred.await(releaseInstall))),
          work: Effect.sync(() => {
            workCalls += 1
            return { outcome: "completed" as const, reason: "normal" as const }
          }),
        })
        .pipe(Effect.forkChild)

      yield* awaitDeferred(installEntered, "root handoff did not reach post-commit installation")
      const committed = yield* database.db.transaction((tx) => TurnLifecycle.lookup(tx, turnID))
      expect(committed).toMatchObject({ type: "available", turn: { state: "running" } })

      // Signal without joining so the oracle can release the installation barrier
      // after the caller's cancellation finalizer has been scheduled.
      starting.interruptUnsafe()
      yield* Effect.yieldNow
      yield* Deferred.succeed(releaseInstall, undefined)
      const interrupted = yield* Fiber.await(starting).pipe(Effect.timeout("2 seconds"))
      expect(Exit.isFailure(interrupted)).toBe(true)
      if (Exit.isFailure(interrupted)) expect(Cause.hasInterrupts(interrupted.cause)).toBe(true)

      const terminal = yield* state.getTurn(fixture.info.id, turnID)
      expect(terminal).toMatchObject({
        id: turnID,
        sessionID: fixture.info.id,
        state: "interrupted",
        terminal: { outcome: "interrupted", reason: "owner_handoff_failed" },
      })
      expect(workCalls).toBe(0)
      yield* state.assertNotBusy(fixture.info.id)

      const replay = yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID,
        envelopeFingerprint: fingerprint,
        admit,
        work: Effect.die("terminal root replay must not dispatch work"),
      })
      expect(replay).toEqual(terminal)
      expect(yield* sessionEvidence(fixture.info.id)).toEqual({
        ...before,
        turns: before.turns + 1,
        inputs: before.inputs + 1,
        events: before.events + 1,
        terminalEvents: before.terminalEvents + 1,
      })
      yield* state.assertNotBusy(fixture.info.id)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  it.instance("settles delegated admission when caller cancellation wins a paused post-commit handoff", () =>
    Effect.gen(function* () {
      const delegated = yield* seedDelegatedStartFixture("delegated postcommit handoff cancellation")
      const state = yield* SessionRunState.Service
      const database = yield* Database.Service
      const fingerprint = TurnLifecycle.envelopeFingerprint(delegated.base.envelope)
      const before = yield* sessionEvidence(delegated.base.childSessionID)
      const installEntered = yield* Deferred.make<void>()
      const releaseInstall = yield* Deferred.make<void>()
      let workCalls = 0

      const admit = delegated.fixture.session.prepareChildStart(delegated.base)
      const starting = yield* state
        .startTurn({
          sessionID: delegated.base.childSessionID,
          turnID: delegated.base.childTurnID,
          envelopeFingerprint: fingerprint,
          admit,
          install: Deferred.succeed(installEntered, undefined).pipe(Effect.andThen(Deferred.await(releaseInstall))),
          work: Effect.sync(() => {
            workCalls += 1
            return { outcome: "completed" as const, reason: "normal" as const }
          }),
        })
        .pipe(Effect.forkChild)

      yield* awaitDeferred(installEntered, "delegated handoff did not reach post-commit installation")
      const committed = yield* database.db.transaction((tx) => TurnLifecycle.lookup(tx, delegated.base.childTurnID))
      expect(committed).toMatchObject({ type: "available", turn: { state: "running" } })

      starting.interruptUnsafe()
      yield* Effect.yieldNow
      yield* Deferred.succeed(releaseInstall, undefined)
      const interrupted = yield* Fiber.await(starting).pipe(Effect.timeout("2 seconds"))
      expect(Exit.isFailure(interrupted)).toBe(true)
      if (Exit.isFailure(interrupted)) expect(Cause.hasInterrupts(interrupted.cause)).toBe(true)

      const terminal = yield* state.getTurn(delegated.base.childSessionID, delegated.base.childTurnID)
      expect(terminal).toMatchObject({
        id: delegated.base.childTurnID,
        sessionID: delegated.base.childSessionID,
        admissionKind: "delegated_task",
        state: "interrupted",
        terminal: { outcome: "interrupted", reason: "owner_handoff_failed" },
      })
      expect(workCalls).toBe(0)
      yield* state.assertNotBusy(delegated.base.childSessionID)

      const replay = yield* state.startTurn({
        sessionID: delegated.base.childSessionID,
        turnID: delegated.base.childTurnID,
        envelopeFingerprint: fingerprint,
        admit,
        work: Effect.die("terminal delegated replay must not dispatch work"),
      })
      expect(replay).toEqual(terminal)
      expect(yield* sessionEvidence(delegated.base.childSessionID)).toEqual({
        sessions: 1,
        turns: 1,
        inputs: 1,
        messages: 1,
        parts: 1,
        occurrences: 0,
        events: 5,
        terminalEvents: 1,
      })
      expect(before).toEqual({
        sessions: 0,
        turns: 0,
        inputs: 0,
        messages: 0,
        parts: 0,
        occurrences: 0,
        events: 0,
        terminalEvents: 0,
      })
      yield* state.assertNotBusy(delegated.base.childSessionID)

      yield* settleDelegatedParent(delegated)
      yield* delegated.fixture.session.remove(delegated.fixture.info.id)
    }),
  )

  it.instance("reserves one durable Turn owner and exact replay never installs replacement work", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("turn owner exact replay")
      const state = yield* SessionRunState.Service
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const envelope = { request: "first" }
      const fingerprint = TurnLifecycle.envelopeFingerprint(envelope)
      const admissionEntered = yield* Deferred.make<void>()
      const releaseAdmission = yield* Deferred.make<void>()
      const workEntered = yield* Deferred.make<void>()
      const releaseWork = yield* Deferred.make<void>()
      const exactRetryEntered = yield* Deferred.make<void>()
      const calls = { admission: 0, replacementAdmission: 0, work: 0 }
      const admit = Effect.gen(function* () {
        calls.admission += 1
        yield* Deferred.succeed(admissionEntered, undefined)
        yield* Deferred.await(releaseAdmission)
        return yield* admitRootTurn({
          sessionID: fixture.info.id,
          turnID,
          inputID,
          messageID: fixture.user.id,
          envelope,
        })
      })
      const work = Effect.gen(function* () {
        calls.work += 1
        yield* Deferred.succeed(workEntered, undefined)
        yield* Deferred.await(releaseWork)
        return { outcome: "failed" as const, reason: "provider_failure" as const }
      })

      const first = yield* state
        .startTurn({ sessionID: fixture.info.id, turnID, envelopeFingerprint: fingerprint, admit, work })
        .pipe(Effect.forkChild)
      yield* awaitDeferred(admissionEntered, "Turn admission reservation was not installed")

      const exactRetry = yield* Deferred.succeed(exactRetryEntered, undefined).pipe(
        Effect.andThen(
          state.startTurn({
            sessionID: fixture.info.id,
            turnID,
            envelopeFingerprint: fingerprint,
            admit: Effect.die("exact running replay must not readmit"),
            work: Effect.die("exact running replay must not redispatch"),
          }),
        ),
        Effect.forkChild,
      )
      yield* awaitDeferred(exactRetryEntered, "exact retry did not enter the existing owner request")

      const otherTurnID = Turn.ID.create()
      const busy = yield* state
        .startTurn({
          sessionID: fixture.info.id,
          turnID: otherTurnID,
          envelopeFingerprint: TurnLifecycle.envelopeFingerprint({ request: "other" }),
          admit: Effect.sync(() => {
            calls.replacementAdmission += 1
            throw new Error("replacement admission must not run")
          }),
          work: Effect.die("replacement work must not run"),
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(busy)).toBe(true)
      if (Exit.isFailure(busy)) expect(Cause.squash(busy.cause)).toBeInstanceOf(Turn.AlreadyRunningError)
      expect(calls.replacementAdmission).toBe(0)

      yield* Deferred.succeed(releaseAdmission, undefined)
      const [started, replay] = yield* Effect.all([Fiber.join(first), Fiber.join(exactRetry)])
      expect(started.state).toBe("running")
      expect(replay).toEqual(started)
      yield* awaitDeferred(workEntered, "released-v1 Turn work did not start after handoff")
      expect(replay.id).toBe(turnID)
      expect(replay.state).toBe("running")
      expect(calls).toEqual({ admission: 1, replacementAdmission: 0, work: 1 })

      yield* Deferred.succeed(releaseWork, undefined)
      const terminal = yield* Effect.gen(function* () {
        while (true) {
          const current = yield* state.getTurn(fixture.info.id, turnID)
          if (current.state !== "running") return current
          yield* Effect.yieldNow
        }
      }).pipe(Effect.timeout("2 seconds"))
      expect(terminal.terminal).toMatchObject({ outcome: "failed", reason: "provider_failure" })
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  it.instance("terminalizes post-commit owner installation failure without starting work", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("turn owner handoff failure")
      const state = yield* SessionRunState.Service
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const envelope = { request: "handoff failure" }
      const before = yield* sessionEvidence(fixture.info.id)
      let workCalls = 0

      const terminal = yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
        admit: admitRootTurn({
          sessionID: fixture.info.id,
          turnID,
          inputID,
          messageID: fixture.user.id,
          envelope,
        }),
        install: Effect.fail("runner construction failed"),
        work: Effect.sync(() => {
          workCalls += 1
          return { outcome: "completed" as const, reason: "normal" as const }
        }),
      })

      expect(terminal.terminal).toMatchObject({ outcome: "interrupted", reason: "owner_handoff_failed" })
      expect(workCalls).toBe(0)
      expect((yield* state.getTurn(fixture.info.id, turnID)).state).toBe("interrupted")
      expect(yield* sessionEvidence(fixture.info.id)).toEqual({
        ...before,
        turns: before.turns + 1,
        inputs: before.inputs + 1,
        events: before.events + 1,
        terminalEvents: before.terminalEvents + 1,
      })
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  for (const winner of ["completion", "interrupt"] as const) {
    it.instance(`keeps the first terminal CAS immutable when ${winner} wins completion versus interrupt`, () =>
      Effect.gen(function* () {
        const fixture = yield* seedTurnFixture(`${winner} terminal CAS`)
        const state = yield* SessionRunState.Service
        const database = yield* Database.Service
        const turnID = Turn.ID.create()
        const envelope = { request: `${winner} terminal CAS` }
        const assistant = yield* fixture.session.updateMessage({
          id: MessageID.ascending(),
          parentID: fixture.user.id,
          role: "assistant" as const,
          sessionID: fixture.info.id,
          mode: "repa",
          agent: "repa",
          path: { cwd: fixture.info.directory, root: fixture.info.directory },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: ModelV2.ID.make("test"),
          providerID: ProviderV2.ID.make("test"),
          time: { created: Date.now() },
        })
        const workEntered = yield* Deferred.make<void>()
        const releaseWork = yield* Deferred.make<void>()
        let workCalls = 0
        let completedWork = 0

        yield* state.startTurn({
          sessionID: fixture.info.id,
          turnID,
          envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
          admit: admitRootTurn({
            sessionID: fixture.info.id,
            turnID,
            inputID: Turn.InputID.create(),
            messageID: fixture.user.id,
            envelope,
          }),
          work: Effect.gen(function* () {
            workCalls += 1
            yield* Deferred.succeed(workEntered, undefined)
            yield* Deferred.await(releaseWork)
            yield* database.db.transaction((tx) =>
              Effect.gen(function* () {
                const model = yield* admitModelWithLearningContext(tx, {
                  turnID,
                  sessionID: fixture.info.id,
                  assistantMessageID: assistant.id,
                  requestEnvelope: { request: `${winner} terminal model` },
                  contextFingerprint: TurnLifecycle.envelopeFingerprint({ context: `${winner} terminal model` }),
                  snapshotFrontier: { sequence: 0, time: 0 },
                  timeAdmitted: Date.now(),
                })
                if (model.type !== "admitted") return yield* Effect.die("terminal CAS model exhausted unexpectedly")
                yield* TurnLifecycle.sealCandidateSet(tx, {
                  turnID,
                  sessionID: fixture.info.id,
                  assistantMessageID: assistant.id,
                  candidates: [],
                  timeSealed: Date.now(),
                })
                yield* TurnLifecycle.settleModel(tx, {
                  turnID,
                  assistantMessageID: assistant.id,
                  state: "completed",
                  time: Date.now(),
                })
              }),
            )
            completedWork += 1
            return { outcome: "completed" as const, reason: "normal" as const }
          }),
        })
        yield* awaitDeferred(workEntered, "Turn work did not reach the completion/interrupt boundary")
        const before = yield* sessionEvidence(fixture.info.id)

        const first =
          winner === "completion"
            ? yield* Deferred.succeed(releaseWork, undefined).pipe(
                Effect.andThen(state.awaitTurn(fixture.info.id, turnID)),
              )
            : yield* state.interruptTurn(fixture.info.id, turnID)
        if (winner === "interrupt") yield* Deferred.succeed(releaseWork, undefined).pipe(Effect.ignore)
        const losingAttempt =
          winner === "completion"
            ? yield* state.interruptTurn(fixture.info.id, turnID)
            : yield* state.awaitTurn(fixture.info.id, turnID)
        const stored = yield* state.getTurn(fixture.info.id, turnID)

        expect(first.terminal).toMatchObject(
          winner === "completion"
            ? { outcome: "completed", reason: "normal" }
            : { outcome: "interrupted", reason: "learner_interrupt" },
        )
        expect(losingAttempt.terminal).toEqual(first.terminal)
        expect(stored.terminal).toEqual(first.terminal)
        expect(workCalls).toBe(1)
        expect(completedWork).toBe(winner === "completion" ? 1 : 0)
        expect(yield* sessionEvidence(fixture.info.id)).toEqual({
          ...before,
          events: before.events + 1,
          terminalEvents: before.terminalEvents + 1,
        })
        yield* fixture.session.remove(fixture.info.id)
      }),
    )
  }

  it.instance("awaits the exact owner handoff when terminal state wins before await begins", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("terminal before await handoff")
      const state = yield* SessionRunState.Service
      const events = yield* EventV2Bridge.Service
      const turnID = Turn.ID.create()
      const envelope = { request: "terminal before await handoff" }
      const workEntered = yield* Deferred.make<void>()
      const releaseWork = yield* Deferred.make<void>()
      const idleEntered = yield* Deferred.make<void>()
      const releaseIdle = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() => Deferred.succeed(releaseIdle, undefined).pipe(Effect.asVoid))
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== SessionStatus.Event.Status.type) return Effect.void
        const data = event.data as typeof SessionStatus.Event.Status.data.Type
        if (data.sessionID !== fixture.info.id || data.status.type !== "idle") return Effect.void
        return Deferred.succeed(idleEntered, undefined).pipe(Effect.andThen(Deferred.await(releaseIdle)))
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
        admit: admitRootTurn({
          sessionID: fixture.info.id,
          turnID,
          inputID: Turn.InputID.create(),
          messageID: fixture.user.id,
          envelope,
        }),
        work: Deferred.succeed(workEntered, undefined).pipe(
          Effect.andThen(Deferred.await(releaseWork)),
          Effect.as({ outcome: "completed" as const, reason: "normal" as const }),
        ),
      })
      yield* awaitDeferred(workEntered, "Turn work did not start")
      yield* Deferred.succeed(releaseWork, undefined)
      yield* awaitDeferred(idleEntered, "Turn did not reach the post-terminal idle publication")
      const stored = yield* state.getTurn(fixture.info.id, turnID)
      expect(stored.state).not.toBe("running")

      const awaiting = yield* state.awaitTurn(fixture.info.id, turnID).pipe(Effect.forkChild)
      expect(
        yield* Effect.race(
          Fiber.join(awaiting).pipe(Effect.as(true)),
          Effect.sleep("50 millis").pipe(Effect.as(false)),
        ),
      ).toBe(false)

      yield* Deferred.succeed(releaseIdle, undefined)
      expect((yield* Fiber.join(awaiting)).terminal).toEqual(stored.terminal)
      yield* state.assertNotBusy(fixture.info.id)
      yield* state.idle(fixture.info.id, Effect.void)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  it.instance("admits a distinct Turn directly from the terminal owner's idle listener", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("idle listener owner promotion")
      const state = yield* SessionRunState.Service
      const events = yield* EventV2Bridge.Service
      const firstTurnID = Turn.ID.create()
      const secondTurnID = Turn.ID.create()
      const firstEnvelope = { request: "finish before publishing promotion-ready idle" }
      const secondEnvelope = { request: "start directly from the observed idle boundary" }
      const secondUser = yield* fixture.session.updateMessage({
        id: MessageID.ascending(),
        role: "user" as const,
        sessionID: fixture.info.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() + 2 },
      })
      yield* fixture.session.updatePart({
        id: PartID.ascending(),
        messageID: secondUser.id,
        sessionID: fixture.info.id,
        type: "text" as const,
        text: secondEnvelope.request,
      })
      yield* admitOccurrence(fixture.info.id, secondUser.id)
      const firstWorkEntered = yield* Deferred.make<void>()
      const releaseFirstWork = yield* Deferred.make<void>()
      const secondStart = yield* Deferred.make<Exit.Exit<Turn.Info, unknown>>()
      const firstAtIdle = yield* Deferred.make<Turn.Info>()
      const secondWorkEntered = yield* Deferred.make<void>()
      const releaseSecondWork = yield* Deferred.make<void>()
      let promoted = false
      yield* Effect.addFinalizer(() =>
        Effect.all([Deferred.succeed(releaseFirstWork, undefined), Deferred.succeed(releaseSecondWork, undefined)], {
          discard: true,
        }),
      )
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== SessionStatus.Event.Status.type) return Effect.void
        const data = event.data as typeof SessionStatus.Event.Status.data.Type
        if (data.sessionID !== fixture.info.id || data.status.type !== "idle" || promoted) return Effect.void
        promoted = true
        return state.getTurn(fixture.info.id, firstTurnID).pipe(
          Effect.flatMap((turn) => Deferred.succeed(firstAtIdle, turn)),
          Effect.andThen(
            state.startTurn({
              sessionID: fixture.info.id,
              turnID: secondTurnID,
              envelopeFingerprint: TurnLifecycle.envelopeFingerprint(secondEnvelope),
              admit: admitRootTurn({
                sessionID: fixture.info.id,
                turnID: secondTurnID,
                inputID: Turn.InputID.create(),
                messageID: secondUser.id,
                envelope: secondEnvelope,
              }).pipe(Effect.provideService(EventV2Bridge.Service, events)),
              work: Effect.gen(function* () {
                yield* Deferred.succeed(secondWorkEntered, undefined)
                yield* Deferred.await(releaseSecondWork)
                yield* recordCompletedModelSample({
                  sessionID: fixture.info.id,
                  turnID: secondTurnID,
                  parentMessageID: secondUser.id,
                  directory: fixture.info.directory,
                })
                return { outcome: "completed" as const, reason: "normal" as const }
              }).pipe(
                Effect.provideService(SessionNs.Service, fixture.session),
                Effect.provideService(EventV2Bridge.Service, events),
              ),
            }),
          ),
          Effect.exit,
          Effect.flatMap((exit) => Deferred.succeed(secondStart, exit)),
          Effect.asVoid,
        )
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID: firstTurnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(firstEnvelope),
        admit: admitRootTurn({
          sessionID: fixture.info.id,
          turnID: firstTurnID,
          inputID: Turn.InputID.create(),
          messageID: fixture.user.id,
          envelope: firstEnvelope,
        }),
        work: Effect.gen(function* () {
          yield* Deferred.succeed(firstWorkEntered, undefined)
          yield* Deferred.await(releaseFirstWork)
          yield* recordCompletedModelSample({
            sessionID: fixture.info.id,
            turnID: firstTurnID,
            parentMessageID: fixture.user.id,
            directory: fixture.info.directory,
          })
          return { outcome: "completed" as const, reason: "normal" as const }
        }),
      })
      yield* awaitDeferred(firstWorkEntered, "First Turn work did not start")
      yield* Deferred.succeed(releaseFirstWork, undefined)

      const started = yield* awaitDeferred(secondStart, "Idle listener did not attempt the distinct Turn")
      const observedFirst = yield* awaitDeferred(firstAtIdle, "Idle listener did not observe the first Turn")
      expect(Exit.isSuccess(started)).toBe(true)
      if (Exit.isFailure(started)) return yield* Effect.failCause(started.cause)
      expect(started.value).toMatchObject({ id: secondTurnID, state: "running" })
      yield* awaitDeferred(secondWorkEntered, "Distinct Turn did not enter work from the idle listener")
      const firstStored = yield* state.getTurn(fixture.info.id, firstTurnID)
      expect(observedFirst.terminal).toMatchObject({ outcome: "completed", reason: "normal" })
      expect(firstStored.terminal).toMatchObject({
        outcome: "completed",
        reason: "normal",
      })

      yield* Deferred.succeed(releaseSecondWork, undefined)
      expect((yield* state.awaitTurn(fixture.info.id, secondTurnID)).terminal).toMatchObject({
        outcome: "completed",
        reason: "normal",
      })
      yield* state.assertNotBusy(fixture.info.id)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  idlePublicationIt.instance("does not let a paused terminal idle publication clobber a distinct busy successor", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("paused idle successor")
      const state = yield* SessionRunState.Service
      const status = yield* SessionStatus.Service
      const firstTurnID = Turn.ID.create()
      const secondTurnID = Turn.ID.create()
      const firstEnvelope = { request: "finish before a paused idle publication" }
      const secondEnvelope = { request: "start while the predecessor idle publication is paused" }
      const secondUser = yield* fixture.session.updateMessage({
        id: MessageID.ascending(),
        role: "user" as const,
        sessionID: fixture.info.id,
        agent: "repa",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() + 2 },
      })
      yield* fixture.session.updatePart({
        id: PartID.ascending(),
        messageID: secondUser.id,
        sessionID: fixture.info.id,
        type: "text" as const,
        text: secondEnvelope.request,
      })
      yield* admitOccurrence(fixture.info.id, secondUser.id)
      const firstWorkEntered = yield* Deferred.make<void>()
      const releaseFirstWork = yield* Deferred.make<void>()
      const secondBusy = yield* Deferred.make<void>()
      const releaseSecondWork = yield* Deferred.make<void>()
      let firstWorkCalls = 0
      let secondWorkCalls = 0
      yield* Effect.addFinalizer(() =>
        Effect.all(
          [
            Deferred.succeed(releaseFirstWork, undefined),
            Deferred.succeed(releaseSecondWork, undefined),
            Deferred.succeed(releasePausedIdle, undefined),
          ],
          { discard: true },
        ),
      )

      yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID: firstTurnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(firstEnvelope),
        admit: admitRootTurn({
          sessionID: fixture.info.id,
          turnID: firstTurnID,
          inputID: Turn.InputID.create(),
          messageID: fixture.user.id,
          envelope: firstEnvelope,
        }),
        work: Effect.gen(function* () {
          firstWorkCalls += 1
          yield* Deferred.succeed(firstWorkEntered, undefined)
          yield* Deferred.await(releaseFirstWork)
          yield* recordCompletedModelSample({
            sessionID: fixture.info.id,
            turnID: firstTurnID,
            parentMessageID: fixture.user.id,
            directory: fixture.info.directory,
          })
          return { outcome: "completed" as const, reason: "normal" as const }
        }),
      })
      yield* awaitDeferred(firstWorkEntered, "First Turn work did not start")
      yield* Deferred.succeed(releaseFirstWork, undefined)
      yield* awaitDeferred(pausedIdleEntered, "First Turn did not pause before idle publication")

      const second = yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID: secondTurnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(secondEnvelope),
        admit: admitRootTurn({
          sessionID: fixture.info.id,
          turnID: secondTurnID,
          inputID: Turn.InputID.create(),
          messageID: secondUser.id,
          envelope: secondEnvelope,
        }),
        work: Effect.gen(function* () {
          secondWorkCalls += 1
          yield* status.set(fixture.info.id, { type: "busy" })
          yield* Deferred.succeed(secondBusy, undefined)
          yield* Deferred.await(releaseSecondWork)
          yield* recordCompletedModelSample({
            sessionID: fixture.info.id,
            turnID: secondTurnID,
            parentMessageID: secondUser.id,
            directory: fixture.info.directory,
          })
          return { outcome: "completed" as const, reason: "normal" as const }
        }),
      })
      expect(second).toMatchObject({ id: secondTurnID, state: "running" })
      yield* awaitDeferred(secondBusy, "Successor Turn did not publish busy")
      expect(yield* status.get(fixture.info.id)).toEqual({ type: "busy" })
      expect(pausedStatusTransitions).toEqual(["busy"])

      yield* Deferred.succeed(releasePausedIdle, undefined)
      yield* awaitDeferred(pausedIdleFinished, "Predecessor idle publication did not resume")
      expect(yield* status.get(fixture.info.id)).toEqual({ type: "busy" })
      expect(pausedStatusTransitions).toEqual(["busy"])
      expect(yield* state.activeTurn(fixture.info.id)).toMatchObject({ id: secondTurnID, state: "running" })
      expect(Exit.isFailure(yield* state.assertNotBusy(fixture.info.id).pipe(Effect.exit))).toBe(true)
      expect(firstWorkCalls).toBe(1)
      expect(secondWorkCalls).toBe(1)

      yield* Deferred.succeed(releaseSecondWork, undefined)
      expect((yield* state.awaitTurn(fixture.info.id, secondTurnID)).terminal).toMatchObject({
        outcome: "completed",
        reason: "normal",
      })
      expect(yield* status.get(fixture.info.id)).toEqual({ type: "idle" })
      expect(pausedStatusTransitions).toEqual(["busy", "idle"])
      yield* state.assertNotBusy(fixture.info.id)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  it.instance("settles a same-process ownerless durable running Turn without dispatch", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("same-process ownerless recovery")
      const state = yield* SessionRunState.Service
      const turnID = Turn.ID.create()
      const envelope = { request: "orphan" }
      const admitted = yield* admitRootTurn({
        sessionID: fixture.info.id,
        turnID,
        inputID: Turn.InputID.create(),
        messageID: fixture.user.id,
        envelope,
      })
      expect(admitted.turn.state).toBe("running")

      const recovered = yield* state.getTurn(fixture.info.id, turnID)
      expect(recovered.terminal).toMatchObject({ outcome: "interrupted", reason: "owner_lost" })
      expect((yield* state.getTurn(fixture.info.id, turnID)).terminal).toEqual(recovered.terminal)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )

  it.instance("promotes queued steering only at the exact owner boundary and interrupts by Turn ID", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("strict steer and interrupt")
      const state = yield* SessionRunState.Service
      const events = yield* EventV2Bridge.Service
      const turnID = Turn.ID.create()
      const inputID = Turn.InputID.create()
      const envelope = { request: "initial" }
      const workEntered = yield* Deferred.make<void>()
      const allowBoundary = yield* Deferred.make<void>()
      const boundaryResult = yield* Deferred.make<boolean>()
      const steerStarted = yield* Deferred.make<void>()
      const keepRunning = yield* Deferred.make<void>()
      yield* Effect.addFinalizer(() =>
        Effect.all([Deferred.succeed(allowBoundary, undefined), Deferred.succeed(keepRunning, undefined)], {
          discard: true,
        }),
      )
      const work = Effect.gen(function* () {
        yield* Deferred.succeed(workEntered, undefined)
        yield* Deferred.await(allowBoundary)
        while (true) {
          const promoted = yield* state.promoteSteer(fixture.info.id, turnID)
          if (promoted) {
            yield* Deferred.succeed(boundaryResult, true)
            break
          }
          yield* Effect.yieldNow
        }
        yield* Deferred.await(keepRunning)
        return { outcome: "completed" as const, reason: "normal" as const }
      })

      yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
        admit: admitRootTurn({
          sessionID: fixture.info.id,
          turnID,
          inputID,
          messageID: fixture.user.id,
          envelope,
        }),
        work,
      })
      yield* awaitDeferred(workEntered, "Turn work did not reach steering boundary")
      yield* recordCompletedModelSample({
        sessionID: fixture.info.id,
        turnID,
        parentMessageID: fixture.user.id,
        directory: fixture.info.directory,
      })

      const steerMessage = yield* fixture.session.updateMessage({
        ...fixture.user,
        id: MessageID.ascending(),
        time: { created: Date.now() + 1 },
      })
      yield* fixture.session.updatePart({
        id: PartID.ascending(),
        messageID: steerMessage.id,
        sessionID: fixture.info.id,
        type: "text" as const,
        text: "steer exactly this Turn",
      })
      const occurrence = yield* admitOccurrence(fixture.info.id, steerMessage.id)
      const steerInputID = Turn.InputID.create()
      const steerEnvelope = { request: "steer" }
      const steerFingerprint = TurnLifecycle.envelopeFingerprint(steerEnvelope)
      const promote = events
        .transaction((tx) =>
          TurnLifecycle.promoteSteer(tx, {
            sessionID: fixture.info.id,
            expectedTurnID: turnID,
            inputID: steerInputID,
            messageID: steerMessage.id,
            occurrenceID: occurrence.id,
            envelope: steerEnvelope,
            timeAdmitted: Date.now(),
          }).pipe(Effect.map((result) => ({ result }))),
        )
        .pipe(Effect.map((result) => result.result))
      const steering = yield* state
        .steerTurn({
          sessionID: fixture.info.id,
          expectedTurnID: turnID,
          inputID: steerInputID,
          envelopeFingerprint: steerFingerprint,
          replay: Deferred.succeed(steerStarted, undefined).pipe(Effect.as(undefined)),
          promote,
        })
        .pipe(Effect.forkChild)

      yield* awaitDeferred(steerStarted, "steer did not enter the exact owner queue")
      yield* Deferred.succeed(allowBoundary, undefined)
      expect(yield* awaitDeferred(boundaryResult, "steer was not considered at the safe boundary")).toBe(true)
      const promoted = yield* Fiber.join(steering).pipe(Effect.timeout("5 seconds"))
      expect(promoted.id).toBe(steerInputID)
      expect(promoted.turnID).toBe(turnID)

      const replay = yield* state
        .steerTurn({
          sessionID: fixture.info.id,
          expectedTurnID: turnID,
          inputID: steerInputID,
          envelopeFingerprint: steerFingerprint,
          replay: Effect.succeed(promoted),
          promote: Effect.die("exact steer replay must not promote twice"),
        })
        .pipe(Effect.timeout("5 seconds"))
      expect(replay).toEqual(promoted)

      const terminal = yield* state.interruptTurn(fixture.info.id, turnID).pipe(Effect.timeout("5 seconds"))
      expect(terminal.terminal).toMatchObject({ outcome: "interrupted", reason: "learner_interrupt" })
      yield* Deferred.succeed(keepRunning, undefined).pipe(Effect.ignore)
      yield* fixture.session.remove(fixture.info.id).pipe(Effect.timeout("5 seconds"))
    }),
  )

  it.instance("joins an exact pending steer retry and rejects conflicting reuse before promotion", () =>
    Effect.gen(function* () {
      const fixture = yield* seedTurnFixture("pending steer exact retry")
      const state = yield* SessionRunState.Service
      const events = yield* EventV2Bridge.Service
      const turnID = Turn.ID.create()
      const envelope = { request: "initial" }
      const workEntered = yield* Deferred.make<void>()
      const allowBoundary = yield* Deferred.make<void>()
      const keepRunning = yield* Deferred.make<void>()
      const firstReplayCompleted = yield* Deferred.make<void>()
      const retryReplayCompleted = yield* Deferred.make<void>()
      const promotionCompleted = yield* Deferred.make<boolean>()

      yield* state.startTurn({
        sessionID: fixture.info.id,
        turnID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
        admit: admitRootTurn({
          sessionID: fixture.info.id,
          turnID,
          inputID: Turn.InputID.create(),
          messageID: fixture.user.id,
          envelope,
        }),
        work: Effect.gen(function* () {
          yield* Deferred.succeed(workEntered, undefined)
          yield* Deferred.await(allowBoundary)
          yield* Deferred.succeed(promotionCompleted, yield* state.promoteSteer(fixture.info.id, turnID))
          yield* Deferred.await(keepRunning)
          return { outcome: "completed" as const, reason: "normal" as const }
        }),
      })
      yield* awaitDeferred(workEntered, "Turn work did not reach pending-steer boundary")
      yield* recordCompletedModelSample({
        sessionID: fixture.info.id,
        turnID,
        parentMessageID: fixture.user.id,
        directory: fixture.info.directory,
      })

      const steerMessage = yield* fixture.session.updateMessage({
        ...fixture.user,
        id: MessageID.ascending(),
        time: { created: Date.now() + 1 },
      })
      yield* fixture.session.updatePart({
        id: PartID.ascending(),
        messageID: steerMessage.id,
        sessionID: fixture.info.id,
        type: "text" as const,
        text: "retry this exact pending steer",
      })
      const occurrence = yield* admitOccurrence(fixture.info.id, steerMessage.id)
      const inputID = Turn.InputID.create()
      const steerEnvelope = { request: "steer" }
      const fingerprint = TurnLifecycle.envelopeFingerprint(steerEnvelope)
      let promotions = 0
      const promote = Effect.gen(function* () {
        promotions += 1
        return yield* events
          .transaction((tx) =>
            TurnLifecycle.promoteSteer(tx, {
              sessionID: fixture.info.id,
              expectedTurnID: turnID,
              inputID,
              messageID: steerMessage.id,
              occurrenceID: occurrence.id,
              envelope: steerEnvelope,
              timeAdmitted: Date.now(),
            }).pipe(Effect.map((result) => ({ result }))),
          )
          .pipe(Effect.map((result) => result.result))
      })
      const first = yield* state
        .steerTurn({
          sessionID: fixture.info.id,
          expectedTurnID: turnID,
          inputID,
          envelopeFingerprint: fingerprint,
          replay: Deferred.succeed(firstReplayCompleted, undefined).pipe(Effect.as(undefined)),
          promote,
        })
        .pipe(Effect.forkChild)
      yield* awaitDeferred(firstReplayCompleted, "first exact steer retry did not finish replay lookup")
      yield* Effect.yieldNow

      const retry = yield* state
        .steerTurn({
          sessionID: fixture.info.id,
          expectedTurnID: turnID,
          inputID,
          envelopeFingerprint: fingerprint,
          replay: Deferred.succeed(retryReplayCompleted, undefined).pipe(Effect.as(undefined)),
          promote: Effect.die("joined exact retry must not install replacement promotion"),
        })
        .pipe(Effect.forkChild)
      yield* awaitDeferred(retryReplayCompleted, "exact retry did not finish replay lookup")
      yield* Effect.yieldNow
      const conflict = yield* state
        .steerTurn({
          sessionID: fixture.info.id,
          expectedTurnID: turnID,
          inputID,
          envelopeFingerprint: TurnLifecycle.envelopeFingerprint({ request: "conflicting steer" }),
          replay: Effect.succeed(undefined),
          promote: Effect.die("conflicting retry must not promote"),
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(conflict)).toBe(true)
      if (Exit.isFailure(conflict)) expect(Cause.squash(conflict.cause)).toBeInstanceOf(Turn.AdmissionConflictError)

      yield* Deferred.succeed(allowBoundary, undefined)
      expect(yield* awaitDeferred(promotionCompleted, "pending exact steer was not promoted at the boundary")).toBe(
        true,
      )
      const [firstResult, retryResult] = yield* Effect.all([Fiber.join(first), Fiber.join(retry)])
      expect(firstResult).toEqual(retryResult)
      expect(firstResult.id).toBe(inputID)
      expect(promotions).toBe(1)

      const terminal = yield* state.interruptTurn(fixture.info.id, turnID)
      expect(terminal.terminal).toMatchObject({ outcome: "interrupted", reason: "learner_interrupt" })
      yield* Deferred.succeed(keepRunning, undefined).pipe(Effect.ignore)
      yield* fixture.session.remove(fixture.info.id)
    }),
  )
})
