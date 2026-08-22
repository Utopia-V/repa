export * as LearningInspection from "./learning-inspection"
export { METADATA_KEY, isProjection } from "./learning-inspection-schema"
export type { DeletionAuditItem, Fact, LineageItem, OwnerArm, Projection } from "./learning-inspection-schema"

import { and, asc, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "./database/database"
import { LearnerHomeIdentity } from "./database/identity"
import {
  FutureAttentionClaimFinalizationTable,
  FutureAttentionClaimGroupTable,
  FutureAttentionClaimMemberTable,
} from "./future-attention/sql"
import { LearningContext } from "./learning-context"
import { LearningFrontier } from "./learning-frontier"
import { inspectionOwnerKind } from "./learning-inspection-owner"
import { FutureAttention } from "./future-attention"
import { SessionDeletion } from "./session-deletion"
import { SessionPresentation } from "./session-presentation"
import {
  SessionAdministrativeHistoryMessageTable,
  SessionAdministrativeHistoryPartTable,
  SessionAdministrativeHistoryTable,
  SessionPresentationFrontierTable,
} from "./session-presentation/sql"
import {
  SessionDeletionAuditBundleTable,
  SessionDeletionAuditOperationTable,
  SessionDeletionAuditRecordTable,
  SessionDeletionControlReceiptTable,
  TurnLineageContextRelationTable,
  TurnLineageRecordRelationTable,
} from "./session-deletion/sql"
import type { OwnerKind } from "./session-deletion/schema"
import { MessageTable, PartTable } from "./session/sql"
import { SessionSchema } from "./session/schema"
import {
  TurnCandidatePresentationTable,
  TurnModelOperationTable,
  TurnModelPresentationTable,
  TurnTable,
  TurnToolCandidateTable,
  TurnToolInvocationTable,
} from "./turn/sql"
import { TurnLineage, type ReadProjection, type RecordRevision } from "./turn-lineage"
import type {
  ContextCoverageItem,
  DeletionAuditItem,
  Fact,
  LineageItem,
  Projection,
} from "./learning-inspection-schema"
import {
  METADATA_KEY,
  createPageCursor,
  isProjection,
  readPageCursor,
  recordSetFingerprint,
  type PageCursor,
} from "./learning-inspection-schema"
import type { MessageID, PartID } from "./v1/session"
import type { Turn } from "@opencode-ai/schema/turn"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
const MAX_INTEGRITY_VALIDATION_ROWS = 2048
const MAX_LIVE_SCOPE_OPERATIONS = 64

export function composeRead(
  tx: Transaction,
  input: Readonly<{
    source: Readonly<{
      partID: PartID
      tool: string
      action: string
      assistantMessageID: MessageID
      turnID: Turn.ID
      inputID: Turn.InputID
    }>
    readProjection: ReadProjection
    limit: number
    cursor?: string
    deletionRootSessionID?: SessionSchema.ID
    owner: Omit<Projection["owner"], "kind" | "capabilityID" | "action" | "records">
  }>,
) {
  return Effect.gen(function* () {
    const [learnerHomeID, currentFrontier] = yield* Effect.all([
      LearnerHomeIdentity.read(tx),
      LearningFrontier.read(tx),
    ])
    const source = {
      learnerHomeID,
      partID: input.source.partID,
      tool: input.source.tool,
      action: input.source.action,
      assistantMessageID: input.source.assistantMessageID,
      turnID: input.source.turnID,
      inputID: input.source.inputID,
      observedFrontier: currentFrontier,
      currentFrontier,
    }
    const cursorFailure = (
      status: "stale_inspection" | "cursor_source_unavailable_or_unresolved" | "cursor_predecessor_conflict",
    ) =>
      ({
        schemaVersion: 1,
        status,
        source,
        owner: {
          ...input.owner,
          kind: input.readProjection.records[0]?.ownerKind ?? inspectionOwnerKind(input.owner.arm),
          capabilityID: input.source.tool,
          action: input.source.action,
          records: input.readProjection.records,
        },
        lineage: emptyLineage("partial", "integrity_unavailable"),
        deletionAudit: { status: "unknown", items: [], omitted: false },
        sessionDeletion: { status: "not_applicable" },
        administrativeHistory: emptyAdministrativeHistory("not_applicable"),
        nonCausality: "operational_lineage_not_per_record_answer_causality",
      }) satisfies Projection
    const cursor = input.cursor ? readPageCursor(input.cursor) : undefined
    if (input.cursor && (!cursor || cursor.targetFingerprint !== recordSetFingerprint(input.readProjection.records))) {
      return cursorFailure("stale_inspection")
    }
    if (cursor && input.cursor) {
      const verified = yield* verifyPageCursor(tx, cursor, input.cursor)
      if (verified === "source_unavailable") return cursorFailure("cursor_source_unavailable_or_unresolved")
      if (verified === "conflict") return cursorFailure("cursor_predecessor_conflict")
    }
    if (!TurnLineage.isReadProjection(input.readProjection, input.source.tool)) {
      return {
        schemaVersion: 1,
        status: "source_unavailable",
        source,
        owner: {
          ...input.owner,
          kind: inspectionOwnerKind(input.owner.arm),
          capabilityID: input.source.tool,
          action: input.source.action,
          records: [],
        },
        lineage: emptyLineage("partial", "integrity_unavailable"),
        deletionAudit: { status: "unknown", items: [], omitted: false },
        sessionDeletion: { status: "not_applicable" },
        administrativeHistory: emptyAdministrativeHistory("not_applicable"),
        nonCausality: "operational_lineage_not_per_record_answer_causality",
      } satisfies Projection
    }
    if (input.readProjection.records.length === 0) {
      return {
        schemaVersion: 1,
        status: "read_shape_unsupported",
        source,
        owner: {
          ...input.owner,
          kind: inspectionOwnerKind(input.owner.arm),
          capabilityID: input.source.tool,
          action: input.source.action,
          records: [],
        },
        lineage: emptyLineage("non_atomic_search_incomplete", "continued_fresh_cut"),
        deletionAudit: { status: "unknown", items: [], omitted: false },
        sessionDeletion: { status: "not_applicable" },
        administrativeHistory: emptyAdministrativeHistory("not_applicable"),
        nonCausality: "operational_lineage_not_per_record_answer_causality",
      } satisfies Projection
    }
    const ownerKinds = new Set(input.readProjection.records.map((record) => record.ownerKind))
    if (ownerKinds.size !== 1) throw new Error("One inspection section cannot compose several owner kinds")
    const [lineage, deletionAudit, sessionDeletion, administrativeHistory] = yield* Effect.all([
      readLiveLineage(
        tx,
        input.readProjection.records,
        input.limit,
        input.source.assistantMessageID,
        input.source.partID,
        cursor?.section === "live_lineage" ? cursor.after : undefined,
      ),
      readDeletionAudit(
        tx,
        input.readProjection.records,
        input.limit,
        input.source.partID,
        cursor?.section === "deletion_audit" ? cursor.after : undefined,
        input.deletionRootSessionID,
      ),
      readSessionDeletion(tx, input.readProjection.records),
      readAdministrativeHistory(
        tx,
        input.readProjection.records,
        input.limit,
        input.source.partID,
        cursor?.section === "administrative_history" ? cursor.after : undefined,
      ),
    ])
    return {
      schemaVersion: 1,
      status:
        deletionAudit.status === "cursor_scope_conflict"
          ? "stale_inspection"
          : lineage.coverage === "integrity_validation_unavailable" ||
              deletionAudit.status === "integrity_validation_unavailable" ||
              sessionDeletion.status === "integrity_validation_unavailable" ||
              administrativeHistory.status === "integrity_validation_unavailable"
            ? "integrity_validation_unavailable"
            : "available",
      source,
      owner: {
        ...input.owner,
        kind: input.readProjection.records[0]!.ownerKind,
        capabilityID: input.source.tool,
        action: input.source.action,
        records: input.readProjection.records,
      },
      lineage,
      deletionAudit,
      sessionDeletion,
      administrativeHistory,
      nonCausality: "operational_lineage_not_per_record_answer_causality",
    } satisfies Projection
  })
}

export function composeOperationControlRead(
  tx: Transaction,
  input: Readonly<{
    source: Readonly<{
      partID: PartID
      tool: string
      action: string
      assistantMessageID: MessageID
      turnID: Turn.ID
      inputID: Turn.InputID
    }>
    owner: Omit<Projection["owner"], "kind" | "capabilityID" | "action" | "records">
    arm: "learning_context" | "retained_steering"
  }>,
) {
  return Effect.gen(function* () {
    const [learnerHomeID, currentFrontier, cut] = yield* Effect.all([
      LearnerHomeIdentity.read(tx),
      LearningFrontier.read(tx),
      LearningContext.readCut(tx, input.source.assistantMessageID),
    ])
    const source = {
      learnerHomeID,
      partID: input.source.partID,
      tool: input.source.tool,
      action: input.source.action,
      assistantMessageID: input.source.assistantMessageID,
      turnID: input.source.turnID,
      inputID: input.source.inputID,
      observedFrontier: currentFrontier,
      currentFrontier,
    }
    if (cut.type !== "available") {
      return {
        schemaVersion: 1,
        status: cut.type === "not_found" ? "not_found" : "source_unavailable",
        source,
        owner: {
          ...input.owner,
          kind: inspectionOwnerKind(input.arm),
          capabilityID: input.source.tool,
          action: input.source.action,
          records: [],
        },
        lineage: emptyLineage("non_atomic_search_incomplete", "continued_fresh_cut"),
        deletionAudit: { status: "unknown", items: [], omitted: false },
        sessionDeletion: { status: "not_applicable" },
        administrativeHistory: emptyAdministrativeHistory("not_applicable"),
        nonCausality: "operational_lineage_not_per_record_answer_causality",
      } satisfies Projection
    }
    const facts =
      input.arm === "learning_context"
        ? [
            { label: "Context operation", value: cut.cut.operation.assistantMessageID },
            { label: "Context cut", value: cut.cut.fingerprint },
            { label: "Context time", value: String(cut.cut.cutAsOf) },
            {
              label: "Context versions",
              value: `${cut.cut.schemaVersion}/${cut.cut.policyVersion}/${cut.cut.rendererVersion}`,
            },
          ]
        : [
            { label: "Steering operation", value: cut.cut.retainedSteering.assistantMessageID },
            { label: "Steering cut", value: cut.cut.retainedSteering.fingerprint },
            { label: "Steering cut time", value: String(cut.cut.retainedSteering.cutAsOf) },
            {
              label: "Policy history",
              value: "General retained-steering policy/history inspection remains read_shape_unsupported.",
            },
          ]
    return {
      schemaVersion: 1,
      status: "available",
      source,
      owner: {
        ...input.owner,
        kind: inspectionOwnerKind(input.arm),
        capabilityID: input.source.tool,
        action: input.source.action,
        records: [],
        facts: [...input.owner.facts, ...facts],
      },
      lineage: {
        coverage: "non_atomic_search_incomplete",
        scope: { status: "continued_fresh_cut", operationCount: 0, terminalSealedCount: 0 },
        contextCoverage:
          input.arm === "learning_context"
            ? cut.cut.sections.map((section) => ({
                assistantMessageID: cut.cut.operation.assistantMessageID,
                sectionOwner: section.owner,
                coverage: section.coverage,
                countAtCut: section.countAtCut,
                omission: section.omission,
                targetRecordCount: 0,
              }))
            : [],
        items: [],
        omitted: false,
        pendingGap: false,
      },
      deletionAudit: { status: "unknown", items: [], omitted: false },
      sessionDeletion: { status: "not_applicable" },
      administrativeHistory: emptyAdministrativeHistory("not_applicable"),
      nonCausality: "operational_lineage_not_per_record_answer_causality",
    } satisfies Projection
  })
}

function verifyPageCursor(tx: Transaction, cursor: PageCursor, exactCursor: string) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ id: PartTable.id, messageID: PartTable.message_id, data: PartTable.data })
      .from(PartTable)
      .where(eq(PartTable.id, cursor.predecessorPartID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return "source_unavailable" as const
    const data: unknown = row.data
    const state = isRecord(data) && isRecord(data.state) ? data.state : undefined
    const metadata = state && isRecord(state.metadata) ? state.metadata : undefined
    const projection = metadata?.[METADATA_KEY]
    if (
      !isRecord(data) ||
      data.type !== "tool" ||
      state?.status !== "completed" ||
      typeof data.tool !== "string" ||
      !isProjection(projection) ||
      projection.source.partID !== row.id ||
      projection.source.assistantMessageID !== row.messageID ||
      projection.source.tool !== data.tool
    ) {
      return "conflict" as const
    }
    const stored =
      cursor.section === "live_lineage"
        ? projection.lineage.cursor
        : cursor.section === "deletion_audit"
          ? projection.deletionAudit.cursor
          : projection.administrativeHistory.cursor
    return stored === exactCursor ? ("verified" as const) : ("conflict" as const)
  })
}

