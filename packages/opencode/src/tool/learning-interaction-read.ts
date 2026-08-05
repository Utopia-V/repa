import { Database } from "@opencode-ai/core/database/database"
import { MAX_LAZY_BYTES } from "@opencode-ai/core/learning-context"
import { NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { TurnLearningContext } from "@opencode-ai/core/turn/learning-context"
import { Turn } from "@opencode-ai/schema/turn"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import { learningContextReadResult } from "./learning-context-read"
import { Tool } from "./tool"

export const LEARNING_INTERACTION_READ_TOOL_ID = "learning_interaction_read"
export const LEARNING_INTERACTION_READ_TOOL_IDS = [LEARNING_INTERACTION_READ_TOOL_ID] as const

const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

const Range = Schema.Struct({
  first: Schema.optional(Schema.String),
  last: Schema.optional(Schema.String),
  count: NonNegativeInt,
  fingerprint: Digest,
})

const PresentationProvenance = Schema.Struct({
  count: PositiveInt,
  kinds: Schema.Array(Schema.Literals(["origin", "compaction_replay", "fork_clone"])),
  fingerprint: Digest,
  historicalMessageOrPart: Schema.Boolean,
})

const CommonLocator = {
  sessionID: SessionSchema.ID,
  turnID: Turn.ID,
  inputID: Schema.optional(Turn.InputID),
  causalOccurrenceID: Schema.optional(Schema.String),
  timeAdmitted: NonNegativeInt,
  timeTerminal: NonNegativeInt,
  terminalState: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
  terminalReason: Schema.optional(Turn.TerminalReason),
  sessionParentID: Schema.optional(SessionSchema.ID),
}

const Locator = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    ...CommonLocator,
    presentationProvenance: PresentationProvenance,
    messageRange: Range,
    partRange: Range,
  }),
  Schema.Struct({
    status: Schema.Literal("source_unavailable"),
    ...CommonLocator,
    presentationProvenance: Schema.Literal("source_unavailable"),
    timeDeleted: NonNegativeInt,
  }),
])

const LearningInteractionReadInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("list_recent"),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  }),
  Schema.Struct({
    action: Schema.Literal("read_range"),
    locator: Locator,
    offset: Schema.optional(NonNegativeInt),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearningInteractionReadTool = Tool.define<
  typeof LearningInteractionReadInput,
  Record<string, unknown>,
  Database.Service
>(
  LEARNING_INTERACTION_READ_TOOL_ID,
  Effect.gen(function* () {
    const database = yield* Database.Service
    return {
      description:
        "List bounded terminal root-Turn locators from Sessions other than this exact current Session, or read one exact pinned Message/Part range. The current Session exclusion is host-bound; range reads never search by title or retarget to a newer Turn. Large individual items become exact locator-only records, and the whole result stays within 32 KiB and 64 typed items. This tool never imports an old transcript into Session history or changes Interaction state.",
      parameters: LearningInteractionReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearningInteractionReadInput, { additionalProperties: false }),
      execute: (input, context) => {
        requireInteraction(context)
        if (input.action === "list_recent") {
          return database.db
            .transaction((tx) =>
              TurnLearningContext.projectLearningContext(tx, {
                currentSessionID: SessionSchema.ID.make(context.sessionID),
                limit: input.limit ?? 64,
              }),
            )
            .pipe(
              Effect.map((page) =>
                learningContextReadResult({
                  title: "Recent Interaction locators",
                  metadata: {
                    action: input.action,
                    currentSessionID: context.sessionID,
                    count: page.entries.length,
                    countAtRead: page.countAtCut,
                    omitted: page.entries.length < page.countAtCut,
                  },
                  value: {
                    status: "available",
                    currentSessionID: context.sessionID,
                    countAtRead: page.countAtCut,
                    entries: page.entries,
                    omitted: page.entries.length < page.countAtCut,
                  },
                  itemCount: page.entries.length,
                }),
              ),
              Effect.orDie,
            )
        }
        return database.db
          .transaction((tx) =>
            TurnLearningContext.readExactRange(tx, {
              locator: input.locator,
              offset: input.offset,
              maxItems: input.limit ?? 64,
              maxBytes: MAX_LAZY_BYTES,
            }),
          )
          .pipe(
            Effect.map((result) =>
              learningContextReadResult({
                title: "Exact Interaction range",
                metadata: {
                  action: input.action,
                  sessionID: input.locator.sessionID,
                  turnID: input.locator.turnID,
                  result: result.type,
                },
                value: { result },
                itemCount: "items" in result ? result.items.length : 0,
              }),
            ),
            Effect.catchIf(
              (error) => error instanceof TurnLearningContext.RangeReadError,
              (error) =>
                Effect.succeed(
                  learningContextReadResult({
                    title: "Exact Interaction range unavailable",
                    metadata: { action: input.action, status: "over_budget", reason: error.code },
                    value: { status: "over_budget", reason: error.code },
                    itemCount: 0,
                  }),
                ),
            ),
            Effect.orDie,
          )
      },
    }
  }),
)

function requireInteraction(context: Tool.Context) {
  if (
    !context.interaction ||
    context.interaction.assistantMessageID !== context.messageID ||
    context.interaction.candidate.callID !== context.callID
  ) {
    throw new Error("Learning-context Interaction reads require one exact registered model operation")
  }
  return context.interaction
}
