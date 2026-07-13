# Documentation map

Documents have different authority. Do not treat a research observation as an accepted product decision.

## Normative order

1. [`foundation/00-product-origin.md`](foundation/00-product-origin.md) — product purpose, boundaries, and settled technical direction.
2. [`foundation/02-what-the-tutor-does.md`](foundation/02-what-the-tutor-does.md) — the full range of Tutor behavior that future designs must preserve.
3. [`../AGENTS.md`](../AGENTS.md) — operational constraints for human and AI changes.
4. [`decisions/`](decisions/) — accepted architecture decisions and their consequences.
5. [`architecture/00-system-architecture.md`](architecture/00-system-architecture.md) — accepted whole-system ownership, dependency, state, context, and recovery model.
6. [`foundation/01-engineering-method.md`](foundation/01-engineering-method.md) — how mechanisms are studied and implemented.

## Current phase

- [`current-understanding.md`](current-understanding.md) separates settled
  intent, accepted engineering decisions, abandoned defaults, working
  hypotheses, and open questions.
- [`foundation/03-complete-learning-traces.md`](foundation/03-complete-learning-traces.md)
  is the review draft of the complete behavior baseline. It does not define a
  workflow or schema.
- [`proposals/0003-learning-native-responsibilities.md`](proposals/0003-learning-native-responsibilities.md)
  is the earlier responsibility hypothesis promoted and refined by ADR-0012;
  it no longer chooses the current architecture.
- [`proposals/0004-learning-native-capability-contract.md`](proposals/0004-learning-native-capability-contract.md)
  is the review draft of the capabilities that a learning Agent must expose as
  normal product behavior.
- [`roadmap/03-learning-native-behavior-baseline.md`](roadmap/03-learning-native-behavior-baseline.md)
  is the superseded roadmap that produced B1/B2. Its Phase C comparison is a
  shelved historical protocol, not the current next step.
- [`research/learning-control-and-write-authority.md`](research/learning-control-and-write-authority.md)
  derives the current program/model ownership boundary.
- [`research/model-initiated-learning-writes-2026-07-11.md`](research/model-initiated-learning-writes-2026-07-11.md)
  records ALS-017's live model-write result and its continuation failure.
- [`research/semantic-effect-and-scoped-steering-2026-07-11.md`](research/semantic-effect-and-scoped-steering-2026-07-11.md)
  records ALS-018's executable semantic boundary; its generic runtime
  ownership was later reopened by the substrate audit.
- [`roadmap/04-first-production-state-and-context-spine.md`](roadmap/04-first-production-state-and-context-spine.md)
  is the completed ALS-018 implementation record. The subsequent phase review
  provisionally reclassifies its source as a candidate semantic kernel and
  substrate discriminator, not a settled application spine.
- [`research/broad-route-and-runtime-substrate-review-2026-07-12.md`](research/broad-route-and-runtime-substrate-review-2026-07-12.md)
  records the current route-representation hypothesis, audits OpenCode/Codex
  reuse boundaries, and records the evidence that preceded ADR-0011.
- [`decisions/0011-single-process-tutor-loop-over-mature-mechanics.md`](decisions/0011-single-process-tutor-loop-over-mature-mechanics.md)
  fixes the runtime direction: Repa-owned single-process composition over
  mature provider, streaming, tool, cancellation, and later rendering
  mechanics.
- [`roadmap/05-first-dogfood-tutor-loop.md`](roadmap/05-first-dogfood-tutor-loop.md)
  records the completed first real-provider Tutor loop and cross-process
  consumption of durable learning state, including a distinct fresh-Session
  verification.
- [`decisions/0012-learning-centered-modular-monolith.md`](decisions/0012-learning-centered-modular-monolith.md)
  accepts the overall architecture: one learning-centered modular monolith,
  bounded current context, separate learning authorities, and an outer Agent
  runtime.
