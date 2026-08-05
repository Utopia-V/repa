import { describe, expect, test } from "bun:test"
import { MAX_LAZY_BYTES, MAX_LAZY_ITEMS, utf8Bytes } from "@opencode-ai/core/learning-context"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { Representation } from "@opencode-ai/core/representation"
import { learningContextReadResult } from "@/tool/learning-context-read"
import { classifyMaterialFailure } from "@/tool/learning-material-read"

describe("learningContextReadResult", () => {
  test("accepts the exact UTF-8 byte and typed-item ceilings without generic truncation", () => {
    const value = "界".repeat((MAX_LAZY_BYTES - 2) / 3)
    const result = learningContextReadResult({
      title: "Exact lazy read",
      metadata: { owner: "test" },
      value,
      itemCount: MAX_LAZY_ITEMS,
    })

    expect(utf8Bytes(JSON.stringify(value))).toBe(MAX_LAZY_BYTES)
    expect(result.metadata).toMatchObject({
      status: "available",
      byteCount: MAX_LAZY_BYTES,
      itemCount: MAX_LAZY_ITEMS,
      truncated: false,
    })
    expect(result.metadata).not.toHaveProperty("outputPath")
    expect(result.output).toBe(JSON.stringify(value))
  })

  test("reports a one-byte UTF-8 overflow without returning a partial owner value", () => {
    const value = `${"界".repeat((MAX_LAZY_BYTES - 2) / 3)}a`
    const result = learningContextReadResult({
      title: "Exact lazy read",
      metadata: { owner: "test" },
      value,
      itemCount: MAX_LAZY_ITEMS,
    })

    expect(utf8Bytes(JSON.stringify(value))).toBe(MAX_LAZY_BYTES + 1)
    expect(result.metadata).toMatchObject({
      status: "over_budget",
      reason: "byte_limit",
      observedBytes: MAX_LAZY_BYTES + 1,
      ceilingBytes: MAX_LAZY_BYTES,
      truncated: false,
    })
    expect(result.output).not.toContain(value)
    expect(result.metadata).not.toHaveProperty("outputPath")
  })

  test("rejects a sixty-fifth typed item even when its JSON body is small", () => {
    const result = learningContextReadResult({
      title: "Exact lazy read",
      metadata: { owner: "test" },
      value: { entries: [] },
      itemCount: MAX_LAZY_ITEMS + 1,
    })

    expect(result.metadata).toMatchObject({
      status: "over_budget",
      reason: "item_limit",
      observedItems: MAX_LAZY_ITEMS + 1,
      ceilingItems: MAX_LAZY_ITEMS,
      truncated: false,
    })
  })
})

describe("classifyMaterialFailure", () => {
  const revisionID = Representation.createRevisionID()

  test("preserves typed Gate 13 grant, stale, authorization, and budget outcomes", () => {
    expect(
      classifyMaterialFailure(
        new Representation.CurrentUseDeniedError({
          revisionID,
          effectiveArtifactID: "art_gate18",
          reason: "grant_required",
        }),
      ),
    ).toBe("grant_required")
    expect(
      classifyMaterialFailure(
        new Representation.CurrentUseDeniedError({
          revisionID,
          effectiveArtifactID: "art_gate18",
          reason: "grant_revoked",
        }),
      ),
    ).toBe("stale")
    expect(
      classifyMaterialFailure(
        new Representation.ReturnBudgetExceededError({ revisionID, requiredBytes: 33_000, ceilingBytes: 32_768 }),
      ),
    ).toBe("over_budget")
    expect(
      classifyMaterialFailure(
        new MaterialMap.PreparationError({ code: "source_provenance", detail: "fresh authority required" }),
      ),
    ).toBe("not_authorized")
    expect(
      classifyMaterialFailure(
        new MaterialMap.PreparationError({ code: "witness_mismatch", detail: "selector changed" }),
      ),
    ).toBe("stale")
    expect(
      classifyMaterialFailure(
        new ContentRoot.PathError({ path: "C:\\material.pdf", reason: "budget_exceeded", detail: "too large" }),
      ),
    ).toBe("over_budget")
  })

  test("does not depend on tagged-error stringification", () => {
    expect(
      classifyMaterialFailure(
        new MaterialMap.PreparationError({ code: "source_unavailable", detail: "stored content missing" }),
      ),
    ).toBe("unavailable")
    expect(classifyMaterialFailure(new Error("not_authorized: workspace changed"))).toBe("not_authorized")
  })
})
