Object.assign(globalThis as typeof globalThis & { REPA_CHANNEL: string; REPA_VERSION: string }, {
  REPA_CHANNEL: "latest",
  REPA_VERSION: "1.17.18",
})

import type { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { Database as DatabaseType } from "@opencode-ai/core/database/database"
import type { EventV2 as EventV2Type } from "@opencode-ai/core/event"
import type { LearningCommand as LearningCommandType } from "@opencode-ai/core/learning-command"
import type { SessionV1 as SessionV1Type } from "@opencode-ai/core/v1/session"
import type { Turn as TurnType } from "@opencode-ai/schema/turn"
import type { LearningCommandRuntime as LearningCommandRuntimeType } from "../src/learning-command/runtime"

if (process.env.REPA_GATE23_REAL_MODEL_APPROVED !== "1") {
  throw new Error("Set REPA_GATE23_REAL_MODEL_APPROVED=1 only for the maintainer-authorized Gate 23 qualification")
}

const workspace = process.env.REPA_GATE23_WORKDIR
const outputPath = process.env.REPA_GATE23_OUTPUT
const phase = process.env.REPA_GATE23_PHASE
const phases = [
  "setup",
  "collision",
  "clear",
  "ambiguous",
  "corrected",
  "product_floor_setup",
  "product_floor_control",
  "product_floor_positive",
  "zero_write",
  "intermittent_control",
  "intermittent",
] as const
type Phase = (typeof phases)[number]

if (
  !workspace ||
  !outputPath ||
  !process.env.REPA_CONFIG_CONTENT ||
  !process.env.REPA_AUTH_CONTENT ||
  !process.env.REPA_DB ||
  !process.env.REPA_MODELS_PATH ||
  !phases.some((value) => value === phase)
) {
  throw new Error(
    "Gate 23 qualification requires an isolated workspace, output, database, config, auth, model catalog, and valid phase",
  )
}
const selectedPhase = phase as Phase
const maximumProviderRequestsByPhase = {
  setup: 0,
  collision: 1,
  clear: 10,
  ambiguous: 4,
  corrected: 10,
  product_floor_setup: 4,
  product_floor_control: 2,
  product_floor_positive: 4,
  zero_write: 4,
  intermittent_control: 4,
  intermittent: 7,
} satisfies Record<Phase, number>
const remainingTotalProviderRequestsInput = process.env.REPA_GATE23_REMAINING_TOTAL_PROVIDER_REQUESTS
const remainingLegProviderRequestsInput = process.env.REPA_GATE23_REMAINING_LEG_PROVIDER_REQUESTS
if (!remainingTotalProviderRequestsInput?.match(/^\d+$/) || !remainingLegProviderRequestsInput?.match(/^\d+$/)) {
  throw new Error(
    "Gate 23 qualification requires explicit non-negative remaining total and leg provider-request budgets",
  )
}
const remainingTotalProviderRequests = Number(remainingTotalProviderRequestsInput)
const remainingLegProviderRequests = Number(remainingLegProviderRequestsInput)
const configuredPhaseProviderRequests = maximumProviderRequestsByPhase[selectedPhase]
const maximumProviderRequests = Math.min(
  configuredPhaseProviderRequests,
  remainingTotalProviderRequests,
  remainingLegProviderRequests,
)
const qualificationStartedAt = Date.now()

type HeaderProjection = Readonly<
  | { name: string; state: "credential" | "account_identity"; byteLength: number }
  | { name: string; state: "value"; value: string }
>

type CapturedProviderRequest = Readonly<{
  sequence: number
  phase: Phase
  scenario: string
  attempt: number
  method: string
  url: string
  headers: readonly HeaderProjection[]
  body: string
  bodyBytes: number
  bodyFingerprint: string
}>

type CapturedCarrierRequest = Readonly<{
  sequence: number
  phase: Phase
  scenario: string
  method: string
  url: string
  path: string
  query: string
  headers: readonly HeaderProjection[]
  requestBody: string
  requestBytes: number
  requestFingerprint: string
  responseStatus: number
  responseHeaders: readonly HeaderProjection[]
  responseBody: string
  responseBytes: number
  responseFingerprint: string
}>

const originalFetch = globalThis.fetch
const providerRequests: CapturedProviderRequest[] = []
const carrierRequests: CapturedCarrierRequest[] = []
const attempts = new Map<string, number>()
const blockProvider = process.env.REPA_GATE23_BLOCK_PROVIDER === "1"
const expectedProviderPrefix = "https://chatgpt.com/backend-api/codex/responses"
const expectedOauthRefreshUrl = "https://auth.openai.com/oauth/token"
const credentialHeaders = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-goog-api-key)$/i
const accountIdentityHeaders =
  /^(chatgpt-account-id|openai-organization|openai-project|x-organization-id|x-project-id)$/i
let activeScenario = "startup"
let oauthRefreshRequests = 0

