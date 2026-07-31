export * as LearnerNavigationSchema from "./schema"

import { Schema } from "effect"
import type { PermissionV1 } from "../v1/permission"
import { Identifier } from "../id/id"
import type { Course } from "../course"
import type { Turn } from "@opencode-ai/schema/turn"
import type { SessionSchema } from "../session/schema"
import type { ReceiptID } from "../learning-command/physical-schema"
import type { MessageID, PartID } from "../v1/session"

export const DefaultEffectID = Schema.String.check(Schema.isPattern(/^ndp_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerNavigation.DefaultEffectID"),
)
export type DefaultEffectID = typeof DefaultEffectID.Type

export const AnchorEffectID = Schema.String.check(Schema.isPattern(/^nar_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearnerNavigation.AnchorEffectID"),
)
export type AnchorEffectID = typeof AnchorEffectID.Type

const decodeDefaultEffectID = Schema.decodeUnknownSync(DefaultEffectID)
const decodeAnchorEffectID = Schema.decodeUnknownSync(AnchorEffectID)

export const createDefaultEffectID = () => decodeDefaultEffectID(Identifier.create("ndp", "ascending"))
export const createAnchorEffectID = () => decodeAnchorEffectID(Identifier.create("nar", "ascending"))

export type DefaultCourseTarget = Readonly<{
  courseID: Course.CourseID
  courseVersion: number
  selectionRevisionID: Course.RevisionID | null
  selectionVersion: number
  viewID: Course.ViewID | null
  viewVersion: number | null
  revisionVersion: number | null
}>

export type DefaultCourseCommand = Readonly<{
  kind: "default_course_preference"
  expectedHeadID: DefaultEffectID | null
  expectedVersion: number
  target: DefaultCourseTarget | null
}>

export type DefaultCourseAgentCommandV3 =
  | Readonly<{ action: "set"; courseID: Course.CourseID }>
  | Readonly<{ action: "clear" }>

export type DefaultCourseStoredCommand = DefaultCourseCommand | DefaultCourseAgentCommandV3

export type LocatedValueV1<T> =
  | Readonly<{ availability: "recorded_v1"; value: T }>
  | Readonly<{ availability: "not_recorded_v1" }>

export type LocatedValueV2<T> = Readonly<{ availability: "recorded_v2"; value: T }>

export type DefaultCourseWorkingSelection = Readonly<{
  revisionID: Course.RevisionID | null
  selectionVersion: number
  viewID: Course.ViewID | null
  viewName: string | null
  viewVersion: number | null
  revisionVersion: number | null
}>

export type DefaultCourseStableLocatorV1 = Readonly<{
  courseID: Course.CourseID
  title: LocatedValueV1<string>
  courseVersion: LocatedValueV1<number>
  workingSelection: LocatedValueV1<DefaultCourseWorkingSelection>
}>

export type DefaultCourseStableLocatorV2 = Readonly<{
  courseID: Course.CourseID
  title: LocatedValueV2<string>
  courseVersion: LocatedValueV2<number>
  workingSelection: LocatedValueV2<DefaultCourseWorkingSelection>
}>

export type DefaultCourseEndpointV1 =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "course"; locator: DefaultCourseStableLocatorV1 }>

export type DefaultCourseEndpointV2 =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "course"; locator: DefaultCourseStableLocatorV2 }>

export type DefaultCourseEndpoint = DefaultCourseEndpointV1 | DefaultCourseEndpointV2

export type DefaultCourseOperation = "set" | "change" | "clear"

export type DefaultCourseResolutionScope = Readonly<{
  coverage: "complete" | "explicitly_truncated"
  candidates: readonly Readonly<{
    courseID: Course.CourseID
    title: string
    courseVersion: number
  }>[]
  selectedCourseID: Course.CourseID | null
  truncation?: Readonly<{
    reason: string
    omittedCount?: number
  }>
}>

export type DefaultCourseProposal = Readonly<{
  partID: PartID
  turnID: Turn.ID
  sessionID: SessionSchema.ID
  assistantMessageID: MessageID
  callID: string
  emissionOrdinal: number
  command: DefaultCourseCommand
  commandFingerprint: string
  resolutionScope: DefaultCourseResolutionScope
  resolutionFingerprint: string
  preferenceHeadID: DefaultEffectID | null
  preferenceVersion: number
  operation: DefaultCourseOperation
  from: DefaultCourseEndpointV2
  to: DefaultCourseEndpointV2
  fingerprint: string
  timePresented: number
}>

