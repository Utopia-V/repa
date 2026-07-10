# OpenCode v1.17.18 runtime-contract findings

Reference commit: `b1fc8113948b518835c2a39ece49553cffe9b30c`

## Why this slice exists

The end-to-end trace identifies control flow. This note identifies the contracts that keep provider streaming, durable session state, permissions, and the TUI from collapsing into one mutable object.

OpenCode `v1.17.18` contains both the legacy `SessionPrompt` runtime used by the traced HTTP/TUI path and an emerging V2 Session Core. The coexistence is evidence of an active migration, not a template to reproduce.

## Three distinct event planes

OpenCode's current implementation reveals three event planes with different consumers and durability requirements.

### Provider stream events

[`packages/llm/src/schema/events.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/llm/src/schema/events.ts) defines normalized `LLMEvent`s:

```text
step-start
text-start / text-delta / text-end
reasoning-start / reasoning-delta / reasoning-end
tool-input-start / tool-input-delta / tool-input-end
tool-call / tool-result / tool-error
step-finish / finish
provider-error
```

These events describe a provider turn. They are not themselves the complete durable session model and should not be exposed as the application domain vocabulary.

### Durable session projection

[`packages/schema/src/v1/session.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/schema/src/v1/session.ts) stores user/assistant messages and typed parts. The processor reduces provider events into these records.

A durable tool part has stable `messageID`, `partID`, and `callID` identity plus one of four states:

```text
pending   input is still being assembled
running   validated input and start time exist
completed output, metadata, and end time exist
error     error and end time exist
```

This projection is designed for session recovery, history, and UI replay. It contains information that does not belong in the provider protocol, such as application-generated IDs and timestamps.

### Application/UI events

Message, part, status, permission, and error changes are published for clients. The TUI consumes these events to update its projection. They describe changes to application state, not raw provider chunks.

### Finding

Repa should not define one universal `Event` union for all three planes. At minimum it needs distinct names and ownership for:

- model-adapter output;
- committed session changes;
- subscriber notifications.

They may share payload types where justified, but they are not interchangeable.

## Tool-call lifecycle

Provider input may arrive incrementally before a complete `tool-call` event. `SessionProcessor` therefore creates or updates a pending call during `tool-input-*`, transitions it to running on `tool-call`, and settles it from `tool-result` or `tool-error`.

[`packages/opencode/src/session/processor.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/processor.ts) correlates all updates through the provider call ID and persists every state change through the session service.

The V1 durable union has no separate `denied` or `cancelled` state. Permission rejection and interruption are lowered through error/interrupted session behavior. That is an upstream design choice, not an invariant Repa should automatically copy. A learning agent may benefit from distinguishing:

- invalid tool input;
- denied authorization;
- user-cancelled action;
- interrupted execution;
- tool implementation failure.

This distinction must be settled before the production `ToolCall` union is written.

## Tool definition versus turn-bound execution

[`packages/opencode/src/tool/registry.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/tool/registry.ts) owns stable definitions and visibility. [`packages/opencode/src/session/tools.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/tools.ts) turns those definitions into executable tools for one provider turn.

The per-turn context adds:

- session, assistant-message, and call identity;
- selected agent/model;
- cancellation signal;
- permission callback;
- metadata update callback;
- current message history;
- plugin/runtime hooks.

The stable tool definition should not capture mutable session state. Repa should preserve this separation even though its first registry will be much smaller.

## Permission flow

[`packages/opencode/src/permission/index.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/permission/index.ts) evaluates the last matching rule across merged rulesets. A request is:

- immediately rejected if any required pattern evaluates to `deny`;
- immediately allowed if every pattern evaluates to `allow`;
- published and suspended if at least one pattern evaluates to `ask`.

The suspended execution waits on a deferred result. The user reply can allow once, add an in-memory always-allow rule, or reject. Rejecting one request also rejects pending requests for the same session.

Important boundary: the tool execution layer waits for permission. The TUI only renders and replies to the request. Authorization cannot be bypassed by driving the runtime from a different interface.

Repa should preserve execution-layer enforcement. It should not initially copy wildcard configuration, session-wide cascading rejection, or OpenCode's exact `once/always/reject` vocabulary without evaluating learning-specific actions.

## Per-session execution serialization

The active V1 path uses [`packages/opencode/src/session/run-state.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/run-state.ts). A process-local map owns one runner per session. Repeated work joins the existing runner, different sessions may run concurrently, and cancellation targets the active session runner and related background jobs.

The V2 path uses [`packages/core/src/session/run-coordinator.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/run-coordinator.ts). It expresses the same central invariant more explicitly:

```text
one active drain per session key
different sessions may drain concurrently
repeated explicit runs join
wakeups coalesce into at most one follow-up drain
interrupt stops owned work and clears pending wakeups
```

This invariant is more important than either Effect-based implementation. Repa needs a small per-session executor rather than a global queue or unconstrained concurrent loops.

## Durable prompt admission: useful idea, premature implementation

The V2 Session Core separates admitting a prompt from promoting it into model-visible history. [`packages/core/src/session/input.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/input.ts) stores `admitted_seq` and optional `promoted_seq`. This supports queued/steering inputs and deterministic ordering across provider-turn boundaries.

[`packages/core/src/session/sql.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/sql.ts) shows the migration from separate V1 message/part JSON tables toward sequenced `session_message` and `session_input` projections.

The upstream architecture notes explicitly state that process-local drains do not yet provide post-crash continuation recovery. Therefore Repa should learn from the admission/promotion distinction but should not copy V2 event sourcing as if it were a finished recovery design.

## Persistence findings

OpenCode persists messages and parts before treating them as the current session projection. Tool state carries enough identity and timing information to be replayed. The TUI does not reconstruct truth from transient model callbacks.

For Repa, the first persistence design should satisfy these invariants without reproducing the full schema:

- stable session, message, part, and tool-call identity;
- deterministic order within a session;
- atomic transition of one durable projection step;
- safe re-read after process restart;
- explicit treatment of in-flight assistant turns and tool calls;
- no reliance on TUI component memory for recovery.

Whether this uses append-only events, mutable projections, or both remains unresolved.

## Stable mechanisms versus transitional structure

### Stable mechanisms to carry forward

- Separate provider events from durable session state.
- Correlate streamed fragments and tool settlement with stable IDs.
- Persist assistant/tool state as it evolves.
- Serialize execution per session while allowing session-level concurrency.
- Enforce permissions inside tool execution.
- Propagate cancellation through provider and tools.
- Drive the TUI from replayable application state/events.

### Transitional or product-specific structure to avoid copying

- Simultaneous V1 and V2 session models.
- Event bridges maintained for compatibility.
- Effect service graphs and generated SDK boundaries.
- Durable prompt inbox semantics before Repa has steering/queue requirements.
- Plugin, MCP, subagent, background-job, and multi-runtime interactions.
- OpenCode's exact tool-state error lowering.

## Design hypotheses for Repa

These are hypotheses for the next design phase, not accepted contracts:

1. A model adapter emits a small provider-neutral `ModelEvent` stream.
2. A session reducer commits typed `MessagePart` and `ToolCall` transitions.
3. A per-session executor owns serialization, joining, and cancellation.
4. A tool registry stores stable definitions; a turn builder attaches runtime context.
5. A permission broker is called by tools and publishes requests to whichever UI exists.
6. The first implementation remains single-process and avoids HTTP, workers, and generated SDKs.

Each hypothesis still requires a Repa-specific state-transition proposal and executable tests before production implementation.
