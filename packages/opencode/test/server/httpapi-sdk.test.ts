import { afterEach, describe, expect } from "bun:test"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Deferred, Effect, Fiber, Layer } from "effect"
import type * as Scope from "effect/Scope"
import { HttpServer } from "effect/unstable/http"
import { ChildProcessSpawner } from "effect/unstable/process"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Flag } from "@opencode-ai/core/flag/flag"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { validateSession } from "../../src/cli/tui/validate-session"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { MessageV2 } from "../../src/session/message-v2"

import type { Config } from "@/config/config"
import { Session as SessionNs } from "@/session/session"
import { errorMessage } from "../../src/util/error"
import { TestLLMServer } from "../lib/llm-server"
import path from "path"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, provideMachineConfig, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { testProviderConfig } from "../lib/test-provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Turn } from "@opencode-ai/schema/turn"
import { Database } from "@opencode-ai/core/database/database"
import { eq } from "drizzle-orm"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSequenceTable, EventTable } from "@opencode-ai/core/event/sql"
import { FutureAttentionEvent } from "@opencode-ai/schema/future-attention-event"
import { LearningOccurrence } from "@opencode-ai/schema/learning-occurrence"
import { httpApiLayer } from "./httpapi-layer"

const noopBootstrapLayer = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const appLayer = AppNodeBuilder.build(
  LayerNode.group([FSUtil.node, CrossSpawnSpawner.node, InstanceStore.node, Database.node, SessionNs.node]),
  [[InstanceStore.bootstrapNode, noopBootstrapLayer]],
)
const it = testEffect(Layer.mergeAll(appLayer, httpApiLayer))

const original = {
  REPA_SERVER_PASSWORD: Flag.REPA_SERVER_PASSWORD,
  REPA_SERVER_USERNAME: Flag.REPA_SERVER_USERNAME,
}

type ServerPath = "default" | "raw"
type Sdk = ReturnType<typeof createOpencodeClient>
type SdkConfig = NonNullable<Parameters<typeof createOpencodeClient>[0]>
type SdkConfigIsDirectoryOnly = "experimental_workspaceID" extends keyof SdkConfig ? false : true
type SdkResult = { response: Response; data?: unknown; error?: unknown }
type Captured = { status: number; data?: unknown; error?: unknown }
type ProjectFixture = { sdk: Sdk; directory: string }
type LlmProjectFixture = ProjectFixture & { llm: TestLLMServer["Service"] }
type TestServices =
  | FSUtil.Service
  | ChildProcessSpawner.ChildProcessSpawner
  | InstanceStore.Service
  | Database.Service
  | SessionNs.Service
  | HttpServer.HttpServer
type TestScope = Scope.Scope | TestServices

function startSession(
  sdk: Sdk,
  input?: {
    title?: string
    parentID?: string
    permission?: Array<{ permission: string; pattern: string; action: "allow" | "deny" | "ask" }>
    model?: { providerID: string; modelID: string }
    text?: string
    limits?: { model: number; tool: number }
  },
) {
  const sessionID = SessionID.create()
  const turnID = Turn.ID.create()
  const inputID = Turn.InputID.create()
  const messageID = MessageID.ascending()
  return {
    sessionID,
    turnID,
    inputID,
    messageID,
    request: () =>
      sdk.session.start({
        sessionID,
        turnID,
        inputID,
        messageID,
        model: input?.model ?? { providerID: "test", modelID: "test-model" },
        limits: input?.limits ?? { model: 0, tool: 0 },
        session: {
          title: input?.title,
          parentID: input?.parentID,
          permission: input?.permission,
        },
        parts: [{ type: "text", text: input?.text ?? "SDK test admission" }],
      }),
  }
}

// Carrier catch-up intentionally starts from durable history that predates
// attachment, so this fixture writes only that detached EventV2 projection.
function insertDetachedFutureAttentionFinalizations(
  db: Database.Interface["db"],
  sessionID: string,
  finalizations: readonly Record<string, unknown>[],
) {
  return Effect.gen(function* () {
    const current = yield* db
      .select({ seq: EventSequenceTable.seq })
      .from(EventSequenceTable)
      .where(eq(EventSequenceTable.aggregate_id, sessionID))
      .get()
    const sequences = finalizations.map((_, index) => (current?.seq ?? -1) + index + 1)
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        if (current) {
          yield* tx
            .update(EventSequenceTable)
            .set({ seq: sequences.at(-1)! })
            .where(eq(EventSequenceTable.aggregate_id, sessionID))
            .run()
        } else {
          yield* tx
            .insert(EventSequenceTable)
            .values({ aggregate_id: sessionID, seq: sequences.at(-1)! })
            .run()
        }
        yield* tx
          .insert(EventTable)
          .values(
            finalizations.map((data, index) => ({
              id: EventV2.ID.create(),
              aggregate_id: sessionID,
              seq: sequences[index]!,
              type: EventV2.versionedType(FutureAttentionEvent.Finalized.type, 1),
              data,
            })),
          )
          .run()
      }),
    )
    return sequences
  })
}

