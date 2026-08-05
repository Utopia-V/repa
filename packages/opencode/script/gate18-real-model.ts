Object.assign(globalThis as typeof globalThis & { REPA_CHANNEL: string; REPA_VERSION: string }, {
  REPA_CHANNEL: "latest",
  REPA_VERSION: "1.17.18",
})

import type { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { GlobalEvent } from "../src/bus/global"

if (process.env.REPA_GATE18_REAL_MODEL_APPROVED !== "1") {
  throw new Error("Set REPA_GATE18_REAL_MODEL_APPROVED=1 only for the maintainer-authorized qualification")
}

const workspace = process.env.REPA_GATE18_WORKDIR
const materialPath = process.env.REPA_GATE18_MATERIAL_PATH
const outputPath = process.env.REPA_GATE18_OUTPUT
const phase = process.env.REPA_GATE18_PHASE
const partialDirectory = process.env.REPA_GATE18_PARTIAL_DIR
const maximumProviderRequests = 96
const phases = [
  "setup-course-goal",
  "filler-goals",
  "out-of-page-material",
  "continuation-corrections",
  "material-drift",
  "material-correction-write",
  "material-fresh-current",
  "restriction-delegation",
  "retry",
  "compaction",
  "carrier-tui",
  "carrier-direct-run",
  "carrier-acp",
  "restart",
  "finalize",
] as const
type Phase = (typeof phases)[number]

if (
  !process.env.REPA_CONFIG_CONTENT ||
  !process.env.REPA_AUTH_CONTENT ||
  !process.env.REPA_DB ||
  !process.env.REPA_MODELS_PATH ||
  !workspace ||
  !materialPath ||
  !outputPath ||
  !partialDirectory ||
  !phases.some((value) => value === phase)
) {
  throw new Error(
    "The Gate 18 qualification requires isolated workspace, material, output, config, auth, model-catalog, and database inputs",
  )
}
const selectedPhase = phase as Phase

type HeaderProjection = Readonly<
  | { name: string; state: "credential" | "account_identity"; byteLength: number }
  | { name: string; state: "value"; value: string }
>

type CapturedProviderRequest = Readonly<{
  sequence: number
  phaseSequence: number
  phase: Phase
  scenario: string
  attempt: number
  method: string
  url: string
  headers: readonly HeaderProjection[]
  body: string
  bodyBytes: number
  bodyFingerprint: string
  injectedFailure: boolean
}>

const originalFetch = globalThis.fetch
const providerRequests: CapturedProviderRequest[] = []
const attempts = new Map<string, number>()
const credentialHeaders = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-goog-api-key)$/i
const accountIdentityHeaders = /^(chatgpt-account-id|openai-organization|openai-project|x-organization-id|x-project-id)$/i
let activeScenario = "startup"
let retryScenario: string | undefined
let retryInjected = false

