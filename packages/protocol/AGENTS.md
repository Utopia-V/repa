# Admitted typed HTTP protocol

Code in this package must preserve browser-safe typed endpoint groups and
middleware placement between `@opencode-ai/schema` and
`@opencode-ai/server`. This boundary follows the
[system architecture](../../docs/architecture/00-system-architecture.md) and
[Gate 5 reachability decision](../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md).

These are required wire boundaries, not proof that the declarations currently
match product intent or production registration. Treat every endpoint, group,
and generated method as a candidate projection to be checked against its
product owner; source presence and OpenAPI generation cannot admit a surface.

## Required boundary

Preserve the dependency direction `Schema <- Protocol <- Server`. Protocol
declares wire inputs, outputs, errors, endpoint names, group membership, and
middleware requirements. It contains no database access, provider execution,
terminal behavior, or learning-domain legality. Adding a detailed endpoint is
not product authority; every public group must already be admitted by the
repository authority map and production server composition.

In the accepted composition, `/api` naming and `v2.*` OpenAPI identifiers are
wire labels only. They do not admit the inherited preview-v2 Agent runtime.
Session data, history, event, permission, and local-location routes may remain,
but the production protocol must not expose the preview execution family—
`active`, `prompt`, `compact`, `wait`, or `interrupt`—or create a second Session
executor.

Keep location inputs directory-only. Do not restore remote Workspace,
sync/control-plane, sharing, Console/account, hosted Web, updater, marketplace,
or other excluded groups through a schema, compatibility alias, optional
field, or generated-client-only method.

After a public Protocol or Server `HttpApi` change, run `bun run generate`
from `packages/client` and inspect the generated diff; never edit its generated
trees directly. At a clean verification boundary, `bun run check:generated`
asserts that the checked-in output is current. If the merged
`packages/opencode` public OpenAPI changes, the `packages/sdk/js` generator
owns `src/v2/gen` as described by that package's guide.

Focused checks: `bun test test/session-cursor.test.ts` and `bun run typecheck`
from `packages/protocol`, plus the exact Server/OpenAPI and generated-client
checks affected by the changed group.
