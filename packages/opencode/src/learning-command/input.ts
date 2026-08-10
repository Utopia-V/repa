import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { Assignment } from "@opencode-ai/core/assignment"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Representation } from "@opencode-ai/core/representation"
import { NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { Turn } from "@opencode-ai/schema/turn"
import { Schema } from "effect"

export const AcceptCourseViewRevisionInput = Schema.Struct({
  courseID: Course.CourseID,
  revisionID: Course.RevisionID,
  expectedCourseVersion: NonNegativeInt,
  expectedSelectionRevisionID: Schema.NullOr(Course.RevisionID),
  expectedSelectionVersion: NonNegativeInt,
  expectedViewVersion: NonNegativeInt,
  expectedRevisionVersion: NonNegativeInt,
})

export type AcceptCourseViewRevisionInput = typeof AcceptCourseViewRevisionInput.Type

export const RepresentationConvertInput = Schema.Struct({
  effectiveArtifactID: ArtifactSchema.ArtifactID,
  sourceRevisionID: ArtifactSchema.RevisionID,
  contentRootID: ContentRoot.ContentRootID,
  relativePath: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_096)),
})

export type RepresentationConvertInput = typeof RepresentationConvertInput.Type

const DefaultCourseTargetInput = Schema.Struct({
  courseID: Course.CourseID,
  courseVersion: NonNegativeInt,
  selectionRevisionID: Schema.NullOr(Course.RevisionID),
  selectionVersion: NonNegativeInt,
  viewID: Schema.NullOr(Course.ViewID),
  viewVersion: Schema.NullOr(NonNegativeInt),
  revisionVersion: Schema.NullOr(NonNegativeInt),
})

export const SetDefaultCoursePreferenceInput = Schema.Struct({
  expectedHeadID: Schema.NullOr(LearnerNavigation.DefaultEffectID),
  expectedVersion: NonNegativeInt,
  target: Schema.NullOr(DefaultCourseTargetInput),
})

export type SetDefaultCoursePreferenceInput = typeof SetDefaultCoursePreferenceInput.Type

const DefaultCourseResolutionCandidateInput = Schema.Struct({
  courseID: Course.CourseID,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024)),
  courseVersion: NonNegativeInt,
})

const DefaultCourseResolutionScopeInput = Schema.Union([
  Schema.Struct({
    coverage: Schema.Literal("complete"),
    candidates: Schema.Array(DefaultCourseResolutionCandidateInput).check(Schema.isMaxLength(100)),
    selectedCourseID: Schema.NullOr(Course.CourseID),
  }),
  Schema.Struct({
    coverage: Schema.Literal("explicitly_truncated"),
    candidates: Schema.Array(DefaultCourseResolutionCandidateInput).check(Schema.isMaxLength(100)),
    selectedCourseID: Schema.NullOr(Course.CourseID),
    truncation: Schema.Struct({
      reason: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024)),
      omittedCount: Schema.optional(NonNegativeInt),
    }),
  }),
])

const DefaultCourseSourceExcerpt = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024))
const DefaultCourseProposalFingerprint = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

export const ProposeDefaultCoursePreferenceInput = Schema.Struct({
  expectedHeadID: Schema.NullOr(LearnerNavigation.DefaultEffectID),
  expectedVersion: NonNegativeInt,
  target: Schema.NullOr(DefaultCourseTargetInput),
  resolutionScope: DefaultCourseResolutionScopeInput,
})

export type ProposeDefaultCoursePreferenceInput = typeof ProposeDefaultCoursePreferenceInput.Type

export const SetDefaultCoursePreferenceV2Input = Schema.Union([
  Schema.Struct({
    authorization: Schema.Struct({
      type: Schema.Literal("direct_request_v2"),
      sourceExcerpt: DefaultCourseSourceExcerpt,
      resolutionScope: DefaultCourseResolutionScopeInput,
    }),
    expectedHeadID: Schema.NullOr(LearnerNavigation.DefaultEffectID),
    expectedVersion: NonNegativeInt,
    target: Schema.NullOr(DefaultCourseTargetInput),
  }),
  Schema.Struct({
    authorization: Schema.Struct({
      type: Schema.Literal("accepted_proposal_v2"),
      sourceExcerpt: DefaultCourseSourceExcerpt,
      presentedAssistantMessageID: SessionV1.MessageID,
      presentedPartID: SessionV1.PartID,
      emissionOrdinal: NonNegativeInt,
      proposalFingerprint: DefaultCourseProposalFingerprint,
      selection: Schema.Literals(["sole_presented", "explicit_reference"]),
    }),
  }),
])

export type SetDefaultCoursePreferenceV2Input = typeof SetDefaultCoursePreferenceV2Input.Type

export const SetDefaultCoursePreferenceV3Input = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("set"),
    courseID: Course.CourseID,
  }),
  Schema.Struct({
    action: Schema.Literal("clear"),
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export type SetDefaultCoursePreferenceV3Input = typeof SetDefaultCoursePreferenceV3Input.Type

const RouteAnchorTargetInput = Schema.Struct({
  viewID: Course.ViewID,
  revisionID: Course.RevisionID,
  itemID: Course.ItemID,
  courseVersion: NonNegativeInt,
  selectionVersion: NonNegativeInt,
  viewVersion: NonNegativeInt,
  revisionVersion: NonNegativeInt,
})

export const SetCourseRouteAnchorInput = Schema.Struct({
  courseID: Course.CourseID,
  expectedHeadID: Schema.NullOr(LearnerNavigation.AnchorEffectID),
  expectedVersion: NonNegativeInt,
  target: Schema.NullOr(RouteAnchorTargetInput),
})

export type SetCourseRouteAnchorInput = typeof SetCourseRouteAnchorInput.Type

const SteeringText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048))
const SteeringSourceExcerpt = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024))
const SteeringReason = Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024)))

export const UpdateRetainedLearningSteeringInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("create"),
    sourceExcerpt: SteeringSourceExcerpt,
    operativeInstruction: SteeringText,
    learnerReason: SteeringReason,
    validUntil: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  }),
  Schema.Struct({
    action: Schema.Literal("replace"),
    policyID: RetainedSteering.PolicyID,
    expectedHeadID: RetainedSteering.TransitionID,
    expectedVersion: NonNegativeInt,
    sourceExcerpt: SteeringSourceExcerpt,
    operativeInstruction: SteeringText,
    learnerReason: SteeringReason,
    validUntil: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  }),
  Schema.Struct({
    action: Schema.Literal("retract"),
    policyID: RetainedSteering.PolicyID,
    expectedHeadID: RetainedSteering.TransitionID,
    expectedVersion: NonNegativeInt,
    sourceExcerpt: SteeringSourceExcerpt,
    learnerReason: SteeringReason,
  }),
])

