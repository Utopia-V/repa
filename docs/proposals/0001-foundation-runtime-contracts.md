# Foundation runtime contracts

Date: 2026-07-10

Status: Partially accepted historical synthesis. The runtime defaults were
explicitly accepted by the maintainer on 2026-07-11 and promoted through
ADR-0005, ADR-0006, and ADR-0007. Its evidence/projection product path is
superseded as the current direction. Open learning-policy statements remain
historical proposals rather than defaults.

Post-benchmark note (2026-07-11): the runtime defaults remain accepted, but the
general evidence/projection path below did not pass ALS-015/ALS-016. It must not
be implemented as a complete production schema. A later deterministic-task
proposal also overemphasized gradable practice and is paused. The learning path
must be reconsidered from the full Tutor behavior recorded in
[`../foundation/02-what-the-tutor-does.md`](../foundation/02-what-the-tutor-does.md).

## Why this revision exists

The first draft correctly found several real harness boundaries, but it treated
future recovery mechanisms as though they all belonged in the first production
slice. Independent review and the Codex comparison exposed four concrete
problems:

- no user-visible Turn existed above provider requests and local tools;
- provider completion and local-tool completion were coupled incorrectly;
- a runtime receipt could prove execution identity without preserving the
  educational meaning required by ADR-0003; and
- durable inbox, permission, effect-reconciliation, and exact-context machinery
  were proposed before the product had a consumer for those guarantees.

This revision keeps the smallest complete agent loop and makes one
learning-significant result constrain it. It deliberately does not design a
durable workflow engine.

Inputs:

- [Accepted product origin](../foundation/00-product-origin.md)
- [ADR-0002: Modes are policy profiles](../decisions/0002-modes-are-policy-profiles.md)
- [ADR-0003: Learning state follows evidence](../decisions/0003-learning-state-follows-evidence.md)
- [Learning-task significance and scheduling](./0002-learning-task-significance-and-scheduling.md)
- [ChatGPT Pro review](../research/chatgpt-pro-foundation-review-2026-07-10.md)
- [Codex runtime-contract findings](../research/codex-rust-v0.144.1-runtime-contracts.md)

## Authority of this document

This proposal contains three different kinds of statement.

### Already accepted

- Repa owns one TypeScript/Bun agent harness.
- Modes contribute policy to one loop rather than creating separate runtimes.
- Learning reports, observations, evidence, inferences, and actions remain
  distinguishable.
- Routine, provenance-preserving learning updates are inspectable,
  correctable, reversible, and non-modal.
- Learning semantics must affect context and next-action selection.

### Accepted foundation defaults

- SQLite is the only authoritative machine store in the first implementation.
- One durable Turn groups one user request and the resulting agent work.
- One logical model operation is independent of local tool settlement.
- Live coordination remains process-local unless restart recovery has a current
  product consumer.
- Local learning writes and their tool settlement share one SQLite transaction.
- Every Turn has finite, code-enforced continuation limits.

These defaults were accepted and are recorded normatively in ADR-0005,
ADR-0006, and ADR-0007.

### Still open

- the general admission rule for educational meaning inferred after an
  interaction;
- LLM-authored task-to-target alignment outside a reviewed domain source;
- the first retention model and task-ranking policy; and
- persistence guarantees for mid-Turn steering and future external effects.

No type, table, or package is implied for the open concepts.

## Historical product-bearing contract slice

The paused production proposal tried to make this observable:

~~~text
accepted learning goal and current context
-> Tutor selects a formal learning task
-> learner produces a source-linked result under known conditions
-> the Learning Domain admits a correctable evidence interpretation
-> the learner projection changes
-> the next context names the new projection
-> the Tutor selects a materially different next action when appropriate
~~~

The path may span more than one Turn. For example, one Turn can present a task
and a later Turn can carry the answer. A Turn is an interaction boundary, not a
claim that a complete learning activity fits in one model response.

The required counterexample is equally important:

~~~text
learner asks an ordinary clarification
-> Tutor answers
-> interaction history changes
-> no learning result, evidence interpretation, review obligation,
   or curricular relation changes
~~~

This remains useful as history and as a source of bounded runtime tests. It is
not the current product sequence because it represents teaching too narrowly.

## Boundary map

~~~text
Terminal user
      |
      v
Terminal interaction surface
      |
      v
Session (long-lived conversation)
      |
      +-- Turn (one request and the resulting agent work)
               |
               v
         single agent loop
          /      |       \
         v       v        v
   context    model     tool runtime
   compiler   adapter      |
      ^                    +-- permission policy
      |                    +-- Learning Domain
      |                              |
      +---------- SQLite <-----------+
