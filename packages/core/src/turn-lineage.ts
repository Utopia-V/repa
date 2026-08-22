export * as TurnLineage from "./turn-lineage"

import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { Effect } from "effect"
import {
  AdvisoryPlanSuggestionAnchorTable,
  AdvisoryPlanSuggestionBasisTable,
  AdvisoryPlanSuggestionCommitSealTable,
  AdvisoryPlanSuggestionRevisionTable,
} from "./advisory-plan-suggestion/sql"
import { ArtifactRevisionTable } from "./artifact/sql"
import { AssignmentCommitSealTable, AssignmentRevisionTable } from "./assignment/sql"
import type { Database } from "./database/database"
import {
  LearnerStateJudgmentAnchorTable,
  LearnerStateJudgmentBasisTable,
  LearnerStateJudgmentCommitSealTable,
} from "./learner-state-judgment/sql"
import { LearningCommandInvocationTable } from "./learning-command/sql"
import { LearningContext } from "./learning-context"
import { RepresentationRevisionTable } from "./representation/sql"
import {
  TurnLineageCandidateCoverageTable,
  TurnLineageContextCoverageTable,
  TurnLineageContextRelationTable,
  TurnLineageOperationCoverageTable,
  TurnLineagePreMigrationOperationTable,
  TurnLineageRecordRelationTable,
} from "./session-deletion/sql"
import type { ContextClassification, OwnerKind } from "./session-deletion/schema"
import { PartTable } from "./session/sql"
import type { SessionSchema } from "./session/schema"
import { TurnModelOperationTable, TurnToolCandidateTable, TurnToolInvocationTable } from "./turn/sql"
import type { MessageID, PartID } from "./v1/session"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
const UPDATE_ASSIGNMENT_CAPABILITY = "update_assignment"
const UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY = "update_learner_state_judgment"
const UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY = "update_advisory_plan_suggestion"

export type RecordRevision = Readonly<{
  ownerKind: OwnerKind
  recordID: string
  revisionID: string
  revisionVersion: number
}>

export type ReadProjection = Readonly<{
  schemaVersion: 1
  capabilityID: string
  resultSchemaVersion: 1 | 2
  outcome: "available" | "no_positive_relation" | "over_budget"
  records: readonly RecordRevision[]
  relationFingerprint: string
}>

const REGISTERED_CITATION_COMMANDS = new Set<string>([
  UPDATE_ASSIGNMENT_CAPABILITY,
  UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY,
  UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY,
])
const OWNER_KINDS = new Set<OwnerKind>([
  "course",
  "learning_navigation",
  "learner_goal",
  "learning_material",
  "learning_interaction",
  "learner_response_evidence",
  "future_attention",
  "assignment",
  "learner_state_judgment",
  "advisory_plan_suggestion",
])

export function readProjection(capabilityID: string, value: unknown, available = true): ReadProjection {
  if (!LearningContext.LAZY_READ_CAPABILITY_IDS.includes(capabilityID as never)) {
    throw new Error(`Unregistered lazy-read capability ${capabilityID}`)
  }
  const records = available ? extractCapabilityRecords(capabilityID, value) : []
  const canonical = dedupe(records)
  const resultSchemaVersion = materialProjectionV2(capabilityID, value) ? 2 : 1
  return {
    schemaVersion: 1,
    capabilityID,
    resultSchemaVersion,
    outcome: available ? (canonical.length > 0 ? "available" : "no_positive_relation") : "over_budget",
    records: canonical,
    relationFingerprint: fingerprint(canonical),
  }
}

export function projectAppliedCitation(
  tx: Transaction,
  input: Readonly<{
    commandName: string
    assistantMessageID: MessageID
    partID: PartID
    time: number
  }>,
) {
  return Effect.gen(function* () {
    if (!REGISTERED_CITATION_COMMANDS.has(input.commandName)) {
      throw new Error(`Unregistered typed-citation command ${input.commandName}`)
    }
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !invocation ||
      invocation.assistant_message_id !== input.assistantMessageID ||
      invocation.command_name !== input.commandName ||
      invocation.command_version !== 1 ||
      invocation.capability_identity !== input.commandName ||
      invocation.capability_version !== 1 ||
      invocation.status !== "applied"
    ) {
      throw new Error(`Typed-citation producer ${input.partID} is not the first applied registered command`)
    }
    const refs = yield* citationRecords(tx, input.commandName, input.partID)
    yield* writeRelations(tx, {
      assistantMessageID: input.assistantMessageID,
      relationKind: "typed_citation",
      partID: input.partID,
      producerVersion: 1,
      records: refs,
    })
    yield* writeCandidateCoverage(tx, {
      partID: input.partID,
      assistantMessageID: input.assistantMessageID,
      producerKind: "typed_citation",
      outcome: refs.length > 0 ? "positive_projected" : "no_positive_relation",
      catalogVersion: 1,
      resultSchemaVersion: 1,
      records: refs,
      time: input.time,
    })
  })
}

