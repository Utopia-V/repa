import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LearnerAdmission } from "@opencode-ai/core/learning-command/occurrence-schema"
import { Occurrence } from "@opencode-ai/core/learning-command/occurrence"
import { MessageTable, PartTable } from "@opencode-ai/core/session/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnCandidatePresentationTable, TurnToolCandidateTable } from "@opencode-ai/core/turn/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Turn } from "@opencode-ai/schema/turn"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceBootstrap } from "@/project/bootstrap"
import { InstanceStore } from "@/project/instance-store"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { recover } from "@/session/turn-recovery"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { expect } from "bun:test"
import { testEffect } from "../lib/effect"

const model = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const root = LayerNode.group([Database.node, EventV2Bridge.node, SessionProjector.node, InstanceStore.node])
const it = testEffect(
  AppNodeBuilder.build(root, [
    [
      InstanceBootstrap.node,
      Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void })),
    ],
  ]),
)

it.instance("recovers operation orphans from durable Assistant and Tool truth without dispatch", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const instance = yield* InstanceRef
    if (!instance) return yield* Effect.die("Test instance is unavailable")
    const time = Date.now()

    const completedTool = yield* createRoot(db, instance.project.id, instance.directory, time, { model: 1, tool: 1 })
    const completedToolAssistant = yield* addAssistant(db, completedTool, time + 1, true)
    yield* admitModel(db, completedTool, completedToolAssistant, time + 1)
    const completedPart = yield* addToolPart(db, completedToolAssistant, time + 2, "completed")
    yield* sealModel(db, completedTool, completedToolAssistant, [completedPart], time + 2)
    yield* settleModel(db, completedTool, completedToolAssistant, time + 3)
    yield* admitTool(db, completedTool, completedToolAssistant, completedPart, time + 4)

    const runningTool = yield* createRoot(db, instance.project.id, instance.directory, time + 10, {
      model: 1,
      tool: 1,
    })
    const runningToolAssistant = yield* addAssistant(db, runningTool, time + 11, true)
    yield* admitModel(db, runningTool, runningToolAssistant, time + 11)
    const runningPart = yield* addToolPart(db, runningToolAssistant, time + 12, "running")
    yield* sealModel(db, runningTool, runningToolAssistant, [runningPart], time + 12)
    yield* settleModel(db, runningTool, runningToolAssistant, time + 13)
    yield* admitTool(db, runningTool, runningToolAssistant, runningPart, time + 14)

    const partialModel = yield* createRoot(db, instance.project.id, instance.directory, time + 20, {
      model: 1,
      tool: 1,
    })
    const partialAssistant = yield* addAssistant(db, partialModel, time + 21, false)
    yield* addTextPart(db, partialAssistant, time + 21, "partial answer")
    yield* admitModel(db, partialModel, partialAssistant, time + 21)
    const pendingPart = yield* addToolPart(db, partialAssistant, time + 22, "pending")
    yield* registerUnsealedCandidate(db, partialModel, partialAssistant, pendingPart, time + 22)

    const completedModel = yield* createRoot(db, instance.project.id, instance.directory, time + 30, {
      model: 1,
      tool: 0,
    })
    const completedAssistant = yield* addAssistant(db, completedModel, time + 31, true)
    yield* admitModel(db, completedModel, completedAssistant, time + 31)

    const beforeCounts = yield* operationCounts(db)
    const recovered = yield* recover(events, time)
    expect(recovered.map((turn) => turn.id)).toEqual([
      completedTool.turnID,
      runningTool.turnID,
      partialModel.turnID,
      completedModel.turnID,
    ])
    expect(recovered.every((turn) => turn.terminal?.reason === "startup_recovery")).toBe(true)
    expect(yield* operationCounts(db)).toEqual(beforeCounts)

    expect(yield* invocationState(db, completedPart.id)).toBe("completed")
    const storedCompleted = yield* toolPart(completedToolAssistant.id, completedPart.id)
    expect(storedCompleted.state).toMatchObject({ status: "completed", output: "durable result" })

    expect(yield* invocationState(db, runningPart.id)).toBe("interrupted")
    const storedRunning = yield* toolPart(runningToolAssistant.id, runningPart.id)
    expect(storedRunning.state).toMatchObject({
      status: "error",
      error: "Tool execution aborted",
      metadata: { interrupted: true },
    })

    const storedPartial = yield* MessageV2.get({
      sessionID: partialModel.sessionID,
      messageID: partialAssistant.id,
    })
    expect(storedPartial.info).toMatchObject({
      role: "assistant",
      error: { name: "MessageAbortedError" },
      time: { completed: time + 22 },
    })
    expect(storedPartial.parts.find((part) => part.type === "text")).toMatchObject({ text: "partial answer" })
    const storedPending = storedPartial.parts.find((part) => part.id === pendingPart.id)
    expect(storedPending).toMatchObject({
      type: "tool",
      metadata: { turnCandidateDisposition: "not_started_interrupted" },
      state: {
        status: "error",
        metadata: { disposition: "not_started_interrupted", notStarted: true },
      },
    })
    expect(
      yield* db
        .select({ state: TurnToolCandidateTable.state })
        .from(TurnToolCandidateTable)
        .where(eq(TurnToolCandidateTable.part_id, pendingPart.id))
        .get()
        .pipe(Effect.orDie),
    ).toEqual({ state: "not_started_interrupted" })
    expect(
      yield* db
        .select({
          state: sql<string>`state`,
          sealed: sql<number>`candidates_sealed`,
          count: sql<number>`candidate_count`,
        })
        .from(sql`turn_model_operation`)
        .where(sql`assistant_message_id = ${partialAssistant.id}`)
        .get()
        .pipe(Effect.orDie),
    ).toEqual({ state: "interrupted", sealed: 1, count: 1 })
    expect(
      yield* db
        .select({ state: sql<string>`state` })
        .from(sql`turn_model_operation`)
        .where(sql`assistant_message_id = ${completedAssistant.id}`)
        .get()
        .pipe(Effect.orDie),
    ).toEqual({ state: "completed" })

    const published = yield* db
      .select({ type: EventTable.type })
      .from(EventTable)
      .where(
        inArray(
          EventTable.aggregate_id,
          recovered.map((turn) => turn.sessionID),
        ),
      )
      .orderBy(asc(EventTable.aggregate_id), asc(EventTable.seq))
      .all()
      .pipe(Effect.orDie)
    expect(published.some((event) => event.type.startsWith("turn.model.admitted"))).toBe(false)
    expect(published.some((event) => event.type.startsWith("turn.tool.admitted"))).toBe(false)
    expect(published.filter((event) => event.type.startsWith("turn.terminal"))).toHaveLength(4)
    expect(published.some((event) => event.type.startsWith("message.updated"))).toBe(true)
    expect(published.some((event) => event.type.startsWith("message.part.updated"))).toBe(true)

    const firstSnapshot = yield* recoverySnapshot(db)
    expect(yield* recover(events, time + 200)).toEqual([])
    expect(yield* recoverySnapshot(db)).toEqual(firstSnapshot)
  }),
)

