import { describe, expect, test } from "bun:test"
import path from "path"
import { eq, sql } from "drizzle-orm"
import { Cause, Effect, Exit, Layer, Option } from "effect"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearnerGoal } from "../src/learner-goal"
import {
  LearnerGoalCommandTable,
  LearnerGoalCommitSealTable,
  LearnerGoalEffectTable,
  LearnerGoalRevisionTable,
} from "@opencode-ai/core/learner-goal/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { settlePhysicalInvocation } from "@opencode-ai/core/learning-command/physical"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Turn } from "@opencode-ai/schema/turn"
import { testEffect } from "./lib/effect"
import { HistoricalLearnerGoalV1 } from "./lib/historical-learner-goal-v1"
import { tmpdir } from "./fixture/tmpdir"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Course.node, Database.node]), [[Database.node, database]]))
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const goalFaults = [
  ["frontier", "BEFORE UPDATE ON learning_shared_frontier"],
  ["effect", "BEFORE INSERT ON learner_goal_effect"],
  ["goal", "BEFORE INSERT ON learner_goal"],
  ["source_revision", "BEFORE INSERT ON learner_goal_revision WHEN NEW.revision_role = 'source'"],
  ["target_revision", "BEFORE INSERT ON learner_goal_revision WHEN NEW.revision_role = 'target'"],
  ["condition", "BEFORE INSERT ON learner_goal_condition"],
  ["course_scope", "BEFORE INSERT ON learner_goal_course_scope"],
  ["field_basis", "BEFORE INSERT ON learner_goal_field_basis"],
  ["supersession", "BEFORE INSERT ON learner_goal_supersession"],
  ["effect_operation", "BEFORE INSERT ON learner_goal_effect_operation"],
  ["receipt", "BEFORE INSERT ON learning_command_receipt"],
  [
    "invocation_settlement",
    "BEFORE UPDATE OF status ON learning_command_invocation WHEN NEW.command_name = 'update_learner_goals' AND NEW.status = 'applied'",
  ],
  ["seal", "BEFORE INSERT ON learner_goal_commit_seal"],
] as const

