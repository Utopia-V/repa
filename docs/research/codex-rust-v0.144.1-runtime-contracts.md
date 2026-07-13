# Codex `rust-v0.144.1` runtime-contract findings

Date: 2026-07-10

Status: Source study of a pinned reference. This document is informative. It
does not approve the foundation proposal or authorize production code.

Current scope note (2026-07-11): Codex runtime facts remain source evidence.
Repa consequences that require a learner projection revision for every
learning action predate ALS-015/ALS-016 and are not current requirements.

Reference:

```text
repository: https://github.com/openai/codex.git
release: rust-v0.144.1
commit: 44918ea10c0f99151c6710411b4322c2f5c96bea
license: Apache-2.0
local checkout: .reference/codex
```

## Research question

The study asks which mechanisms recur in an independently built terminal agent
and which guarantees in Repa's draft foundation are local design ambitions
rather than established harness necessities.

The unit of comparison is behavior and ownership, not language or crate shape.
Codex is a large coding product. Its source is evidence that a mechanism works
under its constraints, not evidence that Repa should copy the mechanism.
Current official app-server documentation is used for public vocabulary; when
it differs from the pinned release, the pinned source and tests control claims
about `rust-v0.144.1`.

## Executive findings

1. Codex exposes an important boundary missing from the current Repa proposal:
   an ordinary interactive `Turn` begins with one request and groups the
   resulting agent work plus accepted steering. It may contain several
   continuation cycles and logical sampling operations; retries may create
   several adapter-level inference streams and still lower-level transport
   sends.
2. Codex, OpenCode, and the Repa draft all converge on one continuation loop
   that repeatedly samples, executes tools, records results, and decides whether
   another sample is required. Modes modify that loop's policy; they do not
   create separate runtimes.
3. Codex does not durably model every admitted input, pending approval,
   provider attempt, or ambiguous tool effect. Some important coordination is
   process-local. This is evidence against treating Repa's comprehensive crash
   state machine as a universal prerequisite.
4. Codex contains an optional, code-enforced rollout token budget. The Repa
   proposal currently specifies continuation without a corresponding resource
   bound.
5. Codex separates product protocol, internal runtime protocol, provider events,
   persisted history, and optional diagnostic evidence. That separation is a
   recurring harness pattern; Codex's very large concrete unions are not.
6. Codex's own repository warns that `codex-core` accumulated unrelated
   responsibilities. Mature source reduces uncertainty but does not eliminate
   architectural debt.

## The four observable planes

Codex does not have one universal event model.

### Product protocol: Thread, Turn, Item

The app-server protocol defines client-facing core concepts:

- a `Thread` is the conversation container;
- a `Turn` is one user request together with the agent work that follows; and
- a `ThreadItem` is one typed unit within the turn, such as a user message,
  agent message, reasoning item, command execution, file change, or MCP call.

The official app-server documentation describes the same three core
primitives. The source gives `Turn` its own identity, item list, lifecycle
status, timestamps, and error. Core can also synthesize a Turn from trigger-only
mailbox work without initial user input. Repa does not need background-triggered
Turns in its first slice, but the general concept is an execution grouping, not
a permanent assertion that every Turn has exactly one user message.

Sources:

