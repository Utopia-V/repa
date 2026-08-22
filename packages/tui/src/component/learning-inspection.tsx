import type { LearningInspectionSchema } from "@opencode-ai/core/learning-inspection-schema"
import type { Part, ToolPart, TurnInfo } from "@opencode-ai/sdk/v2"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { createMemo, For, Show } from "solid-js"
import { inspectionPresentation, inspectionStatus } from "../util/learning-inspection"
import { inspectionExhaustionPresentation } from "../util/learning-inspection-exhaustion"

export function LearningInspectionToolContent(props: { readonly part: ToolPart }) {
  const read = createMemo(() => inspectionPresentation(props.part))
  const value = createMemo(() => {
    const current = read()
    return current.type === "valid" ? current.value : undefined
  })
  return (
    <Show
      when={value()}
      keyed
      fallback={
        <box gap={1}>
          <text>Repa could not verify this inspection projection.</text>
          <text>No owner, lineage, deletion, or causal claim is inferred.</text>
        </box>
      }
    >
      {(current) => (
        <box gap={1}>
          <text>Learning inspection — {inspectionStatus(current)}</text>
          <LearningInspectionContent value={current} />
        </box>
      )}
    </Show>
  )
}

export function LearningInspectionExhaustionContent(props: {
  readonly turn: TurnInfo
  readonly parts?: readonly Part[]
}) {
  const read = createMemo(() => inspectionExhaustionPresentation(props.turn, props.parts ?? []))
  const value = createMemo(() => {
    const current = read()
    return current.type === "absent" ? undefined : current
  })
  return (
    <Show when={value()} keyed>
      {(current) => (
        <box gap={1}>
          <text>
            Turn exhausted — {current.counter} capacity {current.observed}/{current.limit}
          </text>
          <Show
            when={current.type === "generic" ? current.reason : undefined}
            fallback={
              <box>
                <text>
                  Search continuation preserved from the database-verified immediate predecessor; no new page ran.
                </text>
                <text>
                  Coverage complete: {current.type === "generic" ? "unknown" : current.completeSoFar ? "yes" : "no"};
                  gaps: {current.type === "generic" ? "unknown" : current.gapCounts.oversizedCandidateSkipped}{" "}
                  oversized, {current.type === "generic" ? "unknown" : current.gapCounts.rangeItemsSkipped} range
                  item(s); continuation{" "}
                  {current.type === "generic" ? "unknown" : current.continuationPending ? "pending" : "not pending"}.
                </text>
              </box>
            }
          >
            {(reason) => (
              <text>{reason()} No Gate 22 query, cursor, or progress is inferred from the exhausted Turn.</text>
            )}
          </Show>
        </box>
      )}
    </Show>
  )
}

export function LearningInspectionContent(props: { readonly value: LearningInspectionSchema.Projection }) {
  return (
    <box gap={1}>
      <text>{props.value.owner.meaning}</text>
      <For each={SemanticPresentation.inspectionLines(props.value)}>
        {(item) => (
          <text>
            {item.label}: {item.value}
          </text>
        )}
      </For>
      <text>Current inspection settlement: this Tool Part completed after the displayed observation cut</text>
    </box>
  )
}
