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

const BootstrapText = Schema.String.check(Schema.isMaxLength(8 * 1024))
const BootstrapPath = Schema.String.check(Schema.isMaxLength(4 * 1024))
const BootstrapKey = Schema.String.check(Schema.isMaxLength(256))
const BootstrapID = Schema.String.check(Schema.isMaxLength(8 * 1024))
const BootstrapCourseRevisionTransitionLimit = 1_024
const BootstrapAuthorship = Schema.Literals(["learner_supplied", "learner_requested", "tutor_initiated"])
const BootstrapCoordinateEndpoint = Schema.Struct({
  page: PositiveVersion,
  item: PositiveVersion,
  scalar: PositiveVersion,
})
const BootstrapCoordinate = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("whole_target.v1") }),
  Schema.Struct({
    kind: Schema.Literal("artifact_byte_range.v1"),
    startByte: PositiveVersion,
    endByte: PositiveVersion,
  }),
  Schema.Struct({
    kind: Schema.Literal("pdf_page_range.v1"),
    startPage: PositiveVersion,
    endPage: PositiveVersion,
  }),
  Schema.Struct({
    kind: Schema.Literal("pdf_text_range.v1"),
    start: BootstrapCoordinateEndpoint,
    end: BootstrapCoordinateEndpoint,
  }),
  Schema.Struct({
    kind: Schema.Literal("model_text_range.v1"),
    startScalar: PositiveVersion,
    endScalar: PositiveVersion,
  }),
])
const BootstrapLocalAuthority = Schema.Union([
  Schema.Struct({ type: Schema.Literal("content_root"), contentRootID: BootstrapID }),
  Schema.Struct({ type: Schema.Literal("active_workspace") }),
  Schema.Struct({ type: Schema.Literal("one_operation") }),
])
const BootstrapLocalRead = Schema.Struct({ path: BootstrapPath, authority: BootstrapLocalAuthority })
const BootstrapRevision = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      key: BootstrapKey,
      title: BootstrapText,
      parentKey: optional(BootstrapKey),
      reuse: optional(Schema.Struct({ sourceRevisionID: BootstrapID, itemID: BootstrapID })),
    }),
  ).check(Schema.isMaxLength(500)),
  mappings: optional(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["preserve", "split", "merge"]),
        sourceItemIDs: Schema.Array(BootstrapID).check(
          Schema.isMaxLength(BootstrapCourseRevisionTransitionLimit),
        ),
        targetKeys: Schema.Array(BootstrapKey).check(
          Schema.isMaxLength(BootstrapCourseRevisionTransitionLimit),
        ),
      }),
    ).check(Schema.isMaxLength(BootstrapCourseRevisionTransitionLimit)),
  ),
})
const BootstrapRoute = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(["new_view", "distinct_view"]),
    key: BootstrapKey,
    name: BootstrapText,
    authorship: BootstrapAuthorship,
    revision: BootstrapRevision,
  }),
  Schema.Struct({
    type: Schema.Literal("successor_revision"),
    key: BootstrapKey,
    viewID: BootstrapID,
    predecessorRevisionID: BootstrapID,
    authorship: BootstrapAuthorship,
    revision: BootstrapRevision,
  }),
])
const BootstrapSelection = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["preserve", "clear"]) }),
  Schema.Struct({
    type: Schema.Literal("set"),
    target: Schema.Union([
      Schema.Struct({ type: Schema.Literal("route") }),
      Schema.Struct({ type: Schema.Literal("existing"), revisionID: BootstrapID }),
    ]),
  }),
])
const BootstrapMaterial = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("artifact"),
    key: BootstrapKey,
    artifactID: BootstrapID,
    revisionID: BootstrapID,
    attribution: Schema.Union([
      Schema.Struct({ type: Schema.Literal("recorded") }),
      Schema.Struct({ type: Schema.Literal("lineage_correction"), memberID: BootstrapID }),
    ]),
    read: optional(BootstrapLocalRead),
  }),
  Schema.Struct({
    type: Schema.Literal("representation"),
    key: BootstrapKey,
    representationRevisionID: BootstrapID,
  }),
  Schema.Struct({ type: Schema.Literal("local"), key: BootstrapKey, ...BootstrapLocalRead.fields }),
])
const BootstrapMap = Schema.Struct({
  key: BootstrapKey,
  materialKey: BootstrapKey,
  authorship: BootstrapAuthorship,
  supersedesMapID: optional(BootstrapID),
  outline: Schema.Array(
    Schema.Struct({
      key: BootstrapKey,
      parentKey: optional(BootstrapKey),
      title: BootstrapText,
      selectors: Schema.Array(Schema.Struct({ key: BootstrapKey, coordinate: BootstrapCoordinate })).check(
        Schema.isMaxLength(2_000),
      ),
    }),
  ).check(Schema.isMaxLength(500)),
})
const BootstrapAlignmentCourse = Schema.Union([
  Schema.Struct({ type: Schema.Literal("route_item"), itemKey: BootstrapKey }),
  Schema.Struct({
    type: Schema.Literal("existing"),
    viewID: BootstrapID,
    revisionID: BootstrapID,
    itemID: BootstrapID,
    selection: Schema.Literals(["explicit_exact", "observed_working"]),
  }),
])
const BootstrapAlignment = Schema.Struct({
  key: BootstrapKey,
  mapKey: BootstrapKey,
  selectorKey: BootstrapKey,
  authorship: BootstrapAuthorship,
  course: BootstrapAlignmentCourse,
  reason: BootstrapText,
  supersedesAlignmentID: optional(BootstrapID),
})
const BootstrapAnchor = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["preserve", "clear"]) }),
  Schema.Struct({
    type: Schema.Literal("set"),
    target: Schema.Union([
      Schema.Struct({ type: Schema.Literal("route_item"), itemKey: BootstrapKey }),
      Schema.Struct({
        type: Schema.Literal("existing"),
        viewID: BootstrapID,
        revisionID: BootstrapID,
        itemID: BootstrapID,
      }),
    ]),
  }),
])
const LearningBootstrapScope = Schema.Struct({
  command: Schema.Struct({
    schemaVersion: Schema.Literal(1),
    course: Schema.Union([
      Schema.Struct({ type: Schema.Literal("new"), title: BootstrapText }),
      Schema.Struct({ type: Schema.Literal("existing"), courseID: BootstrapID, title: optional(BootstrapText) }),
    ]),
    route: optional(BootstrapRoute),
    selection: BootstrapSelection,
    materials: Schema.Array(BootstrapMaterial).check(Schema.isMaxLength(32)),
    maps: Schema.Array(BootstrapMap).check(Schema.isMaxLength(16)),
    alignments: Schema.Array(BootstrapAlignment).check(Schema.isMaxLength(64)),
    anchor: BootstrapAnchor,
  }),
})

