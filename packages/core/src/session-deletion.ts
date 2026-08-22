export * as SessionDeletion from "./session-deletion"

import { and, asc, eq } from "drizzle-orm"
import { Cause, Effect } from "effect"
import { Turn } from "@opencode-ai/schema/turn"
import type { Database } from "./database/database"
import {
  SessionDeletionAuditBundleTable,
  SessionDeletionAuditOperationTable,
  SessionDeletionAuditRecordTable,
  SessionDeletionControlReceiptTable,
  SessionDeletionPurgeReceiptTable,
  TurnLineageRecordRelationTable,
  type ControlReceiptRow,
} from "./session-deletion/sql"
import {
  AuditNotAvailableError,
  AuditProjectionError,
  createAuditBundleID,
  createAuditOperationID,
  type AppliedPurgeSettlement,
  type AppliedSettlement,
  type ContextClassification,
  type Mode,
  type OwnerKind,
  type PurgeRequestID,
  type RequestID,
  InvocationConflictError,
  SessionIDRetiredError,
} from "./session-deletion/schema"
import { SessionTable } from "./session/sql"
import type { SessionSchema } from "./session/schema"
import { TurnLineage } from "./turn-lineage"
import type { MessageID } from "./v1/session"
import { decodeControlReceipt, decodePurgeReceipt } from "./session-deletion/integrity"

export {
  AuditNotAvailableError,
  AuditProjectionError,
  createPurgeRequestID,
  createRequestID,
  InvocationConflictError,
  Mode,
  OwnerKind,
  PurgeRequestID,
  RequestID,
  SessionIDRetiredError,
} from "./session-deletion/schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export type Target = Readonly<{
  sessionID: SessionSchema.ID
  parentSessionID: SessionSchema.ID | null
}>

export type Proposal = Readonly<{
  schemaVersion: 1
  requestID: RequestID
  rootSessionID: SessionSchema.ID
  targets: readonly Target[]
  subtreeCount: number
  subtreeFingerprint: string
  mode: Mode
  requestFingerprint: string
}>

export type AuditRecord = Readonly<{
  ownerKind: OwnerKind
  recordID: string
  revisionID: string
  revisionVersion: number
  contextClassification: ContextClassification
  exactRead: boolean
  typedCitation: boolean
}>

export type AuditOperation = Readonly<{
  assistantMessageID: MessageID
  terminalStatus: "completed" | "failed" | "interrupted"
  records: readonly AuditRecord[]
}>

export type AuditProjection = Readonly<{
  schemaVersion: 1
  operations: readonly AuditOperation[]
}>

export type CommitInput = Readonly<{
  proposal: Proposal
  permissionDecisionFingerprint: string
  deletionTime: number
}>

export type PurgeProposal = Readonly<{
  schemaVersion: 1
  requestID: PurgeRequestID
  rootSessionID: SessionSchema.ID
  deletionRequestID: RequestID
  auditBundleID: string
  requestFingerprint: string
}>

export type Status =
  | Readonly<{ type: "live" }>
  | Readonly<{ type: "missing" }>
  | Readonly<{
      type: "deleted"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: boolean
      auditPurged: boolean
    }>

export type CommitResult<T> =
  | Readonly<{
      type: "applied"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: boolean
      value: T
    }>
  | Readonly<{
      type: "replayed"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: boolean
    }>
  | Readonly<{
      type: "already_deleted"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: boolean
    }>
  | Readonly<{
      type: "deletion_mode_conflict"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: boolean
    }>

export type ExistingDeletionResult =
  | Readonly<{
      type: "already_deleted"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: boolean
    }>
  | Readonly<{
      type: "deletion_mode_conflict"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: boolean
    }>

export type ProposalResult = Proposal | ExistingDeletionResult

export type PurgeResult =
  | Readonly<{
      type: "applied" | "replayed"
      settlement: AppliedPurgeSettlement
      settlementBytes: string
    }>
  | Readonly<{
      type: "already_purged"
      settlement: AppliedPurgeSettlement
      settlementBytes: string
    }>

