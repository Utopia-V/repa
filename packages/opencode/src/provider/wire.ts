import { LearningContext } from "@opencode-ai/core/learning-context"
import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { AsyncLocalStorage } from "async_hooks"

type Path = readonly (string | number)[]

export type CapturedRequest = Readonly<{
  method: string
  endpoint: Readonly<{
    protocol: string
    host: string
    pathname: string
    query: readonly (
      | Readonly<{ key: string; state: "value"; value: string }>
      | Readonly<{ key: string; state: "credential" }>
    )[]
  }>
  body: LearningContext.JsonValue
}>

export type SemanticRequest = CapturedRequest

export type Surface = Readonly<{
  compiler: Certificate
  transport: Readonly<{ method: string; endpoint: CapturedRequest["endpoint"] }>
  providerVisible: LearningContext.JsonValue
  toolChoice: LearningContext.JsonValue
  definitions: readonly Readonly<{ id: string; value: LearningContext.JsonValue }>[]
}>

export type Certificate = LearningContext.ProviderCompilerIdentity

type WireState = {
  certificate: Certificate
  attempts: number
  violation?: SurfaceError
}
type CaptureState = WireState & { type: "capture"; request?: CapturedRequest }
type VerifyState = WireState & { type: "verify"; expected: string; verified: number }
type Certified = Readonly<{
  value: Certificate
  language: Readonly<{
    value: LanguageModelV3
    doStream: LanguageModelV3["doStream"]
  }>
  compiler: Readonly<{
    value: LanguageModelV3
    doStream: LanguageModelV3["doStream"]
  }>
}>

export type RoutedFetch = Readonly<{
  identity: string
  rewrite: (
    input: Parameters<typeof fetch>[0],
    init: BunFetchRequestInit | undefined,
  ) => Readonly<{ input: Parameters<typeof fetch>[0]; init: BunFetchRequestInit | undefined }>
}>

const storage = new AsyncLocalStorage<CaptureState | VerifyState>()
const certificate = Symbol("Gate18.certifiedTerminalFetch")
const routedFetch = Symbol("Gate18.routedTerminalFetch")

export class SurfaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProviderWire.SurfaceError"
  }
}

/**
 * Marks a pinned provider model whose factory is known to route its final JSON
 * request through the injected fetch function and to await that fetch before
 * returning from `doStream`. Provider resolution owns issuance; arbitrary
 * dynamic providers are rejected before import and never receive this mark.
 */
export function certify(language: LanguageModelV3, compiler: LanguageModelV3, value: Certificate) {
  if (!value.sourcePackage || !value.sourceVersion || !value.projector || value.projectorVersion < 1) {
    throw new SurfaceError("Provider compiler certificate is incomplete")
  }
  if (
    language.specificationVersion !== compiler.specificationVersion ||
    language.provider !== compiler.provider ||
    language.modelId !== compiler.modelId
  ) {
    throw new SurfaceError("Provider compiler model identity differs from the runtime model")
  }
  const immutable = Object.freeze({
    ...value,
    promptFields: Object.freeze([...value.promptFields]),
    publicQuery: Object.freeze([...value.publicQuery]),
    credentialQuery: Object.freeze([...value.credentialQuery]),
    bodyCredentials: Object.freeze([...value.bodyCredentials]),
    terminalRoutes: Object.freeze([...value.terminalRoutes]),
  })
  const existing = (language as LanguageModelV3 & { readonly [certificate]?: Certified })[certificate]
  if (existing) {
    if (
      existing.language.value !== language ||
      existing.language.doStream !== language.doStream ||
      existing.compiler.value !== compiler ||
      existing.compiler.doStream !== compiler.doStream ||
      LearningContext.canonicalJson(LearningContext.toJsonValue(existing.value)) !==
        LearningContext.canonicalJson(LearningContext.toJsonValue(immutable))
    ) {
      throw new SurfaceError("Provider compiler certification conflicts with its existing immutable identity")
    }
    return language
  }
  Object.defineProperty(language, certificate, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      value: immutable,
      language: Object.freeze({ value: language, doStream: language.doStream }),
      compiler: Object.freeze({ value: compiler, doStream: compiler.doStream }),
    }),
  })
  return language
}

function requireCertified(language: LanguageModelV3) {
  const marked = (language as LanguageModelV3 & { readonly [certificate]?: Certified })[certificate]
  if (!marked) {
    throw new SurfaceError(
      "Provider route has no certified terminal-fetch compiler; refusing to invoke it before Gate 18 admission",
    )
  }
  if (marked.language.value !== language || language.doStream !== marked.language.doStream) {
    throw new SurfaceError("Certified provider runtime changed after its identity was bound")
  }
  if (marked.compiler.value.doStream !== marked.compiler.doStream) {
    throw new SurfaceError("Certified pure provider compiler changed after its identity was bound")
  }
  return marked
}