const LearningBootstrapCapabilityProposal = Schema.Struct({
  kind: Schema.Literal("learning_bootstrap_capability"),
  ...ProposalBinding,
  commandFingerprint: StringValue,
  issuance: Schema.Literals(["root", "delegated"]),
  scope: LearningBootstrapScope,
})

const LearnerResponseEvidenceAssessment = {
  relation: Schema.Literals(["supports", "does_not_support"]),
  exposure: Schema.Literals([
    "learner_response_before_tutor_disclosure",
    "tutor_disclosure_before_learner_response",
  ]),
}
const LearnerResponseEvidenceTarget = Schema.Struct({
  mapID: StringValue,
  selectorID: StringValue,
  courseID: StringValue,
  viewID: StringValue,
  revisionID: StringValue,
  itemID: StringValue,
})
const LearnerResponseEvidenceTargetSnapshot = Schema.Struct({
  ...LearnerResponseEvidenceTarget.fields,
  alignmentID: StringValue,
  alignmentDispositionVersion: PositiveVersion,
  mapDispositionVersion: PositiveVersion,
  courseVersion: PositiveVersion,
  viewVersion: PositiveVersion,
  revisionVersion: PositiveVersion,
})
const LearnerResponseEvidenceSubject = Schema.Struct({
  occurrenceID: StringValue,
  sourceOrder: PositiveVersion,
  sessionID: StringValue,
  messageID: StringValue,
  turnID: StringValue,
  inputID: StringValue,
  timeAdmitted: PositiveVersion,
})
const LearnerResponseEvidenceCommand = Schema.Union([
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    operation: Schema.Literal("create"),
    ...LearnerResponseEvidenceAssessment,
    conditionAssistantMessageID: StringValue,
    target: LearnerResponseEvidenceTarget,
    alignmentID: StringValue,
  }),
  Schema.Struct({
    schemaVersion: Schema.Literals([1]),
    operation: Schema.Literals(["revise_from_tutor_interpretation", "revise_from_learner_report"]),
    recordID: StringValue,
    expectedVersion: PositiveVersion,
    ...LearnerResponseEvidenceAssessment,
  }),
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    operation: Schema.Literal("retract"),
    recordID: StringValue,
    expectedVersion: PositiveVersion,
  }),
])
const LearnerResponseEvidenceScope = Schema.Struct({
  command: LearnerResponseEvidenceCommand,
  subject: LearnerResponseEvidenceSubject,
  target: LearnerResponseEvidenceTargetSnapshot,
  assessmentScope: Schema.Literal("entire_exact_selector"),
  programBasis: Schema.Literals(["tutor_interpretation", "learner_report", "preserve"]),
  programDisposition: Schema.Literals(["active", "retracted"]),
  assessmentSourcePolicy: Schema.Literals([
    "current_response_and_disclosure",
    "original_response_and_disclosure",
    "current_learner_correction",
    "preserve_existing_basis",
  ]),
  nonImplications: Schema.Array(StringValue),
})
const LearnerResponseEvidenceCapabilityProposal = Schema.Struct({
  kind: Schema.Literal("learner_response_evidence_capability"),
  ...ProposalBinding,
  commandFingerprint: StringValue,
  issuance: Schema.Literals(["root", "delegated"]),
  scope: LearnerResponseEvidenceScope,
})

