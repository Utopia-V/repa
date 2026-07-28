# Inherited preview-v2 generated client

Status: private, hibernated OpenCode preview-v2 source-maintenance package.
It is not the released-v1 Repa client, protocol authority, product API, or
runtime direction. Its only current workspace consumer is the likewise
hibernated `packages/sdk-next` package.

Current Repa authority is indexed by the
[documentation map](../../docs/README.md).

The package retains Promise and Effect client generation experiments over the
preview `HttpApi`. Generated output describes the contract present in this
source tree; older examples and upstream plans do not prove that an endpoint
still exists. In particular, the current generated Session group has no
`prompt` operation.

When deliberately maintaining this hibernated source, run `bun run generate`
after changing the corresponding Protocol or Server `HttpApi`, and use
`bun run check:generated` to detect generated-output drift. Do not import this
package into Repa's released-v1 runtime without a new architecture and
composition decision.

For current Repa meaning and runtime status, start with
[the documentation map](../../docs/README.md) and
[the inherited-material index](../../docs/inherited/README.md).
