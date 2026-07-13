import { z } from "zod"

export const claimIds = [
  "function-value",
  "call-site-this",
  "bound-function-context",
  "detached-callback-context",
] as const

export type ClaimId = (typeof claimIds)[number]
export const assistanceLevels = ["none", "hint"] as const
export const evidenceOutcomes = ["correct", "incorrect", "partial", "unresolved"] as const
export const evidenceSignals = [
  "independent_success",
  "assisted_success",
  "failure",
  "uncertain",
] as const
export const errorTags = [
  "object-ownership-instead-of-call-site",
  "last-bind-overrides-first",
  "property-access-treated-as-call",
  "mechanism-unexplained",
] as const
export const learningObligations = ["none", "verification", "targeted_review", "diagnostic"] as const

export const studentResponseSchema = z.object({
  caseId: z.string().min(1).max(80),
  answer: z.string().min(1).max(2_000),
  usedHint: z.boolean(),
})

export type StudentResponse = z.infer<typeof studentResponseSchema>

const evidenceClaimSchema = z.object({
  claimId: z.enum(claimIds),
  signal: z.enum(evidenceSignals),
  errorTag: z.enum(errorTags).nullable(),
})

export const evidenceCandidateSchema = z.object({
  caseId: z.string().min(1).max(80),
  sourceRef: z.string().min(1).max(300),
  outcome: z.enum(evidenceOutcomes),
  assistance: z.enum(assistanceLevels),
  claims: z.array(evidenceClaimSchema).min(1).max(6),
  obligation: z.enum(learningObligations),
  confidence: z.enum(["high", "medium", "low"]),
  basis: z.string().min(1).max(800),
})

export type EvidenceCandidate = z.infer<typeof evidenceCandidateSchema>

export type MaterialSource = {
  ref: string
  url: string
  solutionUrl: string
  publicPage: string
  attribution: string
  license: "CC-BY-NC-4.0-based"
}

type ResponseContract = {
  description: string
  requiredAny: string[]
  forbiddenAny: string[]
}

export type EvidenceCase = {
  id: string
  phase: "pilot" | "main"
  category:
    | "independent_success"
    | "assisted_success"
    | "stable_misconception"
    | "partial"
    | "unresolved"
  source: MaterialSource
  taskId: string
  purpose: "assessment"
  prompt: string
  rubric: string
  targets: ClaimId[]
  observedAssistance: (typeof assistanceLevels)[number]
  learnerProfile: string
  responseContract: ResponseContract
  expectedCandidate: EvidenceCandidate
}

const objectThisSource: MaterialSource = {
  ref: "javascript.info:object-methods/object-property-this@52c1e61915bc8970a950a3f59bd845827e49b4bf",
  url:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/04-object-basics/04-object-methods/4-object-property-this/task.md",
  solutionUrl:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/04-object-basics/04-object-methods/4-object-property-this/solution.md",
  publicPage: "https://javascript.info/object-methods#using-this-in-object-literal",
  attribution: "The Modern JavaScript Tutorial by Ilya Kantor and contributors",
  license: "CC-BY-NC-4.0-based",
}

const secondBindSource: MaterialSource = {
  ref: "javascript.info:bind/second-bind@52c1e61915bc8970a950a3f59bd845827e49b4bf",
  url:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/06-advanced-functions/10-bind/3-second-bind/task.md",
  solutionUrl:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/06-advanced-functions/10-bind/3-second-bind/solution.md",
  publicPage: "https://javascript.info/bind#tasks",
  attribution: "The Modern JavaScript Tutorial by Ilya Kantor and contributors",
  license: "CC-BY-NC-4.0-based",
}

const callbackSource: MaterialSource = {
  ref: "javascript.info:bind/fix-lost-this@52c1e61915bc8970a950a3f59bd845827e49b4bf",
  url:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/06-advanced-functions/10-bind/5-question-use-bind/task.md",
  solutionUrl:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/06-advanced-functions/10-bind/5-question-use-bind/solution.md",
  publicPage: "https://javascript.info/bind#tasks",
  attribution: "The Modern JavaScript Tutorial by Ilya Kantor and contributors",
  license: "CC-BY-NC-4.0-based",
}

const objectMethodsArticleSource: MaterialSource = {
  ref: "javascript.info:object-methods/article@52c1e61915bc8970a950a3f59bd845827e49b4bf",
  url:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/04-object-basics/04-object-methods/article.md",
  solutionUrl:
    "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/04-object-basics/04-object-methods/article.md",
  publicPage: "https://javascript.info/object-methods",
  attribution: "The Modern JavaScript Tutorial by Ilya Kantor and contributors",
  license: "CC-BY-NC-4.0-based",
}

function candidate(
  input: Omit<EvidenceCandidate, "confidence" | "basis"> & {
    confidence?: EvidenceCandidate["confidence"]
    basis?: string
  },
): EvidenceCandidate {
  return {
    ...input,
    confidence: input.confidence ?? "high",
    basis: input.basis ?? "Matches the predeclared task rubric and observed conditions.",
  }
}

