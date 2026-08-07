import { LearningCommand } from "@opencode-ai/core/learning-command"
import { PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY } from "@opencode-ai/core/learner-navigation/default-course-v2"
import { normalizeCommand } from "@/learning-command/input"
import type { LearningCommandRuntime } from "@/learning-command/runtime"
import { COURSE_NAVIGATION_QUERY_TOOL_IDS } from "./course-navigation-query"
import { INVALID_TOOL_ID } from "./invalid"
import { LEARNER_GOAL_QUERY_TOOL_IDS } from "./learner-goal-query"
import { LEARNING_MATERIAL_QUERY_TOOL_IDS } from "./learning-material-query"
import { Tool } from "./tool"
import { LearningContext } from "@opencode-ai/core/learning-context"

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
  if (id === INVALID_TOOL_ID) {
    throw new Error(`${source} tool ID ${id} is reserved for Repa's program-owned invalid-tool fallback`)
  }
  if (
    id === LearningContext.AUTOMATIC_CONTEXT_CAPABILITY_ID ||
    LearningContext.LAZY_READ_CAPABILITY_IDS.includes(id as LearningContext.LazyReadCapabilityID)
  ) {
    throw new Error(`${source} tool ID ${id} is reserved by Repa's learning-context authority`)
  }
  if (isLearningCommandToolID(id)) {
    throw new Error(`${source} tool ID ${id} is reserved by the learning-command runtime`)
  }
  if (id === PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    throw new Error(`${source} tool ID ${id} is reserved for historical Default-Course replay`)
  }
  if (COURSE_NAVIGATION_QUERY_TOOL_IDS.includes(id as (typeof COURSE_NAVIGATION_QUERY_TOOL_IDS)[number])) {
    throw new Error(`${source} tool ID ${id} is reserved by Repa's Course/navigation read authority`)
  }
  if (LEARNER_GOAL_QUERY_TOOL_IDS.includes(id as (typeof LEARNER_GOAL_QUERY_TOOL_IDS)[number])) {
    throw new Error(`${source} tool ID ${id} is reserved by Repa's learner Goal read authority`)
  }
  if (LEARNING_MATERIAL_QUERY_TOOL_IDS.includes(id as (typeof LEARNING_MATERIAL_QUERY_TOOL_IDS)[number])) {
    throw new Error(`${source} tool ID ${id} is reserved by Repa's learning-material read authorities`)
  }
}

export const PROPOSE_DEFAULT_COURSE_PREFERENCE_TOOL_ID = PROPOSE_DEFAULT_COURSE_PREFERENCE_CAPABILITY

export function isHostPreparedToolID(id: string) {
  return isLearningCommandToolID(id)
}

export function normalizeHostPreparedToolInput(id: string, input: unknown) {
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
    id === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY ||
    id === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY ||
    id === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY ||
    id === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY
  )
}