function readLiveLineage(
  tx: Transaction,
  records: readonly RecordRevision[],
  limit: number,
  excludeAssistantMessageID?: MessageID,
  predecessorPartID?: PartID,
  afterAssistantMessageID?: string,
) {
  return Effect.gen(function* () {
    const queries = liveLineageQuerySet(tx, {
      records,
      limit,
      excludeAssistantMessageID,
      afterAssistantMessageID,
    })
    const [context, relations, finiteScope] = yield* Effect.all([
      queries.context.all().pipe(Effect.orDie),
      queries.relations.all().pipe(Effect.orDie),
      afterAssistantMessageID
        ? Effect.succeed(
            [] as readonly {
              operation: typeof TurnModelOperationTable.$inferSelect
              turn: typeof TurnTable.$inferSelect
            }[],
          )
        : queries.finiteScope.all().pipe(Effect.orDie),
    ])
    const positiveOperations = new Map(
      [...context, ...relations].map((row) => [row.operation.assistant_message_id, row.operation] as const),
    )
    const scopeOverBudget = finiteScope.length > MAX_LIVE_SCOPE_OPERATIONS
    const scopeRows = finiteScope.slice(0, MAX_LIVE_SCOPE_OPERATIONS)
    const validationRows = afterAssistantMessageID
      ? [...new Map([...context, ...relations].map((row) => [row.operation.assistant_message_id, row])).values()]
      : scopeRows
    const validation = yield* Effect.forEach(
      validationRows,
      (row) =>
        Effect.gen(function* () {
          const contextProjection = yield* TurnLineage.assertContextCoverage(
            tx,
            row.operation.assistant_message_id,
          ).pipe(
            Effect.map((projection) => ({ type: "available" as const, projection })),
            Effect.catchCause(() => Effect.succeed({ type: "invalid" as const })),
          )
          if (contextProjection.type === "invalid") {
            return { type: "context_invalid" as const, operation: row.operation }
          }
          const cut = yield* LearningContext.readCut(tx, row.operation.assistant_message_id).pipe(
            Effect.catchCause(() =>
              Effect.succeed({ type: "not_found" as const, assistantMessageID: row.operation.assistant_message_id }),
            ),
          )
          if (cut.type !== "available") return { type: "context_invalid" as const, operation: row.operation }
          const contextCoverage = contextCoverageItem(
            row.operation.assistant_message_id,
            records,
            contextProjection.projection,
            cut.cut,
          )
          if (row.operation.state === "running") {
            return { type: "pending" as const, operation: row.operation, contextCoverage }
          }
          const sealed = yield* TurnLineage.assertOperationCoverage(tx, row.operation.assistant_message_id).pipe(
            Effect.as(true),
            Effect.catchCause(() => Effect.succeed(false)),
          )
          return sealed
            ? { type: "sealed" as const, operation: row.operation, contextCoverage }
            : { type: "unsealed" as const, operation: row.operation, contextCoverage }
        }),
      { concurrency: 1 },
    )
    if (validation.some((item) => item.type === "context_invalid")) {
      return {
        coverage: "integrity_validation_unavailable",
        scope: {
          status: "integrity_unavailable",
          operationCount: validation.length,
          terminalSealedCount: validation.filter((item) => item.type === "sealed").length,
        },
        contextCoverage: [],
        items: [],
        omitted: false,
        pendingGap: false,
      } satisfies Projection["lineage"]
    }
    const rows = new Map<string, LineageItem>()
    context.forEach((row) => {
      const record = contextRecord(row.relation)
      rows.set(lineageKey(row.operation.assistant_message_id, record), {
        ...operationItem(row.operation, row.turn, record),
        contextClassification: row.relation.context_classification,
        exactRead: false,
        typedCitation: false,
      })
    })
    relations.forEach((row) => {
      const record = relationRecord(row.relation)
      const key = lineageKey(row.operation.assistant_message_id, record)
      const current = rows.get(key) ?? {
        ...operationItem(row.operation, row.turn, record),
        contextClassification: "not_entered" as const,
        exactRead: false,
        typedCitation: false,
      }
      rows.set(key, {
        ...current,
        exactRead: current.exactRead || row.relation.relation_kind === "exact_read",
        typedCitation: current.typedCitation || row.relation.relation_kind === "typed_citation",
      })
    })
    const ordered = [...rows.values()].toSorted((left, right) =>
      left.assistantMessageID === right.assistantMessageID
        ? recordKey(left.record).localeCompare(recordKey(right.record))
        : left.assistantMessageID.localeCompare(right.assistantMessageID),
    )
    const operationIDs = [...new Set(ordered.map((item) => item.assistantMessageID))]
    const selectedIDs = new Set(operationIDs.slice(0, limit))
    const selected = ordered.filter((item) => selectedIDs.has(item.assistantMessageID))
    const augmented = yield* Effect.forEach(selected, (item) => augmentLineageItem(tx, item), { concurrency: 1 })
    if (augmented.some((item) => item.type === "integrity_unavailable")) {
      return {
        coverage: "integrity_validation_unavailable",
        scope: {
          status: "integrity_unavailable",
          operationCount: validation.length,
          terminalSealedCount: validation.filter((item) => item.type === "sealed").length,
        },
        contextCoverage: validation.flatMap((item) => (item.type === "context_invalid" ? [] : [item.contextCoverage])),
        items: [],
        omitted: false,
        pendingGap: false,
      } satisfies Projection["lineage"]
    }
    const items = augmented.flatMap((item) => (item.type === "item" ? [item.item] : []))
    const omitted =
      operationIDs.length > limit ||
      context.length === (limit + 1) * Math.max(1, records.length) ||
      relations.length === (limit + 1) * Math.max(1, records.length) * 2
    const pendingGap = items.some((item) => item.operationState === "running")
    const last = items.at(-1)?.assistantMessageID
    const scopeStatus = afterAssistantMessageID
      ? ("continued_fresh_cut" as const)
      : scopeOverBudget
        ? ("over_budget" as const)
        : validation.some((item) => item.type === "pending")
          ? ("pending" as const)
          : validation.some((item) => item.type === "unsealed")
            ? ("unsealed" as const)
            : ("complete" as const)
    const coverage = afterAssistantMessageID
      ? "non_atomic_search_incomplete"
      : scopeOverBudget
        ? "scope_over_budget"
        : scopeStatus === "pending"
          ? "pending_interaction_gap"
          : scopeStatus === "unsealed"
            ? "unsealed_gap"
            : omitted
              ? "partial"
              : items.length === 0
                ? "complete_negative"
                : "complete_page"
    return {
      coverage,
      scope: {
        status: scopeStatus,
        operationCount: afterAssistantMessageID ? positiveOperations.size : finiteScope.length,
        terminalSealedCount: validation.filter((item) => item.type === "sealed").length,
      },
      contextCoverage: validation.flatMap((item) => (item.type === "context_invalid" ? [] : [item.contextCoverage])),
      items,
      omitted,
      pendingGap: pendingGap || scopeStatus === "pending",
      ...(omitted && last && predecessorPartID
        ? { cursor: createPageCursor("live_lineage", predecessorPartID, records, last) }
        : {}),
    } satisfies Projection["lineage"]
  })
}