export type UpdateRetainedLearningSteeringInput = typeof UpdateRetainedLearningSteeringInput.Type

const GoalOutcome = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LearnerGoal.MAX_OUTCOME_BYTES))
const GoalCondition = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LearnerGoal.MAX_CONDITION_BYTES))
const GoalSourceExcerpt = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(LearnerGoal.MAX_SOURCE_EXCERPT_BYTES),
)

const GoalFieldBasisInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("authored"), sourceExcerpt: GoalSourceExcerpt }),
  Schema.Struct({ type: Schema.Literal("accepted") }),
  Schema.Struct({ type: Schema.Literal("carried"), predecessorRevisionID: LearnerGoal.RevisionID }),
])

const GoalFieldBasesInput = Schema.Struct({
  outcome: GoalFieldBasisInput,
  conditions: GoalFieldBasisInput,
  scope: GoalFieldBasisInput,
  target: GoalFieldBasisInput,
  disposition: GoalFieldBasisInput,
})

const GoalCourseMembershipInput = Schema.Struct({
  courseID: Course.CourseID,
  basis: Schema.Union([
    Schema.Struct({ type: Schema.Literal("new"), expectedCourseVersion: NonNegativeInt }),
    Schema.Struct({ type: Schema.Literal("carried"), predecessorRevisionID: LearnerGoal.RevisionID }),
  ]),
})

const GoalScopeInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("learner_home") }),
  Schema.Struct({
    type: Schema.Literal("courses"),
    courses: Schema.Array(GoalCourseMembershipInput).check(Schema.isLengthBetween(1, LearnerGoal.MAX_COURSES)),
  }),
])

const GoalTargetInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({
    type: Schema.Literal("instant"),
    instant: Schema.Number,
    sourceExpression: GoalSourceExcerpt,
    normalized: GoalSourceExcerpt,
    utcOffsetMinutes: Schema.Number,
    normalizationBasis: Schema.Literal("explicit_offset"),
  }),
  Schema.Struct({
    type: Schema.Literal("local_date"),
    date: GoalSourceExcerpt,
    timeZone: GoalSourceExcerpt,
    sourceExpression: GoalSourceExcerpt,
    normalizationBasis: Schema.Literals(["explicit_date", "source_temporal_context"]),
  }),
])

const GoalSemanticSnapshotInput = Schema.Struct({
  outcome: GoalOutcome,
  conditions: Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS)),
  scope: GoalScopeInput,
  target: GoalTargetInput,
  fieldBases: GoalFieldBasesInput,
})

const GoalNonSupersededDispositionInput = Schema.Literals(["active", "achieved", "abandoned"])
const GoalUpdateDispositionInput = Schema.Union([
  Schema.Struct({ type: GoalNonSupersededDispositionInput }),
  Schema.Struct({
    type: Schema.Literal("superseded"),
    targetGoalID: LearnerGoal.GoalID,
    targetRevisionID: LearnerGoal.RevisionID,
  }),
])

const GoalOperationInput = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("create"),
    snapshot: GoalSemanticSnapshotInput,
    disposition: GoalNonSupersededDispositionInput,
  }),
  Schema.Struct({
    type: Schema.Literal("update"),
    goalID: LearnerGoal.GoalID,
    expectedHeadID: LearnerGoal.RevisionID,
    expectedVersion: NonNegativeInt,
    snapshot: GoalSemanticSnapshotInput,
    disposition: GoalUpdateDispositionInput,
  }),
  Schema.Struct({
    type: Schema.Literal("replace"),
    goalID: LearnerGoal.GoalID,
    expectedHeadID: LearnerGoal.RevisionID,
    expectedVersion: NonNegativeInt,
    snapshot: GoalSemanticSnapshotInput,
    target: Schema.Union([
      Schema.Struct({
        type: Schema.Literal("existing"),
        goalID: LearnerGoal.GoalID,
        revisionID: LearnerGoal.RevisionID,
        version: NonNegativeInt,
      }),
      Schema.Struct({
        type: Schema.Literal("new"),
        snapshot: GoalSemanticSnapshotInput,
        disposition: GoalNonSupersededDispositionInput,
      }),
    ]),
  }),
])

const GoalOperationsInput = Schema.Array(GoalOperationInput).check(
  Schema.isLengthBetween(1, LearnerGoal.MAX_OPERATIONS),
)

export const LegacyUpdateLearnerGoalsInput = Schema.Union([
  Schema.Struct({ authorizationBasis: Schema.Literal("learner_request"), operations: GoalOperationsInput }),
  Schema.Struct({ authorizationBasis: Schema.Literal("learner_acceptance"), operations: GoalOperationsInput }),
])

export type LegacyUpdateLearnerGoalsInput = typeof LegacyUpdateLearnerGoalsInput.Type

const GoalTimeZoneIntentV2 = Schema.Union([
  Schema.Struct({ type: Schema.Literal("source") }),
  Schema.Struct({
    type: Schema.Literal("iana"),
    name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  }),
  Schema.Struct({
    type: Schema.Literal("fixed_offset"),
    offsetMinutes: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(-840),
      Schema.isLessThanOrEqualTo(840),
    ),
  }),
])

const GoalTargetIntentV2 = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({
    type: Schema.Literal("instant"),
    localDateTime: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/)),
    timeZone: GoalTimeZoneIntentV2,
  }),
  Schema.Struct({
    type: Schema.Literal("local_date"),
    date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
    timeZone: GoalTimeZoneIntentV2,
  }),
])

const GoalScopeIntentV2 = Schema.Union([
  Schema.Struct({ type: Schema.Literal("learner_home") }),
  Schema.Struct({
    type: Schema.Literal("courses"),
    courseIDs: Schema.Array(Course.CourseID).check(Schema.isLengthBetween(1, LearnerGoal.MAX_COURSES)),
  }),
])

const GoalDispositionV2 = Schema.Literals(["active", "achieved", "abandoned"])

const GoalPatchV2 = Schema.Struct({
  outcome: Schema.optional(GoalOutcome),
  conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
  scope: Schema.optional(GoalScopeIntentV2),
  target: Schema.optional(GoalTargetIntentV2),
  disposition: Schema.optional(GoalDispositionV2),
})

