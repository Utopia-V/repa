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

const scenario: Scenario = {
  id: "selected-explanation-ablation",
  description:
    "Compare discretionary model tool choice with a generic harness-enforced first tool call.",
  context: {
    interactionKind: "selected_explanation",
    sourceRef: "session-item:explanation-ablation-1",
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
}

const apiKey = await loadApiKey()
const budget = new BudgetTracker()
const policies: ExperimentPolicy[] = [
  "model_discretion",
  ...(config.thinking === "disabled" ? (["force_required_tool_first"] as const) : []),
  "enforce_declared_contract_on_completion",
]
const traces = []

for (const experimentPolicy of policies) {
  traces.push(
    await runTutorScenario({
      apiKey,
      config,
      scenario,
      budget,
      experimentPolicy,
      maxOutputTokens: 1_600,
    }),
  )
}

const report = {
  suite: "selected-explanation-tool-selection-ablation",
  config,
  traces,
  budget: {
    apiSteps: budget.apiSteps,
    estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
    configuredMaxUsd: budget.maxUsd,
  },
}
const rawTracePath = await persistLocalRun({ suite: report.suite, config, report })
console.log(JSON.stringify({ rawTracePath, ...report }, null, 2))