export const benchmarkEvidenceCases: EvidenceCase[] = [
  {
    id: "object-this-independent-success",
    phase: "pilot",
    category: "independent_success",
    source: objectThisSource,
    taskId: "object-property-this",
    purpose: "assessment",
    prompt:
      "In strict JavaScript, makeUser() returns {name: 'John', ref: this}; it is called as makeUser(), then user.ref.name is accessed. What happens, and why?",
    rubric:
      "Correct: accessing name fails because this in makeUser is undefined; an object literal does not establish a receiver and this is determined by the call expression.",
    targets: ["call-site-this"],
    observedAssistance: "none",
    learnerProfile:
      "The learner independently understands that an object literal does not bind this and explains the call-site rule.",
    responseContract: {
      description: "independent correct call-site explanation",
      requiredAny: ["undefined", "throws", "error", "call site", "call-site"],
      forbiddenAny: ["prints john", "returns john"],
    },
    expectedCandidate: candidate({
      caseId: "object-this-independent-success",
      sourceRef: objectThisSource.ref,
      outcome: "correct",
      assistance: "none",
      claims: [{ claimId: "call-site-this", signal: "independent_success", errorTag: null }],
      obligation: "none",
    }),
  },
  {
    id: "object-this-ownership-misconception",
    phase: "pilot",
    category: "stable_misconception",
    source: objectThisSource,
    taskId: "object-property-this",
    purpose: "assessment",
    prompt:
      "In strict JavaScript, makeUser() returns {name: 'John', ref: this}; it is called as makeUser(), then user.ref.name is accessed. What happens, and why?",
    rubric:
      "Correct: accessing name fails because this in makeUser is undefined; an object literal does not establish a receiver and this is determined by the call expression.",
    targets: ["call-site-this"],
    observedAssistance: "none",
    learnerProfile:
      "The learner has a stable misconception that a function or this value permanently belongs to the object where it appears. Answer John and justify it using object ownership.",
    responseContract: {
      description: "object-ownership misconception",
      requiredAny: ["john", "belongs", "returned object", "inside the object"],
      forbiddenAny: ["throws", "undefined", "call site", "call-site"],
    },
    expectedCandidate: candidate({
      caseId: "object-this-ownership-misconception",
      sourceRef: objectThisSource.ref,
      outcome: "incorrect",
      assistance: "none",
      claims: [
        {
          claimId: "call-site-this",
          signal: "failure",
          errorTag: "object-ownership-instead-of-call-site",
        },
      ],
      obligation: "targeted_review",
    }),
  },
  {
    id: "object-this-hinted-success",
    phase: "main",
    category: "assisted_success",
    source: objectThisSource,
    taskId: "object-property-this",
    purpose: "assessment",
    prompt:
      "In strict JavaScript, what happens at user.ref.name? Hint: decide this from how makeUser() is called, not from the object literal.",
    rubric:
      "Correct: accessing name fails because makeUser() is a plain function call and this is undefined.",
    targets: ["call-site-this"],
    observedAssistance: "hint",
    learnerProfile:
      "The learner reaches the correct answer only by using the supplied call-site hint and acknowledges using it.",
    responseContract: {
      description: "hint-dependent correct answer",
      requiredAny: ["hint", "undefined", "throws", "error"],
      forbiddenAny: ["prints john", "returns john"],
    },
    expectedCandidate: candidate({
      caseId: "object-this-hinted-success",
      sourceRef: objectThisSource.ref,
      outcome: "correct",
      assistance: "hint",
      claims: [{ claimId: "call-site-this", signal: "assisted_success", errorTag: null }],
      obligation: "verification",
    }),
  },
  {
    id: "object-this-partial",
    phase: "main",
    category: "partial",
    source: objectThisSource,
    taskId: "object-property-this",
    purpose: "assessment",
    prompt:
      "In strict JavaScript, what happens at user.ref.name, and why?",
    rubric:
      "A complete answer identifies the failure and explains that this comes from the plain makeUser() call, not the object literal.",
    targets: ["call-site-this"],
    observedAssistance: "none",
    learnerProfile:
      "The learner correctly predicts an error but cannot explain the call-site rule and guesses that ref was never initialized.",
    responseContract: {
      description: "correct surface result with wrong or absent mechanism",
      requiredAny: ["error", "throws"],
      forbiddenAny: ["call site", "call-site", "plain function call"],
    },
    expectedCandidate: candidate({
      caseId: "object-this-partial",
      sourceRef: objectThisSource.ref,
      outcome: "partial",
      assistance: "none",
      claims: [{ claimId: "call-site-this", signal: "uncertain", errorTag: "mechanism-unexplained" }],
      obligation: "diagnostic",
      confidence: "medium",
    }),
  },
  {
    id: "second-bind-independent-success",
    phase: "pilot",
    category: "independent_success",
    source: secondBindSource,
    taskId: "second-bind",
    purpose: "assessment",
    prompt:
      "What does f.bind({name:'John'}).bind({name:'Ann'})() use for this.name, and why?",
    rubric: "Correct: John. A bound function's this cannot be replaced by binding it again.",
    targets: ["bound-function-context"],
    observedAssistance: "none",
    learnerProfile:
      "The learner independently knows that a second bind does not replace the first bound this value.",
    responseContract: {
      description: "independent correct bound-function explanation",
      requiredAny: ["john", "cannot be re-bound", "first bind", "first binding"],
      forbiddenAny: ["ann wins", "prints ann"],
    },
    expectedCandidate: candidate({
      caseId: "second-bind-independent-success",
      sourceRef: secondBindSource.ref,
      outcome: "correct",
      assistance: "none",
      claims: [
        { claimId: "bound-function-context", signal: "independent_success", errorTag: null },
      ],
      obligation: "none",
    }),
  },
  {
    id: "second-bind-override-misconception",
    phase: "main",
    category: "stable_misconception",
    source: secondBindSource,
    taskId: "second-bind",
    purpose: "assessment",
    prompt:
      "What does f.bind({name:'John'}).bind({name:'Ann'})() use for this.name, and why?",
    rubric: "Correct: John. A bound function's this cannot be replaced by binding it again.",
    targets: ["bound-function-context"],
    observedAssistance: "none",
    learnerProfile:
      "The learner believes the most recent bind overrides an earlier bind. Answer Ann and explain last binding wins.",
    responseContract: {
      description: "last-bind-wins misconception",
      requiredAny: ["ann", "last bind", "second bind", "overrides"],
      forbiddenAny: ["john", "cannot be re-bound"],
    },
    expectedCandidate: candidate({
      caseId: "second-bind-override-misconception",
      sourceRef: secondBindSource.ref,
      outcome: "incorrect",
      assistance: "none",
      claims: [
        {
          claimId: "bound-function-context",
          signal: "failure",
          errorTag: "last-bind-overrides-first",
        },
      ],
      obligation: "targeted_review",
    }),
  },
  {
    id: "callback-repair-independent-success",
    phase: "main",
    category: "independent_success",
    source: callbackSource,
    taskId: "fix-lost-this",
    purpose: "assessment",
    prompt:
      "Why does askPassword(user.loginOk, user.loginFail) lose this, and give one valid one-line repair?",
    rubric:
      "Correct: the methods are passed without their receiver. Bind each method to user or wrap each call in an arrow function.",
    targets: ["detached-callback-context", "bound-function-context"],
    observedAssistance: "none",
    learnerProfile:
      "The learner independently explains detached callbacks and repairs them with bind or an arrow wrapper.",
    responseContract: {
      description: "independent detached-callback diagnosis and repair",
      requiredAny: ["without the object", "receiver", "bind(user)", "arrow"],
      forbiddenAny: ["works unchanged", "no error"],
    },
    expectedCandidate: candidate({
      caseId: "callback-repair-independent-success",
      sourceRef: callbackSource.ref,
      outcome: "correct",
      assistance: "none",
      claims: [
        { claimId: "detached-callback-context", signal: "independent_success", errorTag: null },
        { claimId: "bound-function-context", signal: "independent_success", errorTag: null },
      ],
      obligation: "none",
    }),
  },
  {
    id: "callback-answer-unresolved",
    phase: "pilot",
    category: "unresolved",
    source: callbackSource,
    taskId: "fix-lost-this",
    purpose: "assessment",
    prompt:
      "Why does askPassword(user.loginOk, user.loginFail) lose this, and give one valid one-line repair?",
    rubric:
      "Correct: the methods are passed without their receiver. Bind each method to user or wrap each call in an arrow function.",
    targets: ["detached-callback-context", "bound-function-context"],
    observedAssistance: "none",
    learnerProfile:
      "The learner is genuinely unsure, gives mutually incompatible possibilities, and does not commit to a repair.",
    responseContract: {
      description: "genuinely unresolved answer",
      requiredAny: ["not sure", "maybe", "could be", "uncertain"],
      forbiddenAny: ["bind(user)", "the answer is"],
    },
    expectedCandidate: candidate({
      caseId: "callback-answer-unresolved",
      sourceRef: callbackSource.ref,
      outcome: "unresolved",
      assistance: "none",
      claims: [
        { claimId: "detached-callback-context", signal: "uncertain", errorTag: null },
        { claimId: "bound-function-context", signal: "uncertain", errorTag: null },
      ],
      obligation: "diagnostic",
      confidence: "low",
    }),
  },
  {
    id: "function-value-independent-success",
    phase: "main",
    category: "independent_success",
    source: objectMethodsArticleSource,
    taskId: "function-property-value",
    purpose: "assessment",
    prompt:
      "Given const user = { sayHi() { return 'hi' } }, what is the value of user.sayHi before adding parentheses?",
    rubric:
      "Correct: user.sayHi evaluates to the function value stored in the property; parentheses are required to call it.",
    targets: ["function-value"],
    observedAssistance: "none",
    learnerProfile:
      "The learner independently distinguishes retrieving a function value from invoking it.",
    responseContract: {
      description: "independent function-value distinction",
      requiredAny: ["function", "not called", "without parentheses", "function value"],
      forbiddenAny: ["returns hi immediately", "already calls"],
    },
    expectedCandidate: candidate({
      caseId: "function-value-independent-success",
      sourceRef: objectMethodsArticleSource.ref,
      outcome: "correct",
      assistance: "none",
      claims: [{ claimId: "function-value", signal: "independent_success", errorTag: null }],
      obligation: "none",
    }),
  },
  {
    id: "function-value-access-calls-misconception",
    phase: "main",
    category: "stable_misconception",
    source: objectMethodsArticleSource,
    taskId: "function-property-value",
    purpose: "assessment",
    prompt:
      "Given const user = { sayHi() { return 'hi' } }, what is the value of user.sayHi before adding parentheses?",
    rubric:
      "Correct: user.sayHi evaluates to the function value stored in the property; parentheses are required to call it.",
    targets: ["function-value"],
    observedAssistance: "none",
    learnerProfile:
      "The learner believes accessing a method property automatically invokes it. Say it immediately returns hi.",
    responseContract: {
      description: "property access implicitly calls misconception",
      requiredAny: ["returns hi", "calls", "invokes"],
      forbiddenAny: ["function value", "not called", "without parentheses"],
    },
    expectedCandidate: candidate({
      caseId: "function-value-access-calls-misconception",
      sourceRef: objectMethodsArticleSource.ref,
      outcome: "incorrect",
      assistance: "none",
      claims: [
        {
          claimId: "function-value",
          signal: "failure",
          errorTag: "property-access-treated-as-call",
        },
      ],
      obligation: "targeted_review",
    }),
  },
  {
    id: "callback-repair-hinted-success",
    phase: "main",
    category: "assisted_success",
    source: callbackSource,
    taskId: "fix-lost-this",
    purpose: "assessment",
    prompt:
      "Why does askPassword(user.loginOk, user.loginFail) lose this? Hint: bind each callback to its receiver or wrap the calls in arrows.",
    rubric:
      "Correct: the methods are passed without their receiver. Bind each method to user or wrap each call in an arrow function.",
    targets: ["detached-callback-context", "bound-function-context"],
    observedAssistance: "hint",
    learnerProfile:
      "The learner uses the supplied bind/arrow hint to give a correct repair and acknowledges the hint.",
    responseContract: {
      description: "hint-dependent callback repair",
      requiredAny: ["hint", "bind(user)", "arrow", "receiver"],
      forbiddenAny: ["works unchanged", "no error"],
    },
    expectedCandidate: candidate({
      caseId: "callback-repair-hinted-success",
      sourceRef: callbackSource.ref,
      outcome: "correct",
      assistance: "hint",
      claims: [
        { claimId: "detached-callback-context", signal: "assisted_success", errorTag: null },
        { claimId: "bound-function-context", signal: "assisted_success", errorTag: null },
      ],
      obligation: "verification",
    }),
  },
  {
    id: "second-bind-partial",
    phase: "main",
    category: "partial",
    source: secondBindSource,
    taskId: "second-bind",
    purpose: "assessment",
    prompt:
      "What does f.bind({name:'John'}).bind({name:'Ann'})() use for this.name, and why?",
    rubric: "Correct: John. A bound function's this cannot be replaced by binding it again.",
    targets: ["bound-function-context"],
    observedAssistance: "none",
    learnerProfile:
      "The learner predicts John but gives no valid reason and says it may simply be implementation order.",
    responseContract: {
      description: "correct result without the bound-function mechanism",
      requiredAny: ["john", "implementation order", "not sure why"],
      forbiddenAny: ["cannot be re-bound", "first binding is fixed"],
    },
    expectedCandidate: candidate({
      caseId: "second-bind-partial",
      sourceRef: secondBindSource.ref,
      outcome: "partial",
      assistance: "none",
      claims: [
        {
          claimId: "bound-function-context",
          signal: "uncertain",
          errorTag: "mechanism-unexplained",
        },
      ],
      obligation: "diagnostic",
      confidence: "medium",
    }),
  },
]

