# ALS-024 Stage 2 minimum-meaning ablation result

Date: 2026-07-13

Status: completed paper and production-code-path ablation. No lab, provider
call, production change, schema, harness, or new test was used.

## Verdict

The result is **partial**:

- **A is sufficient in meaning for the frozen Stage 1 fixture.** The existing
  Agenda transition already identifies the complete service occurrence. A
  bounded read can resolve the raw response from Interaction and combine it
  with the exact historical criterion. The later context may derive the local
  outcome or directly choose the move without a durable outcome record.
- **A is not currently exposed by production.** Recent Agenda inspection omits
  the service occurrence, and the existing source-read capability resolves the
  concern’s creation source rather than its service occurrence.
- **B is not earned by Stage 1.** The exact frozen answers admit a deterministic
  oracle, so that fixture proves the need for an outcome distinction, not the
  need to persist an independently authored observed outcome.
- **C is eliminated.** Copying response, question, criterion, or assistance into
  a wider occurrence duplicates existing authorities and has no additional
  consumer.

No production performance occurrence is admitted. Stage 3 does not start.

## Candidates held fixed

| Candidate | Meaning under comparison | Authority boundary |
| --- | --- | --- |
| A — transition-derived | Use the addressed Agenda transition’s existing service-occurrence reference as a capability for a bounded lazy Interaction read. Resolve the exact response and exact historical criterion, then derive a move-local result on each fresh Session. | Agenda still owns only disposition and its provenance link. Interaction owns response text. Source/artifact owns the criterion. A derived context contribution is not learner truth. |
| B — durable observed outcome | Preserve one source-linked observation, its evaluator/criterion provenance, correction lineage, and current revision for later projection. | Raw response stays in Interaction; source bytes stay with source/artifact; Agenda stays disposition-only. No mastery or next action is stored. |
| C — copied broad occurrence | Copy response text, question, criterion, assistance, and outcome into a new performance aggregate. | Violates the existing ownership split unless an independent consumer requires each copy. None does here. |

“Criterion satisfied” and “criterion not satisfied” below name results of the
single frozen fixture oracle. They are not proposed universal correct/incorrect
values.

## Evidence inherited from Stage 1

The [Stage 0/1 result](./source-linked-performance-occurrence-stage-0-1-result-2026-07-13.md)
froze exact correct-independent, incorrect-independent, and
same-answer-assisted strings against one revision-bound real Course item.

The correct and incorrect strings can be classified by exact fixture equality
and clause presence. No general natural-language grader is required. Both
independent histories cite a complete learner response in an addressed Agenda
transition. The assisted history remains open and is already separated by
Agenda disposition.

That evidence establishes a fresh-Session decision collision. It does not
establish that the classification must itself become a durable observation.

## One-by-one ablation

| Pressure | A — derive from sources | B — durable observation | C — copied occurrence | Decision |
| --- | --- | --- | --- | --- |
| Different later move | Passes for the frozen fixture if the exact service response and historical criterion are readable. | Also passes, but adds durable meaning not consumed by this fixture. | Passes only by duplicating A’s sources. | Retain A; ablate B and C for this consumer. |
| Outcome correction | A can rederive after an explicit source, criterion, or checker revision. It cannot preserve a case-specific correction to an earlier evaluator judgment because no such observation exists. | Supports append-only correction and a current observation revision, but Stage 1 contains no such corrected observation consumer. | Copying raw text does not explain which judgment was corrected. | B remains conditional, not admitted. A real correction that changes a later move is required first. |
| Changed criterion or material revision | A must bind the historical revision and fail closed if its backing cannot be resolved. It must never reinterpret the old response against current bytes silently. | Preserves what was observed under an old criterion, but still requires resolvable historical support for audit. | Copying criterion bytes into the learning boundary usurps source authority. | This is a source-retention boundary, not evidence for C or by itself for B. |
| Replay and audit | With exact response, exact criterion, and evaluator identity/revision, A is reproducible. The persisted context cut proves only the initial projection; any lazy read must retain source and evaluator identity without copying their bodies. | Gives a stable domain observation and correction history when that stability is genuinely consumed. | Creates two copies that can drift and must be reconciled. | A passes the deterministic fixture; B needs a separate stable-observation consumer. |
| No deterministic checker | A can still expose exact sources for model-assisted local judgment. That judgment may guide the current move but is not a program-owned or durable outcome and may differ on another sample. | Required only if later behavior needs one stable, inspectable, correctable observation despite evaluator ambiguity or unavailability. | Does not create a trustworthy evaluator. | Absence of a checker alone does not admit B; freeze the stable-observation consumer first. |
| Assisted history | Open Agenda disposition already requires another answer-hidden opportunity. | An assistance observation adds no new decision in the three-case matrix. | Copies help and response without a new collision. | Ablate assistance from all candidates. |

## Why A solves only the frozen fixture

The Agenda address transition already persists a reference to the service
occurrence. The occurrence is an immutable Session item, so A does not need to
copy the learner response.

For this fixture, the derivation can be:

1. resolve the transition’s complete learner-response item;
2. resolve the frozen Course/material criterion;
3. apply the fixture-specific oracle or let current Tutor reasoning inspect both
   sources;
4. contribute only the distinction needed by the current move; and
5. retain inspectable source and evaluator identities sufficient to replay the
   lazy read, without copying the response, criterion, or local judgment.

If a deterministic oracle performs step 3, its identity and revision must be
inspectable as part of that move's provenance. If a model performs it, the
result remains local model judgment unless another authorized boundary persists
an observation.

