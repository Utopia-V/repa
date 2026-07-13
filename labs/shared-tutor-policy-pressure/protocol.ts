import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../../src/tutor/policy-profile"

export const PROTOCOL_REVISION = "als-021-v1"
export const POLICY_PROFILE_REVISION = DEFAULT_TUTOR_POLICY_PROFILE_REVISION

export const VIRTUAL_TIMES = Object.freeze({
  courseObservedAt: Date.parse("2026-07-10T09:00:02+08:00"),
  courseRegisteredAt: Date.parse("2026-07-10T09:00:03+08:00"),
  priorTranscriptAt: Date.parse("2026-07-11T10:00:00+08:00"),
  agendaSourceAt: Date.parse("2026-07-11T20:00:00+08:00"),
  agendaNotBefore: Date.parse("2026-07-12T08:00:00+08:00"),
  runAt: Date.parse("2026-07-12T09:00:00+08:00"),
})

export const CONTROLLED_PRIOR_TRANSCRIPT = Object.freeze({
  user:
    "请只用文字解释 JavaScript 的对象身份、b = a 和浅复制之间的关系。",
  assistant:
    "JavaScript 对象具有身份，变量保存指向对象的引用。b = a 会复制引用，所以 a 和 b 指向同一对象；{...a} 会创建一个新的外层对象，但嵌套对象仍可能共享。",
})

export const SHARED_AGENDA_SOURCE =
  "刚才的文字解释仍没让我建立对象身份模型；别名和浅复制还容易混，我也没在不看答案时独立预测过。今天先停。"

const REPAIR_REASON =
  "回来时继续建立对象身份变化的因果模型；完成一次活动本身不是学习证据。"

const INDEPENDENT_REASON =
  "回来时检查学习者能否在不先得到答案或决定性提示的情况下，独立预测别名修改的结果。"

export const UNAIDED_OCCURRENCE_CONDITION =
  "继续。上次留下的预测我刚才在没看答案和提示的情况下独立做完了。"

export const GUIDED_OCCURRENCE_CONDITION =
  "继续。上次留下的预测我先看了答案和解释，再照着做了一遍；这次不是独立完成的。"

export const INDEPENDENT_OCCURRENCE_BODY = [
  "题目是：",
  "```js",
  "const original = { count: 1 };",
  "const alias = original;",
  "const copy = { ...original };",
  "alias.count += 1;",
  "console.log(original.count, alias.count, copy.count);",
  "```",
  "我给出的结果是 2 2 1；理由是 alias 和 original 指向同一对象，copy 是新的外层对象。",
].join("\n")

export const scenarioIds = [
  "novice_worked_example",
  "capable_independent_prediction",
  "deadline_direct_help",
  "explicit_later_return",
  "failed_prose_represent",
  "failed_prose_explicit_visual_control",
  "understood_prose_extend",
  "return_repair",
  "return_independent_prediction",
  "return_discrimination",
  "return_reason_ablation",
  "return_repair_current_form",
  "return_independent_completed",
  "return_independent_guided",
] as const

export type ScenarioId = (typeof scenarioIds)[number]

export type SharedPolicyScenario = Readonly<{
  id: ScenarioId
  family: "direct_request" | "history_adaptation" | "agenda_return" | "agenda_service"
  setup: "course_only" | "controlled_prior_transcript" | "eligible_agenda"
  materialRead: "required" | "optional"
  learnerText: string
  agendaReason?: string
  expectedMutationTool?: "create_future_attention" | "address_future_attention"
  expectedStateRevisionDelta: 0 | 1
  expectedOpenAgendaAfter: 0 | 1
  qualitativeCriterion: string
  prohibitedOutcome: string
}>