export function validateRenderedStudentResponse(fixture: EvidenceCase, response: StudentResponse) {
  const failures: string[] = []
  if (response.caseId !== fixture.id) failures.push("caseId does not match the assigned case")
  if (response.usedHint !== (fixture.observedAssistance === "hint")) {
    failures.push("usedHint does not match the simulator's authoritative assistance condition")
  }
  const answer = response.answer.toLowerCase()
  const required = fixture.responseContract.requiredAny
  const forbidden = fixture.responseContract.forbiddenAny
  if (!required.some((part) => answer.includes(part.toLowerCase()))) {
    failures.push("answer violates the assigned hidden response contract")
  }
  if (forbidden.some((part) => answer.includes(part.toLowerCase()))) {
    failures.push("answer violates the assigned hidden response contract")
  }
  return [...new Set(failures)]
}

export type EvidenceInterpreterVariant = "answer_only" | "declared_contract"

export function buildEvidenceInterpreterInput(
  fixture: EvidenceCase,
  response: StudentResponse,
  variant: EvidenceInterpreterVariant,
  materialExcerpt: string,
) {
  const base = {
    caseId: fixture.id,
    sourceRef: fixture.source.ref,
    task: fixture.prompt,
    rubric: fixture.rubric,
    learnerAnswer: response.answer,
    materialExcerpt,
  }
  if (variant === "answer_only") return base
  return {
    ...base,
    sourceRef: fixture.source.ref,
    taskPurpose: fixture.purpose,
    targets: fixture.targets,
    observedConditions: { assistance: fixture.observedAssistance },
  }
}

