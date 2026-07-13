import { createHash } from "node:crypto"
import { z } from "zod"
import {
  benchmarkEvidenceCases,
  errorTags,
  scoreEvidenceCandidates,
  type EvidenceCandidate,
  type EvidenceCase,
} from "./simulated-student-benchmark"

export const criterionIds = ["claim", "justification"] as const
export const criterionStatuses = ["satisfied", "violated", "unresolved"] as const

const criterionRecordSchema = z.strictObject({
  criterionId: z.enum(criterionIds),
  status: z.enum(criterionStatuses),
  errorTag: z.enum(errorTags).nullable(),
})

export const criterionJudgmentSchema = z.strictObject({
  caseId: z.string().min(1).max(80),
  sourceRef: z.string().min(1).max(300),
  criteria: z.array(criterionRecordSchema).length(2),
  basis: z.string().min(1).max(800),
})

export type CriterionJudgment = z.infer<typeof criterionJudgmentSchema>
export type PromptOrder = "criteria_first" | "rubric_first"

export const followupPromptOrders: PromptOrder[] = ["criteria_first", "rubric_first"]

export const followupSystemPrompts: Record<PromptOrder, string> = {
  criteria_first: `Judge an observed answer against two task-declared rubric criteria.

Return only atomic criterion judgments. Do not output an overall outcome, evidence signal, assistance, obligation, mastery, or next action.

Statuses:
- satisfied: the answer meets that criterion;
- violated: the answer commits to content that fails that criterion;
- unresolved: the answer does not provide enough information to settle that criterion.

Use only the supplied criterion IDs and controlled error tags. A satisfied criterion must have errorTag=null. A violated criterion must use the most specific supplied error tag.

Return exactly one JSON object:
{"caseId":"exact id","sourceRef":"exact ref","criteria":[{"criterionId":"claim","status":"satisfied|violated|unresolved","errorTag":null|"allowed tag"},{"criterionId":"justification","status":"satisfied|violated|unresolved","errorTag":null|"allowed tag"}],"basis":"brief rubric-grounded audit"}`,
  rubric_first: `Use the supplied task and rubric to evaluate the learner answer. Report two local criterion statuses and nothing downstream.

The task declares a claim criterion and a justification criterion. For each, choose satisfied, violated, or unresolved. Satisfied means the criterion is met; violated means the answer commits to content that fails it; unresolved means the answer is insufficient to settle it.

Do not infer or emit outcome, assistance, evidence strength, signal, obligation, mastery, scheduling, or persistence. Those are derived outside the model. Use only supplied criterion IDs and controlled error tags. Satisfied criteria require a null error tag; violated criteria require the most specific supplied tag.

Return exactly:
{"caseId":"exact id","sourceRef":"exact ref","criteria":[{"criterionId":"claim","status":"satisfied|violated|unresolved","errorTag":null|"allowed tag"},{"criterionId":"justification","status":"satisfied|violated|unresolved","errorTag":null|"allowed tag"}],"basis":"brief rubric-grounded audit"}`,
}

export const criterionDefinitionsByTaskId: Record<
  string,
  { claim: string; justification: string }
> = {
  "object-property-this": {
    claim: "Correctly predicts whether user.ref.name yields a value or fails.",
    justification:
      "Explains the result from the plain makeUser() call and call-site this, not object ownership.",
  },
  "second-bind": {
    claim: "Correctly predicts which name is used after binding the already-bound function again.",
    justification: "Explains that a bound function's this cannot be replaced by a later bind.",
  },
  "fix-lost-this": {
    claim: "Provides a valid bind or arrow-wrapper repair for the detached callbacks.",
    justification: "Explains that passing the methods without their receiver loses this.",
  },
  "function-property-value": {
    claim: "Identifies user.sayHi without parentheses as a function value rather than the return value.",
    justification: "Distinguishes property access from invocation with parentheses.",
  },
}

