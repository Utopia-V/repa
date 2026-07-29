import { LearningCommand } from "@opencode-ai/core/learning-command"
import { PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY } from "@opencode-ai/core/learner-navigation/default-course-v2"
import {
  normalizeCommand,
  normalizeDefault,
  normalizeDefaultProposal,
  normalizeDefaultV2,
} from "@/learning-command/input"
import type { LearningCommandRuntime } from "@/learning-command/runtime"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

type PreparedDefinition = Tool.Def & {
  readonly prepareLearningCommand?: Preparation
  readonly prepareToolCall?: Preparation
}

export function learningCommandPreparation(tool: Tool.Def): Preparation | undefined {
  if (!isLearningCommandToolID(tool.id)) return undefined
  return (tool as PreparedDefinition).prepareLearningCommand
}

export function toolCallPreparation(tool: Tool.Def): Preparation | undefined {
  if (!isHostPreparedToolID(tool.id)) return undefined
  const prepared = tool as PreparedDefinition
  return prepared.prepareToolCall ?? prepared.prepareLearningCommand
}

export function assertExternalToolID(id: string, source: "custom" | "mcp") {
  if (isLearningCommandToolID(id)) {
    throw new Error(`${source} tool ID ${id} is reserved by the learning-command runtime`)
  }
  if (id === PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    throw new Error(`${source} tool ID ${id} is reserved by the host-prepared proposal runtime`)
  }
}

export const PROPOSE_DEFAULT_COURSE_PREFERENCE_TOOL_ID = PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY

export function isHostPreparedToolID(id: string) {
  return isLearningCommandToolID(id) || id === PROPOSE_DEFAULT_COURSE_PREFERENCE_TOOL_ID
}

export function normalizeHostPreparedToolInput(id: string, input: unknown) {
  if (id === PROPOSE_DEFAULT_COURSE_PREFERENCE_TOOL_ID) return normalizeDefaultProposal(input)
  if (id === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return isDefaultCourseV2Input(input) ? normalizeDefaultV2(input) : normalizeDefault(input)
  }
  if (isLearningCommandToolID(id)) return normalizeCommand(id, input)
  return input
}

export function isLearningCommandToolID(id: string) {
  return (
    id === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY ||
    id === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY ||
    id === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY ||
    id === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY ||
    id === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY ||
    id === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
  )
}

function isDefaultCourseV2Input(input: unknown) {
  return typeof input === "object" && input !== null && !Array.isArray(input) && "authorization" in input
}
