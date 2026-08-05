import { ProviderWire } from "@/provider/wire"
import { LearningContext } from "@opencode-ai/core/learning-context"
import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { expect, test } from "bun:test"
import { createAzure } from "@ai-sdk/azure"
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createGateway } from "@ai-sdk/gateway"
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"

const certificate = {
  sourcePackage: "@ai-sdk/openai",
  sourceVersion: "3.0.53",
  projector: "openai-responses",
  projectorVersion: 1,
  promptFields: ["input", "instructions"],
  publicQuery: ["api-version"],
  credentialQuery: ["api-key"],
  bodyCredentials: ["openai_hosted_mcp"],
  compilerAuth: "api_key",
  terminalRoutes: [],
} as const satisfies ProviderWire.Certificate

function body(
  input: {
    description?: string
    parallel?: boolean
    max?: number
    prompt?: string
  } = {},
) {
  return {
    model: "provider-model",
    input: [{ role: "user", content: input.prompt ?? "teach" }],
    tools: [
      {
        type: "function",
        name: "course_query",
        description: input.description ?? "Read exact Course owner state",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        strict: true,
      },
    ],
    tool_choice: "auto",
    parallel_tool_calls: input.parallel ?? true,
    max_tool_calls: input.max ?? 2,
  }
}

function compiled(
  input: {
    body?: ReturnType<typeof body>
    apiVersion?: string
    apiKey?: string
    host?: string
  } = {},
) {
  return ProviderWire.normalize({
    certificate,
    method: "POST",
    url: `https://${input.host ?? "provider.test"}/v1/responses?api-version=${input.apiVersion ?? "2026-08-04"}&api-key=${input.apiKey ?? "secret-a"}`,
    body: input.body ?? body(),
  })
}

function result() {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
    request: { body: undefined },
    response: { headers: {} },
  }
}

function language(send: () => Promise<Response>, request: () => { url: string; body: unknown }) {
  return {
    specificationVersion: "v3",
    provider: "openai.responses",
    modelId: "provider-model",
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error("not used")
    },
    doStream: async () => {
      const value = request()
      await ProviderWire.interceptFetch(value.url, { method: "POST", body: JSON.stringify(value.body) }, send)
      return result()
    },
  } as unknown as LanguageModelV3
}

test("provider surface binds complete controls and exact non-secret route values", async () => {
  const first = await compiled()
  const projected = ProviderWire.projectCertified(certificate, first, ["course_query"])
  const parallel = ProviderWire.projectCertified(certificate, await compiled({ body: body({ parallel: false }) }), [
    "course_query",
  ])
  const max = ProviderWire.projectCertified(certificate, await compiled({ body: body({ max: 3 }) }), ["course_query"])
  const query = ProviderWire.projectCertified(certificate, await compiled({ apiVersion: "DIFFERENT" }), [
    "course_query",
  ])
  const credential = ProviderWire.projectCertified(certificate, await compiled({ apiKey: "secret-b" }), [
    "course_query",
  ])
  const { tools: _omittedTools, ...withoutTools } = body()
  const omitted = ProviderWire.projectCertified(
    certificate,
    await ProviderWire.normalize({
      certificate,
      method: "POST",
      url: "https://provider.test/v1/responses?api-version=2026-08-04&api-key=secret-a",
      body: { ...withoutTools, tool_choice: "none" },
    }),
    ["course_query"],
  )

  expect(parallel.definitions).toEqual(projected.definitions)
  expect(max.toolChoice).toEqual(projected.toolChoice)
  expect(parallel.providerVisible).not.toEqual(projected.providerVisible)
  expect(max.providerVisible).not.toEqual(projected.providerVisible)
  expect(query.providerVisible).not.toEqual(projected.providerVisible)
  expect(credential).toEqual(projected)
  expect(omitted.definitions).toEqual([])
  expect(omitted.toolChoice).toEqual({
    state: "present",
    value: [{ path: ["tool_choice"], value: "none" }],
  })
  expect(JSON.stringify(projected)).not.toContain("secret-a")
  expect(projected.transport.endpoint.query).toContainEqual({
    key: "api-version",
    state: "value",
    value: "2026-08-04",
  })
  expect(projected.transport.endpoint.query.some((item) => item.key === "api-key")).toBe(false)

  const unknown = ProviderWire.normalize({
    certificate,
    method: "POST",
    url: "https://provider.test/v1/responses?unknown=value",
    body: body(),
  })
  await expect(unknown).rejects.toThrow("outside its certificate")
})

