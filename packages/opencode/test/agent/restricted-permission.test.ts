import { expect, test } from "bun:test"
import matter from "gray-matter"
import { RestrictedAgentPermission } from "@/agent/restricted-permission"
import { Permission } from "@/permission"

test("restricted Agent permissions deny omitted and future capabilities", () => {
  const config = RestrictedAgentPermission.compile(["read", "edit", "content_mutation"], ["read", "read"])
  const ruleset = Permission.fromConfig(config)

  expect(config).toEqual({ "*": "deny", read: "allow" })
  expect(Permission.evaluate("read", "*", ruleset).action).toBe("allow")
  expect(Permission.evaluate("edit", "*", ruleset).action).toBe("deny")
  expect(Permission.evaluate("content_mutation", "*", ruleset).action).toBe("deny")
  expect(Permission.evaluate("READ", "*", ruleset).action).toBe("deny")
  expect(Permission.evaluate("future_capability", "*", ruleset).action).toBe("deny")
})

test("all current permissions remain explicit and do not allow future capabilities", () => {
  const config = RestrictedAgentPermission.compile(["read", "edit"], ["read", "edit"])
  const ruleset = Permission.fromConfig(config)

  expect(config).toEqual({ "*": "deny", edit: "allow", read: "allow" })
  expect(Permission.evaluate("read", "*", ruleset).action).toBe("allow")
  expect(Permission.evaluate("edit", "*", ruleset).action).toBe("allow")
  expect(Permission.evaluate("future_capability", "*", ruleset).action).toBe("deny")
})

test("an empty selection denies all and unknown permissions are rejected", () => {
  expect(RestrictedAgentPermission.parse("")).toEqual([])
  expect(RestrictedAgentPermission.compile(["read"], [])).toEqual({ "*": "deny" })
  expect(() => RestrictedAgentPermission.compile(["read"], ["unknown"])).toThrow(
    "Unknown permissions: unknown. Available: read",
  )
})

test("wildcard and array-index capability names cannot become exact allow rules", () => {
  const catalog = ["read", "danger*", "review?", "0", "4294967294"]

  expect(RestrictedAgentPermission.selectable(catalog)).toEqual(["read"])
  expect(() => RestrictedAgentPermission.compile(catalog, ["danger*"])).toThrow("Unrepresentable permissions: danger*")
  expect(() => RestrictedAgentPermission.compile(catalog, ["review?"])).toThrow("Unrepresentable permissions: review?")
  expect(() => RestrictedAgentPermission.compile(catalog, ["0"])).toThrow("Unrepresentable permissions: 0")
  expect(() => RestrictedAgentPermission.compile(catalog, ["4294967294"])).toThrow(
    "Unrepresentable permissions: 4294967294",
  )

  const ruleset = Permission.fromConfig(RestrictedAgentPermission.compile(catalog, ["read"]))
  expect(Permission.evaluate("dangerous", "*", ruleset).action).toBe("deny")
  expect(Permission.evaluate("review1", "*", ruleset).action).toBe("deny")
  expect(Permission.evaluate("0", "*", ruleset).action).toBe("deny")
})

test("non-array-index decimal-looking capability names remain exact allow rules", () => {
  const catalog = ["00", "01", "-0", "1.0", "4294967295"]
  const config = RestrictedAgentPermission.compile(catalog, catalog)
  const ruleset = Permission.fromConfig(config)

  expect(RestrictedAgentPermission.selectable(catalog)).toEqual(["-0", "00", "01", "1.0", "4294967295"])
  for (const permission of catalog) {
    expect(Permission.evaluate(permission, "*", ruleset).action).toBe("allow")
  }
})

test("unknown and unrepresentable selections report different failures", () => {
  expect(() => RestrictedAgentPermission.compile(["danger*"], ["missing"])).toThrow("Unknown permissions: missing")
  expect(() => RestrictedAgentPermission.compile(["danger*"], ["danger*"])).toThrow(
    "Unrepresentable permissions: danger*",
  )
})

test("__proto__ is emitted as an own exact rule without mutating the config prototype", () => {
  const config = RestrictedAgentPermission.compile(["__proto__", "read"], ["__proto__"])
  const ruleset = Permission.fromConfig(config)

  expect(Object.hasOwn(config, "__proto__")).toBe(true)
  expect(Object.getPrototypeOf(config)).toBe(Object.prototype)
  expect(config["__proto__"]).toBe("allow")
  const decoded = matter(matter.stringify("", { permission: config })).data
    .permission as RestrictedAgentPermission.Config
  expect(Object.hasOwn(decoded, "__proto__")).toBe(true)
  expect(decoded["__proto__"]).toBe("allow")
  expect(Permission.evaluate("__proto__", "*", ruleset).action).toBe("allow")
  expect(Permission.evaluate("constructor", "*", ruleset).action).toBe("deny")
  expect(Permission.evaluate("future_capability", "*", ruleset).action).toBe("deny")
})
