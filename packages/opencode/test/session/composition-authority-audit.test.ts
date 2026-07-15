import { describe, expect, test } from "bun:test"
import path from "path"

const sourceRoot = path.resolve(import.meta.dir, "../../src")

function read(file: string) {
  return Bun.file(path.join(sourceRoot, file)).text()
}

async function productionSources() {
  const files = [...new Bun.Glob("**/*.ts").scanSync({ cwd: sourceRoot })]
  return Promise.all(
    files.map(async (file) => ({
      file: file.replaceAll("\\", "/"),
      source: await read(file),
    })),
  )
}

describe("released-v1 composition authority audit", () => {
  test("keeps the internal-purpose union closed to the three program-owned call sites", async () => {
    const sources = await productionSources()
    const internal = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/composition:\s*\{\s*type:\s*"internal",\s*purpose:\s*"([^"]+)"\s*\}/g)].map(
        (match) => `${file}:${match[1]}`,
      ),
    )
    const interactive = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/composition:\s*\{\s*type:\s*"interactive"\s*\}/g)].map(() => file),
    )

    expect(internal.toSorted()).toEqual([
      "server/routes/instance/httpapi/handlers/project-copy.ts:project-copy-name",
      "session/compaction.ts:compaction",
      "session/prompt.ts:title",
    ])
    expect(interactive).toEqual(["session/prompt.ts"])
    expect(sources.map((item) => item.source).join("\n")).not.toMatch(/purpose:\s*"summary"/)

    const request = await read("session/llm/request.ts")
    const prompt = await read("session/prompt.ts")
    expect(request).not.toContain("agent.hidden")
    expect(prompt).toContain("const agent = yield* agents.get(lastUser.agent)")
    expect(prompt).toContain('composition: { type: "interactive" }')
  })

  test("keeps caller-owned composition outside public Agent selectors", async () => {
    const prompt = await read("session/prompt.ts")
    const promptInput = prompt.slice(
      prompt.indexOf("export const PromptInput"),
      prompt.indexOf("export type PromptInput"),
    )
    const publicSelectors = await Promise.all([
      read("cli/cmd/run.ts"),
      read("cli/cmd/tui.ts"),
      read("server/routes/instance/httpapi/groups/session.ts"),
      read("server/routes/instance/httpapi/groups/project-copy.ts"),
    ])

    expect(promptInput).not.toMatch(/\bcomposition\b|\bpurpose\b/)
    expect(publicSelectors.every((source) => !source.includes("composition:"))).toBe(true)
  })

  test("keeps Agent.generate and summary on their dedicated non-purpose owners", async () => {
    const agent = await read("agent/agent.ts")
    const projectCopy = await read("server/routes/instance/httpapi/handlers/project-copy.ts")
    const start = agent.indexOf('generate: Effect.fn("Agent.generate")')
    const generated = agent.slice(start, agent.indexOf("const locationServiceMapNode", start))

    expect(start).toBeGreaterThan(0)
    expect(agent).toContain("const GeneratedAgent = Schema.Struct")
    expect(agent).toContain("summary: {")
    expect(generated).toContain("const system = generationSystem(extensions)")
    expect(generated).toContain("schema: Object.assign(")
    expect(generated).toContain("streamObject({")
    expect(generated).toContain("generateObject(params)")
    expect(generated).not.toContain("composition:")
    expect(generated).not.toContain("tools:")
    expect(projectCopy).toContain("if (!fallback) return Slug.create()")
    expect(projectCopy).toContain("Effect.catchCause")
    expect(projectCopy).toContain("Effect.as(Slug.create())")
  })
})
