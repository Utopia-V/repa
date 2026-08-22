import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { PermissionRequest, ToolPart } from "@opencode-ai/sdk/v2"
import { inspectionPresentation } from "./learning-inspection"

export type ProposalRead =
  | { readonly type: "absent" }
  | { readonly type: "invalid" }
  | {
      readonly type: "valid"
      readonly value: SemanticPresentation.ProposalProjection
    }

export type ResultRead =
  | { readonly type: "absent" }
  | { readonly type: "invalid" }
  | {
      readonly type: "valid"
      readonly value: SemanticPresentation.ResultProjection
    }

export function permissionPresentation(request: PermissionRequest): ProposalRead {
  return SemanticPresentation.readProposal(request)
}

export function resultPresentation(part: ToolPart): ResultRead {
  if (part.state.status !== "completed") return { type: "absent" }
  return SemanticPresentation.readResult(part)
}

export function canAutoApprove(request: PermissionRequest) {
  if (PermissionV1.promptRequired(request) || request.metadata.onceOnly === true) return false
  const read = permissionPresentation(request)
  if (read.type === "invalid") return false
  if (read.type === "absent") return true
  return read.value.approval === "policy"
}

export function isOnceOnlyPermission(request: PermissionRequest) {
  if (PermissionV1.promptRequired(request) || request.metadata.onceOnly === true) return true
  const read = permissionPresentation(request)
  return read.type === "valid" && read.value.approval === "once_only"
}

export function shouldHideCompletedTool(part: ToolPart, showDetails: boolean) {
  if (showDetails || part.state.status !== "completed") return false
  return resultPresentation(part).type === "absent" && inspectionPresentation(part).type === "absent"
}

export function resultStatus(value: SemanticPresentation.ResultProjection) {
  if (value.outcome === "committed") return "Committed"
  if (value.outcome === "already_applied") return "Already applied"
  if (value.outcome === "no_effect") return "No effect"
  if (value.outcome === "outcome_unknown") return "Outcome unknown"
  return "Failed"
}

export function presentationLines(
  value: SemanticPresentation.ProposalProjection | SemanticPresentation.ResultProjection,
) {
  return [value.summary, ...value.facts.map((item) => `${item.label}: ${item.value}`)]
}
