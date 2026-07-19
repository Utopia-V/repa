import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Image } from "@/image/image"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Cause, DateTime, Effect, Exit, Layer, Context, Scope, Schema } from "effect"
import * as Stream from "effect/Stream"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Snapshot } from "@/snapshot"
import { Session } from "./session"
import { LLM } from "./llm"
import { MessageV2 } from "./message-v2"
import { isOverflow } from "./overflow"
import { PartID } from "./schema"
import type { SessionID } from "./schema"
import { SessionRetry } from "./retry"
import { SessionStatus } from "./status"
import { SessionSummary } from "./summary"
import type { Provider } from "@/provider/provider"
import { Question } from "@/question"
import { errorMessage } from "@/util/error"
import { isRecord } from "@/util/record"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Database } from "@opencode-ai/core/database/database"
import { LLMEvent, ToolRuntime, Usage } from "@opencode-ai/llm"
import { LearningCommandRuntime } from "@/learning-command/runtime"
import { RepresentationCommandRuntime } from "@/learning-command/representation-runtime"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { isDeepStrictEqual } from "node:util"
import { isLearningCommandToolID } from "@/tool/learning-command"
import { normalizeCommand as normalizeLearningCommandInput } from "@/learning-command/input"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { Turn } from "@opencode-ai/schema/turn"
import { TurnEvent } from "@opencode-ai/schema/turn-event"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LLMNativeRuntime } from "./llm/native-runtime"

const DOOM_LOOP_THRESHOLD = 3
export type Result = "compact" | "stop" | "continue"
export type FailureReason = Extract<
  Turn.TerminalReason,
  "provider_failure" | "tool_runtime_failure" | "permission_failure" | "projection_failure" | "integrity_failure"
>

class ProcessorIntegrityFailure extends Error {}

export type RegisteredToolCall = Readonly<{
  turnID: Turn.ID
  inputID: Turn.InputID
  causalOccurrenceID?: Turn.ModelOperation["causalOccurrenceID"]
  partID: SessionV1.ToolPart["id"]
  callID: string
  emissionOrdinal: number
  sessionID: SessionID
  parentUserMessageID: SessionV1.Assistant["parentID"]
  assistantMessageID: SessionV1.Assistant["id"]
}>

export const ToolCallPreparation = Symbol("SessionProcessor.ToolCallPreparation")

export type ToolCallPreparation = (input: unknown, registration: RegisteredToolCall) => void | PromiseLike<void>

export interface Handle {
  readonly message: SessionV1.Assistant
  readonly failureReason?: FailureReason
  readonly updateToolCall: (
    toolCallID: string,
    update: (part: SessionV1.ToolPart) => SessionV1.ToolPart,
  ) => Effect.Effect<SessionV1.ToolPart | undefined>
  readonly completeToolCall: (
    toolCallID: string,
    output: {
      title: string
      metadata: Record<string, any>
      output: string
      attachments?: SessionV1.FilePart[]
    },
  ) => Effect.Effect<void>
  readonly failToolCall?: (toolCallID: string, error: unknown) => Effect.Effect<boolean>
  readonly registeredToolCall: (toolCallID: string) => RegisteredToolCall | undefined
  readonly bindModelOperation: (operation: Turn.ModelOperation) => Effect.Effect<void, Turn.Error>
  readonly process: (streamInput: LLM.StreamInput) => Effect.Effect<Result>
}

type Input = {
  assistantMessage: SessionV1.Assistant
  sessionID: SessionID
  model: Provider.Model
  /** Required for every interactive provider operation; omitted only by closed internal utilities. */
  turnID?: Turn.ID
}

export interface Interface {
  readonly create: (input: Input) => Effect.Effect<Handle>
}

type ToolCall = {
  partID: SessionV1.ToolPart["id"]
  callID: string
  messageID: SessionV1.ToolPart["messageID"]
  sessionID: SessionV1.ToolPart["sessionID"]
  name: string
  raw: string
  input?: Record<string, unknown>
  metadata?: SessionV1.ToolPart["metadata"]
  providerExecuted?: boolean
  finalized: boolean
  prepared: boolean
  admitted: boolean
  registration?: RegisteredToolCall
}

type LocalTool = LLM.StreamInput["tools"][string] & {
  [ToolCallPreparation]?: ToolCallPreparation
}

interface ProcessorContext extends Input {
  toolcalls: Record<string, ToolCall>
  shouldBreak: boolean
  snapshot: string | undefined
  blocked: boolean
  needsCompaction: boolean
  currentText: SessionV1.TextPart | undefined
  reasoningMap: Record<string, SessionV1.ReasoningPart>
}