function sha256(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function sha256Bytes(value: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function collectSecretStrings(value: unknown): string[] {
  if (typeof value === "string") return value.length > 8 ? [value] : []
  if (Array.isArray(value)) return value.flatMap(collectSecretStrings)
  if (!value || typeof value !== "object") return []
  return Object.values(value).flatMap(collectSecretStrings)
}

function requestContainsExactText(body: string, expected: string) {
  const visit = (value: unknown): boolean => {
    if (typeof value === "string") return value.includes(expected)
    if (Array.isArray(value)) return value.some(visit)
    return Boolean(value && typeof value === "object" && Object.values(value).some(visit))
  }
  return visit(JSON.parse(body))
}

async function bindFile(filename: string, recordedPath = filename) {
  const file = Bun.file(filename)
  if (!(await file.exists())) return { path: recordedPath, state: "absent" as const }
  const bytes = new Uint8Array(await file.arrayBuffer())
  return {
    path: recordedPath,
    state: "present" as const,
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  }
}

async function runGit(args: readonly string[]) {
  const child = Bun.spawn(["git", "-C", repositoryRoot, ...args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed (${exitCode}): ${stderr.trim()}`)
  return new Uint8Array(stdout)
}

function decodeNullSeparated(value: Uint8Array) {
  return new TextDecoder()
    .decode(value)
    .split("\0")
    .filter((item) => item.length > 0)
    .map((item) => item.replaceAll("\\", "/"))
    .toSorted()
}

async function captureWorkingTree() {
  const [headBytes, branchBytes, statusBytes, trackedBytes, untrackedBytes, indexBytes, stagedDiff, unstagedDiff] =
    await Promise.all([
      runGit(["rev-parse", "HEAD"]),
      runGit(["branch", "--show-current"]),
      runGit(["status", "--porcelain=v2", "--branch", "--untracked-files=all"]),
      runGit(["ls-files", "-z", "--cached"]),
      runGit(["ls-files", "-z", "--others", "--exclude-standard"]),
      runGit(["ls-files", "-z", "--stage"]),
      runGit(["diff", "--binary", "--cached", "--no-ext-diff"]),
      runGit(["diff", "--binary", "--no-ext-diff"]),
    ])
  const tracked = decodeNullSeparated(trackedBytes)
  const untracked = decodeNullSeparated(untrackedBytes)
  const files = await Promise.all(
    [
      ...tracked.map((filename) => ({ filename, tracking: "tracked" as const })),
      ...untracked.map((filename) => ({ filename, tracking: "untracked" as const })),
    ].map(async ({ filename, tracking }) => ({
      tracking,
      ...(await bindFile(path.join(repositoryRoot, filename), filename)),
    })),
  )
  const text = new TextDecoder()
  const projection = (value: Uint8Array) => ({ byteLength: value.byteLength, sha256: sha256Bytes(value) })
  const value = {
    head: text.decode(headBytes).trim(),
    branch: text.decode(branchBytes).trim(),
    status: text.decode(statusBytes),
    trackedCount: tracked.length,
    untrackedCount: untracked.length,
    files,
    gitIndex: projection(indexBytes),
    stagedDiff: projection(stagedDiff),
    unstagedDiff: projection(unstagedDiff),
    ignoredPolicy: "excluded_by_git_standard_rules; no ignored path is admitted as a Gate 23 source input",
  }
  return { ...value, fingerprint: sha256(JSON.stringify(value)) }
}

function projectHeader(name: string, value: string): HeaderProjection {
  if (credentialHeaders.test(name)) return { name, state: "credential", byteLength: utf8Bytes(value) }
  if (accountIdentityHeaders.test(name)) return { name, state: "account_identity", byteLength: utf8Bytes(value) }
  return { name, state: "value", value }
}

globalThis.fetch = Object.assign(
  async (input: Parameters<typeof fetch>[0], init?: BunFetchRequestInit) => {
    const request = new Request(input, init)
    if (request.url.startsWith(expectedProviderPrefix)) {
      if (providerRequests.length >= maximumProviderRequests) {
        await recordRunnerEvent({
          type: "provider_request_refused_by_ceiling",
          scenario: activeScenario,
          configuredPhaseProviderRequests,
          remainingTotalProviderRequests,
          remainingLegProviderRequests,
          capturedProviderRequests: providerRequests.length,
        })
        throw new Error("Gate 23 refused a provider request that would exceed its remaining authorized ceiling")
      }
      const body = await request.clone().text()
      const attempt = (attempts.get(activeScenario) ?? 0) + 1
      attempts.set(activeScenario, attempt)
      const captured = {
        sequence: providerRequests.length,
        phase: selectedPhase,
        scenario: activeScenario,
        attempt,
        method: request.method,
        url: request.url,
        headers: [...request.headers.entries()]
          .map(([name, value]) => projectHeader(name, value))
          .toSorted((left, right) => left.name.localeCompare(right.name)),
        body,
        bodyBytes: utf8Bytes(body),
        bodyFingerprint: sha256(body),
      } satisfies CapturedProviderRequest
      const credentials = collectSecretStrings(JSON.parse(process.env.REPA_AUTH_CONTENT!))
      requireEvidence(
        credentials.every((value) => !captured.body.includes(value)),
        "a captured provider body contained a credential value",
      )
      providerRequests.push(captured)
      await Bun.write(
        requestCapturePath,
        JSON.stringify(
          { phase: selectedPhase, captureStage: "incremental", secretScan: "passed", requests: providerRequests },
          null,
          2,
        ) + "\n",
      )
      await recordRunnerEvent({
        type: "provider_request_captured",
        scenario: activeScenario,
        attempt,
        requestSequence: captured.sequence,
        bodyBytes: captured.bodyBytes,
        bodyFingerprint: captured.bodyFingerprint,
      })
      if (blockProvider) throw new Error("Gate 23 diagnostic blocked the provider request before transport")
    } else if (request.url === expectedOauthRefreshUrl && request.method === "POST") {
      oauthRefreshRequests += 1
      if (oauthRefreshRequests > 1) {
        throw new Error("Gate 23 refused more than one OAuth refresh request in one phase")
      }
      await recordRunnerEvent({
        type: "oauth_refresh_forwarded",
        route: expectedOauthRefreshUrl,
        method: request.method,
        request: oauthRefreshRequests,
        sensitiveBodyCapture: "prohibited",
      })
    } else if (activeScenario !== "startup" && request.url.startsWith("https://")) {
      throw new Error(`Gate 23 refused unexpected external route before transport: ${request.url}`)
    }
    return originalFetch(input, init)
  },
  { preconnect: originalFetch.preconnect },
)

const { asc, eq, sql } = await import("drizzle-orm")
const { Effect, Layer } = await import("effect")
const { Database: SQLiteDatabase } = await import("bun:sqlite")
const path = await import("node:path")
const fs = await import("node:fs/promises")
const { createOpencodeClient } = await import("@opencode-ai/sdk/v2")
const { AdvisoryPlanSuggestion } = await import("@opencode-ai/core/advisory-plan-suggestion")
const { Assignment } = await import("@opencode-ai/core/assignment")
const { Course } = await import("@opencode-ai/core/course")
const { Database } = await import("@opencode-ai/core/database/database")
const { LayerNode } = await import("@opencode-ai/core/effect/layer-node")
const { FutureAttention } = await import("@opencode-ai/core/future-attention")
const { LearnerGoal } = await import("@opencode-ai/core/learner-goal")
const { LearnerStateJudgment } = await import("@opencode-ai/core/learner-state-judgment")
const { LearningCommand } = await import("@opencode-ai/core/learning-command")
const { AdmittedLearnerOccurrenceTable } = await import("@opencode-ai/core/learning-command/occurrence.sql")
const { LearningCommandInvocationTable } = await import("@opencode-ai/core/learning-command/sql")
const { LearningContext } = await import("@opencode-ai/core/learning-context")
const { LearningFrontier } = await import("@opencode-ai/core/learning-frontier")
const { TurnLearningContextCutTable, TurnModelCapacityTable } = await import("@opencode-ai/core/learning-context/sql")
const { ModelV2 } = await import("@opencode-ai/core/model")
const { ProviderV2 } = await import("@opencode-ai/core/provider")
const { SessionV1 } = await import("@opencode-ai/core/v1/session")
const { TurnLifecycle } = await import("@opencode-ai/core/turn/turn")
const { TurnLearningContext } = await import("@opencode-ai/core/turn/learning-context")
const { TurnInputTable, TurnModelOperationTable, TurnToolCandidateTable, TurnToolInvocationTable } = await import(
  "@opencode-ai/core/turn/sql"
)
const { Turn } = await import("@opencode-ai/schema/turn")
const { TurnEvent } = await import("@opencode-ai/schema/turn-event")
const { AppRuntime } = await import("../src/effect/app-runtime")
const { InstanceRef } = await import("../src/effect/instance-ref")
const { EventV2Bridge } = await import("../src/event-v2-bridge")
const { LearningCommandRuntime } = await import("../src/learning-command/runtime")
const { Permission } = await import("../src/permission")
const { InstanceStore } = await import("../src/project/instance-store")
const { ServerAuth } = await import("../src/server/auth")
const { Server } = await import("../src/server/server")
const { MessageID, SessionID } = await import("../src/session/schema")
const { Session } = await import("../src/session/session")
const { SessionTurnEvents } = await import("../src/session/turn-events")
const { ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID } = await import("../src/tool/advisory-plan-suggestion-read")
const { ASSIGNMENT_READ_TOOL_ID } = await import("../src/tool/assignment-read")
const { COURSE_QUERY_TOOL_ID, LEARNING_NAVIGATION_QUERY_TOOL_ID } = await import("../src/tool/course-navigation-query")
const { FUTURE_ATTENTION_READ_TOOL_ID } = await import("../src/tool/future-attention-read")
const { LEARNER_GOAL_QUERY_TOOL_ID } = await import("../src/tool/learner-goal-query")
const { LEARNER_STATE_JUDGMENT_READ_TOOL_ID } = await import("../src/tool/learner-state-judgment-read")
const { LEARNING_INTERACTION_READ_TOOL_ID } = await import("../src/tool/learning-interaction-read")
const { LEARNER_RESPONSE_EVIDENCE_READ_TOOL_ID } = await import("../src/tool/learner-response-evidence-read")
const { LEARNING_MATERIAL_QUERY_TOOL_ID } = await import("../src/tool/learning-material-query")
const { LEARNING_MATERIAL_READ_TOOL_ID } = await import("../src/tool/learning-material-read")
const { admitModelWithLearningContext } = await import("../test/fixture/model-admission")
const { materializeTestSession } = await import("../test/fixture/session")

const model = {
  providerID: ProviderV2.ID.openai,
  modelID: ModelV2.ID.make("gpt-5.6-luna"),
}
const automaticContext = LearningContext.AUTOMATIC_CONTEXT_CAPABILITY_ID
const readCapabilities = [
  automaticContext,
  COURSE_QUERY_TOOL_ID,
  LEARNING_NAVIGATION_QUERY_TOOL_ID,
  LEARNER_GOAL_QUERY_TOOL_ID,
  LEARNING_MATERIAL_QUERY_TOOL_ID,
  LEARNING_MATERIAL_READ_TOOL_ID,
  LEARNING_INTERACTION_READ_TOOL_ID,
  LEARNER_RESPONSE_EVIDENCE_READ_TOOL_ID,
  FUTURE_ATTENTION_READ_TOOL_ID,
  ASSIGNMENT_READ_TOOL_ID,
  LEARNER_STATE_JUDGMENT_READ_TOOL_ID,
  ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID,
] as const
const omittedReadCapabilities = new Set(
  (process.env.REPA_GATE23_OMIT_READ_CAPABILITIES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
)
const effectiveReadCapabilities = readCapabilities.filter((capability) => !omittedReadCapabilities.has(capability))
const writeCapabilities = [
  LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
  LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
  LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
  LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
  LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
  LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
  LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY,
  LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY,
  LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY,
] as const
const permitted = new Set<string>(
  selectedPhase === "setup" ||
  selectedPhase === "corrected" ||
  selectedPhase === "product_floor_setup" ||
  selectedPhase === "intermittent"
    ? [...effectiveReadCapabilities, ...writeCapabilities]
    : effectiveReadCapabilities,
)

function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gate 23 real-model qualification failed: ${message}`)
}

function recordOf(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function scenarioText(value: unknown) {
  const text = recordOf(value)?.text
  return Array.isArray(text)
    ? text.filter((item): item is string => typeof item === "string" && item.length > 0).join("\n")
    : ""
}

function questionCount(value: string) {
  return value.match(/[?？]/g)?.length ?? 0
}

function clarificationActCount(value: string) {
  const interrogatives = questionCount(value)
  if (interrogatives > 0) return interrogatives
  return value.match(/(?:^|[。.!！；;]\s*)请(?:你)?(?:贴出|提供|发来|告诉|确认|给出|说明)/g)?.length ?? 0
}

function requireNoManagementLeak(value: string, label: string) {
  requireEvidence(
    !/(?:msg|trn|ses|tri|lco|fac|asn|lsj|aps)_[a-zA-Z0-9]+|\bContext\b|\bowner\b|内部(?:ID|编号|状态)|生命周期|候选(?:行|排名)|上下文切片|状态表/i.test(
      value,
    ),
    `${label} leaked internal identity, Context, lifecycle, candidate, or owner-state vocabulary`,
  )
  requireEvidence(
    !/(?:你|您)(?:已经|已)(?:掌握|完成|遵守)|(?:时间过去|沉默|没有回复).*(?:进展|完成|放弃|遵守)|(?:作业|建议).*(?:证明|表明).*(?:掌握|进展|遵守)/i.test(
      value,
    ),
    `${label} fabricated mastery, completion, progress, activity, or adherence`,
  )
}

function requireSubstantiveScaffold(value: string, label: string) {
  requireEvidence(questionCount(value) === 1, `${label} did not ask exactly one question`)
  requireEvidence(
    !/[，,；;]\s*(?:而|并且|以及|同时|还要|再).{0,64}(?:哪|多少|是否|如何|怎样|什么)/is.test(value),
    `${label} packed a second interrogative into one compound question`,
  )
  requireEvidence(
    /奇数|归纳|证明|等式|反例|不变量|步骤|\bk\b|n²|n\^2|平方|\b(?:induction|proof|invariant|equation|counterexample|step)\b/i.test(
      value,
    ),
    `${label} did not ask a substantive learning question`,
  )
  requireEvidence(
    !/哪(?:一|个)份|哪一个证明|哪个证明|尝试\s*[AaＡａ].*(?:还是|或).*尝试\s*[BbＢｂ]|尝试\s*[BbＢｂ].*(?:还是|或).*尝试\s*[AaＡａ]/is.test(
      value,
    ),
    `${label} asked a referent clarification instead of taking the clear move`,
  )
  requireNoManagementLeak(value, label)
}

function requireReferentClarification(value: string, label: string) {
  requireEvidence(questionCount(value) === 1, `${label} did not ask exactly one question`)
  requireEvidence(
    /哪(?:一|个)份|哪一个证明|哪个证明|尝试\s*[AaＡａ].*(?:还是|或).*尝试\s*[BbＢｂ]|尝试\s*[BbＢｂ].*(?:还是|或).*尝试\s*[AaＡａ]|奇数.*(?:还是|或).*(?:自然数|1\s*\+\s*2)|(?:自然数|1\s*\+\s*2).*(?:还是|或).*奇数/is.test(
      value,
    ),
    `${label} did not expose the learner-visible A/B referent distinction`,
  )
  requireEvidence(
    !/通分|分子|展开|下一个奇数|2\s*k|错误(?:在|是)|应(?:该)?(?:加|改|写|等于)/i.test(value),
    `${label} started solving one proof instead of only clarifying the referent`,
  )
  requireNoManagementLeak(value, label)
}

function requireTransparentReversibleMove(value: string, label: string) {
  requireEvidence(value.trim().length > 0, `${label} returned no learner-facing move`)
  requireEvidence(
    /奇数|归纳|证明|等式|反例|不变量|递推|步骤|\bk\b|\bn\b|平方/i.test(value),
    `${label} did not begin a useful learning move`,
  )
  requireEvidence(
    /请|先|试|写|找|检查|比较|说明|举|想/i.test(value),
    `${label} did not give the learner a concrete reversible action`,
  )
  requireEvidence(
    !/(?:选项|菜单|请选择|你想先).{0,48}(?:课程|目标|作业|建议|计划)/is.test(value),
    `${label} exposed an internal choice menu`,
  )
  requireNoManagementLeak(value, label)
}

function scaffoldLevel(value: string) {
  const learnerPrompt =
    value
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean)
      .at(-1) ?? value
  if (
    /哪(?:一|个|项|处|里).{0,40}(?:错误|不匹配|必须保持的?不变量|不变量)|(?:错误|不匹配).{0,40}(?:哪(?:一|个|项|处|里)|指出|定位|找出)|必须保持的?.{0,24}哪(?:一|个).{0,16}不变量/is.test(
      learnerPrompt,
    )
  ) {
    return "diagnosis" as const
  }
  if (
    /(?:写成|写下|写出|改写|修正|修复|修补|补全|完成|继续|代入|展开|化简)/i.test(learnerPrompt) ||
    /(?:如何|怎样).{0,32}(?:改写|修正|修复|修补|补全|完成|继续)|(?:改写|修正|修复|修补|补全|完成|继续).{0,48}(?:如何|怎样|准备|先|下一步|哪(?:一|个)?(?:步|步骤)|写下|写出)|(?:修正|修复|改写|补全)(?:后|后的)?.{0,48}(?:应|要|可以)?(?:写成|写出|得到|补成).{0,24}(?:什么|哪(?:一|个|条|步|项))|(?:具体)?(?:写成|写下|写出).{0,24}(?:什么|哪(?:一|个|条|步|项))|(?:下一步|先).{0,24}(?:写出|改写|修正|修复|修补|补全|完成|继续)|写出.{0,64}(?:第一|下一|合法|修复|补全|完成|证明|等式|步骤)|\b(?:repair|complete|continue|rewrite|finish)\b.{0,40}\b(?:step|next|first|write)\b|\b(?:next|first|which)\b.{0,40}\b(?:repair|complete|continue|rewrite|finish)\b/is.test(
      learnerPrompt,
    )
  ) {
    return "repair_or_completion" as const
  }
  if (
    /多少|什么|哪(?:一|个|里|项)|错误|相差|新增|不匹配|还是|应该是|检查|判断|识别|定位|找出|指出|验证|是否.{0,32}(?:成立|正确|得到|足以|推出|保持|支撑)/is.test(
      learnerPrompt,
    )
  ) {
    return "diagnosis" as const
  }
  return "unclassified" as const
}

for (const [text, expected] of [
  ["在归纳步中，第一处无法直接推出的等号或不等号是哪一个？", "diagnosis"],
  ["面对 P(k+1) 的目标式时，你会把哪一部分改写成可使用归纳假设 P(k) 的形式？", "repair_or_completion"],
  ["若要证明 P(n+1)，你会把归纳假设具体写成哪一条等式或不等式？", "repair_or_completion"],
  ["归纳步开始时，你会先把归纳假设代入哪一个表达式？", "repair_or_completion"],
] as const) {
  requireEvidence(scaffoldLevel(text) === expected, `scaffold oracle misclassified its ${expected} control`)
}

function allowOnly(ids: readonly string[]) {
  return [
    { permission: "*", pattern: "*", action: "deny" as const },
    ...ids.map((permission) => ({ permission, pattern: "*", action: "allow" as const })),
  ]
}

const domainPrefixes = [
  "artifact",
  "course",
  "learning_course_material",
  "learner_default_course",
  "learner_course_route",
  "learner_goal",
  "learner_response_evidence",
  "material",
  "retained_steering",
  "future_attention",
  "assignment",
  "learner_state_judgment",
  "advisory_plan_suggestion",
] as const

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
const phaseEvidenceRoot = path.dirname(path.dirname(path.resolve(outputPath)))
const isolatedDataHome = process.env.XDG_DATA_HOME ? path.resolve(process.env.XDG_DATA_HOME) : undefined
requireEvidence(isolatedDataHome, "XDG_DATA_HOME is required for isolated credential refresh containment")
const isolatedDataRelative = path.relative(phaseEvidenceRoot, isolatedDataHome)
requireEvidence(
  isolatedDataRelative.length > 0 &&
    isolatedDataRelative !== ".." &&
    !isolatedDataRelative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(isolatedDataRelative),
  `XDG_DATA_HOME ${isolatedDataHome} is not contained by phase evidence root ${phaseEvidenceRoot}`,
)
const isolatedRefreshedAuthPath = path.join(isolatedDataHome, "repa", "auth.json")
requireEvidence(
  !(await Bun.file(isolatedRefreshedAuthPath).exists()),
  `isolated credential target already existed before the phase: ${isolatedRefreshedAuthPath}`,
)
const artifactStem = outputPath.endsWith(".json") ? outputPath.slice(0, -5) : outputPath
const candidateManifestPath = `${artifactStem}.candidate-input.manifest.json`
const preManifestPath = `${artifactStem}.manifest.pre.json`
const requestCapturePath = `${artifactStem}.requests.redacted.json`
const carrierCapturePath = `${artifactStem}.carrier.json`
const summaryPath = `${artifactStem}.summary.json`
const finalManifestPath = `${artifactStem}.manifest.final.json`
const runnerEventLogPath = `${artifactStem}.runner.events.jsonl`
const contractPath = "docs/research/repa-gate-23-integrated-learning-system-product-loop-2026-08-23.md"
const postRunDerivedArtifacts = [
  {
    path: contractPath,
    derivation:
      "review disposition metadata may change only after the same independent reviewer closes implementation/evidence",
  },
  {
    path: "docs/research/repa-gate-23-integrated-learning-system-product-loop-implementation-evidence-2026-08-23.md",
    derivation: "reconciled only after all retained provider and deterministic evidence is sealed",
  },
  {
    path: "packages/core/test/fixture/frozen-gate21a-collision.ts",
    derivation: "retained accepted collision input; Gate 23 never regenerates or rewrites it",
  },
  {
    path: "docs/README.md",
    derivation: "current-status projection reconciled after evidence and independent review disposition",
  },
  {
    path: "docs/fork-ledger.md",
    derivation: "provenance index reconciled after evidence and independent review disposition",
  },
] as const
const parentManifestPath = process.env.REPA_GATE23_PARENT_MANIFEST
const comparisonEvidencePath = process.env.REPA_GATE23_COMPARISON_EVIDENCE
const comparisonPhase: Partial<Record<Phase, Phase>> = {
  ambiguous: "clear",
  corrected: "clear",
  product_floor_positive: "product_floor_control",
  intermittent: "intermittent_control",
}
requireEvidence(
  Boolean(comparisonPhase[selectedPhase]) === Boolean(comparisonEvidencePath),
  `${selectedPhase} has the wrong clear-comparison evidence binding`,
)
const comparisonEvidence = comparisonEvidencePath ? await Bun.file(comparisonEvidencePath).json() : undefined
const comparisonPreManifestPath = comparisonEvidencePath
  ? `${comparisonEvidencePath.endsWith(".json") ? comparisonEvidencePath.slice(0, -5) : comparisonEvidencePath}.manifest.pre.json`
  : undefined
const comparisonPreManifest = comparisonPreManifestPath ? await Bun.file(comparisonPreManifestPath).json() : undefined
const startingDatabaseBinding = await bindFile(process.env.REPA_DB)
const workingTree = await captureWorkingTree()
requireEvidence(
  workingTree.head === "e2bcaa62a2b7f475528ad3c37e230bc8062d1270",
  `qualification baseline drifted to ${workingTree.head}`,
)
const candidateManifest = {
  manifestVersion: 1,
  stage: "candidate_input",
  phase: selectedPhase,
  capturedAt: qualificationStartedAt,
  repositoryRoot,
  workingTree,
  postRunDerivedArtifacts,
}
await Bun.write(candidateManifestPath, JSON.stringify(candidateManifest, null, 2) + "\n")
const runnerEvents: Array<Readonly<Record<string, unknown>>> = []
const recordRunnerEvent = async (event: Readonly<Record<string, unknown>>) => {
  runnerEvents.push({ sequence: runnerEvents.length, time: Date.now(), phase: selectedPhase, ...event })
  await Bun.write(runnerEventLogPath, runnerEvents.map((item) => JSON.stringify(item)).join("\n") + "\n")
}
const removeIsolatedRefreshedAuth = async () => {
  const existed = await Bun.file(isolatedRefreshedAuthPath).exists()
  await fs.rm(isolatedRefreshedAuthPath, { force: true })
  requireEvidence(
    !(await Bun.file(isolatedRefreshedAuthPath).exists()),
    `refreshed credential remained in the evidence boundary: ${isolatedRefreshedAuthPath}`,
  )
  await recordRunnerEvent({
    type: "isolated_refreshed_auth_removed",
    target: isolatedRefreshedAuthPath,
    existed,
    state: "absent",
  })
}
await recordRunnerEvent({ type: "candidate_sealed", candidateFingerprint: workingTree.fingerprint })
const preManifest = {
  manifestVersion: 1,
  stage: "pre_phase",
  phase: selectedPhase,
  qualificationStartedAt,
  authority: {
    trackedBaseline: "e2bcaa62a2b7f475528ad3c37e230bc8062d1270",
    acceptedContractSemanticSha256: "cdfe23f708dccf3c5327eded6b1436bb2fa84cfb3b32801b0c0122e37512d1f",
    runtime: {
      repaVersion: "1.17.18",
      channel: "latest",
      bun: Bun.version,
      node: process.version,
      runtimeTranspilerCache: process.env.BUN_RUNTIME_TRANSPILER_CACHE_PATH === "0" ? "disabled" : "default",
    },
    migration: { current: 34 },
    learningContextTuple: { schema: 1, policy: 6, renderer: 7, capabilityCatalog: 6 },
  },
  inputs: {
    workspace,
    database: startingDatabaseBinding,
    databaseWal: await bindFile(`${process.env.REPA_DB}-wal`),
    databaseShm: await bindFile(`${process.env.REPA_DB}-shm`),
    modelCatalog: await bindFile(process.env.REPA_MODELS_PATH),
    config: {
      byteLength: utf8Bytes(process.env.REPA_CONFIG_CONTENT),
      sha256: sha256(process.env.REPA_CONFIG_CONTENT),
    },
    credentialMaterial: {
      excluded: true,
      byteLength: utf8Bytes(process.env.REPA_AUTH_CONTENT),
    },
    inheritedEvidenceManifest: parentManifestPath ? await bindFile(parentManifestPath) : { state: "none" as const },
    clearComparisonEvidence: comparisonEvidencePath
      ? {
          evidence: await bindFile(comparisonEvidencePath),
          preManifest: await bindFile(comparisonPreManifestPath!),
        }
      : { state: "none" as const },
  },
  sources: {
    contract: await bindFile(path.join(repositoryRoot, contractPath), contractPath),
    runner: await bindFile(import.meta.path, path.relative(repositoryRoot, import.meta.path).replaceAll("\\", "/")),
    exhaustiveCandidateInput: await bindFile(candidateManifestPath),
    candidateFingerprint: workingTree.fingerprint,
  },
  outputs: {
    evidence: outputPath,
    requestCapture: requestCapturePath,
    carrierCapture: carrierCapturePath,
    summary: summaryPath,
    runnerEventLog: runnerEventLogPath,
    finalManifest: finalManifestPath,
  },
  valueStatus: {
    directlyStored: [
      "starting database bytes",
      "model catalog bytes",
      "contract/runner bytes",
      "complete tracked/untracked candidate file bindings and Git status",
    ],
    independentlyDerived: ["SHA-256 and byte lengths in this pre-phase manifest"],
    unavailable: [
      "result database",
      "provider requests",
      "carrier requests/responses",
      "Assistant result",
      "terminal outcome",
    ],
  },
}
await Bun.write(preManifestPath, JSON.stringify(preManifest, null, 2) + "\n")
const preManifestBinding = await bindFile(preManifestPath)
await recordRunnerEvent({ type: "pre_phase_manifest_sealed", preManifest: preManifestBinding })

const evidence = await AppRuntime.runPromise(
  InstanceStore.Service.use((store) =>
    Effect.gen(function* () {
      const instance = yield* store.load({ directory: workspace })
      const result = yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const events = yield* EventV2Bridge.Service
        const permission = yield* Permission.Service
        const sessions = yield* Session.Service
        const carrierFetch = Object.assign(
          async (input: RequestInfo | URL, init?: RequestInit) => {
            const incoming = input instanceof Request ? input : new Request(input, init)
            const headers = new Headers(incoming.headers)
            const auth = ServerAuth.header()
            if (auth && !headers.has("authorization")) headers.set("authorization", auth)
            const request = new Request(incoming, { headers })
            const requestBody = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text()
            const response = await Server.Default().app.fetch(request)
            const responseBody = await response.clone().text()
            const credentials = collectSecretStrings(JSON.parse(process.env.REPA_AUTH_CONTENT!))
            requireEvidence(
              credentials.every((value) => !requestBody.includes(value) && !responseBody.includes(value)),
              "a captured carrier request or response contained a credential value",
            )
            const url = new URL(request.url)
            const captured = {
              sequence: carrierRequests.length,
              phase: selectedPhase,
              scenario: activeScenario,
              method: request.method,
              url: request.url,
              path: url.pathname,
              query: url.search,
              headers: [...request.headers.entries()]
                .map(([name, value]) => projectHeader(name, value))
                .toSorted((left, right) => left.name.localeCompare(right.name)),
              requestBody,
              requestBytes: utf8Bytes(requestBody),
              requestFingerprint: sha256(requestBody),
              responseStatus: response.status,
              responseHeaders: [...response.headers.entries()]
                .map(([name, value]) => projectHeader(name, value))
                .toSorted((left, right) => left.name.localeCompare(right.name)),
              responseBody,
              responseBytes: utf8Bytes(responseBody),
              responseFingerprint: sha256(responseBody),
            } satisfies CapturedCarrierRequest
            carrierRequests.push(captured)
            await Bun.write(
              carrierCapturePath,
              JSON.stringify(
                { phase: selectedPhase, captureStage: "incremental", secretScan: "passed", requests: carrierRequests },
                null,
                2,
              ) + "\n",
            )
            await recordRunnerEvent({
              type: "carrier_request_captured",
              scenario: activeScenario,
              carrierSequence: captured.sequence,
              method: captured.method,
              path: captured.path,
              requestBytes: captured.requestBytes,
              requestFingerprint: captured.requestFingerprint,
              responseStatus: captured.responseStatus,
              responseBytes: captured.responseBytes,
              responseFingerprint: captured.responseFingerprint,
            })
            return response
          },
          { preconnect: originalFetch.preconnect },
        )
        const sdk = createOpencodeClient({
          baseUrl: "http://repa.internal",
          directory: workspace,
          fetch: carrierFetch,
        })
        const seedLayer = LayerNode.compile(LayerNode.group([Course.node, LearningCommandRuntime.node]), [
          [Database.node, Layer.succeed(Database.Service, database)],
          [Permission.node, Layer.succeed(Permission.Service, permission)],
          [EventV2Bridge.node, Layer.succeed(EventV2Bridge.Service, events)],
        ])
        const seedServices = yield* Effect.gen(function* () {
          return {
            courses: yield* Course.Service,
            commands: yield* LearningCommandRuntime.Service,
          }
        }).pipe(Effect.provide(seedLayer))
        const courses = seedServices.courses
        const commands = seedServices.commands
        const permissionRequests: Array<Readonly<Record<string, unknown>>> = []
        const scenarios: Record<string, unknown> = {}
        let lastSeedTime = 0

        const unsubscribe = yield* events.listen((event) => {
          if (event.type !== Permission.Event.Asked.type) return Effect.void
          const request = event.data as PermissionV1.Request
          const allowed = permitted.has(request.permission)
          permissionRequests.push({
            id: request.id,
            sessionID: request.sessionID,
            permission: request.permission,
            patterns: request.patterns,
            always: request.always,
            metadata: request.metadata,
            tool: request.tool,
            reply: allowed ? "once" : "reject",
          })
          return permission.reply({ requestID: request.id, reply: allowed ? "once" : "reject" }).pipe(Effect.orDie)
        })
        yield* Effect.addFinalizer(() => unsubscribe)

        const domainDigest = Effect.fn("Gate23RealModel.domainDigest")(function* () {
          const names = (yield* database.db
            .all(
              sql`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
          `,
            )
            .pipe(Effect.orDie)) as Array<{ name: string }>
          return Object.fromEntries(
            yield* Effect.forEach(
              names
                .map((row) => row.name)
                .filter(
                  (name) =>
                    name !== "retained_steering_state" &&
                    domainPrefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}_`)),
                ),
              (name) =>
                database.db.all(sql.raw(`SELECT * FROM "${name.replaceAll('"', '""')}"`)).pipe(
                  Effect.orDie,
                  Effect.map((rows) => {
                    const canonical = rows
                      .map((row) => JSON.stringify(row))
                      .toSorted()
                      .join("\n")
                    return [name, { count: rows.length, fingerprint: sha256(canonical) }] as const
                  }),
                ),
              { concurrency: 1 },
            ),
          )
        })

        const retainedSteeringWatermark = Effect.fn("Gate23RealModel.retainedSteeringWatermark")(function* () {
          const row = yield* database.db
            .get<{ steeringRevision: number; latestCutAsOf: number }>(
              sql`
              SELECT steering_revision AS steeringRevision, latest_cut_as_of AS latestCutAsOf
              FROM retained_steering_state
              WHERE singleton = 1
            `,
            )
            .pipe(Effect.orDie)
          requireEvidence(row, "retained steering watermark is missing")
          return row
        })

        function assistantData(
          parentID: SessionV1Type.MessageID,
          time: number,
        ): Omit<SessionV1Type.Assistant, "id" | "sessionID"> {
          return {
            role: "assistant",
            time: { created: time },
            parentID,
            modelID: model.modelID,
            providerID: model.providerID,
            mode: "repa",
            agent: "repa",
            path: { cwd: instance.directory, root: instance.worktree },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          }
        }

        function commandContext(
          registration: LearningCommandRuntimeType.Registration,
          capability: LearningCommandRuntimeType.PrimaryCapability,
          pattern = "*",
        ) {
          const ruleset: PermissionV1.Ruleset = [{ permission: capability, pattern, action: "allow" }]
          return {
            sessionID: registration.sessionID,
            messageID: registration.assistantMessageID,
            callID: registration.callID,
            abort: new AbortController().signal,
            interaction: { permission: { ruleset, authority: [] } },
            extra: { toolCall: registration, permissionRuleset: ruleset },
          } satisfies LearningCommandRuntimeType.ExecuteContext
        }

        function settleInteractionTurn(
          db: DatabaseType.Interface["db"],
          interaction: {
            readonly turnID: TurnType.ID
            readonly registration: LearningCommandRuntimeType.Registration
          },
          time: number,
        ) {
          return db.transaction((tx) =>
            Effect.gen(function* () {
              yield* TurnLifecycle.settleTool(tx, {
                turnID: interaction.turnID,
                partID: interaction.registration.partID,
                state: "completed",
                time,
              })
              yield* TurnLifecycle.settle(tx, {
                turnID: interaction.turnID,
                outcome: "completed",
                reason: "normal",
                time,
              })
            }),
          )
        }

        function seedInteraction(
          suffix: string,
          input: Record<string, unknown>,
          toolID: LearningCommandRuntimeType.PrimaryCapability,
          sourceText: string,
          existingSessionID?: ReturnType<typeof SessionID.create>,
        ) {
          return Effect.gen(function* () {
            const time = Math.max(Date.now(), lastSeedTime + 1)
            lastSeedTime = time + 1
            const seeded = yield* materializeTestSession({
              id: existingSessionID,
              title: `Gate 23 typed seed ${suffix}`,
              agent: "repa",
              model,
              permission: allowOnly([...effectiveReadCapabilities, ...writeCapabilities]),
              text: sourceText,
              settle: false,
              limits: { model: 100, tool: 100 },
              time,
            })
            const sessionID = seeded.info.id
            const userMessageID = seeded.user.id
            const turnID = seeded.turn.id
            const inputID = seeded.turn.currentInputID
            const root = yield* database.db
              .select({ occurrenceID: TurnInputTable.occurrence_id })
              .from(TurnInputTable)
              .where(eq(TurnInputTable.id, inputID))
              .get()
              .pipe(Effect.orDie)
            requireEvidence(root?.occurrenceID, `${suffix} typed seed has no learner occurrence`)
            const occurrenceID = root.occurrenceID
            const interaction = { sessionID, userMessageID, turnID, inputID, occurrenceID }
            const assistantMessageID = MessageID.ascending()
            const partID = SessionV1.PartID.ascending()
            const callID = `call-gate23-${suffix}-${crypto.randomUUID()}`
            const modelTime = time + 1
            const assistant: SessionV1Type.Assistant = {
              id: assistantMessageID,
              sessionID,
              ...assistantData(userMessageID, modelTime),
            }
            const tool: SessionV1Type.ToolPart = {
              id: partID,
              sessionID,
              messageID: assistantMessageID,
              type: "tool",
              tool: toolID,
              callID,
              state: { status: "pending", input, raw: JSON.stringify(input) },
            }
            let operation: TurnType.ModelOperation | undefined
            yield* events.transaction<undefined, EventV2Type.Definition>((tx) =>
              Effect.gen(function* () {
                const admitModel = () =>
                  admitModelWithLearningContext(tx, {
                    turnID,
                    sessionID,
                    assistantMessageID,
                    requestEnvelope: { input },
                    contextFingerprint: sha256(`gate23-context:${suffix}`),
                    snapshotFrontier: { sequence: 0, time: 0 },
                    timeAdmitted: modelTime,
                  }).pipe(
                    Effect.flatMap((result) => {
                      if (result.type !== "admitted")
                        return Effect.die(`${suffix} typed seed exhausted model admission`)
                      return Effect.sync(() => {
                        operation = result.operation
                      })
                    }),
                    Effect.orDie,
                  )
                const seal = () =>
                  Effect.gen(function* () {
                    yield* TurnLifecycle.sealCandidateSet(tx, {
                      turnID,
                      sessionID,
                      assistantMessageID,
                      candidates: [{ partID, callID, tool: toolID, envelope: { input } }],
                      timeSealed: modelTime,
                    })
                    yield* TurnLifecycle.settleModel(tx, {
                      turnID,
                      assistantMessageID,
                      state: "completed",
                      time: modelTime,
                    })
                  }).pipe(Effect.orDie)
                return {
                  result: undefined,
                  events: [
                    {
                      definition: SessionV1.Event.MessageUpdated,
                      data: { sessionID, info: assistant },
                      options: { commit: admitModel },
                    },
                    SessionTurnEvents.modelAdmitted(() => {
                      if (!operation) throw new Error(`${suffix} typed seed model operation did not admit`)
                      return operation
                    }),
                    { definition: SessionV1.Event.PartUpdated, data: { sessionID, part: tool, time: modelTime } },
                    {
                      definition: TurnEvent.CandidateSetSealed,
                      data: {
                        sessionID,
                        turnID,
                        assistantMessageID,
                        count: 1,
                        get timestamp() {
                          if (!operation) throw new Error(`${suffix} typed seed model operation did not admit`)
                          return operation.timeAdmitted
                        },
                      },
                      options: { commit: seal },
                    },
                    {
                      definition: TurnEvent.ModelSettled,
                      data: {
                        sessionID,
                        turnID,
                        assistantMessageID,
                        state: "completed" as const,
                        get timestamp() {
                          if (!operation) throw new Error(`${suffix} typed seed model operation did not admit`)
                          return operation.timeAdmitted
                        },
                      },
                    },
                  ],
                }
              }),
            )
            yield* events.transaction<undefined, EventV2Type.Definition>((tx) =>
              Effect.gen(function* () {
                const admission = yield* TurnLifecycle.admitTool(tx, {
                  turnID,
                  sessionID,
                  assistantMessageID,
                  partID,
                  timeAdmitted: modelTime,
                }).pipe(Effect.orDie)
                if (admission.type !== "admitted") return yield* Effect.die(`${suffix} typed seed tool did not admit`)
                const candidate = yield* TurnLifecycle.candidate(tx, { turnID, partID }).pipe(Effect.orDie)
                return {
                  result: undefined,
                  events: [
                    {
                      definition: TurnEvent.CandidateDisposition,
                      data: { sessionID, turnID, candidate, timestamp: admission.invocation.timeAdmitted },
                    },
                    {
                      definition: TurnEvent.ToolAdmitted,
                      data: {
                        sessionID,
                        turnID,
                        invocation: admission.invocation,
                        timestamp: admission.invocation.timeAdmitted,
                      },
                    },
                  ],
                }
              }),
            )
            return {
              turnID,
              occurrenceID,
              registration: Object.freeze({
                turnID,
                inputID,
                causalOccurrenceID: occurrenceID,
                partID,
                callID,
                emissionOrdinal: 0,
                sessionID,
                parentUserMessageID: userMessageID,
                assistantMessageID,
              }) satisfies LearningCommandRuntimeType.Registration,
            }
          }).pipe(Effect.orDie)
        }

        const applySeedCommand = Effect.fn("Gate23RealModel.applySeedCommand")(function* (
          suffix: string,
          capability: LearningCommandRuntimeType.PrimaryCapability,
          input: Record<string, unknown>,
          pattern: string,
          sourceText: string,
          existingSessionID?: ReturnType<typeof SessionID.create>,
        ) {
          const interaction = yield* seedInteraction(suffix, input, capability, sourceText, existingSessionID)
          yield* commands.prepareCommand(capability, input, interaction.registration)
          const result = yield* commands.executeCommand(
            capability,
            input,
            commandContext(interaction.registration, capability, pattern),
          )
          requireEvidence(result.metadata.outcome === "applied", `${suffix}/${capability} did not apply`)
          const invocation = yield* database.db
            .select({ timeSettled: LearningCommandInvocationTable.time_settled })
            .from(LearningCommandInvocationTable)
            .where(eq(LearningCommandInvocationTable.part_id, interaction.registration.partID))
            .get()
            .pipe(Effect.orDie)
          requireEvidence(invocation?.timeSettled != null, `${suffix}/${capability} did not durably settle`)
          yield* settleInteractionTurn(database.db, interaction, invocation.timeSettled)
          scenarios[`typed-${suffix}`] = {
            capability,
            sourceText,
            outcome: result.metadata.outcome,
            output: result.output,
            registration: interaction.registration,
          }
          return { result, interaction }
        })

        const runTurn = Effect.fn("Gate23RealModel.runTurn")(function* (input: {
          readonly label: string
          readonly sessionID: ReturnType<typeof SessionID.create>
          readonly text: string
          readonly title?: string
          readonly permissions?: readonly string[]
          readonly limits?: { readonly model: number; readonly tool: number }
          readonly expectedTerminal?: { readonly outcome: "completed" | "failed"; readonly reason?: string }
        }) {
          const before = yield* sessions
            .messages({ sessionID: input.sessionID })
            .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed([])))
          const beforeIDs = new Set(before.map((message) => message.info.id))
          const turnID = Turn.ID.create()
          const inputID = Turn.InputID.create()
          const messageID = MessageID.ascending()
          const limits = input.limits ?? { model: 5, tool: 6 }
          const session = input.title
            ? {
                title: input.title,
                permission: allowOnly(input.permissions ?? effectiveReadCapabilities),
              }
            : undefined
          activeScenario = input.label
          const admittedResponse = yield* Effect.tryPromise({
            try: () =>
              sdk.session.start(
                {
                  sessionID: input.sessionID,
                  directory: workspace,
                  turnID,
                  inputID,
                  messageID,
                  agent: "repa",
                  model,
                  limits,
                  ...(session ? { session } : {}),
                  parts: [{ type: "text", text: input.text }],
                },
                { throwOnError: true },
              ),
            catch: (error) => error,
          })
          const admitted = admittedResponse.data
          requireEvidence(admittedResponse.response.status === 200 && admitted, `${input.label} carrier start failed`)
          requireEvidence(
            admitted.id === turnID &&
              admitted.sessionID === input.sessionID &&
              admitted.initialInputID === inputID &&
              admitted.currentInputID === inputID,
            `${input.label} carrier start returned the wrong Turn/Input identity`,
          )
          const terminalResponse = yield* Effect.tryPromise({
            try: () =>
              sdk.session.awaitTurn(
                { sessionID: input.sessionID, turnID, directory: workspace },
                { throwOnError: true },
              ),
            catch: (error) => error,
          })
          const terminal = terminalResponse.data
          requireEvidence(
            terminalResponse.response.status === 200 &&
              terminal &&
              terminal.id === turnID &&
              terminal.sessionID === input.sessionID,
            `${input.label} carrier await returned the wrong Turn identity`,
          )
          const carrierMessagesResponse = yield* Effect.tryPromise({
            try: () =>
              sdk.session.messages({ sessionID: input.sessionID, directory: workspace }, { throwOnError: true }),
            catch: (error) => error,
          })
          const carrierMessages = carrierMessagesResponse.data
          requireEvidence(
            carrierMessagesResponse.response.status === 200 && Array.isArray(carrierMessages),
            `${input.label} carrier message read failed`,
          )
          activeScenario = "between-turns"
          requireEvidence(terminal.terminal, `${input.label} did not terminalize`)
          const expectedTerminal = input.expectedTerminal ?? { outcome: "completed" as const }
          requireEvidence(
            terminal.terminal.outcome === expectedTerminal.outcome &&
              (expectedTerminal.reason === undefined || terminal.terminal.reason === expectedTerminal.reason),
            `${input.label} terminated as ${terminal.terminal.outcome}/${terminal.terminal.reason}`,
          )
          const messages = yield* sessions.messages({ sessionID: input.sessionID })
          const current = messages.filter((message) => !beforeIDs.has(message.info.id))
          const assistants = current.filter((message) => message.info.role === "assistant")
          const tools = assistants.flatMap((message) => message.parts).filter((part) => part.type === "tool")
          const carrier = carrierRequests.filter((request) => request.scenario === input.label)
          const startCarrier = carrier.find(
            (request) => request.method === "POST" && request.path === `/session/${input.sessionID}/turn`,
          )
          const awaitCarrier = carrier.find(
            (request) =>
              request.method === "GET" && request.path === `/session/${input.sessionID}/turn/${turnID}/await`,
          )
          const messagesCarrier = carrier.find(
            (request) => request.method === "GET" && request.path === `/session/${input.sessionID}/message`,
          )
          requireEvidence(
            carrier.length === 3 && startCarrier && awaitCarrier && messagesCarrier,
            `${input.label} did not traverse one exact start/await/messages carrier chain`,
          )
          const startBody = JSON.parse(startCarrier.requestBody) as unknown
          const startRecord = recordOf(startBody)
          const directoryHeader = startCarrier.headers.find((header) => header.name === "x-opencode-directory")
          const routedDirectory =
            new URL(startCarrier.url).searchParams.get("directory") ??
            (directoryHeader?.state === "value" ? directoryHeader.value : undefined)
          requireEvidence(
            routedDirectory && path.resolve(routedDirectory) === path.resolve(workspace),
            `${input.label} carrier routed a different workspace`,
          )
          requireEvidence(
            startRecord?.turnID === turnID &&
              startRecord.inputID === inputID &&
              startRecord.messageID === messageID &&
              startRecord.agent === "repa" &&
              JSON.stringify(startRecord.model) === JSON.stringify(model) &&
              JSON.stringify(startRecord.limits) === JSON.stringify(limits) &&
              requestContainsExactText(startCarrier.requestBody, input.text) &&
              (session === undefined ||
                JSON.stringify(recordOf(startRecord.session)?.permission) === JSON.stringify(session.permission)),
            `${input.label} carrier request changed the exact root payload`,
          )
          const user = current.find((message) => message.info.id === messageID)
          requireEvidence(
            user?.info.role === "user" &&
              user.parts.some((part) => part.type === "text" && part.text === input.text),
            `${input.label} lost its exact carrier learner Message/Part`,
          )
          const durableInput = yield* database.db
            .select()
            .from(TurnInputTable)
            .where(eq(TurnInputTable.id, inputID))
            .get()
            .pipe(Effect.orDie)
          requireEvidence(
            durableInput &&
              durableInput.turn_id === turnID &&
              durableInput.session_id === input.sessionID &&
              durableInput.message_id === messageID &&
              durableInput.source === "learner_root" &&
              durableInput.ordinal === 0 &&
              typeof durableInput.occurrence_id === "string",
            `${input.label} carrier root did not bind the exact durable learner Input`,
          )
          const occurrence = yield* database.db
            .select()
            .from(AdmittedLearnerOccurrenceTable)
            .where(eq(AdmittedLearnerOccurrenceTable.id, durableInput.occurrence_id!))
            .get()
            .pipe(Effect.orDie)
          requireEvidence(
            occurrence?.origin_session_id === input.sessionID && occurrence.origin_message_id === messageID,
            `${input.label} carrier root did not bind the exact learner occurrence`,
          )
          const operations = yield* database.db
            .select()
            .from(TurnModelOperationTable)
            .where(eq(TurnModelOperationTable.turn_id, turnID))
            .orderBy(asc(TurnModelOperationTable.ordinal))
            .all()
            .pipe(Effect.orDie)
          requireEvidence(
            operations.length > 0 &&
              operations.every(
                (operation) =>
                  operation.session_id === input.sessionID &&
                  operation.input_id === inputID &&
                  operation.causal_occurrence_id === durableInput.occurrence_id &&
                  assistants.some(
                    (message) =>
                      message.info.role === "assistant" &&
                      message.info.id === operation.assistant_message_id &&
                      message.info.parentID === messageID,
                  ) &&
                  carrierMessages.some(
                    (message) =>
                      message.info.role === "assistant" &&
                      message.info.id === operation.assistant_message_id &&
                      message.info.parentID === messageID,
                  ),
              ),
            `${input.label} carrier root did not join its exact model/Assistant chain`,
          )
          const candidates = yield* database.db
            .select()
            .from(TurnToolCandidateTable)
            .where(eq(TurnToolCandidateTable.turn_id, turnID))
            .orderBy(asc(TurnToolCandidateTable.time_registered), asc(TurnToolCandidateTable.emission_ordinal))
            .all()
            .pipe(Effect.orDie)
          const invocations = yield* database.db
            .select()
            .from(TurnToolInvocationTable)
            .where(eq(TurnToolInvocationTable.turn_id, turnID))
            .orderBy(asc(TurnToolInvocationTable.time_admitted), asc(TurnToolInvocationTable.ordinal))
            .all()
            .pipe(Effect.orDie)
          requireEvidence(
            tools
              .filter((part) => part.state.status === "completed")
              .every((part) => {
                const candidate = candidates.find((item) => item.part_id === part.id)
                const invocation = invocations.find((item) => item.part_id === part.id)
                return (
                  candidate?.state === "admitted" &&
                  candidate.call_id === part.callID &&
                  candidate.assistant_message_id === part.messageID &&
                  invocation?.state === "completed" &&
                  invocation.assistant_message_id === part.messageID
                )
              }),
            `${input.label} completed Tool Parts did not join exact candidate/invocation identities`,
          )
          const cuts = yield* Effect.forEach(operations, (operation) =>
            Effect.gen(function* () {
              const cut = yield* database.db
                .select()
                .from(TurnLearningContextCutTable)
                .where(eq(TurnLearningContextCutTable.assistant_message_id, operation.assistant_message_id))
                .get()
                .pipe(Effect.orDie)
              const capacity = yield* database.db
                .select()
                .from(TurnModelCapacityTable)
                .where(eq(TurnModelCapacityTable.assistant_message_id, operation.assistant_message_id))
                .get()
                .pipe(Effect.orDie)
              requireEvidence(cut, `${input.label}/${operation.assistant_message_id} has no Learning Context cut`)
              requireEvidence(capacity, `${input.label}/${operation.assistant_message_id} has no capacity record`)
              const decoded = LearningContext.decodeStored(
                cut.canonical_cut,
                cut.rendered_block,
                operation.assistant_message_id,
              )
              const matchingRequests = providerRequests.filter(
                (request) =>
                  request.scenario === input.label && requestContainsExactText(request.body, cut.rendered_block),
              )
              requireEvidence(matchingRequests.length >= 1, `${input.label} cut was absent from captured provider I/O`)
              return {
                assistantMessageID: operation.assistant_message_id,
                ordinal: operation.ordinal,
                state: operation.state,
                cut: {
                  schemaVersion: decoded.schemaVersion,
                  policyVersion: decoded.policyVersion,
                  rendererVersion: decoded.rendererVersion,
                  asOf: cut.cut_as_of,
                  canonicalBytes: cut.canonical_bytes,
                  fingerprint: cut.cut_fingerprint,
                  renderedBytes: cut.rendered_bytes,
                  renderedFingerprint: cut.rendered_fingerprint,
                  canonical: cut.canonical_cut,
                  rendered: cut.rendered_block,
                  sections: decoded.sections.map((section) => ({
                    owner: section.owner,
                    coverage: section.coverage,
                    countAtCut: section.countAtCut,
                    entries: section.entries.length,
                    omission: section.omission,
                    ...("mode" in section ? { mode: section.mode } : {}),
                    ...("directoryCursor" in section ? { directoryCursor: section.directoryCursor } : {}),
                  })),
                },
                capacity: {
                  classification: capacity.classification,
                  decision: capacity.decision,
                  assessmentFingerprint: capacity.assessment_fingerprint,
                  envelopeFingerprint: capacity.envelope_fingerprint,
                },
                providerRequestSequences: matchingRequests.map((request) => request.sequence),
              }
            }),
          )
          return {
            label: input.label,
            sessionID: input.sessionID,
            turnID,
            inputID,
            messageID,
            carrier: {
              adapter: "primary_tui_generated_v2_sdk",
              handler: "Server.Default().app.fetch",
              directory: workspace,
              start: {
                sequence: startCarrier.sequence,
                method: startCarrier.method,
                path: startCarrier.path,
                query: startCarrier.query,
                requestFingerprint: startCarrier.requestFingerprint,
                responseStatus: startCarrier.responseStatus,
                responseFingerprint: startCarrier.responseFingerprint,
                admitted,
              },
              await: {
                sequence: awaitCarrier.sequence,
                method: awaitCarrier.method,
                path: awaitCarrier.path,
                query: awaitCarrier.query,
                responseStatus: awaitCarrier.responseStatus,
                responseFingerprint: awaitCarrier.responseFingerprint,
                terminal,
              },
              messages: {
                sequence: messagesCarrier.sequence,
                method: messagesCarrier.method,
                path: messagesCarrier.path,
                query: messagesCarrier.query,
                responseStatus: messagesCarrier.responseStatus,
                responseFingerprint: messagesCarrier.responseFingerprint,
                count: carrierMessages.length,
              },
              input: durableInput,
              occurrence,
            },
            request: { text: input.text, byteLength: utf8Bytes(input.text), fingerprint: sha256(input.text) },
            terminal: terminal.terminal,
            text: assistants
              .flatMap((message) => message.parts)
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .filter(Boolean),
            tools: tools.map((part) => ({
              partID: part.id,
              tool: part.tool,
              callID: part.callID,
              state: part.state,
            })),
            assistants: assistants.map((message) => ({
              id: message.info.id,
              time: message.info.time,
              cost: "cost" in message.info ? message.info.cost : undefined,
              tokens: "tokens" in message.info ? message.info.tokens : undefined,
            })),
            operations,
            candidates,
            invocations,
            cuts,
            requestSequences: providerRequests
              .filter((request) => request.scenario === input.label)
              .map((request) => request.sequence),
          }
        })

        const runSeed = Effect.fn("Gate23RealModel.runSeed")(function* (
          label: string,
          text: string,
          expectedTool: string,
        ) {
          const result = yield* runTurn({
            label,
            sessionID: SessionID.create(),
            title: `Gate 23 fixture ${label}`,
            permissions: [...effectiveReadCapabilities, ...writeCapabilities],
            limits: { model: 5, tool: 6 },
            text,
          })
          const completed = result.tools.find((tool) => tool.tool === expectedTool && tool.state.status === "completed")
          requireEvidence(completed, `${label} did not complete ${expectedTool}`)
          requireEvidence(
            completed.state.status === "completed" &&
              "metadata" in completed.state &&
              completed.state.metadata &&
              typeof completed.state.metadata === "object" &&
              "outcome" in completed.state.metadata &&
              completed.state.metadata.outcome === "applied",
            `${label}/${expectedTool} completed without an applied domain effect`,
          )
          scenarios[label] = result
          return result
        })

        let fixture: Record<string, unknown> | undefined
        if (selectedPhase === "setup") {
          const setupSourceSessions: ReturnType<typeof SessionID.create>[] = []
          const course = yield* courses.createCourse({ title: "Gate 23 Mathematical Induction" })
          const published = yield* courses.createView({
            courseID: course.id,
            name: "Proof workshop",
            expectedCourseVersion: 0,
            authorship: Course.Authorship.learnerAuthored(),
            revision: {
              items: [
                { key: "induction-invariant", title: "Diagnose the induction invariant" },
                { key: "timed-proof", title: "Timed independent induction proof" },
              ],
            },
          })
          yield* courses.select({
            courseID: course.id,
            revisionID: published.revision.id,
            expectedCourseVersion: 0,
            expectedSelectionVersion: 0,
            expectedViewVersion: 0,
            expectedRevisionVersion: 0,
          })
          const items = yield* courses.listRevisionItems(course.id, published.view.id, published.revision.id)
          const inductionItem = items.items.find((item) => item.title === "Diagnose the induction invariant")
          requireEvidence(inductionItem, "setup did not materialize the induction item")
          fixture = {
            courseID: course.id,
            viewID: published.view.id,
            revisionID: published.revision.id,
            itemID: inductionItem.itemID,
          }

          const materialPath = path.join(workspace, "gate23-induction-source.txt")
          const materialText =
            "Induction-step source: assuming the claim at n does not justify replacing every occurrence of n by n + 1 without applying the recurrence."
          yield* Effect.promise(() => Bun.write(materialPath, `${materialText}\n`))
          const materialSource = "Adopt this exact induction-step source and align it to the diagnosis item."
          const materialSeed = yield* applySeedCommand(
            "material",
            LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
            {
              course: { type: "existing", courseID: course.id },
              materials: [
                { type: "local", key: "source", path: materialPath, authority: { type: "active_workspace" } },
              ],
              maps: [
                {
                  key: "map",
                  materialKey: "source",
                  authorship: "learner_requested",
                  outline: [
                    {
                      key: "step",
                      title: "Exact induction-step source",
                      selectors: [{ key: "whole", coordinate: { kind: "whole_target.v1" } }],
                    },
                  ],
                },
              ],
              alignments: [
                {
                  key: "diagnosis",
                  mapKey: "map",
                  selectorKey: "whole",
                  authorship: "learner_requested",
                  course: {
                    type: "existing",
                    viewID: published.view.id,
                    revisionID: published.revision.id,
                    itemID: inductionItem.itemID,
                    selection: "explicit_exact",
                  },
                  reason: "The exact source is the worked induction step being diagnosed.",
                },
              ],
            },
            LearningCommand.LEARNING_BOOTSTRAP_PERMISSION_PATTERN,
            materialSource,
          )
          const materialTarget = yield* database.db
            .get<{
              alignmentID: string
              mapID: string
              selectorID: string
            }>(
              sql`
              SELECT alignment.id AS alignmentID, alignment.map_id AS mapID,
                alignment.selector_id AS selectorID
              FROM material_course_alignment AS alignment
              JOIN material_map AS map ON map.id = alignment.map_id
              ORDER BY map.time_created DESC, map.id DESC
              LIMIT 1
            `,
            )
            .pipe(Effect.orDie)
          requireEvidence(materialTarget, "setup did not materialize the Material Map/alignment")
          const learnerResponse =
            "The invalid step replaces n by n + 1 inside the hypothesis without deriving the recurrence consequence."
          yield* applySeedCommand(
            "learner-response-evidence",
            LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
            {
              operation: "create",
              relation: "supports",
              exposure: "tutor_disclosure_before_learner_response",
              conditionAssistantMessageID: materialSeed.interaction.registration.assistantMessageID,
              target: {
                mapID: materialTarget.mapID,
                selectorID: materialTarget.selectorID,
                courseID: course.id,
                viewID: published.view.id,
                revisionID: published.revision.id,
                itemID: inductionItem.itemID,
              },
              alignmentID: materialTarget.alignmentID,
            },
            LearningCommand.LEARNER_RESPONSE_EVIDENCE_PERMISSION_PATTERN,
            learnerResponse,
            materialSeed.interaction.registration.sessionID,
          )
          yield* sessions.remove(materialSeed.interaction.registration.sessionID)
          const learnerResponseRequirements = yield* database.db.transaction((tx) =>
            LearningContext.listLearnerResponseEvidenceRequirements(tx, {
              cutAsOf: Math.max(Date.now(), lastSeedTime + 1),
            }),
          )
          requireEvidence(
            learnerResponseRequirements.length === 1 &&
              learnerResponseRequirements[0]?.mapID === materialTarget.mapID &&
              learnerResponseRequirements[0]?.selectorID === materialTarget.selectorID,
            "deleted learner-response source did not expose its exact Material requirement",
          )
          scenarios["typed-learner-response-source-deleted"] = {
            sessionID: materialSeed.interaction.registration.sessionID,
            requirements: learnerResponseRequirements,
          }
          fixture = { ...fixture, ...materialTarget }

          const navigationSource = "Make the mathematical induction Course my default Course."
          const navigationSeed = yield* applySeedCommand(
            "navigation",
            LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            { action: "set", courseID: course.id },
            "*",
            navigationSource,
          )
          setupSourceSessions.push(navigationSeed.interaction.registration.sessionID)
          const goalSource = "My durable Goal is to diagnose faulty induction steps and repair proofs from definitions."
          const goalSeed = yield* applySeedCommand(
            "goal",
            LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            {
              operations: [
                {
                  type: "create",
                  outcome: "Diagnose faulty induction steps and repair proofs from definitions",
                  scope: { type: "courses", courseIDs: [course.id] },
                  disposition: "active",
                },
              ],
            },
            LearnerGoal.PERMISSION_PATTERN,
            goalSource,
          )
          setupSourceSessions.push(goalSeed.interaction.registration.sessionID)
          const steeringValidUntil = new Date(qualificationStartedAt + (30 * 24 + 8) * 60 * 60 * 1_000)
            .toISOString()
            .replace("Z", "+08:00")
          const steeringSource = `Until ${steeringValidUntil}, across all my learning, ask one scaffold question before a decisive proof step.`
          const steeringSeed = yield* applySeedCommand(
            "retained-steering",
            LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
            {
              action: "create",
              sourceExcerpt: steeringSource,
              operativeInstruction: "Ask one scaffold question before revealing a decisive proof step.",
              validUntil: steeringValidUntil,
            },
            "*",
            steeringSource,
          )
          setupSourceSessions.push(steeringSeed.interaction.registration.sessionID)
          const futureSource = "Please revisit this induction item and ask me before a decisive hint."
          const futureNotBefore = new Date(Date.now() + 1_000)
          const futureSeed = yield* applySeedCommand(
            "future-attention",
            LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
            {
              operations: [
                {
                  type: "create",
                  concern: {
                    purpose: "Revisit the induction invariant and ask for a learner response before a decisive hint.",
                    source: {
                      type: "interpreted_learner_request",
                      excerpt: {
                        text: futureSource,
                        startByte: 0,
                        endByte: utf8Bytes(futureSource),
                      },
                    },
                    target: {
                      endpoint: {
                        courseID: course.id,
                        viewID: published.view.id,
                        revisionID: published.revision.id,
                        itemID: inductionItem.itemID,
                      },
                      selection: { type: "explicit_exact" },
                    },
                    notBefore: {
                      sourceExpression: "one second after fixture creation",
                      localDateTime: new Date(futureNotBefore.getTime() + 480 * 60_000).toISOString().slice(0, 19),
                      timeZone: { type: "fixed_offset", offsetMinutes: 480 },
                    },
                    serviceTiming: "at_or_after_not_before",
                    interactionOrder: "learner_response_before_tutor_disclosure",
                  },
                },
              ],
            },
            FutureAttention.PERMISSION_PATTERN,
            futureSource,
          )
          setupSourceSessions.push(futureSeed.interaction.registration.sessionID)
          const assignmentDue = new Date(qualificationStartedAt + 24 * 60 * 60 * 1_000)
          const assignmentDueExpression = assignmentDue.toISOString()
          const assignmentSource = `The course handout requires a corrected induction proof by ${assignmentDueExpression}.`
          const assignmentSeed = yield* applySeedCommand(
            "assignment",
            LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY,
            {
              cause: {
                type: "interpreted_learner_report",
                excerpt: { text: assignmentSource, startByte: 0, endByte: utf8Bytes(assignmentSource) },
              },
              intents: [
                {
                  type: "create",
                  createOrdinal: 0,
                  snapshot: {
                    obligationSummary: "Submit a corrected induction proof",
                    learningContext: "Use guided proof review before independent completion.",
                    scope: { type: "courses", courseIDs: [course.id] },
                    dueBasis: {
                      type: "instant",
                      sourceExpression: assignmentDueExpression,
                      localDateTime: assignmentDueExpression.slice(0, -1),
                      comparator: "inclusive",
                      timeZone: { type: "fixed_offset", offsetMinutes: 0 },
                    },
                  },
                },
              ],
            },
            Assignment.PERMISSION_PATTERN,
            assignmentSource,
          )
          setupSourceSessions.push(assignmentSeed.interaction.registration.sessionID)
          const judgmentSource =
            "I can state induction and check base cases, but I am uncertain about finding invariant errors in the step."
          const learnerStateSeed = yield* applySeedCommand(
            "learner-state",
            LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY,
            {
              operation: "create",
              cause: {
                type: "interpreted_learner_report",
                excerpt: { text: judgmentSource, startByte: 0, endByte: utf8Bytes(judgmentSource) },
              },
              snapshot: {
                subject: {
                  label: "Induction-step diagnosis",
                  scope: {
                    type: "anchored",
                    anchors: [
                      {
                        type: "course_membership",
                        endpoint: {
                          courseID: course.id,
                          viewID: published.view.id,
                          revisionID: published.revision.id,
                          itemID: inductionItem.itemID,
                        },
                      },
                    ],
                  },
                },
                judgmentBody:
                  "The learner can state induction and check base cases but remains uncertain about finding invariant errors in the induction step.",
                exactBasisRefs: [
                  {
                    type: "course_membership",
                    endpoint: {
                      courseID: course.id,
                      viewID: published.view.id,
                      revisionID: published.revision.id,
                      itemID: inductionItem.itemID,
                    },
                  },
                ],
                uncertaintyAndLimits: "Fallible judgment based only on this learner report; open to correction.",
                basisScope: "whole_judgment",
              },
            },
            LearnerStateJudgment.PERMISSION_PATTERN,
            judgmentSource,
          )
          setupSourceSessions.push(learnerStateSeed.interaction.registration.sessionID)
          const advisorySource = "Keep useful induction advice for later sessions without making it a rigid schedule."
          const advisorySeed = yield* applySeedCommand(
            "advisory",
            LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY,
            {
              cause: {
                type: "responsive_tutor_proposal",
                excerpt: { text: advisorySource, startByte: 0, endByte: utf8Bytes(advisorySource) },
                rationale: "Preserve useful and revisable advice for later teaching.",
              },
              intents: Array.from({ length: 8 }, (_, index) => ({
                operation: "create",
                operationOrdinal: index,
                createOrdinal: index,
                snapshot: {
                  learnerVisibleScope: "Induction practice",
                  retrievalScope: { type: "learner_home_fallback", reason: "deliberately_cross_cutting" },
                  purpose: "Guide later induction teaching without a schedule.",
                  directorySummary: "Try one counterexample before a timed proof.",
                  body: "First use one concrete counterexample to locate the invariant mismatch; then attempt a timed proof, with two varied exercises left as a loose later outline.",
                  exactBasisRefs: [],
                  assumptionsAndUncertainty: "Fallible Tutor advice; revise naturally when it stops helping.",
                },
              })),
            },
            AdvisoryPlanSuggestion.PERMISSION_PATTERN,
            advisorySource,
          )
          setupSourceSessions.push(advisorySeed.interaction.registration.sessionID)
          yield* Effect.forEach(setupSourceSessions, (sessionID) => sessions.remove(sessionID), {
            concurrency: 1,
            discard: true,
          })
          scenarios["typed-setup-sources-deleted"] = { sessionIDs: setupSourceSessions }
          scenarios["setup-domain-digest"] = yield* domainDigest()
        } else if (selectedPhase === "collision") {
          requireEvidence(blockProvider, "collision phase must block the provider before transport")
          const before = yield* domainDigest()
          const beforeWatermark = yield* retainedSteeringWatermark()
          const target = yield* runTurn({
            label: "collision-pre-provider",
            sessionID: SessionID.create(),
            title: "Gate 23 deterministic ten-owner collision",
            permissions: effectiveReadCapabilities,
            limits: { model: 1, tool: 0 },
            expectedTerminal: { outcome: "failed", reason: "provider_failure" },
            text: "继续当前归纳学习，但不要猜测缺失事实；先依据现有学习情境选择一个安全、可逆的下一步。",
          })
          scenarios[target.label] = target
          const collision = target.cuts[0]?.cut
          requireEvidence(
            target.cuts.length === 1 && collision,
            "collision did not admit exactly one Learning Context cut",
          )
          requireEvidence(
            collision.schemaVersion === 1 && collision.policyVersion === 6 && collision.rendererVersion === 7,
            "collision used the wrong Learning Context generation",
          )
          requireEvidence(
            collision.canonicalBytes <= LearningContext.MAX_CANONICAL_BYTES &&
              collision.renderedBytes <= LearningContext.MAX_RENDERED_BYTES,
            `collision exceeded capacity at ${collision.canonicalBytes}/${collision.renderedBytes}`,
          )
          const sections = Object.fromEntries(collision.sections.map((section) => [section.owner, section]))
          requireEvidence(collision.sections.length === 10, "collision did not project all ten owner families")
          for (const owner of [
            "course",
            "learner_navigation",
            "learner_goal",
            "material",
            "learner_response_evidence",
            "future_attention",
            "assignment",
            "learner_state_judgment",
          ]) {
            requireEvidence(
              sections[owner]?.countAtCut === 1 && sections[owner]?.entries === 1,
              `collision did not retain the required ${owner} entry`,
            )
          }
          requireEvidence(
            Number(sections.interaction?.countAtCut ?? 0) >= 1 && Number(sections.interaction?.entries ?? 0) >= 1,
            "collision did not retain a recent Interaction",
          )
          requireEvidence(
            sections.future_attention?.coverage === "complete" && sections.future_attention?.omission.type === "none",
            "collision did not keep sole FutureAttention complete",
          )
          requireEvidence(
            sections.assignment?.coverage === "complete" &&
              sections.assignment?.mode === "sole_candidate_pressure" &&
              sections.assignment?.omission.type === "none",
            "collision did not keep sole Assignment complete",
          )
          requireEvidence(
            typeof sections.learner_state_judgment?.directoryCursor === "string" &&
              sections.learner_state_judgment.directoryCursor.length > 0,
            "collision omitted the learner-state directory cursor",
          )
          requireEvidence(
            sections.advisory_plan_suggestion?.countAtCut === 8 &&
              sections.advisory_plan_suggestion.entries === 1 &&
              sections.advisory_plan_suggestion.omission.type === "exact" &&
              sections.advisory_plan_suggestion.omission.omitted === 7 &&
              sections.advisory_plan_suggestion.omission.reasons.some(
                (reason) => reason.reason === "gate18_byte_budget" && reason.omitted === 7,
              ) &&
              typeof sections.advisory_plan_suggestion.directoryCursor === "string" &&
              sections.advisory_plan_suggestion.directoryCursor.length > 0,
            "collision did not retain one advisory entry with exact Gate 18 omission and cursor",
          )
          const after = yield* domainDigest()
          const afterWatermark = yield* retainedSteeringWatermark()
          requireEvidence(
            JSON.stringify(after) === JSON.stringify(before),
            "collision provider failure changed owner tables",
          )
          requireEvidence(
            afterWatermark.steeringRevision === beforeWatermark.steeringRevision &&
              afterWatermark.latestCutAsOf === collision.asOf &&
              afterWatermark.latestCutAsOf >= beforeWatermark.latestCutAsOf,
            "collision changed retained steering meaning instead of only advancing its admitted-cut watermark",
          )
          scenarios["collision-capacity-oracle"] = {
            tuple: [1, 6, 7, 6],
            canonicalBytes: collision.canonicalBytes,
            renderedBytes: collision.renderedBytes,
            sectionCount: collision.sections.length,
            ownerTablesStable: true,
            retainedSteeringWatermark: { before: beforeWatermark, after: afterWatermark },
            providerTransportBlocked: true,
          }
        } else if (selectedPhase === "product_floor_setup") {
          const before = yield* domainDigest()
          const source = yield* runTurn({
            label: "product-floor-source",
            sessionID: SessionID.create(),
            title: "Gate 23 source-discriminating product floor",
            permissions: [...effectiveReadCapabilities, ...writeCapabilities],
            limits: { model: 6, tool: 6 },
            text: [
              "我想开始学习欧几里得算法。请在这个普通回合中建立一个可纠正的 Course 和工作路线，并立刻教学。",
              "Course、路线和路线项目的标题只写概念，不得包含下面示例中的任何数字；示例数值只出现在本回合教学文本，不进入持久 Course/route 摘要。",
              "用 84217 和 27109 做候选专用的第一个例子，明确算出 84217 = 3 × 27109 + 2890。",
              "在说明下一步应把数对换成 (27109, 2890) 之后停下；不要继续完成 gcd，也不要把解释当成学习进度。",
            ].join(" "),
          })
          const appliedBootstrap = source.tools.find(
            (tool) =>
              tool.tool === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY && tool.state.status === "completed",
          )
          requireEvidence(appliedBootstrap, "product-floor source did not complete the learning bootstrap")
          requireEvidence(
            appliedBootstrap.state.status === "completed" &&
              recordOf(appliedBootstrap.state.metadata)?.outcome === "applied",
            "product-floor source bootstrap did not apply",
          )
          const bootstrapOutput = recordOf(JSON.parse(appliedBootstrap.state.output))
          const settlement = recordOf(bootstrapOutput?.settlement)
          const acknowledgement = recordOf(settlement?.acknowledgement)
          const acknowledgedCourse = recordOf(acknowledgement?.course)
          const acknowledgedView = recordOf(acknowledgement?.view)
          requireEvidence(
            typeof acknowledgedCourse?.id === "string" &&
              typeof acknowledgedView?.id === "string" &&
              typeof acknowledgedView.revisionID === "string",
            "product-floor source bootstrap omitted its exact Course/View/revision acknowledgement",
          )
          const durableBootstrap = yield* Effect.all({
            course: courses.getCourse(Course.CourseID.make(acknowledgedCourse.id)),
            view: courses.getView(Course.CourseID.make(acknowledgedCourse.id), Course.ViewID.make(acknowledgedView.id)),
            items: courses.listRevisionItems(
              Course.CourseID.make(acknowledgedCourse.id),
              Course.ViewID.make(acknowledgedView.id),
              Course.RevisionID.make(acknowledgedView.revisionID),
            ),
          })
          const durableBootstrapText = JSON.stringify(durableBootstrap)
          requireEvidence(
            !/(?:84217|27109|2890|1099)/.test(durableBootstrapText),
            "product-floor source leaked its discriminator into automatic Course/route state",
          )
          const sourceText = scenarioText(source)
          requireEvidence(
            /84217/.test(sourceText) && /27109/.test(sourceText) && /2890/.test(sourceText),
            "product-floor source omitted the source-discriminating remainder",
          )
          requireNoManagementLeak(sourceText, source.label)
          const locatorProjection = yield* database.db.transaction((tx) =>
            TurnLearningContext.projectLearningContext(tx, {
              currentSessionID: SessionID.create(),
              limit: 8,
            }),
          )
          const sourceLocator = locatorProjection.entries.find((entry) => entry.locator.turnID === source.turnID)
          requireEvidence(sourceLocator?.locator.status === "available", "product-floor source has no exact locator")
          const after = yield* domainDigest()
          requireEvidence(
            JSON.stringify(after) !== JSON.stringify(before),
            "product-floor bootstrap changed no owner state",
          )
          scenarios[source.label] = source
          scenarios["product-floor-source-oracle"] = {
            actionClass: "bootstrap_and_same_turn_teaching",
            sourceDiscriminators: ["84217", "27109", "2890"],
            automaticCourseRouteDiscriminatorLeak: false,
            durableBootstrapFingerprint: sha256(durableBootstrapText),
            sourceLocator,
            transcriptNotProgress: true,
          }
        } else if (selectedPhase === "product_floor_control" || selectedPhase === "product_floor_positive") {
          const isPositive = selectedPhase === "product_floor_positive"
          if (isPositive) {
            requireEvidence(
              recordOf(comparisonEvidence)?.phase === "product_floor_control",
              "product-floor positive comparison is not the withheld control",
            )
            requireEvidence(
              recordOf(recordOf(recordOf(comparisonPreManifest)?.inputs)?.database)?.sha256 ===
                recordOf(startingDatabaseBinding)?.sha256,
              "product-floor positive/control did not start from identical database bytes",
            )
          }
          const before = yield* domainDigest()
          const beforeFrontier = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
          const locatorProjection = yield* database.db.transaction((tx) =>
            TurnLearningContext.projectLearningContext(tx, {
              currentSessionID: SessionID.create(),
              limit: 8,
            }),
          )
          const sourceLocator = locatorProjection.entries.find(
            (entry) =>
              entry.locator.status === "available" &&
              "navigationHint" in entry &&
              entry.navigationHint?.sessionTitle === "Gate 23 source-discriminating product floor",
          )
          requireEvidence(sourceLocator?.locator.status === "available", "product-floor phase lost the source locator")
          const target = yield* runTurn({
            label: selectedPhase,
            sessionID: SessionID.create(),
            title: `Gate 23 ${selectedPhase}`,
            permissions: effectiveReadCapabilities,
            limits: isPositive ? { model: 4, tool: 3 } : { model: 1, tool: 1 },
            text: [
              "继续我们上次精确停下的学习步骤。当前消息没有给出算式；不要凭常识泛讲。",
              "只有在你能从授权的 recent Interaction 精确读取上次的具体数值和停点时，才继续那一步。",
              "如果读不到，只问一个最小问题来确认要继续哪个未完成例子。不要声称我已有进度或遵守了建议。",
            ].join(" "),
          })
          const text = scenarioText(target)
          if (isPositive) {
            const interactionReads = target.tools.filter((tool) => tool.tool === LEARNING_INTERACTION_READ_TOOL_ID)
            const read = interactionReads.find(
              (tool) =>
                tool.state.status === "completed" &&
                /84217/.test(tool.state.output) &&
                /27109/.test(tool.state.output) &&
                /2890/.test(tool.state.output),
            )
            requireEvidence(read, "product-floor positive omitted its source-bearing exact Interaction read")
            requireEvidence(
              read.state.status === "completed" &&
                recordOf(read.state.input)?.action === "read_recent_range" &&
                /84217/.test(read.state.output) &&
                /27109/.test(read.state.output) &&
                /2890/.test(read.state.output),
              "product-floor compact exact Interaction read omitted the decisive prior fact",
            )
            requireEvidence(
              /27109/.test(text) &&
                /2890/.test(text) &&
                /1099/.test(text) &&
                /[（(]\s*2890\s*[,，]\s*\\?[,]?\s*1099\s*[)）]/.test(text),
              "product-floor positive emitted a generic answer instead of the exact continuation",
            )
            const controlText = scenarioText(
              recordOf(recordOf(comparisonEvidence)?.scenarios)?.["product_floor_control"],
            )
            requireEvidence(controlText.length > 0 && controlText !== text, "product-floor control did not differ")
            requireEvidence(
              !/(?:84217|27109|2890|1099)/.test(controlText),
              "product-floor withheld control guessed the source-discriminating fact",
            )
            scenarios["product-floor-positive-oracle"] = {
              actionClass: "exact_prior_interaction_continuation",
              exactInteractionRead: true,
              interactionReadAttempts: interactionReads.map((tool) => ({
                action: recordOf(tool.state.input)?.action,
                status: tool.state.status,
              })),
              matchedControlFingerprint: sha256(controlText),
              positiveFingerprint: sha256(text),
              sourceLocator,
            }
          } else {
            requireEvidence(
              !target.tools.some((tool) => tool.tool === LEARNING_INTERACTION_READ_TOOL_ID),
              "product-floor withheld control unexpectedly read Interaction detail",
            )
            requireEvidence(
              clarificationActCount(text) === 1,
              "product-floor control did not make one minimal clarification request",
            )
            requireEvidence(!/(?:84217|27109|2890|1099)/.test(text), "product-floor control guessed the prior fact")
            scenarios["product-floor-control-oracle"] = {
              actionClass: "one_source_clarification",
              exactInteractionRead: false,
              clarificationForm: questionCount(text) === 1 ? "interrogative" : "directive_request",
              textFingerprint: sha256(text),
            }
          }
          requireNoManagementLeak(text, selectedPhase)
          requireEvidence(
            JSON.stringify(yield* domainDigest()) === JSON.stringify(before),
            `${selectedPhase} changed learning-domain owner tables`,
          )
          requireEvidence(
            JSON.stringify(yield* database.db.transaction((tx) => LearningFrontier.read(tx))) ===
              JSON.stringify(beforeFrontier),
            `${selectedPhase} changed the shared learning frontier`,
          )
          scenarios[target.label] = target
        } else if (selectedPhase === "zero_write") {
          const sessionID = SessionID.create()
          const first = yield* runTurn({
            label: "zero-write-key-picture",
            sessionID,
            title: "Gate 23 zero-write feedback",
            permissions: effectiveReadCapabilities,
            limits: { model: 3, tool: 3 },
            text: "用一把钥匙的具体画面解释 mutex。只解释，不创建或修改任何持久学习记录。",
          })
          requireEvidence(first.tools.length === 0, "zero-write first teaching used a tool")
          const firstText = scenarioText(first)
          requireEvidence(/钥匙|key/i.test(firstText), "zero-write first move omitted the requested key picture")
          const before = yield* domainDigest()
          const beforeFrontier = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
          const second = yield* runTurn({
            label: "zero-write-bridge-adaptation",
            sessionID,
            permissions: effectiveReadCapabilities,
            limits: { model: 3, tool: 3 },
            text: "刚才的钥匙画面没有帮助。改用单车道桥，具体说明一个线程通过时等待线程在做什么；不要写入学习状态或建议。",
          })
          const secondText = scenarioText(second)
          requireEvidence(second.tools.length === 0, "zero-write feedback move used a tool")
          requireEvidence(
            /桥|bridge/i.test(secondText) && /等待|wait/i.test(secondText),
            "zero-write move did not adapt",
          )
          requireEvidence(firstText !== secondText, "zero-write feedback did not change the move")
          requireEvidence(
            JSON.stringify(yield* domainDigest()) === JSON.stringify(before),
            "zero-write feedback changed learning-domain owner tables",
          )
          requireEvidence(
            JSON.stringify(yield* database.db.transaction((tx) => LearningFrontier.read(tx))) ===
              JSON.stringify(beforeFrontier),
            "zero-write feedback changed the shared learning frontier",
          )
          requireNoManagementLeak(firstText, first.label)
          requireNoManagementLeak(secondText, second.label)
          scenarios[first.label] = first
          scenarios[second.label] = second
          scenarios["zero-write-oracle"] = {
            actionClassBefore: "key_picture_explanation",
            actionClassAfter: "one_lane_bridge_explanation",
            sameSessionHistory: true,
            ownerTablesAndFrontierStable: true,
          }
        } else if (selectedPhase === "intermittent_control" || selectedPhase === "intermittent") {
          const isPositive = selectedPhase === "intermittent"
          if (isPositive) {
            requireEvidence(
              recordOf(comparisonEvidence)?.phase === "intermittent_control",
              "intermittent comparison is not the exact control phase",
            )
            requireEvidence(
              recordOf(recordOf(recordOf(comparisonPreManifest)?.inputs)?.database)?.sha256 ===
                recordOf(startingDatabaseBinding)?.sha256,
              "intermittent positive/control did not start from identical database bytes",
            )
          }
          const before = yield* domainDigest()
          const beforeFrontier = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
          const gapMillis = Math.max(0, qualificationStartedAt - beforeFrontier.time)
          requireEvidence(gapMillis > 0, "intermittent phase observed no trusted time gap after setup")
          const identity = yield* database.db
            .get<{
              id: Parameters<typeof LearnerStateJudgment.readCurrent>[1]
            }>(sql`SELECT id FROM learner_state_judgment ORDER BY time_created, id LIMIT 1`)
            .pipe(Effect.orDie)
          requireEvidence(identity, "intermittent phase has no learner-state identity")
          const currentBefore = yield* database.db.transaction((tx) =>
            LearnerStateJudgment.readCurrent(tx, identity.id, Date.now()),
          )
          requireEvidence(currentBefore?.currentHead, "intermittent phase has no current learner-state head")
          const nonInteractionReads = effectiveReadCapabilities.filter(
            (capability) => capability !== LEARNING_INTERACTION_READ_TOOL_ID,
          )
          const returnPrompt = [
            "Repa 关闭了一段时间，我可能在别处学习过；不要从时间、沉默、作业或旧建议推断活动、零进展、遵守或掌握。",
            "读取当前 learner-state 精确正文，然后只问一个直接针对其中明确‘仍困难’事项、会改变下一步的具体归纳问题；不要要求我再次证明正文明确说我已能可靠完成的事项。",
            "问题只要求一个可直接回答的一步，不追问理由、依据、第二个维度或结果，也不要直接给答案。",
            "不要写入任何状态，不要要求我重建每天做了什么，回复只能有一个问号。",
          ].join(" ")
          const returnSessionID = SessionID.create()
          const returnMove = yield* runTurn({
            label: `${selectedPhase}-return-question`,
            sessionID: returnSessionID,
            title: `Gate 23 ${selectedPhase} return`,
            permissions: [...nonInteractionReads, LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY],
            limits: { model: 6, tool: 8 },
            text: returnPrompt,
          })
          const returnText = scenarioText(returnMove)
          requireEvidence(
            returnMove.tools.some(
              (tool) => tool.tool === LEARNER_STATE_JUDGMENT_READ_TOOL_ID && tool.state.status === "completed",
            ),
            `${selectedPhase} return omitted the exact learner-state read`,
          )
          requireEvidence(
            !returnMove.tools.some((tool) => tool.tool === LEARNING_INTERACTION_READ_TOOL_ID),
            `${selectedPhase} return read a prior Interaction instead of the owner state`,
          )
          requireEvidence(
            !returnMove.tools.some((tool) => tool.tool === LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY),
            `${selectedPhase} return wrote learner state before the learner correction`,
          )
          requireSubstantiveScaffold(returnText, `${selectedPhase}-return-question`)
          requireEvidence(
            scaffoldLevel(returnText) === "diagnosis",
            `${selectedPhase} return did not ask a diagnosis-level question`,
          )
          scenarios[returnMove.label] = returnMove

          if (isPositive) {
            const controlText = scenarioText(
              recordOf(recordOf(comparisonEvidence)?.scenarios)?.["intermittent_control-return-question"],
            )
            requireEvidence(
              scaffoldLevel(controlText) === "diagnosis",
              "intermittent control comparison is not diagnosis-level",
            )
            const correctionText = [
              "回答刚才的问题并纠正我当前的学习状态：我现在能可靠指出归纳步骤中的不变量和代数不匹配。",
              "剩下的困难是独立完成修复后的证明。请把这个自然纠正写入当前 learner-state judgment，",
              "保留不确定性，不要创建进度、活动、作业完成或建议遵守记录。",
            ].join(" ")
            const correction = yield* runTurn({
              label: "intermittent-natural-correction",
              sessionID: returnSessionID,
              permissions: [...nonInteractionReads, LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY],
              limits: { model: 6, tool: 8 },
              text: correctionText,
            })
            const correctionTool = correction.tools.find(
              (tool) =>
                tool.tool === LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY &&
                tool.state.status === "completed",
            )
            requireEvidence(correctionTool, "intermittent natural correction did not update learner state")
            requireEvidence(
              correctionTool.state.status === "completed" &&
                recordOf(correctionTool.state.metadata)?.outcome === "applied",
              "intermittent learner-state correction did not apply",
            )
            const currentRead = returnMove.tools.find(
              (tool) => tool.tool === LEARNER_STATE_JUDGMENT_READ_TOOL_ID && tool.state.status === "completed",
            )
            requireEvidence(currentRead, "intermittent compact correction lost its exact current-read predecessor")
            const correctionCandidate = yield* database.db
              .select({ envelope: TurnToolCandidateTable.normalized_envelope })
              .from(TurnToolCandidateTable)
              .where(eq(TurnToolCandidateTable.part_id, correctionTool.partID))
              .get()
              .pipe(Effect.orDie)
            const correctionCandidateInput = recordOf(recordOf(correctionCandidate?.envelope)?.input)
            const candidateCause = recordOf(correctionCandidateInput?.cause)
            const candidateExcerpt = recordOf(candidateCause?.excerpt)
            const candidateSnapshot = recordOf(correctionCandidateInput?.snapshot)
            const sourceExcerpt =
              correctionCandidateInput?.operation === "revise_from_current_read"
                ? correctionCandidateInput.sourceExcerpt
                : candidateExcerpt?.text
            const sourceStart = typeof sourceExcerpt === "string" ? correctionText.indexOf(sourceExcerpt) : -1
            const currentSubjectInput = {
              label: currentBefore.revision.snapshot.subject.label,
              scope:
                currentBefore.revision.snapshot.subject.scope.type === "learner_home"
                  ? { type: "learner_home" }
                  : {
                      type: "anchored",
                      anchors: currentBefore.revision.snapshot.subject.scope.anchors.map((anchor) => anchor.ref),
                    },
            }
            const exactFullProjection =
              correctionCandidateInput?.operation === "revise" &&
              correctionCandidateInput.judgmentID === identity.id &&
              recordOf(correctionCandidateInput.expectedHead)?.revisionID === currentBefore.revision.id &&
              recordOf(correctionCandidateInput.expectedHead)?.version === currentBefore.revision.version &&
              recordOf(correctionCandidateInput.expectedHead)?.ownerCutFingerprint ===
                currentBefore.currentHead.ownerCutFingerprint &&
              candidateCause?.type === "learner_correction" &&
              typeof sourceExcerpt === "string" &&
              sourceStart >= 0 &&
              correctionText.indexOf(sourceExcerpt, sourceStart + sourceExcerpt.length) < 0 &&
              candidateExcerpt?.startByte === utf8Bytes(correctionText.slice(0, sourceStart)) &&
              candidateExcerpt?.endByte === utf8Bytes(correctionText.slice(0, sourceStart + sourceExcerpt.length)) &&
              JSON.stringify(recordOf(candidateSnapshot?.subject)) === JSON.stringify(currentSubjectInput) &&
              JSON.stringify(candidateSnapshot?.exactBasisRefs) ===
                JSON.stringify(currentBefore.revision.snapshot.exactBasis.map((basis) => basis.ref))
            const compactProjection =
              correctionCandidateInput?.operation === "revise_from_current_read" &&
              correctionCandidateInput.currentReadCallID === currentRead.callID &&
              typeof sourceExcerpt === "string" &&
              sourceStart >= 0 &&
              correctionText.indexOf(sourceExcerpt, sourceStart + sourceExcerpt.length) < 0
            requireEvidence(
              compactProjection || exactFullProjection,
              "intermittent correction was neither a compact current-read projection nor an exact full current-head/source projection",
            )
            const expandedCorrectionInput = recordOf(correctionTool.state.input)
            const expandedCorrectionCause = recordOf(expandedCorrectionInput?.cause)
            const expandedCorrectionExcerpt = recordOf(expandedCorrectionCause?.excerpt)
            requireEvidence(
              expandedCorrectionInput?.operation === "revise" &&
                expandedCorrectionInput.judgmentID === identity.id &&
                recordOf(expandedCorrectionInput.expectedHead)?.revisionID === currentBefore.revision.id &&
                expandedCorrectionCause?.type === "learner_correction" &&
                expandedCorrectionExcerpt?.text === sourceExcerpt,
              "intermittent correction did not settle the exact owner command/head/source",
            )
            requireNoManagementLeak(scenarioText(correction), correction.label)
            const currentAfter = yield* database.db.transaction((tx) =>
              LearnerStateJudgment.readCurrent(tx, identity.id, Date.now()),
            )
            requireEvidence(
              currentAfter &&
                currentAfter.revision.id !== currentBefore.revision.id &&
                currentAfter.revision.version === currentBefore.revision.version + 1,
              "intermittent correction did not create the exact successor",
            )
            const afterCorrection = yield* domainDigest()
            const changedTables = [...new Set([...Object.keys(before), ...Object.keys(afterCorrection)])].filter(
              (name) => JSON.stringify(before[name]) !== JSON.stringify(afterCorrection[name]),
            )
            requireEvidence(
              changedTables.length > 0 && changedTables.every((name) => name.startsWith("learner_state_judgment")),
              `intermittent correction changed unrelated owner tables: ${changedTables.join(", ")}`,
            )
            const afterCorrectionFrontier = yield* database.db.transaction((tx) => LearningFrontier.read(tx))
            requireEvidence(
              afterCorrectionFrontier.sequence === beforeFrontier.sequence + 1,
              "intermittent correction did not advance exactly one shared-learning transition",
            )

            const successor = yield* runTurn({
              label: "intermittent-fresh-successor-consumer",
              sessionID: SessionID.create(),
              title: "Gate 23 intermittent fresh successor",
              permissions: nonInteractionReads,
              limits: { model: 6, tool: 8 },
              text: returnPrompt,
            })
            const successorText = scenarioText(successor)
            requireEvidence(
              successor.tools.some(
                (tool) => tool.tool === LEARNER_STATE_JUDGMENT_READ_TOOL_ID && tool.state.status === "completed",
              ),
              "intermittent successor consumer omitted the exact learner-state read",
            )
            requireEvidence(
              !successor.tools.some((tool) => tool.tool === LEARNING_INTERACTION_READ_TOOL_ID),
              "intermittent successor consumer used correction Interaction history",
            )
            requireSubstantiveScaffold(successorText, successor.label)
            requireEvidence(
              scaffoldLevel(successorText) === "repair_or_completion",
              "intermittent successor did not change to repair/completion",
            )
            requireEvidence(successorText !== controlText, "intermittent successor did not differ from control")
            requireNoManagementLeak(successorText, successor.label)
            requireEvidence(
              JSON.stringify(yield* domainDigest()) === JSON.stringify(afterCorrection),
              "intermittent successor consumer changed owner tables",
            )
            requireEvidence(
              JSON.stringify(yield* database.db.transaction((tx) => LearningFrontier.read(tx))) ===
                JSON.stringify(afterCorrectionFrontier),
              "intermittent successor consumer changed the shared learning frontier",
            )
            scenarios[correction.label] = correction
            scenarios[successor.label] = successor
            scenarios["intermittent-positive-oracle"] = {
              gapMillis,
              questionBeforeCorrection: sha256(returnText),
              controlQuestion: sha256(controlText),
              successorQuestion: sha256(successorText),
              priorRevisionID: currentBefore.revision.id,
              successorRevisionID: currentAfter.revision.id,
              changedTables,
              noActivityInference: true,
              freshSuccessorWithoutInteractionRead: true,
              compactCorrection: {
                projection: compactProjection ? "compact_current_read" : "exact_full_current_head",
                predecessorCallID: compactProjection ? currentRead.callID : undefined,
                sourceExcerptFingerprint: sha256(sourceExcerpt),
                candidateOperation: correctionCandidateInput.operation,
                ownerOperation: expandedCorrectionInput.operation,
              },
            }
          } else {
            requireEvidence(
              JSON.stringify(yield* domainDigest()) === JSON.stringify(before),
              "intermittent control changed learning-domain owner tables",
            )
            requireEvidence(
              JSON.stringify(yield* database.db.transaction((tx) => LearningFrontier.read(tx))) ===
                JSON.stringify(beforeFrontier),
              "intermittent control changed the shared learning frontier",
            )
            scenarios["intermittent-control-oracle"] = {
              gapMillis,
              actionClass: "one_diagnosis_question",
              exactLearnerStateRead: true,
              noActivityInference: true,
              textFingerprint: sha256(returnText),
            }
          }
        } else {
          const comparisonScenarios = recordOf(recordOf(comparisonEvidence)?.scenarios)
          const clearComparison = comparisonScenarios?.["clear-target"]
          const clearAbilityComparison = comparisonScenarios?.["clear-ability-control"]
          if (selectedPhase === "ambiguous" || selectedPhase === "corrected") {
            requireEvidence(recordOf(comparisonEvidence)?.phase === "clear", "comparison evidence is not a clear phase")
            requireEvidence(
              recordOf(comparisonEvidence)?.status === "phase_passed" && clearComparison,
              "comparison evidence has no passed clear target",
            )
            if (selectedPhase === "corrected") {
              requireEvidence(clearAbilityComparison, "comparison evidence has no clear ability-control target")
            }
            requireEvidence(
              recordOf(recordOf(recordOf(comparisonPreManifest)?.inputs)?.database)?.sha256 ===
                recordOf(startingDatabaseBinding)?.sha256,
              `${selectedPhase} did not start from the exact clear-phase base database bytes`,
            )
            requireSubstantiveScaffold(scenarioText(clearComparison), "bound clear comparison")
          }

          const correction =
            selectedPhase === "corrected"
              ? yield* Effect.gen(function* () {
                  const sourceText =
                    "Correction to my current learner state: I can now reliably identify the invariant and locate algebraic mismatches in induction steps; what remains difficult is completing the repaired proof independently under time pressure."
                  const identity = yield* database.db
                    .get<{ id: Parameters<typeof LearnerStateJudgment.readCurrent>[1] }>(
                      sql`
                      SELECT id FROM learner_state_judgment ORDER BY time_created, id LIMIT 1
                    `,
                    )
                    .pipe(Effect.orDie)
                  requireEvidence(identity, "correction fixture has no learner-state identity")
                  const current = yield* database.db.transaction((tx) =>
                    LearnerStateJudgment.readCurrent(tx, identity.id, Date.now()),
                  )
                  requireEvidence(current, "correction fixture has no current learner-state head")
                  const applied = yield* applySeedCommand(
                    "learner-state-correction",
                    LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY,
                    {
                      operation: "revise",
                      judgmentID: current.judgmentRevisionRef.judgmentID,
                      expectedHead: {
                        revisionID: current.revision.id,
                        version: current.revision.version,
                        ownerCutFingerprint: LearnerStateJudgment.headReferenceFingerprint({
                          id: current.judgmentRevisionRef.judgmentID,
                          timeCreated: current.revision.timeCommitted,
                          current: current.revision,
                        }),
                      },
                      cause: {
                        type: "learner_correction",
                        excerpt: { text: sourceText, startByte: 0, endByte: utf8Bytes(sourceText) },
                      },
                      snapshot: {
                        subject: {
                          label: current.revision.snapshot.subject.label,
                          scope:
                            current.revision.snapshot.subject.scope.type === "learner_home"
                              ? { type: "learner_home" }
                              : {
                                  type: "anchored",
                                  anchors: current.revision.snapshot.subject.scope.anchors.map((anchor) => anchor.ref),
                                },
                        },
                        judgmentBody:
                          "The learner can now reliably identify the invariant and locate algebraic mismatches in induction steps; independent completion of the repaired proof under time pressure remains difficult.",
                        exactBasisRefs: current.revision.snapshot.exactBasis.map((basis) => basis.ref),
                        uncertaintyAndLimits:
                          "Fallible learner correction about the current whole judgment; independent repaired-proof completion remains unobserved.",
                        basisScope: "whole_judgment",
                      },
                      rationale: "Keep subsequent teaching aligned with the learner's explicit correction.",
                    },
                    LearnerStateJudgment.PERMISSION_PATTERN,
                    sourceText,
                  )
                  const oldCut = yield* database.db
                    .select()
                    .from(TurnLearningContextCutTable)
                    .where(
                      eq(
                        TurnLearningContextCutTable.assistant_message_id,
                        applied.interaction.registration.assistantMessageID,
                      ),
                    )
                    .get()
                    .pipe(Effect.orDie)
                  requireEvidence(oldCut, "typed correction did not retain its pre-correction Context cut")
                  return {
                    priorRevisionID: current.revision.id,
                    assistantMessageID: applied.interaction.registration.assistantMessageID,
                    cut: {
                      canonical: oldCut.canonical_cut,
                      rendered: oldCut.rendered_block,
                      fingerprint: oldCut.cut_fingerprint,
                      renderedFingerprint: oldCut.rendered_fingerprint,
                    },
                  }
                })
              : undefined

          const before = yield* domainDigest()
          const beforeWatermark = yield* retainedSteeringWatermark()
          const abilityControl =
            selectedPhase === "clear" || selectedPhase === "corrected"
              ? yield* runTurn({
                  label: `${selectedPhase}-ability-control`,
                  sessionID: SessionID.create(),
                  title: `Gate 23 ${selectedPhase} learner-state control`,
                  permissions: effectiveReadCapabilities,
                  limits: { model: 6, tool: 8 },
                  text: "先读取对我当前能力判断的精确正文，再根据其中“仍困难”的内容，只问一个能直接推进当前归纳学习的具体问题。问题必须把那项困难具体化，不得复述正文，也不得泛问“下一步做哪个动作”；回复只能有一个问号，不要同时询问理由、依据、结果或第二个维度，也不要直接给答案。",
                })
              : undefined
          if (abilityControl) {
            scenarios[abilityControl.label] = abilityControl
            const abilityText = scenarioText(abilityControl)
            requireEvidence(
              abilityControl.tools.some(
                (tool) => tool.tool === LEARNER_STATE_JUDGMENT_READ_TOOL_ID && tool.state.status === "completed",
              ),
              `${abilityControl.label} did not read the exact learner-state judgment`,
            )
            requireSubstantiveScaffold(abilityText, abilityControl.label)
            const level = scaffoldLevel(abilityText)
            requireEvidence(
              level === (selectedPhase === "clear" ? "diagnosis" : "repair_or_completion"),
              `${abilityControl.label} did not target the exact current difficulty`,
            )
            scenarios[`${selectedPhase}-ability-control-oracle`] = {
              actionClass: level,
              exactLearnerStateRead: true,
              noManagementLeakOrFabricatedClaim: true,
            }
          }
          const sessionID = SessionID.create()
          const ambiguous = selectedPhase === "ambiguous"
          const preparation = yield* runTurn({
            label: `${selectedPhase}-recent-attempt`,
            sessionID,
            title: `Gate 23 ${selectedPhase} collision`,
            permissions: effectiveReadCapabilities,
            limits: { model: 2, tool: 2 },
            text: ambiguous
              ? [
                  "先在当前对话中记住下面两份互不相同的归纳证明尝试，不要解题、评价、排序或复述；只回复“我已记住两份尝试”。",
                  "尝试 A：证明前 n 个奇数之和为 n²。归纳步写成 k²+2k=(k+1)²。",
                  "尝试 B：证明 1+2+…+n=n(n+1)/2。归纳步把 k(k+1)/2+(k+1) 化成 (k+1)²/2。",
                  "两份尝试同等当前、没有默认项；下一条如果我只说“那个证明”，仅凭这句话不能知道我指哪一份。",
                ].join(" ")
              : [
                  "先在当前对话中记住这一份归纳证明尝试，不要解题、评价或复述；只回复“我已记住这份尝试”。",
                  "尝试：证明前 n 个奇数之和为 n²。归纳步假设前 k 个奇数之和为 k²，然后我写成 k²+2k=(k+1)²。",
                ].join(" "),
          })
          scenarios[preparation.label] = preparation
          const target = yield* runTurn({
            label: `${selectedPhase}-target`,
            sessionID,
            limits: { model: 6, tool: 8 },
            text: "继续我刚才那个证明。帮我找出错误的归纳步骤；只输出一个引导我自己发现的问句，只问一个可以直接回答的量或一步，不得要求比较两个量，也不得用“而、以及、同时、再”并列第二个询问；回复只能有一个问号，不要直接给完整证明。",
          })
          scenarios[target.label] = target
          const targetText = scenarioText(target)
          if (selectedPhase === "ambiguous") {
            requireReferentClarification(targetText, target.label)
            scenarios["ambiguous-semantic-oracle"] = {
              actionClass: "one_learner_visible_referent_clarification",
              clearComparisonActionClass: "one_substantive_scaffold_question",
              clearComparisonTextFingerprint: sha256(scenarioText(clearComparison)),
              ambiguousTextFingerprint: sha256(targetText),
              identicalStartingDatabase: true,
              noManagementLeakOrFabricatedClaim: true,
            }
          } else {
            requireSubstantiveScaffold(targetText, target.label)
            scenarios[`${selectedPhase}-semantic-oracle`] = {
              actionClass: "one_substantive_scaffold_question",
              scaffoldLevel: scaffoldLevel(targetText),
              noManagementLeakOrFabricatedClaim: true,
            }
          }

          if (selectedPhase === "corrected") {
            const oldCut = correction
            const currentCut = abilityControl?.cuts.at(-1)
            requireEvidence(oldCut && currentCut, "correction trace did not admit old and current Context cuts")
            const oldRow = yield* database.db
              .select()
              .from(TurnLearningContextCutTable)
              .where(eq(TurnLearningContextCutTable.assistant_message_id, oldCut.assistantMessageID))
              .get()
              .pipe(Effect.orDie)
            requireEvidence(
              oldRow?.canonical_cut === oldCut.cut.canonical &&
                oldRow.rendered_block === oldCut.cut.rendered &&
                oldRow.cut_fingerprint === oldCut.cut.fingerprint &&
                oldRow.rendered_fingerprint === oldCut.cut.renderedFingerprint,
              "the old admitted correction cut did not remain byte-exact",
            )
            const currentLearnerState = LearningContext.decodeStored(
              currentCut.cut.canonical,
              currentCut.cut.rendered,
              currentCut.assistantMessageID,
            ).sections.find((section) => section.owner === "learner_state_judgment")
            const oldRevision = correction.priorRevisionID
            const currentRevision = recordOf(currentLearnerState?.entries[0]?.locator)?.revisionID
            requireEvidence(
              typeof oldRevision === "string" &&
                typeof currentRevision === "string" &&
                oldRevision !== currentRevision &&
                oldCut.cut.fingerprint !== currentCut.cut.fingerprint,
              "learner-state correction did not produce a new revision and Context fingerprint",
            )
            requireEvidence(
              scaffoldLevel(scenarioText(clearAbilityComparison)) === "diagnosis" &&
                scaffoldLevel(scenarioText(abilityControl)) === "repair_or_completion",
              "the learner-state correction did not change the later move from diagnosis to repair/completion",
            )
            scenarios["corrected-causal-oracle"] = {
              oldLearnerStateRevision: oldRevision,
              currentLearnerStateRevision: currentRevision,
              oldCutFingerprint: oldCut.cut.fingerprint,
              currentCutFingerprint: currentCut.cut.fingerprint,
              oldCutByteExactAfterCorrection: true,
              clearComparisonTextFingerprint: sha256(scenarioText(clearAbilityComparison)),
              correctedTextFingerprint: sha256(scenarioText(abilityControl)),
              clearActionClass: scaffoldLevel(scenarioText(clearAbilityComparison)),
              correctedActionClass: scaffoldLevel(scenarioText(abilityControl)),
              identicalStartingDatabase: true,
            }
          }

          if (selectedPhase === "clear") {
            const composedCut = abilityControl?.cuts[0]?.cut
            requireEvidence(
              composedCut?.sections.length === 10,
              "clear ability-control target did not receive all ten owner families",
            )
            const composedSections = Object.fromEntries(composedCut.sections.map((section) => [section.owner, section]))
            requireEvidence(
              [
                "course",
                "learner_navigation",
                "learner_goal",
                "material",
                "interaction",
                "learner_response_evidence",
                "future_attention",
                "assignment",
                "learner_state_judgment",
                "advisory_plan_suggestion",
              ].every((owner) => Number(composedSections[owner]?.entries ?? 0) >= 1),
              "clear ability-control target did not retain a contribution from every producer family",
            )

            const reversibleDefault = yield* runTurn({
              label: "clear-reversible-default",
              sessionID: SessionID.create(),
              title: "Gate 23 transparent reversible default",
              permissions: effectiveReadCapabilities,
              limits: { model: 6, tool: 8 },
              text: "仅依据已经提供的自动学习情境，不调用额外读取；在不替我作承诺、不假定我已经完成或遵守任何任务或建议的前提下，直接采取一个安全、可逆、立刻有用的下一步；不要给内部菜单。",
            })
            scenarios[reversibleDefault.label] = reversibleDefault
            const reversibleText = scenarioText(reversibleDefault)
            requireTransparentReversibleMove(reversibleText, reversibleDefault.label)
            requireEvidence(
              reversibleDefault.tools.length === 0,
              "transparent reversible default ignored the exact no-read request",
            )
            scenarios["clear-reversible-default-oracle"] = {
              actionClass: "transparent_reversible_learning_move",
              toolCalls: 0,
              noInternalMenu: true,
              noManagementLeakOrFabricatedClaim: true,
            }

            const lazyDetail = yield* runTurn({
              label: "clear-lazy-advisory-detail",
              sessionID: SessionID.create(),
              title: "Gate 23 exact lazy-detail use",
              permissions: effectiveReadCapabilities,
              limits: { model: 6, tool: 8 },
              text: "读取当前归纳练习建议的精确正文。只有当精确正文确实要求先做具体反例时，才按它问我一个、且仅一个学习问题；否则如实说明缺少依据。",
            })
            scenarios[lazyDetail.label] = lazyDetail
            const completedAdvisoryRead = lazyDetail.tools.find(
              (tool) => tool.tool === ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID && tool.state.status === "completed",
            )
            requireEvidence(completedAdvisoryRead, "exact advisory detail did not use the authorized lazy owner read")
            const lazyDetailText = scenarioText(lazyDetail)
            requireTransparentReversibleMove(lazyDetailText, lazyDetail.label)
            requireEvidence(
              /具体反例|concrete counterexample/i.test(lazyDetailText),
              "lazy-detail result did not condition its learning prompt on the exact advisory body",
            )
            scenarios["clear-lazy-detail-oracle"] = {
              authorizedRead: ADVISORY_PLAN_SUGGESTION_READ_TOOL_ID,
              completed: true,
              actionClass: "one_detail_conditioned_learning_prompt",
              noManagementLeakOrFabricatedClaim: true,
            }
          }
          const after = yield* domainDigest()
          const afterWatermark = yield* retainedSteeringWatermark()
          requireEvidence(
            JSON.stringify(after) === JSON.stringify(before),
            `${selectedPhase} target changed learning-domain owner tables`,
          )
          requireEvidence(
            afterWatermark.steeringRevision === beforeWatermark.steeringRevision &&
              afterWatermark.latestCutAsOf >= beforeWatermark.latestCutAsOf,
            `${selectedPhase} changed retained steering meaning instead of only advancing its admitted-cut watermark`,
          )
          scenarios[`${selectedPhase}-domain-stability`] = {
            before,
            after,
            equal: true,
            retainedSteeringWatermark: { before: beforeWatermark, after: afterWatermark },
          }
        }

        const credentials = collectSecretStrings(JSON.parse(process.env.REPA_AUTH_CONTENT!))
        requireEvidence(
          providerRequests.every((request) => credentials.every((value) => !request.body.includes(value))),
          "a captured provider body contained a credential value",
        )
        requireEvidence(
          selectedPhase === "setup" ? providerRequests.length === 0 : providerRequests.length > 0,
          selectedPhase === "setup"
            ? "typed setup unexpectedly called the provider"
            : `${selectedPhase} captured no provider request`,
        )
        requireEvidence(
          providerRequests.length <= maximumProviderRequests,
          `${selectedPhase} exceeded its provider request ceiling`,
        )
        requireEvidence(
          selectedPhase === "setup" ? carrierRequests.length === 0 : carrierRequests.length > 0,
          selectedPhase === "setup"
            ? "typed setup unexpectedly used the interactive carrier"
            : `${selectedPhase} captured no primary-carrier request`,
        )
        requireEvidence(
          carrierRequests.length % 3 === 0 &&
            carrierRequests.every((request) =>
              credentials.every(
                (value) => !request.requestBody.includes(value) && !request.responseBody.includes(value),
              ),
            ),
          `${selectedPhase} carrier capture was incomplete or contained a credential value`,
        )

        return {
          run: "gate23-gpt-5.6-luna-released-v1-01",
          status: "phase_passed",
          phase: selectedPhase,
          authority: {
            maintainerAuthorizedCredentialAndRequestCeiling: true,
            authorizationBasis: "additional_calls_as_needed_with_explicit_finite_per_run_budgets",
            channel: "latest",
            version: "1.17.18",
            provider: model.providerID,
            model: model.modelID,
            isolatedWorkspace: workspace,
            isolatedDatabase: process.env.REPA_DB,
            isolatedModelCatalog: process.env.REPA_MODELS_PATH,
            preManifest: preManifestBinding,
          },
          limits: {
            configuredPhaseProviderRequests,
            remainingTotalProviderRequestsAtStart: remainingTotalProviderRequests,
            remainingLegProviderRequestsAtStart: remainingLegProviderRequests,
            maximumProviderRequests,
            maximumModelOperationsPerTurn: 6,
            maximumToolCallsPerTurn: 8,
          },
          fixture,
          scenarios,
          permissionRequests,
          carrierRequests,
          providerRequests: providerRequests.map((request) => ({ ...request, bodySecretScan: "passed" })),
        }
      }).pipe(Effect.scoped, Effect.provideService(InstanceRef, instance))
      yield* store.disposeAll()
      return result
    }).pipe(Effect.scoped),
  ),
).finally(async () => {
  try {
    try {
      await Server.disposeDefault()
    } finally {
      await AppRuntime.dispose()
    }
  } finally {
    await removeIsolatedRefreshedAuth()
  }
})
await recordRunnerEvent({
  type: "application_runtime_disposed",
  status: evidence.status,
  providerRequestCount: evidence.providerRequests.length,
  carrierRequestCount: evidence.carrierRequests.length,
})