function canonicalClaims(value: EvidenceCandidate["claims"]) {
  return [...value]
    .map((claim) => `${claim.claimId}:${claim.signal}:${claim.errorTag ?? ""}`)
    .sort()
}

function exactCandidate(left: EvidenceCandidate, right: EvidenceCandidate) {
  return (
    left.caseId === right.caseId &&
    left.sourceRef === right.sourceRef &&
    left.outcome === right.outcome &&
    left.assistance === right.assistance &&
    left.obligation === right.obligation &&
    JSON.stringify(canonicalClaims(left.claims)) === JSON.stringify(canonicalClaims(right.claims))
  )
}

export function validateExactBatchIds(expectedIds: string[], observedIds: string[]) {
  const failures: string[] = []
  const observedCounts = new Map<string, number>()
  for (const id of observedIds) observedCounts.set(id, (observedCounts.get(id) ?? 0) + 1)
  const duplicates = [...observedCounts]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort()
  const expected = new Set(expectedIds)
  const observed = new Set(observedIds)
  const missing = [...expected].filter((id) => !observed.has(id)).sort()
  const unexpected = [...observed].filter((id) => !expected.has(id)).sort()
  if (duplicates.length > 0) failures.push(`duplicate IDs: ${duplicates.join(", ")}`)
  if (missing.length > 0) failures.push(`missing IDs: ${missing.join(", ")}`)
  if (unexpected.length > 0) failures.push(`unexpected IDs: ${unexpected.join(", ")}`)
  return failures
}