const FutureAttentionScope = Schema.Struct({
  command: Schema.Unknown,
  operationCount: PositiveVersion,
  completionClaimCount: PositiveVersion,
  sourceRelations: Schema.Array(
    Schema.Literals([
      "interpreted_learner_request",
      "tutor_initiated",
      "interpreted_learner_direction",
      "agent_correction",
    ]),
  ),
  nonImplications: Schema.Array(StringValue),
})
const FutureAttentionCapabilityProposal = Schema.Struct({
  kind: Schema.Literal("future_attention_capability"),
  ...ProposalBinding,
  commandFingerprint: StringValue,
  issuance: Schema.Literals(["root", "delegated"]),
  scope: FutureAttentionScope,
})

const AssignmentRevisionRef = Schema.Struct({
  assignmentID: StringValue,
  revisionID: StringValue,
  version: PositiveVersion,
})
const AssignmentMaterializedOperation = Schema.Struct({
  outcome: Schema.Literals(["changed", "no_change"]),
  ordinal: PositiveVersion,
  operation: Schema.Literals(["create", "revise", "correct", "complete", "cancel", "dismiss", "reopen", "replace"]),
  assignmentID: StringValue,
  revisionID: StringValue,
  finalDisposition: Schema.Literals(["open", "completed", "cancelled", "dismissed", "superseded"]),
  relationTarget: optional(AssignmentRevisionRef),
  successorAssignmentID: optional(StringValue),
  successorRevisionID: optional(StringValue),
})
const AssignmentScope = Schema.Struct({
  command: Schema.Unknown,
  sourceBasis: Schema.Unknown,
  materialized: Schema.Array(AssignmentMaterializedOperation),
  operationCount: PositiveVersion,
  causeType: Schema.Literals([
    "interpreted_learner_report",
    "interpreted_learner_direction",
    "interpreted_source_observation",
    "interpreted_source_change",
    "agent_correction",
  ]),
  targetedAssignmentIDs: Schema.Array(StringValue),
  expectedHeads: Schema.Array(
    Schema.Struct({
      assignmentID: StringValue,
      revisionID: StringValue,
      version: PositiveVersion,
      ownerCutFingerprint: StringValue,
    }),
  ),
  sourceActions: Schema.Array(
    Schema.Literals(["preserve_predecessor_source", "rebind_current_source_to_cause"]),
  ),
  finalDispositions: Schema.Array(
    Schema.Literals(["open", "completed", "cancelled", "dismissed", "superseded"]),
  ),
  replacementTargets: Schema.Array(
    Schema.Struct({ assignmentID: StringValue, revisionID: StringValue, version: PositiveVersion }),
  ),
  nonImplications: Schema.Array(StringValue),
})
const AssignmentCapabilityProposal = Schema.Struct({
  kind: Schema.Literal("assignment_capability"),
  ...ProposalBinding,
  commandFingerprint: StringValue,
  issuance: Schema.Literal("root"),
  scope: AssignmentScope,
})

