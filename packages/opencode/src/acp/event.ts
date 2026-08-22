import type { AgentSideConnection } from "@agentclientprotocol/sdk"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { FutureAttentionPresentation } from "@opencode-ai/core/future-attention-presentation"
import type {
  Event,
  EventMessagePartDelta,
  EventMessagePartUpdated,
  OpencodeClient,
  Part,
  SessionMessageResponse,
  ToolPart,
} from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { ACPSession } from "./session"
import { ACPPermission } from "./permission"
import { partsToContentChunks, type ReplayPart } from "./content"
import {
  duplicateRunningToolUpdate,
  errorToolUpdate,
  pendingToolCall,
  runningToolUpdate,
  shellOutputSnapshot,
  completedToolUpdate,
} from "./tool"

type Connection = Pick<AgentSideConnection, "sessionUpdate"> &
  Partial<Pick<AgentSideConnection, "requestPermission" | "writeTextFile">>
type GlobalEventEnvelope = {
  payload?: Event
}
type GlobalEventStream = {
  stream: AsyncIterable<GlobalEventEnvelope>
}

export function start(input: { sdk: OpencodeClient; connection: Connection; session: ACPSession.Interface }) {
  const subscription = new Subscription(input)
  subscription.start()
  return subscription
}

export class Subscription {
  private readonly abort = new AbortController()
  private readonly shellSnapshots = new Map<string, string>()
  private readonly toolStarts = new Set<string>()
  private readonly permission: ACPPermission.Handler
  private readonly futureAttentionFinalizations = new Map<string, "pending" | "completed">()
  private readonly futureAttentionDeliveries = new Map<string, Promise<void>>()
  private readonly futureAttentionCatchUpGenerations = new Map<string, number>()
  private readonly futureAttentionCatchUps = new Map<string, Promise<void>>()
  private started = false

  constructor(
    private readonly input: {
      sdk: OpencodeClient
      connection: Connection
      session: ACPSession.Interface
    },
  ) {
    this.permission = new ACPPermission.Handler(input)
  }

  start() {
    if (this.started) return
    this.started = true
    this.run().catch(() => {
      if (this.abort.signal.aborted) return
    })
  }

  stop() {
    this.abort.abort()
  }

  async catchUp(sessionID: string, directory: string) {
    const key = `${directory}\0${sessionID}`
    this.futureAttentionCatchUpGenerations.set(key, (this.futureAttentionCatchUpGenerations.get(key) ?? 0) + 1)
    const current = this.futureAttentionCatchUps.get(key)
    if (current) return current
    const task = (async () => {
      let completed = -1
      while (completed !== this.futureAttentionCatchUpGenerations.get(key)) {
        const generation = this.futureAttentionCatchUpGenerations.get(key)!
        await this.readFutureAttentionFinalizations(sessionID, directory)
        completed = generation
      }
    })().finally(() => {
      if (this.futureAttentionCatchUps.get(key) === task) this.futureAttentionCatchUps.delete(key)
    })
    this.futureAttentionCatchUps.set(key, task)
    return task
  }

  private async readFutureAttentionFinalizations(sessionID: string, directory: string) {
    let after = -1
    while (true) {
      const response = await this.input.sdk.session.futureAttentionFinalizations(
        { sessionID, directory, after: after.toString(), limit: "100" },
        { throwOnError: true },
      )
      if (!response.data) throw new Error("FutureAttention finalization history unavailable")
      for (const event of response.data.events) {
        await this.handle({ id: event.id, type: event.type, properties: event.properties } as Event)
      }
      if (!response.data.hasMore) return
      const next = response.data.events.at(-1)?.sequence
      if (next === undefined || next <= after) {
        throw new Error("FutureAttention finalization history did not advance")
      }
      after = next
    }
  }

  async handle(event: Event) {
    switch (event.type) {
      case "permission.asked":
        this.permission.handle(event)
        return
      case "message.part.updated":
        return this.handlePartUpdated(event)
      case "message.part.delta":
        return this.handlePartDelta(event)
      case "future_attention.finalized":
        return this.handleFutureAttentionFinalized(event)
      case "server.connected": {
        const sessions = await Effect.runPromise(this.input.session.list())
        await Promise.all(sessions.map((session) => this.catchUp(session.id, session.cwd)))
        return
      }
    }
  }