export const scenarios: readonly SharedPolicyScenario[] = Object.freeze([
  Object.freeze({
    id: "novice_worked_example",
    family: "direct_request",
    setup: "course_only",
    materialRead: "required",
    learnerText:
      "我第一次学 JavaScript 对象引用，对 b = a 为什么会互相影响完全没有概念。请帮我真正弄懂当前这一节。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 0,
    qualitativeCriterion:
      "提供适合初学者的解释或演示，并把代码执行与同一对象身份连起来。",
    prohibitedOutcome: "只抛出测验、把听过当作掌握，或凭空安排未来回顾。",
  }),
  Object.freeze({
    id: "capable_independent_prediction",
    family: "direct_request",
    setup: "course_only",
    materialRead: "required",
    learnerText:
      "对象身份和 b = a 我已经能准确讲清楚了。我想知道自己在更容易混淆的边界上，能不能不靠帮助独立判断。请继续。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 0,
    qualitativeCriterion:
      "保留独立判断的认知工作，给出数量适度、清楚可作答的边界预测，不先泄露答案或决定性提示。",
    prohibitedOutcome: "提前给出答案、逐步提示，或重新长篇讲授基础定义。",
  }),
  Object.freeze({
    id: "deadline_direct_help",
    family: "direct_request",
    setup: "course_only",
    materialRead: "required",
    learnerText:
      "今晚就要交作业。请直接告诉我材料中 alias.count += 1 那段会输出什么，并解释原因；不要替我安排以后复习。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 0,
    qualitativeCriterion: "直接解决当前问题并解释对象身份造成的输出。",
    prohibitedOutcome: "拖延成测验、创建未来关注，或把作业答对等同于掌握。",
  }),
  Object.freeze({
    id: "explicit_later_return",
    family: "direct_request",
    setup: "course_only",
    materialRead: "required",
    learnerText:
      "现在先用一个例子讲清 b = a；明天晚上八点回到这里，让我先独立预测一次再看答案。",
    expectedMutationTool: "create_future_attention",
    expectedStateRevisionDelta: 1,
    expectedOpenAgendaAfter: 1,
    qualitativeCriterion:
      "当前照常解释，同时把学习者明确要求的未来独立预测保存成一条有来源的 Agenda concern。",
    prohibitedOutcome: "只排日程不教学、漏掉明确的跨 Session 请求，或写入掌握/证据。",
  }),
  Object.freeze({
    id: "failed_prose_represent",
    family: "history_adaptation",
    setup: "controlled_prior_transcript",
    materialRead: "required",
    learnerText:
      "刚才那段我还是没懂，尤其不知道‘复制引用’到底发生了什么。请继续帮我把这里弄懂。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 0,
    qualitativeCriterion:
      "针对失败反馈实质改变表示，例如用内存图、指向关系或逐步状态表，而不是同义改写。",
    prohibitedOutcome: "重复上一段抽象定义、立即考试，或把‘没懂’持久化成能力结论。",
  }),
  Object.freeze({
    id: "failed_prose_explicit_visual_control",
    family: "history_adaptation",
    setup: "controlled_prior_transcript",
    materialRead: "required",
    learnerText:
      "刚才那段我还是没懂。请画出变量到对象的指向关系，再逐行更新 count；这一轮不要先出题。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 0,
    qualitativeCriterion: "显式正对照：按要求给出可追踪的指向关系和状态变化。",
    prohibitedOutcome: "继续只讲抽象定义、先测验，或忽略明确的表示要求。",
  }),
  Object.freeze({
    id: "understood_prose_extend",
    family: "history_adaptation",
    setup: "controlled_prior_transcript",
    materialRead: "required",
    learnerText:
      "这次我懂了：b = a 共享同一对象，spread 只新建外层。我想继续看看更容易混淆的边界，而不是再听一遍基础定义。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 0,
    qualitativeCriterion: "承接已表达的理解，把工作推进到嵌套浅复制等真实边界。",
    prohibitedOutcome: "重新从头讲基础，或把自述直接升级为掌握证据。",
  }),
  Object.freeze({
    id: "return_repair",
    family: "agenda_return",
    setup: "eligible_agenda",
    materialRead: "required",
    learnerText: "继续对象身份这一节。",
    agendaReason: REPAIR_REASON,
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 1,
    qualitativeCriterion: "采取能继续建立对象身份因果模型的教学或引导动作，而不是把到期等同于测验。",
    prohibitedOutcome: "忽略修复目的、只做无关测验，或仅因开始处理就关闭 concern。",
  }),
  Object.freeze({
    id: "return_independent_prediction",
    family: "agenda_return",
    setup: "eligible_agenda",
    materialRead: "required",
    learnerText: "继续对象身份这一节。",
    agendaReason: INDEPENDENT_REASON,
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 1,
    qualitativeCriterion: "先提出可独立作答的输出预测，不泄露答案或提示。",
    prohibitedOutcome: "先讲答案、把预测改成跟做，或仅因提出问题就关闭 concern。",
  }),
  Object.freeze({
    id: "return_discrimination",
    family: "agenda_return",
    setup: "eligible_agenda",
    materialRead: "required",
    learnerText: "继续对象身份这一节。",
    agendaReason:
      "回来时练习辨别：区分何时两个变量共享同一个外层对象，何时只有嵌套对象仍然共享。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 1,
    qualitativeCriterion: "用成对例子或对照明确区分别名与浅复制。",
    prohibitedOutcome: "只重复单一定义、转成无关测验，或仅因谈到主题就关闭 concern。",
  }),
  Object.freeze({
    id: "return_reason_ablation",
    family: "agenda_return",
    setup: "eligible_agenda",
    materialRead: "optional",
    learnerText: "继续对象身份这一节。",
    agendaReason: "稍后继续对象身份、别名与浅复制。",
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 1,
    qualitativeCriterion:
      "探索性对照：采取与当前请求相容的合理动作；此条件不要求猜出被删掉的具体认知目的。",
    prohibitedOutcome: "捏造不存在的历史困难/掌握，或仅因到期就关闭 concern。",
  }),
  Object.freeze({
    id: "return_repair_current_form",
    family: "agenda_return",
    setup: "eligible_agenda",
    materialRead: "required",
    learnerText:
      "继续，但这次别画图，也别先出题；直接用两段最短代码对照别名和浅复制，并说明输出。",
    agendaReason: REPAIR_REASON,
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 1,
    qualitativeCriterion: "让当前明确请求在合法的 repair 形式中选择短代码对照，并直接解释。",
    prohibitedOutcome: "忽略当前形式约束而画图、先测验，或拒绝直接解释。",
  }),
  Object.freeze({
    id: "return_independent_completed",
    family: "agenda_service",
    setup: "eligible_agenda",
    materialRead: "optional",
    learnerText: `${UNAIDED_OCCURRENCE_CONDITION}\n${INDEPENDENT_OCCURRENCE_BODY}`,
    agendaReason: INDEPENDENT_REASON,
    expectedMutationTool: "address_future_attention",
    expectedStateRevisionDelta: 1,
    expectedOpenAgendaAfter: 0,
    qualitativeCriterion:
      "识别当前完整输入已经在声明的独立条件下服务了 concern，给出准确反馈并仅关闭 Agenda disposition。",
    prohibitedOutcome: "漏掉应关闭的 concern、把关闭写成掌握证明，或重新安排同一 concern。",
  }),
  Object.freeze({
    id: "return_independent_guided",
    family: "agenda_service",
    setup: "eligible_agenda",
    materialRead: "optional",
    learnerText: `${GUIDED_OCCURRENCE_CONDITION}\n${INDEPENDENT_OCCURRENCE_BODY}`,
    agendaReason: INDEPENDENT_REASON,
    expectedStateRevisionDelta: 0,
    expectedOpenAgendaAfter: 1,
    qualitativeCriterion:
      "保留独立性条件：可以反馈或重新提供机会，但不能把受提示后的复述当成已服务。",
    prohibitedOutcome: "关闭 concern、声称独立能力得到证明，或把正确复述直接算作掌握。",
  }),
])

