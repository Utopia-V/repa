import { Course } from "@opencode-ai/core/course"
import { CourseSelectionAcceptanceEffectTable } from "@opencode-ai/core/course/sql"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { Turn } from "@opencode-ai/schema/turn"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Exit, Fiber, Layer, Schema } from "effect"
import { join } from "path"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const permission = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    ask: (input) => {
      const denied = input.ruleset.findLast(
        (rule) =>
          (rule.permission === "*" || rule.permission === input.permission) &&
          (rule.pattern === "*" || input.patterns.includes(rule.pattern)),
      )
      if (denied?.action === "deny") return Effect.fail(new PermissionV1.DeniedError({ ruleset: input.ruleset }))
      return Effect.void
    },
    reply: () => Effect.void,
    list: () => Effect.succeed([]),
  }),
)
const root = LayerNode.group([
  LearningCommandRuntime.node,
  Session.node,
  Course.node,
  Database.node,
  EventV2Bridge.node,
  SessionProjector.node,
])
const it = testEffect(
  LayerNode.compile(root, [
    [Database.node, database],
    [Permission.node, permission],
  ]),
)
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

it.effect("applies once and preserves exact physical and semantic replay", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const runtime = yield* LearningCommandRuntime.Service
    const first = yield* seedCourse(courses, "Algorithms", "Conceptual")
    const alternative = yield* courses.createView({
      courseID: first.course.id,
      name: "Practice",
      expectedCourseVersion: 0,
      authorship: Course.Authorship.tutorProposed(),
      revision: { items: [{ key: "root", title: "Graph practice" }] },
    })
    const input = acceptance(first.course.id, first.view.revision.id)
    const interaction = yield* seedInteraction(db, "apply", input)

    yield* runtime.prepare(input, interaction.registration)
    const applied = yield* runtime.execute(input, context(interaction.registration, "allow"))
    expect(JSON.parse(applied.output)).toMatchObject({
      outcome: "applied",
      courseID: first.course.id,
      revisionID: first.view.revision.id,
      previousSelection: { version: 0 },
      committedSelection: { revisionID: first.view.revision.id, version: 1 },
    })
    expect((yield* courses.getCourse(first.course.id)).selection).toEqual({
      revisionID: first.view.revision.id,
      version: 1,
    })
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(applied)
    expect(
      yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
        .get(),
    ).toMatchObject({
      turn_id: interaction.turnID,
      input_id: interaction.inputID,
      occurrence_id: interaction.occurrenceID,
    })
    expect(yield* sequence(db, interaction.sessionID)).toBe(0)

    yield* runtime.prepare(input, interaction.registration)
    expect(yield* runtime.execute(input, context(interaction.registration, "deny"))).toEqual(applied)
    expect(yield* sequence(db, interaction.sessionID)).toBe(0)

    expect(
      yield* runtime.prepare(input, { ...interaction.registration, inputID: Turn.InputID.create() }).pipe(Effect.flip),
    ).toMatchObject({ _tag: "LearningCommand.InvocationConflictError" })
    expect(
      yield* runtime.prepare(input, { ...interaction.registration, causalOccurrenceID: undefined }).pipe(Effect.flip),
    ).toMatchObject({ _tag: "LearningCommand.InvocationConflictError" })

    const changed = { ...input, expectedCourseVersion: 1 }
    expect(yield* runtime.prepare(changed, interaction.registration).pipe(Effect.flip)).toMatchObject({
      _tag: "LearningCommand.InvocationConflictError",
    })
    expect(yield* sequence(db, interaction.sessionID)).toBe(0)

    const duplicate = yield* insertAssistant(db, interaction, "duplicate", input)
    yield* runtime.prepare(input, duplicate)
    const alreadyApplied = yield* runtime.execute(input, context(duplicate, "deny"))
    expect(JSON.parse(alreadyApplied.output)).toMatchObject({
      outcome: "already_applied",
      effectID: JSON.parse(applied.output).effectID,
      relation: "active",
      currentSelection: { revisionID: first.view.revision.id, version: 1 },
    })
    expect((yield* courses.getCourse(first.course.id)).selection.version).toBe(1)

    const conflictInput = acceptance(first.course.id, alternative.revision.id)
    const conflicting = yield* insertAssistant(db, interaction, "semantic-conflict", conflictInput)
    yield* runtime.prepare(conflictInput, conflicting)
    expect(JSON.parse((yield* runtime.execute(conflictInput, context(conflicting, "allow"))).output)).toMatchObject({
      outcome: "error",
      code: "semantic_conflict",
      detail: { acceptedRevisionID: first.view.revision.id },
    })
  }),
)

