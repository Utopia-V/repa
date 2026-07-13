export type ObservedWindow = {
  itemId: string
  origin: {
    uri: string
    revision: string
    startLine: number
    endLine: number
  }
  text: string
}

export type LivePathReference = {
  kind: "live-path"
  uri: string
  startLine: number
  endLine: number
}

export type ObservedItemReference = {
  kind: "observed-item"
  itemId: string
}

export function contentRevision(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

export function observeWindow(input: {
  itemId: string
  uri: string
  content: string
  startLine: number
  endLine: number
}): ObservedWindow {
  return {
    itemId: input.itemId,
    origin: {
      uri: input.uri,
      revision: contentRevision(input.content),
      startLine: input.startLine,
      endLine: input.endLine,
    },
    text: sliceLines(input.content, input.startLine, input.endLine),
  }
}

export function resolveLivePath(reference: LivePathReference, currentContent: string) {
  return {
    reference: `${reference.uri}#L${reference.startLine}-L${reference.endLine}`,
    text: sliceLines(currentContent, reference.startLine, reference.endLine),
  }
}

export function resolveObservedItem(
  reference: ObservedItemReference,
  items: ReadonlyMap<string, ObservedWindow>,
) {
  const item = items.get(reference.itemId)
  if (!item) throw new Error(`MissingObservedItem: ${reference.itemId}`)
  return {
    reference: `session-item:${item.itemId}#origin-L${item.origin.startLine}-L${item.origin.endLine}`,
    text: item.text,
    origin: item.origin,
  }
}

export function originRevisionStatus(item: ObservedWindow, currentContent: string) {
  return item.origin.revision === contentRevision(currentContent) ? "current" : "stale"
}

export function modelContextProjection(item: ObservedWindow, compacted: boolean) {
  return compacted ? `[Tool result ${item.itemId} omitted from active model context]` : item.text
}

function sliceLines(content: string, startLine: number, endLine: number) {
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine) {
    throw new RangeError(`Invalid line range: ${startLine}-${endLine}`)
  }
  const lines = content.split("\n")
  if (endLine > lines.length) throw new RangeError(`Line range exceeds source: ${endLine} > ${lines.length}`)
  return lines.slice(startLine - 1, endLine).join("\n")
}

