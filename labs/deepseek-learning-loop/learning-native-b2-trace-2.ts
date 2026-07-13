import { generateText, stepCountIs, tool, type ModelMessage } from "ai"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { openLearningLab } from "../learning-native-capability/learning-layer"
import {
  executeRecordedLearningTool,
  type RecordedLearningToolEvent,
} from "../learning-native-capability/recorded-tool-runtime"
import { collectAssistantText } from "./learning-native-b2-first-trace"
import {
  BudgetTracker,
  deepSeekChatModel,
  deepSeekModelLabel,
  deepSeekRunConfig,
  estimateUpperBoundUsd,
  formatError,
  loadApiKey,
  persistLocalRun,
  summarizeUsage,
  type RunConfig,
} from "./lab"
import { fetchPinnedText } from "./pinned-material"

const MAX_STEPS = 4
const MAX_OUTPUT_TOKENS = 1_100
const MATERIAL_URL =
  "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/04-object-basics/04-object-methods/article.md"
const MATERIAL_VERSION = "52c1e61915bc8970a950a3f59bd845827e49b4bf"

type MaterialRange = "method-examples" | "this-in-methods"

export function extractObjectMethodRange(article: string, range: MaterialRange) {
  const [startHeading, endHeading] =
    range === "method-examples"
      ? ['## Method examples', '## "this" in methods']
      : ['## "this" in methods', '## "this" is not bound']
  const start = article.indexOf(startHeading)
  const end = article.indexOf(endHeading)
  if (start < 0 || end <= start) {
    throw new Error(`Pinned object-method material is missing range: ${range}`)
  }
  return article.slice(start, end).trim()
}

