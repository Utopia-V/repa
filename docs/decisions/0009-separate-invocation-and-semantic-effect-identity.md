# ADR-0009: Separate physical invocation identity from semantic effect identity

Status: Accepted
Date: 2026-07-11

## Context

ADR-0006 requires exact replay of one local learning operation to be
idempotent. The B1 executor implements that rule by deriving both the learning
operation ID and the tool settlement ID from one model tool-call ID.

ALS-017 exposed a different retry path. Compaction or a later model sample can
show the same admitted learner input again while producing a new physical tool
call. A deterministic probe then submitted the same source-linked `read`
effect twice with different call IDs and successive valid revisions. Both
writes committed. The current view hid the duplication by grouping progress,
but durable history contained two active records.

This is not a SQLite atomicity failure. It is an identity error: one physical
delivery was being used as the identity of the intended learning effect.

HTTP's definition of idempotency makes the useful distinction explicit: the
intended effect may happen once even though a server separately logs every
request. See [RFC 9110 section 9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2).

## Decision

Model-initiated local writes distinguish three identities:

1. **Durable causal occurrence**: the command-defined admitted Input, completed
   activity, attempt, correction, commitment slot, or domain entity transition
   that makes the effect eligible. A parent Turn alone is not always precise
   enough. Reinserted context retains the occurrence identity.
2. **Physical invocation**: one concrete tool call and its settlement. A retry
   or later sample may create another invocation.
3. **Semantic effect**: the domain change the command intends to make exactly
   once for that admitted cause and effect slot.

Each write command owns its causal-occurrence rule and semantic effect address.
The address is composed from that runtime-bound occurrence plus the command's domain target or slot. It
is not a global hash of the whole JSON request, model-generated prose, or the
physical call ID.

Provenance is separate from identity. A source item answers why a record is
supported and where it can be inspected. One source may support several
different effects, and resampling may produce a different assistant/tool source
for the same effect. A duplicate invocation cannot silently replace the
provenance retained by the first admitted effect.

For one local command transaction, the executor follows this order:

1. An exact replay of a settled physical invocation returns its stored
   settlement. Reusing that invocation ID with different input is a conflict.
2. The executor derives the command-specific semantic address from trusted
   runtime context and looks for an existing effect before rejecting a stale
   revision.
3. If the same effect already exists with the same semantic payload, the new
   physical invocation settles as already applied. It does not change domain
   state or advance the learning revision. The result exposes the effect's
   current active, expired, retracted, or superseded state where relevant.
4. If the address exists with a conflicting payload, the command fails. A
   correction or superseding command is required; the executor does not choose
   one payload silently.
5. If the effect is new, normal source, permission, precondition, and revision
   validation runs. The effect and that invocation's settlement commit
   atomically under ADR-0006.

Several physical invocation rows may therefore refer to one semantic effect.
SQLite uniqueness and a write transaction serialize first admission; the
application then distinguishes an identical replay from a semantic conflict.
SQLite provides only one concurrent writer and supports transaction-scoped
constraint handling, so no additional distributed coordination mechanism is
introduced. See [SQLite transaction behavior](https://www.sqlite.org/lang_transaction.html)
and [constraint conflict behavior](https://www.sqlite.org/conflict.html).

An intentional repeated occurrence needs a new command-valid causal occurrence
or a domain-owned entity/slot that distinguishes it. A new learner Input is a
new report occurrence, but it does not automatically authorize creation of a
duplicate assignment or revisit. Identical text in a genuinely new learner
input is not a replay. Conversely, context compaction cannot create a new
occurrence merely by copying old text.

This decision does not claim to recognize semantically similar arbitrary
language. Commands define narrow effect identity only where duplicate effects
have a concrete failure cost.

## Consequences

- `toolCallId`, `invocationId`, and durable learning-effect identity are no
  longer interchangeable names.
- A global canonical-payload hash is rejected. It would treat runtime time and
  revision as meaning, miss paraphrases, and conflate provenance with effect
  identity.
- Command-specific examples may include one progress proposition for an
  admitted cause and target, one scoped-policy contribution slot for an input,
  or one attempt with a domain-owned attempt ID. Their exact production shapes
  remain local decisions.
- Semantic replay is checked before stale-revision rejection. A duplicate
  effect stays a duplicate even after unrelated state advanced.
- New effects still require the current revision. Idempotency is not permission
  to apply a previously uncommitted stale command.
- Source admissibility remains a separate policy. Preventing a duplicate does
  not prove that a new `continue` Turn is entitled to recreate an old progress
  fact.
- Per-Session or per-course revision refinement can be considered if real
  parallel writers make the current global revision a bottleneck. It is not
  needed to settle this identity boundary.
- Invocation creation and effect settlement have separate trusted times. A
  delayed in-process execution cannot backdate admission to the tool-call time,
  and startup recovery fails orphaned calls instead of executing them.
- A write command that cannot name a durable causal occurrence and unambiguous
  domain address is not yet safe for automatic model writing.

## Counterexamples

### New call ID creates a duplicate progress record

The same admitted learner item is reinserted after compaction. A second model
sample emits a new call ID but the same progress proposition. Treating the call
ID as the operation ID creates a second active fact and violates this decision.

### Same text in a new Turn is suppressed

The learner reports the same activity again on another day in a newly admitted
Turn. Text or payload deduplication suppresses it even though it is a new
occurrence. Semantic identity must retain the new admitted cause.

### Retry changes the payload silently

Two invocations use the same cause and effect address but disagree on the
target or applicability. Last-write-wins would hide a model inconsistency. The
second invocation must conflict or use an explicit correction transition.

### Provenance becomes the effect key

One learner item both reports reading and gives a temporary Tutor instruction.
Using the source item alone as a key allows only one effect. The source remains
shared provenance; each command owns a distinct effect slot.
