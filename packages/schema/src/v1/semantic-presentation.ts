export * as SemanticPresentationV1 from "./semantic-presentation"

import { Schema } from "effect"
import { optional } from "../schema"

const StringValue = Schema.String
const PositiveVersion = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

const LocatorIdentity = Schema.Struct({
  id: StringValue,
  showID: Schema.Boolean,
})

const CourseLocator = Schema.Struct({
  course: Schema.Struct({
    ...LocatorIdentity.fields,
    title: StringValue,
  }),
  view: Schema.Struct({
    ...LocatorIdentity.fields,
    name: StringValue,
  }),
  revision: Schema.Struct({
    ...LocatorIdentity.fields,
    number: PositiveVersion,
  }),
  item: optional(
    Schema.Struct({
      ...LocatorIdentity.fields,
      title: StringValue,
      position: PositiveVersion,
    }),
  ),
})

export const ToolBinding = Schema.Struct({
  sessionID: StringValue,
  messageID: StringValue,
  callID: StringValue,
  partID: optional(StringValue),
  requestID: optional(StringValue),
}).annotate({ identifier: "SemanticToolBindingV1" })
export interface ToolBinding extends Schema.Schema.Type<typeof ToolBinding> {}

const FieldBasis = Schema.Union([
  Schema.Struct({ type: Schema.Literal("authored"), sourceExcerpt: StringValue }),
  Schema.Struct({ type: Schema.Literal("accepted") }),
  Schema.Struct({ type: Schema.Literal("carried"), predecessorRevisionID: StringValue }),
])

const FieldBases = Schema.Struct({
  outcome: FieldBasis,
  conditions: FieldBasis,
  scope: FieldBasis,
  target: FieldBasis,
  disposition: FieldBasis,
})

const GoalTarget = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({
    type: Schema.Literal("instant"),
    instant: Schema.Number,
    sourceExpression: StringValue,
    normalized: StringValue,
    utcOffsetMinutes: Schema.Number,
    normalizationBasis: Schema.Literal("explicit_offset"),
  }),
  Schema.Struct({
    type: Schema.Literal("local_date"),
    date: StringValue,
    timeZone: StringValue,
    sourceExpression: StringValue,
    normalizationBasis: Schema.Literals(["explicit_date", "source_temporal_context"]),
  }),
])

const GoalCourse = Schema.Struct({
  courseID: StringValue,
  courseTitle: StringValue,
  basis: Schema.Union([
    Schema.Struct({ type: Schema.Literal("new"), expectedCourseVersion: PositiveVersion }),
    Schema.Struct({ type: Schema.Literal("carried"), predecessorRevisionID: StringValue }),
  ]),
  availability: Schema.Union([
    Schema.Struct({ state: Schema.Literal("available"), title: StringValue }),
    Schema.Struct({
      state: Schema.Literal("unavailable"),
      cause: Schema.Literals(["course_not_found", "course_withdrawn"]),
      title: optional(StringValue),
    }),
  ]),
})

const GoalScope = Schema.Union([
  Schema.Struct({ type: Schema.Literal("learner_home") }),
  Schema.Struct({ type: Schema.Literal("courses"), courses: Schema.Array(GoalCourse) }),
])

const GoalMeaning = Schema.Struct({
  outcome: StringValue,
  conditions: Schema.Array(StringValue),
  scope: GoalScope,
  target: GoalTarget,
  disposition: Schema.Literals(["active", "achieved", "abandoned", "superseded"]),
  fieldBases: FieldBases,
})

const GoalRevision = Schema.Struct({
  goalID: StringValue,
  revisionID: StringValue,
  version: PositiveVersion,
  meaning: GoalMeaning,
})

const GoalCreateOperation = Schema.Struct({
  type: Schema.Literal("create"),
  resultIntent: Schema.Literal("create_new_goal"),
  meaning: GoalMeaning,
})

const GoalUpdateOperation = Schema.Struct({
  type: Schema.Literal("update"),
  resultIntent: Schema.Literals(["update_existing_goal", "supersede_with_existing_goal"]),
  goalID: StringValue,
  expectedHeadID: StringValue,
  expectedVersion: PositiveVersion,
  source: GoalRevision,
  meaning: GoalMeaning,
  supersessionTarget: optional(GoalRevision),
})

