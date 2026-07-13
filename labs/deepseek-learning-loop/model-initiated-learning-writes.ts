import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateText, stepCountIs, tool } from "ai"
import { z } from "zod"
import {
  openLearningLab,
  type LearningContext,
  type ProgressKind,
} from "../learning-native-capability/learning-layer"
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

const MAX_STEPS_PER_CASE = 4
const MAX_OUTPUT_TOKENS = 900
const CONTRACT_URL = new URL("./model-initiated-learning-writes.v1.json", import.meta.url)

const acceptedWriteExpectationSchema = z.strictObject({
  kind: z.literal("accepted-write"),
  tool: z.enum(["record_progress", "schedule_revisit"]),
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
  progress: z.enum(["read", "explained", "demonstrated", "followed"]).optional(),
  dueAt: z.string().min(1).optional(),
})

const rejectedWriteExpectationSchema = z.strictObject({
  kind: z.literal("rejected-write"),
  tool: z.literal("record_progress"),
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
  progress: z.enum(["read", "explained", "demonstrated", "followed"]),
  errorIncludes: z.string().min(1),
})

const noWriteExpectationSchema = z.strictObject({ kind: z.literal("no-write") })

const consumeExpectationSchema = z.strictObject({
  kind: z.literal("consume-without-write"),
  contextProgress: z.strictObject({
    sectionId: z.string().min(1),
    progress: z.enum(["read", "explained", "demonstrated", "followed"]),
  }),
})

const correctionExpectationSchema = z.strictObject({
  kind: z.literal("correction"),
  readTool: z.literal("read_progress_history"),
  writeTool: z.literal("retract_progress"),
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
  progress: z.enum(["read", "explained", "demonstrated", "followed"]),
})

const frozenWriteCaseSchema = z.strictObject({
  id: z.string().min(1),
  at: z.string().min(1),
  userText: z.string().min(1),
  beforeFirstWrite: z.literal("advance-learning-revision").optional(),
  expectation: z.discriminatedUnion("kind", [
    acceptedWriteExpectationSchema,
    rejectedWriteExpectationSchema,
    noWriteExpectationSchema,
    consumeExpectationSchema,
    correctionExpectationSchema,
  ]),
})

const frozenWriteContractSchema = z.strictObject({
  version: z.literal(1),
  suite: z.literal("model-initiated-learning-writes"),
  frozenAt: z.string().min(1),
  course: z.strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    goal: z.string().min(1),
    sections: z.array(
      z.strictObject({ id: z.string().min(1), title: z.string().min(1) }),
    ).min(1),
  }),
  sharedToolCatalog: z.array(z.enum([
    "read_progress_history",
    "record_progress",
    "schedule_revisit",
    "record_assignment",
    "retract_progress",
  ])).min(1),
  cases: z.array(frozenWriteCaseSchema).min(1),
})

export type FrozenWriteCase = z.infer<typeof frozenWriteCaseSchema>
export type FrozenWriteContract = z.infer<typeof frozenWriteContractSchema>

export type WriteAttempt = {
  name: string
  status: "accepted" | "rejected"
  canonicalInput: Record<string, unknown>
  error?: string
}

type ContextEvidence = {
  revision: number
  route: Array<{ id: string; progress: string[] }>
  dueRevisits: Array<Record<string, unknown>>
  assignments: Array<Record<string, unknown>>
}

type ProgressHistoryEvidence = {
  id: string
  kind: string
  status: "active" | "retracted"
  sourceItemId?: string
  recordedAt?: number
  correction?: { reason: string; sourceItemId?: string }
}

export type WriteCaseEvidence = {
  caseId: string
  assistantText: string
  finishReasons: string[]
  readToolCalls: string[]
  writeAttempts: WriteAttempt[]
  contextBefore: ContextEvidence
  contextAfter: ContextEvidence
  progressHistory: ProgressHistoryEvidence[]
  revisits?: Array<Record<string, unknown>>
}

export async function loadFrozenWriteContract() {
  return frozenWriteContractSchema.parse(await Bun.file(CONTRACT_URL).json())
}