const GoalCreateOperationV2 = Schema.Struct({
  type: Schema.Literal("create"),
  outcome: GoalOutcome,
  conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
  scope: Schema.optional(GoalScopeIntentV2),
  target: Schema.optional(GoalTargetIntentV2),
  disposition: Schema.optional(GoalDispositionV2),
})

const GoalUpdateOperationV2 = Schema.Struct({
  type: Schema.Literal("update"),
  goalID: LearnerGoal.GoalID,
  headRevisionID: LearnerGoal.RevisionID,
  patch: GoalPatchV2,
})

const GoalReplaceOperationV2 = Schema.Struct({
  type: Schema.Literal("replace"),
  goalID: LearnerGoal.GoalID,
  headRevisionID: LearnerGoal.RevisionID,
  patch: Schema.optional(
    Schema.Struct({
      outcome: Schema.optional(GoalOutcome),
      conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
      scope: Schema.optional(GoalScopeIntentV2),
      target: Schema.optional(GoalTargetIntentV2),
    }),
  ),
  target: Schema.Union([
    Schema.Struct({
      type: Schema.Literal("existing"),
      goalID: LearnerGoal.GoalID,
      headRevisionID: LearnerGoal.RevisionID,
    }),
    Schema.Struct({
      type: Schema.Literal("new"),
      outcome: GoalOutcome,
      conditions: Schema.optional(Schema.Array(GoalCondition).check(Schema.isMaxLength(LearnerGoal.MAX_CONDITIONS))),
      scope: Schema.optional(GoalScopeIntentV2),
      target: Schema.optional(GoalTargetIntentV2),
      disposition: Schema.optional(GoalDispositionV2),
    }),
  ]),
})

export const UpdateLearnerGoalsInput = Schema.Struct({
  operations: Schema.Array(Schema.Union([GoalCreateOperationV2, GoalUpdateOperationV2, GoalReplaceOperationV2])).check(
    Schema.isLengthBetween(1, LearnerGoal.MAX_OPERATIONS),
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export type UpdateLearnerGoalsInput = typeof UpdateLearnerGoalsInput.Type

const BootstrapText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8_192))
const BootstrapKey = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))
const BootstrapAuthorship = Schema.Literals(["learner_supplied", "learner_requested", "tutor_initiated"])

const BootstrapRevisionItem = Schema.Struct({
  key: BootstrapKey,
  title: BootstrapText,
  parentKey: Schema.optional(BootstrapKey),
  reuse: Schema.optional(Schema.Struct({ sourceRevisionID: Course.RevisionID, itemID: Course.ItemID })),
})

const BootstrapRevision = Schema.Struct({
  items: Schema.Array(BootstrapRevisionItem).check(Schema.isLengthBetween(1, 500)),
  mappings: Schema.optional(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["preserve", "split", "merge"]),
        sourceItemIDs: Schema.Array(Course.ItemID).check(Schema.isMaxLength(500)),
        targetKeys: Schema.Array(BootstrapKey).check(Schema.isMaxLength(500)),
      }),
    ).check(Schema.isMaxLength(500)),
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
    viewID: Course.ViewID,
    predecessorRevisionID: Course.RevisionID,
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
      Schema.Struct({ type: Schema.Literal("existing"), revisionID: Course.RevisionID }),
    ]),
  }),
])

const BootstrapReadAuthority = Schema.Union([
  Schema.Struct({ type: Schema.Literal("content_root"), contentRootID: ContentRoot.ContentRootID }),
  Schema.Struct({ type: Schema.Literal("active_workspace") }),
  Schema.Struct({ type: Schema.Literal("one_operation") }),
])

const BootstrapRead = Schema.Struct({
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_096)),
  authority: BootstrapReadAuthority,
})

const BootstrapMaterial = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("artifact"),
    key: BootstrapKey,
    artifactID: ArtifactSchema.ArtifactID,
    revisionID: ArtifactSchema.RevisionID,
    attribution: Schema.Union([
      Schema.Struct({ type: Schema.Literal("recorded") }),
      Schema.Struct({ type: Schema.Literal("lineage_correction"), memberID: ArtifactSchema.LineageCorrectionMemberID }),
    ]),
    read: Schema.optional(BootstrapRead),
  }),
  Schema.Struct({
    type: Schema.Literal("representation"),
    key: BootstrapKey,
    representationRevisionID: Representation.RevisionID,
  }),
  Schema.Struct({
    type: Schema.Literal("local"),
    key: BootstrapKey,
    path: BootstrapRead.fields.path,
    authority: BootstrapReadAuthority,
  }),
])

const BootstrapSelectorCoordinate = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("whole_target.v1") }),
  Schema.Struct({ kind: Schema.Literal("artifact_byte_range.v1"), startByte: NonNegativeInt, endByte: NonNegativeInt }),
  Schema.Struct({ kind: Schema.Literal("pdf_page_range.v1"), startPage: NonNegativeInt, endPage: NonNegativeInt }),
  Schema.Struct({
    kind: Schema.Literal("pdf_text_range.v1"),
    start: Schema.Struct({ page: NonNegativeInt, item: NonNegativeInt, scalar: NonNegativeInt }),
    end: Schema.Struct({ page: NonNegativeInt, item: NonNegativeInt, scalar: NonNegativeInt }),
  }),
  Schema.Struct({
    kind: Schema.Literal("model_text_range.v1"),
    startScalar: NonNegativeInt,
    endScalar: NonNegativeInt,
  }),
])

const BootstrapMap = Schema.Struct({
  key: BootstrapKey,
  materialKey: BootstrapKey,
  authorship: BootstrapAuthorship,
  supersedesMapID: Schema.optional(MaterialMap.MapID),
  outline: Schema.Array(
    Schema.Struct({
      key: BootstrapKey,
      parentKey: Schema.optional(BootstrapKey),
      title: BootstrapText,
      selectors: Schema.Array(Schema.Struct({ key: BootstrapKey, coordinate: BootstrapSelectorCoordinate })).check(
        Schema.isMaxLength(2_000),
      ),
    }),
  ).check(Schema.isLengthBetween(1, 500)),
})

const BootstrapAlignment = Schema.Struct({
  key: BootstrapKey,
  mapKey: BootstrapKey,
  selectorKey: BootstrapKey,
  authorship: BootstrapAuthorship,
  course: Schema.Union([
    Schema.Struct({ type: Schema.Literal("route_item"), itemKey: BootstrapKey }),
    Schema.Struct({
      type: Schema.Literal("existing"),
      viewID: Course.ViewID,
      revisionID: Course.RevisionID,
      itemID: Course.ItemID,
      selection: Schema.Literals(["explicit_exact", "observed_working"]),
    }),
  ]),
  reason: BootstrapText,
  supersedesAlignmentID: Schema.optional(MaterialMap.AlignmentID),
})

