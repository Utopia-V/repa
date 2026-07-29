/** @jsxImportSource @opentui/solid */
import type { GlobalEvent, TurnInfo, TurnInput } from "@opencode-ai/sdk/v2"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createSignal, onCleanup, onMount } from "solid-js"
import { ClipboardProvider, type ClipboardService } from "../../../src/context/clipboard"
import { DataProvider } from "../../../src/context/data"
import { EditorContextProvider } from "../../../src/context/editor"
import { ExitProvider } from "../../../src/context/exit"
import { KVProvider } from "../../../src/context/kv"
import { LocalProvider } from "../../../src/context/local"
import { LocationProvider } from "../../../src/context/location"
import { PermissionProvider } from "../../../src/context/permission"
import { ProjectProvider } from "../../../src/context/project"
import { RouteProvider } from "../../../src/context/route"
import { SDKProvider } from "../../../src/context/sdk"
import { SyncProvider, useSync } from "../../../src/context/sync"
import { ThemeProvider } from "../../../src/context/theme"
import { ArgsProvider } from "../../../src/context/args"
import { TuiConfigProvider } from "../../../src/config"
import { Prompt, type PromptRef } from "../../../src/component/prompt"
import { FrecencyProvider } from "../../../src/component/prompt/frecency"
import { PromptHistoryProvider } from "../../../src/component/prompt/history"
import { PromptStashProvider } from "../../../src/component/prompt/stash"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../../src/keymap"
import { DialogProvider } from "../../../src/ui/dialog"
import { ToastProvider } from "../../../src/ui/toast"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createEventSource, createFetch, deferred, directory, json, worktree } from "../../fixture/tui-sdk"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

const sessionID = "ses_prompt_delivery"

type DeliveryCall = {
  path: string
  body: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function bodyTurnID(call: DeliveryCall): string | undefined {
  if (!isRecord(call.body)) return undefined
  return typeof call.body.turnID === "string" ? call.body.turnID : undefined
}

function parts(call: DeliveryCall | undefined) {
  if (!isRecord(call?.body) || !Array.isArray(call.body.parts)) return []
  return call.body.parts
}

function model() {
  return {
    id: "model",
    providerID: "test",
    api: { id: "test", url: "http://test", npm: "@ai-sdk/openai-compatible" },
    name: "Test model",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: false, pdf: true },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 128_000, output: 8_000 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-01-01",
  }
}

function turnInfo(turnID: string): TurnInfo {
  return {
    id: turnID,
    sessionID,
    admissionKind: "learner",
    initialInputID: `${turnID}_input`,
    currentInputID: `${turnID}_input`,
    limits: { model: 8, tool: 32 },
    counters: { model: 0, tool: 0 },
    state: "running",
    depth: 0,
    timeAdmitted: 1,
    causalTime: 1,
  }
}

function turnInput(turnID: string): TurnInput {
  return {
    id: `${turnID}_input`,
    turnID,
    sessionID,
    messageID: `${turnID}_message`,
    source: "learner_root",
    ordinal: 0,
    occurrenceID: `${turnID}_occurrence`,
    timeAdmitted: 1,
    envelopeFingerprint: `${turnID}_fingerprint`,
  }
}

function turnStarted(turnID: string, timestamp = 1): GlobalEvent {
  return {
    directory,
    project: "proj_test",
    payload: {
      id: `evt_${turnID}_started`,
      type: "turn.started",
      properties: {
        sessionID,
        turnID,
        timestamp,
        turn: turnInfo(turnID),
        input: turnInput(turnID),
      },
    },
  }
}

function turnTerminal(turnID: string, timestamp = 2): GlobalEvent {
  return {
    directory,
    project: "proj_test",
    payload: {
      id: `evt_${turnID}_terminal_${timestamp}`,
      type: "turn.terminal",
      properties: {
        sessionID,
        turnID,
        timestamp,
        terminal: {
          outcome: "completed",
          reason: "normal",
          counters: { model: 1, tool: 0 },
          time: timestamp,
        },
      },
    },
  }
}

