import { Course } from "@opencode-ai/core/course"
import { CourseSelectionAcceptanceEffectTable } from "@opencode-ai/core/course/sql"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import {
  AdmittedLearnerOccurrenceTable,
  LearnerOccurrenceSourceOrderTable,
  LearnerOccurrenceTombstoneTable,
} from "@opencode-ai/core/learning-command/occurrence.sql"
import {
  CourseRouteAnchorTransitionTable,
  DefaultCoursePreferenceTransitionTable,
} from "@opencode-ai/core/learner-navigation/sql"
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
import { eq, sql } from "drizzle-orm"
import { Deferred, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { join } from "path"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const permissionRequests: Permission.AskInput[] = []
const permissionWaits: Array<{
  entered: Deferred.Deferred<void>
  release: Deferred.Deferred<void>
}> = []
const permission = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    ask: (input) => Effect.gen(function* () {
      permissionRequests.push(input)
      const denied = input.ruleset.findLast(
        (rule) =>
          (rule.permission === "*" || rule.permission === input.permission) &&
          (rule.pattern === "*" || input.patterns.includes(rule.pattern)),
      )
      if (denied?.action === "deny") {
        return yield* Effect.fail(new PermissionV1.DeniedError({ ruleset: input.ruleset }))
      }
      const wait = permissionWaits.shift()
      if (!wait) return
      yield* Deferred.succeed(wait.entered, undefined)
      yield* Deferred.await(wait.release)
    }),
    reply: () => Effect.void,
    list: () => Effect.succeed([]),
  }),
)
const root = LayerNode.group([
  LearningCommandRuntime.node,
  Session.node,
  Course.node,
  LearnerNavigation.readNode,
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

it.effect("commits retained learning steering with its exact learner-visible acknowledgement", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const time = Date.parse("2026-07-20T02:00:00.000Z")
    const sourceExcerpt = "across all my learning this week, explain before practice"
    const input = {
      action: "create",
      sourceExcerpt,
      operativeInstruction: "Explain before asking me to practice.",
      validUntil: "2026-07-27T02:00:00.000+00:00",
    }
    const interaction = yield* seedInteraction(
      db,
      "retained-acknowledgement",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      { text: sourceExcerpt, time, timeZone: "UTC" },
    )

    yield* runtime.prepareCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      input,
      interaction.registration,
    )
    const result = yield* runtime.executeCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      input,
      context(
        interaction.registration,
        "allow",
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      ),
    )

    expect(result.title).toBe("Retained learning steering")
    expect(result.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
    expect(result.output).toContain("Explain before asking me to practice.")
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(result)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM retained_steering_transition`)).toEqual({ count: 1 })
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learning_command_receipt WHERE retained_steering_effect_id IS NOT NULL`)).toEqual({ count: 1 })
    expect(yield* db.transaction((tx) => RetainedSteering.readActiveSnapshot(tx, time + 10_000))).toMatchObject({
      steeringRevision: 1,
      items: [{ status: "operative_active", transition: { operativeInstruction: input.operativeInstruction } }],
    })
  }),
)

it.effect("keeps provider observation metadata outside retained invocation identity", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const time = Date.parse("2026-07-20T02:00:00.000Z")
    const sourceExcerpt = "across all my learning this week, explain before practice"
    const input = {
      action: "create",
      sourceExcerpt,
      operativeInstruction: "Explain before asking me to practice.",
      validUntil: "2026-07-27T02:00:00.000+00:00",
    }
    const interaction = yield* seedInteraction(
      db,
      "retained-provider-metadata",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      { text: sourceExcerpt, time, timeZone: "UTC" },
    )
    const row = yield* db
      .select()
      .from(PartTable)
      .where(eq(PartTable.id, interaction.registration.partID))
      .get()
    if (!row || row.data.type !== "tool") return yield* Effect.die("Expected the retained pending Part")
    yield* db
      .update(PartTable)
      .set({
        data: {
          ...row.data,
          metadata: { openai: { itemId: "fc_real_provider_shape" } },
        } as (typeof PartTable.$inferInsert)["data"],
      })
      .where(eq(PartTable.id, row.id))
      .run()

    yield* runtime.prepareCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      input,
      interaction.registration,
    )
    const result = yield* runtime.executeCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      input,
      context(
        interaction.registration,
        "allow",
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      ),
    )

    expect(result.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(result)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM retained_steering_transition`)).toEqual({ count: 1 })
  }),
)

it.effect("reconciles committed retained semantics before capability revoke, source loss, permission wait, cancellation, interruption, and recovery", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    permissionWaits.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const events = yield* EventV2Bridge.Service
    const time = Date.now()
    const sourceExcerpt = "across all my learning this week, use worked examples"
    const input = {
      action: "create",
      sourceExcerpt,
      operativeInstruction: "Use a worked example before independent practice.",
      validUntil: new Date(time + 7 * 24 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
    }
    const interaction = yield* seedInteraction(
      db,
      "retained-predecessor-order",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      { text: sourceExcerpt, time, timeZone: "UTC" },
    )
    const duplicate = yield* insertAssistant(
      db,
      interaction,
      "retained-predecessor-duplicate",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
    )
    const conflictInput = { ...input, operativeInstruction: "Use only independent practice." }
    const conflict = yield* insertAssistant(
      db,
      interaction,
      "retained-predecessor-conflict",
      conflictInput,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
    )
    const revoked = yield* insertAssistant(
      db,
      interaction,
      "retained-predecessor-revoked",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
    )
    const deletedSource = yield* insertAssistant(
      db,
      interaction,
      "retained-predecessor-source-lost",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
    )
    const waiting = yield* insertAssistant(
      db,
      interaction,
      "retained-predecessor-permission-wait",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      input,
      interaction.registration,
    )
    yield* runtime.prepareCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      input,
      duplicate,
    )
    yield* runtime.prepareCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      conflictInput,
      conflict,
    )
    yield* Effect.forEach([revoked, deletedSource, waiting], (registration) =>
      runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        input,
        registration,
      ),
    )
    const permissionEntered = yield* Deferred.make<void>()
    const permissionRelease = yield* Deferred.make<void>()
    permissionWaits.push({ entered: permissionEntered, release: permissionRelease })
    const cancellation = new AbortController()
    const waitingExecution = yield* runtime
      .executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        input,
        {
          ...context(waiting, "ask", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
          abort: cancellation.signal,
        },
      )
      .pipe(Effect.forkChild)
    yield* Deferred.await(permissionEntered)
    const applied = yield* runtime.executeCommand(
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      input,
      context(
        interaction.registration,
        "allow",
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      ),
    )
    expect(applied.metadata).toMatchObject({ outcome: "applied" })
    cancellation.abort()
    yield* Deferred.succeed(permissionRelease, undefined)
    expect(yield* Fiber.join(waitingExecution)).toMatchObject({
      title: "Retained learning steering",
      metadata: { outcome: "already_applied" },
      output: applied.output,
    })
    const requestsAfterApply = permissionRequests.length

    expect(
      yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        input,
        context(
          revoked,
          "allow",
          LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
          [{ ruleset: [], absence: "deny" }],
        ),
      ),
    ).toMatchObject({ metadata: { outcome: "already_applied" }, output: applied.output })
    yield* db
      .insert(LearnerOccurrenceTombstoneTable)
      .values({ occurrence_id: interaction.occurrenceID, reason: "source_unavailable", time_deleted: time + 10 })
      .run()
    expect(
      yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        input,
        context(
          deletedSource,
          "deny",
          LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        ),
      ),
    ).toMatchObject({ metadata: { outcome: "already_applied" }, output: applied.output })

    expect(yield* runtime.interrupt(duplicate)).toBe(true)
    expect(yield* exactPartResult(db, duplicate.partID)).toMatchObject({
      title: "Retained learning steering",
      metadata: { outcome: "already_applied" },
      output: applied.output,
    })
    yield* LearningCommandRuntime.recoverAdmitted(events)
    expect(yield* exactPartResult(db, conflict.partID)).toMatchObject({
      title: "Retained learning steering not changed",
      metadata: { outcome: "error", code: "semantic_conflict" },
    })
    expect(permissionRequests).toHaveLength(requestsAfterApply)
    expect(
      yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        conflictInput,
        context(conflict, "deny", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
      ),
    ).toEqual(yield* exactPartResult(db, conflict.partID))
    expect(permissionRequests).toHaveLength(requestsAfterApply)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM retained_steering_transition`)).toEqual({ count: 1 })
  }),
)