it.instance("maps durable Assistant and Tool errors to exact operation outcomes", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const instance = yield* InstanceRef
    if (!instance) return yield* Effect.die("Test instance is unavailable")
    const time = Date.now()

    const failedTool = yield* createRoot(db, instance.project.id, instance.directory, time, { model: 1, tool: 1 })
    const failedToolAssistant = yield* addAssistant(db, failedTool, time + 1, true)
    yield* admitModel(db, failedTool, failedToolAssistant, time + 1)
    const failedPart = yield* addToolPart(db, failedToolAssistant, time + 2, "error")
    yield* sealModel(db, failedTool, failedToolAssistant, [failedPart], time + 2)
    yield* settleModel(db, failedTool, failedToolAssistant, time + 3)
    yield* admitTool(db, failedTool, failedToolAssistant, failedPart, time + 4)

    const interruptedTool = yield* createRoot(db, instance.project.id, instance.directory, time + 10, {
      model: 1,
      tool: 1,
    })
    const interruptedToolAssistant = yield* addAssistant(db, interruptedTool, time + 11, true)
    yield* admitModel(db, interruptedTool, interruptedToolAssistant, time + 11)
    const interruptedPart = yield* addToolPart(db, interruptedToolAssistant, time + 12, "interrupted")
    yield* sealModel(db, interruptedTool, interruptedToolAssistant, [interruptedPart], time + 12)
    yield* settleModel(db, interruptedTool, interruptedToolAssistant, time + 13)
    yield* admitTool(db, interruptedTool, interruptedToolAssistant, interruptedPart, time + 14)

    const abortedModel = yield* createRoot(db, instance.project.id, instance.directory, time + 20, {
      model: 1,
      tool: 0,
    })
    const abortedAssistant = yield* addAssistant(
      db,
      abortedModel,
      time + 21,
      true,
      new SessionV1.AbortedError({ message: "Aborted" }).toObject(),
    )
    yield* admitModel(db, abortedModel, abortedAssistant, time + 21)

    const failedModel = yield* createRoot(db, instance.project.id, instance.directory, time + 30, {
      model: 1,
      tool: 0,
    })
    const failedAssistant = yield* addAssistant(
      db,
      failedModel,
      time + 31,
      true,
      new SessionV1.APIError({ message: "provider failed", isRetryable: false }).toObject(),
    )
    yield* admitModel(db, failedModel, failedAssistant, time + 31)

    yield* recover(events, time + 100)
    expect(yield* invocationState(db, failedPart.id)).toBe("failed")
    expect(yield* invocationState(db, interruptedPart.id)).toBe("interrupted")
    expect(yield* modelState(db, abortedAssistant.id)).toBe("interrupted")
    expect(yield* modelState(db, failedAssistant.id)).toBe("failed")
  }),
)

