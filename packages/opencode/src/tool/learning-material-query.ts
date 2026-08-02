import { Artifact } from "@opencode-ai/core/artifact"
import { Course } from "@opencode-ai/core/course"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { waitForAbort } from "@opencode-ai/core/process"
import { Representation } from "@opencode-ai/core/representation"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

export const LEARNING_MATERIAL_QUERY_TOOL_ID = "learning_material_query"
export const LEARNING_MATERIAL_QUERY_TOOL_IDS = [LEARNING_MATERIAL_QUERY_TOOL_ID] as const

const PageInput = {
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
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
    action: Schema.Literal("list_artifacts"),
    includeWithdrawn: Schema.optional(Schema.Boolean),
    ...PageInput,
  }),
  Schema.Struct({ action: Schema.Literal("get_artifact"), artifactID: Artifact.ArtifactID }),
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
  }),
  Schema.Struct({
    action: Schema.Literal("get_representation"),
    representationRevisionID: Representation.RevisionID,
  }),
  Schema.Struct({
    action: Schema.Literal("list_maps"),
    target: MapTarget,
    includeWithdrawn: Schema.optional(Schema.Boolean),
    includeSuperseded: Schema.optional(Schema.Boolean),
    ...PageInput,
  }),
  Schema.Struct({ action: Schema.Literal("get_map"), mapID: MaterialMap.MapID }),
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
  }),
  Schema.Struct({ action: Schema.Literal("list_map_successors"), mapID: MaterialMap.MapID, ...PageInput }),
  Schema.Struct({ action: Schema.Literal("list_map_dispositions"), mapID: MaterialMap.MapID, ...PageInput }),
  Schema.Struct({ action: Schema.Literal("get_alignment"), alignmentID: MaterialMap.AlignmentID }),
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
  Artifact.Service | Representation.Service | MaterialMap.Service
>(
  LEARNING_MATERIAL_QUERY_TOOL_ID,
  Effect.gen(function* () {
    const artifacts = yield* Artifact.Service
    const representations = yield* Representation.Service
    const maps = yield* MaterialMap.Service
    return {
      description:
        "Read bounded authoritative Artifact, Representation, Material Map, selector, and Course-alignment metadata without reading material bytes or reconciling owner state. Every list returns at most 100 records plus exact omission truth and an opaque query-bound cursor. Use exact returned identities, revisions, attribution, disposition, supersession, correction, and membership state when composing an explicit learning bootstrap; transient reads, search results, attachments, and web material are not adopted by this tool.",
      parameters: LearningMaterialQueryInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearningMaterialQueryInput, { additionalProperties: false }),
      execute: (input: Schema.Schema.Type<typeof LearningMaterialQueryInput>, context) => {
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
        )
      },
    }
  }),
)

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
    Effect.map((value) => ({
      title: action.replaceAll("_", " "),
      metadata: { action },
      output: JSON.stringify({ value: project(value) }, null, 2),
    })),
    Effect.orDie,
  )
}

function pageRead<A, E, R, B>(
  effect: Effect.Effect<Readonly<{ items: readonly A[]; cursor?: string }>, E, R>,
  action: string,
  signal: AbortSignal,
  project: (value: A) => B,
) {
  return abortable(effect, signal).pipe(
    Effect.map((page) => {
      const result = {
        items: page.items.map(project),
        omitted: page.cursor !== undefined,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      }
      return {
        title: action.replaceAll("_", " "),
        metadata: {
          action,
          count: result.items.length,
          omitted: result.omitted,
          ...(page.cursor ? { cursor: page.cursor } : {}),
        },
        output: JSON.stringify(result, null, 2),
      }
    }),
    Effect.orDie,
  )
}

function pageOptions(input: { readonly limit?: number; readonly cursor?: string }) {
  return {
    ...(input.limit === undefined ? {} : { limit: input.limit }),
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
