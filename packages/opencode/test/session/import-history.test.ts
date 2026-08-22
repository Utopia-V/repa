import { describe, expect, test } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { SessionPresentation } from "@opencode-ai/core/session-presentation"
import { SessionImportHistory } from "@/session/import-history"

const sessionID = "ses_01J5Y5H0AH4Q4NXJ6P4C3P5V2M"
const userMessageID = "msg_01J5Y5H0AH4Q4NXJ6P4C3P5V2N"
const assistantMessageID = "msg_01J5Y5H0AH4Q4NXJ6P4C3P5V2P"
const textPartID = "prt_01J5Y5H0AH4Q4NXJ6P4C3P5V2Q"

type RawBundle = {
  type: string
  schemaVersion: number
  sourceDatabaseID: string
  info: Record<string, unknown>
  messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>
}

function bundle(): RawBundle {
  return {
    type: "repa_session_offline_history",
    schemaVersion: 1,
    sourceDatabaseID: `lhm_${"1".repeat(32)}`,
    info: {
      id: sessionID,
      slug: "offline-history",
      projectID: "source-project",
      directory: "/source/project",
      title: "Offline history",
      version: "1",
      time: { created: 1, updated: 1 },
    },
    messages: [
      {
        info: {
          id: userMessageID,
          sessionID,
          role: "user",
          time: { created: 2 },
          agent: "repa",
          model: { providerID: "test", modelID: "test-model" },
        },
        parts: [{ id: textPartID, sessionID, messageID: userMessageID, type: "text", text: "history" }],
      },
    ],
  }
}

async function failure(value: unknown) {
  const exit = await Effect.runPromise(SessionImportHistory.decode(JSON.stringify(value)).pipe(Effect.exit))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("Expected offline-history decoding to fail")
  return Cause.squash(exit.cause)
}