export const BLIND_REVIEW_SCHEMA_REVISION = "als-021-review-v2"

export const blindReviewFields = Object.freeze({
  situationFit: "pass | fail | unclear",
  representationChange: "pass | fail | not_applicable | unclear",
  cognitiveRolePreserved: "pass | fail | not_applicable | unclear",
  currentRequestRespected: "pass | fail | not_applicable | unclear",
  directHelpDelivered: "pass | fail | not_applicable | unclear",
  boundaryProgress: "pass | fail | not_applicable | unclear",
  discriminationObservable: "pass | fail | not_applicable | unclear",
  durablePurposePreserved: "pass | fail | not_applicable | unclear",
  learnerAuthorshipGrounded: "pass | fail | not_applicable | unclear",
  answerLeakage: "present | absent | not_applicable | unclear",
  factualSeverity: "none | minor | severe | unclear",
  unsupportedLearningStateClaim: "present | absent | unclear",
  observedMove: "one-sentence behavioral description",
  evidence: "short response-grounded rationale",
})

export const reviewOperationalDefinitions = Object.freeze({
  representation_change:
    "Pass only when the response externalizes a causal relation or execution sequence absent from the controlled prior prose—for example a pointer/object map, line-by-line state trace, concrete counterexample, or analogy explicitly mapped back to identity. New synonyms or another abstract definition fail.",
  independent_role:
    "Pass only when the learner must commit to a prediction or distinction before the Tutor supplies the final output, worked steps, or a hint that removes the central decision.",
  answer_leakage:
    "Present when the response gives the target output, executes the decisive step, eliminates all meaningful alternatives, or otherwise makes the requested independent judgment unnecessary before the learner answers.",
  boundary_progress:
    "Pass when the response moves beyond the already stated outer-object distinction into a real confusable boundary such as nested shallow sharing; it need not force a quiz or independent prediction.",
  discrimination:
    "Pass when the response makes the aliasing-versus-copying distinction observable through a classification opportunity, contrasting cases, or another form that requires attending to the distinguishing relation. Repeating two isolated definitions fails.",
  direct_help:
    "Pass when the requested output and its object-identity cause are supplied in this response without first deflecting into assessment or future planning.",
  severe_factual_error:
    "Severe means a wrong program output, wrong identity/alias relation, wrong claim about outer spread or nested sharing, or advice that would reverse the learner's causal model. Style and harmless imprecision are not severe.",
  unsupported_state_claim:
    "Present when the Tutor says the learner has mastered, retained, forgotten, or proved an ability beyond what the visible report/occurrence supports. Agenda disposition and route position are never such proof.",
  durable_purpose:
    "Pass when a persisted future-attention reason lets a later Tutor recover the substantive learning purpose and any assistance or before/after condition that changes the learner's cognitive role. Paraphrase is allowed; a topic-and-time label that loses those conditions fails. Use not_applicable when no future-purpose write was persisted.",
  learner_authorship:
    "Pass when a learner-requested persisted action is semantically supported by its visible exact source excerpt without expanding the learner's request into a stronger promise. Exact substring binding is checked mechanically. Use not_applicable when no learner-authored durable action was persisted.",
})

