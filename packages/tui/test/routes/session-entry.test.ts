import { expect, test } from "bun:test"
import {
  canShowSessionPrompt,
  enterSession,
  type SessionDirectoryAccess,
} from "../../src/routes/session/entry"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("an aborted stale Session load cannot select its directory after a newer entry wins", async () => {
  const stale = deferred<{ directory: string } | undefined>()
  const staleController = new AbortController()
  const currentController = new AbortController()
  const calls: string[] = []
  let activeDirectory = "/learning/course-a"
  const access: { current: SessionDirectoryAccess } = { current: { status: "pending" } }

  const run = (sessionID: string, controller: AbortController) =>
    enterSession({
      sessionID,
      activeDirectory,
      signal: controller.signal,
      load: (id) =>
        id === "stale" ? stale.promise : Promise.resolve({ directory: "/learning/course-c" }),
      async selectDirectory(directory) {
        calls.push(`select:${directory}`)
        activeDirectory = directory
        return true
      },
      currentDirectory: () => activeDirectory,
      reconnect(directory) {
        calls.push(`reconnect:${directory}`)
      },
      async hydrateTranscript(id) {
        calls.push(`hydrate:${id}`)
      },
      setDirectoryAccess(next) {
        access.current = next
      },
    })

  const staleEntry = run("stale", staleController)
  staleController.abort()
  const currentEntry = run("current", currentController)
  await currentEntry
  stale.resolve({ directory: "/learning/course-b" })

  expect(await staleEntry).toEqual({ status: "stale" })
  expect(activeDirectory).toBe("/learning/course-c")
  expect(access.current).toEqual({ status: "ready" })
  expect(calls).toEqual([
    "select:/learning/course-c",
    "reconnect:/learning/course-c",
    "hydrate:current",
  ])
})

test("an unavailable material directory still hydrates the durable transcript without reconnecting", async () => {
  const calls: string[] = []
  const result = await enterSession({
    sessionID: "missing-material",
    activeDirectory: "/learning/course-a",
    signal: new AbortController().signal,
    load: async () => ({ directory: "/learning/missing" }),
    selectDirectory: async () => {
      throw new Error("directory unavailable")
    },
    currentDirectory: () => "/learning/course-a",
    reconnect(directory) {
      calls.push(`reconnect:${directory}`)
    },
    async hydrateTranscript(id) {
      calls.push(`hydrate:${id}`)
    },
    setDirectoryAccess() {},
  })

  expect(result.status).toBe("ready")
  expect(result.status === "ready" && result.directoryError).toBeInstanceOf(Error)
  expect(calls).toEqual(["hydrate:missing-material"])
})

test("keeps the prompt gate closed until directory selection and hydration are ready", async () => {
  const selected = deferred<boolean>()
  const access: { current: SessionDirectoryAccess } = { current: { status: "ready" } }
  const task = enterSession({
    sessionID: "target",
    activeDirectory: "/learning/course-a",
    signal: new AbortController().signal,
    load: async () => ({ directory: "/learning/course-b" }),
    selectDirectory: () => selected.promise,
    currentDirectory: () => "/learning/course-b",
    reconnect() {},
    async hydrateTranscript() {},
    setDirectoryAccess(next) {
      access.current = next
    },
  })

  await Bun.sleep(0)
  expect(access.current).toEqual({ status: "pending" })
  expect(canShowSessionPrompt({ child: false, access: access.current, permissions: 0, questions: 0 })).toBe(false)

  selected.resolve(true)
  await task
  expect(access.current).toEqual({ status: "ready" })
  expect(canShowSessionPrompt({ child: false, access: access.current, permissions: 0, questions: 0 })).toBe(true)
})
