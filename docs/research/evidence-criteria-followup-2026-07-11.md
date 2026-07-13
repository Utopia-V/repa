# Evidence criteria follow-up result

Date: 2026-07-11

Status: completed; failed; no further repair experiment permitted.

Contract SHA-256:
`99142b13f363a7aebafa3ff006d333cb342896296c7399c6f038efa858fef71c`.

Independent pre-run review:
[`chatgpt-pro-evidence-followup-review-2026-07-11.md`](chatgpt-pro-evidence-followup-review-2026-07-11.md).

Pre-registered protocol:
[`evidence-criteria-followup-protocol.md`](evidence-criteria-followup-protocol.md).

## Result

The same 24 persisted formal learner responses were evaluated under two frozen
prompt orders. No new learner response or selection call was made.

| Measure | `criteria_first` | `rubric_first` | Required |
|---|---:|---:|---:|
| Valid atomic records | 24/24 | 0/24 | 24/24 each |
| Derived evidence exact | 9/24 | 0/24 | at least 23/24 each |
| Known-confound exact | 3/6 | 0/6 | 6/6 each |
| Other-record exact | 6/18 | 0/18 | at least 17/18 each |
| False-independent claims | 0 | 0 from no records | 0 |
| Pairwise derived agreement | 0/24 across variants | 0/24 across variants | at least 23/24 |

Verdict: `evidence_representation_remains_unresolved`.

The 48 attempted calls used 15,811 tokens, 58.350 seconds of summed call
latency, and an estimated upper-bound cost of **$0.00195648**.

## Transport failure

Every `rubric_first` request was rejected before a model response because the
DeepSeek JSON-object endpoint requires the prompt to contain the word `json`;
that prompt order omitted the literal word. The failure category remained
separate from semantic output.

No rerun was performed. The independently completed `criteria_first` arm
already failed the semantic thresholds by a wide margin, so repairing transport
could not make the pre-registered two-arm verdict pass. The protocol also
forbids a second rescue experiment.

## Semantic failure

Deterministic derivation did eliminate the structurally illegal combination:
zero derived record falsely claimed independent success. That validates the
narrow engineering principle that downstream signal and obligation should not
be separately authored when they are deterministic consequences of admitted
facts.

The proposed generic `claim`/`justification` judgment did not resolve semantic
grading:

- it consistently fixed the vague second-bind explanation as `partial`;
- it consistently kept the wrong-explanation object case as `incorrect`, not
  the frozen `partial` oracle;
- it often selected the generic `mechanism-unexplained` tag instead of the
  task-specific misconception; and
- it mishandled several hinted or otherwise correct responses.

The result therefore does not justify promoting `claim` and `justification` as
production rubric dimensions.

## Final architecture consequence

The simplest surviving design is:

1. persist the formal task context, source-linked response, observed assistance,
   and grading provenance;
2. treat any LLM semantic interpretation as fallible, correctable, and subject
   to deterministic admission;
3. derive only truly mechanical consequences in code, so illegal combinations
   cannot be persisted;
4. do not freeze a universal evidence-candidate schema, learner projection, or
   task-ranking algorithm from this slice; and
5. do not claim inferred-state selector value until a future test hides
   accumulated history from the stateless baseline.

This keeps learning first-class at the authority and transaction boundaries
without pretending the unresolved semantic representation is solved.

Raw output remains local and Git-ignored at
`labs/deepseek-learning-loop/.runs/2026-07-11T08-02-09.018Z-simulated-student-evidence-followup-v1-deepseek-v4-flash.json`.
