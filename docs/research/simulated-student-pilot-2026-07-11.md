# Simulated-student benchmark pilot and freeze record

Date: 2026-07-11

Status: excluded pilot; no formal main case had been executed when this record
was written.

## Scope and elapsed work

The interrupted work period contained about **25 minutes of effective
execution**, not an overnight experiment. That period produced the benchmark
skeleton and two excluded pilot runs. Later freeze work repaired the benchmark
before any main result was observed.

The pilot asks whether the transport, simulator contract, source capture,
candidate schema, and metrics can run at all. Its scores cannot support product,
architecture-effect, or publicity claims.

## Excluded attempts

| Artifact | Logical model calls | Model-call elapsed time | Estimated upper-bound cost | Observed result |
|---|---:|---:|---:|---|
| `2026-07-11T05-46-25.229Z-simulated-student-benchmark-pilot-deepseek-v4-flash.json` | 6 | 18.060 s | $0.00178804 | Declared evidence exact 3/4; answer-only exact 1/4; both selector pilot cases were too easy. |
| TLS/source attempt without a completed run bundle | 0 | not recorded | $0 | jsDelivr certificate verification failed before model work. TLS verification was not disabled. |
| `2026-07-11T05-48-24.260Z-simulated-student-benchmark-pilot-deepseek-v4-flash.json` | 6 | 16.081 s | $0.00153259 | Declared evidence exact 4/4; answer-only exact 2/4; both selector pilot cases again failed to discriminate baselines. |
| `2026-07-11T07-40-47.917Z-simulated-student-benchmark-pilot-deepseek-v4-flash.json` | 18 | 29.532 s | $0.00156481 | Per-case transport worked except stateless selection: both choices were semantically correct, but an unnecessary reason-code enum rejected their outputs. |
| `2026-07-11T07-42-11.961Z-simulated-student-benchmark-pilot-deepseek-v4-flash.json` | 18 | 30.597 s | $0.00102025 | Final pre-freeze smoke: zero schema, identity, authority, leak, stimulus, or unknown-action failures. |

The elapsed values above sum model calls and do not represent wall-clock user
waiting time, source retrieval, benchmark implementation, or analysis.

## Pilot defects and repairs

Every change below occurred before formal main execution.

1. **Open error labels were not reproducible.** Candidate error tags became a
   closed vocabulary, and the model prompt lists that vocabulary.
2. **The first leak diagnostic searched for oracle action values.** Candidate
   values legitimately appear in the supplied task set, so the diagnostic now
   checks forbidden field names and hidden-state text instead.
3. **Live source retrieval was brittle.** A verified local cache was added.
   Source URLs were subsequently changed from `master` to Git commit
   `52c1e61915bc8970a950a3f59bd845827e49b4bf`; task, solution, and combined byte
   hashes are checked before model calls. A mismatching network response cannot
   overwrite a valid cache.
4. **The stateless selector accidentally received semantic reason annotations.**
   Its input was reduced to the current goal, time budget, candidate identity,
   label, duration, and the latest raw response when one exists. This makes the
   comparison about the declared projection/reason contract rather than a
   duplicated state packet.
5. **The original main fixed queue had no ordinary successes.** Two product-
   motivated cases were added: an ordinary due review and repeated local
   remediation. The frozen fixed queue therefore has two successes and four
   failures. The choice is disclosed because changing cases to shape a baseline
   is a potential source of benchmark gaming.
6. **Same-task variants shared one prompt.** Student rendering, evidence
   interpretation, and task selection now execute one fixture per model call.
   A model never sees the correct, hinted, partial, and misconception versions
   of the same task together.
7. **Output array length did not establish identity.** Exact ID-set validation
   now rejects duplicates, omissions, and extras before admission.
8. **Evidence admission checked provenance but not internal legality.** The
   deterministic domain boundary now enforces exact target coverage and legal
   outcome/assistance/signal/error/obligation combinations.
9. **False-independent rate could be gamed by never predicting success.** The
   frozen metrics also require recall of at least two of the three independent-
   success claims.
10. **Selection metrics mixed linked and hand-authored state.** The three
    evidence-linked scenarios are now scored separately from three policy-only
    scenarios. Formal success requires at least two linked cases.
11. **Oracle positions were imbalanced.** The six formal oracle actions are
    placed twice in each candidate position.
12. **Failure categories and formal reruns were underspecified.** Structured-
    output failure and infrastructure failure are recorded separately. Formal
    trial IDs are 1–3; an existing persisted result blocks reuse of that ID, and
    aggregation rejects duplicate IDs.
13. **A shell flag was not a freeze.** The formal entry point now verifies the
    fixture/prompt/threshold contract hash, material hashes, model profile,
    trial ID, call count, and hashes of the executed source/dependency files.
14. **The selector output unnecessarily echoed reason codes.** Stateless input
    intentionally contains no semantic reason annotations, so its otherwise
    correct outputs invented prose labels that failed the enum. Selection
    output now contains only scenario ID, candidate ID, and a short basis;
    supplied reasons remain inspectable input rather than a transport hurdle.

## What the pilot did not validate

- human learning, retention, transfer, motivation, or study outcomes;
- whether the frozen task-selection policy is educationally optimal;
- long-term learner projection;
- abstention precision/recall (the unresolved case remains pilot-only); or
- cross-domain validity.

The formal v1 name is therefore **controlled semantic-contract and one-step
policy-execution benchmark**. If its first-domain result passes, the next
falsifier is a structurally different domain, not a production-effect claim.
