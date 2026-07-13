# Agent and harness paradigms: source-derived findings

Date: 2026-07-10

Current scope note (2026-07-11): the source observations about agent loops,
tools, context, and memory remain useful. Any consequence that assumes every
learning activity becomes evidence, a learner projection, or an obligation is
a pre-benchmark design hypothesis and is not current product guidance. See
[`../proposals/0003-learning-native-responsibilities.md`](../proposals/0003-learning-native-responsibilities.md).

Primary implementation evidence:

- Claude Code `v2.1.88`, recovered research snapshot described in
  [`claude-code-v2.1.88-provenance.md`](./claude-code-v2.1.88-provenance.md)
- OpenCode `v1.17.18` at
  `b1fc8113948b518835c2a39ece49553cffe9b30c`
- [`opencode-v1.17.18-agent-loop.md`](./opencode-v1.17.18-agent-loop.md)
- [`opencode-v1.17.18-runtime-contracts.md`](./opencode-v1.17.18-runtime-contracts.md)
- Codex `rust-v0.144.1` at
  `44918ea10c0f99151c6710411b4322c2f5c96bea`
- [`codex-rust-v0.144.1-runtime-contracts.md`](./codex-rust-v0.144.1-runtime-contracts.md)

## Finding in one sentence

There is no single standardized agent-harness architecture, but production
systems repeatedly converge on a small tool-feedback interpreter surrounded by
explicit choices about control flow, state authority, execution ownership,
effect authorization, and recovery.

Those choices are better treated as orthogonal architectural patterns than as
one framework hierarchy.

## Operational vocabulary for this project

Industry usage remains inconsistent. The following definitions are therefore
project terminology, not claims of a universal standard.

### Agent policy

The model, instructions, available tools, context-selection policy, and limits
that determine how the next action is selected. The policy is model-led: code
sets the legal action space, while the model chooses an action within it.

### Agent loop

The interpreter that repeatedly constructs a model request, consumes the model
response, settles requested tool calls, appends observations, and decides
whether another model-sampling operation is required.

### User turn

The interaction boundary that begins with accepted user input and groups the
agent work, accepted steering, model samples, and tools until the interaction
completes, is interrupted, or fails. It is smaller than a conversation and
larger than one model-sampling operation.

### Model-sampling operation

One logical request from the loop to the model adapter. The adapter may consume
multiple provider streams or transport sends during retry and fallback. The
current foundation proposal calls a nearby concept `ModelAttempt` but must
clarify its exact boundary. Model/transport settlement does not settle the
enclosing user turn or local tool effects.

### Agent runtime

The execution substrate around one or more loops: session identity,
serialization, cancellation, persistence, retries, streaming, approval waits,
recovery, and process placement.

### Agent harness

An opinionated product runtime that supplies an agent with built-in tools,
context construction, permission policy, transcript behavior, compaction,
skills or subagents, and an interaction surface. Claude Code, OpenCode, and
Codex are harnesses, not merely model SDK wrappers.

### Domain system

The durable world the agent acts on. For this project it contains learning
evidence, learner-state inferences, review obligations, course structure,
assignments, goals, and artifacts. It must not be reduced to the transcript.

LangChain's 2026 documentation now makes a similar, explicitly product-specific
distinction: frameworks supply abstractions and integrations; runtimes supply
durable execution, streaming, persistence, and human-in-the-loop; harnesses add
opinionated tools, prompts, planning, subagents, filesystems, and context
management. This is evidence of emerging vocabulary, not an industry standard.

## The convergent kernel

Claude Code, OpenCode, and Codex reduce to the following control loop despite
very different surrounding architectures:

```text
accepted user input
       |
       v
assemble model-visible request
       |
       v
execute one model-sampling operation
       |
       v
project assistant output and proposed tool calls
       |
       +---- no tool call / terminal condition ----> settle turn
       |
       v
validate -> authorize -> execute -> settle every tool call
       |
       v
append tool observations
       |
       +----------------------------------------------> next model sample
```

