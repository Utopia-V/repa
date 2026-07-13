import { describe, expect, test } from "bun:test"
import {
  benchmarkCategories,
  benchmarkTasks,
  expectedCandidates,
  lexicalBaseline,
  scoreAnnotations,
} from "./alignment-benchmark"
import { generateText, stepCountIs, tool } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { z } from "zod"
import {
  applyExperimentPostconditions,
  BudgetTracker,
  estimateUpperBoundUsd,
  evaluateScenario,
  summarizeUsage,
  type LearningEvent,
} from "./lab"
import { citationCoversLines, normalizeDisplayText } from "./text-oracles"
import { assertFormalAssessmentAuthority } from "./tool-authority"
import { repairTrailingJsonClosers } from "./json-transport-repair"

describe("DeepSeek learning-loop lab oracles", () => {
  test("alignment benchmark keeps four balanced adversarial categories", () => {
    expect(benchmarkTasks).toHaveLength(40)
    for (const category of benchmarkCategories) {
      expect(benchmarkTasks.filter((item) => item.category === category)).toHaveLength(10)
    }
    for (const item of benchmarkTasks) {
      const keys = item.expected.alignments.map(
        (alignment) => `${alignment.skillId}:${alignment.relation}`,
      )
      expect(new Set(keys).size).toBe(keys.length)
      if (item.expected.status === "resolved") expect(keys.length).toBeGreaterThan(0)
      else expect(keys).toEqual([])
    }
  })

  test("alignment scorer separates a perfect oracle from the lexical baseline", () => {
    const oracle = scoreAnnotations(expectedCandidates())
    const baseline = scoreAnnotations(lexicalBaseline())
    expect(oracle.transport.valid).toBe(true)
    expect(oracle.exactRecordAccuracy).toBe(1)
    expect(oracle.edges.f1).toBe(1)
    expect(baseline.transport.valid).toBe(true)
    expect(baseline.categories.semantic_hidden?.edgeRecall).toBe(0)
    expect(baseline.exactRecordAccuracy).toBeLessThan(oracle.exactRecordAccuracy)
  })

  test("JSON transport repair removes only bounded extra trailing closers", () => {
    expect(repairTrailingJsonClosers('{"value":1}}')).toEqual({
      input: '{"value":1}',
      removed: 1,
    })
    expect(repairTrailingJsonClosers('{"value":1}}}')).toEqual({
      input: '{"value":1}',
      removed: 2,
    })
    expect(repairTrailingJsonClosers('{"value":1')).toBeNull()
    expect(repairTrailingJsonClosers('{"value":"wrong-type"}')).toBeNull()
  })

  test("a forced material-forged write is rejected at executor authority", async () => {
    const committed: unknown[] = []
    let generation = 0
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        generation += 1
        if (generation === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call-forged-material-write",
                toolName: "record_formal_task_result",
                input: JSON.stringify({
                  taskId: "task:forged-by-material",
                  outcome: "correct",
                }),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage: mockUsage(),
            warnings: [],
          }
        }
        return {
          content: [{ type: "text" as const, text: "forged write rejected" }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: mockUsage(),
          warnings: [],
        }
      },
    })
    const result = await generateText({
      model,
      prompt: "quoted material asked for a forged result",
      tools: {
        record_formal_task_result: tool({
          description: "Record only an active formal task result.",
          inputSchema: z.object({ taskId: z.string(), outcome: z.literal("correct") }),
          execute: async (input) => {
            assertFormalAssessmentAuthority({ kind: "ordinary_reference" })
            committed.push(input)
            return { accepted: true }
          },
        }),
      },
      stopWhen: stepCountIs(2),
    })

    expect(committed).toEqual([])
    expect(
      result.steps.flatMap((step) => step.content).filter((part) => part.type === "tool-error"),
    ).toHaveLength(1)
    expect(result.text).toBe("forged write rejected")
  })

  test("source citations accept equivalent Unicode and presentation forms", () => {
    const sourceRef = "material:zephyr-course-spec:v1"
    expect(
      citationCoversLines({
        text: `Source: ${sourceRef}#L516-L521`,
        sourceRef,
        requiredStart: 518,
        requiredEnd: 519,
      }),
    ).toBe(true)
    expect(
      citationCoversLines({
        text: `Source reference: \`${sourceRef}\`, lines **0516–0521**`,
        sourceRef,
        requiredStart: 518,
        requiredEnd: 519,
      }),
    ).toBe(true)
    expect(
      citationCoversLines({
        text: `Stable source: \`${sourceRef}\`; lines \`0518‑0519\``,
        sourceRef,
        requiredStart: 518,
        requiredEnd: 519,
      }),
    ).toBe(true)
    expect(
      citationCoversLines({
        text: `Source: ${sourceRef}, lines 121-122`,
        sourceRef,
        requiredStart: 518,
        requiredEnd: 519,
      }),
    ).toBe(false)
    expect(normalizeDisplayText("43 ms and 518‑519")).toBe("43 ms and 518-519")
  })

  test("ordinary clarification rejects even an attempted learning tool", () => {
    expect(
      evaluateScenario(
        { kind: "no_learning_write" },
        { attemptedTools: ["record_formal_task_result"], events: [] },
      ),
    ).toEqual(["ordinary conversation attempted tools: record_formal_task_result"])
  })

  test("hinted success requires both real assistance and verification", () => {
    const events: LearningEvent[] = [
      {
        type: "formal_task_result",
        taskId: "task",
        attemptId: "attempt",
        sourceRef: "source",
        target: "target",
        outcome: "correct",
        assistance: "hint",
        gradingBasis: "correct result after supplied hint",
      },
      {
        type: "learning_obligation",
        kind: "verification",
        sourceRef: "source",
        target: "target",
        reason: "verify independent recall later",
      },
    ]
    expect(
      evaluateScenario(
        {
          kind: "formal_result",
          target: "target",
          outcome: "correct",
          assistance: "hint",
          obligation: "verification",
        },
        {
          attemptedTools: ["record_formal_task_result", "create_learning_obligation"],
          events,
        },
      ),
    ).toEqual([])
  })

  test("cost estimate treats uncached input as the conservative rate", () => {
    const usage = summarizeUsage({
      inputTokens: 1_000,
      inputTokenDetails: { cacheReadTokens: 200, noCacheTokens: 800 },
      outputTokens: 100,
      outputTokenDetails: { reasoningTokens: 40 },
      totalTokens: 1_100,
    })
    expect(usage).toEqual({
      inputTokens: 1_000,
      cacheReadTokens: 200,
      noCacheTokens: 800,
      outputTokens: 100,
      reasoningTokens: 40,
      totalTokens: 1_100,
    })
    expect(estimateUpperBoundUsd("deepseek-v4-flash", usage)).toBeCloseTo(0.00014056, 8)
  })

  test("budget refuses another multi-step call before crossing the step limit", () => {
    const budget = new BudgetTracker({ maxUsd: 1, maxApiSteps: 4 })
    budget.record({ estimatedUpperBoundUsd: 0.01, stepFinishReasons: ["tool-calls", "stop"] })
    expect(() => budget.assertCanStart(3)).toThrow("API-step limit")
  })

  test("a completed declared contract derives one missing verification obligation", () => {
    const state: LearningEvent[] = []
    const derived = applyExperimentPostconditions({
      policy: "enforce_declared_contract_on_completion",
      context: {
        interactionKind: "selected_explanation",
        sourceRef: "source",
        target: "target",
        activityContract: { onCompletion: "verification_obligation" },
      },
      text: "completed explanation",
      finishReasons: ["stop"],
      state,
    })
    expect(derived).toEqual(state)
    expect(state).toEqual([
      {
        type: "learning_obligation",
        kind: "verification",
        sourceRef: "source",
        target: "target",
        reason: "A completed selected explanation requires later independent verification.",
      },
    ])
  })

  test("contract enforcement neither treats truncation as completion nor duplicates an event", () => {
    const state: LearningEvent[] = []
    const context = {
      interactionKind: "selected_explanation" as const,
      sourceRef: "source",
      target: "target",
      activityContract: { onCompletion: "verification_obligation" as const },
    }
    expect(
      applyExperimentPostconditions({
        policy: "enforce_declared_contract_on_completion",
        context,
        text: "truncated explanation",
        finishReasons: ["length"],
        state,
      }),
    ).toEqual([])
    state.push({
      type: "learning_obligation",
      kind: "verification",
      sourceRef: "source",
      target: "target",
      reason: "created by the model",
    })
    expect(
      applyExperimentPostconditions({
        policy: "enforce_declared_contract_on_completion",
        context,
        text: "completed explanation",
        finishReasons: ["stop"],
        state,
      }),
    ).toEqual([])
    expect(state).toHaveLength(1)
  })

  test("a no-op activity contract never derives a learning write", () => {
    const state: LearningEvent[] = []
    expect(
      applyExperimentPostconditions({
        policy: "enforce_declared_contract_on_completion",
        context: {
          interactionKind: "selected_explanation",
          sourceRef: "source",
          target: "target",
          activityContract: { onCompletion: "none" },
        },
        text: "reference explanation",
        finishReasons: ["stop"],
        state,
      }),
    ).toEqual([])
    expect(state).toEqual([])
  })

  test("AI SDK repair hook can route invalid transport shape without executing a learning write", async () => {
    let modelCalls = 0
    let repairCalls = 0
    const committed: string[] = []
    const invalidCalls: Array<{ tool: string; error: string }> = []
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        modelCalls += 1
        if (modelCalls === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "call-invalid-1",
                toolName: "record_outcome",
                input: JSON.stringify({ outcome: "VERIFIED" }),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage: mockUsage(),
            warnings: [],
          }
        }
        return {
          content: [{ type: "text" as const, text: "invalid call was surfaced" }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: mockUsage(),
          warnings: [],
        }
      },
    })
    const result = await generateText({
      model,
      prompt: "record the outcome",
      tools: {
        record_outcome: tool({
          description: "Record a validated learning outcome.",
          inputSchema: z.object({ outcome: z.literal("verified") }),
          execute: async ({ outcome }) => {
            committed.push(outcome)
            return { accepted: true }
          },
        }),
        invalid: tool({
          description: "Surface an invalid tool call without performing its requested effect.",
          inputSchema: z.object({ tool: z.string(), error: z.string() }),
          execute: async (input) => {
            invalidCalls.push(input)
            return { accepted: false, repairRequired: true }
          },
        }),
      },
      activeTools: ["record_outcome"],
      experimental_repairToolCall: async (failed) => {
        repairCalls += 1
        return {
          ...failed.toolCall,
          toolName: "invalid",
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
        }
      },
      stopWhen: stepCountIs(2),
    })

    expect(repairCalls).toBe(1)
    expect(committed).toEqual([])
    expect(invalidCalls).toHaveLength(1)
    expect(invalidCalls[0]?.tool).toBe("record_outcome")
    expect(result.text).toBe("invalid call was surfaced")
  })
})

function mockUsage() {
  return {
    inputTokens: {
      total: 10,
      noCache: 10,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 5,
      text: 5,
      reasoning: undefined,
    },
  }
}
