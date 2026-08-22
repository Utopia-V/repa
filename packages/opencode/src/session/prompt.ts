import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import os from "os"
import { SessionID, MessageID, PartID } from "./schema"
import { MessageV2 } from "./message-v2"
import { SessionRevert } from "./revert"
import { Session } from "./session"
import { Agent } from "../agent/agent"
import { Provider } from "@/provider/provider"

import { type Tool as AITool, tool, jsonSchema } from "ai"
import type { JSONSchema7 } from "@ai-sdk/provider"
import { SessionCompaction } from "./compaction"
import { SystemPrompt } from "./system"
import { Instruction } from "./instruction"
import { Plugin } from "../plugin"
import { MAX_STEPS_PROMPT } from "@opencode-ai/core/session/max-steps"
import { ToolRegistry } from "@/tool/registry"
import { MCP } from "../mcp"
import { LSP } from "@/lsp/lsp"
import { ulid } from "ulid"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import * as Stream from "effect/Stream"
import { pathToFileURL, fileURLToPath } from "url"
import { Config } from "@/config/config"
import { ConfigMarkdown } from "@/config/markdown"
import { SessionSummary } from "./summary"
import { NamedError } from "@opencode-ai/core/util/error"
import { SessionProcessor } from "./processor"
import { Tool } from "@/tool/tool"
import { Permission } from "@/permission"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { Shell } from "@opencode-ai/core/shell"
import { ShellID } from "@/tool/shell/id"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Truncate } from "@/tool/truncate"
import { Image } from "@/image/image"
import { decodeDataUrl } from "@/util/data-url"
import { Cause, Effect, Exit, Fiber, Latch, Layer, Option, Context, Schema, Types } from "effect"
import { InstanceState } from "@/effect/instance-state"
import type { TaskPromptOps } from "@/tool/task"
import { SessionRunState } from "./run-state"
import { SessionTurnRecovery } from "./turn-recovery"
import { SessionTurnEvents } from "./turn-events"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { EventV2 } from "@opencode-ai/core/event"
import { Database } from "@opencode-ai/core/database/database"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { MaterialMap } from "@opencode-ai/core/material-map"
import {
  InvalidCausalSourceError,
  LearnerAdmission,
  Occurrence,
  type OccurrenceError,
} from "@opencode-ai/core/learning-command"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionDeletion } from "@opencode-ai/core/session-deletion"
import { SessionPresentation } from "@opencode-ai/core/session-presentation"
import { TurnInputTable, TurnModelOperationTable } from "@opencode-ai/core/turn/sql"
import { Turn } from "@opencode-ai/schema/turn"
import { SessionReminders } from "./reminders"
import { SessionTools } from "./tools"
import { LLMEvent } from "@opencode-ai/llm"
import { resolveLearnerResponseEvidenceMaterial } from "@/learning-context/learner-response-evidence-material"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

const decodeMessageInfo = Schema.decodeUnknownExit(SessionV1.Info)
const decodeMessagePart = Schema.decodeUnknownExit(SessionV1.Part)
const MAX_MCP_RESOURCE_BLOB_BYTES = 10 * 1024 * 1024
const DEFAULT_TURN_LIMITS = Object.freeze({ model: 64, tool: 256 }) satisfies Turn.Limits
const TURN_POLICY_BASIS = Object.freeze({ policy: "repa.released-v1.turn-limits", version: 1 })
export const DelegatedCapability = Schema.Struct({
  version: Schema.Literal(2),
  parent: PermissionV1.Ruleset,
  inherited: Schema.Array(PermissionV1.Ruleset),
  profile: PermissionV1.Ruleset,
  explicit: PermissionV1.Ruleset,
}).annotate({ identifier: "SessionPrompt.DelegatedCapability" })
export type DelegatedCapability = typeof DelegatedCapability.Type
const SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

const STRUCTURED_OUTPUT_DESCRIPTION = `Use this tool to return your final response in the requested structured format.

IMPORTANT:
- You MUST call this tool exactly once at the end of your response
- The input must be valid JSON matching the required schema
- Complete all necessary research and tool calls BEFORE calling this tool
- This tool provides your final answer - no further actions are taken after calling it`

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text - you MUST call the StructuredOutput tool with your answer formatted according to the schema.`

function mcpResourceBase64Size(value: string) {
  const trimmed = value.replace(/\s/g, "")
  const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding)
}

function formatMcpResourceBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${Math.ceil(value / (1024 * 1024))} MB`
}

function isOrphanedInterruptedTool(part: SessionV1.ToolPart) {
  // cleanup() marks abandoned tool_use blocks this way after retries/aborts.
  // They are not pending work and must not trigger an assistant-prefill request.
  return part.state.status === "error" && part.state.metadata?.interrupted === true
}

