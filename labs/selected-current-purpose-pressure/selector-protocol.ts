import { z } from "zod"

export const SELECTOR_PROTOCOL_REVISION = "als-022b-selector-semantics-v1"

export const selectorOutputSchema = z
  .object({
    decision: z.enum(["adopt", "none"]),
    concernId: z.string().nullable(),
    operativePurpose: z.string().nullable(),
    learnerRoleConstraint: z.string().nullable(),
    basis: z.string().min(1),
  })
  .strict()

export type SelectorOutput = z.infer<typeof selectorOutputSchema>

type Candidate = Readonly<{
  id: string
  eligibility: "eligible" | "upcoming"
  targetState: "current_view" | "superseded_view"
  reason: string
}>

type ExpectedSelection = Readonly<{
  decision: "adopt" | "none"
  concernId: string | null
  semanticKind?: "independent_prediction" | "discrimination" | "repair"
}>

export type SelectorScenario = Readonly<{
  id: string
  learnerText: string
  candidates: readonly Candidate[]
  expected: ExpectedSelection
  why: string
}>

const independent: Candidate = Object.freeze({
  id: "concern:independent",
  eligibility: "eligible",
  targetState: "current_view",
  reason:
    "回来时检查学习者能否在不先得到答案或决定性提示的情况下，独立预测别名修改的结果。",
})

const discrimination: Candidate = Object.freeze({
  id: "concern:discrimination",
  eligibility: "eligible",
  targetState: "current_view",
  reason: "回来时用成对例子区分别名和浅复制的共享边界。",
})

const repair: Candidate = Object.freeze({
  id: "concern:repair",
  eligibility: "eligible",
  targetState: "current_view",
  reason: "回来时换一种表示，继续建立对象身份变化的因果模型；不要只重复文字定义。",
})

export const selectorScenarios: readonly SelectorScenario[] = Object.freeze([
  Object.freeze({
    id: "generic_continue_independent",
    learnerText: "继续对象身份这一节。",
    candidates: Object.freeze([independent]),
    expected: Object.freeze({
      decision: "adopt",
      concernId: independent.id,
      semanticKind: "independent_prediction",
    }),
    why: "One eligible current-view concern supplies the otherwise missing purpose.",
  }),
  Object.freeze({
    id: "explicit_independent_request",
    learnerText: "继续；先让我自己预测一个别名修改的输出，回答前不要给提示。",
    candidates: Object.freeze([repair, independent]),
    expected: Object.freeze({
      decision: "adopt",
      concernId: independent.id,
      semanticKind: "independent_prediction",
    }),
    why: "The current request explicitly disambiguates the matching candidate.",
  }),
  Object.freeze({
    id: "explicit_discrimination_request",
    learnerText: "继续上次要做的区分：给我成对例子辨别别名和浅复制。",
    candidates: Object.freeze([repair, independent, discrimination]),
    expected: Object.freeze({
      decision: "adopt",
      concernId: discrimination.id,
      semanticKind: "discrimination",
    }),
    why: "The learner explicitly selects the discrimination purpose among same-target candidates.",
  }),
  Object.freeze({
    id: "generic_continue_repair",
    learnerText: "继续对象身份这一节。",
    candidates: Object.freeze([repair]),
    expected: Object.freeze({
      decision: "adopt",
      concernId: repair.id,
      semanticKind: "repair",
    }),
    why: "One eligible repair concern should govern the otherwise generic continuation.",
  }),
  Object.freeze({
    id: "deadline_direct_answer",
    learnerText:
      "今晚要交作业。直接告诉我 alias.count += 1 会输出什么并解释；这次不要先考我。",
    candidates: Object.freeze([independent]),
    expected: Object.freeze({ decision: "none", concernId: null }),
    why: "The explicit current request outranks the incompatible independent-prediction concern.",
  }),
  Object.freeze({
    id: "explicit_cancel",
    learnerText: "那条以后让我独立预测的安排取消掉；现在直接解释。",
    candidates: Object.freeze([independent]),
    expected: Object.freeze({ decision: "none", concernId: null }),
    why: "Cancellation is a separate Agenda command; the cancelled candidate must not govern teaching.",
  }),
  Object.freeze({
    id: "multiple_ambiguous",
    learnerText: "继续对象身份这一节。",
    candidates: Object.freeze([repair, independent, discrimination]),
    expected: Object.freeze({ decision: "none", concernId: null }),
    why: "Materially different purposes have equal status and the learner did not disambiguate.",
  }),
  Object.freeze({
    id: "upcoming_only",
    learnerText: "继续对象身份这一节。",
    candidates: Object.freeze([
      Object.freeze({ ...independent, id: "concern:upcoming", eligibility: "upcoming" }),
    ]),
    expected: Object.freeze({ decision: "none", concernId: null }),
    why: "Upcoming awareness is not proactively selectable.",
  }),
  Object.freeze({
    id: "superseded_target",
    learnerText: "继续对象身份这一节。",
    candidates: Object.freeze([
      Object.freeze({ ...independent, id: "concern:stale", targetState: "superseded_view" }),
    ]),
    expected: Object.freeze({ decision: "none", concernId: null }),
    why: "A superseded target cannot govern the current move.",
  }),
  Object.freeze({
    id: "already_completed_input",
    learnerText:
      "我刚才没看答案，独立算完了：original、alias、copy 最后是 2、2、1，因为前两个是同一对象。请核对。",
    candidates: Object.freeze([independent]),
    expected: Object.freeze({ decision: "none", concernId: null }),
    why: "This input may serve/address the concern; it does not need a new forward selection.",
  }),
  Object.freeze({
    id: "learner_redirect",
    learnerText: "对象身份先搁置。帮我梳理今晚作业的提交步骤，不要出题。",
    candidates: Object.freeze([repair, independent]),
    expected: Object.freeze({ decision: "none", concernId: null }),
    why: "The learner redirects away from the candidate target.",
  }),
])

