# First production Agenda future-attention slice

Date: 2026-07-12

Status: Implemented production slice derived from ALS-020. The implementation
and tests close the first durable future-attention boundary; they do not close
the wider teach-adapt-return product pressure path or prove teaching quality.

## Goal

Implement the first production consumer of Agenda meaning through the shared
Tutor loop:

```text
current learner input and current Course View item
-> model initiates one source-linked future-attention concern
-> concern survives close/reopen and a fresh Session
-> trusted time makes it eligible without forcing selection
-> learner supplies a later response
-> model explicitly records that the scheduled attention occurred
-> concern leaves routine open context without creating mastery or evidence
```

This slice proves durable product semantics and runtime integration. It does
not prove that the chosen teaching move is educationally effective.

## Semantic checksum

Product-loop purpose:
  remember why later attention matters and make it affect a future Tutor move

Owned durable meaning:
  Agenda owns one correctable future-attention concern and its disposition

Representative behavior:
  a delayed independent check of the current course item appears in a fresh
  Session and is addressed only after a later learner response

Counterexample:
  merely reaching the time, beginning a question, matching the topic, receiving
  a guided answer, or completing an assignment does not address the concern

Failure and correction:
  exact replay is idempotent; conflicting replay, stale target/entity, failed
  settlement, interruption, and restart create no partial or duplicate meaning;
  explicit learner dismissal, supersession, and reopening preserve the old
  source and transition history

## First-consumer limits

These limits avoid pretending to solve the full Agenda. They are extension
boundaries, not permanent product ontology.

- The target is the current item in the persisted model context's active Course
  View: course ID, immutable view revision, and item ID. The model supplies none
  of those trusted IDs.
- Route advancement does not stale the target. Superseding the Course View does;
  the old reference remains inspectable and must be explicitly superseded or
  dismissed rather than silently re-anchored.
- Activation uses one absolute `notBefore` time with an explicit UTC offset.
  Eligibility is derived at context-query time and is not a stored event,
  deadline, priority, or claim that the learner forgot.
- `notBefore` controls when the Tutor should proactively select the concern; it
  is not a lifecycle gate. If a later, purpose-aligned occurrence happens
  organically before that time, Agenda may record it as addressed and avoid a
  redundant return. When elapsed delay is itself part of the purpose, an early
  occurrence is not purpose-aligned and must not be used to address it.
- One admitted learner source plus one exact Course View target owns one create
  slot. Exact semantic replay returns the same concern. A different reason or
  activation in that slot conflicts and must use explicit supersession or a new
  admitted source. This narrow cardinality does not claim that the future
  product supports only one concern per message or target.
- The first model-facing address transition binds the current admitted learner
  item as the later occurrence. The domain contract may accept a completed
  assistant occurrence, but this runtime does not expose that path yet.
- No attempt, activity, learner-evidence, mastery, scheduler, assignment, goal,
  notification, recurrence, or general target union is introduced.
- Retained learner steering and future attention remain separate authorities.
  Steering is an already-operative temporary constraint on Tutor behavior and
  its `validUntil` is an expiry. A one-time learning return at or after
  `notBefore` is an Agenda concern, even when the learner explicitly requested
  it in the current Turn.

## Authority and authorship

Interaction owns the admitted source item, model operation, tool invocation,
and complete later occurrence. Course View owns the target identity and
revision. Agenda stores typed references to them plus its own reason,
activation, entity version, and lifecycle. Tutor composition reads a bounded
projection. No module copies another authority's source text into its own
record.

Creation distinguishes:

- `learner_requested`: the model supplies an exact bounded excerpt from the
  current learner input, and the executor verifies it; and
- `tutor_initiated`: the model semantically authors a routine reversible
  concern without claiming that the learner promised it.

Both are model-initiated tool calls. The distinction records semantic basis,
not execution authority.

## Legal meanings and transitions

The initial conceptual states are `open`, `addressed`, `dismissed`, and
`superseded`. These names belong to this bounded aggregate; they are not a
global workflow.

### Create

