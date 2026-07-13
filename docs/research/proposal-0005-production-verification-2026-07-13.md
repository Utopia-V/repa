# Proposal 0005 production verification

Date: 2026-07-13

Status: The bounded `tutor-default-v3` contract is implemented and qualified
for its first production use. This record does not admit a general pedagogy or
constraint framework.

## What changed

Repa can now preserve one explicit learner-role boundary on an Agenda concern:
the learner responds before the Tutor reveals the answer or a decisive hint.
When exactly one open, due, current-view concern carries that boundary, the
learning system projects its exact source identity, version, target, reason,
priority, constraint, and Turn scope into the immutable model-operation
context. A specific current learner request still has higher priority.

In plain language: if the learner previously asked to try a prediction before
being told the answer, that intention survives a new Session. The program
decides whether the remembered intention is legally applicable; the model
still decides how to ask naturally and may follow a more specific request made
now.

## Owned boundaries

- Agenda schema version 5 stores one nullable checked constraint. Existing rows
  remain null; no reason text is reinterpreted.
- Agenda create and supersede canonical values include the constraint, so an
  exact retry is idempotent and a changed retry conflicts.
- The candidate query obtains the full legal count in the same SQLite snapshot.
  Zero or more than one legal candidate produces no default.
- `tutor-default-v2` retains its original provider-visible tool schema and
  behavior. Only `tutor-default-v3` exposes the new create/supersede fields and
  composes the conditional purpose.
- The projection does not address the concern, create evidence, infer mastery,
  or create a durable activity. Those meanings remain separately owned.

## Deterministic evidence

Focused tests cover:

- schema 4 to 5 migration, no backfill, rollback, and reopen;
- constrained create and supersede through both domain and model-facing tools;
- exact retry versus changed-constraint conflict;
- one legal candidate, two-candidate ambiguity, legacy null constraint,
  upcoming state, and current Course View binding;
- fresh-Session context recovery without old transcript replay;
- immutable context cuts across a source-read continuation;
- natural prompt rendering, direct-answer override, and an open concern after
  override;
- v2/v3 provider-visible tool-schema separation; and
- all 29 recorded ALS-021 v2 provider requests remaining equivalent.

The closed ALS-021 manifest was not rewritten. Its formal path now proves that
evolved production source cannot be presented as the old frozen campaign.
The replay keeps byte-exact gates on `bun.lock` and the DeepSeek adapter and
compares every provider-visible request; `package.json` remains recorded
provenance but test-runner script changes are no longer misclassified as
provider transport changes.

## Live provider qualification

A bounded `deepseek-v4-flash` run used the production database, context
compiler, prompt renderer, tools, and Tutor loop. The current Session contained
only the learner input `继续。`; the qualifying concern came from durable state
created in an earlier Session.

Observed result:

- one model step;
- 3,611 input tokens and 108 output tokens;
- the Tutor presented an aliasing/mutation code example and asked what
  `console.log(obj1.value)` would output;
- it explicitly waited for the learner's view before analysis;
- it did not disclose the answer; and
- it did not mention Agenda, policy priority, concern identity, or internal
  control reasoning.

This is a smoke qualification, not a statistical claim. Repeated material
control narration, partial-response recovery, or a real TUI consumer remains
the trigger for reconsidering response-item phase metadata. No such machinery
was added here.

## Maintenance consequence

Future policy revisions must version the complete provider-visible contract,
including tool schemas, not only prompt text. Future formal provider campaigns
should run from a clean Git tree and record a commit/tree identity; the ALS-021
manifest contains source hashes but is not itself a restorable source bundle.
