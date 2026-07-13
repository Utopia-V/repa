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
const MAX_OUTPUT_TOKENS = 1_500
const PINNED_MATERIAL_URL =
  "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/04-object-basics/01-object/article.md"
const PUBLIC_MATERIAL_URL = "https://javascript.info/object"

export function extractObjectIntroduction(article: string) {
  const start = article.indexOf("# Objects")
  const end = article.indexOf("## Square brackets")
  if (start < 0 || end <= start) {
    throw new Error("Pinned Objects material no longer contains the expected bounded section")
  }
  return article.slice(start, end).trim()
}

export function collectAssistantText(steps: ReadonlyArray<{ text: string }>) {
  return steps
    .map((step) => step.text.trim())
    .filter(Boolean)
    .join("\n\n")
}

export type LearnerSteering = {
  reason: "forced-quiz" | "missing-example" | "too-broad" | "focus-request"
  text: string
}

export function chooseLearnerSteering(teachingText: string): LearnerSteering {
  if (/(?:考你|来做.{0,4}题|请(?:你)?(?:回答|作答)|小测)/u.test(teachingText)) {
    return {
      reason: "forced-quiz",
      text: "这次先别考我。换成学生信息的例子，只讲对象字面量，以及怎么读取和修改属性；不要提问。",
    }
  }
  if (!teachingText.includes("```")) {
    return {
      reason: "missing-example",
      text: "换成一个很小的学生信息代码例子，只讲对象字面量，以及怎么读取和修改属性；先别进入下一节，也别考我。",
    }
  }
  if (teachingText.length > 1_800) {
    return {
      reason: "too-broad",
      text: "讲得有点多。换成学生信息的例子，只讲对象字面量，以及怎么读取和修改属性；先别进入下一节，也别考我。",
    }
  }
  return {
    reason: "focus-request",
    text: "先别继续后面的内容。换成学生信息的例子，只讲对象字面量，以及怎么读取和修改属性；不要提问。",
  }
}

export function checkSteeringResponse(input: {
  firstText: string
  secondText: string
  steering: LearnerSteering
}) {
  const failures: string[] = []
  const secondText = input.secondText.trim()
  if (!secondText) failures.push("Tutor returned no steered explanation")
  if (secondText && !secondText.includes("{") && !secondText.includes("```")) {
    failures.push("Steered explanation did not provide the requested code example")
  }
  if (/[?？]\s*$/u.test(secondText)) {
    failures.push("Steered explanation ended by asking another question")
  }
  if (/(?:\bdelete\b|删除|删掉|方括号|引用|拷贝)/u.test(secondText)) {
    failures.push("Steered explanation added adjacent operations outside the learner's scope")
  }
  if (input.steering.reason === "too-broad" && secondText.length >= input.firstText.length) {
    failures.push("Steered explanation was not narrower than the original broad response")
  }
  return failures
}

export function shouldRecordCompletedExplanation(input: {
  text: string
  finishReasons: string[]
  materialReadCount: number
}) {
  return (
    input.text.trim().length > 0 &&
    input.finishReasons.at(-1) === "stop" &&
    input.materialReadCount > 0
  )
}