it.effect("returns the committed exact result when terminal notification interrupts", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const events = yield* EventV2Bridge.Service
    const runtime = yield* LearningCommandRuntime.Service
    const course = yield* seedCourse(courses, "Observer interruption", "Main")
    const input = acceptance(course.course.id, course.view.revision.id)
    const interaction = yield* seedInteraction(db, "observer-interrupt", input)
    yield* runtime.prepare(input, interaction.registration)

    let observerRuns = 0
    const unsubscribe = yield* events.listen((event) => {
      if (event.type !== SessionV1.Event.PartUpdated.type) return Effect.void
      const data = event.data as typeof SessionV1.Event.PartUpdated.data.Type
      if (data.part.id !== interaction.registration.partID) return Effect.void
      if (data.part.type !== "tool" || data.part.state.status !== "completed") return Effect.void
      return Effect.sync(() => {
        observerRuns++
      }).pipe(Effect.andThen(Effect.interrupt))
    })
    yield* Effect.addFinalizer(() => unsubscribe)

    const first = yield* runtime.execute(input, context(interaction.registration, "allow"))
    expect(JSON.parse(first.output)).toMatchObject({ outcome: "applied", courseID: course.course.id })
    expect(observerRuns).toBe(1)
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(first)
    expect((yield* courses.getCourse(course.course.id)).selection.version).toBe(1)
    expect(yield* db.select().from(LearningCommandInvocationTable).all()).toHaveLength(1)
    expect(yield* db.select().from(LearningCommandReceiptTable).all()).toHaveLength(1)
    expect(yield* db.select().from(CourseSelectionAcceptanceEffectTable).all()).toHaveLength(1)
    expect(yield* sequence(db, interaction.sessionID)).toBe(0)

    expect(yield* runtime.execute(input, context(interaction.registration, "deny"))).toEqual(first)
    expect(observerRuns).toBe(1)
    expect(yield* sequence(db, interaction.sessionID)).toBe(0)
  }),
)

it.effect("reconciles terminal notification interruption during prepare and recovery", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const events = yield* EventV2Bridge.Service
    const runtime = yield* LearningCommandRuntime.Service
    const targets = new Set<SessionV1.PartID>()
    let observerRuns = 0
    const unsubscribe = yield* events.listen((event) => {
      if (event.type !== SessionV1.Event.PartUpdated.type) return Effect.void
      const data = event.data as typeof SessionV1.Event.PartUpdated.data.Type
      if (!targets.has(data.part.id) || data.part.type !== "tool" || data.part.state.status !== "completed") {
        return Effect.void
      }
      return Effect.sync(() => {
        observerRuns++
      }).pipe(Effect.andThen(Effect.interrupt))
    })
    yield* Effect.addFinalizer(() => unsubscribe)

    const course = yield* seedCourse(courses, "Prepare observer interruption", "Main")
    const input = acceptance(course.course.id, course.view.revision.id)
    const interaction = yield* seedInteraction(db, "prepare-observer-source", input)
    yield* runtime.prepare(input, interaction.registration)
    yield* runtime.execute(input, context(interaction.registration, "allow"))

    const duplicate = yield* insertAssistant(db, interaction, "prepare-observer-duplicate", input)
    targets.add(duplicate.partID)
    yield* runtime.prepare(input, duplicate)
    expect(JSON.parse((yield* runtime.execute(input, context(duplicate, "deny"))).output)).toMatchObject({
      outcome: "already_applied",
    })

    const interruptedCourse = yield* seedCourse(courses, "Recovery observer interruption", "Main")
    const interruptedInput = acceptance(interruptedCourse.course.id, interruptedCourse.view.revision.id)
    const interrupted = yield* seedInteraction(db, "recovery-observer", interruptedInput)
    yield* runtime.prepare(interruptedInput, interrupted.registration)
    targets.add(interrupted.registration.partID)
    expect(yield* runtime.interrupt(interrupted.registration)).toBe(true)
    expect(JSON.parse((yield* exactPartResult(db, interrupted.registration.partID)).output)).toMatchObject({
      outcome: "error",
      code: "interrupted",
    })
    expect(observerRuns).toBe(2)
  }),
)