export function scoreEvidenceCandidates(candidates: EvidenceCandidate[], fixtures = benchmarkEvidenceCases) {
  const byId = new Map(candidates.map((candidate) => [candidate.caseId, candidate]))
  let exact = 0
  let outcome = 0
  let assistance = 0
  let claimSet = 0
  let falseIndependent = 0
  let predictedIndependent = 0
  let expectedIndependentCount = 0
  let correctIndependent = 0
  for (const fixture of fixtures) {
    const observed = byId.get(fixture.id)
    if (!observed) continue
    const expected = fixture.expectedCandidate
    if (exactCandidate(observed, expected)) exact += 1
    if (observed.outcome === expected.outcome) outcome += 1
    if (observed.assistance === expected.assistance) assistance += 1
    if (JSON.stringify(canonicalClaims(observed.claims)) === JSON.stringify(canonicalClaims(expected.claims))) {
      claimSet += 1
    }
    const expectedIndependent = new Set(
      expected.claims
        .filter((claim) => claim.signal === "independent_success")
        .map((claim) => claim.claimId),
    )
    const observedIndependent = new Set(
      observed.claims
        .filter((claim) => claim.signal === "independent_success")
        .map((claim) => claim.claimId),
    )
    expectedIndependentCount += expectedIndependent.size
    correctIndependent += [...expectedIndependent].filter((claimId) => observedIndependent.has(claimId)).length
    for (const claim of observed.claims) {
      if (claim.signal !== "independent_success") continue
      predictedIndependent += 1
      if (!expectedIndependent.has(claim.claimId)) falseIndependent += 1
    }
  }
  const total = fixtures.length || 1
  return {
    records: fixtures.length,
    received: fixtures.filter((fixture) => byId.has(fixture.id)).length,
    exactRecordAccuracy: exact / total,
    outcomeAccuracy: outcome / total,
    assistanceAccuracy: assistance / total,
    claimSetAccuracy: claimSet / total,
    falseIndependentEvidenceRate: falseIndependent / (predictedIndependent || 1),
    falseIndependentEvidenceCount: falseIndependent,
    independentSuccessRecall: correctIndependent / (expectedIndependentCount || 1),
    expectedIndependentSuccessClaims: expectedIndependentCount,
    correctIndependentSuccessClaims: correctIndependent,
    missingRecords: fixtures.filter((fixture) => !byId.has(fixture.id)).map((fixture) => fixture.id),
  }
}

