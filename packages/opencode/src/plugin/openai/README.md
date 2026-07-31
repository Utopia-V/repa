# OpenAI Responses WebSocket

> **Status — built-in OpenAI provider authentication and transport.**
> `CodexAuthPlugin` supplies Repa's released-v1 ChatGPT Plus/Pro OAuth methods
> and the Responses transport used by that authentication path. Repa stores its
> own provider credential; it does not depend on or copy Codex Desktop's local
> credential. Current product authority is indexed by the
> [documentation map](../../../../../docs/README.md).

The channel helper enables WebSockets for `local`, `dev`, and `beta`, while
other channels require `REPA_EXPERIMENTAL_WEBSOCKETS=true`. HTTP fallback
remains available when WebSockets are disabled or fail.

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
