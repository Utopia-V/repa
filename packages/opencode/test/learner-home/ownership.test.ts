import { expect } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { it } from "../lib/effect"

const fixture = path.join(import.meta.dir, "../fixture/learner-home-owner.ts")

function spawnOwner(database: string) {
  return Bun.spawn([process.execPath, fixture], {
    cwd: path.join(import.meta.dir, "../.."),
    env: { ...process.env, REPA_DB: database },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
}

async function ready(process: ReturnType<typeof spawnOwner>) {
  const reader = process.stdout.getReader()
  try {
    const chunk = await reader.read()
    expect(new TextDecoder().decode(chunk.value)).toContain("ready")
  } finally {
    reader.releaseLock()
  }
}

async function stop(process: ReturnType<typeof spawnOwner>) {
  if (process.exitCode !== null) return
  process.stdin.end()
  await process.exited
}

it.live(
  "refuses a second state owner and permits immediate reuse after orderly release",
  Effect.tryPromise(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "repa-owner-test-"))
    const database = path.join(directory, "repa.db")
    const first = spawnOwner(database)
    try {
      await ready(first)

      const second = spawnOwner(database)
      const secondCode = await second.exited
      expect(secondCode).toBe(2)
      expect(await new Response(second.stderr).text()).toContain("LearnerHomeBusyError")

      await stop(first)
      const third = spawnOwner(database)
      try {
        await ready(third)
      } finally {
        await stop(third)
      }
    } finally {
      await stop(first).catch(() => {})
      await fs.rm(directory, { recursive: true, force: true })
    }
  }),
  30_000,
)
