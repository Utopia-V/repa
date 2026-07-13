# Agent memory patterns and the learning boundary

Date: 2026-07-11

Status: Informative source synthesis. It identifies reusable memory mechanics;
it does not choose a production learning-state schema.

Clarification (2026-07-13): lightweight workspace conventions, file-layout
notes, expression preferences, collaboration habits, and working summaries may
remain model-managed files. They do not need to become typed Learning-System
state merely because they survive Sessions. The model may initiate their
creation or revision through a scoped filesystem capability; the host still
owns path confinement, revision checks, loading bounds, and receipts.

## Question

Can the memory systems in Codex, Claude Code, and Hermes supply the long-term
memory needed by a learning agent, and what still belongs to the learning
layer?

## Source observations

### Codex

The pinned Codex reference keeps raw Session data and runs an asynchronous
two-phase memory pipeline. Phase 1 extracts bounded per-rollout candidates.
Phase 2 consolidates selected candidates into a local memory workspace. The
read path uses a small summary routinely and leaves detailed memories, rollout
summaries, and skills available for search when needed.

The pipeline handles selection, leases, retries, secret redaction, usage, and
consolidation. This is production memory infrastructure for a general agent. It
does not define course progress, review, or learner state.

Sources:

- [Pinned Codex memory pipeline README](https://github.com/openai/codex/blob/44918ea10c0f99151c6710411b4322c2f5c96bea/codex-rs/memories/README.md)
- local pinned checkout: `.reference/codex/codex-rs/memories/README.md`

### Claude Code

Claude Code separates several kinds of durable context:

- explicit `CLAUDE.md` instructions with directory scope;
- a bounded auto-memory entry file loaded at startup;
- more detailed topic files read only when relevant;
- local JSONL Session transcripts that can be resumed; and
- compaction of active context without treating the compacted summary as
  deletion of the raw transcript.

The memory files are visible and editable. A user can correct or delete them.
This makes memory a practical context aid rather than an opaque claim store.

Sources:

- [Claude Code memory](https://code.claude.com/docs/en/memory)
- [Claude Code sessions](https://code.claude.com/docs/en/sessions)
- [Claude Code context window and compaction](https://code.claude.com/docs/en/context-window)

### Hermes Agent

Hermes keeps a bounded `MEMORY.md` and `USER.md` in the routine prompt while
storing full Sessions separately in a searchable FTS5 index. Its memory tools
can add, replace, and remove entries. Optional approval can guard memory writes.

The important split is again small routine memory versus searchable raw
history. The memory text does not replace the complete Session store.

Sources:

- [Hermes memory guide at the reviewed commit](https://github.com/NousResearch/hermes-agent/blob/3b2ef789dfcf92f5b7b18c08c59d25948e50857f/website/docs/user-guide/features/memory.md)
- [Hermes memory manager at the reviewed commit](https://github.com/NousResearch/hermes-agent/blob/3b2ef789dfcf92f5b7b18c08c59d25948e50857f/agent/memory_manager.py)

## Convergent mechanics worth reusing

The three systems differ in implementation, but support the same useful
pattern:

```text
complete local history
        +
small routinely loaded context
        +
lazy retrieval of detailed history
        +
visible correction or deletion
```

This pattern avoids loading every previous interaction while retaining a path
back to the original source. A summary is a retrieval and continuation aid. It
does not become proof that an event happened exactly as summarized.

## What the learning system adds

General agent memory can remember that a conversation mentioned a course. It
does not by itself maintain the facts needed for learning-native continuation:

- the active goal and course;
- the broad route and current material position;
- read or explained ranges;
- due review and unresolved local gaps;
- assignments and deadlines; and
- actual task or review results that still affect future action.

These facts need stable product meaning because the Tutor consumes them without
waiting for a model to rediscover them from prose on every Session. Their source
details can still point into raw Sessions, tool results, artifacts, and material
revisions.

The inverse distinction matters too. A preferred report shape, directory
convention, explanation style, resource path, working assumption, or
maintainer-facing decision summary usually does not require deterministic
arithmetic or a legal domain transition. Such content can stay in a visible,
editable workspace file and be interpreted by the model when relevant. It is
promoted into Course, Agenda, Learner Record, or Tutor-policy authority only
when a real consumer needs stronger invariants and an explicit domain command
imports its source.

## Proposed three-level use

| Level | Typical contents | Use |
|---|---|---|
| Soft workspace context | Small scoped entry containing file conventions, expression/collaboration preferences, resource paths, and working notes | Advisory context loaded within a strict budget; detailed files remain lazy |
| Current learning view | Active goal, course position, near-term due items, deadlines, and accepted learning policy | Typed projection used to select the next learning move |
| On-demand detail | Relevant material range, earlier explanation, attempt, review, or assignment history | Retrieved for the active move |
| Raw local history | Complete Sessions, tool results, artifacts, and material versions | Audit, correction, and recovery of detail |

Both routine contributions should be small and correctable, but they retain
different authority. SQLite remains authoritative for typed Learning state.
A soft-memory file is itself an editable advisory source, not a textual route
around Course, Agenda, evidence, deadlines, permissions, or other machine
state. Markdown course material and generated artifacts retain their own source
roles.

## Model-initiated soft-memory writes

The LLM may decide that a lightweight fact is worth preserving and initiate an
ordinary create, patch, or delete operation. The system does not need to
understand the note's full semantics. It binds the canonical workspace root,
relative path, expected content revision, Session/Turn/tool identity, safety
policy, and result receipt. A conflicting user edit fails closed and is reread;
there is no silent last-write-wins merge.

At sampling time, the host may automatically load one small entry for the
current directory/home scope. Other notes are found by path, title, tags, or
text search and opened only when needed. Every injected contribution remains
labelled with path, digest, scope, and loading reason. Current learner intent,
typed policy, domain legality, and safety outrank model-written advisory text.

## Deliberate omissions

The first implementation does not need to copy Codex's two-phase memory
pipeline, Claude Code's file hierarchy, or Hermes's Markdown limits. It first
needs a consumer for each current learning fact.

It also does not need a `MemoryManager`, preference ontology, vector store,
background consolidation worker, or database table for every workspace note.
Ordinary scoped file read/write/search plus a bounded loader is sufficient;
any later index should be thin and rebuildable from the files.

It also does not derive a detailed learner model from every Session. If a later
decision needs the exact conditions of an attempt or the content of an earlier
explanation, the system retrieves the source instead of trusting a compressed
portrait.
