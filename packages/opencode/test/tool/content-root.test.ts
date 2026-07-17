import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { Deferred, Effect, Layer, ManagedRuntime } from "effect"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { ContentInventoryTool, ContentReadTool, ContentWriteTool } from "@/tool/content-root"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"

const windowsTest = process.platform === "win32" ? test : test.skip

function layer() {
  return Layer.mergeAll(
    LayerNode.compile(ContentRoot.node, [
      [Database.node, Database.layerFromPath(":memory:").pipe(Layer.orDie)],
    ]),
    Layer.mock(Truncate.Service, {
      output: (content: string) => Effect.succeed({ content, truncated: false as const }),
    }),
    Layer.mock(Agent.Service, {
      get: () =>
        Effect.succeed({
          name: "repa",
          mode: "primary" as const,
          permission: [],
          options: {},
        }),
    }),
  )
}

type Ask = Parameters<Tool.Context["ask"]>[0]

function context(ask: Tool.Context["ask"], abort = AbortSignal.any([])): Tool.Context {
  return {
    sessionID: SessionID.make("ses_content_root_tool"),
    messageID: MessageID.make("msg_content_root_tool"),
    callID: "call_content_root_tool",
    agent: "repa",
    abort,
    messages: [],
    metadata: () => Effect.void,
    ask,
  }
}

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "repa-content-tool-"))
  await mkdir(path.join(directory, "notes"))
  await writeFile(path.join(directory, "notes", "lesson.md"), "original")
  return directory
}

