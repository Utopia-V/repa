# HttpApi Route Patterns

## Repa scope and reachability

This subtree is part of the retained Repa server carrier described by the
parent [server guidance](../../../AGENTS.md). Typed group and route assembly is
public product reachability, not merely an HttpApi refactor. Apply
[Gate 5](../../../../../../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md)
before adding or restoring a group.

The rules below state the accepted route boundary. Current route assembly is
falsifiable implementation evidence; neither a typed declaration nor a
passing OpenAPI test proves the complete production registration is valid.

- Keep hosted Web fallback, Console/account, sharing, remote
  Workspace/sync/control-plane, updater, marketplace, and preview-v2 model
  execution out of the production route tree.
- An admitted `/api` typed data/event surface may coexist with the released-v1
  Session executor, but it must not acquire `active`, `prompt`, `compact`,
  `wait`, or `interrupt` execution ownership. Every production composition
  must keep its `SessionExecution` layer non-executing and contain no edge to
  the preview runner.
- Route by an explicit local directory or the exact persisted Session
  directory. Do not revive URL-shaped remote workspace selectors.
- Keep domain and storage services free of HTTP types. A handler translates a
  typed contract and expected errors; it does not become a learning authority.

Use `HttpApiBuilder.group(...)` for normal HTTP endpoints, including streaming HTTP responses such as server-sent events. Handlers should yield stable services once while building the handler layer, then close over those services in endpoint implementations.

```ts
export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service

    return handlers.handle("list", () => session.list())
  }),
)
```

For SSE endpoints, stay in `HttpApiBuilder.group(...)` and return `HttpServerResponse.stream(...)` from the handler. Annotate the endpoint success schema with `HttpApiSchema.asText({ contentType: "text/event-stream" })` so OpenAPI documents the stream content type.

Use `HttpApiBuilder.group(...)` with `handleRaw(...)` for declared endpoints that need the raw request or response, including WebSocket upgrade routes. This keeps endpoint middleware, routing context, and OpenAPI metadata on one typed route tree.

```ts
export const ptyConnectHandlers = HttpApiBuilder.group(PtyConnectApi, "pty-connect", (handlers) =>
  Effect.gen(function* () {
    const pty = yield* Pty.Service

    return handlers.handleRaw("connect", (ctx) => connectPty(ctx.request, pty))
  }),
)
```

Use raw `HttpRouter.use(...)` only for an admitted route outside the declared
API surface, such as the generated OpenAPI document route. Never use it to
recreate the removed hosted-UI catch-all.

Avoid `Effect.provide(SomeLayer)` inside request handlers or raw route callbacks. Stable layers should be provided once at the application/layer boundary, not rebuilt or scoped per request.

Avoid `HttpRouter.provideRequest(...)` unless the dependency is intentionally request-level. Prefer `HttpRouter.use(...)` for stable app services.

Use `Effect.provideService(...)` in middleware only for request-derived
context, such as `WorkspaceRouteContext`, `InstanceRef`, or `WorkspaceRef`.
Inherited Workspace-named routing types carry the accepted local-directory
compatibility projection; they do not authorize remote Workspace semantics.
Do not use request services to smuggle stable dependencies through request
effects when they can be yielded at layer construction.

Public JSON errors should be explicit `Schema.ErrorClass` contracts declared on each endpoint. Use built-in `HttpApiError.*` classes only when their empty/tagged body is the intended wire shape; for SDK-visible errors with messages, define an API error schema such as `ApiNotFoundError` and fail with that exact declared error. Keep domain and storage services free of HttpApi types, and translate expected domain errors at the handler boundary.

When adding middleware, declare endpoint-contract middleware on the owning `HttpApiGroup` and provide its implementation layer at the assembly boundary in `server.ts`. Keep router middleware for truly raw fallback routes or global transport policy.
