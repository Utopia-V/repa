import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Course } from "@opencode-ai/core/course"
import { CourseSelectionAcceptanceEffectTable } from "@opencode-ai/core/course/sql"
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { Session as SessionNs } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideInstance, tmpdir, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { GlobalBus } from "@/bus/global"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceStore } from "@/project/instance-store"
import { InstanceBootstrap } from "@/project/bootstrap"
import { Database } from "@opencode-ai/core/database/database"
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
import { eq } from "drizzle-orm"
import { PartTable, SessionTable } from "@opencode-ai/core/session/sql"
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
  timeAdmitted = Date.now(),
) {
  const events = yield* EventV2Bridge.Service
  const admitted = yield* events.transaction((tx) =>
    Occurrence.admit(tx, {
      admission: LearnerAdmission.interactive(),
      sessionID,
      messageID,
      timeAdmitted,
    }).pipe(
      Effect.map((result) => ({ result })),
      Effect.orDie,
    ),
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
    tx
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
        status: "error",
        settlement: {
          outcome: "error",
          code: "permission_rejected",
          settlementTime: time,
          settlementOrder: 0,
        },
        time_admitted: time,
        time_settled: time,
        settlement_order: 0,
      })
      .run()
      .pipe(Effect.orDie, Effect.as({ result: undefined })),
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

      const info = yield* session.create({})
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

      const info = yield* session.create({})
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

      const info = yield* session.create({})
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
        const info = yield* session.create({})

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
      const info = yield* provideInstance(dir)(session.create({ title: "remove-without-instance" }))

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
      const created = yield* Effect.acquireRelease(session.create({ title: "with-meta", metadata: meta }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )
      const saved = yield* session.get(created.id)
      const fork = yield* Effect.acquireRelease(session.fork({ sessionID: created.id }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
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
      const info = yield* session.create({ title: "no-effect ownership" })
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
      const info = yield* session.create({ title: "admitted Part immutability" })
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
      const info = yield* session.create({ title: "applied retention" })
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
          committedSelection: settled.result.outcome === "applied" ? settled.result.committedSelection : undefined,
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
      if (!invocationRow?.effect_id) return
      expect(
        yield* database.db
          .select()
          .from(LearningCommandReceiptTable)
          .where(eq(LearningCommandReceiptTable.invocation_part_id, tool.id))
          .get()
          .pipe(Effect.orDie),
      ).toBeDefined()
      expect(
        yield* database.db
          .select()
          .from(CourseSelectionAcceptanceEffectTable)
          .where(eq(CourseSelectionAcceptanceEffectTable.id, invocationRow.effect_id))
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
          const info = yield* session.create({ title: "reopened applied retention" })
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
          ).toMatchObject({ status: "applied", effect_id: persisted.effectID })
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
      const committed = yield* session.create({ title: "committed deletion" })
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

      const rolledBack = yield* session.create({ title: "rolled back deletion" })
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
      const reopened = yield* session.fork({ sessionID: rolledBack.id })
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
      const info = yield* session.create({ title: "committed interrupted deletion" })
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
      const info = yield* session.create({ title: "delayed patch" })
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

  it.instance("fork copies admitted User lineage without inferring it for legacy history", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const source = yield* Effect.acquireRelease(session.create({ title: "source" }), (info) =>
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

      const fork = yield* Effect.acquireRelease(session.fork({ sessionID: source.id }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
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

  it.instance("fork holds the source lifecycle before publishing its destination", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const database = yield* Database.Service
      const source = yield* session.create({ title: "source lifecycle" })
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
      const originalPublish = events.publish
      const mutableEvents = events as { publish: typeof events.publish }
      mutableEvents.publish = (definition, data, options) =>
        definition.type === SessionV1.Event.Created.type &&
        (data as typeof SessionV1.Event.Created.data.Type).sessionID !== source.id
          ? Deferred.succeed(destinationStarted, undefined).pipe(
              Effect.andThen(Deferred.await(releaseDestination)),
              Effect.andThen(originalPublish(definition, data, options)),
            )
          : originalPublish(definition, data, options)
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(releaseDestination, undefined).pipe(
          Effect.andThen(
            Effect.sync(() => {
              mutableEvents.publish = originalPublish
            }),
          ),
          Effect.asVoid,
        ),
      )

      const forkFiber = yield* session.fork({ sessionID: source.id }).pipe(Effect.forkChild)
      yield* Deferred.await(destinationStarted)
      const deletion = yield* session.remove(source.id).pipe(Effect.exit)
      expect(Exit.isFailure(deletion)).toBe(true)
      if (Exit.isFailure(deletion)) expect(Cause.squash(deletion.cause)).toMatchObject({ _tag: "SessionBusyError" })
      expect((yield* session.get(source.id)).id).toBe(source.id)

      yield* Deferred.succeed(releaseDestination, undefined)
      const forked = yield* Fiber.join(forkFiber)
      mutableEvents.publish = originalPublish
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
      const source = yield* session.create({ title: "settled source" })
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
        tx
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
            status: "error",
            settlement: {
              outcome: "error",
              code: "permission_rejected",
              settlementTime: settledAt,
              settlementOrder: 0,
            },
            time_admitted: settledAt,
            time_settled: settledAt,
            settlement_order: 0,
          })
          .run()
          .pipe(Effect.orDie, Effect.as({ result: undefined })),
      )

      const fork = yield* session.fork({ sessionID: source.id })
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

      const secondFork = yield* session.fork({ sessionID: fork.id })
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
      const created = yield* Effect.acquireRelease(session.create({ title: "empty-meta" }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )
      const saved = yield* session.get(created.id)

      expect(created.metadata).toBeUndefined()
      expect(saved.metadata).toBeUndefined()
    }),
  )
})
