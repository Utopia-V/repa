# ADR-0008: Separate model write initiative from durable state authority

Status: Accepted
Date: 2026-07-11

## Context

The Learning System is the Tutor, but that does not mean deterministic code
authors or initiates every learning action. Models need to interpret open
language, choose and carry out teaching moves, normalize learner reports,
create useful plans and hypotheses, and sometimes write durable state.

The opposite simplification is also wrong: a model tool call cannot supply its
own trusted source, revision, permission, event time, or epistemic force and
become authoritative merely because it is fluent.

OpenCode and Codex both use capability mediation for real model-initiated
writes. The model supplies semantic payload and initiates the effect; the host
canonicalizes the target, validates input, evaluates permission, performs the
effect, and correlates the result. Their file-effect recovery guarantees are
not adopted.

Repa's B1 lab already demonstrated a stronger local SQLite boundary for
host-issued learning commands. ALS-017 then demonstrated a live model
independently initiating source-linked progress and revisit writes, an
executor rejecting a stale write, a later context consuming accepted state,
and a model retrieving and retracting the exact progress record after a learner
correction. The same run also showed that correct state authority does not by
itself guarantee good continuation policy.

## Decision

A model may be both the semantic author and the authorized initiator of a real
durable learning command. A successfully admitted model-issued command commits
actual system state; it is not necessarily a proposal awaiting a second model
or a hidden host selector.

For every such command:

1. The model-visible payload contains only the semantic fields the capability
   delegates.
2. The runtime supplies trusted execution context, including the actual
   Session/Turn and tool-call identity, admissible source reference, current
   state revision, event time, active policy/permission, and any entity identity
   that the domain must own.
3. The learning-domain executor validates shape, source relationship,
   preconditions, legal state transition, revision, permission, and command-
   specific idempotency.
4. Related local effects and the matching tool settlement follow ADR-0006 and
   commit atomically.
5. The record preserves enough semantic authorship, epistemic basis, and source
   provenance to remain inspectable and correctable.
6. The next model sample recompiles context from the accepted revision. An
   already-issued sample does not silently acquire the new state.

Successful admission establishes the legal meaning of the stored record. It
does not upgrade a learner report, model inference, or generated summary into
independently observed truth. A constitutive command such as scheduling a
revisit makes that schedule real after commit; a descriptive command such as
recording reported reading remains a source-linked report rather than mastery.

Routine, local, reversible writes may execute without an approval dialog. They
remain visible and correctable. High-impact or external effects retain their
separate permission and connector-specific reconciliation boundaries.

Deterministic consequences that must always occur cannot depend on the model
remembering to call a tool. They are derived or enforced by code after the
authoritative prerequisite transition. A learning interaction with no useful
future consumer creates no structured learning write.

This decision defines ownership, not a fixed program/model control ratio, a
second runtime, or a global teaching workflow.

## Consequences

- `runtime-owned command` describes admission, execution, and settlement; it
  does not imply runtime-only initiative.
- Prompt instructions can guide write selection but cannot grant authority or
  validate state transitions.
- Tool visibility is part of the delegated capability boundary and may vary at
  a model-sampling boundary.
- Model-authored hypotheses may be durable and useful without masquerading as
  verified facts.
- Learner corrections append provenance and change the active projection; they
  do not erase the earlier report or model action.
- Physical tool-call identity and semantic effect identity use separate
  idempotency treatment under ADR-0009. Each command still has to earn its own
  durable causal occurrence and domain address.
- The exact command catalog, schemas, post-turn extraction path, authorship
  representation, and context storage layout remain implementation decisions.

## Counterexamples

### Accepted model write is treated as only a suggestion

The learner asks the Tutor to revisit a section tomorrow. The model calls the
available scheduling command, the executor accepts it, but another planner must
approve it before it exists. This adds a hidden second controller and violates
the accepted direct-write boundary for a routine reversible action.

### Legal commit is treated as proof of mastery

The model records a learner's statement that a section was read. The write
commits correctly, but later code treats it as independently demonstrated
ability. The transaction is valid while the epistemic interpretation is not.

### Mandatory effect depends on model initiative

A deterministic grader commits an attempt result, but the revisit required by
an accepted rule exists only if the model happens to call another tool. The
rule must instead derive its consequence from the committed result.

### Host identity is model-controlled

The model supplies an arbitrary source item or stale revision in its tool
payload and the executor accepts it. The write bypasses the trusted envelope
and violates this decision even if its content happens to be correct.

## Evidence and deliberate differences

- OpenCode `v1.17.18`, commit
  `b1fc8113948b518835c2a39ece49553cffe9b30c`:
  `packages/opencode/src/tool/write.ts`, `tool/tool.ts`,
  `session/tools.ts`, and `session/processor.ts`.
- Codex `rust-v0.144.1`, commit
  `44918ea10c0f99151c6710411b4322c2f5c96bea`:
  `core/src/stream_events_utils.rs`, `tools/router.rs`,
  `tools/handlers/apply_patch.rs`, `tools/orchestrator.rs`, and
  `session/turn.rs`.
- Repa B1 deterministic executor and ALS-017 live closed-loop result.

Repa keeps SQLite as its sole first-version machine authority and atomically
settles related local learning effects. It does not copy either reference's
package topology, file permission vocabulary, dual persistence, or uncertain
external-effect recovery behavior.