export function coverTerminalCandidate(tx: Transaction, partID: PartID, time: number, allowLegacyProjection = false) {
  return Effect.gen(function* () {
    const candidate = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (!candidate) return false
    if (candidate.state.startsWith("not_started_")) {
      yield* writeCandidateCoverage(tx, {
        partID,
        assistantMessageID: candidate.assistant_message_id,
        producerKind: eligibleProducer(candidate.tool) ?? "not_eligible",
        outcome: eligibleProducer(candidate.tool) ? "not_started" : "not_eligible",
        catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
        resultSchemaVersion: 1,
        records: [],
        time,
      })
      return true
    }
    const invocation = yield* tx
      .select()
      .from(TurnToolInvocationTable)
      .where(eq(TurnToolInvocationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (!invocation || invocation.state === "running") return false

    if (LearningContext.LAZY_READ_CAPABILITY_IDS.includes(candidate.tool as never)) {
      const part = yield* tx.select().from(PartTable).where(eq(PartTable.id, partID)).get().pipe(Effect.orDie)
      if (!part) return false
      const data = part.data as Record<string, unknown>
      const state = isRecord(data.state) ? data.state : undefined
      if (invocation.state === "completed") {
        const metadata = state && isRecord(state.metadata) ? state.metadata : undefined
        const projection = metadata?.repaLineage
        if (!readProjectionShape(projection, candidate.tool)) return false
        yield* writeRelations(tx, {
          assistantMessageID: candidate.assistant_message_id,
          relationKind: "exact_read",
          partID,
          producerVersion: projection.resultSchemaVersion,
          records: projection.records,
        })
        yield* writeCandidateCoverage(tx, {
          partID,
          assistantMessageID: candidate.assistant_message_id,
          producerKind: "lazy_read",
          outcome: projection.records.length > 0 ? "positive_projected" : "no_positive_relation",
          catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
          resultSchemaVersion: projection.resultSchemaVersion,
          records: projection.records,
          time,
        })
        return true
      }
      yield* writeCandidateCoverage(tx, {
        partID,
        assistantMessageID: candidate.assistant_message_id,
        producerKind: "lazy_read",
        outcome: "no_positive_relation",
        catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
        resultSchemaVersion: 1,
        records: [],
        time,
      })
      return true
    }

    if (REGISTERED_CITATION_COMMANDS.has(candidate.tool)) {
      const physical = yield* tx
        .select()
        .from(LearningCommandInvocationTable)
        .where(eq(LearningCommandInvocationTable.part_id, partID))
        .get()
        .pipe(Effect.orDie)
      if (
        physical &&
        (physical.assistant_message_id !== candidate.assistant_message_id ||
          physical.session_id !== candidate.session_id ||
          physical.command_name !== candidate.tool ||
          physical.command_version !== 1 ||
          physical.capability_identity !== candidate.tool ||
          physical.capability_version !== 1)
      ) {
        throw new Error(`Typed-citation producer ${partID} does not match its registered command identity`)
      }
      if (physical?.status === "applied") {
        const existing = yield* tx
          .select({ id: TurnLineageCandidateCoverageTable.part_id })
          .from(TurnLineageCandidateCoverageTable)
          .where(eq(TurnLineageCandidateCoverageTable.part_id, partID))
          .get()
          .pipe(Effect.orDie)
        if (!existing && !allowLegacyProjection) return false
        const refs = yield* citationRecords(tx, candidate.tool, partID)
        if (!existing) {
          yield* writeRelations(tx, {
            assistantMessageID: candidate.assistant_message_id,
            relationKind: "typed_citation",
            partID,
            producerVersion: 1,
            records: refs,
          })
        }
        yield* writeCandidateCoverage(
          tx,
          {
            partID,
            assistantMessageID: candidate.assistant_message_id,
            producerKind: "typed_citation",
            outcome: refs.length > 0 ? "positive_projected" : "no_positive_relation",
            catalogVersion: 1,
            resultSchemaVersion: 1,
            records: refs,
            time,
          },
          false,
        )
        return true
      }
      yield* writeCandidateCoverage(tx, {
        partID,
        assistantMessageID: candidate.assistant_message_id,
        producerKind: "typed_citation",
        outcome: "no_positive_relation",
        catalogVersion: 1,
        resultSchemaVersion: 1,
        records: [],
        time,
      })
      return true
    }

    yield* writeCandidateCoverage(tx, {
      partID,
      assistantMessageID: candidate.assistant_message_id,
      producerKind: "not_eligible",
      outcome: "not_eligible",
      catalogVersion: 1,
      resultSchemaVersion: 1,
      records: [],
      time,
    })
    return true
  })
}

export function trySealOperation(
  tx: Transaction,
  assistantMessageID: MessageID,
  time: number,
  allowLegacyProjection = false,
) {
  return Effect.gen(function* () {
    const operation = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (!operation || operation.state === "running" || !operation.candidates_sealed) return false
    const candidates = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.assistant_message_id, assistantMessageID))
      .orderBy(asc(TurnToolCandidateTable.emission_ordinal))
      .all()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      candidates,
      (candidate) => coverTerminalCandidate(tx, candidate.part_id, time, allowLegacyProjection),
      {
        concurrency: 1,
        discard: true,
      },
    )
    const coverage =
      candidates.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnLineageCandidateCoverageTable)
            .where(
              inArray(
                TurnLineageCandidateCoverageTable.part_id,
                candidates.map((candidate) => candidate.part_id),
              ),
            )
            .all()
            .pipe(Effect.orDie)
    if (
      coverage.length !== candidates.length ||
      candidates.some((candidate) => candidate.state === "pending_admission")
    ) {
      return false
    }
    const relations = yield* tx
      .select()
      .from(TurnLineageRecordRelationTable)
      .where(eq(TurnLineageRecordRelationTable.assistant_message_id, assistantMessageID))
      .all()
      .pipe(Effect.orDie)
    const expected = {
      coverage_schema_version: 1,
      catalog_version: LearningContext.CAPABILITY_CATALOG_VERSION,
      candidate_count: candidates.length,
      covered_candidate_count: coverage.length,
      relation_count: relations.length,
      relation_fingerprint: fingerprint(relationRows(relations)),
    } as const
    const existing = yield* tx
      .select()
      .from(TurnLineageOperationCoverageTable)
      .where(eq(TurnLineageOperationCoverageTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (existing) {
      if (
        existing.coverage_schema_version !== expected.coverage_schema_version ||
        existing.catalog_version !== expected.catalog_version ||
        existing.candidate_count !== expected.candidate_count ||
        existing.covered_candidate_count !== expected.covered_candidate_count ||
        existing.relation_count !== expected.relation_count ||
        existing.relation_fingerprint !== expected.relation_fingerprint
      ) {
        throw new Error(`Model operation ${assistantMessageID} has stale lineage coverage`)
      }
      return true
    }
    yield* tx
      .insert(TurnLineageOperationCoverageTable)
      .values({
        assistant_message_id: assistantMessageID,
        ...expected,
        time_sealed: Math.max(time, operation.time_settled ?? operation.time_admitted),
      })
      .run()
      .pipe(Effect.orDie)
    return true
  })
}

