import { describe, expect, test } from "bun:test"
import { Assignment } from "@opencode-ai/core/assignment"
import type { Course } from "@opencode-ai/core/course"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { LearningBootstrap } from "@opencode-ai/core/learning-bootstrap"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import type { DefaultCourseV2Authorization } from "@opencode-ai/core/learner-navigation/default-course-v2"
import type {
  DefaultCourseAcknowledgement,
  DefaultCourseAgentAction,
  DefaultCourseProposal,
} from "@opencode-ai/core/learner-navigation/schema"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { LearningCommandPresentation } from "@/learning-command/presentation"

const envelope = {
  occurrenceID: "loc_occurrence",
  turnID: "trn_turn",
  inputID: "inp_input",
  sessionID: "ses_test",
  parentUserMessageID: "msg_parent",
  assistantMessageID: "msg_assistant",
  partID: "prt_result",
  providerCallID: "call_test",
  emissionOrdinal: 0,
  capabilityIdentity: "update_learner_goals",
  capabilityVersion: 1,
  authorizationBasis: "learner_acceptance",
  timeAdmitted: 1,
} as unknown as LearningCommand.InvocationEnvelope

const authored = { type: "authored", sourceExcerpt: "learner source" } as const
const accepted = { type: "accepted" } as const

function goalMeaning(outcome: string, courseTitle: string, basis = accepted) {
  return {
    outcome,
    conditions: [`demonstrate ${outcome}`],
    scope: {
      type: "courses" as const,
      courses: [
        {
          courseID: "cou_internal",
          courseTitle,
          basis: { type: "new" as const, expectedCourseVersion: 3 },
          availability: { state: "available" as const, title: courseTitle },
        },
      ],
    },
    target: { type: "absent" as const },
    disposition: "active" as const,
    fieldBases: {
      outcome: basis,
      conditions: basis,
      scope: basis,
      target: basis,
      disposition: basis,
    },
  }
}

function request(input: {
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
  id?: string
}) {
  return {
    id: (input.id ?? "per_test") as PermissionV1.ID,
    sessionID: envelope.sessionID,
    permission: input.permission,
    patterns: input.patterns,
    always: input.always,
    metadata: input.metadata,
    tool: { messageID: envelope.assistantMessageID, callID: envelope.providerCallID },
  }
}