const BootstrapAnchor = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["preserve", "clear"]) }),
  Schema.Struct({
    type: Schema.Literal("set"),
    target: Schema.Union([
      Schema.Struct({ type: Schema.Literal("route_item"), itemKey: BootstrapKey }),
      Schema.Struct({
        type: Schema.Literal("existing"),
        viewID: Course.ViewID,
        revisionID: Course.RevisionID,
        itemID: Course.ItemID,
      }),
    ]),
  }),
])

export const UpdateLearningCourseInput = Schema.Struct({
  course: Schema.Union([
    Schema.Struct({ type: Schema.Literal("new"), title: BootstrapText }),
    Schema.Struct({
      type: Schema.Literal("existing"),
      courseID: Course.CourseID,
      title: Schema.optional(BootstrapText),
    }),
  ]),
  route: Schema.optional(BootstrapRoute),
  selection: Schema.optional(BootstrapSelection),
  materials: Schema.optional(Schema.Array(BootstrapMaterial).check(Schema.isMaxLength(32))),
  maps: Schema.optional(Schema.Array(BootstrapMap).check(Schema.isMaxLength(16))),
  alignments: Schema.optional(Schema.Array(BootstrapAlignment).check(Schema.isMaxLength(64))),
  anchor: Schema.optional(BootstrapAnchor),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export type UpdateLearningCourseInput = typeof UpdateLearningCourseInput.Type

const LearnerResponseEvidenceAssessment = {
  relation: Schema.Literals(["supports", "does_not_support"]),
  exposure: Schema.Literals([
    "learner_response_before_tutor_disclosure",
    "tutor_disclosure_before_learner_response",
  ]),
}

export const UpdateLearnerResponseEvidenceInput = Schema.Union([
  Schema.Struct({
    operation: Schema.Literal("create"),
    ...LearnerResponseEvidenceAssessment,
    conditionAssistantMessageID: SessionV1.MessageID,
    target: Schema.Struct({
      mapID: MaterialMap.MapID,
      selectorID: MaterialMap.SelectorID,
      courseID: Course.CourseID,
      viewID: Course.ViewID,
      revisionID: Course.RevisionID,
      itemID: Course.ItemID,
    }),
    alignmentID: MaterialMap.AlignmentID,
  }),
  Schema.Struct({
    operation: Schema.Literal("revise_from_tutor_interpretation"),
    recordID: LearnerResponseEvidence.RecordID,
    expectedVersion: NonNegativeInt,
    ...LearnerResponseEvidenceAssessment,
  }),
  Schema.Struct({
    operation: Schema.Literal("revise_from_learner_report"),
    recordID: LearnerResponseEvidence.RecordID,
    expectedVersion: NonNegativeInt,
    ...LearnerResponseEvidenceAssessment,
  }),
  Schema.Struct({
    operation: Schema.Literal("retract"),
    recordID: LearnerResponseEvidence.RecordID,
    expectedVersion: NonNegativeInt,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export type UpdateLearnerResponseEvidenceInput = typeof UpdateLearnerResponseEvidenceInput.Type

const FutureAttentionText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048))
const FutureAttentionExcerpt = Schema.Struct({
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(FutureAttention.MAX_EXCERPT_BYTES)),
  startByte: NonNegativeInt,
  endByte: NonNegativeInt,
})
const FutureAttentionCreationSource = Schema.Union([
  Schema.Struct({ type: Schema.Literal("interpreted_learner_request"), excerpt: FutureAttentionExcerpt }),
  Schema.Struct({ type: Schema.Literal("tutor_initiated") }),
])
const FutureAttentionOwnerRead = Schema.Struct({
  concernID: FutureAttention.ConcernID,
  expectedVersion: NonNegativeInt,
  headTransitionID: FutureAttention.TransitionID,
  cutFingerprint: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
})
const FutureAttentionMutation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("interpreted_learner_direction"), excerpt: FutureAttentionExcerpt }),
  Schema.Struct({
    type: Schema.Literal("agent_correction"),
    rationale: FutureAttentionText,
    ownerRead: FutureAttentionOwnerRead,
  }),
])
const FutureAttentionEndpoint = Schema.Struct({
  courseID: Course.CourseID,
  viewID: Course.ViewID,
  revisionID: Course.RevisionID,
  itemID: Course.ItemID,
})
const FutureAttentionSelection = Schema.Union([
  Schema.Struct({ type: Schema.Literal("explicit_exact") }),
  Schema.Struct({
    type: Schema.Literal("observed_working"),
    revisionID: Course.RevisionID,
    version: NonNegativeInt,
  }),
])
const FutureAttentionTarget = Schema.Struct({
  endpoint: FutureAttentionEndpoint,
  selection: FutureAttentionSelection,
})
const FutureAttentionTimeZone = Schema.Union([
  Schema.Struct({ type: Schema.Literal("source") }),
  Schema.Struct({ type: Schema.Literal("iana"), name: FutureAttentionText }),
  Schema.Struct({ type: Schema.Literal("fixed_offset"), offsetMinutes: Schema.Int }),
])
const FutureAttentionNotBefore = Schema.Struct({
  sourceExpression: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(FutureAttention.MAX_TEMPORAL_EXPRESSION_BYTES),
  ),
  localDateTime: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  timeZone: FutureAttentionTimeZone,
})
const FutureAttentionConcern = Schema.Struct({
  purpose: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(FutureAttention.MAX_PURPOSE_BYTES)),
  source: FutureAttentionCreationSource,
  target: FutureAttentionTarget,
  notBefore: FutureAttentionNotBefore,
  serviceTiming: Schema.Literals(["after_creation", "at_or_after_not_before"]),
  interactionOrder: Schema.optional(Schema.Literal("learner_response_before_tutor_disclosure")),
})
const FutureAttentionServiceSource = Schema.Union([
  Schema.Struct({ type: Schema.Literal("learner_occurrence") }),
  Schema.Struct({ type: Schema.Literal("assistant_completion"), assistantMessageID: SessionV1.MessageID }),
  Schema.Struct({ type: Schema.Literal("tool_result"), partID: SessionV1.PartID }),
  Schema.Struct({ type: Schema.Literal("child_result"), parentTaskPartID: SessionV1.PartID }),
  Schema.Struct({ type: Schema.Literal("current_assistant_when_complete") }),
])
const FutureAttentionService = Schema.Struct({
  source: FutureAttentionServiceSource,
  rationale: FutureAttentionText,
  learnerResponseWitness: Schema.optional(
    Schema.Struct({ occurrenceID: LearningCommand.OccurrenceID }),
  ),
})
const FutureAttentionCurrentAssistantService = Schema.Struct({
  rationale: FutureAttentionText,
  learnerResponseWitness: Schema.optional(
    Schema.Struct({ occurrenceID: LearningCommand.OccurrenceID }),
  ),
})
const FutureAttentionSuccessorSource = Schema.Union([
  Schema.Struct({ type: Schema.Literal("preserve_predecessor_source") }),
  Schema.Struct({
    type: Schema.Literal("rebind_current_source"),
    source: FutureAttentionCreationSource,
  }),
])
const FutureAttentionSuccessorDisposition = Schema.Union([
  Schema.Struct({ type: Schema.Literal("open") }),
  Schema.Struct({ type: Schema.Literal("dismissed_by_mutation"), rationale: FutureAttentionText }),
  Schema.Struct({ type: Schema.Literal("carry_served"), rationale: FutureAttentionText }),
  Schema.Struct({ type: Schema.Literal("carry_dismissed"), rationale: FutureAttentionText }),
  Schema.Struct({ type: Schema.Literal("serve_complete_source"), service: FutureAttentionService }),
  Schema.Struct({
    type: Schema.Literal("serve_current_assistant_when_complete"),
    service: FutureAttentionCurrentAssistantService,
  }),
])
const FutureAttentionReplacementConcern = Schema.Struct({
  purpose: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(FutureAttention.MAX_PURPOSE_BYTES)),
  target: FutureAttentionTarget,
  notBefore: FutureAttentionNotBefore,
  serviceTiming: Schema.Literals(["after_creation", "at_or_after_not_before"]),
  interactionOrder: Schema.optional(Schema.Literal("learner_response_before_tutor_disclosure")),
})