export function ensureSessionCoverage(tx: Transaction, sessionIDs: readonly SessionSchema.ID[], time: number) {
  return Effect.gen(function* () {
    if (sessionIDs.length === 0) return []
    const operations = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(inArray(TurnModelOperationTable.session_id, sessionIDs))
      .orderBy(asc(TurnModelOperationTable.time_admitted), asc(TurnModelOperationTable.assistant_message_id))
      .all()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      operations,
      (operation) => verifyOrMaterializeOperationCoverage(tx, operation.assistant_message_id, time),
      {
        concurrency: 1,
        discard: true,
      },
    )
    return operations
  })
}

function verifyOrMaterializeOperationCoverage(tx: Transaction, assistantMessageID: MessageID, time: number) {
  return Effect.gen(function* () {
    const legacy = yield* tx
      .select({ id: TurnLineagePreMigrationOperationTable.assistant_message_id })
      .from(TurnLineagePreMigrationOperationTable)
      .where(eq(TurnLineagePreMigrationOperationTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (legacy) {
      if (!(yield* trySealOperation(tx, assistantMessageID, time, true))) {
        throw new Error(`Pre-migration model operation ${assistantMessageID} cannot be lineage-covered`)
      }
      yield* tx
        .delete(TurnLineagePreMigrationOperationTable)
        .where(eq(TurnLineagePreMigrationOperationTable.assistant_message_id, assistantMessageID))
        .run()
        .pipe(Effect.orDie)
    }
    yield* assertOperationCoverage(tx, assistantMessageID)
  })
}

export function assertOperationCoverage(tx: Transaction, assistantMessageID: MessageID) {
  return Effect.gen(function* () {
    const candidates = yield* tx
      .select()
      .from(TurnToolCandidateTable)
      .where(eq(TurnToolCandidateTable.assistant_message_id, assistantMessageID))
      .orderBy(asc(TurnToolCandidateTable.emission_ordinal))
      .all()
      .pipe(Effect.orDie)
    const candidateCoverage =
      candidates.length === 0
        ? []
        : yield* tx
            .select()
            .from(TurnLineageCandidateCoverageTable)
            .where(
              inArray(
                TurnLineageCandidateCoverageTable.part_id,
                candidates.map((candidate) => candidate.part_id),
              ),
            )
            .all()
            .pipe(Effect.orDie)
    if (
      candidateCoverage.length !== candidates.length ||
      candidates.some((candidate) => candidate.state === "pending_admission") ||
      candidateCoverage.some((coverage) => {
        const candidate = candidates.find((item) => item.part_id === coverage.part_id)
        const producerKind = candidate ? (eligibleProducer(candidate.tool) ?? "not_eligible") : undefined
        return (
          !candidate ||
          coverage.assistant_message_id !== assistantMessageID ||
          coverage.producer_kind !== producerKind ||
          coverage.catalog_version !==
            (producerKind === "lazy_read" ? LearningContext.CAPABILITY_CATALOG_VERSION : 1) ||
          !supportedReadProjectionVersion(candidate.tool, coverage.result_schema_version) ||
          (candidate.tool === "learning_material_query" &&
            coverage.result_schema_version === 1 &&
            !candidate.state.startsWith("not_started_"))
        )
      })
    ) {
      throw new Error(`Model operation ${assistantMessageID} has incomplete candidate lineage coverage`)
    }
    const relations = yield* tx
      .select()
      .from(TurnLineageRecordRelationTable)
      .where(eq(TurnLineageRecordRelationTable.assistant_message_id, assistantMessageID))
      .all()
      .pipe(Effect.orDie)
    for (const coverage of candidateCoverage) {
      const candidate = candidates.find((item) => item.part_id === coverage.part_id)
      if (!candidate) throw new Error(`Tool candidate ${coverage.part_id} has no lineage source`)
      const producerKind = eligibleProducer(candidate.tool) ?? "not_eligible"
      const relationKind =
        producerKind === "lazy_read" ? "exact_read" : producerKind === "typed_citation" ? "typed_citation" : undefined
      const produced = relations.filter((relation) => relation.producer_part_id === coverage.part_id)
      const records = dedupe(
        produced.map((relation) => ({
          ownerKind: relation.owner_kind,
          recordID: relation.record_id,
          revisionID: relation.revision_id,
          revisionVersion: relation.revision_version,
        })),
      )
      if (
        produced.some(
          (relation) =>
            relation.relation_kind !== relationKind || relation.producer_version !== coverage.result_schema_version,
        ) ||
        coverage.relation_count !== records.length ||
        coverage.relation_fingerprint !== fingerprint(records) ||
        (producerKind === "not_eligible"
          ? coverage.outcome !== "not_eligible"
          : candidate.state.startsWith("not_started_")
            ? coverage.outcome !== "not_started"
            : !["positive_projected", "no_positive_relation"].includes(coverage.outcome))
      ) {
        throw new Error(`Tool candidate ${coverage.part_id} has stale lineage coverage`)
      }
    }
    const stored = yield* tx
      .select()
      .from(TurnLineageOperationCoverageTable)
      .where(eq(TurnLineageOperationCoverageTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (
      !stored ||
      stored.coverage_schema_version !== 1 ||
      stored.catalog_version !== LearningContext.CAPABILITY_CATALOG_VERSION ||
      stored.candidate_count !== candidates.length ||
      stored.covered_candidate_count !== candidateCoverage.length ||
      stored.relation_count !== relations.length ||
      stored.relation_fingerprint !== fingerprint(relationRows(relations))
    ) {
      throw new Error(`Model operation ${assistantMessageID} has incomplete lineage coverage`)
    }
  })
}

export function contextRecords(tx: Transaction, assistantMessageID: MessageID) {
  return Effect.gen(function* () {
    const read = yield* LearningContext.readCut(tx, assistantMessageID)
    if (read.type !== "available") throw new Error(`Model operation ${assistantMessageID} has no canonical Context cut`)
    const cut = read.cut
    const records: (RecordRevision & {
      contextClassification: Exclude<ContextClassification, "not_entered">
    })[] = []
    for (const section of cut.sections) {
      for (const entry of section.entries) {
        const locator = entry.locator as Record<string, unknown>
        for (const record of extractContextEntry(entry.kind, locator)) {
          records.push({
            ...record,
            contextClassification:
              isRecord(entry.semantic) && entry.semantic.state === "value" ? "semantic_full" : "locator_only",
          })
        }
      }
    }
    return mergeContextRecords(records)
  })
}

export function projectContextRelations(tx: Transaction, assistantMessageID: MessageID) {
  return Effect.gen(function* () {
    const records = yield* contextRecords(tx, assistantMessageID)
    const projection = records.map((record) => ({
      ownerKind: record.ownerKind,
      recordID: record.recordID,
      revisionID: record.revisionID,
      revisionVersion: record.revisionVersion,
      contextClassification: record.contextClassification,
    }))
    if (records.length > 0) {
      yield* tx
        .insert(TurnLineageContextRelationTable)
        .values(
          records.map((record) => ({
            assistant_message_id: assistantMessageID,
            owner_kind: record.ownerKind,
            record_id: record.recordID,
            revision_id: record.revisionID,
            revision_version: record.revisionVersion,
            context_classification: record.contextClassification,
          })),
        )
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
    }
    yield* tx
      .insert(TurnLineageContextCoverageTable)
      .values({
        assistant_message_id: assistantMessageID,
        projection_schema_version: 1,
        relation_count: projection.length,
        relation_fingerprint: fingerprint(projection),
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    return records
  })
}

export function assertContextCoverage(tx: Transaction, assistantMessageID: MessageID) {
  return Effect.gen(function* () {
    const [coverage, records] = yield* Effect.all([
      tx
        .select()
        .from(TurnLineageContextCoverageTable)
        .where(eq(TurnLineageContextCoverageTable.assistant_message_id, assistantMessageID))
        .get()
        .pipe(Effect.orDie),
      tx
        .select()
        .from(TurnLineageContextRelationTable)
        .where(eq(TurnLineageContextRelationTable.assistant_message_id, assistantMessageID))
        .all()
        .pipe(Effect.orDie),
    ])
    const projection = records
      .map((record) => ({
        ownerKind: record.owner_kind,
        recordID: record.record_id,
        revisionID: record.revision_id,
        revisionVersion: record.revision_version,
        contextClassification: record.context_classification,
      }))
      .sort(compareContextRecords)
    if (
      !coverage ||
      coverage.projection_schema_version !== 1 ||
      coverage.relation_count !== projection.length ||
      coverage.relation_fingerprint !== fingerprint(projection)
    ) {
      throw new Error(`Model operation ${assistantMessageID} has incomplete Context lineage projection`)
    }
    return projection
  })
}

function eligibleProducer(tool: string): "lazy_read" | "typed_citation" | undefined {
  if (LearningContext.LAZY_READ_CAPABILITY_IDS.includes(tool as never)) return "lazy_read"
  if (REGISTERED_CITATION_COMMANDS.has(tool)) return "typed_citation"
}

function writeRelations(
  tx: Transaction,
  input: Readonly<{
    assistantMessageID: MessageID
    relationKind: "exact_read" | "typed_citation"
    partID: PartID
    producerVersion: number
    records: readonly RecordRevision[]
  }>,
) {
  if (input.records.length === 0) return Effect.void
  return tx
    .insert(TurnLineageRecordRelationTable)
    .values(
      dedupe(input.records).map((record) => ({
        assistant_message_id: input.assistantMessageID,
        relation_kind: input.relationKind,
        owner_kind: record.ownerKind,
        record_id: record.recordID,
        revision_id: record.revisionID,
        revision_version: record.revisionVersion,
        producer_part_id: input.partID,
        producer_version: input.producerVersion,
      })),
    )
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
}

function writeCandidateCoverage(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    assistantMessageID: MessageID
    producerKind: "lazy_read" | "typed_citation" | "not_eligible"
    outcome: "positive_projected" | "no_positive_relation" | "not_started" | "not_eligible"
    catalogVersion: number
    resultSchemaVersion: number
    records: readonly RecordRevision[]
    time: number
  }>,
  insert = true,
) {
  const records = dedupe(input.records)
  const expected = {
    part_id: input.partID,
    assistant_message_id: input.assistantMessageID,
    producer_kind: input.producerKind,
    outcome: input.outcome,
    catalog_version: input.catalogVersion,
    result_schema_version: input.resultSchemaVersion,
    relation_count: records.length,
    relation_fingerprint: fingerprint(records),
  } as const
  return Effect.gen(function* () {
    if (insert) {
      yield* tx
        .insert(TurnLineageCandidateCoverageTable)
        .values({ ...expected, time_covered: input.time })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
    }
    const stored = yield* tx
      .select()
      .from(TurnLineageCandidateCoverageTable)
      .where(eq(TurnLineageCandidateCoverageTable.part_id, input.partID))
      .get()
      .pipe(Effect.orDie)
    if (!stored || Object.entries(expected).some(([key, value]) => stored[key as keyof typeof stored] !== value)) {
      throw new Error(`Tool candidate ${input.partID} has stale lineage coverage`)
    }

    const relationKind =
      input.producerKind === "lazy_read"
        ? "exact_read"
        : input.producerKind === "typed_citation"
          ? "typed_citation"
          : undefined
    const relations = yield* tx
      .select()
      .from(TurnLineageRecordRelationTable)
      .where(eq(TurnLineageRecordRelationTable.assistant_message_id, input.assistantMessageID))
      .all()
      .pipe(Effect.orDie)
    const expectedKeys = new Set(records.map(recordKey))
    const eligible = relationKind
      ? relations.filter(
          (relation) => relation.relation_kind === relationKind && relation.producer_part_id === input.partID,
        )
      : []
    if (
      records.some(
        (record) =>
          !eligible.some(
            (relation) =>
              recordKey({
                ownerKind: relation.owner_kind,
                recordID: relation.record_id,
                revisionID: relation.revision_id,
                revisionVersion: relation.revision_version,
              }) === recordKey(record),
          ),
      ) ||
      relations.some(
        (relation) =>
          relation.producer_part_id === input.partID &&
          (!relationKind ||
            relation.relation_kind !== relationKind ||
            !expectedKeys.has(
              recordKey({
                ownerKind: relation.owner_kind,
                recordID: relation.record_id,
                revisionID: relation.revision_id,
                revisionVersion: relation.revision_version,
              }),
            )),
      )
    ) {
      throw new Error(`Tool candidate ${input.partID} relation union does not match its coverage`)
    }
  })
}

function citationRecords(tx: Transaction, commandName: string, partID: PartID) {
  if (commandName === UPDATE_ASSIGNMENT_CAPABILITY) {
    return Effect.gen(function* () {
      const seal = yield* tx
        .select({ effectID: AssignmentCommitSealTable.effect_id })
        .from(AssignmentCommitSealTable)
        .where(eq(AssignmentCommitSealTable.invocation_part_id, partID))
        .get()
        .pipe(Effect.orDie)
      if (!seal) throw new Error(`Applied Assignment invocation ${partID} has no commit seal`)
      const revisions = yield* tx
        .select()
        .from(AssignmentRevisionTable)
        .where(eq(AssignmentRevisionTable.effect_id, seal.effectID))
        .all()
        .pipe(Effect.orDie)
      return yield* Effect.forEach(revisions, (revision) => assignmentSourceRecord(tx, revision), {
        concurrency: 1,
      }).pipe(Effect.map((records) => records.filter((record): record is RecordRevision => Boolean(record))))
    })
  }
  if (commandName === UPDATE_LEARNER_STATE_JUDGMENT_CAPABILITY) {
    return Effect.gen(function* () {
      const seal = yield* tx
        .select({ revisionID: LearnerStateJudgmentCommitSealTable.revision_id })
        .from(LearnerStateJudgmentCommitSealTable)
        .where(eq(LearnerStateJudgmentCommitSealTable.invocation_part_id, partID))
        .get()
        .pipe(Effect.orDie)
      if (!seal) throw new Error(`Applied learner-state judgment invocation ${partID} has no commit seal`)
      const rows = yield* Effect.all([
        tx
          .select({ binding: LearnerStateJudgmentAnchorTable.binding })
          .from(LearnerStateJudgmentAnchorTable)
          .where(eq(LearnerStateJudgmentAnchorTable.revision_id, seal.revisionID))
          .all()
          .pipe(Effect.orDie),
        tx
          .select({ binding: LearnerStateJudgmentBasisTable.binding })
          .from(LearnerStateJudgmentBasisTable)
          .where(eq(LearnerStateJudgmentBasisTable.revision_id, seal.revisionID))
          .all()
          .pipe(Effect.orDie),
      ])
      return dedupe(rows.flat().flatMap((row) => bindingRecord(row.binding)))
    })
  }
  return Effect.gen(function* () {
    const seal = yield* tx
      .select({ effectID: AdvisoryPlanSuggestionCommitSealTable.effect_id })
      .from(AdvisoryPlanSuggestionCommitSealTable)
      .where(eq(AdvisoryPlanSuggestionCommitSealTable.invocation_part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (!seal) throw new Error(`Applied advisory suggestion invocation ${partID} has no commit seal`)
    const revisions = yield* tx
      .select({ id: AdvisoryPlanSuggestionRevisionTable.id })
      .from(AdvisoryPlanSuggestionRevisionTable)
      .where(eq(AdvisoryPlanSuggestionRevisionTable.effect_id, seal.effectID))
      .all()
      .pipe(Effect.orDie)
    const ids = revisions.map((revision) => revision.id)
    if (ids.length === 0) return []
    const rows = yield* Effect.all([
      tx
        .select({ binding: AdvisoryPlanSuggestionAnchorTable.binding })
        .from(AdvisoryPlanSuggestionAnchorTable)
        .where(inArray(AdvisoryPlanSuggestionAnchorTable.revision_id, ids))
        .all()
        .pipe(Effect.orDie),
      tx
        .select({ binding: AdvisoryPlanSuggestionBasisTable.binding })
        .from(AdvisoryPlanSuggestionBasisTable)
        .where(inArray(AdvisoryPlanSuggestionBasisTable.revision_id, ids))
        .all()
        .pipe(Effect.orDie),
    ])
    return dedupe(rows.flat().flatMap((row) => bindingRecord(row.binding)))
  })
}

function assignmentSourceRecord(
  tx: Transaction,
  revision: typeof AssignmentRevisionTable.$inferSelect,
): Effect.Effect<RecordRevision | undefined> {
  if (revision.effective_source_type === "learner_occurrence" && revision.effective_occurrence_id) {
    return Effect.succeed({
      ownerKind: "learning_interaction",
      recordID: revision.effective_occurrence_id,
      revisionID: revision.effective_occurrence_id,
      revisionVersion: 0,
    } satisfies RecordRevision)
  }
  if (revision.effective_source_type === "artifact_revision" && revision.effective_artifact_revision_id) {
    return tx
      .select({ recordID: ArtifactRevisionTable.recorded_artifact_id, revisionID: ArtifactRevisionTable.id })
      .from(ArtifactRevisionTable)
      .where(sql`${ArtifactRevisionTable.id} = ${revision.effective_artifact_revision_id}`)
      .get()
      .pipe(
        Effect.map((row) =>
          row ? ({ ownerKind: "learning_material", ...row, revisionVersion: 0 } satisfies RecordRevision) : undefined,
        ),
        Effect.orDie,
      )
  }
  if (revision.effective_representation_revision_id) {
    return tx
      .select({
        recordID: RepresentationRevisionTable.effective_artifact_id,
        revisionID: RepresentationRevisionTable.id,
      })
      .from(RepresentationRevisionTable)
      .where(sql`${RepresentationRevisionTable.id} = ${revision.effective_representation_revision_id}`)
      .get()
      .pipe(
        Effect.map((row) =>
          row ? ({ ownerKind: "learning_material", ...row, revisionVersion: 0 } satisfies RecordRevision) : undefined,
        ),
        Effect.orDie,
      )
  }
  return Effect.succeed(undefined)
}

function bindingRecord(value: unknown): readonly RecordRevision[] {
  if (!isRecord(value)) return []
  const ref = isRecord(value.exactBound) && isRecord(value.exactBound.ref) ? value.exactBound.ref : value.ref
  if (!isRecord(ref) || typeof ref.type !== "string") return []
  if (
    ref.type === "goal_revision" &&
    typeof ref.goalID === "string" &&
    typeof ref.revisionID === "string" &&
    nonnegative(ref.version)
  ) {
    return [
      { ownerKind: "learner_goal", recordID: ref.goalID, revisionID: ref.revisionID, revisionVersion: ref.version },
    ]
  }
  if (
    ref.type === "assignment_revision" &&
    typeof ref.assignmentID === "string" &&
    typeof ref.revisionID === "string" &&
    nonnegative(ref.version)
  ) {
    return [
      { ownerKind: "assignment", recordID: ref.assignmentID, revisionID: ref.revisionID, revisionVersion: ref.version },
    ]
  }
  if (
    ref.type === "learner_response_evidence_revision" &&
    typeof ref.recordID === "string" &&
    typeof ref.revisionID === "string" &&
    nonnegative(ref.version)
  ) {
    return [
      {
        ownerKind: "learner_response_evidence",
        recordID: ref.recordID,
        revisionID: ref.revisionID,
        revisionVersion: ref.version,
      },
    ]
  }
  if (
    ref.type === "learner_state_judgment_revision" &&
    typeof ref.judgmentID === "string" &&
    typeof ref.revisionID === "string" &&
    nonnegative(ref.version)
  ) {
    return [
      {
        ownerKind: "learner_state_judgment",
        recordID: ref.judgmentID,
        revisionID: ref.revisionID,
        revisionVersion: ref.version,
      },
    ]
  }
  if (
    ref.type === "advisory_plan_suggestion_revision" &&
    typeof ref.suggestionID === "string" &&
    typeof ref.revisionID === "string" &&
    nonnegative(ref.version)
  ) {
    return [
      {
        ownerKind: "advisory_plan_suggestion",
        recordID: ref.suggestionID,
        revisionID: ref.revisionID,
        revisionVersion: ref.version,
      },
    ]
  }
  if (ref.type === "course_membership" && isRecord(ref.endpoint)) {
    const endpoint = ref.endpoint
    if (typeof endpoint.courseID === "string" && typeof endpoint.revisionID === "string") {
      return [{ ownerKind: "course", recordID: endpoint.courseID, revisionID: endpoint.revisionID, revisionVersion: 0 }]
    }
  }
  if (ref.type === "material_selector" && typeof ref.mapID === "string" && typeof ref.selectorID === "string") {
    return [{ ownerKind: "learning_material", recordID: ref.mapID, revisionID: ref.selectorID, revisionVersion: 0 }]
  }
  if (ref.type === "interaction" && isRecord(ref.locator)) {
    const locator = ref.locator
    if (typeof locator.turnID === "string" && typeof locator.sessionID === "string") {
      return [
        {
          ownerKind: "learning_interaction",
          recordID: locator.sessionID,
          revisionID: locator.turnID,
          revisionVersion: 0,
        },
      ]
    }
  }
  return []
}

function extractCapabilityRecords(capabilityID: string, value: unknown) {
  const records: RecordRevision[] = []
  visit(value, (item) => {
    if (capabilityID === "learner_goal_query") pushGoalRevision(item, records)
    else if (capabilityID === "assignment_read") pushRevision(item, "assignment", "assignmentID", records)
    else if (capabilityID === "learner_state_judgment_read")
      pushRevision(item, "learner_state_judgment", "judgmentID", records)
    else if (capabilityID === "advisory_plan_suggestion_read")
      pushRevision(item, "advisory_plan_suggestion", "suggestionID", records)
    else if (capabilityID === "learner_response_evidence_read")
      pushRevision(item, "learner_response_evidence", "recordID", records)
    else if (capabilityID === "future_attention_read") {
      if (
        typeof item.concernID === "string" &&
        typeof item.headTransitionID === "string" &&
        nonnegative(item.version)
      ) {
        records.push({
          ownerKind: "future_attention",
          recordID: item.concernID,
          revisionID: item.headTransitionID,
          revisionVersion: item.version,
        })
      }
    } else if (capabilityID === "course_query") {
      const record = courseRecord(item)
      if (record) records.push(record)
    } else if (capabilityID === "learning_navigation_query") {
      if (typeof item.headID === "string" && nonnegative(item.version)) {
        records.push({
          ownerKind: "learning_navigation",
          recordID: typeof item.courseID === "string" ? item.courseID : "learner_default_course",
          revisionID: item.headID,
          revisionVersion: item.version,
        })
      }
    } else if (capabilityID === "learning_interaction_read") {
      if (
        typeof item.sessionID === "string" &&
        typeof item.turnID === "string" &&
        typeof item.terminalState === "string"
      ) {
        records.push({
          ownerKind: "learning_interaction",
          recordID: item.sessionID,
          revisionID: item.turnID,
          revisionVersion: 0,
        })
      }
    } else if (capabilityID === "learning_material_query" || capabilityID === "learning_material_read") {
      const record = materialRecord(item)
      if (record) records.push(record)
    }
  })
  return records
}

function extractContextEntry(kind: string, locator: Record<string, unknown>): readonly RecordRevision[] {
  if (kind === "goal") return exactRevision(locator, "learner_goal", "goalID")
  if (kind === "assignment") return exactRevision(locator, "assignment", "assignmentID")
  if (kind === "learner_state_judgment") return exactRevision(locator, "learner_state_judgment", "judgmentID")
  if (kind === "advisory_plan_suggestion") return exactRevision(locator, "advisory_plan_suggestion", "suggestionID")
  if (kind === "learner_response_evidence") return exactRevision(locator, "learner_response_evidence", "recordID")
  if (
    kind === "future_attention" &&
    typeof locator.concernID === "string" &&
    typeof locator.headTransitionID === "string" &&
    nonnegative(locator.version)
  ) {
    return [
      {
        ownerKind: "future_attention",
        recordID: locator.concernID,
        revisionID: locator.headTransitionID,
        revisionVersion: locator.version,
      },
    ]
  }
  if (kind === "course") {
    const record = courseRecord(locator)
    return record ? [record] : []
  }
  if (
    (kind === "navigation_default" || kind === "navigation_anchor") &&
    typeof locator.headID === "string" &&
    nonnegative(locator.version)
  ) {
    return [
      {
        ownerKind: "learning_navigation",
        recordID: typeof locator.courseID === "string" ? locator.courseID : "learner_default_course",
        revisionID: locator.headID,
        revisionVersion: locator.version,
      },
    ]
  }
  if (kind === "interaction" && typeof locator.sessionID === "string" && typeof locator.turnID === "string") {
    return [
      {
        ownerKind: "learning_interaction",
        recordID: locator.sessionID,
        revisionID: locator.turnID,
        revisionVersion: 0,
      },
    ]
  }
  if (kind === "material") {
    const record = materialRecord(locator)
    return record ? [record] : []
  }
  return []
}

function courseRecord(item: Record<string, unknown>): RecordRevision | undefined {
  if (typeof item.courseID !== "string") return
  if (typeof item.workingRevisionID === "string" && nonnegative(item.workingRevisionVersion)) {
    return {
      ownerKind: "course",
      recordID: item.courseID,
      revisionID: item.workingRevisionID,
      revisionVersion: item.workingRevisionVersion,
    }
  }
  if (typeof item.revisionID === "string") {
    const version = nonnegative(item.revisionVersion)
      ? item.revisionVersion
      : nonnegative(item.stateVersion)
        ? item.stateVersion
        : nonnegative(item.revisionNumber)
          ? item.revisionNumber
          : undefined
    if (version !== undefined) {
      return { ownerKind: "course", recordID: item.courseID, revisionID: item.revisionID, revisionVersion: version }
    }
  }
}

function materialRecord(item: Record<string, unknown>): RecordRevision | undefined {
  if (
    item.lineageKind === "artifact_revision" &&
    typeof item.artifactID === "string" &&
    typeof item.revisionID === "string" &&
    nonnegative(item.version)
  ) {
    return {
      ownerKind: "learning_material",
      recordID: item.artifactID,
      revisionID: item.revisionID,
      revisionVersion: item.version,
    }
  }
  if (
    item.lineageKind === "representation_revision" &&
    typeof item.representationID === "string" &&
    typeof item.revisionID === "string" &&
    nonnegative(item.version)
  ) {
    return {
      ownerKind: "learning_material",
      recordID: item.representationID,
      revisionID: item.revisionID,
      revisionVersion: item.version,
    }
  }
  if (
    item.lineageKind === "material_map" &&
    typeof item.mapID === "string" &&
    typeof item.revisionID === "string" &&
    nonnegative(item.version)
  ) {
    return {
      ownerKind: "learning_material",
      recordID: item.mapID,
      revisionID: item.revisionID,
      revisionVersion: item.version,
    }
  }
  if (
    item.lineageKind === "material_selector" &&
    typeof item.mapID === "string" &&
    typeof item.selectorID === "string" &&
    nonnegative(item.version)
  ) {
    return {
      ownerKind: "learning_material",
      recordID: item.mapID,
      revisionID: item.selectorID,
      revisionVersion: item.version,
    }
  }
  if (
    item.lineageKind === "material_outline_node" &&
    typeof item.mapID === "string" &&
    typeof item.nodeID === "string" &&
    nonnegative(item.version)
  ) {
    return {
      ownerKind: "learning_material",
      recordID: item.mapID,
      revisionID: item.nodeID,
      revisionVersion: item.version,
    }
  }
  if (item.lineageKind === "material_alignment" && typeof item.alignmentID === "string" && nonnegative(item.version)) {
    return {
      ownerKind: "learning_material",
      recordID: item.alignmentID,
      revisionID: item.alignmentID,
      revisionVersion: item.version,
    }
  }
  if (isRecord(item.alignment) && typeof item.alignment.id === "string") {
    const map = isRecord(item.map) ? item.map : undefined
    const version =
      isRecord(item.alignment.disposition) && nonnegative(item.alignment.disposition.version)
        ? item.alignment.disposition.version
        : 0
    return {
      ownerKind: "learning_material",
      recordID: typeof map?.id === "string" ? map.id : item.alignment.id,
      revisionID: item.alignment.id,
      revisionVersion: version,
    }
  }
  if (typeof item.mapID === "string" && typeof item.selectorID === "string") {
    return { ownerKind: "learning_material", recordID: item.mapID, revisionID: item.selectorID, revisionVersion: 0 }
  }
  const recordID =
    typeof item.artifactID === "string"
      ? item.artifactID
      : typeof item.representationID === "string"
        ? item.representationID
        : undefined
  if (recordID && typeof item.revisionID === "string") {
    return {
      ownerKind: "learning_material",
      recordID,
      revisionID: item.revisionID,
      revisionVersion: nonnegative(item.version) ? item.version : 0,
    }
  }
}

function exactRevision(
  value: Record<string, unknown>,
  ownerKind: OwnerKind,
  recordKey: string,
): readonly RecordRevision[] {
  return typeof value[recordKey] === "string" && typeof value.revisionID === "string" && nonnegative(value.version)
    ? [
        {
          ownerKind,
          recordID: value[recordKey],
          revisionID: value.revisionID,
          revisionVersion: value.version,
        },
      ]
    : []
}

function pushRevision(
  value: Record<string, unknown>,
  ownerKind: OwnerKind,
  recordKey: string,
  output: RecordRevision[],
) {
  output.push(...exactRevision(value, ownerKind, recordKey))
}

function pushGoalRevision(value: Record<string, unknown>, output: RecordRevision[]) {
  pushRevision(value, "learner_goal", "goalID", output)
  if (typeof value.goalID === "string" && typeof value.id === "string" && nonnegative(value.version)) {
    output.push({
      ownerKind: "learner_goal",
      recordID: value.goalID,
      revisionID: value.id,
      revisionVersion: value.version,
    })
  }
}

function readProjectionShape(value: unknown, capabilityID: string): value is ReadProjection {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.capabilityID !== capabilityID ||
    !supportedReadProjectionVersion(capabilityID, value.resultSchemaVersion) ||
    !["available", "no_positive_relation", "over_budget"].includes(String(value.outcome)) ||
    !Array.isArray(value.records) ||
    typeof value.relationFingerprint !== "string"
  ) {
    return false
  }
  if (!value.records.every(recordRevisionShape)) return false
  return fingerprint(dedupe(value.records)) === value.relationFingerprint
}

export function isReadProjection(value: unknown, capabilityID: string): value is ReadProjection {
  return readProjectionShape(value, capabilityID)
}

function supportedReadProjectionVersion(capabilityID: string, version: unknown) {
  return version === 1 || (capabilityID === "learning_material_query" && version === 2)
}

function materialProjectionV2(capabilityID: string, value: unknown) {
  return (
    capabilityID === "learning_material_query" &&
    isRecord(value) &&
    value.schemaVersion === 2 &&
    value.capabilityID === capabilityID &&
    typeof value.action === "string" &&
    Array.isArray(value.records)
  )
}

function recordRevisionShape(value: unknown): value is RecordRevision {
  return (
    isRecord(value) &&
    OWNER_KINDS.has(value.ownerKind as OwnerKind) &&
    typeof value.recordID === "string" &&
    typeof value.revisionID === "string" &&
    nonnegative(value.revisionVersion)
  )
}

function mergeContextRecords<T extends ContextClassification>(
  input: readonly (RecordRevision & { contextClassification: T })[],
) {
  const rows = new Map<string, RecordRevision & { contextClassification: T }>()
  for (const record of input) {
    const key = recordKey(record)
    const prior = rows.get(key)
    if (!prior || record.contextClassification === "semantic_full") rows.set(key, record)
  }
  return [...rows.values()].sort(compareRecords)
}

function dedupe(input: readonly RecordRevision[]) {
  return [...new Map(input.map((record) => [recordKey(record), record])).values()].sort(compareRecords)
}

function relationRows(rows: readonly (typeof TurnLineageRecordRelationTable.$inferSelect)[]) {
  return rows
    .map((row) => ({
      relationKind: row.relation_kind,
      ownerKind: row.owner_kind,
      recordID: row.record_id,
      revisionID: row.revision_id,
      revisionVersion: row.revision_version,
      producerPartID: row.producer_part_id,
      producerVersion: row.producer_version,
    }))
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
}

function recordKey(record: RecordRevision) {
  return [record.ownerKind, record.recordID, record.revisionID, record.revisionVersion].join("\u0000")
}

function compareRecords(left: RecordRevision, right: RecordRevision) {
  return recordKey(left).localeCompare(recordKey(right))
}

function compareContextRecords(
  left: RecordRevision & { contextClassification: ContextClassification },
  right: RecordRevision & { contextClassification: ContextClassification },
) {
  return recordKey(left).localeCompare(recordKey(right))
}

function visit(value: unknown, callback: (value: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, callback))
    return
  }
  if (!isRecord(value)) return
  callback(value)
  Object.values(value).forEach((item) => visit(item, callback))
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fingerprint(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(stableStringify(value)).digest("hex")
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
