import { Course } from "@opencode-ai/core/course"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { waitForAbort } from "@opencode-ai/core/process"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

export const LEARNER_GOAL_QUERY_TOOL_ID = "learner_goal_query"
export const LEARNER_GOAL_QUERY_TOOL_IDS = [LEARNER_GOAL_QUERY_TOOL_ID] as const

const PageInput = {
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
  cursor: Schema.optional(Schema.String),
}

const LearnerGoalQueryInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("discover"),
    disposition: Schema.optional(Schema.Literals(["active", "achieved", "abandoned", "superseded"])),
    courseID: Schema.optional(Course.CourseID),
    ...PageInput,
  }),
  Schema.Struct({ action: Schema.Literal("get"), goalID: LearnerGoal.GoalID }),
  Schema.Struct({ action: Schema.Literal("history"), goalID: LearnerGoal.GoalID, ...PageInput }),
  Schema.Struct({ action: Schema.Literal("effect"), effectID: LearnerGoal.EffectID }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearnerGoalQueryTool = Tool.define<
  typeof LearnerGoalQueryInput,
  Record<string, unknown>,
  LearnerGoal.ReadService
>(
  LEARNER_GOAL_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const goals = yield* LearnerGoal.ReadService
    return {
      description:
        "Read authoritative learner Goal state without changing it. Discover a bounded current page, get one exact current Goal, page one Goal's immutable revision history, or inspect one exact committed effect. Cursors are opaque and query-bound. Use returned Goal/head identities for update or replace; the learner does not need to see or enter them.",
      parameters: LearnerGoalQueryInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearnerGoalQueryInput, { additionalProperties: false }),
      execute: (input: Schema.Schema.Type<typeof LearnerGoalQueryInput>, context) => {
        const asOf = Date.now()
        if (input.action === "get") {
          return abortable(goals.readCurrent(input.goalID, asOf), context.abort).pipe(
            Effect.map((goal) => ({
              title: goal ? "Learner Goal" : "Learner Goal not found",
              metadata: { action: input.action, goalID: input.goalID, found: Boolean(goal), asOf },
              output: JSON.stringify({ asOf, goal: goal ?? null }, null, 2),
            })),
            Effect.orDie,
          )
        }
        if (input.action === "history") {
          return abortable(
            goals.readHistory(input.goalID, asOf, {
              ...(input.limit === undefined ? {} : { limit: input.limit }),
              ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            }),
            context.abort,
          ).pipe(
            Effect.map((page) => ({
              title: "Learner Goal history",
              metadata: {
                action: input.action,
                goalID: input.goalID,
                count: page.items.length,
                throughRevision: page.throughRevision,
                ...(page.cursor ? { cursor: page.cursor } : {}),
                asOf,
              },
              output: JSON.stringify({ asOf, page }, null, 2),
            })),
            Effect.orDie,
          )
        }
        if (input.action === "effect") {
          return abortable(goals.readEffect(input.effectID), context.abort).pipe(
            Effect.map((effect) => ({
              title: effect ? "Learner Goal effect" : "Learner Goal effect not found",
              metadata: { action: input.action, effectID: input.effectID, found: Boolean(effect), asOf },
              output: JSON.stringify({ asOf, effect: effect ?? null }, null, 2),
            })),
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
              ...(input.limit === undefined ? {} : { limit: input.limit }),
              ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            },
          ),
          context.abort,
        ).pipe(
          Effect.map((page) => ({
            title: "Learner Goals",
            metadata: {
              action: input.action,
              count: page.items.length,
              throughRevision: page.throughRevision,
              ...(page.cursor ? { cursor: page.cursor } : {}),
              asOf,
            },
            output: JSON.stringify({ asOf, page }, null, 2),
          })),
          Effect.orDie,
        )
      },
    }
  }),
)

function abortable<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) {
  if (signal.aborted) return waitForAbort(signal)
  return Effect.raceFirst(effect, waitForAbort(signal))
}
