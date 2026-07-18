import { describe, expect, test } from "bun:test"
import { ModelRenditionProfile } from "../../src/representation/model-rendition-profile"

describe("model rendition profile", () => {
  test("canonicalizes one document record and round-trips it exactly", () => {
    const encoded = ModelRenditionProfile.encode({
      rendition: "A\r\nreadable rendition e\u0301",
      uncertainty: ["Page geometry is model-asserted."],
      omissions: ["No mechanical page selector."],
    })

    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    expect(new TextDecoder().decode(encoded.value.bytes)).toBe(
      '{"profile":"repa.model-rendition.v1","canonicalizer":"repa.model-rendition-json.v1","rendition":"A\\nreadable rendition é","uncertainty":["Page geometry is model-asserted."],"omissions":["No mechanical page selector."]}\n',
    )
    expect(ModelRenditionProfile.decode(encoded.value.bytes)).toEqual(encoded)
  })

  test("accepts structurally valid refusal-like prose only as a model claim", () => {
    const result = ModelRenditionProfile.encode({
      rendition: "I cannot reproduce the document; here is a short overview.",
      uncertainty: ["This text may be summary-like or refusal-like."],
      omissions: [],
    })

    expect(result.ok).toBe(true)
  })

  test("rejects empty, malformed, noncanonical, and over-budget records", () => {
    expect(ModelRenditionProfile.encode({ rendition: "  ", uncertainty: [], omissions: [] })).toEqual({
      ok: false,
      error: "empty_rendition",
    })
    expect(ModelRenditionProfile.decode(new Uint8Array([0xff]))).toEqual({
      ok: false,
      error: "invalid_encoding",
    })
    expect(
      ModelRenditionProfile.decode(
        new TextEncoder().encode(
          '{"canonicalizer":"repa.model-rendition-json.v1","profile":"repa.model-rendition.v1","rendition":"text","uncertainty":[],"omissions":[]}\n',
        ),
      ),
    ).toEqual({ ok: false, error: "noncanonical" })
    expect(
      ModelRenditionProfile.encode(
        { rendition: "too large", uncertainty: [], omissions: [] },
        { maxProfileBytes: 1024, maxRenditionBytes: 2, maxClaims: 1, maxClaimBytes: 4 },
      ),
    ).toEqual({ ok: false, error: "rendition_limit_exceeded" })
  })

  test("rejects extra fields rather than silently persisting them", () => {
    const bytes = new TextEncoder().encode(
      '{"profile":"repa.model-rendition.v1","canonicalizer":"repa.model-rendition-json.v1","rendition":"text","uncertainty":[],"omissions":[],"rawProviderPayload":"secret"}\n',
    )
    expect(ModelRenditionProfile.decode(bytes)).toEqual({ ok: false, error: "invalid_format" })
  })

  test("rejects truncated or multiple records and total-profile overflow", () => {
    const encoded = ModelRenditionProfile.encode({ rendition: "Readable", uncertainty: [], omissions: [] })
    if (!encoded.ok) throw new Error(encoded.error)
    expect(ModelRenditionProfile.decode(encoded.value.bytes.subarray(0, encoded.value.bytes.byteLength - 1))).toEqual({
      ok: false,
      error: "invalid_format",
    })
    const multiple = new Uint8Array(encoded.value.bytes.byteLength * 2)
    multiple.set(encoded.value.bytes)
    multiple.set(encoded.value.bytes, encoded.value.bytes.byteLength)
    expect(ModelRenditionProfile.decode(multiple)).toEqual({ ok: false, error: "invalid_format" })
    expect(
      ModelRenditionProfile.decode(encoded.value.bytes, {
        ...ModelRenditionProfile.defaultLimits,
        maxProfileBytes: encoded.value.bytes.byteLength - 1,
      }),
    ).toEqual({ ok: false, error: "profile_limit_exceeded" })
  })
})