export function liveLineageQuerySet(
  tx: Transaction,
  input: Readonly<{
    records: readonly RecordRevision[]
    limit: number
    excludeAssistantMessageID?: MessageID
    afterAssistantMessageID?: string
  }>,
) {
  return {
    context: tx
      .select({ relation: TurnLineageContextRelationTable, operation: TurnModelOperationTable, turn: TurnTable })
      .from(TurnLineageContextRelationTable)
      .innerJoin(
        TurnModelOperationTable,
        eq(TurnModelOperationTable.assistant_message_id, TurnLineageContextRelationTable.assistant_message_id),
      )
      .innerJoin(TurnTable, eq(TurnTable.id, TurnModelOperationTable.turn_id))
      .where(
        and(
          or(...input.records.map(contextRecordCondition)),
          input.excludeAssistantMessageID
            ? ne(TurnLineageContextRelationTable.assistant_message_id, input.excludeAssistantMessageID)
            : undefined,
          input.afterAssistantMessageID
            ? sql`${TurnLineageContextRelationTable.assistant_message_id} > ${input.afterAssistantMessageID}`
            : undefined,
        ),
      )
      .orderBy(asc(TurnLineageContextRelationTable.assistant_message_id))
      .limit((input.limit + 1) * Math.max(1, input.records.length)),
    relations: tx
      .select({ relation: TurnLineageRecordRelationTable, operation: TurnModelOperationTable, turn: TurnTable })
      .from(TurnLineageRecordRelationTable)
      .innerJoin(
        TurnModelOperationTable,
        eq(TurnModelOperationTable.assistant_message_id, TurnLineageRecordRelationTable.assistant_message_id),
      )
      .innerJoin(TurnTable, eq(TurnTable.id, TurnModelOperationTable.turn_id))
      .where(
        and(
          or(...input.records.map(recordCondition)),
          input.excludeAssistantMessageID
            ? ne(TurnLineageRecordRelationTable.assistant_message_id, input.excludeAssistantMessageID)
            : undefined,
          input.afterAssistantMessageID
            ? sql`${TurnLineageRecordRelationTable.assistant_message_id} > ${input.afterAssistantMessageID}`
            : undefined,
        ),
      )
      .orderBy(asc(TurnLineageRecordRelationTable.assistant_message_id))
      .limit((input.limit + 1) * Math.max(1, input.records.length) * 2),
    finiteScope: tx
      .select({ operation: TurnModelOperationTable, turn: TurnTable })
      .from(TurnModelOperationTable)
      .innerJoin(TurnTable, eq(TurnTable.id, TurnModelOperationTable.turn_id))
      .where(
        input.excludeAssistantMessageID
          ? ne(TurnModelOperationTable.assistant_message_id, input.excludeAssistantMessageID)
          : undefined,
      )
      .orderBy(asc(TurnModelOperationTable.assistant_message_id))
      .limit(MAX_LIVE_SCOPE_OPERATIONS + 1),
  }
}