function normalizeTurnEnvelope(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

type UserWithParts = {
  readonly info: SessionV1.User
  readonly parts: readonly SessionV1.Part[]
  readonly learnerAdmission: LearnerAdmission
}

function learnerContent(message: UserWithParts) {
  return message.parts.map((part) => {
    const { id: _, messageID: __, sessionID: ___, ...content } = part
    return content
  })
}

const decodeDelegatedCapability = Schema.decodeUnknownEffect(DelegatedCapability)

export function turnAuthority(
  turn: Turn.Info,
): Effect.Effect<readonly Permission.AuthorityLayer[], Turn.IntegrityError> {
  if (!turn.lineage) return Effect.succeed([])
  return decodeDelegatedCapability(turn.lineage.delegatedCapability).pipe(
    Effect.map((capability) => [
      { ruleset: capability.parent, absence: "deny" as const },
      ...capability.inherited.map((ruleset) => ({ ruleset, absence: "deny" as const })),
      { ruleset: capability.profile, absence: "deny" as const },
      { ruleset: capability.explicit, absence: "deny" as const },
    ]),
    Effect.mapError(
      () =>
        new Turn.IntegrityError({
          turnID: turn.id,
          reason: "Delegated Turn capability is not the canonical parent/inherited/profile/explicit projection",
        }),
    ),
  )
}

export interface Interface {
  readonly start: (
    input: StartInput,
  ) => Effect.Effect<
    Turn.Info,
    | Image.Error
    | Session.NotFound
    | Session.BusyError
    | Turn.Error
    | OccurrenceError
    | SessionDeletion.SessionIDRetiredError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.FrontierUnrepresentableError
  >
  readonly startImportCopy: (
    input: ImportCopyStartInput,
  ) => Effect.Effect<
    Turn.Info,
    | Image.Error
    | Session.NotFound
    | Session.BusyError
    | Turn.Error
    | OccurrenceError
    | SessionDeletion.SessionIDRetiredError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.FrontierUnrepresentableError
  >
  readonly steer: (
    input: SteerInput,
  ) => Effect.Effect<
    Turn.Input,
    | Image.Error
    | Session.NotFound
    | Session.BusyError
    | Turn.Error
    | OccurrenceError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.FrontierUnrepresentableError
  >
  readonly activeTurn: (sessionID: SessionID) => Effect.Effect<Turn.Info | undefined, Turn.Error>
  readonly listTurns: (sessionID: SessionID) => Effect.Effect<readonly Turn.Info[], Turn.Error>
  readonly getTurn: (sessionID: SessionID, turnID: Turn.ID) => Effect.Effect<Turn.Info, Turn.Error>
  readonly awaitTurn: (sessionID: SessionID, turnID: Turn.ID) => Effect.Effect<Turn.Info, Turn.Error>
  readonly interruptTurn: (sessionID: SessionID, turnID: Turn.ID) => Effect.Effect<Turn.Info, Turn.Error>
  readonly startChild: (
    input: StartChildInput,
  ) => Effect.Effect<
    Turn.Info,
    | Image.Error
    | Session.NotFound
    | Session.BusyError
    | Turn.Error
    | SessionDeletion.SessionIDRetiredError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.FrontierUnrepresentableError
  >
  readonly awaitChild: (
    input: AwaitChildInput,
  ) => Effect.Effect<Turn.ChildResult, Session.NotFound | Session.BusyError | Turn.Error>
  readonly shell: (
    input: ShellInput,
  ) => Effect.Effect<
    SessionV1.WithParts,
    | Session.NotFound
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.HistoricalPresentationNotRevertibleError
    | SessionPresentation.FrontierUnrepresentableError
  >
  readonly resolvePromptParts: (template: string) => Effect.Effect<PromptInput["parts"]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionPrompt") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    yield* SessionTurnRecovery.Service
    const status = yield* SessionStatus.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const processor = yield* SessionProcessor.Service
    const compaction = yield* SessionCompaction.Service
    const plugin = yield* Plugin.Service
    const config = yield* Config.Service
    const permission = yield* Permission.Service
    const fsys = yield* FSUtil.Service
    const mcp = yield* MCP.Service
    const lsp = yield* LSP.Service
    const registry = yield* ToolRegistry.Service
    const truncate = yield* Truncate.Service
    const image = yield* Image.Service
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const instruction = yield* Instruction.Service
    const state = yield* SessionRunState.Service
    const revert = yield* SessionRevert.Service
    const summary = yield* SessionSummary.Service
    const sys = yield* SystemPrompt.Service
    const llm = yield* LLM.Service
    const events = yield* EventV2Bridge.Service
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service
    const contentRoots = yield* ContentRoot.Service
    const maps = yield* MaterialMap.Service
    const tutorMaterials = yield* MaterialMap.TutorCurrentUseReader
    const { db } = database
    const titleInFlight = new Set<SessionID>()
    const ops = Effect.fn("SessionPrompt.ops")(function* () {
      return {
        resolvePromptParts: (template: string) => resolvePromptParts(template),
        startChild: (input: StartChildInput) => startChild(input),
        awaitChild: (input: AwaitChildInput) => awaitChild(input),
        interruptTurn: (sessionID: SessionID, turnID: Turn.ID) => interruptTurn(sessionID, turnID),
      } satisfies TaskPromptOps
    })

    const resolvePromptParts = Effect.fn("SessionPrompt.resolvePromptParts")(function* (template: string) {
      const ctx = yield* InstanceState.context
      const parts: Types.DeepMutable<PromptInput["parts"]> = [{ type: "text", text: template }]
      const files = ConfigMarkdown.files(template)
      const seen = new Set<string>()
      yield* Effect.forEach(
        files,
        Effect.fnUntraced(function* (match) {
          const name = match[1]
          if (!name) return
          if (seen.has(name)) return
          seen.add(name)

          const filepath = name.startsWith("~/")
            ? path.join(os.homedir(), name.slice(2))
            : path.resolve(ctx.worktree, name)

          const info = yield* fsys.stat(filepath).pipe(Effect.option)
          if (Option.isNone(info)) {
            const found = yield* agents.get(name)
            if (found) parts.push({ type: "agent", name: found.name })
            return
          }
          const stat = info.value
          parts.push({
            type: "file",
            url: pathToFileURL(filepath).href,
            filename: name,
            mime: stat.type === "Directory" ? "application/x-directory" : "text/plain",
          })
        }),
        { concurrency: "unbounded", discard: true },
      )
      return parts
    })

    const title = Effect.fn("SessionPrompt.ensureTitle")(function* (input: {
      sessionID: SessionID
      history: SessionV1.WithParts[]
      providerID: ProviderV2.ID
      modelID: ModelV2.ID
    }) {
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      if (session.parentID) return
      if (!Session.isDefaultTitle(session.title)) return

      const real = (m: SessionV1.WithParts) =>
        m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic)
      const idx = input.history.findIndex(real)
      if (idx === -1) return

      const context = input.history.slice(0, idx + 1)
      const firstUser = context[idx]
      if (!firstUser || firstUser.info.role !== "user") return
      const firstInfo = firstUser.info

      const subtasks = firstUser.parts.filter((p): p is SessionV1.SubtaskPart => p.type === "subtask")
      const onlySubtasks = subtasks.length > 0 && firstUser.parts.every((p) => p.type === "subtask")

      const ag = yield* agents.get("title")
      if (!ag) return
      const mdl = ag.model
        ? yield* provider.getModel(ag.model.providerID, ag.model.modelID)
        : ((yield* provider.getSmallModel(input.providerID)) ??
          (yield* provider.getModel(input.providerID, input.modelID)))
      const msgs = onlySubtasks
        ? [{ role: "user" as const, content: subtasks.map((p) => p.prompt).join("\n") }]
        : yield* MessageV2.toModelMessagesEffect(context, mdl)
      const text = yield* llm
        .stream({
          composition: { type: "internal", purpose: "title" },
          agent: ag,
          user: firstInfo,
          system: [],
          small: true,
          tools: {},
          model: mdl,
          sessionID: input.sessionID,
          retries: 2,
          messages: [{ role: "user", content: "Generate a title for this conversation:\n" }, ...msgs],
        })
        .pipe(
          Stream.filter(LLMEvent.is.textDelta),
          Stream.map((e) => e.text),
          Stream.mkString,
          Effect.orDie,
        )
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0)
      if (!cleaned) return
      const t = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
      return yield* sessions.setTitleIfDefault({ sessionID: input.sessionID, title: t })
    })

    const scheduleTitle = Effect.fn("SessionPrompt.scheduleTitle")(function* (input: {
      sessionID: SessionID
      history: SessionV1.WithParts[]
      providerID: ProviderV2.ID
      modelID: ModelV2.ID
    }) {
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      if (session.parentID) return
      if (!Session.isDefaultTitle(session.title)) return
      const start = yield* Effect.sync(() => {
        if (titleInFlight.has(input.sessionID)) return false
        titleInFlight.add(input.sessionID)
        return true
      })
      if (!start) return
      return yield* title(input).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("title generation skipped", {
            sessionID: input.sessionID,
            error: Cause.squash(cause),
          }),
        ),
        Effect.ensuring(Effect.sync(() => titleInFlight.delete(input.sessionID))),
        Effect.tap((updated) =>
          updated === false
            ? Effect.logInfo("generated title discarded because the Session title changed", {
                sessionID: input.sessionID,
              })
            : Effect.void,
        ),
      )
    })

    const shellImpl = Effect.fn("SessionPrompt.shellImpl")(function* (input: ShellInput, ready?: Latch.Latch) {
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const markReady = ready ? ready.open.pipe(Effect.asVoid) : Effect.void
          const { msg, part, cwd } = yield* Effect.gen(function* () {
            const ctx = yield* InstanceState.context
            const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
            const agent = yield* agents.get(input.agent)
            if (!agent) {
              const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
              const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
              const error = new NamedError.Unknown({ message: `Agent not found: "${input.agent}".${hint}` })
              yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
              throw error
            }
            const model = input.model ?? agent.model ?? (yield* currentModel(input.sessionID))
            const userMsg: SessionV1.User = {
              id: input.messageID ?? MessageID.ascending(),
              sessionID: input.sessionID,
              time: { created: Date.now() },
              role: "user",
              agent: input.agent,
              model: { providerID: model.providerID, modelID: model.modelID },
            }
            const userPart: SessionV1.Part = {
              type: "text",
              id: PartID.ascending(),
              messageID: userMsg.id,
              sessionID: input.sessionID,
              text: "The following tool was executed by the user",
              synthetic: true,
            }
            const msg: SessionV1.Assistant = {
              id: MessageID.ascending(),
              sessionID: input.sessionID,
              parentID: userMsg.id,
              mode: input.agent,
              agent: input.agent,
              cost: 0,
              path: { cwd: ctx.directory, root: ctx.worktree },
              time: { created: Date.now() },
              role: "assistant",
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: model.modelID,
              providerID: model.providerID,
            }
            let started = Date.now()
            const part: SessionV1.ToolPart = {
              type: "tool",
              id: PartID.ascending(),
              messageID: msg.id,
              sessionID: input.sessionID,
              tool: ShellID.ToolID,
              callID: ulid(),
              state: {
                status: "running",
                time: { start: started },
                input: { command: input.command },
              },
            }
            yield* sessions.appendPresentationBlock([
              { info: userMsg, parts: [userPart] },
              { info: msg, parts: [part] },
            ])
            started = Math.max(started, msg.time.created)
            if (part.state.status !== "running") return yield* Effect.die("Shell Tool Part changed state before execution")
            part.state.time.start = started
            return { msg, part, cwd: ctx.directory }
          }).pipe(Effect.ensuring(markReady))

          const cfg = yield* config.get()
          const sh = Shell.preferred(cfg.shell)
          const args = Shell.args(sh, input.command, cwd)
          let output = ""
          let aborted = false

          const finish = Effect.uninterruptible(
            Effect.gen(function* () {
              if (aborted) {
                output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
              }
              const completed = Date.now()
              if (!msg.time.completed) {
                msg.time.completed = completed
                yield* sessions.updateMessage(msg)
              }
              if (part.state.status === "running") {
                part.state = {
                  status: "completed",
                  time: { ...part.state.time, end: completed },
                  input: part.state.input,
                  title: "",
                  metadata: { output },
                  output,
                }
                yield* sessions.updatePart(part)
              }
            }),
          )

          const exit = yield* restore(
            Effect.gen(function* () {
              const shellEnv = yield* plugin.trigger(
                "shell.env",
                { cwd, sessionID: input.sessionID, callID: part.callID },
                { env: {} },
              )
              const cmd = ChildProcess.make(sh, args, {
                cwd,
                extendEnv: true,
                env: { ...shellEnv.env, TERM: "dumb" },
                stdin: "ignore",
                forceKillAfter: "3 seconds",
              })
              const handle = yield* spawner.spawn(cmd)
              yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
                Effect.gen(function* () {
                  output += chunk
                  if (part.state.status === "running") {
                    part.state.metadata = { output }
                    yield* sessions.updatePart(part)
                  }
                }),
              )
              yield* handle.exitCode
            }).pipe(Effect.scoped, Effect.orDie),
          ).pipe(Effect.exit)

          if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause) && !Cause.hasDies(exit.cause)) {
            aborted = true
          }
          yield* finish

          if (Exit.isFailure(exit) && !aborted && !Cause.hasInterruptsOnly(exit.cause)) {
            return yield* Effect.failCause(exit.cause)
          }

          return { info: msg, parts: [part] }
        }),
      )
    })

    const getModel = Effect.fn("SessionPrompt.getModel")(function* (
      providerID: ProviderV2.ID,
      modelID: ModelV2.ID,
      sessionID: SessionID,
    ) {
      const exit = yield* provider.getModel(providerID, modelID).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) return exit.value
      const err = Cause.squash(exit.cause)
      if (Provider.ModelNotFoundError.isInstance(err)) {
        const hint = err.suggestions?.length ? ` Did you mean: ${err.suggestions.join(", ")}?` : ""
        yield* events.publish(Session.Event.Error, {
          sessionID,
          error: new NamedError.Unknown({
            message: `Model not found: ${err.providerID}/${err.modelID}.${hint}`,
          }).toObject(),
        })
      }
      return yield* Effect.die(err)
    })

    const currentModel = Effect.fnUntraced(function* (sessionID: SessionID) {
      const current = yield* db
        .select({ model: SessionTable.model })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      if (current?.model) {
        return {
          providerID: ProviderV2.ID.make(current.model.providerID),
          modelID: ModelV2.ID.make(current.model.id),
          ...(current.model.variant && current.model.variant !== "default" ? { variant: current.model.variant } : {}),
        }
      }
      const match = yield* sessions
        .findMessage(sessionID, (m) => m.info.role === "user" && !!m.info.model)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(Option.none())))
      if (Option.isSome(match) && match.value.info.role === "user") return match.value.info.model
      return yield* provider.defaultModel().pipe(Effect.orDie)
    })

    const prepareUserMessage = Effect.fn("SessionPrompt.prepareUserMessage")(function* (
      input: PromptInput,
      reportErrors = true,
    ) {
      const stored = input.messageID
        ? yield* MessageV2.get({ sessionID: input.sessionID, messageID: input.messageID }).pipe(
            Effect.provideService(Database.Service, database),
            Effect.option,
          )
        : Option.none<SessionV1.WithParts>()
      const storedUser = Option.isSome(stored) && stored.value.info.role === "user" ? stored.value.info : undefined
      const agentName = input.agent ?? storedUser?.agent
      const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
      if (!ag) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
        if (reportErrors) {
          yield* state.shared(
            input.sessionID,
            events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() }),
          )
        }
        throw error
      }

      const model = input.model ?? storedUser?.model ?? ag.model ?? (yield* currentModel(input.sessionID))
      const same = ag.model && model.providerID === ag.model.providerID && model.modelID === ag.model.modelID
      const full =
        !input.variant && !storedUser?.model.variant && ag.variant && same
          ? yield* provider
              .getModel(model.providerID, model.modelID)
              .pipe(Effect.catchIf(Provider.ModelNotFoundError.isInstance, () => Effect.succeed(undefined)))
          : undefined
      const variant =
        input.variant ??
        storedUser?.model.variant ??
        (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)

      const learnerAdmission = LearnerAdmission.interactive({ instant: storedUser?.time.created ?? Date.now() })
      const info: SessionV1.User = {
        id: input.messageID ?? MessageID.ascending(),
        role: "user",
        sessionID: input.sessionID,
        time: { created: learnerAdmission.capturedTemporalContext!.instant },
        tools: input.tools,
        agent: ag.name,
        model: {
          providerID: model.providerID,
          modelID: model.modelID,
          variant,
        },
        system: input.system,
        format: input.format,
      }

      yield* Effect.addFinalizer(() => instruction.clear(info.id))

      type Draft<T> = T extends SessionV1.Part ? Omit<T, "id"> & { id?: string } : never
      const assign = (part: Draft<SessionV1.Part>): SessionV1.Part => ({
        ...part,
        id: part.id ? PartID.make(part.id) : PartID.ascending(),
      })

      const resolvePart: (part: PromptInput["parts"][number]) => Effect.Effect<Draft<SessionV1.Part>[]> = Effect.fn(
        "SessionPrompt.resolveUserPart",
      )(function* (part) {
        if (part.type === "file") {
          if (part.source?.type === "resource") {
            const { clientName, uri } = part.source
            yield* Effect.logInfo("mcp resource", { clientName, uri, mime: part.mime })
            const pieces: Draft<SessionV1.Part>[] = [
              {
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Reading MCP resource: ${part.filename} (${uri})`,
              },
            ]
            const exit = yield* mcp.readResource(clientName, uri).pipe(Effect.exit)
            if (Exit.isSuccess(exit)) {
              const content = exit.value
              if (!content) throw new Error(`Resource not found: ${clientName}/${uri}`)
              const items = Array.isArray(content.contents) ? content.contents : [content.contents]
              for (const c of items) {
                if (!c || typeof c !== "object") continue
                if ("text" in c && typeof c.text === "string" && c.text) {
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: c.text,
                  })
                } else if ("blob" in c && typeof c.blob === "string" && c.blob) {
                  const mime = "mimeType" in c && typeof c.mimeType === "string" ? c.mimeType : part.mime
                  const filename = "uri" in c && typeof c.uri === "string" ? c.uri : part.filename
                  const size = mcpResourceBase64Size(c.blob)
                  if (!SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES.has(mime)) {
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `[Binary MCP resource omitted: ${filename ?? uri} (${mime}, ${formatMcpResourceBytes(size)}) is not a supported attachment type]`,
                    })
                    continue
                  }
                  if (size > MAX_MCP_RESOURCE_BLOB_BYTES) {
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `[Binary MCP resource omitted: ${filename ?? uri} (${mime}, ${formatMcpResourceBytes(size)}) exceeds ${formatMcpResourceBytes(MAX_MCP_RESOURCE_BLOB_BYTES)}]`,
                    })
                    continue
                  }
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `[Binary MCP resource attached: ${filename ?? uri} (${mime})]`,
                  })
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "file",
                    mime,
                    filename,
                    url: `data:${mime};base64,${c.blob}`,
                  })
                }
              }
            } else {
              const error = Cause.squash(exit.cause)
              yield* Effect.logError("failed to read MCP resource", { error, clientName, uri })
              const message = error instanceof Error ? error.message : String(error)
              pieces.push({
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Failed to read MCP resource ${part.filename}: ${message}`,
              })
            }
            return pieces
          }
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: decodeDataUrl(part.url),
                  },
                  { ...part, messageID: info.id, sessionID: input.sessionID },
                ]
              }
              break
            case "file:": {
              yield* Effect.logInfo("file", { mime: part.mime })
              const filepath = fileURLToPath(part.url)
              const mime = (yield* fsys.isDir(filepath)) ? "application/x-directory" : part.mime

              const { read } = yield* registry.named()
              const execRead = (args: Parameters<typeof read.execute>[0], extra?: Tool.Context["extra"]) => {
                const controller = new AbortController()
                return read
                  .execute(args, {
                    sessionID: input.sessionID,
                    abort: controller.signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true, ...extra },
                    messages: [],
                    metadata: () => Effect.void,
                    ask: () => Effect.void,
                  })
                  .pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())))
              }

              if (mime === "text/plain") {
                let offset: number | undefined
                let limit: number | undefined
                const range = { start: url.searchParams.get("start"), end: url.searchParams.get("end") }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  if (start === end) {
                    const symbols = yield* lsp.documentSymbol(filePathURI).pipe(Effect.catch(() => Effect.succeed([])))
                    for (const symbol of symbols) {
                      let r: LSP.Range | undefined
                      if ("range" in symbol) r = symbol.range
                      else if ("location" in symbol) r = symbol.location.range
                      if (r?.start?.line && r?.start?.line === start) {
                        start = r.start.line
                        end = r?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start, 1)
                  if (end) limit = end - (offset - 1)
                }
                const args = { filePath: filepath, offset, limit }
                const pieces: Draft<SessionV1.Part>[] = [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]
                const exit = yield* provider.getModel(info.model.providerID, info.model.modelID).pipe(
                  Effect.flatMap((mdl) => execRead(args, { model: mdl })),
                  Effect.exit,
                )
                if (Exit.isSuccess(exit)) {
                  const result = exit.value
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  })
                  if (result.attachments?.length) {
                    pieces.push(
                      ...result.attachments.map((a) => ({
                        ...a,
                        synthetic: true,
                        filename: a.filename ?? part.filename,
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })),
                    )
                  } else {
                    pieces.push({ ...part, mime, messageID: info.id, sessionID: input.sessionID })
                  }
                } else {
                  const error = Cause.squash(exit.cause)
                  yield* Effect.logError("failed to read file", { error, filepath })
                  const message = error instanceof Error ? error.message : String(error)
                  if (reportErrors) {
                    yield* events.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({ message }).toObject(),
                    })
                  }
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                  })
                }
                return pieces
              }

              if (mime === "application/x-directory") {
                const args = { filePath: filepath }
                const exit = yield* execRead(args).pipe(Effect.exit)
                if (Exit.isFailure(exit)) {
                  const error = Cause.squash(exit.cause)
                  yield* Effect.logError("failed to read directory", { error, filepath })
                  const message = error instanceof Error ? error.message : String(error)
                  if (reportErrors) {
                    yield* events.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({ message }).toObject(),
                    })
                  }
                  return [
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    },
                  ]
                }
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: exit.value.output,
                  },
                  { ...part, mime, messageID: info.id, sessionID: input.sessionID },
                ]
              }

              return [
                {
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: `Called the Read tool with the following input: {"filePath":"${filepath}"}`,
                },
                {
                  id: part.id,
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url:
                    `data:${mime};base64,` +
                    Buffer.from(yield* fsys.readFile(filepath).pipe(Effect.catch(Effect.die))).toString("base64"),
                  mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
            }
          }
        }

        if (part.type === "agent") {
          const perm = Permission.evaluate("task", part.name, ag.permission)
          const hint = perm.action === "deny" ? " . Invoked by user; guaranteed to exist." : ""
          return [
            { ...part, messageID: info.id, sessionID: input.sessionID },
            {
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                " Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name +
                hint,
            },
          ]
        }

        return [{ ...part, messageID: info.id, sessionID: input.sessionID }]
      })

      const resolvedParts = yield* Effect.forEach(input.parts, resolvePart, { concurrency: "unbounded" }).pipe(
        Effect.map((x) => x.flat().map(assign)),
      )

      yield* plugin.trigger(
        "chat.message",
        {
          sessionID: input.sessionID,
          agent: input.agent,
          model: input.model,
          messageID: input.messageID,
          variant: input.variant,
        },
        { message: info, parts: resolvedParts },
      )

      const parts = yield* Effect.forEach(resolvedParts, (part) =>
        part.type === "file" && part.mime.startsWith("image/")
          ? image.normalize(part).pipe(
              Effect.catchIf(
                (error) => error instanceof Image.ResizerUnavailableError,
                () => Effect.succeed(part),
              ),
            )
          : Effect.succeed(part),
      )

      const parsed = decodeMessageInfo(info, { errors: "all", propertyOrder: "original" })
      if (Exit.isFailure(parsed)) {
        yield* Effect.logError("invalid user message before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          agent: info.agent,
          model: info.model,
          cause: Cause.pretty(parsed.cause),
        })
      }
      for (const [index, part] of parts.entries()) {
        const p = decodeMessagePart(part, { errors: "all", propertyOrder: "original" })
        if (Exit.isSuccess(p)) continue
        yield* Effect.logError("invalid user part before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          partID: part.id,
          partType: part.type,
          index,
          cause: Cause.pretty(p.cause),
          part,
        })
      }

      return { info, parts, learnerAdmission }
    }, Effect.scoped)

    const createUserMessage = Effect.fn("SessionPrompt.createUserMessage")(function* (
      input: PromptInput,
      admission: "interactive" | "internal",
    ) {
      const message = yield* prepareUserMessage(input)
      const current = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      if (
        current.agent !== message.info.agent ||
        current.model?.providerID !== message.info.model.providerID ||
        current.model?.id !== message.info.model.modelID ||
        (current.model?.variant === "default" ? undefined : current.model?.variant) !== message.info.model.variant
      ) {
        yield* sessions.setAgentModel({
          sessionID: input.sessionID,
          agent: message.info.agent,
          model: {
            id: message.info.model.modelID,
            providerID: message.info.model.providerID,
            variant: message.info.model.variant ?? "default",
          },
          time: message.info.time.created,
        })
      }
      return yield* sessions.updateMessageWithParts({
        info: message.info,
        parts: message.parts,
        ...(admission === "interactive" && message.parts.some((part) => part.type === "text" && part.synthetic !== true)
          ? { admission: message.learnerAdmission }
          : {}),
      })
    })

    const resolveStartLimits = Effect.fn("SessionPrompt.resolveStartLimits")(function* (input: StartInput) {
      const stored = yield* db
        .transaction((tx) => TurnLifecycle.lookup(tx, input.turnID))
        .pipe(Effect.catchTag("SqlError", Effect.die))
      if (stored.type === "source_unavailable") return yield* TurnLifecycle.sourceUnavailableError(stored)
      if (input.limits) return input.limits
      if (stored.type === "available") return stored.turn.limits
      return DEFAULT_TURN_LIMITS
    })

    const learnerEnvelope = (input: StartInput | SteerInput, message: UserWithParts, limits?: Turn.Limits) =>
      normalizeTurnEnvelope({
        kind: "turnID" in input ? "learner_root" : "learner_steer",
        sessionID: input.sessionID,
        turnID: "turnID" in input ? input.turnID : input.expectedTurnID,
        inputID: input.inputID,
        messageID: input.messageID,
        ...(limits ? { limits } : {}),
        selected: {
          agent: message.info.agent,
          model: message.info.model,
          ...(message.info.tools ? { tools: message.info.tools } : {}),
          ...(message.info.system ? { system: message.info.system } : {}),
          ...(message.info.format ? { format: message.info.format } : {}),
        },
        content: learnerContent(message),
        ...("session" in input && input.session ? { session: input.session } : {}),
        ...("fork" in input && input.fork ? { fork: input.fork } : {}),
      })

    const importCopyEnvelope = (input: ImportCopyStartInput, message: UserWithParts, limits: Turn.Limits) =>
      normalizeTurnEnvelope({
        ...learnerEnvelope(input, message, limits),
        importCopy: input.importCopy.envelope,
      })

    const learnerAdmissionAtPresentation = (message: UserWithParts) =>
      message.learnerAdmission.capturedTemporalContext?.instant === message.info.time.created
        ? message.learnerAdmission
        : LearnerAdmission.interactive({
            timeZone: message.learnerAdmission.timeZone,
            instant: message.info.time.created,
          })

    const learnerEvents = (
      message: UserWithParts,
      commit: () => Effect.Effect<void>,
    ): readonly EventV2.PreparedEvent<EventV2.Definition>[] => [
      {
        definition: SessionV1.Event.MessageUpdated,
        data: { sessionID: message.info.sessionID, info: message.info },
        ...(message.parts.length === 0 ? { options: { commit } } : {}),
      },
      ...message.parts.map((part, index) => ({
        definition: SessionV1.Event.PartUpdated,
        data: { sessionID: part.sessionID, part, time: message.info.time.created },
        ...(index === message.parts.length - 1 ? { options: { commit } } : {}),
      })),
    ]

    const preflightLearnerPresentation = Effect.fn("SessionPrompt.preflightLearnerPresentation")(function* (
      tx: EventV2.Transaction,
      message: UserWithParts,
      turnID: Turn.ID,
    ) {
      if (
        message.info.role !== "user" ||
        new Set(message.parts.map((part) => part.id)).size !== message.parts.length ||
        message.parts.some((part) => part.sessionID !== message.info.sessionID || part.messageID !== message.info.id)
      ) {
        return yield* new Turn.IntegrityError({
          turnID,
          reason: "Learner presentation does not belong to the requested Session and User Message",
        })
      }
      if (!message.parts.some((part) => part.type === "text" && part.synthetic !== true)) {
        return yield* new InvalidCausalSourceError({ reason: "synthetic_only" })
      }

      const messageCollision = yield* tx
        .select({ id: MessageTable.id })
        .from(MessageTable)
        .where(eq(MessageTable.id, message.info.id))
        .get()
        .pipe(Effect.orDie)
      const partCollision =
        message.parts.length === 0
          ? undefined
          : yield* tx
              .select({ id: PartTable.id })
              .from(PartTable)
              .where(
                inArray(
                  PartTable.id,
                  message.parts.map((part) => part.id),
                ),
              )
              .get()
              .pipe(Effect.orDie)
      if (messageCollision || partCollision) return yield* new Turn.AdmissionConflictError({ turnID })
    })

    const admitRoot = Effect.fn("SessionPrompt.admitRoot")(function* (input: {
      request: StartInput | ImportCopyStartInput
      message: UserWithParts
      limits: Turn.Limits
      envelope: Record<string, unknown>
    }) {
      let admitted: TurnLifecycle.Admitted | undefined
      yield* events.transactionPresentation((tx) =>
        Effect.gen(function* () {
          const stored = yield* TurnLifecycle.lookup(tx, input.request.turnID)
          if (stored.type === "source_unavailable") {
            return yield* TurnLifecycle.sourceUnavailableError(stored)
          }
          if (stored.type === "available") {
            const presentation = yield* Occurrence.resolvePresentation(tx, {
              sessionID: input.request.sessionID,
              messageID: input.request.messageID,
            })
            admitted = yield* TurnLifecycle.admit(tx, {
              kind: "learner",
              turnID: input.request.turnID,
              sessionID: input.request.sessionID,
              inputID: input.request.inputID,
              messageID: input.request.messageID,
              occurrenceID: presentation.occurrenceID,
              limits: input.limits,
              envelope: input.envelope,
              policyBasis: TURN_POLICY_BASIS,
              timeAdmitted: input.message.info.time.created,
            })
            return { result: undefined }
          }

          const reused = yield* tx
            .select({ id: TurnInputTable.id })
            .from(TurnInputTable)
            .where(
              or(eq(TurnInputTable.id, input.request.inputID), eq(TurnInputTable.message_id, input.request.messageID)),
            )
            .get()
            .pipe(Effect.orDie)
          if (reused) return yield* new Turn.AdmissionConflictError({ turnID: input.request.turnID })
          yield* preflightLearnerPresentation(tx, input.message, input.request.turnID)
          if ("importCopy" in input.request && input.request.importCopy) {
            if (!(yield* input.request.importCopy.verifySource)) {
              return yield* new Turn.IntegrityError({
                turnID: input.request.turnID,
                reason: "import_copy_source_changed",
              })
            }
            yield* input.request.importCopy.verifyTargetIdentities(tx, input.message)
          }

          const rules = Object.entries(input.request.tools ?? {}).map(([permission, enabled]) => ({
            permission,
            action: enabled ? ("allow" as const) : ("deny" as const),
            pattern: "*",
          }))
          const sessionInput =
            input.request.session || input.request.fork
              ? {
                  ...input.request.session,
                  agent: input.message.info.agent,
                  model: {
                    id: input.message.info.model.modelID,
                    providerID: input.message.info.model.providerID,
                    variant: input.message.info.model.variant ?? "default",
                  },
                  ...(rules.length > 0 ? { permission: rules } : {}),
                }
              : undefined
          const plan = yield* sessions.prepareRootStart(tx, {
            targetSessionID: input.request.sessionID,
            turnID: input.request.turnID,
            ...(sessionInput ? { session: sessionInput } : {}),
            ...(input.request.fork ? { fork: input.request.fork } : {}),
            ...("importCopy" in input.request && input.request.importCopy
              ? { importCopy: input.request.importCopy.plan }
              : {}),
          })
          const profile: Session.Info = {
            ...plan.session,
            agent: input.message.info.agent,
            model: {
              id: input.message.info.model.modelID,
              providerID: input.message.info.model.providerID,
              variant: input.message.info.model.variant ?? "default",
            },
            ...(rules.length > 0 ? { permission: rules } : {}),
            time: { ...plan.session.time, updated: input.message.info.time.created },
          }
          const profileEvents =
            plan.events.length > 0
              ? []
              : [
                  {
                    definition: SessionV1.Event.Updated,
                    data: { sessionID: input.request.sessionID, info: profile },
                  },
                ]

          const commit = () =>
            Effect.gen(function* () {
              const occurrence = yield* Occurrence.admit(tx, {
                admission: learnerAdmissionAtPresentation(input.message),
                sessionID: input.request.sessionID,
                messageID: input.request.messageID,
                timeAdmitted: input.message.info.time.created,
              })
              admitted = yield* TurnLifecycle.admit(tx, {
                kind: "learner",
                turnID: input.request.turnID,
                sessionID: input.request.sessionID,
                inputID: input.request.inputID,
                messageID: input.request.messageID,
                occurrenceID: occurrence.id,
                limits: input.limits,
                envelope: input.envelope,
                policyBasis: TURN_POLICY_BASIS,
                timeAdmitted: input.message.info.time.created,
              })
            }).pipe(Effect.orDie)
          const started = SessionTurnEvents.started(() => {
            if (!admitted) throw new Error(`Root Turn ${input.request.turnID} admission did not precede its event`)
            return admitted
          })
          return {
            result: undefined,
            events: [...plan.events, ...profileEvents, ...learnerEvents(input.message, commit), started],
          }
        }),
      )
      if (!admitted) return yield* Effect.die(`Root Turn ${input.request.turnID} committed without admission`)
      return admitted
    })

    const assertMaterializationTargetAvailable = (sessionID: SessionID) =>
      db
        .transaction((tx) => SessionDeletion.assertSessionIDAvailable(tx, sessionID))
        .pipe(Effect.catchTag("SqlError", Effect.die))

    const startMaterialization = <A, E, R>(
      sessionID: SessionID,
      effect: Effect.Effect<A, E | Session.BusyError, R>,
    ) =>
      assertMaterializationTargetAvailable(sessionID).pipe(
        Effect.andThen(effect),
        Effect.catchTag("SessionBusyError", (error) =>
          state.awaitClosing(sessionID).pipe(
            Effect.andThen(assertMaterializationTargetAvailable(sessionID)),
            Effect.andThen(Effect.fail(error)),
          ),
        ),
      )

    const promoteSteer = Effect.fn("SessionPrompt.promoteSteer")(function* (input: {
      request: SteerInput
      message: UserWithParts
      envelope: Record<string, unknown>
    }) {
      let promoted: Turn.Input | undefined
      yield* events.transactionPresentation((tx) =>
        Effect.gen(function* () {
          const existing = yield* tx
            .select({ id: TurnInputTable.id, messageID: TurnInputTable.message_id })
            .from(TurnInputTable)
            .where(
              or(eq(TurnInputTable.id, input.request.inputID), eq(TurnInputTable.message_id, input.request.messageID)),
            )
            .get()
            .pipe(Effect.orDie)
          if (existing) {
            if (existing.id !== input.request.inputID) {
              return yield* new Turn.AdmissionConflictError({ turnID: input.request.expectedTurnID })
            }
            const presentation = yield* Occurrence.resolvePresentation(tx, {
              sessionID: input.request.sessionID,
              messageID: input.request.messageID,
            })
            promoted = yield* TurnLifecycle.promoteSteer(tx, {
              sessionID: input.request.sessionID,
              expectedTurnID: input.request.expectedTurnID,
              inputID: input.request.inputID,
              messageID: input.request.messageID,
              occurrenceID: presentation.occurrenceID,
              envelope: input.envelope,
              timeAdmitted: input.message.info.time.created,
            })
            return { result: undefined }
          }
          yield* preflightLearnerPresentation(tx, input.message, input.request.expectedTurnID)

          const commit = () =>
            Effect.gen(function* () {
              const occurrence = yield* Occurrence.admit(tx, {
                admission: learnerAdmissionAtPresentation(input.message),
                sessionID: input.request.sessionID,
                messageID: input.request.messageID,
                timeAdmitted: input.message.info.time.created,
              })
              promoted = yield* TurnLifecycle.promoteSteer(tx, {
                sessionID: input.request.sessionID,
                expectedTurnID: input.request.expectedTurnID,
                inputID: input.request.inputID,
                messageID: input.request.messageID,
                occurrenceID: occurrence.id,
                envelope: input.envelope,
                timeAdmitted: input.message.info.time.created,
              })
            }).pipe(Effect.orDie)
          const inputPromoted = SessionTurnEvents.inputPromoted(() => {
            if (!promoted) throw new Error(`Turn ${input.request.expectedTurnID} steer did not precede its event`)
            return promoted
          })
          return { result: undefined, events: [...learnerEvents(input.message, commit), inputPromoted] }
        }),
      )
      if (!promoted) return yield* Effect.die(`Turn ${input.request.expectedTurnID} steer committed without promotion`)
      return promoted
    })

    const start: Interface["start"] = Effect.fn("SessionPrompt.start")(function* (input) {
      const limits = yield* resolveStartLimits(input)
      const message = yield* prepareUserMessage(input, false)
      const envelope = learnerEnvelope(input, message, limits)
      return yield* startMaterialization(
        input.sessionID,
        state.startTurn({
          sessionID: input.sessionID,
          turnID: input.turnID,
          envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
          ...(input.fork ? { guardSessionIDs: [input.fork.sourceSessionID] } : {}),
          admit: admitRoot({ request: input, message, limits, envelope }),
          work: runTurnLoop(input.sessionID, input.turnID),
        }),
      )
    })

    const startImportCopy: Interface["startImportCopy"] = Effect.fn("SessionPrompt.startImportCopy")(function* (input) {
      const limits = yield* resolveStartLimits(input)
      const message = yield* prepareUserMessage(input, false)
      message.info.time.created = input.importCopy.envelope.learnerPresentationTime
      const envelope = importCopyEnvelope(input, message, limits)
      return yield* startMaterialization(
        input.sessionID,
        state.startTurn({
          sessionID: input.sessionID,
          turnID: input.turnID,
          envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
          admit: admitRoot({ request: input, message, limits, envelope }),
          work: runTurnLoop(input.sessionID, input.turnID),
        }),
      )
    })

    const replaySteer = Effect.fn("SessionPrompt.replaySteer")(function* (input: {
      request: SteerInput
      message: UserWithParts
      envelope: Record<string, unknown>
    }) {
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const existing = yield* tx
              .select({ id: TurnInputTable.id })
              .from(TurnInputTable)
              .where(eq(TurnInputTable.id, input.request.inputID))
              .get()
              .pipe(Effect.orDie)
            if (!existing) return
            const presentation = yield* Occurrence.resolvePresentation(tx, {
              sessionID: input.request.sessionID,
              messageID: input.request.messageID,
            })
            return yield* TurnLifecycle.promoteSteer(tx, {
              sessionID: input.request.sessionID,
              expectedTurnID: input.request.expectedTurnID,
              inputID: input.request.inputID,
              messageID: input.request.messageID,
              occurrenceID: presentation.occurrenceID,
              envelope: input.envelope,
              timeAdmitted: input.message.info.time.created,
            })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const steer: Interface["steer"] = Effect.fn("SessionPrompt.steer")(function* (input) {
      const message = yield* prepareUserMessage(input, false)
      const envelope = learnerEnvelope(input, message)
      return yield* state.steerTurn({
        sessionID: input.sessionID,
        expectedTurnID: input.expectedTurnID,
        inputID: input.inputID,
        envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
        replay: replaySteer({ request: input, message, envelope }),
        promote: promoteSteer({ request: input, message, envelope }),
      })
    })

    const activeTurn: Interface["activeTurn"] = (sessionID) => state.activeTurn(sessionID)
    const listTurns: Interface["listTurns"] = (sessionID) => state.listTurns(sessionID)
    const getTurn: Interface["getTurn"] = (sessionID, turnID) => state.getTurn(sessionID, turnID)
    const awaitTurn: Interface["awaitTurn"] = (sessionID, turnID) => state.awaitTurn(sessionID, turnID)
    const interruptTurn: Interface["interruptTurn"] = (sessionID, turnID) => state.interruptTurn(sessionID, turnID)

    const startChild: Interface["startChild"] = Effect.fn("SessionPrompt.startChild")(function* (input) {
      const capability = yield* decodeDelegatedCapability(input.delegatedCapability).pipe(
        Effect.mapError(
          () =>
            new Turn.IntegrityError({
              turnID: input.childTurnID,
              reason: "Delegated capability is not the canonical parent/inherited/profile/explicit projection",
            }),
        ),
      )
      const message = yield* prepareUserMessage(
        {
          sessionID: input.childSessionID,
          messageID: input.messageID,
          model: input.model,
          agent: input.agent,
          parts: input.parts,
          tools: input.tools,
          format: input.format,
          system: input.system,
          variant: input.variant,
        },
        false,
      )
      const delegatedCapability = normalizeTurnEnvelope(capability)
      const envelope = normalizeTurnEnvelope({
        kind: "delegated_task",
        sessionID: input.childSessionID,
        turnID: input.childTurnID,
        inputID: input.childInputID,
        messageID: input.messageID,
        limits: input.limits,
        parent: {
          sessionID: input.parentSessionID,
          turnID: input.parentTurnID,
          taskPartID: input.parentTaskPartID,
          modelMessageID: input.parentModelMessageID,
        },
        depthLimit: input.depthLimit,
        delegatedCapability,
        requestedOutput: "text",
        selected: {
          agent: message.info.agent,
          model: message.info.model,
          ...(message.info.tools ? { tools: message.info.tools } : {}),
          ...(message.info.system ? { system: message.info.system } : {}),
          ...(message.info.format ? { format: message.info.format } : {}),
        },
        content: learnerContent(message),
        session: input.session,
      })
      return yield* startMaterialization(
        input.childSessionID,
        state.startTurn({
          sessionID: input.childSessionID,
          turnID: input.childTurnID,
          envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
          admit: sessions.prepareChildStart({
            childSessionID: input.childSessionID,
            childTurnID: input.childTurnID,
            childInputID: input.childInputID,
            parentSessionID: input.parentSessionID,
            parentTurnID: input.parentTurnID,
            parentTaskPartID: input.parentTaskPartID,
            parentModelMessageID: input.parentModelMessageID,
            delegatedCapability,
            depthLimit: input.depthLimit,
            limits: input.limits,
            envelope,
            policyBasis: { ...TURN_POLICY_BASIS, admission: "delegated_task" },
            timeAdmitted: message.info.time.created,
            session: {
              ...input.session,
              agent: message.info.agent,
              model: {
                id: message.info.model.modelID,
                providerID: message.info.model.providerID,
                variant: message.info.model.variant ?? "default",
              },
            },
            message,
          }),
          work: runTurnLoop(input.childSessionID, input.childTurnID),
        }),
      )
    })

    const childOutput = Effect.fn("SessionPrompt.childOutput")(function* (turnID: Turn.ID) {
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            const operation = yield* tx
              .select({ messageID: TurnModelOperationTable.assistant_message_id })
              .from(TurnModelOperationTable)
              .where(eq(TurnModelOperationTable.turn_id, turnID))
              .orderBy(desc(TurnModelOperationTable.ordinal))
              .get()
              .pipe(Effect.orDie)
            if (!operation) return ""
            const parts = yield* tx
              .select({ data: PartTable.data })
              .from(PartTable)
              .where(eq(PartTable.message_id, operation.messageID))
              .orderBy(PartTable.time_created, PartTable.id)
              .all()
              .pipe(Effect.orDie)
            return parts
              .flatMap((part) => {
                const data = part.data as {
                  readonly type?: string
                  readonly text?: string
                  readonly synthetic?: boolean
                }
                return data.type === "text" && typeof data.text === "string" && data.synthetic !== true
                  ? [data.text]
                  : []
              })
              .join("")
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const exactChildResult = Effect.fn("SessionPrompt.exactChildResult")(function* (input: AwaitChildInput) {
      const result = yield* db
        .transaction((tx) => TurnLifecycle.childResult(tx, input.parentTaskPartID))
        .pipe(Effect.catchTag("SqlError", Effect.die))
      if (!result) return
      if (
        result.parentSessionID !== input.parentSessionID ||
        result.parentTurnID !== input.parentTurnID ||
        result.childSessionID !== input.childSessionID ||
        result.childTurnID !== input.childTurnID
      ) {
        return yield* new Turn.AdmissionConflictError({ turnID: input.parentTurnID })
      }
      return result
    })

    const awaitChild: Interface["awaitChild"] = Effect.fn("SessionPrompt.awaitChild")(function* (input) {
      const existing = yield* exactChildResult(input)
      if (existing) return existing
      return yield* state.shared(
        input.childSessionID,
        Effect.gen(function* () {
          const terminal = yield* state.awaitTurn(input.childSessionID, input.childTurnID)
          if (terminal.state === "running" || !terminal.terminal) {
            return yield* new Turn.IntegrityError({
              turnID: input.childTurnID,
              reason: "Awaited child Turn did not reach a terminal state",
            })
          }
          const output = yield* childOutput(input.childTurnID)
          const requestedOutput =
            terminal.state === "completed"
              ? ({ state: "complete", value: output } as const)
              : ({
                  state: "incomplete",
                  ...(output ? { partial: output } : {}),
                  reason: terminal.terminal.reason,
                } as const)
          return yield* db
            .transaction(
              (tx) =>
                TurnLifecycle.recordChildResult(tx, {
                  ...input,
                  requestedOutput,
                  timeSettled: Date.now(),
                }),
              { behavior: "immediate" },
            )
            .pipe(Effect.catchTag("SqlError", Effect.die))
        }),
      )
    })

    const lastAssistant = Effect.fnUntraced(function* (sessionID: SessionID) {
      const match = yield* sessions.findMessage(sessionID, (m) => m.info.role !== "user").pipe(Effect.orDie)
      if (Option.isSome(match)) return match.value
      const msgs = yield* sessions.messages({ sessionID, limit: 1 }).pipe(Effect.orDie)
      if (msgs.length > 0) return msgs[0]
      throw new Error("Impossible")
    })

    type TurnLoopResult = Readonly<{
      message?: SessionV1.WithParts
      failureReason?: SessionProcessor.FailureReason
    }>

    const runLoop: (
      sessionID: SessionID,
      turnID: Turn.ID,
    ) => Effect.Effect<
      TurnLoopResult,
      | Session.NotFound
      | Session.BusyError
      | Turn.Error
      | SessionPresentation.AdministrativeHistoryIntegrityError
      | SessionPresentation.FrontierUnrepresentableError
    > = Effect.fn("SessionPrompt.runTurn")(function* (
      sessionID: SessionID,
      turnID: Turn.ID,
    ) {
      const ctx = yield* InstanceState.context
      let structured: unknown
      let step = 0
      let turnExhausted = false
      let failureReason: SessionProcessor.FailureReason | undefined
      let titleWork: Fiber.Fiber<void, never> | undefined
      const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
      const authority = yield* state.getTurn(sessionID, turnID).pipe(Effect.flatMap(turnAuthority))

      while (true) {
        const promotedSteer = yield* state.promoteSteer(sessionID, turnID)
        yield* status.set(sessionID, { type: "busy" })
        yield* Effect.logInfo("loop", { "session.id": sessionID, step })

        let msgs = yield* MessageV2.filterCompactedEffect(sessionID).pipe(
          Effect.provideService(Database.Service, database),
        )

        const currentTurn = yield* state.getTurn(sessionID, turnID)
        const currentInput = yield* database.db
          .select({ messageID: TurnInputTable.message_id })
          .from(TurnInputTable)
          .where(
            and(
              eq(TurnInputTable.id, currentTurn.currentInputID),
              eq(TurnInputTable.turn_id, turnID),
              eq(TurnInputTable.session_id, sessionID),
            ),
          )
          .get()
          .pipe(Effect.orDie)
        if (!currentInput) {
          return yield* new Turn.IntegrityError({
            turnID,
            reason: "Current Turn input has no exact Session Message presentation",
          })
        }
        const currentWork = yield* MessageV2.currentWorkEffect({
          sessionID,
          turnID,
          currentInputID: currentTurn.currentInputID,
          currentInputMessageID: currentInput.messageID,
          messages: msgs,
        }).pipe(Effect.provideService(Database.Service, database))
        const {
          user: lastUser,
          userMessage: lastUserMsg,
          assistant: lastAssistant,
          assistantMessage: lastAssistantMsg,
          finished: lastFinished,
          compactionFinished,
          tasks,
          interactiveMessages,
        } = currentWork
        // Some providers return "stop" even when the assistant message contains
        // tool calls. Keep the loop running so tool results can be sent back to
        // the model, but ignore cleanup-marked interrupted orphans.
        const hasToolCalls =
          lastAssistantMsg?.parts.some(
            (part) => part.type === "tool" && !part.metadata?.providerExecuted && !isOrphanedInterruptedTool(part),
          ) ?? false

        if (
          !promotedSteer &&
          lastAssistant &&
          lastFinished?.id === lastAssistant?.id &&
          lastAssistant.finish &&
          !["tool-calls"].includes(lastAssistant.finish) &&
          !hasToolCalls &&
          lastAssistant.parentID === lastUser.id
        ) {
          const orphan = lastAssistantMsg?.parts.find(
            (part): part is SessionV1.ToolPart => part.type === "tool" && isOrphanedInterruptedTool(part),
          )
          if (orphan) {
            yield* Effect.logWarning("loop exit with orphaned interrupted tool", {
              "session.id": sessionID,
              messageID: lastAssistant.id,
              tool: orphan.tool,
              callID: orphan.callID,
            })
          }
          yield* Effect.logInfo("exiting loop", { "session.id": sessionID })
          break
        }

        const task = tasks.pop()
        if (task?.type === "compaction") {
          const result = yield* compaction.process({
            messages: msgs,
            parentID: task.messageID,
            sessionID,
            auto: task.auto,
            overflow: task.overflow,
          })
          if (result === "stop") break
          continue
        }

        const agent = yield* agents.get(lastUser.agent)
        if (!agent) {
          const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
          const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
          const error = new NamedError.Unknown({ message: `Agent not found: "${lastUser.agent}".${hint}` })
          yield* events.publish(Session.Event.Error, { sessionID, error: error.toObject() })
          throw error
        }

        const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)

        if (task?.type === "subtask") {
          return yield* new Turn.IntegrityError({
            turnID,
            reason: "Legacy synthetic subtask presentation cannot execute outside an admitted Task invocation",
          })
        }

        if (
          compactionFinished &&
          compactionFinished.summary !== true &&
          (yield* compaction.isOverflow({ tokens: compactionFinished.tokens, model }))
        ) {
          yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
          continue
        }

        const nextStep = step + 1
        const maxSteps = agent.steps ?? Infinity
        const isLastStep = nextStep >= maxSteps
        const snapshotFrontier = yield* db
          .transaction((tx) => LearningFrontier.read(tx))
          .pipe(Effect.catchTag("SqlError", Effect.die))
        msgs = interactiveMessages
        msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(
          Effect.provideService(RuntimeFlags.Service, flags),
          Effect.provideService(FSUtil.Service, fsys),
          Effect.provideService(Session.Service, sessions),
        )

        const msg: SessionV1.Assistant = {
          id: MessageID.ascending(),
          parentID: lastUser.id,
          role: "assistant",
          mode: agent.name,
          agent: agent.name,
          variant: lastUser.model.variant,
          path: { cwd: ctx.directory, root: ctx.worktree },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: model.id,
          providerID: model.providerID,
          time: { created: Date.now() },
          sessionID,
        }
        let modelAdmitted = false

        const finalizeInterruptedAssistant = Effect.gen(function* () {
          if (!modelAdmitted) return
          if (msg.time.completed) return
          msg.error ??= MessageV2.fromError(new DOMException("Aborted", "AbortError"), {
            providerID: msg.providerID,
            aborted: true,
          })
          msg.time.completed = Date.now()
          yield* sessions.updateMessage(msg)
        })

        const handle = yield* processor
          .create({
            assistantMessage: msg,
            sessionID,
            model,
            turnID,
          })
          .pipe(Effect.onInterrupt(() => finalizeInterruptedAssistant))

        const outcome: "break" | "continue" | "exhausted" = yield* Effect.gen(function* () {
          const bypassAgentCheck = lastUserMsg.parts.some((p) => p.type === "agent")
          const promptOps = yield* ops()

          const tools = yield* SessionTools.resolve({
            agent,
            session,
            model,
            processor: handle,
            bypassAgentCheck,
            messages: msgs,
            promptOps,
            authority,
          }).pipe(
            Effect.provideService(Plugin.Service, plugin),
            Effect.provideService(Permission.Service, permission),
            Effect.provideService(ToolRegistry.Service, registry),
            Effect.provideService(MCP.Service, mcp),
            Effect.provideService(Truncate.Service, truncate),
            Effect.provideService(RuntimeFlags.Service, flags),
          )

          if (lastUser.format?.type === "json_schema") {
            SessionTools.install(
              tools,
              "StructuredOutput",
              "program-owned structured output",
              createStructuredOutputTool({
                schema: lastUser.format.schema,
                onSuccess(output) {
                  structured = output
                },
              }),
            )
          }

          yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })

          const compactable = yield* compaction.compactable({ messages: msgs, model })
          const [skills, env, instructions, mcpInstructions, modelMsgs, compactableModelMsgs] = yield* Effect.all([
            sys.skills(agent),
            sys.environment(model),
            instruction.system().pipe(Effect.orDie),
            sys.mcp(agent, session.permission),
            MessageV2.toModelMessagesEffect(msgs, model),
            MessageV2.toModelMessagesEffect(compactable.messages, model),
          ])
          const system = [
            ...env,
            ...instructions,
            ...(mcpInstructions ? [mcpInstructions] : []),
            ...(skills ? [skills] : []),
          ]
          const format = lastUser.format ?? { type: "text" as const }
          if (format.type === "json_schema") system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
          const requestMessages = [
            ...modelMsgs,
            ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS_PROMPT }] : []),
          ]
          if (!llm.plan || !llm.finalize) {
            return yield* new Turn.IntegrityError({
              turnID,
              reason: "Released-v1 interactive runtime has no Gate 18 request planning/finalization seam",
            })
          }
          const requestPlan = yield* llm
            .plan({
              composition: { type: "interactive" },
              user: lastUser,
              agent,
              permission: session.permission,
              authority,
              sessionID,
              parentSessionID: session.parentID,
              system,
              messages: requestMessages,
              compactableMessages: compactableModelMsgs,
              compactionSelection: compactable.selection,
              tools,
              model,
              toolChoice: format.type === "json_schema" ? "required" : undefined,
            })
            .pipe(
              Effect.mapError(
                (error) =>
                  new Turn.IntegrityError({
                    turnID,
                    reason: `Gate 18 request planning failed before model admission: ${String(error)}`,
                  }),
              ),
            )
          const requestEnvelope = normalizeTurnEnvelope({
            assistantMessageID: msg.id,
            agent: agent.name,
            model: { providerID: model.providerID, modelID: model.id, variant: lastUser.model.variant },
            system,
            messages: requestMessages,
            providerToolSurface: requestPlan.providerToolSurface.binding,
            ...(format.type === "json_schema" ? { toolChoice: "required", format } : {}),
          })
          const contextFingerprint = TurnLifecycle.envelopeFingerprint(
            normalizeTurnEnvelope({ system, messages: requestMessages }),
          )
          const learnerResponseEvidenceRequirements = requestPlan.capabilityBasis.effectiveAutomaticContext
            ? yield* db
                .transaction((tx) =>
                  LearningContext.listLearnerResponseEvidenceRequirements(tx, {
                    cutAsOf: Math.max(Date.now(), snapshotFrontier.time),
                  }),
                )
                .pipe(Effect.orDie)
            : []
          const learnerResponseEvidenceMaterials = yield* Effect.forEach(
            learnerResponseEvidenceRequirements,
            (requirement) =>
              resolveLearnerResponseEvidenceMaterial(
                { database, contentRoots, maps, tutorMaterials },
                {
                  mapID: requirement.mapID,
                  selectorID: requirement.selectorID,
                  operationIdentity: `learning-context:${msg.id}:${requirement.mapID}:${requirement.selectorID}`,
                  profileIdentity: JSON.stringify({
                    agent: agent.name,
                    sessionID,
                    permission: session.permission,
                    authority,
                  }),
                },
              ).pipe(
                Effect.map((resolved) => ({
                  mapID: requirement.mapID,
                  selectorID: requirement.selectorID,
                  state: "available" as const,
                  receipt: resolved.receipt,
                  byteLength: resolved.byteLength,
                })),
                Effect.catch(() =>
                  Effect.succeed({
                    mapID: requirement.mapID,
                    selectorID: requirement.selectorID,
                    state: "unavailable" as const,
                  }),
                ),
              ),
            { concurrency: 4 },
          )
          const sealedFrontier = yield* db
            .transaction((tx) => LearningFrontier.read(tx))
            .pipe(Effect.catchTag("SqlError", Effect.die))
          if (sealedFrontier.sequence !== snapshotFrontier.sequence || sealedFrontier.time !== snapshotFrontier.time) {
            return "continue" as const
          }
          const modelAdmission = yield* Effect.uninterruptible(
            events
              .transaction<{ value?: TurnLifecycle.ModelAdmissionResult }, EventV2.Definition, Turn.Error>((tx) =>
                Effect.gen(function* () {
                  const admissionInput = {
                    turnID,
                    sessionID,
                    assistantMessageID: msg.id,
                    requestEnvelope,
                    contextFingerprint,
                    snapshotFrontier,
                    timeAdmitted: Date.now(),
                    learningContextBasis: requestPlan.capabilityBasis,
                    learnerResponseEvidenceMaterials,
                  }
                  const existing = yield* tx
                    .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
                    .from(TurnModelOperationTable)
                    .where(eq(TurnModelOperationTable.assistant_message_id, msg.id))
                    .get()
                    .pipe(Effect.orDie)
                  const before = yield* TurnLifecycle.info(tx, turnID)
                  if (existing || before.state !== "running" || before.counters.model >= before.limits.model) {
                    const result = yield* TurnLifecycle.admitModel(tx, admissionInput)
                    if (result.type === "exhausted") {
                      if (result.replay) return { result: { value: result } }
                      return { result: { value: result }, event: SessionTurnEvents.terminal(result.turn) }
                    }
                    return { result: { value: result } }
                  }
                  const result: { value?: TurnLifecycle.ModelAdmissionResult } = {}
                  const readOperation = () => {
                    if (result.value?.type === "admitted") return result.value.operation
                    throw new Error(`Model admission did not commit before its typed event: ${msg.id}`)
                  }
                  return {
                    result,
                    events: [
                      {
                        definition: SessionV1.Event.MessageUpdated,
                        data: { sessionID, info: msg },
                        options: {
                          commit: () =>
                            TurnLifecycle.admitModel(tx, admissionInput).pipe(
                              Effect.flatMap((admitted) => {
                                if (admitted.type !== "admitted" || admitted.replay) {
                                  return Effect.die(
                                    `Fresh model admission changed while its Assistant presentation was committing: ${msg.id}`,
                                  )
                                }
                                return Effect.sync(() => {
                                  result.value = admitted
                                })
                              }),
                              Effect.orDie,
                            ),
                        },
                      },
                      SessionTurnEvents.modelAdmitted(readOperation),
                    ],
                  }
                }),
              )
              .pipe(
                Effect.tap((result) =>
                  result.result.value?.type === "admitted"
                    ? Effect.sync(() => {
                        modelAdmitted = true
                      })
                    : Effect.void,
                ),
              ),
          )
          const admitted = modelAdmission.result.value
          if (!admitted) {
            return yield* new Turn.IntegrityError({
              turnID,
              reason: `Model admission ${msg.id} committed without a durable result`,
            })
          }
          if (admitted.type === "exhausted") return "exhausted" as const
          if (admitted.replay) {
            return yield* new Turn.IntegrityError({
              turnID,
              reason: `Model operation ${admitted.operation.assistantMessageID} replay has no live provider owner`,
            })
          }
          const prepared = yield* llm
            .finalize({
              plan: requestPlan,
              retainedSteeringCut: admitted.retainedSteeringCut,
              learningContextCut: admitted.learningContextCut,
              learningContextRenderedBlock: admitted.learningContextRenderedBlock,
            })
            .pipe(
              Effect.mapError(
                (error) =>
                  new Turn.IntegrityError({
                    turnID,
                    reason: `Gate 18 admitted request could not be finalized exactly: ${String(error)}`,
                  }),
              ),
            )
          step = nextStep
          if (step === 1) {
            titleWork = yield* scheduleTitle({
              sessionID,
              modelID: lastUser.model.modelID,
              providerID: lastUser.model.providerID,
              history: msgs,
            }).pipe(Effect.asVoid, Effect.forkChild)
            yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("session summary skipped", {
                  sessionID,
                  error: Cause.squash(cause),
                }),
              ),
            )
          }
          yield* handle.bindModelOperation(admitted.operation)
          const result = yield* handle.process(prepared)
          failureReason ??= handle.failureReason

          if (structured !== undefined) {
            handle.message.structured = structured
            handle.message.finish = handle.message.finish ?? "stop"
            yield* sessions.updateMessage(handle.message)
            return "break" as const
          }

          const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)
          if (finished && !handle.message.error) {
            // Surface any content-filter finish (e.g. Anthropic stop_reason:
            // refusal) as an error. These turns may have produced no visible
            // output at all — previously the session went idle silently — or
            // partial text that was cut off by the provider's filter.
            if (handle.message.finish === "content-filter") {
              handle.message.error = new SessionV1.ContentFilterError({
                message: "The response was blocked by the provider's content filter",
              }).toObject()
              yield* sessions.updateMessage(handle.message)
              yield* events.publish(Session.Event.Error, { sessionID, error: handle.message.error })
              return "break" as const
            }
            if (format.type === "json_schema") {
              handle.message.error = new SessionV1.StructuredOutputError({
                message: "Model did not produce structured output",
                retries: 0,
              }).toObject()
              yield* sessions.updateMessage(handle.message)
              return "break" as const
            }
          }

          if (result === "stop") return "break" as const
          if (result === "compact") {
            const mode = handle.compactionMode ?? "normal"
            yield* compaction.create({
              sessionID,
              agent: lastUser.agent,
              model: lastUser.model,
              auto: true,
              overflow: mode === "provider_overflow",
              capacityHistory:
                mode === "capacity_history" && handle.compactionSelection
                  ? { sourceAssistantMessageID: msg.id, selection: handle.compactionSelection }
                  : undefined,
            })
          }
          return "continue" as const
        }).pipe(
          Effect.ensuring(instruction.clear(handle.message.id)),
          Effect.onInterrupt(() => finalizeInterruptedAssistant),
          Effect.ensuring(
            LearningCommandRuntime.finalizeFutureAttentionClaims(events, {
              assistantMessageID: msg.id,
              observationCut: "live_presentation_finalized",
              time: Date.now(),
            }).pipe(Effect.uninterruptible),
          ),
        )
        if (outcome === "break") break
        if (outcome === "exhausted") {
          turnExhausted = true
          break
        }
        continue
      }

      if (titleWork) yield* Fiber.join(titleWork)
      yield* state.shared(sessionID, compaction.prune({ sessionID })).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("session pruning skipped", {
            sessionID,
            error: Cause.squash(cause),
          }),
        ),
      )
      if (turnExhausted) {
        const assistant = yield* sessions.findMessage(sessionID, (message) => message.info.role === "assistant")
        if (Option.isNone(assistant)) return { failureReason }
        return { message: assistant.value, failureReason }
      }
      return { message: yield* lastAssistant(sessionID), failureReason }
    })

    const runTurnLoop = Effect.fn("SessionPrompt.runTurnWork")(function* (sessionID: SessionID, turnID: Turn.ID) {
      const result = yield* runLoop(sessionID, turnID)
      if (!result.message || result.message.info.role === "user" || !result.message.info.error) {
        return { outcome: "completed", reason: "normal" } as const
      }
      return { outcome: "failed", reason: result.failureReason ?? "provider_failure" } as const
    })

    const shell: Interface["shell"] = Effect.fn("SessionPrompt.shell")((input: ShellInput) =>
      revert.withCleanAdmission(input.sessionID, () =>
        Effect.gen(function* () {
          const ready = yield* Latch.make()
          return yield* state.startShell(
            input.sessionID,
            lastAssistant(input.sessionID),
            shellImpl(input, ready),
            ready,
          )
        }),
      ),
    )

    return Service.of({
      start,
      startImportCopy,
      steer,
      activeTurn,
      listTurns,
      getTurn,
      awaitTurn,
      interruptTurn,
      startChild,
      awaitChild,
      shell,
      resolvePromptParts,
    })
  }),
)

