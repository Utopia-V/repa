import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import { SessionTable } from "../session/sql"
import type { SessionSchema } from "../session/schema"
import {
  SessionDeletionAuditBundleTable,
  SessionDeletionAuditOperationTable,
  SessionDeletionAuditRecordTable,
  SessionDeletionControlReceiptTable,
  SessionDeletionPurgeReceiptTable,
  type ControlReceiptRow,
  type PurgeReceiptRow,
} from "./sql"
import { decodeAppliedPurgeSettlement, decodeAppliedSettlement } from "./schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export function decodeControlReceipt(receipt: ControlReceiptRow) {
  if (fingerprintBytes(receipt.settlement) !== receipt.settlement_fingerprint) {
    throw new Error(`Session deletion receipt ${receipt.request_id} has an invalid settlement fingerprint`)
  }
  const settlement = decodeAppliedSettlement(JSON.parse(receipt.settlement))
  if (
    settlement.requestID !== receipt.request_id ||
    settlement.requestFingerprint !== receipt.request_fingerprint ||
    settlement.rootSessionID !== receipt.root_session_id ||
    settlement.subtreeCount !== receipt.subtree_count ||
    settlement.subtreeFingerprint !== receipt.subtree_fingerprint ||
    settlement.mode !== receipt.mode ||
    settlement.permissionDecisionFingerprint !== receipt.permission_decision_fingerprint ||
    settlement.deletionTime !== receipt.deletion_time
  ) {
    throw new Error(`Session deletion receipt ${receipt.request_id} does not match its settlement bytes`)
  }
  return settlement
}

export function decodePurgeReceipt(receipt: PurgeReceiptRow) {
  if (fingerprintBytes(receipt.settlement) !== receipt.settlement_fingerprint) {
    throw new Error(`Session deletion purge receipt ${receipt.request_id} has an invalid settlement fingerprint`)
  }
  const settlement = decodeAppliedPurgeSettlement(JSON.parse(receipt.settlement))
  if (
    settlement.requestID !== receipt.request_id ||
    settlement.requestFingerprint !== receipt.request_fingerprint ||
    settlement.deletionRequestID !== receipt.deletion_request_id ||
    settlement.purgeTime !== receipt.purge_time
  ) {
    throw new Error(`Session deletion purge receipt ${receipt.request_id} does not match its settlement bytes`)
  }
  return settlement
}

export function assertStoredIntegrity(tx: Transaction, rootSessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const receipt = yield* tx
      .select()
      .from(SessionDeletionControlReceiptTable)
      .where(eq(SessionDeletionControlReceiptTable.root_session_id, rootSessionID))
      .get()
      .pipe(Effect.orDie)
    if (!receipt) throw new Error(`Session deletion receipt for ${rootSessionID} is unavailable`)
    const settlement = decodeControlReceipt(receipt)
    const [live, bundle, purge] = yield* Effect.all([
      tx.select({ id: SessionTable.id }).from(SessionTable).where(eq(SessionTable.id, rootSessionID)).get().pipe(Effect.orDie),
      tx
        .select()
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
    if (live) throw new Error(`Retired Session ${rootSessionID} also has a live Session row`)
    if (receipt.mode === "full" && (bundle || purge)) {
      throw new Error(`Full deletion ${receipt.request_id} retained an illegal audit state`)
    }
    if (receipt.mode === "minimal_audit" && Boolean(bundle) === Boolean(purge)) {
      throw new Error(`Minimal-audit deletion ${receipt.request_id} must have exactly one audit lifecycle state`)
    }
    if (purge) decodePurgeReceipt(purge)
    if (!bundle) return

    const [operations, records] = yield* Effect.all([
      tx
        .select()
        .from(SessionDeletionAuditOperationTable)
        .where(eq(SessionDeletionAuditOperationTable.bundle_id, bundle.id))
        .orderBy(asc(SessionDeletionAuditOperationTable.ordinal))
        .all()
        .pipe(Effect.orDie),
      tx
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
        .pipe(Effect.orDie),
    ])
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
            .localeCompare([right.owner_kind, right.record_id, right.revision_id, right.revision_version].join("\u0000")),
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
      bundle.deletion_time !== settlement.deletionTime ||
      bundle.session_bodies_deleted !== true ||
      operations.length !== bundle.operation_count ||
      records.length !== bundle.relation_count ||
      operations.some((operation, index) => operation.ordinal !== index) ||
      fingerprint(sealedOperations) !== bundle.operation_fingerprint ||
      fingerprint(sealedRelations) !== bundle.relation_fingerprint
    ) {
      throw new Error(`Session deletion audit ${bundle.id} does not match its sealed coverage`)
    }
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