const GoalReplaceOperation = Schema.Struct({
  type: Schema.Literal("replace"),
  resultIntent: Schema.Literals(["supersede_with_existing_goal", "supersede_with_new_goal"]),
  goalID: StringValue,
  expectedHeadID: StringValue,
  expectedVersion: PositiveVersion,
  source: GoalRevision,
  meaning: GoalMeaning,
  replacementTarget: Schema.Union([
    Schema.Struct({
      type: Schema.Literal("existing"),
      goalID: StringValue,
      revisionID: StringValue,
      version: PositiveVersion,
      meaning: GoalMeaning,
    }),
    Schema.Struct({
      type: Schema.Literal("new"),
      meaning: GoalMeaning,
    }),
  ]),
})

export const GoalProposalOperation = Schema.Union([
  GoalCreateOperation,
  GoalUpdateOperation,
  GoalReplaceOperation,
]).annotate({
  discriminator: "type",
  identifier: "SemanticGoalProposalOperationV1",
})
export type GoalProposalOperation = Schema.Schema.Type<typeof GoalProposalOperation>

export const GoalResultOperation = Schema.Struct({
  ordinal: PositiveVersion,
  operation: Schema.Literals(["create", "update", "replace"]),
  result: Schema.Literals(["changed", "no_change"]),
  goalID: StringValue,
  revisionID: StringValue,
  version: PositiveVersion,
  meaning: GoalMeaning,
  supersessionTarget: optional(
    Schema.Struct({
      goalID: StringValue,
      revisionID: StringValue,
      version: PositiveVersion,
      meaning: GoalMeaning,
    }),
  ),
  replacementTarget: optional(
    Schema.Struct({
      type: Schema.Literals(["existing", "new"]),
      goalID: StringValue,
      revisionID: StringValue,
      version: PositiveVersion,
      meaning: GoalMeaning,
    }),
  ),
})
export interface GoalResultOperation extends Schema.Schema.Type<typeof GoalResultOperation> {}

const GoalV2Meaning = Schema.Struct({
  outcome: StringValue,
  conditions: Schema.Array(StringValue),
  scope: Schema.Union([
    Schema.Struct({ type: Schema.Literal("learner_home") }),
    Schema.Struct({ type: Schema.Literal("courses"), courseIDs: Schema.Array(StringValue) }),
  ]),
  target: StringValue,
  disposition: Schema.Literals(["active", "achieved", "abandoned", "superseded"]),
})

const GoalV2Revision = Schema.Struct({
  schemaVersion: Schema.Literals([1, 2]),
  goalID: StringValue,
  revisionID: StringValue,
  version: PositiveVersion,
  meaning: GoalV2Meaning,
})

const GoalV2MaterializedOperation = Schema.Struct({
  ordinal: PositiveVersion,
  operation: Schema.Literals(["create", "update", "replace"]),
  result: Schema.Literals(["changed", "no_change"]),
  before: optional(GoalV2Revision),
  after: GoalV2Revision,
  replacementTarget: optional(
    Schema.Struct({
      type: Schema.Literals(["existing", "new"]),
      before: optional(GoalV2Revision),
      after: GoalV2Revision,
    }),
  ),
})

const GoalV2ResultOperation = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  ordinal: PositiveVersion,
  operation: Schema.Literals(["create", "update", "replace"]),
  result: Schema.Literals(["changed", "no_change"]),
  goalID: StringValue,
  revisionID: StringValue,
  version: PositiveVersion,
  meaning: GoalV2Meaning,
  replacementTarget: optional(
    Schema.Struct({
      type: Schema.Literals(["existing", "new"]),
      goalID: StringValue,
      revisionID: StringValue,
      version: PositiveVersion,
    }),
  ),
})

