import { Course } from "@opencode-ai/core/course"
import {
  CourseSelectionAcceptanceCommitSealTable,
  CourseSelectionAcceptanceEffectTable,
} from "@opencode-ai/core/course/sql"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { EventV2 } from "@opencode-ai/core/event"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import {
  PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
  issueDefaultCourseCapabilityPrompt,
  recoverDefaultCourseCapability,
  settleDefaultCoursePolicy,
  settleDefaultCoursePrompt,
  settleDefaultCourseV2,
  settleDefaultCourseV3,
} from "@opencode-ai/core/learner-navigation/default-course-v2"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import {
  LearnerGoalCapabilityIssueV2Table,
  LearnerGoalCapabilitySettlementV2Table,
  LearnerGoalCommandTable,
  LearnerGoalCommitSealTable,
  LearnerGoalDispositionV2Table,
  LearnerGoalEffectTable,
  LearnerGoalFieldBasisTable,
  LearnerGoalRevisionTable,
} from "@opencode-ai/core/learner-goal/sql"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { RetainedSteeringCommandTable, RetainedSteeringCommitSealTable } from "@opencode-ai/core/retained-steering/sql"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import {
  AdmittedLearnerOccurrenceTable,
  LearnerOccurrenceSourceOrderTable,
  LearnerOccurrenceTombstoneTable,
} from "@opencode-ai/core/learning-command/occurrence.sql"
import {
  CourseRouteAnchorTransitionTable,
  DefaultCoursePreferenceTransitionTable,
  LearnerCourseRouteAnchorCommitSealTable,
  LearnerDefaultCourseAcknowledgementTable,
  LearnerDefaultCourseCapabilityIssueTable,
  LearnerDefaultCourseCapabilitySettlementTable,
  LearnerDefaultCourseDispositionTable,
  LearnerDefaultCourseCommandTable,
  LearnerDefaultCourseCommitSealTable,
} from "@opencode-ai/core/learner-navigation/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnModelOperationTable } from "@opencode-ai/core/turn/sql"
import { Turn } from "@opencode-ai/schema/turn"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { join } from "path"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { seedFrozenV12AdmittedDefaultCourse } from "../../../core/test/fixture/frozen-v12-default-course"
import { seedFrozenV15AdmittedLearnerGoal } from "../../../core/test/fixture/frozen-v15-learner-goal"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const permissionRequests: Permission.AskInput[] = []
const permissionFailures: PermissionV1.Error[] = []
const permissionWaits: Array<{
  entered: Deferred.Deferred<void>
  release: Deferred.Deferred<void>
  failure?: PermissionV1.Error
}> = []
const permission = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    ask: (input) =>
      Effect.gen(function* () {
        permissionRequests.push(input)
        const evaluated = input.ruleset.findLast(
          (rule) =>
            (rule.permission === "*" || rule.permission === input.permission) &&
            (rule.pattern === "*" || input.patterns.includes(rule.pattern)),
        )
        const action = input.requirePrompt ? "ask" : (evaluated?.action ?? "ask")
        const basis = {
          permission: input.permission,
          patterns: [...input.patterns],
          requirePrompt: input.requirePrompt ?? false,
          ruleset: [...input.ruleset],
          authority: [...(input.authority ?? [])],
          approved: [],
          evaluated: input.patterns.map((pattern) => ({
            permission: input.permission,
            pattern,
            action,
          })),
        } satisfies Permission.EvaluationBasis
        if (action === "deny") {
          if (input.lifecycle) yield* input.lifecycle.selected({ action, basis })
          return yield* Effect.fail(new PermissionV1.DeniedError({ ruleset: input.ruleset }))
        }
        const failure = permissionFailures.shift()
        if (failure) return yield* Effect.fail(failure)
        const wait = permissionWaits.shift()
        if (!wait) {
          if (!input.lifecycle) return
          if (action === "allow") return yield* input.lifecycle.selected({ action, basis })
          const id = input.id ?? PermissionV1.ID.ascending()
          const request = {
            id,
            sessionID: input.sessionID,
            permission: input.permission,
            patterns: input.patterns,
            metadata: input.metadata,
            always: input.always,
            tool: input.tool,
          } satisfies PermissionV1.Request
          yield* input.lifecycle.selected({ action: "ask", basis, request })
          return yield* input.lifecycle.replied({
            request,
            reply: { requestID: id, reply: "once" },
          })
        }
        const id = input.id ?? PermissionV1.ID.ascending()
        const request = {
          id,
          sessionID: input.sessionID,
          permission: input.permission,
          patterns: input.patterns,
          metadata: input.metadata,
          always: input.always,
          tool: input.tool,
        } satisfies PermissionV1.Request
        if (input.lifecycle) yield* input.lifecycle.selected({ action: "ask", basis, request })
        yield* Deferred.succeed(wait.entered, undefined)
        yield* Deferred.await(wait.release)
        if (wait.failure) {
          if (input.lifecycle) {
            yield* input.lifecycle.replied({
              request,
              reply:
                wait.failure instanceof PermissionV1.CorrectedError
                  ? { requestID: id, reply: "reject", message: wait.failure.feedback }
                  : wait.failure instanceof PermissionV1.CancelledError
                    ? { requestID: id, reply: "cancel" }
                    : { requestID: id, reply: "reject" },
            })
          }
          return yield* Effect.fail(wait.failure)
        }
        if (input.lifecycle) {
          yield* input.lifecycle.replied({
            request,
            reply: { requestID: id, reply: "once" },
          })
        }
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
  LearnerGoal.readNode,
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

it.effect("applies one Agent-native learner Goal change without a Goal-specific confirmation", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const goals = yield* LearnerGoal.ReadService
    const time = Date.parse("2026-07-31T04:00:00.000Z")
    const input = {
      operations: [
        {
          type: "create" as const,
          outcome: "Understand virtual memory well enough to explain it",
          conditions: ["Explain address translation", "Compare replacement policies"],
          target: {
            type: "local_date" as const,
            date: "2026-08-05",
            timeZone: { type: "source" as const },
          },
        },
      ],
    }
    const interaction = yield* seedInteraction(
      db,
      "goal-v2-agent-native",
      input,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "我想在 8 月 5 日前学懂虚拟内存，能讲清地址转换并比较页面置换策略。", time, timeZone: "Asia/Shanghai" },
    )

    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
    const result = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input,
      context(
        interaction.registration,
        "allow",
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        [],
        LearnerGoal.PERMISSION_PATTERN,
      ),
    )

    expect(JSON.parse(result.output)).toMatchObject({
      settlement: {
        outcome: "applied",
        goalKind: "learner_goal",
        schemaVersion: 2,
        provenance: "agent_action",
      },
      disposition: "candidate_v2",
      capabilityOutcome: "policy_allow",
    })
    expect(permissionRequests).toHaveLength(1)
    expect(
      SemanticPresentation.readProposal(
        { ...permissionRequests[0]!, id: permissionRequests[0]!.id ?? PermissionV1.ID.ascending() },
        true,
      ).type,
    ).toBe("valid")
    const partRow = yield* db.select().from(PartTable).where(eq(PartTable.id, interaction.registration.partID)).get()
    expect(partRow).toBeDefined()
    expect(
      SemanticPresentation.readResult(
        decodeToolPart({
          ...partRow!.data,
          id: partRow!.id,
          messageID: partRow!.message_id,
          sessionID: partRow!.session_id,
        }),
        true,
      ).type,
    ).toBe("valid")
    const page = yield* goals.discover(time + 1)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.head).toMatchObject({
      schemaVersion: 2,
      outcome: input.operations[0]!.outcome,
      target: {
        type: "local_date",
        date: "2026-08-05",
        resolvedZone: { type: "iana", name: "Asia/Shanghai" },
      },
    })
  }),
)

it.effect("uses the ordinary configured ask for one Agent-native Goal candidate and replays its result", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const goals = yield* LearnerGoal.ReadService
    const time = Date.parse("2026-07-21T02:00:00.000Z")
    const input = {
      operations: [
        {
          type: "create" as const,
          outcome: "Understand virtual memory well enough to teach it",
          conditions: ["Explain page replacement with a worked example"],
        },
      ],
    }
    const interaction = yield* seedInteraction(
      db,
      "accepted-learner-goal",
      input,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "对，就把刚才说的虚拟内存目标记下来。", time, timeZone: "UTC" },
    )

    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
    const result = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input,
      context(interaction.registration, "ask", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
    )

    expect(permissionRequests).toHaveLength(1)
    const asked = permissionRequests[0]!
    expect(asked).toMatchObject({
      permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      patterns: [LearnerGoal.PERMISSION_PATTERN],
      always: [LearnerGoal.PERMISSION_PATTERN],
      metadata: {
        goalKind: "learner_goal",
        issuance: "root",
      },
    })
    expect(
      SemanticPresentation.readProposal({ ...asked, id: asked.id ?? PermissionV1.ID.ascending() }, true),
    ).toMatchObject({
      type: "valid",
      value: {
        phase: "proposal",
        capability: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        approval: "policy",
      },
    })
    expect(result.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
    expect(
      SemanticPresentation.readResult({
        id: interaction.registration.partID,
        sessionID: interaction.registration.sessionID,
        messageID: interaction.registration.assistantMessageID,
        tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        callID: interaction.registration.callID,
        state: { status: "completed", title: result.title, metadata: result.metadata },
      }),
    ).toMatchObject({
      type: "valid",
      value: {
        phase: "result",
        capability: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        outcome: "committed",
        durablySettled: true,
      },
    })
    expect(result.title).toBe("Updated learning Goal")
    expect(result.output).toContain(input.operations[0].outcome)
    expect(JSON.parse(result.output)).toMatchObject({
      disposition: "candidate_v2",
      capabilityOutcome: "prompted_allow",
      permissionRequestID: expect.stringMatching(/^per_/),
    })
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(result)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 1 })
    expect(yield* goalReceiptCount(db)).toEqual({ count: 1 })
    expect((yield* goals.discover(time + 10_000)).items).toMatchObject([
      { head: { schemaVersion: 2, outcome: input.operations[0].outcome, disposition: { type: "active" } } },
    ])

    const replay = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input,
      context(interaction.registration, "deny", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
    )
    expect(replay).toEqual(result)
    expect(permissionRequests).toHaveLength(1)
  }),
)

it.effect("settles a live Agent-native Goal permission abort without inventing an effect", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    permissionWaits.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const input = {
      operations: [{ type: "create" as const, outcome: "Cancelled permission must not create this Goal" }],
    }
    const interaction = yield* seedInteraction(
      db,
      "goal-v2-live-permission-abort",
      input,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "Record this Goal only if the configured capability approval completes.", timeZone: "UTC" },
    )
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)

    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    permissionWaits.push({ entered, release })
    const controller = new AbortController()
    const execution = yield* runtime
      .executeCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, {
        ...context(interaction.registration, "ask", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
        abort: controller.signal,
      })
      .pipe(Effect.forkChild)
    yield* Deferred.await(entered)

    const issued = yield* db
      .select()
      .from(LearnerGoalCapabilityIssueV2Table)
      .where(eq(LearnerGoalCapabilityIssueV2Table.invocation_part_id, interaction.registration.partID))
      .get()
    expect(issued?.permission_request_id).toBeString()
    expect(yield* db.select().from(LearnerGoalCapabilitySettlementV2Table).all()).toEqual([])
    expect(yield* db.select().from(LearnerGoalEffectTable).all()).toEqual([])

    controller.abort()
    const result = yield* Fiber.join(execution)
    yield* Deferred.succeed(release, undefined).pipe(Effect.ignore)
    expect(result.metadata).toMatchObject({ outcome: "error", code: "interrupted", durablySettled: true })
    expect(JSON.parse(result.output)).toMatchObject({
      disposition: "candidate_v2",
      capabilityOutcome: "prompted_abort",
      permissionRequestID: issued!.permission_request_id,
      settlement: { outcome: "error", code: "interrupted" },
    })
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(result)
    expect(yield* db.select().from(LearnerGoalEffectTable).all()).toEqual([])
    expect(permissionRequests).toHaveLength(1)
  }),
)

it.effect("keeps populated Goal owner reads bounded, snapshot-stable, exact, and zero-write", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const goals = yield* LearnerGoal.ReadService
    const execute = (suffix: string, input: Record<string, unknown>) =>
      Effect.gen(function* () {
        const interaction = yield* seedInteraction(
          db,
          `goal-read-${suffix}`,
          input,
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          { text: `Goal owner read fixture ${suffix}`, timeZone: "UTC" },
        )
        yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
        return yield* runtime.executeCommand(
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          input,
          context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
        )
      })

    yield* execute("initial", {
      operations: [
        { type: "create", outcome: "Read-stable systems Goal" },
        { type: "create", outcome: "Read-stable probability Goal" },
      ],
    })
    const initial = yield* goals.discover(Date.now() + 10_000, {}, { limit: 10 })
    expect(initial.items).toHaveLength(2)
    const tracked = initial.items[0]!
    for (const outcome of ["Read-stable systems Goal v2", "Read-stable systems Goal v3"]) {
      const current = yield* goals.readCurrent(tracked.goalID, Date.now() + 10_000)
      if (!current) return yield* Effect.die("Tracked Goal disappeared")
      yield* execute(outcome.endsWith("v2") ? "update-two" : "update-three", {
        operations: [
          {
            type: "update",
            goalID: tracked.goalID,
            headRevisionID: current.head.id,
            patch: { outcome },
          },
        ],
      })
    }

    const historyFirst = yield* goals.readHistory(tracked.goalID, Date.now() + 10_000, { limit: 1 })
    const discoveryFirst = yield* goals.discover(Date.now() + 10_000, {}, { limit: 1 })
    expect(historyFirst.items.map((revision) => revision.version)).toEqual([3])
    expect(historyFirst.cursor).toBeString()
    expect(discoveryFirst.items).toHaveLength(1)
    expect(discoveryFirst.cursor).toBeString()

    yield* execute("late-create", { operations: [{ type: "create", outcome: "Late Goal outside saved cursor" }] })
    const beforeFourth = yield* goals.readCurrent(tracked.goalID, Date.now() + 10_000)
    if (!beforeFourth) return yield* Effect.die("Tracked Goal disappeared before its fourth revision")
    yield* execute("update-four", {
      operations: [
        {
          type: "update",
          goalID: tracked.goalID,
          headRevisionID: beforeFourth.head.id,
          patch: { outcome: "Read-stable systems Goal v4" },
        },
      ],
    })

    const historySecond = yield* goals.readHistory(tracked.goalID, Date.now() + 20_000, {
      limit: 1,
      cursor: historyFirst.cursor,
    })
    const historyThird = yield* goals.readHistory(tracked.goalID, Date.now() + 20_000, {
      limit: 1,
      cursor: historySecond.cursor,
    })
    const discoverySecond = yield* goals.discover(
      Date.now() + 20_000,
      {},
      {
        limit: 1,
        cursor: discoveryFirst.cursor,
      },
    )
    expect(historySecond.throughRevision).toBe(historyFirst.throughRevision)
    expect(historySecond.items.map((revision) => revision.version)).toEqual([2])
    expect(historyThird.items.map((revision) => revision.version)).toEqual([1])
    expect(discoverySecond.throughRevision).toBe(discoveryFirst.throughRevision)
    expect(discoverySecond.items).toHaveLength(1)
    expect(discoverySecond.items[0]!.goalID).not.toBe(discoveryFirst.items[0]!.goalID)
    expect(discoverySecond.items[0]!.head.outcome).not.toContain("Late Goal")

    const wrongDiscovery = yield* goals
      .discover(Date.now() + 20_000, { disposition: "achieved" }, { cursor: discoveryFirst.cursor })
      .pipe(Effect.exit)
    const wrongHistory = yield* goals
      .readHistory(initial.items[1]!.goalID, Date.now() + 20_000, { cursor: historyFirst.cursor })
      .pipe(Effect.exit)
    expect(Exit.isFailure(wrongDiscovery)).toBe(true)
    expect(Exit.isFailure(wrongHistory)).toBe(true)
    if (Exit.isFailure(wrongDiscovery)) expect(Cause.pretty(wrongDiscovery.cause)).toContain("InvalidCursorError")
    if (Exit.isFailure(wrongHistory)) expect(Cause.pretty(wrongHistory.cause)).toContain("InvalidCursorError")

    const effect = yield* db.select().from(LearnerGoalEffectTable).get()
    if (!effect) return yield* Effect.die("Goal read fixture created no effect")
    const changesBefore = yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)
    const exactCurrent = yield* goals.readCurrent(tracked.goalID, Date.now() + 20_000)
    const exactHistory = yield* goals.readHistory(tracked.goalID, Date.now() + 20_000, { limit: 2 })
    const exactDiscovery = yield* goals.discover(Date.now() + 20_000, {}, { limit: 2 })
    const exactEffect = yield* goals.readEffect(effect.id)
    expect(exactCurrent?.head).toMatchObject({ schemaVersion: 2, version: 4 })
    expect(exactHistory.items).toHaveLength(2)
    expect(exactDiscovery.items).toHaveLength(2)
    expect(exactEffect).toMatchObject({
      schemaVersion: 2,
      effectID: effect.id,
      authorizationBasis: "agent_action",
      capability: { outcome: "policy_allow" },
    })
    expect(yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)).toEqual(changesBefore)
  }),
)

it.effect("preserves Goal identities across correction, renewal, scope change, and both replacement arms", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const goals = yield* LearnerGoal.ReadService
    const courses = yield* Course.Service
    const firstCourse = yield* seedCourse(courses, "Systems foundations", "Main")
    const secondCourse = yield* seedCourse(courses, "Probability foundations", "Main")
    const execute = (suffix: string, input: Record<string, unknown>) =>
      Effect.gen(function* () {
        const interaction = yield* seedInteraction(
          db,
          `goal-v2-identity-${suffix}`,
          input,
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          { text: `Natural-language Goal operation ${suffix}`, timeZone: "Asia/Shanghai" },
        )
        yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
        const result = yield* runtime.executeCommand(
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          input,
          context(
            interaction.registration,
            "allow",
            LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            [],
            LearnerGoal.PERMISSION_PATTERN,
          ),
        )
        return { interaction, result, output: JSON.parse(result.output) }
      })

    const initial = yield* execute("initial", {
      operations: [
        {
          type: "create",
          outcome: "Understand systems well enough to explain the trade-offs",
          conditions: ["Explain one concrete design trade-off"],
          scope: { type: "courses", courseIDs: [firstCourse.course.id, secondCourse.course.id] },
        },
        { type: "create", outcome: "Build a durable probability intuition" },
      ],
    })
    expect(initial.output.settlement).toMatchObject({ outcome: "applied", schemaVersion: 2 })
    expect(initial.output.settlement.operations).toHaveLength(2)
    const systemsID = initial.output.settlement.operations[0].goalID as LearnerGoal.GoalID
    const probabilityID = initial.output.settlement.operations[1].goalID as LearnerGoal.GoalID
    expect(systemsID).not.toBe(probabilityID)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 1 })

    const systemsV1 = yield* goals.readCurrent(systemsID, Date.now() + 1)
    if (!systemsV1) return yield* Effect.die("Expected the systems Goal")
    const corrected = yield* execute("correct-standard-and-scope", {
      operations: [
        {
          type: "update",
          goalID: systemsID,
          headRevisionID: systemsV1.head.id,
          patch: {
            outcome: "Understand systems deeply enough to compare two designs",
            conditions: ["Compare two designs with explicit trade-offs"],
            scope: { type: "courses", courseIDs: [secondCourse.course.id] },
            target: {
              type: "local_date",
              date: "2026-08-15",
              timeZone: { type: "source" },
            },
          },
        },
      ],
    })
    expect(corrected.output.settlement.operations[0]).toMatchObject({
      result: "changed",
      goalID: systemsID,
      version: 2,
      meaning: {
        scope: { type: "courses", courseIDs: [secondCourse.course.id] },
        target: { type: "local_date", date: "2026-08-15" },
      },
    })

    const systemsV2 = yield* goals.readCurrent(systemsID, Date.now() + 1)
    if (!systemsV2) return yield* Effect.die("Expected the corrected systems Goal")
    yield* execute("pause", {
      operations: [
        {
          type: "update",
          goalID: systemsID,
          headRevisionID: systemsV2.head.id,
          patch: { disposition: "abandoned" },
        },
      ],
    })
    const paused = yield* goals.readCurrent(systemsID, Date.now() + 1)
    if (!paused) return yield* Effect.die("Expected the paused systems Goal")
    expect(paused.head.disposition).toEqual({ type: "abandoned" })
    yield* execute("renew", {
      operations: [
        {
          type: "update",
          goalID: systemsID,
          headRevisionID: paused.head.id,
          patch: { disposition: "active" },
        },
      ],
    })

    const renewed = yield* goals.readCurrent(systemsID, Date.now() + 1)
    const probability = yield* goals.readCurrent(probabilityID, Date.now() + 1)
    if (!renewed || !probability) return yield* Effect.die("Expected both replacement participants")
    const existingReplacement = yield* execute("replace-existing", {
      operations: [
        {
          type: "replace",
          goalID: systemsID,
          headRevisionID: renewed.head.id,
          patch: { outcome: "Preserve the corrected systems purpose in history" },
          target: {
            type: "existing",
            goalID: probabilityID,
            headRevisionID: probability.head.id,
          },
        },
      ],
    })
    expect(existingReplacement.output.settlement.operations[0]).toMatchObject({
      operation: "replace",
      goalID: systemsID,
      disposition: "superseded",
      replacementTarget: { type: "existing", goalID: probabilityID, revisionID: probability.head.id },
    })

    const superseded = yield* goals.readCurrent(systemsID, Date.now() + 1)
    if (!superseded || superseded.head.disposition.type !== "superseded") {
      return yield* Effect.die("Expected the systems Goal to be superseded")
    }
    const acceptedTarget = superseded.head.disposition
    yield* execute("correct-superseded", {
      operations: [
        {
          type: "update",
          goalID: systemsID,
          headRevisionID: superseded.head.id,
          patch: { conditions: ["Retain the exact replacement while correcting this history"] },
        },
      ],
    })
    const correctedSuperseded = yield* goals.readCurrent(systemsID, Date.now() + 1)
    expect(correctedSuperseded?.head.disposition).toEqual(acceptedTarget)

    const probabilityBeforeReplacement = yield* goals.readCurrent(probabilityID, Date.now() + 1)
    if (!probabilityBeforeReplacement) return yield* Effect.die("Expected the probability Goal before replacement")
    const generatedReplacement = yield* execute("replace-new", {
      operations: [
        {
          type: "replace",
          goalID: probabilityID,
          headRevisionID: probabilityBeforeReplacement.head.id,
          target: {
            type: "new",
            outcome: "Use probability fluently in systems analysis",
            conditions: ["Explain uncertainty in one systems example"],
            scope: { type: "courses", courseIDs: [firstCourse.course.id] },
          },
        },
      ],
    })
    const generated = generatedReplacement.output.settlement.operations[0].replacementTarget
    expect(generated).toMatchObject({ type: "new", version: 1 })
    expect(generated.goalID).not.toBe(systemsID)
    expect(generated.goalID).not.toBe(probabilityID)
    expect(yield* goals.readCurrent(generated.goalID, Date.now() + 1)).toMatchObject({
      head: { outcome: "Use probability fluently in systems analysis", version: 1 },
    })

    const effectsBeforeAtomicFailure = yield* db.get<{ count: number }>(
      sql`SELECT count(*) AS count FROM learner_goal_effect`,
    )
    const goalsBeforeAtomicFailure = (yield* goals.discover(Date.now() + 1, {}, { limit: 100 })).items.length
    const stale = yield* execute("atomic-stale", {
      operations: [
        { type: "create", outcome: "This Goal must roll back with the stale sibling" },
        {
          type: "update",
          goalID: systemsID,
          headRevisionID: superseded.head.id,
          patch: { outcome: "Stale correction" },
        },
      ],
    })
    expect(stale.result.metadata).toMatchObject({ outcome: "error", code: "stale" })
    expect(stale.output).toMatchObject({ disposition: "physical_no_effect" })
    expect(yield* db.get<{ count: number }>(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual(
      effectsBeforeAtomicFailure,
    )
    expect((yield* goals.discover(Date.now() + 1, {}, { limit: 100 })).items).toHaveLength(goalsBeforeAtomicFailure)
  }),
)

it.effect("reconciles committed learner Goal semantics before live authority or confirmation", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const time = Date.parse("2026-07-21T02:15:00.000Z")
    const input = { operations: [{ type: "create" as const, outcome: "Build intuition for probability" }] }
    const conflictInput = { operations: [{ type: "create" as const, outcome: "Memorize probability formulas" }] }
    const interaction = yield* seedInteraction(
      db,
      "learner-goal-semantic-origin",
      input,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "Please help me make my probability goal concrete.", time, timeZone: "UTC" },
    )
    const duplicate = yield* insertAssistant(
      db,
      interaction,
      "learner-goal-semantic-duplicate",
      input,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
    )
    const conflict = yield* insertAssistant(
      db,
      interaction,
      "learner-goal-semantic-conflict",
      conflictInput,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
    )

    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
    expect(
      yield* db.get(sql`
        SELECT count(*) AS count FROM learning_command_invocation
        WHERE part_id IN (${duplicate.partID}, ${conflict.partID})
      `),
    ).toEqual({ count: 0 })
    const applied = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input,
      context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
    )
    const requestsAfterApply = permissionRequests.length
    yield* db
      .insert(LearnerOccurrenceTombstoneTable)
      .values({ occurrence_id: interaction.occurrenceID, reason: "source_unavailable", time_deleted: time + 1 })
      .run()
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, duplicate)
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, conflictInput, conflict)
    expect(
      yield* db.get(sql`
        SELECT count(*) AS count FROM learning_command_invocation
        WHERE part_id IN (${duplicate.partID}, ${conflict.partID})
      `),
    ).toEqual({ count: 2 })
    expect(yield* goalInvocationProjection(db, duplicate.partID)).toMatchObject({
      status: "already_applied",
      confirmation: null,
    })
    expect(yield* goalInvocationProjection(db, conflict.partID)).toMatchObject({
      status: "error",
      confirmation: null,
      effectID: null,
    })

    const duplicateResult = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input,
      context(duplicate, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, [{ ruleset: [], absence: "deny" }]),
    )
    const conflictResult = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      conflictInput,
      context(conflict, "deny", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
    )

    expect(duplicateResult).toMatchObject({
      title: applied.title,
      metadata: { outcome: "already_applied" },
    })
    expect(JSON.parse(duplicateResult.output)).toMatchObject({
      settlement: { outcome: "already_applied", schemaVersion: 2 },
      disposition: "semantic_terminal_v2",
      semanticTerminal: { outcome: "already_applied" },
    })
    expect(conflictResult).toMatchObject({
      title: "Learner Goals not changed",
      metadata: { outcome: "error", code: "semantic_conflict" },
    })
    expect(JSON.parse(conflictResult.output)).toMatchObject({
      disposition: "semantic_terminal_v2",
      semanticTerminal: { outcome: "semantic_conflict" },
    })
    expect(permissionRequests).toHaveLength(requestsAfterApply)
    expect(yield* exactPartResult(db, duplicate.partID)).toEqual(duplicateResult)
    expect(yield* exactPartResult(db, conflict.partID)).toEqual(conflictResult)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 1 })
  }),
)

