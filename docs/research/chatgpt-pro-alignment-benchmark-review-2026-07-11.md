# ChatGPT GPT-5.6 Pro review of the alignment-annotation benchmark

Date: 2026-07-11

Reviewer: **ChatGPT GPT-5.6 Pro (subscription, Extended Pro via the private Pro
bridge)**

Observed bridge latency: 19.4 seconds.

Status: Independent experiment-design criticism. This document is not an
architecture decision and does not admit model annotations into learning state.

## Question reviewed

The proposed lab asked whether DeepSeek-V4-Flash could infer candidate
task-to-target alignments from a small curriculum vocabulary and short task or
rubric records. Proposed labels were `teaches`, `assesses`, and `requires`; the
model would emit one typed batch, preserve source references, and expose no
durable write.

The review was explicitly asked to find tautologies, subjective oracles, and
ways the benchmark could manufacture a flattering result.

## Main criticism

The original eight-to-twelve-record design was too easy. Clean synthetic skill
definitions, obvious wording, and one author assigning every ground-truth edge
could show little more than text classification. It also risked collapsing
three different capabilities:

- recognizing that a concept appears;
- deciding that an activity teaches it; and
- deciding that a rubric actually assesses it.

High precision could also be faked by emitting almost no alignments, while a
single combined score could confuse schema failures with semantic errors.

## Recommended falsifier

The reviewer recommended a small adversarial suite rather than a larger easy
suite:

- eight deliberately confusable skills;
- forty records split among obvious positives, semantic positives without
  direct vocabulary overlap, keyword traps, and genuinely under-specified
  cases;
- a documented lexical baseline;
- explicit abstention on ambiguity;
- separate transport, relation, edge, exact-record, trap, hidden-positive, and
  calibration measurements; and
- DeepSeek-V4-Pro review only after DeepSeek-V4-Flash has shown an actual
  failure or uncertainty boundary.

The central falsifier is whether DeepSeek-V4-Flash adds meaningful signal over
a lexical heuristic on hidden-positive and keyword-trap cases while retaining
precision. Merely producing plausible annotations is not enough.

## Safe admission boundary proposed by the reviewer

A model-produced alignment is a hypothesis about an artifact. It may be stored
as an untrusted, source-linked candidate for review or later correction. It is
not learner evidence and cannot directly update ability, curricular structure,
or route priority.

Required provenance for a candidate includes the input artifact reference,
model/profile, annotation contract, and time or run identity. Whether every
candidate needs human review remains an empirical product question; this lab
does not claim to measure labor savings.

## Adopted changes

ALS-013 will use the forty-record adversarial shape, a lexical baseline, an
ambiguity outcome, and separated metrics. It will not yet test human review
time because no appropriate reviewer sample exists. The synthetic suite can
falsify a weak model claim, but passing it will not establish real-course
annotation quality.