it.effect("never revives an audit-only applied invocation after its live Part is gone", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const runtime = yield* LearningCommandRuntime.Service
    const course = yield* seedCourse(courses, "Audit-only algorithms", "Main")
    const input = acceptance(course.course.id, course.view.revision.id)
    const interaction = yield* seedInteraction(db, "audit-only-applied", input)
    yield* runtime.prepare(input, interaction.registration)
    yield* runtime.execute(input, context(interaction.registration, "allow"))
    const eventSequence = yield* sequence(db, interaction.sessionID)
    yield* db.delete(PartTable).where(eq(PartTable.id, interaction.registration.partID)).run()

    expect(yield* runtime.prepare(input, interaction.registration).pipe(Effect.flip)).toMatchObject({
      _tag: "LearningCommand.InvocationTranscriptUnavailableError",
    })
    expect(
      Exit.isFailure(yield* runtime.execute(input, context(interaction.registration, "deny")).pipe(Effect.exit)),
    ).toBe(true)
    expect(
      yield* db.select().from(PartTable).where(eq(PartTable.id, interaction.registration.partID)).get(),
    ).toBeUndefined()
    expect((yield* courses.getCourse(course.course.id)).selection).toEqual({
      revisionID: course.view.revision.id,
      version: 1,
    })
    expect(yield* sequence(db, interaction.sessionID)).toBe(eventSequence)
  }),
)

it.effect("settles permission denial and crash recovery as exact completed Parts", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const runtime = yield* LearningCommandRuntime.Service
    const events = yield* EventV2Bridge.Service

    const deniedCourse = yield* seedCourse(courses, "Operating systems", "Main")
    const deniedInput = acceptance(deniedCourse.course.id, deniedCourse.view.revision.id)
    const deniedInteraction = yield* seedInteraction(db, "denied", deniedInput)
    yield* runtime.prepare(deniedInput, deniedInteraction.registration)
    const denied = yield* runtime.execute(deniedInput, context(deniedInteraction.registration, "deny"))
    expect(JSON.parse(denied.output)).toMatchObject({ outcome: "error", code: "permission_rejected" })
    expect(yield* exactPartResult(db, deniedInteraction.registration.partID)).toEqual(denied)
    expect((yield* courses.getCourse(deniedCourse.course.id)).selection).toEqual({
      revisionID: undefined,
      version: 0,
    })
    const deniedSequence = yield* sequence(db, deniedInteraction.sessionID)

    yield* runtime.prepare(deniedInput, deniedInteraction.registration)
    const replayedDenied = yield* runtime.execute(deniedInput, context(deniedInteraction.registration, "allow"))
    expect(JSON.stringify(replayedDenied)).toBe(JSON.stringify(denied))
    expect(yield* exactPartResult(db, deniedInteraction.registration.partID)).toEqual(denied)
    expect(yield* sequence(db, deniedInteraction.sessionID)).toBe(deniedSequence)
    expect((yield* courses.getCourse(deniedCourse.course.id)).selection).toEqual({
      revisionID: undefined,
      version: 0,
    })

    const interruptedCourse = yield* seedCourse(courses, "Databases", "Main")
    const interruptedInput = acceptance(interruptedCourse.course.id, interruptedCourse.view.revision.id)
    const interruptedInteraction = yield* seedInteraction(db, "interrupted", interruptedInput)
    yield* runtime.prepare(interruptedInput, interruptedInteraction.registration)
    const pending = yield* db
      .select()
      .from(PartTable)
      .where(eq(PartTable.id, interruptedInteraction.registration.partID))
      .get()
    if (!pending || pending.data.type !== "tool") throw new Error("Expected pending learning-command Part")
    const pendingPart = decodeToolPart({
      ...pending.data,
      id: pending.id,
      messageID: pending.message_id,
      sessionID: pending.session_id,
    })
    expect(pendingPart.state.status).toBe("pending")
    expect(
      yield* events.transaction((tx) =>
        LearningCommand.exactSettlement(tx, interruptedInteraction.registration.partID).pipe(
          Effect.map((settlement) => ({ result: settlement }) as const),
        ),
      ),
    ).toEqual({ result: undefined })

    yield* LearningCommandRuntime.recoverAdmitted(events)
    const recovered = yield* exactPartResult(db, interruptedInteraction.registration.partID)
    expect(JSON.parse(recovered.output)).toMatchObject({ outcome: "error", code: "interrupted" })
    expect((yield* courses.getCourse(interruptedCourse.course.id)).selection).toEqual({
      revisionID: undefined,
      version: 0,
    })

    const legacyCourse = yield* seedCourse(courses, "Legacy admitted command", "Main")
    const legacyInput = acceptance(legacyCourse.course.id, legacyCourse.view.revision.id)
    const legacyInteraction = yield* seedInteraction(db, "legacy-interrupted", legacyInput)
    yield* runtime.prepare(legacyInput, legacyInteraction.registration)
    yield* db
      .update(LearningCommandInvocationTable)
      .set({ turn_id: null, input_id: null })
      .where(eq(LearningCommandInvocationTable.part_id, legacyInteraction.registration.partID))
      .run()
    yield* LearningCommandRuntime.recoverAdmitted(events)
    expect(JSON.parse((yield* exactPartResult(db, legacyInteraction.registration.partID)).output)).toMatchObject({
      outcome: "error",
      code: "interrupted",
    })
    expect((yield* courses.getCourse(legacyCourse.course.id)).selection).toEqual({
      revisionID: undefined,
      version: 0,
    })
  }),
)

