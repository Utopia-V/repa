export * as FutureAttentionPresentation from "./future-attention-presentation"

const reason = {
  model_not_completed: "the exact Assistant operation did not complete",
  tool_parts_incomplete: "one or more local Tool Parts were not terminal",
  presentation_uncommitted: "the exact Assistant presentation was not committed",
  presentation_unavailable: "the exact Assistant presentation is no longer available",
  no_eligible_output: "the exact Assistant presentation contained no eligible learner-facing output",
  stale_head: "the claimed FutureAttention head changed before finalization",
  target_not_current: "the exact retained target was no longer current",
  too_early: "the purpose-specific service time had not arrived",
  source_unavailable: "the bound service source was unavailable",
  binding_mismatch: "the completed source did not match the admitted claim binding",
} as const

export function finalization(
  receipt: Readonly<{
    outcome: "served" | "not_served"
    members: readonly Readonly<{
      outcome: "served" | "not_served"
      reason?: keyof typeof reason
    }>[]
  }>,
) {
  if (receipt.outcome === "served") {
    const served = receipt.members.filter((member) => member.outcome === "served").length
    return {
      title: "Future attention served",
      detail: `This completed response addressed ${served} retained follow-up${served === 1 ? "" : "s"}.`,
    }
  }

  const counts = receipt.members.reduce((result, member) => {
    const key = member.reason ?? "binding_mismatch"
    result.set(key, (result.get(key) ?? 0) + 1)
    return result
  }, new Map<keyof typeof reason, number>())
  const reasons = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${count}: ${reason[key]}`)
    .join("; ")
  const claims = receipt.members.length === 1 ? "claim was" : "claims were"
  return {
    title: "Future attention not served",
    detail: `${receipt.members.length} ${claims} not served${reasons ? ` (${reasons})` : ""}. Check current FutureAttention state to see what remains open.`,
  }
}
