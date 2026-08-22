import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Database } from "@opencode-ai/core/database/database"
import { MAX_LAZY_BYTES } from "@opencode-ai/core/learning-context"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Representation } from "@opencode-ai/core/representation"
import { NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { workspaceReadIdentity } from "@/learning-command/workspace-authority"
import { ToolJsonSchema } from "./json-schema"
import { learningContextReadResult } from "./learning-context-read"
import { Tool } from "./tool"

export const LEARNING_MATERIAL_READ_TOOL_ID = "learning_material_read"
export const LEARNING_MATERIAL_READ_TOOL_IDS = [LEARNING_MATERIAL_READ_TOOL_ID] as const

const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Attribution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("recorded") }),
  Schema.Struct({ type: Schema.Literal("lineage_correction"), memberID: Artifact.LineageCorrectionMemberID }),
])
const Target = Schema.Union([
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
const Point = Schema.Struct({ page: PositiveInt, item: NonNegativeInt, scalar: NonNegativeInt })
const Coordinate = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("whole_target.v1") }),
  Schema.Struct({
    kind: Schema.Literal("artifact_byte_range.v1"),
    startByte: NonNegativeInt,
    endByte: PositiveInt,
  }),
  Schema.Struct({ kind: Schema.Literal("pdf_page_range.v1"), startPage: PositiveInt, endPage: PositiveInt }),
  Schema.Struct({ kind: Schema.Literal("pdf_text_range.v1"), start: Point, end: Point }),
  Schema.Struct({
    kind: Schema.Literal("model_text_range.v1"),
    startScalar: NonNegativeInt,
    endScalar: PositiveInt,
  }),
])
const Witness = Schema.Struct({ algorithm: Schema.Literal("sha256"), digest: Digest, byteLength: NonNegativeInt })

const LearningMaterialReadInput = Schema.Struct({
  mapID: MaterialMap.MapID,
  mapDispositionVersion: NonNegativeInt,
  selectorID: MaterialMap.SelectorID,
  selectorCoordinate: Coordinate,
  selectorWitness: Witness,
  target: Target,
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const LearningMaterialReadTool = Tool.define<
  typeof LearningMaterialReadInput,
  Record<string, unknown>,
  Database.Service | ContentRoot.Service | MaterialMap.TutorCurrentUseReader
>(
  LEARNING_MATERIAL_READ_TOOL_ID,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const roots = yield* ContentRoot.Service
    const tutor = yield* MaterialMap.TutorCurrentUseReader
    return {
      description:
        "Read bytes for one exact pinned Material Map selector under current Tutor-use admission. Supply the Map disposition version, selector coordinate/witness, and exact Artifact or Representation target from the learning-context locator. The owner revalidates the active Map, selector, current Artifact/Representation tuple, availability and any active continued-use grant. Local Artifact reads obtain fresh current ContentRoot/workspace/one-operation authority and never fall back to historical bytes. The result is bounded to 32 KiB and 64 records and never changes owner observation or availability state.",
      parameters: LearningMaterialReadInput,
      jsonSchema: ToolJsonSchema.fromSchema(LearningMaterialReadInput, { additionalProperties: false }),
      execute: (input, context) =>
        Effect.gen(function* () {
          const interaction = requireInteraction(context)
          const inspected = yield* database.db
            .transaction((tx) =>
              MaterialMap.inspectTutorAccess(tx, {
                mapID: input.mapID,
                mapDispositionVersion: input.mapDispositionVersion,
                selectorID: input.selectorID,
                selectorCoordinate: input.selectorCoordinate,
                selectorWitness: input.selectorWitness,
                target: input.target,
              }),
            )
            .pipe(Effect.orDie)
          const current = inspected.current
          const operationIdentity = `${interaction.candidate.partID}:${interaction.candidate.callID}`
          const profileIdentity = JSON.stringify({
            agent: context.agent,
            sessionID: context.sessionID,
            ruleset: interaction.permission.ruleset,
            authority: interaction.permission.authority,
          })
          const access =
            current.map.target.type === "representation"
              ? ({ type: "representation" as const } as const)
              : yield* prepareArtifactAccess({
                  roots,
                  context,
                  target: current.map.target,
                  operationIdentity,
                  profileIdentity,
                  mapID: input.mapID,
                  selectorID: input.selectorID,
                })
          const result = yield* tutor.resolveSelector({
            mapID: input.mapID,
            selectorID: input.selectorID,
            accessProof: inspected.proof,
            access,
            budgets: {
              artifactBytes: MaterialMap.MaterialTarget.limits.artifactBytes,
              representation: {
                integrityScanBytes: MaterialMap.MaterialTarget.limits.representationIntegrityBytes,
                returnBytes: MAX_LAZY_BYTES - 256,
                records: 64,
              },
            },
            maxOutputBytes: MAX_LAZY_BYTES - 128,
            abort: context.abort,
          })
          return learningContextReadResult({
            capabilityID: LEARNING_MATERIAL_READ_TOOL_ID,
            title: "Exact Tutor material",
            metadata: {
              mapID: input.mapID,
              selectorID: input.selectorID,
              target: current.map.target.type,
              currentUse: "admitted",
            },
            value: { result },
            itemCount: 1,
          })
        }).pipe(
          Effect.catch((error) => {
            const status = classifyMaterialFailure(error)
            return Effect.succeed(
              learningContextReadResult({
                capabilityID: LEARNING_MATERIAL_READ_TOOL_ID,
                title: "Exact Tutor material unavailable",
                metadata: {
                  mapID: input.mapID,
                  selectorID: input.selectorID,
                  status,
                },
                value: { status },
                itemCount: 0,
              }),
            )
          }),
          Effect.orDie,
        ),
    }
  }),
)

