import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { SessionPrompt } from "../session/prompt"
import { Effect, Exit, Schema } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { Database } from "@opencode-ai/core/database/database"
import { Turn } from "@opencode-ai/schema/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"

export interface TaskPromptOps {
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  startChild(input: SessionPrompt.StartChildInput): Effect.Effect<Turn.Info, unknown>
  awaitChild(input: SessionPrompt.AwaitChildInput): Effect.Effect<Turn.ChildResult, unknown>
  interruptTurn(sessionID: SessionID, turnID: Turn.ID): Effect.Effect<Turn.Info, unknown>
}

const id = "task"
const DEFAULT_CHILD_LIMITS = Object.freeze({ model: 64, tool: 256 }) satisfies Turn.Limits
const CHILD_DEPTH_LIMIT = 8

const Capability = Schema.Struct({
  permission: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "The exact permission family delegated to the child",
  }),
  patterns: Schema.Array(Schema.String.check(Schema.isMinLength(1)))
    .check(Schema.isMinLength(1))
    .annotate({ description: "One or more exact permission patterns delegated to the child" }),
})

export const Parameters = Schema.Struct({
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The bounded task for the child agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The specialized child agent profile" }),
  capabilities: Schema.Array(Capability).annotate({
    description:
      "Explicit child capability delegation. Omitted permissions are denied; requested patterns are authorized at admission and intersected with frozen parent authority for every child effect.",
  }),
  child_session_id: Schema.optional(SessionID).annotate({
    description:
      "Exact child Session returned by an earlier task result. Set only for an authorized follow-up; arbitrary Session adoption is rejected.",
  }),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const database = yield* Database.Service

    const run = Effect.fn("TaskTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const interaction = ctx.interaction
      if (!interaction) return yield* Effect.fail(new Error("TaskTool requires an admitted parent Turn invocation"))
      if (interaction.assistantMessageID !== ctx.messageID) {
        return yield* Effect.fail(new Error("TaskTool interaction does not belong to the current Assistant operation"))
      }

      yield* ctx.ask({
        permission: id,
        patterns: [params.subagent_type],
        always: [params.subagent_type],
        metadata: {
          description: params.description,
          subagent_type: params.subagent_type,
          synchronous: true,
        },
      })

      const next = yield* agents.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }

      // Admission approval records delegation intent. It is not wildcard-subset proof;
      // every child effect is still checked against the frozen parent authority below.
      yield* Effect.forEach(
        params.capabilities,
        (capability) =>
          ctx.ask({
            permission: capability.permission,
            patterns: [...capability.patterns],
            always: [...capability.patterns],
            metadata: {
              description: params.description,
              subagent_type: params.subagent_type,
              delegated: true,
            },
          }),
        { discard: true },
      )

      const parent = yield* sessions.get(ctx.sessionID)
      const parentMessage = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.orDie,
      )
      if (parentMessage.info.role !== "assistant") {
        return yield* Effect.fail(new Error("TaskTool requires an Assistant model operation"))
      }

      const model = next.model ?? {
        modelID: parentMessage.info.modelID,
        providerID: parentMessage.info.providerID,
      }
      const childSessionID = params.child_session_id ?? SessionID.create()
      const childTurnID = Turn.ID.create()
      const childInputID = Turn.InputID.create()
      const childMessageID = MessageID.ascending()
      const projection = delegatedRules(params.capabilities)
      const delegatedCapability = {
        version: 2,
        parent: freezeRuleset(interaction.permission.ruleset),
        inherited: interaction.permission.authority.map((layer) => freezeRuleset(layer.ruleset)),
        profile: freezeRuleset(next.permission),
        explicit: projection,
      } satisfies SessionPrompt.DelegatedCapability
      const metadata = {
        childSessionId: childSessionID,
        childTurnId: childTurnID,
        parentTurnId: interaction.turnID,
        parentTaskPartId: interaction.candidate.partID,
        model,
      }

      yield* ctx.metadata({ title: params.description, metadata })

      const ops = ctx.extra?.promptOps as TaskPromptOps | undefined
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))
      const parts = yield* ops.resolvePromptParts(params.prompt)
      const start = {
        childSessionID,
        childTurnID,
        childInputID,
        messageID: childMessageID,
        parentSessionID: ctx.sessionID,
        parentTurnID: interaction.turnID,
        parentTaskPartID: interaction.candidate.partID,
        parentModelMessageID: interaction.assistantMessageID,
        delegatedCapability,
        depthLimit: CHILD_DEPTH_LIMIT,
        limits: DEFAULT_CHILD_LIMITS,
        model,
        agent: next.name,
        variant: next.model ? undefined : parentMessage.info.variant,
        parts,
        session: {
          title: params.description + ` (@${next.name} child)`,
          permission: deriveSubagentSessionPermission({
            parentSessionPermission: parent.permission ?? [],
            subagent: next,
          }),
        },
      } satisfies SessionPrompt.StartChildInput
      const awaitInput = {
        parentSessionID: ctx.sessionID,
        parentTurnID: interaction.turnID,
        parentTaskPartID: interaction.candidate.partID,
        childSessionID,
        childTurnID,
      } satisfies SessionPrompt.AwaitChildInput
      const bridge = yield* EffectBridge.make()
      const interrupt = ops.interruptTurn(childSessionID, childTurnID).pipe(Effect.ignore)

      function onAbort() {
        bridge.fork(interrupt)
      }

      const result = yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", onAbort)
          if (ctx.abort.aborted) onAbort()
        }),
        () =>
          Effect.gen(function* () {
            yield* ops.startChild(start)
            return yield* ops.awaitChild(awaitInput)
          }),
        (_, exit) =>
          Effect.gen(function* () {
            ctx.abort.removeEventListener("abort", onAbort)
            if (Exit.isFailure(exit)) yield* interrupt
          }),
      )
      const output = {
        child_session_id: result.childSessionID,
        child_turn_id: result.childTurnID,
        terminal_outcome: result.terminalOutcome,
        requested_output: result.requestedOutput,
      }
      return {
        title: params.description,
        metadata: {
          ...metadata,
          terminalOutcome: result.terminalOutcome,
          requestedOutputState: result.requestedOutput.state,
        },
        output: JSON.stringify(output),
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)

function delegatedRules(capabilities: Schema.Schema.Type<typeof Parameters>["capabilities"]): PermissionV1.Rule[] {
  return [
    ...new Map(
      capabilities
        .flatMap((capability) =>
          capability.patterns.map((pattern) => ({
            permission: capability.permission,
            pattern,
            action: "allow" as const,
          })),
        )
        .map((rule) => [`${rule.permission}\u0000${rule.pattern}`, rule]),
    ).values(),
  ].toSorted((left, right) =>
    (left.permission + "\u0000" + left.pattern).localeCompare(right.permission + "\u0000" + right.pattern),
  )
}

function freezeRuleset(ruleset: readonly PermissionV1.Rule[]): PermissionV1.Rule[] {
  return ruleset.map((rule) => ({
    permission: rule.permission,
    pattern: rule.pattern,
    action: rule.action,
  }))
}
