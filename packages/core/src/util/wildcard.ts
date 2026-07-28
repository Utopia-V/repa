export * as Wildcard from "./wildcard"

export function match(input: string, pattern: string) {
  const normalized = input.replaceAll("\\", "/")
  return new RegExp("^" + source(pattern.replaceAll("\\", "/")) + "$", process.platform === "win32" ? "si" : "s").test(
    normalized,
  )
}

export function matchIdentifier(input: string, pattern: string) {
  return new RegExp("^" + source(pattern) + "$", "s").test(input)
}

function source(pattern: string) {
  let escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
  return escaped
}