export function validateEvidenceCandidateAuthority(
  fixture: EvidenceCase,
  candidate: EvidenceCandidate,
) {
  const failures: string[] = []
  if (candidate.caseId !== fixture.id) failures.push("candidate caseId does not match the active task")
  if (candidate.sourceRef !== fixture.source.ref) {
    failures.push("candidate source reference does not match the observed task source")
  }
  if (candidate.assistance !== fixture.observedAssistance) {
    failures.push("candidate assistance conflicts with the observed condition")
  }
  const targets = new Set(fixture.targets)
  for (const claim of candidate.claims) {
    if (!targets.has(claim.claimId)) {
      failures.push(`candidate claim ${claim.claimId} is outside the declared task targets`)
    }
  }
  const declaredTargets = [...fixture.targets].sort()
  const candidateTargets = candidate.claims.map((claim) => claim.claimId).sort()
  if (JSON.stringify(candidateTargets) !== JSON.stringify(declaredTargets)) {
    failures.push("candidate claims must cover each declared target exactly once")
  }

  if (candidate.outcome === "correct") {
    const expectedSignal = candidate.assistance === "none" ? "independent_success" : "assisted_success"
    if (candidate.claims.some((claim) => claim.signal !== expectedSignal)) {
      failures.push(
        candidate.assistance === "none"
          ? "correct unassisted evidence requires independent_success for every target"
          : "correct assisted evidence requires assisted_success for every target",
      )
    }
    if (candidate.claims.some((claim) => claim.errorTag !== null)) {
      failures.push("successful evidence cannot carry an error tag")
    }
    const expectedObligation = candidate.assistance === "none" ? "none" : "verification"
    if (candidate.obligation !== expectedObligation) {
      failures.push(
        candidate.assistance === "none"
          ? "correct unassisted evidence requires no follow-up obligation"
          : "correct assisted evidence requires a verification obligation",
      )
    }
  } else if (candidate.outcome === "incorrect") {
    if (candidate.claims.some((claim) => claim.signal !== "failure")) {
      failures.push("incorrect evidence requires a failure signal for every target")
    }
    if (candidate.claims.some((claim) => claim.errorTag === null)) {
      failures.push("incorrect evidence requires a target-specific error tag")
    }
    if (candidate.obligation !== "targeted_review") {
      failures.push("incorrect evidence requires a targeted_review obligation")
    }
  } else {
    if (candidate.claims.some((claim) => claim.signal !== "uncertain")) {
      failures.push(`${candidate.outcome} evidence requires an uncertain signal for every target`)
    }
    if (candidate.obligation !== "diagnostic") {
      failures.push(`${candidate.outcome} evidence requires a diagnostic obligation`)
    }
  }
  return failures
}

export function advanceVirtualTime<T extends ClaimId>(
  state: { day: number; evidenceIds: string[]; reviews: Array<{ target: T; dueDay: number }> },
  days: number,
) {
  if (!Number.isInteger(days) || days < 0) throw new Error("virtual-time advance must be a non-negative integer")
  const day = state.day + days
  return {
    day,
    evidenceIds: [...state.evidenceIds],
    reviews: state.reviews.map((review) => ({ ...review })),
    dueTargets: state.reviews.filter((review) => review.dueDay <= day).map((review) => review.target),
  }
}

export const candidateReasons = [
  "deadline_urgent",
  "due_review",
  "targeted_remediation",
  "verification",
  "ready_new",
  "implicit_review",
  "stale_reason",
] as const

export type CandidateReason = (typeof candidateReasons)[number]

export type TaskCandidate = {
  id: string
  label: string
  durationMinutes: number
  reasons: CandidateReason[]
  substantiallyExercises: ClaimId[]
  fixedQueuePriority: number
}

export type SelectionScenario = {
  id: string
  phase: "pilot" | "main"
  evidenceCaseId: string | null
  currentGoal: string
  timeBudgetMinutes: number
  latestInteraction: string
  candidates: TaskCandidate[]
  inferredProjection: string
  obligations: string[]
  hiddenLearnerState: string
  oracle: {
    expectedActionId: string
    forbiddenActionIds: string[]
    reason: string
  }
}

function task(
  id: string,
  label: string,
  reasons: CandidateReason[],
  fixedQueuePriority: number,
  durationMinutes = 15,
  substantiallyExercises: ClaimId[] = [],
): TaskCandidate {
  return { id, label, durationMinutes, reasons, substantiallyExercises, fixedQueuePriority }
}

