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

const MAX_STEPS = 4
const MAX_OUTPUT_TOKENS = 800
const ATTEMPT_ID = "attempt:object-aliasing-1"
const REVISIT_ID = "revisit:object-aliasing-1"
const REVISIT_DUE_AT = 5_000

export function checkAliasingFeedback(text: string) {
  const failures: string[] = []
  if (!/(?:(?:输出|结果).{0,8}\b2\b|a\.value.{0,8}\b2\b)/u.test(text)) {
    failures.push("Feedback did not give the correct observed result")
  }
  if (!/(?:同一个对象|共享.{0,6}引用|复制的是.{0,6}引用|指向.{0,4}同一)/u.test(text)) {
    failures.push("Feedback did not identify the shared-reference misconception")
  }
  if (/[?？]\s*$/u.test(text)) {
    failures.push("Feedback ended by asking another question")
  }
  return failures
}

export async function runLearningNativeTrace4(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const directory = mkdtempSync(join(tmpdir(), "repa-b2-trace-4-"))
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
      operationId: "b2:trace-4:initialize-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Understand JavaScript well enough to build and debug programs",
        sections: [
          { id: "object-references", title: "Object references and copying" },
          { id: "object-cloning", title: "Cloning and merging objects" },
        ],
      },
    })

    const sessionId = "b2:trace-4:session"
    const answerItemId = "b2:trace-4:user:answer"
    const userText = `练习：

\`\`\`js
let a = { value: 1 };
let b = a;
b.value = 2;
console.log(a.value);
\`\`\`

我的答案是 1，因为 b 是复制出来的新对象。我没有看提示。请根据这次实际回答反馈，不要立刻再考一道。`
    lab.appendSessionItem({
      itemId: answerItemId,
      sessionId,
      role: "user",
      content: userText,
      at: 1_100,
    })
    const contextBeforeAttempt = lab.buildCurrentContext({ now: 1_100, availableMinutes: 20 })
    const recordedToolEvents: RecordedLearningToolEvent[] = []
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:record-aliasing-attempt",
        name: "record_attempt",
        input: {
          attemptId: ATTEMPT_ID,
          courseId: "javascript",
          sectionId: "object-references",
          outcome: "incorrect",
          assistance: "independent",
        },
      },
      runtime: {
        sessionId,
        sourceItemId: answerItemId,
        expectedRevision: contextBeforeAttempt.revision,
        at: 1_101,
        record: (event) => recordedToolEvents.push(event),
      },
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:schedule-aliasing-revisit",
        name: "schedule_revisit",
        input: {
          revisitId: REVISIT_ID,
          courseId: "javascript",
          sectionId: "object-references",
          label: "Recheck that object assignment copies a reference, not the object",
          dueAt: REVISIT_DUE_AT,
          sourceAttemptId: ATTEMPT_ID,
        },
      },
      runtime: {
        sessionId,
        sourceItemId: answerItemId,
        expectedRevision: 2,
        at: 1_102,
        record: (event) => recordedToolEvents.push(event),
      },
    })

    const contextBeforeFeedback = lab.buildCurrentContext({ now: 1_102, availableMinutes: 20 })
    const attemptReads: Array<{
      attempt: ReturnType<typeof lab.readAttempt>
      source: ReturnType<typeof lab.readSessionItem>
    }> = []
    const initialMessages: ModelMessage[] = [{ role: "user", content: userText }]
    const startedAt = performance.now()
    const result = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt(contextBeforeFeedback),
      messages: initialMessages,
      tools: {
        read_attempt: tool({
          description:
            "Read the source-linked conditions and learner answer for the current recorded attempt.",
          inputSchema: z.strictObject({ attemptId: z.literal(ATTEMPT_ID) }),
          execute: async () => {
            const observed = {
              attempt: lab.readAttempt(ATTEMPT_ID),
              source: lab.readSessionItem(answerItemId),
            }
            attemptReads.push(observed)
            return observed
          },
        }),
      },
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const feedbackText = collectAssistantText(result.steps)
    const finishReasons = result.steps.map((step) => step.finishReason)
    const feedbackItemId = "b2:trace-4:assistant:feedback"
    lab.appendSessionItem({
      itemId: feedbackItemId,
      sessionId,
      role: "assistant",
      content: feedbackText,
      at: 1_200,
    })
    const usage = summarizeUsage(result.totalUsage)
    const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
    input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })

    const failures = checkAliasingFeedback(feedbackText)
    if (attemptReads.length === 0) failures.push("Tutor did not read the recorded attempt")
    if (finishReasons.at(-1) !== "stop") failures.push("Practice feedback did not finish normally")
    const scheduledRevisit = true

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false
    const contextBeforeDue = lab.buildCurrentContext({ now: REVISIT_DUE_AT - 1, availableMinutes: 15 })
    const contextAtDue = lab.buildCurrentContext({ now: REVISIT_DUE_AT, availableMinutes: 15 })
    const recoveredAttempt = lab.readAttempt(ATTEMPT_ID)
    if (
      recoveredAttempt.outcome !== "incorrect" ||
      recoveredAttempt.assistance !== "independent" ||
      recoveredAttempt.sourceItemId !== answerItemId
    ) {
      failures.push("Fresh reopen lost the actual attempt conditions")
    }
    if (contextBeforeDue.dueRevisits.length !== 0) {
      failures.push("Revisit became due before its scheduled time")
    }
    const due = contextAtDue.dueRevisits.find((revisit) => revisit.id === REVISIT_ID)
    if (!due || due.sourceAttemptId !== ATTEMPT_ID || due.sourceItemId !== answerItemId) {
      failures.push("Scheduled local revisit did not appear at its due time with provenance")
    }
    if (contextAtDue.course.currentSectionId !== "object-references") {
      failures.push("One local error rewrote the course route")
    }
    const progressHistory = lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "object-references",
    })
    if (progressHistory.length > 0) {
      failures.push("Practice feedback invented simple course progress")
    }
    const recovered = {
      answer: lab.readSessionItem(answerItemId),
      feedback: lab.readSessionItem(feedbackItemId),
    }

    return {
      suite: "learning-native-b2-trace-4",
      model: deepSeekModelLabel(input.config),
      automatedChecksPassed: failures.length === 0,
      passScope: "scripted-practice-local-gap-and-due-revisit",
      qualitativeReview: "pending",
      failures,
      scenario: {
        userText,
        task: {
          attemptId: ATTEMPT_ID,
          expectedOutput: 2,
          observedAnswer: 1,
          declaredAssistance: "independent",
        },
        formalAssessmentToolsExposed: false,
      },
      contextBeforeAttempt,
      contextBeforeFeedback,
      attemptReads,
      feedbackText,
      finishReasons,
      scheduledRevisit,
      recordedToolEvents,
      contextBeforeDue,
      contextAtDue,
      recoveredAttempt,
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

The learner just made an independent attempt. The runtime has already recorded the exact outcome and conditions. Read it before responding.

Rules:
- Call read_attempt with attempt:object-aliasing-1 before feedback.
- Explain the observed output and the specific reference-copy misconception in a small trace.
- Treat the gap as local. Do not infer general ability, mastery, a learning style, or a route change from one error.
- Do not immediately give another quiz. End with a concise statement, not a question.
- The deterministic fixed-task result has already created a local future revisit. Your feedback quality cannot erase that observed error; do not invent a mastery score or additional durable state.

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
  const budget = new BudgetTracker({ maxApiSteps: 4 })
  let report: unknown
  try {
    report = await runLearningNativeTrace4({ apiKey, config, budget })
  } catch (error) {
    report = {
      suite: "learning-native-b2-trace-4",
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
    suite: "learning-native-b2-trace-4",
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
