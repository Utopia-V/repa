export * as MaterialSelector from "./selector"

import { PDFTextProfile } from "../representation/pdf-text-profile"
import { ModelRenditionProfile } from "../representation/model-rendition-profile"

export type Coordinate =
  | { readonly kind: "whole_target.v1" }
  | {
      readonly kind: "artifact_byte_range.v1"
      readonly startByte: number
      readonly endByte: number
    }
  | {
      readonly kind: "pdf_page_range.v1"
      readonly startPage: number
      readonly endPage: number
    }
  | {
      readonly kind: "pdf_text_range.v1"
      readonly start: { readonly page: number; readonly item: number; readonly scalar: number }
      readonly end: { readonly page: number; readonly item: number; readonly scalar: number }
    }
  | {
      readonly kind: "model_text_range.v1"
      readonly startScalar: number
      readonly endScalar: number
    }

export type Witness = {
  readonly algorithm: "sha256"
  readonly digest: string
  readonly byteLength: number
}

export type TargetContent =
  | {
      readonly type: "artifact"
      readonly bytes: Uint8Array
      readonly fingerprint: Witness
    }
  | {
      readonly type: "representation"
      readonly profile: string
      readonly bytes: Uint8Array
      readonly complete: boolean
      readonly startPage?: number
      readonly output: Witness
    }

export type Selected = {
  readonly bytes: Uint8Array
  readonly witness: Witness
}

export type ErrorCode =
  | "invalid_coordinate"
  | "out_of_bounds"
  | "profile_mismatch"
  | "incomplete_target"
  | "invalid_target"

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorCode }

export function select(target: TargetContent, coordinate: Coordinate): Result<Selected> {
  if (coordinate.kind === "whole_target.v1") return selectWhole(target)
  if (coordinate.kind === "artifact_byte_range.v1") return selectArtifactRange(target, coordinate)
  if (coordinate.kind === "model_text_range.v1") return selectModelRange(target, coordinate)
  return selectPDF(target, coordinate)
}

export function representationReadSelection(coordinates: readonly Coordinate[], profile: string) {
  if (coordinates.some((coordinate) => coordinate.kind === "whole_target.v1")) {
    return success({ type: "whole" as const })
  }
  if (profile === PDFTextProfile.PROFILE) {
    const ranges = coordinates.map((coordinate) => {
      if (coordinate.kind === "pdf_page_range.v1") return [coordinate.startPage, coordinate.endPage] as const
      if (coordinate.kind === "pdf_text_range.v1") return [coordinate.start.page, coordinate.end.page] as const
      return
    })
    if (ranges.some((range) => range === undefined)) return failure("profile_mismatch")
    const exact = ranges.filter((range): range is readonly [number, number] => range !== undefined)
    if (exact.length === 0) return failure("invalid_coordinate")
    const startPage = Math.min(...exact.map((range) => range[0]))
    const endPage = Math.max(...exact.map((range) => range[1]))
    if (!positive(startPage) || !positive(endPage) || endPage < startPage) return failure("invalid_coordinate")
    return success({ type: "pdf_pages" as const, startPage, records: endPage - startPage + 1 })
  }
  if (profile === ModelRenditionProfile.PROFILE) {
    if (coordinates.some((coordinate) => coordinate.kind !== "model_text_range.v1")) {
      return failure("profile_mismatch")
    }
    return success({ type: "model_document" as const })
  }
  return failure("profile_mismatch")
}

function selectWhole(target: TargetContent): Result<Selected> {
  if (target.bytes.byteLength === 0 || (target.type === "representation" && !target.complete)) {
    return failure(target.bytes.byteLength === 0 ? "invalid_target" : "incomplete_target")
  }
  const witness = digest(target.bytes)
  const expected = target.type === "artifact" ? target.fingerprint : target.output
  if (!sameWitness(witness, expected)) return failure("invalid_target")
  return success({ bytes: target.bytes.slice(), witness: expected })
}

function selectArtifactRange(
  target: TargetContent,
  coordinate: Extract<Coordinate, { kind: "artifact_byte_range.v1" }>,
): Result<Selected> {
  if (target.type !== "artifact") return failure("profile_mismatch")
  if (
    !nonnegative(coordinate.startByte) ||
    !nonnegative(coordinate.endByte) ||
    coordinate.endByte <= coordinate.startByte
  ) {
    return failure("invalid_coordinate")
  }
  if (coordinate.endByte > target.bytes.byteLength) return failure("out_of_bounds")
  const bytes = target.bytes.slice(coordinate.startByte, coordinate.endByte)
  return success({ bytes, witness: digest(bytes) })
}

function selectPDF(
  target: TargetContent,
  coordinate: Extract<Coordinate, { kind: "pdf_page_range.v1" | "pdf_text_range.v1" }>,
): Result<Selected> {
  if (target.type !== "representation" || target.profile !== PDFTextProfile.PROFILE) {
    return failure("profile_mismatch")
  }
  const decoded = decodePDFTarget(target)
  if (!decoded.ok) return failure("invalid_target")
  const records = decoded.value.records
  const pages = decoded.value.pages
  if (coordinate.kind === "pdf_page_range.v1") {
    if (!positive(coordinate.startPage) || !positive(coordinate.endPage) || coordinate.endPage < coordinate.startPage) {
      return failure("invalid_coordinate")
    }
    const selected = records.filter(
      (record) => record.page >= coordinate.startPage && record.page <= coordinate.endPage,
    )
    if (
      selected.length !== coordinate.endPage - coordinate.startPage + 1 ||
      selected[0]?.page !== coordinate.startPage ||
      selected.at(-1)?.page !== coordinate.endPage
    ) {
      return failure("out_of_bounds")
    }
    const start = selected[0]!.start
    const end = selected.at(-1)!.end
    const bytes = target.bytes.slice(start, end)
    return success({ bytes, witness: digest(bytes) })
  }
  return selectPDFText(pages, coordinate)
}

