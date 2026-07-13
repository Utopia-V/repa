import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  observeMarkdownArtifact,
  readMarkdownSelector,
} from "../src/sources/markdown-artifact"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("Markdown source observation", () => {
  test("preserves nested ATX headings and direct bounded ranges while ignoring fenced code", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-markdown-source-"))
    temporaryDirectories.push(root)
    const path = join(root, "objects.md")
    await Bun.write(path, fixtureMarkdown())

    const observed = await observeMarkdownArtifact({
      workspaceRoot: root,
      relativePath: "objects.md",
    })

    expect(observed.revision).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(observed.relativePath).toBe("objects.md")
    expect(observed.headings.map(({ title, level, parentKey, startLine, endLine }) => ({
      title,
      level,
      parentKey,
      startLine,
      endLine,
    }))).toEqual([
      {
        title: "Objects",
        level: 1,
        parentKey: null,
        startLine: 1,
        endLine: 2,
      },
      {
        title: "References",
        level: 2,
        parentKey: observed.headings[0]!.key,
        startLine: 3,
        endLine: 8,
      },
      {
        title: "Equality",
        level: 3,
        parentKey: observed.headings[1]!.key,
        startLine: 9,
        endLine: 10,
      },
      {
        title: "Mutation",
        level: 2,
        parentKey: observed.headings[0]!.key,
        startLine: 11,
        endLine: 12,
      },
    ])

    const range = await readMarkdownSelector({
      workspaceRoot: root,
      relativePath: observed.relativePath,
      expectedRevision: observed.revision,
      startLine: 3,
      endLine: 8,
    })
    expect(range).toEqual({
      status: "current",
      revision: observed.revision,
      startLine: 3,
      endLine: 8,
      text: [
        "## References",
        "Variables hold references to objects.",
        "```js",
        "# not a Markdown heading",
        "const alias = object",
        "```",
      ].join("\n"),
    })
  })

  test("fails an old selector closed after the material revision changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-markdown-stale-"))
    temporaryDirectories.push(root)
    const path = join(root, "objects.md")
    await Bun.write(path, fixtureMarkdown())
    const observed = await observeMarkdownArtifact({
      workspaceRoot: root,
      relativePath: "objects.md",
    })

    await Bun.write(path, `${fixtureMarkdown()}\nChanged after observation.\n`)

    const range = await readMarkdownSelector({
      workspaceRoot: root,
      relativePath: observed.relativePath,
      expectedRevision: observed.revision,
      startLine: 3,
      endLine: 8,
    })
    expect(range.status).toBe("stale")
    if (range.status !== "stale") throw new Error("Expected a stale selector")
    expect(range.expectedRevision).toBe(observed.revision)
    expect(range.actualRevision).not.toBe(observed.revision)
    expect(JSON.stringify(range)).not.toContain("Variables hold references")
  })

  test("rejects a path that resolves outside the learning workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-markdown-confined-"))
    temporaryDirectories.push(root)

    await expect(
      observeMarkdownArtifact({
        workspaceRoot: root,
        relativePath: "../outside.md",
      }),
    ).rejects.toThrow("outside the workspace root")
  })
})

function fixtureMarkdown() {
  return [
    "# Objects",
    "Objects group related values.",
    "## References",
    "Variables hold references to objects.",
    "```js",
    "# not a Markdown heading",
    "const alias = object",
    "```",
    "### Equality",
    "Equality compares object identity.",
    "## Mutation",
    "Aliases observe the same mutation.",
  ].join("\n")
}