const ModelRef = Schema.Struct({
  providerID: ProviderV2.ID,
  modelID: ModelV2.ID,
})

const LearnerParts = Schema.Array(
  Schema.Union([SessionV1.TextPartInput, SessionV1.FilePartInput, SessionV1.AgentPartInput]).annotate({
    discriminator: "type",
  }),
)

export const StartInput = Schema.Struct({
  sessionID: SessionID,
  turnID: Turn.ID,
  inputID: Turn.InputID,
  messageID: MessageID,
  model: Schema.optional(ModelRef),
  agent: Schema.optional(Schema.String),
  limits: Schema.optional(Turn.Limits),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  format: Schema.optional(SessionV1.Format),
  system: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  parts: LearnerParts,
  session: Schema.optional(
    Schema.Struct({
      parentID: Schema.optional(SessionID),
      title: Schema.optional(Schema.String),
      metadata: Schema.optional(Session.Metadata),
      permission: Schema.optional(Session.Info.fields.permission),
    }),
  ),
  fork: Schema.optional(
    Schema.Struct({
      sourceSessionID: SessionID,
      sourceEventSequence: Schema.Int,
      cutoffMessageID: Schema.optional(MessageID),
    }),
  ),
})
export type StartInput = Schema.Schema.Type<typeof StartInput>