function readDeletionAudit(
  tx: Transaction,
  records: readonly RecordRevision[],
  limit: number,
  predecessorPartID: PartID,
  after?: string,
  rootSessionID?: SessionSchema.ID,
) {
  return Effect.gen(function* () {
    const cursor = after ? parseDeletionAfter(after) : undefined
    const invalidCursor = Boolean(after && !cursor)
    if (rootSessionID) {
      const rootStatus = yield* SessionDeletion.readStatus(tx, rootSessionID).pipe(
        Effect.map((value) => ({ type: "available" as const, value })),
        Effect.catchCause(() => Effect.succeed({ type: "invalid" as const })),
      )
      if (rootStatus.type === "invalid") {
        return {
          status: "integrity_validation_unavailable",
          items: [],
          omitted: false,
        } satisfies Projection["deletionAudit"]
      }
      if (
        rootStatus.value.type !== "deleted" ||
        rootStatus.value.settlement.mode !== "minimal_audit" ||
        !rootStatus.value.auditAvailable
      ) {
        return { status: "unknown", items: [], omitted: false } satisfies Projection["deletionAudit"]
      }
      const boundedBundle = yield* tx
        .select({
          id: SessionDeletionAuditBundleTable.id,
          deletionTime: SessionDeletionAuditBundleTable.deletion_time,
          operationCount: SessionDeletionAuditBundleTable.operation_count,
          relationCount: SessionDeletionAuditBundleTable.relation_count,
        })
        .from(SessionDeletionAuditBundleTable)
        .where(eq(SessionDeletionAuditBundleTable.deletion_request_id, rootStatus.value.settlement.requestID))
        .get()
        .pipe(Effect.orDie)
      if (!boundedBundle) {
        return {
          status: "integrity_validation_unavailable",
          items: [],
          omitted: false,
        } satisfies Projection["deletionAudit"]
      }
      if (boundedBundle.operationCount + boundedBundle.relationCount > MAX_INTEGRITY_VALIDATION_ROWS) {
        return {
          status: "integrity_validation_unavailable",
          items: [],
          omitted: false,
        } satisfies Projection["deletionAudit"]
      }
      const scope = {
        rootSessionID,
        bundleID: boundedBundle.id,
        deletionTime: boundedBundle.deletionTime,
      }
      if (
        invalidCursor ||
        (cursor &&
          (cursor.rootSessionID !== scope.rootSessionID ||
            cursor.bundleID !== scope.bundleID ||
            cursor.time !== scope.deletionTime))
      ) {
        return {
          status: "cursor_scope_conflict",
          scope,
          items: [],
          omitted: false,
        } satisfies Projection["deletionAudit"]
      }
      const projection = yield* SessionDeletion.readProjection(tx, rootSessionID).pipe(
        Effect.map((value) => ({ type: "available" as const, value })),
        Effect.catchCause(() => Effect.succeed({ type: "invalid" as const })),
      )
      if (projection.type === "invalid") {
        return {
          status: "integrity_validation_unavailable",
          items: [],
          omitted: false,
        } satisfies Projection["deletionAudit"]
      }
      if (
        projection.value.state !== "deleted_minimal_audit" ||
        !projection.value.auditAvailable ||
        !projection.value.audit
      ) {
        return { status: "unknown", scope, items: [], omitted: false } satisfies Projection["deletionAudit"]
      }
      const audit = projection.value.audit
      const matches = audit.operations
        .filter((operation) => !cursor || operation.operationID > cursor.operationID)
        .flatMap((operation) =>
          operation.records
            .filter((record) => records.some((target) => sameRecord(target, record)))
            .map(
              (record) =>
                ({
                  rootSessionID,
                  bundleID: audit.bundleID,
                  operationID: operation.operationID,
                  record: {
                    ownerKind: record.ownerKind,
                    recordID: record.recordID,
                    revisionID: record.revisionID,
                    revisionVersion: record.revisionVersion,
                  },
                  contextClassification: record.contextClassification,
                  exactRead: record.exactRead,
                  typedCitation: record.typedCitation,
                  terminalStatus: operation.terminalStatus,
                  deletionTime: audit.deletionTime,
                  bodyDeleted: true,
                }) satisfies DeletionAuditItem,
            ),
        )
      const operationIDs = [...new Set(matches.map((item) => item.operationID))]
      const selectedIDs = new Set(operationIDs.slice(0, limit))
      const items = matches.filter((item) => selectedIDs.has(item.operationID))
      if (items.length === 0) {
        return { status: "not_found", scope, items: [], omitted: false } satisfies Projection["deletionAudit"]
      }
      const omitted = operationIDs.length > limit
      return {
        status: omitted ? "partial" : "available",
        scope,
        items,
        omitted,
        ...(omitted && items.at(-1)
          ? {
              cursor: createPageCursor(
                "deletion_audit",
                predecessorPartID,
                records,
                JSON.stringify({
                  time: audit.deletionTime,
                  rootSessionID,
                  bundleID: audit.bundleID,
                  operationID: items.at(-1)!.operationID,
                }),
              ),
            }
          : {}),
      } satisfies Projection["deletionAudit"]
    }
    if (invalidCursor) {
      return {
        status: "integrity_validation_unavailable",
        items: [],
        omitted: false,
      } satisfies Projection["deletionAudit"]
    }
    const rows = yield* deletionAuditRecordQuery(tx, { records, limit, after }).all().pipe(Effect.orDie)
    const operationKeys = [...new Set(rows.map((row) => `${row.bundle.id}\u0000${row.operation.operation_id}`))]
    const selectedKeys = new Set(operationKeys.slice(0, limit))
    const selected = rows.filter((row) => selectedKeys.has(`${row.bundle.id}\u0000${row.operation.operation_id}`))
    if (selected.length === 0) {
      return { status: "unknown", items: [], omitted: false } satisfies Projection["deletionAudit"]
    }
    const roots = [...new Set(selected.map((row) => row.rootSessionID))]
    if (
      selected.some((row) => row.bundle.operation_count + row.bundle.relation_count > MAX_INTEGRITY_VALIDATION_ROWS)
    ) {
      return {
        status: "integrity_validation_unavailable",
        items: [],
        omitted: operationKeys.length > limit,
      } satisfies Projection["deletionAudit"]
    }
    const valid = yield* Effect.forEach(
      roots,
      (rootSessionID) =>
        SessionDeletion.readProjection(tx, rootSessionID).pipe(
          Effect.map((projection) => projection.state === "deleted_minimal_audit" && projection.auditAvailable),
          Effect.catchCause(() => Effect.succeed(false)),
        ),
      { concurrency: 1 },
    )
    if (valid.some((item) => !item)) {
      return {
        status: "integrity_validation_unavailable",
        items: [],
        omitted: operationKeys.length > limit,
      } satisfies Projection["deletionAudit"]
    }
    const items = selected.map(
      (row) =>
        ({
          rootSessionID: row.rootSessionID,
          bundleID: row.bundle.id,
          operationID: row.operation.operation_id,
          record: auditRecord(row.record),
          contextClassification: row.record.context_classification,
          exactRead: row.record.exact_read,
          typedCitation: row.record.typed_citation,
          terminalStatus: row.operation.terminal_status,
          deletionTime: row.bundle.deletion_time,
          bodyDeleted: true,
        }) satisfies DeletionAuditItem,
    )
    return {
      status: operationKeys.length > limit ? "partial" : "available",
      items,
      omitted: operationKeys.length > limit,
      ...(operationKeys.length > limit && selected.at(-1)
        ? {
            cursor: createPageCursor(
              "deletion_audit",
              predecessorPartID,
              records,
              JSON.stringify({
                time: selected.at(-1)!.bundle.deletion_time,
                rootSessionID: selected.at(-1)!.rootSessionID,
                bundleID: selected.at(-1)!.bundle.id,
                operationID: selected.at(-1)!.operation.operation_id,
              }),
            ),
          }
        : {}),
    } satisfies Projection["deletionAudit"]
  })
}