it.effect("retains Agent issuance and policy deny while creating no learner Goal effect", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const time = Date.parse("2026-07-31T04:30:00.000Z")
    const input = { operations: [{ type: "create" as const, outcome: "Learn graph algorithms" }] }
    const interaction = yield* seedInteraction(
      db,
      "goal-v2-policy-deny",
      input,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "把学习图算法记成我的目标。", time, timeZone: "Asia/Shanghai" },
    )

    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
    const result = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input,
      context(
        interaction.registration,
        "deny",
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        [],
        LearnerGoal.PERMISSION_PATTERN,
      ),
    )
    const stored = yield* db.transaction((tx) =>
      LearningCommand.readLearnerGoalInvocationVersion(tx, {
        partID: interaction.registration.partID,
        assistantMessageID: interaction.registration.assistantMessageID,
        providerCallID: interaction.registration.callID,
      }),
    )

    expect(result.metadata).toMatchObject({ outcome: "error", code: "permission_rejected" })
    expect(JSON.parse(result.output)).toMatchObject({
      disposition: "candidate_v2",
      capabilityOutcome: "policy_deny",
      agentAction: { kind: "root", causalRootOccurrenceID: interaction.occurrenceID },
    })
    expect(stored).toMatchObject({
      version: 2,
      disposition: "candidate_v2",
      status: "error",
      capabilityOutcome: "policy_deny",
      candidate: { agentAction: { kind: "root", causalRootOccurrenceID: interaction.occurrenceID } },
    })
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 0 })
  }),
)

it.effect(
  "records delegated Goal issuance and rejects a child without Goal-write membership before candidate admission",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const capability = (allow: boolean) => ({
        version: 2,
        parent: [],
        inherited: [],
        profile: [],
        explicit: allow
          ? [
              {
                permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                pattern: LearnerGoal.PERMISSION_PATTERN,
                action: "allow",
              },
            ]
          : [],
      })

      const input = { operations: [{ type: "create" as const, outcome: "Explain delegated learning" }] }
      const grantedCapability = capability(true)
      const granted = yield* seedDelegatedLearningCommandInteraction(
        db,
        "goal-v2-granted",
        input,
        grantedCapability,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, granted.registration)
      const applied = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        input,
        context(
          granted.registration,
          "allow",
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          [],
          LearnerGoal.PERMISSION_PATTERN,
        ),
      )
      expect(JSON.parse(applied.output)).toMatchObject({
        disposition: "candidate_v2",
        settlement: { outcome: "applied" },
        agentAction: {
          kind: "delegated",
          occurrenceID: granted.registration.causalOccurrenceID,
          causalRootOccurrenceID: granted.occurrenceID,
          sessionID: granted.child.sessionID,
          turnID: granted.child.turnID,
          invocationPartID: granted.registration.partID,
          lineage: [
            {
              childTurnID: granted.child.turnID,
              childSessionID: granted.child.sessionID,
              parentSessionID: granted.parent.sessionID,
              delegatedCapability: grantedCapability,
              delegatedCapabilityFingerprint: expect.any(String),
            },
          ],
          effectiveDelegatedCapability: {
            identity: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            version: 2,
            projectionVersion: 2,
            fingerprint: expect.any(String),
          },
        },
        capabilityOutcome: "policy_allow",
      })

      const deniedInput = { operations: [{ type: "create" as const, outcome: "Invent forbidden Goal state" }] }
      const denied = yield* seedDelegatedLearningCommandInteraction(
        db,
        "goal-v2-ungranted",
        deniedInput,
        capability(false),
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      )
      const requestsBeforeDenied = permissionRequests.length
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, deniedInput, denied.registration)
      const rejected = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        deniedInput,
        context(
          denied.registration,
          "allow",
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          [],
          LearnerGoal.PERMISSION_PATTERN,
        ),
      )
      expect(JSON.parse(rejected.output)).toMatchObject({
        disposition: "physical_no_effect",
        settlement: { outcome: "error", code: "permission_rejected" },
      })
      expect(permissionRequests).toHaveLength(requestsBeforeDenied)
      expect(
        yield* db.transaction((tx) =>
          LearningCommand.readLearnerGoalInvocationVersion(tx, {
            partID: denied.registration.partID,
            assistantMessageID: denied.registration.assistantMessageID,
            providerCallID: denied.registration.callID,
          }),
        ),
      ).toMatchObject({ version: 2, disposition: "physical_no_effect", status: "error" })
      expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 1 })

      const forgedInput = { operations: [{ type: "create" as const, outcome: "Reject forged Goal lineage" }] }
      const forged = yield* seedDelegatedLearningCommandInteraction(
        db,
        "goal-v2-forged-lineage",
        forgedInput,
        capability(true),
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      )
      expect(
        Exit.isFailure(
          yield* runtime
            .prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, forgedInput, {
              ...forged.registration,
              causalOccurrenceID: LearningCommand.OccurrenceID.create(),
            })
            .pipe(Effect.exit),
        ),
      ).toBe(true)
      expect(
        yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM learning_command_invocation
            WHERE part_id = ${forged.registration.partID}) AS invocations,
          (SELECT count(*) FROM learner_goal_disposition_v2
            WHERE invocation_part_id = ${forged.registration.partID}) AS dispositions
      `),
      ).toEqual({ invocations: 0, dispositions: 0 })
    }),
)

it.effect("returns typed no_change without a second Goal effect or frontier advance", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const goals = yield* LearnerGoal.ReadService
    const time = Date.parse("2026-07-31T05:00:00.000Z")
    const create = { operations: [{ type: "create" as const, outcome: "Understand Bayesian inference" }] }
    const origin = yield* seedInteraction(
      db,
      "goal-v2-no-change-origin",
      create,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "我想理解贝叶斯推断。", time, timeZone: "UTC" },
    )
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, create, origin.registration)
    yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      create,
      context(
        origin.registration,
        "allow",
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        [],
        LearnerGoal.PERMISSION_PATTERN,
      ),
    )
    yield* settleInteractionTurn(db, origin, time + 1)
    const current = (yield* goals.discover(time + 2)).items[0]!
    const frontier = yield* db.transaction((tx) => LearningFrontier.read(tx))
    const update = {
      operations: [
        {
          type: "update" as const,
          goalID: current.goalID,
          headRevisionID: current.head.id,
          patch: { outcome: current.head.outcome },
        },
      ],
    }
    const followup = yield* seedFollowupInteraction(
      db,
      origin,
      "goal-v2-no-change-followup",
      update,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "目标还是刚才那个，不用改内容。", time: time + 3, timeZone: "UTC" },
    )
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, update, followup.registration)
    const result = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      update,
      context(
        followup.registration,
        "allow",
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        [],
        LearnerGoal.PERMISSION_PATTERN,
      ),
    )

    expect(result.metadata).toMatchObject({ outcome: "no_change", durablySettled: true })
    expect(JSON.parse(result.output)).toMatchObject({
      settlement: { outcome: "no_change", operations: [{ result: "no_change", goalID: current.goalID }] },
      capabilityOutcome: "policy_allow",
    })
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 1 })
    expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontier)
    expect((yield* goals.readCurrent(current.goalID, time + 4))?.head.id).toBe(current.head.id)
  }),
)

it.effect("recovers every durable Goal V2 capability class without applying an uncommitted allow", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const prompt =
      (outcome: "prompted_allow" | "prompted_deny" | "prompted_correct" | "prompted_cancel") =>
      (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
        db.transaction((tx) =>
          Effect.gen(function* () {
            const time = Date.now()
            const requestID = PermissionV1.ID.ascending()
            yield* LearningCommand.issueLearnerGoalCapabilityPromptV2(tx, {
              partID,
              requestID,
              policyBasis: { source: "recovery-matrix" },
              shownScope: { patterns: [LearnerGoal.PERMISSION_PATTERN] },
              time,
              order: yield* EventV2.nextSequence(tx, sessionID),
            })
            yield* LearningCommand.settleLearnerGoalPromptV2(tx, {
              partID,
              requestID,
              outcome,
              reply: { reply: outcome },
              time: time + 1,
              order: yield* EventV2.nextSequence(tx, sessionID),
            })
          }),
        )
    const cases = [
      {
        name: "not-evaluated",
        prepare: (_partID: SessionV1.PartID, _sessionID: SessionSchema.ID) => Effect.void,
        outcome: "not_evaluated",
        code: "interrupted",
      },
      {
        name: "issued-no-reply",
        prepare: (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const order = yield* EventV2.nextSequence(tx, sessionID)
              yield* LearningCommand.issueLearnerGoalCapabilityPromptV2(tx, {
                partID,
                requestID: PermissionV1.ID.ascending(),
                policyBasis: { source: "test" },
                shownScope: { patterns: [LearnerGoal.PERMISSION_PATTERN] },
                time: Date.now(),
                order,
              })
            }),
          ),
        outcome: "prompted_abort",
        code: "interrupted",
      },
      {
        name: "durable-allow",
        prepare: (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const time = Date.now()
              const order = yield* EventV2.nextSequence(tx, sessionID)
              yield* LearningCommand.settleLearnerGoalPolicyV2(tx, {
                partID,
                outcome: "policy_allow",
                policyBasis: { source: "test" },
                time,
                order,
              })
            }),
          ),
        outcome: "policy_allow",
        code: "interrupted",
      },
      {
        name: "durable-deny",
        prepare: (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const time = Date.now()
              const order = yield* EventV2.nextSequence(tx, sessionID)
              yield* LearningCommand.settleLearnerGoalPolicyV2(tx, {
                partID,
                outcome: "policy_deny",
                policyBasis: { source: "test" },
                time,
                order,
              })
            }),
          ),
        outcome: "policy_deny",
        code: "permission_rejected",
      },
      { name: "prompted-allow", prepare: prompt("prompted_allow"), outcome: "prompted_allow", code: "interrupted" },
      {
        name: "prompted-deny",
        prepare: prompt("prompted_deny"),
        outcome: "prompted_deny",
        code: "permission_rejected",
      },
      {
        name: "prompted-correct",
        prepare: prompt("prompted_correct"),
        outcome: "prompted_correct",
        code: "permission_corrected",
      },
      {
        name: "prompted-cancel",
        prepare: prompt("prompted_cancel"),
        outcome: "prompted_cancel",
        code: "cancelled",
      },
    ] as const

    for (const item of cases) {
      const input = { operations: [{ type: "create" as const, outcome: `Recovery ${item.name}` }] }
      const interaction = yield* seedInteraction(
        db,
        `goal-v2-recovery-${item.name}`,
        input,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: `Remember Recovery ${item.name}`, timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
      yield* item.prepare(interaction.registration.partID, interaction.registration.sessionID)
      expect(yield* runtime.interrupt(interaction.registration)).toBe(true)
      const result = yield* exactPartResult(db, interaction.registration.partID)
      expect(result.metadata).toMatchObject({ outcome: "error", code: item.code })
      expect(JSON.parse(result.output)).toMatchObject({
        disposition: "candidate_v2",
        capabilityOutcome: item.outcome,
      })
    }
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 0 })
  }),
)

it.effect("gives committed Goal semantics precedence across every recovery capability branch", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const prompt =
      (outcome: "prompted_allow" | "prompted_deny" | "prompted_correct" | "prompted_cancel") =>
      (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
        db.transaction((tx) =>
          Effect.gen(function* () {
            const time = Date.now()
            const requestID = PermissionV1.ID.ascending()
            yield* LearningCommand.issueLearnerGoalCapabilityPromptV2(tx, {
              partID,
              requestID,
              policyBasis: { source: "semantic-race-test" },
              shownScope: { patterns: [LearnerGoal.PERMISSION_PATTERN] },
              time,
              order: yield* EventV2.nextSequence(tx, sessionID),
            })
            yield* LearningCommand.settleLearnerGoalPromptV2(tx, {
              partID,
              requestID,
              outcome,
              reply: { reply: outcome },
              time: time + 1,
              order: yield* EventV2.nextSequence(tx, sessionID),
            })
          }),
        )
    const capabilityCases = [
      {
        name: "not-evaluated",
        prepare: (_partID: SessionV1.PartID, _sessionID: SessionSchema.ID) => Effect.void,
        expected: "not_evaluated",
      },
      {
        name: "issued-no-reply",
        prepare: (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const time = Date.now()
              yield* LearningCommand.issueLearnerGoalCapabilityPromptV2(tx, {
                partID,
                requestID: PermissionV1.ID.ascending(),
                policyBasis: { source: "semantic-race-test" },
                shownScope: { patterns: [LearnerGoal.PERMISSION_PATTERN] },
                time,
                order: yield* EventV2.nextSequence(tx, sessionID),
              })
            }),
          ),
        expected: "prompted_abort",
      },
      {
        name: "durable-allow",
        prepare: (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const time = Date.now()
              yield* LearningCommand.settleLearnerGoalPolicyV2(tx, {
                partID,
                outcome: "policy_allow",
                policyBasis: { source: "semantic-race-test" },
                time,
                order: yield* EventV2.nextSequence(tx, sessionID),
              })
            }),
          ),
        expected: "policy_allow",
      },
      {
        name: "durable-deny",
        prepare: (partID: SessionV1.PartID, sessionID: SessionSchema.ID) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const time = Date.now()
              yield* LearningCommand.settleLearnerGoalPolicyV2(tx, {
                partID,
                outcome: "policy_deny",
                policyBasis: { source: "semantic-race-test" },
                time,
                order: yield* EventV2.nextSequence(tx, sessionID),
              })
            }),
          ),
        expected: "policy_deny",
      },
      { name: "prompted-allow", prepare: prompt("prompted_allow"), expected: "prompted_allow" },
      { name: "prompted-deny", prepare: prompt("prompted_deny"), expected: "prompted_deny" },
      { name: "prompted-correct", prepare: prompt("prompted_correct"), expected: "prompted_correct" },
      { name: "prompted-cancel", prepare: prompt("prompted_cancel"), expected: "prompted_cancel" },
    ] as const

    for (const capabilityCase of capabilityCases) {
      for (const semanticOutcome of ["already_applied", "semantic_conflict"] as const) {
        const suffix = `goal-v2-recovery-race-${capabilityCase.name}-${semanticOutcome}`
        const winnerInput = { operations: [{ type: "create" as const, outcome: `Winner ${suffix}` }] }
        const loserInput =
          semanticOutcome === "already_applied"
            ? winnerInput
            : { operations: [{ type: "create" as const, outcome: `Conflicting loser ${suffix}` }] }
        const loser = yield* seedInteraction(
          db,
          `${suffix}-loser`,
          loserInput,
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          { text: `Remember ${suffix}`, timeZone: "UTC" },
        )
        const winner = yield* insertAssistant(
          db,
          loser,
          `${suffix}-winner`,
          winnerInput,
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        )
        yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, loserInput, loser.registration)
        yield* capabilityCase.prepare(loser.registration.partID, loser.registration.sessionID)
        yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, winnerInput, winner)
        const effectsBefore = yield* db.get<{ count: number }>(sql`SELECT count(*) AS count FROM learner_goal_effect`)
        if (!effectsBefore) return yield* Effect.die("Expected learner Goal effect count")
        const winnerResult = yield* runtime.executeCommand(
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          winnerInput,
          context(winner, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, [], LearnerGoal.PERMISSION_PATTERN),
        )
        expect(winnerResult.metadata).toMatchObject({ outcome: "applied" })
        expect(yield* runtime.interrupt(loser.registration)).toBe(true)
        const recovered = yield* exactPartResult(db, loser.registration.partID)
        const output = JSON.parse(recovered.output)
        expect(output).toMatchObject({
          disposition: "candidate_v2",
          capabilityOutcome: capabilityCase.expected,
          settlement:
            semanticOutcome === "already_applied"
              ? { outcome: "already_applied", effectID: expect.any(String) }
              : { outcome: "error", code: "semantic_conflict" },
        })
        expect(yield* db.get<{ count: number }>(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({
          count: effectsBefore.count + 1,
        })
        expect(yield* runtime.interrupt(loser.registration)).toBe(true)
        expect(yield* exactPartResult(db, loser.registration.partID)).toEqual(recovered)
      }
    }
  }),
)

it.effect("retains applied Goal V2 truth while Session deletion removes its no-effect sibling", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const goals = yield* LearnerGoal.ReadService
    const sessions = yield* Session.Service

    const appliedInput = { operations: [{ type: "create" as const, outcome: "Survive Session deletion" }] }
    const applied = yield* seedInteraction(
      db,
      "goal-v2-session-delete-applied",
      appliedInput,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "把这个学习目标保存下来。", timeZone: "UTC" },
    )
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, appliedInput, applied.registration)
    const appliedResult = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      appliedInput,
      context(
        applied.registration,
        "allow",
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        [],
        LearnerGoal.PERMISSION_PATTERN,
      ),
    )
    const appliedOutput = JSON.parse(appliedResult.output)
    const effectID = appliedOutput.settlement.effectID
    expect(effectID).toBeString()
    expect(appliedOutput).toMatchObject({ settlement: { outcome: "applied" } })
    const appliedEffect = yield* db.select().from(LearnerGoalEffectTable).get()
    if (!appliedEffect) return yield* Effect.die("Expected an applied Goal V2 effect")
    expect(appliedEffect.id).toBe(effectID)
    const appliedInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, applied.registration.partID))
      .get()
    if (!appliedInvocation?.time_settled) return yield* Effect.die("Expected an applied Goal V2 invocation")
    yield* settleInteractionTurn(db, applied, appliedInvocation.time_settled)

    const deniedInput = { operations: [{ type: "create" as const, outcome: "Remove denied Goal history" }] }
    const denied = yield* seedInteraction(
      db,
      "goal-v2-session-delete-denied",
      deniedInput,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: "不要允许这个目标写入。", timeZone: "UTC" },
    )
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, deniedInput, denied.registration)
    const deniedResult = yield* runtime.executeCommand(
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      deniedInput,
      context(
        denied.registration,
        "deny",
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        [],
        LearnerGoal.PERMISSION_PATTERN,
      ),
    )
    expect(deniedResult.metadata).toMatchObject({ outcome: "error", code: "permission_rejected" })
    const deniedInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, denied.registration.partID))
      .get()
    if (!deniedInvocation?.time_settled) return yield* Effect.die("Expected a denied Goal V2 invocation")
    yield* settleInteractionTurn(db, denied, deniedInvocation.time_settled)

    expect(
      Exit.isFailure(
        yield* db
          .delete(LearnerGoalDispositionV2Table)
          .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, denied.registration.partID))
          .run()
          .pipe(Effect.exit),
      ),
    ).toBe(true)

    expect(
      yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM learner_goal_effect WHERE id = ${appliedEffect.id}) AS effects,
          (SELECT count(*) FROM learner_goal_commit_seal WHERE effect_id = ${appliedEffect.id}) AS seals,
          (SELECT count(*) FROM learning_command_receipt WHERE invocation_part_id = ${applied.registration.partID}) AS receipts
      `),
    ).toEqual({ effects: 1, seals: 1, receipts: 1 })

    yield* sessions.remove(applied.sessionID)
    expect(
      yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM learner_goal_effect WHERE id = ${appliedEffect.id}) AS effects,
          (SELECT count(*) FROM learner_goal_commit_seal WHERE effect_id = ${appliedEffect.id}) AS seals,
          (SELECT count(*) FROM learning_command_receipt WHERE invocation_part_id = ${applied.registration.partID}) AS receipts
      `),
    ).toEqual({ effects: 1, seals: 1, receipts: 1 })
    yield* sessions.remove(denied.sessionID)

    expect(
      yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, applied.registration.partID))
        .get(),
    ).toMatchObject({ status: "applied" })
    expect(
      yield* db
        .select()
        .from(LearnerGoalDispositionV2Table)
        .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, applied.registration.partID))
        .get(),
    ).toMatchObject({ disposition: "candidate_v2" })
    expect(
      yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM learner_goal_effect WHERE id = ${appliedEffect.id}) AS effects,
          (SELECT count(*) FROM learner_goal_commit_seal WHERE effect_id = ${appliedEffect.id}) AS seals,
          (SELECT count(*) FROM learning_command_receipt WHERE invocation_part_id = ${applied.registration.partID}) AS receipts
      `),
    ).toEqual({ effects: 1, seals: 1, receipts: 1 })
    expect(yield* goals.readEffect(appliedEffect.id)).toMatchObject({
      schemaVersion: 2,
      occurrenceID: applied.occurrenceID,
    })
    expect(
      (yield* goals.discover(Date.now() + 1)).items.find((goal) => goal.head.effectID === appliedEffect.id),
    ).toMatchObject({
      head: { source: { occurrenceID: applied.occurrenceID, availability: { state: "source_unavailable" } } },
    })
    expect(
      yield* db.select().from(PartTable).where(eq(PartTable.id, applied.registration.partID)).get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, denied.registration.partID))
        .get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(LearnerGoalDispositionV2Table)
        .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, denied.registration.partID))
        .get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(LearnerGoalCapabilitySettlementV2Table)
        .where(eq(LearnerGoalCapabilitySettlementV2Table.invocation_part_id, denied.registration.partID))
        .get(),
    ).toBeUndefined()
  }),
)

it.effect("blocks Goal V2 applied-message revert while removing an eligible no-effect message", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const sessions = yield* Session.Service
    const execute = (suffix: string, input: Record<string, unknown>, policy: "allow" | "deny") =>
      Effect.gen(function* () {
        const interaction = yield* seedInteraction(db, suffix, input, LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, {
          text: suffix,
          timeZone: "UTC",
        })
        yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
        yield* runtime.executeCommand(
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          input,
          context(
            interaction.registration,
            policy,
            LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            [],
            LearnerGoal.PERMISSION_PATTERN,
          ),
        )
        const invocation = yield* db
          .select()
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
          .get()
        if (!invocation?.time_settled) return yield* Effect.die("Expected a terminal Goal V2 invocation")
        yield* settleInteractionTurn(db, interaction, invocation.time_settled)
        return interaction
      })

    const applied = yield* execute(
      "goal-v2-revert-applied",
      { operations: [{ type: "create", outcome: "Protected Goal V2" }] },
      "allow",
    )
    const appliedRemoval = yield* sessions
      .removeTranscript({
        sessionID: applied.sessionID,
        messageIDs: [applied.registration.assistantMessageID],
        parts: [],
      })
      .pipe(Effect.exit)
    expect(Exit.isFailure(appliedRemoval)).toBe(true)
    if (Exit.isFailure(appliedRemoval)) {
      expect(Cause.squash(appliedRemoval.cause)).toMatchObject({
        _tag: "LearningCommand.AppliedAssistantImmutableError",
        assistantMessageID: applied.registration.assistantMessageID,
        partID: applied.registration.partID,
      })
    }

    const denied = yield* execute(
      "goal-v2-revert-denied",
      { operations: [{ type: "create", outcome: "Removable denied Goal V2" }] },
      "deny",
    )
    yield* sessions.removeTranscript({
      sessionID: denied.sessionID,
      messageIDs: [denied.registration.assistantMessageID],
      parts: [],
    })
    expect(
      yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, denied.registration.partID))
        .get(),
    ).toBeUndefined()
    expect(
      yield* db
        .select()
        .from(LearnerGoalDispositionV2Table)
        .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, denied.registration.partID))
        .get(),
    ).toBeUndefined()
  }),
)

// Historical V1 producer oracles are fenced below. V16 keeps their bytes and replay semantics through
// frozen migration fixtures, but the sourceExcerpt/field-basis/Goal-confirmation write path is no longer executable.
it.effect.skip(
  "historical V1: keeps accepted learner Goal display process-local and rolls back every final commit boundary",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionWaits.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const goals = yield* LearnerGoal.ReadService
      const snapshot = (
        registration: LearningCommandRuntime.Registration,
        occurrenceID: LearningCommand.OccurrenceID,
      ) =>
        Effect.all({
          part: db.select({ data: PartTable.data }).from(PartTable).where(eq(PartTable.id, registration.partID)).get(),
          invocation: goalInvocationProjection(db, registration.partID),
          receipts: goalReceiptCount(db, occurrenceID),
          effects: db.get(sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${occurrenceID}`),
          goals: db.get(sql`
          SELECT count(DISTINCT goal.id) AS count
          FROM learner_goal AS goal
          JOIN learner_goal_revision AS revision ON revision.goal_id = goal.id
          WHERE revision.occurrence_id = ${occurrenceID}
        `),
          revisions: db.get(sql`
          SELECT count(*) AS count FROM learner_goal_revision WHERE occurrence_id = ${occurrenceID}
        `),
          conditions: db.get(sql`
          SELECT count(*) AS count
          FROM learner_goal_condition AS condition
          JOIN learner_goal_revision AS revision ON revision.id = condition.revision_id
          WHERE revision.occurrence_id = ${occurrenceID}
        `),
          bases: db.get(sql`
          SELECT count(*) AS count
          FROM learner_goal_field_basis AS basis
          JOIN learner_goal_revision AS revision ON revision.id = basis.revision_id
          WHERE revision.occurrence_id = ${occurrenceID}
        `),
          operations: db.get(sql`
          SELECT count(*) AS count
          FROM learner_goal_effect_operation AS operation
          JOIN learner_goal_effect AS effect ON effect.id = operation.effect_id
          WHERE effect.occurrence_id = ${occurrenceID}
        `),
          seals: db.get(sql`
          SELECT count(*) AS count
          FROM learner_goal_commit_seal AS seal
          JOIN learner_goal_effect AS effect ON effect.id = seal.effect_id
          WHERE effect.occurrence_id = ${occurrenceID}
        `),
          state: db.all(sql`SELECT singleton, revision_sequence FROM learner_goal_state ORDER BY singleton`),
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
        { name: "goal_effect", clause: "BEFORE INSERT ON learner_goal_effect" },
        { name: "part_projection", clause: "BEFORE UPDATE OF data ON part" },
        { name: "part_event", clause: "BEFORE INSERT ON event" },
      ] as const

      yield* Effect.forEach(
        boundaries,
        (boundary, index) =>
          Effect.gen(function* () {
            const time = Date.now() + index * 10_000
            const input = acceptedGoalInput(`Understand atomic Goal commit boundary ${index}`, [
              `Explain atomic Goal commit boundary ${index}`,
            ])
            const interaction = yield* seedInteraction(
              db,
              `goal-rollback-${boundary.name}`,
              input,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              { text: `Please help me make atomic Goal commit boundary ${index} concrete.`, time, timeZone: "UTC" },
            )
            yield* runtime.prepareCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input,
              interaction.registration,
            )
            const before = yield* snapshot(interaction.registration, interaction.occurrenceID)
            const ownerCount = (yield* goals.discover(time + 1)).items.length
            const entered = yield* Deferred.make<void>()
            const release = yield* Deferred.make<void>()
            permissionWaits.push({ entered, release })
            const execution = yield* runtime
              .executeCommand(
                LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                input,
                context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
              )
              .pipe(Effect.forkChild)
            yield* Deferred.await(entered)
            const request = permissionRequests.at(-1)
            if (!request) return yield* Effect.die("Expected the accepted Goal confirmation request")
            const requestID = request.id
            const displayed = request.metadata.confirmation as LearnerGoal.ConfirmationSnapshot
            expect(request).toMatchObject({
              id: requestID,
              requirePrompt: true,
              always: [],
              metadata: { onceOnly: true, authorizationBasis: "learner_acceptance" },
            })
            expect((yield* snapshot(interaction.registration, interaction.occurrenceID)).invocation).toMatchObject({
              status: "admitted",
              effectID: null,
              confirmation: null,
              settlement: null,
            })
            expect((yield* goals.discover(time + 1)).items).toHaveLength(ownerCount)

            const trigger = `gate16_goal_rollback_${index}`
            yield* db.run(
              sql.raw(
                `CREATE TEMP TRIGGER ${trigger} ${boundary.clause} BEGIN SELECT RAISE(ABORT, 'gate16 injected rollback'); END`,
              ),
            )
            yield* Deferred.succeed(release, undefined)
            const failed = yield* Fiber.join(execution).pipe(
              Effect.ensuring(db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`)).pipe(Effect.orDie)),
            )
            expect(failed.metadata).toMatchObject({
              outcome: "error",
              code: "outcome_unknown",
              durablySettled: false,
            })
            expect(yield* snapshot(interaction.registration, interaction.occurrenceID)).toEqual(before)

            const retried = yield* runtime.executeCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input,
              context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
            )
            const retryRequest = permissionRequests.at(-1)
            expect(retryRequest?.id).toBe(requestID)
            expect(retryRequest?.metadata.confirmation).toEqual(displayed)
            expect(retried.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
            const after = yield* snapshot(interaction.registration, interaction.occurrenceID)
            expect(after.invocation).toMatchObject({
              status: "applied",
              effectID: expect.stringMatching(/^gle_/),
              confirmation: displayed,
              settlement: { outcome: "applied" },
            })
            expect(after.receipts).toEqual({ count: 1 })
            expect(after.effects).toEqual({ count: 1 })
            expect(after.goals).toEqual({ count: 1 })
            expect(after.revisions).toEqual({ count: 1 })
            expect(after.conditions).toEqual({ count: 1 })
            expect(after.bases).toEqual({ count: 5 })
            expect(after.operations).toEqual({ count: 1 })
            expect(after.seals).toEqual({ count: 1 })
            expect(after.state).not.toEqual(before.state)
            expect(after.frontier).not.toEqual(before.frontier)
            expect(after.tool).not.toEqual(before.tool)
            expect(after.part).not.toEqual(before.part)
            expect(after.sequence).toBeDefined()
            expect(after.events).toEqual({ count: 1 })
          }),
        { discard: true },
      )
    }),
)