// V16 deliberately makes the retired V1 producer unreachable. Historical V1 truth is
// exercised through frozen-V15 migration, replay, recovery, and carry-forward oracles.
describe.skip("historical V1 learner Goal producer", () => {
  it.effect("rejects recursively malformed Goal no-change operations on domain replay", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const validMeaning = {
        outcome: "Malformed replay",
        conditions: [],
        scope: { type: "learner_home" as const },
        target: { type: "absent" as const },
      }
      const variants = [{ meaning: {} }, { meaning: validMeaning, replacementTarget: {} }] as const

      yield* Effect.forEach(
        variants,
        (variant, index) =>
          Effect.gen(function* () {
            const time = 10 + index * 10
            const invocation = yield* seedInvocation(
              db,
              sessionID,
              9001 + index,
              `/goal Reject malformed replay ${index}.`,
              createHomeGoal(`Reject malformed replay ${index}`),
              time,
            )
            expect(yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, invocation))).toEqual({
              type: "candidate",
            })
            yield* db.transaction((tx) =>
              settlePhysicalInvocation(tx, invocation.envelope.partID, {
                outcome: "no_change",
                goalKind: "learner_goal",
                operations: [
                  {
                    ordinal: 0,
                    operation: "create",
                    result: "no_change",
                    goalID: LearnerGoal.createGoalID(),
                    revisionID: LearnerGoal.createRevisionID(),
                    version: 1,
                    disposition: "active",
                    ...variant,
                  },
                ],
                acknowledgementTitle: "Goal unchanged",
                acknowledgementBody: "No durable Goal changed.",
                settlementTime: time + 2,
                settlementOrder: index + 1,
              }),
            )

            const replay = yield* db
              .transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, invocation))
              .pipe(Effect.exit)
            expect(Exit.isFailure(replay)).toBe(true)
          }),
        { discard: true },
      )
    }),
  )

  it.effect("commits one atomic multi-Goal effect and keeps all/no-change batches effect-free", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const first = yield* settleDirect(
        db,
        sessionID,
        1,
        "Create durable goals: (1) Learn trees as an active LearnerHome goal with no conditions and no target. (2) Learn heaps as an active LearnerHome goal with no conditions and no target.",
        { operations: [homeCreate("Learn trees"), homeCreate("Learn heaps")] },
        10,
      )
      if (first.type !== "settled" || first.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected atomic two-Goal creation")
      }
      expect(first.settlement.operations).toMatchObject([
        { ordinal: 0, operation: "create", result: "changed", version: 1 },
        { ordinal: 1, operation: "create", result: "changed", version: 1 },
      ])
      expect(first.settlement.operations[0]!.goalID).not.toBe(first.settlement.operations[1]!.goalID)
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 2, revisions: 2, receipts: 1, operations: 2 })
      const frontier = yield* db.get(sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`)

      const unchanged = yield* settleDirect(
        db,
        sessionID,
        2,
        `(1) Keep ${first.settlement.operations[0]!.goalID} unchanged. (2) Keep ${first.settlement.operations[1]!.goalID} unchanged.`,
        {
          operations: first.settlement.operations.map((result) => ({
            type: "update" as const,
            goalID: result.goalID,
            expectedHeadID: result.revisionID,
            expectedVersion: result.version,
            snapshot: carriedHome(result),
            disposition: { type: "active" as const },
          })),
        },
        20,
      )
      expect(unchanged).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "no_change",
          operations: [
            { ordinal: 0, result: "no_change", revisionID: first.settlement.operations[0]!.revisionID },
            { ordinal: 1, result: "no_change", revisionID: first.settlement.operations[1]!.revisionID },
          ],
        },
      })
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 2, revisions: 2, receipts: 1, operations: 2 })
      expect(yield* db.get(sql`SELECT sequence FROM learning_shared_frontier WHERE singleton = 1`)).toEqual(frontier)

      const retained = first.settlement.operations[0]!
      const mixed = yield* settleDirect(
        db,
        sessionID,
        3,
        `Create durable goals: (1)
Keep ${retained.goalID} unchanged. (2)
/goal Learn queues as an active LearnerHome goal with no conditions and no target.`,
        {
          operations: [
            {
              type: "update",
              goalID: retained.goalID,
              expectedHeadID: retained.revisionID,
              expectedVersion: retained.version,
              snapshot: carriedHome(retained),
              disposition: { type: "active" },
            },
            homeCreate("Learn queues"),
          ],
        },
        30,
      )
      expect(mixed).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          operations: [
            { ordinal: 0, result: "no_change", revisionID: retained.revisionID },
            { ordinal: 1, result: "changed", operation: "create", version: 1 },
          ],
        },
      })
      expect(yield* goalCounts(db)).toEqual({ effects: 2, goals: 3, revisions: 3, receipts: 2, operations: 4 })
      expect(
        yield* db.get(
          sql`SELECT operation_count, change_count FROM learner_goal_effect ORDER BY time_committed DESC LIMIT 1`,
        ),
      ).toEqual({ operation_count: 2, change_count: 1 })
    }),
  )

  it.effect("routes unsupported direct identity, lifecycle, scope, target, and replacement claims to acceptance", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Operating systems" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const created = yield* settleDirect(
        db,
        sessionID,
        1,
        "Create durable goals: (1) Learn graphs as an active LearnerHome goal with no conditions and no target. (2) Learn hashing as an active LearnerHome goal with no conditions and no target.",
        { operations: [homeCreate("Learn graphs"), homeCreate("Learn hashing")] },
        base + 1,
      )
      if (created.type !== "settled" || created.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected direct eligibility fixtures")
      }
      const [left, right] = created.settlement.operations
      if (!left || !right) return yield* Effect.die("Expected two Goal fixtures")

      const continuity = yield* settleDirect(
        db,
        sessionID,
        2,
        "Keep this Goal unchanged.",
        {
          operations: [
            {
              type: "update",
              goalID: left.goalID,
              expectedHeadID: left.revisionID,
              expectedVersion: left.version,
              snapshot: carriedHome(left),
              disposition: { type: "active" },
            },
          ],
        },
        base + 10,
      )
      const lifecycleExcerpt = `Goal ${left.goalID} looks done`
      const lifecycle = yield* settleDirect(
        db,
        sessionID,
        3,
        lifecycleExcerpt,
        {
          operations: [
            {
              type: "update",
              goalID: left.goalID,
              expectedHeadID: left.revisionID,
              expectedVersion: left.version,
              snapshot: {
                ...carriedHome(left),
                fieldBases: {
                  ...carriedHome(left).fieldBases,
                  disposition: { type: "authored", sourceExcerpt: lifecycleExcerpt },
                },
              },
              disposition: { type: "achieved" },
            },
          ],
        },
        base + 20,
      )
      const relationExcerpt = `Compare ${left.goalID} and ${right.goalID}`
      const replacement = yield* settleDirect(
        db,
        sessionID,
        4,
        relationExcerpt,
        {
          operations: [
            {
              type: "replace",
              goalID: left.goalID,
              expectedHeadID: left.revisionID,
              expectedVersion: left.version,
              snapshot: {
                ...carriedHome(left),
                fieldBases: {
                  ...carriedHome(left).fieldBases,
                  disposition: { type: "authored", sourceExcerpt: relationExcerpt },
                },
              },
              target: { type: "existing", goalID: right.goalID, revisionID: right.revisionID, version: right.version },
            },
          ],
        },
        base + 30,
      )
      const scoped = yield* settleDirect(
        db,
        sessionID,
        5,
        "/goal Pass operating systems as an active goal for this Course with no conditions and no target.",
        {
          operations: [
            {
              type: "create",
              snapshot: {
                outcome: "Pass operating systems",
                conditions: [],
                scope: {
                  type: "courses",
                  courses: [{ courseID: course.id, basis: { type: "new", expectedCourseVersion: 0 } }],
                },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: "Pass operating systems" },
                  conditions: { type: "authored", sourceExcerpt: "no conditions" },
                  scope: { type: "authored", sourceExcerpt: "this Course" },
                  target: { type: "authored", sourceExcerpt: "no target" },
                  disposition: { type: "authored", sourceExcerpt: "active" },
                },
              },
              disposition: "active",
            },
          ],
        },
        base + 40,
      )
      const targeted = yield* settleDirect(
        db,
        sessionID,
        6,
        "/goal Learn trees as an active LearnerHome goal with no conditions sometime.",
        {
          operations: [
            {
              type: "create",
              snapshot: {
                ...homeSnapshot("Learn trees"),
                target: {
                  type: "local_date",
                  date: "2026-12-20",
                  timeZone: "UTC",
                  sourceExpression: "sometime",
                  normalizationBasis: "explicit_date",
                },
                fieldBases: {
                  ...homeSnapshot("Learn trees").fieldBases,
                  target: { type: "authored", sourceExcerpt: "sometime" },
                },
              },
              disposition: "active",
            },
          ],
        },
        base + 50,
      )
      const wrongZone = yield* settleDirect(
        db,
        sessionID,
        11,
        "/goal Learn dates by 2026-12-20 as an active LearnerHome goal with no conditions.",
        {
          operations: [
            {
              type: "create",
              snapshot: {
                ...homeSnapshot("Learn dates"),
                target: {
                  type: "local_date",
                  date: "2026-12-20",
                  timeZone: "Pacific/Honolulu",
                  sourceExpression: "2026-12-20",
                  normalizationBasis: "explicit_date",
                },
                fieldBases: {
                  ...homeSnapshot("Learn dates").fieldBases,
                  target: { type: "authored", sourceExcerpt: "2026-12-20" },
                },
              },
              disposition: "active",
            },
          ],
        },
        base + 55,
      )
      const cadenceOutcome = "学习一个数据结构/算法"
      const cadence = yield* settleDirect(
        db,
        sessionID,
        7,
        `/goal接下来两个月每天${cadenceOutcome}`,
        {
          operations: [
            {
              type: "create",
              snapshot: {
                outcome: cadenceOutcome,
                conditions: [],
                scope: { type: "learner_home" },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: cadenceOutcome },
                  conditions: { type: "authored", sourceExcerpt: "/goal" },
                  scope: { type: "authored", sourceExcerpt: "/goal" },
                  target: { type: "authored", sourceExcerpt: "/goal" },
                  disposition: { type: "authored", sourceExcerpt: "/goal" },
                },
              },
              disposition: "active",
            },
          ],
        },
        base + 60,
      )
      const quoted = yield* settleDirect(
        db,
        sessionID,
        8,
        "Someone's goal is to Learn graphs as an active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Learn graphs"),
        base + 70,
      )
      const negated = yield* settleDirect(
        db,
        sessionID,
        9,
        "Do not store Learn graphs as my active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Learn graphs"),
        base + 80,
      )
      const hypotheticalUpdate = yield* settleDirect(
        db,
        sessionID,
        10,
        `Suppose Goal ${left.goalID} stayed unchanged.`,
        {
          operations: [
            {
              type: "update",
              goalID: left.goalID,
              expectedHeadID: left.revisionID,
              expectedVersion: left.version,
              snapshot: carriedHome(left),
              disposition: { type: "active" },
            },
          ],
        },
        base + 90,
      )
      const prefixedNegation = yield* settleDirect(
        db,
        sessionID,
        12,
        "/goal do not store Learn graphs as an active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Learn graphs"),
        base + 100,
      )
      const prefixedHypothetical = yield* settleDirect(
        db,
        sessionID,
        13,
        "/goal suppose my goal were Learn graphs as an active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Learn graphs"),
        base + 110,
      )
      const prefixedChineseNegation = yield* settleDirect(
        db,
        sessionID,
        14,
        "/goal不要把学习图存成目标。",
        { operations: [{ type: "create", snapshot: claimedHomeSnapshot("学习图", "/goal"), disposition: "active" }] },
        base + 120,
      )
      expect(
        [
          continuity,
          lifecycle,
          replacement,
          scoped,
          targeted,
          wrongZone,
          cadence,
          quoted,
          negated,
          hypotheticalUpdate,
          prefixedNegation,
          prefixedHypothetical,
          prefixedChineseNegation,
        ].map(settlementCode),
      ).toEqual([
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
      ])
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 2, revisions: 2, receipts: 1, operations: 2 })
    }),
  )

  it.effect("binds existing replacement to the pre-change target basis and rejects invalid relation graphs", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const created = yield* settleDirect(
        db,
        sessionID,
        1,
        "Create durable goals: (1) Goal A as an active LearnerHome goal with no conditions and no target. (2) Goal B as an active LearnerHome goal with no conditions and no target.",
        { operations: [homeCreate("Goal A"), homeCreate("Goal B")] },
        10,
      )
      if (created.type !== "settled" || created.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected relation fixtures")
      }
      const [a1, b1] = created.settlement.operations
      if (!a1 || !b1) return yield* Effect.die("Expected relation fixture results")
      const relationExcerpt = `replace ${a1.goalID} with ${b1.goalID}`
      const bOutcome = "Goal B corrected"
      const relatedCommand = {
        operations: [
          replacementOperation(a1, b1, relationExcerpt),
          {
            type: "update",
            goalID: b1.goalID,
            expectedHeadID: b1.revisionID,
            expectedVersion: b1.version,
            snapshot: homeSnapshot(bOutcome),
            disposition: { type: "active" },
          },
        ],
      } as const satisfies LearnerGoal.Command
      const presentation = yield* db.transaction((tx) =>
        LearnerGoal.preparePresentation(tx, {
          command: relatedCommand,
          authorizationBasis: "learner_request",
          asOf: 20,
        }),
      )
      expect(presentation.operations).toMatchObject([
        {
          type: "replace",
          source: { version: a1.version, meaning: { outcome: "Goal A", disposition: "active" } },
          replacementTarget: {
            type: "existing",
            version: b1.version,
            meaning: { outcome: "Goal B", disposition: "active" },
          },
        },
        {
          type: "update",
          source: { version: b1.version, meaning: { outcome: "Goal B", disposition: "active" } },
          meaning: { outcome: bOutcome, disposition: "active" },
        },
      ])
      const related = yield* settleDirect(
        db,
        sessionID,
        2,
        `(1)
${relationExcerpt}. (2)
update ${b1.goalID}: ${bOutcome}, active LearnerHome goal with no conditions and no target.`,
        relatedCommand,
        20,
      )
      if (related.type !== "settled" || related.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected same-set replacement and target correction")
      }
      const [a2, b2] = related.settlement.operations
      if (!a2 || !b2) return yield* Effect.die("Expected relation change results")
      expect(a2.replacementTarget).toEqual({
        type: "existing",
        goalID: b1.goalID,
        revisionID: b1.revisionID,
        version: b1.version,
      })
      expect(
        (yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, a1.goalID, 30)))?.head.disposition,
      ).toMatchObject({
        type: "superseded",
        targetGoalID: b1.goalID,
        targetRevisionID: b1.revisionID,
        targetCurrentHead: { revisionID: b2.revisionID, version: b2.version },
      })

      const correctedOutcome = "Goal A corrected"
      const preservedRelation = `replace ${a1.goalID} with ${b1.goalID}`
      const corrected = yield* settleDirect(
        db,
        sessionID,
        3,
        `${a1.goalID}: ${correctedOutcome}; no conditions; LearnerHome goal; no target; ${preservedRelation}.`,
        {
          operations: [
            {
              type: "update",
              goalID: a1.goalID,
              expectedHeadID: a2.revisionID,
              expectedVersion: a2.version,
              snapshot: {
                ...homeSnapshot(correctedOutcome),
                fieldBases: {
                  ...homeSnapshot(correctedOutcome).fieldBases,
                  disposition: { type: "authored", sourceExcerpt: preservedRelation },
                },
              },
              disposition: {
                type: "superseded",
                targetGoalID: b1.goalID,
                targetRevisionID: b1.revisionID,
              },
            },
          ],
        },
        30,
      )
      if (corrected.type !== "settled" || corrected.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected superseded Goal correction")
      }
      const a3 = corrected.settlement.operations[0]!
      expect(
        (yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, a1.goalID, 40)))?.head.disposition,
      ).toMatchObject({ type: "superseded", targetGoalID: b1.goalID, targetRevisionID: b1.revisionID })

      const c = yield* settleDirect(
        db,
        sessionID,
        4,
        "/goal Goal C is an active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Goal C"),
        40,
      )
      if (c.type !== "settled" || c.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected third relation fixture")
      }
      const c1 = c.settlement.operations[0]!
      const invalid = yield* Effect.all(
        [
          settleDirect(
            db,
            sessionID,
            5,
            `replace ${c1.goalID} with ${c1.goalID}`,
            { operations: [replacementOperation(c1, c1, `replace ${c1.goalID} with ${c1.goalID}`)] },
            50,
          ),
          settleDirect(
            db,
            sessionID,
            6,
            `replace ${c1.goalID} with ${b1.goalID}`,
            { operations: [replacementOperation(c1, b1, `replace ${c1.goalID} with ${b1.goalID}`)] },
            60,
          ),
          settleDirect(
            db,
            sessionID,
            7,
            `replace ${c1.goalID} with ${b2.goalID}`,
            { operations: [replacementOperation(c1, b2, `replace ${c1.goalID} with ${b2.goalID}`)] },
            70,
          ),
          settleDirect(
            db,
            sessionID,
            8,
            `replace ${b2.goalID} with ${a3.goalID}`,
            { operations: [replacementOperation(b2, a3, `replace ${b2.goalID} with ${a3.goalID}`)] },
            80,
          ),
        ],
        { concurrency: 1 },
      )
      expect(invalid.map(settlementCode)).toEqual(["stale", "stale", "stale", "stale"])
      expect(yield* goalCounts(db)).toEqual({ effects: 4, goals: 3, revisions: 6, receipts: 4, operations: 6 })
    }),
  )

  it.effect("rejects lifecycle and referent carry that is only textually equal", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Algorithms" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const outcome = "Pass Exam A"
      const condition = "score >= 85"
      const target = {
        type: "local_date" as const,
        date: "2026-12-20",
        timeZone: "UTC",
        sourceExpression: "2026-12-20",
        normalizationBasis: "explicit_date" as const,
      }
      const achievedExcerpt = `Goal ${outcome} is achieved`
      const created = yield* settleDirect(
        db,
        sessionID,
        1,
        `/goal ${outcome} in Algorithms by 2026-12-20 UTC with ${condition}. ${achievedExcerpt}.`,
        {
          operations: [
            {
              type: "create",
              snapshot: {
                outcome,
                conditions: [condition],
                scope: {
                  type: "courses",
                  courses: [{ courseID: course.id, basis: { type: "new", expectedCourseVersion: 0 } }],
                },
                target,
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: outcome },
                  conditions: { type: "authored", sourceExcerpt: condition },
                  scope: { type: "authored", sourceExcerpt: "Algorithms" },
                  target: { type: "authored", sourceExcerpt: "2026-12-20 UTC" },
                  disposition: { type: "authored", sourceExcerpt: achievedExcerpt },
                },
              },
              disposition: "achieved",
            },
          ],
        },
        base + 1,
      )
      if (created.type !== "settled" || created.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected achieved Goal fixture")
      }
      const head = created.settlement.operations[0]!
      const carried = { type: "carried" as const, predecessorRevisionID: head.revisionID }
      const raised = yield* settleDirect(
        db,
        sessionID,
        2,
        `update ${head.goalID}: score >= 90.`,
        {
          operations: [
            {
              type: "update",
              goalID: head.goalID,
              expectedHeadID: head.revisionID,
              expectedVersion: head.version,
              snapshot: {
                outcome,
                conditions: ["score >= 90"],
                scope: { type: "courses", courses: [{ courseID: course.id, basis: carried }] },
                target,
                fieldBases: {
                  outcome: carried,
                  conditions: { type: "authored", sourceExcerpt: "score >= 90" },
                  scope: carried,
                  target: carried,
                  disposition: carried,
                },
              },
              disposition: { type: "achieved" },
            },
          ],
        },
        base + 10,
      )
      const crossExamExcerpt = `Goal ${head.goalID} is achieved`
      const crossExam = yield* settleDirect(
        db,
        sessionID,
        3,
        `Goal ${head.goalID}: Pass Exam B. ${crossExamExcerpt}.`,
        {
          operations: [
            {
              type: "update",
              goalID: head.goalID,
              expectedHeadID: head.revisionID,
              expectedVersion: head.version,
              snapshot: {
                outcome: "Pass Exam B",
                conditions: [condition],
                scope: { type: "courses", courses: [{ courseID: course.id, basis: carried }] },
                target,
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: "Pass Exam B" },
                  conditions: carried,
                  scope: carried,
                  target: carried,
                  disposition: { type: "authored", sourceExcerpt: crossExamExcerpt },
                },
              },
              disposition: { type: "achieved" },
            },
          ],
        },
        base + 20,
      )
      expect([raised, crossExam].map(settlementCode)).toEqual(["validation_error", "validation_error"])
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 1, revisions: 1, receipts: 1, operations: 1 })
    }),
  )

  it.effect("rejects omitted initial clauses and misbound authored carry on the direct arm", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Algorithms" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const outcome = "Pass Exam A"
      const condition = "score >= 85"
      const target = {
        type: "local_date" as const,
        date: "2026-12-20",
        timeZone: "UTC",
        sourceExpression: "2026-12-20",
        normalizationBasis: "explicit_date" as const,
      }
      const initial = yield* settleDirect(
        db,
        sessionID,
        1,
        `/goal ${outcome} in Algorithms by 2026-12-20 UTC if ${condition} as an active Goal.`,
        {
          operations: [
            {
              type: "create",
              snapshot: {
                outcome,
                conditions: [condition],
                scope: {
                  type: "courses",
                  courses: [{ courseID: course.id, basis: { type: "new", expectedCourseVersion: 0 } }],
                },
                target,
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: outcome },
                  conditions: { type: "authored", sourceExcerpt: condition },
                  scope: { type: "authored", sourceExcerpt: "Algorithms" },
                  target: { type: "authored", sourceExcerpt: "2026-12-20 UTC" },
                  disposition: { type: "authored", sourceExcerpt: "active" },
                },
              },
              disposition: "active",
            },
          ],
        },
        base + 1,
      )
      if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected direct omission fixture")
      }
      const head = initial.settlement.operations[0]!
      const omitted = yield* Effect.all(
        [
          settleDirect(
            db,
            sessionID,
            2,
            "/goal Pass OS for this Course.",
            {
              operations: [
                { type: "create", snapshot: claimedHomeSnapshot("Pass OS", "/goal"), disposition: "active" },
              ],
            },
            base + 10,
          ),
          settleDirect(
            db,
            sessionID,
            3,
            "/goal Learn trees by the exam.",
            {
              operations: [
                { type: "create", snapshot: claimedHomeSnapshot("Learn trees", "/goal"), disposition: "active" },
              ],
            },
            base + 20,
          ),
          settleDirect(
            db,
            sessionID,
            4,
            "/goal Pass OS if score >= 90.",
            {
              operations: [
                { type: "create", snapshot: claimedHomeSnapshot("Pass OS", "/goal"), disposition: "active" },
              ],
            },
            base + 30,
          ),
          settleDirect(
            db,
            sessionID,
            5,
            "/goal I abandoned Pass OS.",
            {
              operations: [
                { type: "create", snapshot: claimedHomeSnapshot("Pass OS", "/goal"), disposition: "active" },
              ],
            },
            base + 40,
          ),
        ],
        { concurrency: 1 },
      )

      const carried = { type: "carried" as const, predecessorRevisionID: head.revisionID }
      const relation = `replace ${head.goalID} with a new goal`
      const generated = yield* settleDirect(
        db,
        sessionID,
        6,
        `${relation}; Generated target is for this Course by the exam if score >= 90 and is abandoned.`,
        {
          operations: [
            {
              type: "replace",
              goalID: head.goalID,
              expectedHeadID: head.revisionID,
              expectedVersion: head.version,
              snapshot: {
                outcome,
                conditions: [condition],
                scope: {
                  type: "courses",
                  courses: [{ courseID: course.id, basis: carried }],
                },
                target,
                fieldBases: {
                  outcome: carried,
                  conditions: carried,
                  scope: carried,
                  target: carried,
                  disposition: { type: "authored", sourceExcerpt: relation },
                },
              },
              target: {
                type: "new",
                snapshot: claimedHomeSnapshot("Generated target", "Generated target"),
                disposition: "active",
              },
            },
          ],
        },
        base + 50,
      )

      const scopeSource = `update ${head.goalID}: Pass Exam B; ${condition}; Algorithms; 2026-12-20 UTC; unrelated scope note.`
      const misboundScope = yield* settleDirect(
        db,
        sessionID,
        7,
        scopeSource,
        {
          operations: [
            authoredReferentUpdate(head, course.id, condition, target, "unrelated scope note", "2026-12-20 UTC"),
          ],
        },
        base + 60,
      )
      const targetSource = `update ${head.goalID}: Pass Exam B; ${condition}; Algorithms; 2026-12-20 UTC; unrelated target note.`
      const misboundTarget = yield* settleDirect(
        db,
        sessionID,
        8,
        targetSource,
        {
          operations: [
            authoredReferentUpdate(head, course.id, condition, target, "Algorithms", "unrelated target note"),
          ],
        },
        base + 70,
      )

      expect([...omitted, generated, misboundScope, misboundTarget].map(settlementCode)).toEqual([
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
        "validation_error",
      ])
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 1, revisions: 1, receipts: 1, operations: 1 })
    }),
  )

  it.effect("rejects condition and aggregate capacity overflow without truncation or prefix commit", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const conditions = Array.from({ length: LearnerGoal.MAX_CONDITIONS + 1 }, (_, index) => `condition-${index}`)
      const conditionExcerpt = conditions.join(", ")
      const conditionOverflow = yield* settleDirect(
        db,
        sessionID,
        1,
        `/goal Valid Goal with no conditions and Overflow Goal with conditions ${conditionExcerpt}; both are active LearnerHome goals with no target.`,
        {
          operations: [
            homeCreate("Valid Goal"),
            {
              type: "create",
              snapshot: {
                outcome: "Overflow Goal",
                conditions,
                scope: { type: "learner_home" },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: "Overflow Goal" },
                  conditions: { type: "authored", sourceExcerpt: conditionExcerpt },
                  scope: { type: "authored", sourceExcerpt: "LearnerHome goals" },
                  target: { type: "authored", sourceExcerpt: "no target" },
                  disposition: { type: "authored", sourceExcerpt: "active" },
                },
              },
              disposition: "active",
            },
          ],
        },
        10,
      )
      expect(settlementCode(conditionOverflow)).toBe("capacity_exceeded")
      expect(yield* goalCounts(db)).toEqual({ effects: 0, goals: 0, revisions: 0, receipts: 0, operations: 0 })

      const aggregate = yield* seedAcceptedInvocation(
        db,
        sessionID,
        2,
        "Please accept the complete bounded candidate.",
        {
          operations: Array.from({ length: LearnerGoal.MAX_OPERATIONS }, (_, index) => ({
            type: "create" as const,
            snapshot: acceptedHomeSnapshot(`${String(index)}-${"x".repeat(4_000)}`),
            disposition: "active" as const,
          })),
        },
        20,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, aggregate))
      const aggregateOverflow = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...aggregate,
          settlement: { time: 22, order: 2 },
        }),
      )
      expect(aggregateOverflow).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "capacity_exceeded" },
      })
      expect(yield* invocationConfirmation(db, aggregate.envelope.partID)).toEqual({
        status: "error",
        confirmation: null,
      })
      expect(yield* goalCounts(db)).toEqual({ effects: 0, goals: 0, revisions: 0, receipts: 0, operations: 0 })
    }),
  )

  it.effect("rejects canonically duplicate conditions on direct and accepted paths", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const condition = "score >= 85"
      const directSnapshot = homeSnapshot("Pass duplicate check")
      const direct = yield* settleDirect(
        db,
        sessionID,
        1,
        `/goal Pass duplicate check as an active LearnerHome goal with conditions ${condition} and no target.`,
        {
          operations: [
            {
              type: "create",
              disposition: "active",
              snapshot: {
                ...directSnapshot,
                conditions: [condition, condition],
                fieldBases: {
                  ...directSnapshot.fieldBases,
                  conditions: { type: "authored", sourceExcerpt: condition },
                },
              },
            },
          ],
        },
        10,
      )
      expect(settlementCode(direct)).toBe("validation_error")

      const accepted = { type: "accepted" as const }
      const invocation = yield* seedAcceptedInvocation(
        db,
        sessionID,
        2,
        "Please accept the exact candidate.",
        {
          operations: [
            {
              type: "create",
              disposition: "active",
              snapshot: {
                outcome: "Pass accepted duplicate check",
                conditions: [condition, condition],
                scope: { type: "learner_home" },
                target: { type: "absent" },
                fieldBases: {
                  outcome: accepted,
                  conditions: accepted,
                  scope: accepted,
                  target: accepted,
                  disposition: accepted,
                },
              },
            },
          ],
        },
        20,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, invocation))
      expect(
        yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
            ...invocation,
            settlement: { time: 22, order: 2 },
          }),
        ),
      ).toMatchObject({ type: "settled", settlement: { outcome: "error", code: "validation_error" } })
      expect(yield* goalCounts(db)).toEqual({ effects: 0, goals: 0, revisions: 0, receipts: 0, operations: 0 })
    }),
  )

  it.effect("serializes same-head writers and rolls back a losing mixed batch", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const initial = yield* settleDirect(
        db,
        sessionID,
        1,
        "/goal Concurrent Goal as an active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Concurrent Goal"),
        10,
      )
      if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected concurrency fixture")
      }
      const head = initial.settlement.operations[0]!
      const writerA = yield* seedAcceptedInvocation(
        db,
        sessionID,
        2,
        "Please accept writer A.",
        {
          operations: [
            {
              type: "update",
              goalID: head.goalID,
              expectedHeadID: head.revisionID,
              expectedVersion: head.version,
              snapshot: acceptedHomeSnapshot("Writer A won"),
              disposition: { type: "active" },
            },
          ],
        },
        20,
      )
      const writerB = yield* seedAcceptedInvocation(
        db,
        sessionID,
        3,
        "Please accept writer B and its mixed create.",
        {
          operations: [
            {
              type: "update",
              goalID: head.goalID,
              expectedHeadID: head.revisionID,
              expectedVersion: head.version,
              snapshot: acceptedHomeSnapshot("Writer B lost"),
              disposition: { type: "active" },
            },
            { type: "create", snapshot: acceptedHomeSnapshot("Must not be partially created"), disposition: "active" },
          ],
        },
        30,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, writerA))
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, writerB))
      const preparedA = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...writerA,
          settlement: { time: 40, order: 2 },
        }),
      )
      const preparedB = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...writerB,
          settlement: { time: 41, order: 3 },
        }),
      )
      if (preparedA.type !== "confirmation" || preparedB.type !== "confirmation") {
        return yield* Effect.die("Expected both writers to preflight the same head")
      }
      const applied = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...writerA,
          permission: { type: "allow" },
          displayedConfirmation: preparedA.confirmation,
          preparedConfirmation: preparedA.preparedConfirmation,
          settlement: { time: 42, order: 2 },
        }),
      )
      const stale = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...writerB,
          permission: { type: "allow" },
          displayedConfirmation: preparedB.confirmation,
          preparedConfirmation: preparedB.preparedConfirmation,
          settlement: { time: 43, order: 3 },
        }),
      )
      expect(applied).toMatchObject({ type: "settled", settlement: { outcome: "applied" } })
      expect(settlementCode(stale)).toBe("stale")
      expect(yield* invocationConfirmation(db, writerB.envelope.partID)).toEqual({
        status: "error",
        confirmation: null,
      })
      expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, head.goalID, 50))).toMatchObject({
        head: { outcome: "Writer A won", version: 2 },
      })
      expect(yield* goalCounts(db)).toEqual({ effects: 2, goals: 1, revisions: 2, receipts: 2, operations: 2 })
    }),
  )

  it.effect("preserves and removes withdrawn members independently across correction, lifecycle, and replacement", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const withdrawn = yield* courses.createCourse({ title: "Operating systems" })
      const retained = yield* courses.createCourse({ title: "Data structures" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const scoped = multiCourseSnapshot(withdrawn.id, retained.id, "Pass systems exam")
      const secondScoped = multiCourseSnapshot(withdrawn.id, retained.id, "Pass another systems exam")
      const initial = yield* settleDirect(
        db,
        sessionID,
        1,
        "Create durable goals: (1) Pass systems exam as an active Goal for Operating systems and Data structures Courses with no conditions and no target. (2) Pass another systems exam as an active Goal for Operating systems and Data structures Courses with no conditions and no target. (3) Replacement anchor as an active LearnerHome goal with no conditions and no target.",
        {
          operations: [
            { type: "create", snapshot: scoped, disposition: "active" },
            { type: "create", snapshot: secondScoped, disposition: "active" },
            homeCreate("Replacement anchor"),
          ],
        },
        base + 1,
      )
      if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected multi-Course fixtures")
      }
      const [g1, j1, anchor] = initial.settlement.operations
      if (!g1 || !j1 || !anchor) return yield* Effect.die("Expected multi-Course fixture results")
      const misclassifiedNoChange = yield* settleDirect(
        db,
        sessionID,
        8,
        `(1) Keep ${g1.goalID} unchanged; Operating systems and Data structures Courses. (2) /goal Throwaway Goal as an active LearnerHome goal with no conditions and no target.`,
        {
          operations: [
            {
              type: "update",
              goalID: g1.goalID,
              expectedHeadID: g1.revisionID,
              expectedVersion: g1.version,
              snapshot: {
                outcome: g1.meaning.outcome,
                conditions: [],
                scope: {
                  type: "courses",
                  courses: [
                    { courseID: withdrawn.id, basis: { type: "new", expectedCourseVersion: 0 } },
                    { courseID: retained.id, basis: { type: "new", expectedCourseVersion: 0 } },
                  ],
                },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "carried", predecessorRevisionID: g1.revisionID },
                  conditions: { type: "carried", predecessorRevisionID: g1.revisionID },
                  scope: { type: "authored", sourceExcerpt: "Operating systems and Data structures Courses" },
                  target: { type: "carried", predecessorRevisionID: g1.revisionID },
                  disposition: { type: "carried", predecessorRevisionID: g1.revisionID },
                },
              },
              disposition: { type: "active" },
            },
            homeCreate("Throwaway Goal"),
          ],
        },
        base + 5,
      )
      expect(settlementCode(misclassifiedNoChange)).toBe("validation_error")
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 3, revisions: 3, receipts: 1, operations: 3 })
      yield* courses.withdrawCourse({
        courseID: withdrawn.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
      })

      const correctedOutcome = "Pass systems final"
      const corrected = yield* settleDirect(
        db,
        sessionID,
        2,
        `update ${g1.goalID}: ${correctedOutcome}; no conditions; Operating systems and Data structures Courses; no target.`,
        {
          operations: [
            {
              type: "update",
              goalID: g1.goalID,
              expectedHeadID: g1.revisionID,
              expectedVersion: g1.version,
              snapshot: {
                outcome: correctedOutcome,
                conditions: [],
                scope: {
                  type: "courses",
                  courses: [
                    { courseID: withdrawn.id, basis: { type: "carried", predecessorRevisionID: g1.revisionID } },
                    { courseID: retained.id, basis: { type: "carried", predecessorRevisionID: g1.revisionID } },
                  ],
                },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: correctedOutcome },
                  conditions: { type: "authored", sourceExcerpt: "no conditions" },
                  scope: { type: "authored", sourceExcerpt: "Operating systems and Data structures Courses" },
                  target: { type: "authored", sourceExcerpt: "no target" },
                  disposition: { type: "carried", predecessorRevisionID: g1.revisionID },
                },
              },
              disposition: { type: "active" },
            },
          ],
        },
        base + 10,
      )
      if (corrected.type !== "settled" || corrected.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected withdrawn membership correction")
      }
      const g2 = corrected.settlement.operations[0]!
      const achievedExcerpt = `Goal ${g1.goalID} is achieved`
      const achieved = yield* settleDirect(
        db,
        sessionID,
        3,
        achievedExcerpt,
        {
          operations: [
            {
              type: "update",
              goalID: g1.goalID,
              expectedHeadID: g2.revisionID,
              expectedVersion: g2.version,
              snapshot: carriedCourseSnapshot(g2, [withdrawn.id, retained.id], achievedExcerpt),
              disposition: { type: "achieved" },
            },
          ],
        },
        base + 20,
      )
      if (achieved.type !== "settled" || achieved.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected withdrawn membership lifecycle update")
      }
      const g3 = achieved.settlement.operations[0]!
      const existingRelation = `replace ${g1.goalID} with ${anchor.goalID}`
      const replaced = yield* settleDirect(
        db,
        sessionID,
        4,
        existingRelation,
        {
          operations: [
            {
              ...replacementOperation(g3, anchor, existingRelation),
              snapshot: carriedCourseSnapshot(g3, [withdrawn.id, retained.id], existingRelation),
            },
          ],
        },
        base + 30,
      )
      if (replaced.type !== "settled" || replaced.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected existing-target replacement with withdrawn membership")
      }
      const g4 = replaced.settlement.operations[0]!

      const generatedRelation = `replace ${j1.goalID} with a new goal`
      const generated = yield* settleDirect(
        db,
        sessionID,
        5,
        `${generatedRelation}; Replacement for second Goal is an active LearnerHome goal with no conditions and no target.`,
        {
          operations: [
            {
              type: "replace",
              goalID: j1.goalID,
              expectedHeadID: j1.revisionID,
              expectedVersion: j1.version,
              snapshot: carriedCourseSnapshot(j1, [withdrawn.id, retained.id], generatedRelation),
              target: { type: "new", snapshot: homeSnapshot("Replacement for second Goal"), disposition: "active" },
            },
          ],
        },
        base + 40,
      )
      if (generated.type !== "settled" || generated.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected generated replacement with withdrawn membership")
      }
      expect(generated.settlement.operations[0]!.replacementTarget).toMatchObject({ type: "new", version: 1 })

      const removalExcerpt = "remove Operating systems Course from scope; keep Data structures Course"
      const removed = yield* settleDirect(
        db,
        sessionID,
        6,
        `${g1.goalID}: ${correctedOutcome}; no conditions; ${removalExcerpt}; no target; ${existingRelation}.`,
        {
          operations: [
            {
              type: "update",
              goalID: g1.goalID,
              expectedHeadID: g4.revisionID,
              expectedVersion: g4.version,
              snapshot: {
                outcome: correctedOutcome,
                conditions: [],
                scope: {
                  type: "courses",
                  courses: [
                    { courseID: retained.id, basis: { type: "carried", predecessorRevisionID: g4.revisionID } },
                  ],
                },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: correctedOutcome },
                  conditions: { type: "authored", sourceExcerpt: "no conditions" },
                  scope: { type: "authored", sourceExcerpt: removalExcerpt },
                  target: { type: "authored", sourceExcerpt: "no target" },
                  disposition: { type: "authored", sourceExcerpt: existingRelation },
                },
              },
              disposition: { type: "superseded", targetGoalID: anchor.goalID, targetRevisionID: anchor.revisionID },
            },
          ],
        },
        base + 50,
      )
      if (removed.type !== "settled" || removed.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected explicit withdrawn membership removal")
      }
      expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, g1.goalID, base + 60))).toMatchObject({
        head: {
          scope: {
            type: "courses",
            courses: [{ courseID: retained.id, availability: { state: "available" } }],
          },
          disposition: {
            type: "superseded",
            targetGoalID: anchor.goalID,
            targetRevisionID: anchor.revisionID,
          },
        },
      })
      expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, j1.goalID, base + 60))).toMatchObject({
        head: {
          scope: {
            type: "courses",
            courses: [
              { courseID: withdrawn.id, availability: { state: "unavailable", cause: "course_withdrawn" } },
              { courseID: retained.id, availability: { state: "available" } },
            ],
          },
        },
      })

      const unavailableAddition = yield* settleDirect(
        db,
        sessionID,
        7,
        `update ${anchor.goalID}: Replacement anchor; no conditions; Operating systems Course; no target.`,
        {
          operations: [
            {
              type: "update",
              goalID: anchor.goalID,
              expectedHeadID: anchor.revisionID,
              expectedVersion: anchor.version,
              snapshot: {
                outcome: anchor.meaning.outcome,
                conditions: [],
                scope: {
                  type: "courses",
                  courses: [{ courseID: withdrawn.id, basis: { type: "new", expectedCourseVersion: 1 } }],
                },
                target: { type: "absent" },
                fieldBases: {
                  outcome: { type: "authored", sourceExcerpt: "Replacement anchor" },
                  conditions: { type: "authored", sourceExcerpt: "no conditions" },
                  scope: { type: "authored", sourceExcerpt: "Operating systems Course" },
                  target: { type: "authored", sourceExcerpt: "no target" },
                  disposition: { type: "carried", predecessorRevisionID: anchor.revisionID },
                },
              },
              disposition: { type: "active" },
            },
          ],
        },
        base + 70,
      )
      expect(settlementCode(unavailableAddition)).toBe("inactive")
      expect(yield* goalCounts(db)).toEqual({ effects: 6, goals: 4, revisions: 9, receipts: 6, operations: 8 })
    }),
  )

  it.effect(
    "keeps withdrawn multi-Course carry exact through correction, lifecycle restoration, and prepared removal",
    () =>
      Effect.gen(function* () {
        const db = (yield* Database.Service).db
        const courses = yield* Course.Service
        const withdrawn = yield* courses.createCourse({ title: "Operating systems" })
        const retained = yield* courses.createCourse({ title: "Data structures" })
        const sessionID = SessionSchema.ID.create()
        const base = Date.now() + 1_000
        yield* seedSession(db, sessionID, base)
        const courseLifecycle = () =>
          db.all<{
            id: string
            state_version: number
            withdrawal_reason: string | null
            time_updated: number
            selection_revision_id: string | null
            selection_version: number
            selection_time_updated: number
          }>(sql`
          SELECT course.id, course.state_version, course.withdrawal_reason, course.time_updated,
                 selection.revision_id AS selection_revision_id,
                 selection.version AS selection_version,
                 selection.time_updated AS selection_time_updated
          FROM course
          JOIN course_working_selection AS selection ON selection.course_id = course.id
          WHERE course.id IN (${withdrawn.id}, ${retained.id})
          ORDER BY course.id
        `)
        const activeCourses = yield* courseLifecycle()
        const initial = yield* settleDirect(
          db,
          sessionID,
          1,
          "/goal Complete systems capstone as an active Goal for Operating systems and Data structures Courses with no conditions and no target.",
          {
            operations: [
              {
                type: "create",
                snapshot: multiCourseSnapshot(withdrawn.id, retained.id, "Complete systems capstone"),
                disposition: "active",
              },
            ],
          },
          base + 1,
        )
        if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
          return yield* Effect.die("Expected multi-Course CT005 fixture")
        }
        const first = initial.settlement.operations[0]!
        expect(yield* courseLifecycle()).toEqual(activeCourses)
        yield* courses.withdrawCourse({
          courseID: withdrawn.id,
          expectedCourseVersion: 0,
          expectedSelectionVersion: 0,
        })
        const withdrawnCourses = yield* courseLifecycle()
        expect(withdrawnCourses.find((course) => course.id === withdrawn.id)).toMatchObject({
          state_version: 1,
          withdrawal_reason: "removed",
          selection_revision_id: null,
          selection_version: 1,
        })
        expect(withdrawnCourses.find((course) => course.id === retained.id)).toMatchObject({
          state_version: 0,
          withdrawal_reason: null,
          selection_revision_id: null,
          selection_version: 0,
        })
        expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 1, revisions: 1, receipts: 1, operations: 1 })
        expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, first.goalID, base + 5))).toMatchObject({
          head: {
            id: first.revisionID,
            version: 1,
            scope: {
              type: "courses",
              courses: [
                { courseID: withdrawn.id, availability: { state: "unavailable", cause: "course_withdrawn" } },
                { courseID: retained.id, availability: { state: "available" } },
              ],
            },
          },
        })

        const target = {
          type: "local_date" as const,
          date: "2026-12-20",
          timeZone: "UTC",
          sourceExpression: "2026-12-20",
          normalizationBasis: "explicit_date" as const,
        }
        const firstCarry = { type: "carried" as const, predecessorRevisionID: first.revisionID }
        const corrected = yield* settleDirect(
          db,
          sessionID,
          2,
          `correct ${first.goalID}: set target to 2026-12-20 UTC; keep the exact outcome, conditions, Course scope, and active disposition.`,
          {
            operations: [
              {
                type: "update",
                goalID: first.goalID,
                expectedHeadID: first.revisionID,
                expectedVersion: first.version,
                snapshot: {
                  outcome: first.meaning.outcome,
                  conditions: [],
                  scope: {
                    type: "courses",
                    courses: [
                      { courseID: withdrawn.id, basis: firstCarry },
                      { courseID: retained.id, basis: firstCarry },
                    ],
                  },
                  target,
                  fieldBases: {
                    outcome: firstCarry,
                    conditions: firstCarry,
                    scope: firstCarry,
                    target: { type: "authored", sourceExcerpt: "2026-12-20 UTC" },
                    disposition: firstCarry,
                  },
                },
                disposition: { type: "active" },
              },
            ],
          },
          base + 10,
        )
        if (corrected.type !== "settled" || corrected.settlement.outcome !== "applied") {
          return yield* Effect.die("Expected target correction with exact withdrawn scope carry")
        }
        const second = corrected.settlement.operations[0]!
        expect(yield* courseLifecycle()).toEqual(withdrawnCourses)

        const abandonedExcerpt = `Goal ${first.goalID} is abandoned`
        const abandoned = yield* settleDirect(
          db,
          sessionID,
          3,
          `${abandonedExcerpt}; keep its exact outcome and conditions, keep Operating systems and Data structures Course scope, and keep target 2026-12-20 UTC.`,
          {
            operations: [
              {
                type: "update",
                goalID: first.goalID,
                expectedHeadID: second.revisionID,
                expectedVersion: second.version,
                snapshot: carriedCourseSnapshot(second, [withdrawn.id, retained.id], abandonedExcerpt),
                disposition: { type: "abandoned" },
              },
            ],
          },
          base + 20,
        )
        if (abandoned.type !== "settled" || abandoned.settlement.outcome !== "applied") {
          return yield* Effect.die(
            `Expected explicit abandonment with withdrawn scope carry: ${JSON.stringify(abandoned)}`,
          )
        }
        const third = abandoned.settlement.operations[0]!
        expect(yield* courseLifecycle()).toEqual(withdrawnCourses)

        const activeExcerpt = `Goal ${first.goalID} is active`
        const restored = yield* settleDirect(
          db,
          sessionID,
          4,
          `${activeExcerpt}; resume it while keeping its exact outcome and conditions, keep Operating systems and Data structures Course scope, and keep target 2026-12-20 UTC.`,
          {
            operations: [
              {
                type: "update",
                goalID: first.goalID,
                expectedHeadID: third.revisionID,
                expectedVersion: third.version,
                snapshot: carriedCourseSnapshot(third, [withdrawn.id, retained.id], activeExcerpt),
                disposition: { type: "active" },
              },
            ],
          },
          base + 30,
        )
        if (restored.type !== "settled" || restored.settlement.outcome !== "applied") {
          return yield* Effect.die("Expected active restoration while Course remains withdrawn")
        }
        const fourth = restored.settlement.operations[0]!
        expect(yield* courseLifecycle()).toEqual(withdrawnCourses)
        expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, first.goalID, base + 35))).toMatchObject({
          head: {
            id: fourth.revisionID,
            version: 4,
            disposition: { type: "active" },
            target,
            scope: {
              type: "courses",
              courses: [
                {
                  courseID: withdrawn.id,
                  admission: { type: "carried", predecessorRevisionID: third.revisionID },
                  availability: { state: "unavailable", cause: "course_withdrawn" },
                },
                {
                  courseID: retained.id,
                  admission: { type: "carried", predecessorRevisionID: third.revisionID },
                  availability: { state: "available" },
                },
              ],
            },
          },
        })

        yield* courses.restoreCourse({ courseID: withdrawn.id, expectedCourseVersion: 1 })
        const restoredCourses = yield* courseLifecycle()
        expect(restoredCourses.find((course) => course.id === withdrawn.id)).toMatchObject({
          state_version: 2,
          withdrawal_reason: null,
          selection_revision_id: null,
          selection_version: 1,
        })
        expect(yield* goalCounts(db)).toEqual({ effects: 4, goals: 1, revisions: 4, receipts: 4, operations: 4 })
        expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, first.goalID, base + 40))).toMatchObject({
          head: {
            id: fourth.revisionID,
            version: 4,
            scope: {
              type: "courses",
              courses: [
                { courseID: withdrawn.id, availability: { state: "available" } },
                { courseID: retained.id, availability: { state: "available" } },
              ],
            },
          },
        })

        const accepted = { type: "accepted" as const }
        const removal = yield* seedAcceptedInvocation(
          db,
          sessionID,
          5,
          "Please accept the complete candidate that removes Operating systems and keeps Data structures.",
          {
            operations: [
              {
                type: "update",
                goalID: first.goalID,
                expectedHeadID: fourth.revisionID,
                expectedVersion: fourth.version,
                snapshot: {
                  outcome: fourth.meaning.outcome,
                  conditions: fourth.meaning.conditions,
                  scope: {
                    type: "courses",
                    courses: [
                      {
                        courseID: retained.id,
                        basis: { type: "carried", predecessorRevisionID: fourth.revisionID },
                      },
                    ],
                  },
                  target: fourth.meaning.target,
                  fieldBases: {
                    outcome: accepted,
                    conditions: accepted,
                    scope: accepted,
                    target: accepted,
                    disposition: accepted,
                  },
                },
                disposition: { type: "active" },
              },
            ],
          },
          base + 50,
        )
        yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, removal))
        const prepared = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
            ...removal,
            settlement: { time: base + 52, order: 5 },
          }),
        )
        if (prepared.type !== "confirmation") return yield* Effect.die("Expected prepared removal candidate")
        expect(prepared.confirmation.command).toEqual(removal.command)
        expect(prepared.confirmation.goalBases).toEqual([
          {
            goalID: first.goalID,
            revisionID: fourth.revisionID,
            version: fourth.version,
            outcome: fourth.meaning.outcome,
            disposition: "active",
          },
        ])
        expect(prepared.confirmation.courseBases).toMatchObject([
          {
            operationOrdinal: 0,
            revisionRole: "source",
            courseID: retained.id,
            admission: { type: "carried", predecessorRevisionID: fourth.revisionID },
            availability: { state: "available" },
          },
        ])
        expect(prepared.confirmation.courseBases).toHaveLength(1)
        expect(yield* courseLifecycle()).toEqual(restoredCourses)
        expect(yield* goalCounts(db)).toEqual({ effects: 4, goals: 1, revisions: 4, receipts: 4, operations: 4 })

        yield* courses.withdrawCourse({
          courseID: withdrawn.id,
          expectedCourseVersion: 2,
          expectedSelectionVersion: 1,
        })
        const raceWithdrawal = yield* courseLifecycle()
        expect(raceWithdrawal.find((course) => course.id === withdrawn.id)).toMatchObject({
          state_version: 3,
          withdrawal_reason: "removed",
          selection_revision_id: null,
          selection_version: 2,
        })
        expect(yield* goalCounts(db)).toEqual({ effects: 4, goals: 1, revisions: 4, receipts: 4, operations: 4 })
        expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, first.goalID, base + 55))).toMatchObject({
          head: {
            id: fourth.revisionID,
            version: 4,
            scope: {
              type: "courses",
              courses: [
                { courseID: withdrawn.id, availability: { state: "unavailable", cause: "course_withdrawn" } },
                { courseID: retained.id, availability: { state: "available" } },
              ],
            },
          },
        })
        const removed = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
            ...removal,
            permission: { type: "allow" },
            displayedConfirmation: prepared.confirmation,
            preparedConfirmation: prepared.preparedConfirmation,
            settlement: { time: base + 60, order: 5 },
          }),
        )
        if (removed.type !== "settled" || removed.settlement.outcome !== "applied") {
          return yield* Effect.die("Expected prepared exact-member removal to survive withdrawal race")
        }
        const fifth = removed.settlement.operations[0]!
        expect(yield* courseLifecycle()).toEqual(raceWithdrawal)
        expect(yield* invocationConfirmation(db, removal.envelope.partID)).toEqual({
          status: "applied",
          confirmation: prepared.confirmation,
        })
        expect(yield* goalCounts(db)).toEqual({ effects: 5, goals: 1, revisions: 5, receipts: 5, operations: 5 })

        const history = yield* db.transaction((tx) =>
          LearnerGoal.readHistory(tx, first.goalID, base + 70, { limit: 10 }),
        )
        expect(history.items).toHaveLength(5)
        const firstRevision = history.items.find((revision) => revision.version === 1)
        const secondRevision = history.items.find((revision) => revision.version === 2)
        const thirdRevision = history.items.find((revision) => revision.version === 3)
        const fourthRevision = history.items.find((revision) => revision.version === 4)
        const fifthRevision = history.items.find((revision) => revision.version === 5)
        if (
          !firstRevision ||
          !secondRevision ||
          !thirdRevision ||
          !fourthRevision ||
          !fifthRevision ||
          firstRevision.scope.type !== "courses" ||
          secondRevision.scope.type !== "courses" ||
          thirdRevision.scope.type !== "courses" ||
          fourthRevision.scope.type !== "courses" ||
          fifthRevision.scope.type !== "courses"
        ) {
          return yield* Effect.die("Expected five exact multi-Course history revisions")
        }
        expect(firstRevision.scope.courses).toHaveLength(2)
        expect(firstRevision.scope.courses.find((course) => course.courseID === withdrawn.id)).toMatchObject({
          admission: { type: "new", courseVersion: 0 },
          availability: { state: "unavailable", cause: "course_withdrawn" },
        })
        expect(firstRevision.scope.courses.find((course) => course.courseID === retained.id)).toMatchObject({
          admission: { type: "new", courseVersion: 0 },
          availability: { state: "available" },
        })
        expect(secondRevision).toMatchObject({
          id: second.revisionID,
          predecessorID: first.revisionID,
          disposition: { type: "active" },
          target,
          fieldBases: {
            outcome: firstCarry,
            conditions: firstCarry,
            scope: firstCarry,
            target: { type: "authored", sourceExcerpt: "2026-12-20 UTC" },
            disposition: firstCarry,
          },
        })
        expect(secondRevision.scope.courses).toHaveLength(2)
        expect(secondRevision.scope.courses.map((course) => course.admission)).toEqual([
          { type: "carried", predecessorRevisionID: first.revisionID },
          { type: "carried", predecessorRevisionID: first.revisionID },
        ])
        expect(thirdRevision).toMatchObject({
          id: third.revisionID,
          predecessorID: second.revisionID,
          disposition: { type: "abandoned" },
          target,
          fieldBases: {
            outcome: { type: "carried", predecessorRevisionID: second.revisionID },
            conditions: { type: "carried", predecessorRevisionID: second.revisionID },
            scope: { type: "carried", predecessorRevisionID: second.revisionID },
            target: { type: "carried", predecessorRevisionID: second.revisionID },
            disposition: { type: "authored", sourceExcerpt: abandonedExcerpt },
          },
        })
        expect(thirdRevision.scope.courses).toHaveLength(2)
        expect(thirdRevision.scope.courses.map((course) => course.admission)).toEqual([
          { type: "carried", predecessorRevisionID: second.revisionID },
          { type: "carried", predecessorRevisionID: second.revisionID },
        ])
        expect(fourthRevision).toMatchObject({
          id: fourth.revisionID,
          predecessorID: third.revisionID,
          disposition: { type: "active" },
          target,
          fieldBases: {
            outcome: { type: "carried", predecessorRevisionID: third.revisionID },
            conditions: { type: "carried", predecessorRevisionID: third.revisionID },
            scope: { type: "carried", predecessorRevisionID: third.revisionID },
            target: { type: "carried", predecessorRevisionID: third.revisionID },
            disposition: { type: "authored", sourceExcerpt: activeExcerpt },
          },
        })
        expect(fourthRevision.scope.courses).toHaveLength(2)
        expect(fourthRevision.scope.courses.map((course) => course.admission)).toEqual([
          { type: "carried", predecessorRevisionID: third.revisionID },
          { type: "carried", predecessorRevisionID: third.revisionID },
        ])
        expect(fifthRevision).toMatchObject({
          id: fifth.revisionID,
          predecessorID: fourth.revisionID,
          disposition: { type: "active" },
          target,
          fieldBases: {
            outcome: accepted,
            conditions: accepted,
            scope: accepted,
            target: accepted,
            disposition: accepted,
          },
          scope: {
            type: "courses",
            courses: [
              {
                courseID: retained.id,
                admission: { type: "carried", predecessorRevisionID: fourth.revisionID },
                availability: { state: "available" },
              },
            ],
          },
        })
        expect(
          yield* db.get<{ count: number }>(sql`
          SELECT count(*) AS count
          FROM learner_goal_course_scope
          WHERE revision_id IN (
            ${first.revisionID}, ${second.revisionID}, ${third.revisionID},
            ${fourth.revisionID}, ${fifth.revisionID}
          )
        `),
        ).toEqual({ count: 9 })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
  )

  it.effect("reads current, filtered discovery, and frozen history/discovery cursors", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Operating systems" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const scoped = scopedGoal(course.id, "Course Goal").operations[0]!
      const created = yield* settleDirect(
        db,
        sessionID,
        1,
        "Create durable goals: (1) Course Goal as an active Goal for the Operating systems Course with no conditions and no target. (2) Home Goal Two as an active LearnerHome goal with no conditions and no target. (3) Home Goal Three as an active LearnerHome goal with no conditions and no target.",
        { operations: [scoped, homeCreate("Home Goal Two"), homeCreate("Home Goal Three")] },
        base + 1,
      )
      if (created.type !== "settled" || created.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected read fixtures")
      }
      const [g1, g2, g3] = created.settlement.operations
      if (!g1 || !g2 || !g3) return yield* Effect.die("Expected three read fixtures")
      const achievedExcerpt = `Goal ${g1.goalID} is achieved`
      const achieved = yield* settleDirect(
        db,
        sessionID,
        2,
        achievedExcerpt,
        {
          operations: [
            {
              type: "update",
              goalID: g1.goalID,
              expectedHeadID: g1.revisionID,
              expectedVersion: g1.version,
              snapshot: carriedCourseSnapshot(g1, [course.id], achievedExcerpt),
              disposition: { type: "achieved" },
            },
          ],
        },
        base + 10,
      )
      if (achieved.type !== "settled" || achieved.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected achieved read fixture")
      }
      const g1v2 = achieved.settlement.operations[0]!
      expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, g1.goalID, base + 20))).toMatchObject({
        goalID: g1.goalID,
        head: { id: g1v2.revisionID, version: 2, disposition: { type: "achieved" } },
      })
      const byCourse = yield* db.transaction((tx) => LearnerGoal.discover(tx, base + 20, { courseID: course.id }))
      const byDisposition = yield* db.transaction((tx) =>
        LearnerGoal.discover(tx, base + 20, { disposition: "achieved" }),
      )
      expect(byCourse.items.map((item) => item.goalID)).toEqual([g1.goalID])
      expect(byDisposition.items.map((item) => item.goalID)).toEqual([g1.goalID])

      const historyFirst = yield* db.transaction((tx) =>
        LearnerGoal.readHistory(tx, g1.goalID, base + 20, { limit: 1 }),
      )
      const discoveryFirst = yield* db.transaction((tx) => LearnerGoal.discover(tx, base + 20, {}, { limit: 1 }))
      if (!historyFirst.cursor || !discoveryFirst.cursor) return yield* Effect.die("Expected frozen cursors")
      expect(historyFirst.items.map((item) => item.version)).toEqual([2])
      expect(discoveryFirst.items.map((item) => item.goalID)).toEqual([g1.goalID])

      const activeExcerpt = `Goal ${g1.goalID} is active`
      const appended = yield* settleDirect(
        db,
        sessionID,
        3,
        `Create durable goals: (1)
${activeExcerpt}. (2)
/goal Late Goal as an active LearnerHome goal with no conditions and no target.`,
        {
          operations: [
            {
              type: "update",
              goalID: g1.goalID,
              expectedHeadID: g1v2.revisionID,
              expectedVersion: g1v2.version,
              snapshot: carriedCourseSnapshot(g1v2, [course.id], activeExcerpt),
              disposition: { type: "active" },
            },
            homeCreate("Late Goal"),
          ],
        },
        base + 30,
      )
      if (appended.type !== "settled" || appended.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected concurrent cursor append")
      }
      const historySecond = yield* db.transaction((tx) =>
        LearnerGoal.readHistory(tx, g1.goalID, base + 40, { limit: 1, cursor: historyFirst.cursor }),
      )
      const discoverySecond = yield* db.transaction((tx) =>
        LearnerGoal.discover(tx, base + 40, {}, { limit: 1, cursor: discoveryFirst.cursor }),
      )
      expect(historySecond.throughRevision).toBe(historyFirst.throughRevision)
      expect(historySecond.items.map((item) => item.version)).toEqual([1])
      expect(discoverySecond.throughRevision).toBe(discoveryFirst.throughRevision)
      expect([g2.goalID, g3.goalID]).toContain(discoverySecond.items[0]?.goalID)
      expect(discoverySecond.items[0]?.goalID).not.toBe(appended.settlement.operations[1]!.goalID)

      const wrongGoal = yield* db
        .transaction((tx) => LearnerGoal.readHistory(tx, g2.goalID, base + 40, { cursor: historyFirst.cursor }))
        .pipe(Effect.flip)
      const wrongFilter = yield* db
        .transaction((tx) =>
          LearnerGoal.discover(tx, base + 40, { disposition: "active" }, { cursor: discoveryFirst.cursor }),
        )
        .pipe(Effect.flip)
      expect(wrongGoal).toBeInstanceOf(LearnerGoal.InvalidCursorError)
      expect(wrongFilter).toBeInstanceOf(LearnerGoal.InvalidCursorError)
    }),
  )

  it.effect("seals one direct Goal effect and rejects raw identity, history, and batch attacks", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const command = createHomeGoal("Learn graph algorithms")
      const invocation = yield* seedInvocation(
        db,
        sessionID,
        1,
        "/goal Learn graph algorithms as an active LearnerHome goal with no conditions and no target.",
        command,
        10,
      )

      expect(yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, invocation))).toEqual({
        type: "candidate",
      })
      const settled = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...invocation,
          permission: { type: "allow" },
          settlement: { time: 12, order: 1 },
        }),
      )
      expect(settled).toMatchObject({ type: "settled", settlement: { outcome: "applied" } })
      const revision = yield* db.select().from(LearnerGoalRevisionTable).get()
      const effect = yield* db.select().from(LearnerGoalEffectTable).get()
      if (!revision || !effect) return yield* Effect.die("Expected committed Goal rows")

      const attacks = [
        db.run(sql`UPDATE learner_goal_revision SET outcome = 'forged' WHERE id = ${revision.id}`),
        db.run(sql`DELETE FROM learner_goal_effect WHERE id = ${effect.id}`),
        db.run(sql`
          INSERT INTO learner_goal_condition (revision_id, ordinal, content)
          VALUES (${revision.id}, 0, 'forged condition')
        `),
        db.run(sql`
          INSERT INTO learner_goal (id, time_created)
          VALUES (${"gol_" + "z".repeat(26)}, 13)
        `),
        db.run(sql`
          INSERT INTO learner_goal_revision (
            id, goal_id, version, predecessor_id, effect_id, operation_ordinal, revision_role,
            occurrence_id, source_order, outcome, scope_kind, target_kind, disposition,
            revision_order, time_committed, commit_order, frontier_sequence, frontier_time
          ) VALUES (
            ${"glr_" + "z".repeat(26)}, ${revision.goal_id}, 2, ${revision.id}, ${effect.id}, 0,
            'source', ${revision.occurrence_id}, ${revision.source_order + 1}, 'branch', 'learner_home',
            'absent', 'active', ${revision.revision_order + 1}, 13, 2, ${revision.frontier_sequence}, 13
          )
        `),
        db.run(sql`INSERT OR REPLACE INTO learner_goal_state (singleton, revision_sequence) VALUES (1, 0)`),
        db.run(sql`INSERT OR REPLACE INTO learner_goal_state (rowid, singleton, revision_sequence) VALUES (2, 1, 0)`),
      ]
      const exits = yield* Effect.forEach(attacks, (attack) => Effect.exit(attack))
      expect(exits.every((exit) => exit._tag === "Failure")).toBe(true)
      expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_commit_seal`)).toEqual({ count: 1 })
      expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_revision`)).toEqual({ count: 1 })
      expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect("rejects X-confirmed/Y-sealed and extra-clause raw constructions", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const directCommand = createHomeGoal("Direct sealed Goal")
      const direct = yield* seedInvocation(
        db,
        sessionID,
        1,
        "/goal Direct sealed Goal as an active LearnerHome goal with no conditions and no target.",
        directCommand,
        10,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, direct))
      const extra = yield* rawSealAttempt(db, direct, { time: 12, order: 1 }, undefined, (prepared) => {
        const operation = prepared.command.operations[0]
        if (!operation) return prepared
        return {
          ...prepared,
          command: {
            operations: [
              {
                ...operation,
                snapshot: { ...operation.snapshot, extraClause: "forged" },
              },
            ],
          } as unknown as LearnerGoal.Command,
        }
      })
      expect(rawFailure(extra)).toContain("learner_goal_effect_authorization_invalid")

      const misboundDefault = yield* rawSealAttempt(db, direct, { time: 12, order: 1 }, undefined, (prepared) => {
        const command = prepared.command.operations[0]
        const operation = prepared.operations[0]
        const revision = operation?.revisions[0]
        if (!command || !operation || !revision) return prepared
        const target = { type: "authored" as const, sourceExcerpt: "Direct sealed Goal" }
        return {
          ...prepared,
          command: {
            operations: [
              {
                ...command,
                snapshot: {
                  ...command.snapshot,
                  fieldBases: { ...command.snapshot.fieldBases, target },
                },
              },
            ],
          },
          operations: [
            {
              ...operation,
              revisions: [
                {
                  ...revision,
                  snapshot: {
                    ...revision.snapshot,
                    fieldBases: { ...revision.snapshot.fieldBases, target },
                  },
                },
              ],
            },
          ],
        }
      })
      expect(rawFailure(misboundDefault)).toContain("learner_goal_effect_authorization_invalid")

      const acceptedCommand: LearnerGoal.Command = {
        operations: [{ type: "create", snapshot: acceptedHomeSnapshot("Confirmed X"), disposition: "active" }],
      }
      const accepted = yield* seedAcceptedInvocation(
        db,
        sessionID,
        2,
        "Please accept the complete candidate.",
        acceptedCommand,
        20,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, accepted))
      const confirmation = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...accepted,
          settlement: { time: 22, order: 2 },
        }),
      )
      if (confirmation.type !== "confirmation") return yield* Effect.die("Expected accepted Goal confirmation")
      const mismatched = yield* rawSealAttempt(
        db,
        accepted,
        { time: 22, order: 2 },
        confirmation.confirmation,
        (prepared) => {
          const operation = prepared.operations[0]
          const revision = operation?.revisions[0]
          if (!operation || !revision) return prepared
          const result = {
            ...operation.result,
            meaning: { ...operation.result.meaning, outcome: "Sealed Y" },
          }
          const acknowledgement = LearnerGoal.renderAcknowledgement([result])
          return {
            ...prepared,
            operations: [
              {
                ...operation,
                result,
                revisions: [{ ...revision, snapshot: { ...revision.snapshot, outcome: "Sealed Y" } }],
              },
            ],
            acknowledgementTitle: acknowledgement.title,
            acknowledgementBody: acknowledgement.body,
          }
        },
      )
      expect(rawFailure(mismatched)).toContain("learner_goal_commit_seal_command_snapshot_invalid")
      expect(yield* goalCounts(db)).toEqual({ effects: 0, goals: 0, revisions: 0, receipts: 0, operations: 0 })
      expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect("rejects raw target, identifier, duplicate-condition, and open-meaning attacks", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      yield* seedSession(db, sessionID, 1)
      const baseCommand = createHomeGoal("Raw integrity Goal")
      const base = yield* seedInvocation(
        db,
        sessionID,
        1,
        "/goal Raw integrity Goal as an active LearnerHome goal with no conditions and no target.",
        baseCommand,
        10,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, base))
      const invalidEffectID = `gle_${"a".repeat(25)}!` as LearnerGoal.EffectID
      const invalidGoalID = `gol_${"b".repeat(25)}!` as LearnerGoal.GoalID
      const invalidRevisionID = `glr_${"c".repeat(25)}!` as LearnerGoal.RevisionID
      const invalidEffect = yield* rawSealAttempt(db, base, { time: 12, order: 1 }, undefined, (prepared) => ({
        ...prepared,
        effectID: invalidEffectID,
      }))
      expect(rawFailure(invalidEffect)).toContain("learner_goal_effect_identity_invalid")
      const invalidGoal = yield* rawSealAttempt(db, base, { time: 12, order: 1 }, undefined, (prepared) => {
        const operation = prepared.operations[0]
        const revision = operation?.revisions[0]
        if (!operation || !revision) return prepared
        return {
          ...prepared,
          operations: [
            {
              ...operation,
              result: { ...operation.result, goalID: invalidGoalID },
              revisions: [{ ...revision, goalID: invalidGoalID }],
              newGoals: operation.newGoals.map((goal) => ({ ...goal, goalID: invalidGoalID })),
            },
          ],
        }
      })
      expect(rawFailure(invalidGoal)).toContain("learner_goal_identity_owner_invalid")
      const invalidRevision = yield* rawSealAttempt(db, base, { time: 12, order: 1 }, undefined, (prepared) => {
        const operation = prepared.operations[0]
        const revision = operation?.revisions[0]
        if (!operation || !revision) return prepared
        return {
          ...prepared,
          operations: [
            {
              ...operation,
              result: { ...operation.result, revisionID: invalidRevisionID },
              revisions: [{ ...revision, id: invalidRevisionID }],
            },
          ],
        }
      })
      expect(rawFailure(invalidRevision)).toContain("learner_goal_revision_owner_invalid")
      const openMeaning = yield* rawSealAttempt(db, base, { time: 12, order: 1 }, undefined, (prepared) => {
        const operation = prepared.operations[0]
        if (!operation) return prepared
        const result = {
          ...operation.result,
          meaning: { ...operation.result.meaning, evidence: { passed: true } },
        } as unknown as LearnerGoal.OperationResult
        const acknowledgement = LearnerGoal.renderAcknowledgement([result])
        return {
          ...prepared,
          operations: [{ ...operation, result }],
          acknowledgementTitle: acknowledgement.title,
          acknowledgementBody: acknowledgement.body,
        }
      })
      expect(rawFailure(openMeaning)).toContain("learner_goal_commit_seal_meaning_invalid")

      const condition = "score >= 85\nand submit"
      const conditioned = homeSnapshot("Raw duplicate condition Goal")
      const duplicateCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "create",
            disposition: "active",
            snapshot: {
              ...conditioned,
              conditions: [condition],
              fieldBases: {
                ...conditioned.fieldBases,
                conditions: { type: "authored", sourceExcerpt: condition },
              },
            },
          },
        ],
      }
      const duplicate = yield* seedInvocation(
        db,
        sessionID,
        2,
        `/goal Raw duplicate condition Goal as an active LearnerHome goal with condition ${condition} and no target.`,
        duplicateCommand,
        20,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, duplicate))
      const duplicateRows = yield* rawSealAttempt(db, duplicate, { time: 22, order: 2 }, undefined, (prepared) => {
        const operation = prepared.operations[0]
        const revision = operation?.revisions[0]
        if (!operation || !revision) return prepared
        return {
          ...prepared,
          operations: [
            {
              ...operation,
              revisions: [
                {
                  ...revision,
                  snapshot: { ...revision.snapshot, conditions: [condition, condition.replace("\n", "\r\n")] },
                },
              ],
            },
          ],
        }
      })
      expect(rawFailure(duplicateRows)).toContain("learner_goal_condition_owner_invalid")

      const normalized = "2026-12-20T00:00:00Z"
      const instantCommand: LearnerGoal.Command = {
        operations: [
          { type: "create", snapshot: instantSnapshot("Raw instant Goal", normalized, 0), disposition: "active" },
        ],
      }
      const instant = yield* seedInvocation(
        db,
        sessionID,
        3,
        `/goal Raw instant Goal by ${normalized} as an active LearnerHome goal with no conditions.`,
        instantCommand,
        30,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, instant))
      const mismatchedInstant = yield* rawSealAttempt(db, instant, { time: 32, order: 3 }, undefined, (prepared) => {
        const operation = prepared.operations[0]
        const revision = operation?.revisions[0]
        if (!operation || !revision || revision.snapshot.target.type !== "instant") return prepared
        return {
          ...prepared,
          operations: [
            {
              ...operation,
              revisions: [
                {
                  ...revision,
                  snapshot: { ...revision.snapshot, target: { ...revision.snapshot.target, instant: 0 } },
                },
              ],
            },
          ],
        }
      })
      expect(rawFailure(mismatchedInstant)).toContain("learner_goal_revision_target_semantics_invalid")

      const accepted = { type: "accepted" as const }
      const localCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "create",
            disposition: "active",
            snapshot: {
              outcome: "Raw local-date Goal",
              conditions: [],
              scope: { type: "learner_home" },
              target: {
                type: "local_date",
                date: "2026-12-20",
                timeZone: "Asia/Shanghai",
                sourceExpression: "2026-12-20",
                normalizationBasis: "explicit_date",
              },
              fieldBases: {
                outcome: accepted,
                conditions: accepted,
                scope: accepted,
                target: accepted,
                disposition: accepted,
              },
            },
          },
        ],
      }
      const local = yield* seedAcceptedInvocation(
        db,
        sessionID,
        4,
        "Please accept the exact local-date candidate.",
        localCommand,
        40,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, local))
      const localPrompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...local,
          settlement: { time: 42, order: 4 },
        }),
      )
      if (localPrompt.type !== "confirmation") return yield* Effect.die("Expected local-date confirmation")
      const mutateLocalTarget = (target: LearnerGoal.Target) => (prepared: LearnerGoal.PreparedChangeSet) => {
        const operation = prepared.operations[0]
        const revision = operation?.revisions[0]
        if (!operation || !revision) return prepared
        return {
          ...prepared,
          operations: [
            {
              ...operation,
              revisions: [{ ...revision, snapshot: { ...revision.snapshot, target } }],
            },
          ],
        }
      }
      const invalidDate = yield* rawSealAttempt(
        db,
        local,
        { time: 42, order: 4 },
        localPrompt.confirmation,
        mutateLocalTarget({ ...localCommand.operations[0]!.snapshot.target, date: "2026-99-99" } as LearnerGoal.Target),
      )
      expect(rawFailure(invalidDate)).toContain("learner_goal_revision_target_semantics_invalid")
      const invalidRegistry = yield* Effect.exit(
        db.run(sql`INSERT INTO learner_goal_time_zone (release_id, name) VALUES ('iana-tzdb-2026c', 'Not/AZone')`),
      )
      expect(invalidRegistry._tag).toBe("Failure")
      if (invalidRegistry._tag === "Failure") {
        expect(Cause.pretty(invalidRegistry.cause)).toContain("learner_goal_time_zone_unsupported")
      }
      const mutatedRelease = yield* Effect.exit(
        db.run(sql`
          UPDATE learner_goal_time_zone_release
          SET tzdb_version = 'forged'
          WHERE id = 'iana-tzdb-2026c'
        `),
      )
      expect(mutatedRelease._tag === "Failure" ? Cause.pretty(mutatedRelease.cause) : "").toContain(
        "learner_goal_time_zone_release_immutable",
      )
      const deletedZone = yield* Effect.exit(
        db.run(sql`
          DELETE FROM learner_goal_time_zone
          WHERE release_id = 'iana-tzdb-2026c' AND name = 'Asia/Kolkata'
        `),
      )
      expect(deletedZone._tag === "Failure" ? Cause.pretty(deletedZone.cause) : "").toContain(
        "learner_goal_time_zone_delete_forbidden",
      )
      expect(
        yield* db.get(sql`
          SELECT id, tzdb_version, engine, data_sha256
          FROM learner_goal_time_zone_release
        `),
      ).toEqual({
        id: "iana-tzdb-2026c",
        tzdb_version: "2026c",
        engine: "timezonecomplete@5.15.1+tzdata@1.0.50",
        data_sha256: "a4220c6c6efab292e7aac7dbe8d771cfc619e99b9235ed3e54d17445c232f995",
      })
      expect(
        yield* db.all<{ name: string }>(sql`
          SELECT name FROM learner_goal_time_zone
          WHERE name IN ('America/Coyhaique', 'Asia/Kolkata')
          ORDER BY name
        `),
      ).toEqual([{ name: "America/Coyhaique" }, { name: "Asia/Kolkata" }])
      expect(
        yield* db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM learner_goal_time_zone WHERE release_id = 'iana-tzdb-2026c'
        `),
      ).toEqual({ count: 598 })
      const invalidZone = yield* rawSealAttempt(
        db,
        local,
        { time: 42, order: 4 },
        localPrompt.confirmation,
        mutateLocalTarget({
          ...localCommand.operations[0]!.snapshot.target,
          timeZone: "Not/AZone",
        } as LearnerGoal.Target),
      )
      expect(rawFailure(invalidZone)).toContain("learner_goal_commit_seal_command_snapshot_invalid")

      const aliasCommand: LearnerGoal.Command = {
        operations: [
          {
            ...localCommand.operations[0]!,
            snapshot: {
              ...localCommand.operations[0]!.snapshot,
              target: {
                type: "local_date",
                date: "2026-12-20",
                timeZone: "Asia/Kolkata",
                sourceExpression: "2026-12-20",
                normalizationBasis: "explicit_date",
              },
            },
          },
        ],
      }
      const alias = yield* seedAcceptedInvocation(
        db,
        sessionID,
        5,
        "Please accept the exact local-date candidate in Asia/Kolkata.",
        aliasCommand,
        50,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, alias))
      const aliasResult = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...alias,
          settlement: { time: 52, order: 5 },
        }),
      )
      if (aliasResult.type !== "confirmation") return yield* Effect.die("Expected valid IANA alias confirmation")
      const aliasApplied = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...alias,
          permission: { type: "allow" },
          displayedConfirmation: aliasResult.confirmation,
          preparedConfirmation: aliasResult.preparedConfirmation,
          settlement: { time: 54, order: 5 },
        }),
      )
      expect(aliasApplied).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          operations: [{ meaning: { target: { type: "local_date", timeZone: "Asia/Kolkata" } } }],
        },
      })

      const sourceInstant = Date.parse("2026-07-21T08:00:00-04:00")
      const sourceNormalized = "2026-07-21T08:00:00-04:00"
      const sourceCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "create",
            snapshot: {
              ...acceptedHomeSnapshot("Raw source-temporal instant Goal"),
              target: {
                type: "instant",
                instant: sourceInstant,
                sourceExpression: sourceNormalized,
                normalized: sourceNormalized,
                utcOffsetMinutes: -240,
                normalizationBasis: "explicit_offset",
              },
            },
            disposition: "active",
          },
        ],
      }
      const sourceTemporal = yield* seedAcceptedInvocation(
        db,
        sessionID,
        6,
        "Please accept the exact source-temporal instant candidate.",
        sourceCommand,
        sourceInstant,
        { timeZone: "America/New_York" },
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, sourceTemporal))
      const sourcePrompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...sourceTemporal,
          settlement: { time: sourceInstant + 2, order: 6 },
        }),
      )
      if (sourcePrompt.type !== "confirmation")
        return yield* Effect.die("Expected source-temporal instant confirmation")
      const contradictoryOffset = yield* rawSealAttempt(
        db,
        sourceTemporal,
        { time: sourceInstant + 2, order: 6 },
        sourcePrompt.confirmation,
        (prepared) => {
          const operation = prepared.operations[0]
          const revision = operation?.revisions[0]
          if (!operation || !revision || revision.snapshot.target.type !== "instant") return prepared
          const normalized = "2026-07-21T08:00:00+09:00"
          return {
            ...prepared,
            operations: [
              {
                ...operation,
                revisions: [
                  {
                    ...revision,
                    snapshot: {
                      ...revision.snapshot,
                      target: {
                        ...revision.snapshot.target,
                        instant: Date.parse(normalized),
                        timeZone: "America/New_York",
                        sourceExpression: "today at 8am",
                        normalized,
                        utcOffsetMinutes: 540,
                        normalizationBasis: "source_temporal_context",
                      } as unknown as LearnerGoal.Target,
                    },
                  },
                ],
              },
            ],
          }
        },
      )
      expect(rawFailure(contradictoryOffset)).toContain("learner_goal_revision_temporal_basis_invalid")
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 1, revisions: 1, receipts: 1, operations: 1 })
      expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect("rejects incomplete and forged accepted confirmation bases before sealing", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Confirmation Course" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const initial = yield* settleDirect(
        db,
        sessionID,
        1,
        "/goal Basis anchor as an active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Basis anchor"),
        base + 10,
      )
      if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
        return yield* Effect.die(`Expected confirmation source Goal: ${JSON.stringify(initial)}`)
      }
      const head = initial.settlement.operations[0]!
      const updateCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "update",
            goalID: head.goalID,
            expectedHeadID: head.revisionID,
            expectedVersion: head.version,
            snapshot: acceptedHomeSnapshot("Confirmed correction"),
            disposition: { type: "active" },
          },
        ],
      }
      const update = yield* seedAcceptedInvocation(
        db,
        sessionID,
        2,
        "Please accept the exact correction candidate.",
        updateCommand,
        base + 20,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, update))
      const updatePrompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...update,
          settlement: { time: base + 22, order: 2 },
        }),
      )
      if (updatePrompt.type !== "confirmation") return yield* Effect.die("Expected Goal-basis confirmation")
      expect(updatePrompt.confirmation.goalBases).toHaveLength(1)
      const missingGoalBasis = yield* rawSealAttempt(
        db,
        update,
        { time: base + 22, order: 2 },
        { ...updatePrompt.confirmation, goalBases: [] },
        (prepared) => prepared,
      )
      expect(rawFailure(missingGoalBasis)).toContain("learner_goal_confirmation_goal_basis_invalid")

      const accepted = { type: "accepted" as const }
      const scopedCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "create",
            disposition: "active",
            snapshot: {
              outcome: "Confirmed scoped Goal",
              conditions: [],
              scope: {
                type: "courses",
                courses: [{ courseID: course.id, basis: { type: "new", expectedCourseVersion: 0 } }],
              },
              target: { type: "absent" },
              fieldBases: {
                outcome: accepted,
                conditions: accepted,
                scope: accepted,
                target: accepted,
                disposition: accepted,
              },
            },
          },
        ],
      }
      const scoped = yield* seedAcceptedInvocation(
        db,
        sessionID,
        3,
        "Please accept the exact scoped candidate.",
        scopedCommand,
        base + 30,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, scoped))
      const scopedPrompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...scoped,
          settlement: { time: base + 32, order: 3 },
        }),
      )
      if (scopedPrompt.type !== "confirmation") return yield* Effect.die("Expected Course-basis confirmation")
      expect(scopedPrompt.confirmation.courseBases).toHaveLength(1)
      const missingCourseBasis = yield* rawSealAttempt(
        db,
        scoped,
        { time: base + 32, order: 3 },
        { ...scopedPrompt.confirmation, courseBases: [] },
        (prepared) => prepared,
      )
      expect(rawFailure(missingCourseBasis)).toContain("learner_goal_confirmation_course_basis_invalid")
      const courseBasis = scopedPrompt.confirmation.courseBases[0]!
      if (courseBasis.availability.state !== "available")
        return yield* Effect.die("Expected active Course availability")
      const forgedAvailability = yield* rawSealAttempt(
        db,
        scoped,
        { time: base + 32, order: 3 },
        {
          ...scopedPrompt.confirmation,
          courseBases: [
            {
              ...courseBasis,
              availability: {
                ...courseBasis.availability,
                state: "unavailable",
                cause: "course_withdrawn",
                title: courseBasis.courseTitle,
              },
            },
          ],
        },
        (prepared) => prepared,
      )
      expect(rawFailure(forgedAvailability)).toContain("learner_goal_confirmation_course_basis_invalid")
      expect(yield* goalCounts(db)).toEqual({ effects: 1, goals: 1, revisions: 1, receipts: 1, operations: 1 })
      expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect("rejects raw predecessor, basis, replacement, and relation topology attacks", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Topology Course" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const created = yield* settleDirect(
        db,
        sessionID,
        1,
        "Create durable goals: (1) Topology A as an active LearnerHome goal with no conditions and no target. (2) Topology B as an active LearnerHome goal with no conditions and no target. (3) Topology C as an active LearnerHome goal with no conditions and no target. (4) Topology D as an active LearnerHome goal with no conditions and no target.",
        {
          operations: [
            homeCreate("Topology A"),
            homeCreate("Topology B"),
            homeCreate("Topology C"),
            homeCreate("Topology D"),
          ],
        },
        base + 10,
      )
      if (created.type !== "settled" || created.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected raw-topology fixtures")
      }
      const [a1, b1, c1, d1] = created.settlement.operations
      if (!a1 || !b1 || !c1 || !d1) return yield* Effect.die("Expected four raw-topology fixtures")

      const dUpdated = yield* settleDirect(
        db,
        sessionID,
        2,
        `update ${d1.goalID}: Topology D revised; active LearnerHome goal with no conditions and no target.`,
        {
          operations: [
            {
              type: "update",
              goalID: d1.goalID,
              expectedHeadID: d1.revisionID,
              expectedVersion: d1.version,
              snapshot: homeSnapshot("Topology D revised"),
              disposition: { type: "active" },
            },
          ],
        },
        base + 20,
      )
      if (dUpdated.type !== "settled" || dUpdated.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected revised replacement target")
      }
      const d2 = dUpdated.settlement.operations[0]!
      const relationAB = `replace ${a1.goalID} with ${b1.goalID}`
      const related = yield* settleDirect(
        db,
        sessionID,
        3,
        relationAB,
        { operations: [replacementOperation(a1, b1, relationAB)] },
        base + 30,
      )
      if (related.type !== "settled" || related.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected current A-to-B relation")
      }
      const a2 = related.settlement.operations[0]!

      const updateCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "update",
            goalID: d2.goalID,
            expectedHeadID: d2.revisionID,
            expectedVersion: d2.version,
            snapshot: acceptedHomeSnapshot("Topology D accepted correction"),
            disposition: { type: "active" },
          },
        ],
      }
      const update = yield* seedAcceptedInvocation(
        db,
        sessionID,
        4,
        "Please accept the exact topology correction candidate.",
        updateCommand,
        base + 40,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, update))
      const updatePrompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...update,
          settlement: { time: base + 42, order: 4 },
        }),
      )
      if (updatePrompt.type !== "confirmation") return yield* Effect.die("Expected topology update confirmation")

      const crossGoalPredecessor = yield* rawSealAttempt(
        db,
        update,
        { time: base + 42, order: 4 },
        updatePrompt.confirmation,
        (prepared) => {
          const operation = prepared.operations[0]
          const revision = operation?.revisions[0]
          if (!operation || !revision) return prepared
          return {
            ...prepared,
            operations: [
              {
                ...operation,
                revisions: [{ ...revision, predecessorID: b1.revisionID }],
              },
            ],
          }
        },
      )
      expect(rawFailure(crossGoalPredecessor)).toContain("learner_goal_revision_chain_invalid")

      const wrongFieldPredecessor = yield* rawSealAttempt(
        db,
        update,
        { time: base + 42, order: 4 },
        updatePrompt.confirmation,
        (prepared) => {
          const operation = prepared.operations[0]
          const revision = operation?.revisions[0]
          if (!operation || !revision) return prepared
          return {
            ...prepared,
            operations: [
              {
                ...operation,
                revisions: [
                  {
                    ...revision,
                    snapshot: {
                      ...revision.snapshot,
                      fieldBases: {
                        ...revision.snapshot.fieldBases,
                        outcome: { type: "carried", predecessorRevisionID: b1.revisionID },
                      },
                    },
                  },
                ],
              },
            ],
          }
        },
      )
      expect(rawFailure(wrongFieldPredecessor)).toContain("learner_goal_field_basis_owner_invalid")

      const partialRevisionSet = yield* rawSealAttempt(
        db,
        update,
        { time: base + 42, order: 4 },
        updatePrompt.confirmation,
        (prepared) => {
          const operation = prepared.operations[0]
          if (!operation) return prepared
          return { ...prepared, operations: [{ ...operation, revisions: [] }] }
        },
      )
      expect(rawFailure(partialRevisionSet)).toContain("learner_goal_state_transition_invalid")

      const scopedCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "update",
            goalID: d2.goalID,
            expectedHeadID: d2.revisionID,
            expectedVersion: d2.version,
            snapshot: {
              outcome: "Topology D scoped correction",
              conditions: [],
              scope: {
                type: "courses",
                courses: [{ courseID: course.id, basis: { type: "new", expectedCourseVersion: 0 } }],
              },
              target: { type: "absent" },
              fieldBases: {
                outcome: { type: "accepted" },
                conditions: { type: "accepted" },
                scope: { type: "accepted" },
                target: { type: "accepted" },
                disposition: { type: "accepted" },
              },
            },
            disposition: { type: "active" },
          },
        ],
      }
      const scoped = yield* seedAcceptedInvocation(
        db,
        sessionID,
        5,
        "Please accept the exact topology Course candidate.",
        scopedCommand,
        base + 50,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, scoped))
      const scopedPrompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...scoped,
          settlement: { time: base + 52, order: 5 },
        }),
      )
      if (scopedPrompt.type !== "confirmation") return yield* Effect.die("Expected topology Course confirmation")
      const absentCarriedCourse = yield* rawSealAttempt(
        db,
        scoped,
        { time: base + 52, order: 5 },
        scopedPrompt.confirmation,
        (prepared) => {
          const operation = prepared.operations[0]
          const revision = operation?.revisions[0]
          const membership = revision?.courses[0]
          if (!operation || !revision || !membership) return prepared
          return {
            ...prepared,
            operations: [
              {
                ...operation,
                revisions: [
                  {
                    ...revision,
                    courses: [
                      {
                        ...membership,
                        admission: { type: "carried", predecessorRevisionID: d2.revisionID },
                      },
                    ],
                  },
                ],
              },
            ],
          }
        },
      )
      expect(rawFailure(absentCarriedCourse)).toContain("learner_goal_course_scope_carry_basis_invalid")

      const relationCD = `replace ${c1.goalID} with ${d2.goalID}`
      const replaceCD = yield* seedInvocation(
        db,
        sessionID,
        6,
        relationCD,
        { operations: [replacementOperation(c1, d2, relationCD)] },
        base + 60,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, replaceCD))
      const staleExistingTarget = yield* rawSealAttempt(
        db,
        replaceCD,
        { time: base + 62, order: 6 },
        undefined,
        (prepared) => retargetPreparedReplacement(prepared, d1),
      )
      expect(rawFailure(staleExistingTarget)).toContain("learner_goal_commit_seal_command_operation_invalid")
      const secondIncoming = yield* rawSealAttempt(
        db,
        replaceCD,
        { time: base + 62, order: 6 },
        undefined,
        (prepared) => retargetPreparedReplacement(prepared, b1),
      )
      expect(rawFailure(secondIncoming)).toContain("learner_goal_commit_seal_relation_incoming_invalid")

      const relationBC = `replace ${b1.goalID} with ${c1.goalID}`
      const replaceBC = yield* seedInvocation(
        db,
        sessionID,
        7,
        relationBC,
        { operations: [replacementOperation(b1, c1, relationBC)] },
        base + 70,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, replaceBC))
      const cycle = yield* rawSealAttempt(db, replaceBC, { time: base + 72, order: 7 }, undefined, (prepared) =>
        retargetPreparedReplacement(prepared, a2),
      )
      expect(rawFailure(cycle)).toContain("learner_goal_commit_seal_relation_cycle")

      const generatedCommand: LearnerGoal.Command = {
        operations: [
          {
            type: "replace",
            goalID: c1.goalID,
            expectedHeadID: c1.revisionID,
            expectedVersion: c1.version,
            snapshot: acceptedHomeSnapshot(c1.meaning.outcome),
            target: {
              type: "new",
              snapshot: acceptedHomeSnapshot("Generated topology target"),
              disposition: "active",
            },
          },
        ],
      }
      const generated = yield* seedAcceptedInvocation(
        db,
        sessionID,
        8,
        "Please accept the exact generated replacement candidate.",
        generatedCommand,
        base + 80,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, generated))
      const generatedPrompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...generated,
          settlement: { time: base + 82, order: 8 },
        }),
      )
      if (generatedPrompt.type !== "confirmation") return yield* Effect.die("Expected generated target confirmation")
      const generatedIdentityMismatch = yield* rawSealAttempt(
        db,
        generated,
        { time: base + 82, order: 8 },
        generatedPrompt.confirmation,
        (prepared) => {
          const operation = prepared.operations[0]
          if (!operation) return prepared
          const result = {
            ...operation.result,
            replacementTarget: {
              type: "new" as const,
              goalID: d2.goalID,
              revisionID: d2.revisionID,
              version: d2.version,
            },
          }
          const acknowledgement = LearnerGoal.renderAcknowledgement([result])
          return {
            ...prepared,
            operations: [{ ...operation, result }],
            acknowledgementTitle: acknowledgement.title,
            acknowledgementBody: acknowledgement.body,
          }
        },
      )
      expect(rawFailure(generatedIdentityMismatch)).toContain("learner_goal_commit_seal_command_target_invalid")
      expect(yield* goalCounts(db)).toEqual({ effects: 3, goals: 4, revisions: 6, receipts: 3, operations: 6 })
      expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
    }),
  )

  it.effect(
    "keeps pending acceptance process-local and revalidates Course admission without staling carried availability",
    () =>
      Effect.gen(function* () {
        const db = (yield* Database.Service).db
        const courses = yield* Course.Service
        const carriedCourse = yield* courses.createCourse({ title: "Operating systems" })
        const newCourse = yield* courses.createCourse({ title: "Distributed systems" })
        const sessionID = SessionSchema.ID.create()
        const base = Date.now() + 1_000
        yield* seedSession(db, sessionID, base)
        const initial = yield* settleDirect(
          db,
          sessionID,
          1,
          "/goal Pass operating systems as an active Goal for the Operating systems Course with no conditions and no target.",
          scopedGoal(carriedCourse.id, "Pass operating systems"),
          base + 1,
        )
        if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
          return yield* Effect.die("Expected acceptance Course fixture")
        }
        const head = initial.settlement.operations[0]!
        const accepted = { type: "accepted" as const }
        const lifecycle = yield* seedAcceptedInvocation(
          db,
          sessionID,
          2,
          "Please accept the complete achieved candidate.",
          {
            operations: [
              {
                type: "update",
                goalID: head.goalID,
                expectedHeadID: head.revisionID,
                expectedVersion: head.version,
                snapshot: {
                  outcome: head.meaning.outcome,
                  conditions: [],
                  scope: {
                    type: "courses",
                    courses: [
                      {
                        courseID: carriedCourse.id,
                        basis: { type: "carried", predecessorRevisionID: head.revisionID },
                      },
                    ],
                  },
                  target: { type: "absent" },
                  fieldBases: {
                    outcome: accepted,
                    conditions: accepted,
                    scope: accepted,
                    target: accepted,
                    disposition: accepted,
                  },
                },
                disposition: { type: "achieved" },
              },
            ],
          },
          base + 10,
        )
        yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, lifecycle))
        const lifecyclePrompt = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
            ...lifecycle,
            settlement: { time: base + 12, order: 2 },
          }),
        )
        if (lifecyclePrompt.type !== "confirmation") return yield* Effect.die("Expected lifecycle confirmation")
        expect(Object.isFrozen(lifecyclePrompt.confirmation)).toBe(true)
        expect(Object.isFrozen(lifecyclePrompt.confirmation.courseBases)).toBe(true)
        expect(Object.isFrozen(lifecyclePrompt.confirmation.courseBases[0]!.availability)).toBe(true)
        expect(
          Reflect.defineProperty(lifecyclePrompt.confirmation, "toJSON", {
            configurable: true,
            enumerable: true,
            value: () => lifecyclePrompt.confirmation,
          }),
        ).toBe(false)
        expect(lifecyclePrompt.confirmation.courseBases).toMatchObject([
          { courseID: carriedCourse.id, admission: { type: "carried" }, availability: { state: "available" } },
        ])
        expect(yield* invocationConfirmation(db, lifecycle.envelope.partID)).toEqual({
          status: "admitted",
          confirmation: null,
        })
        yield* courses.withdrawCourse({
          courseID: carriedCourse.id,
          expectedCourseVersion: 0,
          expectedSelectionVersion: 0,
        })
        expect(
          yield* db.all<{
            version: number
            title: string
            withdrawal_reason: string | null
          }>(sql`
            SELECT version, title, withdrawal_reason
            FROM course_state_history
            WHERE course_id = ${carriedCourse.id}
            ORDER BY version
          `),
        ).toEqual([
          { version: 0, title: "Operating systems", withdrawal_reason: null },
          { version: 1, title: "Operating systems", withdrawal_reason: "removed" },
        ])
        const forgedHistory = yield* Effect.exit(
          db.run(sql`
            INSERT OR REPLACE INTO course_state_history (
              course_id, version, title, withdrawal_reason, time_updated
            ) VALUES (${carriedCourse.id}, 0, 'Operating systems', 'removed', 0)
          `),
        )
        expect(forgedHistory._tag === "Failure" ? Cause.pretty(forgedHistory.cause) : "").toContain(
          "course_state_history_basis_invalid",
        )
        const mutatedHistory = yield* Effect.exit(
          db.run(sql`
            UPDATE course_state_history SET title = 'Forged title'
            WHERE course_id = ${carriedCourse.id} AND version = 0
          `),
        )
        expect(mutatedHistory._tag === "Failure" ? Cause.pretty(mutatedHistory.cause) : "").toContain(
          "course_state_history_immutable",
        )
        const deletedHistory = yield* Effect.exit(
          db.run(sql`
            DELETE FROM course_state_history WHERE course_id = ${carriedCourse.id} AND version = 0
          `),
        )
        expect(deletedHistory._tag === "Failure" ? Cause.pretty(deletedHistory.cause) : "").toContain(
          "course_state_history_delete_forbidden",
        )
        const courseBasis = lifecyclePrompt.confirmation.courseBases[0]!
        const forgedConfirmation: LearnerGoal.ConfirmationSnapshot = {
          ...lifecyclePrompt.confirmation,
          courseBases: [
            {
              ...courseBasis,
              availability: {
                state: "unavailable",
                cause: "course_withdrawn",
                title: courseBasis.courseTitle,
                courseVersion: 0,
                courseTimeUpdated: 0,
              },
            },
          ],
        }
        const forged = yield* Effect.exit(
          db.transaction((tx) =>
            HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
              ...lifecycle,
              permission: { type: "allow" },
              displayedConfirmation: forgedConfirmation,
              preparedConfirmation: lifecyclePrompt.preparedConfirmation,
              settlement: { time: base + 14, order: 2 },
            }),
          ),
        )
        expect(forged._tag).toBe("Failure")
        if (forged._tag === "Failure") {
          expect(Option.getOrUndefined(Cause.findErrorOption(forged.cause))).toMatchObject({
            _tag: "LearnerGoal.IntegrityError",
            detail: "learner_goal_prepared_confirmation_invalid",
          })
        }
        expect(yield* invocationConfirmation(db, lifecycle.envelope.partID)).toEqual({
          status: "admitted",
          confirmation: null,
        })
        const rawForged = yield* rawSealAttempt(
          db,
          lifecycle,
          { time: base + 14, order: 2 },
          forgedConfirmation,
          (prepared) => prepared,
        )
        expect(rawFailure(rawForged)).toContain("learner_goal_confirmation_course_basis_invalid")
        expect(yield* invocationConfirmation(db, lifecycle.envelope.partID)).toEqual({
          status: "admitted",
          confirmation: null,
        })
        const withdrawnHistory = yield* db.get<{
          title: string
          version: number
          time_updated: number
        }>(sql`
          SELECT title, version, time_updated
          FROM course_state_history
          WHERE course_id = ${carriedCourse.id} AND version = 1
        `)
        if (!withdrawnHistory) return yield* Effect.die("Expected withdrawn Course history")
        const acceptedSnapshot = JSON.stringify(lifecyclePrompt.confirmation)
        const aliasedConfirmation = JSON.parse(acceptedSnapshot) as LearnerGoal.ConfirmationSnapshot & {
          toJSON?: () => unknown
        }
        Object.defineProperty(aliasedConfirmation, "toJSON", {
          configurable: true,
          enumerable: true,
          value: () => {
            Reflect.deleteProperty(aliasedConfirmation, "toJSON")
            Object.defineProperty(aliasedConfirmation.courseBases[0]!, "availability", {
              configurable: true,
              enumerable: true,
              writable: true,
              value: {
                state: "unavailable",
                cause: "course_withdrawn",
                title: withdrawnHistory.title,
                courseVersion: withdrawnHistory.version,
                courseTimeUpdated: withdrawnHistory.time_updated,
              },
            })
            return JSON.parse(acceptedSnapshot)
          },
        })
        const carried = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
            ...lifecycle,
            permission: { type: "allow" },
            displayedConfirmation: aliasedConfirmation,
            preparedConfirmation: lifecyclePrompt.preparedConfirmation,
            settlement: { time: base + 14, order: 2 },
          }),
        )
        expect(carried).toMatchObject({
          type: "settled",
          settlement: { outcome: "applied", operations: [{ disposition: "achieved" }] },
        })
        expect(aliasedConfirmation.courseBases[0]!.availability).toEqual({
          state: "unavailable",
          cause: "course_withdrawn",
          title: withdrawnHistory.title,
          courseVersion: withdrawnHistory.version,
          courseTimeUpdated: withdrawnHistory.time_updated,
        })
        expect(yield* invocationConfirmation(db, lifecycle.envelope.partID)).toEqual({
          status: "applied",
          confirmation: lifecyclePrompt.confirmation,
        })
        expect(
          yield* db
            .select({ confirmation: LearnerGoalCommandTable.confirmation_snapshot })
            .from(LearnerGoalCommandTable)
            .where(eq(LearnerGoalCommandTable.invocation_part_id, lifecycle.envelope.partID))
            .get(),
        ).toEqual({ confirmation: lifecyclePrompt.confirmation })

        const newBinding = yield* seedAcceptedInvocation(
          db,
          sessionID,
          3,
          "Please accept the complete scoped candidate.",
          {
            operations: [
              {
                type: "create",
                snapshot: {
                  outcome: "Pass distributed systems",
                  conditions: [],
                  scope: {
                    type: "courses",
                    courses: [{ courseID: newCourse.id, basis: { type: "new", expectedCourseVersion: 0 } }],
                  },
                  target: { type: "absent" },
                  fieldBases: {
                    outcome: accepted,
                    conditions: accepted,
                    scope: accepted,
                    target: accepted,
                    disposition: accepted,
                  },
                },
                disposition: "active",
              },
            ],
          },
          base + 20,
        )
        yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, newBinding))
        const bindingPrompt = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
            ...newBinding,
            settlement: { time: base + 22, order: 3 },
          }),
        )
        if (bindingPrompt.type !== "confirmation") return yield* Effect.die("Expected new-binding confirmation")
        expect(yield* invocationConfirmation(db, newBinding.envelope.partID)).toEqual({
          status: "admitted",
          confirmation: null,
        })
        yield* courses.withdrawCourse({
          courseID: newCourse.id,
          expectedCourseVersion: 0,
          expectedSelectionVersion: 0,
        })
        const inactive = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
            ...newBinding,
            permission: { type: "allow" },
            displayedConfirmation: bindingPrompt.confirmation,
            preparedConfirmation: bindingPrompt.preparedConfirmation,
            settlement: { time: base + 24, order: 3 },
          }),
        )
        expect(settlementCode(inactive)).toBe("inactive")
        expect(yield* invocationConfirmation(db, newBinding.envelope.partID)).toEqual({
          status: "error",
          confirmation: null,
        })

        const rejected = yield* seedAcceptedInvocation(
          db,
          sessionID,
          4,
          "Please accept the complete rejected candidate.",
          { operations: [{ type: "create", snapshot: acceptedHomeSnapshot("Rejected Goal"), disposition: "active" }] },
          base + 30,
        )
        yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, rejected))
        const rejectedPrompt = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
            ...rejected,
            settlement: { time: base + 32, order: 4 },
          }),
        )
        if (rejectedPrompt.type !== "confirmation") return yield* Effect.die("Expected rejected confirmation")
        const denied = yield* db.transaction((tx) =>
          HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
            ...rejected,
            permission: { type: "deny" },
            displayedConfirmation: rejectedPrompt.confirmation,
            preparedConfirmation: rejectedPrompt.preparedConfirmation,
            settlement: { time: base + 34, order: 4 },
          }),
        )
        expect(settlementCode(denied)).toBe("permission_rejected")
        expect(yield* invocationConfirmation(db, rejected.envelope.partID)).toEqual({
          status: "error",
          confirmation: null,
        })
        expect(yield* goalCounts(db)).toEqual({ effects: 2, goals: 1, revisions: 2, receipts: 2, operations: 2 })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
  )

  it.effect("keeps stored Course membership labels separate from later availability titles", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Original systems title" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const create = scopedGoal(course.id, "Pass renamed systems").operations[0]!
      const initial = yield* settleDirect(
        db,
        sessionID,
        1,
        "/goal Pass renamed systems as an active Goal for the Original systems title Course with no conditions and no target.",
        {
          operations: [
            {
              ...create,
              snapshot: {
                ...create.snapshot,
                fieldBases: {
                  ...create.snapshot.fieldBases,
                  scope: { type: "authored", sourceExcerpt: "Original systems title Course" },
                },
              },
            },
          ],
        },
        base + 1,
      )
      if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
        return yield* Effect.die(`Expected renamed-Course source Goal: ${JSON.stringify(initial)}`)
      }
      const head = initial.settlement.operations[0]!
      yield* courses.correctCourse({
        courseID: course.id,
        expectedCourseVersion: 0,
        title: "Corrected systems title",
      })
      yield* courses.withdrawCourse({
        courseID: course.id,
        expectedCourseVersion: 1,
        expectedSelectionVersion: 0,
      })
      const accepted = { type: "accepted" as const }
      const update = yield* seedAcceptedInvocation(
        db,
        sessionID,
        2,
        "Please accept the complete achieved Goal candidate.",
        {
          operations: [
            {
              type: "update",
              goalID: head.goalID,
              expectedHeadID: head.revisionID,
              expectedVersion: head.version,
              snapshot: {
                outcome: head.meaning.outcome,
                conditions: head.meaning.conditions,
                scope: {
                  type: "courses",
                  courses: [
                    {
                      courseID: course.id,
                      basis: { type: "carried", predecessorRevisionID: head.revisionID },
                    },
                  ],
                },
                target: head.meaning.target,
                fieldBases: {
                  outcome: accepted,
                  conditions: accepted,
                  scope: accepted,
                  target: accepted,
                  disposition: accepted,
                },
              },
              disposition: { type: "achieved" },
            },
          ],
        },
        base + 10,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, update))
      const prompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...update,
          settlement: { time: base + 12, order: 2 },
        }),
      )
      if (prompt.type !== "confirmation") return yield* Effect.die("Expected renamed-Course confirmation")
      expect(prompt.confirmation.courseBases).toEqual([
        {
          operationOrdinal: 0,
          revisionRole: "source",
          courseID: course.id,
          courseTitle: "Original systems title",
          admission: { type: "carried", predecessorRevisionID: head.revisionID },
          availability: {
            state: "unavailable",
            cause: "course_withdrawn",
            title: "Corrected systems title",
            courseVersion: 2,
            courseTimeUpdated: expect.any(Number),
          },
        },
      ])
      const applied = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...update,
          permission: { type: "allow" },
          displayedConfirmation: prompt.confirmation,
          preparedConfirmation: prompt.preparedConfirmation,
          settlement: { time: base + 14, order: 2 },
        }),
      )
      expect(applied).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", operations: [{ disposition: "achieved" }] },
      })
    }),
  )

  it.effect("binds source-temporal target interpretation and isolates unavailable temporal context", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      const sourceInstant = Date.parse("2026-07-21T08:00:00+08:00")
      yield* seedSession(db, sessionID, sourceInstant)
      const accepted = { type: "accepted" as const }
      const command: LearnerGoal.Command = {
        operations: [
          {
            type: "create",
            snapshot: {
              outcome: "Finish temporal checkpoint",
              conditions: [],
              scope: { type: "learner_home" },
              target: {
                type: "local_date",
                date: "2026-07-22",
                timeZone: "Asia/Shanghai",
                sourceExpression: "tomorrow",
                normalizationBasis: "source_temporal_context",
              },
              fieldBases: {
                outcome: accepted,
                conditions: accepted,
                scope: accepted,
                target: accepted,
                disposition: accepted,
              },
            },
            disposition: "active",
          },
        ],
      }
      const resolved = yield* seedAcceptedInvocation(
        db,
        sessionID,
        1,
        "Please accept tomorrow's temporal Goal.",
        command,
        sourceInstant + 1,
        { timeZone: "Asia/Shanghai" },
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, resolved))
      const prompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...resolved,
          settlement: { time: sourceInstant + 3, order: 1 },
        }),
      )
      if (prompt.type !== "confirmation") return yield* Effect.die("Expected source-temporal confirmation")
      const applied = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...resolved,
          permission: { type: "allow" },
          displayedConfirmation: prompt.confirmation,
          preparedConfirmation: prompt.preparedConfirmation,
          settlement: { time: sourceInstant + 4, order: 1 },
        }),
      )
      expect(applied).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          operations: [{ meaning: { target: { timeZone: "Asia/Shanghai", date: "2026-07-22" } } }],
        },
      })
      if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected applied source-temporal Goal")
      }
      const temporalGoalID = applied.settlement.operations[0]!.goalID
      const beforeReads = yield* goalReadState(db)
      const relations = yield* Effect.forEach(
        [
          Date.parse("2026-07-21T12:00:00+08:00"),
          Date.parse("2026-07-22T12:00:00+08:00"),
          Date.parse("2026-07-23T12:00:00+08:00"),
        ],
        (asOf) => db.transaction((tx) => LearnerGoal.readCurrent(tx, temporalGoalID, asOf)),
      )
      expect(relations.map((current) => current?.head.targetRelation)).toEqual(["before", "on", "after"])
      expect(yield* goalReadState(db)).toEqual(beforeReads)

      const unavailable = yield* seedAcceptedInvocation(
        db,
        sessionID,
        2,
        "Please accept the same temporal Goal without a timezone.",
        command,
        sourceInstant + 10,
        { timeZone: null },
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, unavailable))
      const unavailableResult = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...unavailable,
          settlement: { time: sourceInstant + 12, order: 2 },
        }),
      )
      expect(unavailableResult).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "temporal_context_unavailable" },
      })
      expect(yield* invocationConfirmation(db, unavailable.envelope.partID)).toEqual({
        status: "error",
        confirmation: null,
      })

      const targetFree = yield* settleDirect(
        db,
        sessionID,
        3,
        "/goal Target-free recovery as an active LearnerHome goal with no conditions and no target.",
        createHomeGoal("Target-free recovery"),
        sourceInstant + 20,
      )
      expect(targetFree).toMatchObject({ type: "settled", settlement: { outcome: "applied" } })
      expect(yield* goalCounts(db)).toEqual({ effects: 2, goals: 2, revisions: 2, receipts: 2, operations: 2 })
    }),
  )

  it.effect("preserves an exact withdrawn Course membership through explicit lifecycle correction", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const course = yield* courses.createCourse({ title: "Operating systems" })
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const created = scopedGoal(course.id, "Pass operating systems")
      const initial = yield* seedInvocation(
        db,
        sessionID,
        2,
        "/goal Pass operating systems as an active Goal for the Operating systems Course with no conditions and no target.",
        created,
        base + 1,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, initial))
      const first = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...initial,
          permission: { type: "allow" },
          settlement: { time: base + 3, order: 2 },
        }),
      )
      if (first.type !== "settled" || first.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected scoped Goal creation")
      }
      const firstResult = first.settlement.operations[0]!
      yield* courses.withdrawCourse({ courseID: course.id, expectedCourseVersion: 0, expectedSelectionVersion: 0 })

      const achieved: LearnerGoal.Command = {
        operations: [
          {
            type: "update",
            goalID: firstResult.goalID,
            expectedHeadID: firstResult.revisionID,
            expectedVersion: firstResult.version,
            snapshot: {
              outcome: firstResult.meaning.outcome,
              conditions: [],
              scope: {
                type: "courses",
                courses: [
                  {
                    courseID: course.id,
                    basis: { type: "carried", predecessorRevisionID: firstResult.revisionID },
                  },
                ],
              },
              target: { type: "absent" },
              fieldBases: {
                outcome: { type: "carried", predecessorRevisionID: firstResult.revisionID },
                conditions: { type: "carried", predecessorRevisionID: firstResult.revisionID },
                scope: { type: "carried", predecessorRevisionID: firstResult.revisionID },
                target: { type: "carried", predecessorRevisionID: firstResult.revisionID },
                disposition: {
                  type: "authored",
                  sourceExcerpt: `Goal ${firstResult.goalID} is achieved`,
                },
              },
            },
            disposition: { type: "achieved" },
          },
        ],
      }
      const correction = yield* seedInvocation(
        db,
        sessionID,
        3,
        `Goal ${firstResult.goalID} is achieved; keep its exact Course scope, conditions, and target.`,
        achieved,
        base + 4,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, correction))
      const second = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...correction,
          permission: { type: "allow" },
          settlement: { time: base + 6, order: 3 },
        }),
      )
      expect(second).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", operations: [{ disposition: "achieved" }] },
      })
      expect(yield* db.transaction((tx) => LearnerGoal.readCurrent(tx, firstResult.goalID, base + 7))).toMatchObject({
        head: {
          disposition: { type: "achieved" },
          scope: {
            type: "courses",
            courses: [
              {
                courseID: course.id,
                admission: { type: "carried", predecessorRevisionID: firstResult.revisionID },
                availability: { state: "unavailable", cause: "course_withdrawn" },
              },
            ],
          },
        },
      })
    }),
  )
})

