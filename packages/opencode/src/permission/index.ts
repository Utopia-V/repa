import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"
import { InstanceState } from "@/effect/instance-state"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import { Deferred, Effect, Layer, Context } from "effect"
import os from "os"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { EventV2Bridge } from "@/event-v2-bridge"

export const Event = PermissionV1.Event

const projectDenyMark: unique symbol = Symbol("project-deny")
type ProjectDenyRule = PermissionV1.Rule & { [projectDenyMark]: true }

export function projectDeny(rule: Omit<PermissionV1.Rule, "action">): PermissionV1.Rule {
  const result = { ...rule, action: "deny" } as ProjectDenyRule
  result[projectDenyMark] = true
  return result
}

export function isProjectDeny(rule: PermissionV1.Rule): rule is ProjectDenyRule {
  return projectDenyMark in rule
}

function orderedRules(...rulesets: PermissionV1.Ruleset[]) {
  const rules = rulesets.flat()
  return [...rules.filter((rule) => !isProjectDeny(rule)), ...rules.filter(isProjectDeny)]
}

export interface Interface {
  readonly ask: (input: AskInput) => Effect.Effect<void, PermissionV1.Error>
  readonly reply: (input: PermissionV1.ReplyInput) => Effect.Effect<void, PermissionV1.NotFoundError>
  readonly list: () => Effect.Effect<ReadonlyArray<PermissionV1.Request>>
}

export type AuthorityLayer = {
  readonly ruleset: PermissionV1.Ruleset
  readonly absence: "ask" | "deny"
}

export type AskInput = PermissionV1.AskInput & {
  readonly requirePrompt?: boolean
  readonly authority?: readonly AuthorityLayer[]
}

interface PendingEntry {
  info: PermissionV1.Request
  deferred: Deferred.Deferred<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>
  requirePrompt: boolean
}

interface State {
  pending: Map<PermissionV1.ID, PendingEntry>
  approved: PermissionV1.Rule[]
}

export function evaluate(permission: string, pattern: string, ...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule {
  return (
    orderedRules(...rulesets).findLast(
      (rule) => Wildcard.matchIdentifier(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
    ) ?? {
      action: "ask",
      permission,
      pattern: "*",
    }
  )
}

export function evaluateAuthority(
  permission: string,
  pattern: string,
  ruleset: PermissionV1.Ruleset,
  authority: readonly AuthorityLayer[],
): PermissionV1.Rule {
  const decisions = [
    evaluate(permission, pattern, ruleset),
    ...authority.map((layer) => evaluateLayer(permission, pattern, layer)),
  ]
  if (decisions.some((rule) => rule.action === "deny")) return { permission, pattern, action: "deny" }
  if (decisions.every((rule) => rule.action === "allow")) return { permission, pattern, action: "allow" }
  return { permission, pattern, action: "ask" }
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Permission") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const state = yield* InstanceState.make<State>(
      Effect.fn("Permission.state")(function* (ctx) {
        void ctx
        const state = {
          pending: new Map<PermissionV1.ID, PendingEntry>(),
          approved: [],
        }

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            for (const item of state.pending.values()) {
              yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
            }
            state.pending.clear()
          }),
        )

        return state
      }),
    )

    const ask = Effect.fn("Permission.ask")(function* (input: AskInput) {
      const { approved, pending } = yield* InstanceState.get(state)
      const { ruleset, requirePrompt = false, authority = [], ...request } = input
      let needsAsk = requirePrompt

      for (const pattern of request.patterns) {
        const base = evaluateAuthority(request.permission, pattern, ruleset, authority)
        const rule =
          base.action === "ask" && evaluate(request.permission, pattern, approved).action === "allow"
            ? { ...base, action: "allow" as const }
            : base
        yield* Effect.logInfo("evaluated", { permission: request.permission, pattern, action: rule })
        if (rule.action === "deny") {
          return yield* new PermissionV1.DeniedError({
            ruleset: [ruleset, ...authority.map((layer) => layer.ruleset)]
              .flat()
              .filter((rule) => Wildcard.matchIdentifier(request.permission, rule.permission)),
          })
        }
        if (rule.action === "allow") continue
        needsAsk = true
      }

      if (!needsAsk) return

      const id = request.id ?? PermissionV1.ID.ascending()
      const info: PermissionV1.Request = {
        id,
        sessionID: request.sessionID,
        permission: request.permission,
        patterns: request.patterns,
        metadata: requestMetadata(request.metadata, requirePrompt),
        always: request.always,
        tool: request.tool,
      }
      yield* Effect.logInfo("asking", { id, permission: info.permission, patterns: info.patterns })

      const deferred = yield* Deferred.make<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>()
      pending.set(id, { info, deferred, requirePrompt })
      yield* events.publish(Event.Asked, info)
      return yield* Effect.ensuring(
        Deferred.await(deferred),
        Effect.sync(() => {
          pending.delete(id)
        }),
      )
    })

    const reply = Effect.fn("Permission.reply")(function* (input: PermissionV1.ReplyInput) {
      const { approved, pending } = yield* InstanceState.get(state)
      const existing = pending.get(input.requestID)
      if (!existing) return yield* new PermissionV1.NotFoundError({ requestID: input.requestID })

      pending.delete(input.requestID)
      yield* events.publish(Event.Replied, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
        reply: input.reply,
      })

      if (input.reply === "reject") {
        yield* Deferred.fail(
          existing.deferred,
          input.message
            ? new PermissionV1.CorrectedError({ feedback: input.message })
            : new PermissionV1.RejectedError(),
        )

        for (const [id, item] of pending.entries()) {
          if (item.info.sessionID !== existing.info.sessionID) continue
          pending.delete(id)
          yield* events.publish(Event.Replied, {
            sessionID: item.info.sessionID,
            requestID: item.info.id,
            reply: "reject",
          })
          yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
        }
        return
      }

      yield* Deferred.succeed(existing.deferred, undefined)
      if (input.reply === "once" || existing.requirePrompt || existing.info.metadata.onceOnly === true) return

      for (const pattern of existing.info.always) {
        approved.push({
          permission: existing.info.permission,
          pattern,
          action: "allow",
        })
      }

      for (const [id, item] of pending.entries()) {
        if (item.info.sessionID !== existing.info.sessionID) continue
        if (item.requirePrompt || item.info.metadata.onceOnly === true) continue
        const ok = item.info.patterns.every(
          (pattern) => evaluate(item.info.permission, pattern, approved).action === "allow",
        )
        if (!ok) continue
        pending.delete(id)
        yield* events.publish(Event.Replied, {
          sessionID: item.info.sessionID,
          requestID: item.info.id,
          reply: "always",
        })
        yield* Deferred.succeed(item.deferred, undefined)
      }
    })

    const list = Effect.fn("Permission.list")(function* () {
      const pending = (yield* InstanceState.get(state)).pending
      return Array.from(pending.values(), (item) => item.info)
    })

    return Service.of({ ask, reply, list })
  }),
)

