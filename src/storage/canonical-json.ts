export function canonicalJson(value: unknown): string {
  const result = JSON.stringify(canonicalValue(value))
  if (result === undefined) throw new TypeError("Value is not representable as JSON")
  return result
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return value
}
