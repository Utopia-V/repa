import {
  UPDATE_LEARNER_GOALS_VERSION,
  prepareLearnerGoalConfirmation,
  reserveLearnerGoals,
  settleLearnerGoals,
} from "../../src/learner-goal/learning-command"

/** Test-only access to the retired V1 producer for frozen history fixtures. */
export const HistoricalLearnerGoalV1 = {
  UPDATE_LEARNER_GOALS_VERSION,
  prepareLearnerGoalConfirmation,
  reserveLearnerGoals,
  settleLearnerGoals,
}
