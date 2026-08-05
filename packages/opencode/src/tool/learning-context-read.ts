import { MAX_LAZY_BYTES, MAX_LAZY_ITEMS, utf8Bytes } from "@opencode-ai/core/learning-context"
export function learningContextReadResult(input: {
  readonly title: string
  readonly metadata: Record<string, unknown>
  readonly value: unknown
  readonly itemCount: number
}) {
  const output = JSON.stringify(input.value)
  const byteCount = utf8Bytes(output)
  if (input.itemCount > MAX_LAZY_ITEMS || byteCount > MAX_LAZY_BYTES) {
    const reason = input.itemCount > MAX_LAZY_ITEMS ? "item_limit" : "byte_limit"
    const unavailable = JSON.stringify({
      status: "over_budget",
      reason,
      observedBytes: byteCount,
      ceilingBytes: MAX_LAZY_BYTES,
      observedItems: input.itemCount,
      ceilingItems: MAX_LAZY_ITEMS,
    })
    return {
      title: `${input.title} unavailable`,
      metadata: {
        ...input.metadata,
        status: "over_budget",
        reason,
        observedBytes: byteCount,
        ceilingBytes: MAX_LAZY_BYTES,
        observedItems: input.itemCount,
        ceilingItems: MAX_LAZY_ITEMS,
        truncated: false,
      },
      output: unavailable,
    }
  }
  return {
    title: input.title,
    metadata: {
      ...input.metadata,
      status: "available",
      byteCount,
      itemCount: input.itemCount,
      truncated: false,
    },
    output,
  }
}