const checkpointDatabase = new SQLiteDatabase(process.env.REPA_DB)
const checkpoint = checkpointDatabase.query("PRAGMA wal_checkpoint(TRUNCATE)").get()
checkpointDatabase.close()
await recordRunnerEvent({ type: "database_checkpointed_and_closed", mode: "TRUNCATE", result: checkpoint })

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function jsonFingerprint(value: unknown) {
  return sha256(JSON.stringify(value))
}

const requestCapture = {
  phase: evidence.phase,
  secretScan: "passed",
  requests: evidence.providerRequests,
}
const carrierCapture = {
  phase: evidence.phase,
  adapter: "primary_tui_generated_v2_sdk",
  handler: "Server.Default().app.fetch",
  secretScan: "passed",
  requests: evidence.carrierRequests,
}
const summary = {
  status: evidence.status,
  phase: evidence.phase,
  outputPath,
  providerRequests: evidence.providerRequests.length,
  carrierRequests: evidence.carrierRequests.length,
  scenarios: Object.keys(evidence.scenarios),
}
await Bun.write(outputPath, JSON.stringify(evidence, null, 2) + "\n")
await Bun.write(requestCapturePath, JSON.stringify(requestCapture, null, 2) + "\n")
await Bun.write(carrierCapturePath, JSON.stringify(carrierCapture, null, 2) + "\n")
await Bun.write(summaryPath, JSON.stringify(summary, null, 2) + "\n")

