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
const MAX_OUTPUT_TOKENS = 700
const ATTEMPT_ID = "attempt:resume-aliasing-1"
const REVISIT_ID = "revisit:resume-aliasing-1"

export type ObjectReferenceRecallExercise = {
  originalName: string
  aliasName: string
  propertyName: string
  initialValue: number
  assignedValue: number
}

export const OBJECT_REFERENCE_RECALL_EXERCISE: ObjectReferenceRecallExercise = {
  originalName: "a",
  aliasName: "b",
  propertyName: "score",
  initialValue: 10,
  assignedValue: 20,
}

export function renderRecallExercise(exercise: ObjectReferenceRecallExercise) {
  return `\`\`\`js
let ${exercise.originalName} = { ${exercise.propertyName}: ${exercise.initialValue} };
let ${exercise.aliasName} = ${exercise.originalName};
${exercise.aliasName}.${exercise.propertyName} = ${exercise.assignedValue};
console.log(${exercise.originalName}.${exercise.propertyName}); // 输出什么？
\`\`\``
}

export function checkContinuation(
  text: string,
  exercise: ObjectReferenceRecallExercise = OBJECT_REFERENCE_RECALL_EXERCISE,
) {
  const failures: string[] = []
  if (/(?:哪门课|之前学到哪里|想继续什么|上次学了什么)/u.test(text)) {
    failures.push("Tutor asked the learner to restate context already available locally")
  }
  if (/(?:开始|进入|继续).{0,20}(?:对象克隆|object-cloning|新内容)/iu.test(text)) {
    failures.push("Tutor skipped the due revisit for new material")
  }
  const targetedRevisit =
    /(?:回顾|复习|重温)/u.test(text) &&
    /(?:对象引用|对象赋值|b\s*=\s*a|共享引用|新对象)/iu.test(text) &&
    /(?:[?？]|请.{0,6}(?:预测|判断|回答|思考))/u.test(text)
  if (!targetedRevisit) {
    failures.push("Tutor did not begin a targeted object-reference revisit")
  }
  if (revealsRecallAnswer(text, exercise)) {
    failures.push("Tutor revealed the revisit answer before learner recall")
  }
  return failures
}

