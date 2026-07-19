import { EOL } from "os"
import { basename } from "path"
import { Cause, Effect } from "effect"
import { Agent } from "../../../agent/agent"
import { Provider } from "@/provider/provider"
import { ToolRegistry } from "@/tool/registry"
import { Permission } from "../../../permission"
import { fail } from "../../effect-cmd"
import { InstanceRef } from "@/effect/instance-ref"

export const debugAgent = Effect.fn("Cli.debug.agent")(function* (args: { name: string }) {
  const ctx = yield* InstanceRef
  if (!ctx) return
  return yield* run(args)
})

const run = Effect.fn("Cli.debug.agent.body")(function* (args: { name: string }) {
  const agentName = args.name
  const agent = yield* Agent.Service.use((svc) => svc.get(agentName))
  if (!agent) {
    process.stderr.write(
      `Agent ${agentName} not found, run '${basename(process.execPath)} agent list' to get an agent list` + EOL,
    )
    return yield* fail("", 1)
  }
  const availableTools = yield* getAvailableTools(agent)
  const resolvedTools = resolveTools(agent, availableTools)

  const output = {
    ...agent,
    tools: resolvedTools,
  }
  process.stdout.write(JSON.stringify(output, null, 2) + EOL)
})

const getAvailableTools = Effect.fn("Cli.debug.agent.getAvailableTools")(function* (agent: Agent.Info) {
  const provider = yield* Provider.Service
  const registry = yield* ToolRegistry.Service
  const model =
    agent.model ??
    (yield* provider.defaultModel().pipe(
      Effect.matchCauseEffect({
        onSuccess: Effect.succeed,
        onFailure: (cause) => {
          const error = Cause.squash(cause) as Provider.DefaultModelError
          if (error instanceof Provider.ModelNotFoundError) {
            return fail(`Model not found: ${error.providerID}/${error.modelID}`)
          }
          if (error instanceof Provider.NoModelsError) return fail(`No models found for provider ${error.providerID}`)
          return fail("No providers found")
        },
      }),
    ))
  return yield* registry.tools({ ...model, agent })
})

function resolveTools(agent: Agent.Info, availableTools: { id: string }[]) {
  const disabled = Permission.disabled(
    availableTools.map((tool) => tool.id),
    agent.permission,
  )
  const resolved: Record<string, boolean> = {}
  for (const tool of availableTools) {
    resolved[tool.id] = !disabled.has(tool.id)
  }
  return resolved
}
