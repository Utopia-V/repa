# Foundation phase

## Goal

Reach the point where the maintainer can design the first production
agent-runtime contracts from evidence rather than from a blank page or a
whole-repository AI generation, while exercising those contracts against a thin
learning-semantic path instead of completing a generic harness in isolation.

## Completed in the initial slice

- Record the product origin and settled constraints.
- Define the role of AI in engineering work.
- Pin an executable OpenCode reference.
- Trace the ordinary TUI-to-agent-loop path.
- Trace the provider-event, durable-session, tool, permission, and execution-serialization boundaries.
- Separate reusable agent mechanisms from OpenCode product-scale architecture.
- Establish a strict TypeScript/Bun repository baseline.

## Remaining source slices

### Message and run events

Trace message/part schemas and the `LLMEvent` normalization contract. Produce a proposed Repa event vocabulary and test it against recorded model/tool sequences.

### Tool lifecycle

Trace pending, running, completed, failed, denied, and interrupted tool behavior. Identify which state is provider output, which is runtime state, and which must be durable.

### Session serialization and recovery

Trace how OpenCode prevents overlapping session loops and reconstructs continuation from stored messages. Investigate crash boundaries before choosing a Repa persistence schema.

### Permission flow

Trace rule evaluation, request publication, user reply, cancellation, and tool resumption. Distinguish authorization from UI confirmation.

### Learning-semantic anchor

Define the minimum contract required to carry one committed learning occurrence
through learner-state projection, context assembly, Tutor action, and a changed
next action. This is a contract fixture, not a complete curriculum model or
learner ontology.

The fixture must distinguish a durable occurrence from a rebuildable model
inference and must use the same Session/tool lifecycle being designed above.

## Foundation exit gate

The phase ends when the repository contains a reviewed proposal for:

- `Message` and `MessagePart`;
- provider-neutral `RunEvent`;
- `ToolDefinition`, `ToolCall`, and legal state transitions;
- `PermissionRequest` and `PermissionDecision`;
- serialized `AgentRun`/session execution;
- persistence and interruption invariants;
- the transaction boundary between durable Session facts, durable learning
  occurrences, and rebuildable learner projections;
- one trace demonstrating that different committed learning evidence changes
  assembled context and the Tutor's next action.

No full TUI or broad learning schema is started before this gate. A focused lab
may use SQLite and a minimal learning trace to validate an uncertain mechanism,
but production code cannot depend on accidental lab structure.