const GoalBasis = Schema.Struct({
  authorizationBasis: Schema.Literals(["learner_request", "learner_acceptance"]),
  semanticFingerprint: StringValue,
  operations: Schema.Array(GoalProposalOperation),
  confirmation: optional(
    Schema.Struct({
      schemaVersion: Schema.Literal(1),
      permissionRequestID: StringValue,
      goalBases: Schema.Array(
        Schema.Struct({
          goalID: StringValue,
          revisionID: StringValue,
          version: PositiveVersion,
          outcome: StringValue,
          disposition: Schema.Literals(["active", "achieved", "abandoned", "superseded"]),
        }),
      ),
      courseBases: Schema.Array(
        Schema.Struct({
          operationOrdinal: PositiveVersion,
          revisionRole: Schema.Literals(["source", "target"]),
          courseID: StringValue,
          courseTitle: StringValue,
          admission: Schema.Union([
            Schema.Struct({
              type: Schema.Literal("new"),
              courseVersion: PositiveVersion,
              courseTimeUpdated: PositiveVersion,
            }),
            Schema.Struct({ type: Schema.Literal("carried"), predecessorRevisionID: StringValue }),
          ]),
          availability: Schema.Union([
            Schema.Struct({
              state: Schema.Literal("available"),
              title: StringValue,
              courseVersion: PositiveVersion,
              courseTimeUpdated: PositiveVersion,
            }),
            Schema.Struct({
              state: Schema.Literal("unavailable"),
              cause: Schema.Literal("course_not_found"),
            }),
            Schema.Struct({
              state: Schema.Literal("unavailable"),
              cause: Schema.Literal("course_withdrawn"),
              title: StringValue,
              courseVersion: PositiveVersion,
              courseTimeUpdated: PositiveVersion,
            }),
          ]),
        }),
      ),
    }),
  ),
})

const ProposalBinding = { binding: ToolBinding }

const AcceptCourseProposal = Schema.Struct({
  kind: Schema.Literal("accept_course_view_revision"),
  ...ProposalBinding,
  courseID: StringValue,
  revisionID: StringValue,
  locator: CourseLocator,
  expectedCourseVersion: PositiveVersion,
  expectedSelectionRevisionID: optional(StringValue),
  expectedSelectionVersion: PositiveVersion,
  expectedViewVersion: PositiveVersion,
  expectedRevisionVersion: PositiveVersion,
})

const RepresentationProposal = Schema.Struct({
  kind: Schema.Literal("representation_convert"),
  ...ProposalBinding,
  effectiveArtifactID: StringValue,
  sourceRevisionID: StringValue,
  producerKind: StringValue,
})

const ContentMutationProposal = Schema.Struct({
  kind: Schema.Literal("content_mutation"),
  ...ProposalBinding,
  operation: Schema.Literals(["create", "modify"]),
  anchorPath: StringValue,
  relativePath: StringValue,
  lifetime: Schema.Literal("this physical tool invocation"),
  rights: Schema.Array(Schema.Literals(["create", "modify"])),
  warning: Schema.Literal(
    "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
  ),
})

const DefaultTarget = Schema.Struct({
  courseID: StringValue,
  courseTitle: StringValue,
  courseVersion: PositiveVersion,
  selectionRevisionID: Schema.NullOr(StringValue),
  selectionVersion: PositiveVersion,
  viewID: Schema.NullOr(StringValue),
  viewName: Schema.NullOr(StringValue),
  viewVersion: Schema.NullOr(PositiveVersion),
  revisionVersion: Schema.NullOr(PositiveVersion),
})

const DefaultWorkingSelection = Schema.Struct({
  revisionID: Schema.NullOr(StringValue),
  selectionVersion: PositiveVersion,
  viewID: Schema.NullOr(StringValue),
  viewName: Schema.NullOr(StringValue),
  viewVersion: Schema.NullOr(PositiveVersion),
  revisionVersion: Schema.NullOr(PositiveVersion),
}).check(
  Schema.makeFilter((selection) => {
    if (
      selection.revisionID === null &&
      selection.viewID === null &&
      selection.viewName === null &&
      selection.viewVersion === null &&
      selection.revisionVersion === null
    ) {
      return undefined
    }
    if (
      selection.revisionID !== null &&
      selection.viewID !== null &&
      selection.viewName !== null &&
      selection.viewVersion !== null &&
      selection.revisionVersion !== null
    ) {
      return undefined
    }
    return "Default-Course working-selection identity must be wholly absent or wholly recorded"
  }),
)

const DefaultLocatedStringV1 = Schema.Union([
  Schema.Struct({ availability: Schema.Literal("recorded_v1"), value: StringValue }),
  Schema.Struct({ availability: Schema.Literal("not_recorded_v1") }),
])

