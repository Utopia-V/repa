import type { ModelMessage } from "ai"
import {
  BudgetTracker,
  deepSeekRunConfig,
  loadApiKey,
  persistLocalRun,
  runTutorScenario,
  simulateLearner,
  type RunConfig,
  type Scenario,
  type ScenarioTrace,
} from "./lab"

const deepSeekV4Flash: RunConfig = { model: "deepseek-v4-flash", thinking: "disabled" }

const scriptedScenarios: Scenario[] = [
  {
    id: "casual-clarification",
    description: "An ordinary conceptual question must remain ordinary Session history.",
    context: {
      interactionKind: "ordinary_clarification",
      sourceRef: "session-item:clarification-1",
      target: "algebra-equation-transform",
    },
    messages: [
      {
        role: "user",
        content: "我只是临时问一下：为什么解方程时把一项移到等号另一边通常要变号？请直接解释。",
      },
    ],
    expectation: { kind: "no_learning_write" },
  },
  {
    id: "selected-explanation",
    description: "A selected explanation creates verification work but no formal result.",
    context: {
      interactionKind: "selected_explanation",
      sourceRef: "session-item:explanation-1",
      target: "fraction-division-reciprocal",
      activityContract: { onCompletion: "verification_obligation" },
    },
    messages: [
      {
        role: "user",
        content: "这是一次明确选择的学习活动。请讲清楚为什么除以一个分数等于乘它的倒数。",
      },
    ],
    expectation: {
      kind: "verification_without_result",
      target: "fraction-division-reciprocal",
    },
  },
  {
    id: "formal-miss",
    description: "A formal independent miss produces a source-linked result and targeted review.",
    context: {
      interactionKind: "formal_assessment_result",
      sourceRef: "session-item:answer-linear-1",
      target: "linear-equation-distribution",
      task: {
        taskId: "task-linear-1",
        attemptId: "attempt-linear-1",
        expectedAnswer: "x = 5",
        assistance: "none",
      },
    },
    messages: [
      {
        role: "assistant",
        content: "正式检验：独立求解 2(x - 1) = 8，并写出 x。",
      },
      {
        role: "user",
        content: "2x - 1 = 8，所以 2x = 9，x = 4.5。",
      },
    ],
    expectation: {
      kind: "formal_result",
      target: "linear-equation-distribution",
      outcome: "incorrect",
      assistance: "none",
      obligation: "targeted_review",
    },
  },
  {
    id: "hinted-success",
    description: "A correct answer after a hint preserves assistance and requests verification.",
    context: {
      interactionKind: "formal_assessment_result",
      sourceRef: "session-item:answer-offset-1",
      target: "page-offset-bits",
      task: {
        taskId: "task-offset-1",
        attemptId: "attempt-offset-1",
        expectedAnswer: "12 bits",
        assistance: "hint",
      },
    },
    messages: [
      {
        role: "assistant",
        content: "检验：页大小是 4 KiB，页内偏移需要多少位？提示：4 KiB = 2^12 bytes。",
      },
      {
        role: "user",
        content: "根据提示，低 12 位是页内偏移，所以答案是 12 位。",
      },
    ],
    expectation: {
      kind: "formal_result",
      target: "page-offset-bits",
      outcome: "correct",
      assistance: "hint",
      obligation: "verification",
    },
  },
  {
    id: "interpretation-correction",
    description: "A provenance-bearing answer-key correction retracts prior evidence without duplicating the result.",
    context: {
      interactionKind: "correction",
      sourceRef: "session-item:correction-1",
      target: "determinant-sign",
      interpretationId: "evidence:attempt-det-1:rule-v1",
    },
    messages: [
      {
        role: "user",
        content:
          "核对原题后发现参考答案抄错了：我之前的答案其实正确。请撤回 evidence:attempt-det-1:rule-v1 对我的负面解释，不要新建一次答题记录。",
      },
    ],
    expectation: {
      kind: "correction",
      interpretationId: "evidence:attempt-det-1:rule-v1",
    },
  },
]

