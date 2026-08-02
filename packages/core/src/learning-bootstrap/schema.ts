export * as LearningBootstrapSchema from "./schema"

import { Schema } from "effect"
import { Artifact } from "../artifact"
import { ArtifactSchema } from "../artifact/schema"
import { ContentRoot } from "../content-root"
import { Course } from "../course"
import { Identifier } from "../id/id"
import { MaterialMap } from "../material-map"
import { Representation } from "../representation"

export const EffectID = Schema.String.check(Schema.isPattern(/^lbe_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearningBootstrap.EffectID"),
)
export type EffectID = typeof EffectID.Type

export const AdoptionID = Schema.String.check(Schema.isPattern(/^lba_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearningBootstrap.AdoptionID"),
)
export type AdoptionID = typeof AdoptionID.Type

const decodeEffectID = Schema.decodeUnknownSync(EffectID)
const decodeAdoptionID = Schema.decodeUnknownSync(AdoptionID)

export const createEffectID = () => decodeEffectID(Identifier.create("lbe", "ascending"))
export const createAdoptionID = () => decodeAdoptionID(Identifier.create("lba", "ascending"))

export const limits = {
  materials: 32,
  maps: 16,
  alignments: 64,
  items: 500,
  outlineNodes: 500,
  selectors: 2_000,
  aggregateBytes: 2 * 1024 * 1024,
  textBytes: 8 * 1024,
  localPathBytes: 4 * 1024,
} as const

export type AuthorshipIntent = "learner_supplied" | "learner_requested" | "tutor_initiated"

export type CourseIntent =
  | Readonly<{ type: "new"; title: string }>
  | Readonly<{ type: "existing"; courseID: Course.CourseID; title?: string }>

export type RevisionItemIntent = Readonly<{
  key: string
  title: string
  parentKey?: string
  reuse?: Readonly<{ sourceRevisionID: Course.RevisionID; itemID: Course.ItemID }>
}>

export type RevisionIntent = Readonly<{
  items: readonly RevisionItemIntent[]
  mappings?: readonly Readonly<{
    kind: Course.MappingKind
    sourceItemIDs: readonly Course.ItemID[]
    targetKeys: readonly string[]
  }>[]
}>

export type RouteIntent =
  | Readonly<{
      type: "new_view" | "distinct_view"
      key: string
      name: string
      authorship: AuthorshipIntent
      revision: RevisionIntent
    }>
  | Readonly<{
      type: "successor_revision"
      key: string
      viewID: Course.ViewID
      predecessorRevisionID: Course.RevisionID
      authorship: AuthorshipIntent
      revision: RevisionIntent
    }>

export type SelectionIntent =
  | Readonly<{ type: "preserve" }>
  | Readonly<{ type: "clear" }>
  | Readonly<{
      type: "set"
      target: Readonly<{ type: "route" }> | Readonly<{ type: "existing"; revisionID: Course.RevisionID }>
    }>

export type LocalReadIntent = Readonly<{
  path: string
  authority:
    | Readonly<{ type: "content_root"; contentRootID: ContentRoot.ContentRootID }>
    | Readonly<{ type: "active_workspace" }>
    | Readonly<{ type: "one_operation" }>
}>

export type ArtifactMaterialIntent = Readonly<{
  type: "artifact"
  key: string
  artifactID: ArtifactSchema.ArtifactID
  revisionID: ArtifactSchema.RevisionID
  attribution:
    | Readonly<{ type: "recorded" }>
    | Readonly<{ type: "lineage_correction"; memberID: ArtifactSchema.LineageCorrectionMemberID }>
  read?: LocalReadIntent
}>

export type RepresentationMaterialIntent = Readonly<{
  type: "representation"
  key: string
  representationRevisionID: Representation.RevisionID
}>

export type LocalMaterialIntent = Readonly<{
  type: "local"
  key: string
}> &
  LocalReadIntent

export type MaterialIntent = ArtifactMaterialIntent | RepresentationMaterialIntent | LocalMaterialIntent

export type MapIntent = Readonly<{
  key: string
  materialKey: string
  authorship: AuthorshipIntent
  supersedesMapID?: MaterialMap.MapID
  outline: readonly Readonly<{
    key: string
    parentKey?: string
    title: string
    selectors: readonly Readonly<{ key: string; coordinate: MaterialMap.MaterialSelector.Coordinate }>[]
  }>[]
}>

export type AlignmentCourseIntent =
  | Readonly<{ type: "route_item"; itemKey: string }>
  | Readonly<{
      type: "existing"
      viewID: Course.ViewID
      revisionID: Course.RevisionID
      itemID: Course.ItemID
      selection: "explicit_exact" | "observed_working"
    }>

export type AlignmentIntent = Readonly<{
  key: string
  mapKey: string
  selectorKey: string
  authorship: AuthorshipIntent
  course: AlignmentCourseIntent
  reason: string
  supersedesAlignmentID?: MaterialMap.AlignmentID
}>

export type AnchorIntent =
  | Readonly<{ type: "preserve" }>
  | Readonly<{ type: "clear" }>
  | Readonly<{
      type: "set"
      target:
        | Readonly<{ type: "route_item"; itemKey: string }>
        | Readonly<{ type: "existing"; viewID: Course.ViewID; revisionID: Course.RevisionID; itemID: Course.ItemID }>
    }>

export type Command = Readonly<{
  course: CourseIntent
  route?: RouteIntent
  selection?: SelectionIntent
  materials?: readonly MaterialIntent[]
  maps?: readonly MapIntent[]
  alignments?: readonly AlignmentIntent[]
  anchor?: AnchorIntent
}>

export type CanonicalCommand = Command & Readonly<{ schemaVersion: 1 }>

export type AgentAction = Readonly<{
  schemaVersion: 1
  kind: "root" | "delegated"
  occurrenceID: string
  causalRootOccurrenceID: string
  sessionID: string
  turnID: string
  inputID: string
  assistantMessageID: string
  invocationPartID: string
  providerCallID: string
  emissionOrdinal: number
  capabilityIdentity: string
  capabilityVersion: number
  issuingModelOperationID: string
  lineage: readonly Readonly<Record<string, unknown>>[]
  effectiveDelegatedCapability?: Readonly<Record<string, unknown>>
}>

export type CourseSnapshot = Readonly<{
  courseID: Course.CourseID
  title: string
  courseVersion: number
  selectionRevisionID: Course.RevisionID | null
  selectionVersion: number
  routeViewID?: Course.ViewID
  routeViewVersion?: number
  predecessorRevisionID?: Course.RevisionID
  predecessorRevisionVersion?: number
}>

export type MaterialSnapshot =
  | Readonly<{ key: string; type: "artifact"; receipt: Artifact.RevisionReferenceReceipt }>
  | Readonly<{ key: string; type: "representation"; receipt: Representation.CurrentUseReferenceReceipt }>
  | Readonly<{ key: string; type: "local" }>

export type BootstrapOwnerSnapshots = Readonly<{
  materials: readonly MaterialSnapshot[]
  selectionTarget?: Course.RevisionOwnerReceipt
  memberships: readonly Readonly<{ key: string; receipt: Course.MembershipReceipt }>[]
  mapPredecessors: readonly Readonly<{ key: string; receipt: MaterialMap.MapOwnerReceipt }>[]
  alignmentPredecessors: readonly Readonly<{ key: string; receipt: MaterialMap.AlignmentOwnerReceipt }>[]
  anchor: Readonly<{
    headID: string | null
    version: number
    target: Course.MembershipEndpoint | null
  }>
}>

export type MaterializedCandidate = Readonly<{
  schemaVersion: 1
  canonicalCommand: CanonicalCommand
  course: Readonly<{ type: "new" }> | Readonly<{ type: "existing"; snapshot: CourseSnapshot }>
  owners: BootstrapOwnerSnapshots
  agentAction: AgentAction
  timeFloor: number
}>

export type ChildResult = Readonly<{
  kind: "course" | "route" | "selection" | "material" | "map" | "alignment" | "anchor"
  key?: string
  outcome: "changed" | "no_change"
  id?: string
  detail: string
  viewID?: Course.ViewID
  revisionID?: Course.RevisionID
  authorship?: AuthorshipIntent
  selectedRevisionID?: Course.RevisionID | null
  materialTarget?:
    | Readonly<{
        type: "artifact"
        artifactID: Artifact.ArtifactID
        revisionID: Artifact.RevisionID
        attribution:
          | Readonly<{ type: "recorded" }>
          | Readonly<{ type: "lineage_correction"; memberID: Artifact.LineageCorrectionMemberID }>
        sourceAuthority?: ContentRoot.LocalReadAuthorizationReceipt
      }>
    | Readonly<{ type: "representation"; representationRevisionID: Representation.RevisionID }>
}>

export type Acknowledgement = Readonly<{
  schemaVersion: 1
  outcome: "applied" | "already_applied" | "no_change" | "error"
  course?: Readonly<{ id: Course.CourseID; title: string }>
  view?: Readonly<{
    id: Course.ViewID
    name: string
    revisionID: Course.RevisionID
    authorship: AuthorshipIntent
  }>
  children: readonly ChildResult[]
  selectedRevisionID?: Course.RevisionID | null
  anchor?: Readonly<{
    headID: string | null
    target: Course.MembershipEndpoint | null
    usability: Readonly<{ usable: true }> | Readonly<{ usable: false; cause: string }>
  }>
  correction: string
}>

export type Effect = Readonly<{
  id: EffectID
  occurrenceID: string
  semanticFingerprint: string
  courseID: Course.CourseID
  children: readonly ChildResult[]
  acknowledgement: Acknowledgement
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type Candidate = Readonly<{
  kind: "candidate_v1"
  commandFingerprint: string
  canonicalCommand: CanonicalCommand
  agentActionFingerprint: string
  agentAction: AgentAction
  materialized: MaterializedCandidate
}>

export type SemanticTerminal = Readonly<{
  kind: "semantic_terminal_v1"
  outcome: "already_applied" | "semantic_conflict"
  canonicalCommand: CanonicalCommand
  commandFingerprint: string
  semanticAddressFingerprint: string
  existingEffectID: EffectID
  existingIntentFingerprint: string
}>

export type CapabilityOutcome =
  | "not_evaluated"
  | "policy_allow"
  | "policy_deny"
  | "prompted_allow"
  | "prompted_deny"
  | "prompted_correct"
  | "prompted_cancel"
  | "prompted_abort"

export type AppliedSettlement = Readonly<{
  outcome: "applied"
  bootstrapKind: "learning_bootstrap"
  schemaVersion: 1
  receiptID: string
  effectID: EffectID
  courseID: Course.CourseID
  children: readonly ChildResult[]
  acknowledgement: Acknowledgement
  frontierSequence: number
  settlementTime: number
  settlementOrder: number
}>

export type AlreadyAppliedSettlement = Omit<AppliedSettlement, "outcome"> & Readonly<{ outcome: "already_applied" }>

export type NoChangeSettlement = Readonly<{
  outcome: "no_change"
  bootstrapKind: "learning_bootstrap"
  schemaVersion: 1
  courseID?: Course.CourseID
  children: readonly ChildResult[]
  acknowledgement: Acknowledgement
  settlementTime: number
  settlementOrder: number
}>

export class InvalidCommandError extends Schema.TaggedErrorClass<InvalidCommandError>()(
  "LearningBootstrap.InvalidCommandError",
  { reason: Schema.Literals(["validation_error", "capacity_exceeded"]) },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("LearningBootstrap.IntegrityError", {
  detail: Schema.String,
}) {}
