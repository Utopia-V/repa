import { LearningContext } from "@opencode-ai/core/learning-context"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"

type Input = Omit<TurnLifecycle.ModelAdmission, "learningContextBasis"> & {
  readonly learningContextBasis?: LearningContext.CapabilityBasis
}

export function admitModelWithLearningContext(tx: Parameters<typeof TurnLifecycle.admitModel>[0], input: Input) {
  return TurnLifecycle.admitModel(tx, {
    ...input,
    learningContextBasis: input.learningContextBasis ?? LearningContext.unavailableCapabilityBasis(),
  })
}
