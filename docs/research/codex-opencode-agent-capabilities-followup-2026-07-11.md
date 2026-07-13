# Codex and OpenCode follow-up: completion, goals, memory, and delegation

Date: 2026-07-11

Status: source-derived research observation. This note does not approve a
production architecture, a memory system, automatic goal continuation, model
routing, or multi-agent execution.

Current scope note (2026-07-11): the reusable memory pattern is a small current
index plus lazy retrieval and raw source history. Its earlier translation into
activity, evidence, and learner projection is not current guidance. See
[`agent-memory-patterns-for-learning.md`](./agent-memory-patterns-for-learning.md).

## Source boundary

This study uses the two pinned, read-only references:

- OpenCode `v1.17.18`, commit
  `b1fc8113948b518835c2a39ece49553cffe9b30c`, under
  `.reference/opencode`;
- Codex `rust-v0.144.1`, commit
  `44918ea10c0f99151c6710411b4322c2f5c96bea`, under
  `.reference/codex`.

The comparison concerns behavior, ownership, failure, and recovery. It does not
adopt either product's package layout, prompts, UI vocabulary, or implementation
language. The earlier runtime comparison remains the baseline:
[`codex-rust-v0.144.1-runtime-contracts.md`](./codex-rust-v0.144.1-runtime-contracts.md).

## Questions

The follow-up asks four related questions:

1. What lets an agent say that one task has actually finished?
2. How does a long-running execution goal survive several turns and a restart?
3. How is useful information carried into later tasks without becoming false
   authority?
4. What do parent and child agents share, and what makes delegation safe enough
   to be useful?

The fourth question is included because delegation can affect all three earlier
questions. A child report may help a task finish, influence a goal, or enter
later context, but it does not become learning evidence merely because another
agent produced it.

## Executive findings

1. **Execution completion is not outcome verification.** Codex and OpenCode both
   wait for the model stream and required tool continuations to settle before
   ending ordinary work. Neither system can generally prove that the model's
   final real-world claim is true.
2. **Codex Goal is a thread execution goal.** It persists an objective, status,
   usage, and optional token budget for one thread and can start another turn
   while active. Its completion and blocked claims are still accepted mainly on
   model assertion. OpenCode has no equivalent long-running goal aggregate in
   the pinned version.
3. **Codex Memories are generated projections over prior rollouts.** They keep
   task-level source references and support lazy retrieval, but their factual
   distinctions are primarily prompt-enforced. OpenCode instead has durable
   human-authored instructions plus same-session compaction; neither is a
   learner-state authority.
4. **Both multi-agent designs isolate child work in a separate conversation.**
   OpenCode emphasizes small explicit task packets and configurable
   agent/model/permission profiles. Codex additionally supports selected history
   forking, persistent parent-child threads, status-bearing result delivery, and
   a shared rollout budget. Both normally return model-authored reports, not
   provenance-complete educational evidence.

## Reliable completion of one task

### What both systems establish

OpenCode's ordinary Session loop does not stop merely because the latest text
sounds final. It checks the latest assistant finish reason, unresolved tool
calls, and whether newer user input exists. A provider `stop` accompanying a
tool call still requires the tool/result continuation.

Codex similarly treats provider completion as the end of one model operation,
not automatically the end of the user-visible Turn. It drains started tool
work, observes whether tool results or new input require another model
operation, and only then ends the Turn-driving task.

Representative pinned sources and tests:

- OpenCode:
  - `.reference/opencode/packages/opencode/src/session/prompt.ts:1088-1129`
  - `.reference/opencode/packages/opencode/test/session/prompt.test.ts:785-878`
  - `.reference/opencode/packages/opencode/src/session/processor.ts:216-253,331-419`
- Codex:
  - `.reference/codex/codex-rs/core/src/session/turn.rs:2019-2141,2458-2484`
  - `.reference/codex/codex-rs/core/src/session/turn.rs:297-318,372-417`

This supports a narrow runtime statement:

```text
provider settled
+ every admitted tool has a terminal result
+ no required continuation remains
+ no unhandled runtime error remains
-> execution may end
```

