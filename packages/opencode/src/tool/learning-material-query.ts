import { Artifact } from "@opencode-ai/core/artifact"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { waitForAbort } from "@opencode-ai/core/process"
import { Representation } from "@opencode-ai/core/representation"
import { NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import {
  learningContextReadResult,
  learningInspectionInput,
  learningInspectionReadResult,
} from "./learning-context-read"
import { inspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import { Tool } from "./tool"

export const LEARNING_MATERIAL_QUERY_TOOL_ID = "learning_material_query"
export const LEARNING_MATERIAL_QUERY_TOOL_IDS = [LEARNING_MATERIAL_QUERY_TOOL_ID] as const
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
const Inspection = learningInspectionInput
const MATERIAL_LINEAGE_ACTIONS = new Set([
  "pinned_learning_context",
  "list_artifacts",
  "get_artifact",
  "list_artifact_revisions",
  "get_artifact_revision",
  "get_representation",
  "list_maps",
  "get_map",
  "list_outline_nodes",
  "list_selectors",
  "get_selector",
  "list_map_successors",
  "list_map_dispositions",
  "get_alignment",
  "list_alignments_for_map",
  "list_alignments_for_selector",
  "list_alignments_for_membership",
  "list_alignment_successors",
  "list_alignment_dispositions",
])

const PageInput = {
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(64))),
  cursor: Schema.optional(Schema.String),
}

const Attribution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("recorded") }),
  Schema.Struct({ type: Schema.Literal("lineage_correction"), memberID: Artifact.LineageCorrectionMemberID }),
])

const MapTarget = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("artifact"),
    effectiveArtifactID: Artifact.ArtifactID,
    revisionID: Artifact.RevisionID,
    attribution: Attribution,
  }),
  Schema.Struct({
    type: Schema.Literal("representation"),
    representationRevisionID: Representation.RevisionID,
  }),
])

const Membership = Schema.Struct({
  courseID: Course.CourseID,
  viewID: Course.ViewID,
  revisionID: Course.RevisionID,
  itemID: Course.ItemID,
})

const LearningMaterialQueryInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("pinned_learning_context"),
    cutAssistantMessageID: SessionV1.MessageID,
    entryIndex: NonNegativeInt.check(Schema.isLessThanOrEqualTo(7)),
  }),
  Schema.Struct({
    action: Schema.Literal("list_artifacts"),
    includeWithdrawn: Schema.optional(Schema.Boolean),
    ...PageInput,
  }),
  Schema.Struct({ action: Schema.Literal("get_artifact"), artifactID: Artifact.ArtifactID, ...Inspection }),
  Schema.Struct({
    action: Schema.Literal("list_artifact_revisions"),
    artifactID: Artifact.ArtifactID,
    view: Schema.optional(Schema.Literals(["recorded", "effective"])),
    ...PageInput,
  }),
  Schema.Struct({
    action: Schema.Literal("get_artifact_revision"),
    artifactID: Artifact.ArtifactID,
    revisionID: Artifact.RevisionID,
    attribution: Attribution,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("get_representation"),
    representationRevisionID: Representation.RevisionID,
    ...Inspection,
  }),
  Schema.Struct({
    action: Schema.Literal("list_maps"),
    target: MapTarget,
    includeWithdrawn: Schema.optional(Schema.Boolean),
    includeSuperseded: Schema.optional(Schema.Boolean),
    ...PageInput,
  }),
  Schema.Struct({ action: Schema.Literal("get_map"), mapID: MaterialMap.MapID, ...Inspection }),
  Schema.Struct({ action: Schema.Literal("list_outline_nodes"), mapID: MaterialMap.MapID, ...PageInput }),
  Schema.Struct({
    action: Schema.Literal("list_selectors"),
    mapID: MaterialMap.MapID,
    nodeID: MaterialMap.OutlineNodeID,
    ...PageInput,
  }),
  Schema.Struct({
    action: Schema.Literal("get_selector"),
    mapID: MaterialMap.MapID,
    selectorID: MaterialMap.SelectorID,
    ...Inspection,
  }),
  Schema.Struct({ action: Schema.Literal("list_map_successors"), mapID: MaterialMap.MapID, ...PageInput }),
  Schema.Struct({ action: Schema.Literal("list_map_dispositions"), mapID: MaterialMap.MapID, ...PageInput }),
  Schema.Struct({ action: Schema.Literal("get_alignment"), alignmentID: MaterialMap.AlignmentID, ...Inspection }),
  Schema.Struct({
    action: Schema.Literal("list_alignments_for_map"),
    mapID: MaterialMap.MapID,
    includeWithdrawn: Schema.optional(Schema.Boolean),
    includeSuperseded: Schema.optional(Schema.Boolean),
    ...PageInput,
  }),
  Schema.Struct({
    action: Schema.Literal("list_alignments_for_selector"),
    mapID: MaterialMap.MapID,
    selectorID: MaterialMap.SelectorID,
    includeWithdrawn: Schema.optional(Schema.Boolean),
    includeSuperseded: Schema.optional(Schema.Boolean),
    ...PageInput,
  }),
  Schema.Struct({
    action: Schema.Literal("list_alignments_for_membership"),
    course: Membership,
    includeWithdrawn: Schema.optional(Schema.Boolean),
    includeSuperseded: Schema.optional(Schema.Boolean),
    ...PageInput,
  }),
  Schema.Struct({
    action: Schema.Literal("list_alignment_successors"),
    alignmentID: MaterialMap.AlignmentID,
    ...PageInput,
  }),
  Schema.Struct({
    action: Schema.Literal("list_alignment_dispositions"),
    alignmentID: MaterialMap.AlignmentID,
    ...PageInput,
  }),
]).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearningMaterialQueryTool = Tool.define<
  typeof LearningMaterialQueryInput,
  Record<string, unknown>,
  Artifact.Service | Representation.Service | MaterialMap.Service | Database.Service