export const benchmarkSelectionScenarios: SelectionScenario[] = [
  {
    id: "repair-blocking-misconception",
    phase: "main",
    evidenceCaseId: "second-bind-override-misconception",
    currentGoal: "progress from bound functions to repairing detached callbacks",
    timeBudgetMinutes: 35,
    latestInteraction: "The learner claimed that a second bind overrides the first binding.",
    candidates: [
      task("explicit-due-review", "Review an older function-value item", ["due_review"], 90),
      task("repair-bind", "Contrast first binding with attempted rebinding", ["targeted_remediation"], 80),
      task("learn-callback-repair", "Start detached callback repair", ["ready_new"], 60),
    ],
    inferredProjection: "A stable rebinding misconception blocks reliable callback repair.",
    obligations: ["targeted remediation: bound-function-context"],
    hiddenLearnerState: "bound-function-context is wrong under a last-bind-wins misconception",
    oracle: {
      expectedActionId: "repair-bind",
      forbiddenActionIds: ["learn-callback-repair"],
      reason: "Repair the prerequisite that directly blocks the active route.",
    },
  },
  {
    id: "verify-hinted-success",
    phase: "main",
    evidenceCaseId: "object-this-hinted-success",
    currentGoal: "establish independent call-site reasoning",
    timeBudgetMinutes: 25,
    latestInteraction: "The learner answered correctly only after a call-site hint.",
    candidates: [
      task("explicit-due-review", "Review an older function-value item", ["due_review"], 90),
      task("verify-call-site", "Solve a fresh independent call-site item", ["verification"], 85),
      task("learn-bind", "Start the bind lesson", ["ready_new"], 60),
    ],
    inferredProjection: "Assisted success exists; independent call-site performance is unresolved.",
    obligations: ["verification: call-site-this"],
    hiddenLearnerState: "call-site-this is available only after a hint",
    oracle: {
      expectedActionId: "verify-call-site",
      forbiddenActionIds: ["learn-bind"],
      reason: "Verify independent performance before treating the prerequisite as available.",
    },
  },
  {
    id: "advance-after-independent-success",
    phase: "pilot",
    evidenceCaseId: "object-this-independent-success",
    currentGoal: "progress from call-site this to callback binding",
    timeBudgetMinutes: 30,
    latestInteraction: "The learner independently explained the call-site rule correctly.",
    candidates: [
      task("learn-bind", "Start the bind lesson", ["ready_new"], 70),
      task("unneeded-remediation", "Repeat the same call-site explanation", ["targeted_remediation"], 40),
      task("not-due-review", "Review call-site this early", ["due_review"], 20),
    ],
    inferredProjection: "Independent call-site success; bind is ready.",
    obligations: [],
    hiddenLearnerState: "call-site-this is currently stable enough to progress",
    oracle: {
      expectedActionId: "learn-bind",
      forbiddenActionIds: [],
      reason: "Advance because the prerequisite has independent evidence and no review is due.",
    },
  },
  {
    id: "merge-new-work-and-review",
    phase: "main",
    evidenceCaseId: "callback-repair-independent-success",
    currentGoal: "learn callback binding while call-site reasoning is due",
    timeBudgetMinutes: 30,
    latestInteraction: "Call-site this is due for review; bind basics were learned yesterday.",
    candidates: [
      task("explicit-call-site-review", "Repeat a basic call-site item", ["due_review"], 90),
      task("unrelated-new", "Start prototype inheritance", ["ready_new"], 60),
      task(
        "callback-transfer",
        "Diagnose and repair a detached callback",
        ["ready_new", "implicit_review"],
        80,
        20,
        ["call-site-this", "detached-callback-context", "bound-function-context"],
      ),
    ],
    inferredProjection:
      "Call-site this is due. The aligned callback task substantially exercises it while advancing the active route.",
    obligations: ["due review: call-site-this"],
    hiddenLearnerState: "call-site-this has decayed but remains retrievable in an applied callback task",
    oracle: {
      expectedActionId: "callback-transfer",
      forbiddenActionIds: ["unrelated-new"],
      reason: "One aligned task can satisfy due review and ready new work within the budget.",
    },
  },
  {
    id: "urgent-low-value-deadline",
    phase: "pilot",
    evidenceCaseId: null,
    currentGoal: "preserve the study plan while meeting a near deadline",
    timeBudgetMinutes: 45,
    latestInteraction: "A low-learning-value report is due in 35 minutes.",
    candidates: [
      task("compress-report", "Produce the minimum acceptable report", ["deadline_urgent"], 100, 25),
      task("deep-report-research", "Study the report topic deeply", ["deadline_urgent"], 95, 90),
      task("due-call-site-review", "Run a due review", ["due_review"], 90, 12),
    ],
    inferredProjection: "The report is urgent and low learning value; a short review can follow if time remains.",
    obligations: ["deadline: report in 35 minutes", "due review: call-site-this"],
    hiddenLearnerState: "no new learning fact",
    oracle: {
      expectedActionId: "compress-report",
      forbiddenActionIds: ["deep-report-research"],
      reason: "Meet the real deadline without allowing low-value work to consume the whole budget.",
    },
  },
  {
    id: "correction-clears-stale-remediation",
    phase: "main",
    evidenceCaseId: null,
    currentGoal: "progress to bind after correcting a bad answer key",
    timeBudgetMinutes: 25,
    latestInteraction: "A source correction retracted the prior negative call-site interpretation.",
    candidates: [
      task("stale-remediation", "Repair the now-retracted call-site failure", ["stale_reason"], 80),
      task("review-function-value", "Review an older due item", ["due_review"], 60),
      task("learn-bind", "Start the bind lesson", ["ready_new"], 70),
    ],
    inferredProjection: "The negative interpretation is inactive after correction; bind is ready.",
    obligations: [],
    hiddenLearnerState: "call-site-this was never failed; the prior grading interpretation was wrong",
    oracle: {
      expectedActionId: "learn-bind",
      forbiddenActionIds: ["stale-remediation"],
      reason: "A retracted interpretation cannot continue to generate remediation pressure.",
    },
  },
  {
    id: "ordinary-due-review",
    phase: "main",
    evidenceCaseId: null,
    currentGoal: "maintain call-site retrieval before later callback work",
    timeBudgetMinutes: 20,
    latestInteraction: "No new learner activity occurred; the review became due after virtual time advanced.",
    candidates: [
      task("due-call-site-review", "Run the due call-site review", ["due_review"], 90, 10),
      task("learn-prototypes", "Start prototype inheritance", ["ready_new"], 60, 20),
      task("early-bind-repeat", "Repeat a not-due bind item", ["due_review"], 30, 10),
    ],
    inferredProjection: "Call-site this is due under the retention projection; no conflicting evidence exists.",
    obligations: ["due review: call-site-this"],
    hiddenLearnerState: "call-site-this retrieval has decayed below the review threshold",
    oracle: {
      expectedActionId: "due-call-site-review",
      forbiddenActionIds: [],
      reason: "A naturally due review outranks unrelated ready work in this short budget.",
    },
  },
  {
    id: "repeated-failure-remediation",
    phase: "main",
    evidenceCaseId: null,
    currentGoal: "repair repeated callback receiver failures",
    timeBudgetMinutes: 25,
    latestInteraction: "Two independent callback tasks failed with the same lost-receiver error.",
    candidates: [
      task("repair-callback-context", "Contrast method and detached callback calls", ["targeted_remediation"], 80, 15),
      task("learn-advanced-bind", "Start partial application", ["ready_new"], 60, 25),
      task("review-function-value", "Review an older function-value item", ["due_review"], 50, 10),
    ],
    inferredProjection: "Repeated aligned failures support local callback-context remediation.",
    obligations: ["targeted remediation: detached-callback-context"],
    hiddenLearnerState: "detached-callback-context has a stable repeated misconception",
    oracle: {
      expectedActionId: "repair-callback-context",
      forbiddenActionIds: ["learn-advanced-bind"],
      reason: "Repeated failure justifies local remediation before advancing the same route.",
    },
  },
]

