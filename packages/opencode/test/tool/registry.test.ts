import { afterEach, describe, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath, pathToFileURL } from "url"
import { Cause, Effect, Exit, Layer, Result, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestConfig } from "../fixture/config"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"

import { ToolJsonSchema } from "@/tool/json-schema"
import { MessageID, SessionID } from "@/session/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { MCP } from "@/mcp"
import type { Tool as MCPToolDef } from "@modelcontextprotocol/sdk/types.js"
import { assertExternalToolID, toolCallPreparation } from "@/tool/learning-command"
import { Permission } from "@/permission"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { sql } from "drizzle-orm"
import { normalizeDefaultV3, normalizeGoalsV2, normalizeLearningBootstrap } from "@/learning-command/input"

const configLayer = TestConfig.layer({
  directories: () => InstanceState.directory.pipe(Effect.map((dir) => [path.join(dir, ".repa")])),
})
const prototypeDenyConfigLayer = TestConfig.layer({
  get: () => Effect.succeed({ permission: JSON.parse(`{"*":"allow","__proto__":"deny"}`) }),
  directories: () => InstanceState.directory.pipe(Effect.map((dir) => [path.join(dir, ".repa")])),
})

// Fake Plugin.Service that returns a single plugin whose `tool` map contains
// one definition with `args: undefined`. Used to exercise the plugin entry
// point of `fromPlugin` for the #27451 / #27630 regression.
const brokenPluginLayer = Layer.succeed(
  Plugin.Service,
  Plugin.Service.of({
    init: () => Effect.void,
    trigger: ((_name: unknown, _input: unknown, output: unknown) =>
      Effect.succeed(output)) as Plugin.Interface["trigger"],
    list: () =>
      Effect.succeed([
        {
          tool: {
            broken_plugin_tool: {
              description: "plugin tool with missing args",
              args: undefined as unknown as Record<string, never>,
              execute: async () => "ok",
            },
          },
        },
      ]),
  }),
)

const root = LayerNode.group([ToolRegistry.node, Agent.node, Course.node, Database.node])
const replacements = [
  [Config.node, configLayer],
  [RuntimeFlags.node, RuntimeFlags.layer()],
] as const

const it = testEffect(LayerNode.compile(root, replacements))
const withPrototypeDeny = testEffect(
  LayerNode.compile(root, [
    [Config.node, prototypeDenyConfigLayer],
    [RuntimeFlags.node, RuntimeFlags.layer()],
  ]),
)
const withCodeMode = testEffect(
  LayerNode.compile(root, [
    [Config.node, configLayer],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalCodeMode: true })],
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        tools: () =>
          Effect.succeed({
            weather_current: {
              def: {
                name: "current",
                description: "current weather",
                inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
              } as MCPToolDef,
              client: {} as MCP.McpTool["client"],
            },
          }),
        clients: () => Effect.succeed({ weather: {} as any }),
      }),
    ],
  ]),
)
const withEmptyCodeMode = testEffect(
  LayerNode.compile(root, [
    [Config.node, configLayer],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalCodeMode: true })],
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        tools: () => Effect.succeed({}),
        clients: () => Effect.succeed({}),
      }),
    ],
  ]),
)
const withBrokenPlugin = testEffect(LayerNode.compile(root, [...replacements, [Plugin.node, brokenPluginLayer]]))
const numericPluginLayer = Layer.succeed(
  Plugin.Service,
  Plugin.Service.of({
    init: () => Effect.void,
    trigger: ((_name: unknown, _input: unknown, output: unknown) =>
      Effect.succeed(output)) as Plugin.Interface["trigger"],
    list: () =>
      Effect.succeed([
        {
          tool: {
            "0": {
              description: "numeric plugin tool",
              args: {},
              execute: async () => "ok",
            },
          },
        },
      ]),
  }),
)
const withNumericPlugin = testEffect(LayerNode.compile(root, [...replacements, [Plugin.node, numericPluginLayer]]))
const withNumericMcp = testEffect(
  LayerNode.compile(root, [
    ...replacements,
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        tools: () =>
          Effect.succeed({
            "0_0": {
              def: {
                name: "0",
                description: "numeric namespaced MCP tool",
                inputSchema: { type: "object", properties: {} },
              } as MCPToolDef,
              client: {} as MCP.McpTool["client"],
            },
          }),
        clients: () => Effect.succeed({}),
      }),
    ],
  ]),
)

afterEach(async () => {
  await disposeAllInstances()
})