function sessionStatus(type: "busy" | "idle", timestamp = 1): GlobalEvent {
  return {
    directory,
    project: "proj_test",
    payload: {
      id: `evt_status_${type}_${timestamp}`,
      type: "session.status",
      properties: {
        sessionID,
        status: { type },
      },
    },
  }
}

async function wait(fn: () => boolean, timeout = 3000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

async function mountPrompt(input?: {
  clipboard?: ClipboardService
  currentWorkBinding?: string
  width?: number
  start?: (call: DeliveryCall) => Response | Promise<Response>
  steer?: (call: DeliveryCall) => Response | Promise<Response>
}) {
  const tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), JSON.stringify({ animations_enabled: false }))

  const calls = {
    start: [] as DeliveryCall[],
    steer: [] as DeliveryCall[],
  }
  const events = createEventSource()
  const base = createFetch((url) => {
    if (url.pathname === "/config/providers") {
      const info = model()
      return json({
        providers: [
          {
            id: "test",
            name: "Test provider",
            source: "custom",
            env: [],
            options: {},
            models: { [info.id]: info },
          },
        ],
        default: { test: info.id },
      })
    }
    if (url.pathname === "/agent")
      return json([
        {
          name: "tutor",
          mode: "primary",
          permission: [],
          model: { providerID: "test", modelID: "model" },
          options: {},
        },
      ])
    return undefined
  }, events)
  const fetch = Object.assign(
    async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      const request = requestInput instanceof Request ? requestInput : new Request(requestInput, init)
      const url = new URL(request.url)
      if (request.method === "POST" && url.pathname === `/session/${sessionID}/turn`) {
        const call = { path: url.pathname, body: await request.clone().json() }
        calls.start.push(call)
        return input?.start?.(call) ?? json(turnInfo(bodyTurnID(call) ?? "trn_started"))
      }
      if (
        request.method === "POST" &&
        url.pathname.startsWith(`/session/${sessionID}/turn/`) &&
        url.pathname.endsWith("/steer")
      ) {
        const call = { path: url.pathname, body: await request.clone().json() }
        calls.steer.push(call)
        const turnID = url.pathname.split("/").at(-2) ?? "trn_steered"
        return input?.steer?.(call) ?? json(turnInput(turnID))
      }
      return base.fetch(request)
    },
    { preconnect: globalThis.fetch.preconnect },
  )

  let prompt: PromptRef | undefined
  let sync!: ReturnType<typeof useSync>
  let mounted!: () => void
  const [disabled, setDisabled] = createSignal(false)
  const ready = new Promise<void>((resolve) => {
    mounted = resolve
  })

  function Probe() {
    const current = useSync()
    onMount(() => {
      sync = current
      mounted()
    })
    return <box />
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({
      keybinds: input?.currentWorkBinding ? { session_steer: input.currentWorkBinding } : {},
      leader_timeout: 1000,
    })
    const off = registerOpencodeKeymap(keymap, renderer, config)
    onCleanup(off)

    return (
      <TestTuiContexts
        directory={directory}
        paths={{
          home: tmp.path,
          state,
          worktree,
        }}
      >
        <ClipboardProvider value={input?.clipboard ?? {}}>
          <OpencodeKeymapProvider keymap={keymap}>
            <ArgsProvider>
              <KVProvider>
                <ToastProvider>
                  <RouteProvider initialRoute={{ type: "session", sessionID }}>
                    <TuiConfigProvider config={config}>
                      <SDKProvider url="http://test" directory={directory} fetch={fetch} events={events.source}>
                        <PermissionProvider>
                          <ProjectProvider>
                            <ExitProvider exit={() => {}}>
                              <SyncProvider>
                                <DataProvider>
                                  <ThemeProvider mode="dark">
                                    <LocalProvider>
                                      <PromptStashProvider>
                                        <DialogProvider>
                                          <FrecencyProvider>
                                            <PromptHistoryProvider>
                                              <EditorContextProvider integration={{}}>
                                                <LocationProvider location={{ directory }}>
                                                  <Probe />
                                                  <Prompt
                                                    sessionID={sessionID}
                                                    disabled={disabled()}
                                                    ref={(value) => value && (prompt = value)}
                                                  />
                                                </LocationProvider>
                                              </EditorContextProvider>
                                            </PromptHistoryProvider>
                                          </FrecencyProvider>
                                        </DialogProvider>
                                      </PromptStashProvider>
                                    </LocalProvider>
                                  </ThemeProvider>
                                </DataProvider>
                              </SyncProvider>
                            </ExitProvider>
                          </ProjectProvider>
                        </PermissionProvider>
                      </SDKProvider>
                    </TuiConfigProvider>
                  </RouteProvider>
                </ToastProvider>
              </KVProvider>
            </ArgsProvider>
          </OpencodeKeymapProvider>
        </ClipboardProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: input?.width ?? 120, height: 30, kittyKeyboard: true })
  await ready
  await wait(() => sync.status === "complete" && prompt?.focused === true)
  if (!prompt) throw new Error("prompt did not mount")
  const mountedPrompt = prompt
  let disposed = false

  async function dispose() {
    if (disposed) return
    disposed = true
    mountedPrompt.reset()
    app.renderer.destroy()
    await tmp[Symbol.asyncDispose]()
  }

  return {
    app,
    calls,
    emit(event: GlobalEvent) {
      events.emit(event)
    },
    prompt: mountedPrompt,
    setDisabled,
    state,
    sync,
    cleanup: dispose,
    [Symbol.asyncDispose]: dispose,
  }
}