export const UpdateFutureAttentionInput = Schema.Struct({
  operations: Schema.Array(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("create"), concern: FutureAttentionConcern }),
      Schema.Struct({
        type: Schema.Literal("replace"),
        concernID: FutureAttention.ConcernID,
        expectedVersion: NonNegativeInt,
        mutation: FutureAttentionMutation,
        successorSource: FutureAttentionSuccessorSource,
        concern: FutureAttentionReplacementConcern,
        successorDisposition: FutureAttentionSuccessorDisposition,
      }),
      Schema.Struct({
        type: Schema.Literal("serve"),
        concernID: FutureAttention.ConcernID,
        expectedVersion: NonNegativeInt,
        service: FutureAttentionService,
      }),
      Schema.Struct({
        type: Schema.Literal("dismiss"),
        concernID: FutureAttention.ConcernID,
        expectedVersion: NonNegativeInt,
        mutation: FutureAttentionMutation,
      }),
      Schema.Struct({
        type: Schema.Literal("reopen"),
        concernID: FutureAttention.ConcernID,
        expectedVersion: NonNegativeInt,
        mutation: FutureAttentionMutation,
      }),
    ]),
  ).check(Schema.isLengthBetween(1, FutureAttention.MAX_OPERATIONS)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export type UpdateFutureAttentionInput = typeof UpdateFutureAttentionInput.Type

const AssignmentText = (maximum: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(maximum))
const AssignmentExcerpt = Schema.Struct({
  text: AssignmentText(Assignment.MAX_EXCERPT_BYTES),
  startByte: NonNegativeInt,
  endByte: NonNegativeInt,
})
const AssignmentZone = Schema.Union([
  Schema.Struct({ type: Schema.Literal("source") }),
  Schema.Struct({ type: Schema.Literal("iana"), name: AssignmentText(256) }),
  Schema.Struct({ type: Schema.Literal("fixed_offset"), offsetMinutes: Schema.Int }),
])
const AssignmentBoundary = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("local_date"),
    civilDate: AssignmentText(64),
    comparator: Schema.Literals(["inclusive", "exclusive"]),
    timeZone: AssignmentZone,
  }),
  Schema.Struct({
    type: Schema.Literal("instant"),
    sourceExpression: AssignmentText(256),
    localDateTime: AssignmentText(128),
    comparator: Schema.Literals(["inclusive", "exclusive"]),
    timeZone: AssignmentZone,
    disambiguatingOffsetMinutes: Schema.optional(Schema.Int),
  }),
])
const AssignmentDueBasis = Schema.Union([
  Schema.Struct({ type: Schema.Literal("unresolved") }),
  Schema.Struct({ type: Schema.Literal("explicitly_no_deadline") }),
  AssignmentBoundary,
])
const AssignmentScope = Schema.Union([
  Schema.Struct({ type: Schema.Literal("learner_home") }),
  Schema.Struct({
    type: Schema.Literal("courses"),
    courseIDs: Schema.Array(Course.CourseID).check(Schema.isLengthBetween(1, Assignment.MAX_SCOPE_COURSES)),
  }),
])
const AssignmentSnapshot = Schema.Struct({
  obligationSummary: AssignmentText(Assignment.MAX_SUMMARY_BYTES),
  learningContext: AssignmentText(Assignment.MAX_LEARNING_CONTEXT_BYTES),
  scope: AssignmentScope,
  dueBasis: AssignmentDueBasis,
  expiryBoundary: Schema.optional(AssignmentBoundary),
})
const AssignmentOwnerRead = Schema.Struct({
  assignmentID: Assignment.AssignmentID,
  revisionID: Assignment.RevisionID,
  version: NonNegativeInt,
  ownerCutFingerprint: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
})
const AssignmentExpectedHead = Schema.Struct({
  revisionID: Assignment.RevisionID,
  version: NonNegativeInt,
  ownerCutFingerprint: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
})
const AssignmentRevisionRef = Schema.Struct({
  assignmentID: Assignment.AssignmentID,
  revisionID: Assignment.RevisionID,
  version: NonNegativeInt,
})
const AssignmentSelector = Schema.Struct({
  locator: AssignmentText(2_048),
  excerpt: Schema.optional(AssignmentExcerpt),
})
const AssignmentAttribution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("recorded") }),
  Schema.Struct({ type: Schema.Literal("lineage_correction"), memberID: ArtifactSchema.LineageCorrectionMemberID }),
])
const AssignmentObservedSource = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("artifact_revision"),
    artifactID: ArtifactSchema.ArtifactID,
    revisionID: ArtifactSchema.RevisionID,
    attribution: AssignmentAttribution,
    selector: AssignmentSelector,
  }),
  Schema.Struct({
    type: Schema.Literal("representation_revision"),
    representationRevisionID: Representation.RevisionID,
    selector: AssignmentSelector,
  }),
])
const AssignmentCause = Schema.Union([
  Schema.Struct({ type: Schema.Literal("interpreted_learner_report"), excerpt: AssignmentExcerpt }),
  Schema.Struct({ type: Schema.Literal("interpreted_learner_direction"), excerpt: AssignmentExcerpt }),
  Schema.Struct({ type: Schema.Literal("interpreted_source_observation"), source: AssignmentObservedSource }),
  Schema.Struct({ type: Schema.Literal("interpreted_source_change"), source: AssignmentObservedSource }),
  Schema.Struct({
    type: Schema.Literal("agent_correction"),
    rationale: AssignmentText(Assignment.MAX_RATIONALE_BYTES),
    ownerReads: Schema.Array(AssignmentOwnerRead).check(Schema.isLengthBetween(1, Assignment.MAX_INTENTS)),
  }),
])
const AssignmentSourceAction = Schema.Union([
  Schema.Struct({ type: Schema.Literal("preserve_predecessor_source") }),
  Schema.Struct({ type: Schema.Literal("rebind_current_source_to_cause") }),
])
const AssignmentRelationAction = Schema.Union([
  Schema.Struct({ type: Schema.Literal("preserve") }),
  Schema.Struct({ type: Schema.Literal("set_or_retarget"), target: AssignmentRevisionRef }),
  Schema.Struct({
    type: Schema.Literal("clear"),
    finalDisposition: Schema.Literals(["open", "completed", "cancelled", "dismissed"]),
  }),
])
const AssignmentUpdate = Schema.Struct({
  type: Schema.Literals(["revise", "correct", "complete", "cancel", "dismiss", "reopen"]),
  assignmentID: Assignment.AssignmentID,
  expectedHead: AssignmentExpectedHead,
  snapshot: Schema.optional(AssignmentSnapshot),
  finalDisposition: Schema.optional(
    Schema.Literals(["open", "completed", "cancelled", "dismissed", "superseded"]),
  ),
  sourceAction: AssignmentSourceAction,
  relationAction: AssignmentRelationAction,
  rationale: AssignmentText(Assignment.MAX_RATIONALE_BYTES),
})