describe("SessionImportHistory.decode", () => {
  test("accepts one complete renderable closed history bundle", async () => {
    const decoded = await Effect.runPromise(SessionImportHistory.decode(JSON.stringify(bundle())))
    expect(decoded).toMatchObject({
      historyFrontierTime: 2,
      topLevelPartCount: 1,
      allPartCount: 1,
      bundle: { info: { id: sessionID }, messages: [{ info: { id: userMessageID } }] },
    })
  })

  test("rejects empty and nonrenderable history", async () => {
    const empty = bundle()
    empty.messages = []
    expect(await failure(empty)).toMatchObject({
      _tag: "SessionImportHistory.UnusableError",
      reason: "zero_messages",
    })

    const nonrenderable = bundle()
    nonrenderable.messages[0]!.parts = []
    expect(await failure(nonrenderable)).toMatchObject({
      _tag: "SessionImportHistory.UnusableError",
      reason: "nonrenderable_history",
    })
  })

  test("rejects every live Session revert shape before materialization", async () => {
    for (const revert of [
      { messageID: userMessageID },
      { messageID: userMessageID, snapshot: "source-snapshot" },
      { messageID: userMessageID, diff: "source-diff" },
      { messageID: userMessageID, partID: textPartID, snapshot: "source-snapshot", diff: "source-diff" },
    ]) {
      const input = bundle()
      Object.assign(input.info, { revert })
      expect(await failure(input)).toMatchObject({
        _tag: "SessionImportHistory.UnsafeError",
        reason: "session_revert_present",
      })
    }
  })

  test("rejects duplicate identities, dangling typed references, and unstable canonical order", async () => {
    const duplicateMessage = bundle()
    duplicateMessage.messages.push(structuredClone(duplicateMessage.messages[0]!))
    expect(await failure(duplicateMessage)).toMatchObject({
      _tag: "SessionImportHistory.UnusableError",
      reason: "message_identity_or_membership",
    })

    const duplicatePart = bundle()
    duplicatePart.messages[0]!.parts.push(structuredClone(duplicatePart.messages[0]!.parts[0]!))
    expect(await failure(duplicatePart)).toMatchObject({
      _tag: "SessionImportHistory.UnusableError",
      reason: "part_identity_or_membership",
    })

    const danglingAssistant = bundle()
    danglingAssistant.messages.push({
      info: {
        id: assistantMessageID,
        sessionID,
        parentID: "msg_01J5Y5H0AH4Q4NXJ6P4C3P5V2Z",
        role: "assistant",
        mode: "repa",
        agent: "repa",
        cost: 0,
        path: { cwd: "/source/project", root: "/source/project" },
        time: { created: 3, completed: 4 },
        finish: "stop",
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        providerID: "test",
        modelID: "test-model",
      },
      parts: [],
    })
    expect(await failure(danglingAssistant)).toMatchObject({
      _tag: "SessionImportHistory.UnusableError",
      reason: "assistant_parent",
    })

    const danglingCompaction = bundle()
    danglingCompaction.messages[0]!.parts.push({
      id: "prt_01J5Y5H0AH4Q4NXJ6P4C3P5V2U",
      sessionID,
      messageID: userMessageID,
      type: "compaction",
      auto: true,
      tail_start_id: "msg_01J5Y5H0AH4Q4NXJ6P4C3P5V2Z",
    })
    expect(await failure(danglingCompaction)).toMatchObject({
      _tag: "SessionImportHistory.UnusableError",
      reason: "compaction_tail_reference",
    })

    const unstableOrder = bundle()
    unstableOrder.messages.push({
      info: {
        id: "msg_01J5Y5H0AH4Q4NXJ6P4C3P5V2R",
        sessionID,
        role: "user",
        time: { created: 1 },
        agent: "repa",
        model: { providerID: "test", modelID: "test-model" },
      },
      parts: [
        {
          id: "prt_01J5Y5H0AH4Q4NXJ6P4C3P5V2V",
          sessionID,
          messageID: "msg_01J5Y5H0AH4Q4NXJ6P4C3P5V2R",
          type: "text",
          text: "out of canonical order",
        },
      ],
    })
    expect(await failure(unstableOrder)).toMatchObject({
      _tag: "SessionImportHistory.UnusableError",
      reason: "noncanonical_message_order",
    })
  })

  test("rejects unfinished Tool and Assistant state", async () => {
    const pending = bundle()
    pending.messages[0]!.parts = [
      {
        id: textPartID,
        sessionID,
        messageID: userMessageID,
        type: "tool",
        tool: "shell",
        callID: "call_pending",
        state: { status: "pending", input: {}, raw: "{}" },
      },
    ]
    expect(await failure(pending)).toMatchObject({
      _tag: "SessionImportHistory.UnsafeError",
      reason: "unfinished_tool",
    })

    const running = bundle()
    running.messages[0]!.parts = [
      {
        id: textPartID,
        sessionID,
        messageID: userMessageID,
        type: "tool",
        tool: "shell",
        callID: "call_running",
        state: { status: "running", input: {}, time: { start: 2 } },
      },
    ]
    expect(await failure(running)).toMatchObject({
      _tag: "SessionImportHistory.UnsafeError",
      reason: "unfinished_tool",
    })

    const nonterminal = bundle()
    nonterminal.messages.push({
      info: {
        id: assistantMessageID,
        sessionID,
        parentID: userMessageID,
        role: "assistant",
        mode: "repa",
        agent: "repa",
        cost: 0,
        path: { cwd: "/source/project", root: "/source/project" },
        time: { created: 3 },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        providerID: "test",
        modelID: "test-model",
      },
      parts: [],
    })
    expect(await failure(nonterminal)).toMatchObject({
      _tag: "SessionImportHistory.UnsafeError",
      reason: "nonterminal_assistant",
    })

    const assistantSubtask = bundle()
    assistantSubtask.messages.push({
      info: {
        id: assistantMessageID,
        sessionID,
        parentID: userMessageID,
        role: "assistant",
        mode: "repa",
        agent: "repa",
        cost: 0,
        path: { cwd: "/source/project", root: "/source/project" },
        time: { created: 3, completed: 4 },
        finish: "stop",
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        providerID: "test",
        modelID: "test-model",
      },
      parts: [
        {
          id: "prt_01J5Y5H0AH4Q4NXJ6P4C3P5V2R",
          sessionID,
          messageID: assistantMessageID,
          type: "subtask",
          prompt: "unresolved imported work",
          description: "must stay inert",
          agent: "general",
        },
      ],
    })
    expect(await failure(assistantSubtask)).toMatchObject({
      _tag: "SessionImportHistory.UnsafeError",
      reason: "unresolved_subtask",
    })

    const unmatchedStep = bundle()
    unmatchedStep.messages[0]!.parts.push({
      id: "prt_01J5Y5H0AH4Q4NXJ6P4C3P5V2S",
      sessionID,
      messageID: userMessageID,
      type: "step-start",
    })
    expect(await failure(unmatchedStep)).toMatchObject({
      _tag: "SessionImportHistory.UnsafeError",
      reason: "unmatched_step_start",
    })

    const unresolvedCompaction = bundle()
    unresolvedCompaction.messages[0]!.parts.push({
      id: "prt_01J5Y5H0AH4Q4NXJ6P4C3P5V2T",
      sessionID,
      messageID: userMessageID,
      type: "compaction",
      auto: true,
    })
    expect(await failure(unresolvedCompaction)).toMatchObject({
      _tag: "SessionImportHistory.UnsafeError",
      reason: "unresolved_compaction",
    })
  })

  test("rejects unknown bundle shape and a history with no strict-successor time", async () => {
    expect(await failure({ ...bundle(), unexpected: true })).toMatchObject({
      _tag: "SessionImportHistory.DecodeError",
      reason: "unsupported_or_malformed_bundle",
    })

    const exhausted = bundle()
    ;(exhausted.messages[0]!.info.time as { created: number }).created = Number.MAX_SAFE_INTEGER
    expect(await failure(exhausted)).toBeInstanceOf(SessionPresentation.FrontierUnrepresentableError)

    const unsafeSessionTime = bundle()
    ;(unsafeSessionTime.info.time as { updated: number }).updated = Number.MAX_SAFE_INTEGER + 1
    expect(await failure(unsafeSessionTime)).toMatchObject({
      _tag: "SessionImportHistory.DecodeError",
      reason: "unsupported_or_malformed_bundle",
    })
  })
})