>(
  LEARNING_MATERIAL_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const artifacts = yield* Artifact.Service
    const representations = yield* Representation.Service
    const maps = yield* MaterialMap.Service
    const database = yield* Database.Service
    return {
      description:
        "Read bounded authoritative Artifact, Representation, Material Map, selector, and Course-alignment metadata without reading material bytes or reconciling owner state. Exact get actions accept includeInspection=true to carry their non-isomorphic owner relation and operational lineage through the typed primary-TUI projection in the same snapshot. pinned_learning_context expands a zero-based Material entry from one exact stored Gate 18 cut and returns exact metadata or a typed superseded/unavailable result; it never substitutes a new Map, selector, Artifact Revision, or Representation. Every list returns at most 64 records plus exact omission truth and an opaque query-bound cursor. Results fail truthfully when the Gate 18 lazy-read byte allowance cannot carry a whole value. Use exact returned identities, revisions, attribution, disposition, supersession, correction, and membership state when composing an explicit learning bootstrap; transient reads, search results, attachments, and web material are not adopted by this tool.",
      parameters: LearningMaterialQueryInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearningMaterialQueryInput, { additionalProperties: false }),
      execute: (input: Schema.Schema.Type<typeof LearningMaterialQueryInput>, context) => {
        if ("includeInspection" in input && input.includeInspection) {
          return database.db.transaction((tx) => inspectMaterialRead(tx, input, context)).pipe(Effect.orDie)
        }
        if (input.action === "pinned_learning_context") {
          return abortable(
            Effect.gen(function* () {
              const stored = yield* database.db.transaction((tx) =>
                LearningContext.readCut(tx, input.cutAssistantMessageID),
              )
              if (stored.type !== "available") {
                return learningContextReadResult({
                  capabilityID: LEARNING_MATERIAL_QUERY_TOOL_ID,
                  title: "Pinned learning-material metadata",
                  metadata: {
                    action: input.action,
                    cutAssistantMessageID: input.cutAssistantMessageID,
                    entryIndex: input.entryIndex,
                    result: stored.type,
                  },
                  value: { result: stored },
                  lineageValue: materialLineageValue(input.action, stored),
                  itemCount: 0,
                })
              }
              const section = stored.cut.sections.find((value) => value.owner === "material")!
              const entry = section.entries[input.entryIndex]
              if (!entry || entry.kind !== "material") {
                return learningContextReadResult({
                  capabilityID: LEARNING_MATERIAL_QUERY_TOOL_ID,
                  title: "Pinned learning-material metadata",
                  metadata: {
                    action: input.action,
                    cutAssistantMessageID: input.cutAssistantMessageID,
                    entryIndex: input.entryIndex,
                    result: "entry_not_found",
                  },
                  value: { result: { type: "entry_not_found" } },
                  lineageValue: materialLineageValue(input.action, { type: "entry_not_found" }),
                  itemCount: 0,
                })
              }
              const result = yield* maps.readLearningContextMetadata(
                entry.locator as MaterialMap.LearningContextLocator,
              )
              return learningContextReadResult({
                capabilityID: LEARNING_MATERIAL_QUERY_TOOL_ID,
                title: "Pinned learning-material metadata",
                metadata: {
                  action: input.action,
                  cutAssistantMessageID: input.cutAssistantMessageID,
                  entryIndex: input.entryIndex,
                  result: result.type,
                },
                value: { result: pinnedMaterialRead(result) },
                lineageValue: materialLineageValue(input.action, result),
                itemCount: result.type === "available" ? 1 : 0,
              })
            }),
            context.abort,
          ).pipe(Effect.orDie)
        }
        if (input.action === "get_artifact") {
          return exactRead(artifacts.getArtifact(input.artifactID), input.action, context.abort, (value) => value)
        }
        if (input.action === "get_artifact_revision") {
          return exactRead(
            artifacts.getRevision(input.artifactID, input.revisionID, input.attribution),
            input.action,
            context.abort,
            (value) => value,
          )
        }
        if (input.action === "get_representation") {
          return exactRead(
            representations.get(input.representationRevisionID),
            input.action,
            context.abort,
            representationRead,
          )
        }
        if (input.action === "get_map") {
          return exactRead(maps.getMap(input.mapID), input.action, context.abort, mapRead)
        }
        if (input.action === "get_selector") {
          return exactRead(
            maps.getSelector(input.mapID, input.selectorID),
            input.action,
            context.abort,
            (value) => value,
          )
        }
        if (input.action === "get_alignment") {
          return exactRead(maps.getAlignment(input.alignmentID), input.action, context.abort, alignmentRead)
        }
        if (input.action === "list_artifacts") {
          return pageRead(
            artifacts.listArtifacts({
              ...pageOptions(input),
              ...(input.includeWithdrawn === undefined ? {} : { includeWithdrawn: input.includeWithdrawn }),
            }),
            input.action,
            context.abort,
            (value) => value,
          )
        }
        if (input.action === "list_artifact_revisions") {
          return pageRead(
            artifacts.listRevisions(input.artifactID, {
              ...pageOptions(input),
              ...(input.view === undefined ? {} : { view: input.view }),
            }),
            input.action,
            context.abort,
            (value) => value,
          )
        }
        if (input.action === "list_maps") {
          return pageRead(
            maps.listMaps({
              target: input.target,
              ...pageOptions(input),
              ...(input.includeWithdrawn === undefined ? {} : { includeWithdrawn: input.includeWithdrawn }),
              ...(input.includeSuperseded === undefined ? {} : { includeSuperseded: input.includeSuperseded }),
            }),
            input.action,
            context.abort,
            mapRead,
          )
        }
        if (input.action === "list_outline_nodes") {
          return pageRead(
            maps.listOutlineNodes(input.mapID, pageOptions(input)),
            input.action,
            context.abort,
            (value) => value,
          )
        }
        if (input.action === "list_selectors") {
          return pageRead(
            maps.listSelectors(input.mapID, input.nodeID, pageOptions(input)),
            input.action,
            context.abort,
            (value) => value,
          )
        }
        if (input.action === "list_map_successors") {
          return pageRead(maps.listMapSuccessors(input.mapID, pageOptions(input)), input.action, context.abort, mapRead)
        }
        if (input.action === "list_map_dispositions") {
          return pageRead(
            maps.listMapDispositions(input.mapID, pageOptions(input)),
            input.action,
            context.abort,
            (value) => value,
            { mapID: input.mapID },
          )
        }
        if (input.action === "list_alignments_for_map") {
          return pageRead(
            maps.listAlignmentsForMap(input.mapID, alignmentOptions(input)),
            input.action,
            context.abort,
            alignmentRead,
          )
        }
        if (input.action === "list_alignments_for_selector") {
          return pageRead(
            maps.listAlignmentsForSelector(input.mapID, input.selectorID, alignmentOptions(input)),
            input.action,
            context.abort,
            alignmentRead,
          )
        }
        if (input.action === "list_alignments_for_membership") {
          return pageRead(
            maps.listAlignmentsForMembership(input.course, alignmentOptions(input)),
            input.action,
            context.abort,
            alignmentRead,
          )
        }
        if (input.action === "list_alignment_successors") {
          return pageRead(
            maps.listAlignmentSuccessors(input.alignmentID, pageOptions(input)),
            input.action,
            context.abort,
            alignmentRead,
          )
        }
        return pageRead(
          maps.listAlignmentDispositions(input.alignmentID, pageOptions(input)),
          input.action,
          context.abort,
          (value) => value,
          { alignmentID: input.alignmentID },
        )
      },
    }
  }),
)

