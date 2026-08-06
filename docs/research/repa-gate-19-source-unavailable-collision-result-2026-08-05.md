# Gate 19 source-unavailable collision result

Date: 2026-08-05

Status: completed bounded pre-contract falsification result against exact base
`8ababa1ee53cd0907056f33812621142538807dd`. This record admits no production
schema or implementation by itself. It exists to decide whether current Gate 18
state and reads are sufficient and, if not, which semantic distinctions survive
one-by-one ablation.

Question:

> Can one later fresh-Session request require different mutually exclusive
> Tutor actions after the source Session has been legally deleted, while every
> currently accepted Course, navigation, Goal, steering, Material/current-use,
> Interaction, and Gate 18 read is equal? If so, which exact distinction is the
> smallest source-linked candidate that breaks the collision?

The result is **positive only for an unavailable-response boundary**. It is
negative while the exact Interaction sources remain readable. It earns one
binary response-to-selector relation and one binary Tutor-disclosure condition;
it does not earn a general criterion authority, uncertainty state, inference,
aggregation, mastery, score, activity record, mandatory write, or action
selector.

## Method and provenance

The result combines an exact fixture-specific oracle with current production
source/lifecycle evidence. No provider, credential, candidate schema, new
production path, or historical ALS code was used.

Fresh focused execution from `packages/core` used Bun `1.3.14`:

```text
bun test test/turn.test.ts -t "projects same-title recent Turns as body-free locators and never falls back to a similar transcript|retains only a typed unavailable receipt while a fork clone survives and collects it with the final clone"
2 pass, 0 fail, 16 expect() calls

bun test test/material-selector.test.ts test/material-map-authority.test.ts -t "selects whole targets and exact Artifact byte ranges|owns optional neutral many-to-many alignment and derives typed current stale causes"
2 pass, 0 fail, 19 expect() calls
```

Those tests establish only the production mechanics used by the derivation:

- a fresh Session receives body-free recent Interaction locators and an exact
  read returns only the selected Turn's bodies, never a similar/latest Turn;
- accepted Session deletion removes the source transcript while retaining only
  typed unavailable identity/provenance;
- one immutable Artifact byte-range selector has an exact witness; and
- an alignment is optional neutral source-to-Course membership, not an
  assessment, evidence, or pedagogic relation.

Direct source inspection fixes the deletion result. `deleteSessionTree` records
unavailable Turn identity and then deletes Session rows in
`packages/core/src/turn/turn.ts:1959-1978`. The unavailable table in
`packages/core/src/turn/sql.ts:488-518` contains identity, time, terminal state,
lineage, occurrence, and deletion time but no transcript body. Gate 18's exact
Interaction read in `packages/core/src/turn/learning-context.ts:268-315` returns
`source_unavailable`/`source_deleted` and `items: []`; it does not retarget.

The exact fixture below supplies the missing semantic/action half. All strings
are literal UTF-8 bytes. Hashes are SHA-256 of those bytes without a trailing
newline.

## Exact material and target fixture

The current main checkout observes
`docs/foundation/00-product-origin.md` as an LF file with:

| Field | Exact value |
| --- | --- |
| Artifact ID | `art_00000000000000000000000001` |
| Artifact Revision ID | `arv_00000000000000000000000002` |
| observed file SHA-256 | `c32f085427d5e316904d76a4cff6e597b9dd3afc880d9d4b656af7062521f16d` |
| Map ID | `mmp_00000000000000000000000003` |
| outline node ID | `mnd_00000000000000000000000004` |
| selector ID | `msl_00000000000000000000000005` |
| selector kind | `artifact_byte_range.v1` |
| zero-based byte range | `[12033,12134)` |
| selected byte count | `101` |
| selector witness SHA-256 | `54fe411f18c36865df640ffbb92e1aabd959fdaf1bf380a3d782e757ae1a761d` |
| Course ID | `crs_00000000000000000000000007` |
| View ID | `cvw_00000000000000000000000008` |
| immutable View Revision ID | `cvr_00000000000000000000000009` |
| item ID / title | `cit_0000000000000000000000000A` / `Execution substrate and learning state` |
| neutral alignment ID | `mca_00000000000000000000000006` |

The exact selected UTF-8 bytes are one positive proposition, including the LF
shown below and no trailing newline:

```text
The inherited Agent loop is
the ordinary execution substrate, not the long-term learning-state model.
```

The IDs are fixed valid alpha-equivalent fixture identities. The selector—not
the alignment—provides the exact source slot under comparison. The alignment
only proves that the selector is neutrally connected to the exact Course item.
Using it does not make the selector an assessment or say what a response means.

The first draft used a CRLF working-copy hash and selected only a false equation
from a multi-equation design-check list. That was not a stable, polarity-complete
criterion: “supports” would depend on an unstored expectation to reject the
equation. The revised fixture uses the source-controlled LF bytes of one
affirmative proposition. Production identity still binds an admitted exact
Artifact Revision and immutable selector/witness under current-use rules; the
repository path and observed file hash are experiment provenance only.

## Exact three histories

All three histories use the same two completed root Turns in Session
`ses_0000000000000000000000000B`, the same timestamps, source order, Course,
anchor, empty Goal/steering sets, material target, and later current request.
Only the literal B1 Tutor bytes and B2 learner-response bytes vary.

### Shared answer-hidden elicitation

```text
Without looking back, state whether the inherited Agent loop is the ordinary execution substrate or the long-term learning-state model, and give one reason.
```

UTF-8 bytes: `156`; SHA-256:
`02e88b6c4c9d78ed420671de0378d4bc0a8e5ca7b65bcf208f4f2e2ba4eb6924`.

### Decisive-disclosure alternative

```text
The answer is that the inherited Agent loop is the ordinary execution substrate, not the long-term learning-state model. Now repeat that distinction.
```

UTF-8 bytes: `149`; SHA-256:
`30469268a6f18be53f067d924599a4caf23d0d786ba632633138f34c5076ffcd`.

### Response `S`

```text
It is the ordinary execution substrate, not the long-term learning-state model. Session transcript history therefore does not replace separate learning authorities.
```

UTF-8 bytes: `164`; SHA-256:
`24ae67b2c6e008a43130d584d503ab2aadcfa0f4c12f4abb6056e79ad051a533`.

### Response `N`

```text
It is the long-term learning-state model. The Session transcript itself contains everything Repa needs for durable learner adaptation.
```

UTF-8 bytes: `134`; SHA-256:
`c769f150ef54f0b915d94d8435c2d506bac27b4ae2e367b0a9465fcc253e3895`.

### Histories and source-readable oracle

| History | B1 Tutor bytes | B2 learner bytes | Fixture-only relation to exact selector | Fixture-only disclosure condition |
| --- | --- | --- | --- | --- |
| `S` | shared answer-hidden elicitation | response `S` | `supports` | `learner_response_before_tutor_disclosure` |
| `N` | shared answer-hidden elicitation | response `N` | `does_not_support` | `learner_response_before_tutor_disclosure` |
| `D` | decisive-disclosure alternative | byte-identical response `S` | `supports` | `tutor_disclosure_before_learner_response` |

The oracle is deliberately fixture-specific and mechanical:

```text
relation = supports iff response_sha256 == 24ae67b2...a533
relation = does_not_support iff response_sha256 == c769f150...3895

exposure = response_before_disclosure iff tutor_sha256 == 02e88b6c...6924
exposure = disclosure_before_response iff tutor_sha256 == 30469268...ffcd
```

It is not a production grader, inference rule, or proposed keyword matcher. Its
only purpose is to remove evaluator ambiguity from the admission experiment.

While B1/B2 are readable, Gate 18 exact Interaction reads supply both hashes,
and the exact Material read supplies the selector bytes/witness. The ordinary
Agent can therefore reconstruct the two fixture distinctions. This is the
negative `A1/A2` result: readable sources do not require a durable assessment.

## Exact later request and mutually exclusive action oracle

Fresh Session C contains only this learner request:

```text
Continue. If my previous response supported the criterion before you disclosed the answer, give only one application question. If it did not support the criterion, give only the correction. If you disclosed the answer first, give only a new answer-hidden check. Choose exactly one branch.
```

UTF-8 bytes: `288`; SHA-256:
`1b19637374085117ae91e3ae7542f9fb961a089c93e9b8457e8611f2fee41e2d`.

The request makes the three later action families mutually exclusive rather
than relying on a vague pedagogical preference:

