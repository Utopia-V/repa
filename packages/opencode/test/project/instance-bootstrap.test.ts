import { afterEach, expect } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProjectV2 } from "@opencode-ai/core/project"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { bootstrap as cliBootstrap } from "../../src/cli/bootstrap"
import { Config } from "../../src/config/config"
import { InstanceRef } from "../../src/effect/instance-ref"
import { Format } from "../../src/format"
import { LSP } from "../../src/lsp/lsp"
import { Plugin } from "../../src/plugin"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { Project } from "../../src/project/project"
import { Vcs } from "../../src/project/vcs"
import { ShareNext } from "../../src/share/share-next"
import { Snapshot } from "../../src/snapshot"
import { disposeAllInstances, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { waitGlobalBusEvent } from "../server/global-bus"

const it = testEffect(
  LayerNode.compile(LayerNode.group([InstanceStore.node, CrossSpawnSpawner.node]), [
    [InstanceStore.bootstrapNode, InstanceBootstrap.node],
  ]),
)

const startupCalls: string[] = []
const initProbe = (name: string) => () =>
  Effect.sync(() => {
    startupCalls.push(name)
  })
const startupProbeIt = testEffect(
  LayerNode.compile(InstanceBootstrap.node, [
    [Config.node, Layer.mock(Config.Service)({ get: () => Effect.succeed({}) })],
    [Format.node, Layer.mock(Format.Service)({ init: initProbe("format") })],
    [LSP.node, Layer.mock(LSP.Service)({ init: initProbe("lsp") })],
    [Plugin.node, Layer.mock(Plugin.Service)({ init: initProbe("plugin") })],
    [Project.node, Layer.mock(Project.Service)({ init: initProbe("project") })],
    [ShareNext.node, Layer.mock(ShareNext.Service)({ init: initProbe("share") })],
    [Snapshot.node, Layer.mock(Snapshot.Service)({ init: initProbe("snapshot") })],
    [Vcs.node, Layer.mock(Vcs.Service)({ init: initProbe("vcs") })],
  ]),
)

// InstanceBootstrap must run before any code touches the instance —
// originally tracked by PRs #25389 and #25449, now a permanent
// invariant. The plugin config hook writes a marker file; the test
// bodies deliberately avoid Plugin/config directly. The marker only
// appears if InstanceBootstrap ran at the instance boundary.
//
// The boundaries below are transport-agnostic and stay.

afterEach(async () => {
  await disposeAllInstances()
})

const bootstrapFixture = Effect.gen(function* () {
  const dir = yield* tmpdirScoped({ git: true })
  const marker = path.join(dir, "config-hook-fired")
  const pluginFile = path.join(dir, "plugin.ts")
  yield* Effect.promise(() =>
    Bun.write(
      pluginFile,
      [
        `const MARKER = ${JSON.stringify(marker)}`,
        "export default async () => ({",
        "  config: async () => {",
        '    await Bun.write(MARKER, "ran")',
        "  },",
        "})",
        "",
      ].join("\n"),
    ),
  )
  yield* Effect.promise(() =>
    Bun.write(
      path.join(dir, "repa.json"),
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        plugin: [pathToFileURL(pluginFile).href],
      }),
    ),
  )
  return { directory: dir, marker }
})

function waitDisposed(directory: string) {
  return waitGlobalBusEvent({
    message: "timed out waiting for CLI bootstrap instance disposal",
    predicate: (event) => event.payload.type === "server.instance.disposed" && event.directory === directory,
  })
}

it.live("InstanceStore.provide runs InstanceBootstrap before effect", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture
    const store = yield* InstanceStore.Service

    yield* store.provide({ directory: tmp.directory }, Effect.succeed("ok"))

    expect(existsSync(tmp.marker)).toBe(true)
  }),
)

startupProbeIt.effect("Instance bootstrap initializes only retained local services", () =>
  Effect.gen(function* () {
    startupCalls.length = 0
    const directory = "C:/repa-bootstrap-probe"
    const bootstrap = yield* InstanceBootstrap.Service

    yield* bootstrap.run.pipe(
      Effect.provideService(InstanceRef, {
        directory,
        worktree: directory,
        project: {
          id: ProjectV2.ID.global,
          worktree: directory,
          time: { created: 0, updated: 0 },
          sandboxes: [],
        },
      }),
    )

    expect(new Set(startupCalls)).toEqual(new Set(["format", "lsp", "plugin", "project", "snapshot", "vcs"]))
    expect(startupCalls).not.toContain("share")
  }),
)

it.live("CLI bootstrap runs InstanceBootstrap before callback", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture

    yield* Effect.promise(() => cliBootstrap(tmp.directory, async () => "ok"))

    expect(existsSync(tmp.marker)).toBe(true)
  }),
)

it.live("CLI bootstrap disposes the instance when the callback rejects", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture
    const disposed = yield* waitDisposed(tmp.directory).pipe(Effect.forkScoped({ startImmediately: true }))

    const exit = yield* Effect.promise(() =>
      cliBootstrap(tmp.directory, async () => Promise.reject(new Error("boom"))),
    ).pipe(Effect.exit)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ message: "boom" })
    yield* Fiber.join(disposed)
  }),
)

it.live("InstanceStore.reload runs InstanceBootstrap", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture
    const store = yield* InstanceStore.Service

    yield* store.reload({ directory: tmp.directory })

    expect(existsSync(tmp.marker)).toBe(true)
  }),
)