- [`decisions/0013-conditional-current-purpose-composition.md`](decisions/0013-conditional-current-purpose-composition.md)
  accepts the post-ALS-021 control topology: program-filtered one-candidate
  conditional purpose inside ordinary Tutor realization, exact-current-request
  priority, no universal selector, and no durable activity state.
- [`architecture/00-system-architecture.md`](architecture/00-system-architecture.md)
  is the normative detailed architecture and current-code transition audit.
- [`roadmap/architecture-led-build-sequence.md`](roadmap/architecture-led-build-sequence.md)
  is the active two-axis build map: learner-visible product pressure paths over
  the accepted engineering gates. It withdraws the earlier automatic
  activity/Agenda/evidence phase chain.
- [`roadmap/06-real-course-material-continuity.md`](roadmap/06-real-course-material-continuity.md)
  is the completed first ADR-0012 product milestone: revision-bound local
  Markdown and Agent-created provisional routes now continue from durable,
  correctable state in a new Session.
- [`research/phase-1-course-continuity-verification-2026-07-12.md`](research/phase-1-course-continuity-verification-2026-07-12.md)
  records its deterministic, failure, migration, cross-process ownership,
  correction, and real-provider evidence, including the first provider trace
  that failed to advance.
- [`research/teaching-and-review-first-principles-2026-07-12.md`](research/teaching-and-review-first-principles-2026-07-12.md)
  separates source findings from product inference, explains why teaching and
  scientific review are purpose-sensitive, and records the correction from an
  entity-led roadmap to the current product pressure path.
- [`research/teach-adapt-return-architecture-proof-2026-07-12.md`](research/teach-adapt-return-architecture-proof-2026-07-12.md)
  freezes the five contrasting traces, records ALS-020's deterministic
  purpose/alignment collisions, and promotes only the source-linked Agenda
  future-attention boundary while deferring its production shape.
- [`roadmap/07-first-agenda-future-attention.md`](roadmap/07-first-agenda-future-attention.md)
  records the implemented first production shape: bounded cross-Session
  context, lazy source detail, explicit disposition and correction, atomic
  settlement, runtime ordering, and verified zero-write boundaries. It does
  not complete the wider shared-policy teaching trace.
- [`research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md`](research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md)
  is ALS-021's frozen controlled protocol for testing one shared production
  Tutor policy over fourteen contrasting conditions and eight formal blocks.
  Protocol v1 and its source manifest are frozen; the production policy
  identity under test is `tutor-default-v2`.
- [`research/shared-tutor-policy-pilot-audit-2026-07-12.md`](research/shared-tutor-policy-pilot-audit-2026-07-12.md)
  retains both excluded pilots. Each completed 14/14 conditions; the repaired
  second pilot had one timeout retry and a diagnostic 12/14 mechanical
  interpretation. Neither campaign is formal evidence.
- [`research/shared-tutor-policy-formal-review-maintenance-2026-07-12.md`](research/shared-tutor-policy-formal-review-maintenance-2026-07-12.md)
  records the pre-review seal, blind-review lock, exact disagreement and
  adjudication contract, executable gates, recovery behavior, and artifact
  provenance. Its post-run update explains why aggregation stopped after the
  real reviewers failed applicability calibration.
- [`research/shared-tutor-policy-formal-result-2026-07-13.md`](research/shared-tutor-policy-formal-result-2026-07-13.md)
  closes ALS-021: 112/112 samples completed, v1 acceptance cannot pass, and the
  reliable architecture finding is that durable Agenda purpose survived but
  did not reliably govern the selected teaching move.
- [`research/selected-current-learning-purpose-control-seam-2026-07-13.md`](research/selected-current-learning-purpose-control-seam-2026-07-13.md)
  traces that failure to the missing adoption/binding step, compares classical
  control and the pinned OpenCode/Codex seams, rejects durable activity and a
  second runtime, and admits one oracle-selected realization proof.