function inspectMaterialRead(
  tx: Transaction,
  input: Schema.Schema.Type<typeof LearningMaterialQueryInput>,
  context: Tool.Context,
) {
  return Effect.gen(function* () {
    const read = yield* Effect.gen(function* () {
      if (input.action === "get_artifact") {
        const value = yield* Artifact.readArtifactInfoInTransaction(tx, input.artifactID)
        return materialInspectionInput(input.action, value, value)
      }
      if (input.action === "get_artifact_revision") {
        const value = yield* Artifact.readArtifactRevisionInTransaction(
          tx,
          input.artifactID,
          input.revisionID,
          input.attribution,
        )
        return materialInspectionInput(input.action, value, value)
      }
      if (input.action === "get_representation") {
        const value = yield* Representation.readRepresentationInfoInTransaction(tx, input.representationRevisionID)
        return materialInspectionInput(input.action, value, representationRead(value))
      }
      if (input.action === "get_map") {
        const value = yield* MaterialMap.readMapInfoInTransaction(tx, input.mapID)
        return materialInspectionInput(input.action, value, mapRead(value))
      }
      if (input.action === "get_selector") {
        const value = yield* MaterialMap.readSelectorInfoInTransaction(tx, input.mapID, input.selectorID)
        return materialInspectionInput(input.action, value, value)
      }
      if (input.action === "get_alignment") {
        const value = yield* MaterialMap.readAlignmentInfoInTransaction(tx, input.alignmentID)
        return materialInspectionInput(input.action, value, alignmentRead(value))
      }
      throw new Error(`Action ${input.action} does not support composed material inspection`)
    })
    const arm =
      input.action === "get_artifact" || input.action === "get_artifact_revision"
        ? "artifact"
        : input.action === "get_representation"
          ? "representation"
          : input.action === "get_map"
            ? "material_map"
            : input.action === "get_selector"
              ? "material_selector"
              : "material_alignment"
    return yield* learningInspectionReadResult(
      tx,
      read,
      context,
      inspectionOwner(
        arm,
        input.action === "get_artifact"
          ? "current Artifact and exact observed Revision"
          : input.action === "get_artifact_revision"
            ? "immutable Artifact Revision with attribution"
            : input.action === "get_representation"
              ? "immutable Representation derivation"
              : input.action === "get_map"
                ? "one immutable Material Map and disposition"
                : input.action === "get_selector"
                  ? "one exact Map-scoped selector"
                  : "one exact Material–Course alignment and disposition",
        [
          {
            label: "Current-head semantics",
            value:
              arm === "material_map" || arm === "representation"
                ? "no generic current or preferred head is inferred"
                : "only the owner relation returned at this cut is shown",
          },
        ],
      ),
      "includeInspection" in input ? input.includeInspection : true,
    )
  })
}

