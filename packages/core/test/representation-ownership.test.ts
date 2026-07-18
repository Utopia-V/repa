import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const coreSource = path.join(import.meta.dir, "../src")
const opencodeRepresentationSource = path.join(import.meta.dir, "../../opencode/src/representation")

describe("Gate 11 ownership boundary", () => {
  test("keeps raw managed storage behind the Core Representation authority", async () => {
    const files = await sourceFiles(coreSource)
    const importers = await Promise.all(
      files.map(async (filename) => ({
        filename,
        imports: importSpecifiers(await readFile(filename, "utf8")),
      })),
    )

    expect(
      importers
        .filter((file) => file.imports.includes("./representation/storage"))
        .map((file) => path.relative(coreSource, file.filename).replaceAll("\\", "/")),
    ).toEqual(["representation.ts"])
    expect(
      importers
        .filter((file) => path.relative(coreSource, file.filename).replaceAll("\\", "/").startsWith("representation"))
        .flatMap((file) =>
          file.imports.flatMap((specifier) =>
            /(^|\/)(session|provider|agent|llm)(\/|$)/u.test(specifier)
              ? [`${path.relative(coreSource, file.filename)} -> ${specifier}`]
              : [],
          ),
        ),
    ).toEqual([])
  })

  test("keeps Artifact and Representation schemas distinct and adds no adjacent conversion subsystem", async () => {
    const artifactSQL = await readFile(path.join(coreSource, "artifact/sql.ts"), "utf8")
    const representationSQL = await readFile(path.join(coreSource, "representation/sql.ts"), "utf8")
    expect(artifactSQL).toContain('sqliteTable(\n  "artifact"')
    expect(artifactSQL).toContain('sqliteTable(\n  "artifact_revision"')
    expect(artifactSQL).not.toContain('"representation_revision"')
    expect(representationSQL).toContain('sqliteTable(\n  "representation_revision"')
    expect(representationSQL).not.toContain('sqliteTable(\n  "artifact"')

    const representationFiles = [
      ...(await sourceFiles(path.join(coreSource, "representation"))),
      ...(await sourceFiles(opencodeRepresentationSource)),
    ].map((filename) => path.basename(filename).toLowerCase())
    expect(
      representationFiles.filter((filename) =>
        /(^|[-_.])(ocr|rag|embedding|vector|plugin)([-_.]|$)|remote[-_.]converter|gate[-_.]1[23]/u.test(filename),
      ),
    ).toEqual([])
  })
})

async function sourceFiles(directory: string) {
  return Array.fromAsync(new Bun.Glob("**/*.ts").scan({ cwd: directory, absolute: true, onlyFiles: true }))
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/gu), (match) => match[1]!)
}
