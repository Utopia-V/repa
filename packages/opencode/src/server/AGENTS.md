# Retained Repa server carrier

Changes in this subtree must preserve the headless/direct/attach transport
boundary for retained terminal carriers. Product reachability derives from
[Gate 5](../../../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md)
and the [system architecture](../../../../docs/architecture/00-system-architecture.md).
This contract does not certify the current route tree, Layer graph, build, or
startup registration; inspect them together against the linked owners.

## Required boundary

Own listener lifecycle, route composition, authentication/CORS transport,
local directory routing, event transport, and HTTP presentation. The admitted
composition joins the released-v1 production Session routes only with selected
typed data and other non-model-execution routes. Gate 5 requires the
`@opencode-ai/server` Session execution service to remain non-executing and the
complete production graph to have no preview-runner edge; its recorded no-op
binding is not sufficient evidence by itself. Do not revive preview-v2 prompt,
active/wait/compact/interrupt, or another model-execution path.

Route/group registration is public reachability. Do not mount a hosted Web
fallback, Console/account, sharing, remote Workspace/sync/control-plane,
updater, marketplace, or other excluded surface merely because a handler,
schema, source file, or generated client still exists. Directory selection is
local or the exact persisted Session directory; URL-shaped legacy selectors
must not recover a remote workspace meaning.

CORS may admit requests without an Origin, loopback/same-host requests, and
origins explicitly configured by the operator. It must not carry ambient
OpenCode-hosted or Desktop origins. Authentication, middleware, and handlers
translate transport concerns; they do not own Course, Goal, learner, artifact,
permission-settlement, or Tutor semantics.

The nested `routes/instance/httpapi/AGENTS.md` refines typed route construction.
Its patterns are subordinate to the reachability and product boundary here.

Focused checks from `packages/opencode`: `bun test
test/server/httpapi-public-openapi.test.ts
test/server/httpapi-workspace-routing.test.ts test/server/httpapi-cors.test.ts
test/server/sdk-v1-smoke.test.ts`.