export function hasVisibleMethodDemonstration(text: string) {
  const definesMethod =
    /\.sayHi\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/u.test(text) ||
    /(?:^|\{|,)\s*sayHi\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/mu.test(text) ||
    /(?:^|\{|,)\s*sayHi\s*\([^)]*\)\s*\{/mu.test(text)
  const callsMethod = /\.sayHi\s*\(\s*\)/u.test(text)
  return definesMethod && callsMethod
}

export function checkDemonstration(text: string) {
  const failures: string[] = []
  if (!hasVisibleMethodDemonstration(text)) {
    failures.push("Tutor did not show both a method definition and its call")
  }
  if (/this\s*\.|this\s+(?:指向|表示|是)/u.test(text)) {
    failures.push("Tutor explained the postponed this principle during the operation step")
  }
  return failures
}

export function checkPrincipleExplanation(text: string) {
  const failures: string[] = []
  if (!/this\s*\.\s*name/u.test(text) || !/(?:当前对象|调用.{0,8}对象|点号前|student)/u.test(text)) {
    failures.push("Principle explanation did not connect this.name to the calling object")
  }
  if (/[?？]\s*$/u.test(text)) {
    failures.push("Principle explanation ended by asking a question")
  }
  if (/(?:没有.{0,8}(?:额外|其他).{0,6}规则|(?:永远|总是).{0,12}this)/u.test(text)) {
    failures.push("Principle explanation turned a bounded receiver rule into a universal claim")
  }
  return failures
}

export async function runLearningNativeTrace2(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const directory = mkdtempSync(join(tmpdir(), "repa-b2-trace-2-"))
  const databasePath = join(directory, "learning.sqlite")
  let lab: ReturnType<typeof openLearningLab>
  try {
    lab = openLearningLab(databasePath)
  } catch (error) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
    } catch {
      // Cleanup must not replace the database-open error.
    }
    throw error
  }
  let labClosed = false

  try {
    lab.apply({
      operationId: "b2:trace-2:initialize-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Understand JavaScript well enough to build and debug programs",
        sections: [
          { id: "object-methods", title: "Object methods and this", materialRef: MATERIAL_URL },
          { id: "object-references", title: "Object references and copying" },
        ],
      },
    })

    const sessionId = "b2:trace-2:session"
    const firstUserItemId = "b2:trace-2:user:operation"
    const firstUserText =
      "先让我照着做：演示如何给 student 对象写一个 sayHi 方法并调用。现在只熟悉这个操作，别解释 this 的原理，也别考我。"
    lab.appendSessionItem({
      itemId: firstUserItemId,
      sessionId,
      role: "user",
      content: firstUserText,
      at: 1_100,
    })

    const contextBefore = lab.buildCurrentContext({ now: 1_100, availableMinutes: 30 })
    let cachedArticle: string | undefined
    const materialReads: Array<{
      range: MaterialRange
      sourceRef: string
      excerpt: string
      characterCount: number
    }> = []
    const readCourseMaterial = tool({
      description:
        "Read one bounded range of the pinned object-method course material for the current action.",
      inputSchema: z.strictObject({
        courseId: z.literal("javascript"),
        sectionId: z.literal("object-methods"),
        range: z.enum(["method-examples", "this-in-methods"]),
      }),
      execute: async ({ range }) => {
        if (!cachedArticle) {
          cachedArticle = await fetchPinnedText(MATERIAL_URL)
        }
        const excerpt = extractObjectMethodRange(cachedArticle, range)
        const observed = {
          range,
          sourceRef: `javascript.info:object-methods/${range}@${MATERIAL_VERSION}`,
          excerpt,
          characterCount: excerpt.length,
        }
        materialReads.push(observed)
        return observed
      },
    })

    const initialMessages: ModelMessage[] = [{ role: "user", content: firstUserText }]
    const recordedToolEvents: RecordedLearningToolEvent[] = []
    const startedAt = performance.now()
    const demonstrationResult = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt(contextBefore, "demonstrate-operation"),
      messages: initialMessages,
      tools: { read_course_material: readCourseMaterial },
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const demonstrationText = collectAssistantText(demonstrationResult.steps)
    const demonstrationFinishReasons = demonstrationResult.steps.map((step) => step.finishReason)
    const demonstrationItemId = "b2:trace-2:assistant:demonstration"
    lab.appendSessionItem({
      itemId: demonstrationItemId,
      sessionId,
      role: "assistant",
      content: demonstrationText,
      at: 1_200,
    })
    const demonstrationUsage = summarizeUsage(demonstrationResult.totalUsage)
    const demonstrationCost = estimateUpperBoundUsd(input.config.model, demonstrationUsage)
    input.budget.record({
      estimatedUpperBoundUsd: demonstrationCost,
      stepFinishReasons: demonstrationFinishReasons,
    })

    const firstTurnReads = [...materialReads]
    const readOperationMaterial = firstTurnReads.some((read) => read.range === "method-examples")
    const demonstrationOccurred =
      hasVisibleMethodDemonstration(demonstrationText) &&
      readOperationMaterial &&
      demonstrationFinishReasons.at(-1) === "stop"
    const demonstrationFailures = checkDemonstration(demonstrationText)
    if (!readOperationMaterial) {
      demonstrationFailures.push("Tutor did not read the operation material range")
    }
    if (firstTurnReads.some((read) => read.range === "this-in-methods")) {
      demonstrationFailures.push("Tutor loaded the postponed principle during the operation step")
    }
    if (demonstrationFinishReasons.at(-1) !== "stop") {
      demonstrationFailures.push("Operation demonstration did not finish normally")
    }

    if (demonstrationOccurred) {
      executeRecordedLearningTool({
        lab,
        call: {
          callId: "runtime:completed-demonstration",
          name: "record_progress",
          input: { courseId: "javascript", sectionId: "object-methods", progress: "demonstrated" },
        },
        runtime: {
          sessionId,
          sourceItemId: demonstrationItemId,
          expectedRevision: contextBefore.revision,
          at: 1_201,
          record: (event) => recordedToolEvents.push(event),
        },
      })
    }

    if (!demonstrationOccurred) {
      return {
        suite: "learning-native-b2-trace-2",
        model: deepSeekModelLabel(input.config),
        automatedChecksPassed: false,
        passScope: "operation-before-principle-and-durable-semantics",
        failures: demonstrationFailures,
        firstUserText,
        contextBefore,
        materialReads,
        demonstrationText,
        demonstrationFinishReasons,
        stateWriteSkipped: "responsive learner cannot follow an unseen or incomplete demonstration",
        usage: { demonstration: demonstrationUsage },
        budget: budgetReport(input.budget),
        elapsedMs: Math.round(performance.now() - startedAt),
      }
    }

    const learnerFollowItemId = "b2:trace-2:user:followed-and-asks-principle"
    const learnerFollowText =
      "我照着把 sayHi 写进 student 并调用了 student.sayHi()，运行时确实执行了问候。现在请解释：如果方法里写 console.log(this.name)，调用 student.sayHi() 时 this 为什么能找到 student.name。只讲这个原理，不要考我。"
    lab.appendSessionItem({
      itemId: learnerFollowItemId,
      sessionId,
      role: "user",
      content: learnerFollowText,
      at: 1_300,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:learner-followed-operation",
        name: "record_progress",
        input: { courseId: "javascript", sectionId: "object-methods", progress: "followed" },
      },
      runtime: {
        sessionId,
        sourceItemId: learnerFollowItemId,
        expectedRevision: 2,
        at: 1_301,
        record: (event) => recordedToolEvents.push(event),
      },
    })

    const contextBeforePrinciple = lab.buildCurrentContext({ now: 1_301, availableMinutes: 20 })
    const firstResponseMessages = JSON.parse(
      JSON.stringify(demonstrationResult.response.messages),
    ) as ModelMessage[]
    const principleInputMessages: ModelMessage[] = [
      ...initialMessages,
      ...firstResponseMessages,
      { role: "user", content: learnerFollowText },
    ]
    const materialReadCountBeforePrinciple = materialReads.length
    input.budget.assertCanStart(MAX_STEPS)
    const principleResult = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt(contextBeforePrinciple, "explain-principle"),
      messages: principleInputMessages,
      tools: { read_course_material: readCourseMaterial },
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const principleText = collectAssistantText(principleResult.steps)
    const principleFinishReasons = principleResult.steps.map((step) => step.finishReason)
    const principleItemId = "b2:trace-2:assistant:principle"
    lab.appendSessionItem({
      itemId: principleItemId,
      sessionId,
      role: "assistant",
      content: principleText,
      at: 1_400,
    })
    const principleUsage = summarizeUsage(principleResult.totalUsage)
    const principleCost = estimateUpperBoundUsd(input.config.model, principleUsage)
    input.budget.record({
      estimatedUpperBoundUsd: principleCost,
      stepFinishReasons: principleFinishReasons,
    })

    const principleFailures = checkPrincipleExplanation(principleText)
    const principleReads = materialReads.slice(materialReadCountBeforePrinciple)
    const readPrincipleMaterial = principleReads.some((read) => read.range === "this-in-methods")
    if (!readPrincipleMaterial) {
      principleFailures.push("Tutor did not read the principle material range")
    }
    if (principleFinishReasons.at(-1) !== "stop") {
      principleFailures.push("Principle explanation did not finish normally")
    }
    const principleOccurred =
      principleText.trim().length > 0 &&
      readPrincipleMaterial &&
      principleFinishReasons.at(-1) === "stop"
    if (principleOccurred) {
      executeRecordedLearningTool({
        lab,
        call: {
          callId: "runtime:completed-principle-explanation",
          name: "record_progress",
          input: { courseId: "javascript", sectionId: "object-methods", progress: "explained" },
        },
        runtime: {
          sessionId,
          sourceItemId: principleItemId,
          expectedRevision: contextBeforePrinciple.revision,
          at: 1_401,
          record: (event) => recordedToolEvents.push(event),
        },
      })
    }

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false
    const contextAfter = lab.buildCurrentContext({ now: 1_500, availableMinutes: 15 })
    const progressHistory = lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "object-methods",
    })
    const failures = [...demonstrationFailures, ...principleFailures]
    const activeProgress = progressHistory
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.kind)
    if (JSON.stringify(activeProgress) !== JSON.stringify(["demonstrated", "followed", "explained"])) {
      failures.push("Progress did not preserve demonstrated, followed, and explained separately")
    }
    if (contextAfter.dueRevisits.length > 0) {
      failures.push("Operation and explanation created an unrequested revisit")
    }
    const recovered = {
      demonstration: lab.readSessionItem(demonstrationItemId),
      learnerFollow: lab.readSessionItem(learnerFollowItemId),
      principle: lab.readSessionItem(principleItemId),
    }
    if (recovered.demonstration.content !== demonstrationText) {
      failures.push("Fresh reopen lost the demonstration")
    }
    if (recovered.learnerFollow.content !== learnerFollowText) {
      failures.push("Fresh reopen lost the learner's actual follow report")
    }
    if (recovered.principle.content !== principleText) {
      failures.push("Fresh reopen lost the principle explanation")
    }

    const secondResponseMessages = JSON.parse(
      JSON.stringify(principleResult.response.messages),
    ) as ModelMessage[]
    return {
      suite: "learning-native-b2-trace-2",
      model: deepSeekModelLabel(input.config),
      automatedChecksPassed: failures.length === 0,
      passScope: "operation-before-principle-and-durable-semantics",
      qualitativeReview: "pending",
      failures,
      scenario: {
        firstUserText,
        learnerFollowText,
        learnerPolicy: "follow only after a visible method definition and call",
        formalAssessmentToolsExposed: false,
      },
      contextBefore,
      contextBeforePrinciple,
      materialReads,
      demonstrationText,
      principleText,
      finishReasons: {
        demonstration: demonstrationFinishReasons,
        principle: principleFinishReasons,
      },
      recordedToolEvents,
      contextAfter,
      progressHistory,
      recovered,
      modelTranscript: {
        initialMessages,
        firstResponseMessages,
        learnerMessage: { role: "user", content: learnerFollowText },
        secondResponseMessages,
      },
      usage: { demonstration: demonstrationUsage, principle: principleUsage },
      estimatedUpperBoundUsd: {
        demonstration: demonstrationCost,
        principle: principleCost,
        total: demonstrationCost + principleCost,
      },
      budget: budgetReport(input.budget),
      elapsedMs: Math.round(performance.now() - startedAt),
    }
  } finally {
    if (!labClosed) {
      try {
        lab.close()
      } catch {
        // Preserve the original experiment error.
      }
    }
    Bun.gc(true)
    await Bun.sleep(20)
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
    } catch {
      // Best-effort lab cleanup must not replace the experiment result.
    }
  }
}