const LearnerStateJudgmentMaterialized = Schema.Struct({
  outcome: Schema.Literals(["changed", "no_change"]),
  judgmentID: StringValue,
  revisionID: StringValue,
  effectID: StringValue,
  previousRevisionID: optional(StringValue),
  version: PositiveVersion,
  operation: Schema.Literals(["create", "revise", "retire", "restore"]),
  disposition: Schema.Literals(["active", "retired"]),
})
const LearnerStateJudgmentScope = Schema.Struct({
  command: Schema.Unknown,
  materialized: LearnerStateJudgmentMaterialized,
  materializedSnapshot: Schema.Unknown,
  authorAndCause: Schema.Unknown,
  causeType: Schema.Literals([
    "interpreted_learner_report",
    "tutor_model_judgment",
    "exact_owner_observation",
    "learner_correction",
  ]),
  subjectLabel: StringValue,
  judgmentBody: StringValue,
  uncertaintyAndLimits: optional(StringValue),
  scopeType: Schema.Literals(["learner_home", "anchored"]),
  anchorRefs: Schema.Array(Schema.Unknown),
  anchorKinds: Schema.Array(
    Schema.Literals(["course_membership", "material_selector", "goal_revision", "assignment_revision"]),
  ),
  basisRefCount: PositiveVersion,
  basisRefs: Schema.Array(Schema.Unknown),
  basisScope: Schema.Literal("whole_judgment"),
  hasUncertaintyOrLimits: Schema.Boolean,
  nonImplications: Schema.Array(StringValue),
})
const LearnerStateJudgmentCapabilityProposal = Schema.Struct({
  kind: Schema.Literal("learner_state_judgment_capability"),
  ...ProposalBinding,
  commandFingerprint: StringValue,
  issuance: Schema.Literal("root"),
  scope: LearnerStateJudgmentScope,
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
  LearningBootstrapCapabilityProposal,
  LearnerResponseEvidenceCapabilityProposal,
  FutureAttentionCapabilityProposal,
  AssignmentCapabilityProposal,
  LearnerStateJudgmentCapabilityProposal,
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

const LearningBootstrapObjectDescriptor = Schema.Struct({
  platform: Schema.Literal("windows_ntfs"),
  verifierVersion: PositiveVersion,
  canonicalPath: StringValue,
  canonicalPathKey: StringValue,
  volumeSerial: StringValue,
  objectID: StringValue,
  creationTime: StringValue,
  changeTime: StringValue,
  lastWriteTime: StringValue,
  size: PositiveVersion,
  kind: Schema.Literals(["directory", "file"]),
})

const LearningBootstrapSourceAuthority = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("content_root"),
    root: LearningBootstrapObjectDescriptor,
    relativePath: StringValue,
    canonicalPath: StringValue,
    contentRoot: Schema.Struct({
      contentRootID: StringValue,
      bindingID: StringValue,
      bindingEpisodeID: StringValue,
      bindingEpisodeOrdinal: PositiveVersion,
      grantEpisodeID: StringValue,
      grantVersion: PositiveVersion,
    }),
    grantEpisodeOrdinal: PositiveVersion,
  }),
  Schema.Struct({
    kind: Schema.Literal("active_workspace"),
    root: LearningBootstrapObjectDescriptor,
    relativePath: StringValue,
    canonicalPath: StringValue,
    workspaceIdentity: StringValue,
  }),
  Schema.Struct({
    kind: Schema.Literal("one_operation"),
    root: LearningBootstrapObjectDescriptor,
    relativePath: StringValue,
    canonicalPath: StringValue,
    operationIdentity: StringValue,
    approvalBasis: StringValue,
  }),
])

