# ALS-021 formal review maintenance contract

Status: v1 campaign complete; review locked; aggregation intentionally stopped
Date: 2026-07-12

Post-run update: 2026-07-13

## Purpose and boundary

This document explains the machinery that turns the 112 completed ALS-021
cases into an auditable engineering verdict. It is a lab contract, not a Tutor
runtime subsystem and not a product scoring architecture. Nothing under this
lab may be imported by `src/`.

The review machinery exists because attractive transcripts are not enough.
It must preserve the denominator, hide condition labels from reviewers, bind
ratings to the exact bytes reviewers saw, require explicit resolution of every
categorical disagreement, and make the final threshold calculation
reproducible after this conversation is gone.

The implementation is split at that real trust boundary:

- `formal-review-lock.ts` owns campaign projection, strict case validation,
  the pre-review seal, reviewer identity checks, and hash revalidation;
- `formal-review.ts` owns categorical differences, adjudication, aggregation,
  and the public CLI.

The split is not a generic service layer. Judgment code cannot silently weaken
the bytes it receives, and lock code does not know how a rating becomes a pass.

## Post-run outcome

The formal campaign `main-als-021-v1-5f1a04c64afa` completed all 112 samples
on their first selected attempt. Export, input sealing, two isolated reviewer
submissions, reviewer locking, and deterministic disagreement generation also
completed. The input receipt is
`2e6ca349957f2d20f2d1615c3bde1ffd0a7d9c72e8b1e9cf8a2c02342e0aca59`;
the review-lock receipt is
`18531860d50be4c582cb28ac015f2420969eb1f20972b714ad2f39e51b500ab0`.

Aggregation did not run. The two submissions produced 518 categorical
disagreements, 428 of which involved one reviewer treating a field as
`not_applicable`. This exposed a reviewer-applicability calibration failure,
not a plausible queue for neutral exact adjudication. Independent predeclared
mechanical gates had already failed, and both raw reviewers gave the critical
independent-prediction return 0/8. Adjudicating every field after unblinding
could not rescue acceptance and would have created false precision.

Accordingly, no `review-adjudication.jsonl`, `formal-decisions.json`, or
`formal-verdict.json` exists. `review-analysis-stop.json` records the stop
without resolving reviewer categories. The campaign is complete and v1
promotion is blocked; only the attempted fine-grained qualitative aggregate is
undefined. See
[`shared-tutor-policy-formal-result-2026-07-13.md`](./shared-tutor-policy-formal-result-2026-07-13.md)
for the result and architecture consequence.

## Artifact lifecycle

The lifecycle is intentionally one-way:

```text
112 complete cases
-> export opaque individual and contrast packets
-> seal review inputs
-> two independent blind submissions
-> lock submissions
-> derive categorical disagreement queue
-> adjudicate exactly that queue
-> aggregate once
-> immutable decisions + verdict
```

The diagram records the frozen v1 design. In the actual campaign, execution
stopped after deriving the disagreement queue for the reason above; the last
two arrows were not performed.

### 1. Export

`review.ts export` requires exactly the frozen 8-by-14 campaign. It emits:

- `review-packets.jsonl`: 112 anonymous individual packets;
- `review-contrast-packets.jsonl`: eight anonymous history pairs and eight
  anonymous Agenda-purpose triads;
- `review-instructions.json`: the generic rating schema and operational
  definitions;
- `review-map.json` and `review-contrast-map.json`: hidden mappings retained by
  the primary architect.

Each packet is reconstructed from the selected `complete.json` result. A
completed non-infrastructure case remains in the packet set even when it has
no usable assistant answer. Final persisted Agenda changes, not attempted tool
arguments, are projected for semantic review.

### 2. Pre-review input seal

`formal-review.ts prepare` must run before packet distribution. It validates
and hashes:

- all five exported artifacts;
- all 112 `complete.json` files and their selected result bundles;
- the exact block, position, scenario, and blind-order mappings;
- packet projections rebuilt from those results;
- the frozen manifest and executable review-rule sources.

It writes `review-input-lock.json` plus a SHA-256 receipt. Re-export is then
forbidden. Both reviewer submissions must record this exact receipt hash.

In ordinary language: the exam is sealed before anyone marks it. A rating for
another packet revision cannot later be attached to this campaign.

### 3. Reviewer-output lock

