import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect, Schema } from "effect"
import { AcceptCourseViewRevisionInput } from "@/learning-command/input"
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
    id === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY
  )
}

export const AcceptCourseViewRevisionTool = Tool.define<
  typeof AcceptCourseViewRevisionInput,
  Record<string, unknown>,
  LearningCommandRuntime.Service
>(
  LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
  Effect.gen(function* () {
    const runtime = yield* LearningCommandRuntime.Service
    const definition = {
      description:
        "Accept one exact eligible Course View Revision as the Course working selection after a current learner acceptance. Supply every expected version from the current Course state; expectedSelectionRevisionID is required and must be null when no Revision is selected.",
      parameters: AcceptCourseViewRevisionInput,
      prepareLearningCommand: runtime.prepare,
      execute: (input: Schema.Schema.Type<typeof AcceptCourseViewRevisionInput>, context: Tool.Context) =>
        runtime.execute(input, context).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof AcceptCourseViewRevisionInput, Record<string, unknown>> & {
      readonly prepareLearningCommand: Preparation
    }
    return definition
  }),
)