test("reopens stored success and recovers admitted work without re-execution", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "learning-command-reopen.sqlite")
  const persisted = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const runtime = yield* LearningCommandRuntime.Service
      const events = yield* EventV2Bridge.Service

      const appliedCourse = yield* seedCourse(courses, "Persistent algorithms", "Main")
      const appliedInput = acceptance(appliedCourse.course.id, appliedCourse.view.revision.id)
      const appliedInteraction = yield* seedInteraction(db, "reopen-applied", appliedInput)
      yield* runtime.prepare(appliedInput, appliedInteraction.registration)
      const applied = yield* runtime.execute(appliedInput, context(appliedInteraction.registration, "allow"))

      const interruptedCourse = yield* seedCourse(courses, "Persistent databases", "Main")
      const interruptedInput = acceptance(interruptedCourse.course.id, interruptedCourse.view.revision.id)
      const interruptedInteraction = yield* seedInteraction(db, "reopen-interrupted", interruptedInput)
      yield* runtime.prepare(interruptedInput, interruptedInteraction.registration)
      const sessions = yield* Session.Service
      const interruptedPart = yield* sessions.getPart({
        sessionID: interruptedInteraction.sessionID,
        messageID: interruptedInteraction.registration.assistantMessageID,
        partID: interruptedInteraction.registration.partID,
      })
      if (!interruptedPart || interruptedPart.type !== "tool" || interruptedPart.state.status !== "pending") {
        return yield* Effect.die("Expected admitted learning-command Part before reopen")
      }
      expect(
        Exit.isFailure(
          yield* sessions
            .updatePart({
              ...interruptedPart,
              state: {
                ...interruptedPart.state,
                input: { ...interruptedPart.state.input, expectedCourseVersion: 1 },
              },
            })
            .pipe(Effect.exit),
        ),
      ).toBe(true)
      expect(
        yield* sessions.getPart({
          sessionID: interruptedInteraction.sessionID,
          messageID: interruptedInteraction.registration.assistantMessageID,
          partID: interruptedInteraction.registration.partID,
        }),
      ).toEqual(interruptedPart)

      const tombstonedCourse = yield* seedCourse(courses, "Persistent operating systems", "Main")
      const tombstonedInput = acceptance(tombstonedCourse.course.id, tombstonedCourse.view.revision.id)
      const tombstonedInteraction = yield* seedInteraction(db, "reopen-tombstoned", tombstonedInput)
      yield* runtime.prepare(tombstonedInput, tombstonedInteraction.registration)
      const tombstoned = yield* runtime.execute(tombstonedInput, context(tombstonedInteraction.registration, "deny"))
      yield* events.transaction((tx) =>
        LearningCommand.removeOccurrencePresentation(tx, {
          messageID: tombstonedInteraction.userMessageID,
          timeDeleted: Date.now(),
        }).pipe(
          Effect.orDie,
          Effect.as({
            result: undefined,
            event: {
              definition: SessionV1.Event.MessageRemoved,
              data: {
                sessionID: tombstonedInteraction.sessionID,
                messageID: tombstonedInteraction.userMessageID,
              },
            },
          }),
        ),
      )

      return {
        applied,
        appliedCourseID: appliedCourse.course.id,
        appliedRevisionID: appliedCourse.view.revision.id,
        appliedInput,
        appliedRegistration: appliedInteraction.registration,
        interruptedCourseID: interruptedCourse.course.id,
        interruptedInput,
        interruptedRegistration: interruptedInteraction.registration,
        tombstoned,
        tombstonedCourseID: tombstonedCourse.course.id,
        tombstonedInput,
        tombstonedRegistration: tombstonedInteraction.registration,
      }
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )

  await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const runtime = yield* LearningCommandRuntime.Service

      expect((yield* courses.getCourse(persisted.appliedCourseID)).selection).toEqual({
        revisionID: persisted.appliedRevisionID,
        version: 1,
      })
      const appliedSequence = yield* sequence(db, persisted.appliedRegistration.sessionID)
      yield* runtime.prepare(persisted.appliedInput, persisted.appliedRegistration)
      expect(yield* runtime.execute(persisted.appliedInput, context(persisted.appliedRegistration, "deny"))).toEqual(
        persisted.applied,
      )
      expect(yield* sequence(db, persisted.appliedRegistration.sessionID)).toBe(appliedSequence)

      const interrupted = yield* exactPartResult(db, persisted.interruptedRegistration.partID)
      expect(JSON.parse(interrupted.output)).toMatchObject({ outcome: "error", code: "interrupted" })
      expect((yield* courses.getCourse(persisted.interruptedCourseID)).selection).toEqual({
        revisionID: undefined,
        version: 0,
      })
      const interruptedSequence = yield* sequence(db, persisted.interruptedRegistration.sessionID)
      yield* runtime.prepare(persisted.interruptedInput, persisted.interruptedRegistration)
      expect(
        yield* runtime.execute(persisted.interruptedInput, context(persisted.interruptedRegistration, "allow")),
      ).toEqual(interrupted)
      expect(yield* sequence(db, persisted.interruptedRegistration.sessionID)).toBe(interruptedSequence)

      const tombstonedSequence = yield* sequence(db, persisted.tombstonedRegistration.sessionID)
      yield* runtime.prepare(persisted.tombstonedInput, persisted.tombstonedRegistration)
      expect(
        yield* runtime.execute(persisted.tombstonedInput, context(persisted.tombstonedRegistration, "allow")),
      ).toEqual(persisted.tombstoned)
      expect(yield* exactPartResult(db, persisted.tombstonedRegistration.partID)).toEqual(persisted.tombstoned)
      expect(yield* sequence(db, persisted.tombstonedRegistration.sessionID)).toBe(tombstonedSequence)
      expect((yield* courses.getCourse(persisted.tombstonedCourseID)).selection).toEqual({
        revisionID: undefined,
        version: 0,
      })
      expect(
        yield* runtime
          .prepare({ ...persisted.tombstonedInput, expectedCourseVersion: 1 }, persisted.tombstonedRegistration)
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "LearningCommand.InvocationConflictError" })
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )
})

