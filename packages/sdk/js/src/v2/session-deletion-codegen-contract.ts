import type { OpencodeClient } from "./gen/sdk.gen.js"
import type {
  SessionDeleteData,
  SessionDeleteProposalData,
  SessionDeleteProposalResponse,
  SessionDeletionAuditPurgeData,
} from "./gen/types.gen.js"

type Assert<T extends true> = T
type IsRequired<T, K extends keyof T> = T extends Required<Pick<T, K>> ? true : false
type Proposal = Extract<SessionDeleteProposalResponse, { targets: Array<unknown> }>
type SessionClient = OpencodeClient["session"]
type DeleteParameters = Parameters<SessionClient["delete"]>[0]
type ProposalParameters = Parameters<SessionClient["deleteProposal"]>[0]
type PurgeParameters = Parameters<SessionClient["deletionAuditPurge"]>[0]

type CommitBody = NonNullable<SessionDeleteData["body"]>
type ProposalBody = NonNullable<SessionDeleteProposalData["body"]>
type PurgeBody = NonNullable<SessionDeletionAuditPurgeData["body"]>

type CommitKeys =
  | "schemaVersion"
  | "requestID"
  | "rootSessionID"
  | "targets"
  | "subtreeCount"
  | "subtreeFingerprint"
  | "mode"
  | "requestFingerprint"
type PurgeKeys =
  | "schemaVersion"
  | "requestID"
  | "rootSessionID"
  | "deletionRequestID"
  | "auditBundleID"
  | "requestFingerprint"

type _CommitBodyRequired = Assert<IsRequired<SessionDeleteData, "body">>
type _CommitFieldsRequired = Assert<CommitBody extends Required<Pick<CommitBody, CommitKeys>> ? true : false>
type _CommitRootParentNullable = Assert<null extends CommitBody["targets"][number]["parentSessionID"] ? true : false>
type _ProposalBodyRequired = Assert<IsRequired<SessionDeleteProposalData, "body">>
type _ProposalModeRequired = Assert<IsRequired<ProposalBody, "mode">>
type _ProposalRootParentNullable = Assert<null extends Proposal["targets"][number]["parentSessionID"] ? true : false>
type _PurgeBodyRequired = Assert<IsRequired<SessionDeletionAuditPurgeData, "body">>
type _PurgeFieldsRequired = Assert<PurgeBody extends Required<Pick<PurgeBody, PurgeKeys>> ? true : false>

type _SdkCommitFieldsRequired = Assert<
  DeleteParameters extends Required<Pick<DeleteParameters, CommitKeys | "sessionID">> ? true : false
>
type _SdkCommitRootParentNullable = Assert<
  null extends DeleteParameters["targets"][number]["parentSessionID"] ? true : false
>
type _SdkProposalModeRequired = Assert<IsRequired<ProposalParameters, "mode">>
type _SdkPurgeFieldsRequired = Assert<
  PurgeParameters extends Required<Pick<PurgeParameters, PurgeKeys | "sessionID">> ? true : false
>

export type SessionDeletionCodegenContract =
  | _CommitBodyRequired
  | _CommitFieldsRequired
  | _CommitRootParentNullable
  | _ProposalBodyRequired
  | _ProposalModeRequired
  | _ProposalRootParentNullable
  | _PurgeBodyRequired
  | _PurgeFieldsRequired
  | _SdkCommitFieldsRequired
  | _SdkCommitRootParentNullable
  | _SdkProposalModeRequired
  | _SdkPurgeFieldsRequired