async function runScripted(config: RunConfig) {
  const apiKey = await loadApiKey()
  const budget = new BudgetTracker()
  const traces: ScenarioTrace[] = []
  for (const scenario of scriptedScenarios) {
    traces.push(await runTutorScenario({ apiKey, config, scenario, budget }))
  }
  return {
    suite: "scripted",
    config,
    passed: traces.every((trace) => trace.passed),
    traces,
    budget: budgetSummary(budget),
  }
}

async function runDual(tutorConfig: RunConfig) {
  const apiKey = await loadApiKey()
  const budget = new BudgetTracker()
  const studentConfig = deepSeekV4Flash
  const cases = [
    {
      id: "dual-misconception",
      description: "A model learner demonstrates a controlled equation-transformation misconception.",
      task: "正式检验：独立求解 3x + 5 = 17，写出步骤和 x。",
      profile:
        "你诚实且认真，但稳定地误以为把 +5 移到等号右侧仍然是 +5。按这个误解完成题目，不要自行发现或修正错误。",
      context: {
        interactionKind: "formal_assessment_result",
        sourceRef: "session-item:dual-answer-1",
        target: "linear-equation-sign",
        task: {
          taskId: "task-dual-linear-1",
          attemptId: "attempt-dual-linear-1",
          expectedAnswer: "x = 4",
          assistance: "none",
        },
      } as const,
      expectation: {
        kind: "formal_result",
        target: "linear-equation-sign",
        outcome: "incorrect",
        assistance: "none",
        obligation: "targeted_review",
      } as const,
    },
    {
      id: "dual-assisted",
      description: "A model learner answers correctly after an explicit hint.",
      task: "检验：4 KiB 页大小对应多少页内偏移位？提示：4 KiB = 2^12 bytes。",
      profile:
        "你刚才不会，但看到了题目中的提示并据此得到正确答案。明确说出自己使用了提示，简短作答。",
      context: {
        interactionKind: "formal_assessment_result",
        sourceRef: "session-item:dual-answer-2",
        target: "page-offset-bits",
        task: {
          taskId: "task-dual-offset-1",
          attemptId: "attempt-dual-offset-1",
          expectedAnswer: "12 bits",
          assistance: "hint",
        },
      } as const,
      expectation: {
        kind: "formal_result",
        target: "page-offset-bits",
        outcome: "correct",
        assistance: "hint",
        obligation: "verification",
      } as const,
    },
  ]

  const traces: Array<{
    id: string
    student: Awaited<ReturnType<typeof simulateLearner>>
    tutor: ScenarioTrace
  }> = []

  for (const item of cases) {
    const student = await simulateLearner({
      apiKey,
      config: studentConfig,
      task: item.task,
      profile: item.profile,
      budget,
    })
    const messages: ModelMessage[] = [
      { role: "assistant", content: item.task },
      { role: "user", content: student.text },
    ]
    const scenario: Scenario = {
      id: item.id,
      description: item.description,
      context: item.context,
      messages,
      expectation: item.expectation,
    }
    const tutor = await runTutorScenario({
      apiKey,
      config: tutorConfig,
      scenario,
      budget,
    })
    traces.push({ id: item.id, student, tutor })
  }

  return {
    suite: "dual",
    tutorConfig,
    studentConfig,
    passed: traces.every((trace) => trace.tutor.passed),
    traces,
    budget: budgetSummary(budget),
  }
}

function budgetSummary(budget: BudgetTracker) {
  return {
    apiSteps: budget.apiSteps,
    estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
    configuredMaxUsd: budget.maxUsd,
  }
}

const suite = process.argv[2] ?? "scripted"
const config = deepSeekRunConfig(process.argv[3])
const report =
  suite === "scripted"
    ? await runScripted(config)
    : suite === "dual"
      ? await runDual(config)
      : (() => {
          throw new Error(`Unknown suite: ${suite}`)
        })()

const rawTracePath = await persistLocalRun({ suite, config, report })
console.log(JSON.stringify({ rawTracePath, ...report }, null, 2))