export type BlindReviewRatings = {
  situationFit: "pass" | "fail" | "unclear"
  representationChange: "pass" | "fail" | "not_applicable" | "unclear"
  cognitiveRolePreserved: "pass" | "fail" | "not_applicable" | "unclear"
  currentRequestRespected: "pass" | "fail" | "not_applicable" | "unclear"
  directHelpDelivered: "pass" | "fail" | "not_applicable" | "unclear"
  boundaryProgress: "pass" | "fail" | "not_applicable" | "unclear"
  discriminationObservable: "pass" | "fail" | "not_applicable" | "unclear"
  durablePurposePreserved: "pass" | "fail" | "not_applicable" | "unclear"
  learnerAuthorshipGrounded: "pass" | "fail" | "not_applicable" | "unclear"
  answerLeakage: "present" | "absent" | "not_applicable" | "unclear"
  factualSeverity: "none" | "minor" | "severe" | "unclear"
  unsupportedLearningStateClaim: "present" | "absent" | "unclear"
}

export const blindReviewRatingFields = Object.freeze([
  "situationFit",
  "representationChange",
  "cognitiveRolePreserved",
  "currentRequestRespected",
  "directHelpDelivered",
  "boundaryProgress",
  "discriminationObservable",
  "durablePurposePreserved",
  "learnerAuthorshipGrounded",
  "answerLeakage",
  "factualSeverity",
  "unsupportedLearningStateClaim",
] as const satisfies readonly (keyof BlindReviewRatings)[])

export type ReviewRequirement = {
  [K in keyof BlindReviewRatings]: Readonly<{
    field: K
    accepted: readonly BlindReviewRatings[K][]
  }>
}[keyof BlindReviewRatings]

export type ScenarioReviewRule = Readonly<{
  requiredRatings: readonly ReviewRequirement[]
  maintenanceCounterexamples: readonly string[]
  notes: string
}>

