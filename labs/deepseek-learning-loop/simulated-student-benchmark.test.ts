import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  advanceVirtualTime,
  benchmarkEvidenceCases,
  benchmarkSelectionScenarios,
  buildEvidenceInterpreterInput,
  buildSelectorInput,
  evidenceCandidateSchema,
  fixedQueueSelect,
  scoreEvidenceCandidates,
  scoreSelections,
  studentResponseSchema,
  validateExactBatchIds,
  validateEvidenceCandidateAuthority,
  validateRenderedStudentResponse,
  type EvidenceCandidate,
} from "./simulated-student-benchmark"
import {
  assertFormalTrial,
  assertFrozenBenchmarkContract,
  assertFrozenMaterialHashes,
  expectedFrozenContractSha256,
  frozenBenchmarkV1,
} from "./simulated-student-freeze"
import {
  aggregateFormalTrials,
  evaluateFormalTrial,
  type FormalTrialMetrics,
} from "./simulated-student-verdict"

describe("simulated-student benchmark contract", () => {
  test("fixture IDs and source references are unique", () => {
    expect(new Set(benchmarkEvidenceCases.map((item) => item.id)).size).toBe(
      benchmarkEvidenceCases.length,
    )
    expect(new Set(benchmarkSelectionScenarios.map((item) => item.id)).size).toBe(
      benchmarkSelectionScenarios.length,
    )
    for (const item of benchmarkEvidenceCases) {
      expect(item.source.url).toStartWith("https://")
      expect(item.source.ref).toContain("javascript.info")
      expect(item.source.url).toContain("@52c1e61915bc8970a950a3f59bd845827e49b4bf/")
      expect(item.source.ref).not.toContain("@master")
      expect(item.targets.length).toBeGreaterThan(0)
    }
  })

  test("student and evidence schemas reject out-of-vocabulary values", () => {
    expect(
      studentResponseSchema.safeParse({ caseId: "case", answer: "x", usedHint: false }).success,
    ).toBe(true)
    expect(
      studentResponseSchema.safeParse({ caseId: "case", answer: "x", usedHint: "maybe" }).success,
    ).toBe(false)
    expect(
      evidenceCandidateSchema.safeParse({
        caseId: "case",
        sourceRef: "source",
        outcome: "mastered",
        assistance: "none",
        claims: [],
        obligation: "none",
        confidence: "high",
        basis: "unsupported state",
      }).success,
    ).toBe(false)
  })

  test("rendered learner output must obey its program-selected response contract", () => {
    const misconception = benchmarkEvidenceCases.find(
      (item) => item.id === "object-this-ownership-misconception",
    )!
    expect(
      validateRenderedStudentResponse(misconception, {
        caseId: misconception.id,
        answer: "It prints John because ref belongs to the returned user object.",
        usedHint: false,
      }),
    ).toEqual([])
    expect(
      validateRenderedStudentResponse(misconception, {
        caseId: misconception.id,
        answer: "It throws because this is determined at the function call site.",
        usedHint: false,
      }),
    ).toContain("answer violates the assigned hidden response contract")
  })

  test("declared-contract evidence input carries conditions without hidden learner truth", () => {
    const fixture = benchmarkEvidenceCases.find((item) => item.id === "object-this-hinted-success")!
    const input = buildEvidenceInterpreterInput(fixture, {
      caseId: fixture.id,
      answer: "Using the hint, this is undefined and accessing name throws.",
      usedHint: true,
    }, "declared_contract", "material excerpt")
    const serialized = JSON.stringify(input)
    expect(serialized).toContain('"assistance":"hint"')
    expect(serialized).toContain('"targets"')
    expect(serialized).not.toContain("hiddenTruth")
    expect(serialized).not.toContain("expectedCandidate")
  })

  test("answer-only input omits authoritative assistance and target alignment", () => {
    const fixture = benchmarkEvidenceCases.find((item) => item.id === "object-this-hinted-success")!
    const input = buildEvidenceInterpreterInput(fixture, {
      caseId: fixture.id,
      answer: "Using the hint, this is undefined and accessing name throws.",
      usedHint: true,
    }, "answer_only", "material excerpt")
    const serialized = JSON.stringify(input)
    expect(serialized).not.toContain('"assistance":"hint"')
    expect(serialized).not.toContain('"targets"')
  })

  test("virtual time changes due pressure without inventing evidence", () => {
    const before = {
      day: 0,
      evidenceIds: ["evidence-1"],
      reviews: [{ target: "call-site-this" as const, dueDay: 7 }],
    }
    const after = advanceVirtualTime(before, 8)
    expect(after.day).toBe(8)
    expect(after.evidenceIds).toEqual(["evidence-1"])
    expect(after.dueTargets).toEqual(["call-site-this"])
  })

  test("evidence scorer exposes false independent evidence instead of hiding it in accuracy", () => {
    const fixture = benchmarkEvidenceCases.find((item) => item.id === "object-this-hinted-success")!
    const wrong: EvidenceCandidate = {
      ...fixture.expectedCandidate,
      assistance: "none",
      claims: fixture.expectedCandidate.claims.map((claim) => ({
        ...claim,
        signal: "independent_success" as const,
      })),
    }
    const score = scoreEvidenceCandidates([wrong], [fixture])
    expect(score.exactRecordAccuracy).toBe(0)
    expect(score.assistanceAccuracy).toBe(0)
    expect(score.falseIndependentEvidenceRate).toBe(1)
    expect(score.independentSuccessRecall).toBe(0)
  })

  test("batch identity validation rejects duplicates, omissions, and extras", () => {
    expect(validateExactBatchIds(["a", "b"], ["a", "b"])).toEqual([])
    expect(validateExactBatchIds(["a", "b"], ["a", "a"])).toEqual([
      "duplicate IDs: a",
      "missing IDs: b",
    ])
    expect(validateExactBatchIds(["a", "b"], ["a", "c"])).toEqual([
      "missing IDs: b",
      "unexpected IDs: c",
    ])
  })

  test("domain admission rejects forged assistance and out-of-target claims", () => {
    const fixture = benchmarkEvidenceCases.find((item) => item.id === "object-this-hinted-success")!
    const forged: EvidenceCandidate = {
      ...fixture.expectedCandidate,
      assistance: "none",
      claims: [
        {
          claimId: "bound-function-context",
          signal: "independent_success",
          errorTag: null,
        },
      ],
    }
    expect(validateEvidenceCandidateAuthority(fixture, forged)).toEqual([
      "candidate assistance conflicts with the observed condition",
      "candidate claim bound-function-context is outside the declared task targets",
      "candidate claims must cover each declared target exactly once",
      "correct unassisted evidence requires no follow-up obligation",
    ])
  })

  test("domain admission rejects incomplete, duplicate, or internally illegal evidence", () => {
    const fixture = benchmarkEvidenceCases.find(
      (item) => item.id === "callback-repair-independent-success",
    )!
    const illegal: EvidenceCandidate = {
      ...fixture.expectedCandidate,
      outcome: "correct",
      assistance: "none",
      obligation: "targeted_review",
      claims: [
        {
          claimId: "detached-callback-context",
          signal: "assisted_success",
          errorTag: "mechanism-unexplained",
        },
        {
          claimId: "detached-callback-context",
          signal: "assisted_success",
          errorTag: null,
        },
      ],
    }
    expect(validateEvidenceCandidateAuthority(fixture, illegal)).toEqual([
      "candidate claims must cover each declared target exactly once",
      "correct unassisted evidence requires independent_success for every target",
      "successful evidence cannot carry an error tag",
      "correct unassisted evidence requires no follow-up obligation",
    ])
  })

  test("selector inputs never expose the expected action or disallowed actions", () => {
    for (const scenario of benchmarkSelectionScenarios) {
      for (const variant of ["stateless_model", "oracle_state_model", "inferred_state_model"] as const) {
        const serialized = JSON.stringify(buildSelectorInput(scenario, variant))
        expect(serialized).not.toContain("expectedActionId")
        expect(serialized).not.toContain("forbiddenActionIds")
      }
    }
  })

  test("fixed queue is a real baseline with predeclared successes and failures", () => {
    const predictions = benchmarkSelectionScenarios.map((scenario) => ({
      scenarioId: scenario.id,
      actionId: fixedQueueSelect(scenario),
    }))
    const score = scoreSelections(predictions, benchmarkSelectionScenarios)
    expect(score.exactActionAccuracy).toBeGreaterThan(0)
    expect(score.exactActionAccuracy).toBeLessThan(1)
    expect(score.missingPredictions).toBe(0)
  })

  test("formal oracle actions are balanced across candidate positions", () => {
    const positions = benchmarkSelectionScenarios
      .filter((scenario) => scenario.phase === "main")
      .map((scenario) =>
        scenario.candidates.findIndex((candidate) => candidate.id === scenario.oracle.expectedActionId),
      )
    expect(positions.filter((position) => position === 0)).toHaveLength(2)
    expect(positions.filter((position) => position === 1)).toHaveLength(2)
    expect(positions.filter((position) => position === 2)).toHaveLength(2)
  })

  test("a perfect evidence and selection oracle receives perfect scores", () => {
    const evidence = scoreEvidenceCandidates(
      benchmarkEvidenceCases.map((item) => item.expectedCandidate),
      benchmarkEvidenceCases,
    )
    expect(evidence.exactRecordAccuracy).toBe(1)
    expect(evidence.falseIndependentEvidenceRate).toBe(0)
    expect(evidence.independentSuccessRecall).toBe(1)

    const selections = scoreSelections(
      benchmarkSelectionScenarios.map((item) => ({
        scenarioId: item.id,
        actionId: item.oracle.expectedActionId,
      })),
      benchmarkSelectionScenarios,
    )
    expect(selections.exactActionAccuracy).toBe(1)
    expect(selections.hardInvariantViolationRate).toBe(0)
  })

  test("formal v1 is frozen before any main model call", () => {
    expect(() => assertFrozenBenchmarkContract()).not.toThrow()
    expect(frozenBenchmarkV1.trialPolicy.trials).toBe(3)
    expect(frozenBenchmarkV1.evidence.caseIds).toHaveLength(8)
    expect(frozenBenchmarkV1.selection.scenarioIds).toHaveLength(6)
    expect(frozenBenchmarkV1.selection.evidenceLinkedScenarioIds).toHaveLength(3)
    expect(Object.keys(frozenBenchmarkV1.materials)).toHaveLength(4)
    expect(frozenBenchmarkV1.selection.fixedBaselineCorrect).toBe(2)
  })

  test("formal v1 preserves a complete historical execution snapshot", async () => {
    const snapshot = (await Bun.file(
      new URL("./simulated-student-benchmark.v1.json", import.meta.url),
    ).json()) as {
      benchmarkVersion: string
      expectedFrozenContractSha256: string
      executionFiles: Record<string, string>
    }
    expect(snapshot.benchmarkVersion).toBe("v1")
    expect(snapshot.expectedFrozenContractSha256).toBe(expectedFrozenContractSha256)
    expect(Object.keys(snapshot.executionFiles).length).toBeGreaterThanOrEqual(7)
    expect(Object.values(snapshot.executionFiles).every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(
      true,
    )

    const historicalPackage = await Bun.file(
      new URL("./frozen/simulated-student-main-v1/package.json", import.meta.url),
    ).arrayBuffer()
    const expectedPackageHash = snapshot.executionFiles["./package.json"]
    expect(expectedPackageHash).toBeDefined()
    expect(createHash("sha256").update(new Uint8Array(historicalPackage)).digest("hex")).toBe(
      expectedPackageHash!,
    )
  })

  test("formal v1 rejects stale source bytes and unregistered trials", () => {
    const observed = Object.entries(frozenBenchmarkV1.materials).map(([sourceRef, hashes]) => ({
      sourceRef,
      ...hashes,
    }))
    expect(() => assertFrozenMaterialHashes(observed)).not.toThrow()
    expect(() =>
      assertFrozenMaterialHashes([
        ...observed.slice(0, -1),
        { ...observed.at(-1)!, combinedSha256: "0".repeat(64) },
      ]),
    ).toThrow("Frozen material hash mismatch")
    expect(assertFormalTrial("1")).toBe(1)
    expect(assertFormalTrial("3")).toBe(3)
    expect(() => assertFormalTrial(undefined)).toThrow("REPA_BENCHMARK_TRIAL")
    expect(() => assertFormalTrial("4")).toThrow("REPA_BENCHMARK_TRIAL")
  })

  test("formal verdict requires every hard gate and two of three soft passes", () => {
    const passing = (trial: 1 | 2 | 3): FormalTrialMetrics => ({
      trial,
      hardGateFailures: [],
      evidence: {
        answerOnlyExactCorrect: 4,
        declaredOutcomeCorrect: 8,
        declaredAssistanceCorrect: 8,
        declaredClaimSetCorrect: 7,
        declaredExactCorrect: 7,
        falseIndependentClaims: 0,
        correctIndependentClaims: 3,
      },
      selection: {
        fixedCorrect: 2,
        statelessCorrect: 3,
        oracleCorrect: 6,
        oracleHardViolations: 0,
        inferredCorrect: 5,
        inferredHardViolations: 0,
        inferredEvidenceLinkedCorrect: 3,
      },
    })
    expect(evaluateFormalTrial(passing(1)).softPass).toBe(true)
    const weak = passing(2)
    weak.selection.inferredCorrect = 3
    expect(evaluateFormalTrial(weak).selectionPass).toBe(false)
    const aggregate = aggregateFormalTrials([passing(1), weak, passing(3)])
    expect(aggregate.hardPass).toBe(true)
    expect(aggregate.softPass).toBe(true)
    expect(aggregate.verdict).toBe("evidence_and_one_step_selection_supported_in_first_domain")

    const unsafe = passing(3)
    unsafe.hardGateFailures.push("hidden learner state leaked")
    expect(aggregateFormalTrials([passing(1), passing(2), unsafe]).verdict).toBe(
      "blocked_by_hard_gate",
    )
  })
})