async function busy(prompt: Awaited<ReturnType<typeof mountPrompt>>, turnID: string) {
  prompt.emit(turnStarted(turnID))
  prompt.emit(sessionStatus("busy"))
  await wait(
    () =>
      prompt.sync.session.activeTurn(sessionID) === turnID &&
      prompt.sync.data.session_status[sessionID]?.type === "busy",
  )
}

async function waitForFrame(prompt: Awaited<ReturnType<typeof mountPrompt>>, predicate: (frame: string) => boolean) {
  let frame = ""
  try {
    await wait(() => {
      frame = prompt.app.captureCharFrame()
      return predicate(frame)
    })
  } catch {
    throw new Error(`timed out waiting for frame:\n${frame}`)
  }
  return frame
}

function text(call: DeliveryCall | undefined) {
  const item = parts(call).find((part) => isRecord(part) && part.type === "text")
  return isRecord(item) && typeof item.text === "string" ? item.text : undefined
}

test("busy send stays editable and unadmitted before one latest-payload start", async () => {
  await using prompt = await mountPrompt({ currentWorkBinding: "ctrl+y", width: 72 })
  const turnA = "trn_busy_a"
  await busy(prompt, turnA)

  const footer = await waitForFrame(
    prompt,
    (frame) =>
      frame.includes("send after this response") &&
      frame.includes("ctrl+y") &&
      frame.includes("add/correct this response"),
  )
  expect(footer.toLowerCase()).not.toContain("steer")

  prompt.prompt.set({ input: "review eigenvectors later", parts: [] })
  prompt.app.mockInput.pressEnter()
  const selected = await waitForFrame(prompt, (frame) => frame.includes("send after this response · editable"))
  expect(selected).toContain("this window")
  expect(selected).toContain("only")

  expect(prompt.calls).toEqual({ start: [], steer: [] })
  expect(prompt.prompt.current.input).toBe("review eigenvectors later")
  expect(await Bun.file(path.join(prompt.state, "prompt-history.jsonl")).exists()).toBe(false)
  expect(await Bun.file(path.join(prompt.state, "prompt-stash.jsonl")).exists()).toBe(false)

  const latest = "review right eigenvectors later [notes.txt]"
  const attachment = "[notes.txt]"
  const attachmentStart = latest.indexOf(attachment)
  prompt.prompt.set({
    input: latest,
    parts: [
      {
        type: "file",
        mime: "text/plain",
        filename: "notes.txt",
        url: "file:///notes.txt",
        source: {
          type: "file",
          path: "notes.txt",
          text: {
            value: attachment,
            start: attachmentStart,
            end: attachmentStart + attachment.length,
          },
        },
      },
    ],
  })
  prompt.emit(turnTerminal(turnA))
  await wait(() => prompt.sync.session.activeTurn(sessionID) === undefined)
  expect(prompt.sync.data.session_status[sessionID]?.type).toBe("busy")
  expect(prompt.app.captureCharFrame()).toContain("send after this response · editable")
  expect(prompt.calls.start).toHaveLength(0)

  prompt.emit(sessionStatus("idle", 2))
  await wait(() => prompt.sync.data.session_status[sessionID]?.type === "idle")
  await wait(() => prompt.calls.start.length === 1 && prompt.prompt.current.input === "")
  expect(text(prompt.calls.start[0])).toBe(latest)
  expect(parts(prompt.calls.start[0])[1]).toMatchObject({
    type: "file",
    mime: "text/plain",
    filename: "notes.txt",
    url: "file:///notes.txt",
  })
  expect(prompt.calls.steer).toHaveLength(0)
})

