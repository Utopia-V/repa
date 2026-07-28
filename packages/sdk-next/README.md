# @opencode-ai/sdk-next

> **Status — deferred preview-v2 package documentation, not Repa's production SDK plan.** This file may guide source-local maintenance of `packages/sdk-next`. The package's presence does not authorize enabling it, migrating callers, or replacing the released SDK/runtime; those decisions require an accepted Repa ADR or Gate.
> Current Repa authority is indexed by the [documentation map](../../docs/README.md).

This package implements an Effect-native scoped OpenCode host for in-process applications. The inherited preview-v2 effort intended it to replace the generated `@opencode-ai/sdk` after consumer migration; Repa has not accepted that replacement as a production direction.

The SDK executes Server's assembled HTTP router in memory. It opens no listener and performs no network I/O, while preserving the same routing, middleware, handlers, codecs, and errors as the network client.

```ts
import { OpenCode } from "@opencode-ai/sdk-next"

const opencode = yield * OpenCode.create()
const session = yield * opencode.sessions.get({ sessionID })
```

It also exports `Tool` and exposes local-only `tools.register(...)`, replacing the former `@opencode-ai/core/public` facade. Registration uses Core's host-level `ApplicationTools` service shared by the host's Locations; each Location retains its own `ToolRegistry` for overlay, lookup, and settlement. Closing the owning Effect Scope releases router resources, location services, fibers, and scoped tool registrations.

`sessions.events({ sessionID, after })` replays durable events after the optional aggregate sequence, then emits newly committed durable events. `sessions.interrupt(...)` targets execution owned by this host, and `sessions.message(...)` retrieves one projected Session message.

The same constructor is available as a service Layer:

```ts
const program = Effect.gen(function* () {
  const opencode = yield* OpenCode.Service
  return yield* opencode.sessions.get({ sessionID })
})

yield * program.pipe(Effect.provide(OpenCode.layer))
```

`OpenCode.layer` adapts `OpenCode.create()` for dependency injection; it does not define another host implementation.