export function deletionAuditRecordQuery(
  tx: Transaction,
  input: Readonly<{ records: readonly RecordRevision[]; limit: number; after?: string }>,
) {
  const cursor = input.after ? parseDeletionAfter(input.after) : undefined
  return tx
    .select({
      record: SessionDeletionAuditRecordTable,
      operation: SessionDeletionAuditOperationTable,
      bundle: SessionDeletionAuditBundleTable,
      rootSessionID: SessionDeletionControlReceiptTable.root_session_id,
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
    .innerJoin(
      SessionDeletionControlReceiptTable,
      eq(SessionDeletionControlReceiptTable.request_id, SessionDeletionAuditBundleTable.deletion_request_id),
    )
    .where(
      and(
        or(...input.records.map(auditRecordCondition)),
        cursor
          ? or(
              gt(SessionDeletionAuditBundleTable.deletion_time, cursor.time),
              and(
                eq(SessionDeletionAuditBundleTable.deletion_time, cursor.time),
                or(
                  sql`${SessionDeletionAuditBundleTable.id} > ${cursor.bundleID}`,
                  and(
                    sql`${SessionDeletionAuditBundleTable.id} = ${cursor.bundleID}`,
                    sql`${SessionDeletionAuditOperationTable.operation_id} > ${cursor.operationID}`,
                  ),
                ),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(
      asc(SessionDeletionAuditBundleTable.deletion_time),
      asc(SessionDeletionAuditBundleTable.id),
      asc(SessionDeletionAuditOperationTable.operation_id),
    )
    .limit((input.limit + 1) * Math.max(1, input.records.length))
}

function readAdministrativeHistory(
  tx: Transaction,
  records: readonly RecordRevision[],
  limit: number,
  predecessorPartID: PartID,
  after?: string,
) {
  return Effect.gen(function* () {
    const cursor = after ? parseAdministrativeAfter(after) : undefined
    if (after && !cursor) return emptyAdministrativeHistory("integrity_validation_unavailable")
    const sessions = [
      ...new Set(
        records
          .filter((record) => record.ownerKind === "learning_interaction" && SchemaSessionID(record.recordID))
          .map((record) => SessionSchema.ID.make(record.recordID)),
      ),
    ]
    if (sessions.length === 0) return emptyAdministrativeHistory("not_applicable")
    if (sessions.length !== 1) return emptyAdministrativeHistory("partial", true)
    const sessionID = sessions[0]!
    const history = yield* tx
      .select()
      .from(SessionAdministrativeHistoryTable)
      .where(eq(SessionAdministrativeHistoryTable.session_id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (!history) return emptyAdministrativeHistory("not_found")
    if (history.message_count + history.part_count > MAX_INTEGRITY_VALIDATION_ROWS) {
      return {
        ...emptyAdministrativeHistory("integrity_validation_unavailable"),
        sessionID,
        kind: history.kind,
        messageCount: history.message_count,
        partCount: history.part_count,
      } satisfies Projection["administrativeHistory"]
    }
    const valid = yield* SessionPresentation.assertAdministrativeHistoryIntegrity(tx, sessionID).pipe(
      Effect.as(true),
      Effect.catchCause(() => Effect.succeed(false)),
    )
    if (!valid) {
      return {
        ...emptyAdministrativeHistory("integrity_validation_unavailable"),
        sessionID,
        kind: history.kind,
        messageCount: history.message_count,
        partCount: history.part_count,
      } satisfies Projection["administrativeHistory"]
    }
    const frontier = yield* tx
      .select({ time: SessionPresentationFrontierTable.frontier_time })
      .from(SessionPresentationFrontierTable)
      .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
      .get()
      .pipe(Effect.orDie)
    const messages =
      cursor?.phase === "part" || cursor?.phase === "later"
        ? []
        : yield* tx
            .select({
              id: SessionAdministrativeHistoryMessageTable.message_id,
              ordinal: SessionAdministrativeHistoryMessageTable.ordinal,
            })
            .from(SessionAdministrativeHistoryMessageTable)
            .where(
              and(
                eq(SessionAdministrativeHistoryMessageTable.session_id, sessionID),
                cursor?.phase === "message"
                  ? gt(SessionAdministrativeHistoryMessageTable.ordinal, cursor.ordinal)
                  : undefined,
              ),
            )
            .orderBy(asc(SessionAdministrativeHistoryMessageTable.ordinal))
            .limit(limit + 1)
            .all()
            .pipe(Effect.orDie)
    const selectedMessages = messages.slice(0, limit)
    const messageOmitted = messages.length > limit
    const remaining = limit - selectedMessages.length
    const parts =
      messageOmitted || remaining === 0 || cursor?.phase === "later"
        ? []
        : yield* tx
            .select({
              id: SessionAdministrativeHistoryPartTable.part_id,
              messageOrdinal: SessionAdministrativeHistoryPartTable.message_ordinal,
              ordinal: SessionAdministrativeHistoryPartTable.part_ordinal,
            })
            .from(SessionAdministrativeHistoryPartTable)
            .where(
              and(
                eq(SessionAdministrativeHistoryPartTable.session_id, sessionID),
                cursor?.phase === "part"
                  ? or(
                      gt(SessionAdministrativeHistoryPartTable.message_ordinal, cursor.messageOrdinal),
                      and(
                        eq(SessionAdministrativeHistoryPartTable.message_ordinal, cursor.messageOrdinal),
                        gt(SessionAdministrativeHistoryPartTable.part_ordinal, cursor.ordinal),
                      ),
                    )
                  : undefined,
              ),
            )
            .orderBy(
              asc(SessionAdministrativeHistoryPartTable.message_ordinal),
              asc(SessionAdministrativeHistoryPartTable.part_ordinal),
            )
            .limit(remaining + 1)
            .all()
            .pipe(Effect.orDie)
    const selectedParts = parts.slice(0, remaining)
    const partOmitted = parts.length > remaining
    const later =
      messageOmitted || partOmitted
        ? []
        : yield* tx
            .select({ id: MessageTable.id, timeCreated: MessageTable.time_created })
            .from(MessageTable)
            .where(
              and(
                eq(MessageTable.session_id, sessionID),
                gt(MessageTable.time_created, history.history_frontier_time),
                cursor?.phase === "later"
                  ? or(
                      gt(MessageTable.time_created, cursor.timeCreated),
                      and(eq(MessageTable.time_created, cursor.timeCreated), sql`${MessageTable.id} > ${cursor.id}`),
                    )
                  : undefined,
                sql`NOT EXISTS (
                  SELECT 1 FROM session_administrative_history_message AS member
                  WHERE member.message_id = ${MessageTable.id}
                )`,
              ),
            )
            .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
            .limit(limit + 1)
            .all()
            .pipe(Effect.orDie)
    const members = [
      ...selectedMessages.map((message) => ({ type: "message" as const, ...message })),
      ...selectedParts.map((part) => ({ type: "part" as const, id: part.id, ordinal: part.ordinal })),
    ]
    const laterOmitted = later.length > limit
    const omitted = messageOmitted || partOmitted || laterOmitted
    const next = messageOmitted
      ? JSON.stringify({ phase: "message", ordinal: selectedMessages.at(-1)!.ordinal })
      : partOmitted
        ? JSON.stringify({
            phase: "part",
            messageOrdinal: selectedParts.at(-1)!.messageOrdinal,
            ordinal: selectedParts.at(-1)!.ordinal,
          })
        : laterOmitted
          ? JSON.stringify({
              phase: "later",
              timeCreated: later[limit - 1]!.timeCreated,
              id: later[limit - 1]!.id,
            })
          : undefined
    return {
      status: omitted ? "partial" : "available",
      kind: history.kind,
      sessionID,
      historyFrontierTime: history.history_frontier_time,
      presentationFrontierTime: frontier?.time,
      importedRevertAbsent: true,
      messageCount: history.message_count,
      partCount: history.part_count,
      members,
      laterLocalMessages: later.slice(0, limit),
      omitted,
      ...(next ? { cursor: createPageCursor("administrative_history", predecessorPartID, records, next) } : {}),
    } satisfies Projection["administrativeHistory"]
  })
}

function readSessionDeletion(tx: Transaction, records: readonly RecordRevision[]) {
  const sessions = [
    ...new Set(
      records
        .filter((record) => record.ownerKind === "learning_interaction" && SchemaSessionID(record.recordID))
        .map((record) => SessionSchema.ID.make(record.recordID)),
    ),
  ]
  if (sessions.length === 0) return Effect.succeed({ status: "not_applicable" as const })
  if (sessions.length !== 1) return Effect.succeed({ status: "missing_or_unresolved" as const })
  const rootSessionID = sessions[0]!
  return SessionDeletion.readStatus(tx, rootSessionID).pipe(
    Effect.map((status): Projection["sessionDeletion"] => {
      if (status.type === "live") return { status: "live", rootSessionID }
      if (status.type === "missing") return { status: "missing_or_unresolved" }
      return {
        status:
          status.settlement.mode === "full"
            ? "deleted_full"
            : status.auditAvailable
              ? "deleted_minimal_audit"
              : "deleted_minimal_audit_purged",
        rootSessionID,
        deletionTime: status.settlement.deletionTime,
        auditAvailable: status.auditAvailable,
      }
    }),
    Effect.catchCause(() => Effect.succeed({ status: "integrity_validation_unavailable" as const })),
  )
}

function emptyAdministrativeHistory(
  status: Projection["administrativeHistory"]["status"],
  omitted = false,
): Projection["administrativeHistory"] {
  return { status, members: [], laterLocalMessages: [], omitted }
}

function emptyLineage(
  coverage: Projection["lineage"]["coverage"],
  status: Projection["lineage"]["scope"]["status"],
): Projection["lineage"] {
  return {
    coverage,
    scope: { status, operationCount: 0, terminalSealedCount: 0 },
    contextCoverage: [],
    items: [],
    omitted: false,
    pendingGap: false,
  }
}

function contextCoverageItem(
  assistantMessageID: MessageID,
  records: readonly RecordRevision[],
  projection: readonly RecordRevision[],
  cut: LearningContext.Cut,
): ContextCoverageItem {
  const sectionOwner = contextSectionOwner(records[0]!.ownerKind)
  const section = cut.sections.find((item) => item.owner === sectionOwner)
  return {
    assistantMessageID,
    sectionOwner,
    coverage: section?.coverage ?? "unavailable",
    countAtCut: section?.countAtCut ?? "unknown",
    omission: section?.omission ?? { type: "unknown", reason: "context_section_unavailable" },
    targetRecordCount: projection.filter((item) => records.some((record) => sameRecord(record, item))).length,
  }
}

function contextSectionOwner(ownerKind: OwnerKind) {
  if (ownerKind === "learning_navigation") return "learner_navigation" as const
  if (ownerKind === "learning_material") return "material" as const
  if (ownerKind === "learning_interaction") return "interaction" as const
  return ownerKind
}

function sameRecord(left: RecordRevision, right: RecordRevision) {
  return (
    left.ownerKind === right.ownerKind &&
    left.recordID === right.recordID &&
    left.revisionID === right.revisionID &&
    left.revisionVersion === right.revisionVersion
  )
}

function SchemaSessionID(value: string) {
  return /^ses_[0-9A-Za-z]{26}$/.test(value)
}

function augmentLineageItem(tx: Transaction, item: LineageItem) {
  return Effect.gen(function* () {
    const action = yield* readOperationAction(tx, item)
    const current = { ...item, ...action } satisfies LineageItem
    if (item.record.ownerKind !== "future_attention") return { type: "item" as const, item: current }
    const cut = yield* LearningContext.readCut(tx, item.assistantMessageID)
    const ownerView =
      cut.type === "available"
        ? yield* FutureAttention.readConcernAtFrontier(
            tx,
            FutureAttention.ConcernID.make(item.record.recordID),
            cut.cut.throughSharedFrontier.sequence,
          ).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
    const ownerBinding =
      ownerView &&
      ownerView.current.id === item.record.revisionID &&
      ownerView.current.version === item.record.revisionVersion
        ? {
            currentOwner: {
              transitionID: ownerView.current.id,
              version: ownerView.current.version,
              ownerCutFingerprint: LearningContext.canonicalFingerprint(
                LearningContext.toJsonValue({
                  frontier: cut.type === "available" ? cut.cut.throughSharedFrontier : undefined,
                  concernID: ownerView.id,
                  transitionID: ownerView.current.id,
                  version: ownerView.current.version,
                }),
              ),
            },
            sourceFingerprint: LearningContext.canonicalFingerprint(
              LearningContext.toJsonValue(ownerView.payload.source),
            ),
            targetFingerprint: LearningContext.canonicalFingerprint(
              LearningContext.toJsonValue(ownerView.payload.target),
            ),
            notBefore: ownerView.payload.notBefore.instant,
            serviceTiming: ownerView.payload.serviceTiming,
          }
        : undefined
    const purposeBinding = futureAttentionPurposeBinding(
      cut.type === "available" ? cut.cut : undefined,
      item.record,
      ownerBinding,
    )
    const [claim, currentOwnerView] = yield* Effect.all([
      tx
        .select({
          group: FutureAttentionClaimGroupTable,
          member: FutureAttentionClaimMemberTable,
          finalization: FutureAttentionClaimFinalizationTable,
        })
        .from(FutureAttentionClaimMemberTable)
        .innerJoin(
          FutureAttentionClaimGroupTable,
          eq(FutureAttentionClaimGroupTable.id, FutureAttentionClaimMemberTable.group_id),
        )
        .leftJoin(
          FutureAttentionClaimFinalizationTable,
          eq(FutureAttentionClaimFinalizationTable.group_id, FutureAttentionClaimGroupTable.id),
        )
        .where(
          and(
            sql`${FutureAttentionClaimMemberTable.concern_id} = ${item.record.recordID}`,
            sql`${FutureAttentionClaimMemberTable.expected_transition_id} = ${item.record.revisionID}`,
            eq(FutureAttentionClaimMemberTable.expected_version, item.record.revisionVersion),
            eq(FutureAttentionClaimGroupTable.assistant_message_id, item.assistantMessageID),
          ),
        )
        .get()
        .pipe(Effect.orDie),
      LearningFrontier.read(tx).pipe(
        Effect.flatMap((frontier) =>
          FutureAttention.readConcernAtFrontier(
            tx,
            FutureAttention.ConcernID.make(item.record.recordID),
            frontier.sequence,
          ),
        ),
        Effect.catchCause(() => Effect.succeed(undefined)),
      ),
    ])
    const finalizationMember = claim?.finalization
      ? futureAttentionFinalizationMember(
          claim.finalization.member_results,
          claim.member.ordinal,
          claim.member.concern_id,
          claim.finalization.outcome,
        )
      : undefined
    if (claim?.finalization && (!finalizationMember || !currentOwnerView)) {
      return { type: "integrity_unavailable" as const }
    }
    const ownerFinalization =
      claim?.finalization && finalizationMember && currentOwnerView
        ? {
            receiptID: claim.finalization.id,
            outcome: claim.finalization.outcome,
            timeFinalized: claim.finalization.time_finalized,
            member: finalizationMember,
            currentConcern: {
              transitionID: currentOwnerView.current.id,
              version: currentOwnerView.current.version,
              disposition: currentOwnerView.current.disposition,
            },
          }
        : undefined
    return {
      type: "item" as const,
      item: {
        ...current,
        purposeBinding,
        ...(claim
          ? {
              command: {
                occurrenceID: claim.group.occurrence_id,
                physicalReceiptID: claim.group.physical_receipt_id,
                invocationPartID: claim.group.invocation_part_id,
                semanticEffectID: claim.group.change_set_id,
                claimGroupID: claim.group.id,
              },
              ...(ownerFinalization ? { ownerFinalization } : {}),
            }
          : {}),
      } satisfies LineageItem,
    }
  })
}

export function futureAttentionFinalizationMember(
  value: unknown,
  ordinal: number,
  concernID: string,
  outcome: "served" | "not_served",
): NonNullable<LineageItem["ownerFinalization"]>["member"] | undefined {
  if (!Array.isArray(value)) return
  const member = value.find(
    (candidate) => isRecord(candidate) && candidate.ordinal === ordinal && candidate.concernID === concernID,
  )
  if (!isRecord(member) || member.outcome !== outcome) return
  if (
    outcome === "served" &&
    member.outcome === "served" &&
    typeof member.transitionID === "string" &&
    typeof member.serviceReceiptID === "string"
  ) {
    return { ordinal, concernID, outcome, transitionID: member.transitionID, serviceReceiptID: member.serviceReceiptID }
  }
  if (
    outcome === "not_served" &&
    member.outcome === "not_served" &&
    [
      "model_not_completed",
      "tool_parts_incomplete",
      "presentation_uncommitted",
      "presentation_unavailable",
      "no_eligible_output",
      "stale_head",
      "target_not_current",
      "too_early",
      "source_unavailable",
      "binding_mismatch",
    ].includes(String(member.reason))
  ) {
    return {
      ordinal,
      concernID,
      outcome,
      reason: member.reason as Extract<
        NonNullable<LineageItem["ownerFinalization"]>["member"],
        { outcome: "not_served" }
      >["reason"],
    }
  }
}

export function futureAttentionPurposeBinding(
  cut: LearningContext.Cut | undefined,
  record: RecordRevision,
  owner?: Readonly<{
    currentOwner: NonNullable<LineageItem["purposeBinding"]>["currentOwner"]
    sourceFingerprint: string
    targetFingerprint: string
    notBefore: number
    serviceTiming: string
  }>,
) {
  const section = cut?.sections.find((candidate) => candidate.owner === "future_attention")
  const exact = section?.entries.find((entry) => {
    if (!isRecord(entry.locator)) return false
    return (
      entry.locator.concernID === record.recordID &&
      entry.locator.headTransitionID === record.revisionID &&
      entry.locator.version === record.revisionVersion
    )
  })
  const semantic =
    exact?.semantic?.state === "value" && isRecord(exact.semantic.value) ? exact.semantic.value : undefined
  const sourceValue = semantic && "source" in semantic ? semantic.source : undefined
  const targetValue = semantic && "target" in semantic ? semantic.target : undefined
  const notBeforeValue = semantic && isRecord(semantic.notBefore) ? semantic.notBefore.instant : undefined
  const serviceTimingValue = semantic?.serviceTiming
  return {
    state:
      !section || section.coverage === "not_authorized"
        ? ("partial_or_withheld" as const)
        : !exact
          ? ("not_bound" as const)
          : section.coverage === "complete" &&
              section.omission.type === "none" &&
              section.countAtCut === 1 &&
              semantic &&
              owner
            ? ("sole_conditional" as const)
            : typeof section.countAtCut === "number" && section.countAtCut > 1
              ? ("multiple_unresolved" as const)
              : ("partial_or_withheld" as const),
    overlapResolution: "exact_request_priority_not_causally_attributed" as const,
    scope: section?.scope ?? "future_attention_context_unavailable",
    selectionBasis: section?.selectionBasis ?? "future_attention_context_unavailable",
    cutFingerprint: cut?.fingerprint ?? "0".repeat(64),
    ...(owner?.sourceFingerprint
      ? { sourceFingerprint: owner.sourceFingerprint }
      : sourceValue === undefined
        ? {}
        : { sourceFingerprint: LearningContext.canonicalFingerprint(LearningContext.toJsonValue(sourceValue)) }),
    ...(owner?.targetFingerprint
      ? { targetFingerprint: owner.targetFingerprint }
      : targetValue === undefined
        ? {}
        : { targetFingerprint: LearningContext.canonicalFingerprint(LearningContext.toJsonValue(targetValue)) }),
    ...(owner ? { currentOwner: owner.currentOwner } : {}),
    controlInterval: {
      cutAsOf: cut?.cutAsOf ?? 0,
      ...(owner
        ? { notBefore: owner.notBefore }
        : typeof notBeforeValue === "number" && Number.isSafeInteger(notBeforeValue) && notBeforeValue >= 0
          ? { notBefore: notBeforeValue }
          : {}),
      ...(owner
        ? { serviceTiming: owner.serviceTiming }
        : typeof serviceTimingValue === "string"
          ? { serviceTiming: serviceTimingValue }
          : {}),
    },
  }
}

function operationItem(
  operation: typeof TurnModelOperationTable.$inferSelect,
  turn: typeof TurnTable.$inferSelect,
  record: RecordRevision,
) {
  const actionState =
    operation.state === "completed"
      ? "intermediate"
      : operation.state === "failed"
        ? "failed"
        : operation.state === "interrupted"
          ? "interrupted"
          : "pending"
  return {
    assistantMessageID: operation.assistant_message_id,
    sessionID: operation.session_id,
    turnID: operation.turn_id,
    inputID: operation.input_id,
    record,
    operationState: operation.state,
    turnState: turn.state,
    actionState,
  } as const
}

function readOperationAction(tx: Transaction, item: LineageItem) {
  if (item.operationState !== "completed") return Effect.succeed({ actionState: item.actionState } as const)
  if (item.turnState === "running") return Effect.succeed({ actionState: "intermediate" as const })
  return Effect.gen(function* () {
    const [lastOperation, presentation, learnerUsableTool] = yield* Effect.all([
      tx
        .select({ assistantMessageID: TurnModelOperationTable.assistant_message_id })
        .from(TurnModelOperationTable)
        .where(eq(TurnModelOperationTable.turn_id, item.turnID))
        .orderBy(desc(TurnModelOperationTable.ordinal))
        .limit(1)
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ data: MessageTable.data })
        .from(TurnModelPresentationTable)
        .innerJoin(MessageTable, eq(MessageTable.id, TurnModelPresentationTable.assistant_message_id))
        .where(eq(TurnModelPresentationTable.assistant_message_id, item.assistantMessageID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select({ partID: TurnToolCandidateTable.part_id, data: PartTable.data })
        .from(TurnToolCandidateTable)
        .innerJoin(TurnToolInvocationTable, eq(TurnToolInvocationTable.part_id, TurnToolCandidateTable.part_id))
        .innerJoin(
          TurnCandidatePresentationTable,
          eq(TurnCandidatePresentationTable.part_id, TurnToolCandidateTable.part_id),
        )
        .innerJoin(PartTable, eq(PartTable.id, TurnToolCandidateTable.part_id))
        .where(
          and(
            eq(TurnToolCandidateTable.assistant_message_id, item.assistantMessageID),
            eq(TurnToolCandidateTable.future_attention_service_source, "learner_usable"),
            eq(TurnToolInvocationTable.state, "completed"),
          ),
        )
        .orderBy(asc(TurnToolInvocationTable.ordinal))
        .limit(1)
        .get()
        .pipe(Effect.orDie),
    ])
    if (lastOperation?.assistantMessageID !== item.assistantMessageID) {
      return { actionState: "intermediate" as const }
    }
    const messageData: unknown = presentation?.data
    const assistantCompleted =
      isRecord(messageData) &&
      messageData.role === "assistant" &&
      isRecord(messageData.time) &&
      Number.isSafeInteger(messageData.time.completed) &&
      messageData.error === undefined
    const assistantParts = assistantCompleted
      ? yield* tx
          .select({ data: PartTable.data })
          .from(PartTable)
          .where(eq(PartTable.message_id, item.assistantMessageID))
          .orderBy(asc(PartTable.time_created), asc(PartTable.id))
          .all()
          .pipe(Effect.orDie)
      : []
    const eligibleAssistantOutput =
      assistantCompleted &&
      (messageData.structured !== undefined ||
        assistantParts.some((part) => {
          const data: unknown = part.data
          return (
            isRecord(data) &&
            data.type === "text" &&
            data.synthetic !== true &&
            typeof data.text === "string" &&
            data.text.length > 0
          )
        }))
    if (eligibleAssistantOutput) {
      return {
        actionState: "completed" as const,
        action: { type: "assistant_presentation" as const, assistantMessageID: item.assistantMessageID },
      }
    }
    const toolData: unknown = learnerUsableTool?.data
    if (
      learnerUsableTool &&
      isRecord(toolData) &&
      toolData.type === "tool" &&
      isRecord(toolData.state) &&
      toolData.state.status === "completed" &&
      typeof toolData.state.output === "string" &&
      toolData.state.output.trim().length > 0
    ) {
      return {
        actionState: "completed" as const,
        action: {
          type: "learner_usable_tool" as const,
          assistantMessageID: item.assistantMessageID,
          partID: learnerUsableTool.partID,
        },
      }
    }
    return {
      actionState:
        item.turnState === "failed" || item.turnState === "interrupted" || item.turnState === "exhausted"
          ? item.turnState
          : ("intermediate" as const),
    }
  })
}

function recordCondition(record: RecordRevision) {
  return and(
    eq(TurnLineageRecordRelationTable.owner_kind, record.ownerKind),
    eq(TurnLineageRecordRelationTable.record_id, record.recordID),
    eq(TurnLineageRecordRelationTable.revision_id, record.revisionID),
    eq(TurnLineageRecordRelationTable.revision_version, record.revisionVersion),
  )
}

function auditRecordCondition(record: RecordRevision) {
  return and(
    eq(SessionDeletionAuditRecordTable.owner_kind, record.ownerKind),
    eq(SessionDeletionAuditRecordTable.record_id, record.recordID),
    eq(SessionDeletionAuditRecordTable.revision_id, record.revisionID),
    eq(SessionDeletionAuditRecordTable.revision_version, record.revisionVersion),
  )
}

function contextRecordCondition(record: RecordRevision) {
  return and(
    eq(TurnLineageContextRelationTable.owner_kind, record.ownerKind),
    eq(TurnLineageContextRelationTable.record_id, record.recordID),
    eq(TurnLineageContextRelationTable.revision_id, record.revisionID),
    eq(TurnLineageContextRelationTable.revision_version, record.revisionVersion),
  )
}

function relationRecord(row: typeof TurnLineageRecordRelationTable.$inferSelect): RecordRevision {
  return {
    ownerKind: row.owner_kind,
    recordID: row.record_id,
    revisionID: row.revision_id,
    revisionVersion: row.revision_version,
  }
}

function contextRecord(row: typeof TurnLineageContextRelationTable.$inferSelect): RecordRevision {
  return {
    ownerKind: row.owner_kind,
    recordID: row.record_id,
    revisionID: row.revision_id,
    revisionVersion: row.revision_version,
  }
}

function auditRecord(row: typeof SessionDeletionAuditRecordTable.$inferSelect): RecordRevision {
  return {
    ownerKind: row.owner_kind,
    recordID: row.record_id,
    revisionID: row.revision_id,
    revisionVersion: row.revision_version,
  }
}

function lineageKey(assistantMessageID: string, record: RecordRevision) {
  return `${assistantMessageID}\u0000${recordKey(record)}`
}

function recordKey(record: RecordRevision) {
  return `${record.ownerKind}\u0000${record.recordID}\u0000${record.revisionID}\u0000${record.revisionVersion}`
}

function parseDeletionAfter(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !isRecord(parsed) ||
      !Number.isSafeInteger(parsed.time) ||
      Number(parsed.time) < 0 ||
      typeof parsed.rootSessionID !== "string" ||
      typeof parsed.bundleID !== "string" ||
      typeof parsed.operationID !== "string"
    ) {
      return
    }
    return {
      time: Number(parsed.time),
      rootSessionID: parsed.rootSessionID,
      bundleID: parsed.bundleID,
      operationID: parsed.operationID,
    }
  } catch {
    return
  }
}

function parseAdministrativeAfter(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) return
    if (parsed.phase === "message" && Number.isSafeInteger(parsed.ordinal) && Number(parsed.ordinal) >= 0) {
      return { phase: "message" as const, ordinal: Number(parsed.ordinal) }
    }
    if (
      parsed.phase === "part" &&
      Number.isSafeInteger(parsed.messageOrdinal) &&
      Number(parsed.messageOrdinal) >= 0 &&
      Number.isSafeInteger(parsed.ordinal) &&
      Number(parsed.ordinal) >= 0
    ) {
      return {
        phase: "part" as const,
        messageOrdinal: Number(parsed.messageOrdinal),
        ordinal: Number(parsed.ordinal),
      }
    }
    if (
      parsed.phase === "later" &&
      Number.isSafeInteger(parsed.timeCreated) &&
      Number(parsed.timeCreated) >= 0 &&
      typeof parsed.id === "string"
    ) {
      return { phase: "later" as const, timeCreated: Number(parsed.timeCreated), id: parsed.id }
    }
  } catch {
    return
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
