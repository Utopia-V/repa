import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider"
import { afterEach, describe, expect, test } from "bun:test"
import { MockLanguageModelV3 } from "ai/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  admitUserTurn,
  createSession,
  finishTurn,
  readModelOperation,
  readSessionItems,
  readToolInvocation,
} from "../src/interaction/records"
import {
  readActiveCourseContext,
  registerMarkdownCourse,
} from "../src/learning/curriculum/course-view"
import { runTutorTurn } from "../src/runtime/run-tutor-turn"
import { tutorToolInvocationId } from "../src/runtime/tutor-tool-binding"
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
      // A test may close before reopening the same database.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("Tutor course continuity", () => {
  test("material stays lazy while the Tutor teaches, advances, and resumes in a fresh Session", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-tutor-course-"))
    temporaryDirectories.push(root)
    const databasePath = join(root, "repa.sqlite")
    await Bun.write(join(root, "objects.md"), fixtureMarkdown())
    const observation = await observeMarkdownArtifact({
      workspaceRoot: root,
      relativePath: "objects.md",
      observedAt: 3,
    })
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    createSession(database, { sessionId: "session:setup-course", createdAt: 1 })
    admitUserTurn(database, {
      sessionId: "session:setup-course",
      turnId: "turn:setup-course",
      itemId: "item:user:setup-course",
      content: "Use objects.md as a course.",
      createdAt: 2,
    })
    registerMarkdownCourse(database, {
      effectId: "effect:register-course-runtime",
      causeItemId: "item:user:setup-course",
      learningSpaceId: "space:runtime",
      courseId: "course:runtime",
      artifactId: "artifact:runtime",
      title: "Object references",
      observation,
      occurredAt: 3,
    })
    finishTurn(database, { turnId: "turn:setup-course", outcome: "completed", finishedAt: 4 })

    let firstProviderCall = 0
    const firstModel = new MockLanguageModelV3({
      doStream: async (options) => {
        firstProviderCall += 1
        const prompt = JSON.stringify(options.prompt)
        if (firstProviderCall === 1) {
          expect(prompt).toContain("Objects")
          expect(prompt).toContain("do not ask for confirmation")
          expect(prompt).not.toContain("Objects group related values")
          expect(JSON.stringify(options.tools)).toContain("read_current_course_material")
          expect(JSON.stringify(options.tools)).toContain("advance_course_route")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:read-objects",
              toolName: "read_current_course_material",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (firstProviderCall === 2) {
          expect(prompt).toContain("Objects group related values")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "teach-objects" },
            {
              type: "text-delta",
              id: "teach-objects",
              delta: "对象把相关值组织在一起；变量保存的是指向对象的引用。",
            },
            { type: "text-end", id: "teach-objects" },
            {
              type: "tool-call",
              toolCallId: "call:advance-objects",
              toolName: "advance_course_route",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (firstProviderCall === 3) {
          expect(prompt).toContain("References")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "close-first" },
            { type: "text-delta", id: "close-first", delta: "下一节从引用继续。" },
            { type: "text-end", id: "close-first" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected first provider call ${firstProviderCall}`)
      },
    })
    let firstNow = 10
    const firstOutcome = await runTutorTurn({
      database,
      model: firstModel,
      workspaceRoot: root,
      learnerText: "讲解当前一节，然后移到下一节。",
      identity: identity("first-course"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++firstNow,
      maxModelSteps: 6,
    })

    expect(firstOutcome.modelSteps).toBe(3)
    expect(readActiveCourseContext(database)?.route.anchor.title).toBe("References")
    const readObjectsInvocationId = tutorToolInvocationId(
      "model:first-course:0",
      "call:read-objects",
    )
    expect(readToolInvocation(database, readObjectsInvocationId)).toMatchObject({
      status: "completed",
      effectId: undefined,
      result: {
        ok: true,
        itemId: expect.any(String),
        artifactRevision: observation.revision,
        startLine: 1,
        endLine: 2,
      },
    })
    expect(JSON.stringify(readToolInvocation(database, readObjectsInvocationId))).not.toContain(
      "Objects group related values",
    )
    expect(JSON.stringify(readSessionItems(database, "session:first-course"))).not.toContain(
      "Objects group related values",
    )
    const advancedCut = readModelOperation(database, "model:first-course:2").context as unknown as {
      activeCourse: { route: { anchor: { title: string } } }
    }
    expect(advancedCut.activeCourse.route.anchor.title).toBe("References")

    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)
    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)

    let continuationCall = 0
    const continuationModel = new MockLanguageModelV3({
      doStream: async (options) => {
        continuationCall += 1
        const prompt = JSON.stringify(options.prompt)
        if (continuationCall === 1) {
          expect(prompt).toContain("References")
          expect(prompt).toContain("继续")
          expect(prompt).not.toContain("讲解当前一节")
          expect(prompt).not.toContain("对象把相关值组织在一起")
          expect(prompt).not.toContain("Variables hold references to objects")
          return stream([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call:read-references",
              toolName: "read_current_course_material",
              input: "{}",
            },
            finish("tool-calls"),
          ])
        }
        if (continuationCall === 2) {
          expect(prompt).toContain("Variables hold references to objects")
          return stream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "teach-references" },
            {
              type: "text-delta",
              id: "teach-references",
              delta: "我们继续引用：多个变量可以指向同一个对象。",
            },
            { type: "text-end", id: "teach-references" },
            finish("stop"),
          ])
        }
        throw new Error(`Unexpected continuation provider call ${continuationCall}`)
      },
    })
    let continuationNow = 100
    const continuationOutcome = await runTutorTurn({
      database: reopened,
      model: continuationModel,
      workspaceRoot: root,
      learnerText: "继续",
      identity: identity("fresh-course"),
      timeZone: "Asia/Shanghai",
      policyProfileRevision: DEFAULT_TUTOR_POLICY_PROFILE_REVISION,
      clock: () => ++continuationNow,
      maxModelSteps: 4,
    })

    expect(continuationOutcome.text).toBe("我们继续引用：多个变量可以指向同一个对象。")
    expect(continuationOutcome.modelSteps).toBe(2)
    expect(readActiveCourseContext(reopened)?.route.anchor.title).toBe("References")
    expect(JSON.stringify(readToolInvocation(
      reopened,
      tutorToolInvocationId("model:fresh-course:0", "call:read-references"),
    ))).not.toContain(
      "Variables hold references to objects",
    )
  })
})

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
