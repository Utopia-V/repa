import { Schema } from "effect"

const PATH_SAFE_BASENAME = /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?![\s\S]))[a-z0-9-]{2,50}(?![\s\S])/

export const Info = Schema.String.check(Schema.isPattern(PATH_SAFE_BASENAME)).annotate({
  identifier: "AgentIdentifier",
  description:
    "A 2-50 character lowercase agent identifier containing only letters, digits, and hyphens and not a reserved Windows device basename.",
})
export type Info = Schema.Schema.Type<typeof Info>

export const parse = Schema.decodeUnknownSync(Info)

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("AgentIdentifierConflictError", {
  identifier: Info,
}) {
  override get message() {
    return `Agent identifier already exists: ${this.identifier}`
  }
}

export function isAvailable(identifier: Info, existing: readonly string[]) {
  return !existing.includes(identifier)
}

export * as AgentIdentifier from "./identifier"