function materialInspectionInput(action: string, lineageValue: unknown, displayed: unknown) {
  return {
    capabilityID: LEARNING_MATERIAL_QUERY_TOOL_ID,
    title: action.replaceAll("_", " "),
    metadata: { action },
    value: { value: displayed },
    lineageValue: materialLineageValue(action, lineageValue),
    itemCount: 1,
  } satisfies Parameters<typeof learningContextReadResult>[0]
}

function abortable<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) {
  if (signal.aborted) return waitForAbort(signal)
  return Effect.raceFirst(effect, waitForAbort(signal))
}

function exactRead<A, E, R, B>(
  effect: Effect.Effect<A, E, R>,
  action: string,
  signal: AbortSignal,
  project: (value: A) => B,
) {
  return abortable(effect, signal).pipe(
    Effect.map((value) => {
      const displayed = project(value)
      return learningContextReadResult({
        capabilityID: LEARNING_MATERIAL_QUERY_TOOL_ID,
        title: action.replaceAll("_", " "),
        metadata: { action },
        value: { value: displayed },
        lineageValue: materialLineageValue(action, value),
        itemCount: 1,
      })
    }),
    Effect.orDie,
  )
}

function pageRead<A, E, R, B>(
  effect: Effect.Effect<Readonly<{ items: readonly A[]; cursor?: string }>, E, R>,
  action: string,
  signal: AbortSignal,
  project: (value: A) => B,
  lineageScope?: Readonly<{ mapID?: string; alignmentID?: string }>,
) {
  return abortable(effect, signal).pipe(
    Effect.map((page) => {
      const result = {
        items: page.items.map(project),
        omitted: page.cursor !== undefined,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      }
      return learningContextReadResult({
        capabilityID: LEARNING_MATERIAL_QUERY_TOOL_ID,
        title: action.replaceAll("_", " "),
        metadata: {
          action,
          count: result.items.length,
          omitted: result.omitted,
          ...(page.cursor ? { cursor: page.cursor } : {}),
        },
        value: result,
        lineageValue: materialLineageValue(action, page.items, lineageScope),
        itemCount: result.items.length,
      })
    }),
    Effect.orDie,
  )
}

