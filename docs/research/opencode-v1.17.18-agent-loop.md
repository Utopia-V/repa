# OpenCode v1.17.18 agent-loop trace

Reference commit: `b1fc8113948b518835c2a39ece49553cffe9b30c`
Repository: <https://github.com/anomalyco/opencode/tree/b1fc8113948b518835c2a39ece49553cffe9b30c>

## Scope

This note traces the ordinary terminal prompt path far enough to identify reusable mechanisms and product-scale complexity. It is not a complete description of OpenCode and is not a design specification for Repa.

## End-to-end path

### 1. CLI selects and boots the TUI

[`packages/opencode/src/index.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/index.ts) registers `TuiThreadCommand` as the default command.

[`packages/opencode/src/cli/cmd/tui.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/cli/cmd/tui.ts) resolves the working directory, starts a worker, builds either an internal or network transport, validates a requested session, and starts the TUI layer.

For the normal local path, the TUI is a client of an embedded local server rather than a direct caller of the agent runtime. `createWorkerFetch` bridges SDK HTTP requests over worker RPC, and `createEventSource` forwards global events.

[`packages/opencode/src/cli/tui/worker.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/cli/tui/worker.ts) hosts the server, forwards `GlobalBus` events to the parent through RPC, and owns cleanup of project instances and server resources.

This client/server/worker boundary supports multiple OpenCode surfaces and isolation. It is not intrinsically required for a first single-process learning agent.

### 2. Prompt component creates or reuses a session

[`packages/tui/src/component/prompt/index.tsx`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/tui/src/component/prompt/index.tsx) guards concurrent submission, resolves agent/model/workspace state, creates a session when necessary, converts editor/file context into prompt parts, and calls `sdk.client.session.prompt(...)` for ordinary text.

The prompt input is cleared after dispatch. Session and response state arrive through synchronization/event paths rather than by letting the input component own model execution.

### 3. HTTP handler enters SessionPrompt

[`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts) validates the session and delegates the prompt payload to `SessionPrompt.Service`. The asynchronous route forks the prompt effect and publishes a durable session error on failure.

The transport layer does not implement the agent loop. It translates requests into the session application service.

### 4. SessionPrompt owns orchestration

[`packages/opencode/src/session/prompt.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/prompt.ts) creates the durable user message, updates session permission overrides, and enters a serialized session loop.

On each loop iteration it:

1. Reloads the projected, compacted message history.
2. Decides whether the last assistant turn already completed the conversation.
3. Handles queued subtask or compaction work.
4. Resolves the selected model and agent.
5. Creates and persists a new assistant message before streaming.
6. Creates a `SessionProcessor` handle for that assistant message.
7. Resolves the tools visible to this agent/model/session.
8. Builds system instructions and provider messages.
9. Calls `handle.process(...)` with model, messages, tools, permissions, and session identity.
10. Converts the processor outcome into `break`, `continue`, or a compaction request.

The loop continues when tool calls or other unfinished work require another provider turn. The stop condition is based on durable message/tool state, not merely on receiving a piece of assistant text.

### 5. LLM service normalizes runtime-specific streams

[`packages/opencode/src/session/llm.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/llm.ts) owns provider/model/session request concerns. It currently chooses between an AI SDK runtime and an experimental native runtime.

Both paths converge on the same `LLMEvent` stream. This prevents downstream session processing from depending on provider SDK event shapes. The normalization boundary is a reusable architectural idea; supporting two runtimes is OpenCode-specific scope.

### 6. SessionProcessor turns stream events into durable state

[`packages/opencode/src/session/processor.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/processor.ts) consumes `LLMEvent`s and updates assistant parts, text, reasoning, tool-call state, usage, finish information, errors, and status.

It also owns:

- explicit interruption handling;
- retry policy integration;
- tool-call completion/failure settlement;
- stream cleanup;
- overflow detection and compaction requests;
- conversion of terminal state into `continue`, `stop`, or `compact`.

This shows a valuable separation: provider stream decoding, durable session mutation, and loop control are related but not the same responsibility.

### 7. SessionTools bridges registered tools into the model runtime

[`packages/opencode/src/session/tools.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/tools.ts) asks the tool registry for the tools visible to the current agent/model/permission set and converts each definition into an executable AI SDK tool.

The execution context carries session, message, call, agent, abort signal, message history, metadata updates, and a permission callback. Execution invokes plugin hooks, runs the tool, attaches output metadata/files, and cooperates with the processor's tool-call state.

[`packages/opencode/src/tool/registry.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/tool/registry.ts) collects built-in and plugin tools, filters them for provider/model capabilities, applies agent permissions, and supplies final definitions.

The reusable idea is the separation between stable project-level tool definitions and per-turn executable tools enriched with runtime context.

### 8. Permissions are part of execution, not only UI

[`packages/opencode/src/permission/index.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/permission/index.ts) evaluates merged rulesets and either allows, denies, or publishes a permission request and waits for a reply. The TUI renders and replies to that durable request through the event/client boundary.

Tools request permission from their execution context. Therefore authorization remains enforceable when the same runtime is driven from a non-TUI client.

### 9. Events project runtime state back to the TUI

Session/message/tool/status/permission changes are published as events. The worker forwards global events; TUI synchronization state consumes them and renders the current projection.

The TUI is not the source of truth. It submits commands and displays projections of runtime/session state. This is the most important UI boundary to preserve.

## Architecture classification

### Mechanisms likely required by Repa

- Explicit message and content-part types.
- A serialized agent loop per active session.
- A provider-neutral stream event model.
- Explicit tool-call states and correlation IDs.
- Tool definitions separated from per-turn execution context.
- Cancellation propagated through provider and tool execution.
- Permission enforcement in the execution layer.
- Durable session mutations emitted as events.
- TUI as a projection and command surface, not the owner of agent state.
- Recovery behavior derived from persisted session/tool state.

### OpenCode product-scale mechanisms not assumed by Repa

- Embedded HTTP server, worker RPC, generated SDK, and multiple frontends.
- Effect service graph and its specific module conventions.
- AI SDK plus native LLM runtime selection.
- Broad provider compatibility and provider-specific transforms.
- Plugins, MCP, LSP, Git/worktree, snapshots, patching, sharing, sync, and accounts.
- Subagents and background jobs.
- Coding-specific tools and model-dependent edit-tool selection.
- Automatic compaction before basic session semantics are proven.
- Legacy/V2 compatibility bridges.

## Consequences for the first design

The first Repa runtime should be single-process and should not expose an HTTP/SDK boundary until a second real frontend requires one. It should still define a provider-neutral model-event stream so that model adapters, session persistence, and the TUI do not share provider-specific event shapes. This stream describes one provider attempt, not the complete agent run.

The first production contracts to investigate next are:

1. Message and part identity/ordering.
2. Provider-neutral model events.
3. Tool-call state transitions and interruption.
4. Session persistence/replay and serialized execution.
5. Permission request/reply semantics.

Learning-domain contracts should join the application flow after these runtime boundaries are understood, while the first actual product path remains a learning session rather than a generic coding/chat demo.

## Unverified areas

- The complete database transaction model for message/part updates.
- Crash recovery while a provider turn or tool call is in flight.
- Event replay ordering across all OpenCode frontends.
- The newer V2 session runner described in upstream architecture notes versus the legacy `SessionPrompt` path used by the traced HTTP endpoint.

These require separate source slices and must not be inferred from this trace.
