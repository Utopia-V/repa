import type { Artifact } from "../artifact"
import type { ContentRoot } from "../content-root"
import type { ContentRootNTFS } from "../content-root/ntfs"
import type { Course } from "../course"
import type { Representation } from "../representation"
import type { Coordinate, Witness } from "./selector"
import type { AlignmentID, Disposition, MapID, OutlineNodeID, SelectorID } from "./schema"

export type MapTarget =
  | {
      readonly type: "artifact"
      readonly effectiveArtifactID: Artifact.ArtifactID
      readonly revisionID: Artifact.RevisionID
      readonly attribution: Artifact.AttributionBasis
    }
  | {
      readonly type: "representation"
      readonly representationRevisionID: Representation.RevisionID
    }

export type SelectorProposal = {
  readonly id: SelectorID
  readonly position: number
  readonly coordinate: Coordinate
}

export type OutlineNodeProposal = {
  readonly id: OutlineNodeID
  readonly parentNodeID?: OutlineNodeID
  readonly title: string
  readonly preorderPosition: number
  readonly depth: number
  readonly selectors: readonly SelectorProposal[]
}

export type MapProposal = {
  readonly target: MapTarget
  readonly supersedesMapID?: MapID
  readonly outline: readonly OutlineNodeProposal[]
}

export type AuthorshipReceipt = {
  readonly basis: string
  readonly capabilityIdentity: string
  readonly capabilityVersion: number
}

type ArtifactTargetReceiptCommon = {
  readonly type: "artifact"
  readonly effectiveArtifactID: Artifact.ArtifactID
  readonly revisionID: Artifact.RevisionID
  readonly attribution: Artifact.AttributionBasis
  readonly dispositionVersion: number
  readonly lineageVersion: number
  readonly sourceVersion: number
  readonly artifactBindingID: Artifact.BindingID
  readonly activeLocation: string
  readonly descriptorObservationID: Artifact.ObservationID
  readonly descriptorCorrectionID?: Artifact.ObservationCorrectionID
  readonly fingerprint: Artifact.Fingerprint
  readonly mediaType: string
  readonly relativePath: string
  readonly descriptor: ContentRootNTFS.Descriptor
  readonly timeObserved: number
}

export type ExactArtifactTargetReceipt = ArtifactTargetReceiptCommon & {
  readonly authorization: ContentRoot.LocalReadAuthorizationReceipt
}

export type HistoricalArtifactTargetReceipt = ArtifactTargetReceiptCommon & {
  readonly authorization: {
    readonly kind: "content_root_historical_v16"
    readonly root: {
      readonly schemaVersion: 1
      readonly completeness: "historical_v16_partial"
      readonly known: Omit<ContentRootNTFS.Descriptor, "lastWriteTime" | "size">
      readonly unknown: readonly ["lastWriteTime", "size"]
    }
    readonly relativePath: string
    readonly canonicalPath: string
    readonly contentRoot: ContentRoot.ReadAuthorizationReceipt
    readonly grantEpisodeOrdinal: number
  }
}

export type ArtifactTargetReceipt = ArtifactTargetReceiptCommon & {
  readonly authorization: ExactArtifactTargetReceipt["authorization"] | HistoricalArtifactTargetReceipt["authorization"]
}

export type RepresentationTargetReceipt = {
  readonly type: "representation"
  readonly representationRevisionID: Representation.RevisionID
}

export type TargetReceipt = ArtifactTargetReceipt | RepresentationTargetReceipt

export type MapDisposition = {
  readonly version: number
  readonly disposition: Disposition
  readonly withdrawalReason?: string
  readonly timeUpdated: number
}

export type MapInfo = {
  readonly id: MapID
  readonly canonicalInput: string
  readonly target: TargetReceipt
  readonly supersedesMapID?: MapID
  readonly authorship: AuthorshipReceipt
  readonly timeCreated: number
  readonly disposition: MapDisposition
  readonly superseded: boolean
}

export type SelectorInfo = {
  readonly id: SelectorID
  readonly mapID: MapID
  readonly nodeID: OutlineNodeID
  readonly position: number
  readonly coordinate: Coordinate
  readonly witness: Witness
}

export type OutlineNodeInfo = {
  readonly id: OutlineNodeID
  readonly mapID: MapID
  readonly parentNodeID?: OutlineNodeID
  readonly title: string
  readonly preorderPosition: number
  readonly depth: number
  readonly selectors: readonly SelectorInfo[]
}

export type AlignmentProposal = {
  readonly mapID: MapID
  readonly selectorID: SelectorID
  readonly course: Course.MembershipEndpoint
  readonly selection: Course.MembershipSelection
  readonly reason: string
  readonly supersedesAlignmentID?: AlignmentID
}

export type AlignmentDisposition = {
  readonly version: number
  readonly disposition: Disposition
  readonly withdrawalReason?: string
  readonly timeUpdated: number
}

export type AlignmentStaleCause =
  | { readonly side: "relation"; readonly reason: "withdrawn" | "superseded" }
  | { readonly side: "map"; readonly reason: "withdrawn" | "superseded" }
  | {
      readonly side: "material"
      readonly target: "artifact"
      readonly reason: Extract<Artifact.OrdinaryUseByteStatus, { readonly status: "stale" }>["cause"]
    }
  | {
      readonly side: "material"
      readonly target: "representation"
      readonly reason: Extract<Representation.CurrentUseStatus, { readonly status: "stale" }>["cause"]
    }
  | {
      readonly side: "course"
      readonly reason: Extract<Course.MembershipStatus, { readonly status: "stale" }>["cause"]
    }

export type AlignmentProjection =
  | { readonly status: "content_unverified"; readonly staleCauses: readonly [] }
  | { readonly status: "stale"; readonly staleCauses: readonly AlignmentStaleCause[] }

export type AlignmentInfo = {
  readonly id: AlignmentID
  readonly canonicalInput: string
  readonly mapID: MapID
  readonly selectorID: SelectorID
  readonly course: Course.MembershipEndpoint
  readonly selection: Course.MembershipSelection
  readonly membershipReceipt: Course.MembershipReceipt
  readonly reason: string
  readonly supersedesAlignmentID?: AlignmentID
  readonly authorship: AuthorshipReceipt
  readonly timeCreated: number
  readonly disposition: AlignmentDisposition
  readonly superseded: boolean
  readonly projection: AlignmentProjection
}

export type DispositionEvent = {
  readonly version: number
  readonly disposition: Disposition
  readonly reason?: string
  readonly timeCommitted: number
}