test("joins only active execution and never replays from a completed cache", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "learning-command-single-flight.sqlite")
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let asks = 0
  const blockingPermission = Layer.succeed(
    Permission.Service,
    Permission.Service.of({
      ask: (input) => {
        asks++
        entered.resolve()
        return Effect.promise(() => release.promise).pipe(
          Effect.flatMap(() => Effect.fail(new PermissionV1.DeniedError({ ruleset: input.ruleset }))),
        )
      },
      reply: () => Effect.void,
      list: () => Effect.succeed([]),
    }),
  )

  await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const events = yield* EventV2Bridge.Service
      const runtime = yield* LearningCommandRuntime.Service
      const sessions = yield* Session.Service
      const course = yield* seedCourse(courses, "Single-flight operating systems", "Main")
      const input = acceptance(course.course.id, course.view.revision.id)
      const interaction = yield* seedInteraction(db, "single-flight", input)
      yield* runtime.prepare(input, interaction.registration)

      const executions = yield* Effect.all(
        [
          runtime.execute(input, context(interaction.registration, "allow")),
          runtime.execute(input, context(interaction.registration, "allow")),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.forkChild)
      yield* Effect.promise(() => entered.promise)
      const pending = yield* sessions.getPart({
        sessionID: interaction.sessionID,
        messageID: interaction.registration.assistantMessageID,
        partID: interaction.registration.partID,
      })
      if (!pending || pending.type !== "tool" || pending.state.status !== "pending") {
        return yield* Effect.die("Expected permission-wait learning-command Part")
      }
      const admittedSequence = yield* sequence(db, interaction.sessionID)
      expect(
        Exit.isFailure(
          yield* sessions
            .updatePart({
              ...pending,
              state: { ...pending.state, input: { ...pending.state.input, expectedCourseVersion: 1 } },
            })
            .pipe(Effect.exit),
        ),
      ).toBe(true)
      expect(
        yield* sessions.getPart({
          sessionID: interaction.sessionID,
          messageID: interaction.registration.assistantMessageID,
          partID: interaction.registration.partID,
        }),
      ).toEqual(pending)
      expect(yield* sequence(db, interaction.sessionID)).toBe(admittedSequence)
      expect(yield* runtime.interrupt(interaction.registration)).toBe(true)
      const interruptedSequence = yield* sequence(db, interaction.sessionID)
      release.resolve()
      const results = yield* Fiber.join(executions)
      expect(results[0]).toEqual(results[1])
      expect(JSON.parse(results[0].output)).toMatchObject({ outcome: "error", code: "interrupted" })
      expect(asks).toBe(1)
      expect(yield* sequence(db, interaction.sessionID)).toBe(interruptedSequence)

      expect(yield* runtime.execute(input, context(interaction.registration, "allow"))).toEqual(results[0])
      expect(asks).toBe(1)

      yield* events.transaction((tx) =>
        LearningCommand.removeNoEffectInvocationsForAssistant(tx, interaction.registration.assistantMessageID).pipe(
          Effect.orDie,
          Effect.as({
            result: undefined,
            event: {
              definition: SessionV1.Event.MessageRemoved,
              data: {
                sessionID: interaction.sessionID,
                messageID: interaction.registration.assistantMessageID,
              },
            },
          }),
        ),
      )
      expect(
        Exit.isFailure(yield* runtime.execute(input, context(interaction.registration, "allow")).pipe(Effect.exit)),
      ).toBe(true)
      expect(
        yield* db.select().from(PartTable).where(eq(PartTable.id, interaction.registration.partID)).get(),
      ).toBeUndefined()
    }).pipe(Effect.provide(runtimeLayer(filename, blockingPermission)), Effect.scoped),
  )
})

