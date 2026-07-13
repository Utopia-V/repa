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
const MAX_OUTPUT_TOKENS = 900
const NOW = 10_000
const ASSIGNMENT_DUE_AT = 10_030
const ASSIGNMENT_ID = "assignment:general-report"

export function checkDeadlinePlan(text: string) {
  const failures: string[] = []
  const naturalFirstAction = text.match(/先([^。；，,\n]{0,80})/u)?.[1] ?? ""
  const naturalAssignmentFirst = /报告/u.test(naturalFirstAction)
  const numberedAssignmentFirst = /^\s*1[.、][^\n]{0,100}报告/mu.test(text)
  const protectsAssignmentFirst = naturalAssignmentFirst || numberedAssignmentFirst
  if (!protectsAssignmentFirst) {
    failures.push("Plan did not protect the urgent assignment first")
  }
  if (!/25\s*(?:分钟|min)/iu.test(text)) {
    failures.push("Plan did not reserve the reported completion time")
  }
  const returnsNaturally =
    naturalAssignmentFirst &&
    /(?:之后|然后|再|剩余)[^。；\n]{0,60}(?:(?:复习|回顾)[^。；\n]{0,30}(?:对象引用|object-references)|(?:对象引用|object-references)[^。；\n]{0,30}(?:复习|回顾))/iu.test(
      text,
    )
  const returnsInNumberedPlan =
    numberedAssignmentFirst &&
    /^\s*[2-9][.、][^\n]{0,100}(?:复习|回顾|对象引用|object-references)/imu.test(text)
  if (!returnsNaturally && !returnsInNumberedPlan) {
    failures.push("Plan did not return to the due learning revisit")
  }
  const defersNewMaterial =
    /(?:暂不|不进入|推迟|延后|今天不|不展开|不动).{0,30}(?:克隆|新内容|Object\.assign)/u.test(text) ||
    /(?:克隆|新内容|Object\.assign).{0,30}(?:不开始|不展开|不动|暂不|推迟|延后)/u.test(text)
  if (!defersNewMaterial) {
    failures.push("Plan did not defer lower-priority new material")
  }
  if (/(?:你不适合|学习风格|能力.{0,4}(?:差|弱|不足))/u.test(text)) {
    failures.push("Plan turned a temporary trade-off into a learner-level claim")
  }
  return failures
}