export type ImportCopyStartInput = StartInput & {
  readonly importCopy: {
    readonly plan: Session.AdministrativeImportPlan
    readonly envelope: {
      readonly schemaVersion: 1
      readonly sourceFileFingerprint: string
      readonly sourceDatabaseID: string
      readonly sourceSessionID: SessionID
      readonly targetDatabaseID: string
      readonly targetSessionID: SessionID
      readonly copyRequestFingerprint: string
      readonly mappingVersion: 1
      readonly mappingFingerprint: string
      readonly messageCount: number
      readonly partCount: number
      readonly historyStartTime: number
      readonly historyFrontierTime: number
      readonly learnerPresentationTime: number
    }
    readonly verifySource: Effect.Effect<boolean>
    readonly verifyTargetIdentities: (
      tx: EventV2.Transaction,
      learnerPresentation: UserWithParts,
    ) => Effect.Effect<void, Turn.AdmissionConflictError | SessionDeletion.SessionIDRetiredError>
  }
}

export const SteerInput = Schema.Struct({
  sessionID: SessionID,
  expectedTurnID: Turn.ID,
  inputID: Turn.InputID,
  messageID: MessageID,
  model: Schema.optional(ModelRef),
  agent: Schema.optional(Schema.String),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  format: Schema.optional(SessionV1.Format),
  system: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  parts: LearnerParts,
})
export type SteerInput = Schema.Schema.Type<typeof SteerInput>

