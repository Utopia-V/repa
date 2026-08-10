import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import { learningContextReadResult } from "./learning-context-read"
import { Tool } from "./tool"

export const LEARNER_STATE_JUDGMENT_READ_TOOL_ID = LearnerStateJudgment.READ_CAPABILITY
export const LEARNER_STATE_JUDGMENT_READ_TOOL_IDS = [LEARNER_STATE_JUDGMENT_READ_TOOL_ID] as const

const Page = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(LearnerStateJudgment.MAX_READ_ITEMS))),
}

const LearnerStateJudgmentReadInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("current"),
    judgmentID: LearnerStateJudgment.JudgmentID,
    directoryCursor: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literal("revision"),
    judgmentID: LearnerStateJudgment.JudgmentID,
    revisionID: LearnerStateJudgment.RevisionID,
  }),
  Schema.Struct({ action: Schema.Literal("history"), judgmentID: LearnerStateJudgment.JudgmentID, ...Page }),
  Schema.Struct({
    action: Schema.Literal("discover"),
    disposition: Schema.optional(Schema.Literals(["active", "retired"])),
    directoryCursor: Schema.optional(Schema.String),
    ...Page,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearnerStateJudgmentReadTool = Tool.define<
  typeof LearnerStateJudgmentReadInput,
  Record<string, unknown>,
  LearnerStateJudgment.ReadService
>(
  LEARNER_STATE_JUDGMENT_READ_TOOL_ID,
  Effect.gen(function* () {
    const judgments = yield* LearnerStateJudgment.ReadService
    return {
      description:
        "Read durable learner-state judgments without changing them: an exact immutable revision, a fresh current projection, bounded revision history, or a bounded deterministic non-priority directory page. Pass the Context directory cursor to current or discover when the read must remain bound to that admitted operation; it returns stale rather than joining a later owner/dependency cut. Without that cursor, current is an explicitly fresh read. Bodies, exact basis references, uncertainty, source drift, and history stay lazy. These are fallible whole-judgment memories, not mastery certificates, scores, activity, progress, priority, or required Tutor moves.",
      parameters: LearnerStateJudgmentReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearnerStateJudgmentReadInput, { additionalProperties: false }),
      execute: (input) => {
        const asOf = Date.now()
        const query: LearnerStateJudgment.ReadQuery =
          input.action === "current"
            ? {
                type: "current",
                judgmentID: input.judgmentID,
                asOf,
                ...(input.directoryCursor === undefined ? {} : { directoryCursor: input.directoryCursor }),
              }
            : input.action === "revision"
              ? { type: "revision", judgmentID: input.judgmentID, revisionID: input.revisionID }
              : input.action === "history"
                ? { type: "history", judgmentID: input.judgmentID }
                : {
                    type: "discover",
                    ...(input.disposition === undefined ? {} : { disposition: input.disposition }),
                    ...(input.directoryCursor === undefined ? {} : { directoryCursor: input.directoryCursor }),
                  }
        return judgments
          .read(query, {
            ...(input.action === "history" || input.action === "discover"
              ? {
                  ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
                  ...(input.limit === undefined ? {} : { limit: input.limit }),
                }
              : {}),
          })
          .pipe(
            Effect.map((page) =>
              learningContextReadResult({
                title: "Learner-state judgment",
                metadata: {
                  action: input.action,
                  count: page.returnedCount,
                  countAtCut: page.countAtCut,
                  omittedCount: page.omittedCount,
                  ownerCut: page.ownerCut,
                  ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
                },
                value: { asOf: page.asOf, page },
                itemCount: page.returnedCount,
              }),
            ),
            Effect.catch((error) => {
              if (error instanceof LearnerStateJudgment.InvalidCommandError && error.reason === "stale") {
                const value = {
                  status: "stale_cursor",
                  reason: "The bound learner-state owner or dependency cut changed after this read began.",
                  recovery: "Restart the learner-state judgment read without the old page cursor.",
                }
                return Effect.succeed({
                  title: "Learner-state judgment cursor stale",
                  metadata: { action: input.action, status: "stale_cursor", truncated: false },
                  output: JSON.stringify(value),
                })
              }
              return Effect.die(error)
            }),
            Effect.orDie,
          )
      },
    }
  }),
)