describe("ContentRoot model tools", () => {
  windowsTest("observes an approved root without creating mutation authority", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      const root = await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "observe learning files"),
        }),
      )
      const read = await runtime.runPromise(ContentReadTool.pipe(Effect.flatMap(Tool.init)))
      const result = await runtime.runPromise(
        read.execute(
          { contentRootID: root.id, relativePath: "notes/lesson.md", maxBytes: 1024 },
          context(() => Effect.die(new Error("observation must not ask for mutation permission"))),
        ),
      )

      expect(result.output).toBe("original")
      expect(await readFile(path.join(directory, "notes", "lesson.md"), "utf8")).toBe("original")
      expect(await runtime.runPromise(roots.listMutationGrants())).toEqual([])
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("requires a fresh one-shot confirmation even inside an observed ContentRoot", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "observe learning files"),
        }),
      )
      const write = await runtime.runPromise(ContentWriteTool.pipe(Effect.flatMap(Tool.init)))
      const filePath = path.join(directory, "notes", "lesson.md")
      const denied = await runtime.runPromise(
        Effect.exit(
          write.execute(
            { filePath, content: "forbidden" },
            context(() => Effect.die(new Error("learner did not confirm"))),
          ),
        ),
      )
      expect(denied._tag).toBe("Failure")
      expect(await readFile(filePath, "utf8")).toBe("original")
      expect(await runtime.runPromise(roots.listMutationGrants())).toEqual([])

      const asks: Ask[] = []
      const result = await runtime.runPromise(
        write.execute(
          { filePath, content: "confirmed once" },
          context((input) =>
            Effect.sync(() => {
              asks.push(input)
            }),
          ),
        ),
      )
      expect(asks).toHaveLength(1)
      expect(asks[0]).toMatchObject({
        permission: "content_mutation",
        requirePrompt: true,
        always: [],
        metadata: { onceOnly: true, lifetime: "this physical tool invocation" },
      })
      expect(result.metadata).toMatchObject({ onceOnly: true, operation: "modify" })
      expect(await readFile(filePath, "utf8")).toBe("confirmed once")
      expect(await runtime.runPromise(roots.listMutationGrants())).toEqual([])
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("propagates provider context cancellation before and during inventory", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      const root = await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "abortable observation root"),
        }),
      )
      const inventory = await runtime.runPromise(ContentInventoryTool.pipe(Effect.flatMap(Tool.init)))
      const controller = new AbortController()
      controller.abort(new Error("provider cancelled"))
      const result = await runtime.runPromise(
        Effect.exit(
          inventory.execute(
            { contentRootID: root.id },
            context(() => Effect.die(new Error("inventory must not ask")), controller.signal),
          ),
        ),
      )
      expect(result._tag).toBe("Failure")

      await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          writeFile(path.join(directory, "notes", `${index.toString().padStart(3, "0")}.md`), "cancel"),
        ),
      )
      const activeController = new AbortController()
      const running = runtime.runPromise(
        inventory.execute(
          { contentRootID: root.id, budgets: { maxEntries: 1000, maxFiles: 1000, maxDurationMs: 5000 } },
          context(() => Effect.die(new Error("inventory must not ask")), activeController.signal),
        ),
      )
      setTimeout(() => activeController.abort(new Error("provider cancelled active inventory")), 0)
      await expect(running).rejects.toThrow()
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("refuses a durable write when provider cancellation already won", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(
        roots.proposeMutationGrant({
          anchorPath: directory,
          relativeScope: "notes",
          scopeKind: "subtree",
          rights: ["create", "modify"],
        }),
      )
      const grant = await runtime.runPromise(
        roots.approveMutationGrant({
          proposal,
          approval: ContentRoot.LearnerApproval.mutationGrant(proposal, "cancelled durable write"),
        }),
      )
      const write = await runtime.runPromise(ContentWriteTool.pipe(Effect.flatMap(Tool.init)))
      const controller = new AbortController()
      controller.abort(new Error("provider cancelled before durable write"))
      const result = await runtime.runPromise(
        Effect.exit(
          write.execute(
            {
              mutationGrantID: grant.id,
              expectedVersion: grant.version,
              relativePath: "notes/lesson.md",
              content: "must not apply",
            },
            context(() => Effect.die(new Error("durable write must not ask")), controller.signal),
          ),
        ),
      )

      expect(result._tag).toBe("Failure")
      expect(await readFile(path.join(directory, "notes", "lesson.md"), "utf8")).toBe("original")
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("refuses a pre-aborted one-shot write without opening a prompt", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const write = await runtime.runPromise(ContentWriteTool.pipe(Effect.flatMap(Tool.init)))
      const controller = new AbortController()
      controller.abort(new Error("provider cancelled before one-shot write"))
      let asks = 0
      const result = await runtime.runPromise(
        Effect.exit(
          write.execute(
            { filePath: path.join(directory, "notes", "lesson.md"), content: "must not apply" },
            context(
              () =>
                Effect.sync(() => {
                  asks++
                }),
              controller.signal,
            ),
          ),
        ),
      )

      expect(result._tag).toBe("Failure")
      expect(asks).toBe(0)
      expect(await readFile(path.join(directory, "notes", "lesson.md"), "utf8")).toBe("original")
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("lets cancellation win after confirmation but before one-shot mutation admission", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const write = await runtime.runPromise(ContentWriteTool.pipe(Effect.flatMap(Tool.init)))
      const controller = new AbortController()
      const result = await runtime.runPromise(
        Effect.exit(
          write.execute(
            { filePath: path.join(directory, "notes", "lesson.md"), content: "must not apply" },
            context(
              () => Effect.sync(() => controller.abort(new Error("provider cancelled after confirmation"))),
              controller.signal,
            ),
          ),
        ),
      )

      expect(result._tag).toBe("Failure")
      expect(await readFile(path.join(directory, "notes", "lesson.md"), "utf8")).toBe("original")
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("settles an admitted durable write truthfully when cancellation arrives in flight", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(
        roots.proposeMutationGrant({
          anchorPath: directory,
          relativeScope: "notes",
          scopeKind: "subtree",
          rights: ["create", "modify"],
        }),
      )
      const grant = await runtime.runPromise(
        roots.approveMutationGrant({
          proposal,
          approval: ContentRoot.LearnerApproval.mutationGrant(proposal, "admitted durable write"),
        }),
      )
      const admitted = await runtime.runPromise(Deferred.make<void>())
      const release = await runtime.runPromise(Deferred.make<void>())
      const controlled = ContentRoot.Service.of({
        ...roots,
        writeWithGrant: (input) =>
          Effect.gen(function* () {
            yield* Deferred.succeed(admitted, undefined)
            yield* Deferred.await(release)
            return yield* roots.writeWithGrant(input)
          }),
      })
      const write = await runtime.runPromise(
        ContentWriteTool.pipe(Effect.provideService(ContentRoot.Service, controlled), Effect.flatMap(Tool.init)),
      )
      const controller = new AbortController()
      const running = runtime.runPromise(
        write.execute(
          {
            mutationGrantID: grant.id,
            expectedVersion: grant.version,
            relativePath: "notes/admitted.md",
            content: "truthful completion",
          },
          context(() => Effect.die(new Error("durable write must not ask")), controller.signal),
        ),
      )
      await runtime.runPromise(Deferred.await(admitted))
      controller.abort(new Error("provider cancelled after mutation admission"))
      await runtime.runPromise(Deferred.succeed(release, undefined))

      const result = await running
      expect(controller.signal.aborted).toBe(true)
      expect(result.metadata).toMatchObject({ operation: "create", mutationGrantID: grant.id })
      expect(await readFile(path.join(directory, "notes", "admitted.md"), "utf8")).toBe("truthful completion")
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("uses an independently approved durable grant and stops after revocation", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(
        roots.proposeMutationGrant({
          anchorPath: directory,
          relativeScope: "notes",
          scopeKind: "subtree",
          rights: ["create", "modify"],
        }),
      )
      const grant = await runtime.runPromise(
        roots.approveMutationGrant({
          proposal,
          approval: ContentRoot.LearnerApproval.mutationGrant(proposal, "write notes until revoked"),
        }),
      )
      const write = await runtime.runPromise(ContentWriteTool.pipe(Effect.flatMap(Tool.init)))
      const result = await runtime.runPromise(
        write.execute(
          {
            mutationGrantID: grant.id,
            expectedVersion: grant.version,
            relativePath: "notes/durable.md",
            content: "durable grant write",
          },
          context(() => Effect.die(new Error("an approved durable grant must not ask again"))),
        ),
      )
      expect(result.metadata).toMatchObject({
        mutationGrantID: grant.id,
        mutationGrantVersion: 1,
        operation: "create",
      })
      expect(await readFile(path.join(directory, "notes", "durable.md"), "utf8")).toBe("durable grant write")

      await runtime.runPromise(
        roots.revokeMutationGrant({ mutationGrantID: grant.id, expectedVersion: 1, basis: "learner revoked" }),
      )
      const revoked = await runtime.runPromise(
        Effect.exit(
          write.execute(
            {
              mutationGrantID: grant.id,
              expectedVersion: 1,
              relativePath: "notes/durable.md",
              content: "must not apply",
            },
            context(() => Effect.void),
          ),
        ),
      )
      expect(revoked._tag).toBe("Failure")
      expect(await readFile(path.join(directory, "notes", "durable.md"), "utf8")).toBe("durable grant write")
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