- [`research/selected-current-purpose-oracle-result-2026-07-13.md`](research/selected-current-purpose-oracle-result-2026-07-13.md)
  records ALS-022A's focused result: explicit selected-purpose binding changed
  the independent-prediction behavior from 0/8 to 7/8 purpose-valid responses
  with no answer leakage in 8/8, while exposing a separate control-step prose
  visibility boundary.
- [`research/selected-current-purpose-selector-result-2026-07-13.md`](research/selected-current-purpose-selector-result-2026-07-13.md)
  rejects ALS-022B's `Agenda candidate | none` selector after 12/22 strict
  passes and records the false-provenance failure where a valid concern ID was
  given an incompatible current-request meaning.
- [`research/governing-source-selector-result-2026-07-13.md`](research/governing-source-selector-result-2026-07-13.md)
  rejects ALS-022C's corrected exact-source selector after 10/18; it ignored
  Agenda in every generic continuation, ending the universal selector-prompt
  line for the production-default model.
- [`research/conditional-current-purpose-result-2026-07-13.md`](research/conditional-current-purpose-result-2026-07-13.md)
  records ALS-022D's 10/10 alternative: program-bound one-candidate conditional
  default inside the ordinary Tutor sample, with exact-current-request
  override and truthful Agenda state, without another model controller.
- [`research/exact-reason-conditional-default-result-2026-07-13.md`](research/exact-reason-conditional-default-result-2026-07-13.md)
  records ALS-022E's strict 3/8 ablation: exact reason plus default status is
  insufficient, earning one narrow learner-response-before-disclosure
  constraint while rejecting a general pedagogy vocabulary.
- [`research/architecture-gate-and-response-admission-audit-2026-07-13.md`](research/architecture-gate-and-response-admission-audit-2026-07-13.md)
  records the pre-0005 architecture audit: the modular monolith passes, and a
  pinned Codex/AI SDK comparison shows why the known flattened-output defect
  does not block the learning-owned Proposal 0005 slice and records the trigger
  for any later response-item/phase work.
- [`research/chatgpt-pro-next-pressure-path-review-2026-07-13.md`](research/chatgpt-pro-next-pressure-path-review-2026-07-13.md)
  records a historical post-0005 comparison whose packet inherited B2's
  emergency bias; its Assignment-path recommendation is superseded.
- [`proposals/0006-deadline-sensitive-real-work-contract.md`](proposals/0006-deadline-sensitive-real-work-contract.md)
  is a withdrawn historical contract whose emergency fixture was promoted
  beyond its evidence; it is not an active Assignment design.
- [`roadmap/08-first-deadline-sensitive-assignment.md`](roadmap/08-first-deadline-sensitive-assignment.md)
  records the deleted deterministic v4 candidate and its withdrawn roadmap
  status; only an inert schema-6 compatibility tombstone remains.
- [`research/proposal-0006-production-verification-2026-07-13.md`](research/proposal-0006-production-verification-2026-07-13.md)
  records the code/review evidence and live failures. Its former
  program-owned-consideration next question is withdrawn.
- [`research/semantic-drift-audit-2026-07-13.md`](research/semantic-drift-audit-2026-07-13.md)
  is the governing correction: intended Assignment behavior is cross-day
  workload planning, and it also records four independent current-v3 defects.

## Proposals

[`proposals/`](proposals/) contains reviewable designs synthesized from
research. Proposals are not accepted decisions until promoted into ADRs.