Creates one `open` concern from the current learner source and current Course
View target. A routine explanation, error, time crossing, or direct-help action
never invokes this transition automatically.

### Address

Requires:

- an `open` concern visible in the persisted context cut;
- its expected entity version;
- a legal complete occurrence later than creation;
- a still-current Course View target; and
- an inspectable model-authored purpose-alignment rationale.

The transition means only that the promised future attention occurred. The
learner response may be correct or incorrect. No learner evidence is written.

The model-facing tool initially binds the current admitted learner item as the
occurrence. A reusable domain transition must not encode “learner only”: a
completed assistant item can be a legal occurrence once a later runtime seam
can invoke the command after that item is durably complete.

### Dismiss

Requires an exact excerpt of current learner intent. It removes an `open`
concern from future attention without claiming that the purpose was served.
Tutor judgment alone cannot use the first dismissal tool.

### Supersede

Requires an exact learner correction excerpt. One transaction preserves the
old concern as `superseded`, creates one source-linked successor against the
correct target, records both meanings, and settles the invocation. If the old
Course View is still current, changing timing or purpose preserves the exact old
item even after route progress. Only reconciliation from a superseded Course
View binds the successor to the sampled current item. A separately committed
create command cannot later be absorbed as the successor.

### Inspect and reopen

Routine context contains open concerns only. When the learner says an earlier
address or dismissal was wrong, a bounded active-course inspection can expose
recent terminal dispositions without loading their old source text. A later
model context in the same Turn may then reopen an `addressed` or `dismissed`
concern from an exact current learner excerpt. The old transition remains in
the ledger, entity version advances, and no evidence is created.

Inspection is a capability grant, not a guessable-ID bypass. A mutation may use
the grant only when the inspection completed before the mutation's model
context was sampled; two parallel calls from one sample cannot pretend the
second call saw the first result.

## Identity, persistence, and failure

- Agenda creates concern and transition IDs; the model cannot provide them.
- Create semantic identity is the runtime-bound learner occurrence plus the
  exact Course View target slot. It is not a tool-call ID or hash of model prose.
- Transition identity is the current learner occurrence plus the concern and
  transition slot. Exact replay is checked before entity-state rejection.
- A second physical invocation can settle against the existing semantic effect
  without advancing state. Conflicting payload in the same slot fails.
- Provider tool-call IDs are physical and may repeat in later model operations.
  Runtime identity therefore scopes them to the model operation; exact retries
  reuse the original invocation and receipt timestamps.
- All local tools in one Turn execute through one process-local FIFO lane. A
  model context may initiate at most one durable learning-state mutation; a
  second mutation from the same immutable context returns
  `context_refresh_required` and waits for a new sample. Reads also use the lane
  because invocation and receipt settlement are durable Turn events.
- Turn event time includes user, assistant, and tool Session items as well as
  model and invocation events. Runtime timestamps use a monotonic Turn floor,
  so a regressing wall clock cannot strand partially settled work.
- Concern entity version, target revision, source chronology, and current
  lifecycle are the actual preconditions. The global state revision remains a
  context/audit watermark, not an unrelated-write stale guard.
- Agenda payload lives in Agenda tables. `durable_effect` remains the immutable
  causal receipt and tool-settlement link; its JSON is not the Agenda database.
- Domain change, immutable receipt, entity transition, global commit watermark,
  and tool settlement commit in one SQLite transaction.
- Startup recovery never executes an orphan tool. Exact completed effects
  survive reopen; failed or interrupted execution leaves zero Agenda change.

Runtime-ordering provenance: AI SDK `6.0.168` eagerly dispatches completed tool
calls and does not serialize their `execute` callbacks; the package version is
pinned by `bun.lock`. ADR-0005 and
[`../research/tool-lifecycle-contracts.md`](../research/tool-lifecycle-contracts.md)
already require a monotonic Turn lifecycle and permit provider-order serial
execution. Codex `rust-v0.144.1` was compared at
`.reference/codex/codex-rs/core/src/tools/parallel.rs`: it uses an opt-in
read/write distinction. Repa deliberately uses the smaller per-Turn FIFO
because every current local tool writes invocation and receipt state and Repa
has no out-of-order result buffer. The preserved invariant is causal settlement
order; no Codex source is imported and no general scheduler is introduced.

