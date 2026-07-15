import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

const credential = (key: string) => ({ type: "api" as const, key })

function provider(name: string, env: string) {
  return {
    name,
    npm: "@ai-sdk/openai-compatible",
    api: "https://configured.example/v1",
    env: [env],
    models: {
      "local-model": {
        name: "Local Model",
        tool_call: true,
        limit: { context: 4000, output: 1000 },
      },
    },
  }
}

const legacyEnv = {
  REPA_CONFIG_CONTENT: JSON.stringify({
    provider: {
      "ordinary-control": provider("Configured Control", "CONTROL_API_KEY"),
    },
  }),
  REPA_AUTH_CONTENT: JSON.stringify({ opencode: credential("legacy") }),
  OPENCODE_API_KEY: "raw-commercial-secret",
}

const configuredEnv = {
  REPA_CONFIG_CONTENT: JSON.stringify({
    provider: {
      opencode: provider("Configured OpenCode ID", "CUSTOM_OPENCODE_KEY"),
      "opencode-local": provider("Configured Prefix ID", "LOCAL_API_KEY"),
      "ordinary-control": provider("Configured Control", "CONTROL_API_KEY"),
    },
  }),
  REPA_AUTH_CONTENT: JSON.stringify({
    opencode: credential("custom"),
    "opencode-local": credential("local"),
    "ordinary-control": credential("control"),
  }),
  OPENCODE_API_KEY: "raw-commercial-secret",
}

describe("provider credential commands", () => {
  cliIt.live(
    "lists a no-config legacy credential by literal id without raw commercial metadata",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["providers", "list"], { env: legacyEnv })

        opencode.expectExit(result, 0, "providers list legacy")
        expect(result.stdout).toContain("opencode")
        expect(result.stdout).not.toContain("OpenCode Zen")
        expect(result.stdout).not.toContain("OPENCODE_API_KEY")
      }),
    60_000,
  )

  cliIt.live(
    "lists explicitly configured opencode ids with ordinary custom labels",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["providers", "list"], { env: configuredEnv })

        opencode.expectExit(result, 0, "providers list configured")
        expect(result.stdout).toContain("Configured OpenCode ID")
        expect(result.stdout).toContain("Configured Prefix ID")
        expect(result.stdout).toContain("Configured Control")
        expect(result.stdout).not.toContain("OPENCODE_API_KEY")
      }),
    60_000,
  )

  cliIt.live(
    "logs out a legacy credential only by its literal stored id",
    ({ opencode }) =>
      Effect.gen(function* () {
        const inheritedName = yield* opencode.spawn(["providers", "logout", "OpenCode Zen"], { env: legacyEnv })
        expect(inheritedName.exitCode).not.toBe(0)
        expect(inheritedName.stderr).toContain('Unknown configured provider "OpenCode Zen"')

        const literal = yield* opencode.spawn(["providers", "logout", "opencode"], { env: legacyEnv })
        opencode.expectExit(literal, 0, "providers logout legacy id")
      }),
    60_000,
  )

  cliIt.live(
    "logs out explicitly configured providers by their custom names",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["providers", "logout", "Configured Prefix ID"], {
          env: configuredEnv,
        })

        opencode.expectExit(result, 0, "providers logout configured name")
      }),
    60_000,
  )
})
