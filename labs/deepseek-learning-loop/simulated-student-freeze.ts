import { createHash } from "node:crypto"
import {
  benchmarkEvidenceCases,
  benchmarkSelectionScenarios,
  claimIds,
  evidenceOutcomes,
  evidenceSignals,
  errorTags,
  learningObligations,
} from "./simulated-student-benchmark"

export const simulatedStudentSystemPrompt = `You render isolated honest learner responses for a controlled benchmark.
Follow each supplied learnerProfile and responseContract exactly, even when it requires a wrong or uncertain answer. Do not repair the assigned misconception. Do not mention the benchmark, hidden state, or being a model.
Return one JSON object only with this shape:
{"responses":[{"caseId":"exact case id","answer":"brief natural learner answer","usedHint":true|false}]}
Return every case exactly once and add no prose.`

export const evidenceInterpreterSystemPrompt = `Produce untrusted evidence-interpretation candidates for formal learning-task responses.

Outcome:
- correct: answer and required mechanism satisfy the rubric.
- incorrect: answer contradicts the rubric or demonstrates the named misconception.
- partial: surface result or some reasoning is right but the assessed mechanism is missing or wrong.
- unresolved: available response cannot support a stable grade; abstain rather than guess.

Evidence signals:
- independent_success: correct performance under assistance=none.
- assisted_success: correct performance under assistance=hint.
- failure: evidence of a target-specific error.
- uncertain: evidence is insufficient for success or failure.

Obligations:
- verification after assisted success;
- targeted_review after a clear target-specific failure;
- diagnostic for partial or unresolved evidence;
- none only after independent correct performance.

Allowed claim IDs: ${claimIds.join(", ")}.
Allowed outcomes: ${evidenceOutcomes.join(", ")}.
Allowed signals: ${evidenceSignals.join(", ")}.
Allowed obligations: ${learningObligations.join(", ")}.
Allowed non-null error tags: ${errorTags.join(", ")}.

Preserve caseId and sourceRef exactly. Never produce a claim outside declared targets when targets are supplied. Do not infer global mastery or edit curriculum. Return one JSON object only:
{"candidates":[{"caseId":"id","sourceRef":"ref","outcome":"correct|incorrect|partial|unresolved","assistance":"none|hint","claims":[{"claimId":"allowed id","signal":"allowed signal","errorTag":null|"allowed error tag"}],"obligation":"none|verification|targeted_review|diagnostic","confidence":"high|medium|low","basis":"brief source-grounded reason"}]}`

export const taskSelectorSystemPrompt = `Select exactly one supplied task candidate for each learning situation.

Rules:
1. An urgent real deadline may temporarily dominate, but low-learning-value work should be compressed rather than expanded.
2. Repair an evidenced prerequisite only when it blocks the active route; one noisy miss must not rewrite a long-term route.
3. Hinted success requires independent verification before it can support progression.
4. Prefer one aligned task that substantially exercises a due skill while advancing ready work over redundant separate tasks.
5. A corrected or retracted interpretation cannot continue to generate remediation pressure.
6. Passage of time changes due pressure, not learning evidence.
7. Choose only an actionId present in that scenario's candidates.

Return one JSON object only:
{"selections":[{"scenarioId":"exact id","actionId":"exact candidate id","basis":"brief reason grounded in supplied state"}]}`