export const SELECTOR_SYSTEM_PROMPT = [
  "You are the model component in a control-only Tutor composition step.",
  "Decide whether one supplied Agenda candidate should govern the next learner-visible move. This step does not teach, answer, mutate learning state, address Agenda, or create evidence.",
  "The learner's explicit current request outranks Agenda. Adopt only an eligible current_view candidate that is compatible with the request and materially supplies or matches the purpose for the next move.",
  "Return none when the request overrides or redirects, the input already reports the completed occurrence, candidates are upcoming or superseded, or materially different candidates remain ambiguous.",
  "When adopting, copy exactly one visible concernId. State a short operative purpose and only the learner-role constraint that changes admissible action. Keep the exact candidate reason as source; your interpretation is scoped to this Turn.",
  "When returning none, concernId, operativePurpose, and learnerRoleConstraint must all be null.",
  'Return one JSON object exactly shaped as: {"decision":"adopt|none","concernId":"visible id or null","operativePurpose":"short purpose or null","learnerRoleConstraint":"material constraint or null","basis":"brief reason"}. Do not add Markdown or prose outside JSON.',
].join("\n")

export function renderSelectorScenario(scenario: SelectorScenario) {
  const candidates = scenario.candidates
    .map(
      (candidate) =>
        `- [${candidate.eligibility}; ${candidate.targetState}] concernId ${JSON.stringify(candidate.id)}; reason ${JSON.stringify(candidate.reason)}`,
    )
    .join("\n")
  return [
    `Current learner request:\n${scenario.learnerText}`,
    `Visible Agenda candidates:\n${candidates || "(none)"}`,
  ].join("\n\n")
}

export function assessSelectorOutput(
  scenario: SelectorScenario,
  raw: unknown,
) {
  const parsed = selectorOutputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      passed: false,
      transportValid: false,
      decisionCorrect: false,
      identityCorrect: false,
      fieldsConsistent: false,
      semanticConstraintCorrect: false,
      detail: parsed.error.message,
    }
  }
  const value = parsed.data
  const decisionCorrect = value.decision === scenario.expected.decision
  const identityCorrect = value.concernId === scenario.expected.concernId
  const fieldsConsistent =
    value.decision === "adopt"
      ? Boolean(value.concernId && value.operativePurpose)
      : value.concernId === null &&
        value.operativePurpose === null &&
        value.learnerRoleConstraint === null
  const semanticConstraintCorrect = checkSemanticConstraint(
    scenario.expected.semanticKind,
    value,
  )
  return {
    passed:
      decisionCorrect &&
      identityCorrect &&
      fieldsConsistent &&
      semanticConstraintCorrect,
    transportValid: true,
    decisionCorrect,
    identityCorrect,
    fieldsConsistent,
    semanticConstraintCorrect,
    detail: value.basis,
    value,
  }
}

function checkSemanticConstraint(
  kind: ExpectedSelection["semanticKind"],
  value: SelectorOutput,
) {
  if (!kind) return value.learnerRoleConstraint === null
  const text = `${value.operativePurpose ?? ""} ${value.learnerRoleConstraint ?? ""}`
    .toLowerCase()
  if (kind === "independent_prediction") {
    return (
      /(预测|prediction)/u.test(text) &&
      /(答案|提示|answer|hint)/u.test(text) &&
      /(之前|前|先|before)/u.test(text) &&
      /(不|不得|避免|without|do not|must not)/u.test(text)
    )
  }
  if (kind === "discrimination") {
    return (
      /(区分|辨别|distinguish|discriminat)/u.test(text) &&
      /(别名|alias)/u.test(text) &&
      /(浅复制|浅拷贝|shallow)/u.test(text)
    )
  }
  return /(换|表示|因果|模型|represent|causal|model)/u.test(text)
}

export function validateSelectorProtocol() {
  const ids = selectorScenarios.map((scenario) => scenario.id)
  if (new Set(ids).size !== ids.length) throw new Error("Selector scenario IDs must be unique")
  for (const scenario of selectorScenarios) {
    if (scenario.expected.decision === "adopt") {
      const candidate = scenario.candidates.find(
        (item) => item.id === scenario.expected.concernId,
      )
      if (!candidate || candidate.eligibility !== "eligible" || candidate.targetState !== "current_view") {
        throw new Error(`Invalid adopted oracle in ${scenario.id}`)
      }
    }
  }
}