const DefaultLocatedVersionV1 = Schema.Union([
  Schema.Struct({ availability: Schema.Literal("recorded_v1"), value: PositiveVersion }),
  Schema.Struct({ availability: Schema.Literal("not_recorded_v1") }),
])

const DefaultLocatedWorkingSelectionV1 = Schema.Union([
  Schema.Struct({
    availability: Schema.Literal("recorded_v1"),
    value: DefaultWorkingSelection,
  }),
  Schema.Struct({ availability: Schema.Literal("not_recorded_v1") }),
])

const DefaultStableLocatorV1 = Schema.Struct({
  courseID: StringValue,
  title: DefaultLocatedStringV1,
  courseVersion: DefaultLocatedVersionV1,
  workingSelection: DefaultLocatedWorkingSelectionV1,
})

const DefaultEndpointV1 = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("absent") }),
  Schema.Struct({ kind: Schema.Literal("course"), locator: DefaultStableLocatorV1 }),
])

const DefaultStableLocatorV2 = Schema.Struct({
  courseID: StringValue,
  title: Schema.Struct({ availability: Schema.Literal("recorded_v2"), value: StringValue }),
  courseVersion: Schema.Struct({ availability: Schema.Literal("recorded_v2"), value: PositiveVersion }),
  workingSelection: Schema.Struct({
    availability: Schema.Literal("recorded_v2"),
    value: DefaultWorkingSelection,
  }),
})

const DefaultEndpointV2 = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("absent") }),
  Schema.Struct({ kind: Schema.Literal("course"), locator: DefaultStableLocatorV2 }),
])

const DefaultResolutionScope = Schema.Struct({
  coverage: Schema.Literals(["complete", "explicitly_truncated"]),
  candidates: Schema.Array(
    Schema.Struct({ courseID: StringValue, title: StringValue, courseVersion: PositiveVersion }),
  ),
  selectedCourseID: Schema.NullOr(StringValue),
  truncation: optional(
    Schema.Struct({
      reason: StringValue,
      omittedCount: optional(PositiveVersion),
    }),
  ),
})

const DefaultDirectAuthorizationSource = Schema.Struct({
  kind: Schema.Literal("direct_request_v2"),
  occurrenceID: StringValue,
  excerpt: StringValue,
})

const DefaultAcceptedAuthorizationSource = Schema.Struct({
  kind: Schema.Literal("accepted_proposal_v2"),
  occurrenceID: StringValue,
  excerpt: StringValue,
  proposalPartID: StringValue,
  proposalPresentationPartID: StringValue,
  proposalPresentationAssistantMessageID: StringValue,
  proposalAssistantMessageID: StringValue,
  proposalEmissionOrdinal: PositiveVersion,
  proposalFingerprint: StringValue,
  selection: Schema.Literals(["sole_presented", "explicit_reference"]),
})

const DefaultV2Command = Schema.Struct({
  kind: Schema.Literal("default_course_preference"),
  expectedHeadID: Schema.NullOr(StringValue),
  expectedVersion: PositiveVersion,
  target: Schema.NullOr(
    Schema.Struct({
      courseID: StringValue,
      courseVersion: PositiveVersion,
      selectionRevisionID: Schema.NullOr(StringValue),
      selectionVersion: PositiveVersion,
      viewID: Schema.NullOr(StringValue),
      viewVersion: Schema.NullOr(PositiveVersion),
      revisionVersion: Schema.NullOr(PositiveVersion),
    }),
  ),
})

const DefaultV3Command = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("set"),
    courseID: StringValue,
  }),
  Schema.Struct({
    action: Schema.Literal("clear"),
  }),
])

const DefaultV2Authorization = Schema.Struct({
  kind: Schema.Literals(["direct_request_v2", "accepted_proposal_v2"]),
  fingerprint: StringValue,
  command: DefaultV2Command,
  commandFingerprint: StringValue,
  source: Schema.Union([DefaultDirectAuthorizationSource, DefaultAcceptedAuthorizationSource]),
  resolutionScope: DefaultResolutionScope,
  resolutionFingerprint: StringValue,
  preferenceHeadID: Schema.NullOr(StringValue),
  preferenceVersion: PositiveVersion,
  operation: Schema.Literals(["set", "change", "clear"]),
  from: DefaultEndpointV2,
  to: DefaultEndpointV2,
})

