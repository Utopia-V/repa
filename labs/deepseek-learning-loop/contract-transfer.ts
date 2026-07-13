import {
  BudgetTracker,
  deepSeekRunConfig,
  loadApiKey,
  persistLocalRun,
  runTutorScenario,
  type ExperimentPolicy,
  type RunConfig,
  type Scenario,
} from "./lab"

const config: RunConfig = deepSeekRunConfig(process.argv[2])

const cases: Scenario[] = [
  {
    id: "learn-and-retain",
    description: "A selected explanation intended for learning declares later verification.",
    context: {
      interactionKind: "selected_explanation",
      sourceRef: "session-item:contract-learn-1",
      target: "binary-search-invariant",
      activityContract: { onCompletion: "verification_obligation" },
    },
    messages: [
      {
        role: "user",
        content: "我正在正式学习二分查找。请解释循环不变量；之后需要确认我能独立说出来。",
      },
    ],
    expectation: { kind: "verification_without_result", target: "binary-search-invariant" },
  },
  {
    id: "reference-only",
    description: "The same explanation shape is requested only as a reference artifact.",
    context: {
      interactionKind: "selected_explanation",
      sourceRef: "session-item:contract-reference-1",
      target: "binary-search-invariant",
      activityContract: { onCompletion: "none" },
    },
    messages: [
      {
        role: "user",
        content: "请给我一段关于二分查找循环不变量的准确说明，我要原样转发给同学。",
      },
    ],
    expectation: { kind: "no_learning_write" },
  },
  {
    id: "learning-without-keyword",
    description: "A verification contract transfers even when the request omits testing vocabulary.",
    context: {
      interactionKind: "selected_explanation",
      sourceRef: "session-item:contract-transfer-1",
      target: "chain-rule-composition",
      activityContract: { onCompletion: "verification_obligation" },
    },
    messages: [
      {
        role: "user",
        content: "我们进入链式法则这一段。先从函数复合的角度给我讲明白。",
      },
    ],
    expectation: { kind: "verification_without_result", target: "chain-rule-composition" },
  },
]

const policies: ExperimentPolicy[] = [
  "model_discretion",
  "enforce_declared_contract_on_completion",
]
const apiKey = await loadApiKey()
const budget = new BudgetTracker()
const traces = []

for (const scenario of cases) {
  for (const experimentPolicy of policies) {
    traces.push(
      await runTutorScenario({
        apiKey,
        config,
        scenario,
        budget,
        experimentPolicy,
        maxOutputTokens: 1_300,
      }),
    )
  }
}

const report = {
  suite: "activity-contract-transfer",
  config,
  passed: traces.every((trace) => trace.passed),
  traces,
  budget: {
    apiSteps: budget.apiSteps,
    estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
    configuredMaxUsd: budget.maxUsd,
  },
}
const rawTracePath = await persistLocalRun({ suite: report.suite, config, report })
console.log(JSON.stringify({ rawTracePath, ...report }, null, 2))