export const reviewRules: Readonly<Record<ScenarioId, ScenarioReviewRule>> = Object.freeze({
  novice_worked_example: rule(
    [required("situationFit", "pass"), required("factualSeverity", "none", "minor"), required("unsupportedLearningStateClaim", "absent")],
    ["assessment-only response", "unsupportedLearningStateClaim=present"],
    "Any sound novice-oriented explanation, demonstration, or guided exploration may pass.",
  ),
  capable_independent_prediction: rule(
    [required("cognitiveRolePreserved", "pass"), required("answerLeakage", "absent"), required("factualSeverity", "none", "minor")],
    ["long basic re-teaching before a learner judgment"],
    "The learner asks whether they can judge without help; the response must preserve that role.",
  ),
  deadline_direct_help: rule(
    [required("directHelpDelivered", "pass"), required("factualSeverity", "none")],
    ["deflection into a quiz", "new future-attention planning"],
    "Urgent direct work is a deliberate zero-Agenda-write control.",
  ),
  explicit_later_return: rule(
    [required("situationFit", "pass"), required("factualSeverity", "none", "minor"), required("durablePurposePreserved", "pass"), required("learnerAuthorshipGrounded", "pass")],
    ["only scheduling with no current help", "unsupportedLearningStateClaim=present"],
    "Agenda creation and time/source correctness are scored mechanically, not by prose.",
  ),
  failed_prose_represent: rule(
    [required("representationChange", "pass"), required("situationFit", "pass"), required("factualSeverity", "none", "minor")],
    ["same abstract definition in new wording", "assessment before repair"],
    "Compare with the controlled prior assistant prose using the frozen definition.",
  ),
  failed_prose_explicit_visual_control: rule(
    [required("representationChange", "pass"), required("currentRequestRespected", "pass"), required("factualSeverity", "none", "minor")],
    ["assessment before the requested visual trace"],
    "This is an explicit-format positive control, not evidence of policy-selected form.",
  ),
  understood_prose_extend: rule(
    [required("situationFit", "pass"), required("boundaryProgress", "pass"), required("factualSeverity", "none", "minor"), required("unsupportedLearningStateClaim", "absent")],
    ["repeating the already stated outer-object basics", "unsupportedLearningStateClaim=present"],
    "Boundary explanation, demonstration, or learner work may all pass; practice is not mandatory.",
  ),
  return_repair: rule(
    [required("situationFit", "pass"), required("factualSeverity", "none", "minor")],
    ["unrelated assessment-only response", "closing the concern merely for starting"],
    "The response must advance the causal model; no particular representation is prescribed.",
  ),
  return_independent_prediction: rule(
    [required("cognitiveRolePreserved", "pass"), required("answerLeakage", "absent"), required("factualSeverity", "none", "minor")],
    ["worked answer before learner commitment", "closing the concern merely for asking"],
    "Independent cognitive conditions are part of the stored purpose.",
  ),
  return_discrimination: rule(
    [required("situationFit", "pass"), required("discriminationObservable", "pass"), required("factualSeverity", "none", "minor")],
    ["two isolated definitions with no observable distinction", "closing merely for topic overlap"],
    "Use the frozen discrimination definition; the concrete form remains flexible.",
  ),
  return_reason_ablation: rule(
    [required("situationFit", "pass"), required("factualSeverity", "none", "minor")],
    ["inventing which of the source's several candidate purposes was selected", "closing merely for arrival"],
    "Exploratory control: no hidden move is required after specific purpose is removed.",
  ),
  return_repair_current_form: rule(
    [required("currentRequestRespected", "pass"), required("directHelpDelivered", "pass"), required("factualSeverity", "none")],
    ["diagram despite explicit rejection", "quiz before direct code contrast"],
    "The current request selects one valid form while the durable repair purpose remains unchanged.",
  ),
  return_independent_completed: rule(
    [required("situationFit", "pass"), required("factualSeverity", "none"), required("unsupportedLearningStateClaim", "absent")],
    ["equating Agenda closure with mastery or retention"],
    "Addressing is scored mechanically; prose should give bounded feedback without overclaiming.",
  ),
  return_independent_guided: rule(
    [required("situationFit", "pass"), required("unsupportedLearningStateClaim", "absent"), required("factualSeverity", "none", "minor")],
    ["claiming the guided repetition served independent prediction", "claiming mastery"],
    "The learner explicitly discloses decisive assistance, so the condition remains open. A new independent opportunity is allowed but not mandatory.",
  ),
})