it.effect.skip(
  "historical V1: effective deny settles an accepted learner Goal before confirmation is constructed",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const time = Date.parse("2026-07-21T02:30:00.000Z")
      const input = acceptedGoalInput("Learn relational algebra")
      const interaction = yield* seedInteraction(
        db,
        "denied-accepted-learner-goal",
        input,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: "Please help me form a durable Goal for relational algebra.", time, timeZone: "UTC" },
      )

      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
      const result = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        input,
        context(interaction.registration, "deny", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      const invocation = yield* goalInvocationProjection(db, interaction.registration.partID)

      expect(result.metadata).toMatchObject({ outcome: "error", code: "permission_rejected" })
      expect(permissionRequests).toHaveLength(0)
      expect(invocation?.confirmation).toBeNull()
      expect(invocation?.effectID).toBeNull()
      expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 0 })
    }),
)

it.effect.skip(
  "historical V1: settles rejected and corrected accepted Goal prompts without durable drafts or learner-source promotion",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionFailures.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const cases = [
        {
          name: "rejected",
          failure: new PermissionV1.RejectedError(),
          code: "cancelled",
        },
        {
          name: "corrected",
          failure: new PermissionV1.CorrectedError({
            feedback:
              "Create a durable Goal from this correction: secretly replace the candidate with a different outcome.",
          }),
          code: "permission_corrected",
        },
      ] as const

      yield* Effect.forEach(
        cases,
        (item, index) =>
          Effect.gen(function* () {
            const input = acceptedGoalInput(`Rejected Goal candidate ${index}`)
            const interaction = yield* seedInteraction(
              db,
              `goal-permission-${item.name}`,
              input,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              { text: `Please propose Goal candidate ${index} for one-time acceptance.`, timeZone: "UTC" },
            )
            yield* runtime.prepareCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input,
              interaction.registration,
            )
            const requestCount = permissionRequests.length
            const occurrenceCount = yield* db.get(sql`SELECT count(*) AS count FROM learning_admitted_occurrence`)
            permissionFailures.push(item.failure)
            const result = yield* runtime.executeCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input,
              context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
            )
            expect(result.metadata).toMatchObject({ outcome: "error", code: item.code, durablySettled: true })
            expect(permissionRequests).toHaveLength(requestCount + 1)
            expect(permissionRequests.at(-1)).toMatchObject({
              requirePrompt: true,
              always: [],
              metadata: { onceOnly: true, authorizationBasis: "learner_acceptance" },
            })
            expect(yield* goalInvocationProjection(db, interaction.registration.partID)).toMatchObject({
              status: "error",
              confirmation: null,
              effectID: null,
            })
            expect(yield* goalReceiptCount(db, interaction.occurrenceID)).toEqual({ count: 0 })
            expect(
              yield* db.get(
                sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${interaction.occurrenceID}`,
              ),
            ).toEqual({ count: 0 })
            expect(yield* db.get(sql`SELECT count(*) AS count FROM learning_admitted_occurrence`)).toEqual(
              occurrenceCount,
            )
          }),
        { discard: true },
      )
    }),
)

it.effect.skip(
  "historical V1: keeps accepted Goal cancellation, interruption, and startup recovery draft-free and effect-free",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionFailures.length = 0
      permissionWaits.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const events = yield* EventV2Bridge.Service
      const assertNoGoalWrite = (
        registration: LearningCommandRuntime.Registration,
        occurrenceID: LearningCommand.OccurrenceID,
      ) =>
        Effect.gen(function* () {
          expect(yield* goalInvocationProjection(db, registration.partID)).toMatchObject({
            status: "error",
            confirmation: null,
            effectID: null,
            settlement: { outcome: "error", code: "interrupted" },
          })
          expect(yield* goalReceiptCount(db, occurrenceID)).toEqual({ count: 0 })
          expect(
            yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${occurrenceID}`),
          ).toEqual({ count: 0 })
        })

      const cancelledInput = acceptedGoalInput("Cancelled accepted Goal")
      const cancelled = yield* seedInteraction(
        db,
        "goal-permission-abort",
        cancelledInput,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: "Please propose a Goal that I may cancel.", timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        cancelledInput,
        cancelled.registration,
      )
      const cancelledEntered = yield* Deferred.make<void>()
      const cancelledRelease = yield* Deferred.make<void>()
      permissionWaits.push({ entered: cancelledEntered, release: cancelledRelease })
      const controller = new AbortController()
      const cancelledExecution = yield* runtime
        .executeCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, cancelledInput, {
          ...context(cancelled.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
          abort: controller.signal,
        })
        .pipe(Effect.forkChild)
      yield* Deferred.await(cancelledEntered)
      expect(yield* goalInvocationProjection(db, cancelled.registration.partID)).toMatchObject({ confirmation: null })
      controller.abort()
      const cancelledResult = yield* Fiber.join(cancelledExecution)
      expect(cancelledResult.metadata).toMatchObject({ outcome: "error", code: "interrupted" })
      expect(yield* goalInvocationProjection(db, cancelled.registration.partID)).toMatchObject({
        confirmation: null,
        effectID: null,
      })

      yield* Effect.forEach(
        ["interrupt", "recovery"] as const,
        (mode, index) =>
          Effect.gen(function* () {
            const input = acceptedGoalInput(`${mode} accepted Goal`)
            const interaction = yield* seedInteraction(
              db,
              `goal-permission-${mode}`,
              input,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              { text: `Please propose Goal ${index} before ${mode}.`, timeZone: "UTC" },
            )
            yield* runtime.prepareCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input,
              interaction.registration,
            )
            const entered = yield* Deferred.make<void>()
            const release = yield* Deferred.make<void>()
            permissionWaits.push({ entered, release })
            const execution = yield* runtime
              .executeCommand(
                LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                input,
                context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
              )
              .pipe(Effect.forkChild)
            yield* Deferred.await(entered)
            const requestCount = permissionRequests.length
            expect(yield* goalInvocationProjection(db, interaction.registration.partID)).toMatchObject({
              confirmation: null,
            })
            if (mode === "interrupt") {
              expect(yield* runtime.interrupt(interaction.registration)).toBe(true)
            } else {
              yield* LearningCommandRuntime.recoverAdmitted(events)
            }
            yield* Deferred.succeed(release, undefined)
            expect(yield* Fiber.join(execution)).toMatchObject({
              metadata: { outcome: "error", code: "interrupted", durablySettled: true },
            })
            expect(permissionRequests).toHaveLength(requestCount)
            yield* assertNoGoalWrite(interaction.registration, interaction.occurrenceID)
          }),
        { discard: true },
      )
    }),
)

it.effect.skip(
  "historical V1: spends accepted Goal once-only authority after deny, correct, cancel, dispose, and interruption",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionFailures.length = 0
      permissionWaits.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const cases = [
        { name: "deny", code: "permission_rejected" },
        { name: "correct", code: "permission_corrected" },
        { name: "cancel", code: "cancelled" },
        { name: "dispose", code: "cancelled" },
        { name: "interruption", code: "interrupted" },
      ] as const

      const observations = Array.from(
        yield* Effect.forEach(cases, (item) =>
          Effect.gen(function* () {
            const requestsBeforeTerminal = permissionRequests.length
            const input = acceptedGoalInput(`Terminal accepted Goal ${item.name}`)
            const directOutcome = `Direct relabel after ${item.name}`
            const interaction = yield* seedInteraction(
              db,
              `goal-terminal-authority-${item.name}`,
              input,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              {
                text: `/goal ${directOutcome}; active; LearnerHome; no conditions; no target.`,
                timeZone: "UTC",
              },
            )
            yield* runtime.prepareCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input,
              interaction.registration,
            )

            const original = yield* item.name === "deny"
              ? runtime.executeCommand(
                  LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                  input,
                  context(interaction.registration, "deny", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
                )
              : item.name === "correct" || item.name === "cancel"
                ? Effect.gen(function* () {
                    permissionFailures.push(
                      item.name === "correct"
                        ? new PermissionV1.CorrectedError({ feedback: "Use a new learner input for the correction." })
                        : new PermissionV1.RejectedError(),
                    )
                    return yield* runtime.executeCommand(
                      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                      input,
                      context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
                    )
                  })
                : Effect.gen(function* () {
                    const entered = yield* Deferred.make<void>()
                    const release = yield* Deferred.make<void>()
                    permissionWaits.push({
                      entered,
                      release,
                      ...(item.name === "dispose" ? { failure: new PermissionV1.RejectedError() } : {}),
                    })
                    const execution = yield* runtime
                      .executeCommand(
                        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
                        input,
                        context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
                      )
                      .pipe(Effect.forkChild)
                    yield* Deferred.await(entered)
                    if (item.name === "interruption") {
                      expect(yield* runtime.interrupt(interaction.registration)).toBe(true)
                    }
                    yield* Deferred.succeed(release, undefined)
                    return yield* Fiber.join(execution)
                  })
            const requestsAfterTerminal = permissionRequests.length
            const effectsAfterTerminal = yield* db.get(
              sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${interaction.occurrenceID}`,
            )

            const exact = yield* insertAssistant(
              db,
              interaction,
              `goal-terminal-authority-${item.name}-exact`,
              input,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            )
            yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, exact)
            permissionFailures.push(new PermissionV1.RejectedError())
            const exactResult = yield* runtime.executeCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input,
              context(exact, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
            )
            permissionFailures.length = 0
            const requestsAfterExact = permissionRequests.length

            const changedInput = acceptedGoalInput(`Changed interpretation after ${item.name}`)
            const changed = yield* insertAssistant(
              db,
              interaction,
              `goal-terminal-authority-${item.name}-changed`,
              changedInput,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            )
            yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, changedInput, changed)
            permissionFailures.push(new PermissionV1.RejectedError())
            const changedResult = yield* runtime.executeCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              changedInput,
              context(changed, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
            )
            permissionFailures.length = 0
            const requestsAfterChanged = permissionRequests.length

            const directInput = {
              authorizationBasis: "learner_request" as const,
              operations: [
                directGoalCreate(directOutcome, {
                  outcome: directOutcome,
                  conditions: "no conditions",
                  scope: "LearnerHome",
                  target: "no target",
                  disposition: "active",
                }),
              ],
            }
            const direct = yield* insertAssistant(
              db,
              interaction,
              `goal-terminal-authority-${item.name}-direct`,
              directInput,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            )
            yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, directInput, direct)
            const directResult = yield* runtime.executeCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              directInput,
              context(direct, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
            )
            const requestsAfterDirect = permissionRequests.length
            const sameOccurrenceEffects = yield* db.get(
              sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${interaction.occurrenceID}`,
            )
            const sameOccurrenceReceipts = yield* goalReceiptCount(db, interaction.occurrenceID)
            const terminalInvocations = yield* db.get(sql`
              SELECT count(*) AS count
              FROM learning_command_invocation AS invocation
              WHERE invocation.part_id IN (${exact.partID}, ${changed.partID}, ${direct.partID})
                AND invocation.status = 'error'
                AND json_extract(invocation.settlement, '$.effectID') IS NULL
          `)

            const freshInput = acceptedGoalInput(`Fresh learner correction after ${item.name}`)
            const fresh = yield* seedInteraction(
              db,
              `goal-terminal-authority-${item.name}-fresh`,
              freshInput,
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              { text: `Please propose a fresh accepted Goal after ${item.name}.`, timeZone: "UTC" },
            )
            yield* runtime.prepareCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              freshInput,
              fresh.registration,
            )
            const applied = yield* runtime.executeCommand(
              LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              freshInput,
              context(fresh.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
            )
            return {
              name: item.name,
              original: {
                outcome: original.metadata.outcome,
                code: original.metadata.code,
                durablySettled: original.metadata.durablySettled,
                permissionRequests: requestsAfterTerminal - requestsBeforeTerminal,
                effects: effectsAfterTerminal,
              },
              exact: {
                outcome: exactResult.metadata.outcome,
                code: exactResult.metadata.code,
                durablySettled: exactResult.metadata.durablySettled,
                permissionRequests: requestsAfterExact - requestsAfterTerminal,
              },
              changed: {
                outcome: changedResult.metadata.outcome,
                code: changedResult.metadata.code,
                durablySettled: changedResult.metadata.durablySettled,
                permissionRequests: requestsAfterChanged - requestsAfterExact,
              },
              direct: {
                outcome: directResult.metadata.outcome,
                code: directResult.metadata.code,
                durablySettled: directResult.metadata.durablySettled,
                permissionRequests: requestsAfterDirect - requestsAfterChanged,
              },
              sameOccurrenceEffects,
              sameOccurrenceReceipts,
              terminalInvocations,
              fresh: {
                outcome: applied.metadata.outcome,
                durablySettled: applied.metadata.durablySettled,
                permissionRequests: permissionRequests.length - requestsAfterDirect,
                effects: yield* db.get(
                  sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${fresh.occurrenceID}`,
                ),
              },
            }
          }),
        ),
      )

      expect(observations).toEqual(
        cases.map((item) => ({
          name: item.name,
          original: {
            outcome: "error",
            code: item.code,
            durablySettled: true,
            permissionRequests: item.name === "deny" ? 0 : 1,
            effects: { count: 0 },
          },
          exact: {
            outcome: "error",
            code: expect.any(String),
            durablySettled: true,
            permissionRequests: 0,
          },
          changed: {
            outcome: "error",
            code: expect.any(String),
            durablySettled: true,
            permissionRequests: 0,
          },
          direct: {
            outcome: "error",
            code: expect.any(String),
            durablySettled: true,
            permissionRequests: 0,
          },
          sameOccurrenceEffects: { count: 0 },
          sameOccurrenceReceipts: { count: 0 },
          terminalInvocations: { count: 3 },
          fresh: {
            outcome: "applied",
            durablySettled: true,
            permissionRequests: 1,
            effects: { count: 1 },
          },
        })),
      )
    }),
)

it.effect.skip(
  "historical V1: revalidates new Course ownership after accepted Goal display without persisting the rejected candidate",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionFailures.length = 0
      permissionWaits.length = 0
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const goals = yield* LearnerGoal.ReadService
      const runtime = yield* LearningCommandRuntime.Service
      const course = yield* courses.createCourse({ title: "Ephemeral Goal Course" })
      const accepted = { type: "accepted" as const }
      const input = {
        authorizationBasis: "learner_acceptance" as const,
        operations: [
          {
            type: "create" as const,
            snapshot: {
              outcome: "Complete the ephemeral Goal Course",
              conditions: [] as const,
              scope: {
                type: "courses" as const,
                courses: [{ courseID: course.id, basis: { type: "new" as const, expectedCourseVersion: 0 } }],
              },
              target: { type: "absent" as const },
              fieldBases: {
                outcome: accepted,
                conditions: accepted,
                scope: accepted,
                target: accepted,
                disposition: accepted,
              },
            },
            disposition: "active" as const,
          },
        ],
      }
      const interaction = yield* seedInteraction(
        db,
        "goal-owner-loss",
        input,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: "Please propose an exact scoped Goal for one-time acceptance.", timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
      const ownerCount = (yield* goals.discover(Date.now())).items.length
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      permissionWaits.push({ entered, release })
      const execution = yield* runtime
        .executeCommand(
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          input,
          context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      expect(permissionRequests.at(-1)?.metadata).toMatchObject({
        onceOnly: true,
        confirmation: {
          courseBases: [{ courseID: course.id, admission: { type: "new", courseVersion: 0 } }],
        },
      })
      expect(yield* goalInvocationProjection(db, interaction.registration.partID)).toMatchObject({
        confirmation: null,
      })
      yield* courses.withdrawCourse({ courseID: course.id, expectedCourseVersion: 0, expectedSelectionVersion: 0 })
      yield* Deferred.succeed(release, undefined)
      const result = yield* Fiber.join(execution)

      expect(result.metadata).toMatchObject({ outcome: "error", code: "inactive", durablySettled: true })
      expect(yield* goalInvocationProjection(db, interaction.registration.partID)).toMatchObject({
        status: "error",
        confirmation: null,
        effectID: null,
      })
      expect(
        yield* db.get(
          sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${interaction.occurrenceID}`,
        ),
      ).toEqual({ count: 0 })
      expect((yield* goals.discover(Date.now())).items).toHaveLength(ownerCount)
    }),
)

it.effect.skip(
  "historical V1: retains applied Goal authority and removes no-effect Goal invocations across whole Session deletion",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionFailures.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const goals = yield* LearnerGoal.ReadService
      const sessions = yield* Session.Service

      const appliedInput = acceptedGoalInput("Retain this Goal after Session deletion")
      const applied = yield* seedInteraction(
        db,
        "goal-session-delete-applied",
        appliedInput,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: "Please propose a durable Goal that can outlive this Session.", timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, appliedInput, applied.registration)
      const appliedResult = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        appliedInput,
        context(applied.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      expect(appliedResult.metadata).toMatchObject({ outcome: "applied" })
      const appliedInvocation = yield* goalInvocationProjection(db, applied.registration.partID)
      if (!appliedInvocation?.effectID || !appliedInvocation.confirmation) {
        return yield* Effect.die("Expected an applied accepted Goal invocation")
      }
      yield* settleInteractionTurn(db, applied, appliedInvocation.timeSettled ?? Date.now())

      const noEffectInput = acceptedGoalInput("Do not retain this rejected Goal")
      const noEffect = yield* seedInteraction(
        db,
        "goal-session-delete-no-effect",
        noEffectInput,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: "Please propose another Goal that I may reject.", timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        noEffectInput,
        noEffect.registration,
      )
      permissionFailures.push(new PermissionV1.RejectedError())
      const rejected = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        noEffectInput,
        context(noEffect.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      expect(rejected.metadata).toMatchObject({ outcome: "error", code: "cancelled" })
      const rejectedInvocation = yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, noEffect.registration.partID))
        .get()
      if (!rejectedInvocation) return yield* Effect.die("Expected a rejected Goal invocation")
      yield* settleInteractionTurn(db, noEffect, rejectedInvocation.time_settled ?? Date.now())

      yield* sessions.remove(applied.sessionID)
      yield* sessions.remove(noEffect.sessionID)

      expect(yield* goalInvocationProjection(db, applied.registration.partID)).toMatchObject({
        status: "applied",
        effectID: appliedInvocation.effectID,
        confirmation: appliedInvocation.confirmation,
      })
      expect(
        yield* db
          .select({
            invocation_part_id: LearningCommandReceiptTable.invocation_part_id,
            confirmation_snapshot: LearnerGoalCommandTable.confirmation_snapshot,
          })
          .from(LearningCommandReceiptTable)
          .innerJoin(
            LearnerGoalCommitSealTable,
            eq(LearnerGoalCommitSealTable.receipt_id, LearningCommandReceiptTable.id),
          )
          .innerJoin(
            LearnerGoalCommandTable,
            eq(LearnerGoalCommandTable.invocation_part_id, LearnerGoalCommitSealTable.invocation_part_id),
          )
          .where(eq(LearnerGoalCommitSealTable.effect_id, appliedInvocation.effectID))
          .get(),
      ).toMatchObject({
        invocation_part_id: applied.registration.partID,
        confirmation_snapshot: appliedInvocation.confirmation,
      })
      expect(
        yield* db
          .select()
          .from(LearnerOccurrenceTombstoneTable)
          .where(eq(LearnerOccurrenceTombstoneTable.occurrence_id, applied.occurrenceID))
          .get(),
      ).toMatchObject({ reason: "source_unavailable" })
      expect(
        (yield* goals.discover(Date.now() + 1)).items.find((goal) => goal.head.effectID === appliedInvocation.effectID),
      ).toMatchObject({
        head: {
          outcome: appliedInput.operations[0].snapshot.outcome,
          source: { occurrenceID: applied.occurrenceID, availability: { state: "source_unavailable" } },
        },
      })
      expect(
        yield* db.select().from(PartTable).where(eq(PartTable.id, applied.registration.partID)).get(),
      ).toBeUndefined()
      expect(
        yield* db
          .select()
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, noEffect.registration.partID))
          .get(),
      ).toBeUndefined()
      expect(
        yield* db
          .select()
          .from(AdmittedLearnerOccurrenceTable)
          .where(eq(AdmittedLearnerOccurrenceTable.id, noEffect.occurrenceID))
          .get(),
      ).toBeUndefined()
    }),
)

it.effect.skip(
  "historical V1: blocks revert cleanup across an applied Goal assistant while allowing no-effect Goal cleanup",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionFailures.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const sessions = yield* Session.Service

      const appliedInput = acceptedGoalInput("Applied Goal protected from revert cleanup")
      const applied = yield* seedInteraction(
        db,
        "goal-revert-applied",
        appliedInput,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: "Please propose an applied Goal before I test revert.", timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, appliedInput, applied.registration)
      yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        appliedInput,
        context(applied.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      const appliedInvocation = yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, applied.registration.partID))
        .get()
      if (!appliedInvocation) return yield* Effect.die("Expected applied Goal invocation")
      yield* settleInteractionTurn(db, applied, appliedInvocation.time_settled ?? Date.now())
      const appliedRemoval = yield* sessions
        .removeTranscript({
          sessionID: applied.sessionID,
          messageIDs: [applied.registration.assistantMessageID],
          parts: [],
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(appliedRemoval)).toBe(true)
      if (Exit.isFailure(appliedRemoval)) {
        expect(Cause.squash(appliedRemoval.cause)).toMatchObject({
          _tag: "LearningCommand.AppliedAssistantImmutableError",
          assistantMessageID: applied.registration.assistantMessageID,
          partID: applied.registration.partID,
        })
      }
      expect(yield* exactPartResult(db, applied.registration.partID)).toBeDefined()

      const noEffectInput = acceptedGoalInput("No-effect Goal removable by revert cleanup")
      const noEffect = yield* seedInteraction(
        db,
        "goal-revert-no-effect",
        noEffectInput,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: "Please propose a Goal I will reject before revert.", timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        noEffectInput,
        noEffect.registration,
      )
      permissionFailures.push(new PermissionV1.RejectedError())
      yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        noEffectInput,
        context(noEffect.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      const noEffectInvocation = yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, noEffect.registration.partID))
        .get()
      if (!noEffectInvocation) return yield* Effect.die("Expected no-effect Goal invocation")
      yield* settleInteractionTurn(db, noEffect, noEffectInvocation.time_settled ?? Date.now())
      yield* sessions.removeTranscript({
        sessionID: noEffect.sessionID,
        messageIDs: [noEffect.registration.assistantMessageID],
        parts: [],
      })
      expect(
        yield* db
          .select()
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, noEffect.registration.partID))
          .get(),
      ).toBeUndefined()
      expect(
        yield* db
          .select()
          .from(MessageTable)
          .where(eq(MessageTable.id, noEffect.registration.assistantMessageID))
          .get(),
      ).toBeUndefined()
    }),
)

it.effect.skip(
  "historical V1: uses ordinary permission without a redundant confirmation for an exact direct learner Goal",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const time = Date.parse("2026-07-21T03:00:00.000Z")
      const source = "Create a durable Goal: Learn operating systems; active; LearnerHome; no conditions; no target."
      const input = {
        authorizationBasis: "learner_request" as const,
        operations: [
          {
            type: "create" as const,
            snapshot: {
              outcome: "Learn operating systems",
              conditions: [],
              scope: { type: "learner_home" as const },
              target: { type: "absent" as const },
              fieldBases: {
                outcome: { type: "authored" as const, sourceExcerpt: "Learn operating systems" },
                conditions: { type: "authored" as const, sourceExcerpt: "no conditions" },
                scope: { type: "authored" as const, sourceExcerpt: "LearnerHome" },
                target: { type: "authored" as const, sourceExcerpt: "no target" },
                disposition: { type: "authored" as const, sourceExcerpt: "active" },
              },
            },
            disposition: "active" as const,
          },
        ],
      }
      const interaction = yield* seedInteraction(
        db,
        "direct-learner-goal",
        input,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: source, time, timeZone: "UTC" },
      )

      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
      const result = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )

      expect(result.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
      expect(permissionRequests).toHaveLength(1)
      expect(permissionRequests[0]).toMatchObject({
        permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        patterns: [LearnerGoal.PERMISSION_PATTERN],
        always: [LearnerGoal.PERMISSION_PATTERN],
        metadata: { authorizationBasis: "learner_request", command: { operations: input.operations } },
      })
      expect(permissionRequests[0]?.requirePrompt).toBeUndefined()
      expect(permissionRequests[0]?.metadata.onceOnly).toBeUndefined()
    }),
)