export function validateFrozenWriteContract(value: unknown) {
  const parsed = frozenWriteContractSchema.safeParse(value)
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
  }

  const failures: string[] = []
  const ids = new Set<string>()
  const tools = new Set(parsed.data.sharedToolCatalog)
  for (const entry of parsed.data.cases) {
    if (ids.has(entry.id)) failures.push(`Duplicate case id: ${entry.id}`)
    ids.add(entry.id)
    if (!Number.isFinite(Date.parse(entry.at))) failures.push(`Invalid case time: ${entry.id}`)
    if (
      (entry.expectation.kind === "accepted-write" ||
        entry.expectation.kind === "rejected-write") &&
      !tools.has(entry.expectation.tool)
    ) {
      failures.push(`Expected tool is absent from the shared catalog: ${entry.id}`)
    }
    if (
      entry.expectation.kind === "accepted-write" &&
      entry.expectation.tool === "schedule_revisit" &&
      (entry.expectation.dueAt === undefined ||
        !Number.isFinite(Date.parse(entry.expectation.dueAt)))
    ) {
      failures.push(`Invalid revisit due time: ${entry.id}`)
    }
  }

  const requiredCases = [
    "explicit-read-report",
    "future-revisit-commitment",
    "ordinary-concept-question",
    "unsupported-mastery-request",
    "stale-read-report",
    "fresh-session-continuation",
    "correct-read-report",
  ]
  for (const id of requiredCases) {
    if (!ids.has(id)) failures.push(`Missing required frozen case: ${id}`)
  }
  return failures
}

export function renderWriteTutorPrompt(input: { nowIso: string; context: unknown }) {
  return `You are the flexible semantic capability inside a long-running Learning System. The whole system is the Tutor.

Use the available learning tools only when this interaction creates a durable fact or commitment that can improve future help. A successful write tool call is a real durable change, not a draft. Do not call a write tool merely to be agreeable.

General rules:
- The learner owns goals and can steer the immediate interaction.
- Record a learner report as the report it supports. Reading, explanation, demonstration, and following are not mastery.
- Do not use progress facts as a substitute for mastery, retention, or independent ability.
- A future revisit or assignment is a real system commitment after the write succeeds.
- Answer ordinary questions without a learning write when no future consumer needs one.
- When correcting an earlier progress fact, read the bounded progress history and retract the exact active record. Do not erase its source.
- The runtime owns Session/source identity, entity identity, current revision, event time, authorization, and persistence. Never invent or request those fields.
- If a tool rejects a write, do not claim it was saved. Continue honestly and briefly.
- Do not quiz unless the learner asks or the current interaction genuinely calls for it.

Current time: ${input.nowIso}
Current learning context:
${JSON.stringify(input.context)}`
}

const recordProgressInputSchema = z.strictObject({
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
  progress: z.enum(["read", "explained", "demonstrated", "followed"]),
})

const scheduleRevisitInputSchema = z.strictObject({
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
  label: z.string().min(1),
  dueAtIso: z.string().min(1),
})

const recordAssignmentInputSchema = z.strictObject({
  courseId: z.string().min(1),
  title: z.string().min(1),
  dueAtIso: z.string().min(1),
})

const retractProgressInputSchema = z.strictObject({
  progressId: z.string().min(1),
  reason: z.string().min(1),
})

export function canonicalizeModelWrite(input: {
  name: string
  modelInput: unknown
  sessionId: string
  toolCallId: string
}): { name: string; input: Record<string, unknown> } {
  switch (input.name) {
    case "record_progress":
      return { name: input.name, input: recordProgressInputSchema.parse(input.modelInput) }

    case "schedule_revisit": {
      const parsed = scheduleRevisitInputSchema.parse(input.modelInput)
      const dueAt = Date.parse(parsed.dueAtIso)
      if (!Number.isSafeInteger(dueAt) || dueAt < 0) {
        throw new Error(`schedule_revisit.dueAtIso is invalid: ${parsed.dueAtIso}`)
      }
      return {
        name: input.name,
        input: {
          revisitId: `revisit:${input.sessionId}:${input.toolCallId}`,
          courseId: parsed.courseId,
          sectionId: parsed.sectionId,
          label: parsed.label,
          dueAt,
        },
      }
    }

    case "record_assignment": {
      const parsed = recordAssignmentInputSchema.parse(input.modelInput)
      const dueAt = Date.parse(parsed.dueAtIso)
      if (!Number.isSafeInteger(dueAt) || dueAt < 0) {
        throw new Error(`record_assignment.dueAtIso is invalid: ${parsed.dueAtIso}`)
      }
      return {
        name: input.name,
        input: {
          assignmentId: `assignment:${input.sessionId}:${input.toolCallId}`,
          courseId: parsed.courseId,
          title: parsed.title,
          dueAt,
        },
      }
    }

    case "retract_progress": {
      const parsed = retractProgressInputSchema.parse(input.modelInput)
      if (!parsed.progressId.startsWith("progress:") || parsed.progressId.length <= 9) {
        throw new Error("retract_progress.progressId must come from progress history")
      }
      return {
        name: input.name,
        input: {
          progressOperationId: parsed.progressId.slice("progress:".length),
          reason: parsed.reason,
        },
      }
    }

    default:
      throw new Error(`Unsupported model learning write: ${input.name}`)
  }
}