export type ReadProjection =
  | Readonly<{ schemaVersion: 1; state: "live" }>
  | Readonly<{ schemaVersion: 1; state: "missing" }>
  | Readonly<{
      schemaVersion: 1
      state: "deleted_full" | "deleted_minimal_audit_purged"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: false
    }>
  | Readonly<{
      schemaVersion: 1
      state: "deleted_minimal_audit"
      settlement: AppliedSettlement
      settlementBytes: string
      auditAvailable: true
      audit: {
        schemaVersion: 1
        bundleID: string
        operationCount: number
        operationFingerprint: string
        relationCount: number
        relationFingerprint: string
        deletionTime: number
        sessionBodiesDeleted: true
        operations: readonly Readonly<{
          operationID: string
          ordinal: number
          terminalStatus: "completed" | "failed" | "interrupted"
          records: readonly AuditRecord[]
        }>[]
      }
    }>

export function prepareProposal(
  tx: Transaction,
  input: Readonly<{ requestID: RequestID; rootSessionID: SessionSchema.ID; mode: Mode }>,
) {
  return Effect.gen(function* () {
    const targets = yield* readSubtree(tx, input.rootSessionID)
    if (targets.length === 0) throw new Error(`Session ${input.rootSessionID} is unavailable`)
    const subtreeFingerprint = targetFingerprint(input.rootSessionID, targets)
    return {
      schemaVersion: 1,
      requestID: input.requestID,
      rootSessionID: input.rootSessionID,
      targets,
      subtreeCount: targets.length,
      subtreeFingerprint,
      mode: input.mode,
      requestFingerprint: requestFingerprint({
        rootSessionID: input.rootSessionID,
        targets,
        mode: input.mode,
      }),
    } satisfies Proposal
  })
}

export function canonicalTargetDescriptor(rootSessionID: SessionSchema.ID, rows: readonly Target[]) {
  const byParent = new Map<SessionSchema.ID | null, Target[]>()
  for (const row of rows) {
    const entries = byParent.get(row.parentSessionID) ?? []
    entries.push(row)
    byParent.set(row.parentSessionID, entries)
  }
  for (const entries of byParent.values()) entries.sort((left, right) => left.sessionID.localeCompare(right.sessionID))

  const ordered: Target[] = []
  const visited = new Set<SessionSchema.ID>()
  const visit = (sessionID: SessionSchema.ID) => {
    if (visited.has(sessionID)) throw new Error(`Session tree contains a cycle at ${sessionID}`)
    const row = rows.find((candidate) => candidate.sessionID === sessionID)
    if (!row) return
    visited.add(sessionID)
    ordered.push(row)
    for (const child of byParent.get(sessionID) ?? []) visit(child.sessionID)
  }
  visit(rootSessionID)
  return ordered
}

function readSubtree(tx: Transaction, rootSessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const rows = yield* tx
      .select({ sessionID: SessionTable.id, parentSessionID: SessionTable.parent_id })
      .from(SessionTable)
      .all()
      .pipe(Effect.orDie)
    if (!rows.some((row) => row.sessionID === rootSessionID)) return []
    return canonicalTargetDescriptor(rootSessionID, rows)
  })
}

export function targetFingerprint(rootSessionID: SessionSchema.ID, targets: readonly Target[]) {
  return fingerprint({ schemaVersion: 1, rootSessionID, targets: canonicalTargetDescriptor(rootSessionID, targets) })
}

export function requestFingerprint(input: { rootSessionID: SessionSchema.ID; targets: readonly Target[]; mode: Mode }) {
  const targets = canonicalTargetDescriptor(input.rootSessionID, input.targets)
  return fingerprint({ schemaVersion: 1, rootSessionID: input.rootSessionID, targets, mode: input.mode })
}

export function permissionDecisionFingerprint(proposal: Proposal) {
  verifyProposal(proposal)
  return fingerprint({
    schemaVersion: 1,
    actor: "learner",
    action: "delete_session_tree",
    requestFingerprint: proposal.requestFingerprint,
    mode: proposal.mode,
  })
}

export function readStatus(tx: Transaction, rootSessionID: SessionSchema.ID): Effect.Effect<Status> {
  return Effect.gen(function* () {
    const receipt = yield* tx
      .select()
      .from(SessionDeletionControlReceiptTable)
      .where(eq(SessionDeletionControlReceiptTable.root_session_id, rootSessionID))
      .get()
      .pipe(Effect.orDie)
    if (!receipt) {
      const session = yield* tx
        .select({ id: SessionTable.id })
        .from(SessionTable)
        .where(eq(SessionTable.id, rootSessionID))
        .get()
        .pipe(Effect.orDie)
      return session ? ({ type: "live" } as const) : ({ type: "missing" } as const)
    }
    return yield* statusForReceipt(tx, receipt)
  })
}

