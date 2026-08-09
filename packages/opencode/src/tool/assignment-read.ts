import { Assignment } from "@opencode-ai/core/assignment"
import { Course } from "@opencode-ai/core/course"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import { learningContextReadResult } from "./learning-context-read"
import { Tool } from "./tool"

export const ASSIGNMENT_READ_TOOL_ID = Assignment.READ_CAPABILITY
export const ASSIGNMENT_READ_TOOL_IDS = [ASSIGNMENT_READ_TOOL_ID] as const

const Page = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(Assignment.MAX_READ_ITEMS))),
}

const AssignmentReadInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("current"), assignmentID: Assignment.AssignmentID }),
  Schema.Struct({
    action: Schema.Literal("revision"),
    assignmentID: Assignment.AssignmentID,
    revisionID: Assignment.RevisionID,
  }),
  Schema.Struct({
    action: Schema.Literal("projection"),
    assignmentID: Assignment.AssignmentID,
    revisionID: Schema.optional(Assignment.RevisionID),
  }),
  Schema.Struct({ action: Schema.Literal("history"), assignmentID: Assignment.AssignmentID, ...Page }),
  Schema.Struct({
    action: Schema.Literal("discover"),
    disposition: Schema.optional(Schema.Literals(["open", "completed", "cancelled", "dismissed", "superseded"])),
    courseID: Schema.optional(Course.CourseID),
    ...Page,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const AssignmentReadTool = Tool.define<typeof AssignmentReadInput, Record<string, unknown>, Assignment.ReadService>(
  ASSIGNMENT_READ_TOOL_ID,
  Effect.gen(function* () {
    const assignments = yield* Assignment.ReadService
    return {
      description:
        "Read the authoritative Assignment owner without changing it. Resolve an exact immutable revision, current head, current source/scope/time projection, bounded history, or a bounded deterministic non-priority discovery page. Current source availability and due/expiry relations are read-time projections with explicit owner cuts; they never imply activity, progress, adherence, breach, completion, or a selected Tutor move.",
      parameters: AssignmentReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(AssignmentReadInput, { additionalProperties: false }),
      execute: (input) => {
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
        return assignments
          .read(query, {
            asOf,
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
                title: "Assignment",
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