It does not support this stronger statement:

```text
assistant said the goal is complete
-> the claimed external or educational outcome is true
```

### Failure and partial effects

Both references can return a tool failure to the model so it can explain,
repair, or choose another action. Neither has a universal transaction around
arbitrary effects. A patch can partly apply, a command can do work before a
sandbox retry, and a remote tool can time out after the remote side acted.

Cancellation therefore means that the owner stopped waiting or requested
cleanup; it does not prove that no effect occurred. A late result must not
overwrite a terminal or replacement Turn, but suppressing that result also does
not reverse an external effect.

Representative sources and tests:

- OpenCode:
  - `.reference/opencode/packages/opencode/src/session/processor.ts:539-597`
  - `.reference/opencode/packages/opencode/src/session/tools.ts:102-130`
  - `.reference/opencode/packages/opencode/test/session/processor-effect.test.ts:769-964`
- Codex:
  - `.reference/codex/codex-rs/core/src/tasks/mod.rs:829-907`
  - `.reference/codex/codex-rs/core/tests/suite/abort_tasks.rs:21-154`

### Restart boundary

Both systems persist enough completed history to reconstruct a conversation.
Neither resumes the original provider stream, tool future, or uncertain
external effect after process loss. OpenCode can repair model-visible history by
supplying an interrupted result for a formerly pending tool. Codex can project
stale in-progress work as interrupted. Neither automatically proves or repeats
the old effect.

### Consequence for Repa

Repa needs two separate questions:

1. Did the runtime finish this Turn correctly?
2. What does the resulting evidence support about the learner or the requested
   real-world outcome?

An explanation may complete normally without assessing mastery. A claim that a
learning fact, plan, or external artifact changed requires an authoritative
result. Model prose is not that result.

## Long-running goals

### What Codex Goal owns

Codex stores at most one Goal per thread. The record includes an objective,
status, optional token budget, token usage, elapsed active time, and timestamps.
An active Goal can cause another Turn to begin after the previous Turn becomes
idle.

The observed statuses are:

```text
active
paused
blocked
usage_limited
budget_limited
complete
```

User or application actions can pause, resume, edit, complete, block, or clear
the Goal. Runtime errors and usage limits can stop automatic continuation.
Budget exhaustion is an accounting guard checked at boundaries, not a precise
pre-token hard stop, so a Turn may exceed the configured budget before it
settles.

Representative pinned sources and tests:

- `.reference/codex/codex-rs/ext/goal/src/spec.rs`
- `.reference/codex/codex-rs/ext/goal/src/runtime.rs`
- `.reference/codex/codex-rs/ext/goal/src/accounting.rs`
- `.reference/codex/codex-rs/state/src/runtime/goals.rs`
- `.reference/codex/codex-rs/app-server/tests/suite/v2/thread_resume.rs:1363-1955`

Objective, status, usage, and timestamps persist in SQLite. Source and tests
support resume behavior, although the study did not find one complete
process-kill/cold-start test proving every automatic continuation case.

### Completion remains model-asserted

The model-facing Goal tool permits the model to mark a Goal `complete` or
`blocked`. Instructions ask the model to verify work and require repeated
blocking evidence, but the executor does not store requirements or independent
verification evidence. A valid tool call can therefore mark the Goal complete
even if the claimed file or other outcome does not exist.

This makes Goal useful execution coordination, not a general proof-of-done
system.

### OpenCode is not equivalent

OpenCode's pinned `todowrite` tool stores a current Session task list. Its plan
mode stores a plan artifact and controls a mode transition. Compaction may emit
an `Objective` heading in a generated summary. None of these owns an active
long-running objective with pause/resume, automatic continuation, resource
accounting, and terminal states.

Representative sources:

- `.reference/opencode/packages/opencode/src/tool/todowrite.txt`
- `.reference/opencode/packages/schema/src/session-todo.ts`
- `.reference/opencode/packages/opencode/src/tool/plan.ts`
- `.reference/opencode/packages/core/src/session/compaction.ts`

### Consequence for Repa

Codex Thread Goal and a Repa learning goal must not be one concept:

| Concern | Execution goal | Learning goal |
| --- | --- | --- |
| Scope | one continuing agent thread | learning across activities and Sessions |
| Completion | requested work is reported done | learner-owned intent plus appropriate evidence or confirmation |
| Stop reasons | pause, error, usage, budget, blocked | may change the next learning move without failing the long-term goal |
| Authority | user/application plus constrained model tool | learner intent; evidence affects projections, not ownership |

Repa may later reuse explicit pause/resume, visible resource usage, and bounded
automatic continuation. It must not infer goal attainment because a Tutor
finished explaining or called a completion tool.

## Memory and later context

### Codex two-stage memory projection

Codex Memories run asynchronously for eligible completed root tasks:

1. Phase 1 filters one prior rollout and asks a model to produce a detailed raw
   memory plus a compact task summary.
2. Phase 2 selects a bounded set of those outputs, writes inspectable memory
   artifacts, and runs a consolidation agent to update global summaries and
   optional reusable resources.

The generated records retain task IDs, rollout paths, timestamps, and usage
metadata. Memory-assisted answers can cite memory files and rollout IDs. This
makes the projection traceable back to a task, but not necessarily to one exact
supporting sentence.

Representative pinned sources:

- `.reference/codex/codex-rs/memories/README.md`
- `.reference/codex/codex-rs/memories/write/src/phase1.rs`
- `.reference/codex/codex-rs/memories/write/src/phase2.rs`
- `.reference/codex/codex-rs/memories/write/src/storage.rs`
- `.reference/codex/codex-rs/memories/read/src/citations.rs`
- `.reference/codex/codex-rs/state/src/runtime/memories.rs`

Prompts tell the extraction and consolidation models to prefer original user
messages, tool results, and verified outcomes; preserve uncertainty; handle
conflicts; and disclose when a claim came only from memory. These distinctions
are important but remain mostly prompt-enforced. The stored memory and summary
fields are model-generated strings, not typed observations, reports, evidence,
and inference.

Frequently and recently used memory is more likely to remain selected. That is
a retrieval policy, not a confidence measure. A frequently reused error can
also survive longer.

At later startup, Codex injects a small global memory summary and directs the
model to search more detailed memory only when relevant, then return to the
original rollout when necessary. The useful reusable pattern is:

```text
small navigation summary
-> relevant detailed memory
-> original source when the claim matters
```

### OpenCode has different mechanisms

OpenCode does not have an equivalent cross-task automatic memory pipeline in
the pinned version. It has two different mechanisms:

- durable, human-authored instruction files such as `AGENTS.md`, read as rules
  with their source paths;
- Session compaction, which keeps recent original messages and replaces older
  model-visible history with a generated summary while leaving the old durable
  history stored.

Representative sources:

- `.reference/opencode/packages/opencode/src/session/instruction.ts`
- `.reference/opencode/packages/opencode/src/session/compaction.ts`
- `.reference/opencode/packages/core/src/session/compaction.ts`
- `.reference/opencode/packages/opencode/src/session/message-v2.ts`

Compaction supports conversation continuity. It does not provide sentence-level
sources or typed evidential roles and must not become long-term learner state.

### Consequence for Repa

Repa can reuse the retrieval shape while preserving stronger semantics:

```text
immutable source-linked activity and result
-> correctable evidence interpretation
-> rebuildable current learning projection
-> small context overview with references
-> bounded source read when needed
```

A learner report such as “I know this” remains a report. A wrong answer may be
an observation under stated conditions. “Mastered” is a fallible interpretation
that must cite support and be correctable. No generated summary, memory note,
frequency counter, or child-agent report can silently change these roles.

## Delegation and multi-agent work

### Comparison

| Question | OpenCode | Codex |
| --- | --- | --- |
| Child context | fresh task prompt; same workspace and project instructions | configurable full, recent, or no parent turns; internal noise filtered |
| Model/profile | child agent may declare model, prompt, limits, and permissions | inherited by default; limited-history forks may choose another model or role |
| Result | final child text becomes task result | final text arrives with sender, task path, and status-bearing parent notification |
| Continue later | resume child Session by task ID | retain/reload child thread and send follow-up work |
| Budget | flexible per-agent model choice; no equivalent shared tree guard found in this slice | root and children share one rollout budget |
| Process loss | child history remains; live background registry does not resume | child thread history and spawn edges can be reloaded; in-flight work still does not continue |