describe("learning command semantic basis and projection", () => {
  test("validates the exact Gate 8 permission envelope and rejects mismatches", () => {
    const invocation = {
      envelope: {
        ...envelope,
        capabilityIdentity: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        authorizationBasis: "learner_acceptance",
      },
      command: {
        courseID: "cou_course",
        revisionID: "rev_revision",
        expectedCourseVersion: 3,
        expectedSelectionRevisionID: "rev_previous",
        expectedSelectionVersion: 4,
        expectedViewVersion: 5,
        expectedRevisionVersion: 6,
      },
    } as unknown as LearningCommand.AcceptCourseViewRevisionInvocation
    const locator = {
      course: { id: "cou_course", title: "Operating systems", showID: false },
      view: { id: "view_main", name: "Main", showID: false },
      revision: { id: "rev_revision", number: 2, showID: false },
    } as unknown as Course.PresentationLocator
    const proposal = LearningCommandPresentation.acceptCourseProposal(invocation, locator)
    const exact = request({
      permission: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
      patterns: ["cou_course"],
      always: ["cou_course"],
      metadata: {
        courseID: "cou_course",
        revisionID: "rev_revision",
        ...SemanticPresentation.metadata(proposal),
      },
    })

    const proposalRead = SemanticPresentation.readProposal(exact)
    expect(proposalRead).toMatchObject({
      type: "valid",
      value: {
        capability: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        title: "Accept this Course View revision",
        approval: "policy",
      },
    })
    expect(JSON.stringify(proposalRead)).not.toContain("cou_course")
    expect(JSON.stringify(proposalRead)).not.toContain("rev_revision")
    expect(
      SemanticPresentation.readProposal({
        ...exact,
        metadata: { ...exact.metadata, [PermissionV1.EXACT_REPLY_METADATA_KEY]: true },
      }).type,
    ).toBe("valid")
    expect(
      SemanticPresentation.readProposal({
        ...exact,
        metadata: { ...exact.metadata, [PermissionV1.EXACT_REPLY_METADATA_KEY]: false },
      }),
    ).toEqual({ type: "invalid" })
    expect(SemanticPresentation.readProposal({ ...exact, patterns: ["secret-extra-scope"] })).toEqual({
      type: "invalid",
    })
    expect(
      SemanticPresentation.readProposal({
        ...exact,
        metadata: { ...exact.metadata, revisionID: "rev_other" },
      }),
    ).toEqual({ type: "invalid" })

    const result = LearningCommandPresentation.settlementResult(
      {
        outcome: "applied",
        receiptID: "lcr_course",
        effectID: "csa_effect",
        courseID: "cou_course",
        revisionID: "rev_revision",
        previousSelection: { revisionID: undefined, version: 0 },
        committedSelection: { revisionID: "rev_revision", version: 1 },
        settlementTime: 2,
        settlementOrder: 1,
      } as unknown as LearningCommand.AppliedSettlement,
      LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
      envelope,
      [],
      {
        course: {
          effect: {
            id: "csa_effect",
            occurrenceID: "occurrence",
            courseID: "cou_course",
            revisionID: "rev_revision",
            previousSelection: { version: 0 },
            committedSelection: { revisionID: "rev_revision", version: 1 },
            timeCommitted: 2,
          },
          currentSelection: { revisionID: "rev_revision", version: 1 },
          relation: "active",
          locator,
        } as unknown as Course.SelectionAcceptancePresentation,
      },
    )
    const projection = SemanticPresentation.projectResultBasis(result.basis)
    if (!projection) throw new Error("Expected a valid Course result projection")
    expect(JSON.stringify(projection)).not.toContain("cou_course")
    expect(JSON.stringify(projection)).not.toContain("rev_revision")
    const part = {
      id: envelope.partID,
      sessionID: envelope.sessionID,
      messageID: envelope.assistantMessageID,
      type: "tool",
      tool: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
      callID: envelope.providerCallID,
      state: {
        status: "completed",
        input: {},
        output: "{}",
        title: projection.title,
        metadata: {
          command: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
          commandVersion: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION,
          outcome: "applied",
          durablySettled: true,
          truncated: false,
          ...SemanticPresentation.metadata(result),
        },
        time: { start: 1, end: 2 },
      },
    } as SessionV1.ToolPart
    expect(result.basis).toMatchObject({
      previousSelection: { version: 0 },
      committedSelection: { revisionID: "rev_revision", version: 1 },
    })
    expect(JSON.stringify(result.basis)).not.toContain('"previousSelection":{"revisionID"')
    expect(SemanticPresentation.readResult(part)).toMatchObject({ type: "valid" })
  })

  test("projects accepted and direct Goal operations exhaustively without exposing opaque IDs", () => {
    const operations = [
      {
        type: "replace" as const,
        resultIntent: "supersede_with_existing_goal" as const,
        goalID: "gol_source",
        expectedHeadID: "glr_source",
        expectedVersion: 2,
        source: {
          goalID: "gol_source",
          revisionID: "glr_source",
          version: 2,
          meaning: goalMeaning("Learn derivatives", "Calculus"),
        },
        meaning: { ...goalMeaning("Explain the chain rule", "Calculus"), disposition: "superseded" as const },
        replacementTarget: {
          type: "existing" as const,
          goalID: "gol_target",
          revisionID: "glr_target",
          version: 4,
          meaning: goalMeaning("Solve composite derivatives", "Advanced Calculus"),
        },
      },
    ] as unknown as readonly LearnerGoal.ProposalPresentationOperation[]
    const command = {
      operations: [
        {
          type: "replace",
          goalID: "gol_source",
          expectedHeadID: "glr_source",
          expectedVersion: 2,
          snapshot: {
            outcome: "Explain the chain rule",
            conditions: ["demonstrate Explain the chain rule"],
            scope: {
              type: "courses",
              courses: [
                {
                  courseID: "cou_internal",
                  basis: { type: "new", expectedCourseVersion: 3 },
                },
              ],
            },
            target: { type: "absent" },
            fieldBases: {
              outcome: accepted,
              conditions: accepted,
              scope: accepted,
              target: accepted,
              disposition: accepted,
            },
          },
          target: { type: "existing", goalID: "gol_target", revisionID: "glr_target", version: 4 },
        },
      ],
    } as unknown as LearnerGoal.Command
    const invocation = {
      envelope,
      command,
      permissionRequestID: "per_goal",
    } as unknown as LearnerGoal.AcceptedInvocation
    const confirmation = {
      schemaVersion: 1,
      authorizationBasis: "learner_acceptance",
      semanticFingerprint: "a".repeat(64),
      command,
      goalBases: [
        {
          goalID: "gol_source",
          revisionID: "glr_source",
          version: 2,
          outcome: "Learn derivatives",
          disposition: "active",
        },
        {
          goalID: "gol_target",
          revisionID: "glr_target",
          version: 4,
          outcome: "Solve composite derivatives",
          disposition: "active",
        },
      ],
      courseBases: [
        {
          operationOrdinal: 0,
          revisionRole: "source",
          courseID: "cou_internal",
          courseTitle: "Calculus",
          admission: { type: "new", courseVersion: 3, courseTimeUpdated: 4 },
          availability: { state: "available", title: "Calculus", courseVersion: 3, courseTimeUpdated: 4 },
        },
      ],
    } as unknown as LearnerGoal.ConfirmationSnapshot
    const proposal = LearningCommandPresentation.learnerGoalsProposal(
      invocation,
      {
        authorizationBasis: "learner_acceptance",
        semanticFingerprint: "a".repeat(64),
        operations,
      },
      confirmation,
    )
    const exact = request({
      id: "per_goal",
      permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      patterns: [LearnerGoal.PERMISSION_PATTERN],
      always: [],
      metadata: {
        onceOnly: true,
        authorizationBasis: "learner_acceptance",
        confirmation,
        permissionPromptRequired: true,
        ...SemanticPresentation.metadata(proposal),
      },
    })
    const read = SemanticPresentation.readProposal(exact)
    expect(read.type).toBe("valid")
    if (read.type !== "valid") throw new Error("Expected a valid Goal proposal")
    const rendered = JSON.stringify(read.value)
    expect(rendered).toContain("Learn derivatives")
    expect(rendered).toContain("Explain the chain rule")
    expect(rendered).toContain("Calculus")
    expect(rendered).toContain("Advanced Calculus")
    expect(rendered).toContain("Field bases")
    expect(rendered).toContain("Current Goal version")
    expect(rendered).toContain("source Goal becomes superseded")
    expect(rendered).not.toContain("gol_source")
    expect(rendered).not.toContain("glr_target")
    expect(rendered).not.toContain("cou_internal")

    const directInvocation = {
      envelope: { ...envelope, authorizationBasis: "learner_request" },
      command,
    } as unknown as LearnerGoal.DirectInvocation
    const replacement = operations[0]
    if (!replacement || replacement.type !== "replace") throw new Error("Expected a replacement operation")
    const directProposal = LearningCommandPresentation.learnerGoalsProposal(directInvocation, {
      authorizationBasis: "learner_request",
      semanticFingerprint: "b".repeat(64),
      operations: [
        {
          ...replacement,
          meaning: {
            ...replacement.meaning,
            fieldBases: {
              outcome: authored,
              conditions: authored,
              scope: authored,
              target: authored,
              disposition: authored,
            },
          },
          replacementTarget: {
            ...replacement.replacementTarget,
            meaning: {
              ...replacement.replacementTarget.meaning,
              fieldBases: {
                outcome: authored,
                conditions: authored,
                scope: authored,
                target: authored,
                disposition: authored,
              },
            },
          },
        },
      ],
    })
    expect(directProposal.basis).toMatchObject({
      kind: "learner_goals",
      authorizationBasis: "learner_request",
    })
  })

  test("binds Goal result meaning and rejects contradictory outer metadata or ToolPart identity", () => {
    const settlement = {
      outcome: "applied",
      goalKind: "learner_goal",
      receiptID: "lcr_receipt",
      effectID: "gle_effect",
      authorizationBasis: "learner_request",
      operations: [
        {
          ordinal: 0,
          operation: "update",
          result: "changed",
          goalID: "gol_internal",
          revisionID: "glr_internal",
          version: 3,
          disposition: "superseded",
          meaning: {
            outcome: "Explain the chain rule",
            conditions: ["demonstrate Explain the chain rule"],
            scope: { type: "courses", courseIDs: ["cou_internal"] },
            target: { type: "absent" },
          },
        },
      ],
      acknowledgementTitle: "legacy title",
      acknowledgementBody: "legacy body with gol_internal",
      frontierSequence: 4,
      settlementTime: 5,
      settlementOrder: 6,
    } as unknown as LearnerGoal.AppliedSettlement
    const goalOperations = [
      {
        ordinal: 0,
        operation: "update",
        result: "changed",
        goalID: "gol_internal",
        revisionID: "glr_internal",
        version: 3,
        meaning: {
          ...goalMeaning("Explain the chain rule", "Calculus"),
          disposition: "superseded",
        },
        supersessionTarget: {
          goalID: "gol_target",
          revisionID: "glr_target",
          version: 4,
          meaning: goalMeaning("Solve composite derivatives", "Advanced Calculus"),
        },
      },
    ] as unknown as readonly LearnerGoal.ResultPresentationOperation[]
    const result = LearningCommandPresentation.settlementResult(
      settlement,
      LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      envelope,
      goalOperations,
    )
    expect(() =>
      LearningCommandPresentation.settlementResult(
        {
          ...settlement,
          operations: settlement.operations.map((operation) => ({
            ...operation,
            version: operation.version + 1,
          })),
        },
        LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        envelope,
        goalOperations,
      ),
    ).toThrow("does not match the committed settlement")
    const projection = SemanticPresentation.projectResultBasis(result.basis)
    expect(projection).not.toBeUndefined()
    const title = projection!.title
    const part = {
      id: envelope.partID,
      sessionID: envelope.sessionID,
      messageID: envelope.assistantMessageID,
      type: "tool",
      tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      callID: envelope.providerCallID,
      state: {
        status: "completed",
        input: {},
        output: "legacy output",
        title,
        metadata: {
          command: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
          commandVersion: LearningCommand.HISTORICAL_UPDATE_LEARNER_GOALS_VERSION,
          outcome: "applied",
          durablySettled: true,
          truncated: false,
          ...SemanticPresentation.metadata(result),
        },
        time: { start: 1, end: 5 },
      },
    } as SessionV1.ToolPart
    const read = SemanticPresentation.readResult(part)
    expect(read.type).toBe("valid")
    if (read.type !== "valid") throw new Error("Expected a valid Goal result")
    const rendered = JSON.stringify(read.value)
    expect(rendered).toContain("Calculus")
    expect(rendered).toContain("Advanced Calculus")
    expect(rendered).toContain("Field bases")
    expect(rendered).not.toContain("gol_internal")
    expect(rendered).not.toContain("glr_target")
    expect(rendered).not.toContain("cou_internal")

    if (part.state.status !== "completed") throw new Error("Expected a completed ToolPart")
    expect(
      SemanticPresentation.readResult({
        ...part,
        state: { ...part.state, metadata: { ...part.state.metadata, outcome: "no_change" } },
      }),
    ).toEqual({ type: "invalid" })
    expect(SemanticPresentation.readResult({ ...part, tool: "content_write" })).toEqual({ type: "invalid" })
  })

  test("binds a host proposal to one exact terminal Tool Part without implying mutation", () => {
    const proposal = {
      partID: "prt_proposal",
      turnID: "trn_proposal",
      sessionID: envelope.sessionID,
      assistantMessageID: envelope.assistantMessageID,
      callID: "call_proposal",
      emissionOrdinal: 2,
      command: {
        kind: "default_course_preference",
        expectedHeadID: null,
        expectedVersion: 0,
        target: null,
      },
      commandFingerprint: "a".repeat(64),
      resolutionScope: {
        coverage: "explicitly_truncated",
        candidates: [],
        selectedCourseID: null,
        truncation: { reason: "Only the currently relevant Courses were shown" },
      },
      resolutionFingerprint: "b".repeat(64),
      preferenceHeadID: null,
      preferenceVersion: 0,
      operation: "change",
      from: { kind: "absent" },
      to: { kind: "absent" },
      fingerprint: "c".repeat(64),
      timePresented: 4,
    } as unknown as DefaultCourseProposal
    const exact = LearningCommandPresentation.hostDefaultCourseProposalResult(proposal, {
      sessionID: envelope.sessionID,
      assistantMessageID: envelope.assistantMessageID,
      providerCallID: "call_proposal",
      partID: "prt_proposal",
      emissionOrdinal: 2,
    })
    expect(exact.metadata).toMatchObject({
      proposalFingerprint: proposal.fingerprint,
      durablyRecorded: true,
      mutating: false,
    })
    expect(JSON.parse(exact.output)).toMatchObject({
      outcome: "proposal_recorded",
      proposal: { partID: proposal.partID, fingerprint: proposal.fingerprint },
    })
    expect(() =>
      LearningCommandPresentation.hostDefaultCourseProposalResult(proposal, {
        sessionID: envelope.sessionID,
        assistantMessageID: envelope.assistantMessageID,
        providerCallID: "copied_call",
        partID: "prt_proposal",
        emissionOrdinal: 2,
      }),
    ).toThrow("diverged")
  })

  test("projects V2 capability and settlement from one exact symmetric locator basis", () => {
    const target = {
      courseID: "cou_target",
      title: { availability: "recorded_v2" as const, value: "Algorithms" },
      courseVersion: { availability: "recorded_v2" as const, value: 3 },
      workingSelection: {
        availability: "recorded_v2" as const,
        value: {
          revisionID: "rev_target",
          selectionVersion: 4,
          viewID: "view_main",
          viewName: "Main",
          viewVersion: 5,
          revisionVersion: 6,
        },
      },
    }
    const authorization = {
      kind: "direct_request_v2",
      fingerprint: "d".repeat(64),
      command: {
        kind: "default_course_preference",
        expectedHeadID: null,
        expectedVersion: 0,
        target: {
          courseID: "cou_target",
          courseVersion: 3,
          selectionRevisionID: "rev_target",
          selectionVersion: 4,
          viewID: "view_main",
          viewVersion: 5,
          revisionVersion: 6,
        },
      },
      commandFingerprint: "e".repeat(64),
      source: {
        kind: "direct_request_v2",
        occurrenceID: "loc_occurrence",
        excerpt: "make Algorithms my default course",
      },
      resolutionScope: {
        coverage: "complete",
        candidates: [{ courseID: "cou_target", title: "Algorithms", courseVersion: 3 }],
        selectedCourseID: "cou_target",
      },
      resolutionFingerprint: "f".repeat(64),
      preferenceHeadID: null,
      preferenceVersion: 0,
      operation: "set",
      from: { kind: "absent" },
      to: { kind: "course", locator: target },
    } as unknown as DefaultCourseV2Authorization
    const proposal = LearningCommandPresentation.defaultCourseV2Capability(authorization, envelope)
    const exact = request({
      permission: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      patterns: ["cou_target"],
      always: ["cou_target"],
      metadata: {
        navigationKind: "default_course_preference",
        authorization,
        [PermissionV1.EXACT_REPLY_METADATA_KEY]: true,
        ...SemanticPresentation.metadata(proposal),
      },
    })
    expect(SemanticPresentation.readProposal(exact)).toMatchObject({
      type: "valid",
      value: { title: "Set the default Course preference", approval: "policy" },
    })
    expect(SemanticPresentation.readProposal({ ...exact, patterns: ["clear"] })).toEqual({ type: "invalid" })
    for (const malformed of [
      {
        ...authorization,
        from: {
          kind: "course",
          locator: {
            ...target,
            title: { availability: "not_recorded_v1" },
          },
        },
      },
      {
        ...authorization,
        to: {
          kind: "course",
          locator: {
            ...target,
            courseVersion: { availability: "not_recorded_v1" },
          },
        },
      },
      {
        ...authorization,
        to: {
          kind: "course",
          locator: {
            ...target,
            workingSelection: {
              availability: "recorded_v2",
              value: { ...target.workingSelection.value, viewName: null },
            },
          },
        },
      },
    ]) {
      const malformedProposal = LearningCommandPresentation.defaultCourseV2Capability(
        malformed as unknown as DefaultCourseV2Authorization,
        envelope,
      )
      expect(
        SemanticPresentation.readProposal(
          request({
            permission: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
            patterns: ["cou_target"],
            always: ["cou_target"],
            metadata: {
              navigationKind: "default_course_preference",
              authorization: malformed,
              [PermissionV1.EXACT_REPLY_METADATA_KEY]: true,
              ...SemanticPresentation.metadata(malformedProposal),
            },
          }),
        ),
      ).toEqual({ type: "invalid" })
    }

    const acknowledgement = {
      schemaVersion: 1,
      invocationPartID: envelope.partID,
      effectAuthorizationPartID: envelope.partID,
      authorizationVersion: 2,
      effectID: "ndp_effect",
      receiptID: "lcr_receipt",
      operation: "set",
      from: authorization.from,
      to: authorization.to,
      relation: "active",
      timeCommitted: 3,
      commitOrder: 4,
    } as unknown as Extract<DefaultCourseAcknowledgement, { readonly schemaVersion: 1 }>
    const result = LearningCommandPresentation.defaultCourseV2SettlementResult(
      { outcome: "applied", settlementTime: 3, settlementOrder: 4 },
      { kind: "candidate_v2", authorization },
      acknowledgement,
      envelope,
    )
    const projected = SemanticPresentation.projectResultBasis(result.basis)
    if (!projected) throw new Error("Expected a valid V2 Default-Course result")
    const part = {
      id: envelope.partID,
      sessionID: envelope.sessionID,
      messageID: envelope.assistantMessageID,
      type: "tool",
      tool: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      callID: envelope.providerCallID,
      state: {
        status: "completed",
        input: {},
        output: "{}",
        title: projected.title,
        metadata: {
          command: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          commandVersion: 2,
          outcome: "applied",
          durablySettled: true,
          truncated: false,
          ...SemanticPresentation.metadata(result),
        },
        time: { start: 1, end: 3 },
      },
    } as SessionV1.ToolPart
    expect(SemanticPresentation.readResult(part)).toMatchObject({ type: "valid" })
    if (result.basis.kind !== "default_course_v2_result") throw new Error("Expected the V2 result basis")
    expect(
      SemanticPresentation.projectResultBasis({
        ...result.basis,
        acknowledgement: { ...result.basis.acknowledgement!, operation: "clear" },
      }),
    ).toBeUndefined()
    for (const malformed of [
      {
        ...result.basis.acknowledgement!,
        from: {
          kind: "course",
          locator: {
            ...target,
            title: { availability: "not_recorded_v1" },
          },
        },
      },
      {
        ...result.basis.acknowledgement!,
        to: {
          kind: "course",
          locator: {
            ...target,
            workingSelection: {
              availability: "recorded_v2",
              value: { ...target.workingSelection.value, viewID: null },
            },
          },
        },
      },
    ]) {
      expect(
        SemanticPresentation.projectResultBasis({
          ...result.basis,
          acknowledgement: malformed,
        } as unknown as typeof result.basis),
      ).toBeUndefined()
    }

    const semanticTerminal = {
      kind: "semantic_terminal_v2",
      outcome: "already_applied",
      command: authorization.command,
      commandFingerprint: "command-fingerprint",
      semanticAddress: {
        occurrenceID: authorization.source.occurrenceID,
        slot: "default_course_preference",
      },
      semanticAddressFingerprint: "address-fingerprint",
      incomingPayloadFingerprint: "same-payload",
      existingEffectID: acknowledgement.effectID,
      existingPayloadFingerprint: "same-payload",
    } as const
    const legacyAcknowledgement = {
      schemaVersion: 1,
      invocationPartID: envelope.partID,
      effectAuthorizationPartID: "prt_legacy_effect",
      authorizationVersion: 1,
      effectID: acknowledgement.effectID,
      receiptID: acknowledgement.receiptID,
      operation: "set",
      from: { kind: "absent" },
      to: {
        kind: "course",
        locator: {
          courseID: "cou_target",
          title: { availability: "recorded_v1", value: "Algorithms" },
          courseVersion: { availability: "not_recorded_v1" },
          workingSelection: { availability: "not_recorded_v1" },
        },
      },
      relation: "active",
      timeCommitted: 3,
      commitOrder: 4,
    } as unknown as Extract<DefaultCourseAcknowledgement, { readonly schemaVersion: 1 }>
    const duplicate = LearningCommandPresentation.defaultCourseV2SettlementResult(
      { outcome: "already_applied", settlementTime: 5, settlementOrder: 6 },
      semanticTerminal,
      legacyAcknowledgement,
      envelope,
    )
    expect(SemanticPresentation.projectResultBasis(duplicate.basis)).toMatchObject({
      title: "Default Course preference",
      outcome: "already_applied",
    })
    if (duplicate.basis.kind !== "default_course_v2_result") {
      throw new Error("Expected the semantic-terminal V2 result basis")
    }
    if (duplicate.basis.disposition.kind !== "semantic_terminal_v2") {
      throw new Error("Expected the semantic-terminal V2 disposition")
    }
    expect(
      SemanticPresentation.projectResultBasis({
        ...duplicate.basis,
        disposition: {
          ...duplicate.basis.disposition,
          existingPayloadFingerprint: "different-payload",
        },
      }),
    ).toBeUndefined()

    const conflict = LearningCommandPresentation.defaultCourseV2SettlementResult(
      {
        outcome: "error",
        code: "semantic_conflict",
        settlementTime: 7,
        settlementOrder: 8,
      },
      {
        ...semanticTerminal,
        outcome: "semantic_conflict",
        incomingPayloadFingerprint: "incoming-payload",
        existingPayloadFingerprint: "existing-payload",
      },
      undefined,
      envelope,
    )
    expect(SemanticPresentation.projectResultBasis(conflict.basis)).toMatchObject({
      title: "Default Course preference",
      outcome: "failed",
      code: "semantic_conflict",
    })
    if (conflict.basis.kind !== "default_course_v2_result") {
      throw new Error("Expected the semantic-conflict V2 result basis")
    }
    expect(
      SemanticPresentation.projectResultBasis({
        ...conflict.basis,
        acknowledgement: legacyAcknowledgement,
      }),
    ).toBeUndefined()
  })

  test("projects current V3 Agent issuance without reviving semantic authorization", () => {
    const binding = {
      ...envelope,
      capabilityIdentity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      capabilityVersion: 3,
      authorizationBasis: "agent_action",
    } as unknown as LearningCommand.InvocationEnvelope
    const target = {
      courseID: "cou_current",
      title: { availability: "recorded_v2" as const, value: "Distributed Systems" },
      courseVersion: { availability: "recorded_v2" as const, value: 4 },
      workingSelection: {
        availability: "recorded_v2" as const,
        value: {
          revisionID: null,
          selectionVersion: 2,
          viewID: null,
          viewName: null,
          viewVersion: null,
          revisionVersion: null,
        },
      },
    }
    const agentAction = {
      kind: "agent_action_v3",
      fingerprint: "a".repeat(64),
      provenance: {
        schemaVersion: 1,
        kind: "root",
        occurrenceID: binding.occurrenceID,
        causalRootOccurrenceID: binding.occurrenceID,
        sessionID: binding.sessionID,
        turnID: binding.turnID,
        inputID: binding.inputID,
        assistantMessageID: binding.assistantMessageID,
        invocationPartID: binding.partID,
        providerCallID: binding.providerCallID,
        emissionOrdinal: binding.emissionOrdinal,
        capabilityIdentity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        capabilityVersion: 3,
        lineage: [],
      },
      command: { action: "set", courseID: target.courseID },
      commandFingerprint: "b".repeat(64),
      preferenceHeadID: null,
      preferenceVersion: 0,
      operation: "set",
      from: { kind: "absent" },
      to: { kind: "course", locator: target },
    } as unknown as DefaultCourseAgentAction
    const proposal = LearningCommandPresentation.defaultCourseV3Capability(agentAction, binding)
    const exact = request({
      permission: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      patterns: [target.courseID],
      always: [target.courseID],
      metadata: {
        navigationKind: "default_course_preference",
        agentAction,
        [PermissionV1.EXACT_REPLY_METADATA_KEY]: true,
        ...SemanticPresentation.metadata(proposal),
      },
    })
    expect(SemanticPresentation.readProposal(exact)).toMatchObject({
      type: "valid",
      value: {
        title: "Set the default Course preference",
        approval: "policy",
        facts: expect.arrayContaining([
          { label: "Issuance", value: "root" },
          { label: "To", value: `"Distributed Systems"; ${target.courseID}` },
        ]),
      },
    })
    const invalidProposal = LearningCommandPresentation.defaultCourseV3Capability(
      {
        ...agentAction,
        provenance: { ...agentAction.provenance, causalRootOccurrenceID: "loc_other" },
      } as DefaultCourseAgentAction,
      binding,
    )
    expect(
      SemanticPresentation.readProposal({
        ...exact,
        metadata: {
          ...exact.metadata,
          agentAction: {
            ...agentAction,
            provenance: { ...agentAction.provenance, causalRootOccurrenceID: "loc_other" },
          },
          ...SemanticPresentation.metadata(invalidProposal),
        },
      }),
    ).toEqual({ type: "invalid" })

    const acknowledgement = {
      schemaVersion: 2,
      invocationPartID: binding.partID,
      effectAgentActionPartID: binding.partID,
      agentActionVersion: 3,
      effectID: "ndp_v3_effect",
      receiptID: "lcr_v3_receipt",
      operation: "set",
      from: agentAction.from,
      to: agentAction.to,
      relation: "active",
      timeCommitted: 3,
      commitOrder: 4,
    } as unknown as Extract<DefaultCourseAcknowledgement, { readonly schemaVersion: 2 }>
    const result = LearningCommandPresentation.defaultCourseV3SettlementResult(
      { outcome: "applied", settlementTime: 3, settlementOrder: 4 },
      { kind: "agent_action_v3", agentAction },
      acknowledgement,
      binding,
    )
    const projected = SemanticPresentation.projectResultBasis(result.basis)
    if (!projected) throw new Error("Expected a valid V3 Default-Course result")
    const part = {
      id: binding.partID,
      sessionID: binding.sessionID,
      messageID: binding.assistantMessageID,
      type: "tool",
      tool: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      callID: binding.providerCallID,
      state: {
        status: "completed",
        input: agentAction.command,
        output: "{}",
        title: projected.title,
        metadata: {
          command: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          commandVersion: 3,
          outcome: "applied",
          durablySettled: true,
          truncated: false,
          ...SemanticPresentation.metadata(result),
        },
        time: { start: 1, end: 3 },
      },
    } as SessionV1.ToolPart
    expect(SemanticPresentation.readResult(part)).toMatchObject({
      type: "valid",
      value: {
        title: "Default Course preference",
        outcome: "committed",
        facts: expect.arrayContaining([
          { label: "Disposition", value: "agent_action_v3" },
          { label: "Effect Agent action", value: binding.partID },
        ]),
      },
    })
    if (result.basis.kind !== "default_course_v3_result") throw new Error("Expected the V3 result basis")
    const v3Acknowledgement = result.basis.acknowledgement
    if (v3Acknowledgement?.schemaVersion !== 2) throw new Error("Expected the V3 acknowledgement")
    expect(
      SemanticPresentation.projectResultBasis({
        ...result.basis,
        acknowledgement: {
          ...v3Acknowledgement,
          effectAgentActionPartID: "prt_shadow_authorization",
        },
      }),
    ).toBeUndefined()
  })

  test("binds the closed learning bootstrap scope and projects exact material, selection, and anchor truth", () => {
    const bootstrapEnvelope = {
      sessionID: envelope.sessionID,
      assistantMessageID: envelope.assistantMessageID,
      providerCallID: envelope.providerCallID,
      partID: envelope.partID,
    }
    const command = LearningBootstrap.canonicalizeCommand({
      course: { type: "new", title: "Linear algebra" },
      selection: { type: "preserve" },
      materials: [
        {
          type: "local",
          key: "notes",
          path: "C:\\Learning\\linear.txt",
          authority: { type: "one_operation" },
        },
      ],
      maps: [],
      alignments: [],
      anchor: { type: "preserve" },
    })
    const candidate = {
      commandFingerprint: LearningBootstrap.commandFingerprint(command),
      agentAction: { kind: "root" },
      canonicalCommand: command,
      materialized: { course: { type: "new" } },
    } as unknown as LearningBootstrap.Candidate
    const proposal = LearningCommandPresentation.learningBootstrapCapability(candidate, bootstrapEnvelope)
    const scope = LearningCommandPresentation.learningBootstrapScope(candidate)
    const proposalRead = SemanticPresentation.readProposal(
      request({
        permission: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        patterns: ["learning_course"],
        always: [],
        metadata: {
          bootstrapKind: "learning_bootstrap",
          commandFingerprint: candidate.commandFingerprint,
          issuance: "root",
          scope,
          [PermissionV1.PROMPT_REQUIRED_METADATA_KEY]: true,
          ...SemanticPresentation.metadata(proposal),
        },
      }),
    )
    expect(proposalRead).toMatchObject({
      type: "valid",
      value: {
        capability: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        approval: "once_only",
        facts: expect.arrayContaining([
          { label: "Issuance", value: "root" },
          { label: "Course", value: 'create "Linear algebra"' },
          { label: "Route", value: "none" },
          { label: "Selection", value: "preserve" },
          {
            label: "Material notes",
            value: 'new local Artifact from path "C:\\Learning\\linear.txt"; authority one_operation',
          },
        ]),
      },
    })

    const acknowledgement = {
      schemaVersion: 1 as const,
      outcome: "applied" as const,
      course: { id: "cou_linear", title: "Linear algebra" },
      children: [
        { kind: "course" as const, outcome: "changed" as const, id: "cou_linear", detail: "created" },
        {
          kind: "material" as const,
          key: "notes",
          outcome: "changed" as const,
          id: "lca_linear",
          detail: "explicit material adoption committed",
          materialTarget: {
            type: "artifact" as const,
            artifactID: "art_linear",
            revisionID: "arv_linear",
            attribution: { type: "recorded" as const },
            sourceAuthority: {
              kind: "one_operation" as const,
              root: {
                platform: "windows_ntfs" as const,
                verifierVersion: 1,
                canonicalPath: "C:\\Learning",
                canonicalPathKey: "c:\\learning",
                volumeSerial: "volume",
                objectID: "root-object",
                creationTime: "1",
                changeTime: "2",
                lastWriteTime: "3",
                size: 1,
                kind: "directory" as const,
              },
              relativePath: "linear.txt",
              canonicalPath: "C:\\Learning\\linear.txt",
              operationIdentity: `${envelope.partID}:${envelope.providerCallID}`,
              approvalBasis: '{"permissionRequestID":"per_bootstrap"}',
            },
          },
        },
        {
          kind: "selection" as const,
          outcome: "no_change" as const,
          selectedRevisionID: null,
          detail: "selection clear or preserved",
        },
        { kind: "anchor" as const, outcome: "no_change" as const, detail: "route anchor preserved" },
      ],
      selectedRevisionID: null,
      anchor: { headID: null, target: null, usability: { usable: false as const, cause: "absent" } },
      correction: "Continue in ordinary language; Repa will bind any correction to a new learner occurrence.",
    }
    const result = LearningCommandPresentation.learningBootstrapSettlementResult(
      { outcome: "applied", acknowledgement } as unknown as LearningCommand.PhysicalSettlement,
      {
        disposition: "candidate_v1",
        candidate,
        capabilityOutcome: "prompted_allow",
        permissionRequestID: "per_bootstrap",
      } as unknown as LearningBootstrap.InvocationVersion,
      bootstrapEnvelope,
    )
    const projection = SemanticPresentation.projectResultBasis(result.basis)
    expect(projection).toMatchObject({
      capability: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      outcome: "committed",
      durablySettled: true,
      facts: expect.arrayContaining([
        { label: "Course", value: '"Linear algebra" (cou_linear)' },
        {
          label: "Material 2",
          value: expect.stringContaining(
            "Artifact art_linear; Revision arv_linear; recorded attribution; one-operation grant",
          ),
        },
        { label: "Working selection", value: "none" },
        { label: "Route anchor", value: "none; unusable: absent; head none" },
      ]),
    })
    const part = {
      id: bootstrapEnvelope.partID,
      sessionID: bootstrapEnvelope.sessionID,
      messageID: bootstrapEnvelope.assistantMessageID,
      type: "tool",
      tool: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      callID: bootstrapEnvelope.providerCallID,
      state: {
        status: "completed",
        input: candidate.canonicalCommand,
        output: "{}",
        title: projection!.title,
        metadata: {
          command: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
          commandVersion: 1,
          outcome: "applied",
          durablySettled: true,
          truncated: false,
          ...SemanticPresentation.metadata(result),
        },
        time: { start: 1, end: 2 },
      },
    } as SessionV1.ToolPart
    expect(SemanticPresentation.readResult(part)).toMatchObject({
      type: "valid",
      value: { outcome: "committed", capability: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY },
    })
  })

  test("projects every current learner Goal terminal class through the typed carrier", () => {
    const binding = {
      sessionID: envelope.sessionID,
      messageID: envelope.assistantMessageID,
      callID: envelope.providerCallID,
      partID: envelope.partID,
    }
    const operation = {
      schemaVersion: 2 as const,
      ordinal: 0,
      operation: "create" as const,
      result: "changed" as const,
      goalID: "goal-current",
      revisionID: "revision-current",
      version: 1,
      meaning: {
        outcome: "Understand virtual memory",
        conditions: ["Explain address translation"],
        scope: { type: "learner_home" as const },
        target: "none",
        disposition: "active" as const,
      },
    }
    const cases = [
      {
        name: "committed",
        basis: {
          kind: "learner_goals_v2_result" as const,
          binding,
          settlement: { outcome: "applied" as const },
          disposition: "candidate_v2" as const,
          issuance: "root" as const,
          capabilityOutcome: "policy_allow" as const,
          operations: [operation],
        },
        title: "Updated learning Goal",
        outcome: "committed",
      },
      {
        name: "already applied",
        basis: {
          kind: "learner_goals_v2_result" as const,
          binding,
          settlement: { outcome: "already_applied" as const },
          disposition: "semantic_terminal_v2" as const,
          semanticOutcome: "already_applied" as const,
          operations: [operation],
        },
        title: "Updated learning Goal",
        outcome: "already_applied",
      },
      {
        name: "no effect",
        basis: {
          kind: "learner_goals_v2_result" as const,
          binding,
          settlement: { outcome: "no_change" as const },
          disposition: "candidate_v2" as const,
          issuance: "delegated" as const,
          capabilityOutcome: "prompted_allow" as const,
          permissionRequestID: "per_goal_current",
          operations: [{ ...operation, result: "no_change" as const }],
        },
        title: "Learning Goals unchanged",
        outcome: "no_effect",
      },
      {
        name: "failed",
        basis: {
          kind: "learner_goals_v2_result" as const,
          binding,
          settlement: { outcome: "error" as const, code: "permission_rejected" },
          disposition: "candidate_v2" as const,
          issuance: "root" as const,
          capabilityOutcome: "policy_deny" as const,
          operations: [],
        },
        title: "Learner Goals not changed",
        outcome: "failed",
      },
    ] as const

    for (const item of cases) {
      const result = SemanticPresentation.result(item.basis)
      const projection = SemanticPresentation.projectResultBasis(result.basis)
      expect(projection).toMatchObject({ title: item.title, outcome: item.outcome })
      const part = {
        id: binding.partID,
        sessionID: binding.sessionID,
        messageID: binding.messageID,
        type: "tool",
        tool: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        callID: binding.callID,
        state: {
          status: "completed",
          input: { operations: [{ type: "create", outcome: operation.meaning.outcome }] },
          output: "{}",
          title: projection!.title,
          metadata: {
            command: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            commandVersion: 2,
            outcome: item.basis.settlement.outcome,
            ...(item.basis.settlement.outcome === "error" ? { code: item.basis.settlement.code } : {}),
            durablySettled: true,
            truncated: false,
            ...SemanticPresentation.metadata(result),
          },
          time: { start: 1, end: 2 },
        },
      } as SessionV1.ToolPart
      expect(SemanticPresentation.readResult(part)).toMatchObject({
        type: "valid",
        value: { title: item.title, outcome: item.outcome },
      })
    }
  })
})