export const StartChildInput = Schema.Struct({
  childSessionID: SessionID,
  childTurnID: Turn.ID,
  childInputID: Turn.InputID,
  messageID: MessageID,
  parentSessionID: SessionID,
  parentTurnID: Turn.ID,
  parentTaskPartID: PartID,
  parentModelMessageID: MessageID,
  delegatedCapability: DelegatedCapability,
  depthLimit: Schema.Int,
  limits: Turn.Limits,
  model: ModelRef,
  agent: Schema.String,
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  format: Schema.optional(SessionV1.Format),
  system: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  parts: LearnerParts,
  session: Schema.Struct({
    title: Schema.optional(Schema.String),
    metadata: Schema.optional(Session.Metadata),
    permission: Schema.optional(Session.Info.fields.permission),
  }),
})
export type StartChildInput = Schema.Schema.Type<typeof StartChildInput>

export const AwaitChildInput = Schema.Struct({
  parentSessionID: SessionID,
  parentTurnID: Turn.ID,
  parentTaskPartID: PartID,
  childSessionID: SessionID,
  childTurnID: Turn.ID,
})
export type AwaitChildInput = Schema.Schema.Type<typeof AwaitChildInput>

export const PromptInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  model: Schema.optional(ModelRef),
  agent: Schema.optional(Schema.String),
  noReply: Schema.optional(Schema.Boolean),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)).annotate({
    description:
      "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
  }),
  format: Schema.optional(SessionV1.Format),
  system: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  parts: LearnerParts,
})
export type PromptInput = Schema.Schema.Type<typeof PromptInput>