| History | Only admissible branch under the exact current request | A branch that is not equally honest/useful |
| --- | --- | --- |
| `S` | `application_question_only` | correction or another answer-hidden check violates the learner's explicit branch and repeats an already answer-hidden successful distinction |
| `N` | `correction_only` | application proceeds while leaving the exact source-backed distinction uncorrected; a new check withholds the correction explicitly requested for this branch |
| `D` | `new_answer_hidden_check_only` | application treats disclosed repetition as answer-hidden evidence; correction misclassifies the byte-identical response's relation to the selector |

A combined “correct and apply” response is not a common solution because the
current request says `give only` and `Choose exactly one branch`. Returning a
clarification is also unnecessary while sources are readable and cannot recover
the deleted facts after deletion. Thus no single branch is both truthful to the
known history and compliant with the same current request across `S/N/D`.

This is a bounded later-action collision. It does not claim that Repa should
generally obey a fixed three-way teaching workflow; the current learner request
is the consumer that makes the consequence exact.

## Existing-owner projection after deletion

At time `300`, accepted Session-tree deletion removes Session B and all B1/B2
Message/Part bodies. The following is the exact comparison normal form for the
current owner-visible values in all three isolated LearnerHomes. It includes
every semantically relevant existing owner field; fixture IDs and times are
held literally equal, so no opaque-ID normalization hides a difference.

```json
{"schema":"gate19-existing-owner-projection-v1","current_request_sha256":"1b19637374085117ae91e3ae7542f9fb961a089c93e9b8457e8611f2fee41e2d","course":{"course_id":"crs_00000000000000000000000007","view_id":"cvw_00000000000000000000000008","revision_id":"cvr_00000000000000000000000009","item_id":"cit_0000000000000000000000000A"},"navigation":{"default_course":null,"anchor_course_id":"crs_00000000000000000000000007","anchor_item_id":"cit_0000000000000000000000000A"},"goals":[],"steering":[],"material":{"artifact_id":"art_00000000000000000000000001","artifact_revision_id":"arv_00000000000000000000000002","file_sha256":"c32f085427d5e316904d76a4cff6e597b9dd3afc880d9d4b656af7062521f16d","map_id":"mmp_00000000000000000000000003","selector_id":"msl_00000000000000000000000005","selector_start_byte":12033,"selector_end_byte":12134,"selector_witness_sha256":"54fe411f18c36865df640ffbb92e1aabd959fdaf1bf380a3d782e757ae1a761d","alignment_id":"mca_00000000000000000000000006","availability":"available"},"interactions":[{"session_id":"ses_0000000000000000000000000B","turn_id":"trn_00000000000000000000000022","causal_occurrence_id":"lco_00000000000000000000000012","time_admitted":200,"time_terminal":210,"terminal_state":"completed","status":"source_unavailable","presentation_provenance":"source_unavailable","time_deleted":300,"message_range":null,"part_range":null,"exact_read":{"type":"source_unavailable","reason":"source_deleted","items":[]}},{"session_id":"ses_0000000000000000000000000B","turn_id":"trn_00000000000000000000000021","causal_occurrence_id":"lco_00000000000000000000000011","time_admitted":100,"time_terminal":110,"terminal_state":"completed","status":"source_unavailable","presentation_provenance":"source_unavailable","time_deleted":300,"message_range":null,"part_range":null,"exact_read":{"type":"source_unavailable","reason":"source_deleted","items":[]}}]}
```

Canonical UTF-8 bytes: `1880`; SHA-256:
`a639563ab7727785facdcd091889a7a67f588d27a7487c839615b3a9bc2c4d6f`.

The current Session request, Course/View/item, navigation anchor, empty Goal and
steering families, exact available material selector/alignment, terminal
Interaction identities/times, and exact read results are byte-equal across
`S/N/D`. Gate 18 truthfully exposes no B1/B2 content. Reading the available
criterion cannot reconstruct which response occurred or whether disclosure
preceded it.

Therefore:

```text
existing_projection(S) = existing_projection(N) = existing_projection(D)

required_branch(S) != required_branch(N)
required_branch(S) != required_branch(D)
required_branch(N) != required_branch(D)
```

The result would be falsified if any accepted owner/read supplied a B1/B2 body
or an equivalent durable condition after deletion, or if the exact current
request admitted one common branch. Current source, fresh tests, and the literal
request reject both falsifiers.