export const frozenBenchmarkV1 = {
  version: "v1",
  frozenAt: "2026-07-11",
  models: {
    student: { model: "deepseek-v4-flash", thinking: "disabled" },
    tutorAndSelector: { model: "deepseek-v4-flash", thinking: "disabled" },
  },
  parameters: {
    temperature: 0,
    maxRetries: 3,
    fetchTimeoutMs: 15_000,
    modelTimeoutMs: 120_000,
    studentMaxOutputTokens: 4_000,
    evidenceMaxOutputTokens: 8_000,
    selectionMaxOutputTokens: 4_000,
    apiCallsPerTrial: 42,
    maxApiSteps: 48,
    providerSeed: null,
    simulatorStateSeed: "fixture-contract-v1",
  },
  trialPolicy: {
    trials: 3,
    hardGatesMustPassInEveryTrial: true,
    softGateTrialsRequired: 2,
    infrastructureExclusion:
      "Only failures before any model response, such as provider outage or TLS failure, may be excluded and rerun under the same numbered trial.",
    countedFailures:
      "Malformed output, truncation, response-contract violation, and semantically wrong output remain counted.",
  },
  evidence: {
    caseIds: [
      "object-this-hinted-success",
      "object-this-partial",
      "second-bind-override-misconception",
      "callback-repair-independent-success",
      "function-value-independent-success",
      "function-value-access-calls-misconception",
      "callback-repair-hinted-success",
      "second-bind-partial",
    ],
    thresholdsPerTrial: {
      declaredOutcomeCorrectAtLeast: 7,
      declaredAssistanceCorrect: 8,
      declaredClaimSetCorrectAtLeast: 6,
      declaredExactCorrectAtLeast: 6,
      falseIndependentClaimsAtMost: 0,
      independentSuccessClaimsCorrectAtLeast: 2,
      declaredExactLeadOverAnswerOnlyAtLeast: 1,
    },
  },
  selection: {
    scenarioIds: [
      "repair-blocking-misconception",
      "verify-hinted-success",
      "merge-new-work-and-review",
      "correction-clears-stale-remediation",
      "ordinary-due-review",
      "repeated-failure-remediation",
    ],
    evidenceLinkedScenarioIds: [
      "repair-blocking-misconception",
      "verify-hinted-success",
      "merge-new-work-and-review",
    ],
    fixedBaselineCorrect: 2,
    thresholdsPerTrial: {
      oracleCorrectAtLeast: 5,
      oracleHardViolationsAtMost: 0,
      inferredCorrectAtLeast: 4,
      inferredHardViolationsAtMost: 0,
      inferredLeadOverFixedAtLeast: 2,
      inferredLeadOverStatelessAtLeast: 1,
      oracleLeadOverInferredAtMost: 1,
      inferredEvidenceLinkedCorrectAtLeast: 2,
    },
  },
  materials: {
    "javascript.info:object-methods/object-property-this@52c1e61915bc8970a950a3f59bd845827e49b4bf": {
      taskSha256: "cf8a9d86d7ec1e309d09213b4f0b7eb1703037ebc5509a66e2320f94849df4a8",
      solutionSha256: "349c1df0d5eade1466b37733353e6d535c19ffdba6728f4f323585ed2c7e8638",
      combinedSha256: "c1d6e0c6a5b4e7d8289e063b825e2bc59e7a9cf5e32551985b052da3608bbd49",
    },
    "javascript.info:bind/second-bind@52c1e61915bc8970a950a3f59bd845827e49b4bf": {
      taskSha256: "1757ffafe5dad379ba716bae733c294569cda42ee54f0907658b09870fa6b78f",
      solutionSha256: "35070996e51c713ff51daa91b25ed0c5340216c94c902e4a28de8133224b6c11",
      combinedSha256: "c476c8c3fa25385163fbae69c8eee1791e215c79d06755ddb3aca284bad8d30d",
    },
    "javascript.info:bind/fix-lost-this@52c1e61915bc8970a950a3f59bd845827e49b4bf": {
      taskSha256: "a8d25cf053cab6a3557048e675252899219fa617ca22fd8917f6f47133b9c5f5",
      solutionSha256: "8bf58588bf5da898576e27f3bd8475120d8713b6b89e661b896beb8ff2ea2804",
      combinedSha256: "9ca97261c096e4401908021691cc7eb3dfbe34561840a42f368181659713af6f",
    },
    "javascript.info:object-methods/article@52c1e61915bc8970a950a3f59bd845827e49b4bf": {
      taskSha256: "f17a9b05eeff3ac63bc2f0be152c12e47a6f68ec8cc7034008c6f2fa484ae7c1",
      solutionSha256: "f17a9b05eeff3ac63bc2f0be152c12e47a6f68ec8cc7034008c6f2fa484ae7c1",
      combinedSha256: "bae86ebcd250ff7d8633c427fcda3203ad055d6acff2ad13b6a85144a87d6026",
    },
  },
} as const

type ObservedMaterialHash = {
  sourceRef: string
  taskSha256: string
  solutionSha256: string
  combinedSha256: string
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  )
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

