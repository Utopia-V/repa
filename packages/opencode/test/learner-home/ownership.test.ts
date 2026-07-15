import { expect } from "bun:test"
import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { it } from "../lib/effect"

const fixture = path.join(import.meta.dir, "../fixture/learner-home-owner.ts")
const lockFixture = path.join(import.meta.dir, "../fixture/sqlite-lock-holder.ts")

function spawnOwner(database: string, env: Record<string, string> = {}) {
  return Bun.spawn([process.execPath, fixture], {
    cwd: path.join(import.meta.dir, "../.."),
    env: { ...process.env, ...env, REPA_DB: database },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
}

function spawnLockHolder(database: string) {
  return Bun.spawn([process.execPath, lockFixture, database], {
    cwd: path.join(import.meta.dir, "../.."),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
}

async function rejected(process: ReturnType<typeof spawnOwner>, tag: string) {
  expect(await process.exited).toBe(2)
  expect(await new Response(process.stderr).text()).toContain(tag)
}

function digest(input: Uint8Array) {
  return createHash("sha256").update(input).digest("hex")
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

async function outcome(process: ReturnType<typeof spawnOwner>) {
  const reader = process.stdout.getReader()
  try {
    const chunk = await reader.read()
    if (new TextDecoder().decode(chunk.value).includes("ready")) return { ready: true as const, process }
  } finally {
    reader.releaseLock()
  }
  return {
    ready: false as const,
    code: await process.exited,
    error: await new Response(process.stderr).text(),
  }
}

it.live(
  "refuses a second state owner and permits immediate reuse after orderly release",
  Effect.tryPromise(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "repa-owner-test-"))
    const database = path.join(directory, "repa.db")
    const first = spawnOwner(database, { XDG_STATE_HOME: path.join(directory, "state-a") })
    try {
      await ready(first)

      const second = spawnOwner(database, { XDG_STATE_HOME: path.join(directory, "state-b") })
      await rejected(second, "DatabaseBusyError")

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

it.live(
  "keeps one lock domain across concurrent creation, the existing-path handoff, and abrupt release",
  Effect.tryPromise(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "repa-owner-lifecycle-test-"))
    const database = path.join(directory, "repa.db")
    try {
      const first = spawnOwner(database, { XDG_STATE_HOME: path.join(directory, "creator-a") })
      const second = spawnOwner(database, { XDG_STATE_HOME: path.join(directory, "creator-b") })
      const results = await Promise.all([outcome(first), outcome(second)])
      const winners = results.filter((result) => result.ready)
      const losers = results.filter((result) => !result.ready)
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect(losers[0]).toMatchObject({ code: 2 })
      expect(losers[0]?.ready ? "" : losers[0]?.error).toContain("DatabaseBusyError")
      if (winners[0]?.ready) await stop(winners[0].process)

      await fs.rm(database, { force: true })
      const holder = spawnLockHolder(database)
      try {
        await ready(holder)
        expect(existsSync(database)).toBe(true)
        await rejected(spawnOwner(database), "DatabaseBusyError")
      } finally {
        await stop(holder)
      }

      const owner = spawnOwner(database)
      await ready(owner)
      owner.kill()
      expect(await owner.exited).not.toBe(0)

      const recovered = spawnOwner(database)
      try {
        await ready(recovered)
      } finally {
        await stop(recovered)
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }),
  60_000,
)

it.live(
  "converges stable filesystem aliases and rejects a hardlink before SQLite access",
  Effect.tryPromise(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "repa-owner-alias-test-"))
    const actual = path.join(directory, "actual")
    const alias = path.join(directory, "alias")
    const database = path.join(actual, "repa.db")
    const throughDirectory = path.join(alias, "repa.db")
    await fs.mkdir(actual)
    await fs.symlink(actual, alias, process.platform === "win32" ? "junction" : "dir")

    const danglingTarget = path.join(actual, "dangling.db")
    const danglingAlias = path.join(directory, "dangling-link.db")
    await fs.symlink(danglingTarget, danglingAlias, "file")
    await rejected(spawnOwner(danglingAlias), "DatabaseStorageError")
    expect(existsSync(danglingTarget)).toBe(false)
    for (const filename of [danglingAlias, danglingTarget]) {
      for (const suffix of ["-journal", "-wal", "-shm"]) expect(existsSync(filename + suffix)).toBe(false)
    }
    await fs.rm(danglingAlias)

    const initialize = spawnOwner(database)
    try {
      await ready(initialize)
    } finally {
      await stop(initialize)
    }

    const fileAlias = path.join(directory, "repa-link.db")
    await fs.symlink(database, fileAlias, "file")

    for (const candidate of [
      throughDirectory,
      fileAlias,
      ...(process.platform === "win32" ? [`\\\\?\\${database}`] : []),
    ]) {
      const owner = spawnOwner(database)
      try {
        await ready(owner)
        await rejected(spawnOwner(candidate), "DatabaseBusyError")
      } finally {
        await stop(owner)
      }
    }

    const hardlink = path.join(directory, "repa-hardlink.db")
    await fs.link(database, hardlink)
    const before = digest(await fs.readFile(database))
    await rejected(spawnOwner(hardlink), "DatabaseStorageError")
    expect(digest(await fs.readFile(database))).toBe(before)
    for (const suffix of ["-journal", "-wal", "-shm"]) expect(existsSync(hardlink + suffix)).toBe(false)

    await fs.rm(directory, { recursive: true, force: true })
  }),
  60_000,
)

if (process.platform === "win32") {
  it.live(
    "converges an available 8.3 spelling and rejects UNC storage before open",
    Effect.tryPromise(async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "repa-owner-short-test-"))
      const database = path.join(directory, "repa.db")
      const initialize = spawnOwner(database)
      try {
        await ready(initialize)
      } finally {
        await stop(initialize)
      }

      const command = Bun.spawn(["cmd.exe", "/d", "/c", `for %I in (${database}) do @echo %~sI`], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const short = (await new Response(command.stdout).text()).trim()
      expect(await command.exited).toBe(0)
      if (short.toLowerCase() !== database.toLowerCase()) {
        const owner = spawnOwner(database)
        try {
          await ready(owner)
          await rejected(spawnOwner(short), "DatabaseBusyError")
        } finally {
          await stop(owner)
        }
      } else {
        process.stderr.write("8.3 aliases are unavailable on this volume; alias evidence not claimed\n")
      }

      await rejected(spawnOwner("\\\\localhost\\repa-unsupported\\repa.db"), "DatabaseStorageError")
      await fs.rm(directory, { recursive: true, force: true })
    }),
    60_000,
  )
}
