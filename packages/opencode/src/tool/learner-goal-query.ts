import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { MAX_LAZY_BYTES } from "@opencode-ai/core/learning-context"
import { waitForAbort } from "@opencode-ai/core/process"
import { NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import {
  learningContextReadResult,
  learningInspectionInput,
  learningInspectionReadResult,
} from "./learning-context-read"
import { inspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import { Tool } from "./tool"

export const LEARNER_GOAL_QUERY_TOOL_ID = "learner_goal_query"
export const LEARNER_GOAL_QUERY_TOOL_IDS = [LEARNER_GOAL_QUERY_TOOL_ID] as const
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

const PageInput = {
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  cursor: Schema.optional(Schema.String),
}
const Inspection = learningInspectionInput

const LearnerGoalQueryInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("discover"),
    disposition: Schema.optional(Schema.Literals(["active", "achieved", "abandoned", "superseded"])),
    courseID: Schema.optional(Course.CourseID),
    ...PageInput,
    ...Inspection,
  }),
  Schema.Struct({ action: Schema.Literal("get"), goalID: LearnerGoal.GoalID, ...Inspection }),
  Schema.Struct({ action: Schema.Literal("history"), goalID: LearnerGoal.GoalID, ...PageInput, ...Inspection }),
  Schema.Struct({
    action: Schema.Literal("revision"),
    goalID: LearnerGoal.GoalID,
    revisionID: LearnerGoal.RevisionID,
    field: Schema.optional(Schema.Literals(["outcome", "conditions", "scope", "target", "fieldBases", "disposition"])),
    offset: Schema.optional(NonNegativeInt),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
    ...Inspection,
  }),
  Schema.Struct({ action: Schema.Literal("effect"), effectID: LearnerGoal.EffectID, ...Inspection }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearnerGoalQueryTool = Tool.define<
  typeof LearnerGoalQueryInput,
  Record<string, unknown>,
  LearnerGoal.ReadService | Database.Service
>(
  LEARNER_GOAL_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const goals = yield* LearnerGoal.ReadService
    const database = yield* Database.Service
    return {
      description:
        "Read authoritative learner Goal state without changing it. Discover a bounded current page, get one exact current Goal, expand one immutable pinned Revision (optionally by complete field page), page history, or inspect one exact committed effect. Set includeInspection to true for the same-snapshot typed TUI owner/lineage projection. Pinned Revision reads never retarget to the head; current reads are explicitly labelled with their later as-of time. Results are limited to 64 typed items and fail truthfully when a whole result exceeds the Gate 18 byte allowance.",
      parameters: LearnerGoalQueryInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearnerGoalQueryInput, { additionalProperties: false }),
      execute: (input: Schema.Schema.Type<typeof LearnerGoalQueryInput>, context) => {
        const asOf = Date.now()
        if (input.includeInspection) {
          return database.db.transaction((tx) => inspectGoalRead(tx, input, asOf, context)).pipe(Effect.orDie)
        }
        if (input.action === "get") {
          return abortable(goals.readCurrent(input.goalID, asOf), context.abort).pipe(
            Effect.map((goal) =>
              learningContextReadResult({
                capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
                title: goal ? "Learner Goal" : "Learner Goal not found",
                metadata: { action: input.action, goalID: input.goalID, found: Boolean(goal), asOf },
                value: { asOf, goal: goal ?? null },
                itemCount: goal ? 1 : 0,
              }),
            ),
            Effect.orDie,
          )
        }
        if (input.action === "history") {
          return abortable(
            goals.readHistory(input.goalID, asOf, {
              limit: input.limit ?? 64,
              ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            }),
            context.abort,
          ).pipe(
            Effect.map((page) =>
              learningContextReadResult({
                capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
                title: "Learner Goal history",
                metadata: {
                  action: input.action,
                  goalID: input.goalID,
                  count: page.items.length,
                  throughRevision: page.throughRevision,
                  ...(page.cursor ? { cursor: page.cursor } : {}),
                  asOf,
                },
                value: { asOf, page },
                itemCount: page.items.length,
              }),
            ),
            Effect.orDie,
          )
        }
        if (input.action === "revision") {
          return abortable(
            goals.readRevision({
              goalID: input.goalID,
              revisionID: input.revisionID,
              asOf,
              ...(input.field === undefined ? {} : { field: input.field }),
              ...(input.offset === undefined ? {} : { offset: input.offset }),
              ...(input.limit === undefined ? {} : { maxItems: input.limit }),
            }),
            context.abort,
          ).pipe(
            Effect.map((result) =>
              learningContextReadResult({
                capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
                title: "Pinned learner Goal Revision",
                metadata: {
                  action: input.action,
                  goalID: input.goalID,
                  revisionID: input.revisionID,
                  asOf,
                  result: result.type,
                },
                value: { result },
                itemCount: "itemCount" in result && typeof result.itemCount === "number" ? result.itemCount : 0,
              }),
            ),
            Effect.orDie,
          )
        }
        if (input.action === "effect") {
          return abortable(goals.readEffect(input.effectID), context.abort).pipe(
            Effect.map((effect) =>
              learningContextReadResult({
                capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
                title: effect ? "Learner Goal effect" : "Learner Goal effect not found",
                metadata: { action: input.action, effectID: input.effectID, found: Boolean(effect), asOf },
                value: { asOf, effect: effect ?? null },
                itemCount: effect ? 1 : 0,
              }),
            ),
            Effect.orDie,
          )
        }
        return abortable(
          goals.discover(
            asOf,
            {
              ...(input.disposition === undefined ? {} : { disposition: input.disposition }),
              ...(input.courseID === undefined ? {} : { courseID: input.courseID }),
            },
            {
              limit: input.limit ?? 64,
              ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            },
          ),
          context.abort,
        ).pipe(
          Effect.map((page) =>
            learningContextReadResult({
              capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
              title: "Learner Goals",
              metadata: {
                action: input.action,
                count: page.items.length,
                throughRevision: page.throughRevision,
                ...(page.cursor ? { cursor: page.cursor } : {}),
                asOf,
              },
              value: { asOf, page },
              itemCount: page.items.length,
            }),
          ),
          Effect.orDie,
        )
      },
    }
  }),
)