export const ShellInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  agent: Schema.String,
  model: Schema.optional(ModelRef),
  command: Schema.String,
})
export type ShellInput = Schema.Schema.Type<typeof ShellInput>

/** @internal Exported for testing */
export function createStructuredOutputTool(input: {
  schema: Record<string, any>
  onSuccess: (output: unknown) => void
}): AITool {
  // Remove $schema property if present (not needed for tool input)
  const { $schema: _, ...toolSchema } = input.schema

  return tool({
    description: STRUCTURED_OUTPUT_DESCRIPTION,
    inputSchema: jsonSchema(toolSchema as JSONSchema7),
    async execute(args) {
      // AI SDK validates args against inputSchema before calling execute()
      input.onSuccess(args)
      return {
        output: "Structured output captured successfully.",
        title: "Structured Output",
        metadata: { valid: true },
      }
    },
    toModelOutput({ output }) {
      return {
        type: "text",
        value: output.output,
      }
    },
  })
}
export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [
    SessionStatus.node,
    Session.node,
    Agent.node,
    Provider.node,
    SessionProcessor.node,
    SessionCompaction.node,
    Plugin.node,
    Config.node,
    Permission.node,
    FSUtil.node,
    MCP.node,
    LSP.node,
    ToolRegistry.node,
    Truncate.node,
    Image.node,
    CrossSpawnSpawner.node,
    Instruction.node,
    SessionRunState.node,
    SessionTurnRecovery.node,
    SessionRevert.node,
    SessionSummary.node,
    SystemPrompt.node,
    LLM.node,
    EventV2Bridge.node,
    RuntimeFlags.node,
    Database.node,
    ContentRoot.node,
    MaterialMap.node,
    MaterialMap.tutorCurrentUseReaderNode,
  ],
})

export * as SessionPrompt from "./prompt"
