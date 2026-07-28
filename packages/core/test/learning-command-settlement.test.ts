import { describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
import { Course } from "@opencode-ai/core/course"
import { CourseSelectionAcceptanceEffectTable } from "@opencode-ai/core/course/sql"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearningCommand, Occurrence } from "@opencode-ai/core/learning-command"
import { settlePhysicalInvocation } from "@opencode-ai/core/learning-command/physical"
import { isNavigationSettlement } from "@opencode-ai/core/learner-navigation/learning-command-settlement"
import {
  AdmittedLearnerOccurrenceTable,
  LearnerOccurrenceTombstoneTable,
} from "@opencode-ai/core/learning-command/occurrence.sql"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Course.node, Database.node]), [[Database.node, database]]))
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

describe("learning-command settlement storage", () => {
  test("rejects a partial Navigation projection source group", () => {
    expect(
      isNavigationSettlement({
        outcome: "no_change",
        navigationKind: "course_route_anchor",
        current: {
          kind: "course_route_anchor",
          courseID: "crs_00000000000000000000000001",
          headID: null,
          version: 0,
          target: null,
          usability: { usable: false, cause: "absent" },
          timeCommitted: 1,
        },
        settlementTime: 2,
        settlementOrder: 1,
      }),
    ).toBe(false)
  })

  it.effect("rejects a recursively malformed Navigation no-change settlement on domain replay", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const course = yield* (yield* Course.Service).createCourse({ title: "Malformed navigation replay" })
      const base = Date.now()
      const sessionID = SessionSchema.ID.make("ses_navigation_malformed_replay")
      const parentUserMessageID = SessionV1.MessageID.ascending("msg_navigation_malformed_user")
      const userPartID = SessionV1.PartID.ascending("prt_navigation_malformed_user")
      const assistantMessageID = SessionV1.MessageID.ascending("msg_navigation_malformed_assistant")
      const partID = SessionV1.PartID.ascending("prt_navigation_malformed_tool")
      const callID = "call-navigation-malformed"
      yield* seedSession(db, sessionID, base - 2)
      yield* insertUserPresentation(db, sessionID, parentUserMessageID, userPartID, base)
      const occurrence = yield* db.transaction((tx) =>
        Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive(),
          sessionID,
          messageID: parentUserMessageID,
          timeAdmitted: base,
        }),
      )
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .insert(MessageTable)
              .values({
                id: assistantMessageID,
                session_id: sessionID,
                data: assistantData(parentUserMessageID, base + 1),
                time_created: base + 1,
                time_updated: base + 1,
              })
              .run()
            yield* tx
              .insert(PartTable)
              .values({
                id: partID,
                session_id: sessionID,
                message_id: assistantMessageID,
                data: toolPartData(callID, LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY),
                time_created: base + 1,
                time_updated: base + 1,
              })
              .run()
          }),
        )
        .pipe(Effect.orDie)
      const invocation = {
        envelope: {
          occurrenceID: occurrence.id,
          turnID: Turn.ID.create(),
          inputID: Turn.InputID.create(),
          sessionID,
          parentUserMessageID,
          assistantMessageID,
          partID,
          providerCallID: callID,
          emissionOrdinal: 0,
          capabilityIdentity: LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
          capabilityVersion: LearningCommand.SET_COURSE_ROUTE_ANCHOR_VERSION,
          authorizationBasis: "learner_request" as const,
          timeAdmitted: base + 2,
        },
        command: {
          kind: "course_route_anchor" as const,
          courseID: course.id,
          expectedHeadID: null,
          expectedVersion: 0,
          target: null,
        },
      }
      expect(yield* db.transaction((tx) => LearningCommand.reserveNavigation(tx, invocation))).toEqual({
        type: "candidate",
      })
      yield* db.transaction((tx) =>
        settlePhysicalInvocation(tx, partID, {
          outcome: "no_change",
          navigationKind: "course_route_anchor",
          current: {
            kind: "course_route_anchor",
            courseID: course.id,
            headID: null,
            version: 0,
            target: null,
            usability: {},
          },
          settlementTime: base + 3,
          settlementOrder: 1,
        }),
      )

      const replay = yield* db
        .transaction((tx) => LearningCommand.reserveNavigation(tx, invocation))
        .pipe(Effect.exit)
      expect(Exit.isFailure(replay)).toBe(true)
    }),
  )

  it.effect("rejects a partial Navigation projection source group on domain replay", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const course = yield* (yield* Course.Service).createCourse({ title: "Partial navigation replay" })
      const base = Date.now()
      const sessionID = SessionSchema.ID.make("ses_navigation_partial_replay")
      const parentUserMessageID = SessionV1.MessageID.ascending("msg_navigation_partial_user")
      const userPartID = SessionV1.PartID.ascending("prt_navigation_partial_user")
      const assistantMessageID = SessionV1.MessageID.ascending("msg_navigation_partial_assistant")
      const partID = SessionV1.PartID.ascending("prt_navigation_partial_tool")
      const callID = "call-navigation-partial"
      yield* seedSession(db, sessionID, base - 2)
      yield* insertUserPresentation(db, sessionID, parentUserMessageID, userPartID, base)
      const occurrence = yield* db.transaction((tx) =>
        Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive(),
          sessionID,
          messageID: parentUserMessageID,
          timeAdmitted: base,
        }),
      )
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .insert(MessageTable)
              .values({
                id: assistantMessageID,
                session_id: sessionID,
                data: assistantData(parentUserMessageID, base + 1),
                time_created: base + 1,
                time_updated: base + 1,
              })
              .run()
            yield* tx
              .insert(PartTable)
              .values({
                id: partID,
                session_id: sessionID,
                message_id: assistantMessageID,
                data: toolPartData(callID, LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY),
                time_created: base + 1,
                time_updated: base + 1,
              })
              .run()
          }),
        )
        .pipe(Effect.orDie)
      const invocation = {
        envelope: {
          occurrenceID: occurrence.id,
          turnID: Turn.ID.create(),
          inputID: Turn.InputID.create(),
          sessionID,
          parentUserMessageID,
          assistantMessageID,
          partID,
          providerCallID: callID,
          emissionOrdinal: 0,
          capabilityIdentity: LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
          capabilityVersion: LearningCommand.SET_COURSE_ROUTE_ANCHOR_VERSION,
          authorizationBasis: "learner_request" as const,
          timeAdmitted: base + 2,
        },
        command: {
          kind: "course_route_anchor" as const,
          courseID: course.id,
          expectedHeadID: null,
          expectedVersion: 0,
          target: null,
        },
      }
      expect(yield* db.transaction((tx) => LearningCommand.reserveNavigation(tx, invocation))).toEqual({
        type: "candidate",
      })
      yield* db.transaction((tx) =>
        settlePhysicalInvocation(tx, partID, {
          outcome: "no_change",
          navigationKind: "course_route_anchor",
          current: {
            kind: "course_route_anchor",
            courseID: course.id,
            headID: null,
            version: 0,
            target: null,
            usability: { usable: false, cause: "absent" },
            timeCommitted: base + 3,
          },
          settlementTime: base + 3,
          settlementOrder: 1,
        }),
      )

      const replay = yield* db
        .transaction((tx) => LearningCommand.reserveNavigation(tx, invocation))
        .pipe(Effect.exit)
      expect(Exit.isFailure(replay)).toBe(true)
    }),
  )

  it.effect("rejects learner acceptance as Route Anchor authority without admitting a physical invocation", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const course = yield* (yield* Course.Service).createCourse({ title: "Wrong-basis rollback" })
      const partID = SessionV1.PartID.ascending("prt_route_anchor_wrong_basis")
      const error = yield* db
        .transaction((tx) =>
          LearningCommand.reserveNavigation(tx, {
            envelope: {
              occurrenceID: LearningCommand.createOccurrenceID(),
              turnID: Turn.ID.create(),
              inputID: Turn.InputID.create(),
              sessionID: SessionSchema.ID.make("ses_route_anchor_wrong_basis"),
              parentUserMessageID: SessionV1.MessageID.ascending("msg_route_anchor_wrong_basis_user"),
              assistantMessageID: SessionV1.MessageID.ascending("msg_route_anchor_wrong_basis_assistant"),
              partID,
              providerCallID: "call-route-anchor-wrong-basis",
              emissionOrdinal: 0,
              capabilityIdentity: LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
              capabilityVersion: LearningCommand.SET_COURSE_ROUTE_ANCHOR_VERSION,
              authorizationBasis: "learner_acceptance",
              timeAdmitted: Date.now(),
            },
            command: {
              kind: "course_route_anchor",
              courseID: course.id,
              expectedHeadID: null,
              expectedVersion: 0,
              target: null,
            },
          }),
        )
        .pipe(Effect.flip)

      expect(error).toMatchObject({
        _tag: "LearningCommand.InvalidInvocationEnvelopeError",
        reason: "invalid_authorization_basis",
      })
      expect(
        yield* db
          .select({ partID: LearningCommandInvocationTable.part_id })
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, partID))
          .get(),
      ).toBeUndefined()
    }),
  )

  it.effect("settles exact Course results with physical-first replay, semantic replay, ABA, and rollback", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Algorithms" })
      const first = yield* courses.createView({
        courseID: course.id,
        name: "Conceptual",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "root", title: "Graphs" }] },
      })
      const second = yield* courses.createView({
        courseID: course.id,
        name: "Practice",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.tutorProposed(),
        revision: { items: [{ key: "root", title: "Graph practice" }] },
      })
      const otherCourse = yield* courses.createCourse({ title: "Operating systems" })
      const otherView = yield* courses.createView({
        courseID: otherCourse.id,
        name: "Main",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "root", title: "Processes" }] },
      })
      const base = Date.now() + 1_000
      const sessionID = SessionSchema.ID.make("ses_learning_command")
      yield* seedSession(db, sessionID, base - 100)

      const insertUser = (index: number, time: number) => {
        const messageID = SessionV1.MessageID.ascending(`msg_learning_user_${index}`)
        const partID = SessionV1.PartID.ascending(`prt_learning_user_${index}`)
        return db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(MessageTable)
                .values({
                  id: messageID,
                  session_id: sessionID,
                  data: userData(time),
                  time_created: time,
                  time_updated: time,
                })
                .run()
              yield* tx
                .insert(PartTable)
                .values({
                  id: partID,
                  session_id: sessionID,
                  message_id: messageID,
                  data: textPartData(`accept route ${index}`),
                  time_created: time,
                  time_updated: time,
                })
                .run()
              return messageID
            }),
          )
          .pipe(Effect.orDie)
      }
      const admitUser = (index: number, time: number) =>
        Effect.gen(function* () {
          const messageID = yield* insertUser(index, time)
          const occurrence = yield* db.transaction((tx) =>
            Occurrence.admit(tx, {
              admission: LearningCommand.LearnerAdmission.interactive(),
              sessionID,
              messageID,
              timeAdmitted: time,
            }),
          )
          return { messageID, occurrence }
        })
      const insertInvocation = (
        index: number,
        parentUserMessageID: SessionV1.MessageID,
        occurrenceID: LearningCommand.OccurrenceID,
        callID: string,
        time: number,
        command: Course.SelectionAcceptanceInput,
      ) => {
        const assistantMessageID = SessionV1.MessageID.ascending(`msg_learning_assistant_${index}`)
        const partID = SessionV1.PartID.ascending(`prt_learning_tool_${index}`)
        return db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(MessageTable)
                .values({
                  id: assistantMessageID,
                  session_id: sessionID,
                  data: assistantData(parentUserMessageID, time),
                  time_created: time,
                  time_updated: time,
                })
                .run()
              yield* tx
                .insert(PartTable)
                .values({
                  id: partID,
                  session_id: sessionID,
                  message_id: assistantMessageID,
                  data: toolPartData(callID),
                  time_created: time,
                  time_updated: time,
                })
                .run()
              return {
                envelope: {
                  occurrenceID,
                  turnID: Turn.ID.create(),
                  inputID: Turn.InputID.create(),
                  sessionID,
                  parentUserMessageID,
                  assistantMessageID,
                  partID,
                  providerCallID: callID,
                  emissionOrdinal: 0,
                  capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
                  capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
                  authorizationBasis: "learner_acceptance" as const,
                  timeAdmitted: time,
                },
                command,
              }
            }),
          )
          .pipe(Effect.orDie)
      }
      const command = (
        revisionID: Course.RevisionID,
        expectedSelectionRevisionID: Course.RevisionID | undefined,
        expectedSelectionVersion: number,
      ): Course.SelectionAcceptanceInput => ({
        courseID: course.id,
        revisionID,
        expectedCourseVersion: 0,
        expectedSelectionRevisionID,
        expectedSelectionVersion,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })

      const origin = yield* admitUser(1, base)
      const initial = yield* insertInvocation(
        1,
        origin.messageID,
        origin.occurrence.id,
        "call-initial",
        base + 1,
        command(first.revision.id, undefined, 0),
      )
      expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, initial))).toEqual({
        type: "candidate",
      })
      expect(
        Exit.isFailure(
          yield* db
            .run(sql`
              UPDATE learning_command_invocation
              SET status = 'no_change',
                  settlement = ${JSON.stringify({
                    outcome: "no_change",
                    settlementTime: base + 2,
                    settlementOrder: 1,
                  })},
                  time_settled = ${base + 2},
                  settlement_order = 1
              WHERE part_id = ${initial.envelope.partID}
            `)
            .pipe(Effect.exit),
        ),
      ).toBe(true)
      const applied = yield* db.transaction((tx) =>
        LearningCommand.settleAcceptance(tx, {
          ...initial,
          permission: { type: "allow" },
          settlement: { time: base + 2, order: 1 },
        }),
      )
      expect(applied).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          previousSelection: { revisionID: undefined, version: 0 },
          committedSelection: { revisionID: first.revision.id, version: 1 },
        },
      })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: first.revision.id, version: 1 })

      const physicalReplay = yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, initial))
      expect(physicalReplay).toEqual({ type: "replay", settlement: applied.settlement })
      const admissionTimeConflict = yield* db
        .transaction((tx) =>
          LearningCommand.reserveAcceptance(tx, {
            ...initial,
            envelope: { ...initial.envelope, timeAdmitted: initial.envelope.timeAdmitted + 1 },
          }),
        )
        .pipe(Effect.flip)
      expect(admissionTimeConflict).toMatchObject({ _tag: "LearningCommand.InvocationConflictError" })
      const appliedAssistantDelete = yield* db.transaction((tx) =>
        LearningCommand.removeNoEffectInvocationsForAssistant(tx, initial.envelope.assistantMessageID).pipe(
          Effect.flip,
        ),
      )
      expect(appliedAssistantDelete).toMatchObject({
        _tag: "LearningCommand.AppliedAssistantImmutableError",
        assistantMessageID: initial.envelope.assistantMessageID,
        partID: initial.envelope.partID,
      })

      const conflictingPartID = SessionV1.PartID.ascending("prt_learning_physical_conflict")
      yield* db
        .insert(PartTable)
        .values({
          id: conflictingPartID,
          session_id: sessionID,
          message_id: initial.envelope.assistantMessageID,
          data: toolPartData(initial.envelope.providerCallID),
          time_created: base + 2,
          time_updated: base + 2,
        })
        .run()
      const physicalConflict = yield* db
        .transaction((tx) =>
          LearningCommand.reserveAcceptance(tx, {
            ...initial,
            envelope: { ...initial.envelope, partID: conflictingPartID, emissionOrdinal: 1 },
          }),
        )
        .pipe(Effect.flip)
      expect(physicalConflict).toMatchObject({ _tag: "LearningCommand.InvocationConflictError" })
      expect(yield* db.transaction((tx) => LearningCommand.exactSettlement(tx, initial.envelope.partID))).toEqual(
        applied.settlement,
      )

      const secondMutationPartID = SessionV1.PartID.ascending("prt_learning_second_mutation")
      yield* db
        .insert(PartTable)
        .values({
          id: secondMutationPartID,
          session_id: sessionID,
          message_id: initial.envelope.assistantMessageID,
          data: toolPartData("call-second-mutation"),
          time_created: base + 2,
          time_updated: base + 2,
        })
        .run()
      const secondMutation = {
        envelope: {
          ...initial.envelope,
          partID: secondMutationPartID,
          providerCallID: "call-second-mutation",
          emissionOrdinal: 2,
          timeAdmitted: base + 2,
        },
        command: {
          courseID: otherCourse.id,
          revisionID: otherView.revision.id,
          expectedCourseVersion: 0,
          expectedSelectionVersion: 0,
          expectedViewVersion: 0,
          expectedRevisionVersion: 0,
        },
      }
      const contextRefresh = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          expect(yield* LearningCommand.reserveAcceptance(tx, secondMutation)).toEqual({
            type: "terminal",
            reason: "context_refresh_required",
          })
          return yield* LearningCommand.settleReservation(tx, {
            ...secondMutation,
            settlement: { time: base + 3, order: 20 },
          })
        }),
      )
      expect(contextRefresh).toMatchObject({
        settlement: { outcome: "error", code: "context_refresh_required" },
      })
      expect((yield* courses.getCourse(otherCourse.id)).selection).toEqual({ revisionID: undefined, version: 0 })

      const duplicate = yield* insertInvocation(
        2,
        origin.messageID,
        origin.occurrence.id,
        "call-duplicate",
        base + 3,
        command(first.revision.id, undefined, 0),
      )
      const duplicateResult = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          expect(yield* LearningCommand.reserveAcceptance(tx, duplicate)).toEqual({
            type: "terminal",
            reason: "already_applied",
          })
          return yield* LearningCommand.settleReservation(tx, {
            ...duplicate,
            settlement: { time: base + 4, order: 2 },
          })
        }),
      )
      expect(duplicateResult).toMatchObject({
        settlement: { outcome: "already_applied", relation: "active", currentSelection: { version: 1 } },
      })
      expect((yield* courses.getCourse(course.id)).selection.version).toBe(1)

      const conflicting = yield* insertInvocation(
        3,
        origin.messageID,
        origin.occurrence.id,
        "call-conflict",
        base + 5,
        command(second.revision.id, undefined, 0),
      )
      const semanticConflict = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          expect(yield* LearningCommand.reserveAcceptance(tx, conflicting)).toEqual({
            type: "terminal",
            reason: "semantic_conflict",
          })
          return yield* LearningCommand.settleReservation(tx, {
            ...conflicting,
            settlement: { time: base + 6, order: 3 },
          })
        }),
      )
      expect(semanticConflict).toMatchObject({ settlement: { outcome: "error", code: "semantic_conflict" } })

      const next = yield* admitUser(2, base + 7)
      const selectSecond = yield* insertInvocation(
        4,
        next.messageID,
        next.occurrence.id,
        "call-second",
        base + 8,
        command(second.revision.id, first.revision.id, 1),
      )
      yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, selectSecond))
      yield* db.transaction((tx) =>
        LearningCommand.settleAcceptance(tx, {
          ...selectSecond,
          permission: { type: "allow" },
          settlement: { time: base + 9, order: 4 },
        }),
      )

      const third = yield* admitUser(3, base + 10)
      const selectFirstAgain = yield* insertInvocation(
        5,
        third.messageID,
        third.occurrence.id,
        "call-first-again",
        base + 11,
        command(first.revision.id, second.revision.id, 2),
      )
      yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, selectFirstAgain))
      yield* db.transaction((tx) =>
        LearningCommand.settleAcceptance(tx, {
          ...selectFirstAgain,
          permission: { type: "allow" },
          settlement: { time: base + 12, order: 5 },
        }),
      )
      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: first.revision.id, version: 3 })

      const duplicateAfterABA = yield* insertInvocation(
        6,
        origin.messageID,
        origin.occurrence.id,
        "call-duplicate-aba",
        base + 13,
        command(first.revision.id, undefined, 0),
      )
      const superseded = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* LearningCommand.reserveAcceptance(tx, duplicateAfterABA)
          return yield* LearningCommand.settleReservation(tx, {
            ...duplicateAfterABA,
            settlement: { time: base + 14, order: 6 },
          })
        }),
      )
      expect(superseded).toMatchObject({
        settlement: {
          outcome: "already_applied",
          relation: "superseded",
          currentSelection: { revisionID: first.revision.id, version: 3 },
        },
      })

      const rollbackCause = yield* admitUser(4, base + 15)
      const rolledBackInvocation = yield* insertInvocation(
        7,
        rollbackCause.messageID,
        rollbackCause.occurrence.id,
        "call-rollback",
        base + 16,
        command(second.revision.id, first.revision.id, 3),
      )
      yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, rolledBackInvocation))
      const rollback = yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* LearningCommand.settleAcceptance(tx, {
              ...rolledBackInvocation,
              permission: { type: "allow" },
              settlement: { time: base + 17, order: 7 },
            })
            return yield* Effect.fail("injected after settlement")
          }),
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(rollback)).toBeTrue()
      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: first.revision.id, version: 3 })
      expect(
        yield* db
          .select({ status: LearningCommandInvocationTable.status })
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, rolledBackInvocation.envelope.partID))
          .get(),
      ).toEqual({ status: "admitted" })
      expect(
        yield* db
          .select({ id: CourseSelectionAcceptanceEffectTable.id })
          .from(CourseSelectionAcceptanceEffectTable)
          .where(eq(CourseSelectionAcceptanceEffectTable.occurrence_id, rollbackCause.occurrence.id))
          .get(),
      ).toBeUndefined()
      expect(
        yield* db
          .select({ id: LearningCommandReceiptTable.id })
          .from(LearningCommandReceiptTable)
          .where(eq(LearningCommandReceiptTable.occurrence_id, rollbackCause.occurrence.id))
          .get(),
      ).toBeUndefined()

      const interrupted = yield* db.transaction((tx) =>
        LearningCommand.recoverInterrupted(tx, {
          partID: rolledBackInvocation.envelope.partID,
          settlement: { time: base + 18, order: 8 },
        }),
      )
      expect(interrupted).toMatchObject({ settlement: { outcome: "error", code: "interrupted" } })
      if (interrupted.type !== "settled") throw new Error("Expected the admitted invocation to settle as interrupted")
      expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, rolledBackInvocation))).toEqual({
        type: "replay",
        settlement: interrupted.settlement,
      })

      const waitingCause = yield* admitUser(5, base + 19)
      const waiting = yield* insertInvocation(
        8,
        waitingCause.messageID,
        waitingCause.occurrence.id,
        "call-waiting",
        base + 20,
        command(second.revision.id, first.revision.id, 3),
      )
      const winner = yield* insertInvocation(
        9,
        waitingCause.messageID,
        waitingCause.occurrence.id,
        "call-winner",
        base + 21,
        command(second.revision.id, first.revision.id, 3),
      )
      expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, waiting))).toEqual({
        type: "candidate",
      })
      expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, winner))).toEqual({
        type: "candidate",
      })
      const winningSettlement = yield* db.transaction((tx) =>
        LearningCommand.settleAcceptance(tx, {
          ...winner,
          permission: { type: "allow" },
          settlement: { time: base + 22, order: 9 },
        }),
      )
      const duplicateAfterWait = yield* db.transaction((tx) =>
        LearningCommand.settleAcceptance(tx, {
          ...waiting,
          permission: { type: "deny" },
          settlement: { time: base + 23, order: 10 },
        }),
      )
      expect(winningSettlement).toMatchObject({ settlement: { outcome: "applied" } })
      expect(duplicateAfterWait).toMatchObject({
        settlement: {
          outcome: "already_applied",
          effectID:
            winningSettlement.type === "settled" && winningSettlement.settlement.outcome === "applied"
              ? winningSettlement.settlement.effectID
              : undefined,
          relation: "active",
        },
      })
      expect((yield* courses.getCourse(course.id)).selection).toEqual({ revisionID: second.revision.id, version: 4 })

      yield* Effect.forEach(
        [
          { index: 10, capabilityIdentity: "forged.accept-course", capabilityVersion: 1 },
          {
            index: 11,
            capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
            capabilityVersion: 2,
          },
        ],
        (forged) =>
          Effect.gen(function* () {
            const time = base + 30 + forged.index
            const cause = yield* admitUser(forged.index, time)
            const invocation = yield* insertInvocation(
              forged.index,
              cause.messageID,
              cause.occurrence.id,
              `call-forged-${forged.index}`,
              time + 1,
              command(first.revision.id, second.revision.id, 4),
            )
            const effectID = `effect_forged_${forged.index}`
            const receiptID = `receipt_forged_${forged.index}`
            yield* db.transaction((tx) =>
              Effect.gen(function* () {
                yield* tx.run(sql`
                  INSERT INTO learning_command_invocation (
                    part_id, session_id, parent_user_message_id, assistant_message_id,
                    provider_call_id, occurrence_id, command_name, command_version,
                    emission_ordinal, capability_identity, capability_version,
                    authorization_basis, input_fingerprint, status, time_admitted, turn_id, input_id
                  ) VALUES (
                    ${invocation.envelope.partID}, ${sessionID}, ${cause.messageID},
                    ${invocation.envelope.assistantMessageID}, ${invocation.envelope.providerCallID},
                    ${cause.occurrence.id}, 'accept_course_view_revision', 1, 0,
                    ${forged.capabilityIdentity}, ${forged.capabilityVersion}, 'learner_acceptance',
                    ${"f".repeat(64)}, 'admitted', ${time + 1}, ${invocation.envelope.turnID},
                    ${invocation.envelope.inputID}
                  )
                `)
                yield* tx.run(sql`
                  INSERT INTO course_selection_acceptance_effect (
                    id, occurrence_id, course_id, accepted_revision_id, previous_revision_id,
                    previous_selection_version, committed_selection_version, time_committed
                  ) VALUES (
                    ${effectID}, ${cause.occurrence.id}, ${course.id}, ${first.revision.id},
                    ${second.revision.id}, 4, 5, ${time + 2}
                  )
                `)
                yield* tx.run(sql`
                  INSERT INTO learning_command_receipt (
                    id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
                    invocation_part_id, capability_identity, capability_version,
                    authorization_basis, time_committed, commit_order
                  ) VALUES (
                    ${receiptID}, ${cause.occurrence.id}, ${sessionID}, ${cause.messageID},
                    ${invocation.envelope.assistantMessageID}, ${invocation.envelope.partID},
                    ${forged.capabilityIdentity}, ${forged.capabilityVersion}, 'learner_acceptance',
                    ${time + 2}, ${forged.index}
                  )
                `)
                const rejected = yield* tx
                  .run(sql`
                    INSERT INTO course_selection_acceptance_commit_seal (
                      effect_id, receipt_id, invocation_part_id
                    ) VALUES (${effectID}, ${receiptID}, ${invocation.envelope.partID})
                  `)
                  .pipe(Effect.flip)
                expect(rejected).toBeDefined()
              }),
            )
            expect(
              yield* db.get(sql`
                SELECT effect_id
                FROM course_selection_acceptance_commit_seal
                WHERE effect_id = ${effectID}
              `),
            ).toBeUndefined()
          }),
        { discard: true },
      )
    }),
  )

  it.effect("keeps copied occurrence lineage monotonic and no-effect invocation keys Assistant-owned", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Databases" })
      const view = yield* courses.createView({
        courseID: course.id,
        name: "Main",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "root", title: "Transactions" }] },
      })
      const base = Date.now() + 1_000
      const sessionID = SessionSchema.ID.make("ses_learning_lineage")
      yield* seedSession(db, sessionID, base - 100)
      const originMessageID = SessionV1.MessageID.ascending("msg_lineage_origin")
      const originPartID = SessionV1.PartID.ascending("prt_lineage_origin")
      yield* insertUserPresentation(db, sessionID, originMessageID, originPartID, base)
      const occurrence = yield* db.transaction((tx) =>
        Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive(),
          sessionID,
          messageID: originMessageID,
          timeAdmitted: base,
        }),
      )

      const cloneMessageID = SessionV1.MessageID.ascending("msg_lineage_clone")
      const clonePartID = SessionV1.PartID.ascending("prt_lineage_clone")
      yield* insertUserPresentation(db, sessionID, cloneMessageID, clonePartID, base + 1)
      const clone = yield* db.transaction((tx) =>
        Occurrence.copyPresentation(tx, {
          sourceMessageID: originMessageID,
          sessionID,
          messageID: cloneMessageID,
          provenance: "compaction_replay",
        }),
      )
      expect(clone.occurrenceID).toBe(occurrence.id)

      const assistantMessageID = SessionV1.MessageID.ascending("msg_lineage_assistant")
      const toolPartID = SessionV1.PartID.ascending("prt_lineage_tool")
      const invocation = {
        envelope: {
          occurrenceID: occurrence.id,
          turnID: Turn.ID.create(),
          inputID: Turn.InputID.create(),
          sessionID,
          parentUserMessageID: cloneMessageID,
          assistantMessageID,
          partID: toolPartID,
          providerCallID: "call-denied",
          emissionOrdinal: 0,
          capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          capabilityVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
          authorizationBasis: "learner_request" as const,
          timeAdmitted: base + 3,
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
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .insert(MessageTable)
              .values({
                id: assistantMessageID,
                session_id: sessionID,
                data: assistantData(cloneMessageID, base + 2),
                time_created: base + 2,
                time_updated: base + 2,
              })
              .run()
            yield* tx
              .insert(PartTable)
              .values({
                id: toolPartID,
                session_id: sessionID,
                message_id: assistantMessageID,
                data: toolPartData("call-denied"),
                time_created: base + 2,
                time_updated: base + 2,
              })
              .run()
          }),
        )
        .pipe(Effect.orDie)
      yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, invocation))
      const denied = yield* db.transaction((tx) =>
        LearningCommand.settleAcceptance(tx, {
          ...invocation,
          permission: { type: "deny" },
          settlement: { time: base + 4, order: 1 },
        }),
      )
      expect(denied).toMatchObject({ settlement: { outcome: "error", code: "permission_rejected" } })

      const immutable = yield* db.transaction((tx) =>
        LearningCommand.assertPartDeletable(tx, toolPartID).pipe(Effect.flip),
      )
      expect(immutable).toMatchObject({ _tag: "LearningCommand.SettledPartImmutableError", partID: toolPartID })

      yield* db.transaction((tx) =>
        LearningCommand.removeOccurrencePresentation(tx, { messageID: originMessageID, timeDeleted: base + 5 }),
      )
      expect(
        yield* db
          .select()
          .from(LearnerOccurrenceTombstoneTable)
          .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, occurrence.id))
          .get(),
      ).toMatchObject({ reason: "source_unavailable" })
      const unavailable = yield* db.transaction((tx) =>
        Occurrence.requireAvailableSource(tx, {
          sessionID,
          messageID: cloneMessageID,
          occurrenceID: occurrence.id,
        }).pipe(Effect.flip),
      )
      expect(unavailable).toMatchObject({ reason: "source_unavailable" })
      expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, invocation))).toEqual({
        type: "replay",
        settlement: denied.settlement,
      })

      const unavailablePartID = SessionV1.PartID.ascending("prt_lineage_unavailable")
      yield* db
        .insert(PartTable)
        .values({
          id: unavailablePartID,
          session_id: sessionID,
          message_id: assistantMessageID,
          data: toolPartData("call-unavailable"),
          time_created: base + 5,
          time_updated: base + 5,
        })
        .run()
      const unavailableInvocation = {
        ...invocation,
        envelope: {
          ...invocation.envelope,
          partID: unavailablePartID,
          providerCallID: "call-unavailable",
          emissionOrdinal: 1,
          timeAdmitted: base + 5,
        },
      }
      expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, unavailableInvocation))).toEqual({
        type: "candidate",
      })
      const unavailableSettlement = yield* db.transaction((tx) =>
        LearningCommand.settleAcceptance(tx, {
          ...unavailableInvocation,
          permission: { type: "allow" },
          settlement: { time: base + 6, order: 2 },
        }),
      )
      expect(unavailableSettlement).toMatchObject({ settlement: { outcome: "error", code: "source_unavailable" } })

      yield* Effect.forEach(
        [
          { permission: { type: "correct" as const }, code: "permission_corrected", suffix: "corrected" },
          { permission: { type: "cancel" as const }, code: "cancelled", suffix: "cancelled" },
          { permission: { type: "abort" as const }, code: "interrupted", suffix: "aborted" },
        ],
        (item, index) =>
          Effect.gen(function* () {
            const partID = SessionV1.PartID.ascending(`prt_lineage_${item.suffix}`)
            const callID = `call-${item.suffix}`
            yield* db
              .insert(PartTable)
              .values({
                id: partID,
                session_id: sessionID,
                message_id: assistantMessageID,
                data: toolPartData(callID),
                time_created: base + 7 + index,
                time_updated: base + 7 + index,
              })
              .run()
            const next = {
              ...invocation,
              envelope: {
                ...invocation.envelope,
                partID,
                providerCallID: callID,
                emissionOrdinal: index + 2,
                timeAdmitted: base + 7 + index,
              },
            }
            expect(yield* db.transaction((tx) => LearningCommand.reserveAcceptance(tx, next))).toEqual({
              type: "candidate",
            })
            const settled = yield* db.transaction((tx) =>
              LearningCommand.settleAcceptance(tx, {
                ...next,
                permission: item.permission,
                settlement: { time: base + 8 + index, order: index + 3 },
              }),
            )
            expect(settled).toMatchObject({ settlement: { outcome: "error", code: item.code } })
            expect(yield* db.transaction((tx) => LearningCommand.exactSettlement(tx, partID))).toMatchObject({
              outcome: "error",
              code: item.code,
            })
          }),
        { discard: true },
      )

      yield* db.transaction((tx) => LearningCommand.removeNoEffectInvocationsForAssistant(tx, assistantMessageID))
      expect(yield* db.transaction((tx) => LearningCommand.exactSettlement(tx, toolPartID))).toBeUndefined()
      expect(yield* db.transaction((tx) => LearningCommand.exactSettlement(tx, unavailablePartID))).toBeUndefined()
      yield* db.transaction((tx) => LearningCommand.assertPartDeletable(tx, toolPartID))
      yield* db.transaction((tx) =>
        LearningCommand.removeOccurrencePresentation(tx, { messageID: cloneMessageID, timeDeleted: base + 11 }),
      )
      expect(
        yield* db
          .select()
          .from(AdmittedLearnerOccurrenceTable)
          .where(eq(AdmittedLearnerOccurrenceTable.id, occurrence.id))
          .get(),
      ).toBeUndefined()
    }),
  )
})

