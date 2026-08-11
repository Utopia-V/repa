import { describe, expect, test } from "bun:test"
import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
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

function advisoryPlanSuggestionCandidate() {
  const snapshotIntent = {
    learnerVisibleScope: "Continuation practice across later Sessions",
    retrievalScope: { type: "learner_home_fallback" as const, reason: "no_stable_owner_anchor" as const },
    purpose: "Help later teaching continue without turning advice into a schedule.",
    directorySummary: "Examples first, then one guided attempt.",
    body: "Work through one concrete example, then try one guided continuation; keep later steps provisional.",
    exactBasisRefs: [],
    assumptionsAndUncertainty: "Fallible Tutor advice; revise it when it stops helping.",
  }
  const command = AdvisoryPlanSuggestion.canonicalizeCommand({
    cause: {
      type: "proactive_tutor_proposal",
      rationale: "Preserve useful, correctable advice for later teaching.",
    },
    intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshotIntent }],
  })
  const suggestionID = `aps_${"0".repeat(26)}` as AdvisoryPlanSuggestion.SuggestionID
  const revisionID = `apr_${"0".repeat(26)}` as AdvisoryPlanSuggestion.RevisionID
  const effectID = `ape_${"0".repeat(26)}` as AdvisoryPlanSuggestion.EffectID
  return {
    kind: "candidate_v1",
    commandFingerprint: AdvisoryPlanSuggestion.commandFingerprint(command),
    semanticAddressFingerprint: "1".repeat(64),
    agentActionFingerprint: "2".repeat(64),
    canonicalCommand: command,
    agentAction: {
      schemaVersion: 1,
      kind: "root",
      occurrenceID: "lco_tui_advisory",
      sessionID: binding.sessionID,
      turnID: "trn_tui_advisory",
      inputID: "inp_tui_advisory",
      assistantMessageID: binding.messageID,
      invocationPartID: binding.partID,
      providerCallID: "provider_tui_advisory",
      emissionOrdinal: 0,
      capabilityIdentity: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
      capabilityVersion: AdvisoryPlanSuggestion.UPDATE_VERSION,
      lineage: [],
    },
    effectID,
    materialized: [
      {
        outcome: "changed",
        suggestionID,
        revisionID,
        effectID,
        version: 1,
        operation: "create",
        operationOrdinal: 0,
        createOrdinal: 0,
        disposition: "active",
        snapshot: {
          learnerVisibleScope: snapshotIntent.learnerVisibleScope,
          retrievalScope: snapshotIntent.retrievalScope,
          purpose: snapshotIntent.purpose,
          directorySummary: snapshotIntent.directorySummary,
          body: snapshotIntent.body,
          exactBasis: [],
          assumptionsAndUncertainty: snapshotIntent.assumptionsAndUncertainty,
        },
        authorAndCause: {
          type: "proactive_tutor_proposal",
          rootModelOperationID: binding.messageID,
          mutationOccurrenceID: "lco_tui_advisory",
          mutationPartID: binding.partID,
          source: {
            type: "model_operation",
            assistantMessageID: binding.messageID,
            sessionID: binding.sessionID,
            turnID: "trn_tui_advisory",
            inputID: "inp_tui_advisory",
            occurrenceID: "lco_tui_advisory",
            learningContextFingerprint: "3".repeat(64),
            learningContextCutAsOf: 1,
            rationale: "Preserve useful, correctable advice for later teaching.",
          },
        },
      },
    ],
  } as unknown as AdvisoryPlanSuggestion.Candidate
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
    const part = completed("content_write", "File modify committed", contentResultMetadata(presentation))

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

  test("keeps the exact learning-bootstrap terminal truth visible", () => {
    const presentation = SemanticPresentation.result({
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
            kind: "material",
            key: "notes",
            outcome: "changed",
            id: "lca_notes",
            detail: "explicit material adoption committed",
            materialTarget: { type: "representation", representationRevisionID: "rrv_notes" },
          },
          { kind: "anchor", outcome: "no_change", detail: "route anchor preserved" },
        ],
        selectedRevisionID: null,
        anchor: { headID: null, target: null, usability: { usable: false, cause: "absent" } },
        correction: "Continue in ordinary language to correct this Course.",
      },
    })
    const projection = SemanticPresentation.projectResultBasis(presentation.basis)
    if (!projection) throw new Error("Expected a valid learning-bootstrap projection")
    const part = completed("update_learning_course", projection.title, {
      command: "update_learning_course",
      commandVersion: 1,
      outcome: "applied",
      durablySettled: true,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    })

    expect(resultPresentation(part)).toMatchObject({
      type: "valid",
      value: {
        outcome: "committed",
        facts: expect.arrayContaining([
          {
            label: "Material 2",
            value: "changed: explicit material adoption committed; Representation Revision rrv_notes; effect lca_notes",
          },
          { label: "Working selection", value: "none" },
          { label: "Route anchor", value: "none; unusable: absent; head none" },
        ]),
      },
    })
    expect(shouldHideCompletedTool(part, false)).toBe(false)
  })

  test("shows exact advisory advice before approval and its typed settlement afterward", () => {
    const candidate = advisoryPlanSuggestionCandidate()
    const scope = SemanticPresentation.advisoryPlanSuggestionScope(candidate)
    const proposal = SemanticPresentation.proposal({
      kind: "advisory_plan_suggestion_capability",
      binding,
      commandFingerprint: candidate.commandFingerprint,
      issuance: "root",
      scope,
    })
    const exact = request({
      permission: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
      patterns: [AdvisoryPlanSuggestion.PERMISSION_PATTERN],
      always: [AdvisoryPlanSuggestion.PERMISSION_PATTERN],
      metadata: {
        advisoryPlanSuggestionKind: "change_set",
        commandFingerprint: candidate.commandFingerprint,
        issuance: "root",
        scope,
        ...SemanticPresentation.metadata(proposal),
      },
    })

    expect(permissionPresentation(exact)).toMatchObject({
      type: "valid",
      value: {
        capability: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
        title: "Store or revise advisory learning suggestions",
        facts: expect.arrayContaining([
          { label: "Directory summary", value: "Examples first, then one guided attempt." },
          { label: "Advisory body", value: expect.stringContaining("one concrete example") },
          { label: "Does not imply", value: expect.stringContaining("advice_not_schedule_commitment") },
        ]),
      },
    })
    expect(
      permissionPresentation({
        ...exact,
        metadata: {
          ...exact.metadata,
          scope: {
            ...scope,
            materialized: scope.materialized.map((item) => ({ ...item, body: "Follow a rigid schedule." })),
          },
        },
      }),
    ).toEqual({ type: "invalid" })

    const item = candidate.materialized[0]!
    const result = SemanticPresentation.result({
      kind: "advisory_plan_suggestion_result",
      binding,
      settlement: { outcome: "applied" },
      disposition: "candidate_v1",
      issuance: "root",
      capabilityOutcome: "policy_allow",
      effect: {
        effectID: candidate.effectID,
        receiptID: "lcr_tui_advisory",
        intentResults: [
          {
            outcome: "changed",
            suggestionID: item.suggestionID,
            revisionID: item.revisionID,
            version: item.version,
            operation: item.operation,
            operationOrdinal: item.operationOrdinal,
            disposition: item.disposition,
          },
        ],
      },
    })
    const projection = SemanticPresentation.projectResultBasis(result.basis)
    if (!projection) throw new Error("Expected a valid advisory result projection")
    const part = completed(AdvisoryPlanSuggestion.UPDATE_CAPABILITY, projection.title, {
      command: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
      commandVersion: AdvisoryPlanSuggestion.UPDATE_VERSION,
      outcome: "applied",
      durablySettled: true,
      truncated: false,
      ...SemanticPresentation.metadata(result),
    })

    expect(resultPresentation(part)).toMatchObject({
      type: "valid",
      value: {
        outcome: "committed",
        facts: expect.arrayContaining([
          { label: "Suggestion result 1", value: expect.stringContaining(`${item.suggestionID}/${item.revisionID}`) },
          { label: "Advisory status", value: expect.stringContaining("not a schedule") },
        ]),
      },
    })
    expect(shouldHideCompletedTool(part, false)).toBe(false)
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
      ...completed("content_write", "File modify committed", contentResultMetadata(presentation)),
      id: "prt_other",
    } as ToolPart
    expect(resultPresentation(wrongPart)).toEqual({ type: "invalid" })
  })
})
