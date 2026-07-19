import { SessionV1 } from "@opencode-ai/core/v1/session"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { expect } from "bun:test"
import { tool } from "ai"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import { Cause, Effect, Exit, Layer, Stream } from "effect"
import z from "zod"
import { LLM } from "@/session/llm"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { MessageID, SessionID } from "@/session/schema"
import { ProviderTest } from "../fake/provider"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const model = ProviderTest.model({
  providerID: ProviderV2.ID.make("gitlab"),
  id: ModelV2.ID.make("duo-workflow-test"),
  api: { id: "duo-workflow-test", url: "https://gitlab.com", npm: "gitlab-ai-provider" },
})
let language: GitLabWorkflowLanguageModel
let permissionAsks = 0
let networkCalls = 0
let executions = 0

const provider = ProviderTest.fake({
  model,
  getLanguage: () => Effect.sync(() => language),
})
const permission = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    ask: () =>
      Effect.sync(() => {
        permissionAsks++
      }),
    reply: () => Effect.void,
    list: () => Effect.succeed([]),
  }),
)
const it = testEffect(
  AppNodeBuilder.build(LLM.node, [
    [Provider.node, provider.layer],
    [Permission.node, permission],
  ]),
)

it.instance("rejects GitLab workflow callback execution before provider IO", () =>
  Effect.gen(function* () {
    const { directory } = yield* TestInstance
    permissionAsks = 0
    networkCalls = 0
    executions = 0
    const target = `${directory}/workflow-write.txt`
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
    const previousExecutor = async () => {
      executions++
      await Bun.write(target, "workflow executor ran")
      return { result: "unexpected" }
    }
    const previousApproval = async () => {
      executions++
      return { approved: true }
    }
    language.toolExecutor = previousExecutor
    language.approvalHandler = previousApproval
    language.sessionPreapprovedTools = ["sentinel"]
    language.sessionID = "sentinel-session"
    language.systemPrompt = "sentinel-system"
    const installedExecutor = language.toolExecutor
    const installedApproval = language.approvalHandler

    const sessionID = SessionID.make("session-internal-gitlab-workflow")
    const agent = {
      name: "compaction",
      mode: "primary" as const,
      hidden: true,
      options: {},
      permission: [],
    } satisfies Agent.Info
    const llm = yield* LLM.Service
    const exit = yield* llm
      .stream({
        composition: { type: "internal", purpose: "compaction" },
        sessionID,
        model,
        agent,
        user: {
          id: MessageID.make("msg-internal-gitlab-workflow"),
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "repa",
          model: { providerID: model.providerID, modelID: model.id },
        } satisfies SessionV1.User,
        system: [],
        messages: [{ role: "user", content: "Summarize without acting" }],
        tools: {
          write_probe: tool({
            description: "Write a probe file",
            inputSchema: z.object({ text: z.string() }),
            execute: async ({ text }) => {
              executions++
              await Bun.write(target, text)
              return { output: "written" }
            },
          }),
        },
        toolChoice: "required",
      })
      .pipe(Stream.runDrain, Effect.exit)
    const interactiveExit = yield* llm
      .stream({
        composition: { type: "interactive" },
        sessionID,
        model,
        agent,
        user: {
          id: MessageID.make("msg-interactive-gitlab-workflow"),
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "repa",
          model: { providerID: model.providerID, modelID: model.id },
        } satisfies SessionV1.User,
        system: [],
        messages: [{ role: "user", content: "Act through the workflow" }],
        tools: {},
      })
      .pipe(Stream.runDrain, Effect.exit)

    expect(Exit.isFailure(exit)).toBe(true)
    expect(Exit.isFailure(interactiveExit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(Cause.squash(exit.cause))).toContain(
        "GitLab workflow models are unavailable in the released-v1 Turn runtime",
      )
    }
    expect(permissionAsks).toBe(0)
    expect(networkCalls).toBe(0)
    expect(executions).toBe(0)
    expect(yield* Effect.promise(() => Bun.file(target).exists())).toBe(false)
    expect(language.toolExecutor).toBe(installedExecutor)
    expect(language.approvalHandler).toBe(installedApproval)
    expect(language.sessionPreapprovedTools).toEqual(["sentinel"])
    expect(language.sessionID).toBe("sentinel-session")
    expect(language.systemPrompt).toBe("sentinel-system")
  }),
)
