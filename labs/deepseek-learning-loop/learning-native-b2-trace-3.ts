import { generateText, type ModelMessage } from "ai"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

const MAX_OUTPUT_TOKENS = 400
const MATERIAL_URL =
  "https://cdn.jsdelivr.net/gh/javascript-tutorial/en.javascript.info@52c1e61915bc8970a950a3f59bd845827e49b4bf/1-js/04-object-basics/02-object-copy/article.md"
const PUBLIC_MATERIAL_URL = "https://javascript.info/object-copy"

export function extractReferenceStudyRange(article: string) {
  const start = article.indexOf('# Object references and copying')
  const end = article.indexOf('## Cloning and merging, Object.assign')
  if (start < 0 || end <= start) {
    throw new Error("Pinned object-reference material no longer contains the selected range")
  }
  return article.slice(start, end).trim()
}

export function checkSelfStudyStandby(text: string) {
  const failures: string[] = []
  if (!text.trim()) failures.push("Tutor returned no self-study standby response")
  if (text.includes("```") || /(?:我先|下面).{0,8}(?:讲|解释|总结)/u.test(text)) {
    failures.push("Tutor taught content during a learner-selected self-study action")
  }
  if (/(?:用自己的话|复述|小测|做.{0,3}题|回答.{0,4}题)/u.test(text)) {
    failures.push("Tutor forced a summary or assessment after self-study")
  }
  if (/[?？]\s*$/u.test(text)) {
    failures.push("Tutor ended standby by asking a question")
  }
  return failures
}

