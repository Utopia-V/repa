import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"
import { InstanceState } from "@/effect/instance-state"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import { Deferred, Effect, Layer, Context, Semaphore } from "effect"
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
  readonly lifecycle?: DurableLifecycle
}

export type EvaluationBasis = Readonly<{
  permission: string
  patterns: readonly string[]
  requirePrompt: boolean
  ruleset: PermissionV1.Ruleset
  authority: readonly AuthorityLayer[]
  approved: PermissionV1.Ruleset
  evaluated: readonly PermissionV1.Rule[]
}>

export type Selection =
  | { readonly action: "allow" | "deny"; readonly basis: EvaluationBasis }
  | { readonly action: "ask"; readonly basis: EvaluationBasis; readonly request: PermissionV1.Request }

export type DurableLifecycle = Readonly<{
  resolution: "request_exact"
  selected: (selection: Selection) => Effect.Effect<void>
  replied: (input: { request: PermissionV1.Request; reply: PermissionV1.ReplyInput }) => Effect.Effect<void>
}>

interface PendingEntry {
  info: PermissionV1.Request
  deferred: Deferred.Deferred<
    void,
    PermissionV1.RejectedError | PermissionV1.CorrectedError | PermissionV1.CancelledError
  >
  requirePrompt: boolean
  lifecycle?: DurableLifecycle
}

interface State {
  pending: Map<PermissionV1.ID, PendingEntry>
  approved: PermissionV1.Rule[]
  transitions: Semaphore.Semaphore
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
          transitions: Semaphore.makeUnsafe(1),
        }

        yield* Effect.addFinalizer(() =>
          state.transitions.withPermit(
            Effect.gen(function* () {
              for (const item of state.pending.values()) {
                yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
              }
              state.pending.clear()
            }),
          ),
        )

        return state
      }),
    )

    const ask = Effect.fn("Permission.ask")(function* (input: AskInput) {
      const current = yield* InstanceState.get(state)
      const admission = yield* Effect.uninterruptible(
        current.transitions.withPermit(
          Effect.gen(function* () {
            const { approved, pending } = current
            const { ruleset, requirePrompt = false, authority = [], lifecycle, ...request } = input
            const evaluated = request.patterns.map((pattern) => {
              const base = evaluateAuthority(request.permission, pattern, ruleset, authority)
              if (base.action !== "ask") return base
              if (evaluate(request.permission, pattern, approved).action !== "allow") return base
              return { ...base, action: "allow" as const }
            })
            const basis: EvaluationBasis = {
              permission: request.permission,
              patterns: [...request.patterns],
              requirePrompt,
              ruleset: [...ruleset],
              authority: authority.map((layer) => ({ absence: layer.absence, ruleset: [...layer.ruleset] })),
              approved: approved.filter(
                (rule) =>
                  Wildcard.matchIdentifier(request.permission, rule.permission) &&
                  request.patterns.some((pattern) => Wildcard.match(pattern, rule.pattern)),
              ),
              evaluated,
            }
            for (const rule of evaluated) {
              yield* Effect.logInfo("evaluated", {
                permission: request.permission,
                pattern: rule.pattern,
                action: rule,
              })
            }
            const action = evaluated.some((rule) => rule.action === "deny")
              ? ("deny" as const)
              : requirePrompt || evaluated.some((rule) => rule.action === "ask")
                ? ("ask" as const)
                : ("allow" as const)

            if (action === "deny") {
              if (lifecycle) yield* lifecycle.selected({ action, basis })
              return yield* new PermissionV1.DeniedError({
                ruleset: [ruleset, ...authority.map((layer) => layer.ruleset)]
                  .flat()
                  .filter((rule) => Wildcard.matchIdentifier(request.permission, rule.permission)),
              })
            }
            if (action === "allow") {
              if (lifecycle) yield* lifecycle.selected({ action, basis })
              return { type: "complete" as const }
            }

            const id = request.id ?? PermissionV1.ID.ascending()
            const info: PermissionV1.Request = {
              id,
              sessionID: request.sessionID,
              permission: request.permission,
              patterns: request.patterns,
              metadata: requestMetadata(request.metadata, requirePrompt, Boolean(lifecycle)),
              always: request.always,
              tool: request.tool,
            }
            yield* Effect.logInfo("asking", { id, permission: info.permission, patterns: info.patterns })
            const deferred = yield* Deferred.make<
              void,
              PermissionV1.RejectedError | PermissionV1.CorrectedError | PermissionV1.CancelledError
            >()
            if (lifecycle) yield* lifecycle.selected({ action, basis, request: info })
            pending.set(id, { info, deferred, requirePrompt, lifecycle })
            return { type: "pending" as const, info, deferred, pending }
          }),
        ),
      )
      if (admission.type === "complete") return
      return yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* events.publish(Event.Asked, admission.info)
          return yield* Deferred.await(admission.deferred)
        }),
        current.transitions.withPermit(
          Effect.sync(() => {
            if (admission.pending.get(admission.info.id)?.deferred !== admission.deferred) return
            admission.pending.delete(admission.info.id)
          }),
        ),
      )
    })

    const reply = Effect.fn("Permission.reply")(function* (input: PermissionV1.ReplyInput) {
      const current = yield* InstanceState.get(state)
      const resolved = yield* Effect.uninterruptible(
        current.transitions.withPermit(
          Effect.gen(function* () {
            const { approved, pending } = current
            const existing = pending.get(input.requestID)
            if (!existing) return yield* new PermissionV1.NotFoundError({ requestID: input.requestID })
            if (existing.lifecycle) yield* existing.lifecycle.replied({ request: existing.info, reply: input })
            pending.delete(input.requestID)
            const result = [{ entry: existing, reply: input }]

            if (input.reply === "reject") {
              if (existing.lifecycle?.resolution === "request_exact") return result
              for (const [id, item] of pending.entries()) {
                if (item.info.sessionID !== existing.info.sessionID) continue
                if (item.lifecycle?.resolution === "request_exact") continue
                pending.delete(id)
                result.push({
                  entry: item,
                  reply: { requestID: item.info.id, reply: "reject" as const },
                })
              }
              return result
            }
            if (input.reply === "cancel" || input.reply === "once") return result
            if (existing.requirePrompt || existing.info.metadata.onceOnly === true) return result

            for (const pattern of existing.info.always) {
              approved.push({
                permission: existing.info.permission,
                pattern,
                action: "allow",
              })
            }
            if (existing.lifecycle?.resolution === "request_exact") return result
            for (const [id, item] of pending.entries()) {
              if (item.info.sessionID !== existing.info.sessionID) continue
              if (item.lifecycle?.resolution === "request_exact") continue
              if (item.requirePrompt || item.info.metadata.onceOnly === true) continue
              const ok = item.info.patterns.every(
                (pattern) => evaluate(item.info.permission, pattern, approved).action === "allow",
              )
              if (!ok) continue
              pending.delete(id)
              result.push({
                entry: item,
                reply: { requestID: item.info.id, reply: "always" as const },
              })
            }
            return result
          }),
        ),
      )

      // The lifecycle reply is already durable and every pending entry is removed.
      // Release all waiters before best-effort live publication so carrier delivery
      // cannot become a second acknowledgement boundary.
      yield* Effect.uninterruptible(
        Effect.forEach(resolved, (item) => completeReply(item.entry, item.reply), { discard: true }),
      )
      yield* Effect.uninterruptible(
        Effect.forEach(
          resolved,
          (item) =>
            events
              .publish(Event.Replied, {
                sessionID: item.entry.info.sessionID,
                requestID: item.entry.info.id,
                reply: item.reply.reply,
              })
              .pipe(Effect.exit),
          { discard: true },
        ),
      )
    })

    const list = Effect.fn("Permission.list")(function* () {
      const current = yield* InstanceState.get(state)
      return yield* current.transitions.withPermit(
        Effect.sync(() => Array.from(current.pending.values(), (item) => item.info)),
      )
    })

    return Service.of({ ask, reply, list })
  }),
)

