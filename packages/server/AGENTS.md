# Admitted typed server adapters

Code in this package must remain an adapter from admitted
`@opencode-ai/protocol` groups to Core services. Where the retained production
server composes it, the package does not become a second product runtime.
Apply the [system architecture](../../docs/architecture/00-system-architecture.md)
and [Gate 5](../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md).

This guide states the required dependency and reachability boundary; it does
not certify current handlers, layers, or assembly. Audit the actual Protocol,
handler, layer, and production registration graph together. A reachable extra
path or a missing required binding is an implementation defect even if local
tests or types pass.

## Required boundary

Own typed HTTP handlers, request-derived location middleware, authentication
and CORS helpers, expected-error translation, and service-layer assembly for
the admitted API. Domain owners stay in Core, Protocol owns wire contracts, and
the `packages/opencode` server owns final production reachability.

The accepted Gate 5 production composition requires `SessionExecution` to be
non-executing; its recorded implementation uses `SessionExecution.noopLayer`.
Verify every production assembly still supplies that boundary and has no edge
to the preview runner—presence of a no-op binding in one file is insufficient.
Do not expose active/prompt/compact/wait/interrupt behavior without first
revising the owning product, architecture, and Gate decisions. Data, history,
and event projections do not imply an alternate Agent loop merely because
their identifiers use `v2`.

Keep request routing local-directory based and Session placement bound to the
persisted Session directory. Do not reintroduce remote Workspace,
sync/control-plane, sharing, Console/account, hosted Web, updater, or
marketplace behavior in a handler or service dependency. CORS has no ambient
OpenCode-hosted/Desktop origin allowance.

Adding a handler without an admitted Protocol group and production registration
does not make a product surface. Conversely, a registered endpoint must have a
real handler, declared error contract, and stable layer supplied at assembly;
do not construct stable services per request.

Run `bun run typecheck` from `packages/server` and the focused
`packages/opencode/test/server` route/OpenAPI test for the changed handler.
Public contract changes also require regeneration from `packages/client`.
