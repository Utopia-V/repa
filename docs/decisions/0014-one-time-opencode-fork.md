# ADR-0014: Fork OpenCode once into an independent learning-native Repa

Status: Accepted

Date: 2026-07-13

Supersedes: ADR-0001 and ADR-0011

Amends: ADR-0012's runtime and persistence composition

Implementation note: the one-time fork and identity-isolation Gates have now
passed. References below to `.reference/` describe the pre-fork decision-time
layout; current lineage and evidence are recorded in the
[fork ledger](../fork-ledger.md).

Amendment (2026-07-14): exclusion from the first baseline governs product
reachability and release commitment; it does not by itself require physical
source deletion. This amendment resolves an internal contradiction in the
original text and restores the maintainer's stated preservation default.

## Context

The first Repa-owned Tutor loop proved several learning invariants: relevant
state can cross a fresh Session without transcript replay, a model can initiate
source-bound learning commands, Course and Agenda meanings remain separate,
and a later model sample can consume newly committed learning state. It also
exposed the cost of owning an incomplete generic harness.

The current runner is one-shot, flattens several model/tool steps into one
assistant string, has no measured compaction path, and places authoritative
model-operation settlement in an AI SDK callback whose exceptions are ignored
by that library. Completing a local terminal Agent would require Repa to own a
coupled set of Session, typed-item, tool, cancellation, recovery, permission,
context, extension, and TUI mechanics. Repeatedly designing a supposedly
"complete but minimal" subset has already produced local-gradient work and
untrusted bespoke structure.

The maintainer clarified the intended product boundary:

- Repa should eventually contain a complete **local** Agent harness; cloud,
  marketplace, sharing, and other group-product surfaces are not required.
- Learning is the product's first-class meaning, not a plugin or overlay on a
  coding product.
- Existing local capabilities should normally remain available unless they
  create a demonstrated compatibility or maintenance problem.
- Reuse is evaluated as a reduction in the computational sense: a learning
  behavior may be implemented through an existing mechanism when that
  reduction preserves the learning behavior's ownership, identity, lifecycle,
  correction, and failure contract. The two concepts need not become one.

The pinned OpenCode `v1.17.18` source is MIT-licensed, uses TypeScript/Bun and
the same AI SDK generation as Repa, and already contains the mature local
Session, typed message/part, provider, tool, permission, MCP, subagent,
compaction, cancellation, and terminal mechanics that Repa otherwise intends
to build. Its released v1 path already persists interaction state in one
SQLite database. Its EventV2 commit path runs projection and a supplied commit
effect in one transaction. The preview v2 runner is not a production
alternative: its own parity record still marks essential context, plugin,
tool, provider, recovery, and Windows behavior missing or partial.