describe("tool.registry", () => {
  withPrototypeDeny.instance("hides a prototype-named custom tool denied by the root permission", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const directory = path.join(test.directory, ".repa", "tool")
      yield* Effect.promise(() => fs.mkdir(directory, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, "__proto__.ts"),
          [
            "export default {",
            "  description: 'prototype-named custom tool',",
            "  args: {},",
            "  execute: async () => 'not visible',",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const agent = yield* agents.defaultInfo()
      expect(yield* registry.ids()).toContain("__proto__")
      expect(Permission.evaluate("__proto__", "*", agent.permission).action).toBe("deny")
      expect(
        (yield* registry.tools({
          providerID: ProviderV2.ID.opencode,
          modelID: ModelV2.ID.make("test"),
          agent,
        })).map((tool) => tool.id),
      ).not.toContain("__proto__")
    }),
  )

  it.instance("rejects an array-index file custom tool before catalog admission", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const directory = path.join(test.directory, ".repa", "tool")
      yield* Effect.promise(() => fs.mkdir(directory, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, "0.ts"),
          [
            "export default {",
            "  description: 'numeric custom tool',",
            "  args: {},",
            "  execute: async () => 'ok',",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const exit = yield* registry.ids().pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBeTrue()
      if (Exit.isSuccess(exit)) return
      expect(Cause.pretty(exit.cause)).toContain('external tool ID "0" is an ECMAScript array-index property key')
    }),
  )

  withNumericPlugin.instance("rejects an array-index plugin tool before catalog admission", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const exit = yield* registry.ids().pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBeTrue()
      if (Exit.isSuccess(exit)) return
      expect(Cause.pretty(exit.cause)).toContain('external tool ID "0" is an ECMAScript array-index property key')
    }),
  )

  withNumericMcp.instance("keeps namespaced numeric MCP tool IDs available", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect(yield* registry.permissionCatalog()).toContain("0_0")
    }),
  )

  it.instance("rejects a custom override of the learning-command capability", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const directory = path.join(test.directory, ".repa", "tool")
      yield* Effect.promise(() => fs.mkdir(directory, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, "accept_course_view_revision.ts"),
          [
            "export default {",
            "  description: 'untrusted override',",
            "  args: {},",
            "  execute: async () => 'overridden',",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const exit = yield* registry.ids().pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isSuccess(exit)) return
      expect(Cause.pretty(exit.cause)).toContain(
        "custom tool ID accept_course_view_revision is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("accept_course_view_revision", "mcp")).toThrow(
        "mcp tool ID accept_course_view_revision is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("representation.convert", "mcp")).toThrow(
        "mcp tool ID representation.convert is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("set_default_course_preference", "mcp")).toThrow(
        "mcp tool ID set_default_course_preference is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("propose_default_course_preference", "mcp")).toThrow(
        "mcp tool ID propose_default_course_preference is reserved for historical Default-Course replay",
      )
      expect(() => assertExternalToolID("course_query", "custom")).toThrow(
        "custom tool ID course_query is reserved by Repa's Course/navigation read authority",
      )
      expect(() => assertExternalToolID("learning_navigation_query", "mcp")).toThrow(
        "mcp tool ID learning_navigation_query is reserved by Repa's Course/navigation read authority",
      )
      expect(() => assertExternalToolID("learner_goal_query", "custom")).toThrow(
        "custom tool ID learner_goal_query is reserved by Repa's learner Goal read authority",
      )
      expect(() => assertExternalToolID("set_course_route_anchor", "mcp")).toThrow(
        "mcp tool ID set_course_route_anchor is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("update_learner_goals", "custom")).toThrow(
        "custom tool ID update_learner_goals is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("update_learner_goals", "mcp")).toThrow(
        "mcp tool ID update_learner_goals is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("update_learning_course", "custom")).toThrow(
        "custom tool ID update_learning_course is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("update_learning_course", "mcp")).toThrow(
        "mcp tool ID update_learning_course is reserved by the learning-command runtime",
      )
      expect(() => assertExternalToolID("learning_material_query", "custom")).toThrow(
        "custom tool ID learning_material_query is reserved by Repa's learning-material read authorities",
      )
      expect(() => assertExternalToolID("learning_material_query", "mcp")).toThrow(
        "mcp tool ID learning_material_query is reserved by Repa's learning-material read authorities",
      )
    }),
  )

  it.instance("exposes current learning commands and owner reads but retires the historical proposal producer", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const tools = yield* registry.all()
      const ids = tools.map((tool) => tool.id)
      const proposal = tools.find((tool) => tool.id === "propose_default_course_preference")
      const preference = tools.find((tool) => tool.id === "set_default_course_preference")
      const goalCommand = tools.find((tool) => tool.id === "update_learner_goals")
      const bootstrapCommand = tools.find((tool) => tool.id === "update_learning_course")

      expect(ids).toContain("accept_course_view_revision")
      expect(ids).toContain("representation.convert")
      expect(ids).not.toContain("propose_default_course_preference")
      expect(ids).toContain("set_default_course_preference")
      expect(ids).toContain("set_course_route_anchor")
      expect(ids).toContain("update_retained_learning_steering")
      expect(ids).toContain("update_learner_goals")
      expect(ids).toContain("course_query")
      expect(ids).toContain("learning_navigation_query")
      expect(ids).toContain("learner_goal_query")
      expect(ids).toContain("learning_material_query")
      expect(ids).toContain("update_learning_course")
      expect(ids).not.toContain("learn")
      expect(ids).not.toContain("/learn")
      expect(proposal).toBeUndefined()
      expect(preference).toBeDefined()
      expect(goalCommand).toBeDefined()
      expect(bootstrapCommand).toBeDefined()
      expect(LearningCommand.UPDATE_LEARNER_GOALS_VERSION).toBe(2)
      expect(LearningCommand.HISTORICAL_UPDATE_LEARNER_GOALS_VERSION).toBe(1)
      expect(LearningCommand).not.toHaveProperty("HistoricalLearnerGoalV1")
      expect(LearningCommand).not.toHaveProperty("reserveLearnerGoals")
      expect(LearningCommand).not.toHaveProperty("prepareLearnerGoalConfirmation")
      expect(LearningCommand).not.toHaveProperty("settleLearnerGoals")
      expect(LearnerGoal).not.toHaveProperty("prepareConfirmation")
      expect(LearnerGoal).not.toHaveProperty("prepareChangeSet")
      expect(LearnerGoal).not.toHaveProperty("applyChangeSet")
      expect(LearnerGoal).not.toHaveProperty("preparePresentation")
      expect(LearnerGoal).not.toHaveProperty("preparedConfirmationSnapshot")
      expect(LearnerGoal).not.toHaveProperty("acceptedPreparedConfirmation")
      expect(LearnerGoal).not.toHaveProperty("sealEffect")
      expect(
        yield* Effect.promise(() =>
          Promise.all(
            ["@opencode-ai/core/learner-goal/learning-command", "@opencode-ai/core/learner-goal-current"].map(
              async (id) => {
                try {
                  await import(id)
                  return true
                } catch {
                  return false
                }
              },
            ),
          ),
        ),
      ).toEqual([false, false])
      expect(
        (preference?.jsonSchema as { anyOf?: Array<{ additionalProperties?: boolean }> } | undefined)?.anyOf?.map(
          (branch) => branch.additionalProperties,
        ),
      ).toEqual([false, false])
      expect(() =>
        normalizeDefaultV3({
          action: "clear",
          authorization: { type: "direct_request_v2" },
          target: { courseID: "crs_shadow" },
        }),
      ).toThrow()
      const goalID = `gol_${"a".repeat(26)}`
      const revisionID = `glr_${"b".repeat(26)}`
      for (const shadow of [
        {
          authorization: { type: "learner_acceptance" },
          operations: [{ type: "create", outcome: "Reject model authorization" }],
        },
        {
          operations: [
            {
              type: "create",
              outcome: "Reject legacy semantic proof",
              sourceExcerpt: "the model is not the source authority",
            },
          ],
        },
        {
          operations: [
            {
              type: "create",
              outcome: "Reject generated identities",
              goalID,
              revisionID,
            },
          ],
        },
        {
          operations: [
            {
              type: "create",
              outcome: "Reject field bases",
              fieldBases: { outcome: { type: "accepted" } },
            },
          ],
        },
        {
          operations: [
            {
              type: "create",
              outcome: "Reject derived target facts",
              target: {
                type: "instant",
                localDateTime: "2030-08-05T10:30:00",
                timeZone: { type: "iana", name: "Asia/Shanghai", releaseID: "model-release" },
                instant: 1,
                utcOffsetMinutes: 480,
              },
            },
          ],
        },
        {
          operations: [
            {
              type: "update",
              goalID,
              headRevisionID: revisionID,
              expectedVersion: 7,
              patch: { outcome: "Reject caller-owned versions" },
            },
          ],
        },
        {
          candidate: { exhaustive: true },
          confirmation: { approved: true },
          operations: [{ type: "create", outcome: "Reject retired workflow state" }],
        },
      ]) {
        expect(() => normalizeGoalsV2(shadow)).toThrow()
      }
      for (const shadow of [
        { course: { type: "new", title: "Reject generated schema version" }, schemaVersion: 1 },
        { course: { type: "new", title: "Reject generated Course ID", courseID: `crs_${"a".repeat(26)}` } },
        { course: { type: "new", title: "Reject generated time" }, time: 1 },
        { course: { type: "new", title: "Reject permission" }, permission: "allow" },
        { course: { type: "new", title: "Reject frontier" }, frontierSequence: 1 },
      ]) {
        expect(() => normalizeLearningBootstrap(shadow)).toThrow()
      }

      const agents = yield* Agent.Service
      const invalid = yield* preference!
        .execute(
          {
            action: "clear",
            authorization: { type: "direct_request_v2" },
          } as never,
          {
            sessionID: SessionID.descending(),
            messageID: MessageID.ascending(),
            agent: (yield* agents.defaultInfo()).name,
            abort: new AbortController().signal,
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(invalid)).toBe(true)
      if (Exit.isFailure(invalid)) expect(Cause.pretty(invalid.cause)).toContain("ToolInvalidArgumentsError")
      const invalidGoal = yield* goalCommand!
        .execute(
          {
            operations: [
              {
                type: "create",
                outcome: "Reject a hybrid current Goal input",
                authorization: { type: "learner_request" },
              },
            ],
          } as never,
          {
            sessionID: SessionID.descending(),
            messageID: MessageID.ascending(),
            agent: (yield* agents.defaultInfo()).name,
            abort: new AbortController().signal,
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(invalidGoal)).toBe(true)
      if (Exit.isFailure(invalidGoal)) expect(Cause.pretty(invalidGoal.cause)).toContain("ToolInvalidArgumentsError")
    }),
  )

  it.instance("preserves host preparation when the registry publishes learning commands", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: yield* agents.defaultInfo(),
      })

      for (const id of [
        "accept_course_view_revision",
        "representation.convert",
        "set_default_course_preference",
        "set_course_route_anchor",
        "update_retained_learning_steering",
        "update_learner_goals",
        "update_learning_course",
      ]) {
        const tool = tools.find((item) => item.id === id)
        expect(tool, `${id} should be published`).toBeDefined()
        expect(toolCallPreparation(tool!), `${id} should retain its host preparation`).toBeFunction()
      }
    }),
  )

  it.instance("intersects Course/navigation reads with restricted and delegated authority", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const agent = yield* agents.defaultInfo()
      const model = { providerID: ProviderV2.ID.opencode, modelID: ModelV2.ID.make("test"), agent }
      const defaults = (yield* registry.tools(model)).map((tool) => tool.id)
      expect(defaults).toContain("course_query")
      expect(defaults).toContain("learning_navigation_query")
      expect(defaults).toContain("learner_goal_query")
      expect(defaults).toContain("learning_material_query")
      expect(defaults).toContain("update_learning_course")

      const restricted = (yield* registry.tools({
        ...model,
        agent: {
          ...agent,
          permission: Permission.fromConfig({ "*": "deny", course_query: "allow" }),
        },
      })).map((tool) => tool.id)
      expect(restricted).toContain("course_query")
      expect(restricted).not.toContain("learning_navigation_query")
      expect(restricted).not.toContain("set_default_course_preference")
      expect(restricted).not.toContain("learner_goal_query")
      expect(restricted).not.toContain("learning_material_query")
      expect(restricted).not.toContain("update_learning_course")

      const goalReader = (yield* registry.tools({
        ...model,
        agent: {
          ...agent,
          permission: Permission.fromConfig({ "*": "deny", learner_goal_query: "allow" }),
        },
      })).map((tool) => tool.id)
      expect(goalReader).toContain("learner_goal_query")
      expect(goalReader).not.toContain("update_learner_goals")
      expect(goalReader).not.toContain("learning_material_query")
      expect(goalReader).not.toContain("update_learning_course")

      const bootstrapOnly = (yield* registry.tools({
        ...model,
        agent: {
          ...agent,
          permission: Permission.fromConfig({ "*": "deny", update_learning_course: "allow" }),
        },
      })).map((tool) => tool.id)
      expect(bootstrapOnly).toContain("update_learning_course")
      expect(bootstrapOnly).not.toContain("learning_material_query")
      expect(bootstrapOnly).not.toContain("course_query")

      const materialReader = (yield* registry.tools({
        ...model,
        agent: {
          ...agent,
          permission: Permission.fromConfig({ "*": "deny", learning_material_query: "allow" }),
        },
      })).map((tool) => tool.id)
      expect(materialReader).toContain("learning_material_query")
      expect(materialReader).not.toContain("update_learning_course")

      const delegated = (yield* registry.tools({
        ...model,
        authority: [
          {
            ruleset: Permission.fromConfig({ course_query: "allow" }),
            absence: "deny",
          },
        ],
      })).map((tool) => tool.id)
      expect(delegated).toContain("course_query")
      expect(delegated).not.toContain("learning_navigation_query")
      expect(delegated).not.toContain("set_default_course_preference")
      expect(delegated).not.toContain("learner_goal_query")
      expect(delegated).not.toContain("learning_material_query")
      expect(delegated).not.toContain("update_learning_course")

      const delegatedGoalReader = (yield* registry.tools({
        ...model,
        authority: [
          {
            ruleset: Permission.fromConfig({ learner_goal_query: "allow" }),
            absence: "deny",
          },
        ],
      })).map((tool) => tool.id)
      expect(delegatedGoalReader).toContain("learner_goal_query")
      expect(delegatedGoalReader).not.toContain("update_learner_goals")

      const delegatedBootstrap = (yield* registry.tools({
        ...model,
        authority: [
          {
            ruleset: Permission.fromConfig({
              learning_material_query: "allow",
              update_learning_course: "allow",
            }),
            absence: "deny",
          },
        ],
      })).map((tool) => tool.id)
      expect(delegatedBootstrap).toContain("learning_material_query")
      expect(delegatedBootstrap).toContain("update_learning_course")
      expect(delegatedBootstrap).not.toContain("course_query")
    }),
  )

  it.instance("returns exact paginated Course/navigation owner reads without writing", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const courses = yield* Course.Service
      const db = (yield* Database.Service).db
      const agent = yield* agents.defaultInfo()
      const selected = yield* courses.createCourse({ title: "Shared title" })
      const duplicate = yield* courses.createCourse({ title: "Shared title" })
      const third = yield* courses.createCourse({ title: "Third Course" })
      const withdrawn = yield* courses.createCourse({ title: "Withdrawn Course" })
      const view = yield* courses.createView({
        courseID: selected.id,
        name: "Selected path",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: {
          items: [
            { key: "root", title: "Selected path" },
            { key: "detail", title: "Selected detail", parentKey: "root" },
          ],
        },
      })
      yield* courses.select({
        courseID: selected.id,
        revisionID: view.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      yield* courses.withdrawCourse({
        courseID: withdrawn.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
      })
      const changesBefore = yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)
      const frontierBefore = yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`)
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent,
      })
      const courseQuery = tools.find((tool) => tool.id === "course_query")
      const navigationQuery = tools.find((tool) => tool.id === "learning_navigation_query")
      if (!courseQuery || !navigationQuery) return yield* Effect.die("Course/navigation read tools are unavailable")
      const context = {
        sessionID: SessionID.descending(),
        messageID: MessageID.ascending(),
        agent: agent.name,
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      } satisfies Tool.Context
      const first = JSON.parse((yield* courseQuery.execute({ action: "list", limit: 2 }, context)).output) as {
        items: Array<{
          id: string
          title: string
          disposition: "active" | "withdrawn"
          stateVersion: number
          withdrawalReason: "removed" | null
          workingSelection: { revisionID: string | null; version: number }
        }>
        cursor?: string
      }
      expect(first.items).toHaveLength(2)
      expect(first.cursor).toBeString()
      const second = JSON.parse(
        (yield* courseQuery.execute({ action: "list", limit: 2, cursor: first.cursor }, context)).output,
      ) as typeof first
      expect(new Set([...first.items, ...second.items].map((course) => course.id))).toEqual(
        new Set([selected.id, duplicate.id, third.id]),
      )
      expect([...first.items, ...second.items].filter((course) => course.title === "Shared title")).toHaveLength(2)
      expect([...first.items, ...second.items].find((course) => course.id === selected.id)).toMatchObject({
        disposition: "active",
        stateVersion: 0,
        withdrawalReason: null,
        workingSelection: { revisionID: view.revision.id, version: 1 },
      })
      const exactWithdrawn = JSON.parse(
        (yield* courseQuery.execute({ action: "get", courseID: withdrawn.id }, context)).output,
      )
      expect(exactWithdrawn.course).toMatchObject({
        id: withdrawn.id,
        disposition: "withdrawn",
        stateVersion: 1,
        withdrawalReason: "removed",
        workingSelection: { revisionID: null, version: 1 },
      })
      expect(
        Exit.isFailure(
          yield* courseQuery
            .execute({ action: "list", limit: 2, cursor: first.cursor, includeWithdrawn: true }, context)
            .pipe(Effect.exit),
        ),
      ).toBe(true)
      expect(JSON.parse((yield* navigationQuery.execute({ action: "current_default" }, context)).output)).toMatchObject(
        {
          current: {
            headID: null,
            version: 0,
            courseID: null,
            usability: { usable: false, cause: "absent" },
          },
        },
      )
      expect(
        JSON.parse(
          (yield* courseQuery.execute({ action: "list_views", courseID: selected.id, limit: 1 }, context)).output,
        ),
      ).toMatchObject({
        items: [{ id: view.view.id, name: "Selected path" }],
        omitted: false,
      })
      expect(
        JSON.parse(
          (yield* courseQuery.execute(
            { action: "get_revision", courseID: selected.id, viewID: view.view.id, revisionID: view.revision.id },
            context,
          )).output,
        ),
      ).toMatchObject({ value: { id: view.revision.id, viewID: view.view.id } })
      const firstItems = JSON.parse(
        (yield* courseQuery.execute(
          {
            action: "list_revision_items",
            courseID: selected.id,
            viewID: view.view.id,
            revisionID: view.revision.id,
            limit: 1,
          },
          context,
        )).output,
      ) as { items: Array<{ itemID: string; title: string }>; cursor?: string; omitted: boolean }
      expect(firstItems).toMatchObject({ items: [{ title: "Selected path" }], omitted: true })
      expect(firstItems.cursor).toBeString()
      expect(
        JSON.parse(
          (yield* courseQuery.execute(
            {
              action: "list_revision_items",
              courseID: selected.id,
              viewID: view.view.id,
              revisionID: view.revision.id,
              limit: 1,
              cursor: firstItems.cursor,
            },
            context,
          )).output,
        ),
      ).toMatchObject({ items: [{ title: "Selected detail" }], omitted: false })
      expect(
        JSON.parse(
          (yield* navigationQuery.execute({ action: "current_anchor", courseID: selected.id }, context)).output,
        ),
      ).toMatchObject({
        current: { headID: null, version: 0, target: null, usability: { usable: false, cause: "absent" } },
      })
      expect(yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)).toEqual(changesBefore)
      expect(yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`)).toEqual(frontierBefore)
      expect(
        yield* db.get(sql`
          SELECT
            (SELECT count(*) FROM learning_command_invocation) AS invocations,
            (SELECT count(*) FROM learner_default_course_disposition) AS dispositions,
            (SELECT count(*) FROM learner_default_course_capability_issue) AS issues,
            (SELECT count(*) FROM learner_default_course_capability_settlement) AS settlements,
            (SELECT count(*) FROM learner_default_course_transition) AS effects
        `),
      ).toEqual({ invocations: 0, dispositions: 0, issues: 0, settlements: 0, effects: 0 })
    }),
  )

  it.instance("returns bounded omission-truthful material owner reads without admission or observation writes", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const db = (yield* Database.Service).db
      const agent = yield* agents.defaultInfo()
      const query = (yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent,
      })).find((tool) => tool.id === "learning_material_query")
      if (!query) return yield* Effect.die("Learning-material read tool is unavailable")
      expect(
        (query.jsonSchema as { anyOf?: Array<{ additionalProperties?: boolean }> }).anyOf?.every(
          (branch) => branch.additionalProperties === false,
        ),
      ).toBe(true)
      const before = yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)
      const frontier = yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`)
      const context = {
        sessionID: SessionID.descending(),
        messageID: MessageID.ascending(),
        agent: agent.name,
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      } satisfies Tool.Context
      const artifacts = JSON.parse((yield* query.execute({ action: "list_artifacts", limit: 1 }, context)).output)
      expect(artifacts).toEqual({ items: [], omitted: false })
      const maps = JSON.parse(
        (yield* query.execute(
          {
            action: "list_maps",
            target: {
              type: "artifact",
              effectiveArtifactID: `art_${"a".repeat(26)}`,
              revisionID: `arv_${"b".repeat(26)}`,
              attribution: { type: "recorded" },
            },
            limit: 1,
          },
          context,
        )).output,
      )
      expect(maps).toEqual({ items: [], omitted: false })
      expect(yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)).toEqual(before)
      expect(yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`)).toEqual(frontier)
      expect(
        yield* db.get(sql`SELECT
          (SELECT count(*) FROM artifact) AS artifacts,
          (SELECT count(*) FROM representation_revision) AS representations,
          (SELECT count(*) FROM material_map) AS maps,
          (SELECT count(*) FROM material_course_alignment) AS alignments,
          (SELECT count(*) FROM learning_course_material_adoption) AS adoptions,
          (SELECT count(*) FROM learning_command_invocation) AS invocations`),
      ).toEqual({ artifacts: 0, representations: 0, maps: 0, alignments: 0, adoptions: 0, invocations: 0 })
    }),
  )

  it.instance("publishes a closed Goal command and performs bounded Goal owner reads without writing", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const db = (yield* Database.Service).db
      const agent = yield* agents.defaultInfo()
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent,
      })
      const command = tools.find((tool) => tool.id === "update_learner_goals")
      const query = tools.find((tool) => tool.id === "learner_goal_query")
      if (!command || !query) return yield* Effect.die("Goal command/read tools are unavailable")

      expect((command.jsonSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false)
      expect(
        (query.jsonSchema as { anyOf?: Array<{ additionalProperties?: boolean }> }).anyOf?.map(
          (branch) => branch.additionalProperties,
        ),
      ).toEqual([false, false, false, false])

      const before = yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)
      const frontier = yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`)
      const result = JSON.parse(
        (yield* query.execute(
          { action: "discover", limit: 3 },
          {
            sessionID: SessionID.descending(),
            messageID: MessageID.ascending(),
            agent: agent.name,
            abort: new AbortController().signal,
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )).output,
      )
      expect(result).toMatchObject({ page: { items: [], throughRevision: 0 } })
      expect(yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)).toEqual(before)
      expect(yield* db.all(sql`SELECT * FROM learning_shared_frontier ORDER BY sequence`)).toEqual(frontier)
      expect(
        yield* db.get(sql`
          SELECT
            (SELECT count(*) FROM learning_command_invocation) AS invocations,
            (SELECT count(*) FROM learner_goal_disposition_v2) AS dispositions,
            (SELECT count(*) FROM learner_goal_capability_issue_v2) AS issues,
            (SELECT count(*) FROM learner_goal_capability_settlement_v2) AS settlements,
            (SELECT count(*) FROM learner_goal_effect) AS effects
        `),
      ).toEqual({ invocations: 0, dispositions: 0, issues: 0, settlements: 0, effects: 0 })
      expect(LearnerGoal.PERMISSION_PATTERN).toBe("learner_home")
    }),
  )

  it.instance("derives one permission catalog from active tools", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const catalog = yield* registry.permissionCatalog()

      expect(catalog).toEqual([...catalog].sort())
      expect(catalog).toContain("accept_course_view_revision")
      expect(catalog).toContain("update_learner_goals")
      expect(catalog).toContain("content_mutation")
      expect(catalog).not.toContain("content_write")
      expect(catalog).not.toContain("invalid")
      expect(catalog.filter((permission) => permission === "edit")).toHaveLength(1)
    }),
  )

  it.instance("uses the catalog mapping to expose content_write only through content_mutation", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const agent = yield* agents.defaultInfo()
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: {
          ...agent,
          permission: Permission.fromConfig({ "*": "deny", content_mutation: "allow" }),
        },
      })

      expect(tools.map((tool) => tool.id)).toContain("content_write")
      expect(tools.map((tool) => tool.id)).not.toContain("content_read")
    }),
  )

  it.instance("does not expose task_status", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()

      expect(ids).not.toContain("task_status")
    }),
  )

  it.instance("hides capabilities absent from an explicit delegated authority", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: yield* agents.defaultInfo(),
        authority: [
          {
            ruleset: [{ permission: "read", pattern: "lesson.md", action: "allow" }],
            absence: "deny",
          },
        ],
      })

      expect(tools.map((tool) => tool.id)).toContain("read")
      expect(tools.map((tool) => tool.id)).not.toContain("task")
      expect(tools.map((tool) => tool.id)).not.toContain("bash")
    }),
  )

  it.instance("does not expose execute unless code mode is enabled", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()

      expect(ids).not.toContain("execute")
    }),
  )

  withCodeMode.instance("exposes execute when code mode is enabled", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const ids = yield* registry.ids()
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: yield* agents.defaultInfo(),
      })
      const execute = tools.find((tool) => tool.id === "execute")

      expect(ids).toContain("execute")
      expect(tools.map((tool) => tool.id)).toContain("execute")
      expect(execute?.description).toContain("tools.weather.current(input: {\n  city: string,\n})")
    }),
  )

  withCodeMode.instance("includes connected MCP permissions in the catalog", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect(yield* registry.permissionCatalog()).toContain("weather_current")
    }),
  )

  withEmptyCodeMode.instance("does not expose execute when code mode has no visible tools", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: yield* agents.defaultInfo(),
      })

      expect(tools.map((tool) => tool.id)).not.toContain("execute")
    }),
  )

  it.instance("exposes the active task wire schema without detached background input", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agent = yield* Agent.Service
      const repa = yield* agent.get("repa")
      if (!repa) throw new Error("repa agent not found")
      const task = (yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: repa,
      })).find((tool) => tool.id === "task")

      if (!task) throw new Error("task tool not found")
      expect(
        (ToolJsonSchema.fromTool(task).properties as Record<string, unknown> | undefined)?.background,
      ).toBeUndefined()
    }),
  )

  it.instance("loads tools from .repa/tool (singular)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const opencode = path.join(test.directory, ".repa")
      const tool = path.join(opencode, "tool")
      yield* Effect.promise(() => fs.mkdir(tool, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tool, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        ),
      )
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("hello")
    }),
  )

  it.instance("ignores non-tool exports in .repa/tool files", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const tool = path.join(test.directory, ".repa", "tool")
      yield* Effect.promise(() => fs.mkdir(tool, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tool, "mixed.ts"),
          [
            "export const helper = 'not a tool'",
            "export default {",
            "  description: 'mixed tool',",
            "  args: {},",
            "  execute: async () => 'ok',",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("mixed")
      expect(ids).not.toContain("mixed_helper")
    }),
  )

  // Regression for #27451 / #27630: a custom tool that omits `args` must not
  // crash registry initialization with
  // `Object.entries requires that input parameter not be null or undefined`.
  // Pre-1.14.49 the code path was `z.object(def.args)`, and `z.object(undefined)`
  // silently produced an empty schema — so the tool registered as no-args.
  // Preserve that tolerance.
  it.instance("tolerates a custom tool exporting null/undefined args (no-args fallback)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const tool = path.join(test.directory, ".repa", "tool")
      yield* Effect.promise(() => fs.mkdir(tool, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tool, "noargs.ts"),
          [
            "export default {",
            "  description: 'tool with no args',",
            "  args: undefined,",
            "  execute: async () => 'ok',",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      // Built-in tools must still load — a single malformed custom tool must
      // not poison the whole registry.
      expect(ids).toContain("read")
      const loaded = (yield* registry.all()).find((t) => t.id === "noargs")
      if (!loaded) throw new Error("noargs tool was not loaded")
      expect(loaded.jsonSchema).toMatchObject({ type: "object", properties: {} })
    }),
  )

  // Same regression, plugin entry point. The original reports (#27451, #27630)
  // came in through `plugin.list()` — `oh-my-opencode` was registering a tool
  // with `args: undefined` and crashing every message submit. The file-scan
  // and plugin-list loops both funnel through `fromPlugin`, but covering both
  // entry points means a future refactor that splits them won't silently lose
  // protection.
  withBrokenPlugin.instance("tolerates a plugin tool registered with null/undefined args", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("read")
      expect(ids).toContain("broken_plugin_tool")
    }),
  )

  it.instance("loads tools from .repa/tools (plural)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const opencode = path.join(test.directory, ".repa")
      const tools = path.join(opencode, "tools")
      yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tools, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        ),
      )
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("hello")
    }),
  )

  it.instance("loads Zod-schema custom tools with JSON Schema and validation", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const customTools = path.join(test.directory, ".repa", "tools")
      const pluginTool = pathToFileURL(path.resolve(import.meta.dir, "../../../plugin/src/tool.ts")).href
      yield* Effect.promise(() => fs.mkdir(customTools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(customTools, "sql.ts"),
          [
            `import { tool } from ${JSON.stringify(pluginTool)}`,
            "export default tool({",
            "  description: 'query database',",
            "  args: { query: tool.schema.string().describe('SQL query to execute') },",
            "  execute: async ({ query }) => query,",
            "})",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "sql")
      if (!loaded) throw new Error("custom sql tool was not loaded")
      expect(loaded?.jsonSchema).toMatchObject({
        type: "object",
        properties: {
          query: { type: "string", description: "SQL query to execute" },
        },
        required: ["query"],
      })
      expect(Result.isSuccess(Schema.decodeUnknownResult(loaded.parameters)({ query: "select 1" }))).toBe(true)
      expect(Result.isSuccess(Schema.decodeUnknownResult(loaded.parameters)({}))).toBe(false)

      const agents = yield* Agent.Service
      const promptTools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: yield* agents.defaultInfo(),
      })
      const promptTool = promptTools.find((tool) => tool.id === "sql")
      if (!promptTool) throw new Error("custom sql tool was not returned for prompts")
      expect(ToolJsonSchema.fromTool(promptTool)).toMatchObject({
        properties: {
          query: { type: "string", description: "SQL query to execute" },
        },
        required: ["query"],
      })
    }),
  )

  it.instance(
    "preserves Zod arg descriptions from older config-scoped plugin packages",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const opencode = path.join(test.directory, ".repa")
        const customTools = path.join(opencode, "tools")
        const plugin = path.join(opencode, "node_modules", "@opencode-ai", "plugin")
        yield* Effect.promise(() => fs.mkdir(path.join(plugin, "dist"), { recursive: true }))
        yield* Effect.promise(() => fs.mkdir(customTools, { recursive: true }))
        yield* Effect.promise(() =>
          fs.cp(path.dirname(fileURLToPath(import.meta.resolve("zod"))), path.join(opencode, "node_modules", "zod"), {
            dereference: true,
            recursive: true,
          }),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(plugin, "package.json"),
            JSON.stringify({ name: "@opencode-ai/plugin", type: "module", exports: { ".": "./dist/index.js" } }),
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(plugin, "dist", "index.js"),
            [
              "import { z } from 'zod'",
              "export function tool(input) {",
              "  return input",
              "}",
              "tool.schema = z",
              "",
            ].join("\n"),
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(customTools, "addition.ts"),
            [
              'import { tool } from "@opencode-ai/plugin"',
              "export default tool({",
              "  description: 'Use this tool to add two numbers and return their sum.',",
              "  args: {",
              "    left: tool.schema.number().describe('The first number to add'),",
              "    right: tool.schema.number().describe('The second number to add'),",
              "  },",
              "  execute: async (args) => `${args.left} + ${args.right} = ${args.left + args.right}`,",
              "})",
              "",
            ].join("\n"),
          ),
        )

        const registry = yield* ToolRegistry.Service
        const loaded = (yield* registry.all()).find((tool) => tool.id === "addition")
        if (!loaded) throw new Error("custom addition tool was not loaded")

        expect(ToolJsonSchema.fromTool(loaded)).toMatchObject({
          properties: {
            left: { type: "number", description: "The first number to add" },
            right: { type: "number", description: "The second number to add" },
          },
        })
      }),
    20_000,
  )

  it.instance("preserves attachments from structured custom tool results", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const customTools = path.join(test.directory, ".repa", "tools")
      const pluginTool = pathToFileURL(path.resolve(import.meta.dir, "../../../plugin/src/tool.ts")).href
      yield* Effect.promise(() => fs.mkdir(customTools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(customTools, "image.ts"),
          [
            `import { tool } from ${JSON.stringify(pluginTool)}`,
            "export default tool({",
            "  description: 'image tool',",
            "  args: {},",
            "  execute: async () => ({",
            "    output: 'here is an image',",
            "    attachments: [{ type: 'file', mime: 'image/png', filename: 'picture.png', url: 'data:image/png;base64,AAAA' }],",
            "  }),",
            "})",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "image")
      if (!loaded) throw new Error("custom image tool was not loaded")
      const agents = yield* Agent.Service
      const result = yield* loaded.execute({}, {
        sessionID: SessionID.make("ses_test"),
        messageID: MessageID.make("msg_test"),
        agent: (yield* agents.defaultInfo()).name,
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      } satisfies Tool.Context)

      expect(result.output).toBe("here is an image")
      expect(result.attachments).toEqual([
        { type: "file", mime: "image/png", filename: "picture.png", url: "data:image/png;base64,AAAA" },
      ])
    }),
  )

  it.instance("loads legacy JSON-schema-shaped custom tools with wire schema", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const tools = path.join(test.directory, ".repa", "tools")
      yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tools, "legacy.ts"),
          [
            "export default {",
            "  description: 'legacy schema tool',",
            "  args: { text: { type: 'string', description: 'Text to render' } },",
            "  execute: async ({ text }) => text,",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "legacy")
      if (!loaded) throw new Error("legacy custom tool was not loaded")
      expect(ToolJsonSchema.fromTool(loaded)).toMatchObject({
        type: "object",
        properties: {
          text: { type: "string", description: "Text to render" },
        },
        required: ["text"],
      })
    }),
  )

  it.instance("loads tools with external dependencies without crashing", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const opencode = path.join(test.directory, ".repa")
      const tools = path.join(opencode, "tools")
      yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(opencode, "package.json"),
          JSON.stringify({
            name: "custom-tools",
            dependencies: {
              "@opencode-ai/plugin": "^0.0.0",
              cowsay: "^1.6.0",
            },
          }),
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(opencode, "package-lock.json"),
          JSON.stringify({
            name: "custom-tools",
            lockfileVersion: 3,
            packages: {
              "": {
                dependencies: {
                  "@opencode-ai/plugin": "^0.0.0",
                  cowsay: "^1.6.0",
                },
              },
            },
          }),
        ),
      )

      const cowsay = path.join(opencode, "node_modules", "cowsay")
      yield* Effect.promise(() => fs.mkdir(cowsay, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(cowsay, "package.json"),
          JSON.stringify({
            name: "cowsay",
            type: "module",
            exports: "./index.js",
          }),
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(cowsay, "index.js"),
          ["export function say({ text }) {", "  return `moo ${text}`", "}", ""].join("\n"),
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tools, "cowsay.ts"),
          [
            "import { say } from 'cowsay'",
            "export default {",
            "  description: 'tool that imports cowsay at top level',",
            "  args: { text: { type: 'string' } },",
            "  execute: async ({ text }: { text: string }) => {",
            "    return say({ text })",
            "  },",
            "}",
            "",
          ].join("\n"),
        ),
      )
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("cowsay")
    }),
  )
})
