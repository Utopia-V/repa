# Tool lifecycle contract findings

Date: 2026-07-10

Status: Research synthesis and candidate lifecycle. The exact production union
and persistence schema remain open until the recovery slice is complete.

OpenCode reference commit:
`b1fc8113948b518835c2a39ece49553cffe9b30c` (`v1.17.18`)

## Question

What lifecycle lets a model propose tools, lets the runtime authorize and
execute them, and lets Session recovery distinguish “nothing happened” from
“an effect may already have committed”?

This is not primarily a registry-design question. The critical boundary is the
transition from untrusted model output to an owned side effect, followed by a
durable and non-duplicating settlement.

## Sources traced

The main sources for this slice are:

- [`packages/core/src/tool/tool.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/tool/tool.ts)
- [`packages/core/src/tool/registry.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/tool/registry.ts)
- [`packages/core/src/tool/AGENTS.md`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/tool/AGENTS.md)
- [`packages/core/src/session/runner/llm.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/runner/llm.ts)
- [`packages/core/src/session/runner/publish-llm-event.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/runner/publish-llm-event.ts)
- [`packages/core/src/session/message-updater.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/message-updater.ts)
- [`packages/core/src/permission.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/permission.ts)
- [`packages/core/test/session-runner.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-runner.test.ts)
- [`packages/core/test/session-runner-tool-registry.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-runner-tool-registry.test.ts)
- [`packages/core/test/session-runner-tool-events.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-runner-tool-events.test.ts)
- [`packages/core/test/application-tools.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/application-tools.test.ts)
- [`packages/opencode/src/session/processor.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/processor.ts)
- [`specs/v2/session.md`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/specs/v2/session.md)

The newer V2 code is still explicitly incomplete in cancellation settlement
and post-crash continuation recovery. Its implemented behavior is evidence for
mechanisms, not a finished design to copy.

## What OpenCode currently does

### It separates the canonical tool from one turn's materialization

A canonical tool owns its input codec, output codec, executor, model-output
conversion, and optional catalog permission alias. For one provider turn, the
registry materializes a fixed set of definitions and closures.

If a same-name registration is removed or replaced after advertisement but
before settlement, the captured materialization rejects the call as stale. It
does not silently run whatever implementation currently occupies that name.

This prevents a time-of-check/time-of-use error:

```text
model saw definition A
registration changes to definition B
call named A must not execute B
```

Repa needs the invariant, not OpenCode's process/Location overlay machinery.

### It records a complete call before local execution

The V2 runner publishes a durable `Tool.Called` event before it starts the local
child fiber. The call carries Session, assistant-message, call, tool, input, and
execution-owner identity.

The ordering is essential:

```text
receive complete call
-> durably record call
-> authorize and execute
-> durably settle
```

A runtime that performs the effect first and writes “running” afterward cannot
distinguish an absent effect from a crash in the write gap.

### It keeps catalog visibility and execution authorization separate

Whole-tool deny rules can remove a definition before the model sees it. Actual
tools still resolve resources from their arguments and call the permission
service immediately before the relevant side effect.

The registry cannot authorize argument-dependent effects because it does not
yet know the canonical target. The leaf tool owns the ordering among:

```text
input validation
target resolution
authorization
side effect
output validation
```

Resolution and validation may precede authorization, but no protected side
effect may occur before the permissions governing that effect have allowed it.

OpenCode's tool guidance also warns against catching all causes: expected typed
failures may become model-facing tool errors, while interruption and runtime
defects must remain distinguishable to the runner.

### It starts local calls eagerly and settles them once

The V2 runner starts every recorded local call in a child fiber and awaits all
of them after the provider stream closes. Publication is serialized even when
execution is concurrent.

Provider results, local results, schema failures, tool failures, defects,
permission decline, and interruption are lowered through different paths. The
projection itself currently exposes only:

```text
pending -> running -> completed | error
```

That projection is sufficient for the current UI, but it loses distinctions
that matter to recovery and learning-domain truth.

### It does not silently replay abandoned side effects

Before a later run, V2 finds prior tool calls still projected as `pending` or
`running` and durably marks them failed with “Tool execution interrupted.” It
then continues from that history instead of automatically running them again.

This is safer than blind replay. It is still not enough for a learning-domain
mutation: a prior process may have committed the domain transaction and crashed
before Session settlement. “Interrupted” describes the runtime observation; it
does not prove that no effect occurred.

## State is not one linear enum

Permission or a user question can suspend a running executor, possibly more
than once. Treating `awaiting_permission` as a mandatory linear tool state would
couple authorization UX to execution lifecycle and make transitions such as
running -> waiting -> running awkward.

The smaller model has two orthogonal parts.

### Execution phase

```text
assembling
  raw provider input may still be incomplete; no executor exists

recorded
  complete immutable call and advertised-definition identity are durable;
  no side effect has begun

executing
  the captured executor owns the call and may currently be blocked

settled
  one terminal outcome is durable and no further transition is legal
```

`assembling` may remain a live projection until it ends or is interrupted. The
important durable boundary is `recorded`: it must precede side effects.

### Active blockers

Permission requests and learner questions are separate Session facts linked by
`sessionID`, `assistantMessageID`, and `callID`. The TUI can derive “awaiting
approval” from an active linked request while the tool remains in `executing`.

This preserves a reusable execution state machine without pretending that a UI
prompt is authorization itself.

## Candidate legal transitions

```text
assembling -> recorded
assembling -> settled(rejected or interrupted before a complete call)

recorded -> executing
recorded -> settled(rejected or cancelled before execution)

executing -> settled(success, failure, declined, cancelled, or indeterminate)

settled -> no transition
```

Every durably recorded invocation must acquire exactly one terminal settlement.
Repeated delivery of the same terminal provider event may be recognized
idempotently, but it must never execute the effect or append a second outcome.

A provider `callID` is only one component of invocation identity because some
providers can reuse call IDs across turns. Session correlation therefore uses a
runtime-generated invocation ID or a compound identity such as
`sessionID + assistantMessageID + callID`.

The exact TypeScript terminal union is deferred. At minimum the durable reason
must distinguish:

| Outcome | Meaning |
|---|---|
| success | A validated result exists; an optional effect receipt identifies a committed mutation |
| rejected | Execution did not begin: invalid input, unknown tool, stale definition, or policy block |
| declined | The user refused the requested authority or interaction |
| failure | The executor, output validation, or result retention failed |
| cancelled | Cooperative interruption established that the operation did not need further execution |
| indeterminate | The process cannot prove whether an external or domain effect committed |

`failure` and `cancelled` must not automatically imply “no effect.” Where a
partial or committed effect is possible, recovery promotes the call to
`indeterminate` until it can reconcile an effect receipt or inspect the target.

## Permission consequences

Policy denial and user refusal are different product events.

- A policy-blocked call may return a bounded error to the model so it can choose
  an allowed action.
- A user's decline yields control to the user. The agent must not immediately
  continue and reinterpret the refusal as a routine tool error to route around.
- A correction attached to a refusal becomes explicit user steering, not hidden
  executor metadata.
- Removing a definition from the catalog reduces bad proposals, but execution
  authorization remains mandatory for calls that reach the runtime.

The permission slice will specify request and reply persistence. This slice
only fixes their relationship to a tool call.

## Execution ownership

Provider-hosted and Repa-hosted tools have different trust and recovery
properties.

```text
provider-hosted
  the provider reports that it executed the call; Repa observes the outcome

runtime-hosted
  Repa validates, authorizes, executes, persists, and can propagate cancellation
```

Provider-hosted mutation cannot be used for learning state, local files, review
schedules, or other Repa-owned durable facts. It would bypass local permission,
transaction, and provenance boundaries. If provider-hosted tools are supported
at all, they remain non-authoritative inputs unless a later adapter establishes
an equally strong contract.

## Output has three consumers

A successful tool may need three related but distinct outputs:

```text
domain result
  complete structured value used by application code

model result
  bounded content returned to the next model attempt

rendering or artifact reference
  files, media, or large output retained outside the prompt payload
```

OpenCode validates encoded output, constructs structured/model content, and
bounds large output before settlement. Its tests also ensure binary content is
not duplicated in durable success payloads.

Repa should preserve the separation. A model-friendly sentence is not the
authoritative domain result, and a failed output-store write after a side effect
cannot be treated as proof that the side effect failed.

## Interruption behavior

Interruption propagates through both provider streaming and local execution.
The runtime should:

1. stop accepting new deltas and calls for the interrupted attempt;
2. signal cooperative cancellation to active local tools;
3. give already-finishing tools a bounded chance to publish their real result;
4. durably settle every remaining nonterminal call;
5. close partial assistant content;
6. return control without silently starting another provider attempt.

Calls that never began can settle as rejected or cancelled with no effect.
Calls interrupted during execution require tool-specific knowledge before the
runtime can claim that no effect occurred.

## Crash recovery for learning-domain mutation

Consider a learning tool that accepts an observation and revises current
structured state:

```text
Session records call C as complete
-> tool validates and begins
-> SQLite commits learning occurrence O
-> process crashes
-> Session never records success for C
```

Marking C as an ordinary failure would leave Session and learning truth in
conflict. Re-executing C could duplicate O.

The smallest credible recovery anchor is an operation identity shared with the
domain transaction:

1. A runtime invocation ID, not a bare provider call ID, is unique for the
   domain command.
2. The learning transaction commits its occurrence and an effect receipt under
   that key atomically.
3. Session success links to the receipt after the handler returns.
4. On recovery, a nonterminal call first reconciles by operation key.
5. If a receipt exists, Session settles from the recorded result without
   repeating the effect.
6. If no receipt exists and the tool guarantees a single SQLite transaction,
   no domain commit occurred; the runtime may cancel or explicitly retry under
   the same key.
7. If the target is external and no reliable receipt exists, the call becomes
   indeterminate and is never automatically replayed.

This is not full event sourcing and not a distributed transaction. It is an
idempotency and reconciliation boundary for side-effectful tools.

Whether Session settlement and the domain receipt should sometimes share one
SQLite transaction remains open. The operation-receipt path is still needed for
external tools and for effects whose execution cannot occur inside a short
Session transaction.

## Thin learning-semantic fixture

The lifecycle should be tested with an ordinary learning-domain mutation, not
only an echo tool.

### Normal path

1. The model emits a complete call proposing an accepted learning observation.
2. Session durably records the immutable call and advertised definition
   identity.
3. Runtime validation resolves the referenced activity and evidence source.
4. Applicable policy permits the operation without blocking routine use.
5. The call enters execution.
6. One learning-domain transaction writes the observation, its provenance, and
   an effect receipt keyed by the runtime invocation.
7. Output validation produces a structured result and a bounded model result.
8. Session settles the call successfully and links the effect receipt.
9. Rebuildable learner inference can now consume the committed observation.

### Required counterexamples

- The model repeats the same call within one assistant attempt. No duplicate
  observation is inserted. Reuse of a provider call ID in a later attempt does
  not collide with the earlier runtime invocation.
- A same-name tool is replaced after it was advertised. The old call is stale;
  the new handler does not receive it.
- The user declines the operation. No domain transaction occurs, the call is
  durably declined, and control returns to the learner.
- A provider-hosted call claims to update learner state. The claim is not an
  authoritative domain mutation.
- The learning transaction commits and the process crashes before Session
  success. Recovery finds the receipt and settles without inserting again.
- An external effect is interrupted without a receipt. The call is marked
  indeterminate rather than retried or described as having no effect.

## Deliberate differences from OpenCode

Repa should not copy:

- the four-state UI projection as the complete semantic lifecycle;
- eager unbounded concurrent local execution before workloads justify it;
- automatic lowering of all permission and cancellation outcomes to generic
  tool errors;
- “mark every old running call interrupted” as proof that no domain effect
  committed;
- Location/application registration overlays without corresponding product
  requirements;
- provider-hosted mutation of local authoritative state;
- broad catch-all failure conversion that erases defects or interruption;
- a second executable tool representation for plugins or future integrations.

The first executor may run calls serially in provider order. Parallel read-only
execution can be added only after call limits, ordering, and mutation conflicts
have an observed need and an explicit policy.

## Accepted findings versus open design

This slice establishes the following invariants for later contracts:

1. A complete call is durable before side effects begin.
2. The executor is the exact definition advertised for that provider attempt,
   or the call is rejected as stale.
3. Permission requests are linked blockers, not the source of tool truth.
4. Every recorded invocation settles exactly once; no terminal invocation can
   execute again.
5. Runtime, provider, and domain execution ownership are explicit.
6. A nonterminal call after crash is reconciled before any replay.
7. Learning-domain mutation uses a stable runtime invocation identity and
   receipt; a bare provider call ID is insufficient.

Still open:

- exact TypeScript names and payloads;
- whether incomplete raw tool input is durable or only finalized on
  interruption;
- the initial concurrency policy and call limits;
- the transaction boundary between Session settlement and local domain
  receipts;
- tool-specific reconciliation hooks for file, shell, Anki, and other external
  effects;
- progress-event persistence and output-retention layout.
