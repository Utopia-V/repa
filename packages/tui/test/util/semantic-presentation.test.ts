import { describe, expect, test } from "bun:test"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import type { PermissionRequest, ToolPart } from "@opencode-ai/sdk/v2"
import {
  canAutoApprove,
  isOnceOnlyPermission,
  permissionPresentation,
  resultPresentation,
  shouldHideCompletedTool,
} from "../../src/util/semantic-presentation"

const binding = {
  sessionID: "ses_test",
  messageID: "msg_test",
  callID: "call_test",
  partID: "prt_test",
}

function request(input: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "per_test",
    sessionID: binding.sessionID,
    permission: "read",
    patterns: ["*"],
    metadata: {},
    always: [],
    tool: { messageID: binding.messageID, callID: binding.callID },
    ...input,
  }
}

function proposal() {
  return SemanticPresentation.proposal({
    kind: "content_mutation",
    binding,
    operation: "modify",
    anchorPath: "C:\\course",
    relativePath: "notes\\lesson.md",
    lifetime: "this physical tool invocation",
    rights: ["modify"],
    warning: "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
  })
}

function exactRequest(pattern = "modify:C:\\course\\notes\\lesson.md") {
  const value = proposal()
  return request({
    permission: "content_mutation",
    patterns: [pattern],
    always: [],
    metadata: {
      onceOnly: true,
      operation: "modify",
      anchorPath: "C:\\course",
      relativePath: "notes\\lesson.md",
      lifetime: "this physical tool invocation",
      rights: ["modify"],
      warning: "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
      permissionPromptRequired: true,
      ...SemanticPresentation.metadata(value),
    },
  })
}

function completed(tool: string, title: string, metadata: Record<string, unknown>): ToolPart {
  return {
    id: binding.partID,
    sessionID: binding.sessionID,
    messageID: binding.messageID,
    type: "tool",
    callID: binding.callID,
    tool,
    state: {
      status: "completed",
      input: {},
      output: "generic output is hidden by default",
      title,
      metadata,
      time: { start: 1, end: 2 },
    },
  }
}

function contentResultMetadata(presentation: ReturnType<typeof SemanticPresentation.result>) {
  return {
    command: "content_write",
    commandVersion: 1,
    outcome: "applied",
    durablySettled: true,
    truncated: false,
    onceOnly: true,
    operation: "modify",
    byteLength: 8,
    anchorPath: "C:\\course",
    relativePath: "notes\\lesson.md",
    ...SemanticPresentation.metadata(presentation),
  }
}

describe("primary TUI semantic presentation adapter", () => {
  test("projects an exact one-shot scope and fails closed on envelope mismatch", () => {
    const exact = exactRequest()
    const read = permissionPresentation(exact)
    expect(read).toMatchObject({
      type: "valid",
      value: {
        phase: "proposal",
        capability: "content_mutation",
        title: "Allow one file modify",
        approval: "once_only",
      },
    })
    expect(canAutoApprove(exact)).toBe(false)
    expect(permissionPresentation(exactRequest("secret-token-that-must-not-render"))).toEqual({ type: "invalid" })
    expect(permissionPresentation(request({ permission: "content_mutation" }))).toEqual({ type: "invalid" })
    expect(JSON.stringify(read)).not.toContain("secret-token-that-must-not-render")
  })

  test("never auto-answers service-forced or once-only requests", () => {
    expect(canAutoApprove(request({ permission: "custom_permission", metadata: { onceOnly: true } }))).toBe(false)
    const genericPrompt = request({
      permission: "custom_permission",
      metadata: { permissionPromptRequired: true },
    })
    expect(canAutoApprove(genericPrompt)).toBe(false)
    expect(isOnceOnlyPermission(genericPrompt)).toBe(true)
  })

  test("keeps a bound semantic result visible when generic details are hidden", () => {
    const presentation = SemanticPresentation.result({
      kind: "content_write_result",
      binding,
      settlement: { outcome: "applied" },
      operation: "modify",
      anchorPath: "C:\\course",
      relativePath: "notes\\lesson.md",
      byteLength: 8,
      authority: { type: "one_shot" },
    })
    const part = completed(
      "content_write",
      "File modify committed",
      contentResultMetadata(presentation),
    )

    expect(resultPresentation(part)).toMatchObject({
      type: "valid",
      value: { capability: "content_write", outcome: "committed", durablySettled: true },
    })
    expect(shouldHideCompletedTool(part, false)).toBe(false)
    expect(resultPresentation(completed("representation.convert", "Readable representation conversion", {}))).toEqual({
      type: "invalid",
    })
    expect(shouldHideCompletedTool(completed("custom_tool", "custom_tool", {}), false)).toBe(true)
  })

  test("rejects contradictory ToolPart binding and outer settlement claims", () => {
    const presentation = SemanticPresentation.result({
      kind: "content_write_result",
      binding,
      settlement: { outcome: "applied" },
      operation: "modify",
      anchorPath: "C:\\course",
      relativePath: "notes\\lesson.md",
      byteLength: 8,
      authority: { type: "one_shot" },
    })
    const metadata = {
      ...contentResultMetadata(presentation),
      outcome: "error",
      code: "validation_error",
    }
    expect(resultPresentation(completed("content_write", "File modify committed", metadata))).toEqual({
      type: "invalid",
    })
    expect(
      resultPresentation(
        completed("content_write", "File modify committed", {
          ...contentResultMetadata(presentation),
          commandVersion: 2,
        }),
      ),
    ).toEqual({ type: "invalid" })
    expect(
      resultPresentation(
        completed("content_write", "File modify committed", {
          ...contentResultMetadata(presentation),
          secretUntrustedFact: "must not render",
        }),
      ),
    ).toEqual({ type: "invalid" })

    const wrongPart = {
      ...completed(
        "content_write",
        "File modify committed",
        contentResultMetadata(presentation),
      ),
      id: "prt_other",
    } as ToolPart
    expect(resultPresentation(wrongPart)).toEqual({ type: "invalid" })
  })
})