const LearningBootstrapMaterialTarget = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("artifact"),
    artifactID: StringValue,
    revisionID: StringValue,
    attribution: Schema.Union([
      Schema.Struct({ type: Schema.Literal("recorded") }),
      Schema.Struct({ type: Schema.Literal("lineage_correction"), memberID: StringValue }),
    ]),
    sourceAuthority: optional(LearningBootstrapSourceAuthority),
  }),
  Schema.Struct({
    type: Schema.Literal("representation"),
    representationRevisionID: StringValue,
  }),
])

const LearningBootstrapAcknowledgement = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  outcome: Schema.Literals(["applied", "already_applied", "no_change", "error"]),
  course: optional(Schema.Struct({ id: StringValue, title: StringValue })),
  view: optional(
    Schema.Struct({
      id: StringValue,
      name: StringValue,
      revisionID: StringValue,
      authorship: Schema.Literals(["learner_supplied", "learner_requested", "tutor_initiated"]),
    }),
  ),
  children: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(["course", "route", "selection", "material", "map", "alignment", "anchor"]),
      key: optional(StringValue),
      outcome: Schema.Literals(["changed", "no_change"]),
      id: optional(StringValue),
      detail: StringValue,
      viewID: optional(StringValue),
      revisionID: optional(StringValue),
      authorship: optional(Schema.Literals(["learner_supplied", "learner_requested", "tutor_initiated"])),
      selectedRevisionID: optional(Schema.NullOr(StringValue)),
      materialTarget: optional(LearningBootstrapMaterialTarget),
    }),
  ),
  selectedRevisionID: optional(Schema.NullOr(StringValue)),
  anchor: optional(
    Schema.Struct({
      headID: Schema.NullOr(StringValue),
      target: Schema.NullOr(
        Schema.Struct({
          courseID: StringValue,
          viewID: StringValue,
          revisionID: StringValue,
          itemID: StringValue,
        }),
      ),
      usability: Schema.Union([
        Schema.Struct({ usable: Schema.Literal(true) }),
        Schema.Struct({ usable: Schema.Literal(false), cause: StringValue }),
      ]),
    }),
  ),
  correction: StringValue,
})

const LearningBootstrapResult = Schema.Struct({
  kind: Schema.Literal("learning_bootstrap_result"),
  ...ResultCommon,
  disposition: Schema.Literals(["candidate_v1", "semantic_terminal_v1", "physical_no_effect"]),
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
  acknowledgement: optional(LearningBootstrapAcknowledgement),
})

const LearnerResponseEvidenceEffect = Schema.Struct({
  recordID: StringValue,
  revisionID: StringValue,
  version: PositiveVersion,
  subject: LearnerResponseEvidenceSubject,
  target: LearnerResponseEvidenceTargetSnapshot,
  operation: Schema.Literals([
    "create",
    "revise_from_tutor_interpretation",
    "revise_from_learner_report",
    "retract",
  ]),
  ...LearnerResponseEvidenceAssessment,
  basis: Schema.Literals(["tutor_interpretation", "learner_report"]),
  disposition: Schema.Literals(["active", "retracted"]),
})
const LearnerResponseEvidenceResult = Schema.Struct({
  kind: Schema.Literal("learner_response_evidence_result"),
  ...ResultCommon,
  disposition: Schema.Literals(["candidate_v1", "semantic_terminal_v1", "physical_no_effect"]),
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
  effect: optional(LearnerResponseEvidenceEffect),
})

