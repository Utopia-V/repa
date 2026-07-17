import { describe, expect, test } from "bun:test"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { TuiConfig } from "@opencode-ai/tui/config"
import { ConfigProjectLayer } from "@/config/project-layer"
import { Permission } from "@/permission"

describe("project config authority compiler", () => {
  test("classifies every current main and TUI top-level field", () => {
    expect(Object.keys(ConfigProjectLayer.MainDisposition).sort()).toEqual(Object.keys(ConfigV1.Info.fields).sort())
    expect(Object.keys(ConfigProjectLayer.TuiDisposition).sort()).toEqual(Object.keys(TuiConfig.Info.fields).sort())
    expect(Object.keys(ConfigProjectLayer.MainDisposition)).toHaveLength(31)
    expect(Object.keys(ConfigProjectLayer.TuiDisposition)).toHaveLength(12)
    expect(Object.keys(ConfigProjectLayer.NonSchemaDisposition)).toEqual([
      "repa_directory_bootstrap",
      "repa_package_metadata",
      "command_markdown",
      "agent_markdown",
      "skill_markdown",
      "tool_module",
      "plugin_module",
      "tui_theme",
      "agents_external_skill",
      "claude_external_skill",
      "ambient_instruction",
      "tui_migration",
    ])
    expect(Object.values(ConfigProjectLayer.NonSchemaDisposition).every((value) => value === "quarantine")).toBe(
      true,
    )
  })

  test("quarantines every nested effect container as a whole, including unknown descendants", () => {
    const main = Object.fromEntries(
      ConfigProjectLayer.NestedEffectContainers.filter((key) => key in ConfigProjectLayer.MainDisposition).map(
        (key) => [key, { unknown_nested_effect: { command: "canary" } }],
      ),
    )
    const tui = Object.fromEntries(
      ConfigProjectLayer.NestedEffectContainers.filter((key) => key in ConfigProjectLayer.TuiDisposition).map(
        (key) => [key, { unknown_nested_effect: { command: "canary" } }],
      ),
    )

    const compiledMain = ConfigProjectLayer.compileMain(main, "project/repa.json")
    const compiledTui = ConfigProjectLayer.compileTui(tui, "project/tui.json")

    expect(compiledMain.permissionDenies).toEqual([])
    expect(compiledTui.permissionDenies).toEqual([])
    expect(compiledMain.diagnostics.map((item) => item.path)).toEqual(Object.keys(main))
    expect(compiledTui.diagnostics.map((item) => item.path)).toEqual(Object.keys(tui))
    expect([...compiledMain.diagnostics, ...compiledTui.diagnostics].every((item) => item.disposition === "quarantined")).toBe(
      true,
    )
  })

  test("extracts only literal top-level permission denies and legacy tools false", () => {
    const result = ConfigProjectLayer.compileMain(
      {
        permission: {
          read: {
            "*.env": "deny",
            "*.md": "allow",
          },
          bash: "ask",
          edit: "deny",
        },
        tools: {
          write: false,
          grep: true,
          task: false,
        },
        agent: { repa: { disable: true } },
        disabled_providers: ["machine-provider"],
        snapshot: false,
        unknown: { executable: "canary" },
      },
      "C:\\course\\repa.json",
    )

    expect(result.permissionDenies).toMatchObject([
      { permission: "read", pattern: "*.env", action: "deny" },
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "task", pattern: "*", action: "deny" },
    ])
    expect(result.diagnostics.filter((item) => item.disposition === "applied_deny").map((item) => item.path)).toEqual([
      "permission.read.*.env",
      "permission.edit",
      "tools.write",
      "tools.task",
    ])
    expect(result.diagnostics.filter((item) => item.disposition === "quarantined").map((item) => item.path)).toEqual([
      "permission.read.*.md",
      "permission.bash",
      "tools.grep",
      "agent",
      "disabled_providers",
      "snapshot",
      "unknown",
    ])
  })

  test("project denies remain last across machine, session, and process-local approvals", () => {
    const project = ConfigProjectLayer.compileMain(
      { permission: { read: "deny", task: { general: "deny" } } },
      "project/repa.json",
    ).permissionDenies
    const machine = [{ permission: "*", pattern: "*", action: "allow" as const }]
    const session = [{ permission: "read", pattern: "*", action: "allow" as const }]
    const approved = [{ permission: "task", pattern: "general", action: "allow" as const }]

    expect(Permission.evaluate("read", "notes.md", machine, project, session).action).toBe("deny")
    expect(Permission.evaluate("task", "general", machine, project, approved).action).toBe("deny")
    expect(Permission.merge(project, session).at(-1)).toMatchObject({
      permission: "task",
      pattern: "general",
      action: "deny",
    })
  })

  test("rejects substitution before parsing and makes every project TUI field inert", () => {
    expect(ConfigProjectLayer.containsSubstitution('{ "provider": { "key": "{env:SECRET}" } }')).toBe(true)
    expect(ConfigProjectLayer.substitutionRejected("project/repa.json")).toEqual({
      permissionDenies: [],
      diagnostics: [
        {
          origin: "project",
          channel: "main",
          source: "project/repa.json",
          path: "$",
          disposition: "quarantined",
          reason: "substitution_token",
        },
      ],
    })

    const tui = Object.fromEntries(Object.keys(TuiConfig.Info.fields).map((key) => [key, "canary"]))
    const result = ConfigProjectLayer.compileTui(tui, "project/tui.json")
    expect(result.permissionDenies).toEqual([])
    expect(result.diagnostics).toHaveLength(12)
    expect(result.diagnostics.every((item) => item.disposition === "quarantined")).toBe(true)
  })

  test("reports independent machine values and applied denies without exposing quarantined values", () => {
    const diagnostics = ConfigProjectLayer.withEffectiveState(
      [
        ...ConfigProjectLayer.compileMain(
          { model: "project/model", permission: { read: "deny" } },
          "project/repa.json",
        ).diagnostics,
        ...ConfigProjectLayer.compileTui({ mouse: true }, "project/tui.json").diagnostics,
        ConfigProjectLayer.quarantinedDiscovery("project/.repa", "plugin_module"),
      ],
      { model: "machine/model" },
      { mouse: false },
    )

    expect(diagnostics).toMatchObject([
      { path: "model", machineValueActive: true, denyApplied: false },
      { path: "permission.read", machineValueActive: false, denyApplied: true },
      { path: "mouse", machineValueActive: true, denyApplied: false },
      { path: "plugin_module", machineValueActive: false, denyApplied: false },
    ])
  })
})