test("removing a later-selected draft prevents promotion", async () => {
  await using prompt = await mountPrompt()
  const turnA = "trn_remove_a"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "do this later", parts: [] })
  prompt.app.mockInput.pressEnter()
  await waitForFrame(prompt, (frame) => frame.includes("this window only"))

  prompt.prompt.reset()
  prompt.emit(turnTerminal(turnA))
  prompt.emit(sessionStatus("idle", 2))
  await Bun.sleep(50)

  expect(prompt.prompt.current.input).toBe("")
  expect(prompt.calls).toEqual({ start: [], steer: [] })
})

test("a busy draft without an exact visible response is not selected or later retargeted", async () => {
  await using prompt = await mountPrompt()
  prompt.emit(sessionStatus("busy"))
  await wait(() => prompt.sync.data.session_status[sessionID]?.type === "busy")

  prompt.prompt.set({ input: "keep this exact draft", parts: [] })
  prompt.app.mockInput.pressEnter()
  await Bun.sleep(30)
  expect(prompt.app.captureCharFrame()).not.toContain("send after this response · editable")

  prompt.emit(turnStarted("trn_late_visible", 2))
  await Bun.sleep(50)

  expect(prompt.prompt.current.input).toBe("keep this exact draft")
  expect(prompt.calls).toEqual({ start: [], steer: [] })
})

test("busy Enter freezes A before deferred text flush and never reanchors the draft to B", async () => {
  await using prompt = await mountPrompt()
  const turnA = "trn_capture_a"
  const turnB = "trn_capture_b"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "send this after A, never B", parts: [] })
  prompt.app.mockInput.pressEnter()
  prompt.emit(turnTerminal(turnA, 2))
  prompt.emit(turnStarted(turnB, 3))
  prompt.emit(sessionStatus("busy", 3))

  await wait(() => prompt.sync.session.activeTurn(sessionID) === turnB)
  await waitForFrame(prompt, (frame) => frame.includes("not sent"))
  expect(prompt.prompt.current.input).toBe("send this after A, never B")
  expect(prompt.calls).toEqual({ start: [], steer: [] })

  prompt.emit(turnTerminal(turnB, 4))
  prompt.emit(sessionStatus("idle", 4))
  await Bun.sleep(50)
  expect(prompt.calls).toEqual({ start: [], steer: [] })
})

