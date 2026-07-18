export * as PDFWorkerFrame from "./pdf-worker-frame"

import { createHash } from "node:crypto"
import { PROFILE } from "./pdf-text-profile"

export const PROTOCOL = "repa.pdf-worker-frame.v1" as const

export const diagnosticCodes = [
  "parser_warning",
  "parser_info",
  "source_page_count_mismatch",
  "unsupported_text_item",
  "operator_signals_unavailable",
] as const
export type DiagnosticCode = (typeof diagnosticCodes)[number]

export const workerErrorCodes = [
  "invalid_arguments",
  "input_too_large",
  "runtime_unavailable",
  "invalid_pdf",
  "page_limit_exceeded",
  "item_limit_exceeded",
  "text_item_limit_exceeded",
  "operator_limit_exceeded",
  "diagnostic_limit_exceeded",
  "profile_limit_exceeded",
  "no_readable_text",
  "internal_error",
] as const
export type WorkerErrorCode = (typeof workerErrorCodes)[number]

export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly count: number
}

export interface InputAttestation {
  readonly algorithm: "sha256"
  readonly digest: string
  readonly byteLength: number
}

export interface SuccessFrame {
  readonly status: "success"
  readonly input: InputAttestation
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly payload: Uint8Array
}

export interface ErrorFrame {
  readonly status: "error"
  readonly input: InputAttestation
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly error: WorkerErrorCode
}

export type Frame = SuccessFrame | ErrorFrame

export interface Limits {
  readonly maxFrameBytes: number
  readonly maxHeaderBytes: number
  readonly maxPayloadBytes: number
  readonly maxDiagnostics: number
  readonly maxDiagnosticCount: number
}

export const defaultLimits = {
  maxFrameBytes: 65 * 1024 * 1024,
  maxHeaderBytes: 16 * 1024,
  maxPayloadBytes: 64 * 1024 * 1024,
  maxDiagnostics: diagnosticCodes.length,
  maxDiagnosticCount: 1_000_000,
} satisfies Limits

export type ErrorCode =
  | "invalid_limits"
  | "frame_limit_exceeded"
  | "header_limit_exceeded"
  | "payload_limit_exceeded"
  | "invalid_frame"
  | "noncanonical_header"
  | "payload_digest_mismatch"
  | "invalid_attestation"
  | "invalid_diagnostics"

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorCode }

const magic = new Uint8Array([0x52, 0x50, 0x44, 0x46, 0x00, 0x01, 0x0d, 0x0a])
const prefixBytes = 16
const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function encodeSuccess(
  input: InputAttestation,
  diagnostics: ReadonlyArray<Diagnostic>,
  payload: Uint8Array,
  limits: Limits = defaultLimits,
): Result<Uint8Array> {
  if (!validLimits(limits)) return failure("invalid_limits")
  if (!validAttestation(input)) return failure("invalid_attestation")
  if (payload.byteLength > limits.maxPayloadBytes) return failure("payload_limit_exceeded")
  const normalized = normalizeDiagnostics(diagnostics, limits)
  if (!normalized.ok) return normalized
  const header = {
    protocol: PROTOCOL,
    status: "success" as const,
    input,
    diagnostics: normalized.value,
    payload: {
      profile: PROFILE,
      algorithm: "sha256" as const,
      digest: digest(payload),
      byteLength: payload.byteLength,
    },
  }
  return encodeFrame(header, payload, limits)
}

export function encodeError(
  input: InputAttestation,
  diagnostics: ReadonlyArray<Diagnostic>,
  error: WorkerErrorCode,
  limits: Limits = defaultLimits,
): Result<Uint8Array> {
  if (!validLimits(limits)) return failure("invalid_limits")
  if (!validAttestation(input)) return failure("invalid_attestation")
  if (!workerErrorCodes.includes(error)) return failure("invalid_frame")
  const normalized = normalizeDiagnostics(diagnostics, limits)
  if (!normalized.ok) return normalized
  return encodeFrame(
    {
      protocol: PROTOCOL,
      status: "error" as const,
      input,
      diagnostics: normalized.value,
      error: { code: error },
    },
    new Uint8Array(),
    limits,
  )
}

