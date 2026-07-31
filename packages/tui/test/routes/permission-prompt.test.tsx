/** @jsxImportSource @opentui/solid */
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { TuiConfigProvider } from "../../src/config"
import { KVProvider } from "../../src/context/kv"
import { LocationProvider } from "../../src/context/location"
import { SDKProvider } from "../../src/context/sdk"
import { SyncContext, useSync } from "../../src/context/sync"
import { ThemeProvider } from "../../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"
import { PermissionPrompt } from "../../src/routes/session/permission"
import { tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createFetch, eventSource } from "../fixture/tui-sdk"

const sessionID = "ses_maximum_goal"
const messageID = "msg_maximum_goal"
const callID = "call_maximum_goal"
const requestID = "per_maximum_goal"
const tail = "TAIL-SEMANTICS-REACHED"

function request(): PermissionRequest {
  const operations = Array.from({ length: LearnerGoal.MAX_OPERATIONS }, (_, operationIndex) => {
    const outcome = `Goal outcome ${operationIndex + 1}`
    return {
      ordinal: operationIndex,
      operation: "create" as const,
      result: "changed" as const,
      after: {
        schemaVersion: 2 as const,
        goalID: `goal-${operationIndex + 1}`,
        revisionID: `revision-${operationIndex + 1}`,
        version: 1,
        meaning: {
          outcome,
          conditions: Array.from({ length: LearnerGoal.MAX_CONDITIONS }, (_, conditionIndex) =>
            operationIndex === LearnerGoal.MAX_OPERATIONS - 1 && conditionIndex === LearnerGoal.MAX_CONDITIONS - 1
              ? tail
              : `Condition ${operationIndex + 1}.${conditionIndex + 1}`,
          ),
          scope: {
            type: "courses" as const,
            courseIDs: Array.from(
              { length: LearnerGoal.MAX_COURSES },
              (_, courseIndex) => `course-${operationIndex + 1}-${courseIndex + 1}`,
            ),
          },
          target: "none",
          disposition: "active" as const,
        },
      },
    }
  })
  const presentation = SemanticPresentation.proposal({
    kind: "learner_goals_v2_capability",
    binding: { sessionID, messageID, callID },
    commandFingerprint: "f".repeat(64),
    issuance: "root",
    operations,
  })
  return {
    id: requestID,
    sessionID,
    permission: "update_learner_goals",
    patterns: [LearnerGoal.PERMISSION_PATTERN],
    always: [LearnerGoal.PERMISSION_PATTERN],
    metadata: {
      goalKind: "learner_goal",
      commandFingerprint: "f".repeat(64),
      issuance: "root",
      operations,
      [PermissionV1.EXACT_REPLY_METADATA_KEY]: true,
      ...SemanticPresentation.metadata(presentation),
    },
    tool: { messageID, callID },
  }
}

async function frame(app: Awaited<ReturnType<typeof testRender>>, includes: string, timeout = 2000) {
  const start = Date.now()
  let last = ""
  while (true) {
    await app.renderOnce()
    const value = app.captureCharFrame()
    last = value
    if (value.includes(includes)) return value
    if (Date.now() - start > timeout) {
      throw new Error(`Timed out waiting for rendered text: ${includes}\n\n${last}`)
    }
    await Bun.sleep(10)
  }
}

test("maximum legal Goal proposal scrolls to its tail without hiding permission controls", async () => {
  await using directory = await tmpdir()
  const state = path.join(directory.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const config = createTuiResolvedConfig()
  const calls = createFetch()
  const replies: unknown[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (new URL(request.url).pathname === `/permission/${requestID}/reply`) {
      replies.push(await request.clone().json())
      return new Response(JSON.stringify(true), { headers: { "content-type": "application/json" } })
    }
    return calls.fetch(input, init)
  }) as typeof globalThis.fetch
  const sync = {
    data: {
      session: [],
      part: {},
    },
  } as unknown as ReturnType<typeof useSync>

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const unregister = registerOpencodeKeymap(keymap, renderer, config)
    onCleanup(unregister)
    return (
      <TestTuiContexts directory={directory.path} paths={{ home: directory.path, state, worktree: directory.path }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
                <SDKProvider url="http://test" directory={directory.path} fetch={fetch} events={eventSource()}>
                  <LocationProvider>
                    <SyncContext.Provider value={sync}>
                      <PermissionPrompt request={request()} directory={directory.path} />
                    </SyncContext.Provider>
                  </LocationProvider>
                </SDKProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 140, height: 24, kittyKeyboard: true })
  try {
    const initial = await frame(app, "Update these learner Goals")
    expect(initial).not.toContain(tail)
    expect(initial).toContain("Allow once")
    expect(initial).toContain("Allow always")
    expect(initial).toContain("Reject")
    expect(initial).toContain("Cancel")
    expect(initial).toContain("scroll scope")

    app.mockInput.pressKey("END")
    const scrolled = await frame(app, tail)
    expect(scrolled).toContain("Allow once")
    expect(scrolled).toContain("Allow always")
    expect(scrolled).toContain("Reject")
    expect(scrolled).toContain("Cancel")
    expect(scrolled).toContain("scroll scope")

    app.mockInput.pressKey("ESCAPE")
    const start = Date.now()
    while (replies.length === 0) {
      await app.renderOnce()
      if (Date.now() - start > 2000) throw new Error("Timed out waiting for exact permission cancel reply")
      await Bun.sleep(10)
    }
    expect(replies).toEqual([{ reply: "cancel" }])
  } finally {
    app.renderer.destroy()
  }
})
