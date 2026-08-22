import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { MaterialMap } from "@opencode-ai/core/material-map"
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

export const LEARNER_RESPONSE_EVIDENCE_READ_TOOL_ID = LearnerResponseEvidence.READ_CAPABILITY
export const LEARNER_RESPONSE_EVIDENCE_READ_TOOL_IDS = [LEARNER_RESPONSE_EVIDENCE_READ_TOOL_ID] as const

const Page = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(LearnerResponseEvidence.MAX_READ_ITEMS))),
}
const Inspection = learningInspectionInput

const LearnerResponseEvidenceReadInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("record"), recordID: LearnerResponseEvidence.RecordID, ...Inspection }),
  Schema.Struct({
    action: Schema.Literal("history"),
    recordID: LearnerResponseEvidence.RecordID,
    ...Page,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("course"),
    target: Schema.Struct({
      courseID: Course.CourseID,
      viewID: Course.ViewID,
      revisionID: Course.RevisionID,
      itemID: Course.ItemID,
    }),
    ...Page,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("selector"),
    mapID: MaterialMap.MapID,
    selectorID: MaterialMap.SelectorID,
    ...Page,
    ...Inspection,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearnerResponseEvidenceReadTool = Tool.define<
  typeof LearnerResponseEvidenceReadInput,
  Record<string, unknown>,
  Database.Service
>(
  LEARNER_RESPONSE_EVIDENCE_READ_TOOL_ID,
  Effect.gen(function* () {
    const database = yield* Database.Service
    return {
      description:
        "Read the authoritative narrow learner-response evidence owner without changing it. Get one current record, page its immutable correction history, or page records for one exact Course membership or Material selector. Set includeInspection to true for a same-snapshot typed TUI projection of exact operational lineage and owner-native potential scope. Results report source availability and current target relations; a recorded supports/does_not_support relation remains fallible occurrence-bound evidence and never means mastery, understanding, retention, or a mandatory next action. Reads are limited to 64 items and 32 KiB with query-bound truthful cursors.",
      parameters: LearnerResponseEvidenceReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearnerResponseEvidenceReadInput, { additionalProperties: false }),
      execute: (input, context) =>
        database.db
          .transaction((tx) =>
            Effect.gen(function* () {
              const page = yield* LearnerResponseEvidence.read(
                tx,
                input.action === "record" || input.action === "history"
                  ? { type: input.action, recordID: input.recordID }
                  : input.action === "course"
                    ? { type: "course", target: input.target }
                    : { type: "selector", mapID: input.mapID, selectorID: input.selectorID },
                "cursor" in input
                  ? {
                      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
                      ...(input.limit === undefined ? {} : { limit: input.limit }),
                    }
                  : undefined,
              )
              const read = {
                capabilityID: LEARNER_RESPONSE_EVIDENCE_READ_TOOL_ID,
                title: "Learner response evidence",
                metadata: {
                  action: input.action,
                  count: page.items.length,
                  countAtRead: page.countAtRead,
                  ...(page.cursor ? { cursor: page.cursor } : {}),
                },
                value: { page },
                itemCount: page.items.length,
              } satisfies Parameters<typeof learningContextReadResult>[0]
              if (!input.includeInspection) return learningContextReadResult(read)
              return yield* learningInspectionReadResult(
                tx,
                read,
                context,
                inspectionOwner(
                  "learner_response_evidence",
                  input.action === "record"
                    ? "exact current evidence record"
                    : input.action === "history"
                      ? "immutable correction history"
                      : "bounded exact-target evidence page",
                  [
                    { label: "Returned owner rows", value: String(page.items.length) },
                    {
                      label: "Epistemic strength",
                      value: "fallible supports/does_not_support evidence; never mastery",
                    },
                  ],
                ),
                input.includeInspection,
              )
            }),
          )
          .pipe(Effect.orDie),
    }
  }),
)
