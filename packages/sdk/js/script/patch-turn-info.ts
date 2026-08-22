const inspectionExhaustion = `export type TurnInspectionExhaustion =
  | {
      schemaVersion: 1
      type: "generic"
      counter: "model" | "tool"
      reason: string
    }
  | {
      schemaVersion: 1
      type: "predecessor_continuation_exhausted" | "rejected_tool_continuation_exhausted"
      counter: "model" | "tool"
      predecessorPartID: string
      queryFingerprint: string
      outputFingerprint: string
      completeSoFar: boolean
      gapCounts: {
        oversizedCandidateSkipped: number
        rangeItemsSkipped: number
      }
      gapFingerprint: string
      continuationPending: boolean
      rangeNextOffset?: number
    }

`

export function patchTurnInfo(source: string) {
  if (source.includes("export type TurnInspectionExhaustion =")) {
    if (!/export type TurnInfo = \{[\s\S]*?inspectionExhaustion\?: TurnInspectionExhaustion[\s\S]*?\n\}/.test(source)) {
      throw new Error("Generated Turn inspection-exhaustion type is present without its TurnInfo carrier")
    }
    return source
  }
  const withType = source.replace("export type TurnInfo = {", inspectionExhaustion + "export type TurnInfo = {")
  if (withType === source) throw new Error("Generated TurnInfo type was not found")
  const patched = withType.replace(
    /(export type TurnInfo = \{[\s\S]*?\n  terminal\?: TurnTerminal2)(\n\})/,
    "$1\n  inspectionExhaustion?: TurnInspectionExhaustion$2",
  )
  if (patched === withType) throw new Error("Generated TurnInfo inspection-exhaustion field patch did not apply")
  return patched
}