/** Compile through a certified provider without sending the request. */
export async function capture(language: LanguageModelV3, options: LanguageModelV3CallOptions) {
  const marked = requireCertified(language)
  const state: CaptureState = { type: "capture", certificate: marked.value, attempts: 0 }
  try {
    await storage.run(state, () => marked.compiler.value.doStream(options))
  } catch (error) {
    if (state.violation) throw state.violation
    throw error
  }
  if (state.violation) throw state.violation
  if (state.attempts !== 1 || !state.request) {
    throw new SurfaceError("Certified provider returned without exposing exactly one terminal JSON request")
  }
  return state.request
}

/**
 * Remove the certificate-owned credential and header carriers from an
 * in-memory terminal request. This value is the only request representation
 * allowed to feed durable binding, replay conflict, or capacity evidence.
 */
export function semantic(language: LanguageModelV3, request: CapturedRequest): SemanticRequest {
  return semanticCertified(requireCertified(language).value, request)
}

export function semanticCertified(compiler: Certificate, request: CapturedRequest): SemanticRequest {
  return {
    ...request,
    body: sanitizeBody(compiler, request.body),
  }
}

export function semanticBodyCertified(compiler: Certificate, body: LearningContext.JsonValue) {
  return sanitizeBody(compiler, body)
}

/**
 * Derive the complete non-prompt provider-visible capability surface from one
 * final route request. Removing the closed set of protocol prompt fields keeps
 * learner content out of the compact capability binding while retaining tool
 * definitions, tool choice, parallel/max-tool controls, route metadata, and
 * every other non-prompt semantic or size-bearing JSON field.
 */
export function project(
  language: LanguageModelV3,
  request: CapturedRequest,
  candidateToolIDs: readonly string[],
): Surface {
  return projectCertified(requireCertified(language).value, request, candidateToolIDs)
}

export function projectCertified(
  compiler: Certificate,
  request: CapturedRequest,
  candidateToolIDs: readonly string[],
): Surface {
  const semantic = semanticCertified(compiler, request)
  if (!record(semantic.body)) throw new SurfaceError("Provider route request body is not a JSON object")
  const promptFields = new Set(compiler.promptFields)
  const body = LearningContext.toJsonValue(
    Object.fromEntries(Object.entries(semantic.body).filter(([key]) => !promptFields.has(key))),
  )
  const candidates = collectDefinitions(body, [])
  const definitions = candidateToolIDs.flatMap((id) => {
    const matches = candidates.filter((candidate) => candidate.id === id)
    if (matches.length === 0) {
      if (containsValue(body, id)) {
        throw new SurfaceError(`Provider route exposed ${id} in an unsupported definition shape`)
      }
      return []
    }
    if (matches.length > 1) throw new SurfaceError(`Provider route emitted duplicate definition identity: ${id}`)
    return [
      {
        id,
        value: LearningContext.toJsonValue({ path: matches[0]!.path, value: matches[0]!.value }),
      },
    ]
  })
  if (new Set(candidateToolIDs).size !== candidateToolIDs.length) {
    throw new SurfaceError("Candidate tool identities must be unique before provider lowering")
  }
  const choices = collectToolChoices(body, [])
  const transport = { method: semantic.method, endpoint: semantic.endpoint }
  return {
    compiler,
    transport,
    providerVisible: LearningContext.toJsonValue({ compiler, transport, body }),
    toolChoice: LearningContext.toJsonValue(
      choices.length === 0 ? { state: "absent" } : { state: "present", value: choices },
    ),
    definitions,
  }
}

/**
 * Wrap one certified model so no provider result stream can escape until its
 * terminal transport has matched the immutable post-admission compile.
 */
export function verified(language: LanguageModelV3, expected: CapturedRequest): LanguageModelV3 {
  const marked = requireCertified(language)
  const semanticExpected = semanticCertified(marked.value, expected)
  return new Proxy(language, {
    get(target, property, receiver) {
      if (property !== "doStream") return Reflect.get(target, property, receiver)
      return async (options: LanguageModelV3CallOptions) => {
        const state: VerifyState = {
          type: "verify",
          certificate: marked.value,
          expected: LearningContext.canonicalJson(LearningContext.toJsonValue(semanticExpected)),
          attempts: 0,
          verified: 0,
        }
        const result = await storage.run(state, () => target.doStream(options))
        if (state.violation) throw state.violation
        if (state.attempts !== 1 || state.verified !== 1) {
          throw new SurfaceError("Certified provider returned a stream without exactly one verified terminal request")
        }
        return result
      }
    },
  })
}