describe("learner-response-evidence semantic presentation", () => {
  test("binds the exact operation/basis/source shape and renders no mastery claim", () => {
    const command = LearnerResponseEvidence.canonicalizeCommand({
      operation: "create",
      relation: "supports",
      exposure: "learner_response_before_tutor_disclosure",
      conditionAssistantMessageID: "msg_condition" as SessionV1.MessageID,
      target: {
        mapID: `mmp_${"a".repeat(26)}` as never,
        selectorID: `msl_${"b".repeat(26)}` as never,
        courseID: `crs_${"c".repeat(26)}` as never,
        viewID: `cvw_${"d".repeat(26)}` as never,
        revisionID: `cvr_${"e".repeat(26)}` as never,
        itemID: `cit_${"f".repeat(26)}` as never,
      },
      alignmentID: `mca_${"g".repeat(26)}` as never,
    })
    if (command.operation !== "create") throw new Error("Expected a canonical create command")
    const subject = {
      occurrenceID: `occ_${"s".repeat(26)}` as never,
      sourceOrder: 1,
      sessionID: `ses_${"t".repeat(26)}` as never,
      messageID: `msg_${"u".repeat(26)}` as never,
      turnID: `trn_${"v".repeat(26)}` as never,
      inputID: `inp_${"w".repeat(26)}` as never,
      timeAdmitted: 1,
    }
    const target = {
      ...command.target,
      alignmentID: command.alignmentID,
      alignmentDispositionVersion: 1,
      mapDispositionVersion: 1,
      courseVersion: 1,
      viewVersion: 1,
      revisionVersion: 1,
    }
    const candidate = {
      canonicalCommand: command,
      commandFingerprint: LearnerResponseEvidence.commandFingerprint(command),
      agentAction: { kind: "root", lineage: [] },
      materialized: {
        subject,
        target,
        programBasis: "tutor_interpretation",
        programDisposition: "active",
      },
    } as unknown as LearnerResponseEvidence.Candidate
    const proposal = LearningCommandPresentation.learnerResponseEvidenceCapability(candidate, envelope)
    const scope = LearningCommandPresentation.learnerResponseEvidenceScope(candidate)
    const proposalRead = SemanticPresentation.readProposal(
      request({
        permission: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
        patterns: [LearnerResponseEvidence.PERMISSION_PATTERN],
        always: [LearnerResponseEvidence.PERMISSION_PATTERN],
        metadata: {
          evidenceKind: "learner_response_evidence",
          commandFingerprint: candidate.commandFingerprint,
          issuance: "root",
          scope,
          ...SemanticPresentation.metadata(proposal),
        },
      }),
      true,
    )
    expect(proposalRead).toMatchObject({
      type: "valid",
      value: {
        capability: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
        approval: "policy",
      },
    })
    expect(JSON.stringify(proposalRead)).toContain("Does not imply")
    expect(JSON.stringify(proposalRead)).toContain(subject.occurrenceID)
    expect(JSON.stringify(proposalRead)).toContain(target.selectorID)
    const differentSubjectCandidate = {
      ...candidate,
      materialized: {
        ...candidate.materialized,
        subject: { ...subject, occurrenceID: `occ_${"x".repeat(26)}` },
      },
    } as unknown as LearnerResponseEvidence.Candidate
    expect(
      JSON.stringify(
        LearningCommandPresentation.learnerResponseEvidenceCapability(differentSubjectCandidate, envelope).basis,
      ),
    ).not.toBe(JSON.stringify(proposal.basis))
    expect(
      SemanticPresentation.readProposal(
        request({
          permission: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
          patterns: [LearnerResponseEvidence.PERMISSION_PATTERN],
          always: [LearnerResponseEvidence.PERMISSION_PATTERN],
          metadata: {
            evidenceKind: "learner_response_evidence",
            commandFingerprint: candidate.commandFingerprint,
            issuance: "root",
            scope: { ...scope, programBasis: "learner_report" },
            ...SemanticPresentation.metadata(proposal),
          },
        }),
        true,
      ),
    ).toEqual({ type: "invalid" })

    const settlement = {
      outcome: "applied",
      evidenceKind: "learner_response_evidence",
      schemaVersion: 1,
      receiptID: LearningCommand.createReceiptID(),
      effectID: `lrr_${"h".repeat(26)}`,
      recordID: `lre_${"i".repeat(26)}`,
      revisionID: `lrr_${"h".repeat(26)}`,
      version: 0,
      subject,
      target,
      operation: "create",
      relation: "supports",
      exposure: "learner_response_before_tutor_disclosure",
      basis: "tutor_interpretation",
      disposition: "active",
      frontierSequence: 1,
      settlementTime: 2,
      settlementOrder: 1,
    } as unknown as LearnerResponseEvidence.AppliedSettlement & LearningCommand.PhysicalSettlement
    const result = LearningCommandPresentation.learnerResponseEvidenceSettlementResult(
      settlement,
      {
        version: 1,
        status: "applied",
        disposition: "candidate_v1",
        candidate,
        capabilityOutcome: "policy_allow",
        settlement,
        timeAdmitted: 1,
      },
      envelope,
    )
    const projection = SemanticPresentation.projectResultBasis(result.basis)
    expect(projection).toMatchObject({
      capability: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
      outcome: "committed",
    })
    expect(JSON.stringify(projection)).toContain("Does not imply")
    expect(JSON.stringify(projection)).toContain(subject.occurrenceID)
    expect(JSON.stringify(projection)).toContain(target.selectorID)
    if (result.basis.kind !== "learner_response_evidence_result") throw new Error("Unexpected presentation basis")
    const forged = { ...result.basis, effect: { ...result.basis.effect!, basis: "learner_report" as const } }
    expect(SemanticPresentation.projectResultBasis(forged)).toBeUndefined()
  })
})