function hasProgress(context: ContextEvidence, sectionId: string, progress: string) {
  return context.route.some(
    (section) => section.id === sectionId && section.progress.includes(progress),
  )
}

function inputMatches(
  attempt: WriteAttempt,
  expected: Record<string, unknown>,
) {
  return Object.entries(expected).every(([key, value]) => attempt.canonicalInput[key] === value)
}

function errorMatches(actual: string | undefined, expected: string) {
  if (actual?.includes(expected)) return true
  if (expected === "Stale revision") {
    return /Stale(?: learning)? revision/iu.test(actual ?? "")
  }
  return false
}

export function assessFrozenWriteCase(entry: FrozenWriteCase, evidence: WriteCaseEvidence) {
  const failures: string[] = []
  if (entry.id !== evidence.caseId) {
    failures.push(`Evidence case mismatch: expected ${entry.id}, received ${evidence.caseId}`)
    return failures
  }

  const accepted = evidence.writeAttempts.filter((attempt) => attempt.status === "accepted")
  const rejected = evidence.writeAttempts.filter((attempt) => attempt.status === "rejected")

  switch (entry.expectation.kind) {
    case "accepted-write": {
      const expected = entry.expectation
      const match = accepted.find((attempt) => {
        const semanticFields: Record<string, unknown> = {
          courseId: expected.courseId,
          sectionId: expected.sectionId,
        }
        if (expected.progress !== undefined) semanticFields.progress = expected.progress
        if (expected.dueAt !== undefined) semanticFields.dueAt = Date.parse(expected.dueAt)
        return attempt.name === expected.tool && inputMatches(attempt, semanticFields)
      })
      if (!match) failures.push(`${entry.id} did not commit the expected ${expected.tool} write`)
      if (accepted.length !== 1) {
        failures.push(`${entry.id} committed ${accepted.length} writes instead of exactly one`)
      }
      if (rejected.length > 0) failures.push(`${entry.id} also attempted rejected writes`)

      if (
        expected.tool === "record_progress" &&
        expected.progress !== undefined &&
        !hasProgress(evidence.contextAfter, expected.sectionId, expected.progress)
      ) {
        failures.push(`${entry.id} accepted progress is absent from the next context`)
      }
      if (expected.tool === "record_progress") {
        const active = evidence.progressHistory.find(
          (record) =>
            record.kind === expected.progress &&
            record.status === "active" &&
            record.sourceItemId !== undefined,
        )
        if (!active) failures.push(`${entry.id} progress lacks an active source-linked record`)
      }
      if (expected.tool === "schedule_revisit" && evidence.revisits?.length !== 1) {
        failures.push(`${entry.id} accepted revisit is not queryable after commit`)
      }
      break
    }

    case "no-write":
      if (evidence.writeAttempts.length > 0) {
        failures.push(`${entry.id} should not attempt a learning write`)
      }
      if (!evidence.assistantText.trim()) failures.push(`${entry.id} returned no answer`)
      break

    case "rejected-write": {
      const expected = entry.expectation
      if (accepted.length > 0) failures.push(`${entry.id} committed a stale write`)
      const match = rejected.find(
        (attempt) =>
          attempt.name === expected.tool &&
          inputMatches(attempt, {
            courseId: expected.courseId,
            sectionId: expected.sectionId,
            progress: expected.progress,
          }) &&
          errorMatches(attempt.error, expected.errorIncludes),
      )
      if (!match) failures.push(`${entry.id} did not expose the expected stale rejection`)
      if (hasProgress(evidence.contextAfter, expected.sectionId, expected.progress)) {
        failures.push(`${entry.id} stale progress leaked into current context`)
      }
      break
    }

    case "consume-without-write": {
      if (evidence.writeAttempts.length > 0) {
        failures.push(`${entry.id} should consume context without another write`)
      }
      if (
        !hasProgress(
          evidence.contextBefore,
          entry.expectation.contextProgress.sectionId,
          entry.expectation.contextProgress.progress,
        )
      ) {
        failures.push(`${entry.id} did not receive the accepted progress in compiled context`)
      }
      if (!evidence.assistantText.trim()) failures.push(`${entry.id} returned no continuation`)
      if (evidence.finishReasons.at(-1) !== "stop") {
        failures.push(`${entry.id} did not finish normally`)
      }
      if (/(?:理解了吗|试着回答|输出什么|来做.{0,4}题|请(?:你)?(?:回答|作答))/u.test(evidence.assistantText)) {
        failures.push(`${entry.id} added an unsolicited assessment`)
      }
      break
    }

    case "correction": {
      const expected = entry.expectation
      if (!evidence.readToolCalls.includes(expected.readTool)) {
        failures.push(`${entry.id} did not retrieve bounded progress history`)
      }
      if (accepted.length !== 1 || accepted[0]?.name !== expected.writeTool) {
        failures.push(`${entry.id} did not commit exactly one progress correction`)
      }
      if (hasProgress(evidence.contextAfter, expected.sectionId, expected.progress)) {
        failures.push(`${entry.id} left corrected progress active in current context`)
      }
      const corrected = evidence.progressHistory.find(
        (record) =>
          record.kind === expected.progress &&
          record.status === "retracted" &&
          record.sourceItemId !== undefined &&
          record.correction?.sourceItemId !== undefined,
      )
      if (!corrected) failures.push(`${entry.id} did not preserve source-linked correction history`)
      break
    }
  }
  return failures
}