export async function interceptFetch(
  input: Parameters<typeof fetch>[0],
  init: BunFetchRequestInit | undefined,
  next: () => Promise<Response>,
) {
  const state = storage.getStore()
  if (!state) return next()
  state.attempts++
  if (state.attempts !== 1) {
    state.violation ??= new SurfaceError(`Provider route attempted more than one request during ${state.type}`)
    throw state.violation
  }
  let request: CapturedRequest
  try {
    request = await captureRequest(input, init, state.certificate)
  } catch (error) {
    state.violation ??= error instanceof SurfaceError ? error : new SurfaceError(String(error))
    throw state.violation
  }
  if (state.type === "capture") {
    state.request = request
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream", "x-request-id": "gate18-provider-compile" },
    })
  }
  if (
    LearningContext.canonicalJson(LearningContext.toJsonValue(semanticCertified(state.certificate, request))) !==
    state.expected
  ) {
    state.violation = new SurfaceError("Final provider request differs from the admitted Gate 18 compiled operation")
    throw state.violation
  }
  state.verified = 1
  return next()
}

export async function request(input: Parameters<typeof fetch>[0], init?: BunFetchRequestInit) {
  return captureRequest(input, init, {
    sourcePackage: "test",
    sourceVersion: "0",
    projector: "test",
    projectorVersion: 1,
    promptFields: [],
    publicQuery: [],
    credentialQuery: [],
    bodyCredentials: [],
    compilerAuth: "api_key",
    terminalRoutes: [],
  })
}

/**
 * Attach one source-audited pure terminal endpoint rewrite to a retained
 * provider fetch. The rewrite runs before capture/verification; the fetch body
 * itself runs only after verified admission.
 */
export function routeFetch(target: typeof fetch, value: RoutedFetch): typeof fetch {
  if (!value.identity || typeof value.rewrite !== "function") {
    throw new SurfaceError("Provider terminal route adapter is incomplete")
  }
  const existing = (target as typeof fetch & { readonly [routedFetch]?: RoutedFetch })[routedFetch]
  if (existing) {
    if (existing.identity !== value.identity || existing.rewrite !== value.rewrite) {
      throw new SurfaceError("Provider terminal route adapter conflicts with its existing immutable identity")
    }
    return target
  }
  Object.defineProperty(target, routedFetch, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({ identity: value.identity, rewrite: value.rewrite }),
  })
  return target
}

export function routeIdentity(target: unknown) {
  return typeof target === "function"
    ? (target as typeof fetch & { readonly [routedFetch]?: RoutedFetch })[routedFetch]?.identity
    : undefined
}

export function route(target: unknown, input: Parameters<typeof fetch>[0], init: BunFetchRequestInit | undefined) {
  const value =
    typeof target === "function"
      ? (target as typeof fetch & { readonly [routedFetch]?: RoutedFetch })[routedFetch]
      : undefined
  return value ? value.rewrite(input, init) : { input, init }
}

export function normalize(input: { certificate: Certificate; method: string; url: string; body: unknown }) {
  return captureRequest(input.url, { method: input.method, body: JSON.stringify(input.body) }, input.certificate)
}

async function captureRequest(
  input: Parameters<typeof fetch>[0],
  init: BunFetchRequestInit | undefined,
  certificate: Certificate,
) {
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : ""
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SurfaceError("Provider route did not expose an absolute request URL")
  }
  if (url.username || url.password) throw new SurfaceError("Provider route embedded unsupported URL user information")
  if (url.hash) throw new SurfaceError("Provider route emitted an unsupported URL fragment")
  const body = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined)
  const text =
    typeof body === "string"
      ? body
      : body instanceof URLSearchParams
        ? body.toString()
        : body instanceof Blob
          ? await body.text()
          : ArrayBuffer.isView(body)
            ? new TextDecoder().decode(body)
            : body instanceof ArrayBuffer
              ? new TextDecoder().decode(body)
              : undefined
  if (!text) throw new SurfaceError("Provider route did not expose a non-empty request body")
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SurfaceError("Provider route request body is not JSON")
  }
  const publicQuery = new Set(certificate.publicQuery)
  const credentialQuery = new Set(certificate.credentialQuery)
  const queryKeys = [...url.searchParams.keys()]
  if (new Set(queryKeys).size !== queryKeys.length) {
    throw new SurfaceError("Provider route emitted a duplicate query key outside an explicit certificate")
  }
  const query = [...url.searchParams.entries()]
    .flatMap(([key, value]) => {
      if (credentialQuery.has(key)) return []
      if (publicQuery.has(key)) return { key, state: "value" as const, value }
      throw new SurfaceError(`Provider route emitted query key outside its certificate: ${key}`)
    })
    .toSorted((left, right) =>
      left.key !== right.key
        ? left.key < right.key
          ? -1
          : 1
        : left.state !== right.state
          ? left.state < right.state
            ? -1
            : 1
          : left.state === "value" && right.state === "value"
            ? left.value < right.value
              ? -1
              : left.value > right.value
                ? 1
                : 0
            : 0,
    )
  return {
    method: (init?.method ?? (input instanceof Request ? input.method : "POST")).toUpperCase(),
    endpoint: {
      protocol: url.protocol.toLowerCase(),
      host: url.host.toLowerCase(),
      pathname: url.pathname,
      query,
    },
    body: LearningContext.toJsonValue(parsed),
  } satisfies CapturedRequest
}