test("actual Azure Responses api-version query is exact and credential-free", async () => {
  const azureCertificate = {
    sourcePackage: "@ai-sdk/azure",
    sourceVersion: "3.0.49",
    projector: "azure-openai",
    projectorVersion: 1,
    promptFields: ["input", "instructions", "messages"],
    publicQuery: ["api-version"],
    credentialQuery: ["api-key"],
    bodyCredentials: ["openai_hosted_mcp"],
    compilerAuth: "api_key",
    terminalRoutes: [],
  } as const satisfies ProviderWire.Certificate
  let sends = 0
  const capture = async (apiVersion: string) => {
    const make = () =>
      createAzure({
        apiKey: "secret-azure-key",
        apiVersion,
        baseURL: "https://resource.openai.azure.test/openai",
        fetch: Object.assign(
          (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
            ProviderWire.interceptFetch(input, init, async () => {
              sends++
              return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
            }),
          { preconnect: fetch.preconnect },
        ),
      }).responses("deployment")
    const language = ProviderWire.certify(make(), make(), azureCertificate)
    return ProviderWire.project(
      language,
      await ProviderWire.capture(language, {
        prompt: [{ role: "user", content: [{ type: "text", text: "Continue." }] }],
      }),
      [],
    )
  }

  const first = await capture("2026-08-01-preview")
  const changed = await capture("2026-08-02-preview")
  expect(sends).toBe(0)
  expect(first.transport.endpoint.query).toEqual([{ key: "api-version", state: "value", value: "2026-08-01-preview" }])
  expect(changed.transport.endpoint.query).toEqual([
    { key: "api-version", state: "value", value: "2026-08-02-preview" },
  ])
  expect(changed.providerVisible).not.toEqual(first.providerVisible)
  expect(JSON.stringify(first)).not.toContain("secret-azure-key")
})

test("certified compile never sends and verified open rejects every request drift before send", async () => {
  let sends = 0
  let current = {
    url: "https://provider.test/v1/responses?api-version=2026-08-04&api-key=secret-a",
    body: body(),
  }
  const target = ProviderWire.certify(
    language(
      async () => {
        sends++
        return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
      },
      () => current,
    ),
    language(
      async () => new Response(),
      () => current,
    ),
    certificate,
  )
  const expected = await ProviderWire.capture(target, {} as LanguageModelV3CallOptions)
  expect(sends).toBe(0)

  await ProviderWire.verified(target, expected).doStream({} as LanguageModelV3CallOptions)
  expect(sends).toBe(1)

  current = { ...current, body: body({ description: "Read exact Course owner state." }) }
  await expect(ProviderWire.verified(target, expected).doStream({} as LanguageModelV3CallOptions)).rejects.toThrow(
    "differs from the admitted Gate 18 compiled operation",
  )
  expect(sends).toBe(1)

  current = { ...current, body: body(), url: current.url.replace("2026-08-04", "DIFFERENT") }
  await expect(ProviderWire.verified(target, expected).doStream({} as LanguageModelV3CallOptions)).rejects.toThrow(
    "differs from the admitted Gate 18 compiled operation",
  )
  expect(sends).toBe(1)
})

test("uncertified and zero-interception providers expose no pre-admission call or provider stream", async () => {
  let calls = 0
  let pulls = 0
  const untrusted = {
    specificationVersion: "v3",
    provider: "dynamic.fixture",
    modelId: "dynamic",
    doStream: async () => {
      calls++
      return result()
    },
  } as unknown as LanguageModelV3
  await expect(ProviderWire.capture(untrusted, {} as LanguageModelV3CallOptions)).rejects.toThrow(
    "refusing to invoke it before Gate 18 admission",
  )
  expect(calls).toBe(0)

  const zeroRuntime = {
    specificationVersion: "v3",
    provider: "certified.fixture",
    modelId: "zero-interception",
    doStream: async () => {
      calls++
      return {
        ...result(),
        stream: new ReadableStream(
          {
            pull(controller) {
              pulls++
              controller.close()
            },
          },
          { highWaterMark: 0 },
        ),
      }
    },
  } as unknown as LanguageModelV3
  const zeroCompiler = language(
    async () => new Response(),
    () => ({ url: "https://provider.test/v1/responses", body: body() }),
  )
  Object.defineProperties(zeroCompiler, {
    provider: { value: zeroRuntime.provider },
    modelId: { value: zeroRuntime.modelId },
  })
  const zero = ProviderWire.certify(zeroRuntime, zeroCompiler, certificate)
  const expected = await compiled()
  await expect(ProviderWire.verified(zero, expected).doStream({} as LanguageModelV3CallOptions)).rejects.toThrow(
    "without exactly one verified terminal request",
  )
  expect(calls).toBe(1)
  expect(pulls).toBe(0)
})

test("Gateway header and BYOK credential rotation is absent from durable surface and semantic capacity value", async () => {
  const gatewayCertificate = {
    sourcePackage: "@ai-sdk/gateway",
    sourceVersion: "3.0.104",
    projector: "ai-gateway",
    projectorVersion: 1,
    promptFields: ["prompt"],
    publicQuery: [],
    credentialQuery: [],
    bodyCredentials: ["gateway_call_options", "openai_hosted_mcp"],
    compilerAuth: "gateway_api_key",
    terminalRoutes: [],
  } as const satisfies ProviderWire.Certificate
  let sends = 0
  const make = () =>
    createGateway({
      apiKey: "inert-gateway-key",
      baseURL: "https://gateway.test/v1/ai",
      fetch: Object.assign(
        (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          ProviderWire.interceptFetch(input, init, async () => {
            sends++
            return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
          }),
        { preconnect: fetch.preconnect },
      ),
    }).languageModel("openai/gpt-5-mini")
  const target = ProviderWire.certify(make(), make(), gatewayCertificate)
  const options = (secret: string) =>
    ({
      prompt: [{ role: "user", content: [{ type: "text", text: "Continue." }] }],
      headers: { authorization: `Bearer ${secret}`, "x-api-key": secret },
      providerOptions: {
        gateway: {
          only: ["openai"],
          order: ["openai", "anthropic"],
          models: ["openai/gpt-5-mini"],
          byok: { openai: [{ apiKey: secret }] },
        },
      },
      tools: [
        {
          type: "provider",
          id: "openai.mcp",
          name: "private_library",
          args: {
            serverLabel: "private-library",
            serverUrl: "https://mcp.example.test",
            authorization: `Bearer ${secret}`,
            headers: { "x-api-key": secret },
            allowedTools: ["search"],
          },
        },
      ],
    }) as unknown as LanguageModelV3CallOptions

  const firstRaw = await ProviderWire.capture(target, options("gateway-secret-a"))
  const secondRaw = await ProviderWire.capture(target, options("gateway-secret-b-longer"))
  const first = ProviderWire.semantic(target, firstRaw)
  const second = ProviderWire.semantic(target, secondRaw)
  const projected = ProviderWire.project(target, firstRaw, [])

  expect(sends).toBe(0)
  expect(first).toEqual(second)
  expect(JSON.stringify(first)).not.toContain("gateway-secret")
  expect(JSON.stringify(projected)).not.toContain("gateway-secret")
  expect(JSON.stringify(projected)).toContain('"only":["openai"]')
  expect(JSON.stringify(projected)).toContain('"models":["openai/gpt-5-mini"]')
  expect(JSON.stringify(projected)).toContain('"serverLabel":"private-library"')
  expect(JSON.stringify(projected)).toContain('"allowedTools":["search"]')
  expect(JSON.stringify(projected)).toContain('"kind":"headers"')
  expect(JSON.stringify(projected)).toContain('"kind":"credential"')
})

test("OpenAI hosted MCP credentials are excluded without deleting same-named function schema properties", async () => {
  const request = await ProviderWire.normalize({
    certificate,
    method: "POST",
    url: "https://provider.test/v1/responses",
    body: {
      model: "provider-model",
      input: [{ role: "user", content: "teach" }],
      tools: [
        {
          type: "mcp",
          server_label: "private-library",
          server_url: "https://mcp.example.test",
          authorization: "Bearer hosted-mcp-secret",
          headers: { "x-api-key": "hosted-mcp-secret" },
          allowed_tools: ["search"],
          require_approval: "always",
        },
        {
          type: "function",
          name: "course_query",
          description: "Read exact Course owner state",
          parameters: {
            type: "object",
            properties: {
              authorization: { type: "string" },
              headers: { type: "object" },
            },
          },
        },
      ],
      tool_choice: "auto",
    },
  })
  const projected = ProviderWire.projectCertified(certificate, request, ["course_query"])
  const payload = JSON.stringify(projected)

  expect(payload).not.toContain("hosted-mcp-secret")
  expect(payload).toContain('"server_url":"https://mcp.example.test"')
  expect(payload).toContain('"authorization":{"type":"string"}')
  expect(payload).toContain('"headers":{"type":"object"}')
})

test("MCP-shaped schema defaults remain exact surface and reject one-byte drift before transport", async () => {
  const schema = (marker: string, large = false) => ({
    type: "object",
    properties: {
      source: {
        type: "object",
        default: {
          type: "mcp",
          authorization: `ordinary-${marker}`,
          headers: { mode: large ? `${marker}:${"x".repeat(40_000)}` : marker },
        },
        examples: [{ type: "mcp", authorization: `example-${marker}`, headers: { mode: marker } }],
        const: { type: "mcp", authorization: `const-${marker}`, headers: { mode: marker } },
      },
    },
  })
  const requestBody = (marker: string, large = false) => ({
    model: "provider-model",
    input: [{ role: "user", content: "teach" }],
    tools: [
      {
        type: "function",
        name: "course_query",
        description: "Read exact Course owner state",
        parameters: schema(marker, large),
      },
    ],
    tool_choice: "auto",
  })
  let sends = 0
  let current = requestBody("A", true)
  const target = ProviderWire.certify(
    language(
      async () => {
        sends++
        return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
      },
      () => ({ url: "https://provider.test/v1/responses", body: current }),
    ),
    language(
      async () => new Response(),
      () => ({ url: "https://provider.test/v1/responses", body: current }),
    ),
    certificate,
  )
  const expected = await ProviderWire.capture(target, {} as LanguageModelV3CallOptions)
  const first = ProviderWire.project(target, expected, ["course_query"])
  const firstDefinition = first.definitions.find((definition) => definition.id === "course_query")

  expect(firstDefinition).toBeDefined()
  expect(LearningContext.utf8Bytes(LearningContext.canonicalJson(firstDefinition!.value))).toBeGreaterThan(40_000)
  expect(JSON.stringify(firstDefinition)).toContain("ordinary-A")
  expect(JSON.stringify(firstDefinition)).toContain("example-A")
  expect(JSON.stringify(firstDefinition)).toContain("const-A")

  current = requestBody("B", true)
  const changed = ProviderWire.project(target, await ProviderWire.capture(target, {} as LanguageModelV3CallOptions), [
    "course_query",
  ])
  expect(changed.definitions).not.toEqual(first.definitions)
  expect(changed.providerVisible).not.toEqual(first.providerVisible)
  await expect(ProviderWire.verified(target, expected).doStream({} as LanguageModelV3CallOptions)).rejects.toThrow(
    "differs from the admitted Gate 18 compiled operation",
  )
  expect(sends).toBe(0)
})

test("Bedrock credential callbacks remain dormant during compile and run only after verified admission", async () => {
  const bedrockCertificate = {
    sourcePackage: "@ai-sdk/amazon-bedrock",
    sourceVersion: "4.0.112",
    projector: "bedrock",
    projectorVersion: 1,
    promptFields: ["messages", "system"],
    publicQuery: [],
    credentialQuery: [],
    bodyCredentials: [],
    compilerAuth: "bedrock_bearer",
    terminalRoutes: [],
  } as const satisfies ProviderWire.Certificate
  let credentials = 0
  let sends = 0
  const terminal = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      ProviderWire.interceptFetch(input, init, async () => {
        sends++
        return new Response(new Uint8Array(), { status: 200 })
      }),
    { preconnect: fetch.preconnect },
  )
  const runtime = createAmazonBedrock({
    region: "us-east-1",
    baseURL: "https://bedrock.test",
    credentialProvider: async () => {
      credentials++
      return { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret-runtime-key" }
    },
    fetch: terminal,
  }).languageModel("anthropic.claude-3-haiku")
  const compiler = createAmazonBedrock({
    region: "us-east-1",
    baseURL: "https://bedrock.test",
    apiKey: "inert-compiler-key",
    fetch: terminal,
  }).languageModel("anthropic.claude-3-haiku")
  const target = ProviderWire.certify(runtime, compiler, bedrockCertificate)
  const options = {
    prompt: [{ role: "user", content: [{ type: "text", text: "Continue." }] }],
  } as LanguageModelV3CallOptions

  const expected = await ProviderWire.capture(target, options)
  expect(credentials).toBe(0)
  expect(sends).toBe(0)

  await ProviderWire.verified(target, expected).doStream(options)
  expect(credentials).toBe(1)
  expect(sends).toBe(1)
})

test("Vertex Anthropic token callbacks remain dormant during compile and run only after verified admission", async () => {
  const vertexCertificate = {
    sourcePackage: "@ai-sdk/google-vertex",
    sourceVersion: "4.0.128",
    projector: "google-vertex-anthropic",
    projectorVersion: 1,
    promptFields: ["messages", "system"],
    publicQuery: ["$alt", "alt", "prettyPrint"],
    credentialQuery: [],
    bodyCredentials: [],
    compilerAuth: "vertex_anthropic_token",
    terminalRoutes: [],
  } as const satisfies ProviderWire.Certificate
  let credentials = 0
  let sends = 0
  const terminal = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      ProviderWire.interceptFetch(input, init, async () => {
        sends++
        return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } })
      }),
    { preconnect: fetch.preconnect },
  )
  const runtime = createVertexAnthropic({
    project: "test-project",
    location: "us-central1",
    baseURL: "https://vertex-anthropic.test/v1/projects/test-project/locations/us-central1/publishers/anthropic/models",
    generateAuthToken: async () => {
      credentials++
      return "runtime-vertex-token"
    },
    fetch: terminal,
  }).languageModel("claude-3-haiku@20240307")
  const compiler = createVertexAnthropic({
    project: "test-project",
    location: "us-central1",
    baseURL: "https://vertex-anthropic.test/v1/projects/test-project/locations/us-central1/publishers/anthropic/models",
    generateAuthToken: async () => "inert-compiler-token",
    fetch: terminal,
  }).languageModel("claude-3-haiku@20240307")
  const target = ProviderWire.certify(runtime, compiler, vertexCertificate)
  const options = {
    prompt: [{ role: "user", content: [{ type: "text", text: "Continue." }] }],
  } as LanguageModelV3CallOptions

  const expected = await ProviderWire.capture(target, options)
  expect(credentials).toBe(0)
  expect(sends).toBe(0)

  await ProviderWire.verified(target, expected).doStream(options)
  expect(credentials).toBeGreaterThan(0)
  expect(sends).toBe(1)
})

