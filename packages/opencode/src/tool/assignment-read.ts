import { Assignment } from "@opencode-ai/core/assignment"
import { Course } from "@opencode-ai/core/course"
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

export const ASSIGNMENT_READ_TOOL_ID = Assignment.READ_CAPABILITY
export const ASSIGNMENT_READ_TOOL_IDS = [ASSIGNMENT_READ_TOOL_ID] as const

const Page = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(Assignment.MAX_READ_ITEMS))),
}
const Inspection = learningInspectionInput

const AssignmentReadInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("current"), assignmentID: Assignment.AssignmentID, ...Inspection }),
  Schema.Struct({
    action: Schema.Literal("revision"),
    assignmentID: Assignment.AssignmentID,
    revisionID: Assignment.RevisionID,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("projection"),
    assignmentID: Assignment.AssignmentID,
    revisionID: Schema.optional(Assignment.RevisionID),
    ...Inspection,
  }),
  Schema.Struct({ action: Schema.Literal("history"), assignmentID: Assignment.AssignmentID, ...Page, ...Inspection }),
  Schema.Struct({
    action: Schema.Literal("discover"),
    disposition: Schema.optional(Schema.Literals(["open", "completed", "cancelled", "dismissed", "superseded"])),
    courseID: Schema.optional(Course.CourseID),
    ...Page,
    ...Inspection,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const AssignmentReadTool = Tool.define<
  typeof AssignmentReadInput,
  Record<string, unknown>,
  Assignment.ReadService | Database.Service
>(
  ASSIGNMENT_READ_TOOL_ID,
  Effect.gen(function* () {
    const assignments = yield* Assignment.ReadService
    const database = yield* Database.Service
    return {
      description:
        "Read the authoritative Assignment owner without changing it. Resolve an exact immutable revision, current head, current source/scope/time projection, bounded history, or a bounded deterministic non-priority discovery page. Set includeInspection to true for the same-snapshot typed TUI owner/lineage projection. Current source availability and due/expiry relations are read-time projections with explicit owner cuts; they never imply activity, progress, adherence, breach, completion, learning, or a selected Tutor move.",
      parameters: AssignmentReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(AssignmentReadInput, { additionalProperties: false }),
      execute: (input, context) => {
        const asOf = Date.now()
        const query: Assignment.ReadQuery =
          input.action === "current"
            ? { type: "current", assignmentID: input.assignmentID }
            : input.action === "revision"
              ? { type: "revision", assignmentID: input.assignmentID, revisionID: input.revisionID }
              : input.action === "projection"
                ? {
                    type: "projection",
                    assignmentID: input.assignmentID,
                    ...(input.revisionID === undefined ? {} : { revisionID: input.revisionID }),
                    asOf,
                  }
                : input.action === "history"
                  ? { type: "history", assignmentID: input.assignmentID }
                  : {
                      type: "discover",
                      ...(input.disposition === undefined ? {} : { disposition: input.disposition }),
                      ...(input.courseID === undefined ? {} : { courseID: input.courseID }),
                    }
        const options = {
          asOf,
          ...(input.action === "history" || input.action === "discover"
            ? {
                ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
                ...(input.limit === undefined ? {} : { limit: input.limit }),
              }
            : {}),
        }
        const read: Effect.Effect<Tool.ExecuteResult<Record<string, unknown>>, unknown> = input.includeInspection
          ? database.db.transaction((tx) =>
              Effect.gen(function* () {
                const page = yield* Assignment.read(tx, query, options)
                const result = assignmentResult(input.action, page)
                return yield* learningInspectionReadResult(
                  tx,
                  result,
                  context,
                  inspectionOwner(
                    "assignment",
                    input.action === "current" || input.action === "projection"
                      ? "exact current Assignment"
                      : input.action === "revision"
                        ? "immutable Assignment revision"
                        : input.action === "history"
                          ? "immutable Assignment history"
                          : "bounded Assignment directory",
                    [
                      { label: "Owner cut", value: String(page.ownerCut) },
                      { label: "Completion semantics", value: "Assignment completion does not prove learning" },
                      { label: "Goal relation", value: "Goal and Assignment are peer authorities" },
                    ],
                  ),
                  input.includeInspection,
                )
              }),
            )
          : assignments
              .read(query, options)
              .pipe(Effect.map((page) => learningContextReadResult(assignmentResult(input.action, page))))
        return read.pipe(
          Effect.catch((error) => {
            if (error instanceof Assignment.InvalidCommandError && error.reason === "stale") {
              const value = {
                status: "stale_cursor",
                reason: "A bound Assignment or source dependency changed after this read began.",
                recovery: "Restart the Assignment read without the old cursor.",
              }
              return Effect.succeed({
                title: "Assignment cursor stale",
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

function assignmentResult(action: string, page: Assignment.ReadPage) {
  return {
    capabilityID: ASSIGNMENT_READ_TOOL_ID,
    title: "Assignment",
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
