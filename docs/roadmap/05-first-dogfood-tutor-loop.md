# First dogfood Tutor loop

Date: 2026-07-12

Status: Learning-first vertical integration trace completed on 2026-07-12 under
ADR-0011. Complete generic-harness parity is not an exit criterion.

## Outcome

Produce the first Repa command that a learner can actually run. One invocation
admits natural-language input, executes a bounded Tutor Turn through a model,
persists the response, and lets later model samples and Sessions consume
relevant program-owned learning state.

The milestone is an application spine, not a miniature course platform. It is
complete when later course, material, route, review, and assignment behavior
has a real runtime to enter; those domains are not pre-scaffolded here.

"Complete" applies only to this trace. The one-shot CLI and thin AI-SDK loop do
not establish a complete generic harness. Missing generic behavior is added
only when a learning-product path consumes it, preferably through an existing
library or narrow reference-derived adaptation rather than new Repa machinery.

## Vertical path

```text
terminal input
-> durable Session / admitted Turn
-> per-sample Tutor context compilation
-> AI SDK provider stream and ordinary tool transport
-> Repa-owned learning-state transition when one is requested
-> next sample with revised learning context
-> durable assistant response and terminal Turn
-> process close/reopen
```

## Required behavior

1. The runtime records one admitted learner input before provider work.
2. Every model sample receives a newly compiled Tutor context contribution.
3. Ordinary Agent tool transport can carry a requested learning-state change;
   its durable meaning and authority remain system-owned.
4. A retained, source-grounded learner instruction can commit once and return a
   correlated model-visible result.
5. The next model sample sees the new learning revision and active steering.
6. The final Tutor response is persisted as Session history.
7. Reopening the database does not repeat the effect; a later Turn receives the
   still-active contribution automatically.
8. Provider or tool failure produces a truthful terminal outcome instead of a
   fabricated assistant response.
9. Model and tool continuation remain finite.

## First interface

The first interface is a plain terminal command. Configuration supplies the
database path, Session identity, provider model, timezone, and policy revision.
The command accepts one learner message, streams or prints the Tutor response,
and exits. Reusing a Session exercises transcript continuation; starting a new
Session against the same learning database separately exercises system-state
continuity without importing the old transcript.

## Verification

- A deterministic AI SDK mock-model test covers the complete sample -> learning
  tool -> revised sample -> persisted response path.
- A reopen test covers semantic replay and later context contribution.
- A bounded real-provider smoke confirms provider compatibility and records
  model, step count, latency, token usage, and estimated cost when credentials
  are available.
- `bun run check` remains green.

## Non-goals

- no course graph or universal learning ontology;
- no full-screen TUI;
- no general plugin or MCP host;
- no background autonomous goal runner;
- no parallel tools or multi-agent execution;
- no arbitrary mid-Turn crash continuation; and
- no claim about long-term teaching quality from one smoke trace.

## Exit gate

The milestone exits only when the command is runnable against a real provider
and a second invocation can consume durable learning state without the learner
restating it. Passing only isolated storage tests does not exit the phase.

## Exit evidence

The production command is `bun run repa`.

Deterministic runtime tests establish:

- a provider response with `finish=stop` and a complete learning tool call is
  executed rather than discarded;
- the retained steering changes the next model sample's context revision;
- user, tool, and assistant Session items persist across close/reopen;
- a second Turn receives the still-active steering without another write; and
- a provider error terminates the model operation and Turn as failed without
  inventing assistant output.

Two initial real `deepseek-v4-flash` command invocations used the same Session
and SQLite database:

1. The first Turn retained the exact learner instruction
   `请在今天晚上 23:00 前都不要自动考我`, used two model samples, produced a
   Tutor response, and consumed 1,779 tokens with an estimated upper cost of
   `$0.000277`.
2. The second Turn reopened the database, consumed the active instruction,
   continued teaching object references without testing, used one model sample,
   and consumed 1,157 tokens with an estimated upper cost of `$0.000197`.

The resulting Session roles were `user -> tool -> assistant -> user ->
assistant`, with two terminal Turns and one retained steering effect. The full
repository check passed 98 tests and 716 assertions.

A third invocation then used a **new Session id** against the same database and
asked to continue the topic without restating the retained no-test instruction.
The new Session contained only `user -> assistant`; its first immutable context
cut nevertheless contained the still-live learning-wide instruction from the
old Session. DeepSeek-V4-Flash obeyed it while teaching, used one model sample
and 1,176 tokens, and had an estimated upper cost of `$0.000224`. This is the
actual cross-Session check; the first two invocations established only
cross-process continuity inside one Session.

Known limits remain explicit: only one kind of learning-wide state is currently
projected; same-Session history is loaded without compaction; concurrent
processes sharing one database are not supported; material reading and course
position are not yet production features; and mid-Turn crash continuation is
not claimed. These are not evidence that the Learning System can omit ordinary
Agent behavior; they delimit the thin trace that was proved.