export async function runLearningNativeTrace5(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(MAX_STEPS)
  const directory = mkdtempSync(join(tmpdir(), "repa-b2-trace-5-"))
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
      operationId: "b2:trace-5:initialize-course",
      expectedRevision: 0,
      at: 9_000,
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
    lab.apply({
      operationId: "b2:trace-5:set-current-section",
      expectedRevision: 1,
      at: 9_001,
      command: {
        type: "set-current-section",
        courseId: "javascript",
        sectionId: "object-cloning",
      },
    })

    const setupSessionId = "b2:trace-5:prior-session"
    const revisitSourceItemId = "b2:trace-5:user:prior-revisit"
    lab.appendSessionItem({
      itemId: revisitSourceItemId,
      sessionId: setupSessionId,
      role: "user",
      content: "对象引用这里需要今天再回顾一次。",
      at: 9_010,
    })
    const recordedToolEvents: RecordedLearningToolEvent[] = []
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:schedule-reference-revisit",
        name: "schedule_revisit",
        input: {
          revisitId: "revisit:object-references",
          courseId: "javascript",
          sectionId: "object-references",
          label: "Review object reference aliasing",
          dueAt: 9_950,
        },
      },
      runtime: {
        sessionId: setupSessionId,
        sourceItemId: revisitSourceItemId,
        expectedRevision: 2,
        at: 9_020,
        record: (event) => recordedToolEvents.push(event),
      },
    })

    const assignmentSourceItemId = "b2:trace-5:user:assignment-report"
    const assignmentSourceText =
      "通识课短报告在虚拟时刻 10030 截止，预计需要 25 分钟。它的学习价值很低，但必须按要求提交。"
    lab.appendSessionItem({
      itemId: assignmentSourceItemId,
      sessionId: setupSessionId,
      role: "user",
      content: assignmentSourceText,
      at: 9_030,
    })
    executeRecordedLearningTool({
      lab,
      call: {
        callId: "runtime:record-general-report",
        name: "record_assignment",
        input: {
          assignmentId: ASSIGNMENT_ID,
          courseId: "javascript",
          title: "通识课短报告",
          dueAt: ASSIGNMENT_DUE_AT,
        },
      },
      runtime: {
        sessionId: setupSessionId,
        sourceItemId: assignmentSourceItemId,
        expectedRevision: 3,
        at: 9_040,
        record: (event) => recordedToolEvents.push(event),
      },
    })

    const sessionId = "b2:trace-5:planning-session"
    const planningItemId = "b2:trace-5:user:plan-request"
    const userText =
      "我现在只有 45 分钟。请根据当前课程、到期复习和作业安排接下来做什么。低价值不等于可以错过 DDL，也别把这次临时取舍说成我的长期偏好。"
    lab.appendSessionItem({
      itemId: planningItemId,
      sessionId,
      role: "user",
      content: userText,
      at: NOW,
    })
    const contextBefore = lab.buildCurrentContext({ now: NOW, availableMinutes: 45 })
    const assignmentReads: Array<{
      assignment: ReturnType<typeof lab.readAssignment>
      source: ReturnType<typeof lab.readSessionItem>
    }> = []
    const initialMessages: ModelMessage[] = [{ role: "user", content: userText }]
    const startedAt = performance.now()
    const result = await generateText({
      model: deepSeekChatModel(input.apiKey, input.config),
      system: tutorPrompt({ now: NOW, clockUnit: "virtual minutes", learning: contextBefore }),
      messages: initialMessages,
      tools: {
        read_assignment: tool({
          description:
            "Read the source-linked details behind the active assignment before making a near-term trade-off.",
          inputSchema: z.strictObject({ assignmentId: z.literal(ASSIGNMENT_ID) }),
          execute: async () => {
            const observed = {
              assignment: lab.readAssignment(ASSIGNMENT_ID),
              source: lab.readSessionItem(assignmentSourceItemId),
            }
            assignmentReads.push(observed)
            return observed
          },
        }),
      },
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const planText = collectAssistantText(result.steps)
    const finishReasons = result.steps.map((step) => step.finishReason)
    const planItemId = "b2:trace-5:assistant:near-term-plan"
    lab.appendSessionItem({
      itemId: planItemId,
      sessionId,
      role: "assistant",
      content: planText,
      at: NOW + 1,
    })
    const usage = summarizeUsage(result.totalUsage)
    const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
    input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })

    const failures = checkDeadlinePlan(planText)
    if (assignmentReads.length === 0) failures.push("Tutor did not read the assignment details")
    if (finishReasons.at(-1) !== "stop") failures.push("Near-term planning did not finish normally")

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false
    const contextBeforeDeadline = lab.buildCurrentContext({
      now: ASSIGNMENT_DUE_AT - 1,
      availableMinutes: 20,
    })
    const contextAtDeadline = lab.buildCurrentContext({
      now: ASSIGNMENT_DUE_AT,
      availableMinutes: 20,
    })
    const beforeAssignment = contextBeforeDeadline.assignments.find(
      (assignment) => assignment.id === ASSIGNMENT_ID,
    )
    const overdueAssignment = contextAtDeadline.assignments.find(
      (assignment) => assignment.id === ASSIGNMENT_ID,
    )
    if (beforeAssignment?.state !== "open") {
      failures.push("Assignment was not open immediately before its deadline")
    }
    if (overdueAssignment?.state !== "overdue") {
      failures.push("Unresolved assignment disappeared instead of becoming overdue")
    }
    if (contextAtDeadline.dueRevisits.length !== 1) {
      failures.push("Temporary deadline pressure erased the due learning revisit")
    }
    const progressHistory = lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "object-cloning",
    })
    if (progressHistory.length > 0) {
      failures.push("A planning response invented course progress")
    }
    const recoveredPlan = lab.readSessionItem(planItemId)
    if (recoveredPlan.content !== planText) {
      failures.push("Fresh reopen lost the actual near-term plan")
    }

    return {
      suite: "learning-native-b2-trace-5",
      model: deepSeekModelLabel(input.config),
      automatedChecksPassed: failures.length === 0,
      passScope: "deadline-sensitive-near-term-planning",
      qualitativeReview: "pending",
      failures,
      scenario: {
        userText,
        now: NOW,
        availableMinutes: 45,
        assignmentDueInMinutes: ASSIGNMENT_DUE_AT - NOW,
        reportedAssignmentMinutes: 25,
      },
      contextBefore,
      assignmentReads,
      planText,
      finishReasons,
      recordedToolEvents,
      contextBeforeDeadline,
      contextAtDeadline,
      progressHistory,
      recoveredPlan,
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

The learner asks for a 45-minute near-term plan. A source-linked virtual assignment deadline, a due learning revisit, and untouched new material compete for the same time.

Rules:
- Call read_assignment for assignment:general-report before deciding.
- Use the explicit virtual current time and source-linked assignment estimate. Do not guess missing timing.
- Protect the imminent required submission even though its learning value is low; compress it rather than deepen it.
- After the submission block, return remaining time to the due object-reference revisit.
- Defer object-cloning new material for this short window.
- Explain this as a temporary constraint trade-off, not a learner ability, personality, or permanent preference.
- Give an ordered, directly executable plan. Do not create progress or claim work has already been completed.
- Use at most eight short lines. Do not restate the full context or add a long rationale section.

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
    report = await runLearningNativeTrace5({ apiKey, config, budget })
  } catch (error) {
    report = {
      suite: "learning-native-b2-trace-5",
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
    suite: "learning-native-b2-trace-5",
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
