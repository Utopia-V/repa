# Learning control, authorship, and durable authority

Date: 2026-07-11

Status: Research synthesis and candidate contract boundary. This note does not
fix the program/model control ratio, choose production types, or authorize a
general command bus, event store, learner ontology, or workflow engine.

## Question

How can the whole Learning System remain the Tutor while a model can genuinely
choose actions, author semantic content, and write durable learning state?

## Conclusion

Repa is best understood as a constrained mixed-initiative, multi-timescale
feedback system. The learner, model, deterministic rules, tools, and external
events may each initiate useful change. The program does not monopolize
semantic authorship or action choice. It preserves continuity and mediates the
legal, epistemic, and durable consequences of those actions.

The important separation is not simply `program authority` versus `model
proposal`. At least six questions are independent:

| Dimension | Possible owner or source | Durable requirement |
|---|---|---|
| Goal ownership | learner | A model or completed activity cannot silently declare the learner's goal complete. |
| Semantic authorship | learner, model, source, or tool | Preserve who authored content that later changes behavior. |
| Write initiative | learner, model, program rule, or external event | A legal model-issued command may directly commit real state; it need not remain a draft. |
| Transition legality | learning-domain executor | Validate the command, current state, source relationship, and permission. |
| Epistemic basis | report, observation, source, inference, or constitutive decision | A successful commit does not upgrade a report or inference into stronger evidence. |
| Persistence and recovery | runtime and SQLite | Bind trusted identity, time, revision, settlement, idempotency, and correction. |

External effects add a seventh concern: user or policy authorization plus
connector-specific reconciliation.

In plain language: the model can really teach, choose, remember, and schedule.
The program keeps the books: who said what, why the record exists, whether the
change is currently legal, how it commits, and how it can be corrected.

## Two kinds of real write

A constitutive write makes a system commitment true by being accepted. For
example, an authorized command can really schedule a revisit for Tuesday.

A descriptive write records a claim about the learner or world. Committing
`the learner reports reading this range` makes that report part of system
history; it does not prove retention. Committing a model-authored gap
hypothesis makes the hypothesis real and inspectable; it does not prove the gap.

This is why `the model can write` and `the model's statement becomes truth` are
not equivalent.

## Applicable classical ideas

### Mixed initiative

Mixed-initiative interaction treats user and automated service as capable of
acting at different times. Horvitz's principles emphasize uncertainty about
user goals, cheap correction and termination, and doing less when uncertainty
is high. Repa should preserve those consequences, not import a Bayesian UI
agent or require an explicit confidence score for every action.

Source: Eric Horvitz, [Principles of Mixed-Initiative User
Interfaces](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz-1.pdf).

### Policy and mechanism

Hydra shows that policy/mechanism is a relative boundary, not a claim that a
kernel contains no policy. The available mechanism determines which higher
policies are possible, while lower-level policy may remain necessary to enforce
fairness and protection. Repa therefore must not equate `program` with
mechanism and `model` with policy. Both can contribute policy; model actions
still pass through program-owned mechanisms.

Source: Levin et al., [Policy/mechanism separation in
Hydra](https://swift.sites.cs.wisc.edu/classes/cs736-fa06/papers/hydra-policy-mechanism.pdf).

### Complete mediation, without approval ceremony

Every state-changing model call should pass through the current execution
boundary. This is the useful consequence of complete mediation. It does not
mean treating the learner as an attacker or asking for confirmation before
every reversible local update.

Source: Saltzer and Schroeder, [The Protection of Information in Computer
Systems](https://web.cs.wpi.edu/~cs557/f14/papers/saltzer1975_alt.html).

### Multiple learning components and projections

Brusilovsky's intelligent learning environment work found that a diagnostic
component could not retain a monopoly over student-model updates: tutoring,
environment, and manual components could all supply information, while each
consumer needed its own projection. Repa preserves the multi-source and
consumer-specific-view lessons. It rejects the assumption that every
interaction must become a standardized event or a complete central student
model.

Source: Peter Brusilovsky, [Student model centered architecture for intelligent
learning environments](https://sites.pitt.edu/~peterb/papers/UM94.html).

## Reference implementation evidence

OpenCode `v1.17.18` at
`b1fc8113948b518835c2a39ece49553cffe9b30c` lets a model invoke real file writes,
while the host decodes input, resolves the canonical path, checks directory and
permission boundaries, performs the effect, and correlates the result. Relevant
sources are:

- `.reference/opencode/packages/opencode/src/tool/write.ts`;
- `.reference/opencode/packages/opencode/src/tool/tool.ts`;
- `.reference/opencode/packages/opencode/src/session/tools.ts`; and
- `.reference/opencode/packages/opencode/src/session/processor.ts`.

Codex `rust-v0.144.1` at
`44918ea10c0f99151c6710411b4322c2f5c96bea` similarly turns a model response item
into a host-managed tool call, then parses, authorizes, sandboxes, executes, and
records the result. Relevant sources are:

- `.reference/codex/codex-rs/core/src/stream_events_utils.rs`;
- `.reference/codex/codex-rs/core/src/tools/router.rs`;
- `.reference/codex/codex-rs/core/src/tools/handlers/apply_patch.rs`;
- `.reference/codex/codex-rs/core/src/tools/orchestrator.rs`; and
- `.reference/codex/codex-rs/core/src/session/turn.rs`.

Both references demonstrate model initiative plus host mediation. Neither
provides a transaction or recovery proof for Repa's learning-domain effects.

Codex also supplies a useful context boundary: each model sample captures one
step context, and the prompt, tool catalog, and execution context derive from
that cut. Repa should preserve the smaller invariant:

```text
ContextCut = compile(SessionCut, LearningRevision, PolicyRevision, RuntimeFacts)
```

One model request uses one immutable cut. Accepted writes appear in the next
sample after context is rebuilt. Persist the cut's revisions and provenance,
not necessarily every prompt byte or Codex's complete `WorldState` machinery.

## Current evidence gap

B1 proves that the host can bind source, revision, time, and operation identity
to a learning command and atomically settle it. B2 proves that compiled learning
state can affect a live model. B2's durable writes, however, are host-triggered;
its prompts say the host records completed actions.

The missing link is therefore:

```text
natural interaction
-> model independently initiates a useful learning write
-> host binds trusted execution context
-> domain accepts or rejects it
-> accepted state changes the next compiled context
-> learner can correct it without erasing history
```

The frozen experiment for that boundary is
[`model-initiated-learning-write-protocol.md`](./model-initiated-learning-write-protocol.md).

## Candidate durable contract

The following may be promoted only after the closed-loop experiment:

- Models may be semantic authors and authorized initiators of real durable
  learning commands.
- Runtime-owned command means the runtime owns admission and settlement, not
  that it must decide to initiate every write.
- The model-visible payload cannot own trusted source identity, Session/Turn
  identity, context revision, event time, or permission result.
- Successful admission establishes the legal meaning of the record, not
  unsupported truth about the learner or source world.
- Low-risk, local, reversible writes may commit without an approval dialog and
  remain visible and correctable.
- Mandatory deterministic consequences cannot depend on the model remembering
  to call a tool.
- A valuable learning interaction may create no structured learning write.

The exact tool catalog, schemas, program/model control share, durable
model-inference classes, confidence representation, context storage layout, and
post-turn extraction policy remain working hypotheses.