describe("SessionImportHistory.decodeCopyProposal", () => {
  test("rejects malformed identity and mapping shapes as typed confirmation failures", async () => {
    for (const value of [
      {},
      { schemaVersion: 2 },
      {
        schemaVersion: 1,
        sourceFileFingerprint: "0".repeat(64),
        sourceDatabaseID: `lhm_${"1".repeat(32)}`,
        targetDatabaseID: `lhm_${"2".repeat(32)}`,
        sourceSessionID: sessionID,
        targetSessionID: "not-a-session",
        turnID: "not-a-turn",
        inputID: "not-an-input",
        learnerMessageID: userMessageID,
        historyStartTime: 1,
        historyFrontierTime: 1,
        learnerPresentationTime: 2,
        mappingVersion: 1,
        messageMapping: null,
        partMapping: [],
        mappingFingerprint: "0".repeat(64),
        promptFingerprint: "0".repeat(64),
        requestFingerprint: "0".repeat(64),
      },
    ]) {
      const exit = await Effect.runPromise(
        SessionImportHistory.decodeCopyProposal(Buffer.from(JSON.stringify(value)).toString("base64url")).pipe(
          Effect.exit,
        ),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toBeInstanceOf(SessionImportHistory.ConfirmationError)
      }
    }
  })
})
