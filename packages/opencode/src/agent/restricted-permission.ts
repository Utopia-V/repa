import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"

export type Config = Record<string, "allow" | "deny">

export function parse(input: string) {
  return input
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean)
}

export function isRepresentable(permission: string) {
  return (
    permission.length > 0 &&
    !permission.includes("*") &&
    !permission.includes("?") &&
    !ConfigPermissionV1.isArrayIndexPropertyKey(permission)
  )
}

export function selectable(catalog: readonly string[]) {
  return available(catalog).filter(isRepresentable)
}

export function compile(catalog: readonly string[], selected: readonly string[]): Config {
  const catalogPermissions = available(catalog)
  const chosen = new Set(selected)
  const unknown = [...chosen].filter((permission) => !catalogPermissions.includes(permission)).sort()
  if (unknown.length) {
    throw new Error(`Unknown permissions: ${unknown.join(", ")}. Available: ${catalogPermissions.join(", ")}`)
  }
  const unrepresentable = [...chosen].filter((permission) => !isRepresentable(permission)).sort()
  if (unrepresentable.length) {
    throw new Error(
      `Unrepresentable permissions: ${unrepresentable.join(", ")}. Wildcard tokens and ECMAScript array-index keys cannot be encoded as exact ordered permission rules.`,
    )
  }

  const result: Config = {}
  define(result, "*", "deny")
  for (const permission of catalogPermissions) {
    if (chosen.has(permission)) define(result, permission, "allow")
  }
  return result
}

function available(catalog: readonly string[]) {
  return [...new Set(catalog)].filter((permission) => permission !== "*").sort()
}

function define(config: Config, permission: string, action: Config[string]) {
  Object.defineProperty(config, permission, {
    value: action,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

export * as RestrictedAgentPermission from "./restricted-permission"