  private async handleFutureAttentionFinalized(event: Extract<Event, { type: "future_attention.finalized" }>) {
    const props = event.properties
    if (this.futureAttentionFinalizations.get(props.receipt.id) === "completed") return
    const current = this.futureAttentionDeliveries.get(props.receipt.id)
    if (current) return current
    const task = this.deliverFutureAttentionFinalization(props).finally(() => {
      if (this.futureAttentionDeliveries.get(props.receipt.id) === task) {
        this.futureAttentionDeliveries.delete(props.receipt.id)
      }
    })
    this.futureAttentionDeliveries.set(props.receipt.id, task)
    return task
  }

  private async deliverFutureAttentionFinalization(
    props: Extract<Event, { type: "future_attention.finalized" }>["properties"],
  ) {
    const session = await Effect.runPromise(this.input.session.tryGet(props.sessionID))
    if (!session || this.futureAttentionFinalizations.get(props.receipt.id) === "completed") return
    const toolName = "future_attention.finalization"
    const presentation = FutureAttentionPresentation.finalization(props.receipt)
    const state = {
      input: {
        groupID: props.groupID,
        assistantMessageID: props.assistantMessageID,
        invocationPartID: props.invocationPartID,
      },
      title: presentation.title,
    }
    if (!this.futureAttentionFinalizations.has(props.receipt.id)) {
      await this.input.connection.sessionUpdate({
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call",
          ...pendingToolCall({ toolCallId: props.receipt.id, toolName, state, cwd: session.cwd }),
        },
      })
      this.futureAttentionFinalizations.set(props.receipt.id, "pending")
    }
    await this.input.connection.sessionUpdate({
      sessionId: session.id,
      update: {
        sessionUpdate: "tool_call_update",
        ...completedToolUpdate({
          toolCallId: props.receipt.id,
          toolName,
          cwd: session.cwd,
          state: {
            status: "completed",
            input: state.input,
            title: state.title,
            output: `${presentation.title}: ${presentation.detail}`,
            metadata: { futureAttentionFinalization: props },
          },
        }),
      },
    })
    this.futureAttentionFinalizations.set(props.receipt.id, "completed")
  }

  async replayMessage(message: SessionMessageResponse) {
    if (message.info.role !== "assistant" && message.info.role !== "user") return

    const cwd = message.info.role === "assistant" ? message.info.path?.cwd : undefined
    for (const part of message.parts) {
      await this.recordFetchedPart(message.info.sessionID, message, part)
      if (part.type === "tool") {
        await this.handleToolPart(message.info.sessionID, part, cwd ?? process.cwd())
        continue
      }
      await this.replayContentPart(message, part)
    }
  }

  private async replayContentPart(message: SessionMessageResponse, part: Part) {
    if (part.type !== "text" && part.type !== "file" && part.type !== "reasoning") return

    const sessionUpdate =
      part.type === "reasoning"
        ? "agent_thought_chunk"
        : message.info.role === "user"
          ? "user_message_chunk"
          : "agent_message_chunk"

    for (const chunk of partsToContentChunks([part as ReplayPart])) {
      await this.input.connection.sessionUpdate({
        sessionId: message.info.sessionID,
        update: {
          sessionUpdate,
          messageId: message.info.id,
          ...chunk,
        },
      })
    }
  }

  private async run() {
    while (!this.abort.signal.aborted) {
      try {
        const events = (await this.input.sdk.global.event({
          signal: this.abort.signal,
        })) as GlobalEventStream

        for await (const event of events.stream) {
          if (this.abort.signal.aborted) return
          if (!event.payload) continue
          if (event.payload.type === "future_attention.finalized" || event.payload.type === "server.connected") {
            await this.handle(event.payload)
            continue
          }
          await this.handle(event.payload).catch(() => {})
        }
      } catch {
        if (this.abort.signal.aborted) return
      }
      if (!this.abort.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  private async handlePartUpdated(event: EventMessagePartUpdated) {
    const part = event.properties.part
    const sessionId = part.sessionID || event.properties.sessionID
    const session = await Effect.runPromise(this.input.session.tryGet(sessionId))
    if (!session) return

    await Effect.runPromise(
      this.input.session.recordPartMetadata({
        sessionId: session.id,
        messageId: part.messageID,
        partId: part.id,
        partType: part.type,
        role: part.type === "reasoning" ? "assistant" : undefined,
        ignored: part.type === "text" ? part.ignored : undefined,
        toolCallId: part.type === "tool" ? part.callID : undefined,
        metadata: "metadata" in part ? part.metadata : undefined,
      }),
    )
    if (part.type === "tool") {
      await this.handleToolPart(session.id, part, session.cwd)
    }
  }

  private async handlePartDelta(event: EventMessagePartDelta) {
    const props = event.properties
    const session = await Effect.runPromise(this.input.session.tryGet(props.sessionID))
    if (!session) return

    const known = await Effect.runPromise(
      this.input.session.tryGetPartMetadata({
        sessionId: session.id,
        messageId: props.messageID,
        partId: props.partID,
      }),
    )
    const metadata =
      known?.role && known.partType
        ? known
        : await this.fetchPartMetadata(session.id, session.cwd, props.messageID, props.partID)
    if (metadata?.role !== "assistant") return
    if (metadata.partType === "text" && props.field === "text" && metadata.ignored !== true) {
      await this.input.connection.sessionUpdate({
        sessionId: session.id,
        update: {
          sessionUpdate: "agent_message_chunk",
          messageId: props.messageID,
          content: {
            type: "text",
            text: props.delta,
          },
        },
      })
      return
    }

    if (metadata.partType === "reasoning" && props.field === "text") {
      await this.input.connection.sessionUpdate({
        sessionId: session.id,
        update: {
          sessionUpdate: "agent_thought_chunk",
          messageId: props.messageID,
          content: {
            type: "text",
            text: props.delta,
          },
        },
      })
    }
  }

  private async fetchPartMetadata(sessionId: string, cwd: string, messageId: string, partId: string) {
    const message = await this.input.sdk.session
      .message(
        {
          sessionID: sessionId,
          messageID: messageId,
          directory: cwd,
        },
        { throwOnError: true },
      )
      .then((response) => response.data)
      .catch(() => undefined)
    if (!message) return

    const part = message.parts.find((item) => item.id === partId)
    if (!part) return
    return await this.recordFetchedPart(sessionId, message, part)
  }

  private async recordFetchedPart(sessionId: string, message: SessionMessageResponse, part: Part) {
    return await Effect.runPromise(
      this.input.session.recordPartMetadata({
        sessionId,
        messageId: part.messageID,
        partId: part.id,
        partType: part.type,
        role: message.info.role,
        ignored: part.type === "text" ? part.ignored : undefined,
        toolCallId: part.type === "tool" ? part.callID : undefined,
        metadata: "metadata" in part ? part.metadata : undefined,
      }),
    )
  }

  private async handleToolPart(sessionId: string, part: ToolPart, cwd: string) {
    await this.toolStart(sessionId, part, cwd)

    switch (part.state.status) {
      case "pending":
        this.shellSnapshots.delete(part.callID)
        return

      case "running":
        await this.runningTool(sessionId, part, cwd)
        return

      case "completed":
        this.clearTool(part.callID)
        await this.input.connection.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            ...completedToolUpdate({
              toolCallId: part.callID,
              toolName: part.tool,
              state: part.state,
              semantic: SemanticPresentation.readResult(part),
              inspection: SemanticPresentation.readInspection(part),
              cwd,
            }),
          },
        })
        return

      case "error":
        this.clearTool(part.callID)
        await this.input.connection.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            ...errorToolUpdate({
              toolCallId: part.callID,
              toolName: part.tool,
              state: part.state,
              cwd,
            }),
          },
        })
        return
    }
  }

  private async runningTool(sessionId: string, part: ToolPart, cwd: string) {
    if (part.state.status !== "running") return

    const output = part.tool === "bash" ? shellOutputSnapshot(part.state) : undefined
    if (output !== undefined) {
      if (this.shellSnapshots.get(part.callID) === output) {
        await this.input.connection.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            ...duplicateRunningToolUpdate({
              toolCallId: part.callID,
              toolName: part.tool,
              state: part.state,
              cwd,
            }),
          },
        })
        return
      }
      this.shellSnapshots.set(part.callID, output)
    }

    await this.input.connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        ...runningToolUpdate({
          toolCallId: part.callID,
          toolName: part.tool,
          state: part.state,
          output,
          cwd,
        }),
      },
    })
  }

  private async toolStart(sessionId: string, part: ToolPart, cwd: string) {
    if (this.toolStarts.has(part.callID)) return
    this.toolStarts.add(part.callID)
    await this.input.connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        ...pendingToolCall({
          toolCallId: part.callID,
          toolName: part.tool,
          state: part.state,
          cwd,
        }),
      },
    })
  }

  private clearTool(toolCallId: string) {
    this.toolStarts.delete(toolCallId)
    this.shellSnapshots.delete(toolCallId)
  }
}

export * as ACPEvent from "./event"