export function expectedCriterionJudgment(fixture: EvidenceCase): CriterionJudgment {
  const expected = fixture.expectedCandidate
  const errorTag = expected.claims.find((claim) => claim.errorTag)?.errorTag ?? null
  let claimStatus: CriterionJudgment["criteria"][number]["status"]
  let justificationStatus: CriterionJudgment["criteria"][number]["status"]
  if (expected.outcome === "correct") {
    claimStatus = "satisfied"
    justificationStatus = "satisfied"
  } else if (expected.outcome === "incorrect") {
    claimStatus = "violated"
    justificationStatus = "violated"
  } else if (expected.outcome === "partial") {
    claimStatus = "satisfied"
    justificationStatus = "violated"
  } else {
    claimStatus = "unresolved"
    justificationStatus = "unresolved"
  }
  return {
    caseId: fixture.id,
    sourceRef: fixture.source.ref,
    criteria: [
      { criterionId: "claim", status: claimStatus, errorTag: claimStatus === "violated" ? errorTag : null },
      {
        criterionId: "justification",
        status: justificationStatus,
        errorTag: justificationStatus === "violated" ? errorTag : null,
      },
    ],
    basis: "Frozen atomic oracle derived from the existing evidence candidate.",
  }
}

export function validateCriterionJudgmentAuthority(
  fixture: EvidenceCase,
  candidate: CriterionJudgment,
) {
  const failures: string[] = []
  if (candidate.caseId !== fixture.id) failures.push("case ID does not match the observed response")
  if (candidate.sourceRef !== fixture.source.ref) failures.push("source reference does not match")
  const ids = candidate.criteria.map((criterion) => criterion.criterionId).sort()
  if (JSON.stringify(ids) !== JSON.stringify([...criterionIds].sort())) {
    failures.push("criterion IDs must cover claim and justification exactly once")
  }
  if (candidate.criteria.some((criterion) => criterion.status === "satisfied" && criterion.errorTag)) {
    failures.push("a satisfied criterion cannot carry an error tag")
  }
  if (candidate.criteria.some((criterion) => criterion.status === "violated" && !criterion.errorTag)) {
    failures.push("a violated criterion requires a controlled error tag")
  }
  return failures
}

export function deriveEvidenceFromCriteria(
  fixture: EvidenceCase,
  candidate: CriterionJudgment,
): EvidenceCandidate {
  const byId = new Map(candidate.criteria.map((criterion) => [criterion.criterionId, criterion]))
  const claim = byId.get("claim")
  const justification = byId.get("justification")
  if (!claim || !justification) throw new Error(`Incomplete criteria for ${fixture.id}`)

  const outcome = claim.status === "violated"
    ? "incorrect"
    : claim.status === "unresolved"
      ? "unresolved"
      : justification.status === "satisfied"
        ? "correct"
        : "partial"
  const signal = outcome === "correct"
    ? fixture.observedAssistance === "none"
      ? "independent_success"
      : "assisted_success"
    : outcome === "incorrect"
      ? "failure"
      : "uncertain"
  const obligation = outcome === "correct"
    ? fixture.observedAssistance === "none"
      ? "none"
      : "verification"
    : outcome === "incorrect"
      ? "targeted_review"
      : "diagnostic"
  const errorTag = justification.errorTag ?? claim.errorTag

  return {
    caseId: fixture.id,
    sourceRef: fixture.source.ref,
    outcome,
    assistance: fixture.observedAssistance,
    claims: fixture.targets.map((claimId) => ({ claimId, signal, errorTag })),
    obligation,
    confidence: outcome === "unresolved" ? "low" : outcome === "partial" ? "medium" : "high",
    basis: candidate.basis,
  }
}

function canonicalEvidence(candidate: EvidenceCandidate) {
  return JSON.stringify({
    caseId: candidate.caseId,
    sourceRef: candidate.sourceRef,
    outcome: candidate.outcome,
    assistance: candidate.assistance,
    obligation: candidate.obligation,
    claims: [...candidate.claims]
      .map((claim) => `${claim.claimId}:${claim.signal}:${claim.errorTag ?? ""}`)
      .sort(),
  })
}

export type FollowupRecord = {
  trial: number
  caseId: string
  candidate: EvidenceCandidate
  authorityFailures: string[]
}

function scoreVariant(records: FollowupRecord[]) {
  const mainCases = benchmarkEvidenceCases.filter((fixture) => fixture.phase === "main")
  const fixtureById = new Map(mainCases.map((fixture) => [fixture.id, fixture]))
  const knownConfounds = new Set(["object-this-partial", "second-bind-partial"])
  let exact = 0
  let confoundExact = 0
  let nonConfoundExact = 0
  let falseIndependent = 0
  for (const record of records) {
    const fixture = fixtureById.get(record.caseId)
    if (!fixture) continue
    const matches = canonicalEvidence(record.candidate) === canonicalEvidence(fixture.expectedCandidate)
    if (matches) exact += 1
    if (knownConfounds.has(record.caseId)) confoundExact += Number(matches)
    else nonConfoundExact += Number(matches)
    falseIndependent += scoreEvidenceCandidates([record.candidate], [fixture]).falseIndependentEvidenceCount
  }
  return {
    records: records.length,
    authorityFailures: records.reduce((sum, record) => sum + record.authorityFailures.length, 0),
    exact,
    confoundExact,
    nonConfoundExact,
    falseIndependent,
  }
}