function completeReply(entry: PendingEntry, input: PermissionV1.ReplyInput) {
  if (input.reply === "cancel") {
    return Deferred.fail(entry.deferred, new PermissionV1.CancelledError()).pipe(Effect.asVoid)
  }
  if (input.reply === "reject") {
    return Deferred.fail(
      entry.deferred,
      input.message ? new PermissionV1.CorrectedError({ feedback: input.message }) : new PermissionV1.RejectedError(),
    ).pipe(Effect.asVoid)
  }
  return Deferred.succeed(entry.deferred, undefined).pipe(Effect.asVoid)
}

function expand(pattern: string): string {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1)
  if (pattern === "~") return os.homedir()
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5)
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5)
  return pattern
}

function requestMetadata(metadata: PermissionV1.Request["metadata"], requirePrompt: boolean, exactReply: boolean) {
  const sanitized = Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => key !== PermissionV1.PROMPT_REQUIRED_METADATA_KEY && key !== PermissionV1.EXACT_REPLY_METADATA_KEY,
    ),
  )
  return {
    ...sanitized,
    ...(requirePrompt ? { [PermissionV1.PROMPT_REQUIRED_METADATA_KEY]: true } : {}),
    ...(exactReply ? { [PermissionV1.EXACT_REPLY_METADATA_KEY]: true } : {}),
  }
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