Codex makes one additional boundary explicit: the whole user-visible Turn may
contain several model-sampling operations and their intervening tools. The term
“provider turn” is therefore avoided below because it can ambiguously mean a
user interaction, a logical model operation, or a physical request.

Anthropic's public description calls agents systems in which the LLM
dynamically controls process and tool use, in contrast to workflows whose paths
are predefined in code. It describes the implementation as an LLM using tools
in a feedback loop. The source trees confirm that this simple loop remains the
kernel even after permissions, streaming, compaction, retries, subagents, and
UI behavior are added.

## The real paradigms are architectural axes

### 1. Model-led loop versus code-led workflow

This is the most fundamental split.

In a model-led loop, code defines tools, invariants, limits, and termination
conditions, but the model dynamically chooses the next tool and number of
steps. Claude Code's
[`query.ts`](https://github.com/Exhen/claude-code-2.1.88/blob/c8cd253554319f32ff64ff7000636199f720c9bc/source/src/query.ts)
and OpenCode's `SessionPrompt` follow this form.

In a code-led workflow, nodes and edges prescribe which operation may run
next. LangGraph makes this explicit through shared state, nodes, normal or
conditional edges, checkpoints, and interrupts.

Neither dominates the other:

- open-ended search, coding, and interactive study benefit from a model-led
  loop;
- deterministic imports, grading rules, state transactions, and submission
  workflows benefit from code-led paths;
- a product may use a model-led session that invokes deterministic domain
  workflows as tools.

Plan mode is not necessarily a separate runtime paradigm. In all three coding
agents it is largely a policy profile over the same loop: different
instructions, visible tools, and permission rules. Repa should not create seven
independent execution engines for plan, study, drill, review, assignment,
import, and reflection.

### 2. UI-owned interactive loop

Claude Code `v2.1.88` exemplifies a direct, in-process interactive harness.

[`REPL.tsx`](https://github.com/Exhen/claude-code-2.1.88/blob/c8cd253554319f32ff64ff7000636199f720c9bc/source/src/screens/REPL.tsx)
constructs context, directly iterates `query(...)`, and reduces yielded events
into its React message array. Its concurrency guard queues a new prompt when a
query is already running.

[`query.ts`](https://github.com/Exhen/claude-code-2.1.88/blob/c8cd253554319f32ff64ff7000636199f720c9bc/source/src/query.ts)
is an explicit async-generator interpreter. It carries mutable cross-turn state,
calls the model, executes tools, and assigns concrete terminal or continuation
reasons. [`QueryEngine.ts`](https://github.com/Exhen/claude-code-2.1.88/blob/c8cd253554319f32ff64ff7000636199f720c9bc/source/src/QueryEngine.ts)
wraps the same loop for headless/SDK use rather than making every surface a
client of one session service.

This form has low conceptual and transport overhead and supports tight product
iteration. Its cost is that UI state, live execution state, and recovery logic
can become entangled.

### 3. Session actor or single-writer runtime

OpenCode's V2 direction exemplifies a session-owned runtime.

One coordinator serializes execution per Session ID while allowing different
sessions to run concurrently. Input admission is separated from execution;
the runner promotes durable input at safe provider-sampling boundaries. The TUI
submits commands and renders projections rather than owning the loop.

This resembles the actor model without requiring a general actor framework:

- the Session has an identity;
- one execution lane mutates it;
- callers submit messages or commands;
- the Session emits state changes;
- internal state is not concurrently mutated by UI callbacks.

This pattern is especially valuable when steering, multiple surfaces,
background execution, or reliable resume matter.

### 4. Graph/checkpoint runtime

LangGraph represents control as nodes and edges over shared typed state and
checkpoints state between execution steps. It is appropriate when the
application needs inspectable mixed deterministic/agentic workflows,
human-in-the-loop resumption, or durable execution at named boundaries.

It is not the natural default for a Claude Code-style open-ended terminal
session. Encoding the ordinary tool loop as a large graph can make incidental
control structure more prominent than product semantics.

### 5. Message-driven multi-agent runtime

AutoGen Core exemplifies another family: agents have identities and lifecycles,
receive serializable messages through a runtime, and can run in standalone or
distributed environments. This is an actor/message-bus architecture aimed at
multi-agent applications.

Subagents do not require this architecture. Claude Code, OpenCode, and Codex can
expose an agent as a tool and recursively invoke the same basic loop. A distributed
agent runtime is justified only when independent ownership, placement, or
message routing is itself a requirement.

## State-authority patterns visible in practice

### Transcript journal plus live memory

Claude Code's REPL keeps the active message sequence in process memory and
appends selected messages to per-session JSONL. The JSONL uses UUID parent links
to reconstruct a conversation chain. It also records queue operations,
compaction boundaries, file-history snapshots, tombstones, and other metadata.

[`sessionStorage.ts`](https://github.com/Exhen/claude-code-2.1.88/blob/c8cd253554319f32ff64ff7000636199f720c9bc/source/src/utils/sessionStorage.ts)
shows both the strength and cost of the design: append-only writes are simple,
but compaction, rewind, snipping, dead branches, missing tool results, and
resume require increasingly elaborate chain reconstruction.

### Durable session events and projections

OpenCode V2 admits inputs and publishes sequenced durable Session events, then
projects messages, tool state, and context epochs. Live deltas are kept
distinct from replayable events. This gives reconnect and replay clearer
semantics, but adds schemas, projectors, migrations, and compatibility work.

### Rollout journal plus query projection

Codex persists selected canonical response items and turn lifecycle events to
a JSONL rollout journal, then maintains SQLite metadata and paginated query
projections. It flushes the journal before advancing SQLite and can backfill
the projection from rollout history.

This supports conversation reconstruction and client queries, but most
in-flight coordination remains process-local: pending steering, approvals,
provider streams, tool futures, and cancellation tokens are not a durable
workflow. The design demonstrates that useful resume and exact in-flight
recovery are separate guarantees.

### Graph snapshots

LangGraph checkpoints the shared graph state at execution steps. This makes
named workflow boundaries easy to inspect and resume, but binds persistence to
the chosen graph topology and state schema.

There is no universally correct persistence mechanism. The invariant is that
the authoritative state and recovery boundary must be explicit.

## Tool execution is a state machine, not a function call

Claude Code's
[`StreamingToolExecutor.ts`](https://github.com/Exhen/claude-code-2.1.88/blob/c8cd253554319f32ff64ff7000636199f720c9bc/source/src/services/tools/StreamingToolExecutor.ts)
tracks tools as queued, executing, completed, and yielded. Concurrency-safe
tools may overlap; exclusive tools wait. Results are emitted in controlled
order. Abort propagation distinguishes user interruption, sibling failure, and
stream fallback, and synthesizes missing tool results so the model transcript
remains structurally valid.

[`toolExecution.ts`](https://github.com/Exhen/claude-code-2.1.88/blob/c8cd253554319f32ff64ff7000636199f720c9bc/source/src/services/tools/toolExecution.ts)
implements a pipeline rather than a direct call:

```text
schema validation
-> semantic input validation
-> pre-tool hooks and optional input rewrite
-> permission resolution
-> execution with progress and cancellation
-> bounded result conversion
-> post-tool hooks
-> model-visible tool result
```

OpenCode expresses similar phases through registered definitions, per-turn
execution context, the permission service, and durable tool-part states. Codex
uses a live runtime with approval, sandbox escalation, cancellation, and
correlated model-visible outputs, but no general durable effect-reconciliation
state machine. The stable pattern is capability mediation: the model proposes
an effect, but the runtime validates, authorizes, executes, and reports it. The
durability and exactly-once guarantees of the effect itself are domain-specific.

## Context construction is becoming a compiler boundary

The naive view treats the system prompt as a string. Production harnesses treat
model-visible context as a derived artifact assembled from instructions,
current environment, tools, message history, memory, permissions, and product
state.

Claude Code reconstructs much of this context for each query iteration and has
several compaction/projection mechanisms. OpenCode V2 is moving toward typed
Context Sources and Context Epochs so the exact privileged context shown to the
model has a stable baseline and durable chronological updates.

The recurring pattern is a context compiler:

```text
authoritative sources + policy + provider capabilities
                         |
                         v
              bounded model request
```

The compiled request is not itself the source of truth. This distinction is
critical for learning state, which must remain queryable and correctable outside
the prompt.

## What is stable across the systems

The following mechanisms are sufficiently convergent to treat as baseline
patterns for Repa:

1. A user-visible turn is distinct from each model-sampling operation inside
   it.
2. A typed model-event stream distinct from application state.
3. Stable identities for sessions, messages, and tool calls.
4. Every complete model tool call receives a correlated model-visible output
   before later sampling; this does not prove exactly-once external effects.
5. Tool definitions are stable; executable tools receive per-turn context.
6. Permission enforcement belongs in the execution path, not in the TUI.
7. Cancellation propagates through provider and tool work.
8. Ordinary Turn-driving work is single-lane within one resident
   conversation/thread runtime; control input and child threads may proceed
   through separate boundaries.
9. Context is compiled from authoritative sources at explicit boundaries.
10. Ephemeral render progress is not automatically durable history.

## What is not a stable paradigm

- A particular framework or dependency-injection system.
- A universal `plan / build` state machine.
- Multi-agent orchestration as the default architecture.
- A graph representation for every control path.
- Chat messages as the complete product state.
- One event union shared by provider deltas, durable facts, and UI updates.
- A particular database, transport, or TUI library.

## Architecture consequence for Agentic Learning System

The best current fit is a deliberate hybrid:

```text
single-process session runtime
  + explicit model-led tool loop
  + one serialized executor per active session
  + execution-layer permission suspension
  + replayable session projection
  + independent learning-domain state and events
  + TUI as command surface and projection
```

This is closer to OpenCode's Session ownership than Claude Code's REPL-owned
message array, while remaining much smaller than OpenCode V2. It does not
require an embedded HTTP server, generated SDK, distributed runtime, or general
workflow engine.

The most important split is not `agent-core` versus `learning-core`. It is four
different kinds of state with different owners:

| State plane | Examples | Authority |
| --- | --- | --- |
| Session | user/assistant messages, tool calls, approvals, run status | session runtime |
| Learning domain | evidence, inferences, review obligations, goals, assignment state | learning domain transactions |
| Workspace artifacts | notes, source material, generated exercises, reports | filesystem plus recorded patches |
| UI projection | cursor, expanded cards, streaming text, progress animation | TUI process memory |

Learning-native behavior should enter through the context compiler, domain
commands, state-change proposals, default continuation policy, and dedicated UI
projections. It should not make the provider adapter or streaming decoder know
what a Topic or ReviewItem is.

Conversely, the learning domain must not be hidden behind arbitrary generic
tools. A model may request `record_evidence` or `schedule_review`, but the
domain layer owns their legal transitions, provenance, correction, and durable
effects.

## Immediate design constraints

Before implementation, the project should settle these contracts in order:

1. Session, user-turn, and provider-attempt boundaries.
2. Provider-neutral model events.
3. Tool-call lifecycle, including denied, cancelled, interrupted, and unknown
   post-crash outcomes.
4. Single-writer session execution and input behavior while a turn is active.
5. Permission request/reply suspension.
6. Separation of committed session state from ephemeral streaming projection.
7. Boundary between session facts and learning-domain transactions.
8. Context-compiler inputs and provenance.

Multi-agent execution, graph orchestration, remote clients, and generalized
plugin hosting are not prerequisites for these contracts.

## Sources outside the pinned implementations

- Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- LangChain, [Frameworks, runtimes, and harnesses](https://docs.langchain.com/oss/python/concepts/products)
- LangGraph, [Graph API overview](https://docs.langchain.com/oss/python/langgraph/graph-api)
- Microsoft AutoGen, [Agent Runtime Environments](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/core-concepts/architecture.html)