const DefaultV2ResultDisposition = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("candidate_v2"),
    authorization: DefaultV2Authorization,
  }),
  Schema.Struct({
    kind: Schema.Literal("semantic_terminal_v2"),
    outcome: Schema.Literals(["already_applied", "semantic_conflict"]),
    command: DefaultV2Command,
    commandFingerprint: StringValue,
    semanticAddress: Schema.Struct({
      occurrenceID: StringValue,
      slot: Schema.Literal("default_course_preference"),
    }),
    semanticAddressFingerprint: StringValue,
    incomingPayloadFingerprint: StringValue,
    existingEffectID: StringValue,
    existingPayloadFingerprint: StringValue,
  }),
])

const DefaultAgentActionLineageEdge = Schema.Struct({
  childTurnID: StringValue,
  childSessionID: StringValue,
  childDepth: PositiveVersion,
  parentTurnID: StringValue,
  parentSessionID: StringValue,
  parentDepth: PositiveVersion,
  parentTaskPartID: StringValue,
  parentModelMessageID: StringValue,
  delegatedCapability: Schema.Record(Schema.String, Schema.Unknown),
  delegatedCapabilityFingerprint: StringValue,
})

const DefaultAgentActionProvenanceCommon = {
  schemaVersion: Schema.Literal(1),
  occurrenceID: StringValue,
  causalRootOccurrenceID: StringValue,
  sessionID: StringValue,
  turnID: StringValue,
  inputID: StringValue,
  assistantMessageID: StringValue,
  invocationPartID: StringValue,
  providerCallID: StringValue,
  emissionOrdinal: PositiveVersion,
  capabilityIdentity: Schema.Literal("set_default_course_preference"),
  capabilityVersion: Schema.Literal(3),
}

const DefaultAgentActionProvenance = Schema.Union([
  Schema.Struct({
    ...DefaultAgentActionProvenanceCommon,
    kind: Schema.Literal("root"),
    lineage: Schema.Tuple([]),
  }),
  Schema.Struct({
    ...DefaultAgentActionProvenanceCommon,
    kind: Schema.Literal("delegated"),
    lineage: Schema.Array(DefaultAgentActionLineageEdge),
    effectiveDelegatedCapability: Schema.Struct({
      identity: Schema.Literal("set_default_course_preference"),
      version: Schema.Literal(3),
      projectionVersion: Schema.Literal(2),
      fingerprint: StringValue,
    }),
  }),
])

const DefaultV3AgentAction = Schema.Struct({
  kind: Schema.Literal("agent_action_v3"),
  fingerprint: StringValue,
  provenance: DefaultAgentActionProvenance,
  command: DefaultV3Command,
  commandFingerprint: StringValue,
  preferenceHeadID: Schema.NullOr(StringValue),
  preferenceVersion: PositiveVersion,
  operation: Schema.Literals(["set", "change", "clear"]),
  from: DefaultEndpointV2,
  to: DefaultEndpointV2,
})

const DefaultV3ResultDisposition = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("agent_action_v3"),
    agentAction: DefaultV3AgentAction,
  }),
  Schema.Struct({
    kind: Schema.Literal("semantic_terminal_v3"),
    outcome: Schema.Literals(["already_applied", "semantic_conflict"]),
    command: DefaultV3Command,
    commandFingerprint: StringValue,
    semanticAddress: Schema.Struct({
      occurrenceID: StringValue,
      slot: Schema.Literal("default_course_preference"),
    }),
    semanticAddressFingerprint: StringValue,
    incomingPayloadFingerprint: StringValue,
    existingEffectID: StringValue,
    existingPayloadFingerprint: StringValue,
  }),
])

const DefaultConfirmationProposal = Schema.Struct({
  kind: Schema.Literal("default_course_confirmation"),
  ...ProposalBinding,
  headID: Schema.NullOr(StringValue),
  version: PositiveVersion,
  fromCourseID: Schema.NullOr(StringValue),
  fromCourseTitle: Schema.NullOr(StringValue),
  target: Schema.NullOr(DefaultTarget),
})

