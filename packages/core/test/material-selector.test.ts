import { describe, expect, test } from "bun:test"
import { MaterialSelector } from "@opencode-ai/core/material-map/selector"
import { ModelRenditionProfile } from "@opencode-ai/core/representation/model-rendition-profile"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe("Material selector algebra", () => {
  test("selects whole targets and exact Artifact byte ranges", () => {
    const bytes = encoder.encode("A\r\nCafé🙂Z")
    const target = { type: "artifact" as const, bytes, fingerprint: witness(bytes) }
    expect(unwrap(MaterialSelector.select(target, { kind: "whole_target.v1" }))).toEqual({
      bytes,
      witness: witness(bytes),
    })
    const range = unwrap(MaterialSelector.select(target, { kind: "artifact_byte_range.v1", startByte: 1, endByte: 5 }))
    expect(range.bytes).toEqual(bytes.slice(1, 5))
    expect(range.witness).toEqual(witness(bytes.slice(1, 5)))
    expect(MaterialSelector.select(target, { kind: "artifact_byte_range.v1", startByte: 2, endByte: 2 })).toEqual({
      ok: false,
      error: "invalid_coordinate",
    })
  })

  test("selects canonical PDF page records and item/scalar fragments across empty pages", () => {
    const encoded = unwrapResult(
      PDFTextProfile.encode([
        {
          page: 1,
          items: [
            { text: "Cafe\u0301\r\n🙂alpha", lineBreakAfter: true },
            { text: "beta", lineBreakAfter: false },
          ],
        },
        { page: 2, items: [] },
        { page: 3, items: [{ text: "gamma🙂delta", lineBreakAfter: false }] },
      ]),
    )
    const target = {
      type: "representation" as const,
      profile: PDFTextProfile.PROFILE,
      bytes: encoded.bytes,
      complete: true,
      output: witness(encoded.bytes),
    }
    const pages = unwrap(MaterialSelector.select(target, { kind: "pdf_page_range.v1", startPage: 2, endPage: 3 }))
    const expectedPageBytes = encoded.bytes.slice(encoded.records[1]!.start, encoded.records[2]!.end)
    expect(pages).toEqual({ bytes: expectedPageBytes, witness: witness(expectedPageBytes) })

    const empty = unwrap(MaterialSelector.select(target, { kind: "pdf_page_range.v1", startPage: 2, endPage: 2 }))
    expect(empty.bytes).toEqual(encoded.bytes.slice(encoded.records[1]!.start, encoded.records[1]!.end))

    const text = unwrap(
      MaterialSelector.select(target, {
        kind: "pdf_text_range.v1",
        start: { page: 1, item: 0, scalar: 4 },
        end: { page: 3, item: 0, scalar: 6 },
      }),
    )
    expect(JSON.parse(decoder.decode(text.bytes))).toEqual({
      profile: "repa.pdf-text-selection.v1",
      fragments: [
        {
          page: 1,
          item: 0,
          startScalar: 4,
          endScalar: 11,
          text: "\n🙂alpha",
          lineBreakAfter: true,
        },
        { page: 1, item: 1, startScalar: 0, endScalar: 4, text: "beta", lineBreakAfter: false },
        { page: 3, item: 0, startScalar: 0, endScalar: 6, text: "gamma🙂", lineBreakAfter: false },
      ],
    })

    const partial = unwrapResult(
      PDFTextProfile.readPageRecords(encoded, {
        startPage: 2,
        maxRecords: 2,
        maxBytes: Number.MAX_SAFE_INTEGER,
      }),
    )
    expect(
      unwrap(
        MaterialSelector.select(
          { ...target, bytes: partial.bytes, complete: false, startPage: 2 },
          { kind: "pdf_page_range.v1", startPage: 2, endPage: 3 },
        ),
      ).witness,
    ).toEqual(pages.witness)
  })

  test("counts model ranges in Unicode scalars and keeps unknown profiles whole-only", () => {
    const encoded = unwrapResult(
      ModelRenditionProfile.encode({ rendition: "e\u0301\r\nA🙂B", uncertainty: [], omissions: [] }),
    )
    const target = {
      type: "representation" as const,
      profile: ModelRenditionProfile.PROFILE,
      bytes: encoded.bytes,
      complete: true,
      output: witness(encoded.bytes),
    }
    const selected = unwrap(
      MaterialSelector.select(target, { kind: "model_text_range.v1", startScalar: 2, endScalar: 4 }),
    )
    expect(decoder.decode(selected.bytes)).toBe("A🙂")
    expect(selected.witness).toEqual(witness(encoder.encode("A🙂")))

    const unknown = { ...target, profile: "future.profile.v9" }
    expect(MaterialSelector.select(unknown, { kind: "model_text_range.v1", startScalar: 0, endScalar: 1 })).toEqual({
      ok: false,
      error: "profile_mismatch",
    })
    expect(unwrap(MaterialSelector.select(unknown, { kind: "whole_target.v1" })).witness).toEqual(
      witness(encoded.bytes),
    )
  })
})

function witness(bytes: Uint8Array) {
  return {
    algorithm: "sha256" as const,
    digest: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
  }
}

function unwrap<T>(result: MaterialSelector.Result<T>) {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function unwrapResult<T>(result: PDFTextProfile.Result<T> | ModelRenditionProfile.Result<T>) {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
