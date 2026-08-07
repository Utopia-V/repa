import { describe, expect, it } from "bun:test"
import type { AgentSideConnection } from "@agentclientprotocol/sdk"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import type { Event, Message, OpencodeClient, Part, SessionMessageResponse, ToolPart } from "@opencode-ai/sdk/v2"
import { Effect, ManagedRuntime } from "effect"
import { ACPEvent } from "@/acp/event"
import * as ACPService from "@/acp/service"
import { Directory } from "@/acp/directory"
import { ACPSession } from "@/acp/session"

type SessionUpdateParams = Parameters<AgentSideConnection["sessionUpdate"]>[0]
type ToolSessionUpdateParams = SessionUpdateParams & {
  update: Extract<SessionUpdateParams["update"], { sessionUpdate: "tool_call" | "tool_call_update" }>
}
type GlobalEventEnvelope = {
  payload?: Event
}
type DeltaPartType = Extract<Part, { type: "text" | "reasoning" }>["type"]
type DurableFutureAttentionFinalization = Readonly<{
  id: string
  type: "future_attention.finalized"
  sequence: number
  properties: Extract<Event, { type: "future_attention.finalized" }>["properties"]
}>

const pollUntil = async (
  check: () => boolean | Promise<boolean>,
  message: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
) => {
  const started = Date.now()
  while (true) {
    if (await check()) return
    if (Date.now() - started > (opts?.timeoutMs ?? 2000)) throw new Error(message)
    await new Promise((resolve) => setTimeout(resolve, opts?.intervalMs ?? 5))
  }
}

function makeSessionService() {
  return ManagedRuntime.make(LayerNode.compile(ACPSession.node)).runSync(
    ACPSession.Service.use((service) => Effect.succeed(service)),
  )
}

function createEventStream() {
  const queue: GlobalEventEnvelope[] = []
  const waiters: Array<(value: GlobalEventEnvelope | undefined) => void> = []
  const state = { closed: false }

  const push = (event: GlobalEventEnvelope) => {
    const waiter = waiters.shift()
    if (waiter) {
      waiter(event)
      return
    }
    queue.push(event)
  }

  const close = () => {
    state.closed = true
    for (const waiter of waiters.splice(0)) {
      waiter(undefined)
    }
  }

  const stream = async function* (signal?: AbortSignal) {
    while (true) {
      if (signal?.aborted) return
      const next = queue.shift()
      if (next) {
        yield next
        continue
      }
      if (state.closed) return
      const value = await new Promise<GlobalEventEnvelope | undefined>((resolve) => {
        waiters.push(resolve)
        signal?.addEventListener("abort", () => resolve(undefined), { once: true })
      })
      if (!value) return
      yield value
    }
  }

  return { push, close, stream }
}

function createHarness(
  messages: Record<string, SessionMessageResponse> = {},
  finalizations: readonly DurableFutureAttentionFinalization[] = [],
  onSessionUpdate?: (params: SessionUpdateParams, attempt: number) => Promise<void>,
  onFinalizationRead?: (call: number) => Promise<void>,
) {
  const updates: SessionUpdateParams[] = []
  const updateAttempts: SessionUpdateParams[] = []
  const calls = {
    eventSubscribe: 0,
    message: 0,
    futureAttentionFinalizations: 0,
  }
  let activeEvents = createEventStream()
  const events = {
    push(event: GlobalEventEnvelope) {
      activeEvents.push(event)
    },
    close() {
      activeEvents.close()
      activeEvents = createEventStream()
    },
    stream(signal?: AbortSignal) {
      return activeEvents.stream(signal)
    },
  }
  const finalizationRequests: Array<{
    input: { sessionID: string; directory?: string; after?: string; limit?: string }
    options?: { throwOnError?: boolean }
  }> = []
  const sdk = {
    global: {
      event: (options?: { signal?: AbortSignal }) => {
        calls.eventSubscribe++
        return Promise.resolve({ stream: events.stream(options?.signal) })
      },
    },
    session: {
      message: (input: { messageID: string }) => {
        calls.message++
        return Promise.resolve({ data: messages[input.messageID] })
      },
      get: () => Promise.resolve({ data: { id: "ses_loaded" } }),
      messages: () => Promise.resolve({ data: [] }),
      futureAttentionFinalizations: (
        input: { sessionID: string; directory?: string; after?: string; limit?: string },
        options?: { throwOnError?: boolean },
      ) => {
        calls.futureAttentionFinalizations++
        finalizationRequests.push({ input, options })
        const after = Number(input.after ?? -1)
        const remaining = finalizations.filter((event) => event.sequence > after)
        return (onFinalizationRead?.(calls.futureAttentionFinalizations) ?? Promise.resolve()).then(() => ({
          data: { events: remaining.slice(0, 1), hasMore: remaining.length > 1 },
        }))
      },
    },
  } as unknown as OpencodeClient
  const connection = {
    sessionUpdate: async (params: SessionUpdateParams) => {
      updateAttempts.push(params)
      await onSessionUpdate?.(params, updateAttempts.length)
      updates.push(params)
    },
  } satisfies Pick<AgentSideConnection, "sessionUpdate">
  const session = makeSessionService()
  const subscription = new ACPEvent.Subscription({ sdk, connection, session })

  return { calls, connection, events, finalizationRequests, sdk, session, subscription, updateAttempts, updates }
}