describe("future-attention semantic presentation", () => {
  test("binds exact permission scope while keeping concern identities out of default learner-visible prose", () => {
    const concernID = "fac_00000000000000000000000000" as FutureAttention.ConcernID
    const command = FutureAttention.canonicalizeCommand({
      operations: [
        {
          type: "serve",
          concernID,
          expectedVersion: 2,
          service: {
            source: { type: "current_assistant_when_complete" },
            rationale: "This exact committed Assistant presentation realizes the retained explanation purpose.",
          },
        },
      ],
    })
    const candidate = {
      commandFingerprint: FutureAttention.commandFingerprint(command),
      canonicalCommand: command,
      agentAction: { kind: "root" },
    } as unknown as FutureAttention.Candidate
    const proposal = LearningCommandPresentation.futureAttentionCapability(candidate, envelope)
    const scope = SemanticPresentation.futureAttentionScope(command)
    const exact = request({
      permission: FutureAttention.UPDATE_CAPABILITY,
      patterns: [FutureAttention.PERMISSION_PATTERN],
      always: [FutureAttention.PERMISSION_PATTERN],
      metadata: {
        futureAttentionKind: "change_set",
        commandFingerprint: candidate.commandFingerprint,
        issuance: "root",
        scope,
        ...SemanticPresentation.metadata(proposal),
      },
    })
    const read = SemanticPresentation.readProposal(exact)
    expect(read).toMatchObject({
      type: "valid",
      value: {
        capability: FutureAttention.UPDATE_CAPABILITY,
        title: "Update future attention",
        approval: "policy",
        facts: expect.arrayContaining([
          { label: "Operations", value: "1" },
          { label: "Completion-conditioned claims", value: "1" },
        ]),
      },
    })
    expect(JSON.stringify(read)).not.toContain(concernID)
    expect(
      SemanticPresentation.readProposal({
        ...exact,
        metadata: {
          ...exact.metadata,
          scope: { ...scope, completionClaimCount: 0 },
        },
      }),
    ).toEqual({ type: "invalid" })
  })

  test("separates immutable pending admission wording from a later current claim observation", () => {
    const concernID = "fac_00000000000000000000000000" as FutureAttention.ConcernID
    const successorID = "fac_11111111111111111111111111" as FutureAttention.ConcernID
    const groupID = "fag_00000000000000000000000000" as FutureAttention.ClaimGroupID
    const receiptID = "far_00000000000000000000000000" as FutureAttention.FinalizationReceiptID
    const settlement = {
      outcome: "applied" as const,
      futureAttentionKind: "change_set" as const,
      receiptID: "fap_00000000000000000000000000",
      effectID: "fas_00000000000000000000000000",
      occurrenceID: "lco_00000000000000000000000000",
      changes: [
        {
          operation: "replace" as const,
          outcome: "changed" as const,
          concernID,
          version: 1,
          disposition: "superseded" as const,
          transitionID: "fat_00000000000000000000000000",
          successorConcernID: successorID,
          successorVersion: 0,
          successorDisposition: "open" as const,
          successorTransitionID: "fat_11111111111111111111111111",
        },
      ],
      claim: {
        groupID,
        claimStateAtAdmission: "pending" as const,
        claimState: "pending" as const,
      },
      settlementTime: 2,
      settlementOrder: 1,
    }
    const state = {
      disposition: "candidate_v1" as const,
      candidate: { agentAction: { kind: "root" as const } },
      capabilityOutcome: "policy_allow" as const,
    } as unknown as FutureAttention.InvocationVersion
    const pending = LearningCommandPresentation.futureAttentionSettlementResult(
      settlement as unknown as LearningCommand.PhysicalSettlement,
      state,
      envelope,
    )
    const projection = SemanticPresentation.projectResultBasis(pending.basis)
    const rendered = JSON.stringify(projection)
    expect(projection).toMatchObject({
      capability: FutureAttention.UPDATE_CAPABILITY,
      outcome: "committed",
      facts: expect.arrayContaining([
        { label: "Claim at this physical settlement", value: "pending" },
        { label: "Current claim observation", value: "pending" },
      ]),
    })
    expect(rendered).toContain("Exact physical replay preserves this settlement cut")
    expect(rendered).not.toContain(concernID)
    expect(rendered).not.toContain(successorID)
    expect(rendered).not.toContain(groupID)
    expect(rendered).not.toContain(settlement.effectID)
    expect(rendered).not.toContain(settlement.occurrenceID)

    if (pending.basis.kind !== "future_attention_result" || !pending.basis.effect?.claim) {
      throw new Error("Expected the pending FutureAttention result basis")
    }
    expect(
      SemanticPresentation.projectResultBasis({
        ...pending.basis,
        effect: {
          ...pending.basis.effect,
          claim: { ...pending.basis.effect.claim, currentClaimState: "served" },
        },
      }),
    ).toBeUndefined()
    const finalized = SemanticPresentation.projectResultBasis({
      ...pending.basis,
      effect: {
        ...pending.basis.effect,
        claim: {
          ...pending.basis.effect.claim,
          currentClaimState: "served",
          finalizationReceiptID: receiptID,
        },
      },
    })
    expect(finalized).toMatchObject({
      facts: expect.arrayContaining([{ label: "Finalization", value: "append-only receipt recorded" }]),
    })
    expect(JSON.stringify(finalized)).not.toContain(receiptID)
  })
})