export const UpdateAssignmentInput = Schema.Struct({
  cause: AssignmentCause,
  intents: Schema.Array(
    Schema.Union([
      Schema.Struct({
        type: Schema.Literal("create"),
        createOrdinal: NonNegativeInt,
        snapshot: AssignmentSnapshot,
      }),
      AssignmentUpdate,
      Schema.Struct({
        type: Schema.Literal("replace"),
        assignmentID: Assignment.AssignmentID,
        expectedHead: AssignmentExpectedHead,
        sourceAction: AssignmentSourceAction,
        rationale: AssignmentText(Assignment.MAX_RATIONALE_BYTES),
        successor: Schema.Union([
          Schema.Struct({
            type: Schema.Literal("create"),
            createOrdinal: NonNegativeInt,
            snapshot: AssignmentSnapshot,
          }),
          Schema.Struct({ type: Schema.Literal("bind"), target: AssignmentRevisionRef }),
        ]),
      }),
    ]),
  ).check(Schema.isLengthBetween(1, Assignment.MAX_INTENTS)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export type UpdateAssignmentInput = typeof UpdateAssignmentInput.Type

const LearnerStateText = (maximum: number) =>
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(maximum))
const LearnerStateDigest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const LearnerStateExcerpt = Schema.Struct({
  text: LearnerStateText(LearnerStateJudgment.MAX_EXCERPT_BYTES),
  startByte: NonNegativeInt,
  endByte: NonNegativeInt,
})
const LearnerStateCause = Schema.Union([
  Schema.Struct({ type: Schema.Literal("interpreted_learner_report"), excerpt: LearnerStateExcerpt }),
  Schema.Struct({
    type: Schema.Literal("tutor_model_judgment"),
    rationale: LearnerStateText(LearnerStateJudgment.MAX_RATIONALE_BYTES),
  }),
  Schema.Struct({
    type: Schema.Literal("exact_owner_observation"),
    rationale: LearnerStateText(LearnerStateJudgment.MAX_RATIONALE_BYTES),
  }),
  Schema.Struct({ type: Schema.Literal("learner_correction"), excerpt: LearnerStateExcerpt }),
])
const LearnerStateCourseAnchor = Schema.Struct({
  type: Schema.Literal("course_membership"),
  endpoint: Schema.Struct({
    courseID: Course.CourseID,
    viewID: Course.ViewID,
    revisionID: Course.RevisionID,
    itemID: Course.ItemID,
  }),
})
const LearnerStateMaterialAnchor = Schema.Struct({
  type: Schema.Literal("material_selector"),
  mapID: MaterialMap.MapID,
  selectorID: MaterialMap.SelectorID,
})
const LearnerStateGoalAnchor = Schema.Struct({
  type: Schema.Literal("goal_revision"),
  goalID: LearnerGoal.GoalID,
  revisionID: LearnerGoal.RevisionID,
  version: PositiveInt,
})
const LearnerStateAssignmentAnchor = Schema.Struct({
  type: Schema.Literal("assignment_revision"),
  assignmentID: Assignment.AssignmentID,
  revisionID: Assignment.RevisionID,
  version: PositiveInt,
})
const LearnerStateAnchor = Schema.Union([
  LearnerStateCourseAnchor,
  LearnerStateMaterialAnchor,
  LearnerStateGoalAnchor,
  LearnerStateAssignmentAnchor,
])
const LearnerStateRange = Schema.Struct({
  first: Schema.optional(Schema.String),
  last: Schema.optional(Schema.String),
  count: NonNegativeInt,
  fingerprint: LearnerStateDigest,
})
const LearnerStateInteractionLocator = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    sessionID: SessionSchema.ID,
    turnID: Turn.ID,
    inputID: Schema.optional(Turn.InputID),
    causalOccurrenceID: Schema.optional(Schema.String),
    timeAdmitted: NonNegativeInt,
    timeTerminal: NonNegativeInt,
    terminalState: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
    terminalReason: Schema.optional(Turn.TerminalReason),
    sessionParentID: Schema.optional(SessionSchema.ID),
    presentationProvenance: Schema.Struct({
      count: NonNegativeInt,
      kinds: Schema.Array(Schema.Literals(["origin", "compaction_replay", "fork_clone"])),
      fingerprint: LearnerStateDigest,
      historicalMessageOrPart: Schema.Boolean,
    }),
    messageRange: Schema.optional(LearnerStateRange),
    partRange: Schema.optional(LearnerStateRange),
  }),
  Schema.Struct({
    status: Schema.Literal("source_unavailable"),
    sessionID: SessionSchema.ID,
    turnID: Turn.ID,
    inputID: Schema.optional(Turn.InputID),
    causalOccurrenceID: Schema.optional(Schema.String),
    timeAdmitted: NonNegativeInt,
    timeTerminal: NonNegativeInt,
    terminalState: Schema.Literals(["completed", "failed", "interrupted", "exhausted"]),
    terminalReason: Schema.optional(Turn.TerminalReason),
    sessionParentID: Schema.optional(SessionSchema.ID),
    presentationProvenance: Schema.Literal("source_unavailable"),
    timeDeleted: NonNegativeInt,
  }),
])
const LearnerStateBasisRef = Schema.Union([
  LearnerStateAnchor,
  Schema.Struct({
    type: Schema.Literal("learner_response_evidence_revision"),
    recordID: LearnerResponseEvidence.RecordID,
    revisionID: LearnerResponseEvidence.RevisionID,
    version: NonNegativeInt,
  }),
  Schema.Struct({ type: Schema.Literal("interaction"), locator: LearnerStateInteractionLocator }),
])
const LearnerStateSubject = Schema.Struct({
  label: LearnerStateText(LearnerStateJudgment.MAX_SUBJECT_LABEL_BYTES),
  scope: Schema.Union([
    Schema.Struct({ type: Schema.Literal("learner_home") }),
    Schema.Struct({
      type: Schema.Literal("anchored"),
      anchors: Schema.Array(LearnerStateAnchor).check(
        Schema.isLengthBetween(1, LearnerStateJudgment.MAX_ANCHORS),
      ),
    }),
  ]),
})
const LearnerStateSnapshot = Schema.Struct({
  subject: LearnerStateSubject,
  judgmentBody: LearnerStateText(LearnerStateJudgment.MAX_JUDGMENT_BODY_BYTES),
  exactBasisRefs: Schema.Array(LearnerStateBasisRef).check(
    Schema.isMaxLength(LearnerStateJudgment.MAX_BASIS_REFS),
  ),
  uncertaintyAndLimits: Schema.optional(LearnerStateText(LearnerStateJudgment.MAX_UNCERTAINTY_BYTES)),
  basisScope: Schema.optional(Schema.Literal("whole_judgment")),
})
const LearnerStateExpectedHead = Schema.Struct({
  revisionID: LearnerStateJudgment.RevisionID,
  version: PositiveInt,
  ownerCutFingerprint: LearnerStateDigest,
})