function inspectGoalRead(
  tx: Transaction,
  input: Schema.Schema.Type<typeof LearnerGoalQueryInput>,
  asOf: number,
  context: Tool.Context,
) {
  return Effect.gen(function* () {
    const result = yield* Effect.gen(function* () {
      if (input.action === "get") {
        const goal = yield* LearnerGoal.readCurrent(tx, input.goalID, asOf)
        return {
          capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
          title: goal ? "Learner Goal" : "Learner Goal not found",
          metadata: { action: input.action, goalID: input.goalID, found: Boolean(goal), asOf },
          value: { asOf, goal: goal ?? null },
          itemCount: goal ? 1 : 0,
        } satisfies Parameters<typeof learningContextReadResult>[0]
      }
      if (input.action === "history") {
        const page = yield* LearnerGoal.readHistory(tx, input.goalID, asOf, {
          limit: input.limit ?? 64,
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        })
        return {
          capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
          title: "Learner Goal history",
          metadata: {
            action: input.action,
            goalID: input.goalID,
            count: page.items.length,
            throughRevision: page.throughRevision,
            ...(page.cursor ? { cursor: page.cursor } : {}),
            asOf,
          },
          value: { asOf, page },
          itemCount: page.items.length,
        } satisfies Parameters<typeof learningContextReadResult>[0]
      }
      if (input.action === "revision") {
        const value = yield* LearnerGoal.readLearningContextRevision(tx, {
          goalID: input.goalID,
          revisionID: input.revisionID,
          asOf,
          maxBytes: MAX_LAZY_BYTES,
          maxItems: input.limit ?? 64,
          ...(input.field === undefined ? {} : { field: input.field }),
          ...(input.offset === undefined ? {} : { offset: input.offset }),
        })
        return {
          capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
          title: "Pinned learner Goal Revision",
          metadata: {
            action: input.action,
            goalID: input.goalID,
            revisionID: input.revisionID,
            asOf,
            result: value.type,
          },
          value: { result: value },
          itemCount: "itemCount" in value && typeof value.itemCount === "number" ? value.itemCount : 0,
        } satisfies Parameters<typeof learningContextReadResult>[0]
      }
      if (input.action === "effect") {
        const effect = yield* LearnerGoal.readEffect(tx, input.effectID)
        return {
          capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
          title: effect ? "Learner Goal effect" : "Learner Goal effect not found",
          metadata: { action: input.action, effectID: input.effectID, found: Boolean(effect), asOf },
          value: { asOf, effect: effect ?? null },
          itemCount: effect ? 1 : 0,
        } satisfies Parameters<typeof learningContextReadResult>[0]
      }
      const page = yield* LearnerGoal.discover(
        tx,
        asOf,
        {
          ...(input.disposition === undefined ? {} : { disposition: input.disposition }),
          ...(input.courseID === undefined ? {} : { courseID: input.courseID }),
        },
        { limit: input.limit ?? 64, ...(input.cursor === undefined ? {} : { cursor: input.cursor }) },
      )
      return {
        capabilityID: LEARNER_GOAL_QUERY_TOOL_ID,
        title: "Learner Goals",
        metadata: {
          action: input.action,
          count: page.items.length,
          throughRevision: page.throughRevision,
          ...(page.cursor ? { cursor: page.cursor } : {}),
          asOf,
        },
        value: { asOf, page },
        itemCount: page.items.length,
      } satisfies Parameters<typeof learningContextReadResult>[0]
    })
    return yield* learningInspectionReadResult(
      tx,
      result,
      context,
      inspectionOwner(
        "learner_goal",
        input.action === "get"
          ? "exact current Goal head"
          : input.action === "revision"
            ? "immutable Goal revision"
            : input.action === "history"
              ? "immutable Goal history"
              : input.action === "effect"
                ? "exact Goal command effect"
                : "bounded Goal directory",
        [
          { label: "Observation time", value: String(asOf) },
          { label: "Assignment relation", value: "Goal and Assignment are peer authorities" },
        ],
      ),
      input.includeInspection,
    )
  })
}

function abortable<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) {
  if (signal.aborted) return waitForAbort(signal)
  return Effect.raceFirst(effect, waitForAbort(signal))
}
