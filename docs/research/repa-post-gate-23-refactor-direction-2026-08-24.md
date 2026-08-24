# Post-Gate 23 learning-kernel refactor direction

Status: Maintainer-directed forward-development record, 2026-08-24. The search
and derivation constraints in this document are active. Named technical shapes
remain candidates where the conflict register says so. This document is not an
ADR, a Gate contract, a code-migration authorization, or a replacement for the
current status map. The current implementation is versioned
`0.0.1-experimental.0` as an initial experimental prototype and is not presently
usable; accepted Gate behavior remains evidence, not a usability claim.

## Purpose and lifecycle

Gate 23 established one integrated released-v1 Repa product loop. That result
is real implementation and behavioral evidence. It does not make the sequence
of domain owners, schemas, tools, Context sections, or harness dependencies
that accumulated on the way into the required shape of the next architecture.

This record gives future architecture and Gate authors a stable place to find:

- the forward-search constraints that now apply;
- the candidate learning-kernel vocabulary that may organize experiments;
- exact conflicts with current decisions and implementation; and
- the evidence or owner revision required before a candidate becomes
  implementation authority.

Stable product meaning remains in the
[product foundation](../foundation/00-product-origin.md), current system
boundaries remain in the architecture documents, and source plus
[`building/current-system.md`](../../building/current-system.md) record
revision-bound implementation facts. Volatile Gate disposition remains in the
[documentation map](../README.md), Gate topology remains in
[Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md), and exact
correction provenance remains in the [fork ledger](../fork-ledger.md).
This record owns only the unresolved forward-refactor disposition. It retires
when every live row below has been accepted into or rejected by its owning ADR,
architecture and roadmap, and the behavioral constraints have executable
owners.

## Direction now in force

### Shape the search space from product behavior

For successor or substantial refactor work, the current system is a behavior
and problem oracle, not an architecture oracle. Current source still
establishes what the product actually runs today; the distinction prevents an
agent from assuming that every existing noun, table, revision type, settlement
path, Context section, prompt rule, or regression test must be reproduced.