## Context and lazy detail

Each immutable Tutor context cut receives a bounded list of open concerns for
the active course. A compact contribution contains only:

- concern ID and entity version;
- exact Course View target and title;
- bounded reason;
- author/basis;
- `notBefore` and derived `upcoming` or `eligible` state;
- target-current or target-superseded status; and
- the lazy source item reference.

The model-facing adapter labels concern ID and entity version separately. The
version is a host-bound precondition, not a suffix the model must remove from
the ID before calling a concern tool.

The full learner source, earlier assistant response, material text, and old
Session remain absent. A concern-scoped read tool may retrieve only its linked
source item and a bounded immediately preceding assistant item. Its model result
may contain text; durable tool settlement and Session receipt retain only the
references and projection metadata. Long sources use a bounded window that
contains the verified learner excerpt rather than an arbitrary prefix, and a
terminal replay resolves the exact recorded window.

The prompt states that eligible means candidate, not mandatory review,
forgetting, selection, completion, or mastery. Current learner steering and
real work may still take priority.

## Runtime seam deliberately left open

`runTutorTurn` currently persists one assistant item only after the whole
multi-step stream completes. A model tool call therefore cannot truthfully cite
its own later prose as an already complete occurrence.

This slice does not add pending completion, infer completion from stream deltas,
or mark an explanation-purpose concern addressed before the assistant item is
durable. A later architecture decision will compare durable per-step assistant items
with an after-response application seam. Until then, only the current complete
learner item is bound by the model-facing address tool.

## Implemented production files

- `src/learning/agenda/future-attention.ts` — domain aggregate, transitions,
  compact/lazy queries, no AI SDK dependency.
- `src/learning/agenda/future-attention-tool-execution.ts` — restore trusted
  invocation/context/source, parse untrusted input, execute and atomically
  settle.
- `src/runtime/agenda-tools.ts` — AI SDK/Zod capability binding only.
- `src/runtime/tutor-tool-binding.ts` — shared invocation/receipt binding now
  earned by course, steering, and Agenda tools.
- `src/storage/open-database.ts` — ordered schema 4 migration only.
- `src/tutor/compile-context.ts` and `render-system-prompt.ts` — bounded Agenda
  projection and policy rendering.
- focused domain, capability, migration, and fresh-Session tests.

## Verification evidence

1. Domain tests cover create replay/conflict, strict civil time, chronology,
   target staleness, target preservation after route progress,
   address/dismiss/supersede/reopen distinctions, entity version, lazy source
   bounds, rollback, and assistant-completion truthfulness.
2. Capability tests cover fresh-Session terminal inspection and correction,
   same-sample inspection denial, semantic replay, physical retry, settlement
   rollback, invalid dates, restart, and guessed or post-sample IDs.
3. Shared runtime tests prove create, compact cross-Session carry, later
   address, fresh-Session reopen, no old-text leakage, and one mutation per
   immutable context cut.
4. Zero-write tests cover ordinary explanation, time crossing, starting a
   return, and direct deadline help. Agenda disposition creates no learner
   evidence or mastery state.
5. Interaction tests cover FIFO tool execution, provider-ID scoping, exact
   physical replay, Session-item chronology, startup recovery, and wall-clock
   regression.
6. Independent semantic, code, and adversarial reviews supplied counterexamples
   that produced the reopen path, target-preservation rule, strict timestamp,
   source-window, invocation, ordering, and chronology corrections.

ALS-021 has now run the remaining shared-policy pressure. It showed that the
Agenda concern survives a fresh Session but its purpose does not reliably
govern the selected teaching move. The next work belongs at the state-to-model
selection seam, not in a local Agenda expansion. This completed slice still
does not authorize an evidence model, scheduler, or claim about human
retention.
