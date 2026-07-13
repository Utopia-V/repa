# OpenCode one-time fork and native-database audit

Date: 2026-07-13

Status: Informative source audit supporting ADR-0014. It records evidence and
rejected substrate shapes; ADR-0014 owns the decision.

## Parent question

Given that Repa ultimately needs a complete local terminal-Agent harness and
that repeated selective reimplementation has produced weak bespoke runtime
boundaries, which use of the pinned OpenCode source gives the shortest
inspectable path to an independent, learning-first product?

The compared shapes were:

1. continue the current Repa-owned AI SDK runner and adapt mechanisms one by
   one;
2. use the public OpenCode server/SDK/plugin surface as a permanent sidecar;
3. vendor a purported product-neutral subset of OpenCode; and
4. fork the released OpenCode product once and transform it into Repa.

## Source boundary

The source inspected was the ignored, read-only checkout pinned by
`references.lock.json`:

```text
OpenCode v1.17.18
commit b1fc8113948b518835c2a39ece49553cffe9b30c
```

No file under `.reference/` was modified or imported. Any production fork must
be obtained separately from full upstream history and retain the MIT notice.

## Decisive findings

### License and build compatibility

- `.reference/opencode/LICENSE` grants the MIT rights to use, modify, merge,
  publish, distribute, sublicense, and sell copies while requiring retention
  of the copyright and permission notice.
- Both repositories use TypeScript/Bun. At the inspected pins they use Bun
  `1.3.14` and AI SDK `6.0.168`, removing a large runtime-port mismatch.
- The released product entry remains `packages/opencode`; the preview v2 CLI
  and runner are not the released complete replacement.

This makes a fork mechanically plausible. It does not by itself prove that
learning authority can be preserved.

### There is no published neutral kernel

The public `@opencode-ai/sdk` starts an `opencode serve` child process; it does
not embed a product-neutral core. See:

- `.reference/opencode/packages/sdk/js/src/server.ts`
- `.reference/opencode/packages/sdk/js/src/index.ts`

The public plugin surface can add tools and transform system context, but the
stable public tool context does not expose every identity required by Repa's
learning commands. In particular:

- `.reference/opencode/packages/plugin/src/tool.ts` exposes Session, message,
  directory, worktree, abort, metadata, and permission context;
- the internal context in
  `.reference/opencode/packages/opencode/src/session/tools.ts` also knows the
  provider tool-call identity and messages; and
- `.reference/opencode/packages/plugin/src/index.ts` exposes an experimental
  per-request system transform without a stable assistant/model-operation
  identity.

A permanent sidecar would therefore need an additional identity protocol,
plugin readiness gate, two-database settlement, and crash reconciliation.
Those adapters recreate the private harness risk that motivated the audit.

Internal `core`, `llm`, `server`, `tui`, and preview SDK packages are private
workspace packages with a shared lockfile and patched dependencies. Selecting
some of them is not a smaller supported adoption route; it creates a vendor
surface without inheriting a complete product.

### The released v1 path already owns the needed harness mechanics

The mature path contains Session continuation, typed message/part persistence,
provider streaming, tool continuation, permission, cancellation, MCP,
subagents, compaction, and a Windows terminal product. These are coupled
lifecycle mechanisms, not a collection of independent helper functions.

The inherited permission vocabulary already separates external-directory
access from edit authority and offers `once`, `always`, and `reject` replies.
Its path mutation code canonicalizes the target and derives a reusable path
pattern. The inspected v1 `always` approvals, however, live only in process
`InstanceState`; there is no durable user-facing revocation contract. Repa can
reuse the evaluator, canonical path resources, and prompt flow, but its
permanent content-root/subtree rules must be native durable, inspectable,
revocable permissions rather than relabelled process-local approvals.

### The released v1 product semantics are coding-native, not neutral

The inherited harness mechanics do not arrive behind one cosmetic coding
prompt. Coding-product assumptions enter the model and user surface through
several independent paths:

- `packages/opencode/src/session/system.ts` selects different base prompts for
  Anthropic, GPT/Codex, Gemini, Kimi, Meta, Trinity, and fallback models. Most
  identify the product as OpenCode and the task as software engineering. A
  change to only `prompt/default.txt` would leave other providers coding-first.
- `packages/opencode/src/agent/agent.ts` installs `build` as the default primary
  agent, a code-implementation `plan` flow, and an `explore` subagent described
  and prompted as a codebase search specialist.