test.skip("historical V1 exact instant offset and target survive database reopen", async () => {
  await using tmp = await tmpdir()
  const filename = path.join(tmp.path, "learner-goal-reopen.sqlite")
  const firstLayer = LayerNode.compile(LayerNode.group([Course.node, Database.node]), [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
  const written = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const sessionID = SessionSchema.ID.create()
      const base = Date.now() + 1_000
      yield* seedSession(db, sessionID, base)
      const normalized = "2026-12-20T12:00:00+08:00"
      const badOffset = yield* settleDirect(
        db,
        sessionID,
        1,
        `Create a durable Goal: Reach checkpoint by ${normalized} as an active LearnerHome goal with no conditions.`,
        {
          operations: [
            { type: "create", snapshot: instantSnapshot("Reach checkpoint", normalized, 0), disposition: "active" },
          ],
        },
        base + 1,
      )
      const contradictoryZone = yield* settleDirect(
        db,
        sessionID,
        2,
        `Create a durable Goal: Reach another checkpoint by ${normalized} as an active LearnerHome goal with no conditions.`,
        {
          operations: [
            {
              type: "create",
              snapshot: {
                ...instantSnapshot("Reach another checkpoint", normalized, 480),
                target: {
                  ...instantSnapshot("Reach another checkpoint", normalized, 480).target,
                  timeZone: "UTC",
                } as LearnerGoal.Target,
              },
              disposition: "active",
            },
          ],
        },
        base + 10,
      )
      expect([badOffset, contradictoryZone].map(settlementCode)).toEqual(["validation_error", "validation_error"])

      const applied = yield* settleDirect(
        db,
        sessionID,
        3,
        `Create a durable Goal: Reach final checkpoint by ${normalized} as an active LearnerHome goal with no conditions.`,
        {
          operations: [
            {
              type: "create",
              snapshot: instantSnapshot("Reach final checkpoint", normalized, 480),
              disposition: "active",
            },
          ],
        },
        base + 20,
      )
      if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected exact instant Goal")
      }
      const goalID = applied.settlement.operations[0]!.goalID
      const target = applied.settlement.operations[0]!.meaning.target
      if (target.type !== "instant") return yield* Effect.die("Expected stored instant target")
      const local = yield* seedAcceptedInvocation(
        db,
        sessionID,
        4,
        "Please accept the exact 2026-12-20 local-date Goal in Asia/Kolkata.",
        {
          operations: [
            {
              type: "create",
              snapshot: {
                ...acceptedHomeSnapshot("Reach Kolkata checkpoint"),
                target: {
                  type: "local_date",
                  date: "2026-12-20",
                  timeZone: "Asia/Kolkata",
                  sourceExpression: "2026-12-20",
                  normalizationBasis: "explicit_date",
                },
              },
              disposition: "active",
            },
          ],
        },
        base + 30,
      )
      yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, local))
      const prompt = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.prepareLearnerGoalConfirmation(tx, {
          ...local,
          settlement: { time: base + 32, order: 4 },
        }),
      )
      if (prompt.type !== "confirmation") return yield* Effect.die("Expected exact local-date confirmation")
      const localApplied = yield* db.transaction((tx) =>
        HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
          ...local,
          permission: { type: "allow" },
          displayedConfirmation: prompt.confirmation,
          preparedConfirmation: prompt.preparedConfirmation,
          settlement: { time: base + 34, order: 4 },
        }),
      )
      if (localApplied.type !== "settled" || localApplied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected exact local-date Goal")
      }
      const localGoalID = localApplied.settlement.operations[0]!.goalID
      const beforeReads = yield* goalReadState(db)
      const relations = yield* Effect.forEach([target.instant - 1, target.instant, target.instant + 1], (asOf) =>
        db.transaction((tx) => LearnerGoal.readCurrent(tx, goalID, asOf)),
      )
      expect(relations.map((current) => current?.head.targetRelation)).toEqual(["before", "reached", "after"])
      const localRelations = yield* Effect.forEach(
        [Date.parse("2026-12-19T18:29:59Z"), Date.parse("2026-12-19T18:30:00Z"), Date.parse("2026-12-20T18:30:00Z")],
        (asOf) => db.transaction((tx) => LearnerGoal.readCurrent(tx, localGoalID, asOf)),
      )
      expect(localRelations.map((current) => current?.head.targetRelation)).toEqual(["before", "on", "after"])
      expect(yield* goalReadState(db)).toEqual(beforeReads)
      return {
        goalID,
        localGoalID,
        target,
        state: beforeReads,
      }
    }).pipe(Effect.provide(firstLayer), Effect.scoped),
  )

  const secondLayer = LayerNode.compile(LayerNode.group([Course.node, Database.node]), [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
  await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      expect(yield* goalReadState(db)).toEqual(written.state)
      const relations = yield* Effect.forEach(
        [written.target.instant - 1, written.target.instant, written.target.instant + 1],
        (asOf) => db.transaction((tx) => LearnerGoal.readCurrent(tx, written.goalID, asOf)),
      )
      expect(relations.map((current) => current?.head.targetRelation)).toEqual(["before", "reached", "after"])
      const current = relations[1]
      expect(current?.head.target).toEqual(written.target)
      expect(current?.head.target).toEqual({
        type: "instant",
        instant: Date.parse("2026-12-20T12:00:00+08:00"),
        sourceExpression: "2026-12-20T12:00:00+08:00",
        normalized: "2026-12-20T12:00:00+08:00",
        utcOffsetMinutes: 480,
        normalizationBasis: "explicit_offset",
      })
      const localRelations = yield* Effect.forEach(
        [Date.parse("2026-12-19T18:29:59Z"), Date.parse("2026-12-19T18:30:00Z"), Date.parse("2026-12-20T18:30:00Z")],
        (asOf) => db.transaction((tx) => LearnerGoal.readCurrent(tx, written.localGoalID, asOf)),
      )
      expect(localRelations.map((item) => item?.head.targetRelation)).toEqual(["before", "on", "after"])
      expect(localRelations[1]?.head.target).toEqual({
        type: "local_date",
        date: "2026-12-20",
        timeZone: "Asia/Kolkata",
        sourceExpression: "2026-12-20",
        normalizationBasis: "explicit_date",
      })
      expect(
        yield* db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM learner_goal_time_zone WHERE release_id = 'iana-tzdb-2026c'
        `),
      ).toEqual({ count: 598 })
      expect(yield* goalReadState(db)).toEqual(written.state)
    }).pipe(Effect.provide(secondLayer), Effect.scoped),
  )
})

test.skip("historical V1 Goal transaction boundaries roll failed change sets back", async () => {
  for (const [name, boundary] of goalFaults) {
    const layer = LayerNode.compile(LayerNode.group([Course.node, Database.node]), [
      [Database.node, Database.layerFromPath(":memory:").pipe(Layer.orDie)],
    ])
    await Effect.runPromise(
      Effect.gen(function* () {
        const db = (yield* Database.Service).db
        const courses = yield* Course.Service
        const course = yield* courses.createCourse({ title: "Failure Course" })
        const sessionID = SessionSchema.ID.create()
        const base = Date.now() + 1_000
        yield* seedSession(db, sessionID, base)
        const initial = yield* settleDirect(
          db,
          sessionID,
          1,
          "/goal Failure source as an active LearnerHome goal with no conditions and no target.",
          createHomeGoal("Failure source"),
          base + 1,
        )
        if (initial.type !== "settled" || initial.settlement.outcome !== "applied") {
          return yield* Effect.die(`Expected fault fixture for ${name}`)
        }
        const source = initial.settlement.operations[0]!
        const relation = `replace ${source.goalID} with a new goal`
        const invocation = yield* seedInvocation(
          db,
          sessionID,
          2,
          `${relation}; Replacement Goal is active for Failure Course with condition finish lab and no target.`,
          {
            operations: [
              {
                type: "replace",
                goalID: source.goalID,
                expectedHeadID: source.revisionID,
                expectedVersion: source.version,
                snapshot: {
                  ...carriedHome(source),
                  fieldBases: {
                    ...carriedHome(source).fieldBases,
                    disposition: { type: "authored", sourceExcerpt: relation },
                  },
                },
                target: {
                  type: "new",
                  snapshot: {
                    outcome: "Replacement Goal",
                    conditions: ["finish lab"],
                    scope: {
                      type: "courses",
                      courses: [{ courseID: course.id, basis: { type: "new", expectedCourseVersion: 0 } }],
                    },
                    target: { type: "absent" },
                    fieldBases: {
                      outcome: { type: "authored", sourceExcerpt: "Replacement Goal" },
                      conditions: { type: "authored", sourceExcerpt: "finish lab" },
                      scope: { type: "authored", sourceExcerpt: "Failure Course" },
                      target: { type: "authored", sourceExcerpt: "no target" },
                      disposition: { type: "authored", sourceExcerpt: "active" },
                    },
                  },
                  disposition: "active",
                },
              },
            ],
          },
          base + 10,
        )
        yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, invocation))
        const before = yield* goalAtomicState(db)
        yield* db.run(
          `CREATE TEMP TRIGGER inject_goal_${name} ${boundary} BEGIN SELECT RAISE(ABORT, 'injected_${name}'); END`,
        )
        const failed = yield* Effect.exit(
          db.transaction((tx) =>
            HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
              ...invocation,
              permission: { type: "allow" },
              settlement: { time: base + 12, order: 2 },
            }),
          ),
        )
        expect(failed._tag).toBe("Failure")
        expect(yield* goalAtomicState(db)).toEqual(before)
        expect(yield* invocationConfirmation(db, invocation.envelope.partID)).toEqual({
          status: "admitted",
          confirmation: null,
        })
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }).pipe(Effect.provide(layer), Effect.scoped),
    )
  }
})

function createHomeGoal(outcome: string): LearnerGoal.Command {
  return {
    operations: [homeCreate(outcome)],
  }
}

function homeCreate(outcome: string): LearnerGoal.CreateOperation {
  return { type: "create", snapshot: homeSnapshot(outcome), disposition: "active" }
}

function homeSnapshot(outcome: string): LearnerGoal.SemanticSnapshot {
  return {
    outcome,
    conditions: [],
    scope: { type: "learner_home" },
    target: { type: "absent" },
    fieldBases: {
      outcome: { type: "authored", sourceExcerpt: outcome },
      conditions: { type: "authored", sourceExcerpt: "no conditions" },
      scope: { type: "authored", sourceExcerpt: "LearnerHome goal" },
      target: { type: "authored", sourceExcerpt: "no target" },
      disposition: { type: "authored", sourceExcerpt: "active" },
    },
  }
}

function claimedHomeSnapshot(outcome: string, sourceExcerpt: string): LearnerGoal.SemanticSnapshot {
  return {
    outcome,
    conditions: [],
    scope: { type: "learner_home" },
    target: { type: "absent" },
    fieldBases: {
      outcome: { type: "authored", sourceExcerpt: outcome },
      conditions: { type: "authored", sourceExcerpt },
      scope: { type: "authored", sourceExcerpt },
      target: { type: "authored", sourceExcerpt },
      disposition: { type: "authored", sourceExcerpt },
    },
  }
}

function authoredReferentUpdate(
  head: LearnerGoal.OperationResult,
  courseID: Course.CourseID,
  condition: string,
  target: LearnerGoal.Target,
  scopeExcerpt: string,
  targetExcerpt: string,
): LearnerGoal.UpdateOperation {
  const carried = { type: "carried" as const, predecessorRevisionID: head.revisionID }
  return {
    type: "update",
    goalID: head.goalID,
    expectedHeadID: head.revisionID,
    expectedVersion: head.version,
    snapshot: {
      outcome: "Pass Exam B",
      conditions: [condition],
      scope: { type: "courses", courses: [{ courseID, basis: carried }] },
      target,
      fieldBases: {
        outcome: { type: "authored", sourceExcerpt: "Pass Exam B" },
        conditions: { type: "authored", sourceExcerpt: condition },
        scope: { type: "authored", sourceExcerpt: scopeExcerpt },
        target: { type: "authored", sourceExcerpt: targetExcerpt },
        disposition: carried,
      },
    },
    disposition: { type: "active" },
  }
}

function instantSnapshot(outcome: string, normalized: string, utcOffsetMinutes: number): LearnerGoal.SemanticSnapshot {
  return {
    outcome,
    conditions: [],
    scope: { type: "learner_home" },
    target: {
      type: "instant",
      instant: Date.parse(normalized),
      sourceExpression: normalized,
      normalized,
      utcOffsetMinutes,
      normalizationBasis: "explicit_offset",
    },
    fieldBases: {
      outcome: { type: "authored", sourceExcerpt: outcome },
      conditions: { type: "authored", sourceExcerpt: "no conditions" },
      scope: { type: "authored", sourceExcerpt: "LearnerHome goal" },
      target: { type: "authored", sourceExcerpt: normalized },
      disposition: { type: "authored", sourceExcerpt: "active" },
    },
  }
}

function carriedHome(result: LearnerGoal.OperationResult): LearnerGoal.SemanticSnapshot {
  const carried = { type: "carried" as const, predecessorRevisionID: result.revisionID }
  return {
    outcome: result.meaning.outcome,
    conditions: result.meaning.conditions,
    scope: { type: "learner_home" },
    target: result.meaning.target,
    fieldBases: { outcome: carried, conditions: carried, scope: carried, target: carried, disposition: carried },
  }
}

function replacementOperation(
  source: LearnerGoal.OperationResult,
  target: LearnerGoal.OperationResult,
  excerpt: string,
): LearnerGoal.ReplaceOperation {
  return {
    type: "replace",
    goalID: source.goalID,
    expectedHeadID: source.revisionID,
    expectedVersion: source.version,
    snapshot: {
      ...carriedHome(source),
      fieldBases: {
        ...carriedHome(source).fieldBases,
        disposition: { type: "authored", sourceExcerpt: excerpt },
      },
    },
    target: {
      type: "existing",
      goalID: target.goalID,
      revisionID: target.revisionID,
      version: target.version,
    },
  }
}

function retargetPreparedReplacement(
  prepared: LearnerGoal.PreparedChangeSet,
  target: LearnerGoal.OperationResult,
): LearnerGoal.PreparedChangeSet {
  const operation = prepared.operations[0]
  const source = operation?.revisions.find((revision) => revision.revisionRole === "source")
  if (!operation || !source) return prepared
  const replacementTarget = {
    type: "existing" as const,
    goalID: target.goalID,
    revisionID: target.revisionID,
    version: target.version,
  }
  const result = { ...operation.result, replacementTarget }
  const acknowledgement = LearnerGoal.renderAcknowledgement([result])
  return {
    ...prepared,
    operations: [
      {
        ...operation,
        result,
        revisions: operation.revisions.map((revision) =>
          revision.id === source.id
            ? {
                ...revision,
                disposition: {
                  type: "superseded" as const,
                  targetGoalID: target.goalID,
                  targetRevisionID: target.revisionID,
                },
              }
            : revision,
        ),
      },
    ],
    acknowledgementTitle: acknowledgement.title,
    acknowledgementBody: acknowledgement.body,
  }
}

function settleDirect(
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
  index: number,
  source: string,
  command: LearnerGoal.Command,
  time: number,
) {
  return Effect.gen(function* () {
    const invocation = yield* seedInvocation(db, sessionID, index, source, command, time)
    yield* db.transaction((tx) => HistoricalLearnerGoalV1.reserveLearnerGoals(tx, invocation))
    return yield* db.transaction((tx) =>
      HistoricalLearnerGoalV1.settleLearnerGoals(tx, {
        ...invocation,
        permission: { type: "allow" },
        settlement: { time: time + 2, order: index },
      }),
    )
  }).pipe(Effect.orDie)
}

function acceptedHomeSnapshot(outcome: string): LearnerGoal.SemanticSnapshot {
  const accepted = { type: "accepted" as const }
  return {
    outcome,
    conditions: [],
    scope: { type: "learner_home" },
    target: { type: "absent" },
    fieldBases: { outcome: accepted, conditions: accepted, scope: accepted, target: accepted, disposition: accepted },
  }
}

function seedAcceptedInvocation(
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
  index: number,
  source: string,
  command: LearnerGoal.Command,
  time: number,
  temporal?: { readonly timeZone: string | null },
) {
  return Effect.gen(function* () {
    const direct = yield* seedInvocation(db, sessionID, index, source, command, time, temporal)
    return {
      ...direct,
      envelope: { ...direct.envelope, authorizationBasis: "learner_acceptance" as const },
      permissionRequestID: PermissionV1.ID.ascending(),
    } satisfies LearnerGoal.AcceptedInvocation
  })
}

function rawSealAttempt(
  db: Database.Interface["db"],
  invocation: LearnerGoal.Invocation,
  settlement: { readonly time: number; readonly order: number },
  confirmation: LearnerGoal.ConfirmationSnapshot | undefined,
  mutate: (prepared: LearnerGoal.PreparedChangeSet) => LearnerGoal.PreparedChangeSet,
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const prepared = yield* LearnerGoal.prepareChangeSet(tx, { ...invocation, settlement })
        if (prepared.type !== "change_set") return yield* Effect.die("Expected raw Goal change set")
        const value = mutate(prepared.value)
        const effect = yield* LearnerGoal.applyChangeSet(tx, value)
        const receiptID = LearningCommand.createReceiptID()
        const terminal = {
          outcome: "applied" as const,
          goalKind: "learner_goal" as const,
          receiptID,
          effectID: effect.id,
          authorizationBasis: effect.authorizationBasis,
          ...(confirmation && "permissionRequestID" in invocation
            ? { confirmationRequestID: invocation.permissionRequestID }
            : {}),
          operations: effect.operations,
          acknowledgementTitle: effect.acknowledgementTitle,
          acknowledgementBody: effect.acknowledgementBody,
          frontierSequence: effect.frontierSequence,
          settlementTime: settlement.time,
          settlementOrder: settlement.order,
        }
        yield* tx
          .insert(LearningCommandReceiptTable)
          .values({
            id: receiptID,
            occurrence_id: invocation.envelope.occurrenceID,
            origin_session_id: invocation.envelope.sessionID,
            origin_message_id: invocation.envelope.parentUserMessageID,
            assistant_message_id: invocation.envelope.assistantMessageID,
            invocation_part_id: invocation.envelope.partID,
            capability_identity: invocation.envelope.capabilityIdentity,
            capability_version: invocation.envelope.capabilityVersion,
            authorization_basis: invocation.envelope.authorizationBasis,
            time_committed: settlement.time,
            commit_order: settlement.order,
          })
          .run()
        if (confirmation) {
          yield* tx
            .update(LearnerGoalCommandTable)
            .set({ confirmation_snapshot: confirmation })
            .where(eq(LearnerGoalCommandTable.invocation_part_id, invocation.envelope.partID))
            .run()
        }
        yield* LearnerGoal.sealEffect(tx, {
          effect,
          receiptID,
          invocationPartID: invocation.envelope.partID,
          expectedRevisionSequence: value.revisionSequenceBefore,
        })
        yield* tx
          .update(LearningCommandInvocationTable)
          .set({
            status: "applied",
            receipt_id: receiptID,
            settlement: terminal,
            time_settled: settlement.time,
            settlement_order: settlement.order,
          })
          .where(eq(LearningCommandInvocationTable.part_id, invocation.envelope.partID))
          .run()
      }),
    )
    .pipe(Effect.exit)
}

function rawFailure(exit: Effect.Success<ReturnType<typeof rawSealAttempt>>) {
  return exit._tag === "Failure" ? Cause.pretty(exit.cause) : "raw construction unexpectedly succeeded"
}

function settlementCode(result: Effect.Success<ReturnType<typeof settleDirect>>) {
  return result.type === "settled" && result.settlement.outcome === "error" ? result.settlement.code : undefined
}

function invocationConfirmation(db: Database.Interface["db"], partID: SessionV1.PartID) {
  return db
    .select({
      status: LearningCommandInvocationTable.status,
      confirmation: LearnerGoalCommandTable.confirmation_snapshot,
    })
    .from(LearningCommandInvocationTable)
    .innerJoin(
      LearnerGoalCommandTable,
      eq(LearnerGoalCommandTable.invocation_part_id, LearningCommandInvocationTable.part_id),
    )
    .where(eq(LearningCommandInvocationTable.part_id, partID))
    .get()
}

function goalCounts(db: Database.Interface["db"]) {
  return Effect.all({
    effects: db
      .get<{ count: number }>(sql`SELECT count(*) AS count FROM learner_goal_effect`)
      .pipe(Effect.map((row) => row!.count)),
    goals: db
      .get<{ count: number }>(sql`SELECT count(*) AS count FROM learner_goal`)
      .pipe(Effect.map((row) => row!.count)),
    revisions: db
      .get<{ count: number }>(sql`SELECT count(*) AS count FROM learner_goal_revision`)
      .pipe(Effect.map((row) => row!.count)),
    receipts: db
      .get<{
        count: number
      }>(sql`SELECT count(*) AS count FROM learner_goal_commit_seal`)
      .pipe(Effect.map((row) => row!.count)),
    operations: db
      .get<{ count: number }>(sql`SELECT count(*) AS count FROM learner_goal_effect_operation`)
      .pipe(Effect.map((row) => row!.count)),
  }).pipe(Effect.orDie)
}

function goalReadState(db: Database.Interface["db"]) {
  return Effect.all({
    effects: db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`),
    revisions: db.get(sql`SELECT count(*) AS count FROM learner_goal_revision`),
    receipts: db.get(sql`SELECT count(*) AS count FROM learner_goal_commit_seal`),
    seals: db.get(sql`SELECT count(*) AS count FROM learner_goal_commit_seal`),
    frontier: db.get(sql`SELECT sequence, time_committed FROM learning_shared_frontier WHERE singleton = 1`),
    goalState: db.get(sql`SELECT revision_sequence FROM learner_goal_state WHERE singleton = 1`),
  }).pipe(Effect.orDie)
}

