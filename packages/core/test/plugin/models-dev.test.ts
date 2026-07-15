import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Catalog } from "@opencode-ai/core/catalog"
import { Config } from "@opencode-ai/core/config"
import { ConfigProviderPlugin } from "@opencode-ai/core/config/plugin/provider"
import { Integration } from "@opencode-ai/core/integration"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Location } from "@opencode-ai/core/location"
import { ModelV2 } from "@opencode-ai/core/model"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { ModelsDevPlugin } from "@opencode-ai/core/plugin/models-dev"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"
import { catalogHost, host, integrationHost } from "./host"

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make(import.meta.dir) })),
)
const layer = AppNodeBuilder.build(LayerNode.group([Catalog.node, Integration.node, EventV2.node]), [
  [Location.node, locationLayer],
])
const it = testEffect(layer)

describe("ModelsDevPlugin", () => {
  it.effect("projects models.dev modes as separate models instead of variants", () =>
    Effect.gen(function* () {
      const integrations = yield* Integration.Service
      const catalog = yield* Catalog.Service
      const models = ModelsDev.Service.of({
        get: () =>
          Effect.succeed({
            acme: {
              id: "acme",
              name: "Acme",
              env: [],
              npm: "@ai-sdk/openai-compatible",
              api: "https://api.acme.test/v1",
              models: {
                "gpt-5.4": {
                  id: "gpt-5.4",
                  name: "GPT-5.4",
                  family: "gpt",
                  release_date: "2026-01-01",
                  attachment: false,
                  reasoning: true,
                  temperature: true,
                  tool_call: true,
                  cost: {
                    input: 2.5,
                    output: 15,
                    tiers: [
                      {
                        tier: { type: "context", size: 272_000 },
                        input: 3,
                        output: 18,
                        cache_read: 0.25,
                      },
                    ],
                    context_over_200k: { input: 5, output: 22.5, cache_read: 0.5 },
                  },
                  limit: { context: 1_050_000, input: 922_000, output: 128_000 },
                  experimental: {
                    modes: {
                      fast: {
                        cost: { input: 5, output: 30, cache_read: 0.5 },
                        provider: {
                          headers: { "x-mode": "fast" },
                          body: { service_tier: "priority" },
                        },
                      },
                    },
                  },
                },
              },
            },
          } satisfies Record<string, ModelsDev.Provider>),
        refresh: () => Effect.void,
      })

      yield* ModelsDevPlugin.effect(
        host({
          catalog: catalogHost(catalog),
          integration: integrationHost(integrations),
        }),
      ).pipe(Effect.provideService(ModelsDev.Service, models))

      const providerID = ProviderV2.ID.make("acme")
      const base = yield* catalog.model.get(providerID, ModelV2.ID.make("gpt-5.4"))
      const fast = yield* catalog.model.get(providerID, ModelV2.ID.make("gpt-5.4-fast"))

      expect(base?.variants).toEqual([])
      expect(base?.request.body).toEqual({})
      expect(fast).toMatchObject({
        id: "gpt-5.4-fast",
        providerID: "acme",
        name: "GPT-5.4 Fast",
        api: { id: "gpt-5.4" },
        request: {
          headers: { "x-mode": "fast" },
          body: { service_tier: "priority" },
        },
        variants: [],
      })
      expect(fast?.cost).toEqual([
        { input: 5, output: 30, cache: { read: 0.5, write: 0 } },
        {
          tier: { type: "context", size: 272_000 },
          input: 3,
          output: 18,
          cache: { read: 0.25, write: 0 },
        },
        {
          tier: { type: "context", size: 200_000 },
          input: 5,
          output: 22.5,
          cache: { read: 0.5, write: 0 },
        },
      ])
    }),
  )

  it.effect("registers key methods for providers with environment variables", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = {
          path: Flag.REPA_MODELS_PATH,
          disabled: Flag.REPA_DISABLE_MODELS_FETCH,
        }
        Flag.REPA_MODELS_PATH = path.join(import.meta.dir, "fixtures", "models-dev.json")
        Flag.REPA_DISABLE_MODELS_FETCH = true
        return previous
      }),
      () =>
        Effect.gen(function* () {
          const integrations = yield* Integration.Service
          const catalog = yield* Catalog.Service
          yield* ModelsDevPlugin.effect(
            host({
              catalog: catalogHost(catalog),
              integration: integrationHost(integrations),
            }),
          )
          expect(yield* integrations.list()).toEqual([
            new Integration.Info({
              id: Integration.ID.make("acme"),
              name: "Acme",
              methods: [
                { type: "key" },
                {
                  type: "env",
                  names: ["ACME_API_KEY"],
                },
              ],
              connections: [],
            }),
          ])
        }).pipe(Effect.provide(AppNodeBuilder.build(ModelsDev.node))),
      (previous) =>
        Effect.sync(() => {
          Flag.REPA_MODELS_PATH = previous.path
          Flag.REPA_DISABLE_MODELS_FETCH = previous.disabled
        }),
    ),
  )

  it.effect("filters exact inherited built-ins before ordinary configuration overlays", () =>
    Effect.gen(function* () {
      const integrations = yield* Integration.Service
      const catalog = yield* Catalog.Service
      const pluginHost = host({
        catalog: catalogHost(catalog),
        integration: integrationHost(integrations),
      })
      const models = ModelsDev.Service.of({
        get: () =>
          Effect.succeed({
            opencode: {
              id: "opencode",
              name: "OpenCode Zen",
              env: ["OPENCODE_API_KEY"],
              npm: "@ai-sdk/openai-compatible",
              api: "https://api.opencode.test/v1",
              models: {},
            },
            "opencode-go": {
              id: "opencode-go",
              name: "OpenCode Go",
              env: ["OPENCODE_API_KEY"],
              npm: "@ai-sdk/openai-compatible",
              api: "https://api.opencode.test/v1",
              models: {},
            },
            "ordinary-control": {
              id: "ordinary-control",
              name: "Raw Control",
              env: ["CONTROL_API_KEY"],
              npm: "@ai-sdk/openai-compatible",
              api: "https://api.control.test/v1",
              models: {},
            },
          } satisfies Record<string, ModelsDev.Provider>),
        refresh: () => Effect.void,
      })

      yield* ModelsDevPlugin.effect(pluginHost).pipe(Effect.provideService(ModelsDev.Service, models))

      expect(yield* catalog.provider.get(ProviderV2.ID.make("opencode"))).toBeUndefined()
      expect(yield* catalog.provider.get(ProviderV2.ID.make("opencode-go"))).toBeUndefined()
      expect(yield* integrations.get(Integration.ID.make("opencode"))).toBeUndefined()
      expect(yield* integrations.get(Integration.ID.make("opencode-go"))).toBeUndefined()
      expect((yield* catalog.provider.get(ProviderV2.ID.make("ordinary-control")))?.name).toBe("Raw Control")

      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: Schema.decodeUnknownSync(Config.Info)({
                providers: {
                  opencode: {
                    name: "Configured OpenCode ID",
                    env: ["CUSTOM_OPENCODE_KEY"],
                    api: {
                      type: "aisdk",
                      package: "@ai-sdk/openai-compatible",
                      url: "https://configured-opencode.test/v1",
                    },
                  },
                  "opencode-local": {
                    name: "Configured Prefix ID",
                    env: ["LOCAL_API_KEY"],
                    api: {
                      type: "aisdk",
                      package: "@ai-sdk/openai-compatible",
                      url: "https://configured-prefix.test/v1",
                    },
                  },
                  "ordinary-control": { name: "Configured Control" },
                },
              }),
            }),
          ]),
      })
      yield* ConfigProviderPlugin.Plugin.effect(pluginHost).pipe(Effect.provideService(Config.Service, config))

      expect((yield* catalog.provider.get(ProviderV2.ID.make("opencode")))?.name).toBe("Configured OpenCode ID")
      expect((yield* catalog.provider.get(ProviderV2.ID.make("opencode-local")))?.name).toBe("Configured Prefix ID")
      expect((yield* catalog.provider.get(ProviderV2.ID.make("ordinary-control")))?.name).toBe("Configured Control")
      expect(yield* catalog.provider.get(ProviderV2.ID.make("opencode-go"))).toBeUndefined()
      expect((yield* integrations.get(Integration.ID.make("opencode")))?.methods).toContainEqual({
        type: "env",
        names: ["CUSTOM_OPENCODE_KEY"],
      })
    }),
  )
})