Representative pinned sources and tests:

- OpenCode:
  - `.reference/opencode/packages/opencode/src/tool/task.ts`
  - `.reference/opencode/packages/opencode/src/agent/agent.ts`
  - `.reference/opencode/packages/opencode/src/agent/subagent-permissions.ts`
  - `.reference/opencode/packages/opencode/test/tool/task.test.ts`
- Codex:
  - `.reference/codex/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs`
  - `.reference/codex/codex-rs/core/src/tools/handlers/multi_agents_common.rs`
  - `.reference/codex/codex-rs/core/src/agent/control/spawn.rs`
  - `.reference/codex/codex-rs/core/tests/suite/rollout_budget.rs`

OpenCode's practical strength is a small parent/child Session model with
configurable agent profiles and explicit task prompts. Codex's practical
strength is selectable history transfer, explicit thread-tree lifecycle, result
provenance, and shared budget accounting. These are source observations, not a
benchmark showing that one product completes tasks better.

### Consequence for Repa

The smallest justified future helper shape is:

```text
parent selects one bounded, independent read-only task
-> explicit packet names goal, sources, allowed actions, and expected output
-> child returns conclusion, source references, unknowns, and status
-> parent rechecks consequential claims under current learning state
-> only the runtime-owned learning command may change learner state
```

Different models may be useful for extraction and decision, but the existing
staged-model experiment already shows that a fresh typed handoff is safer than
assuming portable shared provider history. No custom multi-agent framework is
approved by this source study.

## Candidate experiments

These are proposed labs, not accepted production requirements.

### 1. Completion and interruption matrix

Use a recorded model-event fixture and a controlled local tool. Cover:

- plain text completion;
- assistant text claiming completion before provider completion;
- tool call accompanied by a provider `stop` reason;
- tool error followed by a final explanation;
- cancellation before execution, during execution, and after an effect but
  before durable settlement;
- process exit after user admission, model dispatch, call persistence, and
  effect execution.

The oracle separates Turn outcome, tool outcome, and verified external or
learning consequence.

### 2. Execution goal versus learning goal

Use Codex app-server with a mock model and temporary state:

- prove active automatic continuation;
- let the model mark a goal complete without producing its requested artifact;
- cross a small token budget and measure overshoot;
- pause, stop the process, restart, and resume.

Mirror the semantic case in Repa: a completed explanation leaves the learning
goal active unless learner intent or appropriate evidence changes it.

### 3. Contradictory memory replay

Replay this fixed history through a small deterministic learning projection:

1. learner reports knowing the chain rule;
2. a later answer applies it incorrectly;
3. a generated summary incorrectly says it is mastered;
4. the learner retracts the earlier report;
5. the process restarts and context is compacted.

The oracle requires immutable original items, typed report/observation/
interpretation roles, append-only correction, rebuildable current projection,
and source invalidation.

### 4. Bounded delegation comparison

Run the same source-grounded learning analysis in three shapes:

1. one model reads and decides;
2. a fresh helper receives only a typed task/source packet;
3. a helper receives selected conversation history.

Measure task correctness, evidence completeness, unsupported claims, input and
output tokens, elapsed time, cancellation behavior, and attempted learning
writes. Use one model first; only add cheap/strong model routing if the single
model fixture demonstrates a need.

## Reduction boundary

This study supports four bounded directions:

1. distinguish execution completion from verified outcome;
2. distinguish thread execution goals from learner-owned learning goals;
3. use summaries as navigation over source-linked, correctable state rather
   than as learning truth;
4. permit only bounded helper reports until an experiment shows that delegation
   improves a real learning task.

It does not justify a general workflow engine, autonomous cross-session goal
runner, conversational-memory database as learner state, multi-agent framework,
provider router, or plugin platform.