const scenarioBindings = Object.entries(evidence.scenarios).map(([name, value]) => {
  const scenario = asRecord(value)
  const terminal = scenario?.terminal
  const result = {
    text: scenario?.text,
    tools: scenario?.tools,
    assistants: scenario?.assistants,
  }
  return {
    name,
    fingerprint: jsonFingerprint(value),
    sessionID: scenario?.sessionID,
    turnID: scenario?.turnID,
    inputID: scenario?.inputID,
    request: scenario?.request,
    carrier: scenario?.carrier,
    assistantMessageIDs: Array.isArray(scenario?.assistants)
      ? scenario.assistants.flatMap((assistant) => {
          const id = asRecord(assistant)?.id
          return typeof id === "string" ? [id] : []
        })
      : [],
    terminalFingerprint: terminal === undefined ? undefined : jsonFingerprint(terminal),
    resultFingerprint: jsonFingerprint(result),
    cuts: Array.isArray(scenario?.cuts)
      ? scenario.cuts.map((value, index) => {
          const cut = asRecord(asRecord(value)?.cut)
          return {
            index,
            assistantMessageID: asRecord(value)?.assistantMessageID,
            cutFingerprint: cut?.fingerprint,
            renderedFingerprint: cut?.renderedFingerprint,
            canonicalArtifactFingerprint: typeof cut?.canonical === "string" ? sha256(cut.canonical) : undefined,
            renderedArtifactFingerprint: typeof cut?.rendered === "string" ? sha256(cut.rendered) : undefined,
            providerRequestSequences: asRecord(value)?.providerRequestSequences,
          }
        })
      : [],
  }
})
const postWorkingTree = await captureWorkingTree()
requireEvidence(
  postWorkingTree.fingerprint === workingTree.fingerprint,
  `qualification source drifted from ${workingTree.fingerprint} to ${postWorkingTree.fingerprint}`,
)
const applicationLogCandidates = process.env.XDG_DATA_HOME
  ? [
      path.join(process.env.XDG_DATA_HOME, "repa", "log", "repa.log"),
      path.join(process.env.XDG_DATA_HOME, "log", "repa.log"),
    ]
  : []
