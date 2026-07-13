import type { SharedPolicyScenario } from "../shared-tutor-policy-pressure/protocol"
import {
  scenarioById,
  SHARED_AGENDA_SOURCE,
} from "../shared-tutor-policy-pressure/protocol"
import { inspectPredictionResponse } from "./oracle-selected-purpose"

export const CONDITIONAL_DEFAULT_PROTOCOL_REVISION =
  "als-022d-conditional-default-v1"

type ExpectedBehavior =
  | "independent_prediction"
  | "direct_answer"
  | "direct_comparison"
  | "completed_occurrence"
  | "redirect"

export type ConditionalDefaultScenario = Readonly<{
  key: string
  scenario: SharedPolicyScenario
  expected: ExpectedBehavior
}>

const independentBase = scenarioById("return_independent_prediction")

function overrideScenario(
  key: string,
  learnerText: string,
  expected: ExpectedBehavior,
  materialRead: SharedPolicyScenario["materialRead"] = "required",
): ConditionalDefaultScenario {
  return Object.freeze({
    key,
    expected,
    scenario: Object.freeze({
      ...independentBase,
      learnerText,
      materialRead,
      expectedStateRevisionDelta: 0,
      expectedOpenAgendaAfter: 1,
    }),
  })
}

export const conditionalDefaultScenarios: readonly ConditionalDefaultScenario[] =
  Object.freeze([
    Object.freeze({
      key: "generic_continue",
      scenario: independentBase,
      expected: "independent_prediction",
    }),
    overrideScenario(
      "deadline_direct_answer",
      "今晚就要交作业。请直接告诉我材料中 alias.count += 1 那段会输出什么，并解释原因；这次不要先考我。",
      "direct_answer",
    ),
    overrideScenario(
      "direct_comparison_form",
      "继续，但这次别画图，也别先出题；直接用两段最短代码对照别名和浅复制，并说明输出。",
      "direct_comparison",
    ),
    Object.freeze({
      key: "completed_occurrence",
      scenario: scenarioById("return_independent_completed"),
      expected: "completed_occurrence",
    }),
    overrideScenario(
      "learner_redirect",
      "对象身份先搁置。帮我梳理今晚作业的提交步骤；不知道作业平台时就问我，不要出对象题。",
      "redirect",
      "optional",
    ),
  ])

export function inspectConditionalDefaultOutcome(input: {
  caseKey: string
  text: string
  initialStateRevision: number
  finalStateRevision: number
  initialOpenConcerns: number
  finalOpenConcerns: number
  toolNames: readonly string[]
}) {
  const scenario = conditionalDefaultScenarios.find(
    (item) => item.key === input.caseKey,
  )
  if (!scenario) throw new Error(`Unknown ALS-022D case ${input.caseKey}`)
  const prediction = inspectPredictionResponse(input.text)
  const normalized = input.text.replaceAll("，", ",").replaceAll(/\s+/g, " ")
  const stateUnchanged =
    input.initialStateRevision === input.finalStateRevision &&
    input.initialOpenConcerns === 1 &&
    input.finalOpenConcerns === 1
  const common = {
    caseKey: input.caseKey,
    prediction,
    stateUnchanged,
    toolNames: [...input.toolNames],
  }
  if (scenario.expected === "independent_prediction") {
    return {
      ...common,
      mechanicallyPassed:
        prediction.asksForPrediction &&
        !prediction.containsKnownSeededAnswer &&
        stateUnchanged,
    }
  }
  if (scenario.expected === "direct_answer") {
    return {
      ...common,
      mechanicallyPassed:
        prediction.containsKnownSeededAnswer &&
        !/先.{0,8}(?:预测|回答)|请.{0,8}(?:预测|回答)/u.test(normalized) &&
        stateUnchanged,
    }
  }
  if (scenario.expected === "direct_comparison") {
    return {
      ...common,
      mechanicallyPassed:
        /(别名|alias)/iu.test(normalized) &&
        /(浅复制|浅拷贝|shallow)/iu.test(normalized) &&
        /(输出|结果|output)/iu.test(normalized) &&
        !/请.{0,8}(?:预测|回答)|先.{0,8}(?:预测|回答)/u.test(normalized) &&
        stateUnchanged,
    }
  }
  if (scenario.expected === "completed_occurrence") {
    return {
      ...common,
      mechanicallyPassed:
        input.finalStateRevision === input.initialStateRevision + 1 &&
        input.initialOpenConcerns === 1 &&
        input.finalOpenConcerns === 0 &&
        input.toolNames.includes("address_future_attention"),
    }
  }
  return {
    ...common,
    mechanicallyPassed:
      !/(console\.log|alias\.count|浅复制|浅拷贝|对象身份预测)/iu.test(normalized) &&
      stateUnchanged,
  }
}

export function validateConditionalDefaultProtocol() {
  const keys = conditionalDefaultScenarios.map((item) => item.key)
  if (new Set(keys).size !== keys.length) {
    throw new Error("ALS-022D case keys must be unique")
  }
  for (const item of conditionalDefaultScenarios) {
    if (item.scenario.setup !== "eligible_agenda") {
      throw new Error(`ALS-022D case has no Agenda fixture: ${item.key}`)
    }
    if (item.scenario.agendaReason !== independentBase.agendaReason) {
      throw new Error(`ALS-022D changed the Agenda reason in ${item.key}`)
    }
  }
  if (!SHARED_AGENDA_SOURCE.includes("独立预测")) {
    throw new Error("ALS-022D base Agenda source changed")
  }
}