export function existingDeletionResult(
  status: Extract<Status, { readonly type: "deleted" }>,
  mode: Mode,
): ExistingDeletionResult {
  return {
    type: status.settlement.mode === mode ? "already_deleted" : "deletion_mode_conflict",
    settlement: status.settlement,
    settlementBytes: status.settlementBytes,
    auditAvailable: status.auditAvailable,
  }
}

export function readAppliedReceipt(tx: Transaction, rootSessionID: SessionSchema.ID) {
  return tx
    .select()
    .from(SessionDeletionControlReceiptTable)
    .where(eq(SessionDeletionControlReceiptTable.root_session_id, rootSessionID))
    .get()
    .pipe(Effect.orDie)
}

export function preparePurgeProposal(
  tx: Transaction,
  input: Readonly<{ requestID: PurgeRequestID; rootSessionID: SessionSchema.ID }>,
): Effect.Effect<PurgeProposal, AuditNotAvailableError> {
  return Effect.gen(function* () {
    const receipt = yield* readAppliedReceipt(tx, input.rootSessionID)
    const bundle = receipt
      ? yield* tx
          .select({ id: SessionDeletionAuditBundleTable.id })
          .from(SessionDeletionAuditBundleTable)
          .where(eq(SessionDeletionAuditBundleTable.deletion_request_id, receipt.request_id))
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (!receipt || !bundle) {
      return yield* new AuditNotAvailableError({ rootSessionID: input.rootSessionID })
    }
    return {
      schemaVersion: 1,
      requestID: input.requestID,
      rootSessionID: input.rootSessionID,
      deletionRequestID: receipt.request_id,
      auditBundleID: bundle.id,
      requestFingerprint: purgeRequestFingerprint({
        rootSessionID: input.rootSessionID,
        deletionRequestID: receipt.request_id,
        auditBundleID: bundle.id,
      }),
    }
  })
}

export function purgeRequestFingerprint(input: {
  rootSessionID: SessionSchema.ID
  deletionRequestID: RequestID
  auditBundleID: string
}) {
  return fingerprint({ schemaVersion: 1, action: "purge_session_deletion_audit", ...input })
}

export function assertSessionIDAvailable(tx: Transaction, sessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const receipt = yield* readAppliedReceipt(tx, sessionID)
    if (!receipt) return
    const status = yield* statusForReceipt(tx, receipt)
    return yield* new SessionIDRetiredError({
      sessionID,
      deletionRequestID: status.settlement.requestID,
      mode: status.settlement.mode,
      deletionTime: status.settlement.deletionTime,
      settlement: status.settlement,
      settlementBytes: status.settlementBytes,
      auditAvailable: status.auditAvailable,
    })
  })
}

export function commit<T, E, R>(
  tx: Transaction,
  input: CommitInput,
  deleteBodies: () => Effect.Effect<T, E, R>,
): Effect.Effect<
  CommitResult<T>,
  E | InvocationConflictError | Turn.SessionTreeChangedError | AuditProjectionError,
  R
