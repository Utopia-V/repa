export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ConfigProjectLayer } from "./project-layer"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  void directory
  void worktree
  return unique([
    Global.Path.config,
    ...(yield* afs.up({
      targets: [".repa"],
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.REPA_CONFIG_DIR ? [Flag.REPA_CONFIG_DIR] : []),
  ])
})

export const projectDirectories = Effect.fn("ConfigPaths.projectDirectories")(function* (
  directory: string,
  worktree?: string,
) {
  if (Flag.REPA_DISABLE_PROJECT_CONFIG) return []
  const afs = yield* FSUtil.Service
  return yield* afs.up({
    targets: [".repa"],
    start: directory,
    stop: worktree,
  })
})

export const projectDiscoveryOwners = Effect.fn("ConfigPaths.projectDiscoveryOwners")(function* (
  directory: string,
  worktree?: string,
) {
  if (Flag.REPA_DISABLE_PROJECT_CONFIG) return []
  const afs = yield* FSUtil.Service
  const found = yield* afs.up({
    targets: [".repa", ".agents", ".claude", "AGENTS.md", "CLAUDE.md", "CONTEXT.md", "package.json"],
    start: directory,
    stop: worktree,
  })
  return found.flatMap((source) => {
    const name = path.basename(source)
    if (name === ".repa") {
      return [
        "repa_directory_bootstrap",
        "repa_package_metadata",
        "command_markdown",
        "agent_markdown",
        "skill_markdown",
        "tool_module",
        "plugin_module",
        "tui_theme",
        "tui_migration",
      ].map((owner) => ({ source, owner: owner as ConfigProjectLayer.DiscoveryOwner }))
    }
    if (name === ".agents") return [{ source, owner: "agents_external_skill" as const }]
    if (name === ".claude") return [{ source, owner: "claude_external_skill" as const }]
    if (["AGENTS.md", "CLAUDE.md", "CONTEXT.md"].includes(name)) {
      return [{ source, owner: "ambient_instruction" as const }]
    }
    return [{ source, owner: "repa_package_metadata" as const }]
  })
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
