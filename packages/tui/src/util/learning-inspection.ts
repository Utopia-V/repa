import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import type { ToolPart } from "@opencode-ai/sdk/v2"

export type InspectionRead = ReturnType<typeof SemanticPresentation.readInspection>

export function inspectionPresentation(part: ToolPart): InspectionRead {
  return SemanticPresentation.readInspection(part)
}

export const inspectionStatus = SemanticPresentation.inspectionStatus
export const inspectionLines = SemanticPresentation.inspectionLines
