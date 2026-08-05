/** @jsxImportSource @opentui/solid */
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { mkdir } from "node:fs/promises"
import { createSignal, onCleanup, onMount } from "solid-js"
import { Prompt, type PromptRef } from "../src/component/prompt"
import { FrecencyProvider } from "../src/component/prompt/frecency"
import { PromptHistoryProvider } from "../src/component/prompt/history"
import { PromptStashProvider } from "../src/component/prompt/stash"
import { resolve, TuiConfigProvider } from "../src/config"
import { ArgsProvider } from "../src/context/args"
import { ClipboardProvider } from "../src/context/clipboard"
import { DataProvider } from "../src/context/data"
import { EditorContextProvider } from "../src/context/editor"
import { ExitProvider } from "../src/context/exit"
import { KVProvider } from "../src/context/kv"
import { LocalProvider } from "../src/context/local"
import { LocationProvider } from "../src/context/location"
import { PermissionProvider } from "../src/context/permission"
import { ProjectProvider } from "../src/context/project"
import { RouteProvider } from "../src/context/route"
import {
  TuiPathsProvider,
  TuiStartupProvider,
  TuiTerminalEnvironmentProvider,
} from "../src/context/runtime"
import { SDKProvider, type EventSource } from "../src/context/sdk"
import { SyncProvider, useSync } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { DialogProvider } from "../src/ui/dialog"
import { ToastProvider } from "../src/ui/toast"

async function waitFor(condition: () => boolean, message: string, timeout = 20_000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(`Gate 18 TUI carrier timed out: ${message}`)
    await Bun.sleep(10)
  }
}

export async function runTuiCarrier(input: {
  directory: string
  state: string
  fetch: typeof globalThis.fetch
  events: EventSource
  text: string
}) {
  await mkdir(input.state, { recursive: true })
  await Bun.write(`${input.state}/kv.json`, JSON.stringify({ animations_enabled: false }))

  let prompt: PromptRef | undefined
  let sync!: ReturnType<typeof useSync>
  let mounted!: () => void
  const ready = new Promise<void>((resolveReady) => {
    mounted = resolveReady
  })
  const [disabled] = createSignal(false)

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
    const config = resolve({}, { terminalSuspend: false })
    const unregister = registerOpencodeKeymap(keymap, renderer, config)
    onCleanup(unregister)

    return (
      <TuiPathsProvider
        value={{
          cwd: input.directory,
          home: input.state,
          state: input.state,
          worktree: input.directory,
        }}
      >
        <TuiTerminalEnvironmentProvider value={{ platform: "win32" }}>
          <TuiStartupProvider value={{ skipInitialLoading: false }}>
            <ClipboardProvider value={{}}>
              <OpencodeKeymapProvider keymap={keymap}>
                <ArgsProvider model="openai/gpt-5.6-luna" agent="repa">
                  <KVProvider>
                    <ToastProvider>
                      <RouteProvider initialRoute={{ type: "home" }}>
                        <TuiConfigProvider config={config}>
                          <SDKProvider
                            url="http://repa.internal"
                            directory={input.directory}
                            fetch={input.fetch}
                            events={input.events}
                          >
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
                                                    <LocationProvider location={{ directory: input.directory }}>
                                                      <Probe />
                                                      <Prompt
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
          </TuiStartupProvider>
        </TuiTerminalEnvironmentProvider>
      </TuiPathsProvider>
    )
  }

  const app = await testRender(() => <Harness />, { width: 120, height: 30, kittyKeyboard: true })
  try {
    await ready
    await waitFor(() => sync.status === "complete", "initial synchronization")
    await waitFor(() => prompt?.focused === true, "prompt focus")
    prompt!.set({ input: input.text, parts: [] })
    prompt!.submit()
  } finally {
    await waitFor(() => prompt?.current.input === "", "learner input submission")
    prompt?.reset()
    app.renderer.destroy()
  }
}

export function globalEventSource(input: {
  on: (handler: (event: GlobalEvent) => void) => void
  off: (handler: (event: GlobalEvent) => void) => void
}): EventSource {
  return {
    subscribe: async (handler) => {
      input.on(handler)
      return () => input.off(handler)
    },
  }
}