## One-by-one meaning ablation

| Candidate meaning | Remove it | Result |
| --- | --- | --- |
| raw response occurrence copy | keep only existing occurrence locator/tombstone | no loss of identity; copying bytes would violate Session deletion, so reject the copy |
| exact criterion identity | remove exact Map/selector target | `supports` has no bounded object and can silently drift; retain exact selector identity |
| neutral alignment as criterion | replace exact selector identity with alignment alone | one alignment contains no assesses relation and may cover several claims; reject alignment-as-criterion |
| Agent-authored criterion claim | let immutable selector bytes be the entire criterion slot | no loss for this fixture; remove durable claim prose and require a finer selector when a finer criterion is needed |
| `supports` versus `does_not_support` | collapse the relation | `S` and `N` collide while their exact request branches differ; retain the binary relation |
| before- versus after-disclosure | collapse the condition | `S` and `D` collide while their exact request branches differ; retain the binary condition |
| `inconclusive` | replace with no record | no fixture branch consumes a durable inconclusive head; remove it |
| `not_established` exposure | replace with no record | no fixture branch consumes it; remove it |
| source-readable automatic pressure | expose the exact sources instead | `A1/A2` rederive locally; do not inject the durable assessment automatically while those sources remain readable |
| source-unavailable automatic pressure | omit the current corrected head | `S/N/D` collapse; retain only when the response/condition source is unavailable and the exact criterion remains usable |
| durable hypothesis/inference | let the later Agent form a move-local interpretation | no loss for the exact branch; reject durable inference |
| score, confidence, aggregation, mastery, recommended action | read the binary source-linked assessment and current request | no loss; reject all |

## Correction control

Correction is required for the admitted evidence judgment, not as proof of a
general learner-state model. After deletion, a later learner source may say:

```text
Correction: the stored assessment is wrong. My deleted response supported the criterion; record this as my report, not as independently re-observed performance.
```

UTF-8 bytes: `160`; SHA-256:
`aa3da6c08b510a050bceb3c28a25d9551c5b17de2bcd91314bf862f91ab50094`.

An explicit revision from `does_not_support` to `supports` changes the current
owner-read head while the basis remains visibly `learner_report`, the original
judgment remains, and the original response stays unavailable. Tool success
does not verify the report. While this correction message is still readable,
Gate 18 can derive the corrected branch directly and the record exerts no
automatic pressure. After accepted deletion makes this distinct correction
source unavailable too, the corrected head can change the same exact later
branch from `correction_only` to `application_question_only`. An explicit
retraction removes that active automatic pressure and retains history.

This earns append-only correction/retraction provenance and the
`learner_report` basis only for an explicit source-bearing correction revision.
It does not earn `learner_report` on initial create, allow a deleted observation
to be relabelled as `tutor_interpretation`, or let retraction rewrite the prior
basis. It does not earn a durable uncertainty value: ambiguous cases remain
zero-write.

## Decision

The source-readable controls confirm the old `ALS-024` Stage 2 negative result:
Gate 18 plus exact Interaction/Material reads are sufficient while their bodies
remain honestly available.

The deleted-source fixture establishes one current-fork collision. The smallest
candidate that breaks it is:

- existing Interaction occurrence identity, never a copied occurrence;
- an exact immutable Material Map selector as the criterion source slot, with
  the alignment retained only as neutral target provenance;
- one current correctable binary `supports`/`does_not_support` evidence
  judgment;
- one current correctable binary response-before-disclosure/
  disclosure-before-response condition; and
- program-bound `tutor_interpretation` for the initial available-source
  assessment, `learner_report` only for an explicit correction source, and
  source-unavailability truth.

Automatic Gate 18 pressure is earned only when the exact response/condition
source is unavailable and the exact criterion remains usable. Source-readable
records remain inspectable by their owner read but do not compete with direct
derivation. No record remains a legal result for every ambiguous, ordinary,
same-Session, or otherwise unconsumed interaction.

This result is sufficient to derive a narrow Gate 19 contract candidate. It is
not implementation authority and does not prove ordinary-model reliability,
pedagogical efficacy, representative move selection, future attention,
planning, TUI inspection, or product-loop closure.