test("a complete competing B cycle during the deferred text flush leaves the draft undelivered", async () => {
  await using prompt = await mountPrompt()
  const turnA = "trn_capture_cycle_a"
  const turnB = "trn_capture_cycle_b"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "send this after A, not after an already-finished B", parts: [] })
  prompt.app.mockInput.pressEnter()
  prompt.emit(turnTerminal(turnA, 2))
  prompt.emit(turnStarted(turnB, 3))
  prompt.emit(sessionStatus("busy", 3))
  prompt.emit(turnTerminal(turnB, 4))
  prompt.emit(sessionStatus("idle", 4))

  await waitForFrame(prompt, (frame) => frame.includes("not sent"))
  await Bun.sleep(50)
  expect(prompt.sync.session.activeTurn(sessionID)).toBeUndefined()
  expect(prompt.sync.data.session_status[sessionID]?.type).toBe("idle")
  expect(prompt.prompt.current.input).toBe("send this after A, not after an already-finished B")
  expect(prompt.calls).toEqual({ start: [], steer: [] })
})

test("busy shell mode does not present learning-delivery actions", async () => {
  await using prompt = await mountPrompt()
  await busy(prompt, "trn_shell_a")

  prompt.app.mockInput.pressKey("!")
  const frame = await waitForFrame(prompt, (frame) => frame.includes("exit shell mode"))

  expect(frame).not.toContain("send after this response")
  expect(frame).not.toContain("add/correct this response")
})

test("a later-selected draft gets one terminal failure when the composer becomes unavailable", async () => {
  await using prompt = await mountPrompt()
  const turnA = "trn_disabled_a"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "preserve this draft", parts: [] })
  prompt.app.mockInput.pressEnter()
  await waitForFrame(prompt, (frame) => frame.includes("this window only"))

  prompt.setDisabled(true)
  prompt.emit(turnTerminal(turnA))
  prompt.emit(sessionStatus("idle", 2))
  await waitForFrame(prompt, (frame) => frame.includes("not sent"))

  prompt.setDisabled(false)
  prompt.emit(sessionStatus("busy", 3))
  prompt.emit(sessionStatus("idle", 4))
  await Bun.sleep(50)

  expect(prompt.prompt.current.input).toBe("preserve this draft")
  expect(prompt.calls).toEqual({ start: [], steer: [] })
})

test("current-response reclassification consumes later delivery and targets A once", async () => {
  const response = deferred<Response>()
  await using prompt = await mountPrompt({
    currentWorkBinding: "ctrl+y",
    steer: () => response.promise,
  })
  const turnA = "trn_correct_a"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "answer this after", parts: [] })
  prompt.app.mockInput.pressEnter()
  await waitForFrame(prompt, (frame) => frame.includes("this window only"))
  prompt.prompt.set({ input: "correction for the current response", parts: [] })
  prompt.app.mockInput.pressKey("y", { ctrl: true })
  await wait(() => prompt.calls.steer.length === 1)

  prompt.emit(turnTerminal(turnA))
  prompt.emit(sessionStatus("idle", 2))
  response.resolve(json(turnInput(turnA)))
  await wait(() => prompt.prompt.current.input === "")

  expect(prompt.calls.steer[0]?.path).toBe(`/session/${sessionID}/turn/${turnA}/steer`)
  expect(text(prompt.calls.steer[0])).toBe("correction for the current response")
  expect(prompt.calls.start).toHaveLength(0)
})

test("a lost exact-current race becomes undelivered without fallback", async () => {
  const response = deferred<Response>()
  await using prompt = await mountPrompt({ steer: () => response.promise })
  const turnA = "trn_raced_a"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "wait, correct that", parts: [] })
  prompt.app.mockInput.pressEnter({ ctrl: true })
  await wait(() => prompt.calls.steer.length === 1)

  prompt.emit(turnTerminal(turnA))
  prompt.emit(turnStarted("trn_raced_b", 3))
  prompt.emit(sessionStatus("busy", 3))
  response.resolve(
    json({ name: "TurnActiveMismatchError", data: { message: "the active response changed" } }, { status: 409 }),
  )
  await waitForFrame(prompt, (frame) => frame.includes("not sent"))
  await Bun.sleep(50)

  expect(prompt.calls.steer[0]?.path).toBe(`/session/${sessionID}/turn/${turnA}/steer`)
  expect(prompt.prompt.current.input).toBe("wait, correct that")
  expect(prompt.calls.start).toHaveLength(0)
  expect(prompt.calls.steer).toHaveLength(1)
})

