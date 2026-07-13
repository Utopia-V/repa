# Source revision and stale-reference experiment

Date: 2026-07-11

Status: Research observation for ALS-009. This document does not approve a
production session schema, URI format, hash algorithm, content-addressed store,
or retention policy.

## Question

If a learning record cites a local material passage and the material later
changes, what minimum meaning must the citation preserve?

This is a storage and reference-semantics question. No live model call was
required.

## Pinned reference observations

### OpenCode

Pinned OpenCode v1.17.18 stores completed tool input, structured state, content,
result, and optional output paths in the assistant session message.

Its current tool-output store:

- keeps an output inline when it is at most 2,000 lines and 50 KiB;
- writes larger complete output to a managed file and puts a bounded preview
  plus path in the tool result; and
- deletes managed output files older than seven days by default.

Its v1 session compaction path marks old completed tool results as compacted;
model-message reconstruction then substitutes `[Old tool result content
cleared]`. The stored part still carries its completed result state in the
studied implementation. The newer core compaction path similarly builds a
bounded summary projection from stored messages.

Relevant pinned sources:

- `.reference/opencode/packages/schema/src/session-message.ts`
- `.reference/opencode/packages/core/src/session/message-updater.ts`
- `.reference/opencode/packages/core/src/tool-output-store.ts`
- `.reference/opencode/packages/core/src/session/compaction.ts`
- `.reference/opencode/packages/opencode/src/session/compaction.ts`
- `.reference/opencode/packages/opencode/src/session/message-v2.ts`

The seven-day managed output path is an operational aid for oversized generic
tool results. It is not sufficient backing for a citation that may influence
learning months later. A bounded material window small enough to remain in the
session item has a different persistence shape.

### Codex

Pinned Codex rust-v0.144.1 explicitly persists `FunctionCallOutput` and
`CustomToolCallOutput` response items in rollout files. Its active context
manager can truncate function output payloads, and remote compaction can replace
old output bodies with a context-window marker.

Relevant pinned sources:

- `.reference/codex/codex-rs/rollout/src/policy.rs`
- `.reference/codex/codex-rs/protocol/src/models.rs`
- `.reference/codex/codex-rs/core/src/context_manager/history.rs`
- `.reference/codex/codex-rs/core/src/compact_remote.rs`

Both references therefore separate, to different degrees, the recorded tool
output from the smaller projection supplied to a later model call. Neither
reference automatically gives a learning-domain citation lifetime or source
revision policy.

## Deterministic lab

`labs/source-reference-anchor/` compares two candidate meanings:

1. **Live path reference** — resolve `uri#L2-L3` against whatever content is at
   the URI now.
2. **Observed item reference** — resolve a session-item identifier to the exact
   bounded tool result observed at the time, with origin URI, line range, and a
   revision marker.

The synthetic source began with:

```text
activation code: LANTERN-17
settling interval: 43 ms
```

It was then edited in place to:

```text
activation code: LANTERN-23
settling interval: 47 ms
```

Four tests passed:

1. the path-only reference silently returned the new values;
2. the observed-item reference survived JSON round-trip, returned the original
   values, and reported the origin revision as stale;
3. replacing old tool content in the active model projection did not change the
   durable observed item; and
4. a missing observed item failed closed instead of falling back to the live
   path.

The fixture uses SHA-256 only as a convenient deterministic revision marker.
That is not a decision that every source must be content-addressed.

## Minimal invariant exposed by the lab

A long-lived learning consequence must not cite only a mutable location.

It needs a route back to the content actually observed when the inference or
action was created. That route may be the original persisted message part,
tool-result item, artifact version, or another immutable observation. It must
also preserve enough origin information to say whether the current external
material still matches.

This yields two distinct questions:

```text
What did the agent observe then?
What does the source contain now?
```

Conflating them causes silent historical rewrites. Keeping them separate does
not mean copying the passage into a second learning-state authority. The
learning record can refer to the generic session item that already owns the
tool result.

## Interaction with compaction

Context compaction is a model-input policy, not automatically a retention
policy. A session may remove an old tool result from the next prompt while
still preserving the item needed for audit, correction, or learning evidence.

Conversely, recording only a temporary output path is not durable merely
because the current model can read it. If an item's content may back a
long-lived learning inference, its backing lifetime must be at least as long as
that inference's correction/audit lifetime, or the inference must clearly lose
its resolvable support.

The experiment does not decide whether every ordinary read deserves such
retention. The requirement applies when a source observation is promoted into
a durable learning-significant relation.

## Consequences for corrections and updates

- A changed course artifact does not make the historical observation false; it
  makes the origin stale relative to the current artifact.
- A new artifact version can generate a new observation and may supersede a
  curricular claim without erasing the old item.
- If the backing item is missing, the system should surface an unresolved
  reference rather than pretend the current file proves the old claim.
- Line numbers are useful origin metadata but are not immutable identity when
  a file changes.

These statements align with ADR-0003: the learning layer should refer to the
original message, attempt, tool result, or artifact version instead of copying
source content into another authority.

## Still unresolved

- which generic session item type is retained in Repa;
- whether origin revisions use a digest, filesystem metadata, artifact version,
  provider revision, or a combination;
- retention and garbage-collection rules;
- how PDF extraction, web pages, video transcripts, and database rows express
  stable regions;
- how much source text a compact audit surface displays; and
- how a source update invalidates derived course structure or future plans.

No universal source schema is justified yet. The invariant is narrower:
preserve the observed item, preserve origin/version provenance, and fail visibly
when either can no longer be resolved.
