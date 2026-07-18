export * as PDFTextProfile from "./pdf-text-profile"

export const PROFILE = "repa.pdf-text.v1" as const
export const CANONICALIZER = "repa.pdf-text-jsonl.v1" as const

export interface Limits {
  readonly maxProfileBytes: number
  readonly maxRecordBytes: number
  readonly maxPages: number
  readonly maxItemsPerPage: number
  readonly maxTextItemBytes: number
  readonly maxOperatorsPerPage: number
}

export const defaultLimits = {
  maxProfileBytes: 64 * 1024 * 1024,
  maxRecordBytes: 8 * 1024 * 1024,
  maxPages: 2_000,
  maxItemsPerPage: 100_000,
  maxTextItemBytes: 1024 * 1024,
  maxOperatorsPerPage: 1_000_000,
} satisfies Limits

export interface TextItem {
  readonly text: string
  readonly lineBreakAfter: boolean
}

export interface PageSignals {
  readonly operatorCount: number
  readonly imagePaintOperations: number
}

export interface Page {
  readonly page: number
  readonly items: ReadonlyArray<TextItem>
  readonly signals?: PageSignals
}

export interface Profile {
  readonly profile: typeof PROFILE
  readonly canonicalizer: typeof CANONICALIZER
  readonly pages: ReadonlyArray<Page>
}

export interface PageRecord {
  readonly page: number
  readonly start: number
  readonly end: number
}

export interface Encoded {
  readonly bytes: Uint8Array
  readonly profile: Profile
  readonly records: ReadonlyArray<PageRecord>
}

export type ErrorCode =
  | "invalid_limits"
  | "invalid_encoding"
  | "invalid_format"
  | "noncanonical"
  | "invalid_page_sequence"
  | "page_limit_exceeded"
  | "item_limit_exceeded"
  | "invalid_text_item"
  | "text_item_limit_exceeded"
  | "invalid_signals"
  | "operator_limit_exceeded"
  | "record_limit_exceeded"
  | "profile_limit_exceeded"
  | "no_readable_text"
  | "invalid_record_range"

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorCode }

export interface ReadRequest {
  readonly startPage: number
  readonly maxRecords: number
  readonly maxBytes: number
}

export interface ReadResult {
  readonly bytes: Uint8Array
  readonly pages: ReadonlyArray<Page>
  readonly nextPage?: number
  readonly truncated: boolean
}

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function encode(pages: ReadonlyArray<Page>, limits: Limits = defaultLimits): Result<Encoded> {
  if (!validLimits(limits)) return failure("invalid_limits")
  if (!Array.isArray(pages) || pages.length === 0) return failure("invalid_page_sequence")
  if (pages.length > limits.maxPages) return failure("page_limit_exceeded")

  const normalized: Page[] = []
  const lines: Uint8Array[] = []
  const records: PageRecord[] = []
  const header = line({ profile: PROFILE, canonicalizer: CANONICALIZER, pageCount: pages.length })
  lines.push(header)
  let offset = header.byteLength
  let readable = false

  for (const [index, page] of pages.entries()) {
    const pageKeys = isRecord(page) ? Object.keys(page) : []
    const expectedPageKeys = page.signals === undefined ? ["page", "items"] : ["page", "items", "signals"]
    if (
      !isRecord(page) ||
      !sameKeys(pageKeys, expectedPageKeys) ||
      page.page !== index + 1 ||
      !Array.isArray(page.items)
    ) {
      return failure("invalid_page_sequence")
    }
    if (page.items.length > limits.maxItemsPerPage) return failure("item_limit_exceeded")

    const items: TextItem[] = []
    for (const item of page.items) {
      if (
        !isRecord(item) ||
        !sameKeys(Object.keys(item), ["text", "lineBreakAfter"]) ||
        typeof item.text !== "string" ||
        typeof item.lineBreakAfter !== "boolean"
      ) {
        return failure("invalid_text_item")
      }
      if (hasLoneSurrogate(item.text)) return failure("invalid_text_item")
      const text = item.text.normalize("NFC").replace(/\r\n?/g, "\n")
      if (encoder.encode(text).byteLength > limits.maxTextItemBytes) return failure("text_item_limit_exceeded")
      readable = readable || /\S/u.test(text)
      items.push({ text, lineBreakAfter: item.lineBreakAfter })
    }

    const signals = normalizeSignals(page.signals as PageSignals | undefined, limits)
    if (!signals.ok) return signals
    const value: Page = signals.value ? { page: page.page, items, signals: signals.value } : { page: page.page, items }
    const record = line(value)
    if (record.byteLength > limits.maxRecordBytes) return failure("record_limit_exceeded")
    if (offset + record.byteLength > limits.maxProfileBytes) return failure("profile_limit_exceeded")
    normalized.push(value)
    lines.push(record)
    records.push({ page: page.page, start: offset, end: offset + record.byteLength })
    offset += record.byteLength
  }

  if (!readable) return failure("no_readable_text")
  return success({
    bytes: concat(lines, offset),
    profile: { profile: PROFILE, canonicalizer: CANONICALIZER, pages: normalized },
    records,
  })
}