type Db = Database.Interface["db"]

function createRoot(db: Db, projectID: string, directory: string, time: number, limits: Turn.Limits) {
  return Effect.gen(function* () {
    const sessionID = SessionID.create()
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    const messageID = MessageID.ascending()
    const partID = PartID.ascending()
    const envelope = { kind: "learner", sessionID, inputID, messageID, content: "hello" }
    const admission = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.run(sql`
          INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
          VALUES (${sessionID}, ${projectID}, 'turn-recovery-test', ${directory}, 'Turn recovery test', 'test', ${time}, ${time})
        `)
        yield* tx.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES (${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({
            role: "user",
            time: { created: time },
            agent: "repa",
            model,
          })})
        `)
        yield* tx.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (${partID}, ${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({ type: "text", text: "hello" })})
        `)
        const occurrence = yield* Occurrence.admit(tx, {
          admission: LearnerAdmission.interactive(),
          sessionID,
          messageID,
          timeAdmitted: time,
        })
        return yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID,
          sessionID,
          inputID,
          messageID,
          occurrenceID: occurrence.id,
          limits,
          envelope,
          policyBasis: { source: "test" },
          timeAdmitted: time,
        })
      }),
    )
    return { sessionID, turnID, inputID, messageID, limits, admission }
  })
}

type Root = Effect.Success<ReturnType<typeof createRoot>>

function addAssistant(db: Db, root: Root, time: number, completed: boolean, error?: SessionV1.Assistant["error"]) {
  return Effect.gen(function* () {
    const info: SessionV1.Assistant = {
      id: MessageID.ascending(),
      sessionID: root.sessionID,
      role: "assistant",
      parentID: root.messageID,
      providerID: model.providerID,
      modelID: model.modelID,
      mode: "repa",
      agent: "repa",
      path: { cwd: "/", root: "/" },
      cost: 0,
      tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: time, ...(completed ? { completed: time } : {}) },
      ...(error ? { error } : {}),
    }
    yield* db.run(sql`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (${info.id}, ${info.sessionID}, ${time}, ${time}, ${JSON.stringify({
        role: info.role,
        parentID: info.parentID,
        providerID: info.providerID,
        modelID: info.modelID,
        mode: info.mode,
        agent: info.agent,
        path: info.path,
        cost: info.cost,
        tokens: info.tokens,
        time: info.time,
        error: info.error,
      })})
    `)
    return info
  })
}

