import { describe, expect, test } from "bun:test"
import {
  CodexAuthPlugin,
  parseJwtClaims,
  extractAccountIdFromClaims,
  extractAccountId,
  renderOAuthError,
  type IdTokenClaims,
} from "../../src/plugin/openai/codex"
import { ProviderWire } from "@/provider/wire"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"

function createTestJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.sig`
}

describe("plugin.codex", () => {
  test("escapes provider errors in callback HTML", () => {
    const error = `</div><script>alert("xss" & 'more')</script>`
    const html = renderOAuthError(error)

    expect(html).toContain("&lt;/div&gt;&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;more&#39;)&lt;/script&gt;")
    expect(html).not.toContain(error)
  })

  describe("parseJwtClaims", () => {
    test("parses valid JWT with claims", () => {
      const payload = { email: "test@example.com", chatgpt_account_id: "acc-123" }
      const jwt = createTestJwt(payload)
      const claims = parseJwtClaims(jwt)
      expect(claims).toEqual(payload)
    })

    test("returns undefined for JWT with less than 3 parts", () => {
      expect(parseJwtClaims("invalid")).toBeUndefined()
      expect(parseJwtClaims("only.two")).toBeUndefined()
    })

    test("returns undefined for invalid base64", () => {
      expect(parseJwtClaims("a.!!!invalid!!!.b")).toBeUndefined()
    })

    test("returns undefined for invalid JSON payload", () => {
      const header = Buffer.from("{}").toString("base64url")
      const invalidJson = Buffer.from("not json").toString("base64url")
      expect(parseJwtClaims(`${header}.${invalidJson}.sig`)).toBeUndefined()
    })
  })

  describe("extractAccountIdFromClaims", () => {
    test("extracts chatgpt_account_id from root", () => {
      const claims: IdTokenClaims = { chatgpt_account_id: "acc-root" }
      expect(extractAccountIdFromClaims(claims)).toBe("acc-root")
    })

    test("extracts chatgpt_account_id from nested https://api.openai.com/auth", () => {
      const claims: IdTokenClaims = {
        "https://api.openai.com/auth": { chatgpt_account_id: "acc-nested" },
      }
      expect(extractAccountIdFromClaims(claims)).toBe("acc-nested")
    })

    test("prefers root over nested", () => {
      const claims: IdTokenClaims = {
        chatgpt_account_id: "acc-root",
        "https://api.openai.com/auth": { chatgpt_account_id: "acc-nested" },
      }
      expect(extractAccountIdFromClaims(claims)).toBe("acc-root")
    })

    test("extracts from organizations array as fallback", () => {
      const claims: IdTokenClaims = {
        organizations: [{ id: "org-123" }, { id: "org-456" }],
      }
      expect(extractAccountIdFromClaims(claims)).toBe("org-123")
    })

    test("returns undefined when no accountId found", () => {
      const claims: IdTokenClaims = { email: "test@example.com" }
      expect(extractAccountIdFromClaims(claims)).toBeUndefined()
    })
  })

  describe("extractAccountId", () => {
    test("extracts from id_token first", () => {
      const idToken = createTestJwt({ chatgpt_account_id: "from-id-token" })
      const accessToken = createTestJwt({ chatgpt_account_id: "from-access-token" })
      expect(
        extractAccountId({
          id_token: idToken,
          access_token: accessToken,
          refresh_token: "rt",
        }),
      ).toBe("from-id-token")
    })

    test("falls back to access_token when id_token has no accountId", () => {
      const idToken = createTestJwt({ email: "test@example.com" })
      const accessToken = createTestJwt({
        "https://api.openai.com/auth": { chatgpt_account_id: "from-access" },
      })
      expect(
        extractAccountId({
          id_token: idToken,
          access_token: accessToken,
          refresh_token: "rt",
        }),
      ).toBe("from-access")
    })

    test("returns undefined when no tokens have accountId", () => {
      const token = createTestJwt({ email: "test@example.com" })
      expect(
        extractAccountId({
          id_token: token,
          access_token: token,
          refresh_token: "rt",
        }),
      ).toBeUndefined()
    })

    test("handles missing id_token", () => {
      const accessToken = createTestJwt({ chatgpt_account_id: "acc-123" })
      expect(
        extractAccountId({
          id_token: "",
          access_token: accessToken,
          refresh_token: "rt",
        }),
      ).toBe("acc-123")
    })
  })

  test("installs websocket transport only when experimental websockets are enabled", async () => {
    const disabled = await CodexAuthPlugin({} as never)
    const enabled = await CodexAuthPlugin({} as never, { experimentalWebSockets: true })

    const disabledOptions = await disabled.auth!.loader!(
      async () => ({ type: "api", key: "sk-test" }) as never,
      {} as never,
    )
    const enabledOptions = await enabled.auth!.loader!(
      async () => ({ type: "api", key: "sk-test" }) as never,
      {} as never,
    )

    expect(disabledOptions.fetch).toBeUndefined()
    expect(enabledOptions.fetch).toBeFunction()
    await enabled.dispose?.()
  })

  test("exposes the default OAuth endpoint rewrite as a pure admitted terminal route", async () => {
    let authReads = 0
    let sends = 0
    using server = Bun.serve({
      port: 0,
      fetch(request) {
        sends++
        expect(new URL(request.url).pathname).toBe("/backend-api/codex/responses")
        expect(request.headers.get("authorization")).toBe("Bearer access-secret")
        return new Response("data: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        })
      },
    })
    const endpoint = new URL("/backend-api/codex/responses", server.url).toString()
    const hooks = await CodexAuthPlugin({} as never, {
      codexApiEndpoint: endpoint,
    })
    const loaded = await hooks.auth!.loader!(async () => {
      authReads++
      return {
        type: "oauth",
        refresh: "refresh-secret",
        access: "access-secret",
        expires: Date.now() + 60_000,
      } as never
    }, {} as never)

    expect(ProviderWire.routeIdentity(loaded.fetch)).toBe("openai-codex-oauth-http-v1")
    expect(
      ProviderWire.route(loaded.fetch, "https://api.openai.com/v1/responses", {
        method: "POST",
        body: "{}",
      }).input.toString(),
    ).toBe(endpoint)
    expect(authReads).toBe(1)

    const terminal = Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const routed = ProviderWire.route(loaded.fetch, input, init)
        return ProviderWire.interceptFetch(routed.input, routed.init, () => loaded.fetch!(routed.input, routed.init))
      },
      { preconnect: fetch.preconnect },
    )
    const runtime = createOpenAI({
      apiKey: loaded.apiKey,
      baseURL: "https://api.openai.com/v1",
      fetch: terminal,
    }).responses("gpt-5")
    const compiler = createOpenAI({
      apiKey: "inert-compiler-key",
      baseURL: "https://api.openai.com/v1",
      fetch: terminal,
    }).responses("gpt-5")
    const language = ProviderWire.certify(runtime, compiler, {
      sourcePackage: "@ai-sdk/openai",
      sourceVersion: "3.0.53",
      projector: "openai",
      projectorVersion: 1,
      promptFields: ["input", "instructions", "messages"],
      publicQuery: [],
      credentialQuery: [],
      bodyCredentials: ["openai_hosted_mcp"],
      compilerAuth: "api_key",
      terminalRoutes: ["openai-codex-oauth-http-v1"],
    })
    const compiled = await ProviderWire.capture(language, {
      prompt: [{ role: "user", content: [{ type: "text", text: "Compile without reading OAuth state." }] }],
    } as LanguageModelV3CallOptions)
    const projected = ProviderWire.project(language, compiled, [])
    const expectedEndpoint = new URL(endpoint)
    expect(projected.transport.endpoint).toMatchObject({
      protocol: expectedEndpoint.protocol,
      host: expectedEndpoint.host,
      pathname: "/backend-api/codex/responses",
    })
    expect(projected.compiler.terminalRoutes).toEqual(["openai-codex-oauth-http-v1"])
    expect(JSON.stringify(projected)).not.toContain("refresh-secret")
    expect(JSON.stringify(projected)).not.toContain("access-secret")
    expect(authReads).toBe(1)
    expect(sends).toBe(0)

    await ProviderWire.verified(language, compiled).doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Compile without reading OAuth state." }] }],
    } as LanguageModelV3CallOptions)
    expect(authReads).toBe(2)
    expect(sends).toBe(1)
  })

  test("deduplicates concurrent Codex token refreshes", async () => {
    let auth = {
      type: "oauth" as const,
      refresh: "refresh-old",
      access: "",
      expires: 0,
    }
    const authUpdates: Array<{
      providerID: string
      auth: { refresh: string; access: string; expires: number; accountId?: string }
    }> = []
    let resolveRefresh: (() => void) | undefined
    const refreshReady = new Promise<void>((resolve) => {
      resolveRefresh = resolve
    })
    let refreshRequests = 0
    const apiRequests: { authorization: string | null; accountId: string | null }[] = []

    using server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/oauth/token") {
          expect(await request.text()).toContain("refresh_token=refresh-old")
          refreshRequests += 1
          await refreshReady
          return Response.json({
            id_token: createTestJwt({ chatgpt_account_id: "acc-123" }),
            access_token: "access-new",
            refresh_token: "refresh-new",
            expires_in: 3600,
          })
        }

        if (url.pathname === "/backend-api/codex/responses") {
          apiRequests.push({
            authorization: request.headers.get("authorization"),
            accountId: request.headers.get("ChatGPT-Account-Id"),
          })
          return new Response("{}", { status: 200 })
        }

        return new Response("unexpected request", { status: 500 })
      },
    })

    const hooks = await CodexAuthPlugin(
      {
        client: {
          auth: {
            async set(input: {
              providerID: string
              auth: { refresh: string; access: string; expires: number; accountId?: string }
            }) {
              authUpdates.push(input)
              auth = {
                type: "oauth",
                refresh: input.auth.refresh,
                access: input.auth.access,
                expires: input.auth.expires,
                ...(input.auth.accountId && { accountId: input.auth.accountId }),
              }
            },
          },
        } as never,
        project: {} as never,
        directory: "",
        worktree: "",
        experimental_workspace: {
          register() {},
        },
        serverUrl: new URL("https://example.com"),
        $: {} as never,
      },
      {
        issuer: server.url.origin,
        codexApiEndpoint: new URL("/backend-api/codex/responses", server.url).toString(),
      },
    )
    const loaded = await hooks.auth!.loader!(async () => auth as never, {} as never)

    const first = loaded.fetch!("https://api.openai.com/v1/responses")
    const second = loaded.fetch!("https://api.openai.com/v1/responses")

    await waitFor(() => refreshRequests === 1)
    expect(apiRequests).toHaveLength(0)

    resolveRefresh!()
    await Promise.all([first, second])

    expect(refreshRequests).toBe(1)
    expect(authUpdates).toHaveLength(1)
    expect(authUpdates[0]?.providerID).toBe("openai")
    expect(authUpdates[0]?.auth.refresh).toBe("refresh-new")
    expect(authUpdates[0]?.auth.access).toBe("access-new")
    expect(authUpdates[0]?.auth.accountId).toBe("acc-123")
    expect(apiRequests).toEqual([
      { authorization: "Bearer access-new", accountId: "acc-123" },
      { authorization: "Bearer access-new", accountId: "acc-123" },
    ])
  })
})

async function waitFor(predicate: () => boolean) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > 1_000) throw new Error("timed out waiting for condition")
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}
