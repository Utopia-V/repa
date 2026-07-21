import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { Tool } from "./tool"

type Preparation = LearningCommandRuntime.Interface["prepare"]

type PreparedDefinition = Tool.Def & {
  readonly prepareLearningCommand?: Preparation
}

export function learningCommandPreparation(tool: Tool.Def): Preparation | undefined {
  if (!isLearningCommandToolID(tool.id)) return undefined
  return (tool as PreparedDefinition).prepareLearningCommand
}

export function assertExternalToolID(id: string, source: "custom" | "mcp") {
  if (!isLearningCommandToolID(id)) return
  throw new Error(`${source} tool ID ${id} is reserved by the learning-command runtime`)
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