function admitModel(db: Db, root: Root, assistant: SessionV1.Assistant, time: number) {
  return db.transaction((tx) =>
    TurnLifecycle.admitModel(tx, {
      turnID: root.turnID,
      sessionID: root.sessionID,
      assistantMessageID: assistant.id,
      requestEnvelope: { prompt: assistant.id },
      contextFingerprint: fingerprint(`context:${assistant.id}`),
      snapshotFrontier: { sequence: 0, time: 0 },
      timeAdmitted: time,
    }),
  )
}

function addTextPart(db: Db, assistant: SessionV1.Assistant, time: number, text: string) {
  const id = PartID.ascending()
  return db.run(sql`
    INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
    VALUES (${id}, ${assistant.id}, ${assistant.sessionID}, ${time}, ${time}, ${JSON.stringify({ type: "text", text })})
  `)
}

function addToolPart(
  db: Db,
  assistant: SessionV1.Assistant,
  time: number,
  status: "pending" | "running" | "completed" | "error" | "interrupted",
) {
  return Effect.gen(function* () {
    const id = PartID.ascending()
    const part: SessionV1.ToolPart = {
      id,
      messageID: assistant.id,
      sessionID: assistant.sessionID,
      type: "tool",
      callID: `call-${id}`,
      tool: "read",
      state:
        status === "pending"
          ? { status, input: { path: "README.md" }, raw: '{"path":"README.md"}' }
          : status === "running"
            ? { status, input: { path: "README.md" }, title: "Read", time: { start: time } }
            : status === "completed"
              ? {
                  status,
                  input: { path: "README.md" },
                  output: "durable result",
                  title: "Read",
                  metadata: {},
                  time: { start: time, end: time + 1 },
                }
              : {
                  status: "error",
                  input: { path: "README.md" },
                  error: status === "interrupted" ? "Tool execution aborted" : "Tool failed",
                  ...(status === "interrupted" ? { metadata: { interrupted: true } } : {}),
                  time: { start: time, end: time + 1 },
                },
    }
    yield* db.run(sql`
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
      VALUES (${id}, ${assistant.id}, ${assistant.sessionID}, ${time}, ${time}, ${JSON.stringify({
        type: part.type,
        callID: part.callID,
        tool: part.tool,
        state: part.state,
      })})
    `)
    return part
  })
}

function candidates(parts: readonly SessionV1.ToolPart[]) {
  return parts.map((part) => ({
    partID: part.id,
    callID: part.callID,
    tool: part.tool,
    envelope: { input: part.state.input },
  }))
}

function sealModel(
  db: Db,
  root: Root,
  assistant: SessionV1.Assistant,
  parts: readonly SessionV1.ToolPart[],
  time: number,
) {
  return db.transaction((tx) =>
    TurnLifecycle.sealCandidateSet(tx, {
      turnID: root.turnID,
      sessionID: root.sessionID,
      assistantMessageID: assistant.id,
      candidates: candidates(parts),
      timeSealed: time,
    }),
  )
}

function settleModel(db: Db, root: Root, assistant: SessionV1.Assistant, time: number) {
  return db.transaction((tx) =>
    TurnLifecycle.settleModel(tx, {
      turnID: root.turnID,
      assistantMessageID: assistant.id,
      state: "completed",
      time,
    }),
  )
}