function sha256(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function projectHeader(name: string, value: string): HeaderProjection {
  if (credentialHeaders.test(name)) return { name, state: "credential", byteLength: utf8Bytes(value) }
  if (accountIdentityHeaders.test(name)) return { name, state: "account_identity", byteLength: utf8Bytes(value) }
  return { name, state: "value", value }
}

const tracedFetch = Object.assign(
  async (input: Parameters<typeof fetch>[0], init?: BunFetchRequestInit) => {
    const request = new Request(input, init)
    if (request.url.startsWith("https://chatgpt.com/backend-api/codex/responses")) {
      const body = await request.clone().text()
      const attempt = (attempts.get(activeScenario) ?? 0) + 1
      attempts.set(activeScenario, attempt)
      const injectedFailure = retryScenario === activeScenario && !retryInjected
      providerRequests.push({
        sequence: providerRequests.length,
        phaseSequence: providerRequests.length,
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
        injectedFailure,
      })
      if (injectedFailure) {
        retryInjected = true
        return new Response(
          JSON.stringify({ error: { message: "Gate 18 injected transient 503", type: "server_error" } }),
          { status: 503, headers: { "content-type": "application/json", "retry-after-ms": "0" } },
        )
      }
    }
    return originalFetch(input, init)
  },
  { preconnect: originalFetch.preconnect },
)
globalThis.fetch = tracedFetch

const { asc, eq, inArray, sql } = await import("drizzle-orm")
const { Effect, Layer } = await import("effect")
const { dirname, join } = await import("node:path")
const { createOpencodeClient } = await import("@opencode-ai/sdk/v2")
const { ContentRoot } = await import("@opencode-ai/core/content-root")
const { Course } = await import("@opencode-ai/core/course")
const { Database } = await import("@opencode-ai/core/database/database")
const { LayerNode } = await import("@opencode-ai/core/effect/layer-node")
const { LearnerGoal } = await import("@opencode-ai/core/learner-goal")
const { LearningContext } = await import("@opencode-ai/core/learning-context")
const { TurnLearningContextCutTable, TurnModelCapacityTable } = await import("@opencode-ai/core/learning-context/sql")
const { LearningCommand } = await import("@opencode-ai/core/learning-command")
const { ModelV2 } = await import("@opencode-ai/core/model")
const { ProviderV2 } = await import("@opencode-ai/core/provider")
const { SessionV1 } = await import("@opencode-ai/core/v1/session")
const { TurnModelOperationTable } = await import("@opencode-ai/core/turn/sql")
const { Turn } = await import("@opencode-ai/schema/turn")
const { AppRuntime } = await import("../src/effect/app-runtime")
const { GlobalBus } = await import("../src/bus/global")
const { InstanceRef } = await import("../src/effect/instance-ref")
const { EventV2Bridge } = await import("../src/event-v2-bridge")
const { Permission } = await import("../src/permission")
const { InstanceStore } = await import("../src/project/instance-store")
const { ProviderWire } = await import("../src/provider/wire")
const { ServerAuth } = await import("../src/server/auth")
const { Server } = await import("../src/server/server")
const { MessageID, SessionID } = await import("../src/session/schema")
const { SessionCompaction } = await import("../src/session/compaction")
const { SessionPrompt } = await import("../src/session/prompt")
const { Session } = await import("../src/session/session")
const { COURSE_QUERY_TOOL_ID } = await import("../src/tool/course-navigation-query")
const { LEARNER_GOAL_QUERY_TOOL_ID } = await import("../src/tool/learner-goal-query")
const { LEARNING_INTERACTION_READ_TOOL_ID } = await import("../src/tool/learning-interaction-read")
const { LEARNING_MATERIAL_QUERY_TOOL_ID } = await import("../src/tool/learning-material-query")
const { LEARNING_MATERIAL_READ_TOOL_ID } = await import("../src/tool/learning-material-read")

const model = {
  providerID: ProviderV2.ID.openai,
  modelID: ModelV2.ID.make("gpt-5.6-luna"),
}
const automaticContext = LearningContext.AUTOMATIC_CONTEXT_CAPABILITY_ID
const goalWrite = LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
const courseWrite = LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY
const taskTool = "task"
const contentRootsTool = "content_roots"
const materialTokenA = "G18-MATERIAL-ALPHA-7Q9N"
const materialTokenB = "G18-MATERIAL-BETA-4X2K"

type CompletedToolPart = typeof SessionV1.ToolPart.Type & { state: typeof SessionV1.ToolStateCompleted.Type }

function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gate 18 real-model qualification failed: ${message}`)
}

function conciseText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_600)
}

function allowOnly(ids: readonly string[]) {
  return [
    { permission: "*", pattern: "*", action: "deny" as const },
    ...ids.map((permission) => ({ permission, pattern: "*", action: "allow" as const })),
  ]
}

function toolParts(messages: readonly (typeof SessionV1.WithParts.Type)[]) {
  return messages.flatMap((message) => message.parts).filter((part) => part.type === "tool")
}

function completedTools(messages: readonly (typeof SessionV1.WithParts.Type)[]) {
  return toolParts(messages).filter((part): part is CompletedToolPart => part.state.status === "completed")
}

function textParts(messages: readonly (typeof SessionV1.WithParts.Type)[]) {
  return messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => conciseText(part.text))
    .filter(Boolean)
}

function occurrences(value: string, needle: string) {
  let count = 0
  let offset = 0
  while (true) {
    const index = value.indexOf(needle, offset)
    if (index < 0) return count
    count++
    offset = index + needle.length
  }
}

function jsonStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(jsonStrings)
  if (!value || typeof value !== "object") return []
  return Object.values(value).flatMap(jsonStrings)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const evidence = await AppRuntime.runPromise(
  InstanceStore.Service.use((store) =>
    Effect.gen(function* () {
      const scenarios: Record<string, unknown> = {}
      const permissionRequests: Array<Readonly<Record<string, unknown>>> = []
      let targetCourseID = ""
      let targetCourseVersion = 0
      let contentRootID = ""
      let materialMapID = ""
      let materialSelectorID = ""

      const runPhase = Effect.fn("Gate18RealModel.runPhase")(function* (phase: Exclude<Phase, "finalize">) {
        const instance = yield* store.load({ directory: workspace })
        return yield* Effect.gen(function* () {
          const database = yield* Database.Service
          const contentRoots = yield* ContentRoot.Service
          const events = yield* EventV2Bridge.Service
          const permission = yield* Permission.Service
          const prompts = yield* SessionPrompt.Service
          const compaction = yield* SessionCompaction.Service
          const sessions = yield* Session.Service
          const courseLayer = LayerNode.compile(Course.node, [
            [Database.node, Layer.succeed(Database.Service, database)],
          ])
          const courseService = yield* Course.Service.use((service) => Effect.succeed(service)).pipe(
            Effect.provide(courseLayer),
          )

          const carrierFetch = (calls: Array<Readonly<Record<string, unknown>>>) =>
            Object.assign(
              async (input: RequestInfo | URL, init?: RequestInit) => {
                const incoming = input instanceof Request ? input : new Request(input, init)
                const headers = new Headers(incoming.headers)
                const auth = ServerAuth.header()
                if (auth && !headers.has("authorization")) headers.set("authorization", auth)
                const request = new Request(incoming, { headers })
                const url = new URL(request.url)
                const isTurnStart = request.method === "POST" && /^\/session\/[^/]+\/turn$/.test(url.pathname)
                const requestBody = isTurnStart ? await request.clone().text() : undefined
                const response = await Server.Default().app.fetch(request)
                if (isTurnStart) {
                  const responseBody = await response.clone().text()
                  calls.push({
                    method: request.method,
                    path: url.pathname,
                    requestBody,
                    requestBytes: utf8Bytes(requestBody ?? ""),
                    requestFingerprint: sha256(requestBody ?? ""),
                    responseBody,
                    responseBytes: utf8Bytes(responseBody),
                    responseFingerprint: sha256(responseBody),
                    status: response.status,
                  })
                }
                return response
              },
              { preconnect: globalThis.fetch.preconnect },
            )

          const unsubscribe = yield* events.listen((event) => {
            if (event.type !== Permission.Event.Asked.type) return Effect.void
            const request = event.data as PermissionV1.Request
            const expected = [courseWrite, LEARNING_MATERIAL_READ_TOOL_ID, taskTool].includes(request.permission)
            permissionRequests.push({
              id: request.id,
              permission: request.permission,
              patterns: request.patterns,
              always: request.always,
              metadata: request.metadata,
              reply: expected ? "once" : "reject",
            })
            return permission.reply({ requestID: request.id, reply: expected ? "once" : "reject" }).pipe(Effect.orDie)
          })
          yield* Effect.addFinalizer(() => unsubscribe)

          const runTurn = Effect.fn("Gate18RealModel.runTurn")(function* (input: {
            readonly label: string
            readonly sessionID: ReturnType<typeof SessionID.create>
            readonly text: string
            readonly title?: string
            readonly permission?: ReturnType<typeof allowOnly>
            readonly limits?: { readonly model: number; readonly tool: number }
          }) {
            const before = yield* sessions
              .messages({ sessionID: input.sessionID })
              .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed([])))
            const beforeIDs = new Set(before.map((message) => message.info.id))
            const turnID = Turn.ID.create()
            activeScenario = input.label
            yield* prompts.start({
              sessionID: input.sessionID,
              turnID,
              inputID: Turn.InputID.create(),
              messageID: MessageID.ascending(),
              agent: "repa",
              model,
              limits: input.limits ?? { model: 6, tool: 8 },
              ...(input.title
                ? {
                    session: {
                      title: input.title,
                      ...(input.permission ? { permission: input.permission } : {}),
                    },
                  }
                : {}),
              parts: [{ type: "text", text: input.text }],
            })
            const terminal = yield* prompts.awaitTurn(input.sessionID, turnID)
            activeScenario = "between-turns"
            requireEvidence(terminal.terminal, `${input.label} did not terminalize`)
            requireEvidence(
              terminal.terminal.outcome === "completed",
              `${input.label} terminated as ${terminal.terminal.outcome}/${terminal.terminal.reason}`,
            )
            const messages = yield* sessions.messages({ sessionID: input.sessionID })
            const current = messages.filter((message) => !beforeIDs.has(message.info.id))
            const assistants = current.filter((message) => message.info.role === "assistant")
            const allTools = toolParts(assistants)
            const operations = yield* database.db
              .select()
              .from(TurnModelOperationTable)
              .where(eq(TurnModelOperationTable.turn_id, turnID))
              .orderBy(asc(TurnModelOperationTable.ordinal))
              .all()
              .pipe(Effect.orDie)
            return {
              label: input.label,
              sessionID: input.sessionID,
              turnID,
              inputMessageID: current.find((message) => message.info.role === "user")?.info.id,
              terminal: terminal.terminal,
              messages,
              current,
              assistants,
              allTools,
              operations,
              tools: allTools.filter((part): part is CompletedToolPart => part.state.status === "completed"),
              text: textParts(assistants),
              requestSequences: providerRequests
                .filter((request) => request.scenario === input.label)
                .map((request) => request.sequence),
            }
          })

          const carrierTurn = Effect.fn("Gate18RealModel.carrierTurn")(function* (input: {
            readonly label: string
            readonly carrier: "tui" | "direct-run" | "acp"
            readonly sessionID: string
            readonly turnID: string
            readonly inputMessageID: string
            readonly text: string
            readonly edge: Readonly<Record<string, unknown>>
          }) {
            const sessionID = SessionID.make(input.sessionID)
            const turnID = Turn.ID.make(input.turnID)
            const inputMessageID = MessageID.make(input.inputMessageID)
            const terminal = yield* prompts.awaitTurn(sessionID, turnID)
            activeScenario = "between-turns"
            requireEvidence(terminal.terminal, `${input.label} did not terminalize`)
            requireEvidence(
              terminal.terminal.outcome === "completed",
              `${input.label} terminated as ${terminal.terminal.outcome}/${terminal.terminal.reason}`,
            )
            const messages = yield* sessions.messages({ sessionID })
            const current = messages.find((message) => message.info.id === inputMessageID)
            requireEvidence(current?.info.role === "user", `${input.label} lost its exact carrier User`)
            const exactText = current.parts.filter((part) => part.type === "text").map((part) => part.text)
            requireEvidence(exactText.includes(input.text), `${input.label} changed its carrier learner input`)
            requireEvidence(
              messages
                .flatMap((message) => message.parts)
                .filter((part) => part.type === "text" && part.text === input.text).length === 1,
              `${input.label} did not persist its carrier learner input exactly once`,
            )
            const operations = yield* database.db
              .select()
              .from(TurnModelOperationTable)
              .where(eq(TurnModelOperationTable.turn_id, turnID))
              .orderBy(asc(TurnModelOperationTable.ordinal))
              .all()
              .pipe(Effect.orDie)
            requireEvidence(operations.length === 1, `${input.label} did not have one interactive model operation`)
            const cut = yield* database.db
              .select()
              .from(TurnLearningContextCutTable)
              .where(eq(TurnLearningContextCutTable.assistant_message_id, operations[0].assistant_message_id))
              .get()
              .pipe(Effect.orDie)
            const capacity = yield* database.db
              .select()
              .from(TurnModelCapacityTable)
              .where(eq(TurnModelCapacityTable.assistant_message_id, operations[0].assistant_message_id))
              .get()
              .pipe(Effect.orDie)
            requireEvidence(cut, `${input.label} has no Gate 18 cut`)
            requireEvidence(capacity, `${input.label} has no capacity row`)
            const interactive = providerRequests.filter((request) => {
              if (request.scenario !== input.label) return false
              return jsonStrings(JSON.parse(request.body) as unknown).some((value) => value.includes(cut.rendered_block))
            })
            requireEvidence(interactive.length === 1, `${input.label} did not bind one exact interactive provider request`)
            requireEvidence(
              jsonStrings(JSON.parse(interactive[0].body) as unknown).filter((value) => value.includes(input.text)).length === 1,
              `${input.label} did not deliver its exact learner input once to the provider`,
            )
            const assistant = messages.find(
              (message) =>
                message.info.role === "assistant" && message.info.id === operations[0].assistant_message_id,
            )
            requireEvidence(assistant?.info.role === "assistant", `${input.label} lost its exact Assistant presentation`)
            requireEvidence(assistant.info.parentID === inputMessageID, `${input.label} Assistant was misparented`)
            requireEvidence(
              assistant.info.providerID === model.providerID && assistant.info.modelID === model.modelID,
              `${input.label} did not use the qualified released model`,
            )
            const allRequests = providerRequests.filter((request) => request.scenario === input.label)
            return {
              label: input.label,
              carrier: input.carrier,
              sessionID,
              turnID,
              inputMessageID,
              terminal: terminal.terminal,
              edge: input.edge,
              operation: {
                ordinal: operations[0].ordinal,
                assistantMessageID: operations[0].assistant_message_id,
                cutFingerprint: cut.cut_fingerprint,
                renderedFingerprint: cut.rendered_fingerprint,
                capacityFingerprint: capacity.assessment_fingerprint,
                envelopeFingerprint: capacity.envelope_fingerprint,
              },
              provider: {
                requestSequences: allRequests.map((request) => request.sequence),
                interactiveRequestSequence: interactive[0].sequence,
                extraInternalRequests: allRequests.length - 1,
              },
              presentation: {
                assistantMessageID: assistant.info.id,
                parentID: assistant.info.parentID,
                agent: assistant.info.agent,
                providerID: assistant.info.providerID,
                modelID: assistant.info.modelID,
              },
            }
          })

          if (phase === "setup-course-goal") {
            const soloCourse = yield* courseService.createCourse({ title: "Gate 18 Solo Foundations" })

            const soloSessionID = SessionID.create()
            const solo = yield* runTurn({
              label: "single-course-fresh-home",
              sessionID: soloSessionID,
              title: "Gate 18 single Course",
              permission: allowOnly([automaticContext, COURSE_QUERY_TOOL_ID]),
              limits: { model: 2, tool: 1 },
              text: "Using only the trusted learning context, identify the only Course in this fresh LearnerHome in one sentence. Do not call a tool unless the context is genuinely insufficient.",
            })
            requireEvidence(solo.text.join(" ").includes(soloCourse.title), "single Course was not used from context")
            scenarios[solo.label] = summarizeTurn(solo)

            for (let index = 1; index <= 7; index++) {
              yield* courseService.createCourse({ title: `Gate 18 Candidate ${String(index).padStart(2, "0")}` })
            }
            const target = yield* courseService.createCourse({ title: "Gate 18 Out-of-Page Tensor Topology" })
            targetCourseID = target.id
            targetCourseVersion = target.stateVersion

            const targetGoal = yield* runTurn({
              label: "out-of-page-course-target-goal-create",
              sessionID: SessionID.create(),
              title: "Gate 18 out-of-page Course target Goal",
              permission: allowOnly([automaticContext, COURSE_QUERY_TOOL_ID, goalWrite]),
              limits: { model: 4, tool: 3 },
              text: [
                "I explicitly create one active long-term Goal now.",
                "Use course_query to find the exact Course named ‘Gate 18 Out-of-Page Tensor Topology’; it is outside the automatic Course page.",
                "Then call update_learner_goals once with one create operation: outcome ‘Prove the Gate 18 tensor compactness theorem’, condition ‘Give a complete proof from definitions’, scope type courses containing only that returned Course ID, target type absent, disposition active. Confirm the saved outcome without asking me for internal IDs.",
              ].join(" "),
            })
            requireEvidence(
              targetGoal.tools.some((tool) => tool.tool === COURSE_QUERY_TOOL_ID),
              "out-of-page Course was not read",
            )
            requireEvidence(
              targetGoal.tools.filter((tool) => tool.tool === goalWrite).length === 1,
              "target Goal was not written once",
            )
            scenarios[targetGoal.label] = summarizeTurn(targetGoal)
          }

          if (phase === "filler-goals") {
            for (const batch of [
              ["01", "02", "03", "04"],
              ["05", "06", "07", "08"],
            ]) {
              const filler = yield* runTurn({
                label: `filler-goals-${batch[0]}-${batch.at(-1)}`,
                sessionID: SessionID.create(),
                title: `Gate 18 filler Goals ${batch[0]}-${batch.at(-1)}`,
                permission: allowOnly([automaticContext, goalWrite]),
                limits: { model: 3, tool: 2 },
                text: `I explicitly create four active learner-home Goals now. Call update_learner_goals exactly once with four create operations whose outcomes are ${batch.map((value) => `‘Gate 18 filler goal ${value}’`).join(", ")}; each uses scope type learner_home, target type absent, active disposition, and no conditions. Then confirm only the four saved outcome names.`,
              })
              requireEvidence(
                filler.tools.filter((tool) => tool.tool === goalWrite).length === 1,
                `filler Goal batch ${batch[0]}-${batch.at(-1)} was not written once`,
              )
              scenarios[filler.label] = summarizeTurn(filler)
            }
          }

          if (phase === "out-of-page-material") {
            const proposal = yield* contentRoots.propose(dirname(materialPath))
            const materialRoot = yield* contentRoots.approve({
              proposal,
              approval: ContentRoot.LearnerApproval.contentRoot(
                proposal,
                "maintainer-authorized isolated Gate 18 material root",
              ),
            })
            contentRootID = materialRoot.id
            const goal = yield* runTurn({
              label: "out-of-page-goal-lazy-discovery",
              sessionID: SessionID.create(),
              title: "Gate 18 out-of-page Goal lookup",
              permission: allowOnly([automaticContext, LEARNER_GOAL_QUERY_TOOL_ID]),
              limits: { model: 3, tool: 2 },
              text: "Find the exact current Goal ‘Prove the Gate 18 tensor compactness theorem’. It is outside the automatic latest-eight Goal page, so use learner_goal_query discover and then name its saved outcome. Do not ask me for internal IDs.",
            })
            requireEvidence(
              goal.tools.some((tool) => tool.tool === LEARNER_GOAL_QUERY_TOOL_ID),
              "out-of-page Goal was not lazily discovered",
            )
            const goals = yield* database.db.transaction((tx) =>
              LearnerGoal.discover(tx, Date.now(), {}, { limit: 64 }),
            )
            requireEvidence(goals.items.length === 9, "Goal setup did not create exactly nine Goals")
            requireEvidence(
              goals.items.some((item) => item.head.outcome === "Prove the Gate 18 tensor compactness theorem"),
              "target Goal was not durably created",
            )
            scenarios[goal.label] = summarizeTurn(goal)

            const materialSessionID = SessionID.create()
            const material = yield* runTurn({
              label: "material-adoption-and-same-turn-read",
              sessionID: materialSessionID,
              title: "Gate 18 exact material adoption",
              limits: { model: 10, tool: 9 },
              permission: allowOnly([
                automaticContext,
                COURSE_QUERY_TOOL_ID,
                contentRootsTool,
                LEARNING_MATERIAL_QUERY_TOOL_ID,
                LEARNING_MATERIAL_READ_TOOL_ID,
                courseWrite,
              ]),
              text: [
                `I explicitly adopt the exact local file ${JSON.stringify(materialPath)} into my existing Course ‘Gate 18 Out-of-Page Tensor Topology’ through the already approved durable ContentRoot for its parent directory.`,
                "Use course_query and content_roots to resolve the exact Course and approved root. Then call update_learning_course once. Its input must contain only: course={type:existing, courseID:<the returned exact ID>}; materials=[{type:local,key:source,path:<the exact path above>,authority:{type:content_root,contentRootID:<the returned exact root ID>}}]; maps=[{key:source_map,materialKey:source,authorship:learner_requested,outline:[{key:whole,title:Whole exact tensor source,selectors:[{key:exact_whole,coordinate:{kind:whole_target.v1}}]}]}]. Do not create or change a View, selection, alignment, or anchor.",
                `After the durable write, use the newly admitted learning-context locator to call learning_material_read in the same Turn and report the exact token ${materialTokenA}. Do not ask me for internal IDs.`,
              ].join(" "),
            })
            requireEvidence(
              material.tools.some((tool) => tool.tool === courseWrite),
              "material bootstrap did not write",
            )
            requireEvidence(
              material.tools.some((tool) => tool.tool === LEARNING_MATERIAL_READ_TOOL_ID),
              "same-Turn exact material read did not occur",
            )
            requireEvidence(material.text.join(" ").includes(materialTokenA), "same-Turn material bytes were not used")
            const materialState = yield* database.db
              .get<{ mapID: string; selectorID: string }>(
                sql`SELECT
                material_map.id AS mapID,
                material_selector.id AS selectorID
              FROM material_map
              JOIN material_selector ON material_selector.map_id = material_map.id
              ORDER BY material_map.time_created DESC, material_map.id DESC
              LIMIT 1`,
              )
              .pipe(Effect.orDie)
            requireEvidence(materialState, "material Map/selector was not committed")
            materialMapID = materialState.mapID
            materialSelectorID = materialState.selectorID
            scenarios[material.label] = summarizeTurn(material)
          }

          if (phase === "continuation-corrections") {
            const continuationSessionID = SessionID.create()
            const continuation = yield* runTurn({
              label: "fresh-session-generic-continue",
              sessionID: continuationSessionID,
              title: "Gate 18 fresh Session continuation",
              permission: allowOnly([automaticContext, LEARNING_INTERACTION_READ_TOOL_ID]),
              text: "继续。不要让我提供旧 Session 或消息 ID；先用 recent Interaction locator，再读取一个精确范围，恢复刚才材料学习的必要细节，然后用一句话继续。",
            })
            const interactionTools = continuation.tools.filter(
              (tool) => tool.tool === LEARNING_INTERACTION_READ_TOOL_ID,
            )
            requireEvidence(interactionTools.length >= 2, "fresh Session did not list and exactly read Interaction")
            requireEvidence(
              continuation.current.filter((message) => message.info.role === "user").length === 1,
              "fresh Session imported an old User transcript",
            )
            scenarios[continuation.label] = summarizeTurn(continuation)

            const target = (yield* courseService.listCourses({ limit: 64 })).items.find(
              (item) => item.title === "Gate 18 Out-of-Page Tensor Topology",
            )
            requireEvidence(target, "target Course was absent before correction")
            targetCourseID = target.id
            const correctedCourse = yield* courseService.correctCourse({
              courseID: target.id,
              expectedCourseVersion: target.stateVersion,
              title: "Gate 18 Corrected Tensor Topology",
            })
            targetCourseVersion = correctedCourse.stateVersion

            const goalCorrectionSessionID = SessionID.create()
            const goalCorrection = yield* runTurn({
              label: "course-and-goal-correction-resume",
              sessionID: goalCorrectionSessionID,
              title: "Gate 18 corrected owner resume",
              permission: allowOnly([automaticContext, COURSE_QUERY_TOOL_ID, LEARNER_GOAL_QUERY_TOOL_ID, goalWrite]),
              text: [
                "The Course was corrected to ‘Gate 18 Corrected Tensor Topology’. Find the exact current Goal whose outcome is ‘Prove the Gate 18 tensor compactness theorem’, even though it is outside the automatic Goal page.",
                "Use learner_goal_query, then update that exact Goal by adding the condition ‘Explain why every finite subcover step is necessary’. Read the current Goal once more after the durable write and summarize the corrected Course and Goal without asking for IDs.",
              ].join(" "),
            })
            requireEvidence(
              goalCorrection.tools.some((tool) => tool.tool === LEARNER_GOAL_QUERY_TOOL_ID),
              "corrected Goal was not read",
            )
            requireEvidence(
              goalCorrection.tools.some((tool) => tool.tool === goalWrite),
              "Goal correction was not written",
            )
            scenarios[goalCorrection.label] = summarizeTurn(goalCorrection)
          }

          if (phase === "material-drift") {
            yield* Effect.promise(() =>
              Bun.write(materialPath, `Corrected Gate 18 material. Exact token: ${materialTokenB}.\n`),
            )
            const driftSessionID = SessionID.create()
            const drift = yield* runTurn({
              label: "physical-drift-unavailable",
              sessionID: driftSessionID,
              title: "Gate 18 material drift",
              permission: allowOnly([
                automaticContext,
                LEARNING_MATERIAL_QUERY_TOOL_ID,
                LEARNING_MATERIAL_READ_TOOL_ID,
              ]),
              limits: { model: 10, tool: 10 },
              text: "Use learning_material_query to list the current active Material Map, inspect its exact target, node, and selector metadata, then attempt learning_material_read with those exact current values. Do not write or adopt anything. Report the typed current-use outcome caused by physical source drift; do not substitute historical bytes.",
            })
            const driftRead = drift.allTools.find((tool) => tool.tool === LEARNING_MATERIAL_READ_TOOL_ID)
            requireEvidence(driftRead, "drift case did not attempt exact material read")
            requireEvidence(
              driftRead.state.status !== "error" || driftRead.state.metadata?.disposition !== "not_started_limit",
              "drift read was not started before the tool limit",
            )
            requireEvidence(
              !drift.text.join(" ").includes(materialTokenA),
              "drift case exposed old historical material bytes",
            )
            scenarios[drift.label] = summarizeTurn(drift)
          }

          if (phase === "material-correction-write") {
            const materialCorrectionSessionID = SessionID.create()
            const materialCorrection = yield* runTurn({
              label: "material-correction-write",
              sessionID: materialCorrectionSessionID,
              title: "Gate 18 material correction",
              limits: { model: 12, tool: 12 },
              permission: allowOnly([
                automaticContext,
                COURSE_QUERY_TOOL_ID,
                contentRootsTool,
                LEARNING_MATERIAL_QUERY_TOOL_ID,
                courseWrite,
              ]),
              text: [
                `I corrected ${JSON.stringify(materialPath)} and explicitly authorize re-adopting that exact file through its existing durable ContentRoot for ‘Gate 18 Corrected Tensor Topology’.`,
                "Use course_query, content_roots, and learning_material_query to obtain the exact current Course ID, root ID, and active Map ID. Never invent or abbreviate an ID.",
                "Then call update_learning_course exactly once. Its input must contain only: course={type:existing,courseID:<exact current Course ID>}; materials=[{type:local,key:corrected_source,path:<the exact path above>,authority:{type:content_root,contentRootID:<exact current root ID>}}]; maps=[{key:corrected_map,materialKey:corrected_source,authorship:learner_requested,supersedesMapID:<exact active Map ID>,outline:[{key:whole,title:Corrected whole tensor source,selectors:[{key:exact_whole,coordinate:{kind:whole_target.v1}}]}]}]. Do not change a View, selection, alignment, or anchor. After the write, only confirm the committed correction; do not query or read it yet.",
              ].join(" "),
            })
            requireEvidence(
              materialCorrection.tools.some((tool) => tool.tool === courseWrite),
              "material correction was not written",
            )
            requireEvidence(
              materialCorrection.tools.some((tool) => tool.tool === LEARNING_MATERIAL_QUERY_TOOL_ID),
              "material correction did not inspect current metadata",
            )
            const materialState = yield* database.db
              .get<{ mapID: string; selectorID: string }>(
                sql`SELECT
                material_map.id AS mapID,
                material_selector.id AS selectorID
              FROM material_map
              JOIN material_selector ON material_selector.map_id = material_map.id
              ORDER BY material_map.time_created DESC, material_map.id DESC
              LIMIT 1`,
              )
              .pipe(Effect.orDie)
            requireEvidence(materialState, "corrected Material Map/selector was not committed")
            materialMapID = materialState.mapID
            materialSelectorID = materialState.selectorID
            scenarios[materialCorrection.label] = summarizeTurn(materialCorrection)
          }

          if (phase === "material-fresh-current") {
            const freshCurrent = yield* runTurn({
              label: "material-fresh-current-read",
              sessionID: SessionID.create(),
              title: "Gate 18 corrected material fresh-current read",
              limits: { model: 12, tool: 12 },
              permission: allowOnly([
                automaticContext,
                LEARNING_MATERIAL_QUERY_TOOL_ID,
                LEARNING_MATERIAL_READ_TOOL_ID,
              ]),
              text: `Use learning_material_query to discover the current corrected Artifact revision and active successor Map, then inspect its exact node and selector and call learning_material_read. Report the exact token ${materialTokenB}. Do not write, adopt, use historical bytes, invent IDs, or ask me for IDs.`,
            })
            requireEvidence(
              freshCurrent.tools.some((tool) => tool.tool === LEARNING_MATERIAL_QUERY_TOOL_ID),
              "corrected material did not use fresh-current metadata",
            )
            requireEvidence(
              freshCurrent.tools.some((tool) => tool.tool === LEARNING_MATERIAL_READ_TOOL_ID),
              "corrected material was not exactly read",
            )
            requireEvidence(
              freshCurrent.text.join(" ").includes(materialTokenB),
              "corrected material bytes were not used",
            )
            const materialState = yield* database.db
              .get<{ mapID: string; selectorID: string }>(
                sql`SELECT
                material_map.id AS mapID,
                material_selector.id AS selectorID
              FROM material_map
              JOIN material_selector ON material_selector.map_id = material_map.id
              ORDER BY material_map.time_created DESC, material_map.id DESC
              LIMIT 1`,
              )
              .pipe(Effect.orDie)
            requireEvidence(materialState, "fresh-current Material Map/selector was absent")
            materialMapID = materialState.mapID
            materialSelectorID = materialState.selectorID
            scenarios[freshCurrent.label] = summarizeTurn(freshCurrent)
          }

          if (phase === "restriction-delegation") {
            const restrictedSessionID = SessionID.create()
            const restricted = yield* runTurn({
              label: "restricted-context-withheld",
              sessionID: restrictedSessionID,
              title: "Gate 18 restricted context",
              permission: allowOnly([]),
              limits: { model: 2, tool: 1 },
              text: "Without inventing state, state whether this restricted profile exposes any Course, Goal, Material, or prior Interaction details. Do not ask for internal IDs.",
            })
            requireEvidence(restricted.tools.length === 0, "restricted profile reached a tool")
            scenarios[restricted.label] = summarizeTurn(restricted)

            const delegatedSessionID = SessionID.create()
            const delegated = yield* runTurn({
              label: "delegated-capability-intersection",
              sessionID: delegatedSessionID,
              title: "Gate 18 delegated capability",
              permission: allowOnly([automaticContext, taskTool, COURSE_QUERY_TOOL_ID]),
              text: [
                "Delegate exactly one synchronous task to the general subagent.",
                "Give the child only course_query capability with pattern '*'; omit learning_context and every Goal, Material, and Interaction read.",
                "Ask the child to use course_query to find the Course whose corrected title is ‘Gate 18 Corrected Tensor Topology’, and return only that title. Then report the child's result.",
              ].join(" "),
            })
            requireEvidence(
              delegated.tools.some((tool) => tool.tool === taskTool),
              "delegated child was not started",
            )
            scenarios[delegated.label] = summarizeTurn(delegated)
          }

          if (phase === "retry") {
            retryScenario = "exact-provider-retry"
            const retrySessionID = SessionID.create()
            const retry = yield* runTurn({
              label: retryScenario,
              sessionID: retrySessionID,
              title: "Gate 18 exact provider retry",
              permission: allowOnly([automaticContext]),
              limits: { model: 2, tool: 1 },
              text: "Reply with exactly RETRY_CONTEXT_OK after using the trusted context. Do not call tools.",
            })
            const retryRequests = providerRequests.filter((request) => request.scenario === retry.label)
            requireEvidence(retryInjected, "transient provider failure was not injected")
            requireEvidence(retryRequests.length >= 2, "provider failure did not retry")
            requireEvidence(
              retryRequests.every(
                (request) => request.body === retryRequests[0]!.body && request.url === retryRequests[0]!.url,
              ),
              "provider retry changed the admitted request",
            )
            scenarios[retry.label] = summarizeTurn(retry)
          }

          if (phase === "compaction") {
            const sessionID = SessionID.create()
            const seeds = yield* Effect.forEach(
              [
                ["A", "G18-COMPACTION-SEED-A-92K"],
                ["B", "G18-COMPACTION-SEED-B-71M"],
                ["C", "G18-COMPACTION-TAIL-C-48R"],
              ] as const,
              ([name, token], index) =>
                runTurn({
                  label: `released-compaction-seed-${name.toLowerCase()}`,
                  sessionID,
                  ...(index === 0
                    ? {
                        title: "Gate 18 released-model compaction",
                        permission: allowOnly([automaticContext]),
                      }
                    : {}),
                  limits: { model: 1, tool: 0 },
                  text: `This is compactable learner history. Preserve the exact marker ${token}; reply briefly with ACK-${name} and do not call tools.`,
                }),
              { concurrency: 1 },
            )
            seeds.forEach((seed, index) => {
              requireEvidence(seed.operations.length === 1, `${seed.label} did not have one interactive operation`)
              requireEvidence(seed.requestSequences.length === 1, `${seed.label} did not have one provider request`)
              requireEvidence(seed.allTools.length === 0, `${seed.label} unexpectedly used a tool`)
              scenarios[seed.label] = {
                ...summarizeTurn(seed),
                compactionRole: index < 2 ? "summarized_head" : "retained_tail",
              }
            })

            yield* compaction.create({ sessionID, agent: "repa", model, auto: false })
            const afterMarker = yield* sessions.messages({ sessionID })
            const marker = afterMarker
              .flatMap((message) =>
                message.parts
                  .filter((part) => part.type === "compaction")
                  .map((part) => ({ info: message.info, part })),
              )
              .at(0)
            requireEvidence(marker, "qualification-only compaction marker was not persisted")
            requireEvidence(marker.info.role === "user", "compaction marker did not belong to a User message")
            requireEvidence(marker.part.auto === false, "qualification-only compaction marker became automatic")
            requireEvidence(!marker.part.overflow, "qualification-only compaction marker claimed model overflow")
            requireEvidence(!marker.part.capacity_history, "qualification-only marker claimed capacity-history authority")

            const continuation = yield* runTurn({
              label: "released-compaction-then-interactive-admission",
              sessionID,
              limits: { model: 1, tool: 0 },
              text: "After the pending compaction completes, preserve the retained tail and reply exactly G18-COMPACTION-D-ANSWER. Do not call tools.",
            })
            const requests = providerRequests.filter((request) => request.scenario === continuation.label)
            requireEvidence(requests.length === 2, "compaction continuation did not make exactly two provider requests")
            requireEvidence(
              requests[0].body.includes("G18-COMPACTION-SEED-A-92K") &&
                requests[0].body.includes("G18-COMPACTION-SEED-B-71M"),
              "internal compaction request did not receive the selected old head",
            )
            requireEvidence(
              !requests[0].body.includes("G18-COMPACTION-TAIL-C-48R") &&
                !requests[0].body.includes("G18-COMPACTION-D-ANSWER"),
              "internal compaction request absorbed the retained/current tail",
            )
            requireEvidence(
              requests[1].body.includes("G18-COMPACTION-TAIL-C-48R") &&
                requests[1].body.includes("G18-COMPACTION-D-ANSWER"),
              "post-compaction interactive request lost the retained/current tail",
            )
            requireEvidence(
              occurrences(requests[1].body, "G18-COMPACTION-D-ANSWER") === 1,
              "post-compaction interactive request did not contain the exact current input once",
            )
            requireEvidence(continuation.operations.length === 1, "post-compaction Turn lost its interactive operation")
            requireEvidence(continuation.allTools.length === 0, "post-compaction Turn unexpectedly used a tool")

            const messages = yield* sessions.messages({ sessionID })
            const markers = messages.flatMap((message) =>
              message.parts.filter((part) => part.type === "compaction").map((part) => ({ info: message.info, part })),
            )
            const summaries = messages.filter(
              (message) => message.info.role === "assistant" && message.info.summary && message.info.parentID === marker.info.id,
            )
            requireEvidence(markers.length === 1, "compaction qualification persisted more than one marker")
            requireEvidence(summaries.length === 1, "compaction qualification did not persist exactly one summary")
            const summary = summaries[0]
            requireEvidence(summary.info.role === "assistant", "compaction summary was not an Assistant message")
            requireEvidence(summary.info.agent === "compaction", "compaction summary did not use the internal compaction Agent")
            requireEvidence(summary.info.finish && !summary.info.error, "compaction summary did not finish successfully")

            const summaryOperations = yield* database.db
              .select()
              .from(TurnModelOperationTable)
              .where(eq(TurnModelOperationTable.assistant_message_id, summary.info.id))
              .all()
              .pipe(Effect.orDie)
            const continuationCuts = yield* database.db
              .select()
              .from(TurnLearningContextCutTable)
              .where(eq(TurnLearningContextCutTable.assistant_message_id, continuation.operations[0].assistant_message_id))
              .all()
              .pipe(Effect.orDie)
            requireEvidence(summaryOperations.length === 0, "internal compaction summary became an interactive operation")
            requireEvidence(continuationCuts.length === 1, "post-compaction interactive operation has no Gate 18 cut")
            const rendered = JSON.stringify(continuationCuts[0].rendered_block).slice(1, -1)
            requireEvidence(
              occurrences(requests[0].body, rendered) === 0 && occurrences(requests[1].body, rendered) === 1,
              "internal/interactive compaction requests did not preserve the Gate 18 cut boundary",
            )

            scenarios[continuation.label] = {
              ...summarizeTurn(continuation),
              trigger: {
                kind: "qualification_only_explicit_compaction_owner",
                automaticThresholdClaimed: false,
                modelCatalogLimitChanged: false,
                markerMessageID: marker.info.id,
              },
              compaction: {
                summaryMessageID: summary.info.id,
                summaryParentID: summary.info.parentID,
                providerRequestSequences: requests.map((request) => request.sequence),
                internalRequestHasGate18Cut: false,
                interactiveRequestHasGate18Cut: true,
                retainedTailToken: "G18-COMPACTION-TAIL-C-48R",
              },
            }
          }

          if (phase === "carrier-tui") {
            const label = "carrier-parity-primary-tui"
            const text = "Reply exactly G18-CARRIER-TUI-ACK. Do not call tools."
            const calls: Array<Readonly<Record<string, unknown>>> = []
            const transport = carrierFetch(calls)
            const { runTuiCarrier } = yield* Effect.promise(() => import("../../tui/script/gate18-real-carrier"))
            activeScenario = label
            yield* Effect.promise(() =>
              runTuiCarrier({
                directory: workspace,
                state: join(dirname(partialDirectory), "carrier-tui-state"),
                fetch: transport,
                events: {
                  subscribe: async (handler) => {
                    const listener = (event: GlobalEvent) => {
                      if (!event.directory) return
                      handler(event as unknown as Parameters<typeof handler>[0])
                    }
                    GlobalBus.on("event", listener)
                    return () => GlobalBus.off("event", listener)
                  },
                },
                text,
              }),
            )
            requireEvidence(calls.length === 1, "primary TUI did not emit exactly one Session start request")
            const call = calls[0]
            requireEvidence(typeof call.requestBody === "string", "primary TUI start body was not captured")
            const body = JSON.parse(call.requestBody) as unknown
            requireEvidence(isRecord(body), "primary TUI start body was not an object")
            requireEvidence(typeof body.turnID === "string", "primary TUI start body had no Turn ID")
            requireEvidence(typeof body.messageID === "string", "primary TUI start body had no Message ID")
            requireEvidence(typeof call.path === "string", "primary TUI start path was not captured")
            const sessionID = call.path.split("/")[2]
            requireEvidence(sessionID?.startsWith("ses"), "primary TUI start path had no Session ID")
            scenarios[label] = yield* carrierTurn({
              label,
              carrier: "tui",
              sessionID,
              turnID: body.turnID,
              inputMessageID: body.messageID,
              text,
              edge: {
                adapter: "packages/tui PromptRef.submit",
                transport: "production SDK POST /session/:sessionID/turn",
                call,
              },
            })
          }

          if (phase === "carrier-direct-run") {
            const label = "carrier-parity-direct-run"
            const text = "Reply exactly G18-CARRIER-DIRECT-ACK. Do not call tools."
            const starts: Array<Readonly<Record<string, unknown>>> = []
            const listener = (event: GlobalEvent) => {
              if (event.directory !== workspace || event.payload?.type !== "turn.started") return
              const properties = event.payload.properties
              starts.push({
                sessionID: properties.sessionID,
                turnID: properties.turnID,
                timestamp: properties.timestamp,
                turn: properties.turn,
                input: properties.input,
              })
            }
            GlobalBus.on("event", listener)
            activeScenario = label
            let stdout = ""
            const stdoutWrite = process.stdout.write
            process.stdout.write = ((chunk: string | Uint8Array) => {
              stdout += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
              return true
            }) as typeof process.stdout.write
            try {
              const { RunCommand } = yield* Effect.promise(() => import("../src/cli/cmd/run"))
              yield* RunCommand.effectHandler({
                  message: [text],
                  "--": [],
                  command: undefined,
                  continue: false,
                  session: undefined,
                  fork: false,
                  model: "openai/gpt-5.6-luna",
                  agent: "repa",
                  format: "json",
                  file: undefined,
                  title: "Gate 18 direct-run carrier",
                  attach: undefined,
                  password: undefined,
                  username: undefined,
                  dir: workspace,
                  port: undefined,
                  variant: undefined,
                  thinking: false,
                  mini: false,
                  interactive: false,
                  replay: true,
                  "replay-limit": undefined,
                  auto: false,
                  yolo: false,
                  "dangerously-skip-permissions": false,
                  demo: false,
                })
            } finally {
              process.stdout.write = stdoutWrite
              GlobalBus.off("event", listener)
            }
            requireEvidence(starts.length === 1, "direct-run did not emit exactly one durable Turn start")
            const start = starts[0]
            requireEvidence(typeof start.sessionID === "string", "direct-run event had no Session ID")
            requireEvidence(typeof start.turnID === "string", "direct-run event had no Turn ID")
            requireEvidence(isRecord(start.input), "direct-run event had no Turn input")
            requireEvidence(typeof start.input.messageID === "string", "direct-run event input had no Message ID")
            const outputEvents = stdout
              .split(/\r?\n/)
              .filter(Boolean)
              .flatMap((line) => {
                try {
                  const parsed = JSON.parse(line) as unknown
                  return isRecord(parsed) && typeof parsed.type === "string" ? [parsed.type] : []
                } catch {
                  return []
                }
              })
            requireEvidence(outputEvents.length > 0, "direct-run emitted no JSON carrier presentation")
            scenarios[label] = yield* carrierTurn({
              label,
              carrier: "direct-run",
              sessionID: start.sessionID,
              turnID: start.turnID,
              inputMessageID: start.input.messageID,
              text,
              edge: {
                adapter: "RunCommand.effectHandler (same production handler; outer lifecycle already owned)",
                invocation: ["run", "--model", "openai/gpt-5.6-luna", "--agent", "repa", "--format", "json"],
                start,
                stdoutBytes: utf8Bytes(stdout),
                stdoutFingerprint: sha256(stdout),
                outputEvents,
              },
            })
          }

          if (phase === "carrier-acp") {
            const label = "carrier-parity-acp"
            const text = "Reply exactly G18-CARRIER-ACP-ACK. Do not call tools."
            const calls: Array<Readonly<Record<string, unknown>>> = []
            const updates: unknown[] = []
            const sdk = createOpencodeClient({
              baseUrl: "http://repa.internal",
              directory: workspace,
              fetch: carrierFetch(calls),
            })
            const { make } = yield* Effect.promise(() => import("../src/acp/service"))
            let subscription: { stop(): void } | undefined
            const service = make({
              sdk,
              connection: {
                sessionUpdate: async (update) => {
                  updates.push(update)
                },
              },
              eventSubscription: (value) => {
                subscription = value
              },
            })
            const initialized = yield* service.initialize({
              protocolVersion: 1,
              clientCapabilities: { _meta: { "terminal-auth": true } },
              clientInfo: { name: "repa-gate18-qualification", version: "1" },
            })
            const created = yield* service.newSession({ cwd: workspace, mcpServers: [] })
            yield* service.setSessionModel({ sessionId: created.sessionId, modelId: "openai/gpt-5.6-luna" })
            activeScenario = label
            const result = yield* service.prompt({
              sessionId: created.sessionId,
              prompt: [{ type: "text", text }],
            })
            subscription?.stop()
            requireEvidence(result.stopReason === "end_turn", `ACP stopped as ${result.stopReason}`)
            requireEvidence(calls.length === 1, "ACP did not emit exactly one Session start request")
            const call = calls[0]
            requireEvidence(typeof call.requestBody === "string", "ACP start body was not captured")
            const body = JSON.parse(call.requestBody) as unknown
            requireEvidence(isRecord(body), "ACP start body was not an object")
            requireEvidence(typeof body.turnID === "string", "ACP start body had no Turn ID")
            requireEvidence(typeof body.messageID === "string", "ACP start body had no Message ID")
            requireEvidence(typeof call.path === "string", "ACP start path was not captured")
            const sessionID = call.path.split("/")[2]
            requireEvidence(sessionID === created.sessionId, "ACP protocol Session differed from its Session start")
            scenarios[label] = yield* carrierTurn({
              label,
              carrier: "acp",
              sessionID,
              turnID: body.turnID,
              inputMessageID: body.messageID,
              text,
              edge: {
                adapter: "ACPService.initialize/newSession/setSessionModel/prompt",
                initialized: {
                  protocolVersion: initialized.protocolVersion,
                  agentInfo: initialized.agentInfo,
                },
                newSessionID: created.sessionId,
                stopReason: result.stopReason,
                sessionUpdateCount: updates.length,
                sessionUpdateFingerprint: sha256(JSON.stringify(updates)),
                transport: "production SDK POST /session/:sessionID/turn",
                call,
              },
            })
          }

          if (phase === "restart") {
            const restartSessionID = SessionID.create()
            const restart = yield* runTurn({
              label: "process-restart-fresh-session",
              sessionID: restartSessionID,
              title: "Gate 18 restart continuation",
              permission: allowOnly([
                automaticContext,
                COURSE_QUERY_TOOL_ID,
                LEARNER_GOAL_QUERY_TOOL_ID,
                LEARNING_MATERIAL_QUERY_TOOL_ID,
                LEARNING_INTERACTION_READ_TOOL_ID,
              ]),
              limits: { model: 4, tool: 4 },
              text: "After this process-level LearnerHome reopen, use trusted context and one exact owner read to name the corrected Course and the corrected theorem Goal. Do not import or request an old Session transcript.",
            })
            requireEvidence(
              restart.tools.some((tool) =>
                [COURSE_QUERY_TOOL_ID, LEARNER_GOAL_QUERY_TOOL_ID, LEARNING_MATERIAL_QUERY_TOOL_ID].includes(tool.tool),
              ),
              "restart did not perform an exact owner read",
            )
            scenarios[restart.label] = summarizeTurn(restart)
          }
        }).pipe(Effect.scoped, Effect.provideService(InstanceRef, instance))
      })

      if (selectedPhase !== "finalize") {
        yield* runPhase(selectedPhase)
        requireEvidence(providerRequests.length > 0, `${selectedPhase} captured no released provider request`)
        return {
          run: "gate18-gpt-5.6-luna-released-v1-01",
          status: "phase_passed",
          phase: selectedPhase,
          authority: {
            maintainerAuthorizedCredentialAndCost: true,
            channel: "latest",
            version: "1.17.18",
            provider: model.providerID,
            model: model.modelID,
            isolatedWorkspace: workspace,
            isolatedDatabase: process.env.REPA_DB,
            isolatedModelCatalog: process.env.REPA_MODELS_PATH,
          },
          fixture: {
            targetCourseID,
            targetCourseVersion,
            contentRootID,
            materialMapID,
            materialSelectorID,
          },
          scenarios,
          permissionRequests,
          providerRequests: providerRequests.map((request) => ({ ...request, bodySecretScan: "passed" })),
        }
      }

      const partials = yield* Effect.forEach(
        phases.filter((value): value is Exclude<Phase, "finalize"> => value !== "finalize"),
        (value) =>
          Effect.promise(async () => {
            const path = `${partialDirectory}/${value}.json`
            requireEvidence(await Bun.file(path).exists(), `missing phase evidence ${value}`)
            const partial = (await Bun.file(path).json()) as {
              readonly status: string
              readonly phase: Phase
              readonly fixture: {
                readonly targetCourseID: string
                readonly targetCourseVersion: number
                readonly contentRootID: string
                readonly materialMapID: string
                readonly materialSelectorID: string
              }
              readonly scenarios: Readonly<Record<string, unknown>>
              readonly permissionRequests: readonly Readonly<Record<string, unknown>>[]
              readonly providerRequests: readonly CapturedProviderRequest[]
            }
            requireEvidence(partial.status === "phase_passed", `phase ${value} did not pass`)
            requireEvidence(partial.phase === value, `phase evidence ${value} was misbound`)
            const redacted = {
              ...partial,
              providerRequests: partial.providerRequests.map((request) => ({
                ...request,
                headers: request.headers.map((header) =>
                  header.state === "value" ? projectHeader(header.name, header.value) : header,
                ),
              })),
            }
            await Bun.write(path, JSON.stringify(redacted, null, 2) + "\n")
            return redacted
          }),
        { concurrency: 1 },
      )
      partials.forEach((partial) => {
        const offset = providerRequests.length
        Object.entries(partial.scenarios).forEach(([label, scenario]) => {
          requireEvidence(!(label in scenarios), `duplicate scenario label ${label}`)
          scenarios[label] = scenario
        })
        permissionRequests.push(...partial.permissionRequests)
        if (partial.fixture.targetCourseID) targetCourseID = partial.fixture.targetCourseID
        targetCourseVersion = Math.max(targetCourseVersion, partial.fixture.targetCourseVersion)
        if (partial.fixture.contentRootID) contentRootID = partial.fixture.contentRootID
        if (partial.fixture.materialMapID) materialMapID = partial.fixture.materialMapID
        if (partial.fixture.materialSelectorID) materialSelectorID = partial.fixture.materialSelectorID
        providerRequests.push(
          ...partial.providerRequests.map((request) => ({ ...request, sequence: offset + request.phaseSequence })),
        )
      })

      const finalInstance = yield* store.load({ directory: workspace })
      const durable = yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const operations = yield* database.db
          .select()
          .from(TurnModelOperationTable)
          .orderBy(asc(TurnModelOperationTable.time_admitted), asc(TurnModelOperationTable.ordinal))
          .all()
          .pipe(Effect.orDie)
        const operationIDs = operations.map((operation) => operation.assistant_message_id)
        const cuts =
          operationIDs.length === 0
            ? []
            : yield* database.db
                .select()
                .from(TurnLearningContextCutTable)
                .where(inArray(TurnLearningContextCutTable.assistant_message_id, operationIDs))
                .all()
                .pipe(Effect.orDie)
        const capacities =
          operationIDs.length === 0
            ? []
            : yield* database.db
                .select()
                .from(TurnModelCapacityTable)
                .where(inArray(TurnModelCapacityTable.assistant_message_id, operationIDs))
                .all()
                .pipe(Effect.orDie)
        const cutByID = new Map(cuts.map((cut) => [cut.assistant_message_id, cut]))
        const capacityByID = new Map(capacities.map((capacity) => [capacity.assistant_message_id, capacity]))
        const auth = JSON.parse(process.env.REPA_AUTH_CONTENT!) as Record<string, unknown>
        const credentialValues = Object.values(auth)
          .flatMap((entry) => (entry && typeof entry === "object" ? Object.values(entry) : []))
          .filter((value): value is string => typeof value === "string" && value.length > 8)

        return yield* Effect.forEach(operations, (operation) =>
          Effect.promise(async () => {
            const cut = cutByID.get(operation.assistant_message_id)
            const capacity = capacityByID.get(operation.assistant_message_id)
            requireEvidence(cut, `operation ${operation.assistant_message_id} has no Gate 18 cut`)
            requireEvidence(capacity, `operation ${operation.assistant_message_id} has no capacity evidence`)
            const parsedCut = LearningContext.decodeStored(
              cut.canonical_cut,
              cut.rendered_block,
              operation.assistant_message_id,
            )
            const compiler = parsedCut.capabilityBasis.effectiveProviderToolSurfaceBinding.route.compiler
            const scenario = Object.values(scenarios).find(
              (value): value is { readonly label: string; readonly turnID: string } =>
                !!value &&
                typeof value === "object" &&
                "label" in value &&
                typeof value.label === "string" &&
                "turnID" in value &&
                value.turnID === operation.turn_id,
            )
            const candidates = providerRequests.filter((request) => {
              if (scenario && request.scenario !== scenario.label) return false
              return jsonStrings(JSON.parse(request.body) as unknown).some((value) =>
                value.includes(cut.rendered_block),
              )
            })
            const matches = (
              await Promise.all(
                candidates.map(async (request) => {
                  try {
                    const normalized = await ProviderWire.normalize({
                      certificate: compiler,
                      method: request.method,
                      url: request.url,
                      body: JSON.parse(request.body),
                    })
                    return LearningContext.canonicalFingerprint(
                      LearningContext.toJsonValue(ProviderWire.semanticCertified(compiler, normalized)),
                    ) === capacity.envelope_fingerprint
                      ? request
                      : undefined
                  } catch {
                    return undefined
                  }
                }),
              )
            ).filter((request): request is CapturedProviderRequest => request !== undefined)
            requireEvidence(
              matches.length >= 1,
              `operation ${operation.assistant_message_id} was absent from provider I/O`,
            )
            const successful = matches.find((request) => !request.injectedFailure) ?? matches.at(-1)!
            requireEvidence(
              credentialValues.every((value) => !successful.body.includes(value)),
              `operation ${operation.assistant_message_id} exposed a credential in its body`,
            )
            const captured = await ProviderWire.normalize({
              certificate: compiler,
              method: successful.method,
              url: successful.url,
              body: JSON.parse(successful.body),
            })
            const semantic = ProviderWire.semanticCertified(compiler, captured)
            const envelopeFingerprint = LearningContext.canonicalFingerprint(LearningContext.toJsonValue(semantic))
            requireEvidence(
              envelopeFingerprint === capacity.envelope_fingerprint,
              `operation ${operation.assistant_message_id} capacity fingerprint differs from actual provider request`,
            )
            requireEvidence(
              utf8Bytes(cut.canonical_cut) === cut.canonical_bytes && parsedCut.fingerprint === cut.cut_fingerprint,
              `operation ${operation.assistant_message_id} canonical cut bytes diverged`,
            )
            requireEvidence(
              utf8Bytes(cut.rendered_block) === cut.rendered_bytes &&
                parsedCut.renderedFingerprint === cut.rendered_fingerprint,
              `operation ${operation.assistant_message_id} rendered cut bytes diverged`,
            )
            requireEvidence(
              occurrences(successful.body, JSON.stringify(cut.rendered_block).slice(1, -1)) === 1,
              `operation ${operation.assistant_message_id} did not expose exactly one rendered cut`,
            )
            const assessment = LearningContext.decodeCapacity(
              capacity.canonical_assessment,
              operation.assistant_message_id,
            )
            requireEvidence(
              utf8Bytes(capacity.canonical_assessment) === capacity.assessment_bytes &&
                assessment.fingerprint === capacity.assessment_fingerprint,
              `operation ${operation.assistant_message_id} capacity evidence diverged`,
            )
            requireEvidence(
              assessment.learningContextFingerprint === cut.cut_fingerprint,
              `operation ${operation.assistant_message_id} capacity lost the Gate 18 cut binding`,
            )
            requireEvidence(
              assessment.retainedSteeringFingerprint === operation.retained_steering_cut_fingerprint,
              `operation ${operation.assistant_message_id} capacity lost the Gate 15 cut binding`,
            )
            return {
              assistantMessageID: operation.assistant_message_id,
              sessionID: operation.session_id,
              turnID: operation.turn_id,
              inputID: operation.input_id,
              ordinal: operation.ordinal,
              state: operation.state,
              requestFingerprint: operation.request_fingerprint,
              steering: {
                fingerprint: operation.retained_steering_cut_fingerprint,
                asOf: operation.retained_steering_cut_as_of,
              },
              learningContext: {
                canonicalBytes: cut.canonical_bytes,
                fingerprint: cut.cut_fingerprint,
                renderedBytes: cut.rendered_bytes,
                renderedFingerprint: cut.rendered_fingerprint,
                asOf: cut.cut_as_of,
                automaticContext: parsedCut.capabilityBasis.effectiveAutomaticContext,
                lazyCapabilities: parsedCut.capabilityBasis.effectiveLazyReadCapabilities,
                sections: parsedCut.sections.map((section) => ({
                  owner: section.owner,
                  coverage: section.coverage,
                  countAtCut: section.countAtCut,
                  entries: section.entries.length,
                  omission: section.omission,
                })),
              },
              capacity: {
                classification: capacity.classification,
                decision: capacity.decision,
                assessmentBytes: capacity.assessment_bytes,
                assessmentFingerprint: capacity.assessment_fingerprint,
                envelopeFingerprint: capacity.envelope_fingerprint,
              },
              providerRequest: {
                successfulSequence: successful.sequence,
                matchedSequences: matches.map((request) => request.sequence),
                method: successful.method,
                url: successful.url,
                bodyBytes: successful.bodyBytes,
                bodyFingerprint: successful.bodyFingerprint,
                semanticFingerprint: envelopeFingerprint,
              },
            }
          }),
        )
      }).pipe(Effect.provideService(InstanceRef, finalInstance))

      const requests = providerRequests.map((request) => ({
        ...request,
        bodySecretScan: "passed",
      }))
      requireEvidence(requests.length > 0, "no released provider request was captured")
      return {
        run: "gate18-gpt-5.6-luna-released-v1-01",
        status: "passed",
        authority: {
          maintainerAuthorizedCredentialAndCost: true,
          channel: "latest",
          version: "1.17.18",
          provider: model.providerID,
          model: model.modelID,
          isolatedWorkspace: workspace,
          isolatedDatabase: process.env.REPA_DB,
          isolatedModelCatalog: process.env.REPA_MODELS_PATH,
        },
        limits: {
          learnerTurns: Object.keys(scenarios).length,
          maximumProviderRequests,
          maximumModelOperationsPerTurn: 16,
          maximumToolCallsPerTurn: 16,
        },
        fixture: {
          targetCourseID,
          targetCourseVersion,
          contentRootID,
          materialMapID,
          materialSelectorID,
          materialTokens: [materialTokenA, materialTokenB],
        },
        scenarios,
        permissionRequests,
        operations: durable,
        providerRequests: requests,
      }
    }).pipe(Effect.scoped),
  ),
)

requireEvidence(providerRequests.length <= maximumProviderRequests, "provider request ceiling was exceeded")
await Bun.write(outputPath, JSON.stringify(evidence, null, 2) + "\n")
console.log(
  JSON.stringify({
    status: evidence.status,
    phase: "phase" in evidence ? evidence.phase : "finalize",
    outputPath,
    providerRequests: providerRequests.length,
    operations: Array.isArray(evidence.operations) ? evidence.operations.length : undefined,
    scenarios: Object.keys(evidence.scenarios),
  }),
)
process.exit(0)

function summarizeTurn(input: {
  readonly label: string
  readonly sessionID: string
  readonly turnID: string
  readonly terminal: Readonly<Record<string, unknown>>
  readonly inputMessageID?: string
  readonly operations: readonly Readonly<Record<string, unknown>>[]
  readonly allTools: readonly (typeof SessionV1.ToolPart.Type)[]
  readonly tools: readonly CompletedToolPart[]
  readonly text: readonly string[]
  readonly requestSequences: readonly number[]
}) {
  return {
    phase: selectedPhase,
    label: input.label,
    sessionID: input.sessionID,
    turnID: input.turnID,
    inputMessageID: input.inputMessageID,
    terminal: input.terminal,
    operations: input.operations.map((operation) => ({
      assistantMessageID: operation.assistant_message_id,
      ordinal: operation.ordinal,
      state: operation.state,
    })),
    tools: input.tools.map((tool) => ({
      id: tool.id,
      messageID: tool.messageID,
      callID: tool.callID,
      tool: tool.tool,
      input: tool.state.input,
      output: tool.state.output,
      title: tool.state.title,
      metadata: tool.state.metadata,
    })),
    toolAttempts: input.allTools.map((tool) => ({
      id: tool.id,
      messageID: tool.messageID,
      callID: tool.callID,
      tool: tool.tool,
      status: tool.state.status,
      ...(tool.state.status === "error" ? { error: tool.state.error, metadata: tool.state.metadata } : {}),
    })),
    text: input.text,
    responseDigest: sha256(input.text.join("\n")),
    requestSequences: input.requestSequences,
  }
}