function sanitizeBody(compiler: Certificate, input: LearningContext.JsonValue) {
  let value = input
  if (compiler.bodyCredentials.includes("gateway_call_options")) value = sanitizeGateway(value)
  if (compiler.bodyCredentials.includes("openai_hosted_mcp")) value = sanitizeOpenAIHostedMcp(compiler, value)
  return LearningContext.toJsonValue(value)
}

function sanitizeGateway(input: LearningContext.JsonValue): LearningContext.JsonValue {
  if (!record(input)) return input
  const result: Record<string, LearningContext.JsonValue> = { ...input }
  if ("headers" in result) result.headers = excluded("headers")
  if (
    record(result.providerOptions) &&
    record(result.providerOptions.gateway) &&
    "byok" in result.providerOptions.gateway
  ) {
    result.providerOptions = {
      ...result.providerOptions,
      gateway: {
        ...result.providerOptions.gateway,
        byok: excluded("credential"),
      },
    }
  }
  return result
}

function sanitizeOpenAIHostedMcp(compiler: Certificate, input: LearningContext.JsonValue): LearningContext.JsonValue {
  if (!record(input)) return input
  if (!Array.isArray(input.tools)) return input
  return {
    ...input,
    tools: input.tools.map((tool) => {
      if (!record(tool)) return tool
      if (tool.type === "mcp") return sanitizeHostedMcpCredentials(tool)
      if (compiler.projector !== "ai-gateway" || tool.type !== "provider" || tool.id !== "openai.mcp") {
        return tool
      }
      if (!record(tool.args)) return tool
      return { ...tool, args: sanitizeHostedMcpCredentials(tool.args) }
    }),
  }
}

function sanitizeHostedMcpCredentials(input: Readonly<Record<string, LearningContext.JsonValue>>) {
  const result: Record<string, LearningContext.JsonValue> = { ...input }
  if ("authorization" in result) result.authorization = excluded("credential")
  if ("headers" in result) result.headers = excluded("headers")
  return result
}

function excluded(kind: "credential" | "headers") {
  return LearningContext.toJsonValue({ state: "excluded", kind })
}

function collectDefinitions(
  value: LearningContext.JsonValue,
  path: Path,
): {
  id: string
  path: Path
  value: LearningContext.JsonValue
}[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => collectDefinitions(item, [...path, index]))
  if (!record(value)) return []
  const id = definitionID(value)
  if (id) return [{ id, path, value }]
  return Object.entries(value).flatMap(([key, item]) => collectDefinitions(item, [...path, key]))
}

function definitionID(value: Readonly<Record<string, LearningContext.JsonValue>>) {
  const fn = record(value.function) ? value.function : undefined
  if (fn && typeof fn.name === "string" && definitionBody(fn)) return fn.name
  const spec = record(value.toolSpec) ? value.toolSpec : undefined
  if (spec && typeof spec.name === "string" && definitionBody(spec)) return spec.name
  if (typeof value.name === "string" && definitionBody(value)) return value.name
  if (typeof value.id === "string" && ("args" in value || value.type === "provider")) return value.id
}

function definitionBody(value: Readonly<Record<string, LearningContext.JsonValue>>) {
  return [
    "description",
    "input_schema",
    "inputSchema",
    "parameters",
    "parametersJsonSchema",
    "schema",
    "strict",
    "providerOptions",
  ].some((key) => key in value)
}

function collectToolChoices(value: LearningContext.JsonValue, path: Path): LearningContext.JsonValue[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => collectToolChoices(item, [...path, index]))
  if (!record(value)) return []
  return Object.entries(value).flatMap(([key, item]) =>
    toolChoiceKey(key)
      ? [LearningContext.toJsonValue({ path: [...path, key], value: item })]
      : collectToolChoices(item, [...path, key]),
  )
}

function toolChoiceKey(value: string) {
  return ["tool_choice", "toolChoice", "function_call", "functionCall", "functionCallingConfig"].includes(value)
}

function containsValue(input: LearningContext.JsonValue, value: string): boolean {
  if (input === value) return true
  if (Array.isArray(input)) return input.some((item) => containsValue(item, value))
  if (!record(input)) return false
  return Object.values(input).some((item) => containsValue(item, value))
}

function record(
  value: LearningContext.JsonValue | undefined,
): value is Readonly<Record<string, LearningContext.JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export * as ProviderWire from "./wire"