~~~

Provider decoding and terminal rendering remain domain-independent. Learning
semantics enter through context selection, task/result tools, domain
transactions, action selection, and review surfaces.

## Ownership

| Boundary | Owns | Explicitly does not own |
|---|---|---|
| Terminal surface | Input, live rendering, compact audit and correction entry points | Authorization or durable truth |
| Session | Ordered durable interaction history across Turns | Learner inference |
| Turn | One user-visible request, accepted steering, resulting model/tool work, and terminal outcome | Provider retry details or learning meaning |
| Agent loop | Serialized continuation, cancellation scope, budgets, and safe boundaries | Persistence authority or domain inference |
| Context compiler | Provider-ready context and provenance of selected learning state/policy | Facts or provider streaming |
| Model adapter | One logical model operation, provider translation, normalized events, internal retry | Tool effects, Turn completion, learning state |
| Tool runtime | Visible definitions, validation, correlation, execution and settlement | Permission policy or educational interpretation |
| Permission policy | Whether a protected effect may begin | Whether it succeeded or proves learning |
| Learning Domain | Task context, admitted results, evidence interpretation, corrections, obligations, and projection rules | Session text or provider state |
| SQLite | Durable interaction and learning authority | Live stream state or presentation |

## Interaction hierarchy

The runtime uses five distinct meanings. They need clear identities in code but
do not all require independent database tables.

### Session

A long-lived conversation and learning-workspace interaction history.

### Turn

One user-visible request together with the agent work that follows, including
accepted steering, model operations, tool calls, and the terminal outcome.

The first implementation proposes:

~~~text
running -> completed | failed | interrupted | exhausted
terminal -> no transition
~~~

The initial user item and running Turn are committed before model work begins.
At most one Turn is active for one resident Session runtime. Different Sessions
may run concurrently.

Acknowledged mid-Turn steering may remain process-local in the first slice. If
the process dies before steering becomes durable history, it may be lost. The
terminal surface must not claim a stronger guarantee.

### Logical model operation

One request for a model decision at a context boundary. Provider authentication
retries, transport retries, or fallback sends remain adapter details unless a
diagnostic trace is enabled.

Its settlement depends only on model/transport behavior:

~~~text
running -> completed | failed | interrupted
terminal -> no transition
~~~

A completed model operation may leave local tools to execute. It does not
complete the Turn.

### Tool invocation

One complete model-requested call correlated to a logical model operation. The
invocation is recorded before executor entry.

The first local lifecycle is:

~~~text
recorded -> running -> succeeded | failed | cancelled
recorded -> rejected | declined | cancelled
terminal -> no transition
~~~

Invalid input, an unavailable definition, or a hard policy deny never enters
the executor. Cancellation becomes terminal only after the executor has stopped
and the runtime can account for the local effect.

There is no generic terminal indeterminate state in the first slice. A future
connector whose external effect can outlive cancellation must define its own
unresolved/reconciliation contract before it is enabled.

### Transport attempt

One physical provider send. It is adapter diagnostics, not product state, by
default.

## Provider events and durable interaction

The adapter normalizes only the events required by the first provider:

- completed assistant text blocks;
- complete tool calls with stable correlation;
- model-operation completion, failure, usage, and interruption.

Streaming deltas and partial tool-input buffers are process-local. Complete
assistant text and complete tool calls become durable Turn items. An incomplete
tool-input buffer is discarded and never executes.

Malformed input in a provider-declared complete tool call fails that logical
model operation or records a rejected invocation; it is not silently dropped.
Hidden reasoning is neither durable product history nor learning evidence.

## Finite continuation

Before starting each additional logical model operation, the agent loop checks
a Turn-scoped budget. The first implementation must enforce at least:

- a maximum number of logical model operations; and
- a maximum number of tool invocations.

Token, elapsed-time, and cost limits may be added when the chosen provider
exposes reliable data. Exact numeric defaults are configuration, not domain
semantics.

Exhaustion produces a durable Turn outcome that names the exhausted counter and
its observed value. It does not masquerade as successful completion. The user
may explicitly start a later Turn to continue.

## Learning-significant records

The foundation needs semantic roles, not a complete learner ontology.

### Formal task context

The educational purpose of a selected task, its targets, relevant alignment,
and the conditions under which a result can be interpreted. A task may teach,
exercise, assess, or require a target.

### Source-linked task result

What happened in one task attempt, under what observable conditions, and where
the authoritative answer, tool result, or artifact version lives. It references
Session history or an artifact rather than copying the original content.

### Evidence interpretation

What the source-linked result supports about a target, with the grading method,
rule/model revision, assistance conditions, and uncertainty needed to explain
the consequence. This is durable but fallible and correctable.