export function scoreFollowupVariants(
  variants: Record<PromptOrder, FollowupRecord[]>,
) {
  const scores = {
    criteria_first: scoreVariant(variants.criteria_first),
    rubric_first: scoreVariant(variants.rubric_first),
  }
  const rightByKey = new Map(
    variants.rubric_first.map((record) => [`${record.trial}:${record.caseId}`, record.candidate]),
  )
  const pairwiseAgreement = variants.criteria_first.filter((record) => {
    const right = rightByKey.get(`${record.trial}:${record.caseId}`)
    return right && canonicalEvidence(record.candidate) === canonicalEvidence(right)
  }).length
  const variantPass = (score: ReturnType<typeof scoreVariant>) =>
    score.records === 24 &&
    score.authorityFailures === 0 &&
    score.falseIndependent === 0 &&
    score.confoundExact === 6 &&
    score.nonConfoundExact >= 17 &&
    score.exact >= 23
  return {
    scores,
    pairwiseAgreement,
    pass:
      variantPass(scores.criteria_first) &&
      variantPass(scores.rubric_first) &&
      pairwiseAgreement >= 23,
  }
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

export const currentEvidenceFollowupContractSha256 = createHash("sha256")
  .update(
    JSON.stringify(
      canonicalize({
        promptOrders: followupPromptOrders,
        systemPrompts: followupSystemPrompts,
        criteria: criterionDefinitionsByTaskId,
        caseIds: benchmarkEvidenceCases.filter((fixture) => fixture.phase === "main").map((fixture) => fixture.id),
        thresholds: {
          authorityFailures: 0,
          falseIndependent: 0,
          confoundExact: 6,
          nonConfoundExactAtLeast: 17,
          totalExactAtLeast: 23,
          pairwiseAgreementAtLeast: 23,
        },
      }),
    ),
  )
  .digest("hex")

export const expectedEvidenceFollowupContractSha256 = "99142b13f363a7aebafa3ff006d333cb342896296c7399c6f038efa858fef71c"

export function assertEvidenceFollowupContractFrozen() {
  if (currentEvidenceFollowupContractSha256 !== expectedEvidenceFollowupContractSha256) {
    throw new Error(
      `Evidence follow-up contract mismatch: expected ${expectedEvidenceFollowupContractSha256}, observed ${currentEvidenceFollowupContractSha256}`,
    )
  }
}

type EvidenceFollowupManifest = {
  version: string
  expectedContractSha256: string
  model: { model: string; thinking: string; temperature: number }
  inputArtifacts: Array<{ trial: number; path: string; sha256: string }>
  executionFiles: Record<string, string>
}

async function fileSha256(url: URL) {
  return createHash("sha256").update(Buffer.from(await Bun.file(url).arrayBuffer())).digest("hex")
}

export async function assertEvidenceFollowupExecutionFrozen() {
  const manifest = (await Bun.file(
    new URL("./simulated-student-evidence-followup.v1.json", import.meta.url),
  ).json()) as EvidenceFollowupManifest
  if (
    manifest.version !== "v1" ||
    manifest.expectedContractSha256 !== expectedEvidenceFollowupContractSha256
  ) {
    throw new Error("Evidence follow-up execution manifest does not match the frozen contract")
  }
  for (const [path, expected] of Object.entries(manifest.executionFiles)) {
    const url = new URL(path, import.meta.url)
    if (!(await Bun.file(url).exists())) throw new Error(`Follow-up execution file missing: ${path}`)
    const actual = await fileSha256(url)
    if (actual !== expected) {
      throw new Error(`Follow-up execution file hash mismatch for ${path}: ${actual}`)
    }
  }
  for (const artifact of manifest.inputArtifacts) {
    const url = new URL(artifact.path, import.meta.url)
    if (!(await Bun.file(url).exists())) throw new Error(`Follow-up input artifact missing: ${artifact.path}`)
    const actual = await fileSha256(url)
    if (actual !== artifact.sha256) {
      throw new Error(`Follow-up input artifact hash mismatch for trial ${artifact.trial}: ${actual}`)
    }
  }
  return manifest
}