function expand(pattern: string): string {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1)
  if (pattern === "~") return os.homedir()
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5)
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5)
  return pattern
}

function requestMetadata(metadata: PermissionV1.Request["metadata"], requirePrompt: boolean) {
  const sanitized = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => key !== PermissionV1.PROMPT_REQUIRED_METADATA_KEY),
  )
  if (!requirePrompt) return sanitized
  return { ...sanitized, [PermissionV1.PROMPT_REQUIRED_METADATA_KEY]: true }
}

export function fromConfig(permission: ConfigPermissionV1.Info) {
  const ruleset: PermissionV1.Rule[] = []
  for (const [key, value] of Object.entries(permission)) {
    ConfigPermissionV1.assertOrderedObjectKey(key, "permission capability")
    if (typeof value === "string") {
      ruleset.push({ permission: key, action: value, pattern: "*" })
      continue
    }
    ruleset.push(
      ...Object.entries(value).map(([pattern, action]) => {
        ConfigPermissionV1.assertOrderedObjectKey(pattern, `resource pattern for permission ${JSON.stringify(key)}`)
        return { permission: key, pattern: expand(pattern), action }
      }),
    )
  }
  return ruleset
}

export function merge(...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule[] {
  return orderedRules(...rulesets)
}

const toolPermissions = new Map([
  ["edit", "edit"],
  ["write", "edit"],
  ["apply_patch", "edit"],
  ["list_mcp_resources", "read"],
  ["list_mcp_resource_templates", "read"],
  ["read_mcp_resource", "read"],
  ["content_write", "content_mutation"],
])

export function permissionForTool(tool: string) {
  return toolPermissions.get(tool) ?? tool
}

export function disabled(
  tools: string[],
  ruleset: PermissionV1.Ruleset,
  authority: readonly AuthorityLayer[] = [],
): Set<string> {
  return new Set(
    tools.filter((tool) => {
      const permission = permissionForTool(tool)
      if (disabledByRules(permission, ruleset, "ask")) return true
      return authority.some((layer) => disabledByRules(permission, layer.ruleset, layer.absence))
    }),
  )
}

export function visibleTools<T>(
  tools: Record<string, T>,
  ruleset: PermissionV1.Ruleset,
  authority: readonly AuthorityLayer[] = [],
): Record<string, T> {
  const hidden = disabled(Object.keys(tools), ruleset, authority)
  return Object.fromEntries(Object.entries(tools).filter(([name]) => !hidden.has(name)))
}

function evaluateLayer(permission: string, pattern: string, layer: AuthorityLayer): PermissionV1.Rule {
  const matched = orderedRules(layer.ruleset).findLast(
    (rule) => Wildcard.matchIdentifier(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
  )
  return matched ?? { permission, pattern: "*", action: layer.absence }
}

function disabledByRules(permission: string, ruleset: PermissionV1.Ruleset, absence: AuthorityLayer["absence"]) {
  const rule = orderedRules(ruleset).findLast((rule) => Wildcard.matchIdentifier(permission, rule.permission))
  if (!rule) return absence === "deny"
  return rule.pattern === "*" && rule.action === "deny"
}

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2Bridge.node] })

export * as Permission from "."
