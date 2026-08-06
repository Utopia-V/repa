import { ContentRoot } from "@opencode-ai/core/content-root"
import { Database } from "@opencode-ai/core/database/database"
import { MAX_LAZY_BYTES } from "@opencode-ai/core/learning-context"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Effect } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { workspaceReadIdentity } from "@/learning-command/workspace-authority"
import type { InstanceContext } from "@/project/instance-context"

export type LearnerResponseEvidenceMaterialOwners = Readonly<{
  database: Database.Interface
  contentRoots: ContentRoot.Interface
  maps: MaterialMap.Interface
  tutorMaterials: MaterialMap.TutorCurrentUseReaderInterface
}>

export function resolveLearnerResponseEvidenceMaterial(
  owners: LearnerResponseEvidenceMaterialOwners,
  input: Readonly<{
    mapID: MaterialMap.MapID
    selectorID: MaterialMap.SelectorID
    operationIdentity: string
    profileIdentity: string
    abort?: AbortSignal
  }>,
) {
  return Effect.gen(function* () {
    const map = yield* owners.maps.getMap(input.mapID)
    const selector = yield* owners.maps.getSelector(input.mapID, input.selectorID)
    const inspected = yield* owners.database.db.transaction((tx) =>
      MaterialMap.inspectTutorAccess(tx, {
        mapID: input.mapID,
        mapDispositionVersion: map.disposition.version,
        selectorID: input.selectorID,
        selectorCoordinate: selector.coordinate,
        selectorWitness: selector.witness,
        target: map.target,
      }),
    )
    const instance = yield* InstanceRef
    const current = inspected.current
    const target = current.map.target
    const access =
      target.type === "representation"
        ? ({ type: "representation" as const } as const)
        : yield* prepareArtifactAccess(owners.contentRoots, target, instance, input)
    const resolved = yield* owners.tutorMaterials.resolveSelector({
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
      abort: input.abort,
    })
    return { receipt: resolved.receipt, byteLength: resolved.content.byteLength }
  })
}

function prepareArtifactAccess(
  roots: ContentRoot.Interface,
  target: Extract<MaterialMap.TargetReceipt, { type: "artifact" }>,
  instance: InstanceContext | undefined,
  input: Readonly<{ operationIdentity: string; profileIdentity: string }>,
) {
  return Effect.gen(function* () {
    const workspaceIdentity = instance ? workspaceReadIdentity(instance) : undefined
    const invocation = ContentRoot.CurrentLocalReadInvocation.trusted(
      input.operationIdentity,
      input.profileIdentity,
      target.authorization.kind === "active_workspace" ? workspaceIdentity : undefined,
    )
    if (
      target.authorization.kind === "content_root" ||
      target.authorization.kind === "content_root_historical_v16"
    ) {
      return {
        type: "artifact" as const,
        invocation,
        read: yield* roots.prepareLocalRead({
          authority: { type: "content_root", contentRootID: target.authorization.contentRoot.contentRootID },
          path: target.activeLocation,
          maxBytes: MaterialMap.MaterialTarget.limits.artifactBytes,
          invocation,
        }),
      }
    }
    if (
      target.authorization.kind === "active_workspace" &&
      instance &&
      workspaceIdentity === target.authorization.workspaceIdentity
    ) {
      return {
        type: "artifact" as const,
        invocation,
        read: yield* roots.prepareLocalRead({
          authority: {
            type: "active_workspace",
            scope: ContentRoot.ActiveWorkspaceRead.trusted(instance.directory, workspaceIdentity!),
          },
          path: target.activeLocation,
          maxBytes: MaterialMap.MaterialTarget.limits.artifactBytes,
          invocation,
        }),
      }
    }
    return yield* new LearnerResponseEvidence.InvalidCommandError({ reason: "source_unavailable" })
  })
}
