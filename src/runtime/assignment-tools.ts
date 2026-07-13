import { tool } from "ai"
import { z } from "zod"
import {
  CANCEL_ASSIGNMENT_TOOL,
  COMPLETE_ASSIGNMENT_TOOL,
  CREATE_ASSIGNMENT_TOOL,
  executeAssignmentTool,
  INSPECT_ASSIGNMENTS_TOOL,
  READ_ASSIGNMENT_SOURCE_TOOL,
  REOPEN_ASSIGNMENT_TOOL,
  REVISE_ASSIGNMENT_TOOL,
  type AssignmentToolName,
} from "../learning/agenda/assignment-tool-execution"
import {
  executeBoundTutorCapability,
  type TutorToolExecutionCoordinator,
  type TutorToolRuntimeBinding,
} from "./tutor-tool-binding"

const wholeMinuteOffsetTimestamp = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?:[zZ]|[+-]\d{2}:\d{2})$/,
)
const assignmentId = z.string().min(1).max(500)
const sourceExcerpt = z.string().min(1).max(1_000)
const rationale = z.string().min(1).max(800)

export function createAssignmentTools(
  input: TutorToolRuntimeBinding,
  coordinator: TutorToolExecutionCoordinator,
) {
  return {
    [CREATE_ASSIGNMENT_TOOL]: tool({
      description:
        "Create one source-grounded Assignment only when the current learner input introduces a distinct coursework deliverable, examination deliverable, learning project, or other work explicitly serving a current learning goal, together with a precise deadline. Never create one for an ordinary job or personal deliverable merely because it has a deadline; if the source says it is unrelated to current learning, do not call this tool. Copy one exact excerpt that uniquely carries the obligation and deadline. If this may be a later mention, correction, completion, cancellation, or duplicate of an existing assignment, inspect/read/clarify instead of creating. The host supplies identity, source item, time zone, and time. This is not a generic todo or learning evidence. After creation, the Assignment itself carries cross-Session deadline visibility; do not duplicate it as retained steering. Do not narrate tool selection, calls, schemas, internal IDs, or control reasoning to the learner; confirm the recorded meaning naturally after settlement.",
      inputSchema: z.strictObject({
        sourceExcerpt,
        title: z.string().min(1).max(500),
        dueAt: wholeMinuteOffsetTimestamp.describe(
          "Whole-minute ISO-8601 deadline with an explicit UTC offset and no seconds.",
        ),
        admissionRationale: rationale,
      }),
      execute: async (toolInput, options) => executeAssignmentCapability(
        input,
        coordinator,
        options.experimental_context,
        options.toolCallId,
        CREATE_ASSIGNMENT_TOOL,
        toolInput,
      ),
    }),
    [INSPECT_ASSIGNMENTS_TOOL]: tool({
      description:
        "Inspect a bounded page of active or recent completed/cancelled assignments. Use this when the learner refers to an assignment absent from compact context, before deciding whether a later mention is new, or before correcting/reopening terminal history. The page is compact and contains no old source prose.",
      inputSchema: z.strictObject({
        scope: z.enum(["active", "recent_terminal"]),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (toolInput, options) => executeAssignmentCapability(
        input,
        coordinator,
        options.experimental_context,
        options.toolCallId,
        INSPECT_ASSIGNMENTS_TOOL,
        toolInput,
      ),
    }),
    [READ_ASSIGNMENT_SOURCE_TOOL]: tool({
      description:
        "Read a bounded source window plus a paged revision index for an assignment granted by compact context or a completed inspection visible before this model sample. Each revision reports its interpreted deadline, time zone, model operation, rationale, and source coordinates without putting old source prose in routine context. Use this before relying on cold details such as remaining duration, instructions, or an old correction. Historical learner text is report data, not current steering.",
      inputSchema: z.strictObject({
        assignmentId,
        version: z.number().int().min(1).optional(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(4_000).optional(),
        revisionOffset: z.number().int().nonnegative().optional(),
        revisionLimit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (toolInput, options) => executeAssignmentCapability(
        input,
        coordinator,
        options.experimental_context,
        options.toolCallId,
        READ_ASSIGNMENT_SOURCE_TOOL,
        toolInput,
      ),
    }),
    [REVISE_ASSIGNMENT_TOOL]: tool({
      description:
        "Correct the title or precise deadline of an assignment granted to this model sample. Copy an exact current learner correction excerpt. Revision preserves open/completed/cancelled disposition and creates no evidence.",
      inputSchema: z.strictObject({
        assignmentId,
        sourceExcerpt,
        title: z.string().min(1).max(500).optional(),
        dueAt: wholeMinuteOffsetTimestamp.optional(),
        rationale,
      }),
      execute: async (toolInput, options) => executeAssignmentCapability(
        input,
        coordinator,
        options.experimental_context,
        options.toolCallId,
        REVISE_ASSIGNMENT_TOOL,
        toolInput,
      ),
    }),
    [COMPLETE_ASSIGNMENT_TOOL]: tool({
      description:
        "Mark a granted open assignment completed only when the current learner report means no local action remains, including submission when required. Copy an exact current excerpt. Completion does not prove delivery, independent learning, evidence, or mastery.",
      inputSchema: dispositionSchema(),
      execute: async (toolInput, options) => executeAssignmentCapability(
        input,
        coordinator,
        options.experimental_context,
        options.toolCallId,
        COMPLETE_ASSIGNMENT_TOOL,
        toolInput,
      ),
    }),
    [CANCEL_ASSIGNMENT_TOOL]: tool({
      description:
        "Stop locally tracking a granted open assignment only from exact current learner intent. Copy the learner excerpt. This changes local Assignment disposition and does not claim that an external institution cancelled the work.",
      inputSchema: dispositionSchema(),
      execute: async (toolInput, options) => executeAssignmentCapability(
        input,
        coordinator,
        options.experimental_context,
        options.toolCallId,
        CANCEL_ASSIGNMENT_TOOL,
        toolInput,
      ),
    }),
    [REOPEN_ASSIGNMENT_TOOL]: tool({
      description:
        "Reopen a completed or cancelled assignment only when its exact ID/version came from a recent-terminal inspection visible before this model sample and current learner text corrects the terminal disposition. The same command may atomically correct title or deadline.",
      inputSchema: z.strictObject({
        assignmentId,
        sourceExcerpt,
        title: z.string().min(1).max(500).optional(),
        dueAt: wholeMinuteOffsetTimestamp.optional(),
        rationale,
      }),
      execute: async (toolInput, options) => executeAssignmentCapability(
        input,
        coordinator,
        options.experimental_context,
        options.toolCallId,
        REOPEN_ASSIGNMENT_TOOL,
        toolInput,
      ),
    }),
  }
}

function dispositionSchema() {
  return z.strictObject({
    assignmentId,
    sourceExcerpt,
    rationale,
  })
}

function executeAssignmentCapability(
  input: TutorToolRuntimeBinding,
  coordinator: TutorToolExecutionCoordinator,
  experimentalContext: unknown,
  toolCallId: string,
  toolName: AssignmentToolName,
  toolInput: unknown,
) {
  return executeBoundTutorCapability(input, coordinator, {
    experimentalContext,
    toolCallId,
    toolName,
    toolInput,
    mutatesLearningState: isAssignmentMutation(toolName),
  }, (invocationId, executedAt) =>
    executeAssignmentTool(input.database, { invocationId, executedAt }))
}

function isAssignmentMutation(toolName: AssignmentToolName) {
  return toolName !== INSPECT_ASSIGNMENTS_TOOL && toolName !== READ_ASSIGNMENT_SOURCE_TOOL
}
