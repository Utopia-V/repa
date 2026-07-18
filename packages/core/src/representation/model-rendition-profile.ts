export * as ModelRenditionProfile from "./model-rendition-profile"

export const PROFILE = "repa.model-rendition.v1" as const
export const CANONICALIZER = "repa.model-rendition-json.v1" as const

export type Document = {
  readonly rendition: string
  readonly uncertainty: readonly string[]
  readonly omissions: readonly string[]
}

export type Encoded = {
  readonly bytes: Uint8Array
  readonly document: Document
}

export type Limits = {
  readonly maxProfileBytes: number
  readonly maxRenditionBytes: number
  readonly maxClaims: number
  readonly maxClaimBytes: number
}

export const defaultLimits = {
  maxProfileBytes: 16 * 1024 * 1024,
  maxRenditionBytes: 15 * 1024 * 1024,
  maxClaims: 256,
  maxClaimBytes: 16 * 1024,
} satisfies Limits

export type ErrorCode =
  | "invalid_limits"
  | "invalid_encoding"
  | "invalid_format"
  | "noncanonical"
  | "empty_rendition"
  | "rendition_limit_exceeded"
  | "claim_limit_exceeded"
  | "profile_limit_exceeded"

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorCode }

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function encode(document: Document, limits: Limits = defaultLimits): Result<Encoded> {
  if (!validLimits(limits)) return failure("invalid_limits")
  const normalized = normalize(document, limits)
  if (!normalized.ok) return normalized
  const bytes = encoder.encode(
    `${JSON.stringify({ profile: PROFILE, canonicalizer: CANONICALIZER, ...normalized.value })}\n`,
  )
  if (bytes.byteLength > limits.maxProfileBytes) return failure("profile_limit_exceeded")
  return success({ bytes, document: normalized.value })
}

export function decode(bytes: Uint8Array, limits: Limits = defaultLimits): Result<Encoded> {
  if (!validLimits(limits)) return failure("invalid_limits")
  if (bytes.byteLength > limits.maxProfileBytes) return failure("profile_limit_exceeded")
  const text = decodeUTF8(bytes)
  if (!text.ok) return text
  if (!text.value.endsWith("\n") || text.value.slice(0, -1).includes("\n")) return failure("invalid_format")
  const parsed = parseJSON(text.value.slice(0, -1))
  if (!parsed.ok || !isRecord(parsed.value)) return failure("invalid_format")
  if (
    !sameKeys(Object.keys(parsed.value), ["profile", "canonicalizer", "rendition", "uncertainty", "omissions"]) ||
    parsed.value.profile !== PROFILE ||
    parsed.value.canonicalizer !== CANONICALIZER ||
    typeof parsed.value.rendition !== "string" ||
    !Array.isArray(parsed.value.uncertainty) ||
    !parsed.value.uncertainty.every((value) => typeof value === "string") ||
    !Array.isArray(parsed.value.omissions) ||
    !parsed.value.omissions.every((value) => typeof value === "string")
  ) {
    return failure("invalid_format")
  }
  const canonical = encode(
    {
      rendition: parsed.value.rendition,
      uncertainty: parsed.value.uncertainty as string[],
      omissions: parsed.value.omissions as string[],
    },
    limits,
  )
  if (!canonical.ok) return canonical
  if (!equalBytes(canonical.value.bytes, bytes)) return failure("noncanonical")
  return success({ ...canonical.value, bytes })
}

function normalize(document: Document, limits: Limits): Result<Document> {
  if (
    !isRecord(document) ||
    typeof document.rendition !== "string" ||
    !Array.isArray(document.uncertainty) ||
    !document.uncertainty.every((value) => typeof value === "string") ||
    !Array.isArray(document.omissions) ||
    !document.omissions.every((value) => typeof value === "string")
  ) {
    return failure("invalid_format")
  }
  const rendition = normalizeText(document.rendition)
  if (!/\S/u.test(rendition)) return failure("empty_rendition")
  if (encoder.encode(rendition).byteLength > limits.maxRenditionBytes) {
    return failure("rendition_limit_exceeded")
  }
  const claims = [...document.uncertainty, ...document.omissions].map(normalizeText)
  if (
    claims.length > limits.maxClaims ||
    claims.some((value) => encoder.encode(value).byteLength > limits.maxClaimBytes)
  ) {
    return failure("claim_limit_exceeded")
  }
  return success({
    rendition,
    uncertainty: claims.slice(0, document.uncertainty.length),
    omissions: claims.slice(document.uncertainty.length),
  })
}

function normalizeText(value: string) {
  return value.normalize("NFC").replace(/\r\n?/g, "\n")
}

function validLimits(limits: Limits) {
  return Object.values(limits).every((value) => Number.isSafeInteger(value) && value > 0)
}

function decodeUTF8(bytes: Uint8Array): Result<string> {
  try {
    return success(decoder.decode(bytes))
  } catch {
    return failure("invalid_encoding")
  }
}

function parseJSON(value: string): Result<unknown> {
  try {
    return success(JSON.parse(value))
  } catch {
    return failure("invalid_format")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sameKeys(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && expected.every((key) => actual.includes(key))
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}

function success<T>(value: T): Result<T> {
  return { ok: true, value }
}

function failure(error: ErrorCode): Result<never> {
  return { ok: false, error }
}