function pageOptions(input: { readonly limit?: number; readonly cursor?: string }) {
  return {
    limit: input.limit ?? 64,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  }
}

function alignmentOptions(input: {
  readonly limit?: number
  readonly cursor?: string
  readonly includeWithdrawn?: boolean
  readonly includeSuperseded?: boolean
}) {
  return {
    ...pageOptions(input),
    ...(input.includeWithdrawn === undefined ? {} : { includeWithdrawn: input.includeWithdrawn }),
    ...(input.includeSuperseded === undefined ? {} : { includeSuperseded: input.includeSuperseded }),
  }
}

function pinnedMaterialRead(result: MaterialMap.LearningContextMetadataRead) {
  if (result.type !== "available") return result
  const value = result.value
  return {
    type: result.type,
    relation: result.relation,
    value: {
      alignment: alignmentRead(value.alignment),
      map: {
        id: value.map.id,
        supersedesMapID: value.map.supersedesMapID,
        authorship: value.map.authorship,
        timeCreated: value.map.timeCreated,
        disposition: value.map.disposition,
        superseded: value.map.superseded,
      },
      selector: value.selector,
      target:
        value.target.type === "artifact"
          ? {
              type: value.target.type,
              recorded: value.target.recorded,
              current: value.target.current,
              currentUse: value.target.currentUse,
            }
          : {
              type: value.target.type,
              representation: representationRead(value.target.metadata.representation),
              currentArtifact: value.target.metadata.currentArtifact,
              currentUse: value.target.metadata.currentUse,
              activeContinuedUseGrant: value.target.metadata.activeContinuedUseGrant,
            },
    },
  }
}