export function decode(bytes: Uint8Array, limits: Limits = defaultLimits): Result<Encoded> {
  if (!validLimits(limits)) return failure("invalid_limits")
  if (bytes.byteLength > limits.maxProfileBytes) return failure("profile_limit_exceeded")
  const text = decodeUTF8(bytes)
  if (!text.ok) return text
  if (!text.value.endsWith("\n")) return failure("invalid_format")
  const rows = text.value.slice(0, -1).split("\n")
  if (rows.length < 2) return failure("invalid_format")

  const header = parseJSON(rows[0]!)
  if (!header.ok || !validHeader(header.value)) return failure("invalid_format")
  if (header.value.pageCount > limits.maxPages) return failure("page_limit_exceeded")
  if (rows.length !== header.value.pageCount + 1) return failure("invalid_format")

  const pages: Page[] = []
  for (let index = 1; index < rows.length; index++) {
    if (encoder.encode(`${rows[index]}\n`).byteLength > limits.maxRecordBytes) {
      return failure("record_limit_exceeded")
    }
    const parsed = parseJSON(rows[index]!)
    if (!parsed.ok) return parsed
    const page = parsePage(parsed.value)
    if (!page.ok) return page
    pages.push(page.value)
  }

  const canonical = encode(pages, limits)
  if (!canonical.ok) return canonical
  if (!equalBytes(canonical.value.bytes, bytes)) return failure("noncanonical")
  return success({ ...canonical.value, bytes })
}

export function readPageRecords(encoded: Encoded, request: ReadRequest): Result<ReadResult> {
  if (
    !Number.isSafeInteger(request.startPage) ||
    request.startPage < 1 ||
    request.startPage > encoded.records.length + 1 ||
    !Number.isSafeInteger(request.maxRecords) ||
    request.maxRecords < 0 ||
    !Number.isSafeInteger(request.maxBytes) ||
    request.maxBytes < 0
  ) {
    return failure("invalid_record_range")
  }

  const selected: PageRecord[] = []
  let byteLength = 0
  for (const record of encoded.records.slice(request.startPage - 1)) {
    if (selected.length >= request.maxRecords) break
    const nextLength = byteLength + record.end - record.start
    if (nextLength > request.maxBytes) break
    selected.push(record)
    byteLength = nextLength
  }

  const nextPage = request.startPage + selected.length
  const truncated = nextPage <= encoded.records.length
  return success({
    bytes: concat(
      selected.map((record) => encoded.bytes.subarray(record.start, record.end)),
      byteLength,
    ),
    pages: encoded.profile.pages.slice(request.startPage - 1, request.startPage - 1 + selected.length),
    ...(truncated ? { nextPage } : {}),
    truncated,
  })
}

function normalizeSignals(signals: PageSignals | undefined, limits: Limits): Result<PageSignals | undefined> {
  if (signals === undefined) return success(undefined)
  if (
    !isRecord(signals) ||
    !sameKeys(Object.keys(signals), ["operatorCount", "imagePaintOperations"]) ||
    !Number.isSafeInteger(signals.operatorCount) ||
    signals.operatorCount < 0 ||
    !Number.isSafeInteger(signals.imagePaintOperations) ||
    signals.imagePaintOperations < 0 ||
    signals.imagePaintOperations > signals.operatorCount
  ) {
    return failure("invalid_signals")
  }
  if (signals.operatorCount > limits.maxOperatorsPerPage) return failure("operator_limit_exceeded")
  return success({ operatorCount: signals.operatorCount, imagePaintOperations: signals.imagePaintOperations })
}

function parsePage(value: unknown): Result<Page> {
  if (!isRecord(value)) return failure("invalid_format")
  const keys = Object.keys(value)
  const expected = value.signals === undefined ? ["page", "items"] : ["page", "items", "signals"]
  if (!sameKeys(keys, expected) || !Number.isSafeInteger(value.page) || !Array.isArray(value.items)) {
    return failure("invalid_format")
  }
  const items: TextItem[] = []
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      !sameKeys(Object.keys(item), ["text", "lineBreakAfter"]) ||
      typeof item.text !== "string" ||
      typeof item.lineBreakAfter !== "boolean"
    ) {
      return failure("invalid_format")
    }
    items.push({ text: item.text, lineBreakAfter: item.lineBreakAfter })
  }
  if (value.signals === undefined) return success({ page: value.page as number, items })
  if (
    !isRecord(value.signals) ||
    !sameKeys(Object.keys(value.signals), ["operatorCount", "imagePaintOperations"]) ||
    typeof value.signals.operatorCount !== "number" ||
    typeof value.signals.imagePaintOperations !== "number"
  ) {
    return failure("invalid_format")
  }
  return success({
    page: value.page as number,
    items,
    signals: {
      operatorCount: value.signals.operatorCount,
      imagePaintOperations: value.signals.imagePaintOperations,
    },
  })
}

function validHeader(value: unknown): value is { pageCount: number } {
  return (
    isRecord(value) &&
    sameKeys(Object.keys(value), ["profile", "canonicalizer", "pageCount"]) &&
    value.profile === PROFILE &&
    value.canonicalizer === CANONICALIZER &&
    typeof value.pageCount === "number" &&
    Number.isSafeInteger(value.pageCount) &&
    value.pageCount > 0
  )
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

function parseJSON(text: string): Result<unknown> {
  try {
    return success(JSON.parse(text))
  } catch {
    return failure("invalid_format")
  }
}

function line(value: unknown) {
  return encoder.encode(`${JSON.stringify(value)}\n`)
}

function concat(chunks: ReadonlyArray<Uint8Array>, byteLength: number) {
  const result = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}

function hasLoneSurrogate(value: string) {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index)
    if (unit < 0xd800 || unit > 0xdfff) continue
    if (unit >= 0xdc00) return true
    const next = value.charCodeAt(index + 1)
    if (next < 0xdc00 || next > 0xdfff) return true
    index++
  }
  return false
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
