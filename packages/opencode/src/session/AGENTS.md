# Released-v1 Session and Interaction harness

Changes in this subtree must preserve Repa's accepted retained production
Session loop and the product-composition contract recorded by
[Gate 4](../../../../docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md),
while durable Turn identity and lifecycle derive from
[Gate 12](../../../../docs/research/opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md)
and the [system architecture](../../../../docs/architecture/00-system-architecture.md).
That contract does not certify every current caller, recovery path, or
request-lowering branch; audit them against the linked contract.

## Required boundary

Own Session transcript and typed Message/Part orchestration, provider and tool
turn processing, process-local Session lifecycle coordination, compaction,
cancellation, and restart recovery. Core's Turn authority owns durable Turn
identity, budgets, legal transitions, and terminal truth; this subtree binds
the released-v1 runner to that authority without redefining it.

Gate 4 records `llm/request.ts` as the convergence seam for ordinary
released-v1 samples. Maintain that as a conformance requirement and investigate
any bypass rather than treating a new caller as self-authorizing. Every public
prompt, CLI/TUI/ACP call, command, Task/subtask, continuation, fork, and
recovered Agent name is interactive Repa composition, including a legitimately
hidden Agent.
Only a program-owned call site may select an internal purpose. Agent names,
caller payloads, persisted Messages, plugins, commands, provider output, and
source content cannot manufacture one. The dedicated representation carrier
remains separate from generic request preparation.

Session is Interaction history, not the long-term learning-state boundary.
Assistant text, summaries, compaction output, tool output, and historical
transcripts do not become Course, Artifact, Goal, learner, or policy facts.
Domain reads and writes go through bounded owner projections and typed
learning commands. Preserve the in-Session conversation while it fits;
compaction is continuation context with a recent verbatim tail, never a new
learning authority or a replacement for the durable transcript.

The nested `llm/AGENTS.md` refines transport-adapter maintenance only. It
cannot change the released-v1 production selection, interactive/internal
composition boundary, or product prompt ownership described here.

Focused checks from `packages/opencode` include `bun test
test/session/composition-authority-audit.test.ts
test/session/llm-workflow-authority.test.ts test/session/turn-recovery.test.ts
test/session/compaction.test.ts`. Choose the exact Session, Turn, tool, or
carrier test that can falsify the changed claim rather than running the whole
package by default.