export const UpdateLearnerStateJudgmentInput = Schema.Struct({
  operation: Schema.Literals(["create", "revise", "retire", "restore"]),
  judgmentID: Schema.optional(LearnerStateJudgment.JudgmentID),
  expectedHead: Schema.optional(LearnerStateExpectedHead),
  cause: LearnerStateCause,
  snapshot: Schema.optional(LearnerStateSnapshot),
  rationale: Schema.optional(LearnerStateText(LearnerStateJudgment.MAX_RATIONALE_BYTES)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export type UpdateLearnerStateJudgmentInput = LearnerStateJudgment.Command

const decode = Schema.decodeUnknownSync(AcceptCourseViewRevisionInput)
const decodeRepresentation = Schema.decodeUnknownSync(RepresentationConvertInput)
const decodeDefault = Schema.decodeUnknownSync(SetDefaultCoursePreferenceInput)
const decodeDefaultProposal = Schema.decodeUnknownSync(ProposeDefaultCoursePreferenceInput)
const decodeDefaultV2 = Schema.decodeUnknownSync(SetDefaultCoursePreferenceV2Input)
const decodeDefaultV3 = Schema.decodeUnknownSync(SetDefaultCoursePreferenceV3Input)
const decodeAnchor = Schema.decodeUnknownSync(SetCourseRouteAnchorInput)
const decodeSteering = Schema.decodeUnknownSync(UpdateRetainedLearningSteeringInput)
const decodeLegacyGoals = Schema.decodeUnknownSync(LegacyUpdateLearnerGoalsInput)
const decodeGoalsV2 = Schema.decodeUnknownSync(UpdateLearnerGoalsInput)
const decodeLearningBootstrap = Schema.decodeUnknownSync(UpdateLearningCourseInput)
const decodeLearnerResponseEvidence = Schema.decodeUnknownSync(UpdateLearnerResponseEvidenceInput)
const decodeFutureAttention = Schema.decodeUnknownSync(UpdateFutureAttentionInput)
const decodeAssignment = Schema.decodeUnknownSync(UpdateAssignmentInput)
const decodeLearnerStateJudgment = Schema.decodeUnknownSync(UpdateLearnerStateJudgmentInput)

export function normalize(input: unknown): AcceptCourseViewRevisionInput {
  const value = decode(input)
  return {
    courseID: value.courseID,
    revisionID: value.revisionID,
    expectedCourseVersion: value.expectedCourseVersion,
    expectedSelectionRevisionID: value.expectedSelectionRevisionID,
    expectedSelectionVersion: value.expectedSelectionVersion,
    expectedViewVersion: value.expectedViewVersion,
    expectedRevisionVersion: value.expectedRevisionVersion,
  }
}

export function normalizeRepresentation(input: unknown): RepresentationConvertInput {
  const value = decodeRepresentation(input)
  return {
    effectiveArtifactID: value.effectiveArtifactID,
    sourceRevisionID: value.sourceRevisionID,
    contentRootID: value.contentRootID,
    relativePath: value.relativePath.replaceAll("/", "\\"),
  }
}

export function normalizeDefault(input: unknown): SetDefaultCoursePreferenceInput {
  const value = decodeDefault(input)
  return {
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
  }
}

export function normalizeDefaultProposal(input: unknown): ProposeDefaultCoursePreferenceInput {
  const value = decodeDefaultProposal(input)
  return {
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
    resolutionScope: normalizeDefaultResolutionScope(value.resolutionScope),
  }
}

export function normalizeDefaultV2(input: unknown): SetDefaultCoursePreferenceV2Input {
  const value = decodeDefaultV2(input)
  if (!("expectedHeadID" in value)) {
    return {
      authorization: {
        ...value.authorization,
        sourceExcerpt: value.authorization.sourceExcerpt.trim(),
      },
    }
  }
  return {
    authorization: {
      type: value.authorization.type,
      sourceExcerpt: value.authorization.sourceExcerpt.trim(),
      resolutionScope: normalizeDefaultResolutionScope(value.authorization.resolutionScope),
    },
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
  }
}

export function normalizeDefaultV3(input: unknown): SetDefaultCoursePreferenceV3Input {
  const value = decodeDefaultV3(input)
  return value.action === "set" ? { action: value.action, courseID: value.courseID } : { action: value.action }
}

export function normalizeAnchor(input: unknown): SetCourseRouteAnchorInput {
  const value = decodeAnchor(input)
  return {
    courseID: value.courseID,
    expectedHeadID: value.expectedHeadID,
    expectedVersion: value.expectedVersion,
    target: value.target ? { ...value.target } : null,
  }
}

export function normalizeSteering(input: unknown): UpdateRetainedLearningSteeringInput {
  const value = decodeSteering(input)
  if (value.action === "retract") return { ...value }
  return { ...value, validUntil: normalizeBoundary(value.validUntil) }
}

export function normalizeLegacyGoals(input: unknown): LegacyUpdateLearnerGoalsInput {
  return decodeLegacyGoals(input)
}

export function normalizeGoalsV2(input: unknown): UpdateLearnerGoalsInput {
  LearningCommand.canonicalizeCommandV2(input as LearnerGoal.CommandV2)
  return decodeGoalsV2(input)
}

export function normalizeLearningBootstrap(input: unknown): UpdateLearningCourseInput {
  const value = decodeLearningBootstrap(input)
  LearningCommand.canonicalizeLearningBootstrap(value)
  return value
}

export function normalizeLearnerResponseEvidence(input: unknown): UpdateLearnerResponseEvidenceInput {
  const value = decodeLearnerResponseEvidence(input)
  LearningCommand.canonicalizeLearnerResponseEvidence(value)
  return value
}

export function normalizeFutureAttention(input: unknown): UpdateFutureAttentionInput {
  const value = decodeFutureAttention(input)
  FutureAttention.canonicalizeCommand(value)
  return value
}

export function normalizeAssignment(input: unknown): UpdateAssignmentInput {
  const value = decodeAssignment(input)
  Assignment.canonicalizeCommand(value)
  return value
}

export function normalizeLearnerStateJudgment(input: unknown): UpdateLearnerStateJudgmentInput {
  const value = decodeLearnerStateJudgment(input)
  LearnerStateJudgment.canonicalizeCommand(value as LearnerStateJudgment.Command)
  return value as LearnerStateJudgment.Command
}

function normalizeBoundary(input: string) {
  const value = input.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match || !Number.isSafeInteger(Date.parse(value))) return value
  const milliseconds = (match[7] ?? "0").padEnd(3, "0")
  const offset = match[8] === "Z" ? "+00:00" : match[8]
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${milliseconds}${offset}`
}

export function normalizeCommand(toolID: string, input: unknown) {
  if (toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) return normalize(input)
  if (toolID === LearningCommand.REPRESENTATION_CONVERT_CAPABILITY) return normalizeRepresentation(input)
  if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) return normalizeDefaultV3(input)
  if (toolID === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY) return normalizeAnchor(input)
  if (toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) return normalizeSteering(input)
  if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) return normalizeGoalsV2(input)
  if (toolID === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY) return normalizeLearningBootstrap(input)
  if (toolID === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY) {
    return normalizeLearnerResponseEvidence(input)
  }
  if (toolID === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY) return normalizeFutureAttention(input)
  if (toolID === LearningCommand.UPDATE_ASSIGNMENT_CAPABILITY) return normalizeAssignment(input)
  if (toolID === LearningCommand.UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY) {
    return normalizeLearnerStateJudgment(input)
  }
  throw new Error(`Unknown reserved learning command ${toolID}`)
}

export function command(input: AcceptCourseViewRevisionInput): Course.SelectionAcceptanceInput {
  return {
    courseID: input.courseID,
    revisionID: input.revisionID,
    expectedCourseVersion: input.expectedCourseVersion,
    expectedSelectionRevisionID: input.expectedSelectionRevisionID ?? undefined,
    expectedSelectionVersion: input.expectedSelectionVersion,
    expectedViewVersion: input.expectedViewVersion,
    expectedRevisionVersion: input.expectedRevisionVersion,
  }
}

export function defaultCommand(input: SetDefaultCoursePreferenceInput): LearnerNavigation.DefaultCourseCommand {
  return { kind: "default_course_preference", ...input }
}

export function defaultProposalCommand(
  input: ProposeDefaultCoursePreferenceInput,
): LearnerNavigation.DefaultCourseCommand {
  return {
    kind: "default_course_preference",
    expectedHeadID: input.expectedHeadID,
    expectedVersion: input.expectedVersion,
    target: input.target,
  }
}

export function directDefaultV2Command(
  input: Extract<SetDefaultCoursePreferenceV2Input, { readonly authorization: { readonly type: "direct_request_v2" } }>,
): LearnerNavigation.DefaultCourseCommand {
  return {
    kind: "default_course_preference",
    expectedHeadID: input.expectedHeadID,
    expectedVersion: input.expectedVersion,
    target: input.target,
  }
}

export function anchorCommand(input: SetCourseRouteAnchorInput): LearnerNavigation.RouteAnchorCommand {
  return { kind: "course_route_anchor", ...input }
}

export function retainedSteeringCommand(input: UpdateRetainedLearningSteeringInput): RetainedSteering.Command {
  return { ...input }
}

export function learnerGoalCommand(input: LegacyUpdateLearnerGoalsInput): LearnerGoal.Command {
  return { operations: input.operations }
}

function normalizeDefaultResolutionScope(
  input: ProposeDefaultCoursePreferenceInput["resolutionScope"],
): ProposeDefaultCoursePreferenceInput["resolutionScope"] {
  const candidates = input.candidates.map((candidate) => ({
    ...candidate,
    title: candidate.title.trim(),
  }))
  if (input.coverage === "complete") {
    return { coverage: input.coverage, candidates, selectedCourseID: input.selectedCourseID }
  }
  return {
    coverage: input.coverage,
    candidates,
    selectedCourseID: input.selectedCourseID,
    truncation: {
      reason: input.truncation.reason.trim(),
      ...(input.truncation.omittedCount === undefined ? {} : { omittedCount: input.truncation.omittedCount }),
    },
  }
}

export * as LearningCommandInput from "./input"
