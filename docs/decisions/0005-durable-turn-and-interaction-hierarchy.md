# ADR-0005: Use a durable Turn above model and tool lifecycles

Status: Accepted
Date: 2026-07-11

## Context

A terminal agent may sample a model several times and execute several tools in
response to one user request. Provider completion, tool settlement, and the end
of the user-visible interaction are therefore different events. OpenCode
persists structured Session messages and tool parts; Codex additionally exposes
an explicit Turn aggregate. Neither provider events nor one assistant message
is a sufficient product boundary for Agentic Learning System.

## Decision

The first implementation uses this interaction hierarchy:

```text
Session
  -> Turn
       -> logical model operation
            -> transport attempt (diagnostic by default)
       -> tool invocation
```

A `Session` is the long-lived conversation and workspace interaction history.
A durable `Turn` begins with one admitted user request and groups the resulting
agent work, including accepted steering, model operations, tool invocations,
and one terminal outcome.

The initial user item and a running Turn are committed before provider work
begins. A Turn may contain several logical model operations. Model completion
does not imply that its tools or the Turn have completed.

Context reconstruction or compaction may place an existing user item back into
a later model request. That does not admit a new user request, create another
Turn, or create another source occurrence. Durable item/Input identity, not
repeated text in model context, defines whether input is new.

The first legal Turn lifecycle is:

```text
running -> completed | failed | interrupted | exhausted
terminal -> no transition
```

One resident Session runtime owns at most one running Turn. Different Sessions
may run concurrently.

The first production spine records one nondecreasing causal timeline within a
Turn. A new model sample, tool invocation, first tool settlement, model
completion, Turn completion, or recovery timestamp cannot precede the latest
durable event already owned by that Turn. Exact replay of an already terminal
operation returns its stored result and does not create another event. This
initial rule deliberately defers out-of-order parallel tool settlement until a
real concurrent consumer earns a partial-order representation.

Turn admission normalizes omitted execution limits to their durable defaults
before storing or comparing replay input. Replay with omitted limits is
therefore equivalent to replay with those exact defaults, but it is not a
wildcard for a Turn originally admitted with custom limits.

A later admitted Turn also cannot precede the latest durable event already
owned by the same Session. Session sequence remains the ordering authority;
the timestamp rule is only a nondecreasing causal floor and permits equal
timestamps. The runtime floors a regressing wall clock to that Session
frontier, while the Interaction boundary rejects a caller that submits a
backdated new occurrence. Exact replay is checked first and keeps its original
time even after the Session has advanced. Different Sessions do not impose a
total timestamp order on conversation occurrences. Shared learning-state
mutation does have one database-wide causal frontier, however: before a model
operation samples context or a tool executes, the runtime floors a regressing
clock to the latest committed state transition, including one caused by
another Session. This prevents a later shared-state write from being recorded
as though it happened before the state it consumed, without pretending that
unrelated Session transcripts have one global order.

## Consequences

- Complete assistant text, complete tool calls, tool results, and the terminal
  Turn outcome can be reconstructed without replaying provider deltas.
- Provider retry attempts do not create duplicate user-visible Turns or tool
  invocations.
- A repeated recent user message after compaction remains the same durable
  input. Long-running goals and learning state are recompiled from their
  authoritative stores rather than inferred from its repeated presence.
- A later Turn may explicitly continue an interrupted Turn's durable history;
  recovery does not silently redispatch model work.
- A failed or interrupted Turn with no assistant item still contributes its
  terminal time to later Session admission and context sampling.
- The exact database table layout remains an implementation decision. The
  identities and lifecycle meanings do not.

## Counterexample

The model returns a complete tool call and its provider request finishes. The
tool then fails. The logical model operation is complete, the tool invocation
is failed, and the Turn may continue with another model operation. Collapsing
all three into one status would lose the actual failure boundary.