type StreamEvent = LLMEvent

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionProcessor") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const session = yield* Session.Service
    const config = yield* Config.Service
    const snapshot = yield* Snapshot.Service
    const agents = yield* Agent.Service
    const llm = yield* LLM.Service
    const permission = yield* Permission.Service
    const plugin = yield* Plugin.Service
    const summary = yield* SessionSummary.Service
    const scope = yield* Scope.Scope
    const status = yield* SessionStatus.Service
    const image = yield* Image.Service
    const events = yield* EventV2Bridge.Service
    const database = yield* Database.Service

    const create = Effect.fn("SessionProcessor.create")(function* (input: Input) {
      // Capture the filesystem snapshot before the provider operation starts.
      // Tool effects are admitted later, after the emitted set is sealed.
      const initialSnapshot = yield* snapshot.track()
      const ctx: ProcessorContext = {
        assistantMessage: input.assistantMessage,
        sessionID: input.sessionID,
        model: input.model,
        toolcalls: {},
        shouldBreak: false,
        snapshot: initialSnapshot,
        blocked: false,
        needsCompaction: false,
        currentText: undefined,
        reasoningMap: {},
      }
      let aborted = false
      let emissionOrdinal = 0
      let candidateSetSealed = false
      let modelSettled = false
      let dispatchedToolCallID: string | undefined
      let modelOperation: Turn.ModelOperation | undefined
      let activeTools: LLM.StreamInput["tools"] = {}
      let toolController: AbortController | undefined
      let failureReason: FailureReason | undefined

      const classifyFailure = (error: unknown, fallback: FailureReason): FailureReason => {
        if (
          error instanceof ProcessorIntegrityFailure ||
          error instanceof Turn.IntegrityError ||
          error instanceof Turn.AdmissionConflictError ||
          error instanceof Turn.SourceUnavailableError
        ) {
          return "integrity_failure"
        }
        if (error instanceof PermissionV1.NotFoundError || error instanceof Question.NotFoundError) {
          return "permission_failure"
        }
        return fallback
      }

      const observeFailure = <A, E, R>(
        effect: Effect.Effect<A, E, R>,
        fallback: FailureReason,
      ): Effect.Effect<A, E, R> =>
        effect.pipe(
          Effect.catchCause((cause) => {
            failureReason ??= classifyFailure(Cause.squash(cause), fallback)
            return Effect.failCause(cause)
          }),
        )

      const parse = (e: unknown) =>
        MessageV2.fromError(e, {
          providerID: input.model.providerID,
          aborted,
        })

      const settleToolCall = Effect.fn("SessionProcessor.settleToolCall")(function* (toolCallID: string) {
        delete ctx.toolcalls[toolCallID]
      })

      const readToolCall = Effect.fn("SessionProcessor.readToolCall")(function* (toolCallID: string) {
        const call = ctx.toolcalls[toolCallID]
        if (!call) return undefined
        const part = yield* session.getPart({
          partID: call.partID,
          messageID: call.messageID,
          sessionID: call.sessionID,
        })
        if (!part || part.type !== "tool") {
          if (call.prepared) delete ctx.toolcalls[toolCallID]
          return undefined
        }
        return { call, part }
      })

      const reserveToolCall = (input: { id: string; name: string; providerExecuted?: boolean }) => {
        if (!input.id.trim()) throw new ProcessorIntegrityFailure("Tool call ID is required")
        const existing = ctx.toolcalls[input.id]
        if (candidateSetSealed && !input.providerExecuted && !existing?.providerExecuted) {
          throw new ProcessorIntegrityFailure(
            `Local tool callback arrived after the candidate set was sealed: ${input.id}`,
          )
        }
        if (existing) {
          if (existing.name !== input.name) {
            throw new ProcessorIntegrityFailure(
              `Tool call ${input.id} changed tool from ${existing.name} to ${input.name}`,
            )
          }
          return existing
        }
        if (candidateSetSealed)
          throw new ProcessorIntegrityFailure(`Tool call arrived after the candidate set was sealed: ${input.id}`)
        const call: ToolCall = {
          partID: PartID.ascending(),
          callID: input.id,
          messageID: ctx.assistantMessage.id,
          sessionID: ctx.assistantMessage.sessionID,
          name: input.name,
          raw: "",
          finalized: false,
          prepared: false,
          admitted: false,
        }
        ctx.toolcalls[input.id] = call
        return call
      }

      const registerToolCall = (input: { id: string; name: string }) => {
        const call = reserveToolCall(input)
        if (call.registration) return call.registration
        if (!modelOperation)
          throw new ProcessorIntegrityFailure(`Tool call ${input.id} arrived before exact model-operation binding`)
        call.registration = Object.freeze({
          turnID: modelOperation.turnID,
          inputID: modelOperation.inputID,
          ...(modelOperation.causalOccurrenceID ? { causalOccurrenceID: modelOperation.causalOccurrenceID } : {}),
          partID: call.partID,
          callID: input.id,
          emissionOrdinal: emissionOrdinal++,
          sessionID: call.sessionID,
          parentUserMessageID: ctx.assistantMessage.parentID,
          assistantMessageID: ctx.assistantMessage.id,
        } satisfies RegisteredToolCall)
        return call.registration
      }

      const registeredToolCall = (toolCallID: string) => ctx.toolcalls[toolCallID]?.registration

      const bindModelOperation = Effect.fn("SessionProcessor.bindModelOperation")(function* (
        operation: Turn.ModelOperation,
      ) {
        if (
          !input.turnID ||
          operation.turnID !== input.turnID ||
          operation.sessionID !== input.sessionID ||
          operation.assistantMessageID !== input.assistantMessage.id
        ) {
          return yield* new Turn.IntegrityError({
            turnID: input.turnID ?? operation.turnID,
            reason: "Processor model-operation binding does not match its exact interactive identity",
          })
        }
        if (modelOperation && !isDeepStrictEqual(modelOperation, operation)) {
          return yield* new Turn.AdmissionConflictError({ turnID: operation.turnID })
        }
        modelOperation = operation
      })

      const updateToolCall = Effect.fn("SessionProcessor.updateToolCall")(function* (
        toolCallID: string,
        update: (part: SessionV1.ToolPart) => SessionV1.ToolPart,
      ) {
        const match = yield* readToolCall(toolCallID)
        if (!match) return undefined
        const next = update(match.part)
        if (next === match.part) return match.part
        const part = yield* session.updatePart(next)
        ctx.toolcalls[toolCallID] = {
          ...match.call,
          partID: part.id,
          messageID: part.messageID,
          sessionID: part.sessionID,
        }
        return part
      })

      const completeToolCall = Effect.fn("SessionProcessor.completeToolCall")(function* (
        toolCallID: string,
        output: {
          title: string
          metadata: Record<string, any>
          output: string
          attachments?: SessionV1.FilePart[]
        },
      ) {
        const match = yield* readToolCall(toolCallID)
        if (!match) return
        if (
          isLearningCommandToolID(match.part.tool) &&
          (match.part.state.status === "completed" || match.part.state.status === "error")
        ) {
          if (
            match.part.state.status === "completed" &&
            isDeepStrictEqual(
              {
                title: match.part.state.title,
                metadata: match.part.state.metadata,
                output: match.part.state.output,
                attachments: match.part.state.attachments,
              },
              output,
            )
          ) {
            yield* settleToolCall(toolCallID)
            return
          }
          return yield* learningInvocationConflict(match.part)
        }
        if (match.part.state.status !== "running") return
        yield* session.updatePart({
          ...match.part,
          state: {
            status: "completed",
            input: match.part.state.input,
            output: output.output,
            metadata: output.metadata,
            title: output.title,
            time: { start: match.part.state.time.start, end: Date.now() },
            attachments: output.attachments,
          },
        })
        yield* settleToolCall(toolCallID)
      })

      const failToolCall = Effect.fn("SessionProcessor.failToolCall")(function* (toolCallID: string, error: unknown) {
        const match = yield* readToolCall(toolCallID)
        if (!match) return false
        if (isLearningCommandToolID(match.part.tool)) {
          if (match.part.state.status === "completed" || match.part.state.status === "error") {
            return yield* learningInvocationConflict(match.part)
          }
          if (!match.call.registration) return false
          const interrupted = yield* interruptLearningInvocation(events, match.part.tool, match.call.registration)
          if (!interrupted) return false
          yield* settleToolCall(toolCallID)
          return true
        }
        if (match.part.state.status !== "running") return false
        yield* session.updatePart({
          ...match.part,
          state: {
            status: "error",
            input: match.part.state.input,
            error: errorMessage(error),
            // Keep metadata streamed while running so failures retain progress detail (e.g. execute's child calls).
            metadata: match.part.state.metadata,
            time: { start: match.part.state.time.start, end: Date.now() },
          },
        })
        if (error instanceof PermissionV1.RejectedError || error instanceof Question.RejectedError) {
          ctx.blocked = ctx.shouldBreak
        }
        yield* settleToolCall(toolCallID)
        return true
      })

      const finishReasoning = Effect.fn("SessionProcessor.finishReasoning")(function* (reasoningID: string) {
        if (!(reasoningID in ctx.reasoningMap)) return
        // oxlint-disable-next-line no-self-assign -- reactivity trigger
        ctx.reasoningMap[reasoningID].text = ctx.reasoningMap[reasoningID].text
        ctx.reasoningMap[reasoningID].time = { ...ctx.reasoningMap[reasoningID].time, end: Date.now() }
        yield* session.updatePart(ctx.reasoningMap[reasoningID])
        delete ctx.reasoningMap[reasoningID]
      })

      const ensureToolCall = Effect.fn("SessionProcessor.ensureToolCall")(function* (input: {
        id: string
        name: string
        providerExecuted?: boolean
      }) {
        const call = reserveToolCall(input)
        if (call.prepared) {
          const existing = yield* readToolCall(input.id)
          if (!existing) throw new ProcessorIntegrityFailure(`Prepared tool call is missing its Part: ${input.id}`)
          if (!input.providerExecuted || existing.part.metadata?.providerExecuted) return existing
          const part = yield* session.updatePart({
            ...existing.part,
            metadata: { ...existing.part.metadata, providerExecuted: true },
          })
          ctx.toolcalls[input.id] = {
            ...existing.call,
            partID: part.id,
            messageID: part.messageID,
            sessionID: part.sessionID,
          }
          return { call: ctx.toolcalls[input.id], part }
        }
        const result = yield* session
          .updatePart({
            id: call.partID,
            messageID: call.messageID,
            sessionID: call.sessionID,
            type: "tool",
            tool: input.name,
            callID: input.id,
            state: { status: "pending", input: call.input ?? {}, raw: call.raw },
            metadata: input.providerExecuted ? { providerExecuted: true } : undefined,
          } satisfies SessionV1.ToolPart)
          .pipe(Effect.exit)
        if (Exit.isFailure(result)) return yield* Effect.failCause(result.cause)
        call.prepared = true
        return { call, part: result.value }
      })

      const confirmPreparedToolCall = Effect.fn("SessionProcessor.confirmPreparedToolCall")(function* (
        toolCallID: string,
      ) {
        const call = ctx.toolcalls[toolCallID]
        if (!call) throw new ProcessorIntegrityFailure(`Unregistered tool call: ${toolCallID}`)
        const part = yield* session.getPart({
          partID: call.partID,
          messageID: call.messageID,
          sessionID: call.sessionID,
        })
        if (!part || part.type !== "tool" || part.callID !== toolCallID || part.tool !== call.name) {
          throw new ProcessorIntegrityFailure(`Tool call preparation did not persist the reserved Part: ${toolCallID}`)
        }
        call.prepared = true
      })

      const preparation = (tool: LLM.StreamInput["tools"][string]) => (tool as LocalTool)[ToolCallPreparation]

      const isFilePart = (value: unknown): value is SessionV1.FilePart => Schema.is(SessionV1.FilePart)(value)

      const toolResultOutput = (
        value: Extract<StreamEvent, { type: "tool-result" }>,
      ): { title: string; metadata: Record<string, any>; output: string; attachments?: SessionV1.FilePart[] } => {
        if (isRecord(value.result.value) && typeof value.result.value.output === "string") {
          return {
            title: typeof value.result.value.title === "string" ? value.result.value.title : value.name,
            metadata: isRecord(value.result.value.metadata) ? value.result.value.metadata : {},
            output: value.result.value.output,
            attachments: Array.isArray(value.result.value.attachments)
              ? value.result.value.attachments.filter(isFilePart)
              : undefined,
          }
        }
        return {
          title: value.name,
          metadata: value.result.type === "json" && isRecord(value.result.value) ? value.result.value : {},
          output:
            typeof value.result.value === "string" ? value.result.value : (JSON.stringify(value.result.value) ?? ""),
        }
      }

      const canonicalToolInput = (name: string, value: unknown): Record<string, unknown> => {
        const input = isRecord(value) ? value : { value }
        return isLearningCommandToolID(name) ? normalizeLearningCommandInput(name, input) : input
      }

      const checkDoomLoop = Effect.fn("SessionProcessor.checkDoomLoop")(function* (
        name: string,
        input: Record<string, unknown>,
      ) {
        const parts = yield* MessageV2.parts(ctx.assistantMessage.id).pipe(
          Effect.provideService(Database.Service, database),
        )
        const recentParts = parts.slice(-DOOM_LOOP_THRESHOLD)
        if (
          recentParts.length !== DOOM_LOOP_THRESHOLD ||
          !recentParts.every(
            (part) =>
              part.type === "tool" &&
              part.tool === name &&
              part.state.status !== "pending" &&
              JSON.stringify(part.state.input) === JSON.stringify(input),
          )
        ) {
          return
        }

        const agent = yield* agents.get(ctx.assistantMessage.agent)
        if (!agent) throw new Error(`Agent not found: "${ctx.assistantMessage.agent}"`)
        yield* permission.ask({
          permission: "doom_loop",
          patterns: [name],
          sessionID: ctx.assistantMessage.sessionID,
          metadata: { tool: name, input },
          always: [name],
          ruleset: agent.permission,
        })
      })

      const localToolCalls = () =>
        Object.values(ctx.toolcalls)
          .filter((call) => !call.providerExecuted)
          .toSorted(
            (a, b) => (a.registration?.emissionOrdinal ?? Infinity) - (b.registration?.emissionOrdinal ?? Infinity),
          )

      const sealAndSettleModel = Effect.fn("SessionProcessor.sealAndSettleModel")(function* (
        state: "completed" | "failed" | "interrupted",
        allowIncomplete: boolean,
      ) {
        if (modelSettled) return
        if (!input.turnID)
          throw new ProcessorIntegrityFailure(
            `Interactive Assistant operation has no exact Turn: ${ctx.assistantMessage.id}`,
          )

        const calls = localToolCalls()
        for (const call of calls) {
          if (!call.finalized && !allowIncomplete) {
            throw new ProcessorIntegrityFailure(
              `Provider completed before tool call ${call.name}/${call.partID} was finalized`,
            )
          }
          if (!call.registration) registerToolCall({ id: call.callID, name: call.name })
          call.input ??= {}
          call.raw ||= JSON.stringify(call.input)
        }
        const time = Date.now()
        const candidates = calls.map((call) => ({
          partID: call.partID,
          callID: call.callID,
          tool: call.name,
          envelope: {
            input: call.input ?? {},
            ...(call.finalized ? {} : { incomplete: true, raw: call.raw }),
          },
        }))
        yield* events.transaction<undefined, EventV2.Definition>((tx) =>
          Effect.gen(function* () {
            const turn = yield* TurnLifecycle.info(tx, input.turnID!)
            const operation = yield* TurnLifecycle.modelOperation(tx, {
              turnID: input.turnID!,
              sessionID: input.sessionID,
              assistantMessageID: input.assistantMessage.id,
            })
            const timestamp = DateTime.makeUnsafe(
              Math.max(time, DateTime.toEpochMillis(turn.causalTime), DateTime.toEpochMillis(operation.timeAdmitted)),
            )
            const sessionEvents: EventV2.PreparedEvent<typeof SessionV1.Event.PartUpdated>[] = calls.map((call) => ({
              definition: SessionV1.Event.PartUpdated,
              data: {
                sessionID: call.sessionID,
                part: {
                  id: call.partID,
                  messageID: call.messageID,
                  sessionID: call.sessionID,
                  type: "tool" as const,
                  tool: call.name,
                  callID: call.callID,
                  state: { status: "pending" as const, input: call.input ?? {}, raw: call.raw },
                  metadata: call.metadata,
                },
                time,
              },
            }))
            return {
              result: undefined,
              events: [
                ...sessionEvents,
                {
                  definition: TurnEvent.CandidateSetSealed,
                  data: {
                    sessionID: input.sessionID,
                    turnID: input.turnID!,
                    assistantMessageID: input.assistantMessage.id,
                    count: candidates.length,
                    timestamp,
                  },
                  options: {
                    commit: () =>
                      TurnLifecycle.sealCandidateSet(tx, {
                        turnID: input.turnID!,
                        sessionID: input.sessionID,
                        assistantMessageID: input.assistantMessage.id,
                        candidates,
                        timeSealed: time,
                      }).pipe(Effect.asVoid, Effect.orDie),
                  },
                },
                {
                  definition: TurnEvent.ModelSettled,
                  data: {
                    sessionID: input.sessionID,
                    turnID: input.turnID!,
                    assistantMessageID: input.assistantMessage.id,
                    state,
                    timestamp,
                  },
                  options: {
                    commit: () =>
                      TurnLifecycle.settleModel(tx, {
                        turnID: input.turnID!,
                        assistantMessageID: input.assistantMessage.id,
                        state,
                        time,
                      }).pipe(Effect.asVoid, Effect.orDie),
                  },
                },
              ],
            }
          }).pipe(Effect.orDie),
        )
        for (const call of calls) call.prepared = true
        candidateSetSealed = true
        modelSettled = true
      })

      const handleEvent = Effect.fnUntraced(function* (value: StreamEvent) {
        switch (value.type) {
          case "reasoning-start":
            if (value.id in ctx.reasoningMap) return
            ctx.reasoningMap[value.id] = {
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.assistantMessage.sessionID,
              type: "reasoning",
              text: "",
              time: { start: Date.now() },
              metadata: value.providerMetadata,
            }
            yield* session.updatePart(ctx.reasoningMap[value.id])
            return

          case "reasoning-delta":
            // Match dev: silently drop orphan deltas (no preceding reasoning-start).
            if (!(value.id in ctx.reasoningMap)) return
            ctx.reasoningMap[value.id].text += value.text
            if (value.providerMetadata) ctx.reasoningMap[value.id].metadata = value.providerMetadata
            yield* session.updatePartDelta({
              sessionID: ctx.reasoningMap[value.id].sessionID,
              messageID: ctx.reasoningMap[value.id].messageID,
              partID: ctx.reasoningMap[value.id].id,
              field: "text",
              delta: value.text,
            })
            return

          case "reasoning-end":
            if (value.providerMetadata && value.id in ctx.reasoningMap) {
              ctx.reasoningMap[value.id].metadata = value.providerMetadata
            }
            yield* finishReasoning(value.id)
            return

          case "tool-input-start":
            if (ctx.assistantMessage.summary) {
              throw new ProcessorIntegrityFailure(`Tool call not allowed while generating summary: ${value.name}`)
            }
            {
              const call = reserveToolCall(value)
              if (!call.finalized) call.raw = ""
            }
            return

          case "tool-input-delta": {
            const call = reserveToolCall(value)
            if (!call.finalized) call.raw += value.text
            return
          }

          case "tool-input-end": {
            reserveToolCall(value)
            return
          }

          case "tool-call": {
            if (ctx.assistantMessage.summary) {
              throw new ProcessorIntegrityFailure(`Tool call not allowed while generating summary: ${value.name}`)
            }
            const call = reserveToolCall(value)
            const input = canonicalToolInput(value.name, value.input)
            if (call.finalized) {
              if (
                call.providerExecuted !== (value.providerExecuted === true) ||
                !isDeepStrictEqual(call.input, input)
              ) {
                throw new ProcessorIntegrityFailure(`Tool call ${value.id} changed after final emission`)
              }
              if (value.providerMetadata) call.metadata = value.providerMetadata
              return
            }
            call.input = input
            call.raw = isLearningCommandToolID(value.name) || !call.raw ? JSON.stringify(input) : call.raw
            call.metadata = value.providerMetadata
            call.providerExecuted = value.providerExecuted === true
            call.finalized = true

            if (!call.providerExecuted) {
              registerToolCall(value)
              return
            }

            yield* ensureToolCall({ ...value, providerExecuted: true })
            yield* updateToolCall(value.id, (match) => {
              if (match.state.status === "completed" || match.state.status === "error") return match
              return {
                ...match,
                tool: value.name,
                state:
                  match.state.status === "running"
                    ? { ...match.state, input }
                    : {
                        status: "running",
                        input,
                        time: { start: Date.now() },
                      },
                metadata: match.metadata?.providerExecuted
                  ? { ...value.providerMetadata, providerExecuted: true }
                  : value.providerMetadata,
              }
            })
            yield* checkDoomLoop(value.name, input)
            return
          }

          case "tool-result": {
            const buffered = ctx.toolcalls[value.id]
            if (!value.providerExecuted && !buffered?.admitted && dispatchedToolCallID !== value.id) {
              throw new ProcessorIntegrityFailure(
                `Local tool result arrived before FIFO invocation admission: ${value.id}`,
              )
            }
            const toolCall = yield* readToolCall(value.id)
            if (!toolCall && value.result.type === "error") return
            if (value.result.type === "error") {
              yield* failToolCall(value.id, value.result.value)
              return
            }
            const rawOutput = toolResultOutput(value)
            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =>
              attachment.mime.startsWith("image/")
                ? image.normalize(attachment).pipe(
                    Effect.catchIf(
                      (error) => error instanceof Image.ResizerUnavailableError,
                      () => Effect.succeed(attachment),
                    ),
                    Effect.exit,
                  )
                : Effect.succeed(Exit.succeed<SessionV1.FilePart>(attachment)),
            )
            const omitted = normalized.filter(Exit.isFailure).length
            const attachments = normalized.filter(Exit.isSuccess).map((item) => item.value)
            const output = {
              ...rawOutput,
              output:
                omitted === 0
                  ? rawOutput.output
                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? "" : "s"} omitted: could not be resized below the image size limit.]`,
              attachments: attachments.length ? attachments : undefined,
            }
            yield* completeToolCall(value.id, output)
            return
          }

          case "tool-error": {
            const buffered = ctx.toolcalls[value.id]
            if (!buffered?.admitted && !buffered?.providerExecuted && dispatchedToolCallID !== value.id) {
              throw new ProcessorIntegrityFailure(
                `Local tool error arrived before FIFO invocation admission: ${value.id}`,
              )
            }
            yield* failToolCall(value.id, value.error ?? new Error(value.message))
            return
          }

          case "provider-error":
            throw new Error(value.message)

          case "step-start":
            if (!ctx.snapshot) ctx.snapshot = yield* snapshot.track()
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.sessionID,
              snapshot: ctx.snapshot,
              type: "step-start",
            })
            return

          case "step-finish": {
            const completedSnapshot = yield* snapshot.track()
            yield* Effect.forEach(Object.keys(ctx.reasoningMap), finishReasoning)
            const usage = Session.getUsage({
              model: ctx.model,
              usage: value.usage ?? new Usage({}),
              metadata: value.providerMetadata,
            })
            ctx.assistantMessage.finish = value.reason
            ctx.assistantMessage.cost += usage.cost
            ctx.assistantMessage.tokens = usage.tokens
            yield* session.updatePart({
              id: PartID.ascending(),
              reason: value.reason,
              snapshot: completedSnapshot,
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.assistantMessage.sessionID,
              type: "step-finish",
              tokens: usage.tokens,
              cost: usage.cost,
            })
            yield* session.updateMessage(ctx.assistantMessage)
            if (ctx.snapshot) {
              const patch = yield* snapshot.patch(ctx.snapshot)
              if (patch.files.length) {
                yield* session.updatePart({
                  id: PartID.ascending(),
                  messageID: ctx.assistantMessage.id,
                  sessionID: ctx.sessionID,
                  type: "patch",
                  hash: patch.hash,
                  files: patch.files,
                })
              }
              ctx.snapshot = undefined
            }
            yield* summary
              .summarize({
                sessionID: ctx.sessionID,
                messageID: ctx.assistantMessage.parentID,
              })
              .pipe(Effect.ignore, Effect.forkIn(scope))
            if (
              !ctx.assistantMessage.summary &&
              isOverflow({ cfg: yield* config.get(), tokens: usage.tokens, model: ctx.model })
            ) {
              ctx.needsCompaction = true
            }
            return
          }

          case "text-start":
            ctx.currentText = {
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.assistantMessage.sessionID,
              type: "text",
              text: "",
              time: { start: Date.now() },
              metadata: value.providerMetadata,
            }
            yield* session.updatePart(ctx.currentText)
            return

          case "text-delta":
            if (!ctx.currentText) return
            ctx.currentText.text += value.text
            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata
            yield* session.updatePartDelta({
              sessionID: ctx.currentText.sessionID,
              messageID: ctx.currentText.messageID,
              partID: ctx.currentText.id,
              field: "text",
              delta: value.text,
            })
            return

          case "text-end":
            if (!ctx.currentText) return
            // oxlint-disable-next-line no-self-assign -- reactivity trigger
            ctx.currentText.text = ctx.currentText.text
            ctx.currentText.text = (yield* plugin.trigger(
              "experimental.text.complete",
              {
                sessionID: ctx.sessionID,
                messageID: ctx.assistantMessage.id,
                partID: ctx.currentText.id,
              },
              { text: ctx.currentText.text },
            )).text
            {
              const end = Date.now()
              ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }
            }
            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata
            yield* session.updatePart(ctx.currentText)
            ctx.currentText = undefined
            return

          case "finish":
            return
        }
      })

      const markToolFailure = Effect.fn("SessionProcessor.markToolFailure")(function* (call: ToolCall, error: unknown) {
        if (yield* failToolCall(call.callID, error)) return
        const match = yield* readToolCall(call.callID)
        if (!match) return
        if (match.part.state.status === "completed" || match.part.state.status === "error") {
          yield* settleToolCall(call.callID)
          return
        }
        const end = Date.now()
        yield* session.updatePart({
          ...match.part,
          state: {
            status: "error",
            input: match.part.state.input,
            error: errorMessage(error),
            time: { start: match.part.state.status === "running" ? match.part.state.time.start : end, end },
          },
        })
        yield* settleToolCall(call.callID)
      })

      const settleInvocation = Effect.fn("SessionProcessor.settleInvocation")(function* (
        call: ToolCall,
        state: "completed" | "failed" | "interrupted",
      ) {
        if (!input.turnID || !call.admitted) return
        yield* events.transaction<Turn.ToolInvocation | undefined, EventV2.Definition>((tx) =>
          Effect.gen(function* () {
            const before = yield* TurnLifecycle.invocation(tx, { turnID: input.turnID!, partID: call.partID })
            if (!before || before.state !== "running") return { result: before }
            const invocation = yield* TurnLifecycle.settleTool(tx, {
              turnID: input.turnID!,
              partID: call.partID,
              state,
              time: Date.now(),
            })
            return {
              result: invocation,
              event: {
                definition: TurnEvent.ToolSettled,
                data: {
                  sessionID: input.sessionID,
                  turnID: input.turnID!,
                  partID: call.partID,
                  state,
                  timestamp: invocation.timeSettled ?? invocation.timeAdmitted,
                },
              },
            }
          }).pipe(Effect.orDie),
        )
      })

      const notStartedPart = (
        call: ToolCall,
        state: "not_started_limit" | "not_started_turn_exhausted",
        time: number,
      ): SessionV1.ToolPart => ({
        id: call.partID,
        messageID: call.messageID,
        sessionID: call.sessionID,
        type: "tool",
        tool: call.name,
        callID: call.callID,
        metadata: { ...call.metadata, turnCandidateDisposition: state },
        state: {
          status: "error",
          input: call.input ?? {},
          error:
            state === "not_started_limit"
              ? "Tool not started: this Turn's tool budget is exhausted"
              : "Tool not started: an earlier sibling exhausted the Turn",
          metadata: { turnID: input.turnID!, disposition: state, notStarted: true },
          time: { start: time, end: time },
        },
      })

      const admitCandidate = Effect.fn("SessionProcessor.admitCandidate")(function* (call: ToolCall) {
        if (!input.turnID)
          throw new ProcessorIntegrityFailure(`Interactive tool candidate has no exact Turn: ${call.callID}`)
        const attempted = Date.now()
        const committed = yield* events.transaction<TurnLifecycle.ToolAdmissionResult, EventV2.Definition, Turn.Error>(
          (tx) =>
            Effect.gen(function* () {
              const admission = yield* TurnLifecycle.admitTool(tx, {
                turnID: input.turnID!,
                sessionID: input.sessionID,
                assistantMessageID: input.assistantMessage.id,
                partID: call.partID,
                timeAdmitted: attempted,
              }).pipe(Effect.orDie)
              if (admission.replay) return { result: admission }
              if (admission.type === "admitted") {
                const candidate = yield* TurnLifecycle.candidate(tx, {
                  turnID: input.turnID!,
                  partID: call.partID,
                })
                const timestamp = DateTime.makeUnsafe(DateTime.toEpochMillis(admission.invocation.timeAdmitted))
                return {
                  result: admission,
                  events: [
                    {
                      definition: TurnEvent.CandidateDisposition,
                      data: {
                        sessionID: input.sessionID,
                        turnID: input.turnID!,
                        candidate,
                        timestamp,
                      },
                    },
                    {
                      definition: TurnEvent.ToolAdmitted,
                      data: {
                        sessionID: input.sessionID,
                        turnID: input.turnID!,
                        invocation: admission.invocation,
                        timestamp,
                      },
                    },
                  ],
                }
              }
              if (admission.candidate.state !== "not_started_limit" || !admission.candidate.timeTerminal) {
                return yield* Effect.die(`New tool exhaustion produced an invalid disposition: ${call.callID}`)
              }

              const siblings = localToolCalls()
              const trigger = siblings.findIndex((item) => item.partID === call.partID)
              if (trigger < 0)
                return yield* Effect.die(`Exhaustion trigger is absent from the sealed set: ${call.callID}`)
              const time = DateTime.toEpochMillis(admission.candidate.timeTerminal)
              const remaining = siblings.slice(trigger)
              const dispositions = yield* Effect.forEach(remaining, (item) =>
                TurnLifecycle.candidate(tx, { turnID: input.turnID!, partID: item.partID }),
              )
              if (!admission.turn?.terminal) {
                return yield* Effect.die(`Tool exhaustion did not terminalize its Turn: ${call.callID}`)
              }
              return {
                result: admission,
                events: [
                  ...remaining.map((item, index) => {
                    const state = index === 0 ? "not_started_limit" : "not_started_turn_exhausted"
                    return {
                      definition: SessionV1.Event.PartUpdated,
                      data: {
                        sessionID: item.sessionID,
                        part: notStartedPart(item, state, time),
                        time,
                      },
                    }
                  }),
                  ...dispositions.map((candidate) => ({
                    definition: TurnEvent.CandidateDisposition,
                    data: {
                      sessionID: input.sessionID,
                      turnID: input.turnID!,
                      candidate,
                      timestamp: candidate.timeTerminal!,
                    },
                  })),
                  {
                    definition: TurnEvent.Terminal,
                    data: {
                      sessionID: input.sessionID,
                      turnID: input.turnID!,
                      terminal: admission.turn.terminal,
                      timestamp: admission.turn.terminal.time,
                    },
                  },
                ],
              }
            }),
        )
        return committed.result
      })

      const prepareAdmittedCall = Effect.fn("SessionProcessor.prepareAdmittedCall")(function* (call: ToolCall) {
        const item = activeTools[call.name]
        const prepare = item ? preparation(item) : undefined
        if (prepare) {
          yield* Effect.tryPromise({
            try: () => Promise.resolve(prepare(call.input ?? {}, call.registration!)),
            catch: (error) => error,
          })
          yield* confirmPreparedToolCall(call.callID)
        }
        if (!isLearningCommandToolID(call.name)) {
          yield* updateToolCall(call.callID, (part) => {
            if (part.state.status !== "pending") return part
            return {
              ...part,
              state: {
                status: "running",
                input: call.input ?? {},
                time: { start: Date.now() },
              },
            }
          })
        }
        const match = yield* readToolCall(call.callID)
        if (!match)
          throw new ProcessorIntegrityFailure(`Admitted tool call lost its Part during preparation: ${call.callID}`)
        return match.part
      })

      const revalidateToolFrontier = Effect.fn("SessionProcessor.revalidateToolFrontier")(function* (call: ToolCall) {
        const invocation = yield* database.db.transaction((tx) =>
          Effect.gen(function* () {
            const frontier = yield* LearningFrontier.read(tx)
            return yield* TurnLifecycle.consumeToolFrontier(tx, { partID: call.partID, frontier })
          }),
        )
        if (!invocation || invocation.state !== "running") {
          return yield* new Turn.IntegrityError({
            turnID: input.turnID!,
            reason: `Admitted tool invocation became unavailable before execution: ${call.callID}`,
          })
        }
        return invocation
      })

      const dispatchCandidate = Effect.fn("SessionProcessor.dispatchCandidate")(function* (
        call: ToolCall,
        tools: ReturnType<typeof LLMNativeRuntime.nativeTools>,
      ) {
        const admission = yield* admitCandidate(call)
        if (admission.type === "not_started") {
          yield* settleToolCall(call.callID)
          return
        }
        if (admission.replay) {
          if (admission.invocation.state === "running") {
            throw new ProcessorIntegrityFailure(
              `Running tool invocation replay cannot redispatch effect: ${call.callID}`,
            )
          }
          yield* settleToolCall(call.callID)
          return
        }

        call.admitted = true
        yield* observeFailure(revalidateToolFrontier(call), "integrity_failure")
        const prepared = yield* prepareAdmittedCall(call).pipe(Effect.exit)
        if (Exit.isFailure(prepared)) {
          yield* markToolFailure(call, Cause.squash(prepared.cause))
          yield* settleInvocation(call, "failed")
          return
        }
        if (prepared.value.state.status === "completed" || prepared.value.state.status === "error") {
          yield* settleInvocation(call, prepared.value.state.status === "completed" ? "completed" : "failed")
          yield* settleToolCall(call.callID)
          return
        }
        const doom = yield* checkDoomLoop(call.name, call.input ?? {}).pipe(Effect.exit)
        if (Exit.isFailure(doom)) {
          yield* markToolFailure(call, Cause.squash(doom.cause))
          yield* settleInvocation(call, "failed")
          return
        }
        yield* observeFailure(revalidateToolFrontier(call), "integrity_failure")
        const dispatched = yield* observeFailure(
          ToolRuntime.dispatch(tools, LLMEvent.toolCall({ id: call.callID, name: call.name, input: call.input ?? {} })),
          "tool_runtime_failure",
        ).pipe(Effect.exit)
        if (Exit.isFailure(dispatched)) {
          if (Cause.hasInterrupts(dispatched.cause)) return yield* Effect.failCause(dispatched.cause)
          yield* markToolFailure(call, Cause.squash(dispatched.cause))
          yield* settleInvocation(call, "failed")
          return yield* Effect.failCause(dispatched.cause)
        }

        dispatchedToolCallID = call.callID
        const projected = yield* observeFailure(
          Effect.forEach(dispatched.value.events, handleEvent, { discard: true }),
          "projection_failure",
        ).pipe(Effect.ensuring(Effect.sync(() => (dispatchedToolCallID = undefined))), Effect.exit)
        if (Exit.isFailure(projected)) {
          if (Cause.hasInterrupts(projected.cause)) return yield* Effect.failCause(projected.cause)
          yield* markToolFailure(call, Cause.squash(projected.cause))
          yield* settleInvocation(call, "failed")
          return yield* Effect.failCause(projected.cause)
        }
        yield* settleInvocation(call, dispatched.value.result.type === "error" ? "failed" : "completed")
      })

      const drainToolCandidates = Effect.fn("SessionProcessor.drainToolCandidates")(function* (
        messages: LLM.StreamInput["messages"],
        abort: AbortSignal,
      ) {
        const tools = LLMNativeRuntime.nativeTools(activeTools, { messages, abort })
        for (const call of localToolCalls()) {
          if (!call.finalized) continue
          yield* dispatchCandidate(call, tools)
        }
      })

      const cleanup = Effect.fn("SessionProcessor.cleanup")(function* () {
        toolController?.abort()
        toolController = undefined
        const terminalParts: SessionV1.Part[] = []
        const interruptedCalls: ToolCall[] = []
        if (ctx.snapshot) {
          const patch = yield* snapshot.patch(ctx.snapshot)
          if (patch.files.length) {
            terminalParts.push({
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.sessionID,
              type: "patch",
              hash: patch.hash,
              files: patch.files,
            })
          }
          ctx.snapshot = undefined
        }

        if (ctx.currentText) {
          const end = Date.now()
          ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }
          terminalParts.push(ctx.currentText)
          ctx.currentText = undefined
        }

        for (const part of Object.values(ctx.reasoningMap)) {
          const end = Date.now()
          terminalParts.push({
            ...part,
            time: { start: part.time.start ?? end, end },
          })
        }
        ctx.reasoningMap = {}

        for (const toolCallID of Object.keys(ctx.toolcalls)) {
          const call = ctx.toolcalls[toolCallID]
          const match =
            (yield* readToolCall(toolCallID)) ??
            (call.providerExecuted
              ? yield* ensureToolCall({
                  id: toolCallID,
                  name: call.name,
                  providerExecuted: true,
                })
              : undefined)
          if (!match) continue
          const part = match.part
          if (part.state.status === "completed" || part.state.status === "error") {
            yield* settleInvocation(call, part.state.status === "completed" ? "completed" : "failed")
            yield* settleToolCall(toolCallID)
            continue
          }
          if (isLearningCommandToolID(part.tool) && match.call.registration) {
            const interrupted = yield* interruptLearningInvocation(events, part.tool, match.call.registration)
            if (interrupted) {
              yield* settleInvocation(call, "interrupted")
              yield* settleToolCall(toolCallID)
              continue
            }
          }
          const end = Date.now()
          const metadata = "metadata" in part.state && isRecord(part.state.metadata) ? part.state.metadata : {}
          terminalParts.push({
            ...part,
            state: {
              ...part.state,
              status: "error",
              error: "Tool execution aborted",
              metadata: { ...metadata, interrupted: true },
              time: { start: "time" in part.state ? part.state.time.start : end, end },
            },
          })
          interruptedCalls.push(call)
        }
        ctx.assistantMessage.time.completed = Date.now()
        yield* session.finalizeMessage({ info: ctx.assistantMessage, parts: terminalParts })
        yield* Effect.forEach(interruptedCalls, (call) => settleInvocation(call, "interrupted"), { discard: true })
        ctx.toolcalls = {}
      })

      const halt = Effect.fn("SessionProcessor.halt")(function* (e: unknown) {
        yield* Effect.logError("process", {
          "session.id": input.sessionID,
          messageID: input.assistantMessage.id,
          error: errorMessage(e),
          stack: e instanceof Error ? e.stack : undefined,
        })
        const error = parse(e)
        if (SessionV1.ContextOverflowError.isInstance(error)) {
          if ((yield* config.get()).compaction?.auto === false && !ctx.assistantMessage.summary) {
            failureReason ??= "provider_failure"
            ctx.assistantMessage.error = error
            ctx.assistantMessage.finish = "error"
            yield* events.publish(Session.Event.Error, { sessionID: ctx.sessionID, error })
            yield* status.set(ctx.sessionID, { type: "idle" })
            return
          }
          failureReason = undefined
          ctx.needsCompaction = true
          yield* events.publish(Session.Event.Error, { sessionID: ctx.sessionID, error })
          return
        }
        ctx.assistantMessage.error = error
        yield* events.publish(Session.Event.Error, {
          sessionID: ctx.assistantMessage.sessionID,
          error: ctx.assistantMessage.error,
        })
        yield* status.set(ctx.sessionID, { type: "idle" })
      })

      const process = Effect.fn("SessionProcessor.process")(function* (streamInput: LLM.StreamInput) {
        yield* Effect.logInfo("process", {
          "session.id": input.sessionID,
          messageID: input.assistantMessage.id,
        })
        ctx.needsCompaction = false
        ctx.shouldBreak = (yield* config.get()).experimental?.continue_loop_on_deny !== true

        return yield* Effect.gen(function* () {
          yield* Effect.gen(function* () {
            ctx.currentText = undefined
            ctx.reasoningMap = {}
            yield* status.set(ctx.sessionID, { type: "busy" })
            if (streamInput.composition.type === "interactive" && !input.turnID) {
              throw new ProcessorIntegrityFailure(
                `Interactive Assistant operation has no exact Turn: ${input.assistantMessage.id}`,
              )
            }
            activeTools = streamInput.tools
            toolController = new AbortController()
            yield* llm.stream(streamInput).pipe(
              Stream.tap((event) =>
                observeFailure(
                  handleEvent(event),
                  event.type === "provider-error" ? "provider_failure" : "projection_failure",
                ),
              ),
              Stream.takeUntil(() => ctx.needsCompaction),
              Stream.runDrain,
              Effect.retry(
                SessionRetry.policy({
                  provider: input.model.providerID,
                  parse,
                  set: (info) =>
                    status.set(ctx.sessionID, {
                      type: "retry",
                      attempt: info.attempt,
                      message: info.message,
                      next: info.next,
                    }),
                }),
              ),
            )
            if (streamInput.composition.type === "internal") return
            yield* observeFailure(sealAndSettleModel("completed", false), "integrity_failure")
            yield* drainToolCandidates(streamInput.messages, toolController.signal)
          }).pipe(
            Effect.onInterrupt(() =>
              Effect.gen(function* () {
                aborted = true
                if (streamInput.composition.type === "interactive") {
                  yield* sealAndSettleModel("interrupted", true).pipe(Effect.uninterruptible, Effect.ignore)
                }
                if (!ctx.assistantMessage.error) {
                  yield* halt(new DOMException("Aborted", "AbortError"))
                }
              }),
            ),
            Effect.catchCauseIf(
              (cause) => !Cause.hasInterruptsOnly(cause),
              (cause) =>
                Effect.gen(function* () {
                  failureReason ??= classifyFailure(Cause.squash(cause), "provider_failure")
                  if (streamInput.composition.type === "interactive") {
                    yield* observeFailure(sealAndSettleModel("failed", true), "integrity_failure").pipe(Effect.ignore)
                  }
                  return yield* Effect.fail(Cause.squash(cause))
                }),
            ),
            Effect.ensuring(observeFailure(cleanup(), "projection_failure").pipe(Effect.uninterruptible)),
            Effect.catch(halt),
          )

          if (ctx.needsCompaction) return "compact"
          if (ctx.blocked || ctx.assistantMessage.error) return "stop"
          return "continue"
        })
      })

      return {
        get message() {
          return ctx.assistantMessage
        },
        get failureReason() {
          return failureReason
        },
        updateToolCall,
        completeToolCall,
        failToolCall,
        registeredToolCall,
        bindModelOperation,
        process,
      } satisfies Handle
    })

    return Service.of({ create })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [
    Session.node,
    Config.node,
    Snapshot.node,
    Agent.node,
    LLM.node,
    Permission.node,
    Plugin.node,
    SessionSummary.node,
    SessionStatus.node,
    Image.node,
    EventV2Bridge.node,
    Database.node,
    LearningCommandRuntime.node,
    RepresentationCommandRuntime.node,
  ],
})

function learningInvocationConflict(part: SessionV1.ToolPart) {
  return Effect.die(
    new LearningCommand.InvocationConflictError({
      partID: part.id,
      assistantMessageID: part.messageID,
      providerCallID: part.callID,
    }),
  )
}

function interruptLearningInvocation(
  events: EventV2.Interface,
  tool: string,
  registration: LearningCommandRuntime.Registration,
) {
  const interrupt =
    tool === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY
      ? RepresentationCommandRuntime.interruptInvocation
      : LearningCommandRuntime.interruptInvocation
  return interrupt(events, registration).pipe(Effect.orDie)
}

export * as SessionProcessor from "./processor"
