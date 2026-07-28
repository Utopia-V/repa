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
  supersessionTarget: optional(
    GoalRevision,
  ),
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

export const ProposalBasis = Schema.Union([
  AcceptCourseProposal,
  RepresentationProposal,
  ContentMutationProposal,
  DefaultConfirmationProposal,
  DefaultCommandProposal,
  RouteAnchorProposal,
  RetainedSteeringProposal,
  LearnerGoalProposal,
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
  previousSelection: optional(
    Schema.Struct({ revisionID: optional(StringValue), version: PositiveVersion }),
  ),
  committedSelection: optional(
    Schema.Struct({ revisionID: optional(StringValue), version: PositiveVersion }),
  ),
  currentSelection: optional(
    Schema.Struct({ revisionID: optional(StringValue), version: PositiveVersion }),
  ),
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
  RouteAnchorResult,
  RetainedSteeringResult,
  LearnerGoalResult,
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