- [`proposals/0001-foundation-runtime-contracts.md`](proposals/0001-foundation-runtime-contracts.md)
- [`proposals/0002-learning-task-significance-and-scheduling.md`](proposals/0002-learning-task-significance-and-scheduling.md) — historical working model; its formal-task-centered path is paused.
- [`proposals/0003-learning-native-responsibilities.md`](proposals/0003-learning-native-responsibilities.md) — historical working model promoted and refined by ADR-0012; not the current architecture authority.
- [`proposals/0004-learning-native-capability-contract.md`](proposals/0004-learning-native-capability-contract.md) — current product-capability review draft; not an architecture or experiment protocol.
- [`proposals/0005-conditional-purpose-and-learner-role-contract.md`](proposals/0005-conditional-purpose-and-learner-role-contract.md) — implemented `tutor-default-v3` contract for one source-bound learner-response-before-disclosure constraint and one-candidate conditional purpose; not a general pedagogy framework.
- [`proposals/0006-deadline-sensitive-real-work-contract.md`](proposals/0006-deadline-sensitive-real-work-contract.md) — withdrawn historical Assignment contract; its unaccepted v4 runtime has been deleted.
- [`research/proposal-0005-production-verification-2026-07-13.md`](research/proposal-0005-production-verification-2026-07-13.md) — implementation boundaries, deterministic evidence, historical-policy compatibility, and the bounded live provider qualification.
- [`research/proposal-0006-production-verification-2026-07-13.md`](research/proposal-0006-production-verification-2026-07-13.md) — historical deterministic Assignment evidence, independent-review fixes, failed DeepSeek qualification, and the later correction of its product interpretation.
- [`research/semantic-drift-audit-2026-07-13.md`](research/semantic-drift-audit-2026-07-13.md) — accepted correction of the Assignment pressure path plus the current-runtime semantic audit.

The runtime defaults in proposal 0001 were accepted on 2026-07-11 and are
recorded by [`decisions/0005-durable-turn-and-interaction-hierarchy.md`](decisions/0005-durable-turn-and-interaction-hierarchy.md),
[`decisions/0006-atomic-local-learning-transaction.md`](decisions/0006-atomic-local-learning-transaction.md),
and [`decisions/0007-process-local-coordination-and-finite-turns.md`](decisions/0007-process-local-coordination-and-finite-turns.md).
Model-write authority, semantic effect identity, and retained scoped steering
are recorded by [`decisions/0008-model-write-initiative-and-durable-authority.md`](decisions/0008-model-write-initiative-and-durable-authority.md),
[`decisions/0009-separate-invocation-and-semantic-effect-identity.md`](decisions/0009-separate-invocation-and-semantic-effect-identity.md),
and [`decisions/0010-scoped-learner-steering-is-policy-state.md`](decisions/0010-scoped-learner-steering-is-policy-state.md).
The runtime ownership decision is recorded by
[`decisions/0011-single-process-tutor-loop-over-mature-mechanics.md`](decisions/0011-single-process-tutor-loop-over-mature-mechanics.md).
The whole-system ownership and dependency decision is recorded by
[`decisions/0012-learning-centered-modular-monolith.md`](decisions/0012-learning-centered-modular-monolith.md).

## Informative material

- [`research/`](research/) records evidence from pinned references. It explains what exists upstream; it does not automatically prescribe Repa's design.
- [`roadmap/`](roadmap/) records sequencing and exit gates. It may change as research invalidates assumptions.
- [`roadmap/01-first-production-contract-slice.md`](roadmap/01-first-production-contract-slice.md) is archived after the benchmark result.
- [`roadmap/02-post-benchmark-contract-slice.md`](roadmap/02-post-benchmark-contract-slice.md) is archived because its deterministic task path overweights gradable practice.
- [`roadmap/03-learning-native-behavior-baseline.md`](roadmap/03-learning-native-behavior-baseline.md) is superseded; B1/B2 remain evidence.

## Research index

[`research/experiment-ledger.md`](research/experiment-ledger.md) is the
chronological index for experiments and their limits. The list below is an
archive of source studies, protocols, positive findings, negative results, and
superseded design hypotheses. Inclusion in the list does not make a document a
current proposal. Each document's status and scope note controls its use.