function seedSession(db: Database.Interface["db"], sessionID: SessionSchema.ID, time: number) {
  return Effect.gen(function* () {
    yield* db
      .insert(ProjectTable)
      .values({
        id: Project.ID.global,
        worktree: AbsolutePath.make("/project"),
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
        directory: "/project",
        title: "learning",
        version: "test",
        time_created: time,
        time_updated: time,
      })
      .run()
  }).pipe(Effect.orDie)
}

function insertUserPresentation(
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
  messageID: SessionV1.MessageID,
  partID: SessionV1.PartID,
  time: number,
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: messageID,
            session_id: sessionID,
            data: userData(time),
            time_created: time,
            time_updated: time,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: partID,
            session_id: sessionID,
            message_id: messageID,
            data: textPartData("accept this route"),
            time_created: time,
            time_updated: time,
          })
          .run()
      }),
    )
    .pipe(Effect.orDie)
}

function userData(time: number): Omit<SessionV1.User, "id" | "sessionID"> {
  return {
    role: "user",
    time: { created: time },
    agent: "build",
    model,
  }
}

function assistantData(parentID: SessionV1.MessageID, time: number): Omit<SessionV1.Assistant, "id" | "sessionID"> {
  return {
    role: "assistant",
    time: { created: time },
    parentID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "build",
    agent: "build",
    path: { cwd: "/project", root: "/project" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function textPartData(text: string): typeof PartTable.$inferInsert.data {
  return { type: "text", text } as typeof PartTable.$inferInsert.data
}

function toolPartData(
  callID: string,
  tool = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
): typeof PartTable.$inferInsert.data {
  return {
    type: "tool",
    callID,
    tool,
    state: { status: "pending", input: {}, raw: "{}" },
  } as typeof PartTable.$inferInsert.data
}