const DefaultCommandProposal = Schema.Struct({
  kind: Schema.Literal("default_course_command"),
  ...ProposalBinding,
  expectedHeadID: Schema.NullOr(StringValue),
  expectedVersion: PositiveVersion,
  noChange: Schema.Boolean,
  target: Schema.NullOr(
    Schema.Struct({
      courseID: StringValue,
      courseVersion: PositiveVersion,
      selectionRevisionID: Schema.NullOr(StringValue),
      selectionVersion: PositiveVersion,
      viewID: Schema.NullOr(StringValue),
      viewVersion: Schema.NullOr(PositiveVersion),
      revisionVersion: Schema.NullOr(PositiveVersion),
    }),
  ),
})

const DefaultV2CapabilityProposal = Schema.Struct({
  kind: Schema.Literal("default_course_v2_capability"),
  ...ProposalBinding,
  authorization: DefaultV2Authorization,
})

const DefaultV3CapabilityProposal = Schema.Struct({
  kind: Schema.Literal("default_course_v3_capability"),
  ...ProposalBinding,
  agentAction: DefaultV3AgentAction,
})

const RouteAnchorProposal = Schema.Struct({
  kind: Schema.Literal("course_route_anchor"),
  ...ProposalBinding,
  courseID: StringValue,
  expectedHeadID: Schema.NullOr(StringValue),
  expectedVersion: PositiveVersion,
  noChange: Schema.Boolean,
  locator: optional(CourseLocator),
  target: Schema.NullOr(
    Schema.Struct({
      viewID: StringValue,
      revisionID: StringValue,
      itemID: StringValue,
      courseVersion: PositiveVersion,
      selectionVersion: PositiveVersion,
      viewVersion: PositiveVersion,
      revisionVersion: PositiveVersion,
    }),
  ),
})

const RetainedSteeringProposal = Schema.Struct({
  kind: Schema.Literal("retained_learning_steering"),
  ...ProposalBinding,
  action: Schema.Literals(["create", "replace", "retract"]),
  sourceExcerpt: StringValue,
  operativeInstruction: optional(StringValue),
  learnerReason: optional(StringValue),
  validUntil: optional(StringValue),
  policyID: optional(StringValue),
  expectedHeadID: optional(StringValue),
  expectedVersion: optional(PositiveVersion),
})

const LearnerGoalProposal = Schema.Struct({
  kind: Schema.Literal("learner_goals"),
  ...ProposalBinding,
  ...GoalBasis.fields,
})

const LearnerGoalV2CapabilityProposal = Schema.Struct({
  kind: Schema.Literal("learner_goals_v2_capability"),
  ...ProposalBinding,
  commandFingerprint: StringValue,
  issuance: Schema.Literals(["root", "delegated"]),
  operations: Schema.Array(GoalV2MaterializedOperation),
})

export const ProposalBasis = Schema.Union([
  AcceptCourseProposal,
  RepresentationProposal,
  ContentMutationProposal,
  DefaultConfirmationProposal,
  DefaultCommandProposal,
  DefaultV2CapabilityProposal,
  DefaultV3CapabilityProposal,
  RouteAnchorProposal,
  RetainedSteeringProposal,
  LearnerGoalProposal,
  LearnerGoalV2CapabilityProposal,
]).annotate({
  discriminator: "kind",
  identifier: "SemanticProposalBasisV1",
})
export type ProposalBasis = Schema.Schema.Type<typeof ProposalBasis>

const Settlement = Schema.Union([
  Schema.Struct({ outcome: Schema.Literal("applied") }),
  Schema.Struct({ outcome: Schema.Literal("already_applied") }),
  Schema.Struct({ outcome: Schema.Literal("no_change") }),
  Schema.Struct({ outcome: Schema.Literal("error"), code: StringValue }),
])

const ResultCommon = {
  binding: ToolBinding,
  settlement: Settlement,
}

const CourseResult = Schema.Struct({
  kind: Schema.Literal("accept_course_view_revision_result"),
  ...ResultCommon,
  courseID: optional(StringValue),
  revisionID: optional(StringValue),
  locator: optional(CourseLocator),
  previousSelection: optional(Schema.Struct({ revisionID: optional(StringValue), version: PositiveVersion })),
  committedSelection: optional(Schema.Struct({ revisionID: optional(StringValue), version: PositiveVersion })),
  currentSelection: optional(Schema.Struct({ revisionID: optional(StringValue), version: PositiveVersion })),
  relation: optional(Schema.Literals(["active", "superseded"])),
})