export type DefaultCourseAuthorizationKind = "legacy_v1" | "direct_request_v2" | "accepted_proposal_v2"

export type DefaultCourseDispositionKind =
  | "legacy_v1"
  | "semantic_terminal_v2"
  | "candidate_v2"
  | "semantic_terminal_v3"
  | "agent_action_v3"

export type DefaultCourseSemanticAddress = Readonly<{
  occurrenceID: string
  slot: "default_course_preference"
}>

type DefaultCourseSemanticTerminalCommon = Readonly<{
  outcome: "already_applied" | "semantic_conflict"
  commandFingerprint: string
  semanticAddress: DefaultCourseSemanticAddress
  semanticAddressFingerprint: string
  incomingPayloadFingerprint: string
  existingEffectID: DefaultEffectID
  existingPayloadFingerprint: string
}>

export type DefaultCourseSemanticTerminalDisposition =
  | (DefaultCourseSemanticTerminalCommon & Readonly<{ kind: "semantic_terminal_v2"; command: DefaultCourseCommand }>)
  | (DefaultCourseSemanticTerminalCommon &
      Readonly<{ kind: "semantic_terminal_v3"; command: DefaultCourseAgentCommandV3 }>)

export type DefaultCourseAgentActionLineageEdge = Readonly<{
  childTurnID: Turn.ID
  childSessionID: SessionSchema.ID
  childDepth: number
  parentTurnID: Turn.ID
  parentSessionID: SessionSchema.ID
  parentDepth: number
  parentTaskPartID: PartID
  parentModelMessageID: MessageID
  delegatedCapability: Readonly<Record<string, unknown>>
  delegatedCapabilityFingerprint: string
}>

type DefaultCourseAgentActionProvenanceCommon = Readonly<{
  schemaVersion: 1
  occurrenceID: string
  causalRootOccurrenceID: string
  sessionID: SessionSchema.ID
  turnID: Turn.ID
  inputID: Turn.InputID
  assistantMessageID: MessageID
  invocationPartID: PartID
  providerCallID: string
  emissionOrdinal: number
  capabilityIdentity: "set_default_course_preference"
  capabilityVersion: 3
}>

export type DefaultCourseAgentActionProvenance =
  | (DefaultCourseAgentActionProvenanceCommon & Readonly<{ kind: "root"; lineage: readonly [] }>)
  | (DefaultCourseAgentActionProvenanceCommon &
      Readonly<{
        kind: "delegated"
        lineage: readonly [DefaultCourseAgentActionLineageEdge, ...DefaultCourseAgentActionLineageEdge[]]
        effectiveDelegatedCapability: Readonly<{
          identity: "set_default_course_preference"
          version: 3
          projectionVersion: 2
          fingerprint: string
        }>
      }>)

export type DefaultCourseAgentAction = Readonly<{
  kind: "agent_action_v3"
  fingerprint: string
  provenance: DefaultCourseAgentActionProvenance
  command: DefaultCourseAgentCommandV3
  commandFingerprint: string
  preferenceHeadID: DefaultEffectID | null
  preferenceVersion: number
  operation: DefaultCourseOperation
  from: DefaultCourseEndpointV2
  to: DefaultCourseEndpointV2
}>

export type DefaultCourseCapabilityOutcome =
  | "not_evaluated"
  | "policy_allow"
  | "policy_deny"
  | "prompted_allow"
  | "prompted_deny"
  | "prompted_correct"
  | "prompted_cancel"
  | "prompted_abort"

type DefaultCourseAcknowledgementCommon = Readonly<{
  invocationPartID: PartID
  effectID: DefaultEffectID
  receiptID: ReceiptID
  operation: DefaultCourseOperation
  relation: "active" | "superseded"
  timeCommitted: number
  commitOrder: number
}>

export type DefaultCourseAcknowledgement =
  | (DefaultCourseAcknowledgementCommon &
      Readonly<{
        schemaVersion: 1
        effectAuthorizationPartID: PartID
        authorizationVersion: 1
        from: DefaultCourseEndpointV1
        to: DefaultCourseEndpointV1
      }>)
  | (DefaultCourseAcknowledgementCommon &
      Readonly<{
        schemaVersion: 1
        effectAuthorizationPartID: PartID
        authorizationVersion: 2
        from: DefaultCourseEndpointV2
        to: DefaultCourseEndpointV2
      }>)
  | (DefaultCourseAcknowledgementCommon &
      Readonly<{
        schemaVersion: 2
        effectAgentActionPartID: PartID
        agentActionVersion: 3
        from: DefaultCourseEndpointV2
        to: DefaultCourseEndpointV2
      }>)