function toContextEvidence(context: LearningContext): ContextEvidence {
  return {
    revision: context.revision,
    route: context.route.map((section) => ({
      id: section.id,
      progress: [...section.progress],
    })),
    dueRevisits: context.dueRevisits.map((revisit) => ({ ...revisit })),
    assignments: context.assignments.map((assignment) => ({ ...assignment })),
  }
}

function collectAssistantText(steps: ReadonlyArray<{ text: string }>) {
  return steps.map((step) => step.text.trim()).filter(Boolean).join("\n\n")
}

type LearningLab = ReturnType<typeof openLearningLab>

async function runFrozenCase(input: {
  entry: FrozenWriteCase
  lab: LearningLab
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  input.budget.assertCanStart(MAX_STEPS_PER_CASE)
  const at = Date.parse(input.entry.at)
  const sessionId = `als-017:${input.entry.id}:session`
  const userItemId = `als-017:${input.entry.id}:user`
  input.lab.appendSessionItem({
    itemId: userItemId,
    sessionId,
    role: "user",
    content: input.entry.userText,
    at,
  })

  const contextBefore = input.lab.buildCurrentContext({ now: at, availableMinutes: 45 })
  const recordedToolEvents: RecordedLearningToolEvent[] = []
  const writeAttempts: WriteAttempt[] = []
  const readToolCalls: string[] = []
  let revisionAdvanced = false

  const executeWrite = async (
    name: string,
    modelInput: unknown,
    toolCallId: string,
  ) => {
    let canonical: { name: string; input: Record<string, unknown> }
    try {
      canonical = canonicalizeModelWrite({ name, modelInput, sessionId, toolCallId })
    } catch (error) {
      const message = formatError(error)
      writeAttempts.push({
        name,
        status: "rejected",
        canonicalInput:
          modelInput !== null && typeof modelInput === "object" && !Array.isArray(modelInput)
            ? { ...(modelInput as Record<string, unknown>) }
            : { value: modelInput },
        error: message,
      })
      throw error
    }

    if (input.entry.beforeFirstWrite === "advance-learning-revision" && !revisionAdvanced) {
      revisionAdvanced = true
      input.lab.apply({
        operationId: `als-017:${input.entry.id}:intervening-update`,
        expectedRevision: contextBefore.revision,
        at: at + 1,
        command: {
          type: "set-current-section",
          courseId: "javascript",
          sectionId: "object-references",
        },
      })
    }

    try {
      const result = executeRecordedLearningTool({
        lab: input.lab,
        call: {
          callId: toolCallId,
          name: canonical.name,
          input: canonical.input,
        },
        runtime: {
          sessionId,
          sourceItemId: userItemId,
          expectedRevision: contextBefore.revision,
          at: at + 2,
          record: (event) => recordedToolEvents.push(event),
        },
      })
      writeAttempts.push({
        name: canonical.name,
        status: "accepted",
        canonicalInput: canonical.input,
      })
      return result
    } catch (error) {
      writeAttempts.push({
        name: canonical.name,
        status: "rejected",
        canonicalInput: canonical.input,
        error: formatError(error),
      })
      throw error
    }
  }

  const tools = {
    read_progress_history: tool({
      description:
        "Read bounded progress records for one course section when an exact record is needed for correction. This does not write state.",
      inputSchema: z.strictObject({
        courseId: z.string().min(1),
        sectionId: z.string().min(1),
      }),
      execute: async ({ courseId, sectionId }) => {
        readToolCalls.push("read_progress_history")
        return input.lab.readProgressHistory({ courseId, sectionId }).map((record) => ({
          ...record,
          progressOperationId: record.id.slice("progress:".length),
          ...(record.sourceItemId === undefined
            ? {}
            : { source: input.lab.readSessionItem(record.sourceItemId) }),
        }))
      },
    }),
    record_progress: tool({
      description:
        "Persist a source-linked fact that a range was read, explained, demonstrated, or followed. Use only for an event actually supported by the current interaction; this never records mastery.",
      inputSchema: recordProgressInputSchema,
      execute: async (modelInput, { toolCallId }) =>
        executeWrite("record_progress", modelInput, toolCallId),
    }),
    schedule_revisit: tool({
      description:
        "Create a real, correctable future revisit commitment. Supply an ISO-8601 time with an explicit offset. This is not a claim that the learner forgot or lacks mastery.",
      inputSchema: scheduleRevisitInputSchema,
      execute: async (modelInput, { toolCallId }) =>
        executeWrite("schedule_revisit", modelInput, toolCallId),
    }),
    record_assignment: tool({
      description:
        "Record an assignment and deadline explicitly reported in the current interaction. Supply an ISO-8601 due time with an explicit offset.",
      inputSchema: recordAssignmentInputSchema,
      execute: async (modelInput, { toolCallId }) =>
        executeWrite("record_assignment", modelInput, toolCallId),
    }),
    retract_progress: tool({
      description:
        "Retract one exact active progress record after a learner correction. The progressId must come from read_progress_history; the original source remains preserved.",
      inputSchema: retractProgressInputSchema,
      execute: async (modelInput, { toolCallId }) =>
        executeWrite("retract_progress", modelInput, toolCallId),
    }),
  }

  const startedAt = performance.now()
  const result = await generateText({
    model: deepSeekChatModel(input.apiKey, input.config),
    system: renderWriteTutorPrompt({ nowIso: input.entry.at, context: contextBefore }),
    messages: [{ role: "user", content: input.entry.userText }],
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(MAX_STEPS_PER_CASE),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
  const elapsedMs = performance.now() - startedAt
  const assistantText = collectAssistantText(result.steps)
  if (assistantText.trim()) {
    input.lab.appendSessionItem({
      itemId: `als-017:${input.entry.id}:assistant`,
      sessionId,
      role: "assistant",
      content: assistantText,
      at: at + 10,
    })
  }

  const contextAfter = input.lab.buildCurrentContext({ now: at + 20, availableMinutes: 45 })
  const progressHistory = input.lab.readProgressHistory({
    courseId: "javascript",
    sectionId: "object-references",
  })
  const revisits = writeAttempts
    .filter((attempt) => attempt.status === "accepted" && attempt.name === "schedule_revisit")
    .map((attempt) => input.lab.readRevisit(String(attempt.canonicalInput.revisitId)))
  const finishReasons = result.steps.map((step) => step.finishReason)
  const evidence: WriteCaseEvidence = {
    caseId: input.entry.id,
    assistantText,
    finishReasons,
    readToolCalls,
    writeAttempts,
    contextBefore: toContextEvidence(contextBefore),
    contextAfter: toContextEvidence(contextAfter),
    progressHistory,
    revisits,
  }
  const failures = assessFrozenWriteCase(input.entry, evidence)
  const usage = summarizeUsage(result.totalUsage)
  const estimatedUpperBoundUsd = estimateUpperBoundUsd(input.config.model, usage)
  input.budget.record({ estimatedUpperBoundUsd, stepFinishReasons: finishReasons })

  return {
    id: input.entry.id,
    passed: failures.length === 0,
    failures,
    input: {
      at: input.entry.at,
      userItemId,
      userText: input.entry.userText,
      contextRevision: contextBefore.revision,
    },
    assistantText,
    modelToolCalls: result.steps.flatMap((step) =>
      step.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
      })),
    ),
    recordedToolEvents,
    evidence,
    finishReasons,
    usage,
    estimatedUpperBoundUsd,
    elapsedMs,
  }
}

