import { describe, expect, test } from "bun:test"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { PDFWorkerFrame } from "@opencode-ai/core/representation/pdf-worker-frame"

describe("PDF worker frame v1", () => {
  test("round-trips one bounded success frame with canonical diagnostics and attestation", () => {
    const input = new TextEncoder().encode("%PDF-fixture")
    const payload = profile()
    const frame = unwrap(
      PDFWorkerFrame.encodeSuccess(
        PDFWorkerFrame.attest(input),
        [
          { code: "parser_warning", count: 2 },
          { code: "unsupported_text_item", count: 1 },
          { code: "parser_warning", count: 3 },
        ],
        payload,
      ),
    )
    const decoded = unwrap(PDFWorkerFrame.decode(frame))
    expect(decoded.status).toBe("success")
    expect(decoded.input).toEqual(PDFWorkerFrame.attest(input))
    expect(decoded.diagnostics).toEqual([
      { code: "parser_warning", count: 5 },
      { code: "unsupported_text_item", count: 1 },
    ])
    if (decoded.status === "success") expect(decoded.payload).toEqual(payload)
  })

  test("round-trips typed failures without a payload", () => {
    const input = PDFWorkerFrame.attest(new Uint8Array())
    const frame = unwrap(PDFWorkerFrame.encodeError(input, [], "invalid_pdf"))
    expect(unwrap(PDFWorkerFrame.decode(frame))).toEqual({
      status: "error",
      input,
      diagnostics: [],
      error: "invalid_pdf",
    })
  })

  test("bounds the total diagnostic event count across closed codes", () => {
    expect(
      PDFWorkerFrame.encodeSuccess(
        PDFWorkerFrame.attest(new Uint8Array()),
        [
          { code: "parser_warning", count: 2 },
          { code: "parser_info", count: 1 },
        ],
        profile(),
        { ...PDFWorkerFrame.defaultLimits, maxDiagnosticCount: 2 },
      ),
    ).toEqual({ ok: false, error: "invalid_diagnostics" })
  })

  test("rejects payload mutation, trailing bytes, and noncanonical headers", () => {
    const frame = unwrap(PDFWorkerFrame.encodeSuccess(PDFWorkerFrame.attest(new Uint8Array([1])), [], profile()))
    const mutated = frame.slice()
    mutated[mutated.length - 2] ^= 1
    expect(PDFWorkerFrame.decode(mutated)).toEqual({ ok: false, error: "payload_digest_mismatch" })

    const trailing = new Uint8Array(frame.byteLength + 1)
    trailing.set(frame)
    expect(PDFWorkerFrame.decode(trailing)).toEqual({ ok: false, error: "invalid_frame" })

    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
    const headerLength = view.getUint32(8, false)
    const payloadLength = view.getUint32(12, false)
    const text = new TextDecoder().decode(frame.subarray(16, 16 + headerLength)).replace('"status":', '"status" :')
    const header = new TextEncoder().encode(text)
    const noncanonical = new Uint8Array(16 + header.byteLength + payloadLength)
    noncanonical.set(frame.subarray(0, 8))
    const next = new DataView(noncanonical.buffer)
    next.setUint32(8, header.byteLength, false)
    next.setUint32(12, payloadLength, false)
    noncanonical.set(header, 16)
    noncanonical.set(frame.subarray(16 + headerLength), 16 + header.byteLength)
    expect(PDFWorkerFrame.decode(noncanonical)).toEqual({ ok: false, error: "noncanonical_header" })
  })

  test("rejects forged diagnostics and total frame or payload overflow", () => {
    const frame = unwrap(
      PDFWorkerFrame.encodeSuccess(
        PDFWorkerFrame.attest(new Uint8Array([1])),
        [{ code: "parser_warning", count: 1 }],
        profile(),
      ),
    )
    expect(
      PDFWorkerFrame.decode(rewriteHeader(frame, (value) => value.replace("parser_warning", "forged_warning"))),
    ).toEqual({
      ok: false,
      error: "invalid_diagnostics",
    })
    expect(
      PDFWorkerFrame.decode(rewriteHeader(frame, (value) => value.replace('"count":1}', '"count":1,"raw":"secret"}'))),
    ).toEqual({ ok: false, error: "invalid_diagnostics" })
    expect(
      PDFWorkerFrame.decode(frame, { ...PDFWorkerFrame.defaultLimits, maxFrameBytes: frame.byteLength - 1 }),
    ).toEqual({ ok: false, error: "frame_limit_exceeded" })
    expect(
      PDFWorkerFrame.decode(frame, {
        ...PDFWorkerFrame.defaultLimits,
        maxPayloadBytes: profile().byteLength - 1,
      }),
    ).toEqual({ ok: false, error: "payload_limit_exceeded" })
  })
})

function rewriteHeader(frame: Uint8Array, transform: (header: string) => string) {
  const source = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const headerLength = source.getUint32(8, false)
  const payloadLength = source.getUint32(12, false)
  const header = new TextEncoder().encode(transform(new TextDecoder().decode(frame.subarray(16, 16 + headerLength))))
  const rewritten = new Uint8Array(16 + header.byteLength + payloadLength)
  rewritten.set(frame.subarray(0, 8))
  const target = new DataView(rewritten.buffer)
  target.setUint32(8, header.byteLength, false)
  target.setUint32(12, payloadLength, false)
  rewritten.set(header, 16)
  rewritten.set(frame.subarray(16 + headerLength), 16 + header.byteLength)
  return rewritten
}

function profile() {
  return unwrap(
    PDFTextProfile.encode([
      {
        page: 1,
        items: [{ text: "lesson", lineBreakAfter: false }],
        signals: { operatorCount: 1, imagePaintOperations: 0 },
      },
    ]),
  ).bytes
}

function unwrap<T>(result: PDFWorkerFrame.Result<T> | PDFTextProfile.Result<T>) {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
