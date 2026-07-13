import type { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import {
  admitUserTurn,
  appendSessionItem,
  createSession,
  finishModelOperation,
  finishTurn,
  readLastStateTransitionAt,
  readModelOperation,
  readSessionItems,
  readStateRevision,
  readToolInvocation,
  readTurn,
} from "../../src/interaction/records"
import {
  ADDRESS_FUTURE_ATTENTION_TOOL,
  CREATE_FUTURE_ATTENTION_TOOL,
  DISMISS_FUTURE_ATTENTION_TOOL,
  REOPEN_FUTURE_ATTENTION_TOOL,
  SUPERSEDE_FUTURE_ATTENTION_TOOL,
} from "../../src/learning/agenda/future-attention-tool-execution"
import {
  ADVANCE_COURSE_ROUTE_TOOL,
  CREATE_PROVISIONAL_COURSE_TOOL,
  REALIGN_MARKDOWN_COURSE_TOOL,
  REGISTER_MARKDOWN_COURSE_TOOL,
  REVISE_PROVISIONAL_COURSE_TOOL,
  SET_COURSE_ROUTE_ANCHOR_TOOL,
} from "../../src/learning/curriculum/course-tool-execution"
import {
  readFutureAttentionConcern,
  createFutureAttentionConcern,
} from "../../src/learning/agenda/future-attention"
import {
  readActiveCourseContext,
  registerMarkdownCourse,
} from "../../src/learning/curriculum/course-view"
import { observeMarkdownArtifact } from "../../src/sources/markdown-artifact"
import { openRepaDatabase } from "../../src/storage/open-database"
import { beginTutorModelOperation } from "../../src/tutor/compile-context"
import { listTimedLearnerSteering } from "../../src/tutor/learner-steering"
import { RETAIN_STEERING_TOOL } from "../../src/runtime/tutor-tools"
import type { ObservedModelCall } from "./observed-model"
import {
  CONTROLLED_PRIOR_TRANSCRIPT,
  POLICY_PROFILE_REVISION,
  SHARED_AGENDA_SOURCE,
  VIRTUAL_TIMES,
  type SharedPolicyScenario,
} from "./protocol"

const COURSE_RELATIVE_PATH = "course.md"
const COURSE_ID = "course:als-021:object-identity"
const LEARNING_SPACE_ID = "space:als-021"
const ARTIFACT_ID = "artifact:als-021:course"
const SEEDED_AGENDA_ID = "agenda:als-021:seed"
const MUTATING_TOOL_NAMES = new Set<string>([
  RETAIN_STEERING_TOOL,
  REGISTER_MARKDOWN_COURSE_TOOL,
  CREATE_PROVISIONAL_COURSE_TOOL,
  SET_COURSE_ROUTE_ANCHOR_TOOL,
  REVISE_PROVISIONAL_COURSE_TOOL,
  REALIGN_MARKDOWN_COURSE_TOOL,
  ADVANCE_COURSE_ROUTE_TOOL,
  CREATE_FUTURE_ATTENTION_TOOL,
  ADDRESS_FUTURE_ATTENTION_TOOL,
  DISMISS_FUTURE_ATTENTION_TOOL,
  SUPERSEDE_FUTURE_ATTENTION_TOOL,
  REOPEN_FUTURE_ATTENTION_TOOL,
])

export type PreparedScenario = {
  database: ReturnType<typeof openRepaDatabase>
  databasePath: string
  workspaceRoot: string
  scenario: SharedPolicyScenario
  identity: {
    sessionId: string
    turnId: string
    userItemId: string
    assistantItemId: string
    modelOperationId(stepNumber: number): string
    toolItemId(durableInvocationId: string): string
  }
  clock: () => number
  initialSnapshot: DurableLabSnapshot
}

export type DurableLabSnapshot = {
  stateRevision: number
  lastStateTransitionAt: number
  activeCourse: ReturnType<typeof readActiveCourseContext> | null
  agendaConcerns: Array<ReturnType<typeof readFutureAttentionConcern>>
  learnerSteering: ReturnType<typeof listTimedLearnerSteering>
  sessions: Array<{
    sessionId: string
    items: ReturnType<typeof readSessionItems>
  }>
  turns: Array<ReturnType<typeof readTurn>>
  modelOperations: Array<ReturnType<typeof readModelOperation>>
  toolInvocations: Array<ReturnType<typeof readToolInvocation>>
}

export type MechanicalCheck = {
  name: string
  layer: "program" | "harness" | "sample" | "policy"
  passed: boolean
  detail: string
}

export async function prepareScenario(input: {
  scenario: SharedPolicyScenario
  workspaceRoot: string
  opaqueSampleId: string
  courseFixtureText?: string
}) {
  mkdirSync(input.workspaceRoot, { recursive: true })
  const fixtureText =
    input.courseFixtureText ??
    (await Bun.file(new URL("./fixtures/course.md", import.meta.url)).text())
  await Bun.write(join(input.workspaceRoot, COURSE_RELATIVE_PATH), fixtureText)
  const databasePath = join(input.workspaceRoot, "learner-home.sqlite")
  let database = openRepaDatabase(databasePath)

  await establishCourse(database, input.workspaceRoot)
  if (input.scenario.setup === "controlled_prior_transcript") {
    establishControlledTranscript(database)
  } else if (input.scenario.setup === "eligible_agenda") {
    establishAgendaConcern(database, input.scenario)
    database.close()
    database = openRepaDatabase(databasePath)
  }

  const actualSessionId =
    input.scenario.setup === "controlled_prior_transcript"
      ? "session:controlled-history"
      : `session:${input.opaqueSampleId}`
  let logicalNow = VIRTUAL_TIMES.runAt - 1
  const prepared: PreparedScenario = {
    database,
    databasePath,
    workspaceRoot: input.workspaceRoot,
    scenario: input.scenario,
    identity: {
      sessionId: actualSessionId,
      turnId: `turn:${input.opaqueSampleId}`,
      userItemId: `item:user:${input.opaqueSampleId}`,
      assistantItemId: `item:assistant:${input.opaqueSampleId}`,
      modelOperationId: (stepNumber) => `model:${input.opaqueSampleId}:${stepNumber}`,
      toolItemId: (durableInvocationId) =>
        `item:tool:${input.opaqueSampleId}:${durableInvocationId}`,
    },
    clock: () => ++logicalNow,
    initialSnapshot: captureDurableSnapshot(database),
  }
  return prepared
}

export function captureDurableSnapshot(database: Database): DurableLabSnapshot {
  const sessionIds = (
    database
      .query("SELECT session_id FROM session ORDER BY created_at ASC, session_id ASC")
      .all() as Array<{ session_id: string }>
  ).map((row) => row.session_id)
  const turnIds = (
    database
      .query("SELECT turn_id FROM turn ORDER BY started_at ASC, turn_id ASC")
      .all() as Array<{ turn_id: string }>
  ).map((row) => row.turn_id)
  const modelOperationIds = (
    database
      .query(`
        SELECT model_operation_id
        FROM model_operation
        ORDER BY sampled_at ASC, model_operation_id ASC
      `)
      .all() as Array<{ model_operation_id: string }>
  ).map((row) => row.model_operation_id)
  const invocationIds = (
    database
      .query(`
        SELECT invocation_id
        FROM tool_invocation
        ORDER BY created_at ASC, invocation_id ASC
      `)
      .all() as Array<{ invocation_id: string }>
  ).map((row) => row.invocation_id)
  const concernIds = (
    database
      .query("SELECT revisit_id FROM agenda_revisit ORDER BY created_at ASC, revisit_id ASC")
      .all() as Array<{ revisit_id: string }>
  ).map((row) => row.revisit_id)

  return {
    stateRevision: readStateRevision(database),
    lastStateTransitionAt: readLastStateTransitionAt(database),
    activeCourse: readActiveCourseContext(database) ?? null,
    agendaConcerns: concernIds.map((id) => readFutureAttentionConcern(database, id)),
    learnerSteering: listTimedLearnerSteering(database),
    sessions: sessionIds.map((sessionId) => ({
      sessionId,
      items: readSessionItems(database, sessionId),
    })),
    turns: turnIds.map((id) => readTurn(database, id)),
    modelOperations: modelOperationIds.map((id) => readModelOperation(database, id)),
    toolInvocations: invocationIds.map((id) => readToolInvocation(database, id)),
  }
}

export function assessScenario(input: {
  prepared: PreparedScenario
  finalSnapshot: DurableLabSnapshot
  observations: readonly ObservedModelCall[]
  outcomeText: string | undefined
  executionFailure?: { name: string; message: string }
}) {
  const { prepared, finalSnapshot } = input
  const initial = prepared.initialSnapshot
  const scenario = prepared.scenario
  const actualTurn = finalSnapshot.turns.find(
    (turn) => turn.turnId === prepared.identity.turnId,
  )
  const initialConcernIds = new Set(initial.agendaConcerns.map((concern) => concern.id))
  const newConcerns = finalSnapshot.agendaConcerns.filter(
    (concern) => !initialConcernIds.has(concern.id),
  )
  const openConcerns = finalSnapshot.agendaConcerns.filter(
    (concern) => concern.status === "open",
  )
  const initialCourse = initial.activeCourse
  const finalCourse = finalSnapshot.activeCourse
  const providerInputRecord = JSON.stringify(
    input.observations.map((observation) => ({
      request: observation.request,
      providerRequest: observation.providerRequest,
    })),
  )
  const currentModelPrefix = `model:${prepared.identity.turnId.slice("turn:".length)}:`
  const actualModels = finalSnapshot.modelOperations.filter((operation) =>
    operation.modelOperationId.startsWith(currentModelPrefix),
  )
  const actualAssistantItems = finalSnapshot.sessions.flatMap((session) =>
    session.items.filter((item) => item.itemId === prepared.identity.assistantItemId),
  )
  const providerToolAttempts = observedToolAttempts(input.observations)
  const attemptedMutationTools = providerToolAttempts
    .filter((attempt) => MUTATING_TOOL_NAMES.has(attempt.toolName))
    .map((attempt) => attempt.toolName)
  const expectedMutationTools = scenario.expectedMutationTool
    ? [scenario.expectedMutationTool]
    : []
  const rejectedInvocations = finalSnapshot.toolInvocations.filter(
    (invocation) =>
      invocation.status === "failed" ||
      invocation.error !== undefined ||
      isRejectedToolResult(invocation.result),
  )
  const durableToolNames = finalSnapshot.toolInvocations.map(
    (invocation) => invocation.toolName,
  )
  const successfulMaterialReads = finalSnapshot.toolInvocations.filter(
    (invocation) =>
      invocation.toolName === "read_current_course_material" &&
      invocation.status === "completed" &&
      !isRejectedToolResult(invocation.result),
  )
  const expectedExplicitNotBefore = Date.parse("2026-07-13T20:00:00+08:00")
  const explicitConcern = newConcerns[0]
  const explicitSourceItem = finalSnapshot.sessions
    .flatMap((session) => session.items)
    .find((item) => item.itemId === explicitConcern?.sourceItemId)

  const checks: MechanicalCheck[] = [
    check(
      "Turn reached a legal durable terminal state",
      "program",
      actualTurn !== undefined && actualTurn.status !== "running",
      actualTurn ? `status=${actualTurn.status}` : "actual Turn missing",
    ),
    check(
      "every actual model operation is terminal",
      "program",
      actualModels.length > 0 && actualModels.every((operation) => operation.status !== "running"),
      `${actualModels.length} model operations`,
    ),
    check(
      "every tool invocation is terminal",
      "program",
      finalSnapshot.toolInvocations.every((invocation) => invocation.status !== "running"),
      `${finalSnapshot.toolInvocations.length} tool invocations`,
    ),
    check(
      "terminal Turn and durable assistant occurrence agree",
      "program",
      actualTurn?.status === "completed"
        ? actualAssistantItems.length === 1 &&
            Boolean(input.outcomeText?.trim()) &&
            actualAssistantItems[0]?.content === input.outcomeText
        : actualAssistantItems.length === 0 && input.outcomeText === undefined,
      `${actualAssistantItems.length} durable assistant items`,
    ),
    check(
      "observer lifecycle is terminal and consistent with the runner outcome",
      "harness",
      input.observations.length > 0 &&
        input.observations.every(
          (observation) =>
            observation.status === "completed" ||
            observation.status === "failed" ||
            observation.status === "cancelled",
        ) &&
        (input.executionFailure !== undefined ||
          input.observations.every((observation) => observation.status === "completed")),
      `${input.observations.length} calls; failure=${input.executionFailure !== undefined}`,
    ),
    check(
      "provider execution produced a reviewable policy sample",
      "sample",
      input.executionFailure === undefined &&
        actualTurn?.status === "completed" &&
        input.observations.length > 0 &&
        input.observations.every((observation) => observation.status === "completed"),
      input.executionFailure
        ? `${input.executionFailure.name}: ${input.executionFailure.message}`
        : `Turn=${actualTurn?.status ?? "missing"}; calls=${input.observations.length}`,
    ),
    check(
      "observer captured the production shared policy",
      "harness",
      input.observations.length > 0 &&
        providerInputRecord.includes(
          "You are the model component participating in Repa's Tutor behavior",
        ),
      `${input.observations.length} provider calls`,
    ),
    check(
      "lab labels and qualitative oracle text were absent from provider inputs",
      "harness",
      !providerInputRecord.includes(scenario.id) &&
        !providerInputRecord.includes(scenario.family) &&
        !providerInputRecord.includes(scenario.qualitativeCriterion) &&
        !providerInputRecord.includes(scenario.prohibitedOutcome),
      scenario.id,
    ),
    check(
      "provider tool attempts have matching durable invocations",
      "policy",
      sameMultiset(
        providerToolAttempts.map((attempt) => attempt.toolName),
        durableToolNames,
      ),
      `${providerToolAttempts.length} provider attempts; ${durableToolNames.length} durable invocations`,
    ),
    check(
      "no tool attempt was rejected or failed",
      "policy",
      rejectedInvocations.length === 0,
      rejectedInvocations
        .map((invocation) => `${invocation.toolName}:${invocation.status}`)
        .join(", ") || "none",
    ),
    check(
      "mutation attempts exactly match the predeclared condition",
      "policy",
      JSON.stringify(attemptedMutationTools) === JSON.stringify(expectedMutationTools),
      `attempted=${JSON.stringify(attemptedMutationTools)} expected=${JSON.stringify(expectedMutationTools)}`,
    ),
    check(
      "current source-grounded material was read successfully before the final response",
      "policy",
      scenario.materialRead === "optional" || successfulMaterialReads.length >= 1,
      `${scenario.materialRead}; ${successfulMaterialReads.length} successful material reads`,
    ),
    check(
      "learning-state revision delta matches the predeclared condition",
      "policy",
      finalSnapshot.stateRevision - initial.stateRevision ===
        scenario.expectedStateRevisionDelta,
      `${initial.stateRevision} -> ${finalSnapshot.stateRevision}`,
    ),
    check(
      "open Agenda count matches the predeclared condition",
      "policy",
      openConcerns.length === scenario.expectedOpenAgendaAfter,
      `${openConcerns.length} open of ${finalSnapshot.agendaConcerns.length} total`,
    ),
    check(
      "course view and route did not move during these first-move conditions",
      "policy",
      Boolean(initialCourse && finalCourse) &&
        initialCourse?.courseViewRevisionId === finalCourse?.courseViewRevisionId &&
        initialCourse?.route.version === finalCourse?.route.version &&
        initialCourse?.route.anchor.itemId === finalCourse?.route.anchor.itemId,
      `${initialCourse?.route.version ?? "missing"} -> ${finalCourse?.route.version ?? "missing"}`,
    ),
    check(
      "no learner-wide steering was invented",
      "policy",
      finalSnapshot.learnerSteering.length === initial.learnerSteering.length,
      `${initial.learnerSteering.length} -> ${finalSnapshot.learnerSteering.length}`,
    ),
  ]

  if (scenario.id === "explicit_later_return") {
    checks.push(
      check(
        "explicit return created exactly one source-grounded learner-requested concern",
        "policy",
        newConcerns.length === 1 &&
          explicitConcern?.authorship.kind === "learner_requested" &&
          explicitConcern.target.courseViewRevisionId === initialCourse?.courseViewRevisionId &&
          explicitConcern.target.courseItemId === initialCourse.route.anchor.itemId,
        `${newConcerns.length} new concerns`,
      ),
      check(
        "explicit civil time was preserved",
        "policy",
        explicitConcern?.notBefore === expectedExplicitNotBefore,
        explicitConcern ? new Date(explicitConcern.notBefore).toISOString() : "missing",
      ),
      check(
        "explicit return is bound to the exact current learner source",
        "policy",
        explicitConcern?.sourceItemId === prepared.identity.userItemId &&
          explicitSourceItem?.role === "user" &&
          explicitSourceItem.content === scenario.learnerText &&
          explicitConcern.authorship.kind === "learner_requested" &&
          scenario.learnerText.includes(
            explicitConcern.authorship.learnerRequestExcerpt,
          ),
        explicitSourceItem
          ? `${explicitSourceItem.role}:${explicitSourceItem.itemId}`
          : "source missing",
      ),
    )
  } else {
    checks.push(
      check(
        "no new Agenda concern was created",
        "policy",
        newConcerns.length === 0,
        `${newConcerns.length} new concerns`,
      ),
    )
  }

  if (scenario.setup === "eligible_agenda") {
    const seeded = finalSnapshot.agendaConcerns.find(
      (concern) => concern.id === SEEDED_AGENDA_ID,
    )
    const expectedStatus =
      scenario.expectedMutationTool === ADDRESS_FUTURE_ATTENTION_TOOL
        ? { status: "addressed", version: 2 }
        : { status: "open", version: 1 }
    checks.push(
      check(
        "seeded Agenda disposition matches the current complete occurrence",
        "policy",
        seeded?.status === expectedStatus.status && seeded.version === expectedStatus.version,
        seeded ? `${seeded.status}@v${seeded.version}` : "seeded concern missing",
      ),
    )
  }

  const harnessIntegrityPassed = checks
    .filter((item) => item.layer === "harness")
    .every((item) => item.passed)
  const reviewablePolicySample = harnessIntegrityPassed && checks
    .filter((item) => item.layer === "sample")
    .every((item) => item.passed)
  return {
    checks,
    programPassed: checks.filter((item) => item.layer === "program").every((item) => item.passed),
    harnessIntegrityPassed,
    reviewablePolicySample,
    mechanicalPolicyPassed:
      reviewablePolicySample &&
      checks.filter((item) => item.layer === "policy").every((item) => item.passed),
    diagnostics: {
      providerToolAttempts,
      durableToolNames,
      attemptedMutationTools,
      rejectedInvocations: rejectedInvocations.map((invocation) => ({
        invocationId: invocation.invocationId,
        toolName: invocation.toolName,
        status: invocation.status,
        result: invocation.result,
        error: invocation.error,
      })),
      materialRead: successfulMaterialReads.length > 0,
      agendaSourceRead: finalSnapshot.toolInvocations.some(
        (invocation) => invocation.toolName === "read_future_attention_source",
      ),
      providerModelIds: input.observations.flatMap((observation) =>
        observation.responseMetadata.flatMap((metadata) => {
          if (
            typeof metadata === "object" &&
            metadata !== null &&
            !Array.isArray(metadata) &&
            typeof metadata.modelId === "string"
          ) {
            return [metadata.modelId]
          }
          return []
        }),
      ),
      qualitativeReview: "pending",
    },
  }
}

function observedToolAttempts(observations: readonly ObservedModelCall[]) {
  const attempts = new Map<string, { callSequence: number; toolCallId: string; toolName: string }>()
  for (const observation of observations) {
    for (const part of observation.streamParts) {
      if (typeof part !== "object" || part === null || Array.isArray(part)) continue
      if (part.type === "tool-call") {
        if (typeof part.toolCallId !== "string" || typeof part.toolName !== "string") continue
        attempts.set(`${observation.sequence}:${part.toolCallId}`, {
          callSequence: observation.sequence,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
        })
      } else if (part.type === "tool-input-start") {
        if (typeof part.id !== "string" || typeof part.toolName !== "string") continue
        const key = `${observation.sequence}:${part.id}`
        if (!attempts.has(key)) {
          attempts.set(key, {
            callSequence: observation.sequence,
            toolCallId: part.id,
            toolName: part.toolName,
          })
        }
      }
    }
  }
  return [...attempts.values()]
}

function isRejectedToolResult(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "ok" in value &&
    value.ok === false
  )
}

