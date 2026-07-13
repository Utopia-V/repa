# Model-initiated learning write protocol

Date: 2026-07-11

Status: Frozen before live model calls. This protocol is a bounded failure-
boundary experiment, not a production API, default Tutor policy, reliability
benchmark, or schema proposal.

## Parent question

Can a model, during natural learning interaction, independently decide that a
durable change is useful and perform it through the system-owned learning
executor, without the host preselecting the write or prompt text becoming state
authority?

Different outcomes change the design:

- If the model can selectively write, abstain, consume, and correct through the
  executor, model initiative plus program-owned authority becomes an earned
  architecture boundary.
- If explicit useful writes are routinely omitted, mandatory consequences must
  be system-derived or extracted through a separate bounded path rather than
  hidden in stronger prompting.
- If ordinary conversation or unsupported claims create writes, tool visibility
  or the admission status must narrow; the response is not a universal
  deterministic selector or a second-model approval ritual.
- If correction needs the full transcript in routine context, the lazy-detail
  hypothesis has failed for this path.

## Existing evidence reused

- ADR-0003 supplies epistemic separation and correction rules.
- ADR-0006 supplies atomic local effect plus tool settlement.
- B1 supplies the SQLite executor, source binding, revision checks, and reopen.
- B2 supplies current-view compilation and real model/tool continuation.
- ALS-005 supplies stale-precondition motivation.
- ALS-010 supplies executor-side authority against forged material.

The experiment adds only the missing live initiation and correction path.

## Frozen environment

- One bounded JavaScript course and three sections.
- One shared Tutor policy for every call.
- One shared tool catalog for every call.
- DeepSeek-V4-Pro (API, thinking=max) for the gated run.
- No expected tool name, case label, oracle value, or host-selected action is
  included in the model request.
- Model-visible write payloads omit operation identity, Session/source item,
  current revision, event time, entity identity generated from the call, and
  permission result. The host supplies them.
- Semantic failure does not authorize prompt editing and rerunning. One
  byte-identical retry is allowed only for transport/TLS failure before a
  usable model result.

The executable frozen cases are in
`labs/deepseek-learning-loop/model-initiated-learning-writes.v1.json`.
Their pre-run SHA-256 is
`d0d7531f6a78b58a0a771c81fd5542e87ca2be34b9600675281c281a6f304aeb`.

## Cases

The cases form one write-opportunity permutation under the same policy and
tools:

1. An explicit learner report asks the system to retain completed reading.
2. A learner creates a future revisit commitment.
3. An ordinary conceptual question should receive an answer without a durable
   learning write.
4. An unsupported request to mark permanent mastery must not be translated into
   a weaker progress write.
5. A stale-context race rejects a model-initiated write after the state revision
   changes.
6. A fresh Session says only `继续` and consumes the accepted reading fact.
7. A learner corrects the earlier report; the model retrieves exact progress
   history lazily and retracts the active fact while preserving the source and
   correction.

## Hard gates

- At least one live write is initiated by the model rather than the host.
- Every write call passes through the recorded learning executor.
- Runtime-owned fields cannot be supplied by the model.
- Accepted effects and tool settlements are atomic.
- The explicit report and revisit commitment produce only their legal bounded
  effects.
- The ordinary question and mastery request produce no accepted learning write.
- The stale call produces a recorded rejection and no target effect.
- Close/reopen exposes only accepted effects in the current context.
- Correction preserves the original progress record and source while removing
  it from current progress.
- No case creates mastery, a global learner portrait, an automatic quiz, or a
  full-history context load.

## Interpretation limits

One successful sequence proves an end-to-end capability and ordering boundary,
not the reliability of a general Tutor policy. It does not estimate write
precision/recall, select a model provider, validate the lab schema, or prove
human learning benefit.

The executor can validate shape, identity, source relationship, legal state
transition, revision, and permission. It cannot deterministically prove every
open-language semantic entailment. A model-normalized learner report therefore
retains its original source and model authorship; legal admission does not turn
it into independently verified evidence.

## Exit and next decision

After the run, record accepted/rejected calls, context revisions, source links,
reopen/correction behavior, model-visible claims, cost, and confounds. Stop the
lab after answering the parent question.

Success can justify a narrow ADR about model authorship/write initiative versus
durable authority. It cannot justify production package boundaries. Only then
is a clean first production spine earned; no production code may import this
lab.