`formal-review.ts lock` accepts exactly reviewers `A` and `B`. Their task,
model, and provider identities must be non-empty and distinct after whitespace
normalization. Each supplies 112 individual records, 16 contrast records, and
the pre-review input hash.

The lock validates the exact ID sets, hashes the original reviewer bytes and
all earlier inputs, and refuses overwrite. Every later operation rechecks the
lock receipt and every referenced file. Textual evidence may differ without
creating a disagreement; only the frozen categorical fields are compared.

### 4. Disagreement and adjudication

`formal-review.ts disagreements` produces a deterministic queue in this order:

1. `R001..R112`, each in the frozen categorical-field order;
2. `C001..C016` contrast ratings.

A field enters the queue when reviewers differ or when either reviewer says
`unclear`, including `unclear/unclear`. The adjudication JSONL must cover the
queue exactly: no missing, extra, or duplicate key; no `unclear` resolution;
and non-empty evidence for every resolution. Agreement fields cannot be
overridden.

### 5. One-shot aggregation

Aggregation revalidates the complete chain, reads and hashes adjudication from
the same byte snapshot, writes full per-sample decisions, then writes the
summary verdict. Existing decisions or verdict files are never overwritten.
The summary links the decisions file, lock, reviewers, and adjudication by
SHA-256.

The synthetic contract-test path uses separate filenames, a separate schema
suffix, `ALS-021-SYNTHETIC-FIXTURE`, and `promotionEligible: false`. It cannot
be mistaken for formal evidence.

## Executable scoring rules

For one sample:

```text
reviewerCriterionPassed = every typed required rating accepts resolved value
primaryPassed = not automaticFailure and reviewerCriterionPassed
```

An automatic failure comes from the completed result's non-reviewable policy
sample flag and cannot be reversed by reviewer or adjudicator. The reason
ablation condition remains in the eight-sample denominator but is explicitly
exploratory and has no primary acceptance gate.

Formal gates are:

- each other condition: at least 7 of 8 primary passes;
- each other condition: at least 7 of 8 complete mechanical-policy passes;
- severe factual errors: zero across all 112;
- unsupported learning-state claims: zero across all 112;
- history-pair targeted components plus blind contrast: at least 7 of 8;
- Agenda-purpose targeted components plus blind contrast: at least 7 of 8;
- zero-write mutation precision: every zero-write sample;
- explicit Agenda creation recall: at least 7 of 8;
- unaided Agenda address recall: at least 7 of 8;
- guided false address: zero;
- each required material-read condition: at least 7 of 8.

The free-text `observedMove`, evidence prose, scenario notes, and maintenance
counterexamples are retained for diagnosis. They are not keyword-parsed gates.

## Recovery and failure behavior

| State | Required behavior |
| --- | --- |
| export interrupted before input seal | inspect or re-export; no reviewer may start |
| input manifest exists without hash receipt | fail closed; inspect the partial seal before recovery |
| any sealed packet/result/rule byte changes | reject lock, diff, and aggregation |
| reviewer file invalid or references another input hash | reject the entire reviewer submission |
| review lock exists without its hash receipt | fail closed; do not silently relock |
| disagreement file missing/stale | recompute from locked reviewer bytes |
| adjudication misses or adds one key | reject aggregation |
| decisions written but verdict absent | fail closed; inspect before any manual recovery |
| verdict exists | never aggregate again or overwrite it |

Formal campaign integrity failures—bad coordinates, foreign result paths,
wrong source manifest, alias drift, program failures, observer inconsistency,
or corrupt cost accounting—throw before scoring. They are not converted into a
low model-policy score.

## Privacy and blind boundary

Review packets contain the sanitized model boundary archived by the passive
observer. They do not contain wire requests, provider responses, credentials,
headers, cookies, scenario IDs, condition families, hidden criteria, or
mapping files. Reviewers receive only the two packet files,
`review-instructions.json`, and the pre-review seal hash. They must not inspect
the protocol rules, maps, result directories, or one another's output.

## Change protocol

Before `frozen-v1.json` exists, a change to a rating field, typed requirement,
contrast component, threshold, packet projection, or lock rule requires:

1. a focused regression or counterexample test;
2. an update to the governing protocol and this record;
3. a new provider-input equivalence check if any model-visible input changed;
4. full repository verification.

After freeze, any such change creates a new protocol revision. Do not edit the
formula and reuse the old campaign. Product code may receive only a separately
demonstrated invariant; scenario tables, review labels, thresholds, and blind
machinery remain lab-only.