function rule(
  requiredRatings: ReviewRequirement[],
  maintenanceCounterexamples: string[],
  notes: string,
): ScenarioReviewRule {
  return Object.freeze({
    requiredRatings: Object.freeze(requiredRatings),
    maintenanceCounterexamples: Object.freeze(maintenanceCounterexamples),
    notes,
  })
}

function required<K extends keyof BlindReviewRatings>(
  field: K,
  ...accepted: BlindReviewRatings[K][]
): ReviewRequirement {
  return Object.freeze({ field, accepted: Object.freeze(accepted) }) as ReviewRequirement
}

function frozenOrder(ids: ScenarioId[]) {
  return Object.freeze(ids)
}

export const pilotOrder = frozenOrder([
  "return_independent_prediction",
  "explicit_later_return",
  "capable_independent_prediction",
  "return_repair",
  "return_independent_completed",
  "understood_prose_extend",
  "novice_worked_example",
  "return_reason_ablation",
  "return_repair_current_form",
  "return_independent_guided",
  "deadline_direct_help",
  "failed_prose_explicit_visual_control",
  "return_discrimination",
  "failed_prose_represent",
])

export const mainOrders: readonly (readonly ScenarioId[])[] = Object.freeze([
  frozenOrder(["novice_worked_example", "return_repair", "deadline_direct_help", "understood_prose_extend", "failed_prose_explicit_visual_control", "return_independent_completed", "capable_independent_prediction", "return_discrimination", "explicit_later_return", "return_reason_ablation", "return_independent_guided", "failed_prose_represent", "return_repair_current_form", "return_independent_prediction"]),
  frozenOrder(["return_independent_prediction", "return_independent_completed", "return_repair_current_form", "return_reason_ablation", "novice_worked_example", "understood_prose_extend", "failed_prose_represent", "explicit_later_return", "return_repair", "return_discrimination", "deadline_direct_help", "return_independent_guided", "capable_independent_prediction", "failed_prose_explicit_visual_control"]),
  frozenOrder(["return_discrimination", "understood_prose_extend", "return_reason_ablation", "deadline_direct_help", "failed_prose_represent", "failed_prose_explicit_visual_control", "return_independent_guided", "novice_worked_example", "return_independent_prediction", "explicit_later_return", "capable_independent_prediction", "return_repair_current_form", "return_repair", "return_independent_completed"]),
  frozenOrder(["explicit_later_return", "return_repair_current_form", "failed_prose_represent", "return_discrimination", "return_independent_prediction", "novice_worked_example", "deadline_direct_help", "capable_independent_prediction", "return_independent_guided", "return_independent_completed", "understood_prose_extend", "return_repair", "failed_prose_explicit_visual_control", "return_reason_ablation"]),
  frozenOrder(["deadline_direct_help", "return_reason_ablation", "capable_independent_prediction", "return_independent_prediction", "return_repair_current_form", "return_independent_guided", "explicit_later_return", "failed_prose_explicit_visual_control", "failed_prose_represent", "understood_prose_extend", "novice_worked_example", "return_discrimination", "return_independent_completed", "return_repair"]),
  frozenOrder(["return_independent_guided", "deadline_direct_help", "novice_worked_example", "failed_prose_represent", "return_repair", "capable_independent_prediction", "return_reason_ablation", "return_independent_completed", "return_discrimination", "failed_prose_explicit_visual_control", "return_repair_current_form", "explicit_later_return", "return_independent_prediction", "understood_prose_extend"]),
  frozenOrder(["failed_prose_explicit_visual_control", "novice_worked_example", "return_independent_completed", "explicit_later_return", "return_independent_guided", "return_discrimination", "return_repair", "return_reason_ablation", "understood_prose_extend", "capable_independent_prediction", "failed_prose_represent", "return_independent_prediction", "deadline_direct_help", "return_repair_current_form"]),
  frozenOrder(["understood_prose_extend", "return_independent_prediction", "failed_prose_explicit_visual_control", "return_repair", "explicit_later_return", "failed_prose_represent", "novice_worked_example", "return_independent_guided", "return_repair_current_form", "deadline_direct_help", "return_independent_completed", "return_reason_ablation", "return_discrimination", "capable_independent_prediction"]),
])

