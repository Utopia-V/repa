# Admitted Session data versus preview-v2 execution

Changes in this inherited subtree must preserve the deliberately split
disposition recorded by
[Gate 5](../../../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md),
[ADR-0014](../../../../docs/decisions/0014-one-time-opencode-fork.md),
and the repository [inherited-material boundary](../../../../docs/inherited/README.md).

That disposition is a constraint to verify, not a claim that every current
export or Layer already respects it. Source and preview-runner tests may reveal
implementation behavior but cannot expand the admitted runtime.

## Required split

Session schemas, storage, projectors, history/context reads, and selected data
services may support an admitted typed `/api` carrier. Each such use still
needs an admitted consumer and dependency direction. Their presence and `v2`
identifiers do not admit a second model runtime and do not make Session the
long-term learning-state owner.

Gate 5 classifies `SessionExecution`, `execution/local.ts`, and `runner/**` as
inherited preview-v2 execution machinery. Every production composition must
keep `SessionExecution` non-executing and contain no edge to that runner; the
recorded Gate 5 implementation used `SessionExecution.noopLayer`, but the
presence of that binding alone is not proof of the complete graph. The only
admitted production Agent executor is the released-v1 loop in
`packages/opencode/src/session`. Do not activate the local executor through a
production Layer, startup node, CLI, SDK, or Protocol endpoint without first
revising the owning product, architecture, and Gate decisions.

Direct preview-runner tests may remain useful for source maintenance or
comparison, but passing them is not evidence of production reachability. A
change to an admitted Session data projection requires its focused Core test plus
the affected Protocol/Server/OpenAPI consumer. A proposed execution change
must first prove why the released-v1 boundary is insufficient; implementation
cannot create that authority by import or registration.
