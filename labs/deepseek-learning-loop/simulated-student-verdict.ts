import { frozenBenchmarkV1 } from "./simulated-student-freeze"
import { z } from "zod"

const count = z.number().int().nonnegative()

export const formalTrialMetricsSchema = z.object({
  trial: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  hardGateFailures: z.array(z.string()),
  evidence: z.object({
    answerOnlyExactCorrect: count,
    declaredOutcomeCorrect: count,
    declaredAssistanceCorrect: count,
    declaredClaimSetCorrect: count,
    declaredExactCorrect: count,
    falseIndependentClaims: count,
    correctIndependentClaims: count,
  }),
  selection: z.object({
    fixedCorrect: count,
    statelessCorrect: count,
    oracleCorrect: count,
    oracleHardViolations: count,
    inferredCorrect: count,
    inferredHardViolations: count,
    inferredEvidenceLinkedCorrect: count,
  }),
})

export type FormalTrialMetrics = z.infer<typeof formalTrialMetricsSchema>

export function evaluateFormalTrial(metrics: FormalTrialMetrics) {
  const evidenceThresholds = frozenBenchmarkV1.evidence.thresholdsPerTrial
  const selectionThresholds = frozenBenchmarkV1.selection.thresholdsPerTrial
  const evidenceFailures: string[] = []
  const selectionFailures: string[] = []

  if (metrics.evidence.declaredOutcomeCorrect < evidenceThresholds.declaredOutcomeCorrectAtLeast) {
    evidenceFailures.push("declared outcome threshold missed")
  }
  if (metrics.evidence.declaredAssistanceCorrect !== evidenceThresholds.declaredAssistanceCorrect) {
    evidenceFailures.push("declared assistance hard preservation missed")
  }
  if (metrics.evidence.declaredClaimSetCorrect < evidenceThresholds.declaredClaimSetCorrectAtLeast) {
    evidenceFailures.push("declared claim-set threshold missed")
  }
  if (metrics.evidence.declaredExactCorrect < evidenceThresholds.declaredExactCorrectAtLeast) {
    evidenceFailures.push("declared exact threshold missed")
  }
  if (metrics.evidence.falseIndependentClaims > evidenceThresholds.falseIndependentClaimsAtMost) {
    evidenceFailures.push("false independent evidence emitted")
  }
  if (
    metrics.evidence.correctIndependentClaims <
    evidenceThresholds.independentSuccessClaimsCorrectAtLeast
  ) {
    evidenceFailures.push("independent-success recall threshold missed")
  }
  if (
    metrics.evidence.declaredExactCorrect - metrics.evidence.answerOnlyExactCorrect <
    evidenceThresholds.declaredExactLeadOverAnswerOnlyAtLeast
  ) {
    evidenceFailures.push("declared contract did not lead answer-only")
  }

  if (metrics.selection.oracleCorrect < selectionThresholds.oracleCorrectAtLeast) {
    selectionFailures.push("oracle selector threshold missed")
  }
  if (metrics.selection.oracleHardViolations > selectionThresholds.oracleHardViolationsAtMost) {
    selectionFailures.push("oracle selector violated a forbidden action")
  }
  if (metrics.selection.inferredCorrect < selectionThresholds.inferredCorrectAtLeast) {
    selectionFailures.push("inferred selector threshold missed")
  }
  if (metrics.selection.inferredHardViolations > selectionThresholds.inferredHardViolationsAtMost) {
    selectionFailures.push("inferred selector violated a forbidden action")
  }
  if (
    metrics.selection.inferredCorrect - metrics.selection.fixedCorrect <
    selectionThresholds.inferredLeadOverFixedAtLeast
  ) {
    selectionFailures.push("inferred selector did not lead fixed queue")
  }
  if (
    metrics.selection.inferredCorrect - metrics.selection.statelessCorrect <
    selectionThresholds.inferredLeadOverStatelessAtLeast
  ) {
    selectionFailures.push("inferred selector did not lead stateless selector")
  }
  if (
    metrics.selection.oracleCorrect - metrics.selection.inferredCorrect >
    selectionThresholds.oracleLeadOverInferredAtMost
  ) {
    selectionFailures.push("inferred selector trails oracle beyond the allowed gap")
  }
  if (
    metrics.selection.inferredEvidenceLinkedCorrect <
    selectionThresholds.inferredEvidenceLinkedCorrectAtLeast
  ) {
    selectionFailures.push("evidence-linked selector threshold missed")
  }

  return {
    trial: metrics.trial,
    hardPass: metrics.hardGateFailures.length === 0,
    evidencePass: evidenceFailures.length === 0,
    selectionPass: selectionFailures.length === 0,
    softPass: evidenceFailures.length === 0 && selectionFailures.length === 0,
    hardGateFailures: [...metrics.hardGateFailures],
    evidenceFailures,
    selectionFailures,
  }
}