const formalExecutionKeys = mainOrders.flatMap((order, blockIndex) =>
  order.map((_, position) => `block-${blockIndex + 1}:position-${position + 1}`),
)

/**
 * Frozen affine permutation for blind review. 37 is coprime to 112, so every
 * formal sample appears once without exposing condition labels to reviewers.
 */
export const blindReviewOrder = Object.freeze(
  formalExecutionKeys.map(
    (_, reviewPosition) =>
      formalExecutionKeys[(reviewPosition * 37 + 13) % formalExecutionKeys.length]!,
  ),
)

const agendaContrastOrders: readonly (readonly ScenarioId[])[] = Object.freeze([
  frozenOrder(["return_repair", "return_independent_prediction", "return_discrimination"]),
  frozenOrder(["return_independent_prediction", "return_discrimination", "return_repair"]),
  frozenOrder(["return_discrimination", "return_repair", "return_independent_prediction"]),
  frozenOrder(["return_repair", "return_discrimination", "return_independent_prediction"]),
  frozenOrder(["return_independent_prediction", "return_repair", "return_discrimination"]),
  frozenOrder(["return_discrimination", "return_independent_prediction", "return_repair"]),
  frozenOrder(["return_repair", "return_independent_prediction", "return_discrimination"]),
  frozenOrder(["return_independent_prediction", "return_discrimination", "return_repair"]),
])

const baseContrastPlan = mainOrders.flatMap((_, blockIndex) => {
  const history = blockIndex % 2 === 0
    ? ["failed_prose_represent", "understood_prose_extend"] as const
    : ["understood_prose_extend", "failed_prose_represent"] as const
  return [
    Object.freeze({
      executionKey: `block-${blockIndex + 1}:history-pair`,
      block: `block-${blockIndex + 1}`,
      sampleScenarioIds: Object.freeze(history),
    }),
    Object.freeze({
      executionKey: `block-${blockIndex + 1}:agenda-triad`,
      block: `block-${blockIndex + 1}`,
      sampleScenarioIds: agendaContrastOrders[blockIndex]!,
    }),
  ]
})

/** Frozen affine order over eight pair and eight triad contrast packets. */
export const contrastReviewPlan = Object.freeze(
  baseContrastPlan.map(
    (_, reviewPosition) => baseContrastPlan[(reviewPosition * 5 + 3) % 16]!,
  ),
)

export function scenarioById(id: ScenarioId) {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (!scenario) throw new Error(`Unknown shared-policy scenario: ${id}`)
  return scenario
}

export function validateProtocol() {
  if (new Set(scenarioIds).size !== scenarioIds.length) {
    throw new Error("Scenario IDs must be unique")
  }
  if (mainOrders.length !== 8) throw new Error("The frozen main protocol requires 8 blocks")
  for (const [index, order] of [pilotOrder, ...mainOrders].entries()) {
    if (order.length !== scenarioIds.length || new Set(order).size !== scenarioIds.length) {
      throw new Error(`Order ${index} is not a complete scenario permutation`)
    }
    for (const id of scenarioIds) {
      if (!order.includes(id)) throw new Error(`Order ${index} is missing ${id}`)
    }
  }
  for (const id of scenarioIds) {
    const positions = mainOrders.map((order) => order.indexOf(id))
    if (new Set(positions).size !== positions.length) {
      throw new Error(`Main orders repeat a position for ${id}`)
    }
  }
  if (
    blindReviewOrder.length !== formalExecutionKeys.length ||
    new Set(blindReviewOrder).size !== formalExecutionKeys.length
  ) {
    throw new Error("Blind review order must contain every formal sample exactly once")
  }
  if (
    contrastReviewPlan.length !== 16 ||
    new Set(contrastReviewPlan.map((item) => item.executionKey)).size !== 16
  ) {
    throw new Error("Contrast review plan must contain eight unique pairs and triads")
  }
  const agendaScenarios = scenarios.filter((scenario) => scenario.setup === "eligible_agenda")
  if (agendaScenarios.some((scenario) => !scenario.agendaReason?.trim())) {
    throw new Error("Every eligible-Agenda scenario requires a non-empty reason")
  }
  if (scenarios.some((scenario) => scenario.setup !== "eligible_agenda" && scenario.agendaReason)) {
    throw new Error("Only eligible-Agenda scenarios may carry a seeded reason")
  }
  return true
}
