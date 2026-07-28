import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { SemanticPresentationV1 } from "../src/v1/semantic-presentation"

const decode = Schema.decodeUnknownSync(SemanticPresentationV1.Presentation)
const binding = {
  sessionID: "ses_test",
  messageID: "msg_test",
  callID: "call_test",
  partID: "prt_test",
}

describe("semantic presentation v1", () => {
  test("decodes capability-specific proposal and result bases", () => {
    expect(
      decode({
        version: 1,
        phase: "proposal",
        basis: {
          kind: "content_mutation",
          binding,
          operation: "modify",
          anchorPath: "C:\\course",
          relativePath: "notes\\lesson.md",
          lifetime: "this physical tool invocation",
          rights: ["modify"],
          warning: "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
        },
      }),
    ).toMatchObject({ phase: "proposal", basis: { kind: "content_mutation" } })

    expect(
      decode({
        version: 1,
        phase: "result",
        basis: {
          kind: "content_write_result",
          binding,
          settlement: { outcome: "applied" },
          operation: "modify",
          anchorPath: "C:\\course",
          relativePath: "notes\\lesson.md",
          byteLength: 8,
          authority: { type: "one_shot" },
        },
      }),
    ).toMatchObject({ phase: "result", basis: { kind: "content_write_result" } })
  })

  test("rejects free-form display declarations and unknown versions", () => {
    expect(() =>
      decode({
        version: 1,
        phase: "proposal",
        capability: "content_mutation",
        title: "Caller-authored title",
        summary: "Caller-authored summary",
        facts: [],
      }),
    ).toThrow()

    expect(() =>
      decode({
        version: 2,
        phase: "result",
        basis: {
          kind: "content_write_result",
          binding,
          settlement: { outcome: "applied" },
          operation: "modify",
          anchorPath: "C:\\course",
          relativePath: "notes\\lesson.md",
          byteLength: 8,
          authority: { type: "one_shot" },
        },
      }),
    ).toThrow()
  })
})