The compact [product constitution](../foundation/00-product-origin.md#product-constitution)
has priority over architecture inferred from source proximity. The
[four cross-implementation scenarios](../../building/learning-situations.md#四个跨实现行为-oracle)
give design and later tests a small behavioral loss function. Passing an old
test proves only the behavior that test can distinguish.

### Derive a semantic difference before code

Work that changes learning behavior, durable meaning, or architecture first
states the current and intended learner-visible result, the open semantic work
owned by a model, the deterministic work owned by the program, whether a new
persistent concept is actually needed, and the scenario that distinguishes the
change. The full checklist lives in
[`building/development.md`](../../building/development.md#从学习行为进入代码).

The default is no new long-term owner, record kind, or default Tutor learning
tool. An exception needs at least two real scenario consumers, a demonstrated
failure of the existing shared shape, and a revision to the decision owner that
admits the new meaning. This constraint does not block repairs to current
production behavior or owner-native correction of existing data.

### Separate interpretation, criticism, and implementation

A consequential refactor separates three responsibilities:

1. Product interpretation derives the behavior problem, invariants, and
   observable result from the foundation, learning situations, and learner
   evidence before current domain implementation can anchor the answer.
2. Architecture criticism reads that interpretation and the current code,
   looking for accidental implementation-as-product, duplicated mechanics,
   responsibility inversion, and complexity not earned by a real risk.
3. Implementation receives the clarified semantic difference and modification
   boundary; it does not redefine the product goal around the easiest local
   patch.

These are responsibility boundaries, not a requirement to use three people or
three agents for every task. Existing independent Gate-review requirements
continue to apply.

### Preserve a minimum faithful system

A narrow successor slice may reduce material sources, move breadth, tool count,
data kinds, and carrier surface. It must retain the full loop:

```text
current request
    -> bounded learning situation
    -> selected teaching or learning move
    -> learner interaction or real work
    -> durable information only when it can change later behavior
    -> revised situation and another move
```

This prevents a small slice from becoming a chat system with a memory table and
then accreting learning behavior as optional features. Gate 23 already proves
that the current runtime has an integrated and a zero-write loop; a successor
must preserve those behaviors rather than claim they are absent today.

### Move constraints into the repository

Documentation establishes direction but cannot by itself change an agent's
local optimization path. Once an architecture choice is accepted, its owner
must identify the smallest decisive package-dependency check, schema or tool
catalog snapshot, scenario test, or other executable boundary that makes the
faithful path the shortest passing path. Until then, no speculative lint or
framework is authorized by this record.

## Candidate learning-kernel vocabulary

These names organize comparison; they do not create production entities.

| Candidate | Useful question | Current disposition |
| --- | --- | --- |
| **Learning Situation** | What bounded view of the current request, material, relevant history, obligations, time and constraints lets the Tutor act now? | Already valid product language. It is a temporary projection, not a new durable fact. Whether it replaces or wraps the current `LearningContext` cut is unresolved. |
| **Learning Move** | What kind of teaching, learning or real-work action is useful now, with what objective, target, expected learner activity and evidence? | Already valid product language. No separate durable `LearningMove` owner or fixed taxonomy is accepted. |
| **Learning Record** | How much source, version, correction, retraction, idempotency, conflict and inspection machinery can be shared without collapsing distinct meanings? | A candidate common envelope and mutation boundary, not a universal fact owner. ADR-0012 conflicts with a semantic collapse. |
| **Learning Object** | Can Courses, concepts, skills, material sections, problems, projects and assignments share identity or relations while remaining partially structured? | A candidate ontology. No universal object or graph authority is accepted. |
| **Learning Policy** | Which deterministic constraints, heuristics or model judgments should produce or rank candidate moves while the current request remains central? | An open mechanism question. No program-owned global priority, scheduler, mastery authority or final semantic selector is accepted. |
| **Learning Store** | Can an Agent-harness-independent API own events, records, sources, relations, schedules and retrieval without inventing a database engine? | A possible engineering boundary. SQLite remains sufficient unless evidence establishes another need; no proposed table list is a schema decision. |
| **Pi-based vertical slice** | Would a smaller mature Agent core and TUI preserve the required harness invariants with less product-irrelevant weight? | A comparison or experiment candidate only. It directly conflicts with current ADR-0014 runtime direction until that owner is revised. |

## Current implementation conflict register

| Reconciliation item | Current truth and evidence | Conflict and required disposition |
| --- | --- | --- |
| Current-system oracle boundary | ADR-0014 and Gate 23 make the full-history fork and released-v1 spine the actual current runtime, not a discarded prototype. [`building/current-system.md`](../../building/current-system.md) describes that path. | This is an active interpretation constraint, not permission to ignore or delete the runtime. Preserve current behavior and repair obligations until an accepted successor decision exists; do not infer future architecture from current nouns alone. |
| Smaller default Tutor tool surface and situation-loaded capability | [`registry.ts`](../../packages/opencode/src/tool/registry.ts) registers a broad coding and learning catalog, then filters by model, permission and authority. [`repa.txt`](../../packages/opencode/src/session/prompt/repa.txt) carries many owner-specific write conditions. | This is a candidate probe. The current catalog is filtered, so “all tools are always exposed” would be false. Measure the visible catalog and model behavior in the four scenarios before choosing a smaller catalog, dynamic loading, or a unified commit tool. |
| Harness-independent learning kernel | Core owners such as [`assignment.ts`](../../packages/core/src/assignment.ts), [`future-attention.ts`](../../packages/core/src/future-attention.ts), [`learner-state-judgment.ts`](../../packages/core/src/learner-state-judgment.ts), [`advisory-plan-suggestion.ts`](../../packages/core/src/advisory-plan-suggestion.ts), and [`learning-context.ts`](../../packages/core/src/learning-context.ts) directly use Turn, Session or physical-settlement types and tables. | This is a candidate response to a real coupling boundary, not proof that all dependencies are wrong. If an owning decision accepts a kernel/adapter split, it must classify which identity and transaction relations stay in the kernel, which move behind an adapter, and only then encode that accepted boundary in dependency checks. |
| Shared learning-record mutation mechanics | [`learning-command/runtime.ts`](../../packages/opencode/src/learning-command/runtime.ts) and Core learning-command code already share physical invocation, permission, replay and settlement mechanics. Assignment, FutureAttention, LearnerStateJudgment and AdvisoryPlanSuggestion still own separate revisions, sources, reads, schemas, SQL and semantic results. | This is a candidate probe. Shared physical settlement is not a shared semantic record. A common envelope would have to reduce repeated mechanics while preserving owner-specific meaning, legal transitions, epistemic status and correction; it cannot silently override [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md). |
| Partially structured `Learning Object` and relation layer | Current architecture gives Course, Course View, Material/Artifact, Material Map, Assignment, Goal and other meanings separate authorities; no `LearningObject` owner exists. ADR-0012 rejects a universal graph/fact model as the baseline. | This is a candidate ontology. At least two scenarios must show that shared identity or relations improve Tutor behavior and cannot be expressed through current references. A narrower mechanism must preserve current semantic owners; a universal object authority would require revising ADR-0012 and the native data architecture before production work. |
| Move proposal or ranking through `Learning Policy` | The ordinary interactive Agent currently owns open semantic move choice. The program owns Context delivery, time, permission, legal transitions and settlement. Gate 21 makes cross-day plans advisory rather than a scheduler; no independent production move selector was found. | This is an open mechanism probe. It must distinguish deterministic facts and constraints from open semantic priority, be earned by a causal failure in the scenario set, and not become global scheduling, activity/adherence inference, mastery truth or an override of the learner's request. |
| `pi-agent-core + pi-tui` host comparison | [ADR-0014](../decisions/0014-one-time-opencode-fork.md) currently chooses the one-time OpenCode fork, complete local Agent harness and released-v1 runtime destination. Gate 23 converges retained carriers on that spine. | This is a comparison candidate only. No Pi migration or second production runtime is authorized. A bounded comparison must first verify provider, tool, permission, Session, compaction, cancellation, recovery, TUI and security coverage; an accepted successor requires revising ADR-0014, architecture and roadmap before code migration. |
| Executable ownership of the four cross-implementation scenarios | Accepted [Gate 23 evidence](repa-gate-23-integrated-learning-system-product-loop-implementation-evidence-2026-08-23.md#deterministic-production-path-evidence) binds product-floor and zero-write traces; [Gate 18 evidence](repa-gate-18-learning-context-session-continuation-implementation-evidence-2026-08-04.md#deterministic-closing-evidence) binds Context and Session continuation; current [Assignment tests](../../packages/core/test/assignment.test.ts) cover deadline projection. No owning document currently designates an executable suite as the owner of these four exact scenarios and their Forbidden conditions. | Documentation now owns the scenario meanings. A later accepted implementation boundary must decide the executable harness and prove both current and successor behavior without exact-output tests or a single opaque score. |

## Evidence that can change the direction

The conflict register should move only when evidence answers a decision, not
when a candidate becomes attractive in prose. Relevant evidence includes:

- end-to-end observations for the four scenarios, including Context contents,
  visible tool catalog, move class, learner-visible result, durable writes and
  forbidden behavior;
- the number and semantic kind of change points required to add one genuinely
  useful record kind before and after a common mutation experiment;
- source, correction, stale-write, replay, transaction, migration, restart and
  inspection behavior for any shared record boundary;
- package dependency evidence for a harness-independent kernel;
- model comparisons that distinguish prompt/tool overload from errors caused
  by missing context, permissions, schemas or provider behavior; and
- a capability and security audit for any replacement harness.

File size, type count, a passing legacy suite, or a cleaner-looking schema may
motivate investigation but cannot settle a product or architecture boundary.

## Stop and transition rules

- Do not add a new long-term learning owner, another per-domain
  revision/effect/settlement stack, or a default Tutor tool merely to extend the
  existing search graph.
- Do not implement a universal Learning Record, Learning Object, deterministic
  Learning Policy, Pi migration, dual runtime, bulk data migration, or deletion
  of current owners from this record alone.
- Current-runtime bug, safety and data-integrity repairs remain in scope and
  continue to follow their existing owners and migration obligations.
- No Gate 24 or successor Gate is created here. Before a new Gate contract, the
  relevant conflict rows must be disposed by the owning product, ADR,
  architecture and roadmap layers; the repository's independent contract-review
  rule then applies.