- [app-server core primitives](https://learn.chatgpt.com/docs/app-server#core-primitives)
- [`thread_data.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs)
- [`turn.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/app-server-protocol/src/protocol/v2/turn.rs)
- [`item.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/app-server-protocol/src/protocol/v2/item.rs)
- [`tasks/mod.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tasks/mod.rs)

### Internal protocol: Submission and Event

The core runtime receives `Submission`s and emits `Event`s through queues. This
protocol includes operational details needed by the runtime and its callers. It
is not identical to either provider streaming or app-server `ThreadItem`s.

Source: [`protocol.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/protocol/src/protocol.rs)

### Normalized provider stream and canonical response items

The model adapter exposes normalized response-event streams. One logical
sampling operation may consume another stream after a retry or fallback, and a
traced adapter inference attempt need not expose every lower-level HTTP send.
The turn reducer assembles output items, dispatches tool calls, collects token
usage, handles stream errors, and observes provider completion.
`ResponseEvent::Completed` settles the current provider stream. It does not by
itself settle the logical sampling operation's tool futures, the surrounding
continuation cycle, or the user-visible Turn.

Source: [`session/turn.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/turn.rs)

### Persistence and diagnostics

Selected response items and lifecycle events are stored as rollout history.
An optional rollout-trace subsystem records much richer raw evidence and later
reduces it offline into a semantic graph. The trace is explicitly best-effort,
local, sensitive diagnostic data; it is not product authority and must never
make a session fail.

Sources:

- [`rollout/src/policy.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/rollout/src/policy.rs)
- [`rollout-trace/README.md`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/rollout-trace/README.md)
- [`rollout-trace/src/inference.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/rollout-trace/src/inference.rs)

### Finding for Repa

Repa needs names for at least these distinct boundaries:

```text
conversation/session
user-visible turn
continuation cycle
logical sampling operation
adapter inference-stream attempt
transport send
typed durable interaction item
provider event
live subscriber update
optional diagnostic trace event
```

They do not all require separate tables or exported public types. They do
require unambiguous ownership. In particular, a provider `completed` event
cannot also mean that a learning turn, local tools, and resulting learning
state changes have completed.

## The continuation loop

`RegularTask::run` starts a turn and calls `run_turn`. The latter contains an
inner loop. `TurnStarted` is emitted once, but late pending input can cause the
same `RegularTask` to call `run_turn` again without creating a second external
Turn. Each inner iteration:

1. may drain eligible pending steering at a safe boundary, unless an unfinished
   model/tool continuation must take precedence;
2. captures effective turn context;
3. prepares model-visible history;
4. runs one logical sampling operation, which may consume multiple normalized
   provider streams or adapter attempts on retry;
5. reduces complete output items and may start tool futures before the provider
   stream is terminal;
6. drains the in-flight tool futures after stream settlement;
7. observes tool follow-up needs and newly pending user input;
8. checks token and compaction conditions; and
9. either starts another continuation cycle or completes the Turn.

A tool result therefore becomes input to a later logical sampling operation
within the same Turn. The reducer's own comment describes the expected sequence: the model
returns a function call, the runtime executes it, then the result is supplied
to the model in the next request; an assistant message without further work can
complete the user turn.

Sources:

- [`tasks/regular.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tasks/regular.rs)
- [`session/turn.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/turn.rs)

### Finding for the foundation proposal

The draft currently has a durable `Session` and defines `ModelAttempt` as one
provider request, but it does not give the whole user request and its agent work
an explicit runtime boundary. Its drain algorithm also appears to close the
model attempt only after local tool execution. Those two lifecycles should not
be merged.

The proposal needs to decide whether `Turn` is a durable aggregate, a rebuildable
projection, or only a runtime grouping. It should not introduce the object merely
because Codex has one. A concrete consumer already exists, however: the TUI and
learner need to know whether one requested learning interaction is active,
completed, interrupted, or failed even when it contains several model samples.

Ordinary Codex rollout history does not create a durable logical-sampling or
adapter-attempt record. The optional rollout trace records adapter-level
inference attempts linked to the Codex Turn; it does not guarantee one record
per lower-level transport send and does not add a separate identity for the
surrounding continuation cycle or logical sampling operation. Those are
inferred from core control flow. The source still gives strong evidence about
lifecycle placement: provider-stream settlement is independent of and may
overlap local tool execution; it does not wait for the tool lifecycle.

The Repa draft must therefore decide whether `ModelAttempt` names one logical
sampling operation or one adapter inference-stream attempt. The smaller first
product boundary is probably the logical operation, with authentication retry,
transport fallback, and physical sends kept inside the adapter and optional
diagnostics. Either choice must derive settlement only from its model/transport
lifecycle rather than waiting for tool settlement. The intervals may overlap.

## Provider normalization is deliberately narrower than the product

Codex shares one Responses stream parser between HTTP SSE and WebSocket
transports, then lets core handle normalized completion, error, usage, and item
events. This is a useful adapter boundary. It is not evidence for a broad
provider-neutral fleet: this release has one Responses wire API, with providers
primarily varying endpoint, authentication, headers, and error behavior.

The parser also logs and drops some unknown or malformed events. Repa should
not inherit that tolerance for a complete tool call: once a provider claims a
tool item is complete, malformed input must surface a model-operation failure
rather than disappear before a terminal response is accepted.

Sources:

- [`codex-api/src/common.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/codex-api/src/common.rs)
- [`sse/responses.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/codex-api/src/sse/responses.rs)
- [`responses_websocket.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/codex-api/src/endpoint/responses_websocket.rs)
- [`model-provider-info/src/lib.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/model-provider-info/src/lib.rs)

## Modes are context and policy over the same loop

Codex represents collaboration mode as a mode kind plus settings such as model,
reasoning effort, and developer instructions. Plan behavior is injected into
the turn context. A few code paths also attach mode-specific behavior. For
example, `request_user_input` is normally Plan-only, though a feature can enable
it in Default; proposed-plan output is parsed into Plan items; and the separate
`update_plan` checklist tool is explicitly rejected in Plan mode.

Sources:

- [`config_types.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/protocol/src/config_types.rs)
- [`collaboration_mode_instructions.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/context/collaboration_mode_instructions.rs)
- [`request_user_input.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/handlers/request_user_input.rs)
- [`tools/handlers/plan.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/handlers/plan.rs)
- [`tools/src/tool_config.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/tools/src/tool_config.rs)
- [`session/inject.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/inject.rs)
- [`plan.md`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/collaboration-mode-templates/templates/plan.md)

This corroborates ADR-0002's one-loop decision. It does not corroborate every
local enforcement choice. In this Codex release, the broad prohibition on
mutation in Plan mode is substantially expressed as developer instructions;
it is not evidence that prompt-only enforcement is sufficient for Repa. Repa's
execution-layer deny remains a deliberate safety invariant, not something
copied from Codex.

Codex also does not enforce one uniform mode-snapshot boundary across every
consumer. Plan output parsing and the checklist guard use the Turn context,
while request-user-input and idle injection can read current session mode. The
source supports one runtime loop, but ADR-0002's rule that Repa applies mode
changes only at explicit model-sampling boundaries remains a local consistency
decision rather than copied behavior.

## Input, steering, serialization, and interruption

Codex has three related serialization boundaries. App-server start, steer, and
interrupt requests pass through a per-thread FIFO/exclusive request queue. Most
core operations enter a bounded in-process `Submission` channel with one
consumer. A long-running regular Turn is then spawned as a task rather than
blocking that consumer. `turn/steer` is a special path: it does not re-enter the
core Submission channel, but updates the active Turn's input queue under the
active-turn mutex.

The wider session identity may be shared by a root thread and subagent threads,
so none of these is one global lock for the whole agent tree. Different child
threads may work concurrently while each resident thread has at most one
running task.

At the app-server boundary, steering requires an expected Turn identity; the
lower core API can make that check optional. Accepted input is appended to a
process-local queue. `run_turn` drains it only at explicit
safe boundaries, and a hook can still block it before it enters canonical
history. Interrupting a task cancels the active work and clears pending steering
for that turn.

Sources:

- [`session/mod.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/mod.rs)
- [`session/input_queue.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/input_queue.rs)
- [`turn.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/app-server-protocol/src/protocol/v2/turn.rs)
- [`turn_processor.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/app-server/src/request_processors/turn_processor.rs)
- [`request_serialization.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/app-server/src/request_serialization.rs)

The source-level invariant is smaller than the Repa draft:

```text
at most one running turn task for one resident thread runtime
app-server steering is preconditioned on the expected active turn
eligible new input may enter history at a sampling boundary after hooks
interrupt cancels owned in-flight work
```

The app-server does not acknowledge `turn/interrupt` merely when cancellation
is requested. It waits until it observes the terminal aborted event. This is a
stronger acknowledgement than “cancel signal accepted,” but it does not prove
all lifecycle hooks, pending-input cleanup, or durable flushing have finished;
those occur later and persistence errors may still be logged rather than
returned.

The queue itself is not durable. A process crash can lose input that has not
yet entered persisted history. Even app-server `turn/start` can return an
in-progress turn after the operation has reached only the in-process submission
channel. Codex therefore does not establish durable input admission, visibility
sequencing, and idempotent retry as a general harness requirement. Repa may
still choose those guarantees, but they need a concrete failure scenario and
consumer rather than the word “production.”

Three meanings must remain distinct:

```text
accepted into a live input queue
history-visible after hooks, and therefore eligible for context selection
actually included in one logical sampling operation after filtering,
truncation, or compaction
```

The initial user request submitted from the terminal client already has a
durability consumer: once the interface has acknowledged a substantial request,
silently losing it on restart is poor behavior. The smallest solution is to
commit the user item and its Turn before starting model work. That does not
require a general admitted/visible inbox, retry protocol, or durable steering
queue in the first implementation. A history sequence establishes eligibility,
not proof that every later model request saw the item.

The first implementation must nevertheless state its steering guarantee. It
can either guarantee only the initial request and disclose that acknowledged
mid-Turn steering may be lost on process failure, or persist acknowledged
steering through an `admitted -> visible` transition or an equivalent atomic
mechanism. Codex proves that the stronger guarantee is not universal; it does
not decide which product behavior Repa should promise.

## History persistence is not in-flight recovery

Codex persists selected conversation items and turn lifecycle events. Approval
requests, stream deltas, transient errors, and several live execution events are
not persisted in ordinary rollout history. Pending approvals are held in an
in-memory map of one-shot response channels.

The local thread writer treats JSONL rollout history as replay authority and
SQLite as rollout-derived thread metadata and query projection. It flushes
accepted JSONL data before updating SQLite so the index does not get ahead of
history. Startup backfill and read repair can reconstruct the corresponding
thread rows from rollouts; they do not rebuild every table in the state
database. There is no transaction across JSONL and SQLite, so the journal may
lead the projection. The file flush also does not claim power-loss durability.

The JSONL-before-SQLite order applies to accepted live appends, not every lazy
metadata path as a global invariant. Canonical conversation history is also
updated in memory before persistence is attempted; an append error is logged
and does not roll the live history back. Repa's `visible` transition, if defined
as atomically durable, would therefore be a deliberately stronger guarantee.

This is a sensible ordering rule for Codex's dual storage design, but it creates
repair and reconciliation machinery that Repa does not need when SQLite is the
only machine-state authority.

Sources:

- [`rollout/src/policy.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/rollout/src/policy.rs)
- [`state/turn.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/state/turn.rs)
- [`live_writer.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/thread-store/src/local/live_writer.rs)
- [`rollout/src/state_db.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/rollout/src/state_db.rs)
- [`rollout/src/recorder.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/rollout/src/recorder.rs)
- [`thread_lifecycle.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/app-server/src/request_processors/thread_lifecycle.rs)

Reattaching to a resident live thread and reconstructing after process loss are
different operations. After process loss, Codex creates a new runtime from
rollout history: conversation history, prior settings, a reference turn context,
world-state baseline, context-window chain, and selected token information. It
does not restore the active task, provider stream, pending approval, or an
ambiguous external side effect. A stale `InProgress` Turn with no live runtime
may be projected to clients as `Interrupted`; that projection does not append a
durable `TurnAborted` fact or resume execution. This distinction matters:

```text
durable history and resumable conversation
!=
durable workflow engine with exactly-once side effects
```

The foundation proposal currently designs much of the second system before a
first learning-domain effect needs it. Codex currently operates with useful
history reconstruction while keeping selected live coordination process-local;
that is evidence that the guarantees can be separated, not proof that Repa must
choose the same boundary.

## Tool and approval lifecycle

Codex builds the visible tool catalog and runtime context for each sampling
step. Tools whose definitions support parallel calls may overlap; others pass
through an exclusive gate. This flag is not a read/write effect classifier:
shell supports parallel calls despite being side-effectful.

Cancellation behavior is tool-specific rather than uniformly propagated. Shell
tries to terminate its process, while apply-patch and MCP paths can have their
local future aborted without passing the same token through the underlying
effect. When policy requires approval, it is requested before the protected
runtime attempt, though the UI item may already have started. App-server clients
receive a server-initiated request and return a decision before the command or
file-change item settles.

Sources:

- [`tools/parallel.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/parallel.rs)
- [`tools/registry.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/registry.rs)
- [app-server approvals](https://learn.chatgpt.com/docs/app-server#approvals)

The live tool runtime uses process-local synchronization, cancellation state,
and pending approval channels. It does not maintain a durable effect receipt
and reconciliation protocol for every tool call. A post-tool hook can reject
the tool result after the tool itself has already completed, which is an
explicit reminder that “result accepted by the continuation” and “effect
occurred” are separate facts.

Codex does not consistently separate a current decision from reusable
authorization. An ordinary session approval stores the same decision in an
in-memory approval cache, while command-policy amendments and remembered MCP
approval create separate policy/config changes. Those changes authorize a
future class of calls; they do not prove that the present call ran or succeeded.

Repa's draft `allow_scope` similarly decides the current request and creates a
reusable authorization in one value. If the first slice does not support
remembered authorization, that outcome should be removed or deferred. If it is
later supported, the resulting grant needs its own trusted matcher and audit
fact. The draft already keeps effect receipts separate, and it should continue
to do so.

The code adds a complete model tool-call item to history before scheduling the
tool future, then adds the output only after the future completes. This is an
ordering invariant, not a fail-closed write-ahead guarantee. A successful local
rollout append is flushed, but append failure is logged and execution continues.
During prompt normalization, missing function/custom/local-shell results receive
a synthetic `aborted` output; missing tool-search output becomes an empty
completed result. These synthetic values repair model input shape. They do not
establish whether a side effect occurred and are not persisted as recovery
facts.

Two concrete cases make the gap visible:

- `apply_patch` is not transactional across all hunks. A later failure can
  leave an earlier file change committed, and the returned delta records the
  committed prefix or marks itself inexact.
- sandbox denial may cause a whole command to be retried with different
  authority. The first attempt may have performed partial work before denial;
  the retry is a second execution attempt under the same logical call.

For MCP, the handler does not pass the turn cancellation token through the
remote call, and a timeout cannot prove that the remote system performed no
effect. The client can also reinitialize and repeat `tools/call` after a
recognized expired-session response. Ordinary MCP metadata does not carry a
general Codex call-id idempotency key, so one logical call can have more than
one physical attempt without a generic deduplication contract.

Additional sources:

- [`stream_events_utils.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/stream_events_utils.rs)
- [`context_manager/normalize.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/context_manager/normalize.rs)
- [`handlers/apply_patch.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/handlers/apply_patch.rs)
- [`handlers/mcp.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/handlers/mcp.rs)
- [`handlers/shell/shell_command.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/handlers/shell/shell_command.rs)
- [`apply-patch/src/lib.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/apply-patch/src/lib.rs)
- [`tools/orchestrator.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/orchestrator.rs)
- [`tools/sandboxing.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/tools/sandboxing.rs)
- [`mcp_tool_call.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/mcp_tool_call.rs)
- [`rmcp_client.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/rmcp-client/src/rmcp_client.rs)

Repa should preserve that semantic distinction. It should not infer that the
Codex implementation proves Repa needs a durable six-outcome tool state machine
for every local call. A concrete effect boundary may justify idempotency or
reconciliation. It has a durable receipt only when the authoritative executor
can return a verifiable identifier; risk by itself cannot create one. Read-only
context tools do not need effect receipts.

The current foundation draft also needs an internal correction independent of
Codex: it classifies `indeterminate` as a settled terminal outcome while later
allowing reconciliation to turn it into success. Either effect uncertainty is
nonterminal, or reconciliation appends a distinct superseding fact. A terminal
union cannot simultaneously promise `settled -> no transition` and mutate the
same settlement later. Sandbox retries additionally show that one logical tool
invocation can have multiple execution attempts, but a child attempt record
should be introduced only if the first implemented tool actually retries.

If Repa promises that a durable invocation record precedes an effect, that
write must be a fail-closed barrier: persistence failure prevents executor
entry. Cancellation is likewise only a request to stop; the final outcome is
chosen after cleanup or effect reconciliation. A logical invocation may be
reported as cancelled only when the runtime has a basis for “no authoritative
effect,” not merely because its task future was aborted.

This cancellation rule and the draft's richer outcome taxonomy are deliberate
Repa guarantees, not Codex contracts. Codex can collapse user decline and other
operational rejection, and it can synthesize an aborted model result without
proving that a remote effect did not occur.

## Context and reproducibility

Codex records a `TurnContextItem` baseline once per real user turn and after
mid-turn compaction. It records full or patch `WorldStateItem`s at its normal
context boundaries; sampling-boundary change detection is additionally used
when the `DeferredExecutor` feature is enabled. The context includes such values
as working directory, workspace roots, model, collaboration mode, approval
policy, sandbox policy, date, and timezone. These records provide resume and
context-diff baselines. They do not reproduce the exact request-scoped
environment, capability roots, tool catalog, or instruction files.

Source: [`session/mod.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/mod.rs)

The ordinary history does not persist an exact copy of every compiled provider
request. The optional diagnostic rollout trace stores request payloads and
non-delta response summaries/output items; it is richer evidence, not a
wire-exact stream capture.

Codex's persisted `TurnContextItem` is a resume baseline recorded once per real
user turn and again after mid-turn compaction, not a request snapshot. The live
`StepContext` and exact tool catalog are rebuilt for each sample. A compacted
item stores replacement history and a window-chain checkpoint so recovery can
load the latest surviving checkpoint and replay only the suffix. The runtime
replaces memory first, then appends the compacted item, world-state baseline,
and turn context in separate fail-open writes. A crash can leave a prefix that
replay must tolerate. This is conversation reconstruction, not an atomic
context bundle or in-flight provider continuation.

Additional sources:

- [`step_context.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/step_context.rs)
- [`compact.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/compact.rs)
- [`rollout_reconstruction.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/rollout_reconstruction.rs)

Repa must retain an immutable learning-provenance cut for each logical sampling
operation that can choose a learning action. Whether that cut is a separate row
or fields attached to `ModelAttempt` is a storage choice. At minimum it names
the learner projection and policy revisions used. A session/history sequence
shows which items were eligible; proving actual request inclusion additionally
requires selected message/source references or an attempt input cut.

Exact provider-request capture can remain an opt-in sensitive diagnostic
facility. A learning provenance cut, a conversation compaction checkpoint, and
a diagnostic request capture must not all be named `ContextSnapshot`.

## Finite rollout budgets

When the under-development feature is enabled and configured, Codex accumulates
weighted output and non-cached input usage across a root thread and its child
threads. On the normal path it checks exhaustion only after a completed response
reports usage. Missing usage skips the check, the threshold can be overshot, and
an already exhausted budget is not a pre-dispatch gate for the next Turn. It is
a code-enforced accounting guard, not a strict token ceiling.

Sources:

- [`rollout_budget.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/rollout_budget.rs)
- [`session/rollout_budget.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/rollout_budget.rs)
- [`config/mod.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/config/mod.rs)
- [`features/src/lib.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/features/src/lib.rs)
- [`session/mod.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/src/session/mod.rs)
- [`tests/suite/rollout_budget.rs`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/core/tests/suite/rollout_budget.rs)

This still exposes a genuine omission in the Repa proposal. An open-ended
continuation loop needs at least one finite code-enforced guard with a stated
scope and visible terminal reason. The first design may bound logical sampling
operations, tool calls, elapsed time, tokens, or a combination. Codex does not
establish a strict per-Turn token ceiling as the universal minimum.

## Source architecture is not a template

Codex's root contributor guidance says that `codex-core` has become bloated
because adding new behavior there was easier than extracting the proper library
boundary, and explicitly asks contributors to resist adding more code to it.

Source: [`AGENTS.md`](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/AGENTS.md)

This is useful evidence for Repa's reference policy:

- copy a tested invariant only when the same problem exists;
- do not copy package topology as proof of good architecture;
- do not build an app-server, protocol generator, compatibility bridge, or
  diagnostic graph before the product has the corresponding consumer; and
- keep learning semantics out of low-level provider and rendering code without
  concentrating every remaining responsibility in one generic core package.

## Comparison with OpenCode and the current proposal

| Concern | OpenCode `v1.17.18` | Codex `rust-v0.144.1` | Repa draft consequence |
|---|---|---|---|
| Conversation execution | One process-local runner/drain per session | Bounded submission loop and at most one running task per thread runtime | Keep single-lane turn execution; do not require a workflow engine |
| User-level turn | Mostly inferred from message/run structure in current research | Explicit `Turn` with status and typed items | Add a deliberate user-level interaction boundary |
| Model sampling | Stream reduced into durable message parts | Logical operation with adapter-level attempts inside a Turn | Keep separate from tool/effect settlement |
| Modes | One loop with prompt, tools, and permission policy | One loop with context/settings plus small code gates | ADR-0002 remains supported |
| Steering | Emerging durable admission in V2; active path partly process-local | Process-local queue with app-server expected-turn precondition | Durable inbox is optional, not baseline dogma |
| Pending approval | Suspended execution, application request | In-memory one-shot channel, app-server request/response | Execution-layer authority is stable; durability is product-specific |
| History | Structured session projection | Rollout JSONL plus metadata/index and typed app projection | Keep SQLite as sole Repa authority; avoid dual-store copying |
| Tool effects | Durable part states, but recovery remains incomplete | Live runtime and sandbox/approval; no general effect receipt | Introduce receipts only for a real effect boundary |
| Context | Turn-bound tool materialization and message history | Turn context/world state; richer diagnostic trace is optional | Persist learning projection provenance, not every prompt byte by default |
| Resource bound | Not yet central in completed source study | Optional post-response rollout accounting guard | Define a finite continuation guard, its scope, and terminal reason |

## Stable patterns across the references

The two implementations support a modest harness pattern, not a universal
framework architecture:

```text
one ordinary Turn-driving task at a time per resident conversation runtime
one user-level turn may contain multiple model samples
provider events are reduced before becoming product state
complete tool calls have stable correlation identity
tool execution feeds a later model sample
permissions are enforced at execution, not by the renderer
cancellation belongs to the active owner
modes are policy/context over one loop
durable history is distinct from live stream state
```

Everything beyond this list needs a local consumer and failure case.

## Consequences for the foundation proposal

These are review findings, not accepted replacements.

### Keep

- process-local serialization of one active Repa conversation Turn, with
  steering linearization defined separately;
- separate provider events, durable interaction state, and UI updates;
- stable tool-call correlation and execution-layer authorization;
- learning projection provenance in model context;
- SQLite as the sole authoritative machine store; and
- one loop with mode policy profiles.

### Repair before approval

1. Add and define the user-visible Turn boundary separately from
   `ModelAttempt`.
2. Define the `ModelAttempt` boundary and derive its terminal state only from
   model/transport outcomes, not local tool settlement.
3. Add a finite continuation guard with an explicit scope and exhaustion
   outcome.
4. Specify the first educational fact and its correction semantics, as already
   identified by the independent Pro review.

### Simplify or defer

- a separate admitted/visible state machine and exact-retry identity for
  ordinary interactive input; the initial user item can still be written
  synchronously before execution;
- durable pending approval when no restart consumer exists;
- general effect receipt and reconciliation for read-only tools;
- exact compiled prompt snapshots for normal operation;
- parallel tool execution; and
- a durable `AgentRun` or workflow aggregate.

### Preserve as an explicit stronger guarantee only if justified

Repa may deliberately exceed Codex in a narrow learning-domain boundary. For
example, an accepted answer attempt and the learner projection update derived
from it may be committed atomically and made correctable. That guarantee is
valuable because it serves the product loop directly. It should not require
turning every transient runtime coordination detail into durable business
state.

## Final assessment

Codex does not reveal one authoritative “agent harness paradigm.” It reveals a
set of convergent boundaries surrounded by product-specific compromises.

The most useful design principle for Repa is therefore:

```text
persist educational meaning and enough interaction history to continue;
keep live coordination process-local until a demonstrated recovery need makes
it product state.
```

That principle reduces both blank-page risk and defensive over-engineering. It
also keeps the reason for building the harness intact: the learning loop, not a
generic claim to production-grade agent infrastructure.
