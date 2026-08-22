import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"
import { TurnLearningContextCutTable } from "../../../learning-context/sql"
import { TurnLineageContextCoverageTable, TurnLineageContextRelationTable } from "../../../session-deletion/sql"
import type { OwnerKind } from "../../../session-deletion/schema"

type RecordRevision = Readonly<{
  ownerKind: OwnerKind
  recordID: string
  revisionID: string
  revisionVersion: number
  contextClassification: "locator_only" | "semantic_full"
}>

export default {
  id: "20260822113528_gate22_learning_inspection_context_coverage",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`turn_lineage_context_coverage\` (
          \`assistant_message_id\` text PRIMARY KEY,
          \`projection_schema_version\` integer NOT NULL,
          \`relation_count\` integer NOT NULL,
          \`relation_fingerprint\` text NOT NULL,
          CONSTRAINT \`fk_turn_lineage_context_coverage_assistant_message_id_turn_model_operation_assistant_message_id_fk\` FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`turn_model_operation\`(\`assistant_message_id\`) ON DELETE CASCADE,
          CONSTRAINT "turn_lineage_context_coverage_shape" CHECK("projection_schema_version" = 1 AND "relation_count" >= 0
                AND length("relation_fingerprint") = 64
                AND "relation_fingerprint" NOT GLOB '*[^0-9a-f]*')
        ) WITHOUT ROWID;
      `)
      const cuts = yield* tx
        .select({
          assistantMessageID: TurnLearningContextCutTable.assistant_message_id,
          cut: TurnLearningContextCutTable.canonical_cut,
        })
        .from(TurnLearningContextCutTable)
        .orderBy(TurnLearningContextCutTable.assistant_message_id)
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        cuts,
        (cut) => {
          const records = frozenContextRecordsV1(cut.cut)
          const projection = records.map((record) => ({
            ownerKind: record.ownerKind,
            recordID: record.recordID,
            revisionID: record.revisionID,
            revisionVersion: record.revisionVersion,
            contextClassification: record.contextClassification,
          }))
          return Effect.gen(function* () {
            if (records.length > 0) {
              yield* tx
                .insert(TurnLineageContextRelationTable)
                .values(
                  records.map((record) => ({
                    assistant_message_id: cut.assistantMessageID,
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
                assistant_message_id: cut.assistantMessageID,
                projection_schema_version: 1,
                relation_count: projection.length,
                relation_fingerprint: fingerprint(projection),
              })
              .run()
              .pipe(Effect.orDie)
          })
        },
        { discard: true },
      )
    })
  },
} satisfies DatabaseMigration.Migration

// Frozen v1 projection for the v24->v34 migration. Do not route this historical
// decoder through the mutable runtime TurnLineage projector.
function frozenContextRecordsV1(value: unknown) {
  const decoded = typeof value === "string" ? JSON.parse(value) : value
  if (!isRecord(decoded) || !Array.isArray(decoded.sections)) throw new Error("Frozen Context cut has no sections")
  const records: RecordRevision[] = []
  for (const rawSection of decoded.sections) {
    if (!isRecord(rawSection) || !Array.isArray(rawSection.entries))
      throw new Error("Frozen Context section is invalid")
    for (const rawEntry of rawSection.entries) {
      if (!isRecord(rawEntry) || typeof rawEntry.kind !== "string" || !isRecord(rawEntry.locator)) {
        throw new Error("Frozen Context entry is invalid")
      }
      for (const record of extractContextEntry(rawEntry.kind, rawEntry.locator)) {
        records.push({
          ...record,
          contextClassification:
            isRecord(rawEntry.semantic) && rawEntry.semantic.state === "value" ? "semantic_full" : "locator_only",
        })
      }
    }
  }
  const merged = new Map<string, RecordRevision>()
  for (const record of records) {
    const key = [record.ownerKind, record.recordID, record.revisionID, record.revisionVersion].join("\u0000")
    const current = merged.get(key)
    if (!current || record.contextClassification === "semantic_full") merged.set(key, record)
  }
  return [...merged.values()].sort((left, right) =>
    [left.ownerKind, left.recordID, left.revisionID, left.revisionVersion]
      .join("\u0000")
      .localeCompare([right.ownerKind, right.recordID, right.revisionID, right.revisionVersion].join("\u0000")),
  )
}

function extractContextEntry(
  kind: string,
  locator: Record<string, unknown>,
): readonly Omit<RecordRevision, "contextClassification">[] {
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

function exactRevision(value: Record<string, unknown>, ownerKind: OwnerKind, recordKey: string) {
  const recordID = value[recordKey]
  if (typeof recordID !== "string" || typeof value.revisionID !== "string") return []
  const version = nonnegative(value.version)
    ? value.version
    : nonnegative(value.revisionVersion)
      ? value.revisionVersion
      : undefined
  return version === undefined ? [] : [{ ownerKind, recordID, revisionID: value.revisionID, revisionVersion: version }]
}

function courseRecord(item: Record<string, unknown>): Omit<RecordRevision, "contextClassification"> | undefined {
  if (typeof item.courseID !== "string") return
  if (typeof item.workingRevisionID === "string" && nonnegative(item.workingRevisionVersion)) {
    return {
      ownerKind: "course",
      recordID: item.courseID,
      revisionID: item.workingRevisionID,
      revisionVersion: item.workingRevisionVersion,
    }
  }
  if (typeof item.revisionID !== "string") return
  const version = nonnegative(item.revisionVersion)
    ? item.revisionVersion
    : nonnegative(item.stateVersion)
      ? item.stateVersion
      : nonnegative(item.revisionNumber)
        ? item.revisionNumber
        : undefined
  return version === undefined
    ? undefined
    : { ownerKind: "course", recordID: item.courseID, revisionID: item.revisionID, revisionVersion: version }
}

function materialRecord(item: Record<string, unknown>): Omit<RecordRevision, "contextClassification"> | undefined {
  if (item.lineageKind === "material_alignment" && typeof item.alignmentID === "string" && nonnegative(item.version)) {
    return {
      ownerKind: "learning_material",
      recordID: item.alignmentID,
      revisionID: item.alignmentID,
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
  const recordID =
    typeof item.artifactID === "string"
      ? item.artifactID
      : typeof item.representationID === "string"
        ? item.representationID
        : typeof item.mapID === "string"
          ? item.mapID
          : undefined
  const revisionID =
    typeof item.revisionID === "string"
      ? item.revisionID
      : typeof item.selectorID === "string"
        ? item.selectorID
        : undefined
  if (!recordID || !revisionID) return
  return {
    ownerKind: "learning_material",
    recordID,
    revisionID,
    revisionVersion: nonnegative(item.version) ? item.version : 0,
  }
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
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