export function aggregateFormalTrials(metrics: FormalTrialMetrics[]) {
  const trials = [...metrics].sort((left, right) => left.trial - right.trial)
  if (
    trials.length !== frozenBenchmarkV1.trialPolicy.trials ||
    JSON.stringify(trials.map((trial) => trial.trial)) !== JSON.stringify([1, 2, 3])
  ) {
    throw new Error("Formal aggregate requires exactly one result for trials 1, 2, and 3")
  }
  const evaluations = trials.map(evaluateFormalTrial)
  const hardPass = evaluations.every((trial) => trial.hardPass)
  const evidenceTrialPasses = evaluations.filter((trial) => trial.evidencePass).length
  const selectionTrialPasses = evaluations.filter((trial) => trial.selectionPass).length
  const positiveEvidenceLeadTrials = trials.filter(
    (trial) => trial.evidence.declaredExactCorrect > trial.evidence.answerOnlyExactCorrect,
  ).length
  const aggregateEvidenceLead = trials.reduce(
    (sum, trial) =>
      sum + trial.evidence.declaredExactCorrect - trial.evidence.answerOnlyExactCorrect,
    0,
  )
  const evidencePass =
    evidenceTrialPasses >= frozenBenchmarkV1.trialPolicy.softGateTrialsRequired &&
    positiveEvidenceLeadTrials >= frozenBenchmarkV1.trialPolicy.softGateTrialsRequired &&
    aggregateEvidenceLead >= frozenBenchmarkV1.trialPolicy.trials
  const selectionPass =
    selectionTrialPasses >= frozenBenchmarkV1.trialPolicy.softGateTrialsRequired
  const softPass = evidencePass && selectionPass
  const oracleTrialPasses = trials.filter(
    (trial) =>
      trial.selection.oracleCorrect >=
        frozenBenchmarkV1.selection.thresholdsPerTrial.oracleCorrectAtLeast &&
      trial.selection.oracleHardViolations === 0,
  ).length

  let verdict:
    | "blocked_by_hard_gate"
    | "evidence_and_one_step_selection_supported_in_first_domain"
    | "evidence_boundary_requires_one_follow_up"
    | "projection_boundary_requires_one_follow_up"
    | "use_simple_selector"
  if (!hardPass) verdict = "blocked_by_hard_gate"
  else if (softPass) verdict = "evidence_and_one_step_selection_supported_in_first_domain"
  else if (!evidencePass && oracleTrialPasses >= 2) verdict = "evidence_boundary_requires_one_follow_up"
  else if (evidencePass && oracleTrialPasses >= 2) {
    verdict = "projection_boundary_requires_one_follow_up"
  } else {
    verdict = "use_simple_selector"
  }

  return {
    hardPass,
    evidencePass,
    selectionPass,
    softPass,
    evidenceTrialPasses,
    selectionTrialPasses,
    positiveEvidenceLeadTrials,
    aggregateEvidenceLead,
    evaluations,
    verdict,
  }
}
