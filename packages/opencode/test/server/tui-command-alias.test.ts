import { afterEach, expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { GlobalBus, type GlobalEvent } from "../../src/bus/global"
import { Server } from "../../src/server/server"
import { TuiEvent } from "../../src/server/tui-event"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

test("legacy TUI aliases publish only commands retained by the active product", async () => {
  await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
  const sdk = createOpencodeClient({
    baseUrl: "http://test",
    directory: tmp.path,
    fetch: ((request: Request) => Server.Default().app.fetch(request)) as unknown as typeof fetch,
  })
  const commands: unknown[] = []
  const capture = (event: GlobalEvent) => {
    if (event.directory !== tmp.path) return
    if (event.payload.type !== TuiEvent.CommandExecute.type) return
    commands.push(event.payload.properties.command)
  }
  GlobalBus.on("event", capture)

  try {
    const responses = await Promise.all([
      sdk.tui.executeCommand({ command: "session_share" }),
      sdk.tui.executeCommand({ command: "unknown_legacy_alias" }),
      sdk.tui.executeCommand({ command: "toString" }),
      sdk.tui.executeCommand({ command: "__proto__" }),
      sdk.tui.executeCommand({ command: "session_new" }),
    ])

    expect(responses.map((response) => response.response.status)).toEqual([200, 200, 200, 200, 200])
    expect(commands).toEqual(["session.new"])
  } finally {
    GlobalBus.off("event", capture)
  }
})