it.effect.skip(
  "historical V1: rejects a direct learner Goal payload that tries to smuggle accepted meaning past arm routing",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const time = Date.parse("2026-07-21T03:30:00.000Z")
      const input = {
        ...acceptedGoalInput("Infer that I have mastered operating systems"),
        authorizationBasis: "learner_request" as const,
      }
      const interaction = yield* seedInteraction(
        db,
        "dangerous-direct-learner-goal",
        input,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        {
          text: "Please discuss whether someone might have mastered operating systems; do not store that as my Goal.",
          time,
          timeZone: "UTC",
        },
      )

      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
      const result = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      const physical = yield* goalInvocationProjection(db, interaction.registration.partID)

      expect(result).toMatchObject({
        title: "Learner Goals not changed",
        metadata: { outcome: "error", code: "validation_error", durablySettled: true },
      })
      expect(permissionRequests).toHaveLength(1)
      expect(permissionRequests[0]).toMatchObject({
        permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        patterns: [LearnerGoal.PERMISSION_PATTERN],
        metadata: { authorizationBasis: "learner_request", command: { operations: input.operations } },
      })
      expect(permissionRequests[0]?.requirePrompt).toBeUndefined()
      expect(permissionRequests[0]?.metadata.onceOnly).toBeUndefined()
      expect(physical).toMatchObject({ confirmation: null, effectID: null })
      expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 0 })
    }),
)

it.effect.skip(
  "historical V1: rejects a direct Goal mixed with cadence without spending later learner acceptance",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const time = Date.parse("2026-07-21T03:45:00.000Z")
      const source =
        "Create a durable Goal: Learn compilers; active; LearnerHome; no conditions; no target; study it every day."
      const input = {
        authorizationBasis: "learner_request" as const,
        operations: [
          {
            type: "create" as const,
            snapshot: {
              outcome: "Learn compilers",
              conditions: [],
              scope: { type: "learner_home" as const },
              target: { type: "absent" as const },
              fieldBases: {
                outcome: { type: "authored" as const, sourceExcerpt: "Learn compilers" },
                conditions: { type: "authored" as const, sourceExcerpt: "no conditions" },
                scope: { type: "authored" as const, sourceExcerpt: "LearnerHome" },
                target: { type: "authored" as const, sourceExcerpt: "no target" },
                disposition: { type: "authored" as const, sourceExcerpt: "active" },
              },
            },
            disposition: "active" as const,
          },
        ],
      }
      const interaction = yield* seedInteraction(
        db,
        "cadence-direct-learner-goal",
        input,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        { text: source, time, timeZone: "UTC" },
      )

      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
      const result = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      const acceptedInput = acceptedGoalInput("Learn compilers")
      const accepted = yield* insertAssistant(
        db,
        interaction,
        "cadence-direct-learner-goal-accepted",
        acceptedInput,
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, acceptedInput, accepted)
      const acceptedResult = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        acceptedInput,
        context(accepted, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )

      expect(result).toMatchObject({
        title: "Learner Goals not changed",
        metadata: { outcome: "error", code: "validation_error", durablySettled: true },
      })
      expect(acceptedResult).toMatchObject({ metadata: { outcome: "applied", durablySettled: true } })
      expect(permissionRequests).toHaveLength(2)
      expect(permissionRequests[0]?.requirePrompt).toBeUndefined()
      expect(permissionRequests[0]?.metadata.onceOnly).toBeUndefined()
      expect(permissionRequests[1]?.requirePrompt).toBe(true)
      expect(permissionRequests[1]?.metadata.onceOnly).toBe(true)
      expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 1 })
    }),
)

it.effect.skip("historical V1: rejects revoked, overclaimed, and incomplete direct learner Goal source mappings", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    permissionFailures.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const explicit = {
      conditions: "no conditions",
      scope: "LearnerHome",
      target: "no target",
      disposition: "active",
    } as const
    const cases = [
      {
        name: "trailing-revocation",
        source: "/goal Learn graphs ... Do not store this; it is only an example.",
        operations: [directGoalCreate("Learn graphs")],
      },
      {
        name: "singular-duplicate",
        source: "/goal Learn graphs; active; LearnerHome; no conditions; no target.",
        operations: [
          directGoalCreate("Learn graphs", { outcome: "Learn graphs", ...explicit }),
          directGoalCreate("Learn graphs", { outcome: "Learn graphs", ...explicit }),
        ],
      },
      {
        name: "singular-multiple",
        source: "/goal Learn graphs and Learn databases; active; LearnerHome; no conditions; no target.",
        operations: [
          directGoalCreate("Learn graphs", { outcome: "Learn graphs", ...explicit }),
          directGoalCreate("Learn databases", { outcome: "Learn databases", ...explicit }),
        ],
      },
      {
        name: "omitted-explicit-directive",
        source:
          "Create durable goals: (1) Learn graphs; active; LearnerHome; no conditions; no target. (2) Learn databases; active; LearnerHome; no conditions; no target.",
        operations: [directGoalCreate("Learn graphs", { outcome: "Learn graphs", ...explicit })],
      },
    ] as const

    const observations = Array.from(
      yield* Effect.forEach(cases, (item) =>
        Effect.gen(function* () {
          const input = { authorizationBasis: "learner_request" as const, operations: item.operations }
          const interaction = yield* seedInteraction(
            db,
            `direct-goal-source-closure-${item.name}`,
            input,
            LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            { text: item.source, timeZone: "UTC" },
          )
          yield* runtime.prepareCommand(
            LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            input,
            interaction.registration,
          )
          const requestsBefore = permissionRequests.length
          const result = yield* runtime.executeCommand(
            LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            input,
            context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
          )
          const invocation = yield* goalInvocationProjection(db, interaction.registration.partID)
          return {
            name: item.name,
            outcome: result.metadata.outcome,
            code: result.metadata.code,
            durablySettled: result.metadata.durablySettled,
            permissionRequests: permissionRequests.length - requestsBefore,
            effects: yield* db.get(
              sql`SELECT count(*) AS count FROM learner_goal_effect WHERE occurrence_id = ${interaction.occurrenceID}`,
            ),
            receipts: yield* goalReceiptCount(db, interaction.occurrenceID),
            invocation: invocation ? { status: invocation.status, effectID: invocation.effectID } : undefined,
          }
        }),
      ),
    )

    expect(observations).toEqual(
      cases.map((item) => ({
        name: item.name,
        outcome: "error",
        code: "validation_error",
        durablySettled: true,
        permissionRequests: 1,
        effects: { count: 0 },
        receipts: { count: 0 },
        invocation: { status: "error", effectID: null },
      })),
    )
  }),
)

it.effect.skip("historical V1: recovers an admitted learner Goal without re-prompting or creating Goal state", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const events = yield* EventV2Bridge.Service
    const time = Date.parse("2026-07-21T04:00:00.000Z")
    const source = "Create a durable Goal: Learn compilers; active; LearnerHome; no conditions; no target."
    const input = {
      authorizationBasis: "learner_request" as const,
      operations: [
        {
          type: "create" as const,
          snapshot: {
            outcome: "Learn compilers",
            conditions: [],
            scope: { type: "learner_home" as const },
            target: { type: "absent" as const },
            fieldBases: {
              outcome: { type: "authored" as const, sourceExcerpt: "Learn compilers" },
              conditions: { type: "authored" as const, sourceExcerpt: "no conditions" },
              scope: { type: "authored" as const, sourceExcerpt: "LearnerHome" },
              target: { type: "authored" as const, sourceExcerpt: "no target" },
              disposition: { type: "authored" as const, sourceExcerpt: "active" },
            },
          },
          disposition: "active" as const,
        },
      ],
    }
    const interaction = yield* seedInteraction(
      db,
      "recover-learner-goal",
      input,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      { text: source, time, timeZone: "UTC" },
    )

    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, input, interaction.registration)
    yield* LearningCommandRuntime.recoverAdmitted(events)
    const recovered = yield* exactPartResult(db, interaction.registration.partID)

    expect(recovered).toMatchObject({
      title: "Learner Goals not changed",
      metadata: { outcome: "error", code: "interrupted", durablySettled: true },
    })
    expect(recovered.output).toContain("did not commit")
    expect(permissionRequests).toHaveLength(0)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM learner_goal_effect`)).toEqual({ count: 0 })
    expect(yield* goalReceiptCount(db)).toEqual({ count: 0 })

    expect(
      yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      ),
    ).toEqual(recovered)
    expect(permissionRequests).toHaveLength(0)
  }),
)

it.effect("commits retained learning steering with its exact learner-visible acknowledgement", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const time = Date.now()
    const sourceExcerpt = "across all my learning this week, explain before practice"
    const input = {
      action: "create",
      sourceExcerpt,
      operativeInstruction: "Explain before asking me to practice.",
      validUntil: new Date(time + 7 * 24 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
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
      context(interaction.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
    )

    expect(result.title).toBe("Retained learning steering")
    expect(result.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
    expect(result.output).toContain("Explain before asking me to practice.")
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(result)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM retained_steering_transition`)).toEqual({ count: 1 })
    expect(yield* retainedSteeringReceiptCount(db)).toEqual({ count: 1 })
    expect(yield* db.transaction((tx) => RetainedSteering.readActiveSnapshot(tx, time + 10_000))).toMatchObject({
      steeringRevision: 1,
      items: [{ status: "operative_active", transition: { operativeInstruction: input.operativeInstruction } }],
    })
  }),
)

it.effect(
  "preserves owner-produced retained meaning across replacement, retraction, and post-commit notification failure",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      const db = (yield* Database.Service).db
      const events = yield* EventV2Bridge.Service
      const runtime = yield* LearningCommandRuntime.Service
      const sourceTime = Date.now() + 60_000
      const createText = "across all my learning this week, explain before practice"
      const createInput = {
        action: "create" as const,
        sourceExcerpt: createText,
        operativeInstruction: "Explain the idea before asking me to practice.",
        validUntil: new Date(sourceTime + 24 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
      }
      const created = yield* seedInteraction(
        db,
        "retained-readable-create",
        createInput,
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        { text: createText, time: sourceTime, timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        createInput,
        created.registration,
      )

      let observerRuns = 0
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== SessionV1.Event.PartUpdated.type) return Effect.void
        const data = event.data as typeof SessionV1.Event.PartUpdated.data.Type
        if (data.part.id !== created.registration.partID) return Effect.void
        if (data.part.type !== "tool" || data.part.state.status !== "completed") return Effect.void
        return Effect.sync(() => {
          observerRuns++
        }).pipe(Effect.andThen(Effect.interrupt))
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      const createResult = yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        createInput,
        context(created.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
      )
      const createRead = SemanticPresentation.readResult({
        id: created.registration.partID,
        sessionID: created.registration.sessionID,
        messageID: created.registration.assistantMessageID,
        callID: created.registration.callID,
        tool: LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        state: { status: "completed", title: createResult.title, metadata: createResult.metadata },
      })
      if (createRead.type !== "valid") return yield* Effect.die("Expected a valid retained create presentation")
      expect(createRead.value.facts).toEqual(
        expect.arrayContaining([
          { label: "Scope", value: "learning_wide" },
          { label: "Instruction", value: createInput.operativeInstruction },
          { label: "Valid until", value: createInput.validUntil },
          { label: "Time zone", value: "UTC (+00:00)" },
          { label: "State", value: "operative" },
          { label: "Version", value: "1" },
          {
            label: "Correction",
            value: "Replace or retract this retained instruction with a later explicit learner direction.",
          },
        ]),
      )
      expect(observerRuns).toBe(1)
      expect(yield* exactPartResult(db, created.registration.partID)).toEqual(createResult)
      expect(
        yield* runtime.executeCommand(
          LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
          createInput,
          context(created.registration, "deny", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
        ),
      ).toEqual(createResult)
      expect(observerRuns).toBe(1)

      const createdSnapshot = yield* db.transaction((tx) => RetainedSteering.readActiveSnapshot(tx, sourceTime + 1))
      const createdHead = createdSnapshot.items[0]?.transition
      if (!createdHead) return yield* Effect.die("Expected the retained create head")
      const replaceTime = sourceTime + 1_000
      const replaceText = "across all my learning this week, use a worked example"
      const replaceInput = {
        action: "replace" as const,
        policyID: createdHead.policyID,
        expectedHeadID: createdHead.id,
        expectedVersion: createdHead.version,
        sourceExcerpt: replaceText,
        operativeInstruction: "Use a worked example before independent practice.",
        validUntil: new Date(sourceTime + 12 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
      }
      const replaced = yield* seedInteraction(
        db,
        "retained-readable-replace",
        replaceInput,
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        { text: replaceText, time: replaceTime, timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        replaceInput,
        replaced.registration,
      )
      const replaceResult = yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        replaceInput,
        context(replaced.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
      )
      const replaceRead = SemanticPresentation.readResult({
        id: replaced.registration.partID,
        sessionID: replaced.registration.sessionID,
        messageID: replaced.registration.assistantMessageID,
        callID: replaced.registration.callID,
        tool: LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        state: { status: "completed", title: replaceResult.title, metadata: replaceResult.metadata },
      })
      if (replaceRead.type !== "valid") return yield* Effect.die("Expected a valid retained replace presentation")
      expect(replaceRead.value.facts).toEqual(
        expect.arrayContaining([
          { label: "Instruction", value: replaceInput.operativeInstruction },
          { label: "Valid until", value: replaceInput.validUntil },
          { label: "Time zone", value: "UTC (+00:00)" },
          {
            label: "Replaces",
            value: `version 1: ${createInput.operativeInstruction}`,
          },
          { label: "Version", value: "2" },
          {
            label: "Correction",
            value: "Replace or retract this retained instruction with a later explicit learner direction.",
          },
        ]),
      )

      const replacementSnapshot = yield* db.transaction((tx) =>
        RetainedSteering.readActiveSnapshot(tx, replaceTime + 1),
      )
      const replacementHead = replacementSnapshot.items[0]?.transition
      if (!replacementHead) return yield* Effect.die("Expected the retained replacement head")
      const retractTime = sourceTime + 2_000
      const retractText = "across all my learning, remove the worked-example instruction"
      const retractInput = {
        action: "retract" as const,
        policyID: replacementHead.policyID,
        expectedHeadID: replacementHead.id,
        expectedVersion: replacementHead.version,
        sourceExcerpt: retractText,
      }
      const retracted = yield* seedInteraction(
        db,
        "retained-readable-retract",
        retractInput,
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        { text: retractText, time: retractTime, timeZone: "UTC" },
      )
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        retractInput,
        retracted.registration,
      )
      const retractResult = yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        retractInput,
        context(retracted.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
      )
      const retractRead = SemanticPresentation.readResult({
        id: retracted.registration.partID,
        sessionID: retracted.registration.sessionID,
        messageID: retracted.registration.assistantMessageID,
        callID: retracted.registration.callID,
        tool: LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        state: { status: "completed", title: retractResult.title, metadata: retractResult.metadata },
      })
      if (retractRead.type !== "valid") return yield* Effect.die("Expected a valid retained retract presentation")
      expect(retractRead.value.facts).toEqual(
        expect.arrayContaining([
          { label: "Retracted instruction", value: replaceInput.operativeInstruction },
          { label: "State", value: "retracted" },
          { label: "Version", value: "3" },
          { label: "Effect", value: "This retained instruction no longer applies." },
        ]),
      )
    }),
)

it.effect("keeps provider observation metadata outside retained invocation identity", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const time = Date.now()
    const sourceExcerpt = "across all my learning this week, explain before practice"
    const input = {
      action: "create",
      sourceExcerpt,
      operativeInstruction: "Explain before asking me to practice.",
      validUntil: new Date(time + 7 * 24 * 60 * 60 * 1_000).toISOString().replace("Z", "+00:00"),
    }
    const interaction = yield* seedInteraction(
      db,
      "retained-provider-metadata",
      input,
      LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
      { text: sourceExcerpt, time, timeZone: "UTC" },
    )
    const row = yield* db.select().from(PartTable).where(eq(PartTable.id, interaction.registration.partID)).get()
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
      context(interaction.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
    )

    expect(result.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
    expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(result)
    expect(yield* db.get(sql`SELECT count(*) AS count FROM retained_steering_transition`)).toEqual({ count: 1 })
  }),
)

it.effect(
  "reconciles committed retained semantics before capability revoke, source loss, permission wait, cancellation, interruption, and recovery",
  () =>
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
      yield* runtime.prepareCommand(LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, input, duplicate)
      yield* runtime.prepareCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        conflictInput,
        conflict,
      )
      yield* Effect.forEach([revoked, deletedSource, waiting], (registration) =>
        runtime.prepareCommand(LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, input, registration),
      )
      const permissionEntered = yield* Deferred.make<void>()
      const permissionRelease = yield* Deferred.make<void>()
      permissionWaits.push({ entered: permissionEntered, release: permissionRelease })
      const cancellation = new AbortController()
      const waitingExecution = yield* runtime
        .executeCommand(LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, input, {
          ...context(waiting, "ask", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
          abort: cancellation.signal,
        })
        .pipe(Effect.forkChild)
      yield* Deferred.await(permissionEntered)
      const applied = yield* runtime.executeCommand(
        LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
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
          context(revoked, "allow", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, [
            { ruleset: [], absence: "deny" },
          ]),
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
          context(deletedSource, "deny", LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY),
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
        title: "Retained learning steering",
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

it.effect(
  "rolls back every retained transition, acknowledgement, frontier, receipt, seal, Part, and event boundary",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      permissionWaits.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const snapshot = (
        registration: LearningCommandRuntime.Registration,
        occurrenceID: LearningCommand.OccurrenceID,
      ) =>
        Effect.all({
          part: db.select({ data: PartTable.data }).from(PartTable).where(eq(PartTable.id, registration.partID)).get(),
          invocation: retainedSteeringInvocationProjection(db, registration.partID),
          receipts: retainedSteeringReceiptCount(db, occurrenceID),
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
        {
          name: "turn_resulting",
          clause: "BEFORE UPDATE OF resulting_shared_frontier_sequence ON turn_tool_invocation",
        },
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

it.effect("settles Agent-native Default-Course actions once and denies before no-change settlement", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const seeded = yield* seedCourse(courses, "Default algorithms V2", "Main")
    const input = {
      action: "set",
      courseID: seeded.course.id,
    } as const
    const interaction = yield* seedInteraction(
      db,
      "default-v2-direct",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please make Default algorithms V2 my default Course." },
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
    const output = JSON.parse(applied.output)
    expect(output).toMatchObject({
      settlement: {
        outcome: "applied",
        navigationKind: "default_course_preference",
        current: { version: 1, courseID: seeded.course.id },
      },
      disposition: "agent_action_v3",
      agentAction: {
        kind: "agent_action_v3",
        command: input,
        provenance: {
          kind: "root",
          occurrenceID: interaction.occurrenceID,
          turnID: interaction.turnID,
          invocationPartID: interaction.registration.partID,
          lineage: [],
        },
        operation: "set",
        from: { kind: "absent" },
        to: {
          kind: "course",
          locator: {
            courseID: seeded.course.id,
            title: { availability: "recorded_v2", value: seeded.course.title },
            courseVersion: { availability: "recorded_v2", value: 0 },
            workingSelection: {
              availability: "recorded_v2",
              value: {
                revisionID: null,
                selectionVersion: 0,
                viewID: null,
                viewName: null,
                viewVersion: null,
                revisionVersion: null,
              },
            },
          },
        },
      },
      acknowledgement: {
        schemaVersion: 2,
        agentActionVersion: 3,
        invocationPartID: interaction.registration.partID,
        effectAgentActionPartID: interaction.registration.partID,
        operation: "set",
        from: { kind: "absent" },
        to: { kind: "course", locator: { courseID: seeded.course.id } },
      },
    })
    expect(applied.metadata).toMatchObject({
      commandVersion: 3,
      outcome: "applied",
      durablySettled: true,
    })
    const asked = permissionRequests.find((item) => item.sessionID === interaction.sessionID)
    expect(asked).toMatchObject({
      permission: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      patterns: [seeded.course.id],
      always: [seeded.course.id],
      lifecycle: { resolution: "request_exact" },
      metadata: {
        navigationKind: "default_course_preference",
        agentAction: { fingerprint: output.agentAction.fingerprint },
      },
    })
    expect(
      yield* db.get(sql`
        SELECT outcome
        FROM learner_default_course_capability_settlement
        WHERE invocation_part_id = ${interaction.registration.partID}
      `),
    ).toEqual({ outcome: "policy_allow" })
    expect(yield* navigation.currentDefault()).toMatchObject({
      version: 1,
      courseID: seeded.course.id,
      usability: { usable: true },
    })
    const partialV1Endpoint = JSON.stringify({
      kind: "course",
      locator: {
        courseID: seeded.course.id,
        title: { availability: "not_recorded_v1" },
        courseVersion: { availability: "not_recorded_v1" },
        workingSelection: { availability: "not_recorded_v1" },
      },
    })
    yield* Effect.forEach(
      [
        {
          table: "learner_default_course_disposition",
          immutable: "learner_default_course_disposition_immutable_v13",
          key: "invocation_part_id",
          column: "from_locator",
        },
        {
          table: "learner_default_course_disposition",
          immutable: "learner_default_course_disposition_immutable_v13",
          key: "invocation_part_id",
          column: "to_locator",
        },
        {
          table: "learner_default_course_acknowledgement",
          immutable: "learner_default_course_acknowledgement_immutable_v13",
          key: "invocation_part_id",
          column: "from_locator",
        },
        {
          table: "learner_default_course_acknowledgement",
          immutable: "learner_default_course_acknowledgement_immutable_v13",
          key: "invocation_part_id",
          column: "to_locator",
        },
      ] as const,
      (attempt) =>
        Effect.gen(function* () {
          expect(
            Exit.isFailure(
              yield* db
                .transaction((tx) =>
                  Effect.gen(function* () {
                    yield* tx.run(sql.raw(`DROP TRIGGER ${attempt.immutable}`))
                    yield* tx.run(sql`
                      UPDATE ${sql.identifier(attempt.table)}
                      SET ${sql.identifier(attempt.column)} = ${partialV1Endpoint}
                      WHERE ${sql.identifier(attempt.key)} = ${interaction.registration.partID}
                    `)
                  }),
                )
                .pipe(Effect.exit),
            ),
          ).toBe(true)
        }),
      { discard: true },
    )

    const current = yield* navigation.currentDefault()
    const deniedInput = input
    const denied = yield* seedInteraction(
      db,
      "default-v2-denied-no-change",
      deniedInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please keep Default algorithms V2 as my default Course." },
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      deniedInput,
      denied.registration,
    )
    const deniedResult = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      deniedInput,
      context(denied.registration, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    expect(JSON.parse(deniedResult.output)).toMatchObject({
      settlement: { outcome: "error", code: "permission_rejected" },
      disposition: "agent_action_v3",
      agentAction: { operation: "change", command: input },
    })
    expect(
      yield* db.get(sql`
        SELECT outcome
        FROM learner_default_course_capability_settlement
        WHERE invocation_part_id = ${denied.registration.partID}
      `),
    ).toEqual({ outcome: "policy_deny" })
    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: current.headID,
      version: current.version,
    })

    const unchanged = yield* seedInteraction(
      db,
      "default-v3-allowed-no-change",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Keep Default algorithms V2 as my default Course." },
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      unchanged.registration,
    )
    const unchangedResult = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      context(unchanged.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    expect(JSON.parse(unchangedResult.output)).toMatchObject({
      settlement: {
        outcome: "no_change",
        navigationKind: "default_course_preference",
        current: { headID: current.headID, version: current.version, courseID: seeded.course.id },
      },
      disposition: "agent_action_v3",
      agentAction: { operation: "change", command: input },
    })
    expect(unchangedResult.metadata).toMatchObject({
      commandVersion: 3,
      outcome: "no_change",
      durablySettled: true,
    })
    expect(
      yield* db.get(sql`
        SELECT
          (SELECT outcome FROM learner_default_course_capability_settlement
            WHERE invocation_part_id = ${unchanged.registration.partID}) AS capability,
          (SELECT count(*) FROM learner_default_course_transition
            WHERE agent_action_part_id = ${unchanged.registration.partID}) AS effects,
          (SELECT count(*) FROM learner_default_course_acknowledgement
            WHERE invocation_part_id = ${unchanged.registration.partID}) AS acknowledgements
      `),
    ).toEqual({ capability: "policy_allow", effects: 0, acknowledgements: 0 })
    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: current.headID,
      version: current.version,
      courseID: seeded.course.id,
    })

    const interruptedInput = {
      action: "clear",
    } as const
    const interrupted = yield* seedInteraction(
      db,
      "default-v2-not-evaluated",
      interruptedInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please clear my default Course." },
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      interruptedInput,
      interrupted.registration,
    )
    const aborted = new AbortController()
    aborted.abort()
    const interruptedContext = {
      ...context(interrupted.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      abort: aborted.signal,
    }
    const interruptedResult = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      interruptedInput,
      interruptedContext,
    )
    expect(JSON.parse(interruptedResult.output)).toMatchObject({
      settlement: { outcome: "error", code: "interrupted" },
    })
    expect(
      yield* db.get(sql`
        SELECT outcome
        FROM learner_default_course_capability_settlement
        WHERE invocation_part_id = ${interrupted.registration.partID}
      `),
    ).toEqual({ outcome: "not_evaluated" })
    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: current.headID,
      version: current.version,
    })

    const promptedInput = interruptedInput
    const prompted = yield* seedInteraction(
      db,
      "default-v2-prompted-allow",
      promptedInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please clear the default Course after prompting me." },
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      promptedInput,
      prompted.registration,
    )
    const promptedResult = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      promptedInput,
      context(prompted.registration, "ask", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    expect(JSON.parse(promptedResult.output)).toMatchObject({
      settlement: { outcome: "applied", current: { version: 2, courseID: null } },
      disposition: "agent_action_v3",
      agentAction: {
        kind: "agent_action_v3",
        command: promptedInput,
        operation: "clear",
        from: {
          kind: "course",
          locator: {
            courseID: seeded.course.id,
            title: { availability: "recorded_v2", value: seeded.course.title },
            courseVersion: { availability: "recorded_v2", value: 0 },
            workingSelection: { availability: "recorded_v2" },
          },
        },
        to: { kind: "absent" },
      },
      acknowledgement: {
        schemaVersion: 2,
        agentActionVersion: 3,
        operation: "clear",
        from: { kind: "course", locator: { courseID: seeded.course.id } },
        to: { kind: "absent" },
      },
    })
    expect(
      yield* db.get(sql`
        SELECT outcome
        FROM learner_default_course_capability_settlement
        WHERE invocation_part_id = ${prompted.registration.partID}
      `),
    ).toEqual({ outcome: "prompted_allow" })

    const cleared = yield* navigation.currentDefault()
    const abandonedInput = {
      action: "set",
      courseID: seeded.course.id,
    } as const
    const abandoned = yield* seedInteraction(
      db,
      "default-v2-prompted-abort",
      abandonedInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please restore Default algorithms V2 as my default Course." },
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      abandonedInput,
      abandoned.registration,
    )
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    permissionWaits.push({ entered, release })
    const controller = new AbortController()
    const execution = yield* runtime
      .executeCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, abandonedInput, {
        ...context(abandoned.registration, "ask", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        abort: controller.signal,
      })
      .pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    controller.abort()
    const abandonedResult = yield* Fiber.join(execution)
    expect(JSON.parse(abandonedResult.output)).toMatchObject({
      settlement: { outcome: "error", code: "interrupted" },
    })
    expect(
      yield* db.get(sql`
        SELECT outcome
        FROM learner_default_course_capability_settlement
        WHERE invocation_part_id = ${abandoned.registration.partID}
      `),
    ).toEqual({ outcome: "prompted_abort" })
    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: cleared.headID,
      version: cleared.version,
      courseID: null,
    })

    yield* Effect.forEach(
      ["policy_allow", "prompted_allow"] as const,
      (outcome, index) =>
        Effect.gen(function* () {
          const time = Date.now() + index
          const crashInput = abandonedInput
          const crashed = yield* seedInteraction(
            db,
            `default-v2-crash-${outcome}`,
            crashInput,
            LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            { text: `Please restore Default algorithms V2 after ${outcome}.`, time },
          )
          yield* runtime.prepareCommand(
            LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            crashInput,
            crashed.registration,
          )
          yield* db.transaction((tx) =>
            outcome === "policy_allow"
              ? settleDefaultCoursePolicy(tx, {
                  partID: crashed.registration.partID,
                  outcome,
                  policyBasis: { source: "runtime-crash-window-test", action: "allow" },
                  time: time + 1,
                  order: 100 + index * 2,
                })
              : Effect.gen(function* () {
                  const requestID = PermissionV1.ID.ascending()
                  yield* issueDefaultCourseCapabilityPrompt(tx, {
                    partID: crashed.registration.partID,
                    requestID,
                    policyBasis: { source: "runtime-crash-window-test", action: "ask" },
                    shownScope: { patterns: [seeded.course.id], always: [seeded.course.id] },
                    time: time + 1,
                    order: 100 + index * 2,
                  })
                  yield* settleDefaultCoursePrompt(tx, {
                    partID: crashed.registration.partID,
                    requestID,
                    outcome,
                    reply: { requestID, reply: "once" },
                    time: time + 2,
                    order: 101 + index * 2,
                  })
                }),
          )
          const frontierBeforeRecovery = yield* db.transaction((tx) => LearningFrontier.read(tx))
          expect(yield* runtime.interrupt(crashed.registration)).toBe(true)
          expect(JSON.parse((yield* exactPartResult(db, crashed.registration.partID)).output)).toMatchObject({
            settlement: { outcome: "error", code: "interrupted" },
          })
          expect(
            yield* db.get(sql`
              SELECT outcome
              FROM learner_default_course_capability_settlement
              WHERE invocation_part_id = ${crashed.registration.partID}
            `),
          ).toEqual({ outcome })
          expect(
            yield* db.get(sql`
              SELECT
                (SELECT count(*) FROM learner_default_course_transition
                  WHERE agent_action_part_id = ${crashed.registration.partID}) AS effects,
                (SELECT count(*) FROM learner_default_course_acknowledgement
                  WHERE invocation_part_id = ${crashed.registration.partID}) AS acknowledgements
            `),
          ).toEqual({ effects: 0, acknowledgements: 0 })
          expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontierBeforeRecovery)
          expect(yield* navigation.currentDefault()).toMatchObject({
            headID: cleared.headID,
            version: cleared.version,
            courseID: null,
          })
        }),
      { discard: true },
    )
  }),
)

