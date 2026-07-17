import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearningCommandInvocationTable } from "@opencode-ai/core/learning-command/sql"
import { PartTable } from "@opencode-ai/core/session/sql"
import { ContentManifest } from "@/content-root/manifest"

const windowsTest = process.platform === "win32" ? test : test.skip

function layer() {
  return LayerNode.compile(LayerNode.group([ContentRoot.node, Artifact.node, Database.node]), [
    [Database.node, Database.layerFromPath(":memory:").pipe(Layer.orDie)],
  ])
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "repa-content-manifest-"))
  await mkdir(path.join(root, "course"))
  await writeFile(path.join(root, "course", "a.md"), "A")
  await writeFile(path.join(root, "course", "b.md"), "B")
  return root
}

describe("deterministic ContentRoot manifest application", () => {
  windowsTest("applies selected members through independent Gate 9 transactions", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      const root = await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "manifest test root"),
        }),
      )
      const first = await runtime.runPromise(
        ContentManifest.apply({ contentRootID: root.id, allReturned: true, scope: "course" }),
      )
      expect(first.selectedKeys).toHaveLength(2)
      expect(first.outcomes.map((outcome) => outcome.status)).toEqual(["admitted", "admitted"])
      expect(first.unattempted).toEqual([])

      await writeFile(path.join(directory, "course", "a.md"), "A2")
      const second = await runtime.runPromise(
        ContentManifest.apply({ contentRootID: root.id, allReturned: true, scope: "course" }),
      )
      expect(second.outcomes.map((outcome) => outcome.status)).toEqual(["observed", "unchanged"])
      expect((await runtime.runPromise((await runtime.runPromise(Artifact.Service)).listArtifacts())).items).toHaveLength(2)

      const rejected = await runtime.runPromise(
        Effect.flip(ContentManifest.apply({ contentRootID: root.id, files: ["course/not-returned.md"] })),
      )
      expect(rejected).toMatchObject({ _tag: "ContentManifest.SelectionError" })
      expect((await runtime.runPromise((await runtime.runPromise(Artifact.Service)).listArtifacts())).items).toHaveLength(2)
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("rejects an already-aborted manifest before inventory or Artifact work", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      const root = await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "pre-abort manifest root"),
        }),
      )
      const controller = new AbortController()
      controller.abort(new Error("cancel before inventory"))
      expect(
        await runtime.runPromise(
          Effect.flip(
            ContentManifest.apply({
              contentRootID: root.id,
              allReturned: true,
              signal: controller.signal,
            }),
          ),
        ),
      ).toMatchObject({ _tag: "ContentManifest.CancelledError" })
      expect((await runtime.runPromise((await runtime.runPromise(Artifact.Service)).listArtifacts())).items).toEqual([])
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("leaves committed members truthful when the process-local controller is lost", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      const root = await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "manifest crash root"),
        }),
      )
      const crashed = await runtime.runPromise(
        Effect.exit(
          ContentManifest.apply({
            contentRootID: root.id,
            allReturned: true,
            scope: "course",
            onMember: (_outcome, index) =>
              index === 0 ? Effect.die(new Error("injected controller loss")) : Effect.void,
          }),
        ),
      )
      expect(crashed._tag).toBe("Failure")

      const artifacts = await runtime.runPromise(Artifact.Service)
      expect((await runtime.runPromise(artifacts.listArtifacts())).items).toHaveLength(1)
      const database = await runtime.runPromise(Database.Service)
      expect(await runtime.runPromise(database.db.select().from(LearningCommandInvocationTable))).toEqual([])
      expect(await runtime.runPromise(database.db.select().from(PartTable))).toEqual([])

      const rerun = await runtime.runPromise(
        ContentManifest.apply({ contentRootID: root.id, allReturned: true, scope: "course" }),
      )
      expect(rerun.outcomes.map((outcome) => outcome.status)).toEqual(["unchanged", "admitted"])
      expect((await runtime.runPromise(artifacts.listArtifacts())).items).toHaveLength(2)
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("does not admit a same-name replacement created after manifest selection", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      const root = await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "manifest replacement root"),
        }),
      )
      const result = await runtime.runPromise(
        ContentManifest.apply({
          contentRootID: root.id,
          allReturned: true,
          scope: "course",
          onMember: (_outcome, index) =>
            index === 0
              ? Effect.promise(async () => {
                  await rm(path.join(directory, "course", "b.md"))
                  await writeFile(path.join(directory, "course", "b.md"), "replacement")
                })
              : Effect.void,
        }),
      )
      expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["admitted", "stale"])
      expect((await runtime.runPromise((await runtime.runPromise(Artifact.Service)).listArtifacts())).items).toHaveLength(1)
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  windowsTest("reports later members as unattempted after deterministic cancellation", async () => {
    const directory = await fixture()
    const runtime = ManagedRuntime.make(layer())
    const controller = new AbortController()
    try {
      const roots = await runtime.runPromise(ContentRoot.Service)
      const proposal = await runtime.runPromise(roots.propose(directory))
      const root = await runtime.runPromise(
        roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "manifest cancellation root"),
        }),
      )
      const result = await runtime.runPromise(
        ContentManifest.apply({
          contentRootID: root.id,
          allReturned: true,
          scope: "course",
          signal: controller.signal,
          onMember: (_outcome, index) => (index === 0 ? Effect.sync(() => controller.abort()) : Effect.void),
        }),
      )
      expect(result.cancelled).toBeTrue()
      expect(result.outcomes).toHaveLength(1)
      expect(result.unattempted).toHaveLength(1)
      expect((await runtime.runPromise((await runtime.runPromise(Artifact.Service)).listArtifacts())).items).toHaveLength(1)
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