export async function runLearningNativeTrace3(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(1)
  const selectedRange = extractReferenceStudyRange(await fetchPinnedText(MATERIAL_URL))

  const directory = mkdtempSync(join(tmpdir(), "repa-b2-trace-3-"))
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
      operationId: "b2:trace-3:initialize-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Understand JavaScript well enough to build and debug programs",
        sections: [
          {
            id: "object-references-intro",
            title: "Object references and copying — through comparison by reference",
            materialRef: MATERIAL_URL,
          },
          { id: "object-cloning", title: "Cloning and merging objects" },
        ],
      },
    })

    const sessionId = "b2:trace-3:session"
    const userItemId = "b2:trace-3:user:self-study"
    const userText =
      "我想自己读 Object references and copying，从开头读到 Comparison by reference。你先保持待命，中途我有问题再问；不要先讲，也不要要求我读完总结或做题。"
    lab.appendSessionItem({
      itemId: userItemId,
      sessionId,
      role: "user",
      content: userText,
      at: 1_100,
    })
    const contextBefore = lab.buildCurrentContext({ now: 1_100, availableMinutes: 25 })
    const initialMessages: ModelMessage[] = [{ role: "user", content: userText }]
    const startedAt = performance.now()
    const result = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt(contextBefore),
      messages: initialMessages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const standbyText = collectAssistantText(result.steps)
    const finishReasons = result.steps.map((step) => step.finishReason)
    const standbyItemId = "b2:trace-3:assistant:standby"
    lab.appendSessionItem({
      itemId: standbyItemId,
      sessionId,
      role: "assistant",
      content: standbyText,
      at: 1_200,
    })
    const usage = summarizeUsage(result.totalUsage)
    const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
    input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })

    const failures = checkSelfStudyStandby(standbyText)
    if (finishReasons.at(-1) !== "stop") {
      failures.push("Self-study standby did not finish normally")
    }
    if (failures.length > 0) {
      return {
        suite: "learning-native-b2-trace-3",
        model: deepSeekModelLabel(input.config),
        automatedChecksPassed: false,
        passScope: "self-study-without-forced-teaching-or-assessment",
        failures,
        userText,
        contextBefore,
        selectedMaterial: {
          sourceRef:
            "javascript.info:object-copy/introduction-through-comparison@52c1e61915bc8970a950a3f59bd845827e49b4bf",
          publicPage: PUBLIC_MATERIAL_URL,
          characterCount: selectedRange.length,
        },
        standbyText,
        finishReasons,
        stateWriteSkipped: "responsive learner does not complete a rejected self-study setup",
        usage,
        budget: budgetReport(input.budget),
        elapsedMs: Math.round(performance.now() - startedAt),
      }
    }

    const completionItemId = "b2:trace-3:user:completed-reading"
    const completionText =
      "我读完了这段：从开头到 Comparison by reference 都看完了。这次没有需要你讲的部分。"
    lab.appendSessionItem({
      itemId: completionItemId,
      sessionId,
      role: "user",
      content: completionText,
      at: 1_300,
    })
    const recordedToolEvents: RecordedLearningToolEvent[] = []
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:learner-completed-reading",
        name: "record_progress",
        input: {
          courseId: "javascript",
          sectionId: "object-references-intro",
          progress: "read",
        },
      },
      runtime: {
        sessionId,
        sourceItemId: completionItemId,
        expectedRevision: contextBefore.revision,
        at: 1_301,
        record: (event) => recordedToolEvents.push(event),
      },
    })

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false
    const contextAfter = lab.buildCurrentContext({ now: 1_400, availableMinutes: 20 })
    const progressHistory = lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "object-references-intro",
    })
    const activeProgress = progressHistory.filter((entry) => entry.status === "active")
    if (
      activeProgress.length !== 1 ||
      activeProgress[0]?.kind !== "read" ||
      activeProgress[0]?.sourceItemId !== completionItemId
    ) {
      failures.push("Self-study did not preserve exactly one source-linked read fact")
    }
    if (contextAfter.dueRevisits.length > 0) {
      failures.push("Self-study completion created an unrequested revisit")
    }
    const recovered = {
      request: lab.readSessionItem(userItemId),
      standby: lab.readSessionItem(standbyItemId),
      completion: lab.readSessionItem(completionItemId),
    }
    if (recovered.standby.content !== standbyText) {
      failures.push("Fresh reopen lost the Tutor standby response")
    }
    if (recovered.completion.content !== completionText) {
      failures.push("Fresh reopen lost the learner's reading report")
    }

    return {
      suite: "learning-native-b2-trace-3",
      model: deepSeekModelLabel(input.config),
      automatedChecksPassed: failures.length === 0,
      passScope: "self-study-without-forced-teaching-or-assessment",
      qualitativeReview: "pending",
      failures,
      scenario: {
        userText,
        completionText,
        selectedAction: "independent-reading",
        modelToolsExposed: [],
      },
      contextBefore,
      selectedMaterial: {
        sourceRef:
          "javascript.info:object-copy/introduction-through-comparison@52c1e61915bc8970a950a3f59bd845827e49b4bf",
        publicPage: PUBLIC_MATERIAL_URL,
        characterCount: selectedRange.length,
      },
      standbyText,
      finishReasons,
      stateWriteOrigin: "learner-completion-report",
      recordedToolEvents,
      contextAfter,
      progressHistory,
      recovered,
      modelTranscript: {
        initialMessages,
        responseMessages: JSON.parse(JSON.stringify(result.response.messages)) as ModelMessage[],
      },
      usage,
      estimatedUpperBoundUsd,
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

function tutorPrompt(context: unknown) {
  return `You are the Tutor inside a terminal-native learning Agent.

The learner selected independent reading of the current bounded material range.

Rules:
- Acknowledge the exact reading range briefly and remain available for questions.
- Do not teach, summarize the material, provide code examples, quiz, demand a recap, or convert this into a Tutor-led lesson.
- The learner may later report completion; that report is progress, not mastery or retention.
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
  const budget = new BudgetTracker({ maxApiSteps: 2 })
  let report: unknown
  try {
    report = await runLearningNativeTrace3({ apiKey, config, budget })
  } catch (error) {
    report = {
      suite: "learning-native-b2-trace-3",
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
    suite: "learning-native-b2-trace-3",
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
