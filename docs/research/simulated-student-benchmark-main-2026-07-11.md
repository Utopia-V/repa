# Controlled semantic-contract benchmark: formal v1 result

Date: 2026-07-11

Status: completed; three frozen formal trials; no reruns.

## Decision and claim boundary

The benchmark tested whether condition-bearing evidence interpretation and a
compact inferred learner projection earned their complexity in one controlled
JavaScript slice. It did not test real learners, retention, transfer, long-term
planning, or educational effectiveness.

Frozen contract SHA-256:
`cb4612d55a543853ee500c12857e0ebc254e63d459f6e0de207a6a62e3dde12e`.

Model for learner rendering, evidence interpretation, and selection:
**DeepSeek-V4-Flash (API, non-thinking)**, temperature 0.

Materials: The Modern JavaScript Tutorial at Git commit
`52c1e61915bc8970a950a3f59bd845827e49b4bf`, with task, solution, and combined
byte hashes verified before every formal trial.

## Aggregate result

| Layer | Result | Frozen gate |
|---|---:|---:|
| Hard integrity gates | 3/3 trials passed | 3/3 |
| Declared evidence exact | 18/24 | at least 6/8 in 2/3 trials |
| Answer-only evidence exact | 11/24 | comparison baseline |
| Declared outcome | 21/24 | at least 7/8 in 2/3 trials |
| Declared assistance preservation | 24/24 | 8/8 in every trial |
| Declared claim-set | 18/24 | at least 6/8 in 2/3 trials |
| Declared false-independent claims | 3 total, one per trial | zero |
| Declared independent-success recall | 9/9 claims | at least 2/3 per passing trial |
| Fixed queue selection | 6/18 | frozen 2/6 per trial |
| Stateless model selection | 18/18 | comparison baseline |
| Oracle-state model selection | 18/18 | at least 5/6 per passing trial |
| Inferred-state model selection | 18/18 | at least 4/6 and lead stateless |

Estimated model-call cost across formal trials: **$0.00776106**. The 126
logical model calls used 122,470 tokens and 207.135 seconds of summed model-call
latency. These are lab estimates, not provider billing or wall-clock user time.

The aggregate verdict was `evidence_boundary_requires_one_follow_up`. Evidence
and selection soft gates both failed in every trial.

## What passed

- No hidden learner state entered evidence, stateless, or inferred requests.
- All source revisions and execution files matched the frozen hashes.
- Every response and selection ran in an isolated model call.
- No schema, exact-ID, transport, or unknown-action failure occurred.
- Three internally inconsistent evidence candidates were rejected; **zero**
  invalid candidate crossed deterministic admission.
- Authoritative assistance was preserved in every declared candidate.
- Condition-bearing interpretation was consistently more exact than answer-only
  interpretation: 18/24 versus 11/24.
- Oracle and inferred selectors executed the frozen one-step policy without a
  forbidden action.

## Why evidence failed

The same candidate failed in all three trials:

```text
overall outcome: partial
target signal: independent_success
obligation: diagnostic
```

The response gave the right surface answer but no valid mechanism. The model's
basis correctly described this, yet its signal contradicted its own outcome.
The deterministic boundary rejected the candidate. This is evidence against
letting the LLM independently author redundant outcome, signal, and obligation
fields.

A second stable disagreement was oracle ambiguity rather than an illegal
state: when the surface result was correct but the explanation was factually
wrong, the frozen oracle called the record `partial` while the model called it
`incorrect`. A scalar outcome alone did not represent the grading disagreement
cleanly.

## Why selection failed

Stateless, oracle-state, and inferred-state models all selected 18/18 oracle
actions. The latest-interaction prose explicitly said such things as “answered
after a hint,” “two repeated failures,” “review became due,” and “correction
retracted the prior interpretation.” DeepSeek-V4-Flash could reconstruct the
needed local state from that short text.

Therefore the benchmark provides **no evidence of marginal value from the
inferred-state input**. It also does not show that durable learning state is
unnecessary. A discriminating future test must make the correct action depend
on accumulated history that is absent from the current prompt and cannot be
reconstructed statelessly.

## Architecture consequence before the one follow-up

The result preserves these boundaries:

- source-linked task result, observed conditions, interpretation, correction,
  and scheduling consequence have different authority;
- model output remains an untrusted candidate;
- deterministic domain code owns admission and legal transitions; and
- one-step task-selection theory remains unproven.

It does not authorize a production evidence ontology, generalized learner
projection, or complex selector.

Raw formal traces and the aggregate bundle remain local and Git-ignored under
`labs/deepseek-learning-loop/.runs/`.
