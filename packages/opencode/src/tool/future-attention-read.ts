import { Database } from "@opencode-ai/core/database/database"
import { FutureAttention } from "@opencode-ai/core/future-attention"
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

export const FUTURE_ATTENTION_READ_TOOL_ID = FutureAttention.READ_CAPABILITY
export const FUTURE_ATTENTION_READ_TOOL_IDS = [FUTURE_ATTENTION_READ_TOOL_ID] as const

const Page = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(FutureAttention.MAX_READ_ITEMS))),
}
const Inspection = learningInspectionInput

const FutureAttentionReadInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("concern"), concernID: FutureAttention.ConcernID, ...Inspection }),
  Schema.Struct({ action: Schema.Literal("claim_group"), groupID: FutureAttention.ClaimGroupID, ...Inspection }),
  Schema.Struct({
    action: Schema.Literal("list"),
    dispositions: Schema.optional(
      Schema.Array(Schema.Literals(["open", "served", "dismissed", "superseded"])).check(Schema.isMaxLength(4)),
    ),
    targetStatus: Schema.optional(
      Schema.Array(Schema.Literals(["target_current", "target_stale", "target_missing"])).check(Schema.isMaxLength(3)),
    ),
    from: Schema.optional(NonNegativeInt),
    through: Schema.optional(NonNegativeInt),
    ...Page,
    ...Inspection,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const FutureAttentionReadTool = Tool.define<
  typeof FutureAttentionReadInput,
  Record<string, unknown>,
  Database.Service
>(
  FUTURE_ATTENTION_READ_TOOL_ID,
  Effect.gen(function* () {
    const database = yield* Database.Service
    return {
      description:
        "Read the authoritative FutureAttention owner without changing it. Read one concern with its exact current head and source availability, one current completion-claim group with its append-only finalization receipt, or a bounded non-priority list filtered by disposition, target status, or not-before interval. Set includeInspection to true when the learner asks what this exact record could affect or what operational lineage exists; the same database snapshot then carries the typed TUI inspection without attributing answer causality. The owner cut and cursor are stable; current due/overdue and target-current meaning are derived at read time. A pending-at-admission Tool result is historical and may differ from a later finalization receipt returned here.",
      parameters: FutureAttentionReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(FutureAttentionReadInput, { additionalProperties: false }),
      execute: (input, context) => {
        const now = Date.now()
        const query: FutureAttention.ReadQuery =
          input.action === "concern"
            ? { type: "concern", concernID: input.concernID }
            : input.action === "claim_group"
              ? { type: "claim_group", groupID: input.groupID }
              : {
                  type: "list",
                  ...(input.dispositions === undefined ? {} : { dispositions: input.dispositions }),
                  ...(input.targetStatus === undefined ? {} : { targetStatus: input.targetStatus }),
                  ...(input.from === undefined ? {} : { from: input.from }),
                  ...(input.through === undefined ? {} : { through: input.through }),
                }
        return database.db
          .transaction((tx) =>
            Effect.gen(function* () {
              const page = yield* FutureAttention.read(tx, query, {
                now,
                ...("cursor" in input && input.cursor !== undefined ? { cursor: input.cursor } : {}),
                ...("limit" in input && input.limit !== undefined ? { limit: input.limit } : {}),
              })
              const read = {
                capabilityID: FUTURE_ATTENTION_READ_TOOL_ID,
                title: "Future attention",
                metadata: {
                  action: input.action,
                  count: page.returnedCount,
                  countAtCut: page.countAtCut,
                  omittedCount: page.omittedCount,
                  ownerCut: page.ownerCut,
                  ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
                },
                value: { now, page },
                itemCount: page.returnedCount,
              } satisfies Parameters<typeof learningContextReadResult>[0]
              if (!input.includeInspection) return learningContextReadResult(read)
              return yield* learningInspectionReadResult(
                tx,
                read,
                context,
                inspectionOwner(
                  "future_attention",
                  input.action === "concern"
                    ? "exact current concern transition"
                    : input.action === "claim_group"
                      ? "append-only owner finalization"
                      : "bounded current concern page",
                  [
                    { label: "Owner cut", value: String(page.ownerCut) },
                    { label: "Returned owner rows", value: String(page.returnedCount) },
                    {
                      label: "Finalization",
                      value:
                        input.action === "claim_group"
                          ? "shown from the append-only owner receipt when present"
                          : "kept separate from command and model-operation completion",
                    },
                  ],
                ),
                input.includeInspection,
              )
            }),
          )
          .pipe(Effect.orDie)
      },
    }
  }),
)