const RepresentationResult = Schema.Struct({
  kind: Schema.Literal("representation_convert_result"),
  ...ResultCommon,
  effectiveArtifactID: optional(StringValue),
  sourceRevisionID: optional(StringValue),
  representationRevisionID: optional(StringValue),
  producerKind: optional(StringValue),
})

const DefaultCourseResult = Schema.Struct({
  kind: Schema.Literal("default_course_result"),
  ...ResultCommon,
  current: optional(
    Schema.Struct({
      version: PositiveVersion,
      courseID: Schema.NullOr(StringValue),
      status: Schema.Literals(["absent", "available", "course_not_found", "course_withdrawn"]),
      title: optional(StringValue),
    }),
  ),
  relation: optional(Schema.Literals(["active", "superseded"])),
})

const DefaultCourseV2Result = Schema.Struct({
  kind: Schema.Literal("default_course_v2_result"),
  ...ResultCommon,
  disposition: DefaultV2ResultDisposition,
  acknowledgement: optional(
    Schema.Union([
      Schema.Struct({
        schemaVersion: Schema.Literal(1),
        invocationPartID: StringValue,
        effectAuthorizationPartID: StringValue,
        authorizationVersion: Schema.Literal(1),
        effectID: StringValue,
        receiptID: StringValue,
        operation: Schema.Literals(["set", "change", "clear"]),
        from: DefaultEndpointV1,
        to: DefaultEndpointV1,
        relation: Schema.Literals(["active", "superseded"]),
        timeCommitted: PositiveVersion,
        commitOrder: PositiveVersion,
      }),
      Schema.Struct({
        schemaVersion: Schema.Literal(1),
        invocationPartID: StringValue,
        effectAuthorizationPartID: StringValue,
        authorizationVersion: Schema.Literal(2),
        effectID: StringValue,
        receiptID: StringValue,
        operation: Schema.Literals(["set", "change", "clear"]),
        from: DefaultEndpointV2,
        to: DefaultEndpointV2,
        relation: Schema.Literals(["active", "superseded"]),
        timeCommitted: PositiveVersion,
        commitOrder: PositiveVersion,
      }),
    ]),
  ),
})

const DefaultCourseV3Result = Schema.Struct({
  kind: Schema.Literal("default_course_v3_result"),
  ...ResultCommon,
  disposition: DefaultV3ResultDisposition,
  acknowledgement: optional(
    Schema.Union([
      Schema.Struct({
        schemaVersion: Schema.Literal(1),
        invocationPartID: StringValue,
        effectAuthorizationPartID: StringValue,
        authorizationVersion: Schema.Literal(1),
        effectID: StringValue,
        receiptID: StringValue,
        operation: Schema.Literals(["set", "change", "clear"]),
        from: DefaultEndpointV1,
        to: DefaultEndpointV1,
        relation: Schema.Literals(["active", "superseded"]),
        timeCommitted: PositiveVersion,
        commitOrder: PositiveVersion,
      }),
      Schema.Struct({
        schemaVersion: Schema.Literal(1),
        invocationPartID: StringValue,
        effectAuthorizationPartID: StringValue,
        authorizationVersion: Schema.Literal(2),
        effectID: StringValue,
        receiptID: StringValue,
        operation: Schema.Literals(["set", "change", "clear"]),
        from: DefaultEndpointV2,
        to: DefaultEndpointV2,
        relation: Schema.Literals(["active", "superseded"]),
        timeCommitted: PositiveVersion,
        commitOrder: PositiveVersion,
      }),
      Schema.Struct({
        schemaVersion: Schema.Literal(2),
        invocationPartID: StringValue,
        effectAgentActionPartID: StringValue,
        agentActionVersion: Schema.Literal(3),
        effectID: StringValue,
        receiptID: StringValue,
        operation: Schema.Literals(["set", "change", "clear"]),
        from: DefaultEndpointV2,
        to: DefaultEndpointV2,
        relation: Schema.Literals(["active", "superseded"]),
        timeCommitted: PositiveVersion,
        commitOrder: PositiveVersion,
      }),
    ]),
  ),
})