it.effect("rolls back every retained transition, acknowledgement, frontier, receipt, seal, Part, and event boundary", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    permissionWaits.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const snapshot = (registration: LearningCommandRuntime.Registration, occurrenceID: LearningCommand.OccurrenceID) =>
      Effect.all({
        part: db
          .select({ data: PartTable.data })
          .from(PartTable)
          .where(eq(PartTable.id, registration.partID))
          .get(),
        invocation: db
          .select({
            status: LearningCommandInvocationTable.status,
            effectID: LearningCommandInvocationTable.retained_steering_effect_id,
            settlement: LearningCommandInvocationTable.settlement,
          })
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, registration.partID))
          .get(),
        receipts: db.get(sql`
          SELECT count(*) AS count FROM learning_command_receipt
          WHERE occurrence_id = ${occurrenceID} AND retained_steering_effect_id IS NOT NULL
        `),
        transitions: db.get(sql`
          SELECT count(*) AS count FROM retained_steering_transition WHERE occurrence_id = ${occurrenceID}
        `),
        seals: db.get(sql`
          SELECT count(*) AS count
          FROM retained_steering_commit_seal AS seal
          JOIN retained_steering_transition AS transition ON transition.id = seal.transition_id
          WHERE transition.occurrence_id = ${occurrenceID}
        `),
        state: db.all(sql`
          SELECT singleton, steering_revision, latest_cut_as_of FROM retained_steering_state ORDER BY singleton
        `),
        frontier: db.transaction((tx) => LearningFrontier.read(tx)),
        tool: db.get(sql`
          SELECT state, consumed_shared_frontier_sequence, consumed_shared_frontier_time,
                 resulting_shared_frontier_sequence, resulting_shared_frontier_time
          FROM turn_tool_invocation WHERE part_id = ${registration.partID}
        `),
        sequence: db
          .select({ seq: EventSequenceTable.seq })
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, registration.sessionID))
          .get(),
        events: db.get(sql`SELECT count(*) AS count FROM event WHERE aggregate_id = ${registration.sessionID}`),
      })

    const boundaries = [
      { name: "turn_consumed", clause: "BEFORE UPDATE OF consumed_shared_frontier_sequence ON turn_tool_invocation" },
      { name: "shared_frontier", clause: "BEFORE INSERT ON learning_shared_frontier" },
      { name: "transition", clause: "BEFORE INSERT ON retained_steering_transition" },
      { name: "acknowledgement", clause: "AFTER INSERT ON retained_steering_transition" },
      { name: "receipt", clause: "BEFORE INSERT ON learning_command_receipt" },
      { name: "invocation_ack", clause: "BEFORE UPDATE OF settlement ON learning_command_invocation" },
      { name: "policy_revision", clause: "BEFORE UPDATE OF steering_revision ON retained_steering_state" },
      { name: "commit_seal", clause: "BEFORE INSERT ON retained_steering_commit_seal" },
      { name: "turn_resulting", clause: "BEFORE UPDATE OF resulting_shared_frontier_sequence ON turn_tool_invocation" },
      { name: "part_projection", clause: "BEFORE UPDATE OF data ON part" },
      { name: "event_sequence", clause: "BEFORE INSERT ON event_sequence" },
      { name: "part_event", clause: "BEFORE INSERT ON event" },
    ] as const

    yield* Effect.forEach(
      boundaries,
      (boundary, index) =>
        Effect.gen(function* () {
          const time = Date.now() + index * 10_000
          const sourceExcerpt = `across all my learning this week, use rollback example ${index}`
          const input = {
            action: "create",
            sourceExcerpt,
            operativeInstruction: `Use rollback example ${index} before independent practice.`,
            validUntil: new Date(time + 7 * 24 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
          }
          const interaction = yield* seedInteraction(
            db,
            `retained-rollback-${boundary.name}`,
            input,
            LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
            { text: sourceExcerpt, time, timeZone: "UTC" },
          )
          yield* runtime.prepareCommand(
            LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
            input,
            interaction.registration,
          )
          const before = yield* snapshot(interaction.registration, interaction.occurrenceID)
          const trigger = `gate15_rollback_${index}`
          yield* db.run(
            sql.raw(
              `CREATE TEMP TRIGGER ${trigger} ${boundary.clause} BEGIN SELECT RAISE(ABORT, 'gate15 injected rollback'); END`,
            ),
          )
          const result = yield* runtime
            .executeCommand(
              LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
              input,
              context(
                interaction.registration,
                "allow",
                LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
              ),
            )
            .pipe(Effect.ensuring(db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`)).pipe(Effect.orDie)))
          expect(result.metadata).toMatchObject({
            outcome: "error",
            code: "outcome_unknown",
            durablySettled: false,
          })
          expect(yield* snapshot(interaction.registration, interaction.occurrenceID)).toEqual(before)
        }),
      { discard: true },
    )
  }),
)

it.effect("requires an exact once-only default confirmation and keeps authorized no-change effect-free", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const seeded = yield* seedCourse(courses, "Default algorithms", "Main")
    const target = {
      courseID: seeded.course.id,
      courseVersion: 0,
      selectionRevisionID: null,
      selectionVersion: 0,
      viewID: null,
      viewVersion: null,
      revisionVersion: null,
    }
    const input = { expectedHeadID: null, expectedVersion: 0, target }
    const interaction = yield* seedInteraction(
      db,
      "default-set",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )

    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      interaction.registration,
    )
    const applied = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      context(interaction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    expect(JSON.parse(applied.output)).toMatchObject({
      outcome: "applied",
      navigationKind: "default_course_preference",
      current: { version: 1, courseID: seeded.course.id, usability: { usable: true } },
    })
    const request = permissionRequests.find((item) => item.sessionID === interaction.sessionID)
    expect(request).toMatchObject({
      requirePrompt: true,
      always: [],
      metadata: {
        onceOnly: true,
        navigationKind: "default_course_preference",
        confirmation: { version: 0, fromCourseID: null, target: { courseID: seeded.course.id } },
      },
    })
    const receipt = yield* db
      .select()
      .from(LearningCommandReceiptTable)
      .where(eq(LearningCommandReceiptTable.invocation_part_id, interaction.registration.partID))
      .get()
    expect(receipt).toMatchObject({
      permission_request_id: request?.id,
      confirmation_snapshot: request?.metadata.confirmation,
    })
    const explicitCourse = yield* courses.createCourse({ title: "Explicit fallback target" })
    expect(yield* navigation.resolveCourses([explicitCourse.id, seeded.course.id, explicitCourse.id])).toMatchObject({
      source: "explicit",
      courses: [{ courseID: explicitCourse.id }, { courseID: seeded.course.id }],
    })
    expect(
      yield* navigation.resolveCourses(Array.from({ length: 101 }, () => explicitCourse.id)).pipe(Effect.flip),
    ).toMatchObject({
      _tag: "LearnerNavigation.InvalidReadError",
    })
    yield* courses.withdrawCourse({
      courseID: seeded.course.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
    })
    expect(yield* navigation.currentDefault()).toMatchObject({
      courseID: seeded.course.id,
      usability: { usable: false, cause: "course_withdrawn" },
    })
    expect(yield* navigation.resolveCourses([])).toMatchObject({
      source: "none",
      courses: [],
      default: { courseID: seeded.course.id, usability: { usable: false, cause: "course_withdrawn" } },
    })
    yield* courses.restoreCourse({ courseID: seeded.course.id, expectedCourseVersion: 1 })
    expect(yield* navigation.resolveCourses([])).toMatchObject({
      source: "default",
      courses: [{ courseID: seeded.course.id, availability: "available" }],
    })
    const appliedSettlement = JSON.parse(applied.output) as { effectID: LearnerNavigation.DefaultEffectID }
    expect(
      yield* db.transaction((tx) =>
        LearningCommand.assertPartDeletable(tx, interaction.registration.partID).pipe(Effect.flip),
      ),
    ).toMatchObject({ _tag: "LearningCommand.SettledPartImmutableError" })
    const requestsAfterApply = permissionRequests.length
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      interaction.registration,
    )
    expect(
      yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        input,
        context(interaction.registration, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      ),
    ).toEqual(applied)
    expect(permissionRequests).toHaveLength(requestsAfterApply)

    const duplicate = yield* insertAssistant(
      db,
      interaction,
      "default-semantic-replay",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, duplicate)
    expect(
      JSON.parse(
        (yield* runtime.executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          input,
          context(duplicate, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        )).output,
      ),
    ).toMatchObject({ outcome: "already_applied", effectID: appliedSettlement.effectID })
    const conflictInput = {
      ...input,
      target: { ...target, courseID: explicitCourse.id },
    }
    const conflicting = yield* insertAssistant(
      db,
      interaction,
      "default-semantic-conflict",
      conflictInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, conflictInput, conflicting)
    expect(
      JSON.parse(
        (yield* runtime.executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          conflictInput,
          context(conflicting, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        )).output,
      ),
    ).toMatchObject({ outcome: "error", code: "semantic_conflict" })
    expect(permissionRequests).toHaveLength(requestsAfterApply)
    expect(
      Exit.isFailure(
        yield* db
          .update(DefaultCoursePreferenceTransitionTable)
          .set({ commit_order: 99 })
          .where(eq(DefaultCoursePreferenceTransitionTable.id, appliedSettlement.effectID))
          .run()
          .pipe(Effect.exit),
      ),
    ).toBe(true)
    expect(
      Exit.isFailure(
        yield* db
          .update(LearningCommandReceiptTable)
          .set({ permission_request_id: PermissionV1.ID.ascending() })
          .where(eq(LearningCommandReceiptTable.id, receipt!.id))
          .run()
          .pipe(Effect.exit),
      ),
    ).toBe(true)
    const malformedOccurrenceID = LearningCommand.createOccurrenceID()
    const malformedMessageID = SessionV1.MessageID.ascending()
    const malformedPartID = SessionV1.PartID.ascending()
    const malformedTime = Date.now()
    yield* db
      .insert(MessageTable)
      .values({
        id: malformedMessageID,
        session_id: interaction.sessionID,
        data: userData(malformedTime),
        time_created: malformedTime,
        time_updated: malformedTime,
      })
      .run()
    yield* db
      .insert(PartTable)
      .values({
        id: malformedPartID,
        session_id: interaction.sessionID,
        message_id: malformedMessageID,
        data: { type: "text", text: "Malformed navigation source" } as (typeof PartTable.$inferInsert)["data"],
        time_created: malformedTime,
        time_updated: malformedTime,
      })
      .run()
    const malformedSourceOrder = yield* db
      .insert(LearnerOccurrenceSourceOrderTable)
      .values({
        occurrence_id: malformedOccurrenceID,
        origin_session_id: interaction.sessionID,
        origin_message_id: malformedMessageID,
        time_allocated: malformedTime,
        source_temporal_state: "unavailable",
        source_timezone: null,
        source_utc_offset_minutes: null,
        source_temporal_unavailable_reason: "timezone_unavailable",
      })
      .returning({ sequence: LearnerOccurrenceSourceOrderTable.sequence })
      .get()
    if (!malformedSourceOrder) return yield* Effect.die("Expected a source-order allocation")
    yield* db
      .insert(AdmittedLearnerOccurrenceTable)
      .values({
        id: malformedOccurrenceID,
        origin_session_id: interaction.sessionID,
        origin_message_id: malformedMessageID,
        time_admitted: malformedTime,
        source_order: malformedSourceOrder.sequence,
        source_temporal_state: "unavailable",
        source_temporal_unavailable_reason: "timezone_unavailable",
      })
      .run()
    const malformed = yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          const consumed = yield* LearningFrontier.read(tx)
          const time = Math.max(Date.now(), consumed.time)
          const frontier = yield* LearningFrontier.advance(tx, { time, consumed: [consumed] })
          yield* tx
            .insert(DefaultCoursePreferenceTransitionTable)
            .values({
              id: LearnerNavigation.DefaultEffectID.make(`ndp_${"z".repeat(26)}`),
              version: 2,
              predecessor_id: appliedSettlement.effectID,
              previous_course_id: seeded.course.id,
              course_id: null,
              occurrence_id: malformedOccurrenceID,
              permission_request_id: PermissionV1.ID.ascending(),
              confirmation_snapshot: {} as LearnerNavigation.DefaultConfirmationSnapshot,
              time_committed: time,
              commit_order: 100,
              frontier_sequence: frontier.sequence,
              frontier_time: frontier.time,
            })
            .run()
        }),
      )
      .pipe(Effect.exit)
    expect(Exit.isFailure(malformed)).toBe(true)

    const extraField = yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          const consumed = yield* LearningFrontier.read(tx)
          const time = Math.max(Date.now(), consumed.time)
          const frontier = yield* LearningFrontier.advance(tx, { time, consumed: [consumed] })
          const permissionRequestID = PermissionV1.ID.ascending()
          yield* tx
            .insert(DefaultCoursePreferenceTransitionTable)
            .values({
              id: LearnerNavigation.DefaultEffectID.make(`ndp_${"y".repeat(26)}`),
              version: 2,
              predecessor_id: appliedSettlement.effectID,
              previous_course_id: seeded.course.id,
              course_id: null,
              occurrence_id: malformedOccurrenceID,
              permission_request_id: permissionRequestID,
              confirmation_snapshot: {
                permissionRequestID,
                headID: appliedSettlement.effectID,
                version: 1,
                fromCourseID: seeded.course.id,
                fromCourseTitle: seeded.course.title,
                target: null,
                extra: true,
              } as LearnerNavigation.DefaultConfirmationSnapshot,
              time_committed: time,
              commit_order: 101,
              frontier_sequence: frontier.sequence,
              frontier_time: frontier.time,
            })
            .run()
        }),
      )
      .pipe(Effect.exit)
    expect(Exit.isFailure(extraField)).toBe(true)

    const current = yield* navigation.currentDefault()
    const noChangeInput = { expectedHeadID: current.headID, expectedVersion: current.version, target }
    const noChange = yield* seedInteraction(
      db,
      "default-no-change",
      noChangeInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    const beforeNoChange = yield* db.transaction((tx) => LearningFrontier.read(tx))
    const receiptsBefore = (yield* db.select().from(LearningCommandReceiptTable).all()).length
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      noChangeInput,
      noChange.registration,
    )
    const unchanged = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      noChangeInput,
      context(noChange.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    expect(JSON.parse(unchanged.output)).toMatchObject({
      outcome: "no_change",
      navigationKind: "default_course_preference",
      current: { headID: current.headID, version: 1 },
    })
    expect(permissionRequests.some((item) => item.sessionID === noChange.sessionID)).toBe(false)
    expect((yield* db.select().from(LearningCommandReceiptTable).all()).length).toBe(receiptsBefore)
    expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(beforeNoChange)
    yield* db.transaction((tx) =>
      LearningCommand.removeNoEffectInvocationsForAssistant(tx, noChange.registration.assistantMessageID),
    )
    yield* db.transaction((tx) => LearningCommand.assertPartDeletable(tx, noChange.registration.partID))
    expect(
      yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, noChange.registration.partID))
        .get(),
    ).toBeUndefined()
    expect(yield* navigation.currentDefault()).toMatchObject({ headID: current.headID, version: current.version })

    const denied = yield* seedInteraction(
      db,
      "default-denied-no-change",
      noChangeInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      noChangeInput,
      denied.registration,
    )
    const deniedResult = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      noChangeInput,
      context(denied.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, [
        { ruleset: [{ permission: "read", pattern: "*", action: "allow" }], absence: "deny" },
      ]),
    )
    expect(JSON.parse(deniedResult.output)).toMatchObject({ outcome: "error", code: "permission_rejected" })
    expect(permissionRequests.some((item) => item.sessionID === denied.sessionID)).toBe(false)

    const clearInput = { expectedHeadID: current.headID, expectedVersion: current.version, target: null }
    const clear = yield* seedInteraction(
      db,
      "default-clear",
      clearInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      clearInput,
      clear.registration,
    )
    expect(
      JSON.parse(
        (yield* runtime.executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          clearInput,
          context(clear.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        )).output,
      ),
    ).toMatchObject({ outcome: "applied", current: { version: 2, courseID: null } })
    expect((yield* navigation.currentDefault()).usability).toEqual({ usable: false, cause: "absent" })
    yield* db
      .insert(LearnerOccurrenceTombstoneTable)
      .values({ occurrence_id: interaction.occurrenceID, reason: "source_unavailable", time_deleted: Date.now() })
      .run()
    expect(
      (yield* navigation.listDefaultHistory()).items.find((item) => item.effect.id === appliedSettlement.effectID)
        ?.source,
    ).toMatchObject({ availability: "source_unavailable", occurrenceID: interaction.occurrenceID })
  }),
)

it.effect("keeps route anchors exact to one Course Revision Item and uses ordinary permission", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const seeded = yield* seedCourse(courses, "Anchor algorithms", "Main")
    yield* courses.select({
      courseID: seeded.course.id,
      revisionID: seeded.view.revision.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
      expectedViewVersion: 0,
      expectedRevisionVersion: 0,
    })
    const item = (yield* courses.listRevisionItems(seeded.course.id, seeded.view.view.id, seeded.view.revision.id))
      .items[0]!
    const input = {
      courseID: seeded.course.id,
      expectedHeadID: null,
      expectedVersion: 0,
      target: {
        viewID: seeded.view.view.id,
        revisionID: seeded.view.revision.id,
        itemID: item.itemID,
        courseVersion: 0,
        selectionVersion: 1,
        viewVersion: 0,
        revisionVersion: 0,
      },
    }
    const interaction = yield* seedInteraction(
      db,
      "anchor-set",
      input,
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY, input, interaction.registration)
    const newerSharedState = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* LearningFrontier.read(tx)
        return yield* LearningFrontier.advance(tx, {
          time: Math.max(Date.now() + 60_000, current.time + 1),
          consumed: [current],
        })
      }),
    )
    const result = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY),
      )).output,
    ) as { effectID: LearnerNavigation.AnchorEffectID; settlementTime: number }
    expect(result).toMatchObject({ outcome: "applied", current: { version: 1, target: { itemID: item.itemID } } })
    expect(result.settlementTime).toBe(newerSharedState.time)
    expect(
      yield* db
        .select({
          time: CourseRouteAnchorTransitionTable.time_committed,
          frontierTime: CourseRouteAnchorTransitionTable.frontier_time,
        })
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, result.effectID))
        .get(),
    ).toEqual({ time: newerSharedState.time, frontierTime: newerSharedState.time })
    expect(
      yield* db
        .select({ time: LearningCommandReceiptTable.time_committed })
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.anchor_navigation_effect_id, result.effectID))
        .get(),
    ).toEqual({ time: newerSharedState.time })
    const settledPartRow = yield* db
      .select()
      .from(PartTable)
      .where(eq(PartTable.id, interaction.registration.partID))
      .get()
    const settledPart = decodeToolPart({
      ...settledPartRow?.data,
      id: settledPartRow?.id,
      messageID: settledPartRow?.message_id,
      sessionID: settledPartRow?.session_id,
    })
    expect(settledPart.state.status === "completed" ? settledPart.state.time.end : undefined).toBe(
      newerSharedState.time,
    )
    expect(permissionRequests.some((request) => request.sessionID === interaction.sessionID)).toBe(false)

    const anchored = yield* navigation.currentAnchor(seeded.course.id)
    const deniedNoChangeInput = {
      courseID: seeded.course.id,
      expectedHeadID: anchored.headID,
      expectedVersion: anchored.version,
      target: input.target,
    }
    const deniedNoChange = yield* seedInteraction(
      db,
      "anchor-denied-no-change",
      deniedNoChangeInput,
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      deniedNoChangeInput,
      deniedNoChange.registration,
    )
    const beforeDeniedNoChange = yield* db.transaction((tx) => LearningFrontier.read(tx))
    expect(
      JSON.parse(
        (yield* runtime.executeCommand(
          LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
          deniedNoChangeInput,
          context(
            deniedNoChange.registration,
            "deny",
            LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
            [],
            seeded.course.id,
          ),
        )).output,
      ),
    ).toMatchObject({ outcome: "error", code: "permission_rejected" })
    expect(permissionRequests.some((request) => request.sessionID === deniedNoChange.sessionID)).toBe(false)
    expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(beforeDeniedNoChange)
    expect((yield* db.select().from(CourseRouteAnchorTransitionTable).all()).length).toBe(1)

    const successor = yield* courses.addRevision({
      courseID: seeded.course.id,
      viewID: seeded.view.view.id,
      predecessorRevisionID: seeded.view.revision.id,
      expectedCourseVersion: 0,
      expectedViewVersion: 0,
      authorship: Course.Authorship.learnerDirected(),
      revision: { items: [{ key: "next", title: "Next algorithms" }] },
    })
    yield* courses.select({
      courseID: seeded.course.id,
      revisionID: successor.id,
      expectedCourseVersion: 0,
      expectedSelectionRevisionID: seeded.view.revision.id,
      expectedSelectionVersion: 1,
      expectedViewVersion: 0,
      expectedRevisionVersion: 0,
    })
    expect(yield* navigation.currentAnchor(seeded.course.id)).toMatchObject({
      headID: anchored.headID,
      target: { revisionID: seeded.view.revision.id, itemID: item.itemID },
      usability: { usable: false, cause: "working_selection_mismatch" },
    })
    expect(yield* navigation.resolveCourses([seeded.course.id])).toMatchObject({
      source: "explicit",
      courses: [{ courseID: seeded.course.id, availability: "available" }],
    })

    const clearInput = {
      courseID: seeded.course.id,
      expectedHeadID: anchored.headID,
      expectedVersion: anchored.version,
      target: null,
    }
    const clear = yield* seedInteraction(
      db,
      "anchor-clear",
      clearInput,
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY, clearInput, clear.registration)
    yield* runtime.executeCommand(
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      clearInput,
      context(clear.registration, "allow", LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY),
    )
    const firstPage = yield* navigation.listAnchorHistory(seeded.course.id, { limit: 1 })
    expect(firstPage.items[0]?.effect.target).toBeNull()
    expect(firstPage.cursor).toBeString()
    expect(
      (yield* navigation.listAnchorHistory(seeded.course.id, { limit: 1, cursor: firstPage.cursor })).items[0]?.effect
        .target,
    ).toMatchObject({ revisionID: seeded.view.revision.id, itemID: item.itemID })
  }),
)

it.effect("preserves navigation and its source receipt across whole Session deletion", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const sessions = yield* Session.Service
    const course = yield* courses.createCourse({ title: "Deletion-retained default" })
    const input = {
      expectedHeadID: null,
      expectedVersion: 0,
      target: {
        courseID: course.id,
        courseVersion: 0,
        selectionRevisionID: null,
        selectionVersion: 0,
        viewID: null,
        viewVersion: null,
        revisionVersion: null,
      },
    }
    const interaction = yield* seedInteraction(
      db,
      "navigation-session-deletion",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      interaction.registration,
    )
    const applied = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )).output,
    ) as { effectID: LearnerNavigation.DefaultEffectID; settlementTime: number }
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* TurnLifecycle.settleTool(tx, {
          turnID: interaction.turnID,
          partID: interaction.registration.partID,
          state: "completed",
          time: applied.settlementTime,
        })
        yield* TurnLifecycle.settle(tx, {
          turnID: interaction.turnID,
          outcome: "completed",
          reason: "normal",
          time: applied.settlementTime,
        })
      }),
    )

    yield* sessions.remove(interaction.sessionID)

    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: applied.effectID,
      courseID: course.id,
      source: {
        occurrenceID: interaction.occurrenceID,
        originSessionID: interaction.sessionID,
        availability: "source_unavailable",
      },
    })
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.default_navigation_effect_id, applied.effectID))
        .get(),
    ).toBeDefined()
    expect(
      yield* db.select().from(PartTable).where(eq(PartTable.id, interaction.registration.partID)).get(),
    ).toBeUndefined()
  }),
)

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

it.effect("rejects raw promotion of a non-navigation receipt into either navigation authority", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const runtime = yield* LearningCommandRuntime.Service
    const seeded = yield* seedCourse(courses, "Receipt integrity", "Main")
    const acceptanceInput = acceptance(seeded.course.id, seeded.view.revision.id)
    const interaction = yield* seedInteraction(db, "receipt-promotion", acceptanceInput)
    yield* runtime.prepare(acceptanceInput, interaction.registration)
    const originalResult = yield* runtime.execute(acceptanceInput, context(interaction.registration, "allow"))
    const originalReceipt = yield* db
      .select()
      .from(LearningCommandReceiptTable)
      .where(eq(LearningCommandReceiptTable.invocation_part_id, interaction.registration.partID))
      .get()
    if (!originalReceipt?.effect_id) return yield* Effect.die("Expected the legacy receipt fixture")
    const originalInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
      .get()
    const originalEffect = yield* db
      .select()
      .from(CourseSelectionAcceptanceEffectTable)
      .where(eq(CourseSelectionAcceptanceEffectTable.id, originalReceipt.effect_id))
      .get()
    if (!originalInvocation || !originalEffect) return yield* Effect.die("Expected the legacy settlement fixture")

    const course = yield* courses.getCourse(seeded.course.id)
    const defaultPermissionRequestID = PermissionV1.ID.ascending()
    const defaultCommand = {
      kind: "default_course_preference" as const,
      expectedHeadID: null,
      expectedVersion: 0,
      target: {
        courseID: seeded.course.id,
        courseVersion: course.stateVersion,
        selectionRevisionID: seeded.view.revision.id,
        selectionVersion: course.selection.version,
        viewID: seeded.view.view.id,
        viewVersion: 0,
        revisionVersion: 0,
      },
    }
    const preparedDefault = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const prepared = yield* LearnerNavigation.prepareDefaultInTransaction(
          tx,
          defaultCommand,
          defaultPermissionRequestID,
        )
        if (prepared.decision !== "candidate") return yield* Effect.die("Expected a new default preference candidate")
        const frontier = yield* LearningFrontier.read(tx)
        const effect = yield* LearnerNavigation.applyDefault(tx, {
          occurrenceID: interaction.occurrenceID,
          command: defaultCommand,
          permissionRequestID: defaultPermissionRequestID,
          confirmation: prepared.confirmation,
          proof: prepared.proof,
          trustedTime: Math.max(Date.now(), frontier.time),
          commitOrder: 10,
        })
        return { effect, confirmation: prepared.confirmation }
      }),
    )
    const defaultTransitionBeforeReplacement = yield* db
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .where(eq(DefaultCoursePreferenceTransitionTable.id, preparedDefault.effect.id))
      .get()
    const defaultFrontierBeforeReplacement = yield* db.all(
      sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`,
    )
    yield* db.run(sql.raw("SAVEPOINT default_transition_explicit_replace"))
    const defaultExplicitReplace = yield* insertOrReplaceDefaultTransition(db, preparedDefault.effect.id, false).pipe(
      Effect.exit,
    )
    const defaultExplicitState = {
      transition: yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, preparedDefault.effect.id))
        .get(),
      frontier: yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`),
    }
    yield* db.run(sql.raw("ROLLBACK TO default_transition_explicit_replace"))
    yield* db.run(sql.raw("RELEASE default_transition_explicit_replace"))

    const replacementDefaultID = LearnerNavigation.DefaultEffectID.make(`ndp_${"u".repeat(26)}`)
    yield* db.run(sql.raw("SAVEPOINT default_transition_unique_replace"))
    const defaultUniqueReplace = yield* insertOrReplaceDefaultTransition(
      db,
      preparedDefault.effect.id,
      false,
      replacementDefaultID,
    ).pipe(Effect.exit)
    const defaultUniqueState = {
      transition: yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, preparedDefault.effect.id))
        .get(),
      replacement: yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, replacementDefaultID))
        .get(),
      frontier: yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`),
    }
    yield* db.run(sql.raw("ROLLBACK TO default_transition_unique_replace"))
    yield* db.run(sql.raw("RELEASE default_transition_unique_replace"))

    yield* db.run(sql.raw("SAVEPOINT default_transition_rowid_replace"))
    const defaultRowidReplace = yield* insertOrReplaceDefaultTransition(db, preparedDefault.effect.id, true).pipe(
      Effect.exit,
    )
    const defaultRowidState = {
      transition: yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, preparedDefault.effect.id))
        .get(),
      frontier: yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`),
    }
    yield* db.run(sql.raw("ROLLBACK TO default_transition_rowid_replace"))
    yield* db.run(sql.raw("RELEASE default_transition_rowid_replace"))
    const defaultInvocation = yield* insertAppliedNavigationInvocation(db, {
      kind: "default",
      suffix: "default",
      sessionID: interaction.sessionID,
      parentUserMessageID: interaction.userMessageID,
      occurrenceID: interaction.occurrenceID,
      turnID: interaction.turnID,
      inputID: interaction.inputID,
      receiptID: originalReceipt!.id,
      effect: preparedDefault.effect,
      confirmation: preparedDefault.confirmation,
      courseTitle: course.title,
      permissionRequestID: defaultPermissionRequestID,
    })
    const defaultPromotion = yield* db
      .update(LearningCommandReceiptTable)
      .set({
        occurrence_id: interaction.occurrenceID,
        origin_session_id: interaction.sessionID,
        origin_message_id: interaction.userMessageID,
        assistant_message_id: defaultInvocation.assistantMessageID,
        invocation_part_id: defaultInvocation.partID,
        capability_identity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        capability_version: 1,
        authorization_basis: "learner_acceptance",
        effect_id: null,
        representation_effect_id: null,
        default_navigation_effect_id: preparedDefault.effect.id,
        anchor_navigation_effect_id: null,
        permission_request_id: defaultPermissionRequestID,
        confirmation_snapshot: preparedDefault.confirmation,
        time_committed: preparedDefault.effect.timeCommitted,
        commit_order: preparedDefault.effect.commitOrder,
      })
      .where(eq(LearningCommandReceiptTable.id, originalReceipt!.id))
      .run()
      .pipe(Effect.exit)
    expect(Exit.isFailure(defaultPromotion)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, originalReceipt!.id))
        .get(),
    ).toEqual(originalReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.default_navigation_effect_id, preparedDefault.effect.id))
        .get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, preparedDefault.effect.id))
        .get(),
    ).toMatchObject({ id: preparedDefault.effect.id, version: 1 })

    const item = (yield* courses.listRevisionItems(seeded.course.id, seeded.view.view.id, seeded.view.revision.id))
      .items[0]
    const anchorCommand = {
      kind: "course_route_anchor" as const,
      courseID: seeded.course.id,
      expectedHeadID: null,
      expectedVersion: 0,
      target: {
        viewID: seeded.view.view.id,
        revisionID: seeded.view.revision.id,
        itemID: item.itemID,
        courseVersion: course.stateVersion,
        selectionVersion: course.selection.version,
        viewVersion: 0,
        revisionVersion: 0,
      },
    }
    const anchorEffect = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const prepared = yield* LearnerNavigation.prepareAnchorInTransaction(tx, anchorCommand)
        const frontier = yield* LearningFrontier.read(tx)
        return yield* LearnerNavigation.applyAnchor(tx, {
          occurrenceID: interaction.occurrenceID,
          command: anchorCommand,
          proof: prepared.proof,
          trustedTime: Math.max(Date.now(), frontier.time),
          commitOrder: 11,
        })
      }),
    )
    const anchorTransitionBeforeReplacement = yield* db
      .select()
      .from(CourseRouteAnchorTransitionTable)
      .where(eq(CourseRouteAnchorTransitionTable.id, anchorEffect.id))
      .get()
    const anchorFrontierBeforeReplacement = yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`)
    yield* db.run(sql.raw("SAVEPOINT anchor_transition_explicit_replace"))
    const anchorExplicitReplace = yield* insertOrReplaceAnchorTransition(db, anchorEffect.id, false).pipe(Effect.exit)
    const anchorExplicitState = {
      transition: yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, anchorEffect.id))
        .get(),
      frontier: yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`),
    }
    yield* db.run(sql.raw("ROLLBACK TO anchor_transition_explicit_replace"))
    yield* db.run(sql.raw("RELEASE anchor_transition_explicit_replace"))

    const replacementAnchorID = LearnerNavigation.AnchorEffectID.make(`nar_${"u".repeat(26)}`)
    yield* db.run(sql.raw("SAVEPOINT anchor_transition_unique_replace"))
    const anchorUniqueReplace = yield* insertOrReplaceAnchorTransition(
      db,
      anchorEffect.id,
      false,
      replacementAnchorID,
    ).pipe(Effect.exit)
    const anchorUniqueState = {
      transition: yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, anchorEffect.id))
        .get(),
      replacement: yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, replacementAnchorID))
        .get(),
      frontier: yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`),
    }
    yield* db.run(sql.raw("ROLLBACK TO anchor_transition_unique_replace"))
    yield* db.run(sql.raw("RELEASE anchor_transition_unique_replace"))

    yield* db.run(sql.raw("SAVEPOINT anchor_transition_rowid_replace"))
    const anchorRowidReplace = yield* insertOrReplaceAnchorTransition(db, anchorEffect.id, true).pipe(Effect.exit)
    const anchorRowidState = {
      transition: yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, anchorEffect.id))
        .get(),
      frontier: yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`),
    }
    yield* db.run(sql.raw("ROLLBACK TO anchor_transition_rowid_replace"))
    yield* db.run(sql.raw("RELEASE anchor_transition_rowid_replace"))
    const anchorInvocation = yield* insertAppliedNavigationInvocation(db, {
      kind: "anchor",
      suffix: "anchor",
      sessionID: interaction.sessionID,
      parentUserMessageID: interaction.userMessageID,
      occurrenceID: interaction.occurrenceID,
      turnID: interaction.turnID,
      inputID: interaction.inputID,
      receiptID: originalReceipt!.id,
      effect: anchorEffect,
    })
    const anchorPromotion = yield* db
      .update(LearningCommandReceiptTable)
      .set({
        occurrence_id: interaction.occurrenceID,
        origin_session_id: interaction.sessionID,
        origin_message_id: interaction.userMessageID,
        assistant_message_id: anchorInvocation.assistantMessageID,
        invocation_part_id: anchorInvocation.partID,
        capability_identity: LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
        capability_version: 1,
        authorization_basis: "learner_request",
        effect_id: null,
        representation_effect_id: null,
        default_navigation_effect_id: null,
        anchor_navigation_effect_id: anchorEffect.id,
        permission_request_id: null,
        confirmation_snapshot: null,
        time_committed: anchorEffect.timeCommitted,
        commit_order: anchorEffect.commitOrder,
      })
      .where(eq(LearningCommandReceiptTable.id, originalReceipt!.id))
      .run()
      .pipe(Effect.exit)
    expect(Exit.isFailure(anchorPromotion)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, originalReceipt!.id))
        .get(),
    ).toEqual(originalReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.anchor_navigation_effect_id, anchorEffect.id))
        .get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, anchorEffect.id))
        .get(),
    ).toMatchObject({ id: anchorEffect.id, version: 1 })

    yield* db.run(sql.raw("SAVEPOINT default_navigation_receipt_replace"))
    const defaultReplacement = yield* insertOrReplaceReceipt(db, {
      id: originalReceipt.id,
      occurrence_id: interaction.occurrenceID,
      origin_session_id: interaction.sessionID,
      origin_message_id: interaction.userMessageID,
      assistant_message_id: defaultInvocation.assistantMessageID,
      invocation_part_id: defaultInvocation.partID,
      capability_identity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      capability_version: 1,
      authorization_basis: "learner_acceptance",
      effect_id: null,
      representation_effect_id: null,
      default_navigation_effect_id: preparedDefault.effect.id,
      anchor_navigation_effect_id: null,
      retained_steering_effect_id: null,
      permission_request_id: defaultPermissionRequestID,
      confirmation_snapshot: preparedDefault.confirmation,
      time_committed: preparedDefault.effect.timeCommitted,
      commit_order: preparedDefault.effect.commitOrder,
    }).pipe(Effect.exit)
    const defaultReplacementState = {
      receipt: yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, originalReceipt.id))
        .get(),
      legacyEffectReceipt: yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.effect_id, originalReceipt.effect_id))
        .get(),
      navigationReceipt: yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.default_navigation_effect_id, preparedDefault.effect.id))
        .get(),
      invocation: yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
        .get(),
      effect: yield* db
        .select()
        .from(CourseSelectionAcceptanceEffectTable)
        .where(eq(CourseSelectionAcceptanceEffectTable.id, originalReceipt.effect_id))
        .get(),
    }
    yield* db.run(sql.raw("ROLLBACK TO default_navigation_receipt_replace"))
    yield* db.run(sql.raw("RELEASE default_navigation_receipt_replace"))

    yield* db.run(sql.raw("SAVEPOINT anchor_navigation_receipt_replace"))
    const anchorReplacement = yield* insertOrReplaceReceipt(db, {
      id: originalReceipt.id,
      occurrence_id: interaction.occurrenceID,
      origin_session_id: interaction.sessionID,
      origin_message_id: interaction.userMessageID,
      assistant_message_id: anchorInvocation.assistantMessageID,
      invocation_part_id: anchorInvocation.partID,
      capability_identity: LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      capability_version: 1,
      authorization_basis: "learner_request",
      effect_id: null,
      representation_effect_id: null,
      default_navigation_effect_id: null,
      anchor_navigation_effect_id: anchorEffect.id,
      retained_steering_effect_id: null,
      permission_request_id: null,
      confirmation_snapshot: null,
      time_committed: anchorEffect.timeCommitted,
      commit_order: anchorEffect.commitOrder,
    }).pipe(Effect.exit)
    const anchorReplacementState = {
      receipt: yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, originalReceipt.id))
        .get(),
      legacyEffectReceipt: yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.effect_id, originalReceipt.effect_id))
        .get(),
      navigationReceipt: yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.anchor_navigation_effect_id, anchorEffect.id))
        .get(),
      invocation: yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
        .get(),
      effect: yield* db
        .select()
        .from(CourseSelectionAcceptanceEffectTable)
        .where(eq(CourseSelectionAcceptanceEffectTable.id, originalReceipt.effect_id))
        .get(),
    }
    yield* db.run(sql.raw("ROLLBACK TO anchor_navigation_receipt_replace"))
    yield* db.run(sql.raw("RELEASE anchor_navigation_receipt_replace"))

    expect([Exit.isFailure(defaultReplacement), Exit.isFailure(anchorReplacement)]).toEqual([true, true])
    expect(
      [
        defaultExplicitReplace,
        defaultUniqueReplace,
        defaultRowidReplace,
        anchorExplicitReplace,
        anchorUniqueReplace,
        anchorRowidReplace,
      ].map(Exit.isFailure),
    ).toEqual([true, true, true, true, true, true])
    expect([defaultExplicitState, defaultRowidState]).toEqual(
      Array.from({ length: 2 }, () => ({
        transition: defaultTransitionBeforeReplacement,
        frontier: defaultFrontierBeforeReplacement,
      })),
    )
    expect([anchorExplicitState, anchorRowidState]).toEqual(
      Array.from({ length: 2 }, () => ({
        transition: anchorTransitionBeforeReplacement,
        frontier: anchorFrontierBeforeReplacement,
      })),
    )
    expect(defaultUniqueState).toEqual({
      transition: defaultTransitionBeforeReplacement,
      replacement: undefined,
      frontier: defaultFrontierBeforeReplacement,
    })
    expect(anchorUniqueState).toEqual({
      transition: anchorTransitionBeforeReplacement,
      replacement: undefined,
      frontier: anchorFrontierBeforeReplacement,
    })
    expect(defaultReplacementState).toEqual({
      receipt: originalReceipt,
      legacyEffectReceipt: originalReceipt,
      navigationReceipt: undefined,
      invocation: originalInvocation,
      effect: originalEffect,
    })
    expect(anchorReplacementState).toEqual({
      receipt: originalReceipt,
      legacyEffectReceipt: originalReceipt,
      navigationReceipt: undefined,
      invocation: originalInvocation,
      effect: originalEffect,
    })
    yield* runtime.prepare(acceptanceInput, interaction.registration)
    expect(yield* runtime.execute(acceptanceInput, context(interaction.registration, "deny"))).toEqual(originalResult)
  }),
)

it.effect("rejects SQLite replacement of either navigation receipt identity", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    expect(yield* db.get<{ recursive_triggers: number }>(sql`PRAGMA recursive_triggers`)).toEqual({
      recursive_triggers: 0,
    })

    const seeded = yield* seedCourse(courses, "Receipt replacement", "Main")
    const acceptanceInput = acceptance(seeded.course.id, seeded.view.revision.id)
    const acceptanceInteraction = yield* seedInteraction(db, "replace-acceptance", acceptanceInput)
    yield* runtime.prepare(acceptanceInput, acceptanceInteraction.registration)
    const acceptanceResult = yield* runtime.execute(
      acceptanceInput,
      context(acceptanceInteraction.registration, "allow"),
    )
    const acceptanceReceipt = yield* db
      .select()
      .from(LearningCommandReceiptTable)
      .where(eq(LearningCommandReceiptTable.invocation_part_id, acceptanceInteraction.registration.partID))
      .get()
    if (!acceptanceReceipt?.effect_id) return yield* Effect.die("Expected the acceptance receipt fixture")

    const course = yield* courses.getCourse(seeded.course.id)
    const defaultInput = {
      expectedHeadID: null,
      expectedVersion: 0,
      target: {
        courseID: seeded.course.id,
        courseVersion: course.stateVersion,
        selectionRevisionID: seeded.view.revision.id,
        selectionVersion: course.selection.version,
        viewID: seeded.view.view.id,
        viewVersion: 0,
        revisionVersion: 0,
      },
    }
    const defaultInteraction = yield* seedInteraction(
      db,
      "replace-default",
      defaultInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      defaultInput,
      defaultInteraction.registration,
    )
    yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      defaultInput,
      context(defaultInteraction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    const defaultReceipt = yield* db
      .select()
      .from(LearningCommandReceiptTable)
      .where(eq(LearningCommandReceiptTable.invocation_part_id, defaultInteraction.registration.partID))
      .get()
    if (!defaultReceipt?.default_navigation_effect_id) return yield* Effect.die("Expected the default receipt fixture")
    const defaultInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, defaultInteraction.registration.partID))
      .get()
    const defaultTransition = yield* db
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .where(eq(DefaultCoursePreferenceTransitionTable.id, defaultReceipt.default_navigation_effect_id))
      .get()
    if (!defaultTransition) return yield* Effect.die("Expected the default transition fixture")
    const defaultSource = yield* navigation.currentDefault()
    expect(defaultSource.source?.receiptID).toBe(defaultReceipt.id)

    const replacementDefaultID = LearningCommand.createReceiptID()
    const replaceDefaultIdentity = yield* insertOrReplaceReceipt(db, {
      ...defaultReceipt,
      id: replacementDefaultID,
    }).pipe(Effect.exit)
    expect(Exit.isFailure(replaceDefaultIdentity)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, defaultReceipt.id))
        .get(),
    ).toEqual(defaultReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, replacementDefaultID))
        .get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, defaultInteraction.registration.partID))
        .get(),
    ).toEqual(defaultInvocation)
    expect(
      yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, defaultReceipt.default_navigation_effect_id))
        .get(),
    ).toEqual(defaultTransition)
    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: defaultReceipt.default_navigation_effect_id,
      source: { receiptID: defaultReceipt.id },
    })

    const updateDefaultAsWrongKind = yield* db
      .run(
        sql`
        UPDATE OR REPLACE learning_command_receipt
        SET id = ${defaultReceipt.id}
        WHERE id = ${acceptanceReceipt.id}
      `,
      )
      .pipe(Effect.exit)
    expect(Exit.isFailure(updateDefaultAsWrongKind)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, acceptanceReceipt.id))
        .get(),
    ).toEqual(acceptanceReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, defaultReceipt.id))
        .get(),
    ).toEqual(defaultReceipt)

    const removeDefaultAsWrongKind = yield* insertOrReplaceReceipt(db, {
      ...acceptanceReceipt,
      id: defaultReceipt.id,
    }).pipe(Effect.exit)
    expect(Exit.isFailure(removeDefaultAsWrongKind)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, acceptanceReceipt.id))
        .get(),
    ).toEqual(acceptanceReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, defaultReceipt.id))
        .get(),
    ).toEqual(defaultReceipt)
    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: defaultReceipt.default_navigation_effect_id,
      source: { receiptID: defaultReceipt.id },
    })

    const item = (yield* courses.listRevisionItems(seeded.course.id, seeded.view.view.id, seeded.view.revision.id))
      .items[0]
    const anchorInput = {
      courseID: seeded.course.id,
      expectedHeadID: null,
      expectedVersion: 0,
      target: {
        viewID: seeded.view.view.id,
        revisionID: seeded.view.revision.id,
        itemID: item.itemID,
        courseVersion: course.stateVersion,
        selectionVersion: course.selection.version,
        viewVersion: 0,
        revisionVersion: 0,
      },
    }
    const anchorInteraction = yield* seedInteraction(
      db,
      "replace-anchor",
      anchorInput,
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      anchorInput,
      anchorInteraction.registration,
    )
    yield* runtime.executeCommand(
      LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      anchorInput,
      context(anchorInteraction.registration, "allow", LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY),
    )
    const anchorReceipt = yield* db
      .select()
      .from(LearningCommandReceiptTable)
      .where(eq(LearningCommandReceiptTable.invocation_part_id, anchorInteraction.registration.partID))
      .get()
    if (!anchorReceipt?.anchor_navigation_effect_id) return yield* Effect.die("Expected the anchor receipt fixture")
    const anchorInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, anchorInteraction.registration.partID))
      .get()
    const anchorTransition = yield* db
      .select()
      .from(CourseRouteAnchorTransitionTable)
      .where(eq(CourseRouteAnchorTransitionTable.id, anchorReceipt.anchor_navigation_effect_id))
      .get()
    if (!anchorTransition) return yield* Effect.die("Expected the anchor transition fixture")
    const anchorSource = yield* navigation.currentAnchor(seeded.course.id)
    expect(anchorSource.source?.receiptID).toBe(anchorReceipt.id)

    const replacementAnchorID = LearningCommand.createReceiptID()
    const replaceAnchorIdentity = yield* insertOrReplaceReceipt(db, {
      ...anchorReceipt,
      id: replacementAnchorID,
    }).pipe(Effect.exit)
    expect(Exit.isFailure(replaceAnchorIdentity)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, anchorReceipt.id))
        .get(),
    ).toEqual(anchorReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, replacementAnchorID))
        .get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, anchorInteraction.registration.partID))
        .get(),
    ).toEqual(anchorInvocation)
    expect(
      yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, anchorReceipt.anchor_navigation_effect_id))
        .get(),
    ).toEqual(anchorTransition)
    expect(yield* navigation.currentAnchor(seeded.course.id)).toMatchObject({
      headID: anchorReceipt.anchor_navigation_effect_id,
      source: { receiptID: anchorReceipt.id },
    })

    const removeAnchorAsWrongKind = yield* insertOrReplaceReceipt(db, {
      ...acceptanceReceipt,
      id: anchorReceipt.id,
    }).pipe(Effect.exit)
    expect(Exit.isFailure(removeAnchorAsWrongKind)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, acceptanceReceipt.id))
        .get(),
    ).toEqual(acceptanceReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, anchorReceipt.id))
        .get(),
    ).toEqual(anchorReceipt)
    expect(yield* navigation.currentAnchor(seeded.course.id)).toMatchObject({
      headID: anchorReceipt.anchor_navigation_effect_id,
      source: { receiptID: anchorReceipt.id },
    })

    const updateAnchorAsWrongKind = yield* db
      .run(
        sql`
        UPDATE OR REPLACE learning_command_receipt
        SET id = ${anchorReceipt.id}
        WHERE id = ${acceptanceReceipt.id}
      `,
      )
      .pipe(Effect.exit)
    expect(Exit.isFailure(updateAnchorAsWrongKind)).toBe(true)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, acceptanceReceipt.id))
        .get(),
    ).toEqual(acceptanceReceipt)
    expect(
      yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(eq(LearningCommandReceiptTable.id, anchorReceipt.id))
        .get(),
    ).toEqual(anchorReceipt)

    const stateInput = {
      acceptanceReceipt,
      defaultReceipt,
      anchorReceipt,
    }
    const originalState = yield* navigationReplacementState(db, stateInput)
    const tableStorage = yield* db.all<{ name: string; wr: number }>(sql`
      SELECT name, wr
      FROM pragma_table_list
      WHERE name IN (
        'learner_default_course_transition',
        'learner_course_route_anchor_transition',
        'learning_command_receipt'
      )
      ORDER BY name
    `)

    yield* db.run(sql.raw("SAVEPOINT navigation_receipt_insert_rowid"))
    const receiptInsertRowid = yield* db
      .run(
        sql`
        INSERT OR REPLACE INTO learning_command_receipt (
          _rowid_, id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
          invocation_part_id, capability_identity, capability_version, authorization_basis,
          effect_id, representation_effect_id, default_navigation_effect_id, anchor_navigation_effect_id,
          permission_request_id, confirmation_snapshot, time_committed, commit_order
        )
        SELECT
          (SELECT _rowid_ FROM learning_command_receipt WHERE id = ${defaultReceipt.id}),
          id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
          invocation_part_id, capability_identity, capability_version, authorization_basis,
          effect_id, representation_effect_id, default_navigation_effect_id, anchor_navigation_effect_id,
          permission_request_id, confirmation_snapshot, time_committed, commit_order
        FROM learning_command_receipt
        WHERE id = ${acceptanceReceipt.id}
      `,
      )
      .pipe(Effect.exit)
    const receiptInsertRowidState = yield* navigationReplacementState(db, stateInput)
    yield* db.run(sql.raw("ROLLBACK TO navigation_receipt_insert_rowid"))
    yield* db.run(sql.raw("RELEASE navigation_receipt_insert_rowid"))

    yield* db.run(sql.raw("SAVEPOINT navigation_receipt_update_rowid"))
    const receiptUpdateRowid = yield* db
      .run(
        sql`
        UPDATE OR REPLACE learning_command_receipt
        SET _rowid_ = (
          SELECT _rowid_ FROM learning_command_receipt WHERE id = ${anchorReceipt.id}
        )
        WHERE id = ${acceptanceReceipt.id}
      `,
      )
      .pipe(Effect.exit)
    const receiptUpdateRowidState = yield* navigationReplacementState(db, stateInput)
    yield* db.run(sql.raw("ROLLBACK TO navigation_receipt_update_rowid"))
    yield* db.run(sql.raw("RELEASE navigation_receipt_update_rowid"))

    expect([receiptInsertRowid, receiptUpdateRowid].map(Exit.isFailure)).toEqual([true, true])
    expect([receiptInsertRowidState, receiptUpdateRowidState]).toEqual(Array.from({ length: 2 }, () => originalState))
    expect(tableStorage).toEqual([
      { name: "learner_course_route_anchor_transition", wr: 1 },
      { name: "learner_default_course_transition", wr: 1 },
      { name: "learning_command_receipt", wr: 1 },
    ])
    expect(yield* navigation.currentDefault()).toEqual(defaultSource)
    expect(yield* navigation.currentAnchor(seeded.course.id)).toEqual(anchorSource)
    yield* runtime.prepare(acceptanceInput, acceptanceInteraction.registration)
    expect(yield* runtime.execute(acceptanceInput, context(acceptanceInteraction.registration, "deny"))).toEqual(
      acceptanceResult,
    )
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

      const navigationCourse = yield* courses.createCourse({ title: "Persistent default navigation" })
      const navigationInput = {
        expectedHeadID: null,
        expectedVersion: 0,
        target: {
          courseID: navigationCourse.id,
          courseVersion: 0,
          selectionRevisionID: null,
          selectionVersion: 0,
          viewID: null,
          viewVersion: null,
          revisionVersion: null,
        },
      }
      const navigationInteraction = yield* seedInteraction(
        db,
        "reopen-navigation-applied",
        navigationInput,
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      )
      yield* runtime.prepareCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        navigationInput,
        navigationInteraction.registration,
      )
      const navigationApplied = yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        navigationInput,
        context(navigationInteraction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )
      const navigationSettlement = JSON.parse(navigationApplied.output) as {
        effectID: LearnerNavigation.DefaultEffectID
      }
      const pendingNavigationCourse = yield* courses.createCourse({ title: "Interrupted default navigation" })
      const pendingNavigationInput = {
        expectedHeadID: navigationSettlement.effectID,
        expectedVersion: 1,
        target: {
          courseID: pendingNavigationCourse.id,
          courseVersion: 0,
          selectionRevisionID: null,
          selectionVersion: 0,
          viewID: null,
          viewVersion: null,
          revisionVersion: null,
        },
      }
      const pendingNavigationInteraction = yield* seedInteraction(
        db,
        "reopen-navigation-interrupted",
        pendingNavigationInput,
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      )
      yield* runtime.prepareCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        pendingNavigationInput,
        pendingNavigationInteraction.registration,
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
        navigationApplied,
        navigationCourseID: navigationCourse.id,
        navigationInput,
        navigationRegistration: navigationInteraction.registration,
        pendingNavigationCourseID: pendingNavigationCourse.id,
        pendingNavigationInput,
        pendingNavigationRegistration: pendingNavigationInteraction.registration,
      }
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )

  await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const navigation = yield* LearnerNavigation.ReadService
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

      expect(yield* navigation.currentDefault()).toMatchObject({
        courseID: persisted.navigationCourseID,
        version: 1,
        usability: { usable: true },
      })
      const navigationSequence = yield* sequence(db, persisted.navigationRegistration.sessionID)
      yield* runtime.prepareCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        persisted.navigationInput,
        persisted.navigationRegistration,
      )
      expect(
        yield* runtime.executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          persisted.navigationInput,
          context(persisted.navigationRegistration, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        ),
      ).toEqual(persisted.navigationApplied)
      expect(yield* sequence(db, persisted.navigationRegistration.sessionID)).toBe(navigationSequence)

      const pendingNavigation = yield* exactPartResult(db, persisted.pendingNavigationRegistration.partID)
      expect(JSON.parse(pendingNavigation.output)).toMatchObject({ outcome: "error", code: "interrupted" })
      expect(yield* navigation.currentDefault()).toMatchObject({
        courseID: persisted.navigationCourseID,
        version: 1,
      })
      expect(yield* courses.getCourse(persisted.pendingNavigationCourseID)).toMatchObject({
        id: persisted.pendingNavigationCourseID,
      })
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )
})

test("reopens retained steering lineage, cuts, pagination, expiry, acknowledgement, and global sample time", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "retained-steering-reopen.sqlite")
  const persisted = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const sourceTime = Date.now() + 60_000
      const createText = "across all my learning this week, explain before practice"
      const createInput = {
        action: "create" as const,
        sourceExcerpt: createText,
        operativeInstruction: "Explain before asking me to practice.",
        validUntil: new Date(sourceTime + 24 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
      }
      const created = yield* seedInteraction(
        db,
        "retained-reopen-create",
        createInput,
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        { text: createText, time: sourceTime, timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        createInput,
        created.registration,
      )
      const createResult = yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        createInput,
        context(created.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
      )
      const createdSnapshot = yield* db.transaction((tx) =>
        RetainedSteering.readActiveSnapshot(tx, sourceTime + 1),
      )
      const createdHead = createdSnapshot.items[0]?.transition
      if (!createdHead) return yield* Effect.die("Expected the first retained steering head")

      const replacementTime = sourceTime + 1_000
      const replacementText = "across all my learning this week, prefer worked examples"
      const replacementInput = {
        action: "replace" as const,
        policyID: createdHead.policyID,
        expectedHeadID: createdHead.id,
        expectedVersion: createdHead.version,
        sourceExcerpt: replacementText,
        operativeInstruction: "Prefer a worked example before independent practice.",
        validUntil: new Date(sourceTime + 12 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
      }
      const replaced = yield* seedInteraction(
        db,
        "retained-reopen-replace",
        replacementInput,
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        { text: replacementText, time: replacementTime, timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        replacementInput,
        replaced.registration,
      )
      const replacementResult = yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        replacementInput,
        context(replaced.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
      )
      const replacementSnapshot = yield* db.transaction((tx) =>
        RetainedSteering.readActiveSnapshot(tx, replacementTime + 1),
      )
      const replacementHead = replacementSnapshot.items[0]?.transition
      if (!replacementHead) return yield* Effect.die("Expected the replacement retained steering head")

      const retractTime = sourceTime + 2_000
      const retractText = "across all my learning, remove the worked-example instruction"
      const retractInput = {
        action: "retract" as const,
        policyID: replacementHead.policyID,
        expectedHeadID: replacementHead.id,
        expectedVersion: replacementHead.version,
        sourceExcerpt: retractText,
      }
      const pending = yield* seedInteraction(
        db,
        "retained-reopen-pending",
        retractInput,
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        { text: retractText, time: retractTime, timeZone: null },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        retractInput,
        pending.registration,
      )
      const cut = yield* db.transaction((tx) =>
        RetainedSteering.readCut(tx, pending.registration.assistantMessageID),
      )
      if (cut.type !== "available") return yield* Effect.die("Expected the pre-restart retained steering cut")
      const firstPage = yield* db.transaction((tx) =>
        RetainedSteering.readHistory(tx, replacementHead.policyID, replacementTime + 1, { limit: 1 }),
      )
      if (!firstPage.cursor) return yield* Effect.die("Expected a stable retained steering history cursor")

      return {
        sourceTime,
        expiry: replacementHead.validUntil!,
        policyID: replacementHead.policyID,
        replacementHead,
        createInput,
        createResult,
        createRegistration: created.registration,
        replacementInput,
        replacementResult,
        replacementRegistration: replaced.registration,
        pendingRegistration: pending.registration,
        cut: cut.cut,
        firstPage,
      }
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )

  await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service

      expect(yield* exactPartResult(db, persisted.createRegistration.partID)).toEqual(persisted.createResult)
      expect(yield* exactPartResult(db, persisted.replacementRegistration.partID)).toEqual(
        persisted.replacementResult,
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        persisted.replacementInput,
        persisted.replacementRegistration,
      )
      expect(
        yield* runtime.executeCommand(
          LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
          persisted.replacementInput,
          context(
            persisted.replacementRegistration,
            "deny",
            LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
          ),
        ),
      ).toEqual(persisted.replacementResult)
      expect(yield* exactPartResult(db, persisted.pendingRegistration.partID)).toMatchObject({
        title: "Retained learning steering not changed",
        metadata: { outcome: "error", code: "interrupted" },
      })

      expect(
        yield* db.transaction((tx) =>
          RetainedSteering.readPolicy(tx, {
            policyID: persisted.policyID,
            asOf: persisted.replacementHead.effectiveFrom! + 1,
          }),
        ),
      ).toMatchObject({
        steeringRevision: 2,
        head: {
          status: "operative_active",
          transition: {
            id: persisted.replacementHead.id,
            version: 2,
            operativeInstruction: persisted.replacementHead.operativeInstruction,
          },
        },
      })
      expect(yield* db.transaction((tx) => RetainedSteering.readActiveSnapshot(tx, persisted.expiry))).toMatchObject({
        steeringRevision: 2,
        items: [],
      })
      expect(
        yield* db.transaction((tx) =>
          RetainedSteering.readPolicy(tx, { policyID: persisted.policyID, asOf: persisted.expiry }),
        ),
      ).toMatchObject({ head: { status: "operative_expired", transition: { version: 2 } } })
      expect(yield* db.transaction((tx) => RetainedSteering.readCut(tx, persisted.cut.assistantMessageID))).toEqual({
        type: "available",
        cut: persisted.cut,
      })
      expect(
        yield* db.transaction((tx) =>
          RetainedSteering.readHistory(tx, persisted.policyID, persisted.replacementHead.effectiveFrom! + 1, {
            limit: 1,
          }),
        ),
      ).toEqual(persisted.firstPage)
      expect(
        yield* db.transaction((tx) =>
          RetainedSteering.readHistory(tx, persisted.policyID, persisted.replacementHead.effectiveFrom! + 1, {
            limit: 1,
            cursor: persisted.firstPage.cursor,
          }),
        ),
      ).toMatchObject({
        throughSteeringRevision: 2,
        items: [{ transition: { version: 1 } }],
      })
      expect(yield* db.transaction((tx) => RetainedSteering.latestCutAsOf(tx))).toBe(persisted.cut.cutAsOf)

      const regressingText = "Continue with an explanation after restart."
      const regressing = yield* seedInteraction(
        db,
        "retained-reopen-regressing-cut",
        { request: regressingText },
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        { text: regressingText, time: persisted.sourceTime - 1_000, timeZone: "UTC" },
      )
      const regressingCut = yield* db.transaction((tx) =>
        RetainedSteering.readCut(tx, regressing.registration.assistantMessageID),
      )
      expect(regressingCut).toMatchObject({
        type: "available",
        cut: { cutAsOf: persisted.cut.cutAsOf, throughSteeringRevision: 2 },
      })
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

test("rejects a default confirmation whose exact Course snapshot changes while the prompt is open", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "learning-command-default-confirmation-race.sqlite")
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let asks = 0
  const blockingConfirmation = Layer.succeed(
    Permission.Service,
    Permission.Service.of({
      ask: () => {
        asks++
        entered.resolve()
        return Effect.promise(() => release.promise)
      },
      reply: () => Effect.void,
      list: () => Effect.succeed([]),
    }),
  )

  await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const runtime = yield* LearningCommandRuntime.Service
      const course = yield* courses.createCourse({ title: "Original default title" })
      const input = {
        expectedHeadID: null,
        expectedVersion: 0,
        target: {
          courseID: course.id,
          courseVersion: 0,
          selectionRevisionID: null,
          selectionVersion: 0,
          viewID: null,
          viewVersion: null,
          revisionVersion: null,
        },
      }
      const interaction = yield* seedInteraction(
        db,
        "default-confirmation-race",
        input,
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      )
      yield* runtime.prepareCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        input,
        interaction.registration,
      )
      const execution = yield* runtime
        .executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          input,
          context(interaction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        )
        .pipe(Effect.forkChild)
      yield* Effect.promise(() => entered.promise)
      yield* courses.correctCourse({
        courseID: course.id,
        title: "Renamed while confirming",
        expectedCourseVersion: 0,
      })
      const renamedFrontier = yield* db.transaction((tx) => LearningFrontier.read(tx))
      release.resolve()
      const result = yield* Fiber.join(execution)

      expect(JSON.parse(result.output)).toMatchObject({ outcome: "error", code: "stale" })
      expect(asks).toBe(1)
      expect(yield* db.select().from(DefaultCoursePreferenceTransitionTable).all()).toEqual([])
      expect(yield* db.select().from(LearningCommandReceiptTable).all()).toEqual([])
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(renamedFrontier)
    }).pipe(Effect.provide(runtimeLayer(filename, blockingConfirmation)), Effect.scoped),
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

function context(
  registration: LearningCommandRuntime.Registration,
  action: "allow" | "deny" | "ask",
  capability: LearningCommandRuntime.PrimaryCapability = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
  authority: readonly Permission.AuthorityLayer[] = [],
  pattern = "*",
) {
  const ruleset: PermissionV1.Ruleset = [{ permission: capability, pattern, action }]
  return {
    sessionID: registration.sessionID,
    messageID: registration.assistantMessageID,
    callID: registration.callID,
    abort: new AbortController().signal,
    interaction: { permission: { ruleset, authority } },
    extra: {
      toolCall: registration,
      permissionRuleset: ruleset,
    },
  } satisfies LearningCommandRuntime.ExecuteContext
}

function runtimeLayer(filename: string, permissionLayer = permission) {
  return LayerNode.compile(root, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
    [Permission.node, permissionLayer],
  ])
}

function insertAppliedNavigationInvocation(
  db: Database.Interface["db"],
  input: {
    suffix: string
    sessionID: SessionSchema.ID
    parentUserMessageID: SessionV1.MessageID
    occurrenceID: LearningCommand.OccurrenceID
    turnID: Turn.ID
    inputID: Turn.InputID
    receiptID: LearningCommand.ReceiptID
  } & (
    | {
        kind: "default"
        effect: LearnerNavigation.DefaultEffect
        confirmation: LearnerNavigation.DefaultConfirmationSnapshot
        courseTitle: string
        permissionRequestID: PermissionV1.ID
      }
    | { kind: "anchor"; effect: LearnerNavigation.AnchorEffect }
  ),
) {
  const partID = SessionV1.PartID.ascending(`prt_receipt_promotion_${input.suffix}`)
  const assistantMessageID = SessionV1.MessageID.ascending(`msg_receipt_promotion_${input.suffix}`)
  const settlement =
    input.kind === "default"
      ? ({
          outcome: "applied",
          navigationKind: "default_course_preference",
          receiptID: input.receiptID,
          effectID: input.effect.id,
          effect: input.effect,
          current: {
            kind: "default_course_preference",
            headID: input.effect.id,
            version: input.effect.version,
            courseID: input.effect.courseID,
            usability: { usable: true, title: input.courseTitle },
            timeCommitted: input.effect.timeCommitted,
            commitOrder: input.effect.commitOrder,
            frontierSequence: input.effect.frontierSequence,
          },
          confirmation: input.confirmation,
          settlementTime: input.effect.timeCommitted,
          settlementOrder: input.effect.commitOrder,
        } satisfies LearningCommand.DefaultCourseAppliedSettlement)
      : ({
          outcome: "applied",
          navigationKind: "course_route_anchor",
          receiptID: input.receiptID,
          effectID: input.effect.id,
          effect: input.effect,
          current: {
            kind: "course_route_anchor",
            courseID: input.effect.courseID,
            headID: input.effect.id,
            version: input.effect.version,
            target: input.effect.target,
            usability: { usable: true },
            timeCommitted: input.effect.timeCommitted,
            commitOrder: input.effect.commitOrder,
            frontierSequence: input.effect.frontierSequence,
          },
          settlementTime: input.effect.timeCommitted,
          settlementOrder: input.effect.commitOrder,
        } satisfies LearningCommand.RouteAnchorAppliedSettlement)
  return db
    .insert(LearningCommandInvocationTable)
    .values({
      part_id: partID,
      session_id: input.sessionID,
      parent_user_message_id: input.parentUserMessageID,
      assistant_message_id: assistantMessageID,
      provider_call_id: `call-receipt-promotion-${input.suffix}`,
      occurrence_id: input.occurrenceID,
      command_name:
        input.kind === "default"
          ? LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
          : LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      command_version: 1,
      emission_ordinal: 1,
      capability_identity:
        input.kind === "default"
          ? LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
          : LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      capability_version: 1,
      authorization_basis: input.kind === "default" ? "learner_acceptance" : "learner_request",
      input_fingerprint: "f".repeat(64),
      status: "applied",
      default_navigation_effect_id: input.kind === "default" ? input.effect.id : null,
      anchor_navigation_effect_id: input.kind === "anchor" ? input.effect.id : null,
      permission_request_id: input.kind === "default" ? input.permissionRequestID : null,
      settlement,
      time_admitted: input.effect.timeCommitted,
      time_settled: input.effect.timeCommitted,
      settlement_order: input.effect.commitOrder,
      turn_id: input.turnID,
      input_id: input.inputID,
    })
    .run()
    .pipe(Effect.as({ partID, assistantMessageID }))
}

function insertOrReplaceReceipt(
  db: Database.Interface["db"],
  receipt: typeof LearningCommandReceiptTable.$inferSelect,
) {
  return db.run(sql`
    INSERT OR REPLACE INTO learning_command_receipt (
      id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
      invocation_part_id, capability_identity, capability_version, authorization_basis,
      effect_id, representation_effect_id, default_navigation_effect_id, anchor_navigation_effect_id,
      retained_steering_effect_id,
      permission_request_id, confirmation_snapshot, time_committed, commit_order
    ) VALUES (
      ${receipt.id}, ${receipt.occurrence_id}, ${receipt.origin_session_id}, ${receipt.origin_message_id},
      ${receipt.assistant_message_id}, ${receipt.invocation_part_id}, ${receipt.capability_identity},
      ${receipt.capability_version}, ${receipt.authorization_basis}, ${receipt.effect_id},
      ${receipt.representation_effect_id}, ${receipt.default_navigation_effect_id},
      ${receipt.anchor_navigation_effect_id}, ${receipt.retained_steering_effect_id}, ${receipt.permission_request_id},
      ${receipt.confirmation_snapshot === null ? null : JSON.stringify(receipt.confirmation_snapshot)},
      ${receipt.time_committed}, ${receipt.commit_order}
    )
  `)
}

function insertOrReplaceDefaultTransition(
  db: Database.Interface["db"],
  id: LearnerNavigation.DefaultEffectID,
  includeRowid: boolean,
  replacementID = id,
) {
  const rowid = includeRowid ? sql.raw("_rowid_,") : sql.raw("")
  return db.run(sql`
    INSERT OR REPLACE INTO learner_default_course_transition (
      ${rowid}
      id, version, predecessor_id, previous_course_id, course_id, occurrence_id,
      permission_request_id, confirmation_snapshot, target_course_version,
      target_selection_revision_id, target_selection_version, target_view_id,
      target_view_version, target_revision_version, time_committed, commit_order,
      frontier_sequence, frontier_time
    )
    SELECT
      ${rowid}
      ${replacementID}, version, predecessor_id, previous_course_id, course_id, occurrence_id,
      permission_request_id, confirmation_snapshot, target_course_version,
      target_selection_revision_id, target_selection_version, target_view_id,
      target_view_version, target_revision_version, time_committed, commit_order + 1,
      frontier_sequence, frontier_time
    FROM learner_default_course_transition
    WHERE id = ${id}
  `)
}

function insertOrReplaceAnchorTransition(
  db: Database.Interface["db"],
  id: LearnerNavigation.AnchorEffectID,
  includeRowid: boolean,
  replacementID = id,
) {
  const rowid = includeRowid ? sql.raw("_rowid_,") : sql.raw("")
  return db.run(sql`
    INSERT OR REPLACE INTO learner_course_route_anchor_transition (
      ${rowid}
      id, course_id, version, predecessor_id, previous_view_id, previous_revision_id,
      previous_item_id, target_view_id, target_revision_id, target_item_id, occurrence_id,
      target_course_version, target_selection_version, target_view_version,
      target_revision_version, time_committed, commit_order, frontier_sequence, frontier_time
    )
    SELECT
      ${rowid}
      ${replacementID}, course_id, version, predecessor_id, previous_view_id, previous_revision_id,
      previous_item_id, target_view_id, target_revision_id, target_item_id, occurrence_id,
      target_course_version, target_selection_version, target_view_version,
      target_revision_version, time_committed, commit_order + 1, frontier_sequence, frontier_time
    FROM learner_course_route_anchor_transition
    WHERE id = ${id}
  `)
}

function navigationReplacementState(
  db: Database.Interface["db"],
  input: {
    acceptanceReceipt: typeof LearningCommandReceiptTable.$inferSelect
    defaultReceipt: typeof LearningCommandReceiptTable.$inferSelect
    anchorReceipt: typeof LearningCommandReceiptTable.$inferSelect
  },
) {
  return Effect.gen(function* () {
    return {
      receipts: yield* db
        .select()
        .from(LearningCommandReceiptTable)
        .where(
          sql`${LearningCommandReceiptTable.id} IN (${input.acceptanceReceipt.id}, ${input.defaultReceipt.id}, ${input.anchorReceipt.id})`,
        )
        .orderBy(LearningCommandReceiptTable.id)
        .all(),
      invocations: yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(
          sql`${LearningCommandInvocationTable.part_id} IN (${input.acceptanceReceipt.invocation_part_id}, ${input.defaultReceipt.invocation_part_id}, ${input.anchorReceipt.invocation_part_id})`,
        )
        .orderBy(LearningCommandInvocationTable.part_id)
        .all(),
      acceptanceEffect: yield* db
        .select()
        .from(CourseSelectionAcceptanceEffectTable)
        .where(eq(CourseSelectionAcceptanceEffectTable.id, input.acceptanceReceipt.effect_id!))
        .get(),
      defaultTransition: yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, input.defaultReceipt.default_navigation_effect_id!))
        .get(),
      anchorTransition: yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, input.anchorReceipt.anchor_navigation_effect_id!))
        .get(),
      frontier: yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`),
    }
  })
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

function seedInteraction(
  db: Database.Interface["db"],
  suffix: string,
  input: Record<string, unknown>,
  toolID: LearningCommandRuntime.PrimaryCapability = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
  options: { readonly text?: string; readonly time?: number; readonly timeZone?: string | null } = {},
) {
  return Effect.gen(function* () {
    const time = options.time ?? Date.now()
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
        data: {
          type: "text",
          text: options.text ?? "Accept this Course View Revision",
        } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    const occurrenceID = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const occurrence = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({ timeZone: options.timeZone }),
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
      registration: yield* insertAssistant(db, interaction, suffix, input, toolID),
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
  input: Record<string, unknown>,
  toolID: LearningCommandRuntime.PrimaryCapability = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
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
              tool: toolID,
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
              tool: toolID,
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