it.effect("clears an Agent-native default after the retained target Course is withdrawn", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const seeded = yield* seedCourse(courses, "Withdrawn retained default", "Main")
    const setInput = { action: "set", courseID: seeded.course.id } as const
    const set = yield* seedInteraction(
      db,
      "default-v3-withdrawn-set",
      setInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Use Withdrawn retained default as my default Course." },
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, setInput, set.registration)
    expect(
      JSON.parse(
        (yield* runtime.executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          setInput,
          context(set.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        )).output,
      ),
    ).toMatchObject({ settlement: { outcome: "applied", current: { courseID: seeded.course.id } } })

    yield* courses.withdrawCourse({
      courseID: seeded.course.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
    })
    expect(yield* navigation.currentDefault()).toMatchObject({
      courseID: seeded.course.id,
      usability: { usable: false, cause: "course_withdrawn" },
    })

    const clearInput = { action: "clear" } as const
    const clear = yield* seedInteraction(
      db,
      "default-v3-withdrawn-clear",
      clearInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Clear the withdrawn Course from my default preference." },
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      clearInput,
      clear.registration,
    )
    const result = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      clearInput,
      context(clear.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    expect(JSON.parse(result.output)).toMatchObject({
      settlement: { outcome: "applied", current: { version: 2, courseID: null } },
      disposition: "agent_action_v3",
      agentAction: {
        command: clearInput,
        operation: "clear",
        from: {
          kind: "course",
          locator: {
            courseID: seeded.course.id,
            title: { availability: "recorded_v2", value: seeded.course.title },
            courseVersion: { availability: "recorded_v2", value: 1 },
          },
        },
        to: { kind: "absent" },
      },
      acknowledgement: {
        schemaVersion: 2,
        agentActionVersion: 3,
        operation: "clear",
        from: { kind: "course", locator: { courseID: seeded.course.id } },
        to: { kind: "absent" },
      },
    })
    expect(yield* navigation.currentDefault()).toMatchObject({
      version: 2,
      courseID: null,
      usability: { usable: false, cause: "absent" },
    })
  }),
)

it.effect("records delegated Agent issuance and rejects missing child authority before candidate admission", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const runtime = yield* LearningCommandRuntime.Service
    const capability = (courseID: Course.CourseID, allow: boolean) => ({
      version: 2,
      parent: [],
      inherited: [],
      profile: [],
      explicit: allow
        ? [
            {
              permission: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
              pattern: courseID,
              action: "allow",
            },
          ]
        : [],
    })

    const appliedCourse = yield* courses.createCourse({ title: "Delegated applied default" })
    const appliedInput = { action: "set", courseID: appliedCourse.id } as const
    const appliedCapability = capability(appliedCourse.id, true)
    const applied = yield* seedDelegatedLearningCommandInteraction(db, "applied", appliedInput, appliedCapability)
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      appliedInput,
      applied.registration,
    )
    const appliedOutput = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        appliedInput,
        context(applied.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )).output,
    )
    expect(appliedOutput).toMatchObject({
      disposition: "agent_action_v3",
      settlement: { outcome: "applied" },
      agentAction: {
        command: appliedInput,
        provenance: {
          kind: "delegated",
          occurrenceID: applied.registration.causalOccurrenceID,
          causalRootOccurrenceID: applied.registration.causalOccurrenceID,
          sessionID: applied.child.sessionID,
          turnID: applied.child.turnID,
          invocationPartID: applied.registration.partID,
          lineage: [
            {
              childTurnID: applied.child.turnID,
              childSessionID: applied.child.sessionID,
              parentSessionID: applied.parent.sessionID,
              delegatedCapability: appliedCapability,
              delegatedCapabilityFingerprint: expect.any(String),
            },
          ],
          effectiveDelegatedCapability: {
            identity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            version: 3,
            projectionVersion: 2,
            fingerprint: expect.any(String),
          },
        },
      },
    })

    const deniedCourse = yield* courses.createCourse({ title: "Delegated denied default" })
    const deniedInput = { action: "set", courseID: deniedCourse.id } as const
    const denied = yield* seedDelegatedLearningCommandInteraction(
      db,
      "denied",
      deniedInput,
      capability(deniedCourse.id, true),
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      deniedInput,
      denied.registration,
    )
    const deniedOutput = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        deniedInput,
        context(denied.registration, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )).output,
    )
    expect(deniedOutput).toMatchObject({
      disposition: "agent_action_v3",
      settlement: { outcome: "error", code: "permission_rejected" },
      agentAction: { provenance: { kind: "delegated", turnID: denied.child.turnID } },
    })
    expect(
      yield* db.get(sql`
        SELECT
          (SELECT outcome FROM learner_default_course_capability_settlement
            WHERE invocation_part_id = ${denied.registration.partID}) AS capability,
          (SELECT count(*) FROM learner_default_course_transition
            WHERE agent_action_part_id = ${denied.registration.partID}) AS effects
      `),
    ).toEqual({ capability: "policy_deny", effects: 0 })

    const ungrantedCourse = yield* courses.createCourse({ title: "Delegated ungranted default" })
    const ungrantedInput = { action: "set", courseID: ungrantedCourse.id } as const
    const ungranted = yield* seedDelegatedLearningCommandInteraction(
      db,
      "ungranted",
      ungrantedInput,
      capability(ungrantedCourse.id, false),
    )
    expect(
      Exit.isFailure(
        yield* runtime
          .prepareCommand(
            LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            ungrantedInput,
            ungranted.registration,
          )
          .pipe(Effect.exit),
      ),
    ).toBe(true)
    expect(
      yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM learning_command_invocation
            WHERE part_id = ${ungranted.registration.partID}) AS invocations,
          (SELECT count(*) FROM learner_default_course_disposition
            WHERE invocation_part_id = ${ungranted.registration.partID}) AS dispositions,
          (SELECT count(*) FROM learner_default_course_capability_settlement
            WHERE invocation_part_id = ${ungranted.registration.partID}) AS capabilities
      `),
    ).toEqual({ invocations: 0, dispositions: 0, capabilities: 0 })

    const invalidCourse = yield* courses.createCourse({ title: "Delegated invalid lineage default" })
    const invalidInput = { action: "set", courseID: invalidCourse.id } as const
    const invalid = yield* seedDelegatedLearningCommandInteraction(
      db,
      "invalid-lineage",
      invalidInput,
      capability(invalidCourse.id, true),
    )
    expect(
      Exit.isFailure(
        yield* runtime
          .prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, invalidInput, {
            ...invalid.registration,
            causalOccurrenceID: undefined,
          })
          .pipe(Effect.exit),
      ),
    ).toBe(true)
    expect(
      yield* db.get(sql`
        SELECT count(*) AS count
        FROM learning_command_invocation
        WHERE part_id = ${invalid.registration.partID}
      `),
    ).toEqual({ count: 0 })
  }),
)

it.effect("settles pre-existing Default-Course semantics before changed ownership, source loss, or capability", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const runtime = yield* LearningCommandRuntime.Service
    const selected = yield* courses.createCourse({ title: "Semantic terminal target" })
    const selectedView = yield* courses.createView({
      courseID: selected.id,
      name: "Semantic terminal view",
      expectedCourseVersion: 0,
      authorship: Course.Authorship.learnerAuthored(),
      revision: { items: [{ key: "root", title: "Semantic terminal target" }] },
    })
    yield* courses.select({
      courseID: selected.id,
      revisionID: selectedView.revision.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
      expectedViewVersion: 0,
      expectedRevisionVersion: 0,
    })
    const conflicting = yield* courses.createCourse({ title: "Semantic terminal conflict" })
    const input = {
      action: "set",
      courseID: selected.id,
    } as const
    const interaction = yield* seedInteraction(
      db,
      "default-v2-semantic-terminal",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please use Semantic terminal target as my default Course." },
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
    const appliedOutput = JSON.parse(applied.output)
    const capabilityCalls = permissionRequests.length

    yield* courses.select({
      courseID: selected.id,
      expectedCourseVersion: 0,
      expectedSelectionRevisionID: selectedView.revision.id,
      expectedSelectionVersion: 1,
    })
    const removed = yield* insertAssistant(
      db,
      interaction,
      "default-v2-semantic-terminal-removed-selection",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, removed)
    expect(
      JSON.parse(
        (yield* runtime.executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          input,
          context(removed, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        )).output,
      ),
    ).toMatchObject({
      disposition: "semantic_terminal_v3",
      settlement: { outcome: "already_applied", effectID: appliedOutput.settlement.effectID },
    })

    yield* courses.correctCourse({
      courseID: selected.id,
      title: "Changed after commit",
      expectedCourseVersion: 0,
    })
    const sameName = yield* courses.createCourse({ title: "Semantic terminal target" })
    const changed = yield* insertAssistant(
      db,
      interaction,
      "default-v2-semantic-terminal-changed",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, changed)
    const changedResult = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      context(changed, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, [
        { ruleset: [], absence: "deny" },
      ]),
    )
    const changedOutput = JSON.parse(changedResult.output)
    expect(changedOutput).toMatchObject({
      disposition: "semantic_terminal_v3",
      settlement: {
        outcome: "already_applied",
        effectID: appliedOutput.settlement.effectID,
      },
      semanticTerminal: {
        kind: "semantic_terminal_v3",
        outcome: "already_applied",
        existingEffectID: appliedOutput.settlement.effectID,
      },
      acknowledgement: {
        invocationPartID: changed.partID,
        effectAgentActionPartID: interaction.registration.partID,
        agentActionVersion: 3,
        operation: "set",
        from: { kind: "absent" },
        to: {
          kind: "course",
          locator: {
            courseID: selected.id,
            title: { availability: "recorded_v2", value: "Semantic terminal target" },
            courseVersion: { availability: "recorded_v2", value: 0 },
            workingSelection: {
              availability: "recorded_v2",
              value: {
                revisionID: selectedView.revision.id,
                selectionVersion: 1,
                viewID: selectedView.view.id,
                viewName: "Semantic terminal view",
                viewVersion: 0,
                revisionVersion: 0,
              },
            },
          },
        },
      },
    })
    expect(changedOutput.agentAction).toBeUndefined()
    expect(changedOutput.acknowledgement.to.locator.courseID).not.toBe(sameName.id)

    yield* courses.withdrawCourse({
      courseID: selected.id,
      expectedCourseVersion: 1,
      expectedSelectionVersion: 2,
    })
    yield* db
      .insert(LearnerOccurrenceTombstoneTable)
      .values({
        occurrence_id: interaction.occurrenceID,
        reason: "source_unavailable",
        time_deleted: Date.now(),
      })
      .run()
    const unavailable = yield* insertAssistant(
      db,
      interaction,
      "default-v2-semantic-terminal-unavailable",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, unavailable)
    expect(
      JSON.parse(
        (yield* runtime.executeCommand(
          LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          input,
          context(unavailable, "ask", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
        )).output,
      ),
    ).toMatchObject({
      disposition: "semantic_terminal_v3",
      settlement: { outcome: "already_applied", effectID: appliedOutput.settlement.effectID },
    })

    yield* courses.withdrawCourse({
      courseID: conflicting.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
    })
    const conflictInput = {
      action: "set",
      courseID: conflicting.id,
    } as const
    const conflict = yield* insertAssistant(
      db,
      interaction,
      "default-v2-semantic-terminal-conflict",
      conflictInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, conflictInput, conflict)
    const conflictOutput = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        conflictInput,
        context(conflict, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )).output,
    )
    expect(conflictOutput).toMatchObject({
      disposition: "semantic_terminal_v3",
      settlement: { outcome: "error", code: "semantic_conflict" },
      semanticTerminal: {
        kind: "semantic_terminal_v3",
        outcome: "semantic_conflict",
        existingEffectID: appliedOutput.settlement.effectID,
      },
    })
    expect(conflictOutput.agentAction).toBeUndefined()
    expect(conflictOutput.acknowledgement).toBeUndefined()
    expect(permissionRequests.length).toBe(capabilityCalls)

    expect(
      yield* db.all(sql`
        SELECT
          disposition,
          authorization_version,
          authorization_kind,
          authorization_fingerprint,
          agent_action_version,
          agent_action_fingerprint,
          semantic_outcome,
          source_excerpt,
          resolution_scope,
          from_locator,
          to_locator
        FROM learner_default_course_disposition
        WHERE invocation_part_id IN (${removed.partID}, ${changed.partID}, ${unavailable.partID}, ${conflict.partID})
        ORDER BY invocation_part_id
      `),
    ).toEqual(
      [removed.partID, changed.partID, unavailable.partID, conflict.partID].sort().map((partID) => ({
        disposition: "semantic_terminal_v3",
        authorization_version: null,
        authorization_kind: null,
        authorization_fingerprint: null,
        agent_action_version: null,
        agent_action_fingerprint: null,
        semantic_outcome: partID === conflict.partID ? "semantic_conflict" : "already_applied",
        source_excerpt: null,
        resolution_scope: null,
        from_locator: null,
        to_locator: null,
      })),
    )
    expect(
      yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM learner_default_course_capability_issue
            WHERE invocation_part_id IN (
              ${removed.partID}, ${changed.partID}, ${unavailable.partID}, ${conflict.partID}
            )) AS issues,
          (SELECT count(*) FROM learner_default_course_capability_settlement
            WHERE invocation_part_id IN (
              ${removed.partID}, ${changed.partID}, ${unavailable.partID}, ${conflict.partID}
            )) AS capabilities,
          (SELECT count(*) FROM learner_default_course_acknowledgement
            WHERE invocation_part_id = ${conflict.partID}) AS conflict_acknowledgements,
          (SELECT count(*) FROM learner_default_course_acknowledgement
            WHERE invocation_part_id IN (
              ${removed.partID}, ${changed.partID}, ${unavailable.partID}
            )) AS duplicate_acknowledgements,
          (SELECT count(*) FROM learner_default_course_transition
            WHERE agent_action_part_id IN (
              ${removed.partID}, ${changed.partID}, ${unavailable.partID}, ${conflict.partID}
            )) AS effects
      `),
    ).toEqual({
      issues: 0,
      capabilities: 0,
      conflict_acknowledgements: 0,
      duplicate_acknowledgements: 3,
      effects: 0,
    })
    expect(
      Exit.isFailure(
        yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx.run("DROP TRIGGER learner_default_course_disposition_immutable_v13")
              yield* tx.run(sql`
                UPDATE learner_default_course_disposition
                SET
                  authorization_version = 2,
                  authorization_kind = 'direct_request_v2',
                  authorization_fingerprint = ${"a".repeat(64)}
                WHERE invocation_part_id = ${changed.partID}
              `)
            }),
          )
          .pipe(Effect.exit),
      ),
    ).toBe(true)
  }),
)

it.effect("retains Agent issuance and capability history when a Default-Course race loses", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const selected = yield* courses.createCourse({ title: "Candidate race duplicate" })
    const input = {
      action: "set",
      courseID: selected.id,
    } as const
    const interaction = yield* seedInteraction(
      db,
      "default-v2-candidate-race-duplicate",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please choose Candidate race duplicate as my default Course." },
    )
    const losing = yield* insertAssistant(
      db,
      interaction,
      "default-v2-candidate-race-duplicate-loser",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      interaction.registration,
    )
    yield* runtime.prepareCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, input, losing)
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    permissionWaits.push({ entered, release })
    const losingExecution = yield* runtime
      .executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        input,
        context(losing, "ask", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )
      .pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const winner = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input,
      context(interaction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    yield* Deferred.succeed(release, undefined)
    const lost = yield* Fiber.join(losingExecution)
    const winnerOutput = JSON.parse(winner.output)
    const lostOutput = JSON.parse(lost.output)
    expect(lostOutput).toMatchObject({
      disposition: "agent_action_v3",
      settlement: {
        outcome: "already_applied",
        effectID: winnerOutput.settlement.effectID,
      },
      agentAction: {
        kind: "agent_action_v3",
        command: input,
        fingerprint: expect.any(String),
      },
      acknowledgement: {
        invocationPartID: losing.partID,
        effectAgentActionPartID: interaction.registration.partID,
      },
    })
    expect(lostOutput.semanticTerminal).toBeUndefined()
    expect(
      yield* db.get(sql`
        SELECT
          disposition.disposition,
          disposition.agent_action_fingerprint,
          capability.outcome,
          issue.permission_request_id,
          acknowledgement.effect_agent_action_part_id,
          (SELECT count(*) FROM learner_default_course_transition
            WHERE agent_action_part_id = ${losing.partID}) AS effects
        FROM learner_default_course_disposition AS disposition
        JOIN learner_default_course_capability_issue AS issue
          ON issue.invocation_part_id = disposition.invocation_part_id
        JOIN learner_default_course_capability_settlement AS capability
          ON capability.invocation_part_id = disposition.invocation_part_id
        JOIN learner_default_course_acknowledgement AS acknowledgement
          ON acknowledgement.invocation_part_id = disposition.invocation_part_id
        WHERE disposition.invocation_part_id = ${losing.partID}
      `),
    ).toMatchObject({
      disposition: "agent_action_v3",
      agent_action_fingerprint: expect.any(String),
      outcome: "prompted_allow",
      permission_request_id: expect.any(String),
      effect_agent_action_part_id: interaction.registration.partID,
      effects: 0,
    })

    const winnerCourse = yield* courses.createCourse({ title: "Candidate race conflict winner" })
    const loserCourse = yield* courses.createCourse({ title: "Candidate race conflict loser" })
    const current = yield* navigation.currentDefault()
    const conflictWinnerInput = defaultCourseDirectInput(winnerCourse, "choose Candidate race conflict winner", current)
    const conflictLoserInput = defaultCourseDirectInput(loserCourse, "choose Candidate race conflict loser", current)
    const conflictInteraction = yield* seedInteraction(
      db,
      "default-v2-candidate-race-conflict",
      conflictWinnerInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      {
        text: "Please choose Candidate race conflict winner or choose Candidate race conflict loser as my default Course.",
      },
    )
    const conflictLosing = yield* insertAssistant(
      db,
      conflictInteraction,
      "default-v2-candidate-race-conflict-loser",
      conflictLoserInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      conflictWinnerInput,
      conflictInteraction.registration,
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      conflictLoserInput,
      conflictLosing,
    )
    const conflictEntered = yield* Deferred.make<void>()
    const conflictRelease = yield* Deferred.make<void>()
    permissionWaits.push({ entered: conflictEntered, release: conflictRelease })
    const conflictExecution = yield* runtime
      .executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        conflictLoserInput,
        context(conflictLosing, "ask", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )
      .pipe(Effect.forkChild)
    yield* Deferred.await(conflictEntered)
    const conflictWinner = yield* runtime.executeCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      conflictWinnerInput,
      context(conflictInteraction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
    )
    expect(JSON.parse(conflictWinner.output)).toMatchObject({
      settlement: { outcome: "applied", current: { courseID: winnerCourse.id } },
      disposition: "agent_action_v3",
      agentAction: {
        operation: "change",
        from: { kind: "course", locator: { courseID: selected.id } },
        to: { kind: "course", locator: { courseID: winnerCourse.id } },
      },
      acknowledgement: {
        agentActionVersion: 3,
        operation: "change",
        from: { kind: "course", locator: { courseID: selected.id } },
        to: { kind: "course", locator: { courseID: winnerCourse.id } },
      },
    })
    yield* Deferred.succeed(conflictRelease, undefined)
    const conflictLost = JSON.parse((yield* Fiber.join(conflictExecution)).output)
    expect(conflictLost).toMatchObject({
      disposition: "agent_action_v3",
      settlement: { outcome: "error", code: "semantic_conflict" },
      agentAction: {
        kind: "agent_action_v3",
        command: { action: "set", courseID: loserCourse.id },
      },
    })
    expect(conflictLost.semanticTerminal).toBeUndefined()
    expect(conflictLost.acknowledgement).toBeUndefined()
    expect(
      yield* db.get(sql`
        SELECT
          disposition.disposition,
          disposition.agent_action_fingerprint,
          capability.outcome,
          issue.permission_request_id,
          (SELECT count(*) FROM learner_default_course_acknowledgement
            WHERE invocation_part_id = ${conflictLosing.partID}) AS acknowledgements,
          (SELECT count(*) FROM learner_default_course_transition
            WHERE agent_action_part_id = ${conflictLosing.partID}) AS effects
        FROM learner_default_course_disposition AS disposition
        JOIN learner_default_course_capability_issue AS issue
          ON issue.invocation_part_id = disposition.invocation_part_id
        JOIN learner_default_course_capability_settlement AS capability
          ON capability.invocation_part_id = disposition.invocation_part_id
        WHERE disposition.invocation_part_id = ${conflictLosing.partID}
      `),
    ).toMatchObject({
      disposition: "agent_action_v3",
      agent_action_fingerprint: expect.any(String),
      outcome: "prompted_allow",
      permission_request_id: expect.any(String),
      acknowledgements: 0,
      effects: 0,
    })
    expect(
      Exit.isFailure(
        yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx.run("DROP TRIGGER learner_default_course_disposition_immutable_v13")
              yield* tx.run(sql`
                UPDATE learner_default_course_disposition
                SET agent_action_fingerprint = NULL
                WHERE invocation_part_id = ${conflictLosing.partID}
              `)
            }),
          )
          .pipe(Effect.exit),
      ),
    ).toBe(true)
  }),
)

it.effect("settles every non-allow capability history by the final semantic race result", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const outcomes = [
      "policy_deny",
      "prompted_deny",
      "prompted_correct",
      "prompted_cancel",
      "not_evaluated",
      "prompted_abort",
    ] as const

    yield* Effect.forEach(
      outcomes,
      (outcome, outcomeIndex) =>
        Effect.forEach(
          ["already_applied", "semantic_conflict"] as const,
          (semanticOutcome, semanticIndex) =>
            Effect.gen(function* () {
              const suffix = `${outcome}-${semanticOutcome}`
              const winnerCourse = yield* courses.createCourse({ title: `Race winner ${suffix}` })
              const loserCourse =
                semanticOutcome === "already_applied"
                  ? winnerCourse
                  : yield* courses.createCourse({ title: `Race loser ${suffix}` })
              const current = yield* navigation.currentDefault()
              const winnerExcerpt = `choose Race winner ${suffix}`
              const loserExcerpt = `choose Race loser ${suffix}`
              const winnerInput = defaultCourseDirectInput(winnerCourse, winnerExcerpt, current)
              const loserInput = defaultCourseDirectInput(loserCourse, loserExcerpt, current)
              const interaction = yield* seedInteraction(
                db,
                `default-v2-nonallow-race-${suffix}`,
                winnerInput,
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                { text: `Please ${winnerExcerpt}; the competing interpretation is to ${loserExcerpt}.` },
              )
              const losing = yield* insertAssistant(
                db,
                interaction,
                `default-v2-nonallow-race-loser-${suffix}`,
                loserInput,
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
              )
              yield* runtime.prepareCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                winnerInput,
                interaction.registration,
              )
              yield* runtime.prepareCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                loserInput,
                losing,
              )
              yield* settleRaceCapability(db, losing.partID, outcome, outcomeIndex * 10 + semanticIndex)
              const winner = JSON.parse(
                (yield* runtime.executeCommand(
                  LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                  winnerInput,
                  context(interaction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
                )).output,
              )
              const lost = yield* db.transaction((tx) =>
                settleDefaultCourseV3(tx, {
                  partID: losing.partID,
                  settlement: {
                    time: Date.now() + outcomeIndex * 10 + semanticIndex,
                    order: 1_000 + outcomeIndex * 10 + semanticIndex,
                  },
                }),
              )
              expect(lost).toMatchObject(
                semanticOutcome === "already_applied"
                  ? {
                      type: "settled",
                      settlement: {
                        outcome: "already_applied",
                        effectID: winner.settlement.effectID,
                      },
                      acknowledgement: {
                        invocationPartID: losing.partID,
                        effectAgentActionPartID: interaction.registration.partID,
                        agentActionVersion: 3,
                      },
                    }
                  : {
                      type: "settled",
                      settlement: { outcome: "error", code: "semantic_conflict" },
                    },
              )
              if (semanticOutcome === "semantic_conflict") expect(lost).not.toHaveProperty("acknowledgement")
              expect(
                yield* db.get(sql`
                  SELECT
                    disposition.disposition,
                    disposition.agent_action_fingerprint,
                    capability.outcome,
                    (SELECT count(*) FROM learner_default_course_transition
                      WHERE agent_action_part_id = ${losing.partID}) AS effects,
                    (SELECT count(*) FROM learner_default_course_acknowledgement
                      WHERE invocation_part_id = ${losing.partID}) AS acknowledgements
                  FROM learner_default_course_disposition AS disposition
                  JOIN learner_default_course_capability_settlement AS capability
                    ON capability.invocation_part_id = disposition.invocation_part_id
                  WHERE disposition.invocation_part_id = ${losing.partID}
                `),
              ).toEqual({
                disposition: "agent_action_v3",
                agent_action_fingerprint: expect.any(String),
                outcome,
                effects: 0,
                acknowledgements: semanticOutcome === "already_applied" ? 1 : 0,
              })
            }),
          { discard: true },
        ),
      { discard: true },
    )
  }),
)