test("an async paste started before submission cannot rewrite the claimed snapshot", async () => {
  const clipboard = deferred<{ data: string; mime: string } | undefined>()
  const response = deferred<Response>()
  let reading = false
  await using prompt = await mountPrompt({
    clipboard: {
      read: () => {
        reading = true
        return clipboard.promise
      },
    },
    start: () => response.promise,
  })

  prompt.prompt.set({ input: "submit the frozen draft", parts: [] })
  prompt.app.mockInput.pressKey("v", { ctrl: true })
  await wait(() => reading)

  prompt.app.mockInput.pressEnter()
  await wait(() => prompt.calls.start.length === 1)
  clipboard.resolve({ data: "late clipboard text", mime: "text/plain" })
  await Bun.sleep(30)

  expect(text(prompt.calls.start[0])).toBe("submit the frozen draft")
  expect(prompt.prompt.current.input).toBe("submit the frozen draft")

  response.resolve(json(turnInfo(bodyTurnID(prompt.calls.start[0]) ?? "trn_frozen")))
  await wait(() => prompt.prompt.current.input === "")
  expect(prompt.calls.start).toHaveLength(1)
})

test("B becoming active before idle ends later delivery without dispatch or delayed promotion", async () => {
  await using prompt = await mountPrompt()
  const turnA = "trn_before_idle_a"
  const turnB = "trn_before_idle_b"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "do not move this question to B", parts: [] })
  prompt.app.mockInput.pressEnter()
  await waitForFrame(prompt, (frame) => frame.includes("this window only"))

  prompt.emit(turnTerminal(turnA))
  await Bun.sleep(50)
  expect(prompt.calls.start).toHaveLength(0)

  prompt.emit(turnStarted(turnB, 3))
  await waitForFrame(prompt, (frame) => frame.includes("not sent"))
  expect(prompt.calls).toEqual({ start: [], steer: [] })

  prompt.emit(turnTerminal(turnB, 4))
  prompt.emit(sessionStatus("idle", 4))
  await Bun.sleep(50)

  expect(prompt.prompt.current.input).toBe("do not move this question to B")
  expect(prompt.calls).toEqual({ start: [], steer: [] })
})

test("a later start that loses to B remains undelivered and is never retried or retargeted", async () => {
  const response = deferred<Response>()
  await using prompt = await mountPrompt({ start: () => response.promise })
  const turnA = "trn_later_a"
  const turnB = "trn_later_b"
  await busy(prompt, turnA)

  prompt.prompt.set({ input: "independent next question", parts: [] })
  prompt.app.mockInput.pressEnter()
  await waitForFrame(prompt, (frame) => frame.includes("this window only"))
  prompt.emit(turnTerminal(turnA))
  prompt.emit(sessionStatus("idle", 2))
  await wait(() => prompt.calls.start.length === 1)

  prompt.emit(turnStarted(turnB, 3))
  prompt.emit(sessionStatus("busy", 3))
  response.resolve(
    json({ name: "SessionBusyError", data: { message: "another response won admission" } }, { status: 409 }),
  )
  await waitForFrame(prompt, (frame) => frame.includes("not sent"))

  prompt.emit(turnTerminal(turnB, 4))
  prompt.emit(sessionStatus("idle", 4))
  await Bun.sleep(50)

  expect(text(prompt.calls.start[0])).toBe("independent next question")
  expect(prompt.prompt.current.input).toBe("independent next question")
  expect(prompt.calls.start).toHaveLength(1)
  expect(prompt.calls.steer).toHaveLength(0)
})