> {
  return Effect.gen(function* () {
    verifyProposal(input.proposal)
    if (input.permissionDecisionFingerprint !== permissionDecisionFingerprint(input.proposal)) {
      return yield* new InvocationConflictError({ requestID: input.proposal.requestID })
    }
    const byPhysicalID = yield* tx
      .select()
      .from(SessionDeletionControlReceiptTable)
      .where(eq(SessionDeletionControlReceiptTable.request_id, input.proposal.requestID))
      .get()
      .pipe(Effect.orDie)
    if (byPhysicalID) {
      if (
        byPhysicalID.request_fingerprint !== input.proposal.requestFingerprint ||
        byPhysicalID.permission_decision_fingerprint !== input.permissionDecisionFingerprint
      ) {
        return yield* new InvocationConflictError({ requestID: input.proposal.requestID })
      }
      const status = yield* statusForReceipt(tx, byPhysicalID)
      if (status.type !== "deleted") throw new Error("Applied deletion receipt did not resolve as deleted")
      return {
        type: "replayed",
        settlement: status.settlement,
        settlementBytes: status.settlementBytes,
        auditAvailable: status.auditAvailable,
      }
    }

    const byAddress = yield* readAppliedReceipt(tx, input.proposal.rootSessionID)
    if (byAddress) {
      const status = yield* statusForReceipt(tx, byAddress)
      if (status.type !== "deleted") throw new Error("Applied deletion receipt did not resolve as deleted")
      return byAddress.mode === input.proposal.mode
        ? {
            type: "already_deleted" as const,
            settlement: status.settlement,
            settlementBytes: status.settlementBytes,
            auditAvailable: status.auditAvailable,
          }
        : {
            type: "deletion_mode_conflict" as const,
            settlement: status.settlement,
            settlementBytes: status.settlementBytes,
            auditAvailable: status.auditAvailable,
          }
    }

    const actual = yield* readSubtree(tx, input.proposal.rootSessionID)
    if (
      actual.length !== input.proposal.targets.length ||
      targetFingerprint(input.proposal.rootSessionID, actual) !== input.proposal.subtreeFingerprint
    ) {
      return yield* new Turn.SessionTreeChangedError({ sessionID: input.proposal.rootSessionID })
    }
    const audit =
      input.proposal.mode === "minimal_audit"
        ? yield* deriveAuditProjection(
            tx,
            actual.map((target) => target.sessionID),
            input.deletionTime,
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.fail(
                new AuditProjectionError({
                  rootSessionID: input.proposal.rootSessionID,
                  reason: Cause.pretty(cause),
                }),
              ),
            ),
          )
        : undefined

    const settlement = {
      schemaVersion: 1,
      requestID: input.proposal.requestID,
      requestFingerprint: input.proposal.requestFingerprint,
      rootSessionID: input.proposal.rootSessionID,
      subtreeCount: input.proposal.subtreeCount,
      subtreeFingerprint: input.proposal.subtreeFingerprint,
      mode: input.proposal.mode,
      permissionDecisionFingerprint: input.permissionDecisionFingerprint,
      proposalSchemaVersion: 1,
      outcome: "applied",
      deletionTime: input.deletionTime,
      sessionBodiesDeleted: true,
    } satisfies AppliedSettlement
    const settlementBytes = stableStringify(settlement)
    yield* tx
      .insert(SessionDeletionControlReceiptTable)
      .values({
        request_id: settlement.requestID,
        request_fingerprint: settlement.requestFingerprint,
        settlement_schema_version: settlement.schemaVersion,
        root_session_id: settlement.rootSessionID,
        subtree_count: settlement.subtreeCount,
        subtree_fingerprint: settlement.subtreeFingerprint,
        mode: settlement.mode,
        permission_decision_fingerprint: settlement.permissionDecisionFingerprint,
        proposal_schema_version: settlement.proposalSchemaVersion,
        outcome: settlement.outcome,
        deletion_time: settlement.deletionTime,
        session_bodies_deleted: settlement.sessionBodiesDeleted,
        settlement: settlementBytes,
        settlement_fingerprint: fingerprintBytes(settlementBytes),
      })
      .run()
      .pipe(Effect.orDie)

    if (audit) yield* persistAudit(tx, input.proposal.requestID, input.deletionTime, audit)
    const value = yield* deleteBodies()
    const surviving = yield* tx
      .select({ id: SessionTable.id })
      .from(SessionTable)
      .where(eq(SessionTable.id, input.proposal.rootSessionID))
      .get()
      .pipe(Effect.orDie)
    if (surviving) throw new Error("Session deletion committed a control receipt without deleting the root Session")
    return {
      type: "applied",
      settlement,
      settlementBytes,
      auditAvailable: Boolean(audit),
      value,
    }
  })
}