function goalAtomicState(db: Database.Interface["db"]) {
  return db
    .get(
      sql`
    SELECT
      (SELECT count(*) FROM learner_goal_effect) AS effects,
      (SELECT count(*) FROM learner_goal) AS goals,
      (SELECT count(*) FROM learner_goal_revision) AS revisions,
      (SELECT count(*) FROM learner_goal_condition) AS conditions,
      (SELECT count(*) FROM learner_goal_course_scope) AS course_scopes,
      (SELECT count(*) FROM learner_goal_field_basis) AS field_bases,
      (SELECT count(*) FROM learner_goal_supersession) AS supersessions,
      (SELECT count(*) FROM learner_goal_effect_operation) AS operations,
      (SELECT count(*) FROM learner_goal_commit_seal) AS receipts,
      (SELECT count(*) FROM learner_goal_commit_seal) AS seals,
      (SELECT sequence FROM learning_shared_frontier WHERE singleton = 1) AS frontier_sequence,
      (SELECT revision_sequence FROM learner_goal_state WHERE singleton = 1) AS revision_sequence
  `,
    )
    .pipe(Effect.orDie)
}

function scopedGoal(courseID: Course.CourseID, outcome: string): LearnerGoal.Command {
  return {
    operations: [
      {
        type: "create",
        snapshot: {
          outcome,
          conditions: [],
          scope: { type: "courses", courses: [{ courseID, basis: { type: "new", expectedCourseVersion: 0 } }] },
          target: { type: "absent" },
          fieldBases: {
            outcome: { type: "authored", sourceExcerpt: outcome },
            conditions: { type: "authored", sourceExcerpt: "no conditions" },
            scope: { type: "authored", sourceExcerpt: "Operating systems Course" },
            target: { type: "authored", sourceExcerpt: "no target" },
            disposition: { type: "authored", sourceExcerpt: "active" },
          },
        },
        disposition: "active",
      },
    ],
  }
}