function decodePDFTarget(target: Extract<TargetContent, { type: "representation" }>) {
  if (target.complete) {
    const decoded = PDFTextProfile.decode(target.bytes)
    if (!decoded.ok) return decoded
    return success({ records: decoded.value.records, pages: decoded.value.profile.pages })
  }
  const decoded = PDFTextProfile.decodePageRecords(target.bytes, target.startPage ?? 0)
  if (!decoded.ok) return decoded
  return success({ records: decoded.value.records, pages: decoded.value.pages })
}

function selectPDFText(
  pages: readonly PDFTextProfile.Page[],
  coordinate: Extract<Coordinate, { kind: "pdf_text_range.v1" }>,
): Result<Selected> {
  if (!validEndpoint(coordinate.start) || !validEndpoint(coordinate.end)) return failure("invalid_coordinate")
  const startPage = pages.find((page) => page.page === coordinate.start.page)
  const endPage = pages.find((page) => page.page === coordinate.end.page)
  const startItem = startPage?.items[coordinate.start.item]
  const endItem = endPage?.items[coordinate.end.item]
  if (!startItem || !endItem) return failure("out_of_bounds")
  const startText = Array.from(startItem.text)
  const endText = Array.from(endItem.text)
  if (coordinate.start.scalar > startText.length || coordinate.end.scalar > endText.length) {
    return failure("out_of_bounds")
  }
  const startKey = [coordinate.start.page, coordinate.start.item, coordinate.start.scalar] as const
  const endKey = [coordinate.end.page, coordinate.end.item, coordinate.end.scalar] as const
  if (compareEndpoint(startKey, endKey) >= 0) return failure("invalid_coordinate")
  const fragments = pages.flatMap((page) =>
    page.items.flatMap((item, itemIndex) => {
      const itemKey = [page.page, itemIndex] as const
      const startItemKey = [coordinate.start.page, coordinate.start.item] as const
      const endItemKey = [coordinate.end.page, coordinate.end.item] as const
      if (compareItem(itemKey, startItemKey) < 0 || compareItem(itemKey, endItemKey) > 0) return []
      const scalars = Array.from(item.text)
      const startScalar = compareItem(itemKey, startItemKey) === 0 ? coordinate.start.scalar : 0
      const endScalar = compareItem(itemKey, endItemKey) === 0 ? coordinate.end.scalar : scalars.length
      return [
        {
          page: page.page,
          item: itemIndex,
          startScalar,
          endScalar,
          text: scalars.slice(startScalar, endScalar).join(""),
          lineBreakAfter: item.lineBreakAfter,
        },
      ]
    }),
  )
  if (fragments.length === 0) return failure("out_of_bounds")
  const bytes = new TextEncoder().encode(`${JSON.stringify({ profile: "repa.pdf-text-selection.v1", fragments })}\n`)
  return success({ bytes, witness: digest(bytes) })
}

function selectModelRange(
  target: TargetContent,
  coordinate: Extract<Coordinate, { kind: "model_text_range.v1" }>,
): Result<Selected> {
  if (target.type !== "representation" || target.profile !== ModelRenditionProfile.PROFILE) {
    return failure("profile_mismatch")
  }
  if (!target.complete) return failure("incomplete_target")
  if (
    !nonnegative(coordinate.startScalar) ||
    !nonnegative(coordinate.endScalar) ||
    coordinate.endScalar <= coordinate.startScalar
  ) {
    return failure("invalid_coordinate")
  }
  const decoded = ModelRenditionProfile.decode(target.bytes)
  if (!decoded.ok) return failure("invalid_target")
  const scalars = Array.from(decoded.value.document.rendition)
  if (coordinate.endScalar > scalars.length) return failure("out_of_bounds")
  const bytes = new TextEncoder().encode(scalars.slice(coordinate.startScalar, coordinate.endScalar).join(""))
  return success({ bytes, witness: digest(bytes) })
}

function validEndpoint(endpoint: { readonly page: number; readonly item: number; readonly scalar: number }) {
  return positive(endpoint.page) && nonnegative(endpoint.item) && nonnegative(endpoint.scalar)
}

function compareEndpoint(left: readonly [number, number, number], right: readonly [number, number, number]) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

function compareItem(left: readonly [number, number], right: readonly [number, number]) {
  return left[0] - right[0] || left[1] - right[1]
}

function positive(value: number) {
  return Number.isSafeInteger(value) && value > 0
}

function nonnegative(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

function digest(bytes: Uint8Array): Witness {
  return {
    algorithm: "sha256",
    digest: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
  }
}

function sameWitness(left: Witness, right: Witness) {
  return left.algorithm === right.algorithm && left.digest === right.digest && left.byteLength === right.byteLength
}

function success<T>(value: T): Result<T> {
  return { ok: true, value }
}

function failure(error: ErrorCode): Result<never> {
  return { ok: false, error }
}
