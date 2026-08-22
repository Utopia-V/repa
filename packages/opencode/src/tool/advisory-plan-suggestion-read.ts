import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import { Database } from "@opencode-ai/core/database/database"
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

export const ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID = AdvisoryPlanSuggestion.READ_CAPABILITY
export const ADVISORY_PLAN_SUGGESTION_READ_TOOL_IDS = [ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID] as const

const Page = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(AdvisoryPlanSuggestion.MAX_READ_ITEMS))),
}
const Inspection = learningInspectionInput

const AdvisoryPlanSuggestionReadInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("current"),
    suggestionID: AdvisoryPlanSuggestion.SuggestionID,
    directoryCursor: Schema.optional(Schema.String),
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("revision"),
    suggestionID: AdvisoryPlanSuggestion.SuggestionID,
    revisionID: AdvisoryPlanSuggestion.RevisionID,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("history"),
    suggestionID: AdvisoryPlanSuggestion.SuggestionID,
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

export const AdvisoryPlanSuggestionReadTool = Tool.define<
  typeof AdvisoryPlanSuggestionReadInput,
  Record<string, unknown>,
  AdvisoryPlanSuggestion.ReadService | Database.Service
>(
  ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID,
  Effect.gen(function* () {
    const suggestions = yield* AdvisoryPlanSuggestion.ReadService
    const database = yield* Database.Service
    return {
      description:
        "Read durable advisory learning suggestions without changing them: an exact immutable revision, a fresh current projection, bounded revision history, or a bounded deterministic non-priority directory page. Set includeInspection to true for the same-snapshot typed TUI owner/lineage projection. Pass the protected Context directory cursor to current or discover when the read must remain bound to that admitted operation; it returns stale instead of joining later advice or source state. Use the exact revision body and basis before detail-dependent teaching. Advice remains fallible and learner-correctable; directory order is not priority, a selected plan, a commitment, adherence, progress, or mastery.",
      parameters: AdvisoryPlanSuggestionReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(AdvisoryPlanSuggestionReadInput, { additionalProperties: false }),
      execute: (input, context) => {
        const directoryCursor =
          input.action === "current" || input.action === "discover" ? input.directoryCursor : undefined
        const directory = directoryCursor ? AdvisoryPlanSuggestion.inspectDirectoryCursor(directoryCursor) : undefined
        const query: AdvisoryPlanSuggestion.ReadQuery =
          input.action === "current"
            ? {
                type: "current",
                suggestionID: input.suggestionID,
                asOf: directory?.asOf ?? Date.now(),
                ...(directoryCursor === undefined ? {} : { directoryCursor }),
              }
            : input.action === "revision"
              ? { type: "revision", suggestionID: input.suggestionID, revisionID: input.revisionID }
              : input.action === "history"
                ? { type: "history", suggestionID: input.suggestionID }
                : {
                    type: "discover",
                    ...(input.disposition === undefined ? {} : { disposition: input.disposition }),
                    ...(directoryCursor === undefined ? {} : { directoryCursor }),
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
                const page = yield* AdvisoryPlanSuggestion.read(tx, query, options)
                return yield* learningInspectionReadResult(
                  tx,
                  suggestionResult(input.action, page),
                  context,
                  inspectionOwner(
                    "advisory_plan_suggestion",
                    input.action === "current"
                      ? "fresh current advisory suggestion"
                      : input.action === "revision"
                        ? "immutable advisory revision"
                        : input.action === "history"
                          ? "immutable advisory history"
                          : "bounded advisory directory",
                    [
                      { label: "Owner cut", value: String(page.ownerCut) },
                      {
                        label: "Advice status",
                        value: "fallible advice; not commitment, adherence, progress, or mastery",
                      },
                    ],
                  ),
                  input.includeInspection,
                )
              }),
            )
          : suggestions
              .read(query, options)
              .pipe(Effect.map((page) => learningContextReadResult(suggestionResult(input.action, page))))
        return read.pipe(
          Effect.catch((error) => {
            if (error instanceof AdvisoryPlanSuggestion.InvalidCommandError && error.reason === "stale") {
              const value = {
                status: "stale_cursor",
                reason: "The bound advisory-suggestion owner or dependency cut changed after this read began.",
                recovery: "Restart the advisory suggestion read without the old page cursor.",
              }
              return Effect.succeed({
                title: "Advisory suggestion cursor stale",
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

function suggestionResult(action: string, page: AdvisoryPlanSuggestion.ReadPage) {
  return {
    capabilityID: ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID,
    title: "Advisory learning suggestion",
    metadata: {
      action,
      count: page.returnedCount,
      countAtCut: page.countAtCut,
      omittedCount: page.omittedCount,
      ownerCut: page.ownerCut,
      ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
    },
    value: { asOf: page.asOf, page },
    itemCount: page.returnedCount,
  } satisfies Parameters<typeof learningContextReadResult>[0]
}
