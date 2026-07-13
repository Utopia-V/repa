import { tool } from "ai"
import { z } from "zod"
import {
  ADDRESS_FUTURE_ATTENTION_TOOL,
  CREATE_FUTURE_ATTENTION_TOOL,
  DISMISS_FUTURE_ATTENTION_TOOL,
  executeFutureAttentionTool,
  INSPECT_RECENT_FUTURE_ATTENTION_TOOL,
  READ_FUTURE_ATTENTION_SOURCE_TOOL,
  REOPEN_FUTURE_ATTENTION_TOOL,
  SUPERSEDE_FUTURE_ATTENTION_TOOL,
} from "../learning/agenda/future-attention-tool-execution"
import { EXPLICIT_OFFSET_TIMESTAMP_PATTERN } from "../time/strict-offset-timestamp"
import {
  executeBoundTutorCapability,
  type TutorToolExecutionCoordinator,
  type TutorToolRuntimeBinding,
} from "./tutor-tool-binding"

const explicitOffsetTimestamp = z.string().regex(EXPLICIT_OFFSET_TIMESTAMP_PATTERN)

export type AgendaTutorToolName =
  | typeof CREATE_FUTURE_ATTENTION_TOOL
  | typeof READ_FUTURE_ATTENTION_SOURCE_TOOL
  | typeof ADDRESS_FUTURE_ATTENTION_TOOL
  | typeof DISMISS_FUTURE_ATTENTION_TOOL
  | typeof SUPERSEDE_FUTURE_ATTENTION_TOOL
  | typeof INSPECT_RECENT_FUTURE_ATTENTION_TOOL
  | typeof REOPEN_FUTURE_ATTENTION_TOOL