const FutureAttentionChange = Schema.Struct({
  operation: Schema.Literals(["create", "replace", "serve", "dismiss", "reopen"]),
  outcome: Schema.Literals(["changed", "no_effect"]),
  concernID: StringValue,
  version: PositiveVersion,
  disposition: Schema.Literals(["open", "served", "dismissed", "superseded"]),
  transitionID: StringValue,
  successorConcernID: optional(StringValue),
  successorVersion: optional(PositiveVersion),
  successorDisposition: optional(Schema.Literals(["open", "served", "dismissed"])),
  successorTransitionID: optional(StringValue),
})
const FutureAttentionEffect = Schema.Struct({
  effectID: optional(StringValue),
  occurrenceID: StringValue,
  changes: Schema.Array(FutureAttentionChange),
  claim: optional(
    Schema.Struct({
      groupID: StringValue,
      claimStateAtAdmission: Schema.Literal("pending"),
      currentClaimState: Schema.Literals(["pending", "served", "not_served"]),
      finalizationReceiptID: optional(StringValue),
    }),
  ),
})
const FutureAttentionResult = Schema.Struct({
  kind: Schema.Literal("future_attention_result"),
  ...ResultCommon,
  disposition: Schema.Literals(["candidate_v1", "semantic_terminal_v1", "physical_no_effect"]),
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
  effect: optional(FutureAttentionEffect),
})

const AssignmentChange = Schema.Struct({
  ordinal: PositiveVersion,
  operation: Schema.Literals(["create", "revise", "correct", "complete", "cancel", "dismiss", "reopen", "replace"]),
  assignmentID: StringValue,
  previousRevision: optional(AssignmentRevisionRef),
  committedRevision: AssignmentRevisionRef,
  successorAssignmentID: optional(StringValue),
})
const AssignmentIntentResult = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal("changed"),
    ordinal: PositiveVersion,
    operation: Schema.Literals(["create", "revise", "correct", "complete", "cancel", "dismiss", "reopen", "replace"]),
    assignmentID: StringValue,
    previousRevision: optional(AssignmentRevisionRef),
    committedRevision: AssignmentRevisionRef,
    successorAssignmentID: optional(StringValue),
    successorRevision: optional(AssignmentRevisionRef),
  }),
  Schema.Struct({
    outcome: Schema.Literal("no_change"),
    ordinal: PositiveVersion,
    operation: Schema.Literal("revise"),
    assignmentID: StringValue,
    currentRevision: AssignmentRevisionRef,
  }),
])
const AssignmentEffect = Schema.Struct({
  existingOutcome: optional(Schema.Literals(["applied", "no_change"])),
  effectID: optional(StringValue),
  changes: Schema.Array(AssignmentChange),
  intentResults: Schema.Array(AssignmentIntentResult),
})
const AssignmentResult = Schema.Struct({
  kind: Schema.Literal("assignment_result"),
  ...ResultCommon,
  disposition: Schema.Literals(["candidate_v1", "semantic_terminal_v1", "physical_no_effect"]),
  semanticOutcome: optional(Schema.Literals(["already_applied", "semantic_conflict"])),
  issuance: optional(Schema.Literal("root")),
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
  effect: optional(AssignmentEffect),
})

const LearnerStateJudgmentEffect = Schema.Struct({
  existingOutcome: optional(Schema.Literals(["applied", "no_change"])),
  effectID: optional(StringValue),
  judgmentID: optional(StringValue),
  revisionID: optional(StringValue),
  version: optional(PositiveVersion),
  operation: optional(Schema.Literals(["create", "revise", "retire", "restore"])),
  disposition: optional(Schema.Literals(["active", "retired"])),
})
const LearnerStateJudgmentResult = Schema.Struct({
  kind: Schema.Literal("learner_state_judgment_result"),
  ...ResultCommon,
  disposition: Schema.Literals(["candidate_v1", "semantic_terminal_v1", "physical_no_effect"]),
  semanticOutcome: optional(Schema.Literals(["same_effect", "same_no_change", "semantic_conflict"])),
  issuance: optional(Schema.Literal("root")),
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
  effect: optional(LearnerStateJudgmentEffect),
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
  LearningBootstrapResult,
  LearnerResponseEvidenceResult,
  FutureAttentionResult,
  AssignmentResult,
  LearnerStateJudgmentResult,
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