async function contractSha256() {
  return createHash("sha256")
    .update(Buffer.from(await Bun.file(CONTRACT_URL).arrayBuffer()))
    .digest("hex")
}

export async function runModelInitiatedLearningWrites(input: {
  apiKey: string
  config: RunConfig
  budget: BudgetTracker
}) {
  const contract = await loadFrozenWriteContract()
  const contractFailures = validateFrozenWriteContract(contract)
  if (contractFailures.length > 0) {
    throw new Error(`Frozen contract is invalid: ${contractFailures.join("; ")}`)
  }

  const directory = mkdtempSync(join(tmpdir(), "repa-model-initiated-writes-"))
  const databasePath = join(directory, "learning.sqlite")
  let lab = openLearningLab(databasePath)
  let labClosed = false

  try {
    lab.apply({
      operationId: "als-017:initialize-course",
      expectedRevision: 0,
      at: Date.parse(contract.cases[0]!.at) - 1,
      command: {
        type: "initialize-course",
        courseId: contract.course.id,
        title: contract.course.title,
        goal: contract.course.goal,
        sections: contract.course.sections,
      },
    })

    const executionOrder = [
      "explicit-read-report",
      "future-revisit-commitment",
      "ordinary-concept-question",
      "stale-read-report",
      "fresh-session-continuation",
      "correct-read-report",
      "unsupported-mastery-request",
    ]
    const casesById = new Map(contract.cases.map((entry) => [entry.id, entry]))
    const caseReports: Awaited<ReturnType<typeof runFrozenCase>>[] = []

    for (const id of executionOrder) {
      if (id === "fresh-session-continuation") {
        lab.close()
        labClosed = true
        lab = openLearningLab(databasePath)
        labClosed = false
      }
      const entry = casesById.get(id)
      if (!entry) throw new Error(`Missing frozen case in execution order: ${id}`)
      caseReports.push(await runFrozenCase({ ...input, entry, lab }))
    }

    lab.close()
    labClosed = true
    lab = openLearningLab(databasePath)
    labClosed = false
    const finalAt = Date.parse(contract.cases.at(-1)!.at) + 100
    const finalContext = lab.buildCurrentContext({ now: finalAt, availableMinutes: 45 })
    const finalProgressHistory = lab.readProgressHistory({
      courseId: "javascript",
      sectionId: "object-references",
    })

    const failures = caseReports.flatMap((entry) =>
      entry.failures.map((failure) => `${entry.id}: ${failure}`),
    )
    const report = {
      suite: contract.suite,
      model: deepSeekModelLabel(input.config),
      contractVersion: contract.version,
      contractSha256: await contractSha256(),
      passed: failures.length === 0,
      failures,
      cases: caseReports,
      finalContext,
      finalProgressHistory,
      budget: {
        apiSteps: input.budget.apiSteps,
        estimatedUpperBoundUsd: Number(input.budget.spentUsd.toFixed(8)),
        configuredMaxUsd: input.budget.maxUsd,
      },
      interpretation:
        "Capability and authority-boundary evidence only; not a write-policy reliability estimate or production-schema approval.",
    }
    const rawTracePath = await persistLocalRun({
      suite: contract.suite,
      config: input.config,
      report,
    })
    return { rawTracePath, ...report }
  } finally {
    if (!labClosed) lab.close()
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  }
}

if (import.meta.main) {
  const config = deepSeekRunConfig(process.argv[2] ?? "deepseek-v4-pro")
  const apiKey = await loadApiKey()
  const budget = new BudgetTracker({ maxApiSteps: 30, maxUsd: 0.05 })
  try {
    console.log(JSON.stringify(await runModelInitiatedLearningWrites({ apiKey, config, budget }), null, 2))
  } catch (error) {
    console.error(JSON.stringify({
      suite: "model-initiated-learning-writes",
      model: deepSeekModelLabel(config),
      error: formatError(error),
      budget: {
        apiSteps: budget.apiSteps,
        estimatedUpperBoundUsd: Number(budget.spentUsd.toFixed(8)),
        configuredMaxUsd: budget.maxUsd,
      },
    }, null, 2))
    process.exitCode = 1
  }
}
