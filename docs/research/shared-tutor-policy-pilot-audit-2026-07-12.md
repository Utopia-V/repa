# ALS-021 excluded-pilot audit

Date: 2026-07-12
Status: two draft pilots retained as diagnostic evidence; neither is eligible
for v1 formal scoring. Post-run result recorded 2026-07-13; the 112-sample main
campaign is complete and v1 promotion is blocked.

## Campaign summary

| Campaign | Completed selection | Infrastructure retry | Observed estimate | Conservative budget charge | Use |
| --- | ---: | --- | ---: | ---: | --- |
| `d970913980b6` | 14/14 | one socket-close retry | USD 0.01528450 | USD 0.04496334 | interface, fixture, observer, and recovery diagnosis |
| `5171a2474590` | 14/14 | one timeout retry | USD 0.01530564 | USD 0.04482754 | repaired-boundary pilot and scoreability check |

Both charges are experiment-side accounting under separate USD 0.20 caps, not
provider invoices. The observed estimates sum to USD 0.03059014; the
conservative charges sum to USD 0.08979088. They must not be pooled with later
formal results.

## First pilot: scope and retained run

The first excluded pilot exercised all fourteen ALS-021 conditions against
`deepseek-v4-flash`. Its ignored campaign directory was keyed by the draft
source fingerprint `d970913980b6`.

One provider socket closed after the material-read step of
`failed_prose_explicit_visual_control`. The runner stopped immediately. The
single explicit infrastructure retry retained attempt 1, selected successful
attempt 2 through `complete.json`, skipped the eleven earlier completed
conditions, and then ran conditions thirteen and fourteen.

Final campaign accounting was:

- 14 selected non-infrastructure condition results;
- all selected program invariants and reviewability checks passed;
- one retained infrastructure failure plus its one allowed retry;
- one actual response model ID, `deepseek-v4-flash`;
- observed upper-bound estimate: USD 0.01528450;
- conservative budget charge: USD 0.04496334 of the USD 0.20 cap.

The observed estimate and budget charge are experiment accounting, not a
provider invoice.

## What the pilot invalidated

Two failures were not legitimate Tutor-policy observations.

### Model-facing Agenda identity was ambiguous

Routine context rendered a concern as `concern-id@v1`, while Agenda tools
accept the bare concern ID and bind the entity version from the immutable
context cut. In `return_independent_completed`, the model copied the displayed
token into `concernId`; the executor correctly rejected the unknown identity.

This is an adapter defect. The repair renders `concernId` and `entity version`
as separate labeled values. The domain continues to bind and validate version;
the model does not gain authority over it.

### Retained steering and future attention overlapped in tool prose

For `explicit_later_return`, the model used
`retain_learning_wide_timed_steering` for “tomorrow at 20:00, return here for an
independent prediction.” That write was legal under the old broad description,
but semantically wrong: timed steering is effective immediately and
`validUntil` is its expiry, so the retained instruction would disappear at the
requested return time.

The accepted architecture already separates these meanings:

- retained steering is an already-operative temporary constraint on Tutor
  behavior, such as “do not quiz me today”;
- Agenda future attention is a source-linked reason or commitment to perform
  learning work at or after `notBefore`.

The repair clarifies this existing authority boundary in the system prompt and
both tool descriptions. It does not add a Tutor-action enum, a scheduler, or a
new persisted type.

## Fixture and rubric repairs

The first pilot also exposed two experiment-definition defects:

1. The completed-versus-guided Agenda pair named an answer but did not include
   the exact earlier program. Accurate feedback therefore required guessing
   which task the learner meant. Both current inputs now contain the same full
   program and answer; only the declared assistance condition differs. A
   provider-input differential test protects that control.
2. `capable_independent_prediction` asked whether the learner could judge a
   boundary independently, but its hidden criterion required exactly one
   question. Question count was neither model-visible nor represented in the
   blind-review schema. The criterion now permits a bounded, moderate amount
   of independently answerable prediction work while retaining the real
   invariant: no answer or decisive hint before commitment.
3. After the pair received a complete self-contained program, the unaided
   completion case no longer needed a second course-material read merely to
   give accurate feedback and change Agenda disposition. Both service controls
   now treat that read as optional; factual correctness and unsupported claims
   remain qualitative gates.

The 1,200-token per-step output limit remains unchanged because it is the
current terminal production setting in `src/cli.ts`. One visual-control pilot
response reached that limit after already delivering the requested pointer and
state trace. Truncation remains visible to formal review; the pilot is not used
to raise the cap and make the observed model look better.

## Measurement and recovery repairs

The model observer correctly omitted credentials and headers, but its first
sanitizer also collected every string nested under a `headers` container as a
global secret. Ordinary rate-limit values such as `0`, `10`, and `20` then
replaced matching text throughout model requests and stream parts. That did not
change the live model stream or final durable assistant text, but it corrupted
the archived model boundary used by blind review.

The observer now drops header/cookie containers without promoting their
ordinary metadata to global redactions. It still removes sensitive fields,
scrubs explicit caller-supplied credentials and recognizable credential forms,
and has a regression test proving that header counters do not alter
`ISO-8601`, code numbers, or tool IDs in the detached observation.