function multiCourseSnapshot(
  first: Course.CourseID,
  second: Course.CourseID,
  outcome: string,
): LearnerGoal.SemanticSnapshot {
  return {
    outcome,
    conditions: [],
    scope: {
      type: "courses",
      courses: [
        { courseID: first, basis: { type: "new", expectedCourseVersion: 0 } },
        { courseID: second, basis: { type: "new", expectedCourseVersion: 0 } },
      ],
    },
    target: { type: "absent" },
    fieldBases: {
      outcome: { type: "authored", sourceExcerpt: outcome },
      conditions: { type: "authored", sourceExcerpt: "no conditions" },
      scope: { type: "authored", sourceExcerpt: "Operating systems and Data structures Courses" },
      target: { type: "authored", sourceExcerpt: "no target" },
      disposition: { type: "authored", sourceExcerpt: "active" },
    },
  }
}

function carriedCourseSnapshot(
  result: LearnerGoal.OperationResult,
  courseIDs: readonly Course.CourseID[],
  dispositionExcerpt: string,
): LearnerGoal.SemanticSnapshot {
  const carried = { type: "carried" as const, predecessorRevisionID: result.revisionID }
  return {
    outcome: result.meaning.outcome,
    conditions: result.meaning.conditions,
    scope: {
      type: "courses",
      courses: courseIDs.map((courseID) => ({ courseID, basis: carried })),
    },
    target: result.meaning.target,
    fieldBases: {
      outcome: carried,
      conditions: carried,
      scope: carried,
      target: carried,
      disposition: { type: "authored", sourceExcerpt: dispositionExcerpt },
    },
  }
}