it.effect("gives semantic winners precedence through live Default-Course permission abort", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service

    yield* Effect.forEach(
      ["not_evaluated", "prompted_abort"] as const,
      (outcome) =>
        Effect.forEach(
          ["already_applied", "semantic_conflict"] as const,
          (semanticOutcome) =>
            Effect.gen(function* () {
              const suffix = `${outcome}-${semanticOutcome}`
              const winnerCourse = yield* courses.createCourse({ title: `Live abort winner ${suffix}` })
              const candidateCourse =
                semanticOutcome === "already_applied"
                  ? winnerCourse
                  : yield* courses.createCourse({ title: `Live abort candidate ${suffix}` })
              const current = yield* navigation.currentDefault()
              const winnerExcerpt = `choose Live abort winner ${suffix}`
              const candidateExcerpt = `choose Live abort candidate ${suffix}`
              const winnerInput = defaultCourseDirectInput(winnerCourse, winnerExcerpt, current)
              const candidateInput = defaultCourseDirectInput(candidateCourse, candidateExcerpt, current)
              const interaction = yield* seedInteraction(
                db,
                `default-v2-live-abort-${suffix}`,
                winnerInput,
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                { text: `Please ${winnerExcerpt}; another interpretation is to ${candidateExcerpt}.` },
              )
              const candidate = yield* insertAssistant(
                db,
                interaction,
                `default-v2-live-abort-candidate-${suffix}`,
                candidateInput,
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
              )
              yield* runtime.prepareCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                candidateInput,
                candidate,
              )
              yield* runtime.prepareCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                winnerInput,
                interaction.registration,
              )
              const controller = new AbortController()
              const pending =
                outcome === "prompted_abort"
                  ? yield* Effect.gen(function* () {
                      const entered = yield* Deferred.make<void>()
                      const release = yield* Deferred.make<void>()
                      permissionWaits.push({ entered, release })
                      const execution = yield* runtime
                        .executeCommand(LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY, candidateInput, {
                          ...context(candidate, "ask", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
                          abort: controller.signal,
                        })
                        .pipe(Effect.forkChild)
                      yield* Deferred.await(entered)
                      return execution
                    })
                  : undefined
              const capabilityBefore = yield* defaultCourseCandidateEvidence(db, candidate.partID)
              expect(capabilityBefore.capability).toBeUndefined()
              expect(capabilityBefore.issue).toEqual(
                outcome === "prompted_abort"
                  ? expect.objectContaining({ permission_request_id: expect.any(String) })
                  : undefined,
              )
              const winner = yield* runtime.executeCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                winnerInput,
                context(interaction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
              )
              const winnerOutput = JSON.parse(winner.output)
              const currentAfterWinner = yield* navigation.currentDefault()
              const frontierAfterWinner = yield* db.transaction((tx) => LearningFrontier.read(tx))
              controller.abort()
              const lost = pending
                ? yield* Fiber.join(pending)
                : yield* runtime.executeCommand(
                    LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                    candidateInput,
                    {
                      ...context(candidate, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
                      abort: controller.signal,
                    },
                  )
              const output = JSON.parse(lost.output)
              expect(output).toMatchObject(
                semanticOutcome === "already_applied"
                  ? {
                      disposition: "agent_action_v3",
                      settlement: { outcome: "already_applied", effectID: winnerOutput.settlement.effectID },
                      acknowledgement: {
                        invocationPartID: candidate.partID,
                        effectAgentActionPartID: interaction.registration.partID,
                        agentActionVersion: 3,
                        effectID: winnerOutput.settlement.effectID,
                      },
                    }
                  : {
                      disposition: "agent_action_v3",
                      settlement: { outcome: "error", code: "semantic_conflict" },
                    },
              )
              expect(output.agentAction).toMatchObject({
                kind: "agent_action_v3",
                command: candidateInput,
              })
              expect(output.semanticTerminal).toBeUndefined()
              if (semanticOutcome === "semantic_conflict") expect(output.acknowledgement).toBeUndefined()
              const capabilityAfter = yield* defaultCourseCandidateEvidence(db, candidate.partID)
              expect(capabilityAfter.issue).toEqual(capabilityBefore.issue)
              expect(capabilityAfter.capability).toMatchObject({
                outcome,
                permission_request_id:
                  outcome === "prompted_abort" ? capabilityBefore.issue!.permission_request_id : null,
                reply: null,
                reply_fingerprint: null,
              })
              expect(capabilityAfter.counts).toEqual({
                effects: 0,
                acknowledgements: semanticOutcome === "already_applied" ? 1 : 0,
              })
              expect(yield* navigation.currentDefault()).toEqual(currentAfterWinner)
              expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontierAfterWinner)
              const terminal = yield* exactPartResult(db, candidate.partID)
              expect(terminal).toEqual(lost)
              const replay = yield* runtime.executeCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                candidateInput,
                context(candidate, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
              )
              expect(replay).toEqual(terminal)
              expect(yield* defaultCourseCandidateEvidence(db, candidate.partID)).toEqual(capabilityAfter)
            }),
          { discard: true },
        ),
      { discard: true },
    )
  }),
)

it.effect("gives semantic winners precedence through every Default-Course startup recovery branch", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const navigation = yield* LearnerNavigation.ReadService
    const runtime = yield* LearningCommandRuntime.Service
    const outcomes = [
      "not_evaluated",
      "prompted_abort",
      "policy_allow",
      "policy_deny",
      "prompted_allow",
      "prompted_deny",
      "prompted_correct",
      "prompted_cancel",
    ] as const

    yield* Effect.forEach(
      outcomes,
      (outcome, outcomeIndex) =>
        Effect.forEach(
          ["already_applied", "semantic_conflict"] as const,
          (semanticOutcome, semanticIndex) =>
            Effect.gen(function* () {
              const suffix = `${outcome}-${semanticOutcome}`
              const winnerCourse = yield* courses.createCourse({ title: `Startup winner ${suffix}` })
              const candidateCourse =
                semanticOutcome === "already_applied"
                  ? winnerCourse
                  : yield* courses.createCourse({ title: `Startup candidate ${suffix}` })
              const current = yield* navigation.currentDefault()
              const winnerExcerpt = `choose Startup winner ${suffix}`
              const candidateExcerpt = `choose Startup candidate ${suffix}`
              const winnerInput = defaultCourseDirectInput(winnerCourse, winnerExcerpt, current)
              const candidateInput = defaultCourseDirectInput(candidateCourse, candidateExcerpt, current)
              const interaction = yield* seedInteraction(
                db,
                `default-v2-startup-recovery-${suffix}`,
                winnerInput,
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                { text: `Please ${winnerExcerpt}; another interpretation is to ${candidateExcerpt}.` },
              )
              const candidate = yield* insertAssistant(
                db,
                interaction,
                `default-v2-startup-recovery-candidate-${suffix}`,
                candidateInput,
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
              )
              yield* runtime.prepareCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                candidateInput,
                candidate,
              )
              if (outcome === "prompted_abort") {
                yield* db.transaction((tx) =>
                  issueDefaultCourseCapabilityPrompt(tx, {
                    partID: candidate.partID,
                    requestID: PermissionV1.ID.ascending(`per_default_startup_${semanticIndex}`),
                    policyBasis: { source: "startup-recovery-race-oracle", action: "ask" },
                    shownScope: { patterns: [candidateCourse.id], always: [candidateCourse.id] },
                    time: Date.now(),
                    order: 0,
                  }),
                )
              }
              if (outcome !== "not_evaluated" && outcome !== "prompted_abort") {
                yield* settleRaceCapability(db, candidate.partID, outcome, 300 + outcomeIndex * 10 + semanticIndex)
              }
              const capabilityBefore = yield* defaultCourseCandidateEvidence(db, candidate.partID)
              if (outcome === "not_evaluated") {
                expect(capabilityBefore).toMatchObject({ issue: undefined, capability: undefined })
              }
              if (outcome === "prompted_abort") {
                expect(capabilityBefore.issue).toMatchObject({ permission_request_id: expect.any(String) })
                expect(capabilityBefore.capability).toBeUndefined()
              }
              if (outcome !== "not_evaluated" && outcome !== "prompted_abort") {
                expect(capabilityBefore.capability).toMatchObject({ outcome })
              }
              yield* runtime.prepareCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                winnerInput,
                interaction.registration,
              )
              const winner = yield* runtime.executeCommand(
                LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
                winnerInput,
                context(interaction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
              )
              const winnerOutput = JSON.parse(winner.output)
              const currentAfterWinner = yield* navigation.currentDefault()
              const frontierAfterWinner = yield* db.transaction((tx) => LearningFrontier.read(tx))
              expect(yield* runtime.interrupt(candidate)).toBe(true)
              const terminal = yield* exactPartResult(db, candidate.partID)
              const output = JSON.parse(terminal.output)
              expect(output).toMatchObject(
                semanticOutcome === "already_applied"
                  ? {
                      disposition: "agent_action_v3",
                      settlement: { outcome: "already_applied", effectID: winnerOutput.settlement.effectID },
                      acknowledgement: {
                        invocationPartID: candidate.partID,
                        effectAgentActionPartID: interaction.registration.partID,
                        agentActionVersion: 3,
                        effectID: winnerOutput.settlement.effectID,
                      },
                    }
                  : {
                      disposition: "agent_action_v3",
                      settlement: { outcome: "error", code: "semantic_conflict" },
                    },
              )
              expect(output.agentAction).toMatchObject({
                kind: "agent_action_v3",
                command: candidateInput,
              })
              expect(output.semanticTerminal).toBeUndefined()
              if (semanticOutcome === "semantic_conflict") expect(output.acknowledgement).toBeUndefined()
              const capabilityAfter = yield* defaultCourseCandidateEvidence(db, candidate.partID)
              if (capabilityBefore.capability) {
                expect(capabilityAfter).toEqual({
                  ...capabilityBefore,
                  counts: {
                    effects: 0,
                    acknowledgements: semanticOutcome === "already_applied" ? 1 : 0,
                  },
                })
              } else {
                expect(capabilityAfter.issue).toEqual(capabilityBefore.issue)
                expect(capabilityAfter.capability).toMatchObject({
                  outcome,
                  permission_request_id:
                    outcome === "prompted_abort" ? capabilityBefore.issue!.permission_request_id : null,
                  reply: null,
                  reply_fingerprint: null,
                })
                expect(capabilityAfter.counts).toEqual({
                  effects: 0,
                  acknowledgements: semanticOutcome === "already_applied" ? 1 : 0,
                })
              }
              expect(yield* navigation.currentDefault()).toEqual(currentAfterWinner)
              expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontierAfterWinner)
              expect(yield* runtime.interrupt(candidate)).toBe(true)
              expect(yield* exactPartResult(db, candidate.partID)).toEqual(terminal)
              expect(yield* defaultCourseCandidateEvidence(db, candidate.partID)).toEqual(capabilityAfter)
            }),
          { discard: true },
        ),
      { discard: true },
    )

    yield* Effect.forEach(
      ["policy_allow", "prompted_allow"] as const,
      (outcome, index) =>
        Effect.gen(function* () {
          const current = yield* navigation.currentDefault()
          const course = yield* courses.createCourse({ title: `No-winner startup ${outcome}` })
          const sourceExcerpt = `choose No-winner startup ${outcome}`
          const input = defaultCourseDirectInput(course, sourceExcerpt, current)
          const interaction = yield* seedInteraction(
            db,
            `default-v2-startup-no-winner-${outcome}`,
            input,
            LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            { text: `Please ${sourceExcerpt}.` },
          )
          yield* runtime.prepareCommand(
            LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            input,
            interaction.registration,
          )
          yield* settleRaceCapability(db, interaction.registration.partID, outcome, 500 + index)
          const before = yield* defaultCourseCandidateEvidence(db, interaction.registration.partID)
          const frontier = yield* db.transaction((tx) => LearningFrontier.read(tx))
          expect(yield* runtime.interrupt(interaction.registration)).toBe(true)
          const terminal = yield* exactPartResult(db, interaction.registration.partID)
          expect(JSON.parse(terminal.output)).toMatchObject({
            disposition: "agent_action_v3",
            settlement: { outcome: "error", code: "interrupted" },
          })
          expect(yield* defaultCourseCandidateEvidence(db, interaction.registration.partID)).toEqual(before)
          expect(yield* navigation.currentDefault()).toEqual(current)
          expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontier)
          expect(yield* runtime.interrupt(interaction.registration)).toBe(true)
          expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(terminal)
        }),
      { discard: true },
    )
  }),
)

it.effect("keeps retired Default-Course proposal production unreachable", () =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const core = yield* Effect.promise(() => import("@opencode-ai/core/learner-navigation/default-course-v2"))

    expect("prepareDefaultCourseProposal" in runtime).toBe(false)
    expect("prepareDefaultCourseProposal" in core).toBe(false)
    expect("recordDefaultCourseProposal" in core).toBe(false)
    expect(
      yield* db.get(sql`
        SELECT count(*) AS count
        FROM learner_default_course_proposal
      `),
    ).toEqual({ count: 0 })
  }),
)

test("replays a migrated terminal Default-Course V1 Part before V3 decoding or permission", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "frozen-v12-terminal-default-course.sqlite")
  const frozen = await seedFrozenV12AdmittedDefaultCourse(filename, {
    state: "terminal_no_change",
    terminalResult: (settlement, envelope) =>
      LearningCommandRuntime.exactResult(
        settlement,
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        envelope,
      ),
  })
  const requestsBeforeReplay = permissionRequests.length
  const replay = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      yield* runtime.prepareCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        frozen.input,
        frozen.registration,
      )
      const exact = yield* exactPartResult(db, frozen.partID)
      const executed = yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        frozen.input,
        context(frozen.registration, "deny", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )
      const disposition = yield* db
        .select()
        .from(LearnerDefaultCourseDispositionTable)
        .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, frozen.partID))
        .get()
      return { exact, executed, disposition }
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )

  expect(replay.executed).toEqual(replay.exact)
  expect(JSON.parse(replay.exact.output)).toMatchObject({ outcome: "no_change" })
  expect(replay.disposition).toMatchObject({
    disposition: "legacy_v1",
    legacy_row_class: "no_change",
    confirmation_availability: "not_recorded_v1",
  })
  expect(permissionRequests).toHaveLength(requestsBeforeReplay)
})

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
        .innerJoin(
          LearnerCourseRouteAnchorCommitSealTable,
          eq(LearnerCourseRouteAnchorCommitSealTable.receipt_id, LearningCommandReceiptTable.id),
        )
        .where(eq(LearnerCourseRouteAnchorCommitSealTable.effect_id, result.effectID))
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
    const input = { action: "set", courseID: course.id } as const
    const interaction = yield* seedInteraction(
      db,
      "navigation-session-deletion",
      input,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please make Deletion-retained default my default Course." },
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
    ).settlement as { effectID: LearnerNavigation.DefaultEffectID; settlementTime: number }
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
        .innerJoin(
          LearnerDefaultCourseCommitSealTable,
          eq(LearnerDefaultCourseCommitSealTable.receipt_id, LearningCommandReceiptTable.id),
        )
        .where(eq(LearnerDefaultCourseCommitSealTable.effect_id, applied.effectID))
        .get(),
    ).toBeDefined()
    expect(
      yield* db.select().from(PartTable).where(eq(PartTable.id, interaction.registration.partID)).get(),
    ).toBeUndefined()
  }),
)

it.effect("renders distinct exact owner locators for otherwise identical Course revisions and route anchors", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const courses = yield* Course.Service
    const runtime = yield* LearningCommandRuntime.Service
    const first = yield* seedCourse(courses, "Duplicate algorithms", "Main")
    const second = yield* seedCourse(courses, "Duplicate algorithms", "Main")
    const acceptanceCases = [
      { suffix: "readable-course-first", seeded: first },
      { suffix: "readable-course-second", seeded: second },
    ] as const
    const acceptanceResults = yield* Effect.forEach(acceptanceCases, (item) =>
      Effect.gen(function* () {
        const input = acceptance(item.seeded.course.id, item.seeded.view.revision.id)
        const interaction = yield* seedInteraction(db, item.suffix, input)
        yield* runtime.prepare(input, interaction.registration)
        const result = yield* runtime.execute(input, context(interaction.registration, "ask"))
        return { interaction, result }
      }),
    )
    const acceptanceProposals = acceptanceResults.map((item) => {
      const request = permissionRequests.find((candidate) => candidate.sessionID === item.interaction.sessionID)
      if (!request?.tool) throw new Error("Expected a bound Course acceptance request")
      const read = SemanticPresentation.readProposal({
        id: request.id ?? "per_course_locator_test",
        sessionID: request.sessionID,
        permission: request.permission,
        patterns: request.patterns,
        always: request.always,
        metadata: request.metadata,
        tool: request.tool,
      })
      if (read.type !== "valid") {
        throw new Error(`Expected a valid Course acceptance presentation: ${JSON.stringify(request)}`)
      }
      return read.value
    })
    const acceptanceResultProjections = acceptanceResults.map((item) => {
      const read = SemanticPresentation.readResult({
        id: item.interaction.registration.partID,
        sessionID: item.interaction.registration.sessionID,
        messageID: item.interaction.registration.assistantMessageID,
        callID: item.interaction.registration.callID,
        tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        state: { status: "completed", title: item.result.title, metadata: item.result.metadata },
      })
      if (read.type !== "valid") throw new Error("Expected a valid Course acceptance result presentation")
      return read.value
    })
    const acceptanceProposalText = acceptanceProposals.map((value) => JSON.stringify(value))
    const acceptanceResultText = acceptanceResultProjections.map((value) => JSON.stringify(value))
    expect(acceptanceProposalText[0]).not.toBe(acceptanceProposalText[1])
    expect(acceptanceResultText[0]).not.toBe(acceptanceResultText[1])
    expect(acceptanceProposalText[0]).toContain(first.course.id)
    expect(acceptanceProposalText[1]).toContain(second.course.id)
    expect(acceptanceResultText[0]).toContain(first.course.id)
    expect(acceptanceResultText[1]).toContain(second.course.id)

    permissionRequests.length = 0
    const anchorResults = yield* Effect.forEach(acceptanceCases, (item) =>
      Effect.gen(function* () {
        const revisionItems = yield* courses.listRevisionItems(
          item.seeded.course.id,
          item.seeded.view.view.id,
          item.seeded.view.revision.id,
        )
        const revisionItem = revisionItems.items[0]
        if (!revisionItem) return yield* Effect.die("Expected a Course Revision Item")
        const input = {
          courseID: item.seeded.course.id,
          expectedHeadID: null,
          expectedVersion: 0,
          target: {
            viewID: item.seeded.view.view.id,
            revisionID: item.seeded.view.revision.id,
            itemID: revisionItem.itemID,
            courseVersion: 0,
            selectionVersion: 1,
            viewVersion: 0,
            revisionVersion: 0,
          },
        }
        const interaction = yield* seedInteraction(
          db,
          `${item.suffix}-anchor`,
          input,
          LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
        )
        yield* runtime.prepareCommand(
          LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
          input,
          interaction.registration,
        )
        const result = yield* runtime.executeCommand(
          LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
          input,
          context(interaction.registration, "ask", LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY),
        )
        return { interaction, result }
      }),
    )
    const anchorProposals = anchorResults.map((item) => {
      const request = permissionRequests.find((candidate) => candidate.sessionID === item.interaction.sessionID)
      if (!request?.tool) throw new Error("Expected a bound route-anchor request")
      const read = SemanticPresentation.readProposal({
        id: request.id ?? "per_anchor_locator_test",
        sessionID: request.sessionID,
        permission: request.permission,
        patterns: request.patterns,
        always: request.always,
        metadata: request.metadata,
        tool: request.tool,
      })
      if (read.type !== "valid") throw new Error("Expected a valid route-anchor presentation")
      return read.value
    })
    const anchorResultProjections = anchorResults.map((item) => {
      const read = SemanticPresentation.readResult({
        id: item.interaction.registration.partID,
        sessionID: item.interaction.registration.sessionID,
        messageID: item.interaction.registration.assistantMessageID,
        callID: item.interaction.registration.callID,
        tool: LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
        state: { status: "completed", title: item.result.title, metadata: item.result.metadata },
      })
      if (read.type !== "valid") throw new Error("Expected a valid route-anchor result presentation")
      return read.value
    })
    const anchorProposalText = anchorProposals.map((value) => JSON.stringify(value))
    const anchorResultText = anchorResultProjections.map((value) => JSON.stringify(value))
    expect(anchorProposalText[0]).not.toBe(anchorProposalText[1])
    expect(anchorResultText[0]).not.toBe(anchorResultText[1])
    expect(anchorProposalText[0]).toContain(first.course.id)
    expect(anchorProposalText[1]).toContain(second.course.id)
    expect(anchorResultText[0]).toContain(first.course.id)
    expect(anchorResultText[1]).toContain(second.course.id)
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
    const originalSeal = yield* db
      .select()
      .from(CourseSelectionAcceptanceCommitSealTable)
      .where(eq(CourseSelectionAcceptanceCommitSealTable.invocation_part_id, interaction.registration.partID))
      .get()
    if (!originalReceipt || !originalSeal) return yield* Effect.die("Expected the Course receipt fixture")
    const originalInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
      .get()
    const originalEffect = yield* db
      .select()
      .from(CourseSelectionAcceptanceEffectTable)
      .where(eq(CourseSelectionAcceptanceEffectTable.id, originalSeal.effect_id))
      .get()
    if (!originalInvocation || !originalEffect) return yield* Effect.die("Expected the legacy settlement fixture")

    const defaultInput = { action: "set", courseID: seeded.course.id } as const
    const defaultInteraction = yield* seedInteraction(
      db,
      "receipt-promotion-default-v2",
      defaultInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please make Receipt integrity my default Course." },
    )
    yield* runtime.prepareCommand(
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      defaultInput,
      defaultInteraction.registration,
    )
    const defaultResult = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        defaultInput,
        context(defaultInteraction.registration, "allow", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
      )).output,
    )
    if (defaultResult.settlement?.outcome !== "applied") {
      return yield* Effect.die("Expected the Agent-native Default-Course runtime to establish the fixture")
    }
    const preparedDefault = {
      effect: defaultResult.settlement.effect as LearnerNavigation.DefaultEffect,
    }
    const defaultSealBeforePromotion = yield* db
      .select()
      .from(LearnerDefaultCourseCommitSealTable)
      .where(eq(LearnerDefaultCourseCommitSealTable.effect_id, preparedDefault.effect.id))
      .get()
    if (!defaultSealBeforePromotion) return yield* Effect.die("Expected the Agent-native Default-Course seal fixture")
    const defaultPermissionRequestID = PermissionV1.ID.ascending()
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
    const defaultInvocation = yield* insertAdmittedNavigationInvocation(db, {
      kind: "default",
      suffix: "default",
      sessionID: interaction.sessionID,
      parentUserMessageID: interaction.userMessageID,
      occurrenceID: interaction.occurrenceID,
      turnID: interaction.turnID,
      inputID: interaction.inputID,
      effect: preparedDefault.effect,
      permissionRequestID: defaultPermissionRequestID,
    })
    const defaultPromotion = yield* db
      .insert(LearnerDefaultCourseCommitSealTable)
      .values({
        effect_id: preparedDefault.effect.id,
        receipt_id: originalReceipt.id,
        invocation_part_id: defaultInvocation.partID,
      })
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
        .from(LearnerDefaultCourseCommitSealTable)
        .where(eq(LearnerDefaultCourseCommitSealTable.effect_id, preparedDefault.effect.id))
        .get(),
    ).toEqual(defaultSealBeforePromotion)
    expect(
      yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, preparedDefault.effect.id))
        .get(),
    ).toMatchObject({ id: preparedDefault.effect.id, version: 1 })

    const course = yield* courses.getCourse(seeded.course.id)
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
    const anchorInvocation = yield* insertAdmittedNavigationInvocation(db, {
      kind: "anchor",
      suffix: "anchor",
      sessionID: interaction.sessionID,
      parentUserMessageID: interaction.userMessageID,
      occurrenceID: interaction.occurrenceID,
      turnID: interaction.turnID,
      inputID: interaction.inputID,
      effect: anchorEffect,
    })
    const anchorPromotion = yield* db
      .insert(LearnerCourseRouteAnchorCommitSealTable)
      .values({
        effect_id: anchorEffect.id,
        receipt_id: originalReceipt.id,
        invocation_part_id: anchorInvocation.partID,
      })
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
        .from(LearnerCourseRouteAnchorCommitSealTable)
        .where(eq(LearnerCourseRouteAnchorCommitSealTable.effect_id, anchorEffect.id))
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
      ...originalReceipt,
      assistant_message_id: defaultInvocation.assistantMessageID,
      invocation_part_id: defaultInvocation.partID,
      capability_identity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      capability_version: 1,
      authorization_basis: "learner_acceptance",
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
        .from(CourseSelectionAcceptanceCommitSealTable)
        .where(eq(CourseSelectionAcceptanceCommitSealTable.receipt_id, originalReceipt.id))
        .get(),
      navigationReceipt: yield* db
        .select()
        .from(LearnerDefaultCourseCommitSealTable)
        .where(eq(LearnerDefaultCourseCommitSealTable.effect_id, preparedDefault.effect.id))
        .get(),
      invocation: yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
        .get(),
      effect: yield* db
        .select()
        .from(CourseSelectionAcceptanceEffectTable)
        .where(eq(CourseSelectionAcceptanceEffectTable.id, originalSeal.effect_id))
        .get(),
    }
    yield* db.run(sql.raw("ROLLBACK TO default_navigation_receipt_replace"))
    yield* db.run(sql.raw("RELEASE default_navigation_receipt_replace"))

    yield* db.run(sql.raw("SAVEPOINT anchor_navigation_receipt_replace"))
    const anchorReplacement = yield* insertOrReplaceReceipt(db, {
      ...originalReceipt,
      assistant_message_id: anchorInvocation.assistantMessageID,
      invocation_part_id: anchorInvocation.partID,
      capability_identity: LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY,
      capability_version: 1,
      authorization_basis: "learner_request",
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
        .from(CourseSelectionAcceptanceCommitSealTable)
        .where(eq(CourseSelectionAcceptanceCommitSealTable.receipt_id, originalReceipt.id))
        .get(),
      navigationReceipt: yield* db
        .select()
        .from(LearnerCourseRouteAnchorCommitSealTable)
        .where(eq(LearnerCourseRouteAnchorCommitSealTable.effect_id, anchorEffect.id))
        .get(),
      invocation: yield* db
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
        .get(),
      effect: yield* db
        .select()
        .from(CourseSelectionAcceptanceEffectTable)
        .where(eq(CourseSelectionAcceptanceEffectTable.id, originalSeal.effect_id))
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
      legacyEffectReceipt: originalSeal,
      navigationReceipt: defaultSealBeforePromotion,
      invocation: originalInvocation,
      effect: originalEffect,
    })
    expect(anchorReplacementState).toEqual({
      receipt: originalReceipt,
      legacyEffectReceipt: originalSeal,
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
    const acceptanceSeal = yield* db
      .select()
      .from(CourseSelectionAcceptanceCommitSealTable)
      .where(eq(CourseSelectionAcceptanceCommitSealTable.invocation_part_id, acceptanceInteraction.registration.partID))
      .get()
    if (!acceptanceReceipt || !acceptanceSeal) return yield* Effect.die("Expected the acceptance receipt fixture")

    const defaultInput = { action: "set", courseID: seeded.course.id } as const
    const defaultInteraction = yield* seedInteraction(
      db,
      "replace-default",
      defaultInput,
      LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      { text: "Please make Receipt replacement my default Course." },
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
    const defaultSeal = yield* db
      .select()
      .from(LearnerDefaultCourseCommitSealTable)
      .where(eq(LearnerDefaultCourseCommitSealTable.invocation_part_id, defaultInteraction.registration.partID))
      .get()
    if (!defaultReceipt || !defaultSeal) return yield* Effect.die("Expected the default receipt fixture")
    const defaultInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, defaultInteraction.registration.partID))
      .get()
    const defaultTransition = yield* db
      .select()
      .from(DefaultCoursePreferenceTransitionTable)
      .where(eq(DefaultCoursePreferenceTransitionTable.id, defaultSeal.effect_id))
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
        .where(eq(DefaultCoursePreferenceTransitionTable.id, defaultSeal.effect_id))
        .get(),
    ).toEqual(defaultTransition)
    expect(yield* navigation.currentDefault()).toMatchObject({
      headID: defaultSeal.effect_id,
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
      headID: defaultSeal.effect_id,
      source: { receiptID: defaultReceipt.id },
    })

    const course = yield* courses.getCourse(seeded.course.id)
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
    const anchorSeal = yield* db
      .select()
      .from(LearnerCourseRouteAnchorCommitSealTable)
      .where(eq(LearnerCourseRouteAnchorCommitSealTable.invocation_part_id, anchorInteraction.registration.partID))
      .get()
    if (!anchorReceipt || !anchorSeal) return yield* Effect.die("Expected the anchor receipt fixture")
    const anchorInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, anchorInteraction.registration.partID))
      .get()
    const anchorTransition = yield* db
      .select()
      .from(CourseRouteAnchorTransitionTable)
      .where(eq(CourseRouteAnchorTransitionTable.id, anchorSeal.effect_id))
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
        .where(eq(CourseRouteAnchorTransitionTable.id, anchorSeal.effect_id))
        .get(),
    ).toEqual(anchorTransition)
    expect(yield* navigation.currentAnchor(seeded.course.id)).toMatchObject({
      headID: anchorSeal.effect_id,
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
      headID: anchorSeal.effect_id,
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
      acceptanceSeal,
      defaultReceipt,
      defaultSeal,
      anchorReceipt,
      anchorSeal,
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
          time_committed, commit_order
        )
        SELECT
          (SELECT _rowid_ FROM learning_command_receipt WHERE id = ${defaultReceipt.id}),
          id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
          invocation_part_id, capability_identity, capability_version, authorization_basis,
          time_committed, commit_order
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
    expect(
      SemanticPresentation.readResult({
        id: interaction.registration.partID,
        sessionID: interaction.registration.sessionID,
        messageID: interaction.registration.assistantMessageID,
        tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        callID: interaction.registration.callID,
        state: { status: "completed", title: first.title, metadata: first.metadata },
      }),
    ).toMatchObject({
      type: "valid",
      value: {
        phase: "result",
        capability: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        outcome: "committed",
        durablySettled: true,
      },
    })
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
    const legacyInvocation = yield* db
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, legacyInteraction.registration.partID))
      .get()
    if (!legacyInvocation) return yield* Effect.die("Expected admitted legacy invocation fixture")
    yield* db
      .delete(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, legacyInteraction.registration.partID))
      .run()
    yield* db
      .insert(LearningCommandInvocationTable)
      .values({ ...legacyInvocation, turn_id: null, input_id: null })
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