function prepareArtifactAccess(input: {
  roots: ContentRoot.Interface
  context: Tool.Context
  target: Extract<MaterialMap.TargetReceipt, { type: "artifact" }>
  operationIdentity: string
  profileIdentity: string
  mapID: MaterialMap.MapID
  selectorID: MaterialMap.SelectorID
}) {
  return Effect.gen(function* () {
    const instance = yield* InstanceRef
    const expectedWorkspaceIdentity = instance ? workspaceReadIdentity(instance) : undefined
    const invocation = ContentRoot.CurrentLocalReadInvocation.trusted(
      input.operationIdentity,
      input.profileIdentity,
      input.target.authorization.kind === "active_workspace" ? expectedWorkspaceIdentity : undefined,
    )
    if (
      input.target.authorization.kind === "content_root" ||
      input.target.authorization.kind === "content_root_historical_v16"
    ) {
      return {
        type: "artifact" as const,
        invocation,
        read: yield* input.roots.prepareLocalRead({
          authority: {
            type: "content_root",
            contentRootID: input.target.authorization.contentRoot.contentRootID,
          },
          path: input.target.activeLocation,
          maxBytes: MaterialMap.MaterialTarget.limits.artifactBytes,
          invocation,
        }),
      }
    }
    if (input.target.authorization.kind === "active_workspace") {
      if (!instance || expectedWorkspaceIdentity !== input.target.authorization.workspaceIdentity) {
        return yield* Effect.fail(new Error("not_authorized: active workspace identity changed"))
      }
      return {
        type: "artifact" as const,
        invocation,
        read: yield* input.roots.prepareLocalRead({
          authority: {
            type: "active_workspace",
            scope: ContentRoot.ActiveWorkspaceRead.trusted(instance.directory, expectedWorkspaceIdentity),
          },
          path: input.target.activeLocation,
          maxBytes: MaterialMap.MaterialTarget.limits.artifactBytes,
          invocation,
        }),
      }
    }
    yield* input.context.ask({
      permission: LEARNING_MATERIAL_READ_TOOL_ID,
      requirePrompt: true,
      patterns: [`${input.mapID}:${input.selectorID}:${input.target.activeLocation}`],
      always: [],
      metadata: {
        onceOnly: true,
        lifetime: "this physical tool invocation",
        mapID: input.mapID,
        selectorID: input.selectorID,
        path: input.target.activeLocation,
      },
    })
    const grant = ContentRoot.OneOperationRead.trusted(
      input.target.activeLocation,
      input.operationIdentity,
      JSON.stringify({
        mapID: input.mapID,
        selectorID: input.selectorID,
        operationIdentity: input.operationIdentity,
      }),
    )
    return {
      type: "artifact" as const,
      invocation,
      read: yield* input.roots.prepareLocalRead({
        authority: { type: "one_operation", grant },
        path: input.target.activeLocation,
        maxBytes: MaterialMap.MaterialTarget.limits.artifactBytes,
        invocation,
      }),
    }
  })
}

function requireInteraction(context: Tool.Context) {
  if (
    !context.interaction ||
    context.interaction.assistantMessageID !== context.messageID ||
    context.interaction.candidate.callID !== context.callID
  ) {
    throw new Error("Tutor material reads require one exact registered model operation")
  }
  return context.interaction
}

export function classifyMaterialFailure(error: unknown) {
  if (error instanceof Representation.CurrentUseDeniedError) {
    return error.reason === "grant_required" ? "grant_required" : "stale"
  }
  if (
    error instanceof Representation.IntegrityBudgetExceededError ||
    error instanceof Representation.ReturnBudgetExceededError
  ) {
    return "over_budget"
  }
  if (error instanceof Representation.ConflictError) return "stale"
  if (error instanceof MaterialMap.PreparationError) {
    if (error.code === "over_budget") return "over_budget"
    if (error.code === "source_provenance" || error.code === "ambiguous_content_root") return "not_authorized"
    if (error.code === "stale_target" || error.code === "witness_mismatch" || error.code === "invalid_selector") {
      return "stale"
    }
    return "unavailable"
  }
  if (error instanceof MaterialMap.ConflictError || error instanceof MaterialMap.InactiveError) return "stale"
  if (error instanceof ContentRoot.PathError) {
    if (error.reason === "budget_exceeded") return "over_budget"
    if (error.reason === "outside_scope") return "not_authorized"
    if (["identity_mismatch", "stale", "mutated"].includes(error.reason)) return "stale"
    return "unavailable"
  }
  if (error instanceof ContentRoot.ConflictError) return "stale"
  if (error instanceof ContentRoot.NotFoundError) return "not_authorized"
  const message = error instanceof Error ? error.message : ""
  if (message.includes("not_authorized")) return "not_authorized"
  return "unavailable"
}
