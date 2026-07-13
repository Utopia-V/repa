import { describe, expect, test } from "bun:test"

type ReferenceManifest = {
  opencode: {
    repository: string
    tag: string
    commit: string
    license: string
    checkout: string
    role: string
  }
  codex: {
    repository: string
    tag: string
    commit: string
    license: string
    checkout: string
    role: string
  }
}

describe("reference manifest", () => {
  test("pins an immutable, ignored OpenCode checkout", async () => {
    const manifest = (await Bun.file("references.lock.json").json()) as ReferenceManifest
    const reference = manifest.opencode

    expect(reference.repository).toBe("https://github.com/anomalyco/opencode.git")
    expect(reference.tag).toBe("v1.17.18")
    expect(reference.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(reference.license).toBe("MIT")
    expect(reference.checkout).toBe(".reference/opencode")
    expect(reference.role).toContain("read-only")

    const ignored = Bun.spawnSync({
      cmd: ["git", "check-ignore", "--quiet", reference.checkout],
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(ignored.exitCode).toBe(0)
  })

  test("pins an immutable, ignored Codex checkout", async () => {
    const manifest = (await Bun.file("references.lock.json").json()) as ReferenceManifest
    const reference = manifest.codex

    expect(reference.repository).toBe("https://github.com/openai/codex.git")
    expect(reference.tag).toBe("rust-v0.144.1")
    expect(reference.commit).toBe("44918ea10c0f99151c6710411b4322c2f5c96bea")
    expect(reference.license).toBe("Apache-2.0")
    expect(reference.checkout).toBe(".reference/codex")
    expect(reference.role).toContain("read-only")

    const ignored = Bun.spawnSync({
      cmd: ["git", "check-ignore", "--quiet", reference.checkout],
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(ignored.exitCode).toBe(0)
  })
})