describe("assignment semantic presentation", () => {
  test("binds exact source, generated identities, obligation meaning, and non-implications into approval", () => {
    const candidate = assignmentCandidate()
    const proposal = LearningCommandPresentation.assignmentCapability(candidate, envelope)
    const scope = SemanticPresentation.assignmentScope(candidate)
    const exact = request({
      permission: Assignment.UPDATE_CAPABILITY,
      patterns: [Assignment.PERMISSION_PATTERN],
      always: [Assignment.PERMISSION_PATTERN],
      metadata: {
        assignmentKind: "change_set",
        commandFingerprint: candidate.commandFingerprint,
        issuance: "root",
        scope,
        ...SemanticPresentation.metadata(proposal),
      },
    })

    expect(SemanticPresentation.readProposal(exact)).toMatchObject({
      type: "valid",
      value: {
        capability: Assignment.UPDATE_CAPABILITY,
        title: "Update Assignment records",
        approval: "policy",
        facts: expect.arrayContaining([
          { label: "Issuance", value: "root" },
          { label: "Cause", value: "interpreted_learner_report" },
          {
            label: "Exact learner source",
            value: expect.stringContaining("lco_assignment_presentation; session ses_test; message msg_parent"),
          },
          {
            label: "Source excerpt",
            value: expect.stringMatching(/^0\.\.\d+ bytes; sha256 [0-9a-f]{64}; Analyze the semaphore proof/),
          },
          {
            label: "Assignment change 1",
            value: expect.stringContaining(
              "create #0; asn_00000000000000000000000000/asr_00000000000000000000000000; disposition open",
            ),
          },
          {
            label: "Assignment change 1",
            value: expect.stringContaining(
              "summary Analyze the semaphore proof; learning context Teach the invariant before guided work; scope LearnerHome; due 2037-07-03 (inclusive); expiry none",
            ),
          },
          {
            label: "Does not imply",
            value: "activity, progress, mastery, learner_commitment, study_plan, selected_tutor_move",
          },
        ]),
      },
    })
    expect(
      SemanticPresentation.readProposal({
        ...exact,
        metadata: {
          ...exact.metadata,
          scope: {
            ...scope,
            sourceBasis: {
              ...(scope.sourceBasis as Record<string, unknown>),
              excerpt: { ...(scope.sourceBasis as { excerpt: Record<string, unknown> }).excerpt, sha256: "0".repeat(64) },
            },
          },
        },
      }),
    ).toEqual({ type: "invalid" })
    expect(
      SemanticPresentation.readProposal({
        ...exact,
        metadata: {
          ...exact.metadata,
          scope: {
            ...scope,
            materialized: [{ ...scope.materialized[0]!, assignmentID: "asn_11111111111111111111111111" }],
          },
        },
      }),
    ).toEqual({ type: "invalid" })
    expect(() =>
      LearningCommandPresentation.assignmentCapability(
        { ...candidate, agentAction: { ...candidate.agentAction, kind: "delegated" } },
        envelope,
      ),
    ).toThrow("Assignment capability requires a root Agent action")
  })

  test("shows the complete generated successor meaning before approving an Assignment replacement", () => {
    const candidate = assignmentReplacementCandidate()
    const proposal = LearningCommandPresentation.assignmentCapability(candidate, envelope)
    const scope = SemanticPresentation.assignmentScope(candidate)
    const exact = request({
      permission: Assignment.UPDATE_CAPABILITY,
      patterns: [Assignment.PERMISSION_PATTERN],
      always: [Assignment.PERMISSION_PATTERN],
      metadata: {
        assignmentKind: "change_set",
        commandFingerprint: candidate.commandFingerprint,
        issuance: "root",
        scope,
        ...SemanticPresentation.metadata(proposal),
      },
    })

    expect(SemanticPresentation.readProposal(exact)).toMatchObject({
      type: "valid",
      value: {
        facts: expect.arrayContaining([
          {
            label: "Assignment change 1",
            value: expect.stringContaining(
              "new successor #1 asn_11111111111111111111111111/asr_22222222222222222222222222",
            ),
          },
          {
            label: "Assignment change 1",
            value: expect.stringContaining(
              "summary Explain the binary-search invariant for problem set 4; learning context Teach the invariant before guided proof work; scope LearnerHome; due 2037-07-10 (inclusive); expiry 2037-07-11 (exclusive)",
            ),
          },
        ]),
      },
    })
  })

  test("projects a truthful committed Assignment result through the retained typed Tool carrier", () => {
    const candidate = assignmentCandidate()
    const settlement = {
      outcome: "applied" as const,
      assignmentKind: "change_set" as const,
      receiptID: "lcr_assignment_presentation",
      effectID: candidate.effectID,
      changes: [
        {
          ordinal: 0,
          operation: "create" as const,
          assignmentID: candidate.materialized[0]!.assignmentID,
          committedRevision: {
            assignmentID: candidate.materialized[0]!.assignmentID,
            revisionID: candidate.materialized[0]!.revisionID,
            version: 1,
          },
        },
      ],
      intentResults: [
        {
          outcome: "changed" as const,
          ordinal: 0,
          operation: "create" as const,
          assignmentID: candidate.materialized[0]!.assignmentID,
          committedRevision: {
            assignmentID: candidate.materialized[0]!.assignmentID,
            revisionID: candidate.materialized[0]!.revisionID,
            version: 1,
          },
        },
      ],
      settlementTime: 2,
      settlementOrder: 1,
    }
    const result = LearningCommandPresentation.assignmentSettlementResult(
      settlement as unknown as LearningCommand.PhysicalSettlement,
      {
        version: 1,
        disposition: "candidate_v1",
        status: "applied",
        settlement,
        candidate,
        capabilityOutcome: "policy_allow",
        timeAdmitted: 1,
      },
      envelope,
    )
    const projection = SemanticPresentation.projectResultBasis(result.basis)
    expect(projection).toMatchObject({
      capability: Assignment.UPDATE_CAPABILITY,
      title: "Assignment settlement",
      outcome: "committed",
      facts: expect.arrayContaining([
        {
          label: "Assignment result 1",
          value:
            "create; asn_00000000000000000000000000 -> asr_00000000000000000000000000 v1",
        },
        {
          label: "Does not imply",
          value:
            "activity, elapsed-work progress, mastery, learner commitment, a study plan, or an automatically selected Tutor move",
        },
      ]),
    })
    const part = {
      id: envelope.partID,
      sessionID: envelope.sessionID,
      messageID: envelope.assistantMessageID,
      type: "tool",
      tool: Assignment.UPDATE_CAPABILITY,
      callID: envelope.providerCallID,
      state: {
        status: "completed",
        input: candidate.canonicalCommand,
        output: "{}",
        title: projection!.title,
        metadata: {
          command: Assignment.UPDATE_CAPABILITY,
          commandVersion: Assignment.UPDATE_VERSION,
          outcome: settlement.outcome,
          durablySettled: true,
          truncated: false,
          ...SemanticPresentation.metadata(result),
        },
        time: { start: 1, end: 2 },
      },
    } as SessionV1.ToolPart
    expect(SemanticPresentation.readResult(part)).toMatchObject({
      type: "valid",
      value: { capability: Assignment.UPDATE_CAPABILITY, outcome: "committed" },
    })
    if (result.basis.kind !== "assignment_result" || !result.basis.effect) {
      throw new Error("Expected an Assignment result basis")
    }
    expect(
      SemanticPresentation.projectResultBasis({
        ...result.basis,
        effect: { ...result.basis.effect, changes: [] },
      }),
    ).toBeUndefined()
  })

  test("projects an already-settled Assignment no-change result without inventing an effect", () => {
    const candidate = assignmentCandidate()
    const receiptID = LearningCommand.createReceiptID()
    const currentRevision = {
      assignmentID: candidate.materialized[0]!.assignmentID,
      revisionID: candidate.materialized[0]!.revisionID,
      version: 1,
    }
    const settlement = {
      outcome: "already_applied" as const,
      assignmentKind: "change_set" as const,
      existingOutcome: "no_change" as const,
      receiptID,
      changes: [] as const,
      intentResults: [
        {
          outcome: "no_change" as const,
          ordinal: 0,
          operation: "revise" as const,
          assignmentID: currentRevision.assignmentID,
          currentRevision,
        },
      ],
      settlementTime: 2,
      settlementOrder: 1,
    }
    const state = {
      version: 1 as const,
      disposition: "semantic_terminal_v1" as const,
      status: "already_applied" as const,
      settlement,
      semanticTerminal: {
        kind: "semantic_terminal_v1" as const,
        outcome: "already_applied" as const,
        commandFingerprint: candidate.commandFingerprint,
        semanticAddressFingerprint: candidate.semanticAddressFingerprint,
        existingOwner: { type: "no_change" as const, receiptID: settlement.receiptID },
      },
      timeAdmitted: 1,
    }
    const result = LearningCommandPresentation.assignmentSettlementResult(
      settlement as unknown as LearningCommand.PhysicalSettlement,
      state,
      envelope,
    )
    const projection = SemanticPresentation.projectResultBasis(result.basis)
    expect(projection).toMatchObject({
      capability: Assignment.UPDATE_CAPABILITY,
      title: "Assignment settlement",
      outcome: "already_applied",
      summary: "The exact Assignment command was already settled as no change; no Assignment effect was created.",
      facts: expect.arrayContaining([
        { label: "Existing semantic outcome", value: "no_change" },
        {
          label: "Assignment result 1",
          value: `revise; ${currentRevision.assignmentID} unchanged at ${currentRevision.revisionID} v1`,
        },
      ]),
    })
    if (result.basis.kind !== "assignment_result" || !result.basis.effect) {
      throw new Error("Expected an Assignment no-change result basis")
    }
    const changedResult = {
      outcome: "changed" as const,
      ordinal: 0,
      operation: "revise" as const,
      assignmentID: currentRevision.assignmentID,
      previousRevision: currentRevision,
      committedRevision: { ...currentRevision, version: 2 },
    }
    expect(
      SemanticPresentation.projectResultBasis({
        ...result.basis,
        effect: { ...result.basis.effect, effectID: candidate.effectID },
      }),
    ).toBeUndefined()
    expect(
      SemanticPresentation.projectResultBasis({
        ...result.basis,
        effect: { ...result.basis.effect, changes: [changedResult] },
      }),
    ).toBeUndefined()
    expect(
      SemanticPresentation.projectResultBasis({
        ...result.basis,
        effect: { ...result.basis.effect, intentResults: [changedResult] },
      }),
    ).toBeUndefined()
  })
})