function admitTool(db: Db, root: Root, assistant: SessionV1.Assistant, part: SessionV1.ToolPart, time: number) {
  return db.transaction((tx) =>
    TurnLifecycle.admitTool(tx, {
      turnID: root.turnID,
      sessionID: root.sessionID,
      assistantMessageID: assistant.id,
      partID: part.id,
      timeAdmitted: time,
    }),
  )
}

function registerUnsealedCandidate(
  db: Db,
  root: Root,
  assistant: SessionV1.Assistant,
  part: SessionV1.ToolPart,
  time: number,
) {
  const envelope = { input: part.state.input }
  return db.transaction((tx) =>
    Effect.gen(function* () {
      yield* tx
        .insert(TurnToolCandidateTable)
        .values({
          part_id: part.id,
          turn_id: root.turnID,
          session_id: root.sessionID,
          assistant_message_id: assistant.id,
          call_id: part.callID,
          tool: part.tool,
          emission_ordinal: 0,
          state: "pending_admission",
          normalized_envelope: envelope,
          envelope_fingerprint: TurnLifecycle.envelopeFingerprint(envelope),
          time_registered: time,
        })
        .run()
        .pipe(Effect.orDie)
      yield* tx
        .insert(TurnCandidatePresentationTable)
        .values({ part_id: part.id, session_id: root.sessionID })
        .run()
        .pipe(Effect.orDie)
    }),
  )
}

function invocationState(db: Db, partID: PartID) {
  return db
    .select({ state: sql<string>`state` })
    .from(sql`turn_tool_invocation`)
    .where(sql`part_id = ${partID}`)
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row?.state),
    )
}

function modelState(db: Db, messageID: MessageID) {
  return db
    .select({ state: sql<string>`state` })
    .from(sql`turn_model_operation`)
    .where(sql`assistant_message_id = ${messageID}`)
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row?.state),
    )
}

function toolPart(messageID: MessageID, partID: PartID) {
  return MessageV2.parts(messageID).pipe(
    Effect.map((parts) => parts.find((part): part is SessionV1.ToolPart => part.id === partID && part.type === "tool")),
    Effect.flatMap((part) => (part ? Effect.succeed(part) : Effect.die(`Tool Part not found: ${partID}`))),
  )
}

function operationCounts(db: Db) {
  return db
    .get(
      sql`
      SELECT
        (SELECT count(*) FROM turn_model_operation) AS models,
        (SELECT count(*) FROM turn_tool_invocation) AS tools
    `,
    )
    .pipe(Effect.orDie)
}

function recoverySnapshot(db: Db) {
  return Effect.all({
    turns: db.all(sql`SELECT id, state, terminal_reason, time_terminal FROM turn ORDER BY id`).pipe(Effect.orDie),
    models: db
      .all(
        sql`SELECT assistant_message_id, state, candidates_sealed, candidate_count, time_settled FROM turn_model_operation ORDER BY assistant_message_id`,
      )
      .pipe(Effect.orDie),
    candidates: db
      .all(sql`SELECT part_id, state, time_terminal FROM turn_tool_candidate ORDER BY part_id`)
      .pipe(Effect.orDie),
    tools: db
      .all(sql`SELECT part_id, state, time_settled FROM turn_tool_invocation ORDER BY part_id`)
      .pipe(Effect.orDie),
    messages: db
      .select({ id: MessageTable.id, data: MessageTable.data })
      .from(MessageTable)
      .orderBy(asc(MessageTable.id))
      .all()
      .pipe(Effect.orDie),
    parts: db
      .select({ id: PartTable.id, data: PartTable.data })
      .from(PartTable)
      .orderBy(asc(PartTable.id))
      .all()
      .pipe(Effect.orDie),
    events: db
      .select({ id: EventTable.id, aggregateID: EventTable.aggregate_id, seq: EventTable.seq, type: EventTable.type })
      .from(EventTable)
      .orderBy(asc(EventTable.aggregate_id), asc(EventTable.seq))
      .all()
      .pipe(Effect.orDie),
  })
}

function fingerprint(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}
