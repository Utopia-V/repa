# Message and model-event contract findings

Date: 2026-07-10

Status: Research synthesis and candidate runtime vocabulary. This document does
not yet accept a production schema.

OpenCode reference commit:
`b1fc8113948b518835c2a39ece49553cffe9b30c` (`v1.17.18`)

## Question

What is the smallest provider-neutral message and streaming vocabulary that can
support a recoverable terminal agent without confusing model output, session
history, UI updates, and learning evidence?

The earlier roadmap called this a `RunEvent` vocabulary. Source tracing shows
that name is too broad. The normalized OpenCode events describe one model
provider attempt. A complete agent run also includes permissions, local tools,
domain transactions, interruption, and possibly another model attempt. Calling
both things a run would erase an important ownership boundary.

The candidate name for the adapter output is therefore `ModelEvent`. The exact
TypeScript union remains deliberately undecided until the tool-lifecycle and
recovery slices are complete.

## Sources traced

The findings below come from these pinned files:

- [`packages/llm/src/schema/events.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/llm/src/schema/events.ts)
- [`packages/llm/src/schema/messages.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/llm/src/schema/messages.ts)
- [`packages/schema/src/session-message.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/schema/src/session-message.ts)
- [`packages/schema/src/session-event.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/schema/src/session-event.ts)
- [`packages/opencode/src/session/processor.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/processor.ts)
- [`packages/core/src/session/runner/publish-llm-event.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/runner/publish-llm-event.ts)
- [`packages/core/src/session/message-updater.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/message-updater.ts)
- [`packages/core/test/session-runner-tool-events.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-runner-tool-events.test.ts)
- relevant stream, failure, interruption, and replay cases in
  [`packages/core/test/session-runner.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-runner.test.ts)

The focused upstream test command was also located. It could not execute in the
read-only reference checkout because dependencies are intentionally absent
(`effect` was the first missing package). No dependency installation was made
under `.reference/`. The result is not treated as a passing or failing behavior
test; the tests are used here as readable upstream specifications corroborated
by the reducers that implement them.

## Four planes, not one event union

The runtime needs at least four conceptually separate planes.

| Plane | Owner | Meaning | Durability |
|---|---|---|---|
| Model stream | model adapter | Normalized output from one provider attempt | Deltas are transient; terminal metadata may be recorded through Session |
| Session | session runtime | What the user, assistant, permission flow, and tools did | Durable enough for resume, inspection, and recovery |
| UI projection | terminal surface | Current renderable projection and live progress | Rebuildable; live deltas need not be journaled |
| Learning domain | learning core | Accepted occurrences, evidence, obligations, and rebuildable learner inference | Domain facts are transactional; inference is rebuildable |

These planes can refer to one another through stable IDs. They must not share a
single catch-all `Event` type or a single source-of-truth table.

A provider text block is not automatically a durable learning fact. A Session
tool call proposing a learning update is not that update either. The learning
domain changes only after a validated domain operation commits successfully.

## Provider messages are not Session messages

OpenCode's provider-facing `Message` schema contains the roles and content
forms accepted by a model API: system, user, assistant, tool, text, media,
reasoning, tool calls, and tool results. Its Session message schema instead
contains product identity, ordering, timing, model choice, tool lifecycle,
cost, error, and projection state.

Repa should preserve the same separation:

```text
Session projection + compiled context
        -> provider message adapter
        -> provider request
```

Provider messages are request artifacts. They may be rebuilt when a provider,
context policy, or API format changes. Session facts must not be reduced to the
lowest common denominator of a provider API.

The boundary also prevents retrieved materials from acquiring privileged
instruction authority. System-owned compiled context can use a privileged
channel. Source documents, web content, and tool output remain sourced,
untrusted content even when they are relevant to the learning task.

## Findings from the normalized stream

OpenCode normalizes provider output into these families:

```text
step start
text start / delta / end
reasoning start / delta / end
tool-input start / delta / end
tool call
tool result / tool error
step finish
response finish
provider error
```

Several details are structural rather than naming preferences.

### Stable block identity is required

Text, reasoning, and tool-input blocks can be interleaved. Every start, delta,
and end therefore needs an identity stable for the life of that block. A
reducer cannot safely append all text to one mutable assistant string.

### A delta is live progress, not a durable fact

The V2 Session design publishes deltas for live consumers but durably records
full values when a block ends. Replay uses the full ended value and does not
need to replay every token fragment.

This suggests the initial Repa invariant:

```text
live UI may consume deltas
durable Session state records closed content blocks
```

On interruption or provider failure, an already-started partial block is
closed with its accumulated value before the assistant attempt is settled.
Otherwise visible content would disappear after restart.

### Tool input has two representations

Streamed tool input begins as raw text and becomes parsed, validated input only
when a complete tool call is emitted. The runtime must not pretend partially
received JSON is an executable command.

### Provider settlement is not Session settlement

`step-finish` and response `finish` settle provider work and usage. They do not
by themselves mean the whole agent run has ended. A local tool may still be
running, a permission request may be waiting, or another model attempt may be
required after a tool result.

This is the decisive reason not to call the normalized provider union
`RunEvent`.

### Provider-hosted tools require an explicit distinction

Some providers execute tools themselves and stream their result or error.
Those result events should not be confused with settlement of a Repa-owned
local or learning-domain tool. Both can appear in a normalized stream, but they
have different execution owners and recovery behavior.

## Candidate `ModelEvent` responsibility

The eventual adapter contract should be capable of representing:

```text
content block start / delta / end
optional provider continuation or reasoning block start / delta / end
tool input start / delta / end
complete parsed tool call
provider-hosted tool result or error
provider step settlement and usage
provider response settlement
provider failure
```

This is a responsibility list, not an accepted set of discriminant strings.
The implementation should preserve provider metadata only through an explicit
escape hatch and should not make downstream code branch on arbitrary provider
payloads.

Hidden reasoning is not learning evidence. If a provider requires opaque or
encrypted continuation data, Session may retain the minimum data needed to
continue that provider conversation. The learning domain must not treat that
data as an observation about the learner or as an explanation that can be
audited.

## Candidate Session message responsibility

The Session layer needs to represent at least:

```text
ordered user messages and attachments
ordered assistant content blocks
assistant attempt identity and settlement
tool-call identity and lifecycle
permission wait and decision references
model/provider identity needed for continuation
interruption and failure status
links to committed domain operations
```

`Message` and `MessagePart` should be projections over Session facts, not a
second learning database and not a verbatim provider transcript.

The exact tool states are deferred to the next source slice. This slice already
establishes one invariant: every accepted call identity must eventually have
exactly one terminal Session settlement, including calls that are denied,
cancelled, interrupted, fail validation, fail execution, or have an unknown
outcome after a crash.

## Lifecycle invariants to preserve

1. A content block starts at most once, accepts deltas only while active, and
   ends at most once.
2. A tool-input block cannot become executable until a complete call with
   parsed input exists.
3. Stable call IDs correlate provider fragments, Session state, permission,
   execution, and any domain transaction.
4. Live deltas never become the sole recovery source.
5. Interruption and provider failure durably close accumulated partial content.
6. Provider response completion does not imply completion of local tools or the
   Session run.
7. A tool result is attributed to its execution owner; provider-hosted and
   Repa-hosted execution are not silently conflated.
8. Session text, model confidence, and hidden reasoning do not by themselves
   create learning evidence.
9. A committed learning occurrence links back to its Session/call provenance
   without making Session replay the learning-state authority.

OpenCode's V2 publisher treats duplicate starts, deltas before starts, tool-name
changes for one call ID, and duplicate settlements as implementation defects.
Repa should reject the same illegal histories rather than repairing them with
best-effort concatenation.

## Thin learning-semantic trace

The contract must carry a normal long-running learning session, not merely a
generic echo or file tool. The following fixture intentionally avoids assuming
a complete curriculum ontology.

### Preconditions

- A course has already been initialized with a coarse global map.
- SQLite contains accepted prior occurrences and a rebuildable learner
  projection.
- The reference learner is cooperative and simply enters `开始学习`.

### Trace

1. The user input becomes an ordered Session user message. It is a fact about
   the interaction, not yet a learning occurrence.
2. Context assembly reads current goals, obligations, review pressure, coarse
   course structure, accepted occurrences, and relevant source material.
3. The provider adapter compiles those sources into provider messages while
   retaining provenance and keeping retrieved material unprivileged.
4. The model emits explanatory text and a complete call proposing the next
   learning activity. The text is Session content; it changes no learner state.
5. Permission and domain validation succeed. The learning tool commits the
   activity occurrence in a SQLite transaction and returns its durable ID. The
   Session call links to that commit and settles successfully.
6. The Tutor asks for an independent response. That prompt is another Session
   content block.
7. The learner's response is durably admitted as a Session user message.
8. Evaluation produces a proposed observation with the answer reference,
   conditions, and uncertainty. A validated learning-domain transaction commits
   the accepted observation/evidence and records its provenance.
9. The learner projection is rebuilt or updated from committed domain records.
10. The next context assembly sees the changed projection. The Tutor's next
    action must be allowed to differ from the action it would choose without
    that evidence.

The important boundary is not the particular learning tool name. It is:

```text
model proposal
-> authorized and validated domain operation
-> committed learning fact
-> rebuildable inference
-> changed future context and action
```

### Counterexamples

- The assistant writes “已经掌握” in text. No learning state changes.
- The model emits a learning tool call, but permission is denied. No learning
  occurrence is committed.
- A tool validates unsuccessfully or crashes before its transaction commits.
  No domain fact is inferred from the attempted call.
- A document says to mark the topic complete. It remains untrusted source
  content and cannot directly authorize a state transition.
- The domain transaction commits but the process crashes before the Session
  records tool success. Recovery must reconcile the call by operation identity;
  it must not blindly execute the domain command again.

The last case is intentionally unresolved here. It becomes a required fixture
for the session-serialization and recovery slice.

## Deliberate differences from OpenCode

Repa should preserve the invariants above without copying the following
upstream structure:

- simultaneous legacy and V2 message/event systems;
- a general event-sourced Session architecture before recovery needs justify
  it;
- coding-specific synthetic, shell, snapshot, patch, and revert parts;
- compaction events before context pressure is measured;
- hidden reasoning as a user-facing explanation or trusted domain record;
- every token delta as a durable database row;
- provider step boundaries as the definition of an agent run;
- tool success as proof that a learning inference is correct.

## Consequences for subsequent foundation work

1. Rename the roadmap contract from provider-neutral `RunEvent` to
   provider-neutral `ModelEvent`.
2. Specify `Message` and `MessagePart` as Session projections, separately from
   provider request messages.
3. Design tool lifecycle around exactly-once terminal settlement and explicit
   execution ownership.
4. Design Session recovery and learning-domain transactions together around the
   crash-after-domain-commit case.
5. Keep the TUI projection replayable without journaling every model delta.
6. Use the thin learning trace and its counterexamples as contract fixtures
   before production implementation.

## Still unresolved

- The exact `MessagePart` union needed before attachments and provider
  continuation are implemented.
- Whether permission waiting is a tool state, a linked Session fact, or both.
- The complete local tool states for denial, cancellation, interruption, and
  unknown crash outcome.
- How Session settlement and a learning-domain transaction reconcile without a
  distributed transaction or duplicate domain effects.
- Which provider continuation metadata must survive restart.
- Whether the initial runtime needs explicit provider step events or only
  content, tool, usage, and terminal response events.