Campaign resume also now validates the selected result both when a completed
case is skipped and when a crash left `result.json` persisted just before
`complete.json`. The result must stay inside that exact case and its mode,
protocol revision, block/position, scenario, requested model, frozen-source
fingerprint, program gate, alias consistency, and cost must agree with the
active campaign. A stale or foreign result or completion pointer therefore
fails closed instead of silently reducing the formal denominator.

## Observations deliberately not repaired

Several responses appear to ignore a visible purpose, overclaim from learner
self-report, or fall back to generic re-teaching. In particular, the first
pilot did not preserve independent work for `return_independent_prediction`
and did not create an observable distinction for `return_discrimination`.

Those are candidate policy/model results, not fixture impossibilities. No
scenario-specific routing, expected-action prompt, keyword hint, or Tutor-move
enum was added in response. They remain for the frozen formal experiment to
measure.

## Second excluded pilot

After the interface, fixture, observer, denominator, and recovery repairs, all
fourteen conditions ran again under source fingerprint `5171a2474590`. The
first condition timed out during its second provider call. The runner retained
the failed attempt, performed the one explicitly allowed infrastructure retry,
selected successful attempt 2 through `complete.json`, and completed the other
thirteen conditions without another retry.

The campaign therefore retained:

- 14/14 selected non-infrastructure results;
- one timed-out infrastructure attempt plus one explicit retry;
- passing program and harness integrity checks for every selected result;
- observed upper-bound estimate USD 0.01530564; and
- conservative budget charge USD 0.04482754 of the USD 0.20 cap.

The archived pre-repair assessment marked 11 of the 14 selected results as
mechanically conforming. Once the now-self-contained completed-service control
was correctly treated as not requiring a redundant material read, the repaired
interpretation is 12/14. This is a diagnostic count, not a formal pass rate:
there was one sample per condition, no frozen v1 campaign, and no blind
qualitative judgment. The two remaining mechanical observations were:

1. `capable_independent_prediction` did not read material that the condition
   required before teaching from it; and
2. `return_reason_ablation` addressed the concern merely because it was due and
   the learner said to continue, despite the purpose-bearing reason being
   absent.

Those are scoreable Tutor-policy/model behaviors rather than impossible
fixtures. Qualitative inspection also left risks of generic re-teaching in the
independent-prediction and discrimination cases. They were deliberately not
converted into scenario-specific prompt instructions.

After these pilots, the changed default Tutor-policy semantics received the
explicit production revision `tutor-default-v2`. That is the policy identity
intended for the formal campaign. The selected second-pilot operations record
the older `tutor-default-v1` label even though the provider-visible steering,
Agenda, and concern-rendering semantics already match the current policy. This
is an identity correction, not a prompt change.

To test that claim without paying for a third diagnostic sample, a checked-in
replay oracle feeds the 14 selected second-pilot model streams through the
current Tutor loop. Across 29 model calls, every provider-visible request is
identical after only trace-consistent alpha-renaming of production-generated
Agenda concern/effect UUIDs. Prompt text, tool definitions and schemas, learner
inputs, reasons, material, timestamps, revisions, tool-call IDs, and sampling
parameters are not normalized. Bun, dependency/adapter hashes, and the formal
model configuration also match. The fixture is self-contained and excludes
wire requests, headers, cookies, credentials, and provider responses.

This deterministic result proves that the current program presents the same
test to the provider as the repaired second pilot. It does not prove that an
unseeded model will answer the same way or that the answer teaches well. Those
are precisely the formal repeated-sample and blind-review questions. A third
paid pilot would add another excluded stochastic sample without testing any
new provider-visible repair, so it is deliberately omitted.

## Consequence and next gate

Both `d970913980b6` and `5171a2474590` are permanently excluded diagnostic
evidence. Production-policy revisioning and formal-instrumentation changes make
their source manifests stale by design, so neither can produce
`frozen-v1.json` or be pooled with a later campaign. The replay oracle is only
a pre-freeze input-equivalence waiver; it does not upgrade either pilot into a
formal observation.

The second pilot closed the requirement to distinguish interface/fixture
failures from scoreable policy behavior. At the pre-run boundary, the gates
were:

1. **closed:** focused and full repository checks pass;
2. **closed:** the formal denominator, recovery, two-stage artifact lock,
   contrast, disagreement, exact adjudication, and 7/8 aggregation paths pass
   deterministic preflight without oracle leakage;
3. **closed:** `frozen-v1.json` binds the current source,
   `tutor-default-v2`, provider-input replay oracle, and formal-review code;
4. eight complete blocks must produce 112 retained formal samples; and
5. two independent blind reviews, their locked disagreement adjudication, and
   the predeclared contrast checks must complete before any policy conclusion.

Post-run update (2026-07-13): step 4 completed 112/112 on first selected
attempts. Both independent blind submissions were also completed and locked,
but they produced 518 categorical disagreements. The dominant disagreement was
whether a rating field applied at all. Exact adjudication was intentionally not
performed after objective gates had already made v1 acceptance impossible.

In plain language: the repeated experiment completed, but the ambitious
fine-grained grading instrument failed calibration in real use. The raw bytes
remain sealed; no precise aggregate was manufactured. The policy is not
promoted, and the durable result is the narrower architecture finding that
Agenda state survived while its selected purpose did not reliably govern the
later teaching move.

The governing pre-run protocol remains
[`shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md`](./shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md).
The completed campaign result is
[`shared-tutor-policy-formal-result-2026-07-13.md`](./shared-tutor-policy-formal-result-2026-07-13.md).
