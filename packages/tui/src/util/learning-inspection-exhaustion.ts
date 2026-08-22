import type { Part, TurnInfo } from "@opencode-ai/sdk/v2"

export type ExhaustionRead =
  | { readonly type: "absent" }
  | {
      readonly type: "generic"
      readonly counter: "model" | "tool"
      readonly turnID: string
      readonly observed: number
      readonly limit: number
      readonly reason: string
    }
  | {
      readonly type: "predecessor_continuation_exhausted" | "rejected_tool_continuation_exhausted"
      readonly counter: "model" | "tool"
      readonly turnID: string
      readonly observed: number
      readonly limit: number
      readonly predecessorPartID: string
      readonly queryFingerprint: string
      readonly completeSoFar: boolean
      readonly gapCounts: Readonly<{ oversizedCandidateSkipped: number; rangeItemsSkipped: number }>
      readonly continuationPending: boolean
      readonly rangeNextOffset?: number
    }

export function inspectionExhaustionPresentation(turn: TurnInfo, _parts: readonly Part[] = []): ExhaustionRead {
  const exhaustion = turn.terminal?.exhaustion
  if (turn.terminal?.outcome !== "exhausted" || !exhaustion) return { type: "absent" }
  const projection = turn.inspectionExhaustion
  if (!projection || projection.type === "generic") {
    return generic(
      turn,
      exhaustion.counter,
      projection?.reason ?? "No database-verified Gate 22 predecessor was attached to this exhausted Turn.",
    )
  }
  if (projection.counter !== exhaustion.counter) {
    return generic(
      turn,
      exhaustion.counter,
      "The durable inspection-exhaustion projection disagreed with the Turn receipt.",
    )
  }
  return {
    type: projection.type,
    counter: projection.counter,
    turnID: turn.id,
    observed: exhaustion.observed,
    limit: exhaustion.limit,
    predecessorPartID: projection.predecessorPartID,
    queryFingerprint: projection.queryFingerprint,
    completeSoFar: projection.completeSoFar,
    gapCounts: projection.gapCounts,
    continuationPending: projection.continuationPending,
    ...(projection.rangeNextOffset === undefined ? {} : { rangeNextOffset: projection.rangeNextOffset }),
  }
}

function generic(turn: TurnInfo, counter: "model" | "tool", reason: string): ExhaustionRead {
  return {
    type: "generic",
    counter,
    turnID: turn.id,
    observed: turn.terminal!.exhaustion!.observed,
    limit: turn.terminal!.exhaustion!.limit,
    reason,
  }
}