- [`research/agent-memory-patterns-for-learning.md`](research/agent-memory-patterns-for-learning.md)
- [`research/learning-control-and-write-authority.md`](research/learning-control-and-write-authority.md)
- [`research/chatgpt-pro-model-write-boundary-review-2026-07-11.md`](research/chatgpt-pro-model-write-boundary-review-2026-07-11.md)
- [`research/model-initiated-learning-write-protocol.md`](research/model-initiated-learning-write-protocol.md)
- [`research/model-initiated-learning-writes-2026-07-11.md`](research/model-initiated-learning-writes-2026-07-11.md)
- [`research/semantic-effect-and-scoped-steering-2026-07-11.md`](research/semantic-effect-and-scoped-steering-2026-07-11.md)
- [`research/broad-route-and-runtime-substrate-review-2026-07-12.md`](research/broad-route-and-runtime-substrate-review-2026-07-12.md)
- [`research/route-representation-pressure-2026-07-12.md`](research/route-representation-pressure-2026-07-12.md)
- [`research/chatgpt-pro-overall-architecture-review-2026-07-12.md`](research/chatgpt-pro-overall-architecture-review-2026-07-12.md)
- [`research/phase-1-course-continuity-verification-2026-07-12.md`](research/phase-1-course-continuity-verification-2026-07-12.md)
- [`research/teaching-and-review-first-principles-2026-07-12.md`](research/teaching-and-review-first-principles-2026-07-12.md)
- [`research/teach-adapt-return-architecture-proof-2026-07-12.md`](research/teach-adapt-return-architecture-proof-2026-07-12.md)
- [`research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md`](research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md)
- [`research/shared-tutor-policy-pilot-audit-2026-07-12.md`](research/shared-tutor-policy-pilot-audit-2026-07-12.md)
- [`research/shared-tutor-policy-formal-review-maintenance-2026-07-12.md`](research/shared-tutor-policy-formal-review-maintenance-2026-07-12.md)
- [`research/shared-tutor-policy-formal-result-2026-07-13.md`](research/shared-tutor-policy-formal-result-2026-07-13.md)
- [`research/learning-native-capability-b1-2026-07-11.md`](research/learning-native-capability-b1-2026-07-11.md)
- [`research/learning-native-b2-trace-1-2026-07-11.md`](research/learning-native-b2-trace-1-2026-07-11.md)
- [`research/learning-native-b2-trace-2-2026-07-11.md`](research/learning-native-b2-trace-2-2026-07-11.md)
- [`research/learning-native-b2-trace-3-2026-07-11.md`](research/learning-native-b2-trace-3-2026-07-11.md)
- [`research/learning-native-b2-trace-4-2026-07-11.md`](research/learning-native-b2-trace-4-2026-07-11.md)
- [`research/learning-native-b2-trace-5-2026-07-11.md`](research/learning-native-b2-trace-5-2026-07-11.md)
- [`research/learning-native-b2-trace-6-2026-07-11.md`](research/learning-native-b2-trace-6-2026-07-11.md)
- [`research/learning-native-b2-six-trace-synthesis-2026-07-11.md`](research/learning-native-b2-six-trace-synthesis-2026-07-11.md)
- [`research/experiment-ledger.md`](research/experiment-ledger.md)
- [`research/deepseek-learning-loop-oss-reduction-2026-07-11.md`](research/deepseek-learning-loop-oss-reduction-2026-07-11.md)
- [`research/deepseek-tool-lifecycle-2026-07-11.md`](research/deepseek-tool-lifecycle-2026-07-11.md)
- [`research/deepseek-approval-cancellation-2026-07-11.md`](research/deepseek-approval-cancellation-2026-07-11.md)
- [`research/deepseek-stale-approval-2026-07-11.md`](research/deepseek-stale-approval-2026-07-11.md)
- [`research/deepseek-tool-catalog-2026-07-11.md`](research/deepseek-tool-catalog-2026-07-11.md)
- [`research/opencode-code-mode-readonly-2026-07-11.md`](research/opencode-code-mode-readonly-2026-07-11.md)
- [`research/deepseek-bounded-material-retrieval-2026-07-11.md`](research/deepseek-bounded-material-retrieval-2026-07-11.md)
- [`research/source-reference-revision-2026-07-11.md`](research/source-reference-revision-2026-07-11.md)
- [`research/deepseek-untrusted-material-authority-2026-07-11.md`](research/deepseek-untrusted-material-authority-2026-07-11.md)
- [`research/deepseek-staged-model-collaboration-2026-07-11.md`](research/deepseek-staged-model-collaboration-2026-07-11.md)
- [`research/deepseek-global-overview-lazy-context-2026-07-11.md`](research/deepseek-global-overview-lazy-context-2026-07-11.md)
- [`research/chatgpt-pro-alignment-benchmark-review-2026-07-11.md`](research/chatgpt-pro-alignment-benchmark-review-2026-07-11.md)
- [`research/deepseek-task-alignment-annotation-2026-07-11.md`](research/deepseek-task-alignment-annotation-2026-07-11.md)
- [`research/deepseek-structured-output-vs-tool-transport-2026-07-11.md`](research/deepseek-structured-output-vs-tool-transport-2026-07-11.md)
- [`research/codex-rust-v0.144.1-runtime-contracts.md`](research/codex-rust-v0.144.1-runtime-contracts.md)
- [`research/opencode-v1.17.18-agent-loop.md`](research/opencode-v1.17.18-agent-loop.md)
- [`research/opencode-v1.17.18-runtime-contracts.md`](research/opencode-v1.17.18-runtime-contracts.md)
- [`research/message-and-model-event-contracts.md`](research/message-and-model-event-contracts.md)
- [`research/tool-lifecycle-contracts.md`](research/tool-lifecycle-contracts.md)
- [`research/session-serialization-and-recovery.md`](research/session-serialization-and-recovery.md)
- [`research/permission-flow-contracts.md`](research/permission-flow-contracts.md)
- [`research/learning-semantic-anchor.md`](research/learning-semantic-anchor.md)
- [`research/validation-and-state-storage.md`](research/validation-and-state-storage.md)
- [`research/chatgpt-pro-foundation-review-2026-07-10.md`](research/chatgpt-pro-foundation-review-2026-07-10.md)
- [`research/architecture-gate-and-response-admission-audit-2026-07-13.md`](research/architecture-gate-and-response-admission-audit-2026-07-13.md)
- [`research/chatgpt-pro-next-pressure-path-review-2026-07-13.md`](research/chatgpt-pro-next-pressure-path-review-2026-07-13.md)
- [`research/claude-code-v2.1.88-provenance.md`](research/claude-code-v2.1.88-provenance.md)
- [`research/agent-harness-paradigms.md`](research/agent-harness-paradigms.md)
- [`research/learning-representation-and-goals.md`](research/learning-representation-and-goals.md)
- [`research/open-world-domain-modeling.md`](research/open-world-domain-modeling.md)
- [`research/math-academy-task-selection-and-review.md`](research/math-academy-task-selection-and-review.md)
- [`research/simulated-student-benchmark-protocol.md`](research/simulated-student-benchmark-protocol.md)
- [`research/simulated-student-pilot-2026-07-11.md`](research/simulated-student-pilot-2026-07-11.md)
- [`research/simulated-student-benchmark-main-2026-07-11.md`](research/simulated-student-benchmark-main-2026-07-11.md)
- [`research/evidence-criteria-followup-protocol.md`](research/evidence-criteria-followup-protocol.md)
- [`research/chatgpt-pro-evidence-followup-review-2026-07-11.md`](research/chatgpt-pro-evidence-followup-review-2026-07-11.md)
- [`research/evidence-criteria-followup-2026-07-11.md`](research/evidence-criteria-followup-2026-07-11.md)