export function decode(bytes: Uint8Array, limits: Limits = defaultLimits): Result<Frame> {
  if (!validLimits(limits)) return failure("invalid_limits")
  if (bytes.byteLength > limits.maxFrameBytes) return failure("frame_limit_exceeded")
  if (bytes.byteLength < prefixBytes || !equalBytes(bytes.subarray(0, magic.byteLength), magic)) {
    return failure("invalid_frame")
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength = view.getUint32(8, false)
  const payloadLength = view.getUint32(12, false)
  if (headerLength > limits.maxHeaderBytes) return failure("header_limit_exceeded")
  if (payloadLength > limits.maxPayloadBytes) return failure("payload_limit_exceeded")
  if (prefixBytes + headerLength + payloadLength !== bytes.byteLength) return failure("invalid_frame")

  const headerBytes = bytes.subarray(prefixBytes, prefixBytes + headerLength)
  const header = parseHeader(headerBytes, limits)
  if (!header.ok) return header
  const payload = bytes.subarray(prefixBytes + headerLength)
  if (header.value.status === "error") {
    if (payload.byteLength !== 0) return failure("invalid_frame")
    const canonical = canonicalErrorHeader(header.value.input, header.value.diagnostics, header.value.error.code)
    if (!equalBytes(headerBytes, encoder.encode(JSON.stringify(canonical)))) return failure("noncanonical_header")
    return success({
      status: "error",
      input: header.value.input,
      diagnostics: header.value.diagnostics,
      error: header.value.error.code,
    })
  }

  if (payload.byteLength !== header.value.payload.byteLength) return failure("invalid_frame")
  if (digest(payload) !== header.value.payload.digest) return failure("payload_digest_mismatch")
  const canonical = canonicalSuccessHeader(header.value.input, header.value.diagnostics, payload)
  if (!equalBytes(headerBytes, encoder.encode(JSON.stringify(canonical)))) return failure("noncanonical_header")
  return success({
    status: "success",
    input: header.value.input,
    diagnostics: header.value.diagnostics,
    payload,
  })
}

export function attest(bytes: Uint8Array): InputAttestation {
  return { algorithm: "sha256", digest: digest(bytes), byteLength: bytes.byteLength }
}

function encodeFrame(header: unknown, payload: Uint8Array, limits: Limits): Result<Uint8Array> {
  const headerBytes = encoder.encode(JSON.stringify(header))
  if (headerBytes.byteLength > limits.maxHeaderBytes) return failure("header_limit_exceeded")
  const byteLength = prefixBytes + headerBytes.byteLength + payload.byteLength
  if (byteLength > limits.maxFrameBytes) return failure("frame_limit_exceeded")
  const result = new Uint8Array(byteLength)
  result.set(magic)
  const view = new DataView(result.buffer)
  view.setUint32(8, headerBytes.byteLength, false)
  view.setUint32(12, payload.byteLength, false)
  result.set(headerBytes, prefixBytes)
  result.set(payload, prefixBytes + headerBytes.byteLength)
  return success(result)
}

function parseHeader(bytes: Uint8Array, limits: Limits): Result<SuccessHeader | ErrorHeader> {
  const text = decodeUTF8(bytes)
  if (!text.ok) return text
  const parsed = parseJSON(text.value)
  if (!parsed.ok || !isRecord(parsed.value)) return failure("invalid_frame")
  if (parsed.value.status === "success") return parseSuccessHeader(parsed.value, limits)
  if (parsed.value.status === "error") return parseErrorHeader(parsed.value, limits)
  return failure("invalid_frame")
}

function parseSuccessHeader(value: Record<string, unknown>, limits: Limits): Result<SuccessHeader> {
  if (!sameKeys(Object.keys(value), ["protocol", "status", "input", "diagnostics", "payload"])) {
    return failure("invalid_frame")
  }
  const input = parseAttestation(value.input)
  if (!input.ok) return input
  const diagnostics = parseDiagnostics(value.diagnostics, limits)
  if (!diagnostics.ok) return diagnostics
  if (value.protocol !== PROTOCOL || !isRecord(value.payload)) return failure("invalid_frame")
  if (!sameKeys(Object.keys(value.payload), ["profile", "algorithm", "digest", "byteLength"])) {
    return failure("invalid_frame")
  }
  if (
    value.payload.profile !== PROFILE ||
    value.payload.algorithm !== "sha256" ||
    !isDigest(value.payload.digest) ||
    !isByteLength(value.payload.byteLength)
  ) {
    return failure("invalid_frame")
  }
  return success({
    protocol: PROTOCOL,
    status: "success",
    input: input.value,
    diagnostics: diagnostics.value,
    payload: {
      profile: PROFILE,
      algorithm: "sha256",
      digest: value.payload.digest,
      byteLength: value.payload.byteLength,
    },
  })
}

function parseErrorHeader(value: Record<string, unknown>, limits: Limits): Result<ErrorHeader> {
  if (!sameKeys(Object.keys(value), ["protocol", "status", "input", "diagnostics", "error"])) {
    return failure("invalid_frame")
  }
  const input = parseAttestation(value.input)
  if (!input.ok) return input
  const diagnostics = parseDiagnostics(value.diagnostics, limits)
  if (!diagnostics.ok) return diagnostics
  if (
    value.protocol !== PROTOCOL ||
    !isRecord(value.error) ||
    !sameKeys(Object.keys(value.error), ["code"]) ||
    typeof value.error.code !== "string" ||
    !workerErrorCodes.includes(value.error.code as WorkerErrorCode)
  ) {
    return failure("invalid_frame")
  }
  return success({
    protocol: PROTOCOL,
    status: "error",
    input: input.value,
    diagnostics: diagnostics.value,
    error: { code: value.error.code as WorkerErrorCode },
  })
}

function parseAttestation(value: unknown): Result<InputAttestation> {
  if (!isRecord(value) || !sameKeys(Object.keys(value), ["algorithm", "digest", "byteLength"])) {
    return failure("invalid_attestation")
  }
  const input = { algorithm: value.algorithm, digest: value.digest, byteLength: value.byteLength }
  if (!validAttestation(input)) return failure("invalid_attestation")
  return success(input)
}

function parseDiagnostics(value: unknown, limits: Limits): Result<ReadonlyArray<Diagnostic>> {
  if (!Array.isArray(value)) return failure("invalid_diagnostics")
  const diagnostics: Diagnostic[] = []
  for (const item of value) {
    if (
      !isRecord(item) ||
      !sameKeys(Object.keys(item), ["code", "count"]) ||
      typeof item.code !== "string" ||
      !diagnosticCodes.includes(item.code as DiagnosticCode) ||
      !Number.isSafeInteger(item.count) ||
      (item.count as number) < 1
    ) {
      return failure("invalid_diagnostics")
    }
    diagnostics.push({ code: item.code as DiagnosticCode, count: item.count as number })
  }
  const normalized = normalizeDiagnostics(diagnostics, limits)
  if (!normalized.ok || !sameDiagnostics(diagnostics, normalized.value)) return failure("invalid_diagnostics")
  return success(diagnostics)
}

function normalizeDiagnostics(
  diagnostics: ReadonlyArray<Diagnostic>,
  limits: Limits,
): Result<ReadonlyArray<Diagnostic>> {
  if (!Array.isArray(diagnostics)) return failure("invalid_diagnostics")
  const counts = new Map<DiagnosticCode, number>()
  let total = 0
  for (const diagnostic of diagnostics) {
    if (!diagnosticCodes.includes(diagnostic.code) || !Number.isSafeInteger(diagnostic.count) || diagnostic.count < 1) {
      return failure("invalid_diagnostics")
    }
    total += diagnostic.count
    if (total > limits.maxDiagnosticCount) return failure("invalid_diagnostics")
    const count = (counts.get(diagnostic.code) ?? 0) + diagnostic.count
    counts.set(diagnostic.code, count)
  }
  const normalized = diagnosticCodes.flatMap((code) => {
    const count = counts.get(code)
    return count === undefined ? [] : [{ code, count }]
  })
  if (normalized.length > limits.maxDiagnostics) return failure("invalid_diagnostics")
  return success(normalized)
}

function canonicalSuccessHeader(input: InputAttestation, diagnostics: ReadonlyArray<Diagnostic>, payload: Uint8Array) {
  return {
    protocol: PROTOCOL,
    status: "success" as const,
    input,
    diagnostics,
    payload: {
      profile: PROFILE,
      algorithm: "sha256" as const,
      digest: digest(payload),
      byteLength: payload.byteLength,
    },
  }
}

function canonicalErrorHeader(input: InputAttestation, diagnostics: ReadonlyArray<Diagnostic>, error: WorkerErrorCode) {
  return { protocol: PROTOCOL, status: "error" as const, input, diagnostics, error: { code: error } }
}

function validAttestation(value: unknown): value is InputAttestation {
  return isRecord(value) && value.algorithm === "sha256" && isDigest(value.digest) && isByteLength(value.byteLength)
}

function validLimits(limits: Limits) {
  return Object.values(limits).every((value) => Number.isSafeInteger(value) && value > 0)
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function isByteLength(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function decodeUTF8(bytes: Uint8Array): Result<string> {
  try {
    return success(decoder.decode(bytes))
  } catch {
    return failure("invalid_frame")
  }
}

function parseJSON(text: string): Result<unknown> {
  try {
    return success(JSON.parse(text))
  } catch {
    return failure("invalid_frame")
  }
}

function sameDiagnostics(left: ReadonlyArray<Diagnostic>, right: ReadonlyArray<Diagnostic>) {
  return (
    left.length === right.length &&
    left.every((item, index) => item.code === right[index]?.code && item.count === right[index]?.count)
  )
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}

function sameKeys(actual: ReadonlyArray<string>, expected: ReadonlyArray<string>) {
  return actual.length === expected.length && expected.every((key) => actual.includes(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function success<T>(value: T): Result<T> {
  return { ok: true, value }
}

function failure(error: ErrorCode): Result<never> {
  return { ok: false, error }
}

interface SuccessHeader {
  readonly protocol: typeof PROTOCOL
  readonly status: "success"
  readonly input: InputAttestation
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly payload: {
    readonly profile: typeof PROFILE
    readonly algorithm: "sha256"
    readonly digest: string
    readonly byteLength: number
  }
}

interface ErrorHeader {
  readonly protocol: typeof PROTOCOL
  readonly status: "error"
  readonly input: InputAttestation
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly error: { readonly code: WorkerErrorCode }
}
