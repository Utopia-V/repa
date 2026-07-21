import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import type { Provider } from "../../src/provider/provider"
import { SystemPrompt } from "../../src/session/system"
import { MCP } from "../../src/mcp"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const repa: Agent.Info = {
  name: "repa",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        instructions: () =>
          Effect.succeed([
            {
              name: "guide-server",
              instructions: "Use lookup before mutate.",
              tools: [],
            },
            {
              name: "tool-server",
              instructions: "Prefer search before update.",
              tools: ["tool-server_search", "tool-server_update"],
            },
          ]),
      }),
    ],
    [
      Skill.node,
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
        }),
      ),
    ],
  ]),
)

describe("session.system", () => {
  test("former provider branches share one learning-first operation guide", () => {
    const representatives = [
      "meta/muse-spark-preview",
      "gpt-4.1",
      "o3",
      "gpt-5.4",
      "gpt-5.4-codex",
      "gemini-3-pro",
      "claude-sonnet-4-6",
      "trinity-large",
      "kimi-k2.5",
      "fallback-model",
    ]
    const prompts = representatives.map((id) => SystemPrompt.provider({ api: { id } } as Provider.Model).join("\n"))

    expect(new Set(prompts).size).toBe(1)
    for (const prompt of prompts) {
      expect(prompt).toContain("terminal workspace")
      expect(prompt).not.toMatch(/OpenCode|coding agent|software engineering tasks/i)
    }
  })

  test("interactive and internal cores have distinct Repa-owned contracts", () => {
    const interactive = SystemPrompt.product()
    const internal = SystemPrompt.internal()

    expect(interactive).toContain("<repa_product_contract>")
    expect(interactive).toContain("terminal-native Learning System")
    expect(interactive).toContain("current request")
    expect(interactive).toContain("not proof of mastery")
    expect(interactive).toContain("Use update_learner_goals only after explicit learner initiation or acceptance")
    expect(interactive).toContain("learner_request is a narrow mechanical closure")
    expect(interactive).toContain("create must explicitly initiate or declare a durable Goal")
    expect(interactive).toContain("mixes Goal-like wording with teaching cadence")
    expect(interactive).toContain("uses learner_acceptance")
    expect(interactive).toContain("keep exact learner wording authored")
    expect(interactive).toContain("hypothetical, quoted, or negated aspiration")
    expect(interactive).toContain("ordinary discussion")
    expect(interactive).toContain("coding")
    expect(internal).toContain("<repa_internal_operation>")
    expect(internal).not.toContain("<repa_product_contract>")
    expect(internal).not.toContain("update_learner_goals")
  })

  it.instance("environment describes a neutral learning workspace", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = (yield* prompt.environment({
        providerID: "test",
        api: { id: "test-model" },
      } as Provider.Model)).join("\n")

      expect(output).toContain("Current workspace directory")
      expect(output).toContain("Workspace uses Git version control")
      expect(output).not.toMatch(/Project references|Is directory a git repo|codebase/i)
    }),
  )

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(repa)
      const second = yield* prompt.skills(repa)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(repa)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(repa, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )
})