export type RouteAnchorTarget = Readonly<{
  viewID: Course.ViewID
  revisionID: Course.RevisionID
  itemID: Course.ItemID
  courseVersion: number
  selectionVersion: number
  viewVersion: number
  revisionVersion: number
}>

export type RouteAnchorCommand = Readonly<{
  kind: "course_route_anchor"
  courseID: Course.CourseID
  expectedHeadID: AnchorEffectID | null
  expectedVersion: number
  target: RouteAnchorTarget | null
}>

export type Command = DefaultCourseStoredCommand | RouteAnchorCommand

export type DefaultConfirmationSnapshot = Readonly<{
  permissionRequestID: PermissionV1.ID
  headID: DefaultEffectID | null
  version: number
  fromCourseID: Course.CourseID | null
  fromCourseTitle: string | null
  target: Course.PreferenceTargetReceipt | null
}>

export type SourceReceipt = Readonly<{
  receiptID: string
  occurrenceID: string
  originSessionID: string
  originMessageID: string
  assistantMessageID: string
  invocationPartID: string
  availability: "available" | "source_unavailable"
  timeDeleted?: number
}>

export type DefaultProjection = Readonly<{
  kind: "default_course_preference"
  headID: DefaultEffectID | null
  version: number
  courseID: Course.CourseID | null
  usability:
    | { readonly usable: true; readonly title: string }
    | {
        readonly usable: false
        readonly cause: "absent" | "course_not_found" | "course_withdrawn"
        readonly title?: string
      }
  source?: SourceReceipt
  timeCommitted?: number
  commitOrder?: number
  frontierSequence?: number
}>

export type AnchorProjection = Readonly<{
  kind: "course_route_anchor"
  courseID: Course.CourseID
  headID: AnchorEffectID | null
  version: number
  target: Course.MembershipEndpoint | null
  usability:
    | { readonly usable: true }
    | {
        readonly usable: false
        readonly cause: "absent" | Extract<Course.MembershipStatus, { readonly status: "stale" }>["cause"]
      }
  source?: SourceReceipt
  timeCommitted?: number
  commitOrder?: number
  frontierSequence?: number
}>

export type DefaultHistoryItem = Readonly<{
  effect: DefaultEffect
  relation: "current" | "superseded"
  source: SourceReceipt
}>

export type AnchorHistoryItem = Readonly<{
  effect: AnchorEffect
  relation: "current" | "superseded"
  source: SourceReceipt
}>

export type FallbackCourse = Readonly<{
  courseID: Course.CourseID
  availability: "available" | "course_not_found" | "course_withdrawn"
  title?: string
}>

export type FallbackResolution = Readonly<{
  source: "explicit" | "default" | "none"
  courses: readonly FallbackCourse[]
  default?: DefaultProjection
}>

export type DefaultEffect = Readonly<{
  id: DefaultEffectID
  occurrenceID: string
  previousCourseID: Course.CourseID | null
  courseID: Course.CourseID | null
  previousVersion: number
  version: number
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type AnchorEffect = Readonly<{
  id: AnchorEffectID
  occurrenceID: string
  courseID: Course.CourseID
  previousTarget: Course.MembershipEndpoint | null
  target: Course.MembershipEndpoint | null
  previousVersion: number
  version: number
  timeCommitted: number
  commitOrder: number
  frontierSequence: number
}>

export type PageOptions = Readonly<{ limit?: number; cursor?: string }>
export type Page<A> = Readonly<{ items: readonly A[]; cursor?: string }>

export class StaleStateError extends Schema.TaggedErrorClass<StaleStateError>()("LearnerNavigation.StaleStateError", {
  kind: Schema.Literals(["default_course_preference", "course_route_anchor"]),
  courseID: Schema.optional(Schema.String),
}) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "LearnerNavigation.InvalidCursorError",
  { detail: Schema.String },
) {}

export class InvalidReadError extends Schema.TaggedErrorClass<InvalidReadError>()(
  "LearnerNavigation.InvalidReadError",
  {
    detail: Schema.String,
  },
) {}

export class IntegrityError extends Schema.TaggedErrorClass<IntegrityError>()("LearnerNavigation.IntegrityError", {
  detail: Schema.String,
}) {}

export type Error = StaleStateError | InvalidCursorError | InvalidReadError | IntegrityError
