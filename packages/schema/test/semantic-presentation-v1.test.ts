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

  test("decodes the closed Gate 17 capability and truthful terminal result", () => {
    expect(
      decode({
        version: 1,
        phase: "proposal",
        basis: {
          kind: "learning_bootstrap_capability",
          binding,
          commandFingerprint: "bootstrap-fingerprint",
          issuance: "root",
          scope: {
            command: {
              schemaVersion: 1,
              course: { type: "new", title: "Linear algebra" },
              selection: { type: "preserve" },
              materials: [],
              maps: [],
              alignments: [],
              anchor: { type: "preserve" },
            },
          },
        },
      }),
    ).toMatchObject({ phase: "proposal", basis: { kind: "learning_bootstrap_capability", issuance: "root" } })

    expect(
      decode({
        version: 1,
        phase: "result",
        basis: {
          kind: "learning_bootstrap_result",
          binding,
          settlement: { outcome: "applied" },
          disposition: "candidate_v1",
          issuance: "root",
          capabilityOutcome: "policy_allow",
          acknowledgement: {
            schemaVersion: 1,
            outcome: "applied",
            course: { id: "cou_linear", title: "Linear algebra" },
            children: [
              { kind: "course", outcome: "changed", id: "cou_linear", detail: "created" },
              {
                kind: "selection",
                outcome: "no_change",
                selectedRevisionID: null,
                detail: "selection preserved",
              },
              { kind: "anchor", outcome: "no_change", detail: "route anchor preserved" },
            ],
            selectedRevisionID: null,
            anchor: { headID: null, target: null, usability: { usable: false, cause: "absent" } },
            correction: "Continue in ordinary language; a correction creates a new learner occurrence.",
          },
        },
      }),
    ).toMatchObject({
      phase: "result",
      basis: {
        kind: "learning_bootstrap_result",
        settlement: { outcome: "applied" },
        acknowledgement: { course: { title: "Linear algebra" }, selectedRevisionID: null },
      },
    })
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