function representationRead(value: Representation.RepresentationInfo) {
  return {
    id: value.id,
    effectID: value.effectID,
    sourceProof: value.sourceProof,
    producer: {
      kind: value.producer.kind,
      identity: value.producer.identity,
      version: value.producer.version,
      providerID: value.producer.providerID,
      modelID: value.producer.modelID,
      profileVariant: value.producer.profileVariant,
      provenance: value.producer.provenance,
      runIdentity: value.producer.runIdentity,
    },
    profile: value.profile,
    resultBoundary: value.resultBoundary,
    terminalStatus: value.terminalStatus,
    acceptanceBasis: value.acceptanceBasis,
    output: {
      mediaType: value.output.mediaType,
      digest: value.output.digest,
      byteLength: value.output.byteLength,
      recordCount: value.output.recordCount,
    },
    creation: value.creation,
    availability: value.availability,
    timeAccepted: value.timeAccepted,
  }
}

function mapRead(value: MaterialMap.MapInfo) {
  return {
    id: value.id,
    target: value.target,
    supersedesMapID: value.supersedesMapID,
    authorship: value.authorship,
    timeCreated: value.timeCreated,
    disposition: value.disposition,
    superseded: value.superseded,
  }
}

function alignmentRead(value: MaterialMap.AlignmentInfo) {
  return {
    id: value.id,
    mapID: value.mapID,
    selectorID: value.selectorID,
    course: value.course,
    selection: value.selection,
    membershipReceipt: value.membershipReceipt,
    reason: value.reason,
    supersedesAlignmentID: value.supersedesAlignmentID,
    authorship: value.authorship,
    timeCreated: value.timeCreated,
    disposition: value.disposition,
    superseded: value.superseded,
    projection: value.projection,
  }
}

export function materialLineageValue(
  action: string,
  value: unknown,
  scope: Readonly<{ mapID?: string; alignmentID?: string }> = {},
) {
  if (!MATERIAL_LINEAGE_ACTIONS.has(action)) throw new Error(`Unsupported learning-material lineage action ${action}`)
  return {
    schemaVersion: 2,
    capabilityID: LEARNING_MATERIAL_QUERY_TOOL_ID,
    action,
    records:
      action === "pinned_learning_context"
        ? pinnedMaterialLineageRecords(value)
        : (Array.isArray(value) ? value : [value]).flatMap((item) => {
            const record = materialLineageRecord(action, item, scope)
            return record ? [record] : []
          }),
  }
}

