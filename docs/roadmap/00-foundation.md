# Foundation phase

Status: Runtime reference study and the accepted ADRs are complete. Generic
harness completion is not a separate phase; mechanisms are reused or narrowly
adapted as learning-first product paths need them. The learning-domain exit
path is open again after maintainer review found that the
formal-task fixtures had begun to overemphasize gradable practice. See
[`../foundation/02-what-the-tutor-does.md`](../foundation/02-what-the-tutor-does.md).

## Goal

Reach the point where the maintainer can design the first production
agent-runtime contracts from evidence rather than from a blank page or a
whole-repository AI generation, while exercising those contracts against a thin
learning-semantic path instead of completing a generic harness in isolation.

## Completed in the initial slice

- Record the product origin and settled constraints.
- Define the role of AI in engineering work.
- Pin an executable OpenCode reference.
- Pin Codex as an independent secondary comparison reference.
- Trace the ordinary TUI-to-agent-loop path.
- Trace the provider-event, durable-session, tool, permission, and execution-serialization boundaries.
- Separate reusable agent mechanisms from OpenCode product-scale architecture.
- Cross-check turn, sampling, tool-effect, approval, persistence, recovery,
  context, mode, and budget assumptions against Codex.
- Establish a strict TypeScript/Bun repository baseline.

## Source slices

### Message and model events (completed)

Trace message/part schemas and the `LLMEvent` normalization contract. Produce a proposed Repa event vocabulary and test it against recorded model/tool sequences.

Result: [Message and model-event contract findings](../research/message-and-model-event-contracts.md)

### Tool lifecycle (completed)

Trace pending, running, completed, failed, denied, and interrupted tool behavior. Identify which state is provider output, which is runtime state, and which must be durable.

Result: [Tool lifecycle contract findings](../research/tool-lifecycle-contracts.md)

### Session serialization and recovery (completed)

Trace how OpenCode prevents overlapping session loops and reconstructs continuation from stored messages. Investigate crash boundaries before choosing a Repa persistence schema.

Result: [Session serialization and recovery findings](../research/session-serialization-and-recovery.md)

### Permission flow (completed)

Trace rule evaluation, request publication, user reply, cancellation, and tool resumption. Distinguish authorization from UI confirmation.

Result: [Permission flow contract findings](../research/permission-flow-contracts.md)

### Learning-significance contract lab (completed)

Exercise ordinary clarification, selected explanation, formal task results,
assistance conditions, correction, time-derived review, atomic local settlement,
projection rebuild, and a changed next action. This remains a contract fixture,
not a complete curriculum model, learner ontology, or scheduler policy.

Result: [Learning-significance contract findings](../research/learning-semantic-anchor.md)

### Learning-task significance and scheduling (direction reviewed)

Separate ordinary conversation from formal learning-task results, then specify
how diagnostic, lesson, quiz, and review evidence may affect local scheduling
without rewriting the curricular view. Account for naturally due review without
inventing new evidence when time passes.

Inputs:

- [Math Academy task-selection and review findings](../research/math-academy-task-selection-and-review.md)
- [Learning representation beyond topic mastery](../research/learning-representation-and-goals.md)

Working result:
[Learning-task significance and scheduling behavior](../proposals/0002-learning-task-significance-and-scheduling.md)

### Codex comparative audit (completed)

Trace the same runtime boundaries in an independently built agent. Use the
comparison to find both missing contracts and defensive guarantees that are not
general harness prerequisites.

Result:
[Codex `rust-v0.144.1` runtime-contract findings](../research/codex-rust-v0.144.1-runtime-contracts.md)

## Foundation exit gate

The runtime **reference and contract study** is complete. It supplies reusable
mechanisms and boundaries, not a requirement to implement a complete
terminal-agent harness. The accepted contracts cover the interaction hierarchy,
local transaction scope, process-local coordination, finite continuation,
permission boundaries, and the separation of provider events from durable
product state.

Revised synthesis:
[Foundation runtime contracts](../proposals/0001-foundation-runtime-contracts.md).
The maintainer accepted its five defaults on 2026-07-11. ADR-0005, ADR-0006,
and ADR-0007 record the interaction, transaction, recovery, and continuation
boundaries.

The previous learning-domain gate centered a formal task, evidence
interpretation, learner projection, and changed selector action. ALS-015 and
ALS-016 did not earn that representation, and maintainer review found that the
path displaced teaching and material learning. It remains historical research,
not an unfinished foundation requirement.

The product behavior baseline is now recorded in:

- [What the Tutor does](../foundation/02-what-the-tutor-does.md);
- [Complete learning behavior traces](../foundation/03-complete-learning-traces.md);
- [Current understanding](../current-understanding.md); and
- [Learning-native responsibilities](../proposals/0003-learning-native-responsibilities.md).

The B1/B2 behavior baseline is now historical evidence. Active work is selected
from [the architecture-led build map](./architecture-led-build-sequence.md),
which preserves peer product pressure paths instead of extending one numbered
module sequence. No broad learning schema is selected without a demonstrated
future consumer.
