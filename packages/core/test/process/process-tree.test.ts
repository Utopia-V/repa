import { expect } from "bun:test"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Exit, Fiber } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live(
  "interrupts and awaits the spawned process tree",
  Effect.acquireUseRelease(
    Effect.promise(() => fs.mkdtemp(path.join(tmpdir(), "repa-process-tree-"))),
    (directory) =>
      Effect.gen(function* () {
        const pidFile = path.join(directory, "grandchild.pid")
        const grandchild = "setInterval(() => {}, 60000)"
        const parent = [
          'const {spawn}=require("child_process")',
          'const fs=require("fs")',
          `const child=spawn(process.execPath,["-e",${JSON.stringify(grandchild)}],{stdio:"ignore"})`,
          `fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid))`,
          "setInterval(() => {}, 60000)",
        ].join(";")
        const service = yield* AppProcess.Service
        const fiber = yield* service
          .run(
            ChildProcess.make(process.execPath, ["-e", parent], {
              env: {},
              extendEnv: false,
              shell: false,
              forceKillAfter: "1 second",
            }),
          )
          .pipe(Effect.forkChild)
        const pid = yield* waitForPID(pidFile)
        expect(processAlive(pid)).toBe(true)
        yield* Fiber.interrupt(fiber)
        yield* waitForExit(pid)
        expect(processAlive(pid)).toBe(false)
      }),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  ),
  10_000,
)

it.live(
  "times out and awaits the spawned process tree",
  Effect.acquireUseRelease(
    Effect.promise(() => fs.mkdtemp(path.join(tmpdir(), "repa-process-tree-timeout-"))),
    (directory) =>
      Effect.gen(function* () {
        const pidFile = path.join(directory, "grandchild.pid")
        const grandchild = "setInterval(() => {}, 60000)"
        const parent = [
          'const {spawn}=require("child_process")',
          'const fs=require("fs")',
          `const child=spawn(process.execPath,["-e",${JSON.stringify(grandchild)}],{stdio:"ignore"})`,
          `fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid))`,
          "setInterval(() => {}, 60000)",
        ].join(";")
        const service = yield* AppProcess.Service
        const exit = yield* Effect.exit(
          service.run(
            ChildProcess.make(process.execPath, ["-e", parent], {
              env: {},
              extendEnv: false,
              shell: false,
              forceKillAfter: "1 second",
            }),
            { timeout: "250 millis" },
          ),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const reason = exit.cause.reasons[0]
          expect(reason?._tag).toBe("Fail")
          if (reason?._tag === "Fail") {
            expect(reason.error).toMatchObject({ cause: expect.any(AppProcess.AppProcessTimeoutError) })
          }
        }
        const pid = yield* waitForPID(pidFile)
        yield* waitForExit(pid)
        expect(processAlive(pid)).toBe(false)
      }),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  ),
  10_000,
)

function waitForPID(file: string) {
  return Effect.promise(async () => {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      const value = await fs.readFile(file, "utf8").catch(() => undefined)
      if (value && /^\d+$/.test(value)) return Number(value)
      await Bun.sleep(20)
    }
    throw new Error("grandchild did not report readiness")
  })
}

function waitForExit(pid: number) {
  return Effect.promise(async () => {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      if (!processAlive(pid)) return
      await Bun.sleep(20)
    }
    throw new Error(`grandchild ${pid} survived process-tree interruption`)
  })
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