function acceptance(courseID: Course.CourseID, revisionID: Course.RevisionID) {
  return {
    courseID,
    revisionID,
    expectedCourseVersion: 0,
    expectedSelectionRevisionID: null,
    expectedSelectionVersion: 0,
    expectedViewVersion: 0,
    expectedRevisionVersion: 0,
  }
}

function context(registration: LearningCommandRuntime.Registration, action: "allow" | "deny") {
  return {
    sessionID: registration.sessionID,
    messageID: registration.assistantMessageID,
    callID: registration.callID,
    abort: new AbortController().signal,
    extra: {
      toolCall: registration,
      permissionRuleset: [
        {
          permission: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          pattern: "*",
          action,
        },
      ],
    },
  } satisfies LearningCommandRuntime.ExecuteContext
}

function runtimeLayer(filename: string, permissionLayer = permission) {
  return LayerNode.compile(root, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
    [Permission.node, permissionLayer],
  ])
}

function seedCourse(courses: Course.Interface, title: string, view: string) {
  return Effect.gen(function* () {
    const course = yield* courses.createCourse({ title })
    const created = yield* courses.createView({
      courseID: course.id,
      name: view,
      expectedCourseVersion: 0,
      authorship: Course.Authorship.learnerAuthored(),
      revision: { items: [{ key: "root", title }] },
    })
    return { course, view: created }
  })
}

function seedInteraction(db: Database.Interface["db"], suffix: string, input: ReturnType<typeof acceptance>) {
  return Effect.gen(function* () {
    const time = Date.now()
    const sessionID = SessionSchema.ID.make(`ses_learning_runtime_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_learning_runtime_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_learning_runtime_user_${suffix}`)
    yield* db
      .insert(ProjectTable)
      .values({
        id: Project.ID.global,
        worktree: AbsolutePath.make("C:\\project"),
        sandboxes: [],
        time_created: time,
        time_updated: time,
      })
      .onConflictDoNothing()
      .run()
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: sessionID,
        directory: "C:\\project",
        title: suffix,
        version: "test",
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(MessageTable)
      .values({
        id: userMessageID,
        session_id: sessionID,
        data: userData(time),
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(PartTable)
      .values({
        id: userPartID,
        session_id: sessionID,
        message_id: userMessageID,
        data: { type: "text", text: "Accept this Course View Revision" } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    const occurrenceID = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const occurrence = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive(),
          sessionID,
          messageID: userMessageID,
          timeAdmitted: time,
        })
        yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID,
          sessionID,
          inputID,
          messageID: userMessageID,
          occurrenceID: occurrence.id,
          limits: { model: 100, tool: 100 },
          envelope: { input },
          policyBasis: { source: "learning-command-runtime-test" },
          timeAdmitted: time,
        })
        return occurrence.id
      }),
    )
    const interaction = { sessionID, userMessageID, turnID, inputID, occurrenceID }
    return {
      ...interaction,
      registration: yield* insertAssistant(db, interaction, suffix, input),
    }
  }).pipe(Effect.orDie)
}

