# Repa Gate 20: source-linked future attention and Tutor return

Status: **Contract/theory accepted; implementation/evidence in progress.**
Retained reviewer task `019fd773-84c3-7841-9fc5-45f1b18d4a9f` closed
`G20-CR-001..010` and returned `Accept` under
`G20-WG-20260806-019fd69a-01`. The maintainer authorized the complete Gate 20
horizon on 2026-08-06, so implementation may proceed against this accepted
boundary. No implementation/evidence acceptance, commit, push, release,
credentialed provider call, or Gate 21+ transition follows.

Date: 2026-08-06

Exact derivation base:
`3317525aeb242dfcf3cec49c0dd627cd38ee8144` (`HEAD`, `main`, and
`origin/main` at Gate opening). Gate 19 implementation commit
`9027b45a4853165b18b2c2697e727a066f6c7c22` is an ancestor. The only
pre-existing worktree change was the maintainer-owned `AGENTS.md` modification;
it is excluded from this candidate and from every Gate 20 review or integration
claim.

Review run: `G20-WG-20260806-019fd69a-01`.

Authority and correction routing:
[product origin](../foundation/00-product-origin.md),
[ADR-0005](../decisions/0005-durable-turn-and-interaction-hierarchy.md),
[ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md),
[ADR-0009](../decisions/0009-separate-invocation-and-semantic-effect-identity.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[ADR-0013](../decisions/0013-conditional-current-purpose-composition.md),
[ADR-0014](../decisions/0014-one-time-opencode-fork.md),
[system architecture](../architecture/00-system-architecture.md),
[native learning data model](../architecture/01-native-learning-data-model.md),
and [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md).

Material predecessors:
[Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
[Gate 13 Material Map and Course alignment](opencode-fork-gate-13-material-map-alignment-2026-07-19.md),
[Gate 15 retained scoped steering](opencode-fork-gate-15-retained-scoped-steering-2026-07-20.md),
[Gate 18 learning context and Session continuation](repa-gate-18-learning-context-session-continuation-2026-08-03.md),
and
[Gate 19 first learner-record adaptation](repa-gate-19-first-learner-record-adaptation-2026-08-05.md).

Historical ALS-021/022 documents are provenance, not a proof oracle. Their
tracked prompt-injection code, runner, and shallow mechanical checks remain
inspectable in the immutable pre-fork oracle, but the raw `.runs` from which
the published aggregates were derived are not retained in this repository or
the oracle tag. Gate 20 therefore does not use historical pass counts, model
comparisons, or the ALS-022E `3/8` report as acceptance evidence. The current
boundary is derived from accepted product meaning, first-principles
counterexamples, current-fork mechanics, and evidence produced against this
candidate.

Successor boundary: Gate 21 owns cross-day planning, Gate 21A owns
representative cross-domain Tutor move selection and failure re-entry, Gate 22
owns the composed learner-facing inspect/correct surface, and Gate 23 owns the
integrated product loop. Gate 20 may prove that its exact state reaches the
ordinary Tutor request and causes its own truthful lifecycle transition. It
does not prove general move quality, educational efficacy, planning, mastery,
or release readiness.

## Opening decision and admitted invariant

Gate 20 admits one independently useful authority, `FutureAttention`, and its
first complete consumer loop:

> A source-bound learning concern may become eligible for proactive Tutor
> attention no earlier than one normalized instant, may condition the ordinary
> Tutor's current purpose without overriding an explicit current learner
> request, and may become served only by an exact purpose-appropriate complete
> later Interaction occurrence or completion-conditioned outcome that the Agent
> explicitly aligns to the concern's preserved purpose. Eligibility,
> conditional default, source occurrence/outcome, service claim, and committed
> service are distinct facts. Failure, interruption, cancellation, restart,
> passage of time, question-asking, or incomplete Tutor prose cannot invent any
> of them.

The concern is not a todo, notification, generic commitment, schedule item,
active activity, evidence record, correctness judgment, retention claim, or
mastery state. It is one future learning-purpose authority with a concrete
cross-Session consumer.

Decision ID `G20-OPEN-001`. Revision owner: this contract until accepted;
after acceptance, owning product/architecture documents own challenged product
meaning and this contract owns Gate-local mechanics and evidence.

## Parent question and falsifying counterexamples

The parent question is:

> What smallest durable, correctable meaning lets the Learning System return to
> one exact learning concern later, compose it truthfully with the learner's
> current request, and record actual service without turning time passage,
> prompt exposure, or model narration into completion?

The boundary must survive these counterexamples:

| Counterexample | Incorrect collapse | Required distinction |
| --- | --- | --- |
| “Explain this later” versus “later, ask me before explaining” on the same Course item and time | deduplicate by target/time | two concerns may share a target and time while preserving different purpose and interaction order |
| One learner input asks to revisit two topics, including two different purposes on one target | address each effect by occurrence/target | one occurrence owns one atomic change set containing several distinct creates |
| One due concern asks for an independent response, but the learner now explicitly asks for the answer | unconditional durable priority or automatic dismissal | the exact current request overrides the conditional default; the concern remains open unless an explicit lifecycle operation changes it |
| Two concerns are eligible but a byte budget displays only one candidate | choose the first displayed row | the exact legal count remains greater than one and composition says `multiple_unresolved`; display order is never priority |
| An aligned learner response occurs before `notBefore` | time passage is always required for service | `after_creation` may be served early; `at_or_after_not_before` may not |
| A Tutor asks a useful question, then the provider fails before the learner responds | asking equals service | no service transition exists; the later Turn recompiles from open state |
| A due “explain this later” concern receives one complete learner-visible Tutor explanation | require a later learner message to mark service | the completed bound root Assistant presentation may serve through a prior Agent-authored completion-conditioned claim; the triggering “continue” is not the service source |
| On generic “continue,” the Tutor discovers that its own retained purpose or time was wrong | fabricate learner direction, retain the wrong concern, or create a duplicate | an exact root/delegated `agent_correction` relation may correct the prior Agent-authored meaning under its real capability and permission without claiming learner assent |
| “I meant B—explain B now” corrects an open concern for A | replace to an open successor, then require another learner message to address its generated ID | one replacement may atomically bind a pending claim on the exact same tool-calling Assistant to its own program-created successor; the correction survives failure and only that full committed presentation may serve |
| “I meant B—my response is …” corrects A and already realizes B in the same complete learner occurrence | reject the valid source because the successor did not exist before the message, or reuse an older source | one replacement may bind that exact current complete source to its generated successor with new alignment and predecessor-relative chronology; no retrospective source qualifies |
| The same model operation is sampled or resumed twice | append another interpretation | exact physical replay and one occurrence-bound semantic address settle as replay or conflict, never a second effect |
| Physical invocation P admits a pending claim, phase two later serves it, then P replays | refresh P to served or present its stored pending-at-admission observation as current | P returns its immutable admission settlement exactly; the append-only finalization event, owner read, or a new physical semantic duplicate supplies current served truth |
| Assistant A1 emits learner-visible explanation text and the local update tool call, then the released-v1 loop samples post-tool Assistant A2 | bind A1's claim to A2 because A2 is the last Turn return, or reject A1's complete committed text merely because its bytes streamed before the call | the claim is bound only to A1 at admission; no partial/pre-tool fragment serves, but A1's exact full committed presentation may serve after finalization; A2 is a different source and cannot silently satisfy A1's claim |
| A1 finalizes `not_served`, then same-input A2 contains the explanation | let A2 retry the occurrence-scoped slot, rebind A1's terminal group, or fabricate a continuation occurrence | A2 inherits A1's learner occurrence and effect address; replaying A1's full canonical payload is `already_applied`, binding A2 changes the payload and conflicts, and the concern remains open until a genuinely new runtime-bound learner occurrence |

If current-fork evidence cannot preserve these distinctions without a generic
scheduler, a second runtime, copied transcripts, or unsupported semantic
forensics, the Gate must shrink or reopen rather than hide the defect in prompt
wording.

Decision ID `G20-COUNTEREXAMPLE-001`.

## Vocabulary and non-equivalences

- A **concern** is one immutable source-bound purpose plus exact target,
  activation meaning, optional interaction-order constraint, and authorship.
- **Open** is a durable lifecycle disposition. It is not the same as eligible.
- **Eligible** is a clock- and target-derived query result for proactive
  composition. It is not persisted as a lifecycle transition.
- **Conditional default** is the protected composition meaning when exactly one
  legal concern exists at one immutable model-operation cut. It is not a
  durable selection or active engagement.
- **Service source** is one exact complete later Interaction occurrence or
  outcome: a learner occurrence, committed root Assistant presentation,
  completed tool result, or complete delegated-child result. The Agent's
  purpose alignment is fallible semantic interpretation, not correctness or
  learning evidence.
- **Completion-conditioned claim** is an Agent-authored intent to use the exact
  current root Assistant message that contains the claim's local tool call if
  and only if that entire message later becomes durably complete with a legal
  learner-visible Assistant-authored output. The claim is not service.
- **Bound current Assistant presentation** is that exact tool-calling Assistant
  message/model operation after its provider stream, local tools, terminal
  Parts, message completion, and any final learner-visible Assistant-level
  structured value have all committed. Text Parts or structured output are not
  service while partial or uncommitted; text appearing before the tool-call
  Part is not disqualified once the exact whole presentation is final. A later
  post-tool continuation Assistant is a different Assistant outcome/source but
  not a new runtime-bound learner occurrence; it cannot satisfy this claim or
  obtain another change-set address.
- **Physical admission settlement** is the terminal Gate 8 `applied` result that
  records phase-one effects, generated successor identities, and that a claim
  group was admitted pending at that settlement cut. Exact physical replay
  returns this stored result unchanged; it is not a current claim observation.
- **Claim finalization receipt** is one FutureAttention-owned append-only
  `served | not_served` decision for an admitted group, with exact terminal
  facts and per-member results. It never rewrites the physical settlement.
- **Current claim observation** is the domain projection derived from the
  immutable admitted group plus any finalization receipt. It is available
  through a bounded owner read, the finalization event, or a new physical
  semantic duplicate—not by refreshing exact physical replay.
- **Mutation relation** records whether a root Agent interpreted exact current
  learner language as directing a lifecycle change or whether an authorized
  root/delegated Agent corrected its own earlier fallible durable
  interpretation. Neither arm is runtime-proven entailment.
- **Successor-relative service** is an already-complete service settlement or
  pending current-Assistant claim nested in one replacement and bound by the
  runtime directly to that replacement's program-created successor. It is not a
  second operation, caller-supplied ID, retrospective-source escape, or general
  local-reference mechanism.
- **Served** is an explicit durable transition bound to a legal service source
  and alignment. Asking, starting an explanation, exposing a candidate, or
  elapsed time is not service.
- **Current request override** is the learner's ordinary control of the present
  interaction. It neither edits nor dismisses durable future attention.

These terms must remain distinct in schema, context, presentation, and tests.

## Exact target and currentness

Every concern targets one existing Course-owned `MembershipEndpoint`:

```text
(CourseID, ViewID, CourseViewRevisionID, CourseItemID)
```

Gate 20 reuses `Course.MembershipSelection` rather than copying Course
currentness rules:

- ordinary creation defaults to `observed_working` and records the exact
  Course working-selection version observed by the bounded owner read;
- when the root Agent interprets exact current learner source as choosing a
  historical or otherwise exact endpoint, it may use `explicit_exact`;
- moving a route anchor does not retarget or stale a concern;
- replacement of the working selection makes only an `observed_working`
  concern stale;
- `explicit_exact` remains target-current until its exact Course, View,
  revision, or item is withdrawn or missing; and
- neither title similarity, ordinal similarity, a new working revision, nor
  ordinary Agent interpretation can retarget an existing concern.

The Course owner remains the only authority for endpoint status. Gate 20
stores the selection witness needed to ask that owner and derives
`target_current | target_stale | target_missing`; it does not maintain a
parallel currentness cache. A stale or missing concern remains owner-readable
and correctable but cannot become an automatic conditional default or be
served. The learner may replace it with a new exact target; no implicit
retarget exists.

The selection default is product behavior for ordinary creation, not an
uncorrectable user preference. A concrete learner can explicitly choose an
exact endpoint for a concern. Any reusable cross-concern preference belongs to
retained steering and is outside this Gate.

Decision ID `G20-TARGET-001`.

## Purpose, semantic authorship, and source relation

Purpose is durable semantic content, not a program-inferred label. The ordinary
Agent is always the semantic author of the structured command interpretation;
the runtime never proves that open learner language entailed it. Creation
admits these Agent-authored source relations:

| Source relation | Runtime-trusted binding | Durable, fallible meaning |
| --- | --- | --- |
| `interpreted_learner_request` | exact bounded excerpt and byte range from the causal current root learner occurrence, plus the exact issuing root Agent operation | the root Agent interpreted this excerpt as asking Repa to retain the purpose; it is not mechanically proven learner assent or a literal quotation claim |
| `tutor_initiated` | exact causal learner occurrence, exact issuing root/delegated Agent lineage, and bounded Agent-authored purpose | the Tutor initiated the concern; it must not be presented as a learner promise, request, or quotation |

The Agent must supply the source-relation arm because that is open-language
interpretation. The runtime supplies and validates the occurrence, excerpt
range/hash, issuing operation/lineage, permission snapshot, and legal relation
between them. These structural checks do not upgrade the Agent's interpretation
to entailment. Permission authorization basis, semantic source relation, and
durable authorship remain separately inspectable.

The retained purpose is bounded to 768 UTF-8 bytes and is explicitly
Agent-authored in both arms. For `interpreted_learner_request`, the Agent also
selects an exact bounded source excerpt; the runtime proves those bytes exist in
the causal occurrence, while the durable relation records that the Agent
interpreted them as the stated purpose. The purpose need not equal the excerpt,
and neither relation nor paraphrase is mechanically entailed. For
`tutor_initiated`, no learner quotation is fabricated. Unrelated transcript
bytes are never copied. Both arms remain fallible and correctable, and
presentation says “Agent interpreted this source as…” or “Tutor initiated…”
rather than falsely asserting learner assent.

Replace, dismiss, and reopen carry exactly one Agent-authored mutation relation:

| Mutation relation | Runtime-trusted binding | Durable, fallible meaning |
| --- | --- | --- |
| `interpreted_learner_direction` | exact bounded excerpt/range/hash from the current root learner occurrence plus the exact issuing root Agent operation | the root Agent interpreted this current source as directing the stated lifecycle change; it is not mechanically proven assent |
| `agent_correction` | exact prior concern/head owner read, bounded correction rationale, and exact issuing root/delegated Agent operation, lineage, delegated-capability projection when applicable, and permission settlement | the Agent corrected or withdrew its own earlier durable interpretation; it does not claim that the learner requested the correction |

The Agent may resolve references from bounded owner reads. The runtime proves
only current/prior source bytes or locators, exact state, issuer/lineage,
capability, permission, and transition—not that quoted, hypothetical, negated,
or redirected language authorized a learner-direction arm, or that an
Agent-authored correction is semantically right. A delegated child may use only
`agent_correction` and only when its exact delegated `update_future_attention`
capability admits that lifecycle operation; it cannot borrow the root learner
occurrence as direction. The root may use either arm. When exact current learner
direction materially conflicts with an Agent correction, the Agent must honor or
clarify that current direction rather than silently override or relabel it.

`agent_correction` may replace, dismiss, or reopen a concern from either creation
source relation because both retained purposes are Agent-authored fallible
interpretations. It appends correction provenance and never rewrites the
predecessor's source relation. Every replacement separately names one closed
successor-source arm:

| Successor-source arm | Meaning and legality |
| --- | --- |
| `preserve_predecessor_source` | the successor cites the predecessor's exact immutable creation-source receipt; the new mutation provenance explains the corrected interpretation without pretending that the old source bytes changed |
| `rebind_current_source` | the successor carries a newly admitted creation relation legal for the current issuer: exact current root excerpt for `interpreted_learner_request`, or exact current root/delegated lineage for `tutor_initiated` |

Omitting this arm or trying to rebind learner request from delegated issuance is
illegal. Correcting purpose, target, or time may preserve the old source basis;
correcting the source relation itself requires `rebind_current_source`. In both
cases the predecessor and transition chain remain inspectable. Presentation
says “Tutor corrected its earlier
interpretation…” and remains reversible; it never says that a generic
“continue” authorized the change. The learner need not type internal IDs.
Service and successor-relative service remain separately root-authored and
are governed by the service contract below.

Source deletion never silently deletes independently useful concern meaning.
The durable bounded purpose remains, while its occurrence locator truthfully
becomes `source_unavailable`; no deleted transcript body can be reconstructed
through this authority.

Decision ID `G20-AUTHORSHIP-001`.

## Hard semantic and automatic-context bounds

Gate 20 keeps Gate 18's accepted 2,048-byte ceiling for one canonical automatic
semantic entry. It does not widen that cross-family limit. Its first schema
fixes these domain-local UTF-8 ceilings:

- purpose: 768 bytes;
- exact learner source/direction excerpt: 1,024 bytes;
- exact temporal source expression: 256 bytes; and
- Agent-correction, service-alignment, or terminal-carry rationale: 1,024 bytes.

The Gate 20 `semantic` value—the object to which Gate 18 applies the 2,048-byte
entry ceiling—carries the complete purpose, source-relation/authorship tag,
source availability, exact target/selection witness, normalized `notBefore`
instant and tagged zone basis, service timing, and optional order constraint.
The existing locator carries concern ID/head version for tool grounding. The
versioned protected section header carries the fixed current-request priority
and non-effects once for the section rather than repeating them inside the
semantic value. Temporal source expression, transition history, and service or
terminal-carry rationale remain available through the exact owner read; they
are not operative input required to realize a conditional default.

The domain admission schema must guarantee that every valid Gate 20 semantic
value fits that ceiling; fit is not deferred until context compilation. The
implementation must construct the maximum valid value using a 768-byte UTF-8
purpose, all four 30-byte membership IDs, largest integer/version
representations, the longest name in the pinned IANA catalog and its exact
release ID, the larger tagged selection/time arms, unavailable-source state,
and the optional interaction-order constraint. Its canonical JSON must remain
at or below 2,048 bytes, and the evidence record must publish the exact byte
total and remaining headroom. The same oracle must show that adding one byte to
the purpose is rejected at domain admission rather than producing a
locator-only sole default. If the specified maximum does not fit,
implementation stops and this contract is revised; it may not silently raise
Gate 18's limit, truncate the purpose, or make a valid sole concern poison every
model admission.

Context evidence must also compare exact canonical/rendered cost for zero, one
minimum, one maximum, and multiple concerns, with and without the optional order
constraint, and must show the bytes avoided by keeping source expression,
history, and rationales behind the lazy read. This is the Gate 18 comparative
omission/cost oracle for the new family, not a generic performance benchmark.

A read-only feasibility calculation on the derivation base used the field set
above, a 768-byte ASCII purpose, four 30-byte membership IDs, a 19-digit
selection version, maximum supported instant/offset, `observed_working`, the
optional order constraint, unavailable source, and the longest pinned zone
(`America/Argentina/ComodRivadavia`, 32 bytes) with
`iana-tzdb-2026c`. Its canonical JSON was 1,451 bytes, leaving 597 bytes. That
calculation falsifies the old 2,048-byte-purpose design but is not a substitute
for the schema-generated maximum-valid oracle required at implementation.

Decision ID `G20-BOUNDS-001`.

## Activation and civil-time truth

Creation stores a normalized `notBefore` instant, the exact bounded source
expression, effective UTC offset, and one tagged resolution basis:

```text
ResolvedZone =
  { type: "iana", name: IANAZoneName, releaseID: TimeZoneReleaseID }
  | { type: "fixed_offset", offsetMinutes: Integer[-840, 840] }
```

The `iana` arm alone records a pinned time-zone database release. The
`fixed_offset` arm records no IANA name or release because an offset does not
identify a civil-time zone. An RFC 3339 expression with an explicit offset is a
fixed-offset source unless it separately names an IANA zone. A `source` zone
selector resolves to the exact IANA zone captured on the causal learner
occurrence; it fails when that source zone is unavailable rather than falling
back to a process default.

Naive local civil time is accepted only when the current trusted temporal
context supplies an IANA zone and the local time resolves uniquely. A
nonexistent daylight-saving time or ambiguous fold is rejected unless the
learner supplies a disambiguating fixed offset or otherwise exact offset-bearing
instant. An explicit fixed offset remains legal even when source-zone context
is unavailable. Date-only or underspecified expressions that do not resolve to
one instant remain a learning-level clarification, not a guessed write.

The implementation reuses the mature Goal tagged fixed-offset/IANA computation.
Because Gate 20 becomes its second consumer, shared resolution may be extracted
to a domain-neutral computational module while Goal retains its existing
semantic API and exact frozen behavior. FutureAttention must not import Goal
ownership or turn a Goal target time into a future-attention concern.

On create, `notBefore` must be strictly later than the causal occurrence's
trusted admission time. That keeps immediate same-Turn work outside future
attention. An explicit later learner correction may replace a concern with a
new `notBefore` at or before the correction time; even then, the correcting
learner occurrence cannot itself serve the successor. Any service source must
complete after the successor is admitted, except for an explicit
terminal-disposition carry during replacement as defined below.

Each concern also stores one service-timing meaning:

- `after_creation`: `notBefore` gates proactive projection only. An explicitly
  aligned later complete service source may serve the concern before
  `notBefore`.
- `at_or_after_not_before`: elapsed delay is part of the purpose. Neither
  proactive projection nor the bound service source's completion may occur
  before `notBefore`.

Trusted clock comparison derives eligibility whenever the application wakes.
There is no background daemon, timer-triggered lifecycle transition,
notification, overdue state, recurrence, priority/rank field, or deadline
inference. Passage of `notBefore` changes only a query result.

Decision ID `G20-TIME-001`.

## Optional interaction-order meaning

The initial contract admits exactly one optional purpose-specific constraint:

```text
learner_response_before_tutor_disclosure
```

It is present only when the admitted concern itself requires the learner to
respond in the later service opportunity before the Tutor supplies the answer
or a decisive hint. It distinguishes, for example, “explain it later” from
“later let me answer before you explain.” It is not the default for every
concern, not a generic pedagogy enum, and not inferred merely because a prompt
could be written as a question.

The constraint affects two real consumers:

1. the protected context contribution tells the ordinary Agent to preserve the
   learner-first order while realizing this concern; and
2. a service operation must include a bounded rationale that explicitly
   addresses why one exact complete learner-response witness precedes any later
   Assistant/tool/child service outcome and satisfies that order. When the
   learner occurrence is itself the service source, it is also the witness.

The runtime can validate exact concern identity, source order, model-operation
cut, learner-occurrence kind/completeness, later outcome completeness, and
lifecycle. It cannot prove from natural language that an earlier Tutor phrase
was a “decisive hint” or that the response fulfilled the learner-first purpose.
The Agent's rationale therefore remains a source-bound, inspectable
interpretation, not a program-certified fact. Current-fork traces must test both
compliant and leaking realization paths without promoting their sample
statistics into the product invariant.

A direct current request may override use of the concern—for example, asking
for the answer now. That does not itself serve, dismiss, or rewrite the
concern. The optional constraint applies when the concern is later used as the
purpose of the claimed service opportunity; it is not a lifetime prohibition
on answering the target under a different explicit current purpose.

Decision ID `G20-ORDER-001`.

## One occurrence-bound change set and atomic settlement phases

The semantic-effect address is:

```ts
{
  occurrenceID: runtimeBoundLearnerOccurrenceID,
  slot: "future_attention_change_set",
}
```

This follows ADR-0009's occurrence-plus-domain-slot identity and the mature
request-bound Goal change-set pattern. It deliberately is not
`(occurrence,target)`, `(target,time)`, or caller-supplied idempotency:

- one input may legitimately create or change more than one concern;
- two concerns may share an exact target and time while preserving different
  purposes or service timing; and
- repeated sampling, compaction, recovery, or a second physical tool call for
  the same causal input must not append another semantic interpretation.

Released-v1 may admit several Assistant/model operations A1, A2, and A3 while
one Turn input remains current. Every such operation inherits that input's same
runtime-bound learner occurrence. Assistant message identity and model ordinal
distinguish service sources and completion facts; they do not mint another
FutureAttention effect address. Once any physical invocation settles this slot,
a physically new same-input invocation with the identical canonical payload is
`already_applied`, while a changed payload—including an attempt to bind A2,
retry service, or rebind a terminal `not_served` group—is `semantic_conflict`.
Only a genuinely new runtime-bound learner occurrence creates another legal
change-set address. Gate 20 adds no continuation/service-retry slot and never
fabricates an occurrence from a post-tool Assistant.

One change set contains one through eight operations. Eight bounds transport
and owned work per learner input; it is not a global concern-count limit. The
closed operation union is:

- `create`;
- `replace`;
- `serve`;
- `dismiss`; and
- `reopen`.

The Agent supplies the fallible creation source relation or lifecycle mutation
relation, requested service-source arm, successor source/settlement arms, and
bounded rationales. The runtime supplies new concern IDs, exact causal
occurrence and excerpt/owner-read locators, issuer/model-operation and delegated lineage,
trusted time, completion state, and settlement identity. A model cannot supply a
creation ID, semantic address, idempotency key, trusted source locator/hash,
issuer identity, completion fact, lifecycle version, or generated successor
identity. Existing-concern operations name an exact owner-read concern ID and
expected head version; runtime binding proves the concern belongs to the same
LearnerHome and that the structurally bound source is legal for the operation.
It does not prove the Agent's semantic interpretation.

Before hashing or comparison, the domain canonicalizes nonsemantic operation
order. The set rejects:

- two operations against the same existing concern;
- byte-identical duplicate creates;
- a create followed by an operation on its not-yet-returned generated ID, or
  any free-standing operation/local reference to a replacement's generated
  successor;
- an operation whose result is needed to interpret another operation; and
- more than eight or zero operations.

A change set has two explicit atomic phases when current-Assistant completion is
requested:

1. **Admission phase.** One transaction validates and commits every immediately
   decidable create/replace/dismiss/reopen or immediate-service effect and admits
   one immutable pending-claim group. A pending claim may target either an exact
   existing open head through a `serve` operation or the program-created
   successor through the nested replacement arm defined below. Any invalid,
   stale, unauthorized, conflicting, or structurally dependent member leaves
   every FutureAttention row and claim unchanged. On success, the same Gate 8
   transaction terminally settles the physical invocation as `applied` with an
   immutable admission projection: phase-one effects, generated successors,
   claim-group identity, and `pending` as the state observed at that settlement
   cut. `Pending` here describes the admitted phase-one result, not a mutable
   promise that physical replay will report current state.
2. **Completion phase.** After the exact tool-calling Assistant message bound at
   admission commits its complete learner-visible presentation, including any
   final Assistant-level structured projection, the runtime
   revalidates every claim and atomically appends all service transitions plus
   one `served` group-finalization receipt/event, or appends no service
   transition and records one `not_served` receipt/event with exact per-member
   reasons. The admitted group remains immutable; terminal state is derived from
   the optional finalization receipt. Phase two neither updates the physical
   settlement nor rolls back or relabels an immediate phase-one effect, so a
   corrected successor remains truthfully open when service does not finalize.
   The post-tool Session loop may admit another Assistant message, but that later
   operation is not the bound source and cannot retroactively change this
   decision.

A change set with no current-Assistant claim ends after the admission
transaction. Mixing immediate effects and pending claims is legal only through
these fixed phases and closed target forms; there is no caller-addressable
generated ID, arbitrary dependency edge, rollback across provider work, or
workflow engine. Other result-dependent work waits for a fresh learner
occurrence and bounded read.

Gate 8 exact physical replay is resolved before semantic identity: an identical
terminal invocation returns its stored admission settlement exactly, with no
new event, time, receipt, FutureAttention read, or refreshed projection. For a
physically new invocation at one semantic address:

- identical canonical payload settles `already_applied` and returns the
  original effect/admission identity, the same generated successors, and a
  transaction-current claim observation derived from the admitted group and any
  finalization receipt;
- a different canonical payload is `semantic_conflict` and causes no domain
  effect; and
- a new occurrence is a new semantic address even if text, target, time, and
  purpose happen to match.

The new semantic duplicate receives its own immutable physical settlement. It
does not change the original effect or claim. In particular, replay of the first
physical invocation after finalization still says that it admitted the group as
pending at its original settlement cut; only the finalization event, owner read,
or new semantic duplicate reports the later terminal claim state.

This boundary derives from and does not revise Gate 8. Gate 20 may add typed
domain fields to its `applied | already_applied` result projection, but it may
not add a mutable physical outcome, change physical-first replay/conflict order,
or update a settled Tool Part after domain finalization.

No fuzzy or cross-occurrence automatic deduplication exists. Before creating a
similar concern, the ordinary Agent should use the bounded owner read and
choose an explicit `replace` when the learner is correcting an existing one.

Decision ID `G20-IDENTITY-001`.

## Persistence and lifecycle

The domain persists an immutable concern payload and an append-only transition
history. Every concern has a program-generated ID, LearnerHome, immutable
create source/authorship, purpose, target selection, activation meaning,
optional order constraint, creation instant, and monotonically increasing head
version. Its current disposition is one of:

```text
open | served | dismissed | superseded
```

A completion-conditioned admission also persists one immutable claim group
keyed by a program-generated group ID and the original semantic effect/physical
receipt. Zero or one append-only finalization receipt references that group.
Absence of a receipt means `pending`; a `served` or `not_served` receipt is
terminal. The original physical settlement stores only its group reference and
admission-cut observation. It is neither the owner nor a mutable cache of the
derived current claim state.

Legal transitions are:

- `create` produces version 0, `open`;
- `replace` atomically appends `superseded` to an exact `open`, `served`, or
  `dismissed` old head and creates one successor with a program-owned chain
  link and one explicit successor arm described below;
- `serve` appends `served` to an exact `open` head and binds the service
  source and rationale, either immediately or after a completion-conditioned
  claim finalizes;
- `dismiss` appends `dismissed` to an exact `open` or `served` head; an exact
  already-dismissed head returns `no_effect` without a transition; and
- `reopen` appends `open` to an exact `served` or `dismissed` head.

Every `replace` names exactly one successor-source arm from
`G20-AUTHORSHIP-001` and exactly one settlement arm below; there is no
terminal-to-open default:

| Successor arm | Legal predecessor | Settlement and successor history |
| --- | --- | --- |
| `open` | `open`, `served`, or `dismissed` | admission creates version 0 `open`; from a terminal predecessor the valid mutation relation explicitly chooses to reopen the corrected concern |
| `dismissed_by_mutation` | `open`, `served`, or `dismissed` | admission creates version 0 `open` and version 1 `dismissed`, both bound to the valid mutation relation and rationale |
| `carry_served` | `served` only | creates version 0 `open` and a version 1 `served_by_correction` transition that cites the predecessor's exact service receipt/source plus a new Agent-authored rationale aligning that complete source to the corrected payload |
| `carry_dismissed` | `dismissed` only | creates version 0 `open` and a version 1 `dismissed_by_correction` transition that cites the predecessor's exact dismissal plus a new Agent-authored preservation rationale |
| `serve_complete_source` | `open`, `served`, or `dismissed` | admission creates version 0 `open` and version 1 `served` from one exact already-complete service-source arm and new successor-specific alignment; the source must postdate the predecessor's current-head creation and latest transition, so this can truthfully bind a current learner response/tool/child result but cannot recycle an older source |
| `serve_current_assistant_when_complete` | `open`, `served`, or `dismissed` | admission creates version 0 `open` and nests one pending claim bound by the runtime to that generated successor; completion appends version 1 `served` only if the exact full presentation of the same tool-calling Assistant satisfies the service contract, while any non-service settlement leaves version 0 `open` |

The old-head supersession, successor creation, any immediately decidable
version-1 terminal transition, and admission of any successor-relative pending
claim are one phase-one transaction. A carried terminal disposition is an
explicit correction receipt, not an ordinary service occurrence after successor
creation. Both service-producing replacement arms require a root-issued valid
mutation relation, a service-alignment rationale, target witness, and any
required interaction-order witness; they are illegal for delegated issuance.
`serve_complete_source` also requires a legal already-complete source at the
immutable admission cut and settles service in phase one.
`serve_current_assistant_when_complete` instead binds the current issuing root
Assistant message/model operation and does not make the successor served during
admission. Its later service transition is the phase-two transaction defined by
`G20-SERVICE-001`; failure never rolls back the corrected payload or silently
restores the predecessor.

The runtime validates predecessor state, exact prior transition/source receipt,
the source's current availability state, current target legality, current
mutation-relation binding, permission, and structural chronology. The Agent
authors the
fallible claim that the prior complete service source still aligns to the
corrected target/purpose or that the prior dismissal should still apply; code
does not certify that meaning. A source body deleted after committed service may
be carried only through that exact immutable completion/service receipt and is
shown as currently unavailable; neither runtime nor Agent may reconstruct its
content. The caller does not need the not-yet-returned successor ID to preserve
or intentionally change the terminal disposition.

A superseded concern cannot reopen or gain a second successor. The learner can
replace the current successor or create a new independent concern. Reopen
preserves all earlier service/dismissal history and does not erase the original
purpose. Target, purpose, not-before time, service timing, authorship/source
relation, or order constraint never change in place; any such correction uses
`replace` with an explicit successor arm.

Expected-head checks serialize concurrent corrections and service. For a
physically new invocation, semantic duplicate/conflict resolution precedes
stale-version rejection so an identical committed first effect remains
observable after its own version change. Exact physical replay has already
terminated before this domain path. SQL constraints protect structural
reachability through supported transitions; command code owns natural-language
interpretation and complete transition semantics.

The forward migration follows the accepted Gate 19 schema. Frozen Gate 19
fixtures must upgrade through the new migration without reinstalling current
helpers or weakening historical constraints. Removing a Session may make
occurrence/model-operation sources unavailable but does not cascade an
independently useful concern, transition, or settlement; source-read APIs expose
that unavailability without retaining unrelated bodies.

Decision ID `G20-LIFECYCLE-001`.

## Truthful service

Only a committed immediate `serve` settlement, a replacement's committed
`serve_complete_source` settlement, a finalized completion-conditioned `serve`
claim, or finalization of a replacement's nested
`serve_current_assistant_when_complete` claim creates service. The root
interactive Agent is the semantic author of the purpose-alignment
interpretation. A delegated child cannot issue `serve`, admit any
completion-conditioned claim, or turn its root learner cause into service. Its
exact completed return may become a source only after the root Agent receives
and explicitly aligns it.

The first schema admits this closed service-source union:

| Service-source arm | Runtime-bound complete occurrence/outcome | Additional rule |
| --- | --- | --- |
| `learner_occurrence` | the exact complete current root learner occurrence | the occurrence is both command cause and service source; quoted, hypothetical, negated, redirected, synthetic, compacted, or incomplete text is not mechanically treated as fulfillment |
| `assistant_completion` | an exact committed root Assistant presentation returned by the bounded Interaction owner read | an already-complete outcome may settle immediately; the current root tool-calling Assistant uses the completion-conditioned protocol below and cannot be selected by a delegated child or replaced by its later post-tool continuation |
| `tool_result` | an exact completed tool invocation/result in the current root Turn | failed, interrupted, partial, internal-control-only, or caller-fabricated tool output is illegal |
| `child_result` | an exact root-bound `Turn.ChildResult` whose child terminal outcome and requested output are both complete | failed, interrupted, exhausted, incomplete, unreturned, or lineage-mismatched child work is illegal; root receipt is not by itself proof that its content served the purpose |

Every source must belong to the same LearnerHome and root Interaction lineage,
be available through its owner rather than supplied as an unchecked historical
locator, address an exact target-current head at the expected version, and
satisfy `notBefore` at source completion when service timing is
`at_or_after_not_before`. An ordinary source completes strictly after concern
creation and the latest replacement or reopen that made the current head
`open`. The nested `serve_complete_source` exception binds the source and
successor in one transaction but requires the source to complete strictly after
the predecessor's current-head creation and latest transition; its new alignment
must address the corrected successor payload. An immediate service source must
already be complete at the immutable issuing cut. Compaction summaries, fork
clones, model deltas, a draft/pre-tool text fragment considered apart from its
later exact completed message, internal title/summary work, deleted or
fabricated source bodies, and uncommitted Assistant items are not service
sources. For a completion-conditioned current-Assistant claim, Text Parts that
streamed before the claim's tool-call Part and any final Assistant-level
structured output may contribute only after the entire same Assistant
presentation commits; partial earlier visibility is never itself service.

The operation carries a rationale of at most 1,024 UTF-8 bytes explaining how
the exact complete source addresses the preserved purpose. When
`learner_response_before_tutor_disclosure` exists, it also binds one exact
complete learner-response witness and explains the purpose-specific order; the
runtime validates source identity, completeness, lineage, and order, not the
natural-language claims. The rationale, exact issuing root model operation,
owner-read cut, source receipt, target witness, and any learner-response witness
remain inspectable. Service asserts only that the intended future attention
occurred—not correctness, understanding, retention, evidence, mastery, or
program-certified semantic fulfillment.

For `assistant_completion` on the current issuing root model operation, the
runtime replaces any caller locator with the exact current Assistant
message/model operation that owns the local tool call and atomically admits an
immutable pending claim group. Each member
contains its rationale, target witness, optional learner-response witness, and
either an exact existing open head selected by a `serve` operation or the
program-created successor selected by that same replacement's nested arm.
The physical settlement remains `applied`; its typed domain projection reports
`claim_state_at_admission: pending`. An existing target remains open and a
replacement target exists as a corrected open successor, but neither is served.
The group finalizes exactly once only after the bound Assistant's provider model
operation is terminal `completed`, every local tool Part is terminal, the same
Assistant message and complete Part set have committed through the Session
owner, any final Assistant-level structured projection has committed, the
message has no failed/interrupted/uncommitted presentation, and at least one
eligible learner-visible Assistant-authored Text Part or structured-output byte
exists. The Interaction owner read binds the exact Session, Turn, current
root causal occurrence, Assistant message/model operation, claim Tool Part,
message-completion time/order, ordered committed Part-manifest fingerprint, and
final eligible learner-visible output fingerprint. Reasoning, tool results, patch
Parts, provider deltas, and a later Assistant message are not silently included
in the Assistant-authored output. These structural facts do not prove the
Agent-authored purpose alignment.

Finalization appends all `served` transitions, their service receipts, one
immutable group-finalization receipt, and its typed carrier event in one
transaction. The receipt records those runtime-computed completion/presentation
facts and per-member result. If any member is stale or illegal, or the exact
bound presentation contains no eligible complete Assistant-authored output,
none is served and one `not_served` finalization receipt records exact
per-member reasons so the next root Agent can read and correct current state.
The finalizer consumes only the frozen claim and trusted terminal facts; it does
not run another semantic parser, model judgment, or Assistant sample. A unique
claim-group constraint makes re-finalization return the existing domain receipt
without appending another transition or event; this is domain idempotency, not
physical-command replay.

Provider failure, cancellation, interruption, exhaustion, an uncommitted or
unavailable bound Assistant presentation, or recovery of a terminal non-completed
model operation appends a `not_served` finalization receipt and leaves every
claimed existing head or corrected successor open. Other phase-one effects
  remain committed. A crash after the durable bound Assistant presentation but
  before finalization causes recovery to finalize the exact domain group once; a crash
before durable completion cannot synthesize service. Recovery scans
FutureAttention pending groups and trusted Interaction terminal facts—it never
reopens or mutates the terminal physical invocation. Exact physical replay
always returns the original admission settlement, including its admission-cut
`pending` observation. The current final state comes from the append-only
finalization receipt/event, `future_attention_read`, or a physically new
`already_applied` semantic duplicate. Source deletion after a committed service
changes only source availability, not historical disposition.

The current released-v1 seam fixes the identity rather than asking the domain
to infer it. `SessionProcessor` settles the exact model operation, executes its
local tool candidates, then commits that same Assistant message and its terminal
Parts through `Session.finalizeMessage`. `SessionPrompt` then commits any final
Assistant-level structured result and invokes FutureAttention finalization
before it returns or admits a new post-tool Assistant message. Live finalization
runs at that full-presentation cut before the next interactive model admission.
Startup finalization runs only after Turn recovery has reconciled durable
Assistant and Part completion. It never chooses the last Assistant in the Turn,
follows a parent pointer to a later message, or treats the post-tool continuation as the
claimed source. If A1 finalizes `not_served` and the purpose-appropriate output
first appears in same-input A2, A2 may answer the learner but it cannot retry the
already-settled occurrence slot, rebind A1's terminal group, or record itself as
service. The concern truthfully remains open. Only a genuinely new
runtime-bound learner occurrence may issue another change set and serve through
its own legal source; Gate 20 does not promise same-occurrence or
no-new-message recovery for the A2 path.

The same complete source may serve several concerns only through a separate
explicit `serve` member or separate nested replacement arm and a separate
alignment rationale for each. There is no “mark every due item done” operation.
Creating, correcting, projecting, selecting, mentioning, asking about,
beginning, or partially explaining a concern does not serve it; a
purpose-appropriate complete explanation may serve only through the bound
Assistant-completion protocol above.

Decision ID `G20-SERVICE-001`.

## Bounded owner reads and correction reachability

`future_attention_read` is the owner-visible, non-mutating read capability. It
supports exact concern or claim-group lookup and cursor-bounded concern listing
by LearnerHome, lifecycle, target status, and time window. Every page reports:

- exact `countAtCut` for the complete query before byte/page truncation;
- deterministic storage order explicitly labelled as non-priority;
- returned count, next cursor, truncation, and omitted count;
- exact concern/head version, disposition, purpose/authorship, target selection
  and currentness, activation/service timing, optional constraint, source
  availability, chain links, and service receipt when present;
- any associated immutable claim-group admission, its current
  `pending | served | not_served` projection at the owner cut, and exact
  finalization receipt/per-member reason when terminal; and
- the immutable owner cut/revision used by the read.

No list endpoint claims exhaustive semantic relevance from a truncated page.
No read retrieves deleted transcript bodies, recomputes a model judgment,
changes eligibility, selects a default, mutates lifecycle, or rewrites a
physical settlement. Terminal, pending-claim, non-served, stale, missing-target,
and upcoming concerns remain lazily inspectable so the learner can correct them
in natural language even though they do not enter automatic composition.

Decision ID `G20-READ-001`.

## Learning-context composition

Gate 20 extends Gate 18 with a new versioned `future_attention` owner/kind and
the `future_attention_read` lazy capability. It introduces a new context policy,
renderer, and capability-catalog version; it never rewrites the bytes or meaning
of a persisted Gate 18 policy-1 or Gate 19 policy-2 cut.

For an ordinary interactive learning model operation, the FutureAttention
owner receives the exact LearnerHome and trusted cut clock. It returns every
concern in that LearnerHome that is simultaneously:

- `open`;
- target-current according to the Course owner;
- at or after `notBefore` under the trusted cut clock; and
- bound to its own exact current Course membership endpoint.

The concern's exact target is itself the structural relevance witness; current
route, default Course, title, keyword, embedding, or model-authored matching is
not required and cannot suppress or retarget it. This lets a due concern bring
its non-current Course back into a fresh Session while leaving current-request
override intact. `after_creation` affects early explicit service, not early
proactive eligibility: automatic projection still waits until `notBefore` for
both service-timing values.

The untruncated legal result determines composition:

| Exact eligible count | Protected cut meaning |
| --- | --- |
| `0` | no future-attention contribution |
| `1` | `conditional_default`; include the complete operative concern meaning |
| `>1` | `multiple_unresolved`; preserve the exact count and omission truth, and never silently promote the first displayed candidate |

The exactly-one contribution uses the locator only for concern ID/head tool
grounding. Its non-locator semantic value carries exact purpose/source relation,
target, normalized not-before and tagged zone basis, service timing, optional
constraint, and source availability. The protected section header carries the
current-request priority relation and these non-effects once: default is not
service, evidence, mastery, or a durable selection. The protected renderer
instructs the Agent to realize the purpose naturally without narrating IDs,
lifecycle labels, precedence machinery, or internal control vocabulary.

The exact admitted learner request has higher priority for overlapping present
action. A direct help request, requested form, completed occurrence,
cancellation, or redirection can override the concern for that model operation.
Override leaves the concern open unless the root Agent separately interprets
the same exact current learner source as directing a valid lifecycle operation
and the runtime admits that transition. Retained steering and hard
permission/safety constraints remain independently operative; this relation is
not a global priority lattice.

The one-candidate contribution is semantically mandatory once admitted. A
schema-valid Gate 20 semantic value is guaranteed to fit Gate 18's 2,048-byte
entry allowance and may never be reduced to an opaque locator or silently omit
its purpose/constraint. The whole-cut budget may trim lower-priority optional
sections under Gate 18's existing omission rules. Only a remaining conflict
among independently mandatory complete sections may fail model-operation
admission truthfully before sampling; Gate 20 field maxima alone cannot make
every eligible admission fail.

For `multiple_unresolved`, the protected section always preserves exact count,
non-priority ordering, truncation/omission, and lazy-read availability. Bounded
candidate detail may truncate. The ordinary Agent may honor an exact learner
request, make a transparent reversible local choice without borrowing source
provenance, or ask a learning-level clarification when the difference is
material. It may not claim that the program selected the first row or ask the
learner to manage internal IDs/state. General representative arbitration
remains Gate 21A.

The decision is fixed for every immutable model-operation cut. Provider retry
reuses that exact cut. Non-mutating continuation in the same Turn follows Gate
18's cut-reuse rules. A new Turn or newly admitted cut after correction,
service, dismissal, replacement, target change, or clock change recompiles from
current owner state. An old cut never mutates retroactively.

Decision ID `G20-CONTEXT-001`.

## Capability, permission, runtime, and carrier boundary

The first implementation exposes two capability-scoped tools:

- `update_future_attention` for the closed change-set operation union; and
- `future_attention_read` for bounded owner reads.

They enter the single authoritative tool/capability catalog, configured Agent
permission projection, reserved-ID collision checks, delegated-Agent rules,
and learning-command registry. Restricted custom Agents remain default-deny;
new tool registration cannot inherit a wildcard allow from stale configuration.
Root and delegated issuance remain distinguishable. The root may create through
either creation relation and may replace, dismiss, or reopen through either
mutation relation. Delegated issuance may create only a `tutor_initiated`
concern and may replace, dismiss, or reopen only through `agent_correction`, in
each case only when its exact delegated capability admits that operation and
scope. A delegated child cannot interpret learner request/direction, issue
`serve`, or select either service-producing replacement arm; those actions
remain root-only. An effective `ask` shows the exact bound operation,
Agent-authored creation or mutation relation, purpose, target, timing, successor
arm or service-source arm, successor-source preservation/rebinding, rationale,
expected version, and delegated lineage when applicable before execution. It
does not label an interpreted learner relation as mechanically proven assent or
an Agent correction as learner-directed.

The domain lives under Core and owns schema, transition legality, semantic
identity, queries, and context projection data. OpenCode runtime wrappers bind
current occurrence/model-operation identity, permission, execute the existing
Gate 8 prepare/settle/recover protocol, and project typed semantic results. The
shared LearningCommand substrate remains domain-neutral. No generic command
bus, reminder service, scheduler, manager, Agent fork, or workflow engine is
introduced.

Consequential settlement presentation uses one typed semantic projection
across the primary TUI, direct run, attach/local server, and ACP carriers. It
distinguishes immutable physical admission from current domain observation and
from append-only finalization. It also distinguishes committed, admitted for
completion, committed-after-completion, not-served, already applied, no effect,
conflict, stale, denied, failed, and interrupted truth. Learner-visible prose
says what concern changed, its
interpreted creation/mutation relation, timing, target, and how to correct it
without exposing internal IDs by default. For the nested replacement arm, the
phase-one projection says that the correction committed, the corrected concern
is open, and a completion claim was admitted pending at that exact settlement
cut; it never reduces that compound truth to an undifferentiated pending write
or claims that replay is current. The later FutureAttention finalization event
presents `served` or `not_served` with the exact receipt across the same retained
carriers. A carrier may also obtain current state through the bounded owner read
or a new physical semantic duplicate. It may not join a domain read into exact
physical replay, rewrite the completed Tool Part, or replace its historical
admission wording with the later state. A later provider or presentation
failure cannot turn a committed domain effect into a false failure, a pending
claim into service, or an uncommitted attempt into success.

The inherited todo tool and any Session-local plan/checklist remain unsuitable:
they have different identity, lifecycle, restart, source, permission, and
consumer semantics. Gate 20 does not rename or wrap them.

Decision ID `G20-CAPABILITY-001`.

## Implementation projection and dependency direction

The implementation must preserve these ownership seams rather than exact file
names:

1. **Core FutureAttention domain:** schemas, immutable payload and transition
   contracts, change-set canonicalization, semantic effect identity,
   persistence transaction, immutable claim groups, unique append-only
   finalization receipts/events, owner queries, service validation, recovery
   finalization, and source availability projection.
2. **Shared civil-time computation:** extract only the reusable tagged
   fixed-offset/IANA resolution from the mature Goal implementation; Goal and
   FutureAttention retain separate semantic APIs and tables.
3. **Course dependency:** call the existing membership-status owner for target
   currentness; no copied working-view or withdrawal policy.
4. **Learning Context:** add one versioned owner/kind, exact count and
   conditional/multiple composition, lazy read capability, protected renderer,
   and migration support for the new cut policy while preserving frozen old
   cuts.
5. **OpenCode command bridge:** strict model input decoder, runtime-owned source
   binding, immutable Gate 8 preparation/physical settlement/replay, permission
   catalog, tool registry, trusted Interaction-terminal binding, domain
   finalizer invocation/recovery, and separate typed admission/finalization
   presentation.
6. **Interactive composition:** feed the immutable protected section through
   the existing released-v1 Session prompt/LLM request spine; internal title,
   compaction, representation, and other narrow operations do not receive the
   interactive FutureAttention section.

Dependencies point from domain schemas and Core contracts toward the existing
Course, Interaction, LearningCommand, and LearningContext public boundaries;
OpenCode depends on Core. Core does not import provider, TUI, ACP, or AI SDK
types. Source-local helper extraction is allowed only when it preserves this
direction and has the real Goal/FutureAttention consumers.

One forward Repa migration after Gate 19 owns all new tables, indexes,
constraints, and allowed learning-context policy values. Generated migration
registry/schema artifacts are regenerated through repository tooling, never
edited as independent authority.

Decision ID `G20-ARCH-001`.

## Focused evidence and acceptance boundary

Gate 20 acceptance requires causal evidence matched to each claim. Passing
tests do not promote historical ALS reports or prove general Tutor quality.

### Core domain and migration

- create, replace, serve, dismiss, reopen, successor-chain, head-version, and
  terminal-state legality, including every explicit successor arm for
  open/served/dismissed predecessors, both successor-source arms, the nested
  already-complete and current-Assistant service arms, and rejection when a
  required arm is omitted or illegal;
- exact physical replay returns the byte-identical stored admission settlement
  before and after finalization without a domain read/event/time change; a new
  same-address physical semantic duplicate receives its own `already_applied`
  settlement with current claim observation; conflicting canonical payloads,
  duplicate creates, same-target distinct concerns, operation-order
  canonicalization, the one-to-eight bound, and stale races remain exact;
- later Assistant/model operations under the same current Turn input inherit the
  same learner occurrence and FutureAttention address: an A2/A3 physical
  invocation that reproduces A1's full canonical payload is `already_applied`
  against A1's terminal group, while an A2-bound source or any changed claim or
  rationale is `semantic_conflict`; no second group, terminal rebind, fabricated
  occurrence, or continuation/retry slot appears;
- phase-one all-or-nothing admission, legal mixing only through the fixed two
  phases and closed claim targets, stable generated successors, immutable claim
  groups, unique append-only finalization receipts/events, and phase-one
  persistence after phase-two non-service settlement;
- Agent-authored `interpreted_learner_request`, `tutor_initiated`, and
  `interpreted_learner_direction` relations plus `agent_correction` beside
  runtime-proven occurrence/excerpt/owner-read/lineage/capability/permission
  facts, including quoted, hypothetical, negated, redirected, generic-
  continue, conflicting-current-direction, preserved predecessor source,
  current-source rebinding, root, and delegated counterexamples;
- complete learner, committed root Assistant presentation, completed tool-result, and
  complete child-result service arms; ordinary later-than-open and explicit
  predecessor-relative replacement chronology; root-only issuance; purpose-
  specific rationales; optional learner-response witnesses; and rejection of
  partial, uncommitted, internal, fabricated, unavailable, cross-lineage, or
  cross-LearnerHome sources;
- correction plus immediate complete learner/tool/child source settlement;
  current-Assistant claim admission against an exact existing open head and a
  replacement-generated successor; exact binding to the same tool-calling
  Assistant rather than its post-tool continuation; whole-message completion
  after the tool call plus any final Assistant-level structured projection, with
  pre-call fragments never serving alone; no-output and later-Assistant-
  substitution negatives; one-group atomic success/failure;
  corrected-successor persistence on failed output; stale-before-finalize;
  exact finalizer idempotency; physical-replay immutability; current observation
  through owner read/new semantic duplicate; and crash both before and after
  durable bound-presentation completion;
- strict `notBefore`, source-IANA, explicit-IANA, and fixed-offset tagged cases,
  fixed offset with unavailable source zone, ambiguous/nonexistent civil time,
  IANA-only pinned release, trusted-clock wake derivation, and both
  service-timing variants;
- `observed_working` and `explicit_exact` currentness, route-anchor independence,
  working-view replacement, withdrawal, missing target, and no retarget;
- optional interaction-order preservation and service-rationale requirement;
- 768-byte purpose, 1,024-byte source/direction excerpt, 256-byte temporal
  expression, 1,024-byte rationale, exact maximum semantic-value byte oracle,
  one-byte-over rejection for every admitted text field, cursor/read bounds,
  exact `countAtCut`, deterministic non-priority order,
  truncation/omission, pending/final claim observation, terminal/stale/upcoming
  reads, and zero read or physical-settlement mutation;
- source deletion/tombstone truth with no unrelated transcript body retention;
- crash-before/after-admission, before/after durable bound-presentation completion, and
  before/after finalization receipt/event; restart recovery scans pending domain
  groups without reopening terminal physical invocations; and
- forward migration from a frozen Gate 19 fixture, fresh install, structural
  SQL constraints, and exact readability of frozen older learning-context
  cuts.

### Context, runtime, permission, and presentation

- policy/renderer/capability-catalog versioning leaves Gate 18/19 frozen cut
  bytes unchanged;
- zero/one-minimum/one-maximum/multiple exact candidate cases; every valid sole
  semantic value at or below 2,048 bytes; no sole locator-only degradation;
  comparative canonical/rendered cost and lazy-detail savings; whole-cut
  byte-pressure failure only after Gate 18 omission rules; multiple-candidate
  truncation, exact count, lazy read, and non-priority ordering;
- a target-current concern in a non-default, non-routed Course still enters the
  LearnerHome cut, while stale/missing exact targets remain lazy-readable only;
- exact current request override leaves the concern open; a generic continue
  receives the conditional default; a direct requested form or redirection does
  not silently serve/dismiss;
- `learner_response_before_tutor_disclosure` reaches the protected request only
  when stored and does not become a universal instruction;
- fresh/resumed/fork/child/steer/tool-continuation/compaction behavior follows
  Gate 18 cut rules; retry uses its original immutable cut and a new Turn
  recompiles;
- registry collision, default/restricted/delegated discovery, configured
  `allow | ask | deny`, exact permission scope, root-only learner-source,
  learner-direction, service, and service-producing successor arms, delegated
  Tutor-initiation and capability-bounded `agent_correction`, cancellation,
  conflict with current learner direction, and truthful issuance provenance;
- prepare/execute/settle/recover across every commit/presentation/provider
  failure window, including immutable admission presentation, pending-completion
  observation, finalization event delivery, and recovery, with no double effect,
  refreshed physical replay, or false receipt;
- the real released-v1 multi-message loop: A1 owns the claim Tool Part and full
  committed Assistant presentation, A2 is a distinct post-tool operation, live
  finalization occurs after A1 message commit and before A2 admission, and
  restart finalization waits for Turn recovery rather than guessing the last
  Assistant; A2 retains A1's learner-occurrence address, so no-output A1 plus
  explanatory A2 leaves the concern open and cannot produce a second claim;
- typed semantic presentation and TUI/direct-run/ACP carrier parity, including
  compound “correction committed, successor open, service pending” truth for the
  admission cut, later `served | not_served` finalization truth, exact historical
  replay wording, and current owner-read/new-semantic-duplicate wording; and
- persisted learner-visible output avoids concern IDs, control narration,
  hidden precedence reasoning, and false learner/mastery/source claims.

### Current-fork vertical traces

A deterministic scripted provider runs through the real released-v1 prompt,
tool registry, LearningCommand bridge, database, context compiler, and
presentation spine:

1. one Turn creates a future concern;
2. a fresh Session before `notBefore` shows no proactive default;
3. a fresh Session at/after `notBefore` sees exactly one complete conditional
   default;
4. for an “explain this later” purpose, one root Assistant A1 emits the complete
   learner-visible explanation without internal-control narration and includes
   the completion-conditioned service-claim tool call in that same provider
   operation; phase one admits the claim but no streamed fragment serves yet;
5. after the claim tool settles, the exact full A1 message and terminal Parts
   commit and atomically finalize service—never the triggering generic
   “continue” and never a later post-tool Assistant A2;
6. replay of the original physical invocation returns its byte-identical
   admission-time `applied` result with the pending-at-that-cut observation and
   performs no domain read, while the append-only finalization event and
   `future_attention_read` report served; a new physical semantic duplicate
   settles `already_applied` with the same successor and current served state;
7. the next fresh cut contains no open eligible concern.

Orthogonal traces cover direct current-request override leaving the concern
open, two eligible concerns producing `multiple_unresolved`, an early
`after_creation` service versus rejected early `at_or_after_not_before`
service, immediate complete learner service, completed tool and child-result
arms, delegated service rejection, optional learner-first order, terminal-
preserving served/dismissed replacement, fixed-offset time with unavailable
source zone, and provider failure leaving the concern open. Two correction
traces additionally prove the new closure: on generic “continue,” an authorized
root and an independently capability-bounded delegated Agent can correct their
own erroneous retained purpose/time through `agent_correction` without
fabricating learner direction; and “I meant B—explain B now” supersedes A,
creates B open, binds the exact same tool-calling A1 presentation to B without
exposing its generated ID, then either serves B on exact committed completion or
leaves B open after failure. Replay and both crash windows preserve the same
successor and never restore A or append a duplicate. A negative multi-message
trace makes A1 contain only control/tool material and puts the explanation in
post-tool A2: A1 finalizes `not_served`; A2 cannot silently substitute, retry the
same occurrence slot, or rebind the terminal group; identical reissue is
`already_applied`, changed reissue conflicts, and the concern remains open until
a genuinely new runtime-bound learner occurrence. A neighboring “I meant B—my
response is …” trace binds that exact already-complete learner occurrence through
`serve_complete_source` in phase one; a pre-existing or chronology-invalid
source is rejected rather than retrospectively serving B.

These traces prove current-fork causal wiring and lifecycle truth, not that a
representative external model always chooses or realizes the best move. No
credentialed or paid provider call is required or authorized. A bounded real
provider smoke would require separate credential/cost authority and would
remain model qualification, not the acceptance oracle. Gate 21A retains the
representative cross-domain selection claim.

Focused tests run from their owning packages. Broader package checks are added
only where the migration, public Core exports, registry, or generated schema
actually reaches them. The known Bun 1.3.14 Windows aggregate native
instability, if observed, is reported as execution-reliability qualification;
it cannot be converted into a semantic pass or failure without an isolated
causal oracle.

Decision ID `G20-EVIDENCE-001`.

## Execution slices and invalidation conditions

After contract/theory acceptance, Whole-Gate execution proceeds through these
replaceable slices under the same semantic owner:

1. domain schema, civil-time seam, migration, transition/change-set/query tests;
2. Learning Context owner/version/renderer/migration compatibility;
3. command input, permission/registry, runtime settlement/recovery, and typed
   presentation;
4. released-v1 prompt integration and focused deterministic vertical traces;
5. evidence record, authority/status reconciliation, and independent
   implementation/evidence review by the same top-level reviewer.

A later slice may revise an implementation mechanism without reopening the
contract if all decision IDs and evidence oracles remain exact. Reopen the
contract/theory layer before continuing if implementation shows any of these:

- exact Course membership cannot supply stable target identity/currentness;
- tagged fixed-offset/IANA civil time cannot be shared without
  Goal/FutureAttention ownership leakage or historical Goal behavior drift;
- one occurrence-bound change set suppresses a legitimate correction that
  cannot wait for a fresh occurrence;
- terminal payload correction cannot preserve or explicitly change disposition
  without a not-yet-returned successor ID or transient automatic pressure;
- an authorized root or delegated Agent cannot correct its own earlier
  fallible durable interpretation without fabricating learner direction or
  bypassing capability/permission truth;
- correction plus current realization cannot bind the replacement-generated
  successor to an exact already-complete current source or the full committed
  presentation of the exact same tool-calling Assistant without another learner
  occurrence, a caller-visible generated ID, retrospective source leakage, or a
  general workflow;
- later same-input Assistant operations cannot inherit the learner-occurrence
  address while deterministically settling A1-canonical replay as
  `already_applied` and A2-bound change as conflict; or accepted product meaning
  requires same-occurrence A2 recovery instead of truthfully leaving
  `not_served` open;
- current claim/service observation cannot remain separate from Gate 8 exact
  physical replay, or finalization requires rewriting a terminal physical
  settlement/completed Tool Part instead of appending a domain receipt/event;
- recovery or retained-carrier truth cannot expose the finalization receipt and
  current owner projection without treating historical physical replay as a
  refreshed result;
- optional interaction order has no real context and service consumer;
- truthful service cannot bind the full current tool-calling Assistant
  presentation, keep a later post-tool Assistant distinct, bind complete
  tool/child results, or recover exactly without storing a transcript body, a
  program-certified semantic hint judgment, a shadow service path, or a new
  occurrence owner;
- the ordinary Agent's fallible source-relation interpretation cannot remain
  separate from runtime-proven occurrence, identity, permission, and transition
  facts in both storage and presentation;
- the maximum valid Gate 20 semantic value exceeds 2,048 bytes or can degrade to
  locator-only under the accepted Gate 18 entry rule;
- one/multiple candidate composition requires a universal ranking or durable
  active selection to meet this Gate's own claim;
- old immutable context cuts cannot remain readable without reinterpretation;
  or
- acceptance would require credentialed provider quality, general planning, or
  Gate 21A move-selection evidence.

Stop for the maintainer only when a review finding exposes a product/value
choice or expensive boundary that current authority and engineering evidence
cannot decide. Ordinary schema, API, algorithm, and test-shape choices remain
executor responsibility.

## Contract review history

The retained reviewer returned `Revise` on the first contract/theory pass,
closed `G20-CR-001..005` on the first closure pass, then closed
`G20-CR-006..007` and opened `G20-CR-008` on the second closure pass. The third
closure pass closed `G20-CR-008` and returned `Accept`. Before production
implementation began, read-only current-fork mapping exposed `G20-CR-009`: the
accepted wording did not distinguish the claim-owning tool-calling Assistant
from the later post-tool continuation Assistant that released-v1 may create. The
fourth closure pass closed `G20-CR-009` and opened `G20-CR-010`: A2 has a new
Assistant/model-operation identity but inherits A1's runtime-bound learner
occurrence and therefore cannot obtain another change-set address. The following
rows preserve the accepted history and current reopened delta:

| Finding | Repair candidate in this revision | Reviewer state |
| --- | --- | --- |
| `G20-CR-001` | closed purpose-appropriate service-source union; root-only semantic issuance; current-Assistant completion claim/finalization; explanation trace binds the committed bound Assistant presentation rather than “continue” | `CLOSED` by retained reviewer |
| `G20-CR-002` | tagged `iana(name, releaseID) \| fixed_offset(offsetMinutes)` provenance; fixed offset remains legal with unavailable source zone | `CLOSED` by retained reviewer |
| `G20-CR-003` | ordinary Agent authors fallible learner-request/direction or Tutor-initiation relations; runtime proves only occurrence/excerpt/lineage/permission/transition structure and presentation preserves that distinction | `CLOSED` by retained reviewer |
| `G20-CR-004` | every replacement has an explicit successor arm, including served/dismissed terminal carry without a generated-ID follow-up | `CLOSED` by retained reviewer |
| `G20-CR-005` | purpose reduced to 768 bytes; Gate 18's 2,048-byte entry ceiling retained; domain-admission and maximum-value/comparative-cost oracles made explicit | `CLOSED` by retained reviewer |
| `G20-CR-006` | adds `agent_correction` with exact prior owner read, rationale, root/delegated lineage, capability, permission, conflict, presentation, and explicit successor-source preservation/rebinding rules; Tutor-initiated durable meaning remains truthfully correctable without learner assent | `CLOSED` by retained reviewer |
| `G20-CR-007` | adds root-only nested `serve_complete_source` and `serve_current_assistant_when_complete` replacement arms plus explicit admission/completion phases; A→B correction persists through output failure and only an exact legal complete source serves B | `CLOSED` by retained reviewer |
| `G20-CR-008` | preserves the Gate 8 terminal physical settlement and completed Tool Part exactly; moves later `served \| not_served` state to a unique append-only FutureAttention finalization receipt/event; current state is available only through that event, owner read, or a new physical semantic duplicate | `CLOSED` by retained reviewer |
| `G20-CR-009` | binds a current-Assistant claim only to the exact same tool-calling Assistant message/model operation; incomplete/pre-tool fragments never serve alone, but eligible committed Text Parts or final Assistant-level structured output may serve after the whole same presentation commits; a later post-tool Assistant cannot substitute | `CLOSED` by retained reviewer |
| `G20-CR-010` | makes every later same-input Assistant inherit the same learner occurrence/effect address; replay of A1's full canonical payload is `already_applied`, any A2-bound source or changed service/rebind intent conflicts, and terminal `not_served` leaves the concern open until a genuinely new runtime-bound learner occurrence; no continuation/service-retry identity or no-new-message recovery is claimed | `CLOSED` by retained reviewer |

The retained reviewer accepted the current contract/theory layer with every row
closed. This restores the prior Whole-Gate implementation authorization but does
not accept implementation/evidence or authorize integration. Reviewer task
`019fd773-84c3-7841-9fc5-45f1b18d4a9f` remains reserved for that later layer.

## Independent-review questions

The contract/theory reviewer must try to reject or shrink the candidate on at
least these questions:

1. Is FutureAttention independently meaningful, or is any field an unearned
   reminder/todo, Goal, steering, evidence, active-purpose, or planning concept?
2. Do exact membership selection and tagged fixed-offset/IANA temporal semantics
   preserve target and time truth without fabricating provenance or importing
   Course or Goal authority?
3. Does occurrence-plus-change-set identity permit every legitimate multi-
   concern request while preventing resampling/recovery duplication,
   same-target collapse, and a later same-input Assistant from obtaining a
   second effect address or rebinding a terminal claim group?
4. Does the contract keep Agent-authored fallible creation and mutation
   relations separate from runtime-proven structure, and can both root and
   capability-bounded delegated Agents correct their own earlier interpretation
   without fabricating learner direction or evading current learner control?
5. Can service truthfully bind each admitted purpose-appropriate complete
   Interaction source, especially the full committed presentation of the exact
   tool-calling Assistant and returned delegated work, while refusing to
   substitute a later post-tool Assistant and avoiding delegated self-service or
   claims of correctness, mastery, or program-certified semantic alignment?
6. Is the lifecycle matrix complete under terminal-preserving correction,
   source deletion, stale target, replay, races, and recovery, including atomic
   A→B replacement plus an already-complete current source or current-Assistant
   realization without a second learner occurrence, caller-visible generated
   ID, or retrospective source reuse?
7. Does exact physical replay remain the immutable admission-time settlement
   with no domain read, while append-only finalization, owner reads, and a new
   physical semantic duplicate expose later claim state truthfully across crash,
   recovery, and every retained carrier?
8. Does every maximum-valid sole semantic contribution fit Gate 18's 2,048-byte
   ceiling without locator-only degradation, and does the comparative cost
   evidence preserve omission truth?
9. Does the conditional-default/multiple-unresolved composition preserve exact
   current-request priority, omission truth, old-cut immutability, and Gate 21A's
   later ownership?
10. Can the focused current-fork evidence causally close this Gate without
   trusting historical ALS aggregates or making an unauthorized external call?

The reviewer must return findings with stable IDs and an `Accept` or `Revise`
verdict. Implementation cannot begin on `Revise`. The same reviewer must close
all contract findings and later inspect the exact implementation/evidence
candidate; same-context executor self-review is not a substitute.