function seedSession(db: Database.Interface["db"], sessionID: SessionSchema.ID, time: number) {
  return Effect.gen(function* () {
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
        title: "learning",
        version: "test",
        time_created: time,
        time_updated: time,
      })
      .run()
  }).pipe(Effect.orDie)
}

function seedInvocation(
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
  index: number,
  source: string,
  command: LearnerGoal.Command,
  time: number,
  temporal?: { readonly timeZone: string | null },
): Effect.Effect<LearnerGoal.DirectInvocation, never> {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const userMessageID = SessionV1.MessageID.ascending(`msg_goal_user_${index}`)
        const userPartID = SessionV1.PartID.ascending(`prt_goal_user_${index}`)
        const assistantMessageID = SessionV1.MessageID.ascending(`msg_goal_assistant_${index}`)
        const toolPartID = SessionV1.PartID.ascending(`prt_goal_tool_${index}`)
        const callID = `call-goal-${index}`
        yield* tx
          .insert(MessageTable)
          .values({
            id: userMessageID,
            session_id: sessionID,
            data: userData(time),
            time_created: time,
            time_updated: time,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: userPartID,
            session_id: sessionID,
            message_id: userMessageID,
            data: { type: "text", text: source } as (typeof PartTable.$inferInsert)["data"],
            time_created: time,
            time_updated: time,
          })
          .run()
        const occurrence = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({ timeZone: temporal ? temporal.timeZone : "UTC" }),
          sessionID,
          messageID: userMessageID,
          timeAdmitted: time,
        })
        yield* tx
          .insert(MessageTable)
          .values({
            id: assistantMessageID,
            session_id: sessionID,
            data: assistantData(userMessageID, time + 1),
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: toolPartID,
            session_id: sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              callID,
              tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              state: { status: "pending", input: command, raw: JSON.stringify(command) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run()
        return {
          envelope: {
            occurrenceID: occurrence.id,
            turnID: Turn.ID.create(),
            inputID: Turn.InputID.create(),
            sessionID,
            parentUserMessageID: userMessageID,
            assistantMessageID,
            partID: toolPartID,
            providerCallID: callID,
            emissionOrdinal: 0,
            capabilityIdentity: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            capabilityVersion: HistoricalLearnerGoalV1.UPDATE_LEARNER_GOALS_VERSION,
            authorizationBasis: "learner_request" as const,
            timeAdmitted: time + 1,
          },
          command,
        }
      }),
    )
    .pipe(Effect.orDie)
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
