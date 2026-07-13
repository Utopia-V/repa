import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider"
import { afterEach, describe, expect, test } from "bun:test"
import { MockLanguageModelV3 } from "ai/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { admitUserTurn, createSession, finishTurn, readSessionItems } from "../src/interaction/records"
import {
  createProvisionalCourse,
  readActiveCourseContext,
  registerMarkdownCourse,
} from "../src/learning/curriculum/course-view"
import { runTutorTurn } from "../src/runtime/run-tutor-turn"
import { observeMarkdownArtifact } from "../src/sources/markdown-artifact"
import { openRepaDatabase } from "../src/storage/open-database"
import { DEFAULT_TUTOR_POLICY_PROFILE_REVISION } from "../src/tutor/policy-profile"

const temporaryDirectories: string[] = []
const openDatabases: Array<ReturnType<typeof openRepaDatabase>> = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A test may close its handle explicitly.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Tutor course correction", () => {
  test("the Agent inspects, supersedes a provisional route, then explicitly re-anchors it", async () => {
    const fixture = provisionalFixture()
    let call = 0
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        call += 1
        const prompt = JSON.stringify(options.prompt)
        const tools = JSON.stringify(options.tools)
        if (call === 1) {
          expect(tools).toContain("inspect_active_course_view")
          expect(tools).toContain("revise_provisional_course_route")
          expect(tools).toContain("set_course_route_anchor")
          expect(tools).not.toContain("realign_current_markdown_course")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:inspect-provisional",
              toolName: "inspect_active_course_view",
              input: JSON.stringify({ offset: 0, limit: 20 }),
            },
            finish("tool-calls"),
          ])
        }
        if (call === 2) {
          expect(prompt).toContain("Depth-first search")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:revise-provisional",
              toolName: "revise_provisional_course_route",
              input: JSON.stringify({
                items: [
                  { title: "Graph representations" },
                  { title: "Breadth-first search", parentIndex: 0 },
                  { title: "Shortest paths", parentIndex: 0 },
                  { title: "Depth-first search", parentIndex: 0 },
                ],
                routeAnchorIndex: 0,
              }),
            },
            finish("tool-calls"),
          ])
        }
        if (call === 3) {
          expect(prompt).toContain("Shortest paths")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:reanchor-shortest-paths",
              toolName: "set_course_route_anchor",
              input: JSON.stringify({ targetOrdinal: 2 }),
            },
            finish("tool-calls"),
          ])
        }
        if (call === 4) {
          expect(prompt).toContain("Shortest paths")
          expect(prompt).toContain("route version: 3")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "corrected" },
            {
              type: "text-delta",
              id: "corrected",
              delta: "路线已修正，并把当前位置放到最短路径；这只是导航，不代表掌握。",
            },
            { type: "text-end", id: "corrected" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected provisional correction call ${call}`)
      },
    })
    let now = 20
    await runTutorTurn({
      database: fixture.database,
      model,
      workspaceRoot: fixture.root,
      learnerText: "这个路线不对：加上最短路径，并把我放到那一节。",
      identity: identity("correct-provisional"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
      maxModelSteps: 7,
    })

    expect(readActiveCourseContext(fixture.database)).toMatchObject({
      basis: "model_proposed",
      route: { version: 3, anchor: { ordinal: 2, title: "Shortest paths" } },
    })
    expect(
      (
        fixture.database
          .query("SELECT COUNT(*) AS count FROM course_view_transition")
          .get() as { count: number }
      ).count,
    ).toBe(1)
  })

  test("the Agent handles a stale material read by explicit realignment and a bounded reread", async () => {
    const fixture = await markdownFixture()
    await Bun.write(
      fixture.materialPath,
      "# Objects\nCORRECTED_SOURCE_ONLY: objects now group state and behavior.\n## References\nnew refs",
    )
    let call = 0
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        call += 1
        const prompt = JSON.stringify(options.prompt)
        const tools = JSON.stringify(options.tools)
        if (call === 1) {
          expect(tools).toContain("realign_current_markdown_course")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:read-stale-runtime",
              toolName: "read_current_course_material",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (call === 2) {
          expect(prompt).toContain("stale_material_revision")
          expect(prompt).not.toContain("CORRECTED_SOURCE_ONLY")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:realign-runtime",
              toolName: "realign_current_markdown_course",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (call === 3) {
          expect(prompt).not.toContain("CORRECTED_SOURCE_ONLY")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:reread-runtime",
              toolName: "read_current_course_material",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (call === 4) {
          expect(prompt).toContain("CORRECTED_SOURCE_ONLY")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "corrected-material" },
            {
              type: "text-delta",
              id: "corrected-material",
              delta: "我按新版本重新对齐并读取了当前小节：对象把状态和行为组织在一起。",
            },
            { type: "text-end", id: "corrected-material" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected material correction call ${call}`)
      },
    })
    let now = 20
    await runTutorTurn({
      database: fixture.database,
      model,
      workspaceRoot: fixture.root,
      learnerText: "我改了材料，请按新版本继续。",
      identity: identity("correct-material"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++now,
      maxModelSteps: 7,
    })

    expect(readActiveCourseContext(fixture.database)).toMatchObject({
      basis: "source_grounded",
      route: { version: 2, anchor: { title: "Objects" } },
    })
    expect(JSON.stringify(readSessionItems(fixture.database, "session:correct-material"))).not
      .toContain("CORRECTED_SOURCE_ONLY")
  })
})