### Learner projection

A rebuildable view over active evidence interpretations for an active goal. It
is not a declaration of the learner's inner state and is not curricular
structure.

### Scheduling consequence

A reversible obligation or candidate reason such as verification, review, or
local remediation. Passage of time may alter its urgency without creating new
evidence.

These roles may share a transaction or storage record when their distinctions
remain queryable. They must not collapse into one unqualified mastery number.

## Admission boundary

Session history becomes learning-significant only when:

1. an identifiable educational purpose exists;
2. the task target and alignment are known well enough to interpret the result;
3. assistance, hints, timing, grading, and other meaning-changing conditions
   are recorded when relevant; and
4. the result can legitimately change review pressure, local task priority, or
   a verification obligation.

An ordinary clarification satisfies none of these by default.

A selected explanation may create a future verification obligation. It does
not itself provide mastery evidence.

A formal quiz miss may create targeted review candidates after the assessment
boundary completes. It does not rewrite accepted curriculum relations.

## Identity and idempotency

Semantic identity and execution identity are different:

- a task-attempt identity plus its source reference identifies the observed
  result;
- an evidence-interpretation identity identifies one versioned educational
  reading of that result; and
- a runtime tool-invocation identity may act as an idempotency key for the
  command that records them.

Replaying the same operation returns the existing commit. Reusing the operation
key with conflicting input is rejected. The runtime invocation is not the
domain identity and does not determine educational meaning.

Re-evaluating the same source under a new rule does not insert a second answer.
It appends a superseding evidence interpretation or correction.

## Correction and retraction

Original Session items, artifacts, and source-linked results are not invisibly
rewritten.

A correction appends provenance and may:

- correct recorded conditions;
- supersede an evidence interpretation;
- retract an unsupported interpretation; or
- replace a scheduling consequence derived from it.

Projection rebuild considers only active interpretations after applying the
correction chain. Derived schedules and context are recomputed from the revised
projection. The original result remains inspectable.

Correction is distinct from undoing an external effect. The first slice has no
external effect-reconciliation contract.

## Local transaction boundary

All first-slice authoritative state is in one SQLite database.

When a runtime-owned learning tool records a formal task result, one transaction
must:

1. validate the source reference, task context, conditions, and operation key;
2. insert or resolve the source-linked result;
3. append the evidence interpretation or correction;
4. update or invalidate the rebuildable learner projection and affected local
   obligations; and
5. settle the tool invocation with the model-visible result.

Either the transaction commits all five effects or none. This removes the
first draft's receipt/reconciliation gap for local learning writes.

Read-only tools need no receipt. External files, Anki, MCP, assignment
submission, and other non-SQLite effects require connector-specific
idempotency/reconciliation design later; the foundation does not pretend that a
generic receipt can prove an arbitrary remote effect.

## Context provenance

Every logical model operation that can choose a learning action receives a
compact provenance cut containing at least:

- the durable Session history boundary used;
- the learner-projection revision used;
- active goal, obligation, curriculum-source, and mode-policy revisions that
  materially affected selection.

The exact compiled prompt is not product authority and need not be persisted by
default. A sensitive diagnostic trace may capture it separately. The provenance
cut may be fields on the model-operation or selected-action record rather than
a dedicated ContextSnapshot table.

Retrieved material remains untrusted content. Only the context compiler can
construct privileged instructions.

## Permission boundary

Permission is enforced immediately before protected execution using
allow/ask/deny policy.

- Plan policy can hard-deny mutation even if the model asks for it.
- Routine provenance-preserving local learning writes are allowed by default
  under ADR-0003.
- External writes and difficult-to-reverse actions require explicit policy and
  usually ask.
- Permission approval does not prove execution or learning.

Pending approval and remembered grants may remain process-local in the first
slice. A restart cancels the waiting invocation and interrupts the Turn; it
does not perform the protected effect. Durable approval is added only when a
restart consumer exists.

## Persistence and recovery

### Durable in the first slice

- Session, initial user item, Turn identity and terminal outcome;
- complete assistant text and complete tool-call/result items;
- recorded and terminal local tool invocations;
- formal task contexts, source-linked results, evidence interpretations, and
  corrections;
- goals, obligations, scheduling reasons, and learner-projection revisions.

### Process-local in the first slice

- stream deltas and partial buffers;
- adapter transport retries;
- pending approval channels and remembered session-only grants;
- mid-Turn steering before it enters durable history;
- cancellation tokens and active-owner locks.

### Recovery rules