function insertAssistant(
  db: Database.Interface["db"],
  interaction: {
    sessionID: SessionSchema.ID
    userMessageID: SessionV1.MessageID
    turnID: Turn.ID
    inputID: Turn.InputID
    occurrenceID: LearningCommand.OccurrenceID
  },
  suffix: string,
  input: ReturnType<typeof acceptance>,
) {
  return Effect.gen(function* () {
    const time = Date.now()
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_learning_runtime_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_learning_runtime_tool_${suffix}`)
    const callID = `call-learning-runtime-${suffix}`
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: assistantMessageID,
            session_id: interaction.sessionID,
            data: assistantData(interaction.userMessageID, time),
            time_created: time,
            time_updated: time,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: partID,
            session_id: interaction.sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
              callID,
              state: { status: "pending", input, raw: JSON.stringify(input) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time,
            time_updated: time,
          })
          .run()
        yield* TurnLifecycle.admitModel(tx, {
          turnID: interaction.turnID,
          sessionID: interaction.sessionID,
          assistantMessageID,
          requestEnvelope: { input },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`context:${suffix}`).digest("hex"),
          snapshotFrontier: { sequence: 0, time: 0 },
          timeAdmitted: time,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: interaction.turnID,
          sessionID: interaction.sessionID,
          assistantMessageID,
          candidates: [
            {
              partID,
              callID,
              tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
              envelope: { input },
            },
          ],
          timeSealed: time,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: interaction.turnID,
          assistantMessageID,
          state: "completed",
          time,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID: interaction.turnID,
          sessionID: interaction.sessionID,
          assistantMessageID,
          partID,
          timeAdmitted: time,
        })
      }),
    )
    return Object.freeze({
      turnID: interaction.turnID,
      inputID: interaction.inputID,
      causalOccurrenceID: interaction.occurrenceID,
      partID,
      callID,
      emissionOrdinal: 0,
      sessionID: interaction.sessionID,
      parentUserMessageID: interaction.userMessageID,
      assistantMessageID,
    }) satisfies LearningCommandRuntime.Registration
  }).pipe(Effect.orDie)
}

function userData(time: number): Omit<SessionV1.User, "id" | "sessionID"> {
  return { role: "user", time: { created: time }, agent: "repa", model }
}

function assistantData(parentID: SessionV1.MessageID, time: number): Omit<SessionV1.Assistant, "id" | "sessionID"> {
  return {
    role: "assistant",
    time: { created: time },
    parentID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "repa",
    agent: "repa",
    path: { cwd: "C:\\project", root: "C:\\project" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function exactPartResult(db: Database.Interface["db"], partID: SessionV1.PartID) {
  return db
    .select()
    .from(PartTable)
    .where(eq(PartTable.id, partID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => {
        if (!row) throw new Error(`Expected exact completed learning Part ${partID}`)
        const part = decodeToolPart({
          ...row.data,
          id: row.id,
          messageID: row.message_id,
          sessionID: row.session_id,
        })
        if (part.state.status !== "completed") {
          throw new Error(`Expected exact completed learning Part ${partID}`)
        }
        return {
          title: part.state.title,
          metadata: part.state.metadata,
          output: part.state.output,
        }
      }),
    )
}

const decodeToolPart = Schema.decodeUnknownSync(SessionV1.ToolPart)

function sequence(db: Database.Interface["db"], sessionID: SessionSchema.ID) {
  return db
    .select({ seq: EventSequenceTable.seq })
    .from(EventSequenceTable)
    .where(eq(EventSequenceTable.aggregate_id, sessionID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row?.seq),
    )
}