function assignmentCandidate(): Assignment.Candidate {
  const source = "Analyze the semaphore proof by Friday."
  const excerpt = { text: source, startByte: 0, endByte: new TextEncoder().encode(source).byteLength }
  const command = Assignment.canonicalizeCommand({
    cause: {
      type: "interpreted_learner_report",
      excerpt,
    },
    intents: [
      {
        type: "create",
        createOrdinal: 0,
        snapshot: {
          obligationSummary: "Analyze the semaphore proof",
          learningContext: "Teach the invariant before guided work",
          scope: { type: "learner_home" },
          dueBasis: {
            type: "local_date",
            civilDate: "2037-07-03",
            comparator: "inclusive",
            timeZone: { type: "fixed_offset", offsetMinutes: 0 },
          },
        },
      },
    ],
  })
  const causeBasis = {
    type: "learner_occurrence" as const,
    occurrenceID: "lco_assignment_presentation",
    sourceOrder: 1,
    sessionID: envelope.sessionID,
    messageID: envelope.parentUserMessageID,
    turnID: envelope.turnID,
    inputID: envelope.inputID,
    timeAdmitted: 1,
    sourceTemporalContext: { timeZone: "UTC" },
    excerpt: {
      ...excerpt,
      sha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"),
    },
  }
  const intent = command.intents[0]!
  if (intent.type !== "create") throw new Error("Expected the Assignment presentation create intent")
  return {
    kind: "candidate_v1",
    effectID: "ase_00000000000000000000000000" as Assignment.EffectID,
    commandFingerprint: Assignment.commandFingerprint(command),
    semanticAddressFingerprint: "1".repeat(64),
    agentActionFingerprint: "2".repeat(64),
    canonicalCommand: command,
    agentAction: {
      schemaVersion: 1,
      kind: "root",
      occurrenceID: causeBasis.occurrenceID,
      sessionID: envelope.sessionID,
      turnID: envelope.turnID,
      inputID: envelope.inputID,
      assistantMessageID: envelope.assistantMessageID,
      invocationPartID: envelope.partID,
      providerCallID: envelope.providerCallID,
      emissionOrdinal: 0,
      capabilityIdentity: Assignment.UPDATE_CAPABILITY,
      capabilityVersion: Assignment.UPDATE_VERSION,
      lineage: [],
    },
    causeBasis,
    materialized: [
      {
        outcome: "changed",
        ordinal: 0,
        intent,
        assignmentID: "asn_00000000000000000000000000" as Assignment.AssignmentID,
        revisionID: "asr_00000000000000000000000000" as Assignment.RevisionID,
        snapshot: intent.snapshot,
        finalDisposition: "open",
        creationSourceBasis: causeBasis,
        effectiveSourceBasis: causeBasis,
        sourceAdmissionBasis: { type: "learner_occurrence", basis: causeBasis },
        sourceBasisRelation: "corrected_with_new_exact_source",
      },
    ],
  } as unknown as Assignment.Candidate
}