function provisionalFixture() {
  const root = temporaryRoot("provisional-runtime-correction")
  const database = openRepaDatabase(join(root, "repa.sqlite"))
  openDatabases.push(database)
  const source = setupTurn(database, "provisional", 1, "Create graph course")
  createProvisionalCourse(database, {
    effectId: "effect:setup-provisional-correction",
    causeItemId: source.itemId,
    learningSpaceId: "space:runtime-provisional-correction",
    courseId: "course:runtime-provisional-correction",
    workspaceRoot: root,
    title: "Graph algorithms",
    items: [
      { title: "Graph foundations" },
      { title: "Breadth-first search", parentIndex: 0 },
      { title: "Depth-first search", parentIndex: 0 },
    ],
    occurredAt: 2,
  })
  finishTurn(database, { turnId: source.turnId, outcome: "completed", finishedAt: 3 })
  return { root, database }
}

async function markdownFixture() {
  const root = temporaryRoot("markdown-runtime-correction")
  const database = openRepaDatabase(join(root, "repa.sqlite"))
  openDatabases.push(database)
  const materialPath = join(root, "objects.md")
  await Bun.write(materialPath, "# Objects\nold body\n## References\nold refs")
  const observation = await observeMarkdownArtifact({
    workspaceRoot: root,
    relativePath: "objects.md",
    observedAt: 2,
  })
  const source = setupTurn(database, "markdown", 1, "Use objects.md")
  registerMarkdownCourse(database, {
    effectId: "effect:setup-markdown-correction",
    causeItemId: source.itemId,
    learningSpaceId: "space:runtime-markdown-correction",
    courseId: "course:runtime-markdown-correction",
    artifactId: "artifact:runtime-markdown-correction",
    title: "Objects",
    observation,
    occurredAt: 2,
  })
  finishTurn(database, { turnId: source.turnId, outcome: "completed", finishedAt: 3 })
  return { root, database, materialPath }
}

function temporaryRoot(scope: string) {
  const root = mkdtempSync(join(tmpdir(), `repa-${scope}-`))
  temporaryDirectories.push(root)
  return root
}

function setupTurn(
  database: ReturnType<typeof openRepaDatabase>,
  scope: string,
  createdAt: number,
  content: string,
) {
  const sessionId = `session:setup:${scope}`
  const turnId = `turn:setup:${scope}`
  const itemId = `item:user:setup:${scope}`
  createSession(database, { sessionId, createdAt })
  admitUserTurn(database, { sessionId, turnId, itemId, content, createdAt })
  return { turnId, itemId }
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
