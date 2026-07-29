import { describe, expect, test } from "bun:test"
import type { Course } from "@opencode-ai/core/course"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import type { DefaultCourseV2Authorization } from "@opencode-ai/core/learner-navigation/default-course-v2"
import type { DefaultCourseAcknowledgement, DefaultCourseProposal } from "@opencode-ai/core/learner-navigation/schema"
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
          commandVersion: LearningCommand.UPDATE_LEARNER_GOALS_VERSION,
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
    } as unknown as DefaultCourseAcknowledgement
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
    } as unknown as DefaultCourseAcknowledgement
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
})