export function createAgendaTools(
  input: TutorToolRuntimeBinding,
  coordinator: TutorToolExecutionCoordinator,
  options: { exposeLearnerRoleConstraint: boolean },
) {
  return {
    [CREATE_FUTURE_ATTENTION_TOOL]: tool({
      description:
        "Create one source-linked future-attention concern for the current course item when returning later has a concrete learning purpose. Use this instead of retained steering for a one-time learning return at or after notBefore. This is not a task, reminder notification, evidence, mastery, or an automatic consequence of difficulty. Use learner_requested only with an exact excerpt from the current learner input; otherwise use tutor_initiated. notBefore controls proactive selection, not a deadline.",
      inputSchema: z.strictObject({
        authorship: z.discriminatedUnion("kind", [
          z.strictObject({
            kind: z.literal("learner_requested"),
            learnerRequestExcerpt: z.string().min(1).max(500),
          }),
          z.strictObject({ kind: z.literal("tutor_initiated") }),
        ]),
        reason: z.string().min(1).max(800),
        ...(options.exposeLearnerRoleConstraint
          ? {
              learnerRoleConstraint: z.strictObject({
                kind: z.literal("learner_response_before_tutor_disclosure"),
              }).optional().describe(
                "Use only when the later return specifically requires the learner to respond before the Tutor discloses the answer or a decisive hint. Ordinary review, explanation, comparison, or later attention leaves this absent.",
              ),
            }
          : {}),
        notBefore: explicitOffsetTimestamp,
      }),
      execute: async (toolInput, options) =>
        executeAgendaCapability(
          input,
          coordinator,
          options.experimental_context,
          options.toolCallId,
          CREATE_FUTURE_ATTENTION_TOOL,
          toolInput,
        ),
    }),
    [READ_FUTURE_ATTENTION_SOURCE_TOOL]: tool({
      description:
        "Read the exact learner source linked by one Agenda concern visible in this model context, plus at most its immediately preceding assistant item. Use only when the compact reason is insufficient. Pass no Session, Turn, or item IDs.",
      inputSchema: z.strictObject({ concernId: z.string().min(1).max(500) }),
      execute: async (toolInput, options) =>
        executeAgendaCapability(
          input,
          coordinator,
          options.experimental_context,
          options.toolCallId,
          READ_FUTURE_ATTENTION_SOURCE_TOOL,
          toolInput,
        ),
    }),
    [ADDRESS_FUTURE_ATTENTION_TOOL]: tool({
      description:
        "Record that a visible current-view concern's learning purpose was actually served by the current complete learner input. This changes Agenda disposition only: it never means correct, evidence, or mastery. Do not use merely because time arrived, the topic matched, or a review began. The system binds the concern version and current learner occurrence.",
      inputSchema: z.strictObject({
        concernId: z.string().min(1).max(500),
        alignmentRationale: z.string().min(1).max(800),
      }),
      execute: async (toolInput, options) =>
        executeAgendaCapability(
          input,
          coordinator,
          options.experimental_context,
          options.toolCallId,
          ADDRESS_FUTURE_ATTENTION_TOOL,
          toolInput,
        ),
    }),
    [DISMISS_FUTURE_ATTENTION_TOOL]: tool({
      description:
        "Dismiss a visible Agenda concern only when the current learner explicitly cancels or rejects it. Copy an exact excerpt from the current learner input. Dismissal means not served and creates no evidence.",
      inputSchema: z.strictObject({
        concernId: z.string().min(1).max(500),
        learnerRequestExcerpt: z.string().min(1).max(500),
        rationale: z.string().min(1).max(800),
      }),
      execute: async (toolInput, options) =>
        executeAgendaCapability(
          input,
          coordinator,
          options.experimental_context,
          options.toolCallId,
          DISMISS_FUTURE_ATTENTION_TOOL,
          toolInput,
        ),
    }),
    [SUPERSEDE_FUTURE_ATTENTION_TOOL]: tool({
      description:
        "Replace a visible Agenda concern when the current learner explicitly corrects its purpose, timing, or stale target. Preserve the old concern. If its Course View is still current, preserve its exact item even when route position moved; only a superseded-view reconciliation binds the successor to the sampled current item. State the learning purpose, not a prematurely fixed teaching format, and copy an exact learner correction excerpt.",
      inputSchema: z.strictObject({
        concernId: z.string().min(1).max(500),
        learnerRequestExcerpt: z.string().min(1).max(500),
        replacementReason: z.string().min(1).max(800),
        ...(options.exposeLearnerRoleConstraint
          ? {
              replacementLearnerRoleConstraint: z.strictObject({
                kind: z.literal("learner_response_before_tutor_disclosure"),
              }).optional().describe(
                "Set only when the corrected future-attention meaning still requires a learner response before Tutor disclosure; omit it to remove that constraint.",
              ),
            }
          : {}),
        replacementNotBefore: explicitOffsetTimestamp,
        rationale: z.string().min(1).max(800),
      }),
      execute: async (toolInput, options) =>
        executeAgendaCapability(
          input,
          coordinator,
          options.experimental_context,
          options.toolCallId,
          SUPERSEDE_FUTURE_ATTENTION_TOOL,
          toolInput,
        ),
    }),
    [INSPECT_RECENT_FUTURE_ATTENTION_TOOL]: tool({
      description:
        "Inspect a bounded page of recent Agenda concerns for the active course, including terminal dispositions, when the learner refers to an earlier scheduling or completion decision that is absent from routine open context. This returns compact state and no old source text. Use offset and limit for paging.",
      inputSchema: z.strictObject({
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (toolInput, options) =>
        executeAgendaCapability(
          input,
          coordinator,
          options.experimental_context,
          options.toolCallId,
          INSPECT_RECENT_FUTURE_ATTENTION_TOOL,
          toolInput,
        ),
    }),
    [REOPEN_FUTURE_ATTENTION_TOOL]: tool({
      description:
        "Reopen an addressed or dismissed Agenda concern only after inspect_recent_future_attention exposed it in this Turn and the current learner explicitly says the earlier disposition was wrong. Copy an exact correction excerpt. Reopening preserves the old transition and creates no evidence.",
      inputSchema: z.strictObject({
        concernId: z.string().min(1).max(500),
        learnerRequestExcerpt: z.string().min(1).max(500),
        rationale: z.string().min(1).max(800),
      }),
      execute: async (toolInput, options) =>
        executeAgendaCapability(
          input,
          coordinator,
          options.experimental_context,
          options.toolCallId,
          REOPEN_FUTURE_ATTENTION_TOOL,
          toolInput,
        ),
    }),
  }
}

function executeAgendaCapability(
  input: TutorToolRuntimeBinding,
  coordinator: TutorToolExecutionCoordinator,
  experimentalContext: unknown,
  toolCallId: string,
  toolName: AgendaTutorToolName,
  toolInput: unknown,
) {
  return executeBoundTutorCapability(input, coordinator, {
    experimentalContext,
    toolCallId,
    toolName,
    toolInput,
    mutatesLearningState: isAgendaMutation(toolName),
  }, (invocationId, executedAt) =>
    executeFutureAttentionTool(input.database, { invocationId, executedAt }))
}

function isAgendaMutation(toolName: AgendaTutorToolName) {
  return toolName !== READ_FUTURE_ATTENTION_SOURCE_TOOL &&
    toolName !== INSPECT_RECENT_FUTURE_ATTENTION_TOOL
}