function materialLineageRecord(
  action: string,
  value: unknown,
  scope: Readonly<{ mapID?: string; alignmentID?: string }> = {},
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return
  if (action === "get_artifact" || action === "list_artifacts") {
    const source = isRecord(value.source) ? value.source : undefined
    if (typeof value.id !== "string" || typeof source?.currentRevisionID !== "string") return
    return {
      lineageKind: "artifact_revision",
      artifactID: value.id,
      revisionID: source.currentRevisionID,
      version: 0,
    } as const
  }
  if (action === "get_artifact_revision" || action === "list_artifact_revisions") {
    if (typeof value.id !== "string" || typeof value.recordedArtifactID !== "string") return
    return {
      lineageKind: "artifact_revision",
      artifactID: value.recordedArtifactID,
      revisionID: value.id,
      version: 0,
    } as const
  }
  if (action === "get_representation") {
    if (typeof value.id !== "string") return
    return {
      lineageKind: "representation_revision",
      representationID: value.id,
      revisionID: value.id,
      version: 0,
    } as const
  }
  if (action === "get_map" || action === "list_maps" || action === "list_map_successors") {
    const disposition = isRecord(value.disposition) ? value.disposition : undefined
    if (
      typeof value.id !== "string" ||
      typeof disposition?.version !== "number" ||
      !Number.isSafeInteger(disposition.version) ||
      disposition.version < 0
    ) {
      return
    }
    return {
      lineageKind: "material_map",
      mapID: value.id,
      revisionID: value.id,
      version: disposition.version,
    } as const
  }
  if (action === "get_selector" || action === "list_selectors") {
    if (typeof value.id !== "string" || typeof value.mapID !== "string") return
    return {
      lineageKind: "material_selector",
      mapID: value.mapID,
      selectorID: value.id,
      version: 0,
    } as const
  }
  if (action === "list_outline_nodes") {
    if (typeof value.id !== "string" || typeof value.mapID !== "string") return
    return {
      lineageKind: "material_outline_node",
      mapID: value.mapID,
      nodeID: value.id,
      version: 0,
    } as const
  }
  if (action === "list_map_dispositions") {
    if (
      typeof scope.mapID !== "string" ||
      typeof value.version !== "number" ||
      !Number.isSafeInteger(value.version) ||
      value.version < 0
    ) {
      return
    }
    return {
      lineageKind: "material_map",
      mapID: scope.mapID,
      revisionID: scope.mapID,
      version: value.version,
    } as const
  }
  if (
    action === "get_alignment" ||
    action === "list_alignments_for_map" ||
    action === "list_alignments_for_selector" ||
    action === "list_alignments_for_membership" ||
    action === "list_alignment_successors"
  ) {
    const disposition = isRecord(value.disposition) ? value.disposition : undefined
    if (
      typeof value.id !== "string" ||
      typeof value.mapID !== "string" ||
      typeof disposition?.version !== "number" ||
      !Number.isSafeInteger(disposition.version) ||
      disposition.version < 0
    ) {
      return
    }
    return {
      lineageKind: "material_alignment",
      mapID: value.mapID,
      alignmentID: value.id,
      version: disposition.version,
    } as const
  }
  if (action === "list_alignment_dispositions") {
    if (
      typeof scope.alignmentID !== "string" ||
      typeof value.version !== "number" ||
      !Number.isSafeInteger(value.version) ||
      value.version < 0
    ) {
      return
    }
    return {
      lineageKind: "material_alignment",
      alignmentID: scope.alignmentID,
      version: value.version,
    } as const
  }
}

function pinnedMaterialLineageRecords(value: unknown) {
  if (!isRecord(value) || value.type !== "available" || !isRecord(value.value)) return []
  const material = value.value
  const target = isRecord(material.target) ? material.target : undefined
  const base = [
    materialLineageRecord("get_alignment", material.alignment),
    materialLineageRecord("get_map", material.map),
    materialLineageRecord("get_selector", material.selector),
  ].filter((item): item is Record<string, unknown> => item !== undefined)
  if (target?.type === "artifact") {
    const recorded = isRecord(target.recorded) ? target.recorded : undefined
    const current =
      isRecord(target.current) && target.current.type === "available" && isRecord(target.current.value)
        ? target.current.value
        : undefined
    return [
      ...base,
      ...artifactRevisionLineage(recorded?.effectiveArtifactID, recorded?.revisionID),
      ...artifactRevisionLineage(current?.effectiveArtifactID, current?.currentRevisionID),
    ]
  }
  if (target?.type === "representation" && isRecord(target.metadata)) {
    const representation = isRecord(target.metadata.representation) ? target.metadata.representation : undefined
    const currentArtifact = isRecord(target.metadata.currentArtifact) ? target.metadata.currentArtifact : undefined
    const representationRecord = materialLineageRecord("get_representation", representation)
    return [
      ...base,
      ...(representationRecord ? [representationRecord] : []),
      ...artifactRevisionLineage(currentArtifact?.effectiveArtifactID, currentArtifact?.currentRevisionID),
    ]
  }
  return base
}

function artifactRevisionLineage(artifactID: unknown, revisionID: unknown): readonly Record<string, unknown>[] {
  return typeof artifactID === "string" && typeof revisionID === "string"
    ? [{ lineageKind: "artifact_revision", artifactID, revisionID, version: 0 }]
    : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