function client(
  serverPath: ServerPath,
  directory?: string,
  input?: {
    password?: string
    username?: string
    headers?: Record<string, string>
    retiredWorkspaceID?: string
    onRequest?: (request: Request) => void
  },
) {
  return serverFetch(serverPath, input).pipe(
    Effect.map((fetch) => {
      const config = {
        baseUrl: "http://localhost",
        directory,
        experimental_workspaceID: input?.retiredWorkspaceID,
        headers: input?.headers,
        fetch,
      }
      return createOpencodeClient(config)
    }),
  )
}

function serverFetch(
  serverPath: ServerPath,
  input?: { password?: string; username?: string; onRequest?: (request: Request) => void },
) {
  return HttpServer.HttpServer.use((server) =>
    Effect.sync(() => {
      void serverPath
      Flag.REPA_SERVER_PASSWORD = input?.password
      Flag.REPA_SERVER_USERNAME = input?.username
      const baseUrl = HttpServer.formatAddress(server.address)
      return Object.assign(
        async (request: RequestInfo | URL, init?: RequestInit) => {
          const source = request instanceof Request ? request : new Request(request, init)
          input?.onRequest?.(source)
          const url = new URL(source.url)
          return globalThis.fetch(new Request(new URL(`${url.pathname}${url.search}`, baseUrl), source))
        },
        { preconnect: globalThis.fetch.preconnect },
      ) satisfies typeof globalThis.fetch
    }),
  )
}

function authorization(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

function call<T>(request: () => Promise<T>) {
  return Effect.promise(request)
}

function capture(request: () => Promise<SdkResult>) {
  return call(request).pipe(
    Effect.map((result) => ({
      status: result.response.status,
      data: result.data,
      error: result.error,
    })),
  )
}

function captureThrown(request: () => Promise<unknown>) {
  return call(async () => {
    try {
      await request()
    } catch (error) {
      return error
    }
  })
}

function expectStatus(request: () => Promise<{ response: Response }>, status: number) {
  return call(request).pipe(
    Effect.tap((result) => Effect.sync(() => expect(result.response.status).toBe(status))),
    Effect.asVoid,
  )
}

function firstEvent(open: (signal: AbortSignal) => Promise<{ stream: AsyncIterator<unknown> }>) {
  return Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller) => Effect.sync(() => controller.abort()),
  ).pipe(
    Effect.flatMap((controller) =>
      Effect.acquireRelease(
        call(() => open(controller.signal)),
        (events) => call(async () => void (await events.stream.return?.(undefined))).pipe(Effect.ignore),
      ).pipe(
        Effect.flatMap((events) =>
          call(() => events.stream.next()).pipe(
            Effect.timeoutOrElse({
              duration: "1 second",
              orElse: () => Effect.fail(new Error("timed out waiting for SDK event")),
            }),
          ),
        ),
        Effect.map((result) => result.value),
      ),
    ),
  )
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}
}

function array(value: unknown) {
  return Array.isArray(value) ? value : []
}

function statuses(input: Record<string, Captured>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.status]))
}

function firstPartText(value: unknown) {
  return record(array(record(value).parts)[0]).text
}

function sessionTitles(value: unknown) {
  return array(value)
    .map((item) => record(item).title)
    .filter((title): title is string => typeof title === "string")
    .sort()
}

function resetState() {
  return Effect.promise(async () => {
    await disposeAllInstances()
    await resetDatabase()
  })
}

function httpapi<A, E>(name: string, effect: Effect.Effect<A, E, TestScope>) {
  it.live(name, effect)
}

function httpapiInstance<A, E>(
  name: string,
  options: {
    serverPath: ServerPath
    git?: boolean
    config?: Partial<ConfigV1.Info>
    setup?: (dir: string) => Effect.Effect<void, E, TestServices>
  },
  run: (input: ProjectFixture) => Effect.Effect<A, E, TestScope>,
) {
  it.instance(
    name,
    Effect.gen(function* () {
      const instance = yield* TestInstance
      yield* options.setup?.(instance.directory) ?? Effect.void
      return yield* run({ sdk: yield* client(options.serverPath, instance.directory), directory: instance.directory })
    }),
    { git: options.git ?? true, config: { formatter: false, lsp: false, ...options.config } },
  )
}

function serverPathParity<A, E>(name: string, scenario: (serverPath: ServerPath) => Effect.Effect<A, E, TestScope>) {
  it.live(name, scenario("raw"))
}

function withProject<A, E, E2 = never>(
  serverPath: ServerPath,
  options: {
    git?: boolean
    config?: Partial<ConfigV1.Info>
    setup?: (dir: string) => Effect.Effect<void, E2, TestServices>
  },
  run: (input: ProjectFixture) => Effect.Effect<A, E, TestScope>,
) {
  return Effect.gen(function* () {
    const directory = yield* tmpdirScoped({
      git: options.git ?? false,
      config: { formatter: false, lsp: false, ...options.config },
    })
    yield* options.setup?.(directory) ?? Effect.void
    return yield* run({ sdk: yield* client(serverPath, directory), directory })
  })
}

function withStandardProject<A, E>(
  serverPath: ServerPath,
  run: (input: ProjectFixture) => Effect.Effect<A, E, TestScope>,
) {
  return withProject(serverPath, { setup: writeStandardFiles }, run)
}

function withFakeLlm<A, E>(serverPath: ServerPath, run: (input: LlmProjectFixture) => Effect.Effect<A, E, TestScope>) {
  return Effect.gen(function* () {
    const llm = yield* TestLLMServer
    return yield* provideMachineConfig(
      testProviderConfig(llm.url),
      withProject(serverPath, {}, (input) => run({ ...input, llm })),
    )
  }).pipe(Effect.provide(TestLLMServer.layer))
}

