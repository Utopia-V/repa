# Generated typed clients

Code in this package must remain a generated Promise/Effect carrier for the
admitted `@opencode-ai/protocol` contract, not a product, runtime, or learning
authority. Follow
[Gate 5](../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md)
and the [system architecture](../../docs/architecture/00-system-architecture.md).

This is a required generation boundary, not a claim that current generated
files or consumers are correct. Compare generator input, output, exports, and
production registration with Protocol and Server authority; a mismatch is a
conformance defect, not a client-owned compatibility requirement.

## Ownership and generation

In the recorded generator layout, `src/contract.ts` supplies code-generation
names, omissions, and middleware identity for the accepted Protocol API.
Verify the generator continues to consume that contract. `src/generated` and
`src/generated-effect` must remain reproducible outputs of `script/build.ts`;
never hand-edit them or add a client-only compatibility method for a route
absent from Protocol and admitted production Server composition.

The plain `@opencode-ai/client` entry must remain a dependency-isolated Promise
surface. The optional `/effect` entry may depend on Effect, Schema, and
Protocol, but public runtime code must not pull in Core or Server. Dev-time
generation may use those packages without changing that browser/runtime
boundary.

Generated output must preserve the same terminal-only, directory-local
surface as its owners. It cannot restore preview-v2 Session execution, remote
Workspace/sync/control-plane, sharing, Console/account, hosted Web, updater,
or marketplace methods merely because an old artifact or SDK once had them.

For a public Protocol or Server `HttpApi` change, run `bun run generate` and
inspect the generated diff. Then run `bun run typecheck` and the focused client
test from `packages/client`. At a clean verification boundary,
`bun run check:generated` asserts that checked-in output matches the generator.
Pure handwritten client changes run only the checks that can falsify their
import or behavior contract.