export async function runLearningNativeFirstTrace(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const directory = mkdtempSync(join(tmpdir(), "repa-b2-first-trace-"))
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
      operationId: "b2:trace-1:initialize-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Understand JavaScript well enough to build and debug programs",
        sections: [
          { id: "objects", title: "Objects", materialRef: PINNED_MATERIAL_URL },
          { id: "object-references", title: "Object references and copying" },
          { id: "object-methods", title: "Object methods and this" },
        ],
      },
    })

    const sessionId = "b2:trace-1:session"
    const userItemId = "b2:trace-1:user:start"
    const userText =
      "我现在有 45 分钟，开始学 JavaScript 的 Objects。先让我知道它在这条路线里的位置，再教第一个有用的内容。今天不要自动考我；需要材料就自己读。"
    lab.appendSessionItem({
      itemId: userItemId,
      sessionId,
      role: "user",
      content: userText,
      at: 1_100,
    })

    const contextBefore = lab.buildCurrentContext({ now: 1_100, availableMinutes: 45 })
    type MaterialRead = {
      sourceRef: string
      publicPage: string
      excerpt: string
      characterCount: number
    }
    const materialReads: MaterialRead[] = []
    let cachedMaterial: MaterialRead | undefined
    const readCourseMaterial = tool({
      description:
        "Read the bounded source passage for the active course section before teaching from it.",
      inputSchema: z.strictObject({
        courseId: z.literal("javascript"),
        sectionId: z.literal("objects"),
      }),
      execute: async () => {
        if (cachedMaterial) {
          materialReads.push(cachedMaterial)
          return cachedMaterial
        }
        const excerpt = extractObjectIntroduction(await fetchPinnedText(PINNED_MATERIAL_URL))
        cachedMaterial = {
          sourceRef:
            "javascript.info:object/introduction-and-literals@52c1e61915bc8970a950a3f59bd845827e49b4bf",
          publicPage: PUBLIC_MATERIAL_URL,
          excerpt,
          characterCount: excerpt.length,
        }
        materialReads.push(cachedMaterial)
        return cachedMaterial
      },
    })
    const initialMessages: ModelMessage[] = [{ role: "user", content: userText }]
    const startedAt = performance.now()
    const result = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt(contextBefore, "initial-explanation"),
      messages: initialMessages,
      tools: {
        read_course_material: readCourseMaterial,
      },
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })

    const firstFinishReasons = result.steps.map((step) => step.finishReason)
    const teachingText = collectAssistantText(result.steps)
    const assistantItemId = "b2:trace-1:assistant:teaching"
    lab.appendSessionItem({
      itemId: assistantItemId,
      sessionId,
      role: "assistant",
      content: teachingText,
      at: 1_200,
    })

    const recordedToolEvents: RecordedLearningToolEvent[] = []
    const completedExplanation = shouldRecordCompletedExplanation({
      text: teachingText,
      finishReasons: firstFinishReasons,
      materialReadCount: materialReads.length,
    })
    if (completedExplanation) {
      executeRecordedLearningTool({
        lab,
        call: {
          callId: "runtime:completed-explanation",
          name: "record_progress",
          input: {
            courseId: "javascript",
            sectionId: "objects",
            progress: "explained",
          },
        },
        runtime: {
          sessionId,
          sourceItemId: assistantItemId,
          expectedRevision: contextBefore.revision,
          at: 1_201,
          record: (event) => recordedToolEvents.push(event),
        },
      })
    }

    const firstUsage = summarizeUsage(result.totalUsage)
    const firstEstimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, firstUsage)
    input.budget.record({
      estimatedUpperBoundUsd: firstEstimatedUpperBoundUsd,
      stepFinishReasons: firstFinishReasons,
    })

    const contextAfterFirst = lab.buildCurrentContext({ now: 1_300, availableMinutes: 45 })
    const steering = chooseLearnerSteering(teachingText)
    const steeringItemId = "b2:trace-1:user:steering"
    lab.appendSessionItem({
      itemId: steeringItemId,
      sessionId,
      role: "user",
      content: steering.text,
      at: 1_300,
    })

    const firstResponseMessages = JSON.parse(
      JSON.stringify(result.response.messages),
    ) as ModelMessage[]
    const secondInputMessages: ModelMessage[] = [
      ...initialMessages,
      ...firstResponseMessages,
      { role: "user", content: steering.text },
    ]
    const materialReadCountBeforeSteering = materialReads.length
    input.budget.assertCanStart(MAX_STEPS)
    const steeredResult = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt(contextAfterFirst, "steered-explanation"),
      messages: secondInputMessages,
      tools: {
        read_course_material: readCourseMaterial,
      },
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const secondFinishReasons = steeredResult.steps.map((step) => step.finishReason)
    const steeredTeachingText = collectAssistantText(steeredResult.steps)
    const steeredAssistantItemId = "b2:trace-1:assistant:steered-teaching"
    lab.appendSessionItem({
      itemId: steeredAssistantItemId,
      sessionId,
      role: "assistant",
      content: steeredTeachingText,
      at: 1_400,
    })
    const secondUsage = summarizeUsage(steeredResult.totalUsage)
    const secondEstimatedUpperBoundUsd = estimateUpperBoundUsd(
      input.config.model,
      secondUsage,
    )
    input.budget.record({
      estimatedUpperBoundUsd: secondEstimatedUpperBoundUsd,
      stepFinishReasons: secondFinishReasons,
    })

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false
    const contextAfter = lab.buildCurrentContext({ now: 1_500, availableMinutes: 45 })
    const recoveredTeaching = lab.readSessionItem(assistantItemId)
    const recoveredSteering = lab.readSessionItem(steeringItemId)
    const recoveredSteeredTeaching = lab.readSessionItem(steeredAssistantItemId)
    const progressHistory = lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "objects",
    })

    const attemptedTools = {
      first: result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
      second: steeredResult.steps.flatMap((step) =>
        step.toolCalls.map((call) => call.toolName),
      ),
    }
    const objectProgress = contextAfter.route.find((section) => section.id === "objects")?.progress
    const failures = checkSteeringResponse({
      firstText: teachingText,
      secondText: steeredTeachingText,
      steering,
    })
    if (!teachingText) failures.push("Tutor returned no teaching text")
    if (materialReads.length === 0) failures.push("Tutor did not read the selected course material")
    if (firstFinishReasons.at(-1) !== "stop") {
      failures.push("Tutor teaching did not finish normally")
    }
    if (secondFinishReasons.at(-1) !== "stop") {
      failures.push("Steered teaching did not finish normally")
    }
    if (!objectProgress?.includes("explained")) {
      failures.push("Completed teaching did not survive as simple explained progress")
    }
    const activeProgress = progressHistory.filter((entry) => entry.status === "active")
    if (
      activeProgress.length !== 1 ||
      activeProgress[0]?.kind !== "explained" ||
      activeProgress[0]?.sourceItemId !== assistantItemId
    ) {
      failures.push("Trace did not preserve exactly one source-linked explained fact")
    }
    if (contextAfter.dueRevisits.length > 0) {
      failures.push("Teaching alone created an unrequested revisit")
    }
    if (recoveredTeaching.content !== teachingText) {
      failures.push("Fresh reopen could not recover the actual teaching response")
    }
    if (recoveredSteering.content !== steering.text) {
      failures.push("Fresh reopen could not recover the learner steering")
    }
    if (recoveredSteeredTeaching.content !== steeredTeachingText) {
      failures.push("Fresh reopen could not recover the steered teaching response")
    }

    const secondResponseMessages = JSON.parse(
      JSON.stringify(steeredResult.response.messages),
    ) as ModelMessage[]

    return {
      suite: "learning-native-b2-trace-1",
      model: deepSeekModelLabel(input.config),
      automatedChecksPassed: failures.length === 0,
      passScope: "mechanics-steering-and-durable-semantics",
      qualitativeReview: "pending",
      failures,
      activity: {
        kind: "selected-explanation",
        selectedBy: "learner",
        courseId: "javascript",
        sectionId: "objects",
        recordOnNormalCompletion: "explained",
      },
      scenario: {
        userText,
        steering,
        selectedAction: "explain",
        formalAssessmentToolsExposed: false,
      },
      contextBefore,
      materialReads,
      materialReadsByTurn: {
        first: materialReadCountBeforeSteering,
        second: materialReads.length - materialReadCountBeforeSteering,
      },
      attemptedTools,
      teachingText,
      steeredTeachingText,
      finishReasons: {
        first: firstFinishReasons,
        second: secondFinishReasons,
      },
      completedExplanation,
      stateWriteOrigin: "host-settled-completed-action",
      teachingQuality: "not-automatically-scored",
      recordedToolEvents,
      contextAfter,
      progressHistory,
      recoveredTeaching,
      recoveredSteering,
      recoveredSteeredTeaching,
      modelTranscript: {
        initialMessages,
        firstResponseMessages,
        steeringMessage: { role: "user", content: steering.text },
        secondResponseMessages,
      },
      usage: {
        first: firstUsage,
        second: secondUsage,
      },
      estimatedUpperBoundUsd: {
        first: firstEstimatedUpperBoundUsd,
        second: secondEstimatedUpperBoundUsd,
        total: firstEstimatedUpperBoundUsd + secondEstimatedUpperBoundUsd,
      },
      budget: {
        apiSteps: input.budget.apiSteps,
        estimatedUpperBoundUsd: Number(input.budget.spentUsd.toFixed(8)),
        configuredMaxUsd: input.budget.maxUsd,
      },
      elapsedMs: Math.round(performance.now() - startedAt),
    }
  } finally {
    if (!labClosed) {
      try {
        lab.close()
      } catch {
        // Keep the original experiment error.
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
  activity: "initial-explanation" | "steered-explanation",
) {
  const activityRules =
    activity === "initial-explanation"
      ? `- Give a short course-level orientation, then teach the first useful idea with one concrete example.
- The retrieved excerpt defines the current teaching scope. Do not teach later sections.
- Do not turn an introductory simplification into an absolute claim.`
      : `- The learner is steering an explanation already in progress. Follow the latest request immediately.
- Do not repeat the course orientation or broaden into later sections.
- When the latest request says "only", omit adjacent operations and extra context even if they are normally useful.
- Keep the replacement explanation smaller than the first one.`
  return `You are the Tutor inside a terminal-native learning Agent.

The learner selected a teaching action for the current course section. Teach it; do not turn every explanation into a quiz.

Rules:
- Read the active section with read_course_material before teaching, unless its completed tool result is already present in this conversation.
${activityRules}
- Respect the learner's 45-minute budget and request for no automatic quiz.
- Do not claim that the learner mastered, retained, or independently applied anything.
- Do not invent progress, attempts, reviews, assignments, or deadlines. The host records actions that actually complete.
- End with a concise statement, not a question.

Current learning context:
${JSON.stringify(context)}`
}

if (import.meta.main) {
  const config = deepSeekRunConfig(process.argv[2] ?? "deepseek-v4-pro")
  const apiKey = await loadApiKey()
  const budget = new BudgetTracker({ maxApiSteps: 8 })
  let report: unknown
  try {
    report = await runLearningNativeFirstTrace({ apiKey, config, budget })
  } catch (error) {
    report = {
      suite: "learning-native-b2-trace-1",
      model: deepSeekModelLabel(config),
      automatedChecksPassed: false,
      failures: [formatError(error)],
      budget: {
        apiStepsRecorded: budget.apiSteps,
        estimatedUpperBoundUsd:
          budget.apiSteps > 0 ? Number(budget.spentUsd.toFixed(8)) : "unknown",
        usageAvailable: budget.apiSteps > 0,
        configuredMaxUsd: budget.maxUsd,
      },
    }
  }
  const rawTracePath = await persistLocalRun({
    suite: "learning-native-b2-trace-1",
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