export function purgeAudit(
  tx: Transaction,
  input: Readonly<{
    proposal: PurgeProposal
    purgeTime: number
  }>,
): Effect.Effect<PurgeResult, InvocationConflictError | AuditNotAvailableError> {
  return Effect.gen(function* () {
    verifyPurgeProposal(input.proposal)
    const existing = yield* tx
      .select()
      .from(SessionDeletionPurgeReceiptTable)
      .where(eq(SessionDeletionPurgeReceiptTable.request_id, input.proposal.requestID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.request_fingerprint !== input.proposal.requestFingerprint ||
        existing.deletion_request_id !== input.proposal.deletionRequestID
      ) {
        return yield* new InvocationConflictError({ requestID: input.proposal.requestID })
      }
      return {
        type: "replayed",
        settlement: decodePurgeReceipt(existing),
        settlementBytes: existing.settlement,
      }
    }

    const prior = yield* tx
      .select()
      .from(SessionDeletionPurgeReceiptTable)
      .where(eq(SessionDeletionPurgeReceiptTable.deletion_request_id, input.proposal.deletionRequestID))
      .get()
      .pipe(Effect.orDie)
    if (prior) {
      return {
        type: "already_purged",
        settlement: decodePurgeReceipt(prior),
        settlementBytes: prior.settlement,
      }
    }

    const receipt = yield* tx
      .select({
        requestID: SessionDeletionControlReceiptTable.request_id,
        rootSessionID: SessionDeletionControlReceiptTable.root_session_id,
      })
      .from(SessionDeletionControlReceiptTable)
      .where(eq(SessionDeletionControlReceiptTable.request_id, input.proposal.deletionRequestID))
      .get()
      .pipe(Effect.orDie)
    if (!receipt || receipt.rootSessionID !== input.proposal.rootSessionID) {
      return yield* new InvocationConflictError({ requestID: input.proposal.requestID })
    }

    const bundle = yield* tx
      .select({ id: SessionDeletionAuditBundleTable.id })
      .from(SessionDeletionAuditBundleTable)
      .where(eq(SessionDeletionAuditBundleTable.deletion_request_id, input.proposal.deletionRequestID))
      .get()
      .pipe(Effect.orDie)
    if (!bundle || bundle.id !== input.proposal.auditBundleID) {
      return yield* new AuditNotAvailableError({ rootSessionID: input.proposal.rootSessionID })
    }

    const settlement = {
      schemaVersion: 1,
      requestID: input.proposal.requestID,
      requestFingerprint: input.proposal.requestFingerprint,
      deletionRequestID: input.proposal.deletionRequestID,
      outcome: "applied",
      purgeTime: input.purgeTime,
    } satisfies AppliedPurgeSettlement
    const settlementBytes = stableStringify(settlement)
    yield* tx
      .insert(SessionDeletionPurgeReceiptTable)
      .values({
        request_id: settlement.requestID,
        request_fingerprint: settlement.requestFingerprint,
        settlement_schema_version: settlement.schemaVersion,
        deletion_request_id: settlement.deletionRequestID,
        outcome: settlement.outcome,
        purge_time: settlement.purgeTime,
        settlement: settlementBytes,
        settlement_fingerprint: fingerprintBytes(settlementBytes),
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .delete(SessionDeletionAuditBundleTable)
      .where(eq(SessionDeletionAuditBundleTable.id, bundle.id))
      .run()
      .pipe(Effect.orDie)
    return { type: "applied", settlement, settlementBytes }
  })
}

export function readProjection(
  tx: Transaction,
  rootSessionID: SessionSchema.ID,
): Effect.Effect<ReadProjection, AuditProjectionError> {
  return Effect.gen(function* () {
    const status = yield* readStatus(tx, rootSessionID)
    if (status.type === "live") return { schemaVersion: 1, state: "live" } as const
    if (status.type === "missing") return { schemaVersion: 1, state: "missing" } as const
    if (!status.auditAvailable) {
      if (status.settlement.mode === "minimal_audit" && !status.auditPurged) {
        return yield* new AuditProjectionError({
          rootSessionID,
          reason: "minimal-audit deletion has neither an audit bundle nor a purge receipt",
        })
      }
      return {
        schemaVersion: 1,
        state: status.settlement.mode === "full" ? "deleted_full" : "deleted_minimal_audit_purged",
        settlement: status.settlement,
        settlementBytes: status.settlementBytes,
        auditAvailable: false,
      } as const
    }

    const bundle = yield* tx
      .select()
      .from(SessionDeletionAuditBundleTable)
      .where(eq(SessionDeletionAuditBundleTable.deletion_request_id, status.settlement.requestID))
      .get()
      .pipe(Effect.orDie)
    if (!bundle) {
      return yield* new AuditProjectionError({ rootSessionID, reason: "advertised audit bundle is unavailable" })
    }
    const operations = yield* tx
      .select()
      .from(SessionDeletionAuditOperationTable)
      .where(eq(SessionDeletionAuditOperationTable.bundle_id, bundle.id))
      .orderBy(asc(SessionDeletionAuditOperationTable.ordinal))
      .all()
      .pipe(Effect.orDie)
    const records = yield* tx
      .select()
      .from(SessionDeletionAuditRecordTable)
      .where(eq(SessionDeletionAuditRecordTable.bundle_id, bundle.id))
      .orderBy(
        asc(SessionDeletionAuditRecordTable.operation_id),
        asc(SessionDeletionAuditRecordTable.owner_kind),
        asc(SessionDeletionAuditRecordTable.record_id),
        asc(SessionDeletionAuditRecordTable.revision_id),
        asc(SessionDeletionAuditRecordTable.revision_version),
      )
      .all()
      .pipe(Effect.orDie)
    const sealedOperations = operations.map((operation) => ({
      operationID: operation.operation_id,
      ordinal: operation.ordinal,
      terminalStatus: operation.terminal_status,
    }))
    const sealedRelations = operations.flatMap((operation) =>
      records
        .filter((record) => record.operation_id === operation.operation_id)
        .sort((left, right) =>
          [left.owner_kind, left.record_id, left.revision_id, left.revision_version]
            .join("\u0000")
            .localeCompare(
              [right.owner_kind, right.record_id, right.revision_id, right.revision_version].join("\u0000"),
            ),
        )
        .map((record) => ({
          operationID: operation.operation_id,
          ownerKind: record.owner_kind,
          recordID: record.record_id,
          revisionID: record.revision_id,
          revisionVersion: record.revision_version,
          contextClassification: record.context_classification,
          exactRead: record.exact_read,
          typedCitation: record.typed_citation,
        })),
    )
    if (
      bundle.projection_schema_version !== 1 ||
      bundle.deletion_time !== status.settlement.deletionTime ||
      bundle.session_bodies_deleted !== true ||
      operations.length !== bundle.operation_count ||
      records.length !== bundle.relation_count ||
      operations.some((operation, index) => operation.ordinal !== index) ||
      fingerprint(sealedOperations) !== bundle.operation_fingerprint ||
      fingerprint(sealedRelations) !== bundle.relation_fingerprint
    ) {
      return yield* new AuditProjectionError({ rootSessionID, reason: "stored audit coverage does not match its seal" })
    }
    return {
      schemaVersion: 1,
      state: "deleted_minimal_audit",
      settlement: status.settlement,
      settlementBytes: status.settlementBytes,
      auditAvailable: true,
      audit: {
        schemaVersion: 1,
        bundleID: bundle.id,
        operationCount: bundle.operation_count,
        operationFingerprint: bundle.operation_fingerprint,
        relationCount: bundle.relation_count,
        relationFingerprint: bundle.relation_fingerprint,
        deletionTime: bundle.deletion_time,
        sessionBodiesDeleted: true,
        operations: operations.map((operation) => ({
          operationID: operation.operation_id,
          ordinal: operation.ordinal,
          terminalStatus: operation.terminal_status,
          records: records
            .filter((record) => record.operation_id === operation.operation_id)
            .map((record) => ({
              ownerKind: record.owner_kind,
              recordID: record.record_id,
              revisionID: record.revision_id,
              revisionVersion: record.revision_version,
              contextClassification: record.context_classification,
              exactRead: record.exact_read,
              typedCitation: record.typed_citation,
            })),
        })),
      },
    } as const
  })
}

export function readAuditForRecord(
  tx: Transaction,
  input: Readonly<{
    ownerKind: OwnerKind
    recordID: string
    revisionID: string
    revisionVersion: number
  }>,
) {
  return tx
    .select({
      bundleID: SessionDeletionAuditRecordTable.bundle_id,
      operationID: SessionDeletionAuditRecordTable.operation_id,
      contextClassification: SessionDeletionAuditRecordTable.context_classification,
      exactRead: SessionDeletionAuditRecordTable.exact_read,
      typedCitation: SessionDeletionAuditRecordTable.typed_citation,
      terminalStatus: SessionDeletionAuditOperationTable.terminal_status,
      deletionTime: SessionDeletionAuditBundleTable.deletion_time,
      sessionBodiesDeleted: SessionDeletionAuditBundleTable.session_bodies_deleted,
    })
    .from(SessionDeletionAuditRecordTable)
    .innerJoin(
      SessionDeletionAuditOperationTable,
      and(
        eq(SessionDeletionAuditOperationTable.bundle_id, SessionDeletionAuditRecordTable.bundle_id),
        eq(SessionDeletionAuditOperationTable.operation_id, SessionDeletionAuditRecordTable.operation_id),
      ),
    )
    .innerJoin(
      SessionDeletionAuditBundleTable,
      eq(SessionDeletionAuditBundleTable.id, SessionDeletionAuditRecordTable.bundle_id),
    )
    .where(
      and(
        eq(SessionDeletionAuditRecordTable.owner_kind, input.ownerKind),
        eq(SessionDeletionAuditRecordTable.record_id, input.recordID),
        eq(SessionDeletionAuditRecordTable.revision_id, input.revisionID),
        eq(SessionDeletionAuditRecordTable.revision_version, input.revisionVersion),
      ),
    )
    .orderBy(asc(SessionDeletionAuditBundleTable.deletion_time), asc(SessionDeletionAuditRecordTable.operation_id))
    .all()
    .pipe(Effect.orDie)
}

export function deriveAuditProjection(
  tx: Transaction,
  sessionIDs: readonly SessionSchema.ID[],
  time: number,
): Effect.Effect<AuditProjection, Error> {
  return Effect.gen(function* () {
    const operations = yield* TurnLineage.ensureSessionCoverage(tx, sessionIDs, time)
    return {
      schemaVersion: 1,
      operations: yield* Effect.forEach(
        operations,
        (operation) =>
          Effect.gen(function* () {
            if (operation.state === "running") {
              throw new Error(`Model operation ${operation.assistant_message_id} is not terminal`)
            }
            const [context, relations] = yield* Effect.all([
              TurnLineage.contextRecords(tx, operation.assistant_message_id),
              tx
                .select()
                .from(TurnLineageRecordRelationTable)
                .where(eq(TurnLineageRecordRelationTable.assistant_message_id, operation.assistant_message_id))
                .all()
                .pipe(Effect.orDie),
            ])
            const records = new Map<string, AuditRecord>()
            for (const record of context) {
              records.set(auditRecordKey(record), {
                ownerKind: record.ownerKind,
                recordID: record.recordID,
                revisionID: record.revisionID,
                revisionVersion: record.revisionVersion,
                contextClassification: record.contextClassification,
                exactRead: false,
                typedCitation: false,
              })
            }
            for (const relation of relations) {
              const key = auditRecordKey({
                ownerKind: relation.owner_kind,
                recordID: relation.record_id,
                revisionID: relation.revision_id,
                revisionVersion: relation.revision_version,
              })
              const prior = records.get(key)
              records.set(key, {
                ownerKind: relation.owner_kind,
                recordID: relation.record_id,
                revisionID: relation.revision_id,
                revisionVersion: relation.revision_version,
                contextClassification: prior?.contextClassification ?? "not_entered",
                exactRead: prior?.exactRead === true || relation.relation_kind === "exact_read",
                typedCitation: prior?.typedCitation === true || relation.relation_kind === "typed_citation",
              })
            }
            return {
              assistantMessageID: operation.assistant_message_id,
              terminalStatus: operation.state,
              records: [...records.values()].sort((left, right) =>
                auditRecordKey(left).localeCompare(auditRecordKey(right)),
              ),
            } satisfies AuditOperation
          }),
        { concurrency: 1 },
      ),
    }
  })
}

function persistAudit(
  tx: Transaction,
  deletionRequestID: RequestID,
  deletionTime: number,
  projection: AuditProjection,
) {
  return Effect.gen(function* () {
    if (projection.schemaVersion !== 1) throw new Error("Unsupported Session deletion audit projection version")
    const operations = [...projection.operations].sort((left, right) =>
      left.assistantMessageID.localeCompare(right.assistantMessageID),
    )
    const storedOperations = operations.map((operation, ordinal) => ({
      operation,
      operationID: createAuditOperationID(),
      ordinal,
      records: [...operation.records].sort((left, right) =>
        auditRecordKey(left).localeCompare(auditRecordKey(right)),
      ),
    }))
    const operationProjection = storedOperations.map((operation) => ({
      operationID: operation.operationID,
      ordinal: operation.ordinal,
      terminalStatus: operation.operation.terminalStatus,
    }))
    const relationProjection = storedOperations.flatMap((operation) =>
      operation.records.map((record) => ({ operationID: operation.operationID, ...record })),
    )
    const bundleID = createAuditBundleID()
    yield* tx
      .insert(SessionDeletionAuditBundleTable)
      .values({
        id: bundleID,
        deletion_request_id: deletionRequestID,
        projection_schema_version: projection.schemaVersion,
        operation_count: storedOperations.length,
        operation_fingerprint: fingerprint(operationProjection),
        relation_count: relationProjection.length,
        relation_fingerprint: fingerprint(relationProjection),
        deletion_time: deletionTime,
        session_bodies_deleted: true,
      })
      .run()
      .pipe(Effect.orDie)

    yield* Effect.forEach(
      storedOperations,
      ({ operation, operationID, ordinal, records }) => {
        return Effect.gen(function* () {
          yield* tx
            .insert(SessionDeletionAuditOperationTable)
            .values({
              bundle_id: bundleID,
              operation_id: operationID,
              ordinal,
              terminal_status: operation.terminalStatus,
            })
            .run()
            .pipe(Effect.orDie)
          if (records.length === 0) return
          yield* tx
            .insert(SessionDeletionAuditRecordTable)
            .values(
              records.map((record) => ({
                bundle_id: bundleID,
                operation_id: operationID,
                owner_kind: record.ownerKind,
                record_id: record.recordID,
                revision_id: record.revisionID,
                revision_version: record.revisionVersion,
                context_classification: record.contextClassification,
                exact_read: record.exactRead,
                typed_citation: record.typedCitation,
              })),
            )
            .run()
            .pipe(Effect.orDie)
        })
      },
      { discard: true },
    )
  })
}

function verifyProposal(proposal: Proposal) {
  const ordered = canonicalTargetDescriptor(proposal.rootSessionID, proposal.targets)
  if (
    proposal.schemaVersion !== 1 ||
    ordered.length === 0 ||
    ordered.length !== proposal.targets.length ||
    ordered[0]?.sessionID !== proposal.rootSessionID ||
    proposal.subtreeCount !== ordered.length ||
    proposal.subtreeFingerprint !== targetFingerprint(proposal.rootSessionID, ordered) ||
    proposal.requestFingerprint !==
      requestFingerprint({ rootSessionID: proposal.rootSessionID, targets: ordered, mode: proposal.mode })
  ) {
    throw new Error("Invalid Session deletion proposal binding")
  }
}

function verifyPurgeProposal(proposal: PurgeProposal) {
  if (
    proposal.schemaVersion !== 1 ||
    proposal.requestFingerprint !==
      purgeRequestFingerprint({
        rootSessionID: proposal.rootSessionID,
        deletionRequestID: proposal.deletionRequestID,
        auditBundleID: proposal.auditBundleID,
      })
  ) {
    throw new Error("Invalid Session deletion audit-purge proposal binding")
  }
}

function auditRecordKey(record: Pick<AuditRecord, "ownerKind" | "recordID" | "revisionID" | "revisionVersion">) {
  return [record.ownerKind, record.recordID, record.revisionID, record.revisionVersion].join("\u0000")
}

function statusForReceipt(tx: Transaction, receipt: ControlReceiptRow) {
  return Effect.gen(function* () {
    const [live, bundle, purge] = yield* Effect.all([
      tx
        .select({ id: SessionTable.id })
        .from(SessionTable)
        .where(eq(SessionTable.id, receipt.root_session_id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ id: SessionDeletionAuditBundleTable.id })
        .from(SessionDeletionAuditBundleTable)
        .where(eq(SessionDeletionAuditBundleTable.deletion_request_id, receipt.request_id))
        .get()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(SessionDeletionPurgeReceiptTable)
        .where(eq(SessionDeletionPurgeReceiptTable.deletion_request_id, receipt.request_id))
        .get()
        .pipe(Effect.orDie),
    ])
    if (live) throw new Error(`Retired Session ${receipt.root_session_id} also has a live Session row`)
    if (receipt.mode === "full" && (bundle || purge)) {
      throw new Error(`Full deletion ${receipt.request_id} retained an illegal audit state`)
    }
    if (receipt.mode === "minimal_audit" && Boolean(bundle) === Boolean(purge)) {
      throw new Error(`Minimal-audit deletion ${receipt.request_id} must have exactly one audit lifecycle state`)
    }
    if (purge) decodePurgeReceipt(purge)
    return {
      type: "deleted",
      settlement: decodeControlReceipt(receipt),
      settlementBytes: receipt.settlement,
      auditAvailable: Boolean(bundle),
      auditPurged: Boolean(purge),
    } as const
  })
}

function fingerprint(value: unknown) {
  return fingerprintBytes(stableStringify(value))
}

function fingerprintBytes(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`
}
