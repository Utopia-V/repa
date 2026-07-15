import { describe, expect, test } from "bun:test"
import {
  resolveCredentialEntries,
  resolveCredentialProvider,
  resolveProviderEnvironment,
} from "@/cli/cmd/providers"

const credential = (key: string) => ({ type: "api" as const, key })

describe("provider credential projection", () => {
  test("keeps an unconfigured legacy credential literal and does not recover an inherited commercial name", () => {
    const entries = resolveCredentialEntries(
      [
        ["opencode", credential("legacy")],
        ["ordinary-control", credential("control")],
      ],
      {
        "ordinary-control": { name: "Configured Control", env: ["CONTROL_API_KEY"] },
      },
    )

    expect(entries).toEqual([
      { id: "opencode", name: "opencode", type: "api" },
      { id: "ordinary-control", name: "Configured Control", type: "api" },
    ])
    expect(resolveCredentialProvider(entries, "opencode")).toBe("opencode")
    expect(resolveCredentialProvider(entries, "OpenCode Zen")).toBeUndefined()
  })

  test("uses ordinary custom labels and name matching for explicitly projected providers", () => {
    const entries = resolveCredentialEntries(
      [
        ["opencode", credential("custom")],
        ["opencode-local", credential("local")],
        ["ordinary-control", credential("control")],
      ],
      {
        opencode: { name: "Configured OpenCode ID", env: ["CUSTOM_OPENCODE_KEY"] },
        "opencode-local": { name: "Configured Prefix ID", env: ["LOCAL_API_KEY"] },
        "ordinary-control": { name: "Configured Control", env: ["CONTROL_API_KEY"] },
      },
    )

    expect(entries.map((entry) => entry.name)).toEqual([
      "Configured OpenCode ID",
      "Configured Prefix ID",
      "Configured Control",
    ])
    expect(resolveCredentialProvider(entries, "Configured OpenCode ID")).toBe("opencode")
    expect(resolveCredentialProvider(entries, "configured prefix id")).toBe("opencode-local")
    expect(resolveCredentialProvider(entries, "Configured Control")).toBe("ordinary-control")
  })

  test("discovers environment credentials only through the truthful provider projection", () => {
    const result = resolveProviderEnvironment(
      {
        "opencode-local": { name: "Configured Prefix ID", env: ["LOCAL_API_KEY"] },
        "ordinary-control": { name: "Configured Control", env: ["CONTROL_API_KEY"] },
      },
      {
        OPENCODE_API_KEY: "raw-commercial-secret",
        LOCAL_API_KEY: "local-secret",
        CONTROL_API_KEY: "control-secret",
      },
    )

    expect(result).toEqual([
      { provider: "Configured Prefix ID", envVar: "LOCAL_API_KEY" },
      { provider: "Configured Control", envVar: "CONTROL_API_KEY" },
    ])
    expect(result.some((item) => item.envVar === "OPENCODE_API_KEY")).toBe(false)
  })
})