function sameMultiset(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

function check(
  name: string,
  layer: MechanicalCheck["layer"],
  passed: boolean,
  detail: string,
): MechanicalCheck {
  return { name, layer, passed, detail }
}

async function establishCourse(database: Database, workspaceRoot: string) {
  const sourceItemId = "item:course-setup"
  createSession(database, {
    sessionId: "session:course-setup",
    createdAt: VIRTUAL_TIMES.courseRegisteredAt - 2,
  })
  admitUserTurn(database, {
    sessionId: "session:course-setup",
    turnId: "turn:course-setup",
    itemId: sourceItemId,
    content: "Use course.md as the active course.",
    createdAt: VIRTUAL_TIMES.courseRegisteredAt - 1,
  })
  const observation = await observeMarkdownArtifact({
    workspaceRoot,
    relativePath: COURSE_RELATIVE_PATH,
    observedAt: VIRTUAL_TIMES.courseObservedAt,
  })
  registerMarkdownCourse(database, {
    effectId: "effect:course-setup",
    causeItemId: sourceItemId,
    learningSpaceId: LEARNING_SPACE_ID,
    courseId: COURSE_ID,
    artifactId: ARTIFACT_ID,
    title: "JavaScript object identity",
    observation,
    occurredAt: VIRTUAL_TIMES.courseRegisteredAt,
  })
  finishTurn(database, {
    turnId: "turn:course-setup",
    outcome: "completed",
    finishedAt: VIRTUAL_TIMES.courseRegisteredAt + 1,
  })
}

function establishControlledTranscript(database: Database) {
  const at = VIRTUAL_TIMES.priorTranscriptAt
  createSession(database, { sessionId: "session:controlled-history", createdAt: at })
  admitUserTurn(database, {
    sessionId: "session:controlled-history",
    turnId: "turn:controlled-history",
    itemId: "item:user:controlled-history",
    content: CONTROLLED_PRIOR_TRANSCRIPT.user,
    createdAt: at + 1,
  })
  appendSessionItem(database, {
    sessionId: "session:controlled-history",
    turnId: "turn:controlled-history",
    itemId: "item:assistant:controlled-history",
    role: "assistant",
    content: CONTROLLED_PRIOR_TRANSCRIPT.assistant,
    createdAt: at + 2,
  })
  finishTurn(database, {
    turnId: "turn:controlled-history",
    outcome: "completed",
    finishedAt: at + 3,
  })
}

function establishAgendaConcern(database: Database, scenario: SharedPolicyScenario) {
  if (!scenario.agendaReason) {
    throw new Error(`Agenda scenario has no reason: ${scenario.id}`)
  }
  const at = VIRTUAL_TIMES.agendaSourceAt
  const sessionId = "session:agenda-source"
  const turnId = "turn:agenda-source"
  const sourceItemId = "item:user:agenda-source"
  const modelOperationId = "model:agenda-source"
  createSession(database, { sessionId, createdAt: at })
  admitUserTurn(database, {
    sessionId,
    turnId,
    itemId: sourceItemId,
    content: SHARED_AGENDA_SOURCE,
    createdAt: at + 1,
  })
  const operation = beginTutorModelOperation(database, {
    modelOperationId,
    turnId,
    sessionId,
    sampledAt: at + 2,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: POLICY_PROFILE_REVISION,
  })
  if ("exhausted" in operation || operation.replayed) {
    throw new Error("Agenda fixture could not create its source model operation")
  }
  const activeCourse = readActiveCourseContext(database)
  if (!activeCourse) throw new Error("Agenda fixture has no active course")
  createFutureAttentionConcern(database, {
    effectId: "effect:agenda-seed",
    concernId: SEEDED_AGENDA_ID,
    causeItemId: sourceItemId,
    modelOperationId,
    target: {
      courseId: activeCourse.courseId,
      courseViewRevisionId: activeCourse.courseViewRevisionId,
      courseItemId: activeCourse.route.anchor.itemId,
    },
    authorship: { kind: "tutor_initiated" },
    reason: scenario.agendaReason,
    notBefore: VIRTUAL_TIMES.agendaNotBefore,
    occurredAt: at + 3,
  })
  finishModelOperation(database, {
    modelOperationId,
    outcome: "completed",
    finishedAt: at + 4,
  })
  finishTurn(database, {
    turnId,
    outcome: "completed",
    finishedAt: at + 5,
  })
}
