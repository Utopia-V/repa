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

  test("keeps V2 Default-Course endpoints exact while preserving partial V1 history", () => {
    const endpoint = {
      kind: "course",
      locator: {
        courseID: "cou_algorithms",
        title: { availability: "recorded_v2", value: "Algorithms" },
        courseVersion: { availability: "recorded_v2", value: 3 },
        workingSelection: {
          availability: "recorded_v2",
          value: {
            revisionID: "rev_algorithms",
            selectionVersion: 4,
            viewID: "view_main",
            viewName: "Main",
            viewVersion: 5,
            revisionVersion: 6,
          },
        },
      },
    } as const
    const authorization = {
      kind: "direct_request_v2",
      fingerprint: "authorization",
      command: {
        kind: "default_course_preference",
        expectedHeadID: null,
        expectedVersion: 0,
        target: {
          courseID: endpoint.locator.courseID,
          courseVersion: 3,
          selectionRevisionID: "rev_algorithms",
          selectionVersion: 4,
          viewID: "view_main",
          viewVersion: 5,
          revisionVersion: 6,
        },
      },
      commandFingerprint: "command",
      source: {
        kind: "direct_request_v2",
        occurrenceID: "occ_request",
        excerpt: "Use Algorithms",
      },
      resolutionScope: {
        coverage: "complete",
        candidates: [{ courseID: endpoint.locator.courseID, title: "Algorithms", courseVersion: 3 }],
        selectedCourseID: endpoint.locator.courseID,
      },
      resolutionFingerprint: "resolution",
      preferenceHeadID: null,
      preferenceVersion: 0,
      operation: "set",
      from: { kind: "absent" },
      to: endpoint,
    } as const
    const proposal = {
      version: 1,
      phase: "proposal",
      basis: {
        kind: "default_course_v2_capability",
        binding,
        authorization,
      },
    } as const
    expect(decode(proposal)).toMatchObject({ basis: { authorization: { to: endpoint } } })
    for (const malformed of [
      {
        ...authorization,
        from: {
          kind: "course",
          locator: { ...endpoint.locator, title: { availability: "not_recorded_v1" } },
        },
      },
      {
        ...authorization,
        to: {
          kind: "course",
          locator: {
            ...endpoint.locator,
            workingSelection: {
              availability: "recorded_v2",
              value: { ...endpoint.locator.workingSelection.value, viewName: null },
            },
          },
        },
      },
    ]) {
      expect(() =>
        decode({
          ...proposal,
          basis: { ...proposal.basis, authorization: malformed },
        }),
      ).toThrow()
    }

    const result = {
      version: 1,
      phase: "result",
      basis: {
        kind: "default_course_v2_result",
        binding,
        settlement: { outcome: "already_applied" },
        disposition: { kind: "candidate_v2", authorization },
        acknowledgement: {
          schemaVersion: 1,
          invocationPartID: binding.partID,
          effectAuthorizationPartID: binding.partID,
          authorizationVersion: 1,
          effectID: "effect",
          receiptID: "receipt",
          operation: "set",
          from: { kind: "absent" },
          to: {
            kind: "course",
            locator: {
              courseID: endpoint.locator.courseID,
              title: { availability: "recorded_v1", value: "Algorithms" },
              courseVersion: { availability: "not_recorded_v1" },
              workingSelection: { availability: "not_recorded_v1" },
            },
          },
          relation: "active",
          timeCommitted: 7,
          commitOrder: 8,
        },
      },
    } as const
    expect(decode(result)).toMatchObject({
      basis: { acknowledgement: { authorizationVersion: 1, to: { kind: "course" } } },
    })
    expect(() =>
      decode({
        ...result,
        basis: {
          ...result.basis,
          acknowledgement: {
            ...result.basis.acknowledgement,
            authorizationVersion: 2,
          },
        },
      }),
    ).toThrow()
  })
})
