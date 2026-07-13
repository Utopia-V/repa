import { describe, expect, test } from "bun:test"
import { benchmarkEvidenceCases, validateEvidenceCandidateAuthority } from "./simulated-student-benchmark"
import {
  assertEvidenceFollowupContractFrozen,
  assertEvidenceFollowupExecutionFrozen,
  criterionJudgmentSchema,
  deriveEvidenceFromCriteria,
  expectedCriterionJudgment,
  scoreFollowupVariants,
  validateCriterionJudgmentAuthority,
} from "./simulated-student-evidence-followup-contract"

describe("evidence criteria follow-up contract", () => {
  const mainCases = benchmarkEvidenceCases.filter((fixture) => fixture.phase === "main")

  test("model output cannot own derived learning fields", () => {
    const fixture = mainCases[0]!
    const expected = expectedCriterionJudgment(fixture)
    expect(criterionJudgmentSchema.safeParse(expected).success).toBe(true)
    expect(
      criterionJudgmentSchema.safeParse({
        ...expected,
        outcome: "correct",
        assistance: "none",
        obligation: "none",
      }).success,
    ).toBe(false)
  })

  test("follow-up semantic contract is frozen before model calls", () => {
    expect(() => assertEvidenceFollowupContractFrozen()).not.toThrow()
  })

  test("follow-up execution and persisted inputs are frozen", async () => {
    const manifest = await assertEvidenceFollowupExecutionFrozen()
    expect(manifest.inputArtifacts).toHaveLength(3)
    expect(Object.keys(manifest.executionFiles).length).toBeGreaterThanOrEqual(6)
  })

  test("criterion authority requires exact coverage and legal tag placement", () => {
    const fixture = mainCases.find((item) => item.id === "second-bind-partial")!
    const expected = expectedCriterionJudgment(fixture)
    expect(validateCriterionJudgmentAuthority(fixture, expected)).toEqual([])
    expect(
      validateCriterionJudgmentAuthority(fixture, {
        ...expected,
        criteria: [
          { criterionId: "claim", status: "satisfied", errorTag: "mechanism-unexplained" },
          { criterionId: "claim", status: "violated", errorTag: null },
        ],
      }),
    ).toEqual([
      "criterion IDs must cover claim and justification exactly once",
      "a satisfied criterion cannot carry an error tag",
      "a violated criterion requires a controlled error tag",
    ])
  })

  test("deterministic derivation resolves partial performance without independent evidence", () => {
    for (const caseId of ["object-this-partial", "second-bind-partial"]) {
      const fixture = mainCases.find((item) => item.id === caseId)!
      const derived = deriveEvidenceFromCriteria(fixture, expectedCriterionJudgment(fixture))
      expect(derived.outcome).toBe("partial")
      expect(derived.obligation).toBe("diagnostic")
      expect(derived.claims.every((claim) => claim.signal === "uncertain")).toBe(true)
      expect(validateEvidenceCandidateAuthority(fixture, derived)).toEqual([])
    }
  })

  test("perfect atomic judgments reproduce every frozen evidence oracle", () => {
    const derived = mainCases.map((fixture) =>
      deriveEvidenceFromCriteria(fixture, expectedCriterionJudgment(fixture)),
    )
    for (const fixture of mainCases) {
      const candidate = derived.find((item) => item.caseId === fixture.id)!
      expect(candidate.outcome).toBe(fixture.expectedCandidate.outcome)
      expect(candidate.assistance).toBe(fixture.expectedCandidate.assistance)
      expect(candidate.claims).toEqual(fixture.expectedCandidate.claims)
      expect(candidate.obligation).toBe(fixture.expectedCandidate.obligation)
    }
  })

  test("follow-up verdict requires both prompt orders and the known confounds", () => {
    const perfect = mainCases.flatMap((fixture) =>
      [1, 2, 3].map((trial) => ({
        trial,
        caseId: fixture.id,
        candidate: deriveEvidenceFromCriteria(fixture, expectedCriterionJudgment(fixture)),
        authorityFailures: [],
      })),
    )
    const verdict = scoreFollowupVariants({ criteria_first: perfect, rubric_first: perfect })
    expect(verdict.pass).toBe(true)
    const broken = structuredClone(perfect)
    const confound = broken.find((item) => item.caseId === "object-this-partial")!
    confound.candidate = { ...confound.candidate, outcome: "incorrect" }
    expect(scoreFollowupVariants({ criteria_first: broken, rubric_first: perfect }).pass).toBe(false)
  })
})
