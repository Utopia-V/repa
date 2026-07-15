import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { Npm } from "@opencode-ai/core/npm"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { expect } from "bun:test"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import { Cause, Effect, Exit } from "effect"
import { Agent } from "@/agent/agent"
import { Account } from "@/account/account"
import { Auth } from "@/auth"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { Skill } from "@/skill"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { ProviderTest } from "../fake/provider"
import { SkillTest } from "../fake/skill"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const model = ProviderTest.model({
  providerID: ProviderV2.ID.make("gitlab"),
  id: ModelV2.ID.make("duo-workflow-test"),
  api: { id: "duo-workflow-test", url: "https://gitlab.com", npm: "gitlab-ai-provider" },
})
let language: GitLabWorkflowLanguageModel
let networkCalls = 0
let executions = 0

const provider = ProviderTest.fake({
  model,
  getLanguage: () => Effect.sync(() => language),
})
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Agent.node, Plugin.node]), [
    [Auth.node, AuthTest.empty],
    [Account.node, AccountTest.empty],
    [Npm.node, NpmTest.noop],
    [Provider.node, provider.layer],
    [Skill.node, SkillTest.empty],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ]),
)

it.instance("rejects GitLab workflow models before Agent.generate can execute provider tools", () =>
  Effect.gen(function* () {
    const { directory } = yield* TestInstance
    networkCalls = 0
    executions = 0
    const target = `${directory}/agent-generate-workflow-write.txt`
    const workflowFetch = Object.assign(
      async (..._args: Parameters<typeof fetch>) => {
        networkCalls++
        throw new Error("unexpected workflow network request")
      },
      { preconnect: (..._args: Parameters<typeof fetch.preconnect>) => {} },
    )
    language = new GitLabWorkflowLanguageModel(
      model.id,
      {
        provider: "gitlab.workflow",
        instanceUrl: "https://gitlab.invalid",
        getHeaders: () => ({}),
        fetch: workflowFetch,
      },
      { workingDirectory: directory, agentPrivileges: [] },
    )
    language.toolExecutor = async () => {
      executions++
      await Bun.write(target, "workflow executor ran")
      return { result: "unexpected" }
    }
    language.approvalHandler = async () => {
      executions++
      return { approved: true }
    }

    const exit = yield* Agent.use
      .generate({
        description: "Create a harmless study helper",
        model: { providerID: model.providerID, modelID: model.id },
      })
      .pipe(Effect.exit)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(Cause.squash(exit.cause))).toContain(
        "GitLab workflow model is unavailable for agent generation: gitlab/duo-workflow-test",
      )
    }
    expect(networkCalls).toBe(0)
    expect(executions).toBe(0)
    expect(yield* Effect.promise(() => Bun.file(target).exists())).toBe(false)
  }),
)