- hidden model calls are also semantic. `agent/prompt/compaction.txt` describes
  coding sessions; `summary.txt` asks for a pull-request description; and the
  title prompt's examples and rules are dominated by software tasks.
- tool descriptions and mode reminders are model input. `tool/todowrite.txt`
  defines a current coding-session list, while `plan-enter.txt`,
  `plan-exit.txt`, and the plan reminders assume a path from code research to
  implementation.
- the built-in `/init` template creates repository `AGENTS.md` guidance and
  `/review` is a code reviewer. These may remain explicit local coding
  capabilities only if their names and scope do not govern ordinary learning;
  neither may become Agenda or Tutor review by relabelling.
- instruction discovery is rooted in `AGENTS.md`, `CLAUDE.md`, and the current
  worktree, and the environment contribution foregrounds Git/project state.
  The mechanics may remain useful for explicit coding work, but they cannot be
  Repa's only learning-context or instruction path.
- account, share/import-share, sync, control-plane workspace, hosted GitHub,
  and related routes are real product modules rather than harmless prompt
  text. They are outside the accepted local Repa baseline.

The fork therefore needs two separate transformations before learning-state
work:

1. every interactive provider path must implement the same Repa product
   contract and accept the same Learning-System composition inputs; exact
   prompt rendering may differ for demonstrated provider requirements. Hidden
   calls use narrow Repa-owned prompts for their real task while preserving
   learning continuity rather than coding-session assumptions; and
2. inherited commands, routes, agents, labels, configuration, and packages
   must be retained, made explicitly optional, or removed by observable
   product behavior.

The first transformation establishes the interactive composition boundary; it
does not make a base prompt the Tutor or claim that learning-first behavior is
complete before Course, source, Agenda, learner, and policy contributions are
native. The Tutor remains the product behavior of the integrated Learning
System. Provider prompts are renderers and mechanical instructions inside that
system, not independent personas.

For the second transformation, product absence and physical deletion are
separate checkpoints. First unregister excluded commands, routes, background
entry points, and configuration and prove that ordinary launch cannot reach
them. Then delete dependency-closed implementation slices with focused tests.
No excluded dormant code ships at final cutover, but its entire dependency
graph is not removed in the same patch that first establishes surface absence.

This is not a global string-replacement or a requirement to remove file, shell,
Git, LSP, patch, worktree, MCP, skill, or subagent mechanics. Those capabilities
may still serve learning and explicit coding work. The invariant is that they
no longer define the default ontology, prompt, Session summary, context, or
product navigation. Cloud/group surfaces are removed because they are out of
scope, not because their implementation happens to contain OpenCode names.

### Search scope is distinct from resource management

At the inspected pin, OpenCode's `grep` and `glob` tools default to the
instance directory, accept an explicit path, enforce external-directory
permission, and cap returned matches. They are model-initiated ripgrep
operations; OpenCode does not provide Repa's Course/material resource catalog
or default learning working set. See:

- `.reference/opencode/packages/opencode/src/tool/grep.ts`;
- `.reference/opencode/packages/opencode/src/tool/glob.ts`; and
- `.reference/opencode/packages/core/src/ripgrep.ts`.

Cursor demonstrates a larger hybrid, not a requirement for Repa. Its official
documentation, inspected 2026-07-13, describes a maintained codebase index and
automatic relevant-context gathering while its Agent simultaneously exposes
`Codebase`, `Grep`, and `Search Files` tools:

- [Securely indexing large codebases](https://cursor.com/blog/secure-codebase-indexing);
- [Agent tools](https://docs.cursor.com/en/agent/tools); and
- [Working with context](https://docs.cursor.com/en/guides/working-with-context).

The preserved invariant is that system-managed resource awareness and
model-initiated retrieval may coexist under one access boundary. Repa's
deliberate difference is smaller: approved content roots define the maximum
search universe; current request, Course prior, Material Map, and explicit
references define the default working set; the Agent may visibly widen a
bounded search to an approved root without another permission prompt. The
fork reuses ripgrep and admits no semantic/vector index until a real corpus
proves ordinary bounded search inadequate.

The current Repa runner demonstrates why owning only a visible subset is
unsafe:

- `src/runtime/run-tutor-turn.ts` concatenates text from multiple model/tool
  steps into one assistant item; and
- it performs authoritative model-operation settlement in `onStepFinish`,
  while `node_modules/ai/dist/index.mjs` implements callback notification by
  catching and ignoring callback exceptions.

These facts do not make OpenCode correct by assertion. They show that the
remaining Repa harness work includes lifecycle ownership, not only UI polish.

### One native SQLite is feasible

The inspected OpenCode tag already uses one SQLite database through:

- `.reference/opencode/packages/core/src/database/database.ts`
- `.reference/opencode/packages/core/src/database/migration.ts`
- `.reference/opencode/packages/core/src/event.ts`
- `.reference/opencode/packages/core/src/session/projector.ts`

`EventV2` runs projectors, an optional supplied commit effect, the aggregate
sequence update, and event insertion inside one database transaction, then
publishes after commit. That is the relevant seam for preserving ADR-0006:
the learning-domain transition and exact model-visible tool settlement can be
made one local transaction.

The current v1 tool path does not already provide this guarantee. Tool code
executes before `SessionProcessor` observes and persists the later tool-result
stream item. The fork must change tool admission/settlement so the domain
command and completed Tool Part share the EventV2 transaction. Merely adding
learning tables would leave a crash window.

One database does not imply one authority. Interaction, source/artifact,
Course View, Material Map, learner record, Agenda, and Tutor policy keep their
own tables, commands, transitions, and dependency rules. The generic event
store cannot become a learning-fact store.

### V2 is not the fork baseline

OpenCode's own
`.reference/opencode/specs/v2/session.md` labels essential v1 parity as missing
or partial, including configured/nested instructions, provider-family prompts,
per-prompt overrides, plugin transformations, structured-output policy, and
several reference-expansion paths. The preview runner also defers parts of
retry, recovery, cancellation, and platform behavior.

The experimental nature is stronger than a TODO count. Migration
`.reference/opencode/packages/core/src/database/migration/20260622170816_reset_v2_session_state.ts`
deletes v2 Session, input, context-epoch, event, and workspace state. Such a
line cannot yet be the authority for durable learner history.

The fork should therefore start from the released v1 execution path, ship only
one runner, and use v2 as a source of individually evaluated design ideas.

## Preserved product invariants

The fork must preserve these Repa meanings rather than transplanting the old
tables mechanically:

- one LearnerHome spans LearningSpaces, courses, and Sessions;
- a real learner occurrence is distinct from a copied compaction/synthetic
  message;
- one learner Turn may contain several model operations and tools;
- every model sample owns an immutable learning context cut;
- a physical tool invocation is distinct from its semantic effect;
- local learning effects and exact tool settlement are atomic and idempotent;
- Course, material, learner, Agenda, and Tutor policy remain separate
  authorities; and
- a fresh Session receives relevant durable learning state without importing
  an old transcript.

OpenCode message and part identities may implement some of these roles. A
successful reduction means the invariant is preserved; it does not mean that
OpenCode `todo`, project, diff, or message semantics become the corresponding
learning concepts.

## Rejected directions

### Continue selective harness construction

Rejected as the default because the desired local harness is broad and its
failure semantics are coupled. This path also contradicts the maintainer's
explicit risk assessment of repeatedly generated "minimal" private
mechanisms. The current runner remains an oracle until cutover, not a base for
more generic features.

### Permanent server/plugin sidecar

Rejected as the production boundary because stable sample/tool identity,
required-plugin failure, two-database atomicity, event replay, and capability
secrets would require a Repa-owned coordination layer. A sidecar may be used as
a disposable probe only when it answers a fact cheaper than the fork.

### Selectively vendor preview/private packages

Rejected because the private workspace packages are not a supported neutral
kernel and preview v2 does not yet provide released feature parity. Repa would
inherit both vendor maintenance and missing harness work.

### Maintain v1 and v2 product paths

Rejected because every learning context, command, correction, and failure
would need two identities and two execution integrations. No current consumer
requires that compatibility cost.

## Evidence that closes the next gate

The source audit is sufficient for the architecture decision but not for a
successful cutover. The implementation gate is closed only by a build and
fault-injected vertical trace that proves:

1. the full-history v1 fork builds and runs on Windows;
2. Repa owns a new application home and database identity;
3. one learning transition and the exact Tool Part result commit together;
4. retry, abort, and crash cannot duplicate or hide the transition;
5. a later model sample and fresh Session receive the new learning state;
6. a non-model-friendly material creates a revision-bound readable artifact
   that later reads reuse; and
7. only one production Session runner exists.

The executable sequence is
[`../roadmap/09-one-time-opencode-fork-baseline.md`](../roadmap/09-one-time-opencode-fork-baseline.md).