test("upgrades and recovers a frozen V12 admitted Default-Course invocation with durable Turn identity", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "frozen-v12-admitted-default-course.sqlite")
  const frozen = await seedFrozenV12AdmittedDefaultCourse(filename)
  const migrated = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const part = yield* db.get<{ rawPart: string }>(sql`
        SELECT CAST(data AS text) AS rawPart FROM part WHERE id = ${frozen.partID}
      `)
      const invocation = yield* db
        .select({
          status: LearningCommandInvocationTable.status,
          settlement: LearningCommandInvocationTable.settlement,
          turnID: LearningCommandInvocationTable.turn_id,
          inputID: LearningCommandInvocationTable.input_id,
        })
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, frozen.partID))
        .get()
      const disposition = yield* db
        .select()
        .from(LearnerDefaultCourseDispositionTable)
        .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, frozen.partID))
        .get()
      return { part, invocation, disposition }
    }).pipe(Effect.provide(Database.layerFromPath(filename).pipe(Layer.orDie)), Effect.scoped),
  )

  expect(migrated.part?.rawPart).toBe(frozen.rawPart)
  expect(migrated.invocation).toEqual({
    status: "admitted",
    settlement: null,
    turnID: frozen.turnID,
    inputID: frozen.inputID,
  })
  expect(migrated.disposition).toMatchObject({
    disposition: "legacy_v1",
    authorization_version: 1,
    authorization_kind: "legacy_v1",
    command_fingerprint: frozen.inputFingerprint,
    legacy_row_class: "admitted",
    confirmation_availability: "not_recorded_v1",
    command_permission_request_id: frozen.permissionRequestID,
    effect_confirmation_request_id: null,
    legacy_effect_id: null,
    legacy_receipt_id: null,
  })

  const recovered = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      yield* LearningCommandRuntime.Service
      return {
        part: yield* exactPartResult(db, frozen.partID),
        invocation: yield* db
          .select({
            status: LearningCommandInvocationTable.status,
            settlement: LearningCommandInvocationTable.settlement,
          })
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, frozen.partID))
          .get(),
        disposition: yield* db
          .select()
          .from(LearnerDefaultCourseDispositionTable)
          .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, frozen.partID))
          .get(),
        capabilityIssues: yield* db.select().from(LearnerDefaultCourseCapabilityIssueTable).all(),
        capabilitySettlements: yield* db.select().from(LearnerDefaultCourseCapabilitySettlementTable).all(),
        acknowledgements: yield* db.select().from(LearnerDefaultCourseAcknowledgementTable).all(),
        effects: yield* db.select().from(DefaultCoursePreferenceTransitionTable).all(),
      }
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )

  expect(JSON.parse(recovered.part.output)).toMatchObject({ outcome: "error", code: "interrupted" })
  expect(recovered.invocation).toMatchObject({
    status: "error",
    settlement: { outcome: "error", code: "interrupted" },
  })
  expect(recovered.disposition).toEqual(migrated.disposition)
  expect(recovered.capabilityIssues).toEqual([])
  expect(recovered.capabilitySettlements).toEqual([])
  expect(recovered.acknowledgements).toEqual([])
  expect(recovered.effects).toEqual([])
})

test("upgrades and interrupts a frozen V15 admitted learner Goal without reviving its retired producer", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "frozen-v15-admitted-learner-goal.sqlite")
  const frozen = await seedFrozenV15AdmittedLearnerGoal(filename)
  const migrated = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      return {
        part: yield* db.select().from(PartTable).where(eq(PartTable.id, frozen.partID)).get(),
        invocation: yield* db
          .select({
            status: LearningCommandInvocationTable.status,
            settlement: LearningCommandInvocationTable.settlement,
          })
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, frozen.partID))
          .get(),
        command: yield* db
          .select()
          .from(LearnerGoalCommandTable)
          .where(eq(LearnerGoalCommandTable.invocation_part_id, frozen.partID))
          .get(),
        disposition: yield* db
          .select()
          .from(LearnerGoalDispositionV2Table)
          .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, frozen.partID))
          .get(),
      }
    }).pipe(Effect.provide(Database.layerFromPath(filename).pipe(Layer.orDie)), Effect.scoped),
  )

  expect(migrated.part?.data).toMatchObject({ state: { status: "pending", input: frozen.input } })
  expect(migrated.invocation).toEqual({ status: "admitted", settlement: null })
  expect(migrated.command).toMatchObject({
    invocation_part_id: frozen.partID,
    permission_request_id: frozen.permissionRequestID,
    command_snapshot: { operations: frozen.input.operations },
  })
  expect(migrated.disposition).toMatchObject({
    invocation_part_id: frozen.partID,
    disposition: "legacy_v1",
    legacy_command_part_id: frozen.partID,
    canonical_command: null,
    semantic_address: null,
    agent_action_provenance: null,
    materialized_snapshot: null,
  })

  const requestsBeforeRecovery = permissionRequests.length
  const recovered = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const exact = yield* exactPartResult(db, frozen.partID)
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, frozen.input, frozen.registration)
      const replay = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        frozen.input,
        context(frozen.registration, "deny", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      return {
        exact,
        replay,
        invocation: yield* db
          .select({
            status: LearningCommandInvocationTable.status,
            settlement: LearningCommandInvocationTable.settlement,
          })
          .from(LearningCommandInvocationTable)
          .where(eq(LearningCommandInvocationTable.part_id, frozen.partID))
          .get(),
        disposition: yield* db
          .select()
          .from(LearnerGoalDispositionV2Table)
          .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, frozen.partID))
          .get(),
        capabilityIssues: yield* db.select().from(LearnerGoalCapabilityIssueV2Table).all(),
        capabilitySettlements: yield* db.select().from(LearnerGoalCapabilitySettlementV2Table).all(),
        effects: yield* db.select().from(LearnerGoalEffectTable).all(),
      }
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )

  expect(recovered.exact).toMatchObject({
    title: "Learner Goals not changed",
    metadata: { outcome: "error", code: "interrupted", durablySettled: true },
  })
  expect(recovered.exact.output).toContain("did not commit")
  expect(recovered.replay).toEqual(recovered.exact)
  expect(recovered.invocation).toMatchObject({
    status: "error",
    settlement: { outcome: "error", code: "interrupted" },
  })
  expect(recovered.disposition).toEqual(migrated.disposition)
  expect(recovered.capabilityIssues).toEqual([])
  expect(recovered.capabilitySettlements).toEqual([])
  expect(recovered.effects).toEqual([])
  expect(permissionRequests).toHaveLength(requestsBeforeRecovery)
})

test("replays a migrated terminal learner Goal V1 Part before V2 decoding or permission", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "frozen-v15-terminal-learner-goal.sqlite")
  const frozen = await seedFrozenV15AdmittedLearnerGoal(filename, {
    state: "terminal_applied",
    terminalResult: frozenLegacyGoalTerminalResult,
  })
  const requestsBeforeReplay = permissionRequests.length
  const replayed = await Effect.runPromise(
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const exact = yield* exactPartResult(db, frozen.partID)
      const effect = yield* db.select().from(LearnerGoalEffectTable).get()
      if (!effect) return yield* Effect.die("Expected the frozen V1 Goal effect")
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, frozen.input, frozen.registration)
      const executed = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        frozen.input,
        context(frozen.registration, "deny", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
      )
      return {
        exact,
        executed,
        historicalEffect: yield* db.transaction((tx) => LearnerGoal.readEffect(tx, effect.id)),
        disposition: yield* db
          .select()
          .from(LearnerGoalDispositionV2Table)
          .where(eq(LearnerGoalDispositionV2Table.invocation_part_id, frozen.partID))
          .get(),
        effect: yield* db.select().from(LearnerGoalEffectTable).get(),
        capabilityIssues: yield* db.select().from(LearnerGoalCapabilityIssueV2Table).all(),
        capabilitySettlements: yield* db.select().from(LearnerGoalCapabilitySettlementV2Table).all(),
      }
    }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
  )

  expect(replayed.executed).toEqual(replayed.exact)
  expect(replayed.exact).toMatchObject({
    title: "Updated learning Goal",
    metadata: {
      command: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      commandVersion: 1,
      outcome: "applied",
      durablySettled: true,
    },
  })
  expect(replayed.exact.output).toContain("Frozen V15 learner Goal")
  expect(replayed.disposition).toMatchObject({
    disposition: "legacy_v1",
    legacy_command_part_id: frozen.partID,
    canonical_command: null,
    agent_action_provenance: null,
  })
  expect(replayed.effect).toMatchObject({
    schema_version: 1,
    authorization_basis: "learner_acceptance",
    agent_action_part_id: null,
    materialized_snapshot: null,
  })
  expect(replayed.historicalEffect).toMatchObject({
    schemaVersion: 1,
    effectID: replayed.effect?.id,
    authorizationBasis: "learner_acceptance",
    confirmation: {
      authorizationBasis: "learner_acceptance",
      command: { operations: frozen.input.operations },
    },
  })
  expect(replayed.capabilityIssues).toEqual([])
  expect(replayed.capabilitySettlements).toEqual([])
  expect(permissionRequests).toHaveLength(requestsBeforeReplay)
})

test("carries each historical V1 target into a V2 update without copying retired proof fields", async () => {
  await using tmp = await tmpdir()
  const cases: readonly Readonly<{
    name: string
    legacy: LearnerGoal.Target
    expected: LearnerGoal.TargetValueV2
  }>[] = [
    { name: "absent", legacy: { type: "absent" }, expected: { type: "absent" } },
    {
      name: "instant",
      legacy: {
        type: "instant",
        instant: Date.parse("2030-08-05T10:30:00+08:00"),
        sourceExpression: "August 5, 2030 at 10:30 in UTC+8",
        normalized: "2030-08-05T10:30:00+08:00",
        utcOffsetMinutes: 480,
        normalizationBasis: "explicit_offset",
      },
      expected: {
        type: "instant",
        instant: Date.parse("2030-08-05T10:30:00+08:00"),
        utcOffsetMinutes: 480,
        resolvedZone: { type: "fixed_offset", offsetMinutes: 480 },
      },
    },
    {
      name: "local-date",
      legacy: {
        type: "local_date",
        date: "2030-08-05",
        timeZone: "America/New_York",
        sourceExpression: "August 5, 2030 in New York",
        normalizationBasis: "explicit_date",
      },
      expected: {
        type: "local_date",
        date: "2030-08-05",
        resolvedZone: { type: "iana", name: "America/New_York", releaseID: "iana-tzdb-2026c" },
      },
    },
  ]

  for (const item of cases) {
    const filename = join(tmp.path, `frozen-v15-goal-carry-${item.name}.sqlite`)
    const frozen = await seedFrozenV15AdmittedLearnerGoal(filename, {
      state: "terminal_applied",
      target: item.legacy,
      terminalResult: frozenLegacyGoalTerminalResult,
    })
    const legacyGoal = frozen.legacyGoal
    if (!legacyGoal) throw new Error(`Frozen V15 ${item.name} target did not create a Goal`)
    const carried = await Effect.runPromise(
      Effect.gen(function* () {
        const db = (yield* Database.Service).db
        const runtime = yield* LearningCommandRuntime.Service
        const goalID = legacyGoal.goalID as LearnerGoal.GoalID
        const update = {
          operations: [
            {
              type: "update" as const,
              goalID,
              headRevisionID: legacyGoal.revisionID as LearnerGoal.RevisionID,
              patch: { outcome: `Carried ${item.name} target` },
            },
          ],
        }
        const interaction = yield* seedInteraction(
          db,
          `goal-v1-carry-${item.name}`,
          update,
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          { text: `Keep the target but revise the ${item.name} Goal.` },
        )
        yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY, update, interaction.registration)
        const exact = yield* runtime.executeCommand(
          LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          update,
          context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY),
        )
        const revisions = yield* db
          .select()
          .from(LearnerGoalRevisionTable)
          .where(eq(LearnerGoalRevisionTable.goal_id, goalID))
          .orderBy(LearnerGoalRevisionTable.version)
          .all()
        return {
          exact,
          revisions,
          fieldBases: yield* db
            .select()
            .from(LearnerGoalFieldBasisTable)
            .where(eq(LearnerGoalFieldBasisTable.revision_id, revisions[1]!.id))
            .all(),
        }
      }).pipe(Effect.provide(runtimeLayer(filename)), Effect.scoped),
    )

    expect(carried.exact.metadata).toMatchObject({ outcome: "applied", durablySettled: true })
    expect(carried.revisions).toHaveLength(2)
    expect(carried.revisions[0]).toMatchObject({
      schema_version: 1,
      target_kind: item.legacy.type,
      target_value_v2: null,
    })
    expect(carried.revisions[1]).toMatchObject({
      schema_version: 2,
      target_kind: null,
      target_instant: null,
      target_local_date: null,
      target_timezone: null,
      target_timezone_release_id: null,
      target_utc_offset_minutes: null,
      target_source_expression: null,
      target_normalized: null,
      target_normalization_basis: null,
      target_value_v2: item.expected,
    })
    expect(carried.fieldBases).toEqual([])
  }
}, 30_000)

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
      const navigationInput = { action: "set", courseID: navigationCourse.id } as const
      const navigationInteraction = yield* seedInteraction(
        db,
        "reopen-navigation-applied",
        navigationInput,
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        { text: "Please make Persistent default navigation my default Course." },
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
      const pendingNavigationCourse = yield* courses.createCourse({ title: "Interrupted default navigation" })
      const pendingNavigationInput = { action: "set", courseID: pendingNavigationCourse.id } as const
      const pendingNavigationInteraction = yield* seedInteraction(
        db,
        "reopen-navigation-interrupted",
        pendingNavigationInput,
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        { text: "Please change my default to Interrupted default navigation." },
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
      expect(JSON.parse(pendingNavigation.output)).toMatchObject({
        settlement: { outcome: "error", code: "interrupted" },
      })
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
      const createdSnapshot = yield* db.transaction((tx) => RetainedSteering.readActiveSnapshot(tx, sourceTime + 1))
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
      const cut = yield* db.transaction((tx) => RetainedSteering.readCut(tx, pending.registration.assistantMessageID))
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
      expect(yield* exactPartResult(db, persisted.replacementRegistration.partID)).toEqual(persisted.replacementResult)
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
        title: "Retained learning steering",
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

test("rejects an Agent-native Default-Course action whose runtime-owned Course snapshot changes while prompting", async () => {
  await using tmp = await tmpdir()
  const filename = join(tmp.path, "learning-command-default-confirmation-race.sqlite")
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let asks = 0
  const blockingConfirmation = Layer.succeed(
    Permission.Service,
    Permission.Service.of({
      ask: (permission) =>
        Effect.gen(function* () {
          asks++
          const id = permission.id ?? PermissionV1.ID.ascending()
          const basis = {
            permission: permission.permission,
            patterns: [...permission.patterns],
            requirePrompt: permission.requirePrompt ?? false,
            ruleset: [...permission.ruleset],
            authority: [...(permission.authority ?? [])],
            approved: [],
            evaluated: permission.patterns.map((pattern) => ({
              permission: permission.permission,
              pattern,
              action: "ask" as const,
            })),
          } satisfies Permission.EvaluationBasis
          const request = {
            id,
            sessionID: permission.sessionID,
            permission: permission.permission,
            patterns: permission.patterns,
            metadata: permission.metadata,
            always: permission.always,
            tool: permission.tool,
          } satisfies PermissionV1.Request
          if (permission.lifecycle) yield* permission.lifecycle.selected({ action: "ask", basis, request })
          entered.resolve()
          yield* Effect.promise(() => release.promise)
          if (permission.lifecycle) {
            yield* permission.lifecycle.replied({ request, reply: { requestID: id, reply: "once" } })
          }
        }),
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
      const input = { action: "set", courseID: course.id } as const
      const interaction = yield* seedInteraction(
        db,
        "default-confirmation-race",
        input,
        LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        { text: "Please make Original default title my default Course." },
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
          context(interaction.registration, "ask", LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY),
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

      expect(JSON.parse(result.output)).toMatchObject({ settlement: { outcome: "error", code: "stale" } })
      expect(asks).toBe(1)
      expect(yield* db.select().from(DefaultCoursePreferenceTransitionTable).all()).toEqual([])
      expect(yield* db.select().from(LearningCommandReceiptTable).all()).toEqual([])
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(renamedFrontier)
    }).pipe(Effect.provide(runtimeLayer(filename, blockingConfirmation)), Effect.scoped),
  )
})

it.effect(
  "runs one ordinary-Agent bootstrap through exact permission, durable ToolPart, and semantic-first replay",
  () =>
    Effect.gen(function* () {
      permissionRequests.length = 0
      const db = (yield* Database.Service).db
      const runtime = yield* LearningCommandRuntime.Service
      const input = { course: { type: "new" as const, title: "Natural-language linear algebra" } }
      const interaction = yield* seedInteraction(
        db,
        "bootstrap-runtime-root",
        input,
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        { text: "Please make a Course for linear algebra, but do not invent a syllabus yet." },
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, input, interaction.registration)
      const result = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY),
      )
      const output = JSON.parse(result.output)
      expect(output).toMatchObject({
        disposition: "candidate_v1",
        capabilityOutcome: "policy_allow",
        agentAction: { kind: "root" },
        settlement: {
          outcome: "applied",
          bootstrapKind: "learning_bootstrap",
          children: [
            { kind: "course", outcome: "changed", detail: "created" },
            { kind: "selection", outcome: "no_change", selectedRevisionID: null },
            { kind: "anchor", outcome: "no_change" },
          ],
          acknowledgement: {
            course: { title: "Natural-language linear algebra" },
            selectedRevisionID: null,
            anchor: { usability: { usable: false, cause: "absent" } },
          },
        },
      })
      expect(result.metadata).toMatchObject({
        command: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        commandVersion: 1,
        outcome: "applied",
        durablySettled: true,
        truncated: false,
        semanticPresentationRequired: true,
        semanticPresentationBasis: {
          version: 1,
          phase: "result",
          basis: { kind: "learning_bootstrap_result" },
        },
      })
      expect(permissionRequests).toHaveLength(1)
      expect(permissionRequests[0]).toMatchObject({
        permission: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        patterns: [LearningCommand.LEARNING_BOOTSTRAP_PERMISSION_PATTERN],
        requirePrompt: false,
        metadata: {
          bootstrapKind: "learning_bootstrap",
          issuance: "root",
          scope: {
            canonicalCommand: JSON.stringify({
              schemaVersion: 1,
              course: { type: "new", title: "Natural-language linear algebra" },
              selection: { type: "preserve" },
              materials: [],
              maps: [],
              alignments: [],
              anchor: { type: "preserve" },
            }),
            course: { action: "create", title: "Natural-language linear algebra" },
            route: { action: "none" },
            materials: [],
          },
        },
      })
      expect(yield* exactPartResult(db, interaction.registration.partID)).toEqual(result)
      expect(
        yield* db.get(sql`SELECT
        (SELECT count(*) FROM course) AS courses,
        (SELECT count(*) FROM course_view) AS views,
        (SELECT count(*) FROM learning_bootstrap_effect) AS effects,
        (SELECT count(*) FROM learning_bootstrap_commit_seal) AS seals,
        (SELECT count(*) FROM learning_command_receipt) AS receipts`),
      ).toEqual({ courses: 1, views: 0, effects: 1, seals: 1, receipts: 1 })

      const physicalReplay = yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        input,
        context(interaction.registration, "deny", LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY),
      )
      expect(physicalReplay).toEqual(result)
      expect(permissionRequests).toHaveLength(1)

      const duplicate = yield* insertAssistant(
        db,
        interaction,
        "bootstrap-runtime-semantic-duplicate",
        input,
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, input, duplicate)
      expect(
        JSON.parse(
          (yield* runtime.executeCommand(
            LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
            input,
            context(duplicate, "deny", LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY),
          )).output,
        ),
      ).toMatchObject({
        disposition: "semantic_terminal_v1",
        semanticTerminal: { outcome: "already_applied", existingEffectID: output.settlement.effectID },
        settlement: { outcome: "already_applied", effectID: output.settlement.effectID },
      })
      expect(permissionRequests).toHaveLength(1)

      const conflictingInput = { course: { type: "new" as const, title: "Different semantic meaning" } }
      const conflict = yield* insertAssistant(
        db,
        interaction,
        "bootstrap-runtime-semantic-conflict",
        conflictingInput,
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      )
      yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, conflictingInput, conflict)
      expect(
        JSON.parse(
          (yield* runtime.executeCommand(
            LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
            conflictingInput,
            context(conflict, "allow", LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY),
          )).output,
        ),
      ).toMatchObject({
        disposition: "semantic_terminal_v1",
        semanticTerminal: { outcome: "semantic_conflict", existingEffectID: output.settlement.effectID },
        settlement: {
          outcome: "error",
          code: "semantic_conflict",
          detail: { effectID: output.settlement.effectID },
        },
      })
      expect(permissionRequests).toHaveLength(1)
    }),
)

