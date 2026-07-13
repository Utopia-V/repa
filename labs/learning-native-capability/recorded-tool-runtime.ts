import {
  openLearningLab,
  type AttemptAssistance,
  type AttemptOutcome,
  type ProgressKind,
} from "./learning-layer"

type LearningLab = ReturnType<typeof openLearningLab>

export type RecordedLearningToolCallEvent = {
  eventId: string
  type: "tool-call"
  callId: string
  name: string
  input: unknown
  operationId: string
  sessionId: string
  sourceItemId?: string
  expectedRevision: number
  at: number
}

export type RecordedLearningToolEvent =
  | RecordedLearningToolCallEvent
  | {
      eventId: string
      type: "tool-result"
      callId: string
      name: string
      operationId: string
      result: { revision: number; replayed: false }
      at: number
    }
  | {
      eventId: string
      type: "tool-error"
      callId: string
      name: string
      operationId: string
      error: string
      at: number
    }

export function executeRecordedLearningTool(input: {
  lab: LearningLab
  call: {
    callId: string
    name: string
    input: unknown
  }
  runtime: {
    sessionId: string
    sourceItemId?: string
    expectedRevision: number
    at: number
    record(event: RecordedLearningToolEvent): void
  }
}) {
  const { call, runtime } = input
  assertNonEmpty(call.callId, "callId")
  assertNonEmpty(call.name, "tool name")
  const operationId = `tool:${runtime.sessionId}:${call.callId}`

  runtime.record({
    eventId: `tool-call:${operationId}`,
    type: "tool-call",
    callId: call.callId,
    name: call.name,
    input: call.input,
    operationId,
    sessionId: runtime.sessionId,
    ...(runtime.sourceItemId === undefined ? {} : { sourceItemId: runtime.sourceItemId }),
    expectedRevision: runtime.expectedRevision,
    at: runtime.at,
  })

  const operationEnvelope = {
    operationId,
    expectedRevision: runtime.expectedRevision,
    sessionId: runtime.sessionId,
    at: runtime.at,
    toolInvocation: {
      invocationId: operationId,
      toolName: call.name,
    },
  }

  let result: { revision: number; replayed: boolean }
  try {
    switch (call.name) {
      case "record_progress": {
        const toolInput = parseRecordProgressInput(call.input)
        if (runtime.sourceItemId === undefined) {
          throw new Error("record_progress requires a runtime-owned source item")
        }
        result = input.lab.apply({
          ...operationEnvelope,
          command: {
            type: "record-progress",
            ...toolInput,
            sourceItemId: runtime.sourceItemId,
          },
        })
        break
      }
      case "record_attempt": {
        const toolInput = parseRecordAttemptInput(call.input)
        if (runtime.sourceItemId === undefined) {
          throw new Error("record_attempt requires a runtime-owned source item")
        }
        result = input.lab.apply({
          ...operationEnvelope,
          command: {
            type: "record-attempt",
            ...toolInput,
            sourceItemId: runtime.sourceItemId,
          },
        })
        break
      }
      case "schedule_revisit": {
        const toolInput = parseScheduleRevisitInput(call.input)
        result = input.lab.apply({
          ...operationEnvelope,
          command: {
            type: "schedule-revisit",
            ...toolInput,
            ...(runtime.sourceItemId === undefined ? {} : { sourceItemId: runtime.sourceItemId }),
          },
        })
        break
      }
      case "record_assignment": {
        const toolInput = parseRecordAssignmentInput(call.input)
        if (runtime.sourceItemId === undefined) {
          throw new Error("record_assignment requires a runtime-owned source item")
        }
        result = input.lab.apply({
          ...operationEnvelope,
          command: {
            type: "record-assignment",
            ...toolInput,
            sourceItemId: runtime.sourceItemId,
          },
        })
        break
      }
      case "retract_progress": {
        const toolInput = parseRetractProgressInput(call.input)
        if (runtime.sourceItemId === undefined) {
          throw new Error("retract_progress requires a runtime-owned correction source")
        }
        result = input.lab.apply({
          ...operationEnvelope,
          command: {
            type: "retract-progress",
            ...toolInput,
            sourceItemId: runtime.sourceItemId,
          },
        })
        break
      }
      default:
        throw new Error(`Unknown learning tool: ${call.name}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      runtime.record({
        eventId: `tool-error:${operationId}`,
        type: "tool-error",
        callId: call.callId,
        name: call.name,
        operationId,
        error: message,
        at: runtime.at,
      })
    } catch {
      // The learning error is primary; a failed error projection must not replace it.
    }
    throw error
  }

  const settlement = input.lab.readToolSettlement(operationId)
  runtime.record({
    eventId: `tool-result:${operationId}`,
    type: "tool-result",
    callId: call.callId,
    name: call.name,
    operationId,
    result: settlement.result,
    at: runtime.at,
  })
  return result
}

export function reprojectSettledLearningTool(input: {
  lab: LearningLab
  event: RecordedLearningToolCallEvent
  record(event: RecordedLearningToolEvent): void
}) {
  let settlement: ReturnType<LearningLab["readToolSettlement"]>
  try {
    settlement = input.lab.readToolSettlement(input.event.operationId)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown tool settlement:")) {
      throw new Error(
        `Recorded tool call has no durable settlement and must not be re-executed: ${input.event.operationId}`,
      )
    }
    throw error
  }
  if (
    settlement.operationId !== input.event.operationId ||
    settlement.toolName !== input.event.name
  ) {
    throw new Error(`Tool settlement does not match recorded call: ${input.event.operationId}`)
  }
  input.record({
    eventId: `tool-result:${input.event.operationId}`,
    type: "tool-result",
    callId: input.event.callId,
    name: input.event.name,
    operationId: input.event.operationId,
    result: settlement.result,
    at: input.event.at,
  })
  return settlement.result
}

function parseRecordProgressInput(value: unknown): {
  courseId: string
  sectionId: string
  progress: ProgressKind
} {
  const object = assertExactObject(value, ["courseId", "sectionId", "progress"], "record_progress")
  const courseId = assertString(object.courseId, "record_progress.courseId")
  const sectionId = assertString(object.sectionId, "record_progress.sectionId")
  const progress = assertProgressKind(object.progress)
  return { courseId, sectionId, progress }
}

function parseRecordAttemptInput(value: unknown): {
  attemptId: string
  courseId: string
  sectionId: string
  outcome: AttemptOutcome
  assistance: AttemptAssistance
} {
  const object = assertExactObject(
    value,
    ["attemptId", "courseId", "sectionId", "outcome", "assistance"],
    "record_attempt",
  )
  return {
    attemptId: assertString(object.attemptId, "record_attempt.attemptId"),
    courseId: assertString(object.courseId, "record_attempt.courseId"),
    sectionId: assertString(object.sectionId, "record_attempt.sectionId"),
    outcome: assertAttemptOutcome(object.outcome),
    assistance: assertAttemptAssistance(object.assistance),
  }
}

function parseScheduleRevisitInput(value: unknown): {
  revisitId: string
  courseId: string
  sectionId: string
  label: string
  dueAt: number
  sourceAttemptId?: string
} {
  const object = assertObjectKeys(
    value,
    ["revisitId", "courseId", "sectionId", "label", "dueAt"],
    ["sourceAttemptId"],
    "schedule_revisit",
  )
  return {
    revisitId: assertString(object.revisitId, "schedule_revisit.revisitId"),
    courseId: assertString(object.courseId, "schedule_revisit.courseId"),
    sectionId: assertString(object.sectionId, "schedule_revisit.sectionId"),
    label: assertString(object.label, "schedule_revisit.label"),
    dueAt: assertTimestamp(object.dueAt, "schedule_revisit.dueAt"),
    ...(object.sourceAttemptId === undefined
      ? {}
      : {
          sourceAttemptId: assertString(
            object.sourceAttemptId,
            "schedule_revisit.sourceAttemptId",
          ),
        }),
  }
}

function parseRecordAssignmentInput(value: unknown): {
  assignmentId: string
  courseId: string
  title: string
  dueAt: number
} {
  const object = assertObjectKeys(
    value,
    ["assignmentId", "courseId", "title", "dueAt"],
    [],
    "record_assignment",
  )
  return {
    assignmentId: assertString(object.assignmentId, "record_assignment.assignmentId"),
    courseId: assertString(object.courseId, "record_assignment.courseId"),
    title: assertString(object.title, "record_assignment.title"),
    dueAt: assertTimestamp(object.dueAt, "record_assignment.dueAt"),
  }
}

function parseRetractProgressInput(value: unknown): {
  progressOperationId: string
  reason: string
} {
  const object = assertExactObject(
    value,
    ["progressOperationId", "reason"],
    "retract_progress",
  )
  return {
    progressOperationId: assertString(
      object.progressOperationId,
      "retract_progress.progressOperationId",
    ),
    reason: assertString(object.reason, "retract_progress.reason"),
  }
}

function assertExactObject(
  value: unknown,
  expectedKeys: string[],
  label: string,
): Record<string, unknown> {
  return assertObjectKeys(value, expectedKeys, [], label)
}

function assertObjectKeys(
  value: unknown,
  requiredKeys: string[],
  optionalKeys: string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label} input: expected an object`)
  }
  const object = value as Record<string, unknown>
  const actualKeys = Object.keys(object).sort()
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  const missing = requiredKeys.filter((key) => !(key in object))
  const unexpected = actualKeys.filter((key) => !allowed.has(key))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`Unexpected ${label} input fields: ${actualKeys.join(", ")}`)
  }
  return object
}

function assertString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value
}

function assertProgressKind(value: unknown): ProgressKind {
  if (value !== "read" && value !== "explained" && value !== "demonstrated" && value !== "followed") {
    throw new Error(`Unsupported record_progress.progress: ${String(value)}`)
  }
  return value
}

function assertAttemptOutcome(value: unknown): AttemptOutcome {
  if (value !== "correct" && value !== "incorrect" && value !== "partial") {
    throw new Error(`Unsupported record_attempt.outcome: ${String(value)}`)
  }
  return value
}

function assertAttemptAssistance(value: unknown): AttemptAssistance {
  if (value !== "independent" && value !== "hinted" && value !== "guided") {
    throw new Error(`Unsupported record_attempt.assistance: ${String(value)}`)
  }
  return value
}

function assertTimestamp(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value
}

function assertNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}