test("permanent attempt violations survive provider catches in compile and verified open", async () => {
  let sends = 0
  const request = () => ({ url: "https://provider.test/v1/responses", body: body() })
  const twice = (swallow: boolean) =>
    language(async () => {
      sends++
      return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
    }, request)
  const compiler = twice(true)
  compiler.doStream = async () => {
    const value = request()
    await ProviderWire.interceptFetch(value.url, { method: "POST", body: JSON.stringify(value.body) }, async () => {
      sends++
      return new Response()
    })
    try {
      await ProviderWire.interceptFetch(value.url, { method: "POST", body: JSON.stringify(value.body) }, async () => {
        sends++
        return new Response()
      })
    } catch {}
    return result()
  }
  const compileTarget = ProviderWire.certify(twice(false), compiler, certificate)
  await expect(ProviderWire.capture(compileTarget, {} as LanguageModelV3CallOptions)).rejects.toThrow(
    "more than one request during capture",
  )
  expect(sends).toBe(0)

  const runtime = twice(true)
  runtime.doStream = compiler.doStream
  const openCompiler = twice(false)
  const openTarget = ProviderWire.certify(runtime, openCompiler, certificate)
  const expected = await ProviderWire.capture(openTarget, {} as LanguageModelV3CallOptions)
  await expect(ProviderWire.verified(openTarget, expected).doStream({} as LanguageModelV3CallOptions)).rejects.toThrow(
    "more than one request during verify",
  )
  expect(sends).toBe(1)
})

test("certification is immutable, idempotent, and rejects a changed compiler function", async () => {
  const target = language(
    async () => new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
    () => ({ url: "https://provider.test/v1/responses", body: body() }),
  )
  const compiler = language(
    async () => new Response("data: [DONE]\n\n"),
    () => ({ url: "https://provider.test/v1/responses", body: body() }),
  )
  expect(ProviderWire.certify(target, compiler, certificate)).toBe(target)
  expect(ProviderWire.certify(target, compiler, certificate)).toBe(target)
  expect(
    Object.isFrozen(
      ProviderWire.project(target, await ProviderWire.capture(target, {} as LanguageModelV3CallOptions), []).compiler,
    ),
  ).toBe(true)

  compiler.doStream = async () => result()
  await expect(ProviderWire.capture(target, {} as LanguageModelV3CallOptions)).rejects.toThrow(
    "pure provider compiler changed after its identity was bound",
  )
})