it.effect("binds delegated bootstrap membership and denies a missing child capability before permission", () =>
  Effect.gen(function* () {
    permissionRequests.length = 0
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const input = { course: { type: "new" as const, title: "Delegated bootstrap Course" } }
    const delegatedCapability = {
      version: 2,
      parent: [],
      inherited: [],
      profile: [],
      explicit: [
        {
          permission: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
          pattern: LearningCommand.LEARNING_BOOTSTRAP_PERMISSION_PATTERN,
          action: "allow",
        },
      ],
    }
    const delegated = yield* seedDelegatedLearningCommandInteraction(
      db,
      "bootstrap-allowed",
      input,
      delegatedCapability,
      LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
    )
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, input, delegated.registration)
    const applied = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        input,
        context(delegated.registration, "allow", LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY),
      )).output,
    )
    expect(applied).toMatchObject({
      disposition: "candidate_v1",
      settlement: { outcome: "applied" },
      agentAction: {
        kind: "delegated",
        turnID: delegated.child.turnID,
        occurrenceID: delegated.registration.causalOccurrenceID,
        lineage: [
          {
            childTurnID: delegated.child.turnID,
            parentTurnID: delegated.parent.turnID,
            delegatedCapability,
            delegatedCapabilityFingerprint: expect.any(String),
          },
        ],
        effectiveDelegatedCapability: {
          identity: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
          version: 1,
          projectionVersion: 2,
          fingerprint: expect.any(String),
        },
      },
    })
    expect(permissionRequests).toHaveLength(1)

    const missing = yield* seedDelegatedLearningCommandInteraction(
      db,
      "bootstrap-missing",
      { course: { type: "new", title: "Must not be created" } },
      { version: 2, parent: [], inherited: [], profile: [], explicit: [] },
      LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
    )
    const missingInput = { course: { type: "new" as const, title: "Must not be created" } }
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, missingInput, missing.registration)
    const denied = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        missingInput,
        context(missing.registration, "allow", LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY),
      )).output,
    )
    expect(denied).toMatchObject({
      disposition: "physical_no_effect",
      settlement: { outcome: "error", code: "permission_rejected" },
    })
    expect(permissionRequests).toHaveLength(1)
    expect(
      yield* db.get(sql`SELECT
        (SELECT count(*) FROM learning_command_invocation
          WHERE part_id = ${missing.registration.partID} AND status = 'error') AS invocations,
        (SELECT count(*) FROM learning_bootstrap_disposition
          WHERE invocation_part_id = ${missing.registration.partID}) AS dispositions,
        (SELECT count(*) FROM learning_bootstrap_capability_settlement
          WHERE invocation_part_id = ${missing.registration.partID}) AS capabilities,
        (SELECT count(*) FROM learning_bootstrap_effect
          WHERE invocation_part_id = ${missing.registration.partID}) AS effects`),
    ).toEqual({ invocations: 1, dispositions: 0, capabilities: 0, effects: 0 })
  }),
)

it.effect("forces an exact common permission grant for a one-operation local bootstrap read", () =>
  Effect.gen(function* () {
    if (process.platform !== "win32") return
    permissionRequests.length = 0
    const temporary = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()).pipe(Effect.ignore),
    )
    const sourcePath = join(temporary.path, "one-operation.txt")
    yield* Effect.promise(() => Bun.write(sourcePath, "Exact one-operation learning material"))
    const db = (yield* Database.Service).db
    const runtime = yield* LearningCommandRuntime.Service
    const input = {
      course: { type: "new" as const, title: "One-operation material" },
      materials: [
        {
          type: "local" as const,
          key: "source",
          path: sourcePath,
          authority: { type: "one_operation" as const },
        },
      ],
    }
    const interaction = yield* seedInteraction(
      db,
      "bootstrap-one-operation",
      input,
      LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      { text: "Keep this exact file with a new Course." },
    )
    yield* runtime.prepareCommand(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, input, interaction.registration)
    const result = JSON.parse(
      (yield* runtime.executeCommand(
        LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        input,
        context(interaction.registration, "allow", LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY),
      )).output,
    )
    expect(permissionRequests).toHaveLength(1)
    expect(permissionRequests[0]).toMatchObject({
      permission: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      patterns: [LearningCommand.LEARNING_BOOTSTRAP_PERMISSION_PATTERN],
      requirePrompt: true,
      metadata: {
        scope: {
          materials: [
            {
              key: "source",
              type: "local",
              identity: sourcePath,
              localAuthority: "one_operation",
            },
          ],
        },
      },
    })
    expect(result).toMatchObject({
      disposition: "candidate_v1",
      capabilityOutcome: "prompted_allow",
      permissionRequestID: expect.any(String),
      settlement: {
        outcome: "applied",
        children: [
          { kind: "course", outcome: "changed" },
          { kind: "selection", outcome: "no_change" },
          {
            kind: "material",
            outcome: "changed",
            materialTarget: {
              type: "artifact",
              sourceAuthority: {
                kind: "one_operation",
                canonicalPath: expect.any(String),
                relativePath: "one-operation.txt",
                operationIdentity: `${interaction.registration.partID}:${interaction.registration.callID}`,
                approvalBasis: expect.stringContaining("permissionRequestID"),
              },
            },
          },
          { kind: "anchor", outcome: "no_change" },
        ],
      },
    })
  }),
)

function defaultCourseDirectInput(
  course: Course.CourseInfo,
  _sourceExcerpt: string,
  _current: Readonly<{ headID: LearnerNavigation.DefaultEffectID | null; version: number }> = {
    headID: null,
    version: 0,
  },
) {
  return {
    action: "set",
    courseID: course.id,
  } as const
}

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

function acceptedGoalInput(outcome: string, conditions: readonly string[] = []) {
  return {
    authorizationBasis: "learner_acceptance" as const,
    operations: [
      {
        type: "create" as const,
        snapshot: {
          outcome,
          conditions,
          scope: { type: "learner_home" as const },
          target: { type: "absent" as const },
          fieldBases: {
            outcome: { type: "accepted" as const },
            conditions: { type: "accepted" as const },
            scope: { type: "accepted" as const },
            target: { type: "accepted" as const },
            disposition: { type: "accepted" as const },
          },
        },
        disposition: "active" as const,
      },
    ],
  }
}

function directGoalCreate(
  outcome: string,
  excerpts: {
    readonly outcome?: string
    readonly conditions?: string
    readonly scope?: string
    readonly target?: string
    readonly disposition?: string
  } = {},
) {
  return {
    type: "create" as const,
    snapshot: {
      outcome,
      conditions: [] as const,
      scope: { type: "learner_home" as const },
      target: { type: "absent" as const },
      fieldBases: {
        outcome: { type: "authored" as const, sourceExcerpt: excerpts.outcome ?? outcome },
        conditions: { type: "authored" as const, sourceExcerpt: excerpts.conditions ?? outcome },
        scope: { type: "authored" as const, sourceExcerpt: excerpts.scope ?? outcome },
        target: { type: "authored" as const, sourceExcerpt: excerpts.target ?? outcome },
        disposition: { type: "authored" as const, sourceExcerpt: excerpts.disposition ?? outcome },
      },
    },
    disposition: "active" as const,
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

function frozenLegacyGoalTerminalResult(
  settlement: LearningCommand.Settlement,
  envelope: NonNullable<Parameters<typeof LearningCommandRuntime.exactResult>[2]>,
  goalOperations: readonly LearnerGoal.ResultPresentationOperation[],
) {
  const exact = LearningCommandRuntime.exactResult(
    settlement,
    LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
    {
      ...envelope,
      capabilityVersion: LearningCommand.HISTORICAL_UPDATE_LEARNER_GOALS_VERSION,
    },
    goalOperations,
  )
  return { ...exact, metadata: { ...exact.metadata, commandVersion: 1 } }
}

function settleInteractionTurn(
  db: Database.Interface["db"],
  interaction: { readonly turnID: Turn.ID; readonly registration: LearningCommandRuntime.Registration },
  time: number,
) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      yield* TurnLifecycle.settleTool(tx, {
        turnID: interaction.turnID,
        partID: interaction.registration.partID,
        state: "completed",
        time,
      })
      yield* TurnLifecycle.settle(tx, {
        turnID: interaction.turnID,
        outcome: "completed",
        reason: "normal",
        time,
      })
    }),
  )
}

function goalInvocationProjection(db: Database.Interface["db"], partID: SessionV1.PartID) {
  return db
    .select({
      status: LearningCommandInvocationTable.status,
      confirmation: LearnerGoalCommandTable.confirmation_snapshot,
      effectID: sql<LearnerGoal.EffectID | null>`json_extract(${LearningCommandInvocationTable.settlement}, '$.effectID')`,
      settlement: LearningCommandInvocationTable.settlement,
      timeSettled: LearningCommandInvocationTable.time_settled,
    })
    .from(LearningCommandInvocationTable)
    .leftJoin(
      LearnerGoalCommandTable,
      eq(LearnerGoalCommandTable.invocation_part_id, LearningCommandInvocationTable.part_id),
    )
    .where(eq(LearningCommandInvocationTable.part_id, partID))
    .get()
}

function goalReceiptCount(db: Database.Interface["db"], occurrenceID?: LearningCommand.OccurrenceID) {
  return occurrenceID
    ? db.get(sql`
        SELECT count(*) AS count
        FROM learning_command_receipt AS receipt
        JOIN learner_goal_commit_seal AS seal ON seal.receipt_id = receipt.id
        WHERE receipt.occurrence_id = ${occurrenceID}
      `)
    : db.get(sql`
        SELECT count(*) AS count
        FROM learning_command_receipt AS receipt
        JOIN learner_goal_commit_seal AS seal ON seal.receipt_id = receipt.id
      `)
}

function retainedSteeringInvocationProjection(db: Database.Interface["db"], partID: SessionV1.PartID) {
  return db
    .select({
      status: LearningCommandInvocationTable.status,
      effectID: sql<RetainedSteering.TransitionID | null>`json_extract(${LearningCommandInvocationTable.settlement}, '$.effectID')`,
      settlement: LearningCommandInvocationTable.settlement,
    })
    .from(LearningCommandInvocationTable)
    .where(eq(LearningCommandInvocationTable.part_id, partID))
    .get()
}

function retainedSteeringReceiptCount(db: Database.Interface["db"], occurrenceID?: LearningCommand.OccurrenceID) {
  return occurrenceID
    ? db.get(sql`
        SELECT count(*) AS count
        FROM learning_command_receipt AS receipt
        JOIN retained_steering_commit_seal AS seal ON seal.receipt_id = receipt.id
        WHERE receipt.occurrence_id = ${occurrenceID}
      `)
    : db.get(sql`
        SELECT count(*) AS count
        FROM learning_command_receipt AS receipt
        JOIN retained_steering_commit_seal AS seal ON seal.receipt_id = receipt.id
      `)
}

function settleRaceCapability(
  db: Database.Interface["db"],
  partID: SessionV1.PartID,
  outcome:
    | "policy_allow"
    | "policy_deny"
    | "prompted_allow"
    | "prompted_deny"
    | "prompted_correct"
    | "prompted_cancel"
    | "not_evaluated"
    | "prompted_abort",
  ordinal: number,
) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      const provenance = yield* tx
        .select({
          authorizationFingerprint: LearnerDefaultCourseDispositionTable.authorization_fingerprint,
          agentActionFingerprint: LearnerDefaultCourseDispositionTable.agent_action_fingerprint,
          time: LearnerDefaultCourseDispositionTable.time_disposed,
        })
        .from(LearnerDefaultCourseDispositionTable)
        .where(eq(LearnerDefaultCourseDispositionTable.invocation_part_id, partID))
        .get()
      const fingerprint = provenance?.agentActionFingerprint ?? provenance?.authorizationFingerprint
      if (!provenance || !fingerprint) return yield* Effect.die("Race candidate lost its issuance provenance")
      const time = Math.max(Date.now(), provenance.time) + ordinal
      if (outcome === "policy_allow" || outcome === "policy_deny") {
        yield* settleDefaultCoursePolicy(tx, {
          partID,
          outcome,
          policyBasis: { source: "candidate-race-oracle", action: outcome === "policy_allow" ? "allow" : "deny" },
          time,
          order: ordinal * 2,
        })
        return
      }
      if (outcome === "not_evaluated") {
        yield* recoverDefaultCourseCapability(tx, { partID, time, order: ordinal * 2 })
        return
      }
      const requestID = PermissionV1.ID.ascending(`per_default_race_${outcome}_${ordinal}`)
      yield* issueDefaultCourseCapabilityPrompt(tx, {
        partID,
        requestID,
        policyBasis: { source: "candidate-race-oracle" },
        shownScope: { provenanceFingerprint: fingerprint },
        time,
        order: ordinal * 2,
      })
      if (outcome === "prompted_abort") {
        yield* recoverDefaultCourseCapability(tx, { partID, time: time + 1, order: ordinal * 2 + 1 })
        return
      }
      yield* settleDefaultCoursePrompt(tx, {
        partID,
        requestID,
        outcome,
        reply:
          outcome === "prompted_allow"
            ? { requestID, reply: "once" }
            : outcome === "prompted_correct"
              ? { requestID, reply: "reject", message: "form a corrected candidate" }
              : { requestID, reply: outcome === "prompted_cancel" ? "cancel" : "reject" },
        time: time + 1,
        order: ordinal * 2 + 1,
      })
    }),
  )
}

function defaultCourseCandidateEvidence(db: Database.Interface["db"], partID: SessionV1.PartID) {
  return Effect.all({
    issue: db
      .select()
      .from(LearnerDefaultCourseCapabilityIssueTable)
      .where(eq(LearnerDefaultCourseCapabilityIssueTable.invocation_part_id, partID))
      .get(),
    capability: db
      .select()
      .from(LearnerDefaultCourseCapabilitySettlementTable)
      .where(eq(LearnerDefaultCourseCapabilitySettlementTable.invocation_part_id, partID))
      .get(),
    counts: db.get(sql`
      SELECT
        (SELECT count(*) FROM learner_default_course_transition
          WHERE authorization_part_id = ${partID} OR agent_action_part_id = ${partID}) AS effects,
        (SELECT count(*) FROM learner_default_course_acknowledgement
          WHERE invocation_part_id = ${partID}) AS acknowledgements
    `),
  })
}

function runtimeLayer(filename: string, permissionLayer = permission) {
  return LayerNode.compile(root, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
    [Permission.node, permissionLayer],
  ])
}

function insertAdmittedNavigationInvocation(
  db: Database.Interface["db"],
  input: {
    suffix: string
    sessionID: SessionSchema.ID
    parentUserMessageID: SessionV1.MessageID
    occurrenceID: LearningCommand.OccurrenceID
    turnID: Turn.ID
    inputID: Turn.InputID
  } & (
    | {
        kind: "default"
        effect: LearnerNavigation.DefaultEffect
        permissionRequestID: PermissionV1.ID
      }
    | { kind: "anchor"; effect: LearnerNavigation.AnchorEffect }
  ),
) {
  const partID = SessionV1.PartID.ascending(`prt_receipt_promotion_${input.suffix}`)
  const assistantMessageID = SessionV1.MessageID.ascending(`msg_receipt_promotion_${input.suffix}`)
  return db.transaction((tx) =>
    Effect.gen(function* () {
      yield* tx
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
          status: "admitted",
          receipt_id: null,
          settlement: null,
          time_admitted: input.effect.timeCommitted,
          time_settled: null,
          settlement_order: null,
          turn_id: input.turnID,
          input_id: input.inputID,
        })
        .run()
      if (input.kind === "default") {
        yield* tx
          .insert(LearnerDefaultCourseCommandTable)
          .values({ invocation_part_id: partID, permission_request_id: input.permissionRequestID })
          .run()
      }
      return { partID, assistantMessageID }
    }),
  )
}

function insertOrReplaceReceipt(
  db: Database.Interface["db"],
  receipt: typeof LearningCommandReceiptTable.$inferSelect,
) {
  return db.run(sql`
    INSERT OR REPLACE INTO learning_command_receipt (
      id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
      invocation_part_id, capability_identity, capability_version, authorization_basis,
      time_committed, commit_order
    ) VALUES (
      ${receipt.id}, ${receipt.occurrence_id}, ${receipt.origin_session_id}, ${receipt.origin_message_id},
      ${receipt.assistant_message_id}, ${receipt.invocation_part_id}, ${receipt.capability_identity},
      ${receipt.capability_version}, ${receipt.authorization_basis}, ${receipt.time_committed}, ${receipt.commit_order}
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
      authorization_part_id, permission_request_id, confirmation_snapshot, target_course_version,
      target_selection_revision_id, target_selection_version, target_view_id,
      target_view_version, target_revision_version, time_committed, commit_order,
      frontier_sequence, frontier_time
    )
    SELECT
      ${rowid}
      ${replacementID}, version, predecessor_id, previous_course_id, course_id, occurrence_id,
      authorization_part_id, permission_request_id, confirmation_snapshot, target_course_version,
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
    acceptanceSeal: typeof CourseSelectionAcceptanceCommitSealTable.$inferSelect
    defaultReceipt: typeof LearningCommandReceiptTable.$inferSelect
    defaultSeal: typeof LearnerDefaultCourseCommitSealTable.$inferSelect
    anchorReceipt: typeof LearningCommandReceiptTable.$inferSelect
    anchorSeal: typeof LearnerCourseRouteAnchorCommitSealTable.$inferSelect
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
      seals: {
        acceptance: yield* db
          .select()
          .from(CourseSelectionAcceptanceCommitSealTable)
          .where(eq(CourseSelectionAcceptanceCommitSealTable.effect_id, input.acceptanceSeal.effect_id))
          .get(),
        default: yield* db
          .select()
          .from(LearnerDefaultCourseCommitSealTable)
          .where(eq(LearnerDefaultCourseCommitSealTable.effect_id, input.defaultSeal.effect_id))
          .get(),
        anchor: yield* db
          .select()
          .from(LearnerCourseRouteAnchorCommitSealTable)
          .where(eq(LearnerCourseRouteAnchorCommitSealTable.effect_id, input.anchorSeal.effect_id))
          .get(),
      },
      acceptanceEffect: yield* db
        .select()
        .from(CourseSelectionAcceptanceEffectTable)
        .where(eq(CourseSelectionAcceptanceEffectTable.id, input.acceptanceSeal.effect_id))
        .get(),
      defaultTransition: yield* db
        .select()
        .from(DefaultCoursePreferenceTransitionTable)
        .where(eq(DefaultCoursePreferenceTransitionTable.id, input.defaultSeal.effect_id))
        .get(),
      anchorTransition: yield* db
        .select()
        .from(CourseRouteAnchorTransitionTable)
        .where(eq(CourseRouteAnchorTransitionTable.id, input.anchorSeal.effect_id))
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
  toolID:
    | LearningCommandRuntime.PrimaryCapability
    | typeof PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
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
      registration: yield* insertAssistant(db, interaction, suffix, input, toolID, time),
    }
  }).pipe(Effect.orDie)
}

function seedFollowupInteraction(
  db: Database.Interface["db"],
  origin: {
    readonly sessionID: SessionSchema.ID
  },
  suffix: string,
  input: Record<string, unknown>,
  toolID: LearningCommandRuntime.PrimaryCapability,
  options: { readonly text: string; readonly time: number; readonly timeZone?: string | null },
) {
  return Effect.gen(function* () {
    const userMessageID = SessionV1.MessageID.ascending(`msg_learning_runtime_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_learning_runtime_user_${suffix}`)
    yield* db
      .insert(MessageTable)
      .values({
        id: userMessageID,
        session_id: origin.sessionID,
        data: userData(options.time),
        time_created: options.time,
        time_updated: options.time,
      })
      .run()
    yield* db
      .insert(PartTable)
      .values({
        id: userPartID,
        session_id: origin.sessionID,
        message_id: userMessageID,
        data: { type: "text", text: options.text } as (typeof PartTable.$inferInsert)["data"],
        time_created: options.time,
        time_updated: options.time,
      })
      .run()
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    const occurrenceID = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const occurrence = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({ timeZone: options.timeZone }),
          sessionID: origin.sessionID,
          messageID: userMessageID,
          timeAdmitted: options.time,
        })
        yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID,
          sessionID: origin.sessionID,
          inputID,
          messageID: userMessageID,
          occurrenceID: occurrence.id,
          limits: { model: 100, tool: 100 },
          envelope: { input },
          policyBasis: { source: "learning-command-runtime-followup-test" },
          timeAdmitted: options.time,
        })
        return occurrence.id
      }),
    )
    const interaction = {
      sessionID: origin.sessionID,
      userMessageID,
      turnID,
      inputID,
      occurrenceID,
    }
    return {
      ...interaction,
      registration: yield* insertAssistant(db, interaction, suffix, input, toolID, options.time),
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
    occurrenceID?: LearningCommand.OccurrenceID
  },
  suffix: string,
  input: Record<string, unknown>,
  toolID:
    | LearningCommandRuntime.PrimaryCapability
    | typeof PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
  timeOverride?: number,
) {
  return Effect.gen(function* () {
    const time = timeOverride ?? Date.now()
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

function seedDelegatedLearningCommandInteraction(
  db: Database.Interface["db"],
  suffix: string,
  input: Record<string, unknown>,
  delegatedCapability: Record<string, unknown>,
  toolID: LearningCommandRuntime.PrimaryCapability = LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
) {
  return Effect.gen(function* () {
    const time = Date.now()
    const parentSessionID = SessionSchema.ID.make(`ses_learning_runtime_delegation_parent_${suffix}`)
    const parentTurnID = Turn.ID.create()
    const parentInputID = Turn.InputID.create()
    const parentUserMessageID = SessionV1.MessageID.ascending(`msg_delegation_parent_user_${suffix}`)
    const parentUserPartID = SessionV1.PartID.ascending(`prt_delegation_parent_user_${suffix}`)
    const parentAssistantMessageID = SessionV1.MessageID.ascending(`msg_delegation_parent_assistant_${suffix}`)
    const parentTaskPartID = SessionV1.PartID.ascending(`prt_delegation_parent_task_${suffix}`)
    const parentTaskCallID = `call-delegation-parent-${suffix}`
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
        id: parentSessionID,
        project_id: Project.ID.global,
        slug: parentSessionID,
        directory: "C:\\project",
        title: `Delegation parent ${suffix}`,
        version: "test",
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(MessageTable)
      .values({
        id: parentUserMessageID,
        session_id: parentSessionID,
        data: userData(time),
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(PartTable)
      .values({
        id: parentUserPartID,
        session_id: parentSessionID,
        message_id: parentUserMessageID,
        data: { type: "text", text: `Delegate ${suffix}` } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const occurrenceID = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const occurrence = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({ timeZone: "UTC" }),
          sessionID: parentSessionID,
          messageID: parentUserMessageID,
          timeAdmitted: time,
        })
        yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID: parentTurnID,
          sessionID: parentSessionID,
          inputID: parentInputID,
          messageID: parentUserMessageID,
          occurrenceID: occurrence.id,
          limits: { model: 1, tool: 1 },
          envelope: { input: { task: `delegate ${suffix}` } },
          policyBasis: { source: "delegated-default-course-test" },
          timeAdmitted: time,
        })
        return occurrence.id
      }),
    )
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: parentAssistantMessageID,
            session_id: parentSessionID,
            data: assistantData(parentUserMessageID, time + 1),
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: parentTaskPartID,
            session_id: parentSessionID,
            message_id: parentAssistantMessageID,
            data: {
              type: "tool",
              tool: "task",
              callID: parentTaskCallID,
              state: {
                status: "pending",
                input: { description: `Delegate ${suffix}` },
                raw: JSON.stringify({ description: `Delegate ${suffix}` }),
              },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run()
        yield* TurnLifecycle.admitModel(tx, {
          turnID: parentTurnID,
          sessionID: parentSessionID,
          assistantMessageID: parentAssistantMessageID,
          requestEnvelope: { task: `delegate ${suffix}` },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`delegation-parent:${suffix}`).digest("hex"),
          snapshotFrontier: { sequence: 0, time: 0 },
          timeAdmitted: time + 1,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: parentTurnID,
          sessionID: parentSessionID,
          assistantMessageID: parentAssistantMessageID,
          candidates: [
            {
              partID: parentTaskPartID,
              callID: parentTaskCallID,
              tool: "task",
              envelope: { description: `Delegate ${suffix}` },
            },
          ],
          timeSealed: time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: parentTurnID,
          assistantMessageID: parentAssistantMessageID,
          state: "completed",
          time: time + 1,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID: parentTurnID,
          sessionID: parentSessionID,
          assistantMessageID: parentAssistantMessageID,
          partID: parentTaskPartID,
          timeAdmitted: time + 1,
        })
      }),
    )

    const childSessionID = SessionSchema.ID.make(`ses_learning_runtime_delegation_child_${suffix}`)
    const childTurnID = Turn.ID.create()
    const childInputID = Turn.InputID.create()
    const childUserMessageID = SessionV1.MessageID.ascending(`msg_delegation_child_user_${suffix}`)
    const childUserPartID = SessionV1.PartID.ascending(`prt_delegation_child_user_${suffix}`)
    yield* db
      .insert(SessionTable)
      .values({
        id: childSessionID,
        project_id: Project.ID.global,
        parent_id: parentSessionID,
        slug: childSessionID,
        directory: "C:\\project",
        title: `Delegated default Course ${suffix}`,
        version: "test",
        time_created: time + 2,
        time_updated: time + 2,
      })
      .run()
    yield* db
      .insert(MessageTable)
      .values({
        id: childUserMessageID,
        session_id: childSessionID,
        data: userData(time + 2),
        time_created: time + 2,
        time_updated: time + 2,
      })
      .run()
    yield* db
      .insert(PartTable)
      .values({
        id: childUserPartID,
        session_id: childSessionID,
        message_id: childUserMessageID,
        data: {
          type: "text",
          text: `Apply delegated default Course action ${suffix}`,
        } as (typeof PartTable.$inferInsert)["data"],
        time_created: time + 2,
        time_updated: time + 2,
      })
      .run()
    yield* db.transaction((tx) =>
      TurnLifecycle.admit(tx, {
        kind: "delegated_task",
        turnID: childTurnID,
        sessionID: childSessionID,
        inputID: childInputID,
        messageID: childUserMessageID,
        limits: { model: 8, tool: 16 },
        envelope: { kind: "delegated_task", requestedOutput: `Apply ${suffix}` },
        policyBasis: { source: "delegated-default-course-test" },
        delegatedCapability,
        parentTurnID,
        parentTaskPartID,
        parentModelMessageID: parentAssistantMessageID,
        depthLimit: 1,
        timeAdmitted: time + 2,
      }),
    )
    const registration = yield* insertAssistant(
      db,
      {
        sessionID: childSessionID,
        userMessageID: childUserMessageID,
        turnID: childTurnID,
        inputID: childInputID,
      },
      `delegated-default-${suffix}`,
      input,
      toolID,
    )
    const operation = yield* db
      .select({ occurrenceID: TurnModelOperationTable.causal_occurrence_id })
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, registration.assistantMessageID))
      .get()
    if (!operation?.occurrenceID) {
      return yield* Effect.die("Delegated Default-Course model operation has no causal learner occurrence")
    }
    return {
      parent: { sessionID: parentSessionID, turnID: parentTurnID },
      child: { sessionID: childSessionID, turnID: childTurnID, inputID: childInputID },
      registration: { ...registration, causalOccurrenceID: operation.occurrenceID },
      occurrenceID,
    }
  })
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