| Restart observation | Required behavior |
|---|---|
| Running Turn with no live owner | Mark interrupted; do not redispatch model work automatically |
| Live-only text tail | Tail is lost; previously completed items remain |
| Incomplete provider tool input | Discard; no invocation existed |
| Recorded invocation whose executor never began | Cancel during Turn recovery; do not auto-execute |
| Nonterminal local SQLite learning invocation | Atomic transaction proves no domain commit; cancel it |
| Committed local learning invocation | Its tool settlement committed in the same transaction |
| Pending process-local approval | No effect began; cancel invocation and interrupt Turn |
| Terminal Turn | A later explicit user Turn may continue from durable history |

The first slice guarantees resumable conversation and correct local learning
facts. It does not guarantee restoration of an in-flight workflow.

## Required contract tests

### Turn and model boundaries

- the initial user item and running Turn commit before provider dispatch;
- one resident Session cannot run two Turns concurrently;
- one Turn can contain several logical model operations;
- model completion is recorded independently of local tool settlement;
- crash recovery marks a running Turn interrupted without redispatch;
- continuation exhaustion is visible and code-enforced.

### Tool boundary

- a complete invocation record precedes executor entry;
- invalid or hard-denied input never executes;
- a local terminal settlement occurs exactly once;
- incomplete provider tool input never executes;
- cancellation is terminal only after local cleanup;
- adapter retry details cannot create duplicate runtime invocations.

### Learning boundary

- an ordinary clarification changes only interaction history;
- a selected explanation creates at most a verification obligation;
- a source-linked formal result under known conditions can create an evidence
  interpretation;
- the local learning transaction and tool settlement are atomic;
- exact operation replay is idempotent and conflicting replay fails;
- correction supersedes or retracts interpretation without deleting source;
- projections rebuild equivalently from active interpretations;
- materially different evidence can change the next selected action;
- time-derived review pressure creates no evidence record;
- learner evidence changes local scheduling but not accepted curriculum
  relations.

## Historical implementation sequence

The sequence below is not authorized. It is retained to show which runtime
mechanisms led to the accepted ADRs and which learning assumptions were later
paused.

Implementation follows the product-bearing path rather than completing one
horizontal infrastructure layer at a time.

1. Record behavioral oracles for a casual clarification, a formal task result,
   a correction, and time-derived review.
2. Implement the minimum SQLite transaction that admits one source-linked task
   result, evidence interpretation, projection revision, and local tool
   settlement.
3. Implement Session/Turn persistence and one serialized Turn owner sufficient
   to drive that transaction.
4. Implement one provider adapter and the smallest normalized model/tool event
   path required by the same scenario.
5. Compile the revised learner projection into the next model-operation context
   and prove that the next action changes for a relevant evidence change.
6. Add the minimal terminal surface only after the headless vertical path is
   executable and inspectable.

Each step must leave the same vertical behavior more complete. No step may add
a provider fleet, generic workflow engine, broad permission language, or full
learning ontology.

## Explicitly deferred

- full-screen TUI and dashboard surfaces;
- multiple providers, fallback routing, subagents, and multi-agent orchestration;
- durable mid-Turn inbox and exactly-once steering;
- durable pending permissions and remembered authorization policy;
- general external-effect receipts and reconciliation;
- parallel tool execution;
- exact prompt/request capture outside optional diagnostics;
- compaction and long-context policy;
- complete curriculum, claim, task-family, or mastery schema;
- FSRS parameterization and final task-ranking policy;
- Anki, Obsidian, PDF, browser, shell, MCP, and assignment submission;
- cloud sync, multi-process ownership, and a durable workflow/AgentRun aggregate.

## Acceptance record

The maintainer accepted these five concrete defaults on 2026-07-11:

1. A durable Turn starts with the initial user item and ends independently of
   its constituent model operations and tools.
2. Mid-Turn steering may be process-local in the first slice.
3. Local learning writes and their tool settlement share one SQLite
   transaction; generic effect receipts are deferred.
4. Source-linked task result, evidence interpretation, learner projection, and
   correction remain distinct semantic roles without committing to a complete
   ontology.
5. Every Turn has finite model-operation and tool-invocation limits with an
   explicit exhausted outcome.

Their normative consequences are recorded in ADR-0005, ADR-0006, and ADR-0007.
This proposal remains informative for the combined contract and for unresolved
learning-policy questions.

The fourth item records the original acceptance. ADR-0006 was later amended:
only the effects a bounded command actually owns are required to commit with
its tool settlement. A general Tutor interaction need not create an evidence
interpretation, learner projection, or verification obligation. The current
learning responsibility hypothesis is recorded separately in
[`0003-learning-native-responsibilities.md`](./0003-learning-native-responsibilities.md).