const applicationLogBindings = await Promise.all(applicationLogCandidates.map((filename) => bindFile(filename)))
const applicationLog = applicationLogBindings.find((binding) => binding.state === "present") ?? {
  state: "unavailable" as const,
  reason: process.env.XDG_DATA_HOME ? "no_candidate_log_path_present" : "XDG_DATA_HOME_not_set",
}
await recordRunnerEvent({
  type: "final_artifacts_ready",
  candidateFingerprint: postWorkingTree.fingerprint,
  applicationLogPath: applicationLog.state === "present" ? applicationLog.path : undefined,
})
const finalManifest = {
  manifestVersion: 1,
  stage: "final_phase",
  phase: evidence.phase,
  qualificationStartedAt,
  qualificationFinishedAt: Date.now(),
  preManifest: await bindFile(preManifestPath),
  candidate: {
    inputManifest: await bindFile(candidateManifestPath),
    preFingerprint: workingTree.fingerprint,
    postFingerprint: postWorkingTree.fingerprint,
    unchanged: true,
  },
  evidenceBindings: {
    scenarios: scenarioBindings,
    scenariosFingerprint: jsonFingerprint(evidence.scenarios),
    permissionRequestsFingerprint: jsonFingerprint(evidence.permissionRequests),
    providerRequests: evidence.providerRequests.map((request) => ({
      sequence: request.sequence,
      scenario: request.scenario,
      attempt: request.attempt,
      bodyBytes: request.bodyBytes,
      bodyFingerprint: request.bodyFingerprint,
    })),
    providerRequestsFingerprint: jsonFingerprint(evidence.providerRequests),
    carrierRequests: evidence.carrierRequests.map((request) => ({
      sequence: request.sequence,
      scenario: request.scenario,
      method: request.method,
      path: request.path,
      query: request.query,
      requestBytes: request.requestBytes,
      requestFingerprint: request.requestFingerprint,
      responseStatus: request.responseStatus,
      responseBytes: request.responseBytes,
      responseFingerprint: request.responseFingerprint,
    })),
    carrierRequestsFingerprint: jsonFingerprint(evidence.carrierRequests),
  },
  artifacts: {
    resultDatabase: await bindFile(process.env.REPA_DB),
    resultDatabaseWal: await bindFile(`${process.env.REPA_DB}-wal`),
    resultDatabaseShm: await bindFile(`${process.env.REPA_DB}-shm`),
    databaseCheckpoint: { mode: "TRUNCATE", result: checkpoint },
    applicationLog: {
      selected: applicationLog,
      candidates: applicationLogBindings,
    },
    runnerEventLog: await bindFile(runnerEventLogPath),
    evidence: await bindFile(outputPath),
    redactedRequestCapture: await bindFile(requestCapturePath),
    carrierCapture: await bindFile(carrierCapturePath),
    summary: await bindFile(summaryPath),
  },
  route: {
    provider: evidence.authority.provider,
    model: evidence.authority.model,
    runtime: "released-v1",
    carrier: "primary_tui_generated_v2_sdk_via_mounted_handler",
    carrierRequestCount: evidence.carrierRequests.length,
    providerRequestCount: evidence.providerRequests.length,
    providerRequestAttempts: evidence.providerRequests.map((request) => ({
      scenario: request.scenario,
      attempt: request.attempt,
    })),
  },
  valueStatus: {
    directlyStored: [
      "Session/Turn/Input/Assistant identities",
      "canonical and rendered Context cuts",
      "model operations, tool Parts, complete Assistant results, and terminal outcomes",
      "post-checkpoint consolidated result database and explicit WAL/SHM disposition",
      "redacted request capture, summary, runner lifecycle log, and resolved application log when present",
      "primary-carrier request/response capture and exact Session/Turn/Input/Assistant joins",
    ],
    independentlyDerived: [
      "all SHA-256, byte counts, scenario/result/terminal bindings, and artifact bindings in this final manifest",
    ],
    unavailable: ["raw provider response transport frames beyond the durable Assistant/tool result"],
  },
}
await Bun.write(finalManifestPath, JSON.stringify(finalManifest, null, 2) + "\n")
console.log(JSON.stringify({ ...summary, finalManifestPath }))
process.exit(0)
