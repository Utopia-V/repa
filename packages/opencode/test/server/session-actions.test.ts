import { afterEach, describe, expect, mock } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Turn } from "@opencode-ai/schema/turn"
import { Effect, Layer } from "effect"
import { Session as SessionNs } from "@/session/session"
import { MessageID, SessionID } from "@/session/schema"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const it = testEffect(Layer.mergeAll(LayerNode.compile(SessionNs.node), httpApiLayer))

afterEach(async () => {
  mock.restore()
  await disposeAllInstances()
})

describe("session action routes", () => {
  it.instance(
    "strict start and fork-start preserve session metadata",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "Content-Type": "application/json" }
        const sessionID = SessionID.create()
        const turnID = Turn.ID.create()

        const started = yield* requestInDirectory(`/session/${sessionID}/turn`, test.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            turnID,
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            agent: "repa",
            model: { providerID: "test", modelID: "test" },
            limits: { model: 0, tool: 0 },
            session: {
              title: "meta-session",
              metadata: { source: "sdk", trace: { id: "abc" } },
            },
            parts: [{ type: "text", text: "Create a durable learner Turn." }],
          }),
        })
        expect(started.status).toBe(200)
        expect((yield* started.json) as unknown as Turn.Info).toMatchObject({ id: turnID, sessionID })

        const settled = yield* requestInDirectory(`/session/${sessionID}/turn/${turnID}/await`, test.directory)
        expect(settled.status).toBe(200)

        const updated = yield* requestInDirectory(`/session/${sessionID}`, test.directory, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ metadata: { source: "sdk", trace: { id: "def" }, tags: ["one"] } }),
        })
        expect(updated.status).toBe(200)

        const next = (yield* updated.json) as SessionNs.Info
        expect(next.metadata).toEqual({ source: "sdk", trace: { id: "def" }, tags: ["one"] })

        const fetched = yield* requestInDirectory(`/session/${sessionID}`, test.directory)
        expect(fetched.status).toBe(200)
        expect(((yield* fetched.json) as SessionNs.Info).metadata).toEqual(next.metadata)

        const basisResponse = yield* requestInDirectory(`/session/${sessionID}/fork-basis`, test.directory)
        expect(basisResponse.status).toBe(200)
        const fork = (yield* basisResponse.json) as { sourceSessionID: SessionID; sourceEventSequence: number }
        expect(fork.sourceSessionID).toBe(sessionID)

        const forkSessionID = SessionID.create()
        const forkTurnID = Turn.ID.create()
        const forked = yield* requestInDirectory(`/session/${forkSessionID}/turn`, test.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            turnID: forkTurnID,
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            agent: "repa",
            model: { providerID: "test", modelID: "test" },
            limits: { model: 0, tool: 0 },
            fork,
            parts: [{ type: "text", text: "Continue from this exact fork basis." }],
          }),
        })
        expect(forked.status).toBe(200)
        expect((yield* forked.json) as unknown as Turn.Info).toMatchObject({ id: forkTurnID, sessionID: forkSessionID })

        const forkSettled = yield* requestInDirectory(
          `/session/${forkSessionID}/turn/${forkTurnID}/await`,
          test.directory,
        )
        expect(forkSettled.status).toBe(200)

        const forkSession = yield* requestInDirectory(`/session/${forkSessionID}`, test.directory)
        expect(forkSession.status).toBe(200)
        expect(((yield* forkSession.json) as SessionNs.Info).metadata).toEqual(next.metadata)

        const reset = yield* requestInDirectory(`/session/${sessionID}`, test.directory, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ metadata: {} }),
        })
        expect(reset.status).toBe(200)
        expect(((yield* reset.json) as SessionNs.Info).metadata).toEqual({})

        yield* SessionNs.Service.use((svc) => svc.remove(forkSessionID).pipe(Effect.ignore))
        yield* SessionNs.Service.use((svc) => svc.remove(sessionID).pipe(Effect.ignore))
      }),
    { git: true },
  )

  it.instance(
    "interrupt targets one exact Turn and replays its terminal result",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "Content-Type": "application/json" }
        const sessionID = SessionID.create()
        const turnID = Turn.ID.create()
        const started = yield* requestInDirectory(`/session/${sessionID}/turn`, test.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            turnID,
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            agent: "repa",
            model: { providerID: "test", modelID: "test" },
            limits: { model: 0, tool: 0 },
            session: { title: "exact interrupt" },
            parts: [{ type: "text", text: "Admit this exact Turn." }],
          }),
        })
        expect(started.status).toBe(200)

        const path = `/session/${sessionID}/turn/${turnID}/interrupt`
        const interrupted = yield* requestInDirectory(path, test.directory, { method: "POST" })
        expect(interrupted.status).toBe(200)
        const terminal = (yield* interrupted.json) as unknown as Turn.Info
        expect(terminal).toMatchObject({ id: turnID, sessionID })
        expect(terminal.state).not.toBe("running")
        expect(terminal.terminal).toBeDefined()

        const replay = yield* requestInDirectory(path, test.directory, { method: "POST" })
        expect(replay.status).toBe(200)
        expect((yield* replay.json) as unknown as Turn.Info).toEqual(terminal)

        yield* SessionNs.Service.use((svc) => svc.remove(sessionID).pipe(Effect.ignore))
      }),
    { git: true },
  )

  it.instance(
    "does not expose the experimental background route",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const res = yield* requestInDirectory("/experimental/session/ses_retired/background", test.directory, {
          method: "POST",
        })

        expect(res.status).toBe(404)
      }),
    { git: true },
  )
})