function textDelta(sessionID: string, messageID: string, partID: string, delta: string): Event {
  return {
    id: `evt_${sessionID}_${messageID}_${partID}_${delta}`,
    type: "message.part.delta",
    properties: {
      sessionID,
      messageID,
      partID,
      field: "text",
      delta,
    },
  }
}

function partUpdated(sessionID: string, messageID: string, partID: string, type: DeltaPartType): Event {
  return {
    id: `evt_${sessionID}_${messageID}_${partID}`,
    type: "message.part.updated",
    properties: {
      sessionID,
      time: Date.now(),
      part:
        type === "text"
          ? {
              id: partID,
              sessionID,
              messageID,
              type: "text",
              text: "",
            }
          : {
              id: partID,
              sessionID,
              messageID,
              type: "reasoning",
              text: "",
              time: { start: Date.now() },
            },
    },
  }
}

function toolUpdated(part: ToolPart): Event {
  return {
    id: `evt_${part.sessionID}_${part.messageID}_${part.id}_${part.state.status}`,
    type: "message.part.updated",
    properties: {
      sessionID: part.sessionID,
      time: Date.now(),
      part,
    },
  }
}

function futureAttentionFinalized(sessionID: string, marker: string) {
  const suffix = marker.repeat(26)
  return {
    id: `evt_future_attention_finalized_${marker}`,
    type: "future_attention.finalized",
    properties: {
      sessionID,
      turnID: `trn_future_attention_${marker}`,
      groupID: `fag_${suffix}`,
      assistantMessageID: `msg_future_attention_${marker}`,
      invocationPartID: `prt_original_claim_tool_${marker}`,
      receipt: {
        id: `far_${suffix}`,
        groupID: `fag_${suffix}`,
        outcome: "served",
        completion: {
          observationCut: "live_presentation_finalized",
          sessionID,
          turnID: `trn_future_attention_${marker}`,
          occurrenceID: `lco_future_attention_${marker}`,
          assistantMessageID: `msg_future_attention_${marker}`,
          modelOperationID: `msg_future_attention_${marker}`,
          invocationPartID: `prt_original_claim_tool_${marker}`,
          modelOutcome: "completed",
          localToolPartsTerminal: true,
          presentationCommitted: true,
          presentationUnavailable: false,
          timeCompleted: 2,
          completionOrder: 1,
          partManifestFingerprint: "a".repeat(64),
          eligibleOutputFingerprint: "b".repeat(64),
          eligibleOutputBytes: 32,
        },
        members: [
          {
            ordinal: 0,
            concernID: `fac_${suffix}`,
            outcome: "served",
            transitionID: `fat_${suffix}`,
            serviceReceiptID: `fas_${suffix}`,
          },
        ],
        timeFinalized: 3,
        finalizationOrder: 2,
      },
    },
  } satisfies Extract<Event, { type: "future_attention.finalized" }>
}

function serverConnected(marker: string) {
  return { id: `evt_server_connected_${marker}`, type: "server.connected", properties: {} } satisfies Event
}

