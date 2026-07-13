import { describe, expect, test } from "bun:test"
import {
  modelContextProjection,
  observeWindow,
  originRevisionStatus,
  resolveLivePath,
  resolveObservedItem,
  type ObservedWindow,
} from "./source-reference"

const URI = "course://operating-systems/memory-spec"
const VERSION_ONE = [
  "Zephyr production parameters",
  "activation code: LANTERN-17",
  "settling interval: 43 ms",
  "end section",
].join("\n")
const VERSION_TWO = [
  "Zephyr production parameters",
  "activation code: LANTERN-23",
  "settling interval: 47 ms",
  "end section",
].join("\n")

describe("source-reference anchor", () => {
  test("a path-only citation silently changes meaning after source mutation", () => {
    const reference = { kind: "live-path" as const, uri: URI, startLine: 2, endLine: 3 }

    expect(resolveLivePath(reference, VERSION_ONE).text).toContain("LANTERN-17")
    expect(resolveLivePath(reference, VERSION_TWO).text).toContain("LANTERN-23")
    expect(resolveLivePath(reference, VERSION_TWO).text).not.toContain("LANTERN-17")
  })

  test("an observed-item citation survives JSON persistence and reports origin drift", () => {
    const item = observeWindow({
      itemId: "tool-result:zephyr-v1",
      uri: URI,
      content: VERSION_ONE,
      startLine: 2,
      endLine: 3,
    })
    const roundTripped = JSON.parse(JSON.stringify(item)) as ObservedWindow
    const items = new Map([[roundTripped.itemId, roundTripped]])
    const resolved = resolveObservedItem({ kind: "observed-item", itemId: roundTripped.itemId }, items)

    expect(resolved.text).toContain("LANTERN-17")
    expect(resolved.text).toContain("43 ms")
    expect(resolved.reference).toBe("session-item:tool-result:zephyr-v1#origin-L2-L3")
    expect(originRevisionStatus(roundTripped, VERSION_ONE)).toBe("current")
    expect(originRevisionStatus(roundTripped, VERSION_TWO)).toBe("stale")
  })

  test("active-context compaction does not change the durable observed item", () => {
    const item = observeWindow({
      itemId: "tool-result:compacted",
      uri: URI,
      content: VERSION_ONE,
      startLine: 2,
      endLine: 3,
    })
    const items = new Map([[item.itemId, item]])

    expect(modelContextProjection(item, true)).not.toContain("LANTERN-17")
    expect(resolveObservedItem({ kind: "observed-item", itemId: item.itemId }, items).text).toContain(
      "LANTERN-17",
    )
  })

  test("a missing observed item fails closed instead of falling back to the live path", () => {
    expect(() =>
      resolveObservedItem(
        { kind: "observed-item", itemId: "tool-result:missing" },
        new Map<string, ObservedWindow>(),
      ),
    ).toThrow("MissingObservedItem")
  })
})