const mainEvidenceCases = benchmarkEvidenceCases.filter((fixture) => fixture.phase === "main")
const mainSelectionScenarios = benchmarkSelectionScenarios.filter((scenario) => scenario.phase === "main")

export const currentFrozenContractSha256 = sha256(
  JSON.stringify(
    canonicalize({
      manifest: frozenBenchmarkV1,
      prompts: {
        simulatedStudentSystemPrompt,
        evidenceInterpreterSystemPrompt,
        taskSelectorSystemPrompt,
      },
      evidenceCases: mainEvidenceCases,
      selectionScenarios: mainSelectionScenarios,
    }),
  ),
)

// This snapshot changes only through an explicit new benchmark version.
export const expectedFrozenContractSha256 = "cb4612d55a543853ee500c12857e0ebc254e63d459f6e0de207a6a62e3dde12e"

type FrozenExecutionSnapshot = {
  benchmarkVersion: string
  expectedFrozenContractSha256: string
  executionFiles: Record<string, string>
}

export function assertFrozenBenchmarkContract() {
  const actualEvidenceIds = mainEvidenceCases.map((fixture) => fixture.id)
  const actualScenarioIds = mainSelectionScenarios.map((scenario) => scenario.id)
  if (JSON.stringify(actualEvidenceIds) !== JSON.stringify(frozenBenchmarkV1.evidence.caseIds)) {
    throw new Error("Frozen evidence fixture IDs do not match benchmark v1")
  }
  if (JSON.stringify(actualScenarioIds) !== JSON.stringify(frozenBenchmarkV1.selection.scenarioIds)) {
    throw new Error("Frozen selection scenario IDs do not match benchmark v1")
  }
  if (currentFrozenContractSha256 !== expectedFrozenContractSha256) {
    throw new Error(
      `Frozen benchmark contract mismatch: expected ${expectedFrozenContractSha256}, observed ${currentFrozenContractSha256}`,
    )
  }
}

export async function assertFrozenExecutionFiles() {
  const snapshot = (await Bun.file(
    new URL("./simulated-student-benchmark.v1.json", import.meta.url),
  ).json()) as FrozenExecutionSnapshot
  if (
    snapshot.benchmarkVersion !== frozenBenchmarkV1.version ||
    snapshot.expectedFrozenContractSha256 !== expectedFrozenContractSha256
  ) {
    throw new Error("Frozen execution snapshot does not match benchmark v1")
  }
  for (const [relativePath, expectedSha256] of Object.entries(snapshot.executionFiles)) {
    const file = Bun.file(new URL(relativePath, import.meta.url))
    if (!(await file.exists())) throw new Error(`Frozen execution file is missing: ${relativePath}`)
    const actualSha256 = sha256(await file.text())
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Frozen execution file hash mismatch for ${relativePath}: expected ${expectedSha256}, observed ${actualSha256}`,
      )
    }
  }
  return snapshot
}

export function assertFrozenMaterialHashes(observed: ObservedMaterialHash[]) {
  const expectedEntries = Object.entries(frozenBenchmarkV1.materials)
  if (observed.length !== expectedEntries.length) {
    throw new Error(
      `Frozen material source count mismatch: expected ${expectedEntries.length}, observed ${observed.length}`,
    )
  }
  const byRef = new Map(observed.map((item) => [item.sourceRef, item]))
  for (const [sourceRef, expected] of expectedEntries) {
    const actual = byRef.get(sourceRef)
    if (
      !actual ||
      actual.taskSha256 !== expected.taskSha256 ||
      actual.solutionSha256 !== expected.solutionSha256 ||
      actual.combinedSha256 !== expected.combinedSha256
    ) {
      throw new Error(`Frozen material hash mismatch for ${sourceRef}`)
    }
  }
}

export function frozenMaterialHashesForSource(sourceRef: string) {
  return Object.entries(frozenBenchmarkV1.materials).find(([ref]) => ref === sourceRef)?.[1] ?? null
}

export function assertFormalTrial(value: string | undefined) {
  if (value === "1" || value === "2" || value === "3") return Number(value) as 1 | 2 | 3
  throw new Error("REPA_BENCHMARK_TRIAL must identify formal trial 1, 2, or 3")
}
