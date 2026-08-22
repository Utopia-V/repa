import { Database } from "@opencode-ai/core/database/database"
import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import {
  learningContextReadResult,
  learningInspectionInput,
  learningInspectionReadResult,
} from "./learning-context-read"
import { inspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import { Tool } from "./tool"

export const LEARNER_STATE_JUDGMENT_READ_TOOL_ID = LearnerStateJudgment.READ_CAPABILITY
export const LEARNER_STATE_JUDGMENT_READ_TOOL_IDS = [LEARNER_STATE_JUDGMENT_READ_TOOL_ID] as const

const Page = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(LearnerStateJudgment.MAX_READ_ITEMS))),
}
const Inspection = learningInspectionInput

const LearnerStateJudgmentReadInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("current"),
    judgmentID: LearnerStateJudgment.JudgmentID,
    directoryCursor: Schema.optional(Schema.String),
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("revision"),
    judgmentID: LearnerStateJudgment.JudgmentID,
    revisionID: LearnerStateJudgment.RevisionID,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("history"),
    judgmentID: LearnerStateJudgment.JudgmentID,
    ...Page,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("discover"),
    disposition: Schema.optional(Schema.Literals(["active", "retired"])),
    directoryCursor: Schema.optional(Schema.String),
    ...Page,
    ...Inspection,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearnerStateJudgmentReadTool = Tool.define<
  typeof LearnerStateJudgmentReadInput,
  Record<string, unknown>,
  LearnerStateJudgment.ReadService | Database.Service
>(
  LEARNER_STATE_JUDGMENT_READ_TOOL_ID,
  Effect.gen(function* () {
    const judgments = yield* LearnerStateJudgment.ReadService
    const database = yield* Database.Service
    return {
      description:
        "Read durable learner-state judgments without changing them: an exact immutable revision, a fresh current projection, bounded revision history, or a bounded deterministic non-priority directory page. Set includeInspection to true for the same-snapshot typed TUI owner/lineage projection. Pass the Context directory cursor to current or discover when the read must remain bound to that admitted operation; it returns stale rather than joining a later owner/dependency cut. Without that cursor, current is an explicitly fresh read. Bodies, exact basis references, uncertainty, source drift, and history stay lazy. These are fallible whole-judgment memories, not mastery certificates, scores, activity, progress, priority, or required Tutor moves.",
      parameters: LearnerStateJudgmentReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearnerStateJudgmentReadInput, { additionalProperties: false }),
      execute: (input, context) => {
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
        const options =
          input.action === "history" || input.action === "discover"
            ? {
                ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
                ...(input.limit === undefined ? {} : { limit: input.limit }),
              }
            : {}
        const read: Effect.Effect<Tool.ExecuteResult<Record<string, unknown>>, unknown> = input.includeInspection
          ? database.db.transaction((tx) =>
              Effect.gen(function* () {
                const page = yield* LearnerStateJudgment.read(tx, query, options)
                return yield* learningInspectionReadResult(
                  tx,
                  judgmentResult(input.action, asOf, page),
                  context,
                  inspectionOwner(
                    "learner_state_judgment",
                    input.action === "current"
                      ? "fresh current whole-record judgment"
                      : input.action === "revision"
                        ? "immutable judgment revision"
                        : input.action === "history"
                          ? "immutable judgment history"
                          : "bounded judgment directory",
                    [
                      { label: "Owner cut", value: String(page.ownerCut) },
                      { label: "Epistemic strength", value: "fallible judgment with uncertainty and exact bases" },
                    ],
                  ),
                  input.includeInspection,
                )
              }),
            )
          : judgments
              .read(query, options)
              .pipe(Effect.map((page) => learningContextReadResult(judgmentResult(input.action, asOf, page))))
        return read.pipe(
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

function judgmentResult(action: string, asOf: number, page: LearnerStateJudgment.ReadPage) {
  return {
    capabilityID: LEARNER_STATE_JUDGMENT_READ_TOOL_ID,
    title: "Learner-state judgment",
    metadata: {
      action,
      count: page.returnedCount,
      countAtCut: page.countAtCut,
      omittedCount: page.omittedCount,
      ownerCut: page.ownerCut,
      ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
    },
    value: { asOf: page.asOf ?? asOf, page },
    itemCount: page.returnedCount,
  } satisfies Parameters<typeof learningContextReadResult>[0]
}
