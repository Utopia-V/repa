import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"

const decodePermission = Schema.decodeUnknownSync(ConfigPermissionV1.Info)
const decodeAgent = Schema.decodeUnknownSync(ConfigAgentV1.Info)
const decodeConfig = Schema.decodeUnknownSync(ConfigV1.Info)

describe("ordered v1 permission object keys", () => {
  test("classifies the exact ECMAScript array-index property-key boundary", () => {
    for (const key of ["0", "1", "10", "4294967294"]) {
      expect(ConfigPermissionV1.isArrayIndexPropertyKey(key)).toBeTrue()
    }

    for (const key of [
      "",
      "00",
      "01",
      "-0",
      "+0",
      "1.0",
      "1e0",
      " 1",
      "1\n",
      "4294967295",
      "4294967296",
      "0_0",
    ]) {
      expect(ConfigPermissionV1.isArrayIndexPropertyKey(key)).toBeFalse()
    }
  })

  test("rejects array-index capability and resource keys", () => {
    for (const key of ["0", "1", "4294967294"]) {
      expect(() => decodePermission({ [key]: "allow" }, { propertyOrder: "original" })).toThrow(
        "ECMAScript array-index property keys",
      )
      expect(() => decodePermission({ task: { [key]: "allow" } }, { propertyOrder: "original" })).toThrow(
        "ECMAScript array-index property keys",
      )
    }
  })

  test("accepts decimal-looking keys that ECMAScript does not enumerate as array indices", () => {
    const keys = ["00", "01", "-0", "1.0", "4294967295"]
    const permission = decodePermission(
      {
        ...Object.fromEntries(keys.map((key) => [key, "allow"])),
        task: Object.fromEntries(keys.map((key) => [key, "allow"])),
      },
      { propertyOrder: "original" },
    )

    expect(Object.keys(permission).slice(0, -1)).toEqual(keys)
    expect(Object.keys(permission.task as ConfigPermissionV1.Object)).toEqual(keys)
    expect(
      Object.keys(
        decodeConfig({ tools: Object.fromEntries(keys.map((key) => [key, true])) }, { propertyOrder: "original" })
          .tools ?? {},
      ),
    ).toEqual(keys)
    expect(
      Object.keys(
        decodeAgent({ tools: Object.fromEntries(keys.map((key) => [key, true])) }, { propertyOrder: "original" })
          .tools ?? {},
      ),
    ).toEqual(keys)
  })

  test("legacy root and Agent tools cannot bypass the ordered-key boundary", () => {
    expect(() => decodeConfig({ tools: { "0": true } }, { propertyOrder: "original" })).toThrow(
      "ECMAScript array-index property keys",
    )
    expect(() => decodeAgent({ tools: { "4294967294": true } }, { propertyOrder: "original" })).toThrow(
      "ECMAScript array-index property keys",
    )
    expect(() =>
      decodeConfig({ agent: { helper: { tools: { "1": false } } } }, { propertyOrder: "original" }),
    ).toThrow("ECMAScript array-index property keys")
  })
})
