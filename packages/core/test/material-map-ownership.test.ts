import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const coreSource = path.join(import.meta.dir, "../src")
const opencodeSource = path.join(import.meta.dir, "../../opencode/src")

describe("Gate 13 ownership boundary", () => {
  test("keeps Material Map separate from runners, tools, storage internals, and historical byte access", async () => {
    const files = [
      path.join(coreSource, "material-map.ts"),
      ...(await sourceFiles(path.join(coreSource, "material-map"))),
    ]
    const sources = await Promise.all(files.map((filename) => readFile(filename, "utf8")))
    const imports = sources.flatMap(importSpecifiers)
    expect(
      imports.filter((specifier) =>
        /(^|\/)(agent|provider|session|turn|tool|terminal|llm|storage)(\/|$)/u.test(specifier),
      ),
    ).toEqual([])
    expect(sources.join("\n")).not.toContain("HistoricalReader")
    expect(sources.join("\n")).not.toContain("Representation.Interface")
    expect(sources.join("\n")).not.toContain("Representation.Service")
    expect(sources.join("\n")).not.toContain("Representation.node")
    expect(sources.join("\n")).not.toMatch(/\b(?:embedding|vector|rag)\b|full[- ]?text|preferred[_ -]?map/iu)
  })

  test("wires only the trusted application service and adds no model-visible Material command", async () => {
    const files = await sourceFiles(opencodeSource)
    const importers = await Promise.all(
      files.map(async (filename) => ({
        filename: path.relative(opencodeSource, filename).replaceAll("\\", "/"),
        source: await readFile(filename, "utf8"),
      })),
    )
    expect(
      importers.filter((file) => file.source.includes("@opencode-ai/core/material-map")).map((file) => file.filename),
    ).toEqual(["effect/app-runtime.ts"])
    expect(
      importers
        .filter((file) => /tool|learning-command|prompt|system-context/u.test(file.filename))
        .filter((file) => /MaterialMap|material[_-]map|material[_-]alignment/u.test(file.source))
        .map((file) => file.filename),
    ).toEqual([])
  })
})

async function sourceFiles(directory: string) {
  return Array.fromAsync(new Bun.Glob("**/*.ts").scan({ cwd: directory, absolute: true, onlyFiles: true }))
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/gu), (match) => match[1]!)
}
