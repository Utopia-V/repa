import { describe, expect, test } from "bun:test"
import path from "path"

const source = path.resolve(import.meta.dir, "../../src")
const promptRoots = ["agent/**/*.txt", "session/**/*.txt", "tool/**/*.txt"]
const codingProductResidue =
  /\bOpenCode\b|\bcoding agent\b|\bcoding session\b|\bsoftware engineering tasks?\b|\bcodebase\b|\bpull request description\b|\bbuild agent\b|Project references|Is directory a git repo|CLAUDE\.md|implementation plan/i

describe("released-v1 model-visible text audit", () => {
  test("ordinary, delegated, and hidden prompts contain no inherited coding-product identity", async () => {
    const files = (
      await Promise.all(
        promptRoots.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: source, onlyFiles: true }))),
      )
    )
      .flat()
      .sort()

    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const content = await Bun.file(path.join(source, file)).text()
      expect(content, file).not.toMatch(codingProductResidue)
    }
  })
})