The Stage 1 exact strings make step 3 deterministic for the proof. They do not
show that ordinary learner answers have a deterministic checker. Promoting
their two oracle results into a universal outcome enum would therefore be
unsupported.

## Current production gaps in A

A is semantically smaller than B, but two current code paths prevent it from
working as described:

1. recent Agenda inspection exposes an addressed concern’s compact status but
   omits its transition and service-occurrence reference;
2. read-future-attention-source is available only with routine open concerns
   and returns the concern creation source, not the later service response.

These are reachability gaps, not evidence for a new Learner Record boundary.
The transition already has the trusted reference.

Historical criterion backing has a separate limitation. Course alignment keeps
the expected artifact revision and line selector, but the material read checks
the mutable workspace file. After the file changes it fails stale and returns
no old bytes. Its durable tool receipt deliberately omits material text.

The safe A behavior after such drift is to fail closed. Continuing across drift
would require source/artifact authority to retain or resolve the exact observed
criterion. Neither B nor C may manufacture that support: B must cite it, and C
must not copy it into learner state.

## Correction boundary

The deterministic fixture permits two corrections without B:

- corrected source bytes or response source produce a new explicit source
  revision and a new derivation; and
- a corrected deterministic oracle produces a new explicit evaluator revision;
  earlier context cuts retain their initial projection, while exact source and
  evaluator identities permit reconstruction only while their backing remains
  resolvable.

Those are corrections to derivation inputs or rules. They are not corrections
to a durable observation.

A different case would earn B: an evaluator or learner supplies a
source-bearing, case-specific observation; a later correction changes that
observation; and a subsequent fresh-Session move must use the corrected current
revision while preserving the original judgment. Stage 1 froze no such case.
The protocol’s desire for correction behavior is an entry gate, not evidence
that this consumer already exists.

## Replay and audit boundary

A is fully replayable only when all three inputs remain resolvable:

- the exact complete response;
- the exact historical task criterion; and
- the exact deterministic evaluator revision, if one was used.

If one is missing, A fails closed rather than reading current material or
regrading with an unrecorded rule. A prior context cut may remain inspectable,
but it attests only the initial projection, not transient lazy-read bodies, and
cannot substitute for missing source support.

B is stronger only where the observed judgment itself must remain a durable,
correctable domain source. Even then, B references rather than copies the raw
response and criterion. The source-reference invariant still applies.

C adds no audit strength. It creates duplicate bodies and a second correction
problem.

## Absence of a deterministic checker

Repa need not force every meaningful answer through deterministic grading.
Where the later action is one current Tutor move, A can expose exact sources and
leave genuinely ambiguous semantic judgment to the model. The system must not
then call that local judgment a durable observed outcome.

B becomes eligible only when a later consumer requires the same source-linked
judgment to survive evaluator changes or absence, to be inspected independently
of one model context, or to accept a case-specific correction. That is a
different product pressure from the exact-string Stage 1 fixture.

No provider run is useful before that pressure is frozen. Model reliability
cannot decide the authority boundary.

## Decision, next boundary, and stop

**Claim:** Stage 1 proves that a fresh Session needs access to the old response
and criterion-derived distinction. It does not prove that the distinction must
be a durable Learner Record observation.

**Evidence:** A separates the frozen correct and incorrect histories using
existing Agenda transition provenance plus Interaction/source detail. B adds
correction and evaluator stability not exercised by the fixture. C and an
assistance field change no required decision.

**Decision:** positive for A’s minimum meaning, negative for C, and negative for
admitting B from current evidence. Overall ALS-024 remains partial because A is
not exposed by current tools and historical material bytes may become
unresolvable.

**Next evidence boundary:** freeze one real source-grounded response or artifact
whose outcome has no deterministic checker, where two plausible evaluator
observations lead to different fresh-Session moves, and where a later
source-bearing correction must change that move. If exact-source local judgment
still suffices, stop B again. If a stable corrected observation is required,
that case may earn B without expanding it.

Exact historical criterion support is an entry gate for either result. Missing
support fails closed and must be repaired in source/artifact authority, not by
copying content into learner state.

**Stop conditions:**

- do not start Stage 3;
- do not implement A, B, or C from this result;
- do not add correct/incorrect, assistance, mastery, confidence, or task-family
  vocabularies;
- do not promote a local model judgment into durable truth;
- do not use B unless a corrected or non-repeatable observation changes a later
  move; and
- permanently reject C unless a future independent consumer defeats each copy
  ablation.

## Source and line evidence

| Claim | Source |
| --- | --- |
| Occurrence, evidence, inference, and action remain separate; learning state references original sources | [ADR-0003](../decisions/0003-learning-state-follows-evidence.md), lines 28–56 and 71–102 |
| Agenda transitions already retain the service occurrence | [future-attention.ts](../../src/learning/agenda/future-attention.ts), lines 84–96, 233–346, and 1281–1296 |
| Current inspection omits the service occurrence | [future-attention.ts](../../src/learning/agenda/future-attention.ts), lines 982–1059 |
| Current Agenda source read resolves creation source, not service response | [future-attention.ts](../../src/learning/agenda/future-attention.ts), lines 1062–1092; [tutor-tools.ts](../../src/runtime/tutor-tools.ts), lines 287–304 |
| Context cuts persist the initial sampled projection rather than creating a new domain authority | [records.ts](../../src/interaction/records.ts), lines 630–720 |
| Course material reads fail stale and durable receipts omit source text | [course-tool-execution.ts](../../src/learning/curriculum/course-tool-execution.ts), lines 522–602 and 659–680 |
| Long-lived consequences need a route to exact observed source content and fail closed when backing is missing | [source revision result](./source-reference-revision-2026-07-11.md), lines 107–158 |
