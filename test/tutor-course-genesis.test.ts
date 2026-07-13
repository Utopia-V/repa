import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider"
import { afterEach, describe, expect, test } from "bun:test"
import { MockLanguageModelV3 } from "ai/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readSessionItems, readToolInvocation } from "../src/interaction/records"
import { readActiveCourseContext } from "../src/learning/curriculum/course-view"
import { runTutorTurn } from "../src/runtime/run-tutor-turn"
import { tutorToolInvocationId } from "../src/runtime/tutor-tool-binding"
import { openRepaDatabase } from "../src/storage/open-database"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A test may close before reopening the same database.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Tutor course genesis", () => {
  test("the Agent can ground a new course in workspace-confined Markdown and teach its first range", async () => {
    const fixture = emptyLearnerHome("markdown-genesis")
    await Bun.write(
      join(fixture.root, "objects.md"),
      [
        "# Objects",
        "GENESIS_SOURCE_ONLY: objects group related values.",
        "## References",
        "Variables hold references to objects.",
      ].join("\n"),
    )
    let providerCall = 0
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        providerCall += 1
        const prompt = JSON.stringify(options.prompt)
        const tools = JSON.stringify(options.tools)
        if (providerCall === 1) {
          expect(prompt).toContain("objects.md")
          expect(tools).toContain("register_markdown_course")
          expect(tools).not.toContain("read_current_course_material")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:register-markdown",
              toolName: "register_markdown_course",
              input: JSON.stringify({
                relativePath: "objects.md",
                title: "Object references",
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (providerCall === 2) {
          expect(prompt).toContain("Objects")
          expect(prompt).not.toContain("GENESIS_SOURCE_ONLY")
          expect(tools).toContain("read_current_course_material")
          expect(tools).not.toContain("register_markdown_course")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:read-genesis",
              toolName: "read_current_course_material",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (providerCall === 3) {
          expect(prompt).toContain("GENESIS_SOURCE_ONLY")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "teach-genesis" },
            {
              type: "text-delta",
              id: "teach-genesis",
              delta: "我们从对象开始：它把一组彼此相关的值组织成一个整体。",
            },
            { type: "text-end", id: "teach-genesis" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected Markdown genesis provider call ${providerCall}`)
      },
    })
    let now = 10
    const outcome = await runTutorTurn({
      database: fixture.database,
      model,
      workspaceRoot: fixture.root,
      learnerText: "请用 objects.md 开始教我。",
      identity: identity("markdown-genesis"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
      maxModelSteps: 6,
    })

    expect(outcome.modelSteps).toBe(3)
    expect(readActiveCourseContext(fixture.database)).toMatchObject({
      title: "Object references",
      basis: "source_grounded",
      route: { version: 1, anchor: { title: "Objects" } },
      material: { relativePath: "objects.md", startLine: 1, endLine: 2 },
    })
    const registerInvocationId = tutorToolInvocationId(
      "model:markdown-genesis:0",
      "call:register-markdown",
    )
    expect(readToolInvocation(fixture.database, registerInvocationId)).toMatchObject({
      status: "completed",
      effectId: expect.any(String),
      result: { ok: true, basis: "source_grounded" },
    })
    expect(JSON.stringify(readToolInvocation(fixture.database, registerInvocationId))).not
      .toContain("GENESIS_SOURCE_ONLY")
    expect(JSON.stringify(readSessionItems(fixture.database, "session:markdown-genesis"))).not
      .toContain("GENESIS_SOURCE_ONLY")
  })

  test("a no-material provisional route uses the same Course View and survives a fresh Session", async () => {
    const fixture = emptyLearnerHome("provisional-genesis")
    let firstCall = 0
    const firstModel = new MockLanguageModelV3({
      doStream: async (options) => {
        firstCall += 1
        const prompt = JSON.stringify(options.prompt)
        const tools = JSON.stringify(options.tools)
        if (firstCall === 1) {
          expect(tools).toContain("create_provisional_course_route")
          expect(tools).not.toContain("advance_course_route")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:create-provisional",
              toolName: "create_provisional_course_route",
              input: JSON.stringify({
                title: "Graph algorithms",
                items: [
                  { title: "Graph foundations" },
                  { title: "Breadth-first search", parentIndex: 0 },
                  { title: "Depth-first search", parentIndex: 0 },
                ],
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (firstCall === 2) {
          expect(prompt).toContain("model_proposed")
          expect(prompt).toContain("Graph foundations")
          expect(tools).toContain("advance_course_route")
          expect(tools).not.toContain("read_current_course_material")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "teach-foundations" },
            {
              type: "text-delta",
              id: "teach-foundations",
              delta: "图由顶点和边组成；先分清有向、无向与权重。",
            },
            { type: "text-end", id: "teach-foundations" },
            {
              type: "tool-call",
              toolCallId: "call:advance-provisional",
              toolName: "advance_course_route",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (firstCall === 3) {
          expect(prompt).toContain("Breadth-first search")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "close-provisional" },
            { type: "text-delta", id: "close-provisional", delta: "接下来进入 BFS。" },
            { type: "text-end", id: "close-provisional" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected provisional provider call ${firstCall}`)
      },
    })
    let firstNow = 10
    await runTutorTurn({
      database: fixture.database,
      model: firstModel,
      workspaceRoot: fixture.root,
      learnerText: "我没有现成材料，想系统学习图算法。",
      identity: identity("provisional-first"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++firstNow,
      maxModelSteps: 6,
    })
    expect(readActiveCourseContext(fixture.database)).toMatchObject({
      title: "Graph algorithms",
      basis: "model_proposed",
      route: { version: 2, anchor: { title: "Breadth-first search" } },
      material: null,
    })

    fixture.database.close()
    openDatabases.splice(openDatabases.indexOf(fixture.database), 1)
    const reopened = openRepaDatabase(fixture.databasePath)
    openDatabases.push(reopened)
    const continuationModel = new MockLanguageModelV3({
      doStream: async (options) => {
        const prompt = JSON.stringify(options.prompt)
        expect(prompt).toContain("Breadth-first search")
        expect(prompt).toContain("继续")
        expect(prompt).not.toContain("我没有现成材料")
        expect(prompt).not.toContain("图由顶点和边组成")
        expect(JSON.stringify(options.tools)).not.toContain("read_current_course_material")
        return stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "fresh-bfs" },
          {
            type: "text-delta",
            id: "fresh-bfs",
            delta: "继续 BFS：它按距离起点的层次扩展顶点。",
          },
          { type: "text-end", id: "fresh-bfs" },
          finish("stop"),
        ])
      },
    })
    let continuationNow = 100
    const continuation = await runTutorTurn({
      database: reopened,
      model: continuationModel,
      workspaceRoot: fixture.root,
      learnerText: "继续",
      identity: identity("provisional-fresh"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++continuationNow,
      maxModelSteps: 3,
    })
    expect(continuation.text).toBe("继续 BFS：它按距离起点的层次扩展顶点。")
  })
})

function emptyLearnerHome(scope: string) {
  const root = mkdtempSync(join(tmpdir(), `repa-${scope}-`))
  temporaryDirectories.push(root)
  const databasePath = join(root, "repa.sqlite")
  const database = openRepaDatabase(databasePath)
  openDatabases.push(database)
  return { root, databasePath, database }
}

function identity(scope: string) {
  return {
    sessionId: `session:${scope}`,
    turnId: `turn:${scope}`,
    userItemId: `item:user:${scope}`,
    assistantItemId: `item:assistant:${scope}`,
    modelOperationId: (stepNumber: number) => `model:${scope}:${stepNumber}`,
    toolItemId: (toolCallId: string) => `item:tool:${scope}:${toolCallId}`,
  }
}

function stream(parts: LanguageModelV3StreamPart[]) {
  return {
    stream: new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part)
        controller.close()
      },
    }),
  }
}

function finish(
  reason: "stop" | "tool-calls" | "error",
): Extract<LanguageModelV3StreamPart, { type: "finish" }> {
  return {
    type: "finish",
    finishReason: { unified: reason, raw: reason },
    usage: emptyUsage(),
  }
}

function emptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  }
}