function withFakeLlmProject<A, E>(
  serverPath: ServerPath,
  options: { setup?: (dir: string) => Effect.Effect<void, E, TestServices> },
  run: (input: LlmProjectFixture) => Effect.Effect<A, E, TestScope>,
) {
  return Effect.gen(function* () {
    const llm = yield* TestLLMServer
    return yield* provideMachineConfig(
      testProviderConfig(llm.url),
      withProject(
        serverPath,
        {
          setup: options.setup,
        },
        (input) => run({ ...input, llm }),
      ),
    )
  }).pipe(Effect.provide(TestLLMServer.layer))
}

function writeStandardFiles(dir: string) {
  return FSUtil.Service.use((fs) =>
    Effect.all([
      fs.writeWithDirs(path.join(dir, "hello.txt"), "hello"),
      fs.writeWithDirs(path.join(dir, "needle.ts"), "export const needle = 'sdk-parity'\n"),
    ]).pipe(Effect.asVoid),
  )
}

function writeProjectSkill(dir: string) {
  return FSUtil.Service.use((fs) =>
    fs.writeWithDirs(
      path.join(dir, ".repa", "skills", "project-rest-skill", "SKILL.md"),
      `---
name: project-rest-skill
description: A project skill visible to REST API prompts.
---

# Project REST Skill
`,
    ),
  )
}

function seedMessage(directory: string, sessionID: string) {
  const id = SessionID.make(sessionID)
  return InstanceStore.Service.use((store) =>
    store.provide(
      { directory },
      SessionNs.Service.use((svc) =>
        Effect.gen(function* () {
          const message = yield* svc.updateMessage({
            id: MessageID.ascending(),
            sessionID: id,
            role: "user",
            time: { created: Date.now() },
            agent: "test",
            model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
            tools: {},
          } satisfies SessionV1.User)
          const part = yield* svc.updatePart({
            id: PartID.ascending(),
            sessionID: id,
            messageID: message.id,
            type: "text",
            text: "seeded message",
          })
          return { message, part }
        }),
      ),
    ),
  )
}

afterEach(async () => {
  Flag.REPA_SERVER_PASSWORD = original.REPA_SERVER_PASSWORD
  Flag.REPA_SERVER_USERNAME = original.REPA_SERVER_USERNAME
  await disposeAllInstances()
  await resetDatabase()
})

