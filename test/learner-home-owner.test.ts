import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import {
  acquireLearnerHomeWriteOwnership,
  LearnerHomeAlreadyOwnedError,
} from "../src/storage/learner-home-owner"

const temporaryDirectories: string[] = []

afterEach(async () => {
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("LearnerHome write ownership", () => {
  test("one owner excludes another connection and explicit release hands ownership over", () => {
    const databasePath = temporaryDatabasePath()
    const first = acquireLearnerHomeWriteOwnership({ databasePath })

    expect(() => acquireLearnerHomeWriteOwnership({ databasePath })).toThrow(
      LearnerHomeAlreadyOwnedError,
    )

    expect(first.release()).toEqual({ replayed: false })
    expect(first.release()).toEqual({ replayed: true })
    const successor = acquireLearnerHomeWriteOwnership({ databasePath })
    expect(successor.release()).toEqual({ replayed: false })
  })

  test("a second Bun process is rejected while the owner lives and succeeds after abrupt exit", async () => {
    const databasePath = temporaryDatabasePath()
    const helper = resolve("test/fixtures/learner-home-owner-child.ts")
    const holder = Bun.spawn(
      [process.execPath, helper, databasePath, "hold-then-exit"],
      { stdout: "pipe", stderr: "pipe" },
    )
    const holderReader = holder.stdout.getReader()
    const firstOutput = await holderReader.read()
    const announcement = new TextDecoder().decode(firstOutput.value)
    expect(announcement).toContain("ACQUIRED")

    const contender = Bun.spawn(
      [process.execPath, helper, databasePath, "acquire-and-release"],
      { stdout: "pipe", stderr: "pipe" },
    )
    const contenderError = new Response(contender.stderr).text()
    expect(await contender.exited).toBe(23)
    expect(await contenderError).toContain("already has a state-changing owner")

    holderReader.releaseLock()
    expect(await holder.exited).toBe(17)

    const successor = Bun.spawn(
      [process.execPath, helper, databasePath, "acquire-and-release"],
      { stdout: "pipe", stderr: "pipe" },
    )
    const successorOutput = new Response(successor.stdout).text()
    expect(await successor.exited).toBe(0)
    expect(await successorOutput).toContain("ACQUIRED")
  })
})

function temporaryDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "repa-learner-home-owner-"))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, "nested", "repa.sqlite")
  mkdirSync(dirname(databasePath), { recursive: true })
  return databasePath
}
