export * as ConfigProjectLayer from "./project-layer"

import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { TuiConfig } from "@opencode-ai/tui/config"
import { Permission } from "@/permission"
import { isRecord } from "@/util/record"

export const MainDisposition = {
  $schema: "quarantine",
  shell: "quarantine",
  logLevel: "quarantine",
  server: "quarantine",
  command: "quarantine",
  skills: "quarantine",
  references: "quarantine",
  reference: "quarantine",
  watcher: "quarantine",
  snapshot: "quarantine",
  plugin: "quarantine",
  disabled_providers: "quarantine",
  enabled_providers: "quarantine",
  model: "quarantine",
  small_model: "quarantine",
  default_agent: "quarantine",
  username: "quarantine",
  mode: "quarantine",
  agent: "quarantine",
  provider: "quarantine",
  representation: "quarantine",
  mcp: "quarantine",
  formatter: "quarantine",
  lsp: "quarantine",
  instructions: "quarantine",
  layout: "quarantine",
  permission: "deny",
  tools: "deny",
  attachment: "quarantine",
  tool_output: "quarantine",
  compaction: "quarantine",
  experimental: "quarantine",
} as const satisfies Record<keyof ConfigV1.Info, "deny" | "quarantine">

export const TuiDisposition = {
  $schema: "quarantine",
  theme: "quarantine",
  keybinds: "quarantine",
  plugin: "quarantine",
  plugin_enabled: "quarantine",
  leader_timeout: "quarantine",
  attention: "quarantine",
  prompt: "quarantine",
  scroll_speed: "quarantine",
  scroll_acceleration: "quarantine",
  diff_style: "quarantine",
  mouse: "quarantine",
} as const satisfies Record<keyof TuiConfig.Info, "quarantine">

export const NonSchemaDisposition = {
  repa_directory_bootstrap: "quarantine",
  repa_package_metadata: "quarantine",
  command_markdown: "quarantine",
  agent_markdown: "quarantine",
  skill_markdown: "quarantine",
  tool_module: "quarantine",
  plugin_module: "quarantine",
  tui_theme: "quarantine",
  agents_external_skill: "quarantine",
  claude_external_skill: "quarantine",
  ambient_instruction: "quarantine",
  tui_migration: "quarantine",
} as const

export type DiscoveryOwner = keyof typeof NonSchemaDisposition

export const NestedEffectContainers = [
  "server",
  "command",
  "skills",
  "references",
  "reference",
  "watcher",
  "plugin",
  "mode",
  "agent",
  "provider",
  "representation",
  "mcp",
  "formatter",
  "lsp",
  "attachment",
  "tool_output",
  "compaction",
  "experimental",
  "attention",
  "prompt",
  "scroll_acceleration",
] as const

export type Diagnostic = {
  origin: "project"
  channel: "directory" | "discovery" | "main" | "tui"
  source: string
  path: string
  disposition: "applied_deny" | "quarantined"
  reason:
    | "directory_discovery"
    | "invalid_container"
    | "non_deny_value"
    | "project_discovery"
    | "project_value"
    | "unsafe_source"
    | "substitution_token"
    | "unknown_field"
  machineValueActive?: boolean
  denyApplied?: boolean
}

export type Compiled = {
  permissionDenies: PermissionV1.Rule[]
  diagnostics: Diagnostic[]
}