function assignmentReplacementCandidate(): Assignment.Candidate {
  const base = assignmentCandidate()
  const command = Assignment.canonicalizeCommand({
    cause: base.canonicalCommand.cause,
    intents: [
      {
        type: "replace",
        assignmentID: base.materialized[0]!.assignmentID,
        expectedHead: {
          revisionID: base.materialized[0]!.revisionID,
          version: 1,
          ownerCutFingerprint: "3".repeat(64),
        },
        sourceAction: { type: "rebind_current_source_to_cause" },
        rationale: "Problem set 4 replaced the earlier proof obligation.",
        successor: {
          type: "create",
          createOrdinal: 1,
          snapshot: {
            obligationSummary: "Explain the binary-search invariant for problem set 4",
            learningContext: "Teach the invariant before guided proof work",
            scope: { type: "learner_home" },
            dueBasis: {
              type: "local_date",
              civilDate: "2037-07-10",
              comparator: "inclusive",
              timeZone: { type: "fixed_offset", offsetMinutes: 0 },
            },
            expiryBoundary: {
              type: "local_date",
              civilDate: "2037-07-11",
              comparator: "exclusive",
              timeZone: { type: "fixed_offset", offsetMinutes: 0 },
            },
          },
        },
      },
    ],
  })
  const intent = command.intents[0]!
  if (intent.type !== "replace" || intent.successor.type !== "create") {
    throw new Error("Expected the Assignment presentation replacement intent")
  }
  const successor = {
    assignmentID: "asn_11111111111111111111111111" as Assignment.AssignmentID,
    revisionID: "asr_22222222222222222222222222" as Assignment.RevisionID,
    version: 1,
  }
  return {
    ...base,
    commandFingerprint: Assignment.commandFingerprint(command),
    canonicalCommand: command,
    materialized: [
      {
        outcome: "changed",
        ordinal: 0,
        intent,
        assignmentID: base.materialized[0]!.assignmentID,
        revisionID: "asr_11111111111111111111111111" as Assignment.RevisionID,
        successorAssignmentID: successor.assignmentID,
        successorRevisionID: successor.revisionID,
        successorSnapshot: intent.successor.snapshot,
        snapshot: base.materialized[0]!.snapshot,
        finalDisposition: "superseded",
        relationTarget: successor,
        creationSourceBasis: base.materialized[0]!.creationSourceBasis,
        effectiveSourceBasis: base.materialized[0]!.effectiveSourceBasis,
        sourceAdmissionBasis: base.materialized[0]!.sourceAdmissionBasis,
        sourceBasisRelation: "corrected_with_new_exact_source",
      },
    ],
  } as unknown as Assignment.Candidate
}