function tutorPrompt(
  context: unknown,
  activity: "demonstrate-operation" | "explain-principle",
) {
  const activityRules =
    activity === "demonstrate-operation"
      ? `- Read only the method-examples material range.
- Demonstrate how to define and call student.sayHi with a fixed greeting.
- Let the learner see and copy the operation before theory. Do not use this.name or explain this yet.`
      : `- Read only the this-in-methods material range.
- Explain why this.name reads student.name when the learner calls student.sayHi().
- State that the rule is for this direct method-call form. A limited explanation may postpone exceptions but must not claim that no exceptions or further rules exist.
- Stay with that receiver principle. Do not broaden into unbound this or arrow functions.`
  return `You are the Tutor inside a terminal-native learning Agent.

The learner deliberately chose operation before principle. The two actions must remain distinct.

Rules:
${activityRules}
- Follow the latest learner request and use one small, correct code example.
- Do not quiz the learner or claim mastery, retention, or independent performance.
- Do not invent progress, attempts, reviews, assignments, or deadlines. The host records actions that actually complete.
- End with a concise statement, not a question.

Current learning context:
${JSON.stringify(context)}`
}

function budgetReport(budget: BudgetTracker) {
  return {
    apiSteps: budget.apiSteps,
    estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
    configuredMaxUsd: budget.maxUsd,
  }
}