export function containsSubstitution(text: string) {
  return /\{(?:env|file):/i.test(text)
}

export function substitutionRejected(source: string, channel: "main" | "tui" = "main"): Compiled {
  return {
    permissionDenies: [],
    diagnostics: [diagnostic(channel, source, "$", "substitution_token")],
  }
}

export function compileMain(input: unknown, source: string): Compiled {
  if (!isRecord(input)) {
    return {
      permissionDenies: [],
      diagnostics: [diagnostic("main", source, "$", "invalid_container")],
    }
  }

  const permissionDenies: PermissionV1.Rule[] = []
  const diagnostics: Diagnostic[] = []
  for (const [key, value] of Object.entries(input)) {
    if (!(key in MainDisposition)) {
      diagnostics.push(diagnostic("main", source, key, "unknown_field"))
      continue
    }
    if (key === "permission") {
      compilePermission(value, source, permissionDenies, diagnostics)
      continue
    }
    if (key === "tools") {
      compileTools(value, source, permissionDenies, diagnostics)
      continue
    }
    diagnostics.push(diagnostic("main", source, key, "project_value"))
  }
  return { permissionDenies, diagnostics }
}

export function compileTui(input: unknown, source: string): Compiled {
  if (!isRecord(input)) {
    return {
      permissionDenies: [],
      diagnostics: [diagnostic("tui", source, "$", "invalid_container")],
    }
  }
  return {
    permissionDenies: [],
    diagnostics: Object.keys(input).map((key) =>
      diagnostic("tui", source, key, key in TuiDisposition ? "project_value" : "unknown_field"),
    ),
  }
}

export function quarantinedDirectory(source: string): Diagnostic {
  return diagnostic("directory", source, "$", "directory_discovery")
}

export function quarantinedDiscovery(source: string, owner: DiscoveryOwner): Diagnostic {
  return diagnostic("discovery", source, owner, "project_discovery")
}

export function sourceRejected(channel: "main" | "tui", source: string): Compiled {
  return {
    permissionDenies: [],
    diagnostics: [diagnostic(channel, source, "$", "unsafe_source")],
  }
}

export function withEffectiveState(
  diagnostics: Diagnostic[],
  main: Record<string, unknown>,
  tui?: Record<string, unknown>,
) {
  return diagnostics.map((item) => {
    const key = item.path.split(".")[0]!
    const source = item.channel === "tui" ? tui : item.channel === "main" ? main : undefined
    return {
      ...item,
      machineValueActive: source ? source[key] !== undefined : false,
      denyApplied: item.disposition === "applied_deny",
    }
  })
}

function compilePermission(
  input: unknown,
  source: string,
  rules: PermissionV1.Rule[],
  diagnostics: Diagnostic[],
) {
  if (typeof input === "string") {
    if (input === "deny") {
      rules.push(Permission.projectDeny({ permission: "*", pattern: "*" }))
      diagnostics.push(applied(source, "permission"))
      return
    }
    diagnostics.push(diagnostic("main", source, "permission", "non_deny_value"))
    return
  }
  if (!isRecord(input)) {
    diagnostics.push(diagnostic("main", source, "permission", "invalid_container"))
    return
  }

  for (const [permission, value] of Object.entries(input)) {
    const base = `permission.${permission}`
    if (typeof value === "string") {
      if (value === "deny") {
        rules.push(Permission.projectDeny({ permission, pattern: "*" }))
        diagnostics.push(applied(source, base))
        continue
      }
      diagnostics.push(diagnostic("main", source, base, "non_deny_value"))
      continue
    }
    if (!isRecord(value)) {
      diagnostics.push(diagnostic("main", source, base, "invalid_container"))
      continue
    }
    for (const [pattern, action] of Object.entries(value)) {
      const key = `${base}.${pattern}`
      if (action === "deny") {
        rules.push(Permission.projectDeny({ permission, pattern }))
        diagnostics.push(applied(source, key))
        continue
      }
      diagnostics.push(diagnostic("main", source, key, "non_deny_value"))
    }
  }
}

function compileTools(
  input: unknown,
  source: string,
  rules: PermissionV1.Rule[],
  diagnostics: Diagnostic[],
) {
  if (!isRecord(input)) {
    diagnostics.push(diagnostic("main", source, "tools", "invalid_container"))
    return
  }
  for (const [tool, enabled] of Object.entries(input)) {
    const key = `tools.${tool}`
    if (enabled === false) {
      rules.push(
        Permission.projectDeny({
          permission: ["edit", "patch", "write"].includes(tool) ? "edit" : tool,
          pattern: "*",
        }),
      )
      diagnostics.push(applied(source, key))
      continue
    }
    diagnostics.push(diagnostic("main", source, key, "non_deny_value"))
  }
}

function applied(source: string, path: string): Diagnostic {
  return {
    origin: "project",
    channel: "main",
    source,
    path,
    disposition: "applied_deny",
    reason: "project_value",
  }
}

function diagnostic(
  channel: Diagnostic["channel"],
  source: string,
  path: string,
  reason: Diagnostic["reason"],
): Diagnostic {
  return {
    origin: "project",
    channel,
    source,
    path,
    disposition: "quarantined",
    reason,
  }
}
