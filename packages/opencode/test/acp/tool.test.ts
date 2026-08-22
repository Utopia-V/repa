import { resolve } from "path"
import { describe, expect, test } from "bun:test"
import { LearningInspectionSchema as LearningInspection } from "@opencode-ai/core/learning-inspection-schema"
import { LearningInspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import {
  completedToolContent,
  completedToolUpdate,
  completedToolRawOutput,
  extractImageAttachments,
  imageContents,
  pendingToolCall,
  shellOutputSnapshot,
  toLocations,
  toToolKind,
} from "../../src/acp/tool"

describe("acp tool conversion", () => {
  test("uses the shared typed inspection decoder output instead of raw Tool JSON", () => {
    const value: LearningInspection.Projection = {
      schemaVersion: 1,
      status: "available",
      source: {
        learnerHomeID: "lhm_test",
        partID: "prt_test",
        tool: "learning_interaction_read",
        action: "inspect_current_context",
        assistantMessageID: "msg_test",
        turnID: "trn_test" as LearningInspection.Projection["source"]["turnID"],
        inputID: "tri_test" as LearningInspection.Projection["source"]["inputID"],
        currentFrontier: { sequence: 1, time: 10 },
      },
      owner: {
        kind: "learning_context",
        ...LearningInspectionOwner.inspectionOwner("learning_context", "exact immutable operation Context cut"),
        capabilityID: "learning_interaction_read",
        action: "inspect_current_context",
        records: [],
      },
      lineage: {
        coverage: "non_atomic_search_incomplete",
        scope: { status: "continued_fresh_cut", operationCount: 0, terminalSealedCount: 0 },
        contextCoverage: [],
        items: [],
        omitted: false,
        pendingGap: false,
      },
      deletionAudit: { status: "unknown", items: [], omitted: false },
      sessionDeletion: { status: "not_applicable" },
      administrativeHistory: { status: "not_applicable", members: [], laterLocalMessages: [], omitted: false },
      nonCausality: "operational_lineage_not_per_record_answer_causality",
    }
    const update = completedToolUpdate({
      toolCallId: "tool-inspect",
      toolName: "learning_interaction_read",
      state: { status: "completed", input: {}, output: "raw internal JSON" },
      inspection: { type: "valid", value },
    })
    expect(update).toMatchObject({ title: "Learning inspection — Available" })
    expect(JSON.stringify(update.content)).toContain("Owner relation: learning_context")
    expect(JSON.stringify(update.content)).toContain("does not prove that one record caused")
    expect(JSON.stringify(update.content)).not.toContain("raw internal JSON")
  })

  test("maps OpenCode tool ids to ACP tool kinds", () => {
    expect(toToolKind("bash")).toBe("execute")
    expect(toToolKind("shell")).toBe("execute")
    expect(toToolKind("webfetch")).toBe("fetch")
    expect(toToolKind("edit")).toBe("edit")
    expect(toToolKind("apply_patch")).toBe("edit")
    expect(toToolKind("patch")).toBe("edit")
    expect(toToolKind("write")).toBe("edit")
    expect(toToolKind("grep")).toBe("search")
    expect(toToolKind("glob")).toBe("search")
    expect(toToolKind("context7_resolve_library_id")).toBe("search")
    expect(toToolKind("context7_get_library_docs")).toBe("search")
    expect(toToolKind("read")).toBe("read")
    expect(toToolKind("task")).toBe("think")
    expect(toToolKind("custom_tool")).toBe("other")
  })

  test("extracts file locations from tool input", () => {
    expect(toLocations("read", { filePath: "/tmp/a.ts" })).toEqual([{ path: "/tmp/a.ts" }])
    expect(toLocations("edit", { filePath: "/tmp/b.ts" })).toEqual([{ path: "/tmp/b.ts" }])
    expect(toLocations("write", { filePath: "/tmp/c.ts" })).toEqual([{ path: "/tmp/c.ts" }])
    expect(toLocations("grep", { path: "/repo/src" })).toEqual([{ path: "/repo/src" }])
    expect(toLocations("glob", { path: "/repo/test" })).toEqual([{ path: "/repo/test" }])
    expect(toLocations("context7_get_library_docs", { path: "/docs" })).toEqual([{ path: "/docs" }])
    expect(toLocations("external_directory", { directories: ["/tmp/outside"], patterns: ["/tmp/outside/*"] })).toEqual([
      { path: "/tmp/outside" },
    ])
    expect(toLocations("bash", { cmd: "pwd" }, "/workspace")).toEqual([{ path: "/workspace" }])
    // Relative workdir resolves against cwd via the platform path resolver (backslashes on Windows).
    expect(toLocations("bash", { command: "pwd", workdir: "subdir" }, "/workspace")).toEqual([
      { path: resolve("/workspace", "subdir") },
    ])
    expect(toLocations("bash", { command: "pwd", workdir: "/abs/dir" }, "/workspace")).toEqual([{ path: "/abs/dir" }])
    expect(toLocations("bash", { command: "printf hello" })).toEqual([])
    expect(toLocations("read", { path: "/tmp/missing-file-path.ts" })).toEqual([])
  })

  test("builds completed content with text, edit diffs, and image attachments", () => {
    const image = Buffer.from("image-data").toString("base64")

    expect(
      completedToolContent("edit", {
        status: "completed",
        input: {
          filePath: "/tmp/file.ts",
          oldString: "before",
          newString: "after",
        },
        output: "edited /tmp/file.ts",
        attachments: [
          {
            type: "file",
            mime: "image/png",
            filename: "image.png",
            url: `data:image/png;base64,${image}`,
          },
          {
            type: "file",
            mime: "text/plain",
            filename: "note.txt",
            url: "data:text/plain;base64,bm90ZQ==",
          },
        ],
      }),
    ).toEqual([
      {
        type: "content",
        content: { type: "text", text: "edited /tmp/file.ts" },
      },
      {
        type: "diff",
        path: "/tmp/file.ts",
        oldText: "before",
        newText: "after",
      },
      {
        type: "content",
        content: { type: "image", mimeType: "image/png", data: image },
      },
    ])
  })

  test("omits edit diffs until old and new text fields exist", () => {
    expect(
      completedToolContent("write", {
        status: "completed",
        input: {
          filePath: "/tmp/file.ts",
          content: "created",
        },
        output: "wrote /tmp/file.ts",
      }),
    ).toEqual([
      {
        type: "content",
        content: { type: "text", text: "wrote /tmp/file.ts" },
      },
    ])
  })

  test("sends completed tool calls as partial updates", () => {
    expect(
      pendingToolCall({
        toolCallId: "tool-1",
        toolName: "edit",
        state: {
          input: {
            filePath: "/tmp/file.ts",
            oldString: "before",
            newString: "after",
          },
        },
      }),
    ).toMatchObject({
      kind: "edit",
      locations: [{ path: "/tmp/file.ts" }],
      rawInput: {
        filePath: "/tmp/file.ts",
        oldString: "before",
        newString: "after",
      },
    })

    expect(
      completedToolUpdate({
        toolCallId: "tool-1",
        toolName: "edit",
        state: {
          status: "completed",
          input: {
            filePath: "/tmp/file.ts",
            oldString: "before",
            newString: "after",
          },
          output: "Edit applied successfully.",
        },
      }),
    ).toEqual({
      toolCallId: "tool-1",
      status: "completed",
      content: [
        {
          type: "content",
          content: { type: "text", text: "Edit applied successfully." },
        },
        {
          type: "diff",
          path: "/tmp/file.ts",
          oldText: "before",
          newText: "after",
        },
      ],
      rawOutput: {
        output: "Edit applied successfully.",
      },
    })

    expect(
      completedToolUpdate({
        toolCallId: "tool-1",
        toolName: "edit",
        state: {
          status: "completed",
          input: {
            filePath: "/tmp/file.ts",
            oldString: "before",
            newString: "after",
          },
          title: "file.ts",
          output: "Edit applied successfully.",
        },
      }),
    ).toMatchObject({
      toolCallId: "tool-1",
      status: "completed",
      title: "file.ts",
    })
  })

  test("uses clean read display text for completed content", () => {
    const output = [
      "<path>/tmp/file.ts</path>",
      "<type>file</type>",
      "<content>",
      "7: first",
      "8: second",
      "",
      "(End of file - total 8 lines)",
      "</content>",
    ].join("\n")
    const state = {
      status: "completed" as const,
      input: { filePath: "/tmp/file.ts" },
      output,
      metadata: {
        display: {
          type: "file",
          path: "/tmp/file.ts",
          text: "first\nsecond",
          lineStart: 7,
          lineEnd: 8,
          totalLines: 8,
          truncated: false,
        },
      },
    }

    expect(completedToolContent("read", state)).toEqual([
      {
        type: "content",
        content: { type: "text", text: "first\nsecond" },
      },
    ])
    expect(completedToolRawOutput(state)).toEqual({
      output,
      metadata: state.metadata,
    })
  })

  test("builds completed raw output with optional metadata and attachments", () => {
    const attachments = [
      {
        type: "file",
        mime: "image/jpeg",
        filename: "photo.jpg",
        url: "data:image/jpeg;base64,AAAA",
      },
    ]

    expect(
      completedToolRawOutput({
        status: "completed",
        input: {},
        output: "done",
        metadata: { exit: 0 },
        attachments,
      }),
    ).toEqual({
      output: "done",
      metadata: { exit: 0 },
      attachments,
    })

    expect(
      completedToolRawOutput({
        status: "completed",
        input: {},
        output: "done",
      }),
    ).toEqual({ output: "done" })
  })

  test("extracts image attachments only from data URLs", () => {
    const attachments = [
      {
        mime: "image/webp",
        url: "data:image/webp;charset=utf-8;base64,AAAA",
      },
      {
        mime: "image/png",
        url: "https://example.com/image.png",
      },
      {
        mime: "text/plain",
        url: "data:text/plain;base64,BBBB",
      },
    ]

    expect(extractImageAttachments(attachments)).toEqual([{ mimeType: "image/webp", data: "AAAA" }])
    expect(imageContents(attachments)).toEqual([
      {
        type: "content",
        content: { type: "image", mimeType: "image/webp", data: "AAAA" },
      },
    ])
  })

  test("reads shell output snapshot from string metadata output", () => {
    expect(shellOutputSnapshot({ metadata: { output: "line 1\nline 2" } })).toBe("line 1\nline 2")
    expect(shellOutputSnapshot({ metadata: { output: 42 } })).toBeUndefined()
    expect(shellOutputSnapshot({ metadata: undefined })).toBeUndefined()
  })
})