function revealsRecallAnswer(text: string, exercise: ObjectReferenceRecallExercise) {
  const normalizedText = text.replaceAll("`", "")
  const original = escapeRegExp(exercise.originalName)
  const alias = escapeRegExp(exercise.aliasName)
  const property = escapeRegExp(exercise.propertyName)
  const expectedValue = escapeRegExp(String(exercise.assignedValue))
  const originalProperty = `${original}\\s*\\.\\s*${property}`
  const aliasProperty = `${alias}\\s*\\.\\s*${property}`

  const explicitOutcome = new RegExp(
    `${originalProperty}[^?？。\\n]{0,24}(?:(?:会)?(?:变成|等于|是|为)|(?:输出|结果)(?:是|为)?|(?:becomes?|equals?|prints?|outputs?|is))\\s*[*]*-?\\d+(?:\\.\\d+)?`,
    "iu",
  )
  const labeledExpectedAnswer = new RegExp(
    `(?:答案|输出|结果|answer|output|result)[^?？。\\n]{0,10}(?:(?:是|为)|=|:)\\s*[*]*${expectedValue}\\b`,
    "iu",
  )
  const directEffect = new RegExp(
    `(?:修改|改变|changing|modifying)[^。\\n]{0,12}${aliasProperty}[^。\\n]{0,28}(?:也会|会同时|也将|also|will)[^。\\n]{0,12}(?:修改|改变|影响|change|affect)[^。\\n]{0,12}${originalProperty}`,
    "iu",
  )
  const assignmentExplained = new RegExp(
    `(?:对象赋值|${alias}\\s*=\\s*${original}|object assignment)[^?？。\\n]{0,36}(?:共享(?:同一)?引用|(?:指向|引用)(?:了)?(?:同一个|相同的?)对象|shared reference|(?:point|refer)s? to the same object|alias(?:es|ing)?)`,
    "iu",
  )
  const variablesExplained = new RegExp(
    `(?:${original}\\s*(?:和|与|and)\\s*${alias}|${alias}\\s*(?:和|与|and)\\s*${original}|both variables)[^?？。\\n]{0,30}(?:共享(?:同一)?引用|(?:指向|引用)(?:了)?(?:同一个|相同的?)对象|shared reference|(?:point|refer)s? to the same object)`,
    "iu",
  )

  return (
    explicitOutcome.test(normalizedText) ||
    labeledExpectedAnswer.test(normalizedText) ||
    directEffect.test(normalizedText) ||
    assignmentExplained.test(normalizedText) ||
    variablesExplained.test(normalizedText)
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function runLearningNativeTrace6(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const directory = mkdtempSync(join(tmpdir(), "repa-b2-trace-6-"))
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
    const recordedToolEvents: RecordedLearningToolEvent[] = []
    lab.apply({
      operationId: "b2:trace-6:initialize-course",
      expectedRevision: 0,
      at: 1_000,
      command: {
        type: "initialize-course",
        courseId: "javascript",
        title: "JavaScript",
        goal: "Understand JavaScript well enough to build and debug programs",
        sections: [
          { id: "objects", title: "Objects" },
          { id: "object-references", title: "Object references and copying" },
          { id: "object-cloning", title: "Cloning and merging objects" },
        ],
      },
    })

    const priorSessionId = "b2:trace-6:prior-session"
    const explanationItemId = "b2:trace-6:assistant:objects-explanation"
    lab.appendSessionItem({
      itemId: explanationItemId,
      sessionId: priorSessionId,
      role: "assistant",
      content:
        "Objects group named values. This full earlier explanation remains in Session history and should not be loaded routinely.",
      at: 1_100,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:record-objects-explained",
        name: "record_progress",
        input: { courseId: "javascript", sectionId: "objects", progress: "explained" },
      },
      runtime: {
        sessionId: priorSessionId,
        sourceItemId: explanationItemId,
        expectedRevision: 1,
        at: 1_101,
        record: (event) => recordedToolEvents.push(event),
      },
    })
    lab.apply({
      operationId: "b2:trace-6:move-to-references",
      expectedRevision: 2,
      at: 1_150,
      command: {
        type: "set-current-section",
        courseId: "javascript",
        sectionId: "object-references",
      },
    })

    const answerItemId = "b2:trace-6:user:aliasing-answer"
    const answerText =
      "题目里 b = a 后修改 b.value。我回答 a.value 仍然是 1，因为 b 是一个新对象；这次没有提示。"
    lab.appendSessionItem({
      itemId: answerItemId,
      sessionId: priorSessionId,
      role: "user",
      content: answerText,
      at: 1_200,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:record-prior-aliasing-attempt",
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
        sessionId: priorSessionId,
        sourceItemId: answerItemId,
        expectedRevision: 3,
        at: 1_201,
        record: (event) => recordedToolEvents.push(event),
      },
    })

    const feedbackItemId = "b2:trace-6:assistant:aliasing-feedback"
    lab.appendSessionItem({
      itemId: feedbackItemId,
      sessionId: priorSessionId,
      role: "assistant",
      content: "The error came from treating object assignment as a new object instead of a shared reference.",
      at: 1_300,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:schedule-prior-aliasing-revisit",
        name: "schedule_revisit",
        input: {
          revisitId: REVISIT_ID,
          courseId: "javascript",
          sectionId: "object-references",
          label: "Recheck object assignment and shared references",
          dueAt: 5_000,
          sourceAttemptId: ATTEMPT_ID,
        },
      },
      runtime: {
        sessionId: priorSessionId,
        sourceItemId: feedbackItemId,
        expectedRevision: 4,
        at: 1_301,
        record: (event) => recordedToolEvents.push(event),
      },
    })
    lab.apply({
      operationId: "b2:trace-6:move-to-cloning",
      expectedRevision: 5,
      at: 1_400,
      command: {
        type: "set-current-section",
        courseId: "javascript",
        sectionId: "object-cloning",
      },
    })

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false

    const newSessionId = "b2:trace-6:new-session"
    const continueItemId = "b2:trace-6:user:continue"
    const userText = "继续"
    lab.appendSessionItem({
      itemId: continueItemId,
      sessionId: newSessionId,
      role: "user",
      content: userText,
      at: 10_000,
    })
    const contextBefore = lab.buildCurrentContext({ now: 10_000, availableMinutes: 30 })
    const failures: string[] = []
    if (JSON.stringify(contextBefore).includes(answerText)) {
      failures.push("Routine context eagerly loaded the old attempt detail")
    }
    if (contextBefore.dueRevisits.length !== 1) {
      failures.push("Fresh reopen did not surface the due revisit")
    }

    const attemptReads: Array<{
      attempt: ReturnType<typeof lab.readAttempt>
      source: ReturnType<typeof lab.readSessionItem>
    }> = []
    const initialMessages: ModelMessage[] = [{ role: "user", content: userText }]
    const startedAt = performance.now()
    const result = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt({ now: 10_000, learning: contextBefore }),
      messages: initialMessages,
      tools: {
        read_attempt: tool({
          description:
            "Read the source-linked old attempt only after the current action needs its detail.",
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
    const continuationText = collectAssistantText(result.steps)
    const finishReasons = result.steps.map((step) => step.finishReason)
    const continuationItemId = "b2:trace-6:assistant:continuation"
    lab.appendSessionItem({
      itemId: continuationItemId,
      sessionId: newSessionId,
      role: "assistant",
      content: continuationText,
      at: 10_001,
    })
    const usage = summarizeUsage(result.totalUsage)
    const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
    input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })

    failures.push(...checkContinuation(continuationText))
    if (attemptReads.length === 0) failures.push("Tutor did not retrieve old detail for the selected revisit")
    if (finishReasons.at(-1) !== "stop") failures.push("Continuation did not finish normally")

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false
    const contextAfter = lab.buildCurrentContext({ now: 10_002, availableMinutes: 30 })
    if (contextAfter.revision !== contextBefore.revision) {
      failures.push("Merely beginning a revisit changed durable learning state")
    }
    if (contextAfter.dueRevisits.length !== 1) {
      failures.push("Uncompleted revisit disappeared after the Tutor question")
    }
    const cloningProgress = lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "object-cloning",
    })
    if (cloningProgress.length > 0) {
      failures.push("Continuation invented progress for untouched new material")
    }
    const recoveredContinuation = lab.readSessionItem(continuationItemId)
    if (recoveredContinuation.content !== continuationText) {
      failures.push("Fresh reopen lost the continuation response")
    }

    return {
      suite: "learning-native-b2-trace-6",
      model: deepSeekModelLabel(input.config),
      automatedChecksPassed: failures.length === 0,
      passScope: "fresh-session-continuation-with-lazy-detail",
      qualitativeReview: "pending",
      failures,
      scenario: {
        latestUserText: userText,
        elapsedVirtualTime: 8_600,
        availableMinutes: 30,
      },
      contextBefore,
      attemptReads,
      continuationText,
      finishReasons,
      recordedToolEvents,
      contextAfter,
      cloningProgress,
      recoveredContinuation,
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

This is a fresh Session several days later. The learner said only "继续". Use the compact current view instead of asking them to synchronize the application manually.

Rules:
- Select the next useful action from current course position, due revisits, assignments, and time.
- With no stronger live constraint, a due local revisit comes before untouched new material.
- If the chosen revisit has a sourceAttemptId, call read_attempt before forming the targeted prompt. Do not load unrelated old Session detail.
- Begin the exact active-recall exercise below, tied to the old misconception, but do not reveal its answer or the shared-reference explanation yet:
${renderRecallExercise(OBJECT_REFERENCE_RECALL_EXERCISE)}
- Do not mark the revisit complete, record a new attempt, or create progress before the learner responds.
- Do not ask which course or where the learner stopped; that context is already local.

Current situation:
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
    report = await runLearningNativeTrace6({ apiKey, config, budget })
  } catch (error) {
    report = {
      suite: "learning-native-b2-trace-6",
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
    suite: "learning-native-b2-trace-6",
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