if (import.meta.main) {
  const config = deepSeekRunConfig(process.argv[2] ?? "deepseek-v4-pro")
  const apiKey = await loadApiKey()
  const budget = new BudgetTracker({ maxApiSteps: 8 })
  let report: unknown
  try {
    report = await runLearningNativeTrace2({ apiKey, config, budget })
  } catch (error) {
    report = {
      suite: "learning-native-b2-trace-2",
      model: deepSeekModelLabel(config),
      automatedChecksPassed: false,
      failures: [formatError(error)],
      budget: {
        apiStepsRecorded: budget.apiSteps,
        estimatedUpperBoundUsd:
          budget.apiSteps > 0 ? Number(budget.spentUsd.toFixed(8)) : "unknown",
        configuredMaxUsd: budget.maxUsd,
      },
    }
  }
  const rawTracePath = await persistLocalRun({
    suite: "learning-native-b2-trace-2",
    config,
    report,
  })
  const summary =
    report && typeof report === "object"
      ? {
          model: "model" in report ? report.model : deepSeekModelLabel(config),
          automatedChecksPassed:
            "automatedChecksPassed" in report ? report.automatedChecksPassed : false,
          failures: "failures" in report ? report.failures : [],
          budget: "budget" in report ? report.budget : undefined,
          elapsedMs: "elapsedMs" in report ? report.elapsedMs : undefined,
        }
      : { automatedChecksPassed: false }
  console.log(JSON.stringify({ rawTracePath, summary }, null, 2))
}