function assistantMessage(sessionID: string, messageID: string, partID: string, type: DeltaPartType) {
  return {
    info: {
      id: messageID,
      sessionID,
      role: "assistant",
      time: { created: Date.now() },
      parentID: "msg_parent",
      modelID: "model",
      providerID: "provider",
      mode: "build",
      agent: "build",
      path: { cwd: "/workspace", root: "/workspace" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [
      type === "text"
        ? {
            id: partID,
            sessionID,
            messageID,
            type: "text",
            text: "",
          }
        : {
            id: partID,
            sessionID,
            messageID,
            type: "reasoning",
            text: "",
            time: { start: Date.now() },
          },
    ],
  } satisfies SessionMessageResponse
}

function assistantToolMessage(part: ToolPart) {
  return {
    info: {
      id: part.messageID,
      sessionID: part.sessionID,
      role: "assistant",
      time: { created: Date.now() },
      parentID: "msg_parent",
      modelID: "model",
      providerID: "provider",
      mode: "build",
      agent: "build",
      path: { cwd: "/workspace", root: "/workspace" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [part],
  } satisfies SessionMessageResponse
}

function runningTool(
  sessionID: string,
  callID: string,
  output?: string,
  input: Record<string, unknown> = { cmd: "printf hello" },
) {
  return {
    id: `part_${callID}`,
    sessionID,
    messageID: `msg_${callID}`,
    type: "tool",
    callID,
    tool: "bash",
    state: {
      status: "running",
      input,
      title: "bash",
      ...(output !== undefined ? { metadata: { output } } : {}),
      time: { start: Date.now() },
    },
  } satisfies ToolPart
}

function completedTool(
  sessionID: string,
  callID: string,
  output = "done",
  attachments: Extract<ToolPart["state"], { status: "completed" }>["attachments"] = [],
  options: {
    readonly tool?: string
    readonly input?: Record<string, unknown>
    readonly metadata?: Record<string, unknown>
    readonly title?: string
  } = {},
) {
  return {
    id: `part_${callID}`,
    sessionID,
    messageID: `msg_${callID}`,
    type: "tool",
    callID,
    tool: options.tool ?? "bash",
    state: {
      status: "completed",
      input: options.input ?? { cmd: "printf done" },
      output,
      title: options.title ?? "bash",
      metadata: options.metadata ?? { exit: 0 },
      time: { start: Date.now() - 1, end: Date.now() },
      ...(attachments.length ? { attachments } : {}),
    },
  } satisfies ToolPart
}

function errorTool(sessionID: string, callID: string) {
  return {
    id: `part_${callID}`,
    sessionID,
    messageID: `msg_${callID}`,
    type: "tool",
    callID,
    tool: "bash",
    state: {
      status: "error",
      input: { cmd: "exit 1" },
      error: "failed hard",
      metadata: { exit: 1 },
      time: { start: Date.now() - 1, end: Date.now() },
    },
  } satisfies ToolPart
}

function toolUpdates(updates: SessionUpdateParams[]) {
  return updates.filter((item): item is ToolSessionUpdateParams => {
    return item.update.sessionUpdate === "tool_call" || item.update.sessionUpdate === "tool_call_update"
  })
}

async function createKnownSession(
  session: ACPSession.Interface,
  sessionId: string,
  part: { messageId: string; partId: string; partType: Part["type"]; role?: Message["role"] },
) {
  await Effect.runPromise(session.create({ id: sessionId, cwd: "/workspace" }))
  await Effect.runPromise(
    session.recordPartMetadata({
      sessionId,
      messageId: part.messageId,
      partId: part.partId,
      partType: part.partType,
      role: part.role ?? "assistant",
    }),
  )
}

describe("acp event routing", () => {
  it("routes message.part.delta by sessionID without cross-session pollution", async () => {
    const harness = createHarness()
    await createKnownSession(harness.session, "ses_a", { messageId: "msg_a", partId: "part_a", partType: "text" })
    await createKnownSession(harness.session, "ses_b", { messageId: "msg_b", partId: "part_b", partType: "text" })

    await harness.subscription.handle(textDelta("ses_b", "msg_b", "part_b", "hello"))

    expect(harness.updates.map((update) => update.sessionId)).toEqual(["ses_b"])
    expect(harness.updates[0]?.update.sessionUpdate).toBe("agent_message_chunk")
  })

  it("keeps interleaved sessions isolated for text and reasoning deltas", async () => {
    const harness = createHarness()
    await createKnownSession(harness.session, "ses_a", { messageId: "msg_a", partId: "part_a", partType: "text" })
    await createKnownSession(harness.session, "ses_b", {
      messageId: "msg_b",
      partId: "part_b",
      partType: "reasoning",
    })

    await harness.subscription.handle(textDelta("ses_a", "msg_a", "part_a", "A1"))
    await harness.subscription.handle(textDelta("ses_b", "msg_b", "part_b", "B1"))
    await harness.subscription.handle(textDelta("ses_a", "msg_a", "part_a", "A2"))
    await harness.subscription.handle(textDelta("ses_b", "msg_b", "part_b", "B2"))

    expect(
      harness.updates.filter((update) => update.sessionId === "ses_a").map((update) => update.update.sessionUpdate),
    ).toEqual(["agent_message_chunk", "agent_message_chunk"])
    expect(
      harness.updates.filter((update) => update.sessionId === "ses_b").map((update) => update.update.sessionUpdate),
    ).toEqual(["agent_thought_chunk", "agent_thought_chunk"])
  })

  it("does not create extra subscriptions on repeated loadSession", async () => {
    const harness = createHarness()
    let subscription: ACPEvent.Subscription | undefined
    const service = ACPService.make({
      sdk: harness.sdk,
      connection: harness.connection,
      directory: {
        get: () =>
          Effect.succeed(
            Directory.build({
              directory: "/workspace",
              providers: {},
              modes: [],
              defaultModeID: "build",
              commands: [],
            }),
          ),
        refresh: () =>
          Effect.succeed(
            Directory.build({
              directory: "/workspace",
              providers: {},
              modes: [],
              defaultModeID: "build",
              commands: [],
            }),
          ),
        variants: Directory.variants,
      },
      session: harness.session,
      eventSubscription: (started) => {
        subscription = started
      },
    })

    await pollUntil(() => harness.calls.eventSubscribe === 1, "event subscription did not start")
    await Effect.runPromise(service.loadSession({ cwd: "/workspace", sessionId: "ses_loaded", mcpServers: [] }))
    await Effect.runPromise(service.loadSession({ cwd: "/workspace", sessionId: "ses_loaded", mcpServers: [] }))
    await Effect.runPromise(service.loadSession({ cwd: "/workspace", sessionId: "ses_loaded", mcpServers: [] }))

    expect(harness.calls.eventSubscribe).toBe(1)
    subscription?.stop()
    harness.events.close()
  })

  it("does not call sdk.session.message repeatedly when metadata is known", async () => {
    const harness = createHarness()
    await createKnownSession(harness.session, "ses_a", { messageId: "msg_a", partId: "part_a", partType: "text" })

    for (const delta of ["a", "b", "c", "d", "e"]) {
      await harness.subscription.handle(textDelta("ses_a", "msg_a", "part_a", delta))
    }

    expect(harness.calls.message).toBe(0)
    expect(harness.updates).toHaveLength(5)
  })

  it("fetches unknown part metadata once and reuses it for later deltas", async () => {
    const harness = createHarness({
      msg_a: assistantMessage("ses_a", "msg_a", "part_a", "text"),
    })
    await Effect.runPromise(harness.session.create({ id: "ses_a", cwd: "/workspace" }))

    await harness.subscription.handle(partUpdated("ses_a", "msg_a", "part_a", "text"))
    await harness.subscription.handle(textDelta("ses_a", "msg_a", "part_a", "a"))
    await harness.subscription.handle(textDelta("ses_a", "msg_a", "part_a", "b"))

    expect(harness.calls.message).toBe(1)
    expect(harness.updates).toHaveLength(2)
  })

  it("replays loaded session messages sequentially and continues after update failures", async () => {
    const events = createEventStream()
    const updates: SessionUpdateParams[] = []
    const connection = {
      sessionUpdate: (params: SessionUpdateParams) => {
        if (params.update.sessionUpdate === "tool_call" && params.update.toolCallId === "call_slow") {
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              updates.push(params)
              resolve()
            }, 20)
          })
        }

        if (params.update.sessionUpdate === "tool_call_update" && params.update.toolCallId === "call_slow") {
          return Promise.reject(new Error("replay send failed"))
        }

        updates.push(params)
        return Promise.resolve()
      },
    } satisfies Pick<AgentSideConnection, "sessionUpdate">
    let subscription: ACPEvent.Subscription | undefined
    const service = ACPService.make({
      sdk: {
        global: {
          event: (options?: { signal?: AbortSignal }) => Promise.resolve({ stream: events.stream(options?.signal) }),
        },
        session: {
          get: () => Promise.resolve({ data: { id: "ses_loaded" } }),
          messages: () =>
            Promise.resolve({
              data: [
                assistantToolMessage(completedTool("ses_loaded", "call_slow", "slow")),
                assistantToolMessage(completedTool("ses_loaded", "call_after", "after")),
              ],
            }),
          futureAttentionFinalizations: () => Promise.resolve({ data: { events: [], hasMore: false } }),
        },
      } as unknown as OpencodeClient,
      connection,
      directory: {
        get: () =>
          Effect.succeed(
            Directory.build({
              directory: "/workspace",
              providers: {},
              modes: [],
              defaultModeID: "build",
              commands: [],
            }),
          ),
        refresh: () =>
          Effect.succeed(
            Directory.build({
              directory: "/workspace",
              providers: {},
              modes: [],
              defaultModeID: "build",
              commands: [],
            }),
          ),
        variants: Directory.variants,
      },
      eventSubscription: (started) => {
        subscription = started
      },
    })

    await Effect.runPromise(service.loadSession({ cwd: "/workspace", sessionId: "ses_loaded", mcpServers: [] }))

    expect(toolUpdates(updates).map((item) => item.update.toolCallId)).toEqual([
      "call_slow",
      "call_after",
      "call_after",
    ])
    subscription?.stop()
    events.close()
  })

  it("ignores unknown sessions and live user parts without user_message_chunk duplication", async () => {
    const harness = createHarness()
    await createKnownSession(harness.session, "ses_user", {
      messageId: "msg_user",
      partId: "part_user",
      partType: "text",
      role: "user",
    })

    await harness.subscription.handle(textDelta("ses_missing", "msg_missing", "part_missing", "ignored"))
    await harness.subscription.handle(partUpdated("ses_user", "msg_user", "part_live", "text"))
    await harness.subscription.handle(textDelta("ses_user", "msg_user", "part_user", "hello"))

    expect(harness.updates).toHaveLength(0)
  })

  it("exposes the shell command on the synthetic pending tool call", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_tool", cwd: "/workspace" }))

    await harness.subscription.handle(toolUpdated(runningTool("ses_tool", "call_1", "hello")))

    expect(toolUpdates(harness.updates).map((item) => item.update.sessionUpdate)).toEqual([
      "tool_call",
      "tool_call_update",
    ])
    expect(harness.updates[0]?.update).toMatchObject({
      status: "pending",
      toolCallId: "call_1",
      title: "printf hello",
      kind: "execute",
      locations: [{ path: "/workspace" }],
      rawInput: { cmd: "printf hello", cwd: "/workspace" },
    })
    expect(harness.updates[1]?.update).toMatchObject({ status: "in_progress", toolCallId: "call_1" })
  })

  it("includes available input in the synthetic pending tool call", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_pending_input", cwd: "/workspace" }))

    await harness.subscription.handle(
      toolUpdated({
        id: "part_call_read",
        sessionID: "ses_pending_input",
        messageID: "msg_call_read",
        type: "tool",
        callID: "call_read",
        tool: "read",
        state: {
          status: "running",
          input: { filePath: "/workspace/file.ts" },
          title: "Read file.ts",
          time: { start: Date.now() },
        },
      } satisfies ToolPart),
    )

    expect(harness.updates[0]?.update).toMatchObject({
      sessionUpdate: "tool_call",
      toolCallId: "call_read",
      status: "pending",
      title: "Read file.ts",
      kind: "read",
      rawInput: { filePath: "/workspace/file.ts" },
      locations: [{ path: "/workspace/file.ts" }],
    })
  })

  it("does not emit duplicate synthetic pending after a replayed running tool", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_replay", cwd: "/workspace" }))

    await harness.subscription.replayMessage(assistantToolMessage(runningTool("ses_replay", "call_replay", "first")))
    await harness.subscription.handle(toolUpdated(runningTool("ses_replay", "call_replay", "second")))

    expect(toolUpdates(harness.updates).filter((item) => item.update.sessionUpdate === "tool_call")).toHaveLength(1)
    expect(toolUpdates(harness.updates).map((item) => item.update.sessionUpdate)).toEqual([
      "tool_call",
      "tool_call_update",
      "tool_call_update",
    ])
  })

  it("dedupes shell output snapshots while still sending status-only running updates", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_shell", cwd: "/workspace" }))

    await harness.subscription.handle(toolUpdated(runningTool("ses_shell", "call_shell", "same")))
    await harness.subscription.handle(toolUpdated(runningTool("ses_shell", "call_shell", "same")))

    const updates = toolUpdates(harness.updates)
    expect(updates).toHaveLength(3)
    expect(updates[1]?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      content: [{ type: "content", content: { type: "text", text: "same" } }],
    })
    expect(updates[2]?.update).toMatchObject({ sessionUpdate: "tool_call_update", status: "in_progress" })
    expect("content" in updates[2]!.update).toBe(false)
  })

  it("clears shell snapshot marker when a tool returns to pending", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_pending", cwd: "/workspace" }))

    await harness.subscription.handle(toolUpdated(runningTool("ses_pending", "call_pending", "repeat")))
    await harness.subscription.handle(
      toolUpdated({
        id: "part_call_pending",
        sessionID: "ses_pending",
        messageID: "msg_call_pending",
        type: "tool",
        callID: "call_pending",
        tool: "bash",
        state: {
          status: "pending",
          input: { cmd: "printf repeat" },
          raw: '{"cmd":"printf repeat"}',
        },
      }),
    )
    await harness.subscription.handle(toolUpdated(runningTool("ses_pending", "call_pending", "repeat")))

    expect(
      toolUpdates(harness.updates)
        .filter((item) => item.update.sessionUpdate === "tool_call_update")
        .map((item) => ("content" in item.update ? item.update.content : undefined)),
    ).toEqual([
      [{ type: "content", content: { type: "text", text: "repeat" } }],
      [{ type: "content", content: { type: "text", text: "repeat" } }],
    ])
  })

  it("emits completed tool output and rawOutput", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_done", cwd: "/workspace" }))

    await harness.subscription.handle(toolUpdated(completedTool("ses_done", "call_done", "finished")))

    expect(harness.updates.at(-1)?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_done",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "finished" } }],
      rawOutput: { output: "finished", metadata: { exit: 0 } },
    })
  })

  it("projects a verified learning-bootstrap result and fails closed on an invalid consequential basis", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_bootstrap", cwd: "/workspace" }))
    const presentation = SemanticPresentation.result({
      kind: "learning_bootstrap_result",
      binding: {
        sessionID: "ses_bootstrap",
        messageID: "msg_call_bootstrap",
        callID: "call_bootstrap",
        partID: "part_call_bootstrap",
      },
      settlement: { outcome: "applied" },
      disposition: "candidate_v1",
      issuance: "root",
      capabilityOutcome: "policy_allow",
      acknowledgement: {
        schemaVersion: 1,
        outcome: "applied",
        course: { id: "cou_linear", title: "Linear algebra" },
        children: [
          { kind: "course", outcome: "changed", id: "cou_linear", detail: "created" },
          {
            kind: "material",
            key: "notes",
            outcome: "changed",
            id: "lca_notes",
            detail: "explicit material adoption committed",
            materialTarget: {
              type: "representation",
              representationRevisionID: "rrv_linear_notes",
            },
          },
          { kind: "anchor", outcome: "no_change", detail: "route anchor preserved" },
        ],
        selectedRevisionID: null,
        anchor: { headID: null, target: null, usability: { usable: false, cause: "absent" } },
        correction: "Continue in ordinary language to correct this Course.",
      },
    })
    const projection = SemanticPresentation.projectResultBasis(presentation.basis)
    if (!projection) throw new Error("Expected a valid learning-bootstrap projection")
    const metadata = {
      command: "update_learning_course",
      commandVersion: 1,
      outcome: "applied",
      durablySettled: true,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    }
    const raw = JSON.stringify({ settlement: { outcome: "applied", effectID: "lbe_linear" } })

    await harness.subscription.handle(
      toolUpdated(
        completedTool("ses_bootstrap", "call_bootstrap", raw, [], {
          tool: "update_learning_course",
          input: { course: { type: "new", title: "Linear algebra" } },
          title: projection.title,
          metadata,
        }),
      ),
    )

    expect(harness.updates.at(-1)?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_bootstrap",
      status: "completed",
      title: "Learning bootstrap settlement — Committed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: expect.stringContaining(
              "Material 2: changed: explicit material adoption committed; Representation Revision rrv_linear_notes",
            ),
          },
        },
      ],
      rawOutput: { output: raw, metadata },
    })

    await Effect.runPromise(harness.session.create({ id: "ses_invalid_bootstrap", cwd: "/workspace" }))
    await harness.subscription.handle(
      toolUpdated(
        completedTool("ses_invalid_bootstrap", "call_invalid_bootstrap", raw, [], {
          tool: "update_learning_course",
          input: {},
          title: "Learning bootstrap settlement",
          metadata: { semanticPresentationRequired: true },
        }),
      ),
    )
    expect(harness.updates.at(-1)?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      status: "completed",
      title: "Consequential result unavailable",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "Consequential result unavailable: Repa could not verify this result, so no success is inferred.",
          },
        },
      ],
    })
  })

  it("emits clean read display content and preserves rawOutput", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_read", cwd: "/workspace" }))
    const output = [
      "<path>/workspace/file.ts</path>",
      "<type>file</type>",
      "<content>",
      "1: import { value } from './value'",
      "2: export { value }",
      "",
      "(End of file - total 2 lines)",
      "</content>",
    ].join("\n")
    const metadata = {
      display: {
        type: "file",
        path: "/workspace/file.ts",
        text: "import { value } from './value'\nexport { value }",
        lineStart: 1,
        lineEnd: 2,
        totalLines: 2,
        truncated: false,
      },
    }

    await harness.subscription.handle(
      toolUpdated(
        completedTool("ses_read", "call_read", output, [], {
          tool: "read",
          input: { filePath: "/workspace/file.ts" },
          metadata,
        }),
      ),
    )

    expect(harness.updates.at(-1)?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_read",
      status: "completed",
      content: [
        {
          type: "content",
          content: { type: "text", text: "import { value } from './value'\nexport { value }" },
        },
      ],
      rawOutput: { output, metadata },
    })
  })

  it("emits error tool output", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_error", cwd: "/workspace" }))

    await harness.subscription.handle(toolUpdated(errorTool("ses_error", "call_error")))

    expect(harness.updates.at(-1)?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_error",
      status: "failed",
      content: [{ type: "content", content: { type: "text", text: "failed hard" } }],
      rawOutput: { error: "failed hard", metadata: { exit: 1 } },
    })
  })

  it("emits image attachments as ACP image content for live and replayed completed tool updates", async () => {
    const harness = createHarness()
    const image = Buffer.from("image-data").toString("base64")
    const attachment = {
      id: "file_image",
      sessionID: "ses_image",
      messageID: "msg_image",
      type: "file",
      mime: "image/png",
      filename: "image.png",
      url: `data:image/png;base64,${image}`,
    } as const
    await Effect.runPromise(harness.session.create({ id: "ses_image", cwd: "/workspace" }))

    await harness.subscription.handle(toolUpdated(completedTool("ses_image", "call_live", "live", [attachment])))
    await harness.subscription.replayMessage(
      assistantToolMessage(completedTool("ses_image", "call_replayed", "replayed", [attachment])),
    )

    expect(
      toolUpdates(harness.updates)
        .filter((item) => item.update.sessionUpdate === "tool_call_update" && item.update.status === "completed")
        .map((item) => ("content" in item.update ? item.update.content : [])),
    ).toEqual([
      [
        { type: "content", content: { type: "text", text: "live" } },
        { type: "content", content: { type: "image", mimeType: "image/png", data: image } },
      ],
      [
        { type: "content", content: { type: "text", text: "replayed" } },
        { type: "content", content: { type: "image", mimeType: "image/png", data: image } },
      ],
    ])
  })

  it("publishes FutureAttention finalization under a receipt identity without rewriting the claim Tool call", async () => {
    const harness = createHarness()
    await Effect.runPromise(harness.session.create({ id: "ses_future_attention", cwd: "/workspace" }))
    const event = futureAttentionFinalized("ses_future_attention", "0")

    await harness.subscription.handle(event)
    await harness.subscription.handle(event)

    const updates = toolUpdates(harness.updates)
    expect(updates.map((item) => item.update)).toEqual([
      expect.objectContaining({
        sessionUpdate: "tool_call",
        toolCallId: event.properties.receipt.id,
        title: "Future attention served",
      }),
      expect.objectContaining({
        sessionUpdate: "tool_call_update",
        toolCallId: event.properties.receipt.id,
        status: "completed",
        rawOutput: expect.objectContaining({
          metadata: expect.objectContaining({
            futureAttentionFinalization: event.properties,
          }),
        }),
      }),
    ])
    const completed = updates.find((item) => item.update.sessionUpdate === "tool_call_update")
    expect(JSON.stringify(completed?.update.content)).not.toContain(event.properties.groupID)
    expect(JSON.stringify(completed?.update.content)).not.toContain(event.properties.receipt.id)
    expect(updates.some((item) => item.update.toolCallId === event.properties.invocationPartID)).toBe(false)
  })

  it("pages durable FutureAttention finalizations after attachment and dedupes a later live receipt", async () => {
    const first = futureAttentionFinalized("ses_future_attention_catchup", "1")
    const second = futureAttentionFinalized("ses_future_attention_catchup", "2")
    const harness = createHarness({}, [
      { ...first, sequence: 4 },
      { ...second, sequence: 9 },
    ])
    await Effect.runPromise(harness.session.create({ id: "ses_future_attention_catchup", cwd: "/workspace" }))

    await harness.subscription.catchUp("ses_future_attention_catchup", "/workspace")
    await harness.subscription.handle(first)

    expect(harness.calls.futureAttentionFinalizations).toBe(2)
    expect(harness.finalizationRequests).toEqual([
      {
        input: {
          sessionID: "ses_future_attention_catchup",
          directory: "/workspace",
          after: "-1",
          limit: "100",
        },
        options: { throwOnError: true },
      },
      {
        input: {
          sessionID: "ses_future_attention_catchup",
          directory: "/workspace",
          after: "4",
          limit: "100",
        },
        options: { throwOnError: true },
      },
    ])
    expect(toolUpdates(harness.updates).map((item) => item.update.toolCallId)).toEqual([
      first.properties.receipt.id,
      first.properties.receipt.id,
      second.properties.receipt.id,
      second.properties.receipt.id,
    ])
  })

  it("queues a second ACP catch-up generation without overlapping the in-flight owner read", async () => {
    const sessionID = "ses_future_attention_dirty_catchup"
    const first = futureAttentionFinalized(sessionID, "7")
    const second = futureAttentionFinalized(sessionID, "8")
    const durable: DurableFutureAttentionFinalization[] = [{ ...first, sequence: 4 }]
    let activeReads = 0
    let maxActiveReads = 0
    let firstReadStarted!: () => void
    const started = new Promise<void>((resolve) => {
      firstReadStarted = resolve
    })
    let releaseFirstRead!: () => void
    const released = new Promise<void>((resolve) => {
      releaseFirstRead = resolve
    })
    const harness = createHarness({}, durable, undefined, async (call) => {
      activeReads++
      maxActiveReads = Math.max(maxActiveReads, activeReads)
      try {
        if (call !== 1) return
        firstReadStarted()
        await released
      } finally {
        activeReads--
      }
    })
    await Effect.runPromise(harness.session.create({ id: sessionID, cwd: "/workspace" }))

    const firstCatchUp = harness.subscription.catchUp(sessionID, "/workspace")
    await started
    durable.push({ ...second, sequence: 9 })
    const secondCatchUp = harness.subscription.catchUp(sessionID, "/workspace")
    releaseFirstRead()
    await Promise.all([firstCatchUp, secondCatchUp])

    expect(maxActiveReads).toBe(1)
    expect(harness.calls.futureAttentionFinalizations).toBe(3)
    expect(toolUpdates(harness.updates).map((item) => item.update.toolCallId)).toEqual([
      first.properties.receipt.id,
      first.properties.receipt.id,
      second.properties.receipt.id,
      second.properties.receipt.id,
    ])
  })

  it("retries only the unfinished FutureAttention presentation stage after an ACP client update failure", async () => {
    for (const [failedStage, marker] of [
      ["tool_call", "3"],
      ["tool_call_update", "4"],
    ] as const) {
      let failed = false
      const harness = createHarness({}, [], async (params) => {
        if (params.update.sessionUpdate !== failedStage || failed) return
        failed = true
        throw new Error(`fail ${failedStage}`)
      })
      const sessionID = `ses_future_attention_retry_${marker}`
      const event = futureAttentionFinalized(sessionID, marker)
      await Effect.runPromise(harness.session.create({ id: sessionID, cwd: "/workspace" }))

      await expect(harness.subscription.handle(event)).rejects.toThrow(`fail ${failedStage}`)
      await harness.subscription.handle(event)
      await harness.subscription.handle(event)

      expect(toolUpdates(harness.updates).map((item) => item.update.sessionUpdate)).toEqual([
        "tool_call",
        "tool_call_update",
      ])
      expect(toolUpdates(harness.updateAttempts).map((item) => item.update.sessionUpdate)).toEqual(
        failedStage === "tool_call"
          ? ["tool_call", "tool_call", "tool_call_update"]
          : ["tool_call", "tool_call_update", "tool_call_update"],
      )
    }
  })

  it("catches up a durable FutureAttention finalization committed during an ACP reconnect gap", async () => {
    const durable: DurableFutureAttentionFinalization[] = []
    let blockReconnect = false
    let releaseReconnect!: () => void
    const reconnectReleased = new Promise<void>((resolve) => {
      releaseReconnect = resolve
    })
    const harness = createHarness({}, durable, undefined, (call) => {
      if (!blockReconnect || call !== 2) return Promise.resolve()
      return reconnectReleased
    })
    const sessionID = "ses_future_attention_reconnect"
    const first = futureAttentionFinalized(sessionID, "5")
    const second = futureAttentionFinalized(sessionID, "6")
    await Effect.runPromise(harness.session.create({ id: sessionID, cwd: "/workspace" }))
    harness.subscription.start()

    try {
      harness.events.push({ payload: serverConnected("1") })
      await pollUntil(
        () => harness.calls.eventSubscribe === 1 && harness.calls.futureAttentionFinalizations === 1,
        "initial ACP FutureAttention catch-up did not complete",
      )
      durable.push({ ...first, sequence: 4 })
      blockReconnect = true
      harness.events.push({ payload: serverConnected("2") })
      await pollUntil(
        () => harness.calls.futureAttentionFinalizations === 2,
        "first ACP reconnect catch-up did not start",
      )
      durable.push({ ...second, sequence: 9 })
      harness.events.push({ payload: serverConnected("3") })
      releaseReconnect()

      await pollUntil(
        () => toolUpdates(harness.updates).length === 4,
        "ACP reconnect generations did not catch up the detached FutureAttention finalizations",
      )

      expect(harness.calls.eventSubscribe).toBe(1)
      expect(harness.calls.futureAttentionFinalizations).toBe(4)
      expect(toolUpdates(harness.updates).map((item) => item.update.toolCallId)).toEqual([
        first.properties.receipt.id,
        first.properties.receipt.id,
        second.properties.receipt.id,
        second.properties.receipt.id,
      ])
    } finally {
      harness.subscription.stop()
    }
  })
})
