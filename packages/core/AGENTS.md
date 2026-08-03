# Repa Core package guidance

## Scope and authority

This package has mixed lineage. The accepted Repa documents assign some of its
subtrees to native learning authorities while inherited preview-v2 and generic
harness code also remains present. Package placement, an export, or an
unversioned name does not by itself make a module part of Repa's production
runtime or prove that the current composition is correct.

Begin with the repository [authority map](../../docs/README.md). Stable product
meaning belongs to the [product origin](../../docs/foundation/00-product-origin.md)
and accepted ADRs; the [system architecture](../../docs/architecture/00-system-architecture.md)
owns dependency and authority boundaries; the
[native learning data model](../../docs/architecture/01-native-learning-data-model.md)
owns logical learning-data meaning. Gate records preserve accepted local
contracts and evidence, while `docs/README.md` alone owns current disposition.

This guide projects those accepted boundaries into maintenance rules; it is
not a certification of the source tree. Imports, exports, registrations,
passing tests, and current call graphs are implementation evidence to audit
against the owners above. If they disagree, treat the source as a possible
implementation defect and repair or escalate the discrepancy rather than
rewriting this guide to legitimize it.

Git history may establish that Repa added a path, but authorship is not
correctness or product authority. Conversely, an accepted Gate is the current
contract and evidence owner, not immunity from a concrete counterexample. If
the counterexample reaches the contract itself, repair that owner and this
derived guide before changing dependent implementation.

Use these local scopes to route current changes to their accepted contracts.
The list does not independently settle whether every file is correctly placed;
exact module placement is normative only where an owning document says so:

- `src/database`: LearnerHome database identity, admission, ownership, and
  forward-migration composition.
- `src/course`: Course, Course View, immutable revision, item-membership, and
  working-selection authority.
- `src/learning-command`: shared physical invocation, causal receipt, atomic
  settlement, replay, and recovery substrate; it owns no domain effect meaning.
- `src/artifact`, `src/content-root`, `src/representation`, and
  `src/material-map`: separate source, authorization, derivation, and semantic
  structure authorities.
- `src/turn`: durable Interaction/Turn lifecycle rather than learning meaning.
- `src/learner-navigation`, `src/retained-steering`, and `src/learner-goal`:
  separate learner-continuity, Tutor-policy, and Goal authorities.
- `src/learning-bootstrap`: the current location of an application composition
  seam across existing owners. Gate 17 leaves exact module placement as an
  implementation detail and does not create another durable authority.
- `src/learning-frontier*` and `src/semantic-presentation.ts`: shared
  monotonic-commit and typed carrier projections. They compose owner results
  but do not become a universal event log, permission owner, or domain fact.

When a top-level file exposes one of these subtrees, it remains subordinate to
that same owner. Classify other inherited Core code by comparing its actual
reachability with the repository authority map: reachability proves exposure,
not product admission or correctness. In particular, the nested
`src/tool/AGENTS.md` is deferred preview-v2 maintenance guidance and cannot
select Repa's runtime; `src/session/AGENTS.md` states the accepted boundary
between data projection and executor that its current implementation must
satisfy.

## Dependency and change rules

- Learning-domain authorities may depend on small identity, schema, time, and
  native SQLite primitives. They must not import providers, the AI SDK,
  terminal code, or the released-v1 Session service.
- Keep semantic owners separate even when one transaction composes them. Do
  not replace them with a universal graph, fact/event table, Agenda record,
  manager/service/repository stack, or generic command bus.
- Domain owners expose consumer-specific reads and narrow transaction-scoped
  validation/application seams. Callers do not write owner tables directly.
- A schema, constraint, or trigger change that can affect an existing
  LearnerHome requires a Repa forward migration and frozen-predecessor evidence.
  Editing current helpers or generated schema alone is insufficient.
- Historical V1/V2 records retain their exact meaning. Current code may retire
  a producer without relabelling or fabricating old provenance.
- Do not add an empty authority, local `AGENTS.md`, schema family, or abstraction
  for future learner record, future attention, Assignment, planning, Context,
  or Tutor selection until its accepted consumer establishes the boundary.

Run focused tests from `packages/core`; broaden to `packages/opencode` or
`packages/tui` only when the changed dependency or carrier crosses that
boundary. Pure guidance changes need diff, link, and hierarchy checks rather
than product suites.
