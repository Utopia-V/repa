# OpenAI Responses WebSocket

> **Status — hibernated ChatGPT OAuth plugin mechanics, not a current built-in
> Repa path.** `CodexAuthPlugin` is deliberately absent from
> `packages/opencode/src/plugin/index.ts` while Repa lacks an owned or verified
> compatible client registration. The low-level source remains for audit and
> possible explicit maintenance; this page does not make ChatGPT OAuth or its
> Responses WebSocket pool reachable by default.
> Current Repa authority is indexed by the
> [documentation map](../../../../../docs/README.md).

If the plugin is deliberately composed for isolated maintenance, its retained
channel helper enables WebSockets for `local`, `dev`, and `beta`, while other
channels require `REPA_EXPERIMENTAL_WEBSOCKETS=true`. That helper behavior is
not a release or product-support promise.

## Flow

1. A streamed `POST /responses` request arrives.
2. If it has no `session-id` or `x-session-affinity` header, use HTTP.
3. Title requests use HTTP.
4. If that session's socket is busy or already in fallback mode, use HTTP.
5. Otherwise, reuse its open socket or open a new one.
6. Send `response.create` and return WebSocket events as SSE.

## Lifetime

- Connect timeout: 15 seconds.
- Idle timeout: 5 minutes.
- After a completed response, keep the socket for reuse.
- Reuse a socket for up to 55 minutes, then replace it on the next request.

## Retries

- Retry WebSocket stream/setup failures up to 5 times, then use HTTP for that session until the pool entry is idle-pruned.
- `websocket_connection_limit_reached` consumes the same retry budget and HTTP fallback.
- If a WebSocket fails after its first event, fail it as retryable rather than replaying partial output in transport.
- Abort or cancel closes the socket.

## Next Steps

- `previous_response_id` continuation.
- Optional second WebSocket for concurrent requests in one session. Currently these use HTTP.