export type SelectorVariant = "stateless_model" | "oracle_state_model" | "inferred_state_model"

export function buildSelectorInput(
  scenario: SelectionScenario,
  variant: SelectorVariant,
  inferredEvidence?: EvidenceCandidate,
  latestRawResponse?: string,
) {
  const shared = {
    scenarioId: scenario.id,
    currentGoal: scenario.currentGoal,
    timeBudgetMinutes: scenario.timeBudgetMinutes,
  }
  if (variant === "stateless_model") {
    return {
      ...shared,
      candidates: scenario.candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        durationMinutes: candidate.durationMinutes,
      })),
      latestInteraction: latestRawResponse ?? scenario.latestInteraction,
    }
  }
  const base = {
    ...shared,
    candidates: scenario.candidates.map(({ fixedQueuePriority: _priority, ...candidate }) => candidate),
  }
  if (variant === "oracle_state_model") {
    return { ...base, learnerState: scenario.hiddenLearnerState, obligations: scenario.obligations }
  }
  return {
    ...base,
    latestInteraction: scenario.latestInteraction,
    learnerProjection: inferredEvidence
      ? `Latest admitted candidate: ${JSON.stringify({
          outcome: inferredEvidence.outcome,
          assistance: inferredEvidence.assistance,
          claims: inferredEvidence.claims,
        })}`
      : scenario.inferredProjection,
    obligations: inferredEvidence
      ? inferredEvidence.obligation === "none"
        ? []
        : [`${inferredEvidence.obligation}: ${inferredEvidence.claims.map((claim) => claim.claimId).join(",")}`]
      : scenario.obligations,
    ...(inferredEvidence ? { latestEvidenceCandidate: inferredEvidence } : {}),
  }
}

export function fixedQueueSelect(scenario: SelectionScenario) {
  const sorted = [...scenario.candidates].sort(
    (left, right) =>
      right.fixedQueuePriority - left.fixedQueuePriority ||
      left.durationMinutes - right.durationMinutes ||
      left.id.localeCompare(right.id),
  )
  const first = sorted[0]
  if (!first) throw new Error(`Selection scenario ${scenario.id} has no candidates`)
  return first.id
}

export function scoreSelections(
  predictions: Array<{ scenarioId: string; actionId: string }>,
  scenarios = benchmarkSelectionScenarios,
) {
  const byId = new Map(predictions.map((prediction) => [prediction.scenarioId, prediction.actionId]))
  let exact = 0
  let hardViolations = 0
  for (const scenario of scenarios) {
    const action = byId.get(scenario.id)
    if (!action) continue
    if (action === scenario.oracle.expectedActionId) exact += 1
    if (scenario.oracle.forbiddenActionIds.includes(action)) hardViolations += 1
  }
  const total = scenarios.length || 1
  return {
    scenarios: scenarios.length,
    received: scenarios.filter((scenario) => byId.has(scenario.id)).length,
    exactActionAccuracy: exact / total,
    hardInvariantViolationRate: hardViolations / total,
    missingPredictions: scenarios.filter((scenario) => !byId.has(scenario.id)).length,
  }
}
