export function repairTrailingJsonClosers(value: string) {
  let candidate = value.trimEnd()
  for (let removed = 1; removed <= 2; removed += 1) {
    const finalCharacter = candidate.at(-1)
    if (finalCharacter !== "}" && finalCharacter !== "]") return null
    candidate = candidate.slice(0, -1).trimEnd()
    try {
      JSON.parse(candidate)
      return { input: candidate, removed }
    } catch {
      // Try removing at most one more trailing closer. No other mutation is allowed.
    }
  }
  return null
}