const RouteAnchorResult = Schema.Struct({
  kind: Schema.Literal("course_route_anchor_result"),
  ...ResultCommon,
  effect: optional(
    Schema.Struct({
      courseID: StringValue,
      version: PositiveVersion,
      target: Schema.Literals(["absent", "present"]),
      locator: optional(CourseLocator),
    }),
  ),
  current: optional(
    Schema.Struct({
      courseID: StringValue,
      version: PositiveVersion,
      target: Schema.Literals(["absent", "available", "stale"]),
      staleCause: optional(StringValue),
      locator: optional(CourseLocator),
    }),
  ),
  relation: optional(Schema.Literals(["active", "superseded"])),
})

const RetainedTransitionResult = Schema.Struct({
  state: Schema.Literals(["operative", "retracted"]),
  status: Schema.Literals(["operative_active", "operative_expired", "retracted"]),
  version: PositiveVersion,
  operativeInstruction: optional(StringValue),
  validUntilNormalized: optional(StringValue),
  boundaryTimeZone: optional(StringValue),
  boundaryUtcOffsetMinutes: optional(Schema.Number.check(Schema.isInt())),
})

const RetainedSteeringResult = Schema.Struct({
  kind: Schema.Literal("retained_learning_steering_result"),
  ...ResultCommon,
  action: optional(Schema.Literals(["create", "replace", "retract"])),
  scope: optional(Schema.Literal("learning_wide")),
  effect: optional(RetainedTransitionResult),
  previous: optional(RetainedTransitionResult),
  current: optional(RetainedTransitionResult),
  relation: optional(Schema.Literals(["active", "superseded"])),
})

const LearnerGoalResult = Schema.Struct({
  kind: Schema.Literal("learner_goals_result"),
  ...ResultCommon,
  authorizationBasis: optional(Schema.Literals(["learner_request", "learner_acceptance"])),
  operations: Schema.Array(GoalResultOperation),
})

const LearnerGoalV2Result = Schema.Struct({
  kind: Schema.Literal("learner_goals_v2_result"),
  ...ResultCommon,
  disposition: Schema.Literals(["semantic_terminal_v2", "candidate_v2", "physical_no_effect"]),
  semanticOutcome: optional(Schema.Literals(["already_applied", "semantic_conflict"])),
  issuance: optional(Schema.Literals(["root", "delegated"])),
  capabilityOutcome: optional(
    Schema.Literals([
      "not_evaluated",
      "policy_allow",
      "policy_deny",
      "prompted_abort",
      "prompted_allow",
      "prompted_deny",
      "prompted_correct",
      "prompted_cancel",
    ]),
  ),
  permissionRequestID: optional(StringValue),
  operations: Schema.Array(GoalV2ResultOperation),
})

const ContentWriteResult = Schema.Struct({
  kind: Schema.Literal("content_write_result"),
  ...ResultCommon,
  operation: Schema.Literals(["create", "modify"]),
  anchorPath: StringValue,
  relativePath: StringValue,
  byteLength: PositiveVersion,
  authority: Schema.Union([
    Schema.Struct({
      type: Schema.Literal("mutation_grant"),
      grantID: StringValue,
      grantVersion: PositiveVersion,
    }),
    Schema.Struct({ type: Schema.Literal("one_shot") }),
  ]),
})

export const ResultBasis = Schema.Union([
  CourseResult,
  RepresentationResult,
  DefaultCourseResult,
  DefaultCourseV2Result,
  DefaultCourseV3Result,
  RouteAnchorResult,
  RetainedSteeringResult,
  LearnerGoalResult,
  LearnerGoalV2Result,
  ContentWriteResult,
]).annotate({
  discriminator: "kind",
  identifier: "SemanticResultBasisV1",
})
export type ResultBasis = Schema.Schema.Type<typeof ResultBasis>

export const Proposal = Schema.Struct({
  version: Schema.Literal(1),
  phase: Schema.Literal("proposal"),
  basis: ProposalBasis,
}).annotate({ identifier: "SemanticPermissionProposalV1" })
export interface Proposal extends Schema.Schema.Type<typeof Proposal> {}

export const Result = Schema.Struct({
  version: Schema.Literal(1),
  phase: Schema.Literal("result"),
  basis: ResultBasis,
}).annotate({ identifier: "SemanticSettlementResultV1" })
export interface Result extends Schema.Schema.Type<typeof Result> {}

export const Presentation = Schema.Union([Proposal, Result]).annotate({
  discriminator: "phase",
  identifier: "SemanticPresentationV1",
})
export type Presentation = Proposal | Result