The source audit remains in the immutable oracle and is indexed as
[pre-fork source audit](../fork-ledger.md#pre-fork-source-audit).

## Decision

### Product lineage

Repa will take a **one-time full-history fork** of OpenCode `v1.17.18` and then
evolve as an independent product. The fork is a code lineage, not a runtime
dependency, sidecar, plugin host, compatibility target, or promise to follow
OpenCode's product roadmap.

The fork must be obtained from a full upstream history outside `.reference/`.
The existing `.reference/opencode` checkout remains pinned, ignored, and
read-only research evidence; production source is never copied or imported
from that checkout. The fork preserves the MIT license and records the upstream
tag and commit.

Repa owns its binary, package composition, default Agent behavior, system
context, terminal surface, application paths, configuration, database,
migrations, and future release history. OpenCode names may remain temporarily
inside inherited implementation where renaming would add risk without changing
product behavior, but OpenCode's coding semantics do not remain the product
center.

### Runtime baseline

The first Repa fork uses OpenCode's mature v1 Session/provider/tool/TUI path.
It does not ship a v1/v2 dual runtime and does not wait for or complete the
preview v2 rewrite. Useful v2 ideas may be adopted later through Repa-owned,
consumer-driven changes; v2 code and migrations have no production authority
merely because they exist in the inherited repository.

When OpenCode v2 is released and demonstrates the local context, plugin, tool,
provider, recovery, and Windows behavior Repa depends on, the project will
perform a new evidence-based comparison. That is a review trigger, not a
promise to rebase, preserve upstream compatibility, or replace accumulated
Repa learning behavior. Repa may adopt a proven server topology or other
mechanism selectively when it reduces current product complexity. Until then,
keep the v1 ownership seams narrow enough to replace, but do not build preview-
v2 adapters or speculative compatibility layers.

Local capabilities such as file read/write/search, shell, patching, Git, LSP,
worktrees, MCP, and subagents remain available by default when their mechanics
are sound. Coding-specific prompts, agents, routes, and projections are
retained only as optional capabilities or are removed when they conflict with
the learning-native product surface. OpenCode `todo`, project, diff, message,
or tool data never silently becomes Agenda, Course, learner evidence, or other
learning authority.

The ordinary model-visible product identity is replaced rather than layered.
Every provider-selected interactive path implements the same Repa product
contract and accepts the same Learning-System composition inputs; exact prompt
rendering may vary for demonstrated provider transport or tool-use
requirements. The base prompt is not the Tutor. Tutor remains the integrated
behavior produced by runtime mechanics plus source, Course, learner, Agenda,
policy, and other bounded learning contributions. Hidden Session calls such as
compaction, summary, title, and helper agents use narrow Repa-owned prompts for
their actual task; they do not receive the full interactive context, preserve
a coding-first product identity, or discard learning continuity.

Code review, repository initialization, and similar behavior may remain
explicit local capabilities; they do not govern ordinary learning Sessions.
Account, share/import-share, sync/control-plane workspace, marketplace, and
comparable group-product commands, routes, configuration, and background
behavior are excluded from the baseline. Exclusion means that ordinary users
cannot register, discover, configure, auto-start, or accidentally network into
the behavior, and that current builds and releases make no support promise for
it. Source and direct tests may remain hibernated when they impose no concrete
compatibility, security, build, or maintenance cost.

Physical deletion is a separate disposition requiring evidence of an active
conflict, continuing maintenance burden, security risk, or explicit product
rejection. Dependency closure, lack of current callers, and recoverability from
Git history are not sufficient evidence. Mixed modules are classified by their
independently useful effects before dependency analysis: a local command does
not inherit the product category of an optional hosted branch merely because
it imports it. In particular, local pull-request checkout and launch may remain
an explicit capability after OpenCode share-link import is removed; hosted
GitHub automation may remain unregistered and hibernated.

### Native database

The fork has one Repa-owned SQLite database, `repa.db`, for one LearnerHome.
There is no second Repa state database, dual write, sidecar reconciliation,
or shadow copy of the inherited Session/tool lifecycle.

Inherited Session, message, part, permission, and durable interaction-event
mechanics may become Repa's Interaction authority after their meanings and
identities are made explicit. Source/artifact, Course View, Material Map,
learner record, Agenda, and Tutor policy remain separate first-class schemas
inside the same modular monolith. Learning facts do not enter generic message
JSON, Session metadata, OpenCode `todo`, or a universal event table.

A real learner input, synthetic/compaction input, model sample, tool
invocation, context cut, and terminal Turn outcome keep distinct durable
identities. The exact replacement schema is earned by the fork verification;
the old Repa interaction tables are behavioral oracles, not compatibility
tables to preserve in parallel.

When a local learning command commits, its domain transition, immutable
receipt, physical invocation settlement, and exact model-visible tool result
commit in one SQLite transaction. The fork will adapt the inherited EventV2
transaction seam rather than add a reconciler. External file/network effects
remain outside that transaction and use explicit idempotency and acceptance
boundaries.

### Learning-first composition

ADR-0012's learning-centered dependency direction remains normative. The
generic runtime owns execution mechanics; it does not interpret learning text
or query learning tables directly. Tutor composition obtains bounded typed
contributions and sample-bound capabilities from the learning authorities.
Learning commands validate trusted identities, source revisions, permissions,
and legal transitions independently of the model and runtime.

Before new Repa-owned machinery is introduced, the design must attempt a
behavior-preserving reduction to an inherited or mature mechanism. The
reduction succeeds only if the learning consumer's observable contract and
failure properties remain intact. A failed reduction is evidence for a
learning-native boundary, not permission for an adapter stack or a renamed
foreign concept.

### Cutover policy

No current Repa or OpenCode user-data compatibility contract exists. The new
fork starts with a new Repa home, database identity, and forward-only Repa
migration history. The pre-fork runner, schema, and labs now exist only in the
immutable oracle; any pre-fork database remains external development evidence.
None is imported or admitted into the fork. Once the fork satisfies its
verification gate, it becomes the sole product line and any transitional
compatibility code that actually exists inside the fork is removed rather than
wrapped. Cutover does not rewrite or delete the oracle.

## Consequences

- ADR-0001 remains useful history for the pinned research checkout but no
  longer governs production lineage.
- ADR-0011's Repa-owned AI SDK runner is superseded. Its demonstrated learning
  traces remain behavioral oracles.
- ADR-0012 remains the product architecture, amended so the outer Agent
  runtime and native Interaction database are inherited and transformed from
  the fork rather than built around `runTutorTurn`.
- ADR-0005's distinction among learner Turn, model operation, tool settlement,
  and terminal outcome remains; their physical identities may be remapped to
  inherited message/part records rather than duplicated.
- ADR-0006's atomic local learning transaction, ADR-0008's model-write
  authority, ADR-0009's invocation/effect separation, ADR-0010's policy state,
  and ADR-0013's conditional-purpose topology remain in force.
- The repository stops extending ALS-024, the one-shot runner, or other
  learning-state candidates before the fork baseline is established.
- Complete local harness capability is an explicit product destination, but
  learning semantics determine defaults, context, durable meaning, and the
  acceptance traces used to admit inherited capabilities.

## Verification gate

The fork direction is accepted; its first implementation still has a hard
gate. A pinned Windows build must demonstrate one coherent trace through the
native Repa database:

```text
scripted learner input
-> real provider sample
-> local learning command and atomic tool settlement
-> next sample sees the new learning revision
-> non-model-friendly material is translated to a recorded readable artifact
-> later Turn and fresh Session reuse the artifact and learning state
-> cancellation, injected failure, restart, and compaction remain truthful
```

Failure to build the v1 baseline on supported Windows, inability to commit a
learning transition and tool result atomically in the inherited SQLite path,
or a need to maintain two production runners invalidates the implementation
shape and requires returning to this decision. It does not revive the old
selective-reimplementation default automatically.
