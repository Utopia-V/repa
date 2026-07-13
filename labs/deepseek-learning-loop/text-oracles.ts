export function normalizeDisplayText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
}

export function citationCoversLines(input: {
  text: string
  sourceRef: string
  requiredStart: number
  requiredEnd: number
}) {
  const text = normalizeDisplayText(input.text)
  const escapedSource = input.sourceRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const combinedExpression = new RegExp(`${escapedSource}#L(\\d+)-L(\\d+)`, "g")
  if (hasCoveringRange(text.matchAll(combinedExpression), input.requiredStart, input.requiredEnd)) {
    return true
  }
  if (!text.includes(input.sourceRef)) return false
  const humanRangeExpression = /lines?\D{0,16}0*(\d+)\s*-\s*0*(\d+)/gi
  return hasCoveringRange(text.matchAll(humanRangeExpression), input.requiredStart, input.requiredEnd)
}

function hasCoveringRange(
  matches: IterableIterator<RegExpMatchArray>,
  requiredStart: number,
  requiredEnd: number,
) {
  for (const match of matches) {
    const start = Number(match[1])
    const end = Number(match[2])
    if (start <= requiredStart && end >= requiredEnd) return true
  }
  return false
}