describe("HttpApi SDK", () => {
  httpapi(
    "uses the generated SDK for global and control routes",
    Effect.gen(function* () {
      const sdk = yield* client("raw")
      const health = yield* call(() => sdk.global.health())
      const log = yield* call(() => sdk.app.log({ service: "httpapi-sdk-test", level: "info", message: "hello" }))

      expect(health.response.status).toBe(200)
      expect(health.data).toMatchObject({ healthy: true })
      expect(yield* firstEvent((signal) => sdk.global.event({ signal }))).toMatchObject({
        payload: { type: "server.connected" },
      })
      expect(log.response.status).toBe(200)
      expect(log.data).toBe(true)
      yield* expectStatus(() => sdk.auth.set({ providerID: "test" }), 400)
    }),
  )

  httpapiInstance(
    "uses the generated SDK for safe instance routes",
    { serverPath: "raw", git: false, setup: writeStandardFiles },
    ({ sdk }) =>
      Effect.gen(function* () {
        const file = yield* call(() => sdk.file.read({ path: "hello.txt" }))
        const started = startSession(sdk, { title: "sdk" })
        const session = yield* call(started.request)
        const listed = yield* call(() => sdk.session.list({ roots: true, limit: 10 }))

        expect(file.response.status).toBe(200)
        expect(file.data).toMatchObject({ content: "hello" })
        expect(session.response.status, JSON.stringify(session.error)).toBe(200)
        expect(session.data).toMatchObject({ sessionID: started.sessionID })
        expect(listed.response.status).toBe(200)
        expect(listed.data?.map((item) => item.id)).toContain(started.sessionID)

        yield* Effect.all([
          expectStatus(() => sdk.project.current(), 200),
          expectStatus(() => sdk.config.get(), 200),
          expectStatus(() => sdk.config.providers(), 200),
          expectStatus(() => sdk.find.files({ query: "hello", limit: 10 }), 200),
        ])
      }),
  )

  httpapi(
    "routes configured SDK directory without retired workspace selectors",
    withProject("raw", { setup: writeStandardFiles }, ({ directory }) =>
      Effect.gen(function* () {
        const configIsDirectoryOnly: SdkConfigIsDirectoryOnly = true
        const requests: Request[] = []
        const sdk = yield* client("raw", directory, {
          retiredWorkspaceID: "wrk_retired",
          onRequest: (value) => requests.push(value),
        })
        const found = yield* pollWithTimeout(
          call(() => sdk.v2.fs.find({ query: "hello", type: "file" })).pipe(
            Effect.map((result) => (result.data?.data.length ? result : undefined)),
          ),
          "SDK file search index was not ready",
        )
        const findRequest = requests.findLast((request) => new URL(request.url).pathname === "/api/fs/find")
        const url = new URL(findRequest!.url)

        expect(configIsDirectoryOnly).toBe(true)
        expect(found.response.status).toBe(200)
        expect(found.data).toMatchObject({ data: [{ path: "hello.txt", type: "file" }] })
        expect(url.searchParams.get("directory")).toBe(directory)
        expect(url.searchParams.get("location[directory]")).toBe(directory)
        expect(findRequest!.headers.has("x-opencode-directory")).toBe(false)
        expect({
          workspace: url.searchParams.get("workspace"),
          locationWorkspace: url.searchParams.get("location[workspace]"),
          findWorkspaceHeader: findRequest!.headers.has("x-opencode-workspace"),
        }).toEqual({
          workspace: null,
          locationWorkspace: null,
          findWorkspaceHeader: false,
        })
      }),
    ),
  )

  serverPathParity("matches generated SDK global and control behavior", (serverPath) =>
    Effect.gen(function* () {
      const sdk = yield* client(serverPath)
      const health = yield* capture(() => sdk.global.health())
      const log = yield* capture(() => sdk.app.log({ service: "sdk-parity", level: "info", message: "hello" }))
      const invalidAuth = yield* capture(() => sdk.auth.set({ providerID: "test" }))

      return {
        statuses: statuses({ health, log, invalidAuth }),
        health: record(health.data).healthy,
        log: log.data,
      }
    }),
  )

  serverPathParity("matches generated SDK global event stream", (serverPath) =>
    Effect.gen(function* () {
      const sdk = yield* client(serverPath)
      const event = yield* firstEvent((signal) => sdk.global.event({ signal }))
      return { type: record(record(event).payload).type }
    }),
  )

  serverPathParity("matches generated SDK instance event stream", (serverPath) =>
    withStandardProject(serverPath, ({ sdk }) =>
      firstEvent((signal) => sdk.event.subscribe(undefined, { signal })).pipe(
        Effect.map((event) => ({ type: record(record(event).payload).type })),
      ),
    ),
  )

  serverPathParity("matches generated SDK missing session errors", (serverPath) =>
    withStandardProject(serverPath, ({ sdk }) =>
      Effect.gen(function* () {
        const sessionID = "ses_missing"
        const expected = {
          name: "NotFoundError",
          data: { message: `Session not found: ${sessionID}` },
        }
        const missing = yield* capture(() => sdk.session.get({ sessionID }))
        const thrown = yield* captureThrown(() => sdk.session.get({ sessionID }, { throwOnError: true }))

        // Result-tuple path: error body is preserved as-is so existing
        // consumers reading `result.error.name` / `JSON.stringify(error)`
        // keep working byte-for-byte.
        expect(missing.error).toEqual(expected)
        // throwOnError path: SDK wraps the body in a real Error with the
        // server's message, with the original parsed body preserved under
        // `.cause.body`.
        expect(thrown).toBeInstanceOf(Error)
        expect((thrown as Error).message).toBe(expected.data.message)
        expect(((thrown as Error).cause as { body: unknown }).body).toEqual(expected)
        return {
          status: missing.status,
          error: missing.error,
          thrown,
        }
      }),
    ),
  )

  serverPathParity("formats missing session validation errors for -s", (serverPath) =>
    withStandardProject(serverPath, ({ directory }) =>
      Effect.gen(function* () {
        const sessionID = "ses_206f84f18ffeZ6hhD7pFYAiW5T"
        const fetch = yield* serverFetch(serverPath)
        const thrown = yield* captureThrown(() =>
          validateSession({
            url: "http://localhost",
            directory,
            sessionID,
            fetch,
          }),
        )
        expect(errorMessage(thrown)).toBe(`Session not found: ${sessionID}`)
        return errorMessage(thrown)
      }),
    ),
  )

  httpapiInstance(
    "uses generated SDK basic auth behavior",
    { serverPath: "raw", setup: writeStandardFiles },
    ({ directory }) =>
      Effect.gen(function* () {
        const missingSdk = yield* client("raw", directory, { password: "secret" })
        const missing = yield* capture(() => missingSdk.file.read({ path: "hello.txt" }))
        const badSdk = yield* client("raw", directory, {
          password: "secret",
          headers: { authorization: authorization("opencode", "wrong") },
        })
        const bad = yield* capture(() => badSdk.file.read({ path: "hello.txt" }))
        const goodSdk = yield* client("raw", directory, {
          password: "secret",
          headers: { authorization: authorization("opencode", "secret") },
        })
        const good = yield* capture(() => goodSdk.file.read({ path: "hello.txt" }))

        return {
          statuses: statuses({ missing, bad, good }),
          content: record(good.data).content,
        }
      }),
  )

  serverPathParity("matches generated SDK instance read routes", (serverPath) =>
    withProject(serverPath, { git: true, setup: writeStandardFiles }, ({ sdk, directory }) =>
      Effect.gen(function* () {
        const project = yield* capture(() => sdk.project.current())
        const projects = yield* capture(() => sdk.project.list())
        const paths = yield* capture(() => sdk.path.get())
        const config = yield* capture(() => sdk.config.get())
        const providers = yield* capture(() => sdk.config.providers())
        const file = yield* capture(() => sdk.file.read({ path: "hello.txt" }))
        const files = yield* capture(() => sdk.file.list({ path: "." }))
        const fileStatus = yield* capture(() => sdk.file.status())
        const findFiles = yield* capture(() => sdk.find.files({ query: "hello", limit: 10 }))
        const findText = yield* capture(() => sdk.find.text({ pattern: "sdk-parity" }))
        const agents = yield* capture(() => sdk.app.agents())
        const skills = yield* capture(() => sdk.app.skills())
        const tools = yield* capture(() => sdk.tool.ids())
        const vcs = yield* capture(() => sdk.vcs.get())
        const formatter = yield* capture(() => sdk.formatter.status())
        const lsp = yield* capture(() => sdk.lsp.status())

        return {
          statuses: statuses({
            project,
            projects,
            paths,
            config,
            providers,
            file,
            files,
            fileStatus,
            findFiles,
            findText,
            agents,
            skills,
            tools,
            vcs,
            formatter,
            lsp,
          }),
          project: { worktreeSelected: record(project.data).worktree === directory },
          paths: { directorySelected: record(paths.data).directory === directory },
          file: record(file.data).content,
          hasProject: array(projects.data).length > 0,
          foundFile: JSON.stringify(findFiles.data).includes("hello.txt"),
          foundText: JSON.stringify(findText.data ?? null).includes("sdk-parity"),
          listedFile: JSON.stringify(files.data).includes("hello.txt"),
          vcs: { hasBranch: typeof record(vcs.data).branch === "string" },
        }
      }),
    ),
  )

  serverPathParity("matches generated SDK session lifecycle routes", (serverPath) =>
    withStandardProject(serverPath, ({ sdk }) =>
      Effect.gen(function* () {
        const parentStart = startSession(sdk, { title: "parent" })
        const parent = yield* capture(parentStart.request)
        const parentID = parentStart.sessionID
        const childStart = startSession(sdk, { title: "child", parentID })
        const child = yield* capture(childStart.request)
        const childID = childStart.sessionID
        const get = yield* capture(() => sdk.session.get({ sessionID: parentID }))
        const update = yield* capture(() => sdk.session.update({ sessionID: parentID, title: "renamed" }))
        const roots = yield* capture(() => sdk.session.list({ roots: true, limit: 10 }))
        const all = yield* capture(() => sdk.session.list({ roots: false, limit: 10 }))
        const children = yield* capture(() => sdk.session.children({ sessionID: parentID }))
        const todo = yield* capture(() => sdk.session.todo({ sessionID: parentID }))
        const status = yield* capture(() => sdk.session.status())
        const messages = yield* capture(() => sdk.session.messages({ sessionID: parentID }))
        const missingGet = yield* capture(() => sdk.session.get({ sessionID: "ses_missing" }))
        const missingMessages = yield* capture(() => sdk.session.messages({ sessionID: "ses_missing", limit: 2 }))
        const invalidCursor = yield* capture(() =>
          sdk.session.messages({ sessionID: parentID, limit: 2, before: "bad" }),
        )
        const proposalResult = yield* call(() => sdk.session.deleteProposal({ sessionID: parentID, mode: "full" }))
        const proposal = {
          status: proposalResult.response.status,
          data: proposalResult.data,
          error: proposalResult.error,
        }
        const deletionProposal = proposalResult.data
        if (!deletionProposal || !("targets" in deletionProposal))
          return yield* Effect.fail(new Error(`Expected an exact deletion proposal: ${JSON.stringify(proposal)}`))
        expect(proposal.status, JSON.stringify(proposal.error)).toBe(200)
        expect(deletionProposal.targets[0]?.parentSessionID).toBeNull()
        const deleted = yield* capture(() => sdk.session.delete({ sessionID: parentID, ...deletionProposal }))
        const getDeleted = yield* capture(() => sdk.session.get({ sessionID: parentID }))
        expect(deleted.status, JSON.stringify(deleted.error)).toBe(200)
        expect(getDeleted.status).toBe(404)

        return {
          statuses: statuses({
            parent,
            child,
            get,
            update,
            roots,
            all,
            children,
            todo,
            status,
            messages,
            missingGet,
            missingMessages,
            invalidCursor,
            proposal,
            deleted,
            getDeleted,
          }),
          getTitle: record(get.data).title,
          updatedTitle: record(update.data).title,
          rootTitles: sessionTitles(roots.data),
          allTitles: sessionTitles(all.data),
          childCount: array(children.data).length,
          todoCount: array(todo.data).length,
          messageCount: array(messages.data).length,
        }
      }),
    ),
  )

  serverPathParity("pages durable FutureAttention finalizations through the generated SDK", (serverPath) =>
    withStandardProject(serverPath, ({ sdk }) =>
      Effect.gen(function* () {
        const started = startSession(sdk, { title: "future-attention-finalization-history" })
        const session = yield* capture(started.request)
        expect(session.status, JSON.stringify(session.error)).toBe(200)
        const db = (yield* Database.Service).db
        const finalized = (marker: string) => {
          const suffix = marker.repeat(26)
          const turnID = Turn.ID.create()
          const assistantMessageID = MessageID.ascending()
          const invocationPartID = PartID.ascending()
          return {
            sessionID: started.sessionID,
            turnID,
            assistantMessageID,
            invocationPartID,
            groupID: `fag_${suffix}`,
            receipt: {
              id: `far_${suffix}`,
              groupID: `fag_${suffix}`,
              outcome: "served",
              completion: {
                observationCut: "live_presentation_finalized",
                sessionID: started.sessionID,
                turnID,
                occurrenceID: LearningOccurrence.ID.create(),
                assistantMessageID,
                modelOperationID: assistantMessageID,
                invocationPartID,
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
          }
        }
        const first = finalized("1")
        const second = finalized("2")
        const sequences = yield* insertDetachedFutureAttentionFinalizations(db, started.sessionID, [first, second])
        const firstSequence = sequences[0]!
        const secondSequence = sequences[1]!

        const firstPage = yield* call(() =>
          sdk.session.futureAttentionFinalizations({
            sessionID: started.sessionID,
            after: (firstSequence - 1).toString(),
            limit: "1",
          }),
        )
        const secondPage = yield* call(() =>
          sdk.session.futureAttentionFinalizations({
            sessionID: started.sessionID,
            after: firstSequence.toString(),
            limit: "1",
          }),
        )
        expect(firstPage.response.status, JSON.stringify(firstPage.error)).toBe(200)
        expect(secondPage.response.status, JSON.stringify(secondPage.error)).toBe(200)
        expect(firstPage.data).toMatchObject({
          events: [
            {
              type: "future_attention.finalized",
              sequence: firstSequence,
              properties: { receipt: { id: first.receipt.id } },
            },
          ],
          hasMore: true,
        })
        expect(secondPage.data).toMatchObject({
          events: [
            {
              type: "future_attention.finalized",
              sequence: secondSequence,
              properties: { receipt: { id: second.receipt.id } },
            },
          ],
          hasMore: false,
        })
      }),
    ),
  )

  serverPathParity("matches generated SDK session message and part routes", (serverPath) =>
    withStandardProject(serverPath, ({ sdk, directory }) =>
      Effect.gen(function* () {
        const start = startSession(sdk, { title: "messages" })
        const session = yield* capture(start.request)
        const sessionID = start.sessionID
        const seeded = yield* seedMessage(directory, sessionID)
        const list = yield* capture(() => sdk.session.messages({ sessionID }))
        const page = yield* capture(() => sdk.session.messages({ sessionID, limit: 1 }))
        const message = yield* capture(() => sdk.session.message({ sessionID, messageID: seeded.message.id }))
        const partUpdate = yield* capture(() =>
          sdk.part.update({
            sessionID,
            messageID: seeded.message.id,
            partID: seeded.part.id,
            part: { ...seeded.part, text: "updated message" } as NonNullable<
              Parameters<Sdk["part"]["update"]>[0]["part"]
            >,
          }),
        )
        const updated = yield* capture(() => sdk.session.message({ sessionID, messageID: seeded.message.id }))
        const partDelete = yield* capture(() =>
          sdk.part.delete({ sessionID, messageID: seeded.message.id, partID: seeded.part.id }),
        )
        const withoutPart = yield* capture(() => sdk.session.message({ sessionID, messageID: seeded.message.id }))
        const deleteMessage = yield* capture(() =>
          sdk.session.deleteMessage({ sessionID, messageID: seeded.message.id }),
        )
        const missingMessage = yield* capture(() => sdk.session.message({ sessionID, messageID: seeded.message.id }))

        return {
          statuses: statuses({
            session,
            list,
            page,
            message,
            partUpdate,
            updated,
            partDelete,
            withoutPart,
            deleteMessage,
            missingMessage,
          }),
          listCount: array(list.data).length,
          pageCount: array(page.data).length,
          initialText: firstPartText(message.data),
          updatedText: firstPartText(updated.data),
          partCountAfterDelete: array(record(withoutPart.data).parts).length,
        }
      }),
    ),
  )

  // Regression: EventV2 must publish on the same ProjectBus the /event handler
  // subscribes to, AND the /event stream must forward handler ALS/context into the
  // body-pump fiber. Drives the full SDK → /event → Session.updatePart → sync.run →
  // bus.publish → SDK subscriber path. Goes red if either the publisher uses a
  // different bus instance (Bug 2 / pre-#27825) or the stream loses context (Bug 1 /
  // pre-#27425).
  serverPathParity("streams sync-backed part updates to /event subscribers", (serverPath) =>
    withStandardProject(serverPath, ({ sdk, directory }) =>
      Effect.gen(function* () {
        const start = startSession(sdk, { title: "sync-backed part event" })
        const session = yield* capture(start.request)
        const sessionID = start.sessionID
        const seeded = yield* seedMessage(directory, sessionID)

        const controller = new AbortController()
        yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()))
        const events = yield* call(() => sdk.event.subscribe(undefined, { signal: controller.signal }))
        yield* Effect.addFinalizer(() =>
          call(async () => void (await events.stream.return?.(undefined))).pipe(Effect.ignore),
        )

        const ready = yield* Deferred.make<void>()
        const received = yield* Deferred.make<unknown>()

        yield* call(async () => {
          for await (const event of events.stream) {
            const payload = record(event).payload ?? event
            const type = record(payload).type
            if (type === "server.connected") {
              Deferred.doneUnsafe(ready, Effect.void)
              continue
            }
            if (type === MessageV2.Event.PartUpdated.type) {
              Deferred.doneUnsafe(received, Effect.succeed(payload))
              return
            }
          }
        }).pipe(Effect.forkScoped)

        yield* awaitWithTimeout(Deferred.await(ready), "timed out waiting for /event server.connected", "2 seconds")

        const updated = yield* capture(() =>
          sdk.part.update({
            sessionID,
            messageID: seeded.message.id,
            partID: seeded.part.id,
            part: { ...seeded.part, text: "updated via sync" } as NonNullable<
              Parameters<Sdk["part"]["update"]>[0]["part"]
            >,
          }),
        )
        expect(updated.status).toBe(200)

        const event = yield* awaitWithTimeout(
          Deferred.await(received),
          "timed out waiting for message.part.updated bus payload over /event",
          "5 seconds",
        )
        const properties = record(record(event).properties)
        expect(record(properties.part)).toMatchObject({ id: seeded.part.id, type: "text" })
        return { type: record(event).type, partType: record(properties.part).type }
      }),
    ),
  )

  serverPathParity("matches generated SDK prompt streaming through fake LLM", (serverPath) =>
    withFakeLlm(serverPath, ({ sdk, llm }) =>
      Effect.gen(function* () {
        yield* llm.text("fake world", { usage: { input: 11, output: 7 } })
        const start = startSession(sdk, {
          title: "llm prompt",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
          model: { providerID: "test", modelID: "test-model" },
          text: "hello llm",
          limits: { model: 2, tool: 2 },
        })
        const session = yield* capture(start.request)
        const turnID = String(record(session.data).id)
        const terminal = yield* capture(() => sdk.session.awaitTurn({ sessionID: start.sessionID, turnID }))
        const sessionID = start.sessionID
        const messages = yield* capture(() => sdk.session.messages({ sessionID }))
        const inputs = yield* llm.inputs

        return {
          statuses: statuses({ session, terminal, messages }),
          calls: inputs.length,
          requestedModel: inputs[0]?.model,
          responseText: JSON.stringify(messages.data).includes("fake world"),
          persistedText: JSON.stringify(messages.data).includes("fake world"),
          userText: JSON.stringify(messages.data).includes("hello llm"),
        }
      }),
    ),
  )

  serverPathParity("preserves strict Turn identity and typed steer errors through the generated SDK", (serverPath) =>
    withFakeLlm(serverPath, ({ sdk, llm }) =>
      Effect.gen(function* () {
        const release = Promise.withResolvers<void>()
        yield* llm.hold("first boundary", release.promise)
        yield* llm.text("second boundary")
        const start = startSession(sdk, {
          title: "generated SDK strict Turn",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
          model: { providerID: "test", modelID: "test-model" },
          text: "sample the first operation",
          limits: { model: 2, tool: 0 },
        })
        const admitted = yield* capture(start.request)
        yield* llm.wait(1).pipe(Effect.timeout("5 seconds"))

        const active = yield* capture(() => sdk.session.activeTurn({ sessionID: start.sessionID }))
        const exact = yield* capture(() => sdk.session.getTurn({ sessionID: start.sessionID, turnID: start.turnID }))
        const mismatchedTurnID = Turn.ID.create()
        const mismatch = yield* capture(() =>
          sdk.session.steer({
            sessionID: start.sessionID,
            turnID: mismatchedTurnID,
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            parts: [{ type: "text", text: "must not retarget" }],
          }),
        )
        const busy = yield* capture(() =>
          sdk.session.start({
            sessionID: start.sessionID,
            turnID: Turn.ID.create(),
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            model: { providerID: "test", modelID: "test-model" },
            limits: { model: 1, tool: 0 },
            parts: [{ type: "text", text: "must not become a steer" }],
          }),
        )

        const steerInputID = Turn.InputID.create()
        const steering = yield* capture(() =>
          sdk.session.steer({
            sessionID: start.sessionID,
            turnID: start.turnID,
            inputID: steerInputID,
            messageID: MessageID.ascending(),
            parts: [{ type: "text", text: "promote this exact correction" }],
          }),
        ).pipe(Effect.forkChild)
        expect(
          yield* Effect.race(
            Fiber.join(steering).pipe(Effect.as(true)),
            Effect.sleep("50 millis").pipe(Effect.as(false)),
          ),
        ).toBe(false)
        release.resolve()
        const steered = yield* Fiber.join(steering)
        const terminal = yield* capture(() =>
          sdk.session.awaitTurn({ sessionID: start.sessionID, turnID: start.turnID }),
        )
        const terminalSteer = yield* capture(() =>
          sdk.session.steer({
            sessionID: start.sessionID,
            turnID: start.turnID,
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            parts: [{ type: "text", text: "must remain terminal" }],
          }),
        )
        const idleSteer = yield* capture(() =>
          sdk.session.steer({
            sessionID: start.sessionID,
            turnID: Turn.ID.create(),
            inputID: Turn.InputID.create(),
            messageID: MessageID.ascending(),
            parts: [{ type: "text", text: "must not invent an active Turn" }],
          }),
        )
        const interruptedReplay = yield* capture(() =>
          sdk.session.interruptTurn({ sessionID: start.sessionID, turnID: start.turnID }),
        )
        const inactive = yield* capture(() => sdk.session.activeTurn({ sessionID: start.sessionID }))

        expect(statuses({ admitted, active, exact, steered, terminal, interruptedReplay, inactive })).toEqual({
          admitted: 200,
          active: 200,
          exact: 200,
          steered: 200,
          terminal: 200,
          interruptedReplay: 200,
          inactive: 200,
        })
        expect(record(active.data)).toMatchObject({ id: start.turnID, state: "running" })
        expect(record(exact.data)).toMatchObject({ id: start.turnID, state: "running" })
        expect(record(steered.data)).toMatchObject({ id: steerInputID, turnID: start.turnID })
        expect(record(terminal.data)).toMatchObject({
          id: start.turnID,
          state: "completed",
          currentInputID: steerInputID,
        })
        expect(interruptedReplay.data).toEqual(terminal.data)
        expect(inactive.data).toBeNull()
        expect(mismatch.status).toBe(409)
        expect(record(mismatch.error)).toMatchObject({
          _tag: "TurnActiveMismatchError",
          expectedTurnID: mismatchedTurnID,
          activeTurnID: start.turnID,
        })
        expect(busy.status).toBe(409)
        expect(record(busy.error)).toMatchObject({ _tag: "TurnAlreadyRunningError", activeTurnID: start.turnID })
        expect(terminalSteer.status).toBe(409)
        expect(record(terminalSteer.error)).toMatchObject({ _tag: "TurnNotSteerableError", state: "completed" })
        expect(idleSteer.status).toBe(409)
        expect(record(idleSteer.error)).toMatchObject({ _tag: "TurnNoActiveError", sessionID: start.sessionID })
      }),
    ),
  )

  httpapi(
    "keeps quarantined project skills out of REST API prompt context",
    withFakeLlmProject("default", { setup: writeProjectSkill }, ({ sdk, llm }) =>
      Effect.gen(function* () {
        yield* llm.text("skill context ok", { usage: { input: 11, output: 7 } })
        const start = startSession(sdk, {
          title: "project skill prompt",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
          model: { providerID: "test", modelID: "test-model" },
          text: "hello skill context",
          limits: { model: 2, tool: 2 },
        })
        const session = yield* capture(start.request)
        const terminal = yield* capture(() =>
          sdk.session.awaitTurn({ sessionID: start.sessionID, turnID: String(record(session.data).id) }),
        )
        const inputs = yield* llm.inputs

        expect(session.status).toBe(200)
        expect(terminal.status).toBe(200)
        expect(inputs.length, JSON.stringify(terminal.data)).toBeGreaterThan(0)
        expect(JSON.stringify(inputs[0])).not.toContain("project-rest-skill")
      }),
    ),
  )

  serverPathParity("matches generated SDK TUI validation and command routes", (serverPath) =>
    withStandardProject(serverPath, ({ sdk }) =>
      Effect.gen(function* () {
        const start = startSession(sdk, { title: "tui" })
        const session = yield* capture(start.request)
        const sessionID = start.sessionID
        const appendPrompt = yield* capture(() => sdk.tui.appendPrompt({ text: "hello" }))
        const openHelp = yield* capture(() => sdk.tui.openHelp())
        const openSessions = yield* capture(() => sdk.tui.openSessions())
        const openThemes = yield* capture(() => sdk.tui.openThemes())
        const openModels = yield* capture(() => sdk.tui.openModels())
        const submitPrompt = yield* capture(() => sdk.tui.submitPrompt())
        const clearPrompt = yield* capture(() => sdk.tui.clearPrompt())
        const executeCommand = yield* capture(() => sdk.tui.executeCommand({ command: "session_new" }))
        const showToast = yield* capture(() => sdk.tui.showToast({ title: "SDK", message: "hello", variant: "info" }))
        const selectSession = yield* capture(() => sdk.tui.selectSession({ sessionID }))
        const missingSession = yield* capture(() => sdk.tui.selectSession({ sessionID: "ses_missing" }))
        const invalidSession = yield* capture(() => sdk.tui.selectSession({ sessionID: "invalid_session_id" }))

        return {
          statuses: statuses({
            session,
            appendPrompt,
            openHelp,
            openSessions,
            openThemes,
            openModels,
            submitPrompt,
            clearPrompt,
            executeCommand,
            showToast,
            selectSession,
            missingSession,
            invalidSession,
          }),
          data: {
            appendPrompt: appendPrompt.data,
            openHelp: openHelp.data,
            openSessions: openSessions.data,
            openThemes: openThemes.data,
            openModels: openModels.data,
            submitPrompt: submitPrompt.data,
            clearPrompt: clearPrompt.data,
            executeCommand: executeCommand.data,
            showToast: showToast.data,
            selectSession: selectSession.data,
          },
        }
      }),
    ),
  )

  serverPathParity("matches generated SDK project git initialization", (serverPath) =>
    withProject(serverPath, {}, ({ sdk, directory }) =>
      Effect.gen(function* () {
        const before = yield* capture(() => sdk.project.current())
        const init = yield* capture(() => sdk.project.initGit())
        const after = yield* capture(() => sdk.project.current())

        return {
          statuses: statuses({ before, init, after }),
          before: {
            vcs: record(before.data).vcs ?? null,
            worktree: record(before.data).worktree,
          },
          init: {
            vcs: record(init.data).vcs,
            worktreeSelected: record(init.data).worktree === directory,
          },
          after: {
            vcs: record(after.data).vcs,
            worktreeSelected: record(after.data).worktree === directory,
          },
        }
      }),
    ),
  )
})
