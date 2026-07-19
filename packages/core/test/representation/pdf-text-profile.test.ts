import { describe, expect, test } from "bun:test"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"

const pages = [
  {
    page: 1,
    items: [
      { text: "Cafe\u0301\r\nlesson", lineBreakAfter: true },
      { text: " page one", lineBreakAfter: false },
    ],
    signals: { operatorCount: 8, imagePaintOperations: 0 },
  },
  { page: 2, items: [], signals: { operatorCount: 0, imagePaintOperations: 0 } },
  {
    page: 3,
    items: [{ text: "mixed page", lineBreakAfter: false }],
    signals: { operatorCount: 12, imagePaintOperations: 1 },
  },
] satisfies PDFTextProfile.Page[]

describe("PDF text profile v1", () => {
  test("serializes one deterministic canonical record for every ordered page", () => {
    const first = unwrap(PDFTextProfile.encode(pages))
    const second = unwrap(PDFTextProfile.encode(pages))
    expect(first.bytes).toEqual(second.bytes)
    expect(new TextDecoder().decode(first.bytes)).toBe(
      [
        '{"profile":"repa.pdf-text.v1","canonicalizer":"repa.pdf-text-jsonl.v1","pageCount":3}',
        '{"page":1,"items":[{"text":"Café\\nlesson","lineBreakAfter":true},{"text":" page one","lineBreakAfter":false}],"signals":{"operatorCount":8,"imagePaintOperations":0}}',
        '{"page":2,"items":[],"signals":{"operatorCount":0,"imagePaintOperations":0}}',
        '{"page":3,"items":[{"text":"mixed page","lineBreakAfter":false}],"signals":{"operatorCount":12,"imagePaintOperations":1}}',
        "",
      ].join("\n"),
    )
    const decoded = unwrap(PDFTextProfile.decode(first.bytes))
    expect(decoded.profile.pages.map((page) => page.page)).toEqual([1, 2, 3])
    expect(decoded.profile.pages[1]?.items).toEqual([])
  })

  test("rejects noncanonical, malformed, oversized, and all-empty profiles", () => {
    const encoded = unwrap(PDFTextProfile.encode(pages))
    const noncanonical = new TextEncoder().encode(
      new TextDecoder().decode(encoded.bytes).replace('"page":1', '"page" :1'),
    )
    expect(PDFTextProfile.decode(noncanonical)).toEqual({ ok: false, error: "noncanonical" })

    const wrongSequence = pages.map((page) => ({ ...page }))
    wrongSequence[1] = { ...wrongSequence[1]!, page: 4 }
    expect(PDFTextProfile.encode(wrongSequence)).toEqual({ ok: false, error: "invalid_page_sequence" })
    expect(PDFTextProfile.encode([{ page: 1, items: [{ text: " \n", lineBreakAfter: true }] }])).toEqual({
      ok: false,
      error: "no_readable_text",
    })
    expect(
      PDFTextProfile.encode(pages, {
        ...PDFTextProfile.defaultLimits,
        maxTextItemBytes: 2,
      }),
    ).toEqual({ ok: false, error: "text_item_limit_exceeded" })
  })

  test("rejects invalid encoding, page gaps, duplicate or reordered pages, closed-field violations, and truncation", () => {
    const encoded = unwrap(PDFTextProfile.encode(pages))
    const rows = new TextDecoder().decode(encoded.bytes).trimEnd().split("\n")
    const bytes = (records: readonly string[]) => new TextEncoder().encode(`${records.join("\n")}\n`)

    expect(PDFTextProfile.decode(new Uint8Array([0xff]))).toEqual({ ok: false, error: "invalid_encoding" })
    expect(PDFTextProfile.decode(bytes([rows[0]!, rows[1]!, rows[3]!]))).toEqual({
      ok: false,
      error: "invalid_format",
    })
    expect(PDFTextProfile.decode(bytes([rows[0]!, rows[1]!, rows[1]!, rows[3]!]))).toEqual({
      ok: false,
      error: "invalid_page_sequence",
    })
    expect(PDFTextProfile.decode(bytes([rows[0]!, rows[2]!, rows[1]!, rows[3]!]))).toEqual({
      ok: false,
      error: "invalid_page_sequence",
    })
    expect(
      PDFTextProfile.decode(
        bytes([rows[0]!, rows[1]!.replace('"items":', '"raw":"secret","items":'), rows[2]!, rows[3]!]),
      ),
    ).toEqual({ ok: false, error: "invalid_format" })
    expect(
      PDFTextProfile.decode(
        bytes([
          rows[0]!,
          rows[1]!.replace('"lineBreakAfter":true', '"lineBreakAfter":true,"raw":"secret"'),
          rows[2]!,
          rows[3]!,
        ]),
      ),
    ).toEqual({ ok: false, error: "invalid_format" })
    expect(
      PDFTextProfile.decode(
        bytes([
          rows[0]!,
          rows[1]!.replace('"imagePaintOperations":0', '"imagePaintOperations":0,"raw":"secret"'),
          rows[2]!,
          rows[3]!,
        ]),
      ),
    ).toEqual({ ok: false, error: "invalid_format" })
    expect(PDFTextProfile.decode(encoded.bytes.subarray(0, encoded.bytes.byteLength - 1))).toEqual({
      ok: false,
      error: "invalid_format",
    })
    expect(
      PDFTextProfile.decode(encoded.bytes, {
        ...PDFTextProfile.defaultLimits,
        maxProfileBytes: encoded.bytes.byteLength - 1,
      }),
    ).toEqual({ ok: false, error: "profile_limit_exceeded" })
  })

  test("returns only complete contiguous page records within independent budgets", () => {
    const encoded = unwrap(PDFTextProfile.encode(pages))
    const firstSize = encoded.records[0]!.end - encoded.records[0]!.start
    const prefix = unwrap(PDFTextProfile.readPageRecords(encoded, { startPage: 1, maxRecords: 3, maxBytes: firstSize }))
    expect(prefix.pages.map((page) => page.page)).toEqual([1])
    expect(prefix.nextPage).toBe(2)
    expect(prefix.truncated).toBe(true)
    expect(new TextDecoder().decode(prefix.bytes)).toContain('"page":1')

    const none = unwrap(
      PDFTextProfile.readPageRecords(encoded, { startPage: 1, maxRecords: 3, maxBytes: firstSize - 1 }),
    )
    expect(none.bytes.byteLength).toBe(0)
    expect(none.pages).toEqual([])
    expect(none.nextPage).toBe(1)
    expect(none.truncated).toBe(true)

    const tail = unwrap(
      PDFTextProfile.readPageRecords(encoded, { startPage: 2, maxRecords: 2, maxBytes: Number.MAX_SAFE_INTEGER }),
    )
    expect(tail.pages.map((page) => page.page)).toEqual([2, 3])
    expect(tail.nextPage).toBeUndefined()
    expect(tail.truncated).toBe(false)
  })

  test("decodes a canonical contiguous record window without requiring that window to contain prose", () => {
    const encoded = unwrap(PDFTextProfile.encode(pages))
    const empty = unwrap(
      PDFTextProfile.readPageRecords(encoded, {
        startPage: 2,
        maxRecords: 1,
        maxBytes: Number.MAX_SAFE_INTEGER,
      }),
    )
    expect(unwrap(PDFTextProfile.decodePageRecords(empty.bytes, 2)).pages).toEqual([encoded.profile.pages[1]])

    const tail = unwrap(
      PDFTextProfile.readPageRecords(encoded, {
        startPage: 2,
        maxRecords: 2,
        maxBytes: Number.MAX_SAFE_INTEGER,
      }),
    )
    expect(unwrap(PDFTextProfile.decodePageRecords(tail.bytes, 2)).pages.map((page) => page.page)).toEqual([2, 3])
    expect(PDFTextProfile.decodePageRecords(tail.bytes, 1)).toEqual({
      ok: false,
      error: "invalid_record_sequence",
    })
    const reordered = new TextEncoder().encode(
      new TextDecoder().decode(tail.bytes).trimEnd().split("\n").reverse().join("\n") + "\n",
    )
    expect(PDFTextProfile.decodePageRecords(reordered, 2)).toEqual({
      ok: false,
      error: "invalid_record_sequence",
    })
    expect(PDFTextProfile.decodePageRecords(tail.bytes.subarray(0, tail.bytes.byteLength - 1), 2)).toEqual({
      ok: false,
      error: "invalid_format",
    })
  })
})

function unwrap<T>(result: PDFTextProfile.Result<T>) {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
