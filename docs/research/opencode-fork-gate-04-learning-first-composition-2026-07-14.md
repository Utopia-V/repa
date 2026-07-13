# OpenCode fork Gate 4: learning-first composition boundary

Status: In progress — contract locked before production changes

Date: 2026-07-14

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decisions: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[ADR-0013](../decisions/0013-conditional-current-purpose-composition.md), and
[ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Starting fork commit: `40f54a2f10d9c60eb78c7675da1bd674a2a4b029`

## Parent uncertainty

Can the released-v1 Agent loop expose one Repa-owned learning product contract
to every reachable interactive model carrier, while keeping provider mechanics,
profiles, workspace context, plugins, and future Learning-System contributions
composable and keeping narrow internal model operations out of the interactive
Tutor role?

This gate replaces the inherited coding-product default. It does not claim that
a prompt is the Tutor, add learning tables, reconstruct the old Repa runner, or
pre-author the future learning-context schema.

## Evidence that fixes the owning seam

All ordinary released-v1 samples converge on
`packages/opencode/src/session/llm/request.ts` before they diverge into:

- ordinary AI SDK system messages;
- OpenAI OAuth `instructions`;
- the GitLab workflow model's `systemPrompt`; or
- the opt-in native runtime, which consumes the same prepared messages and
  provider options.

Before this gate, a configured `agent.prompt` replaces the provider-selected
base prompt, and `experimental.chat.system.transform` can replace the complete
interactive system array. Nine model-family branches select prompts that call
the product OpenCode and make software engineering the default ontology.
Title, compaction, summary, exploration, and agent-generation prompts repeat
that ontology on hidden or delegated paths.

The request-preparation seam therefore owns the product composition invariant.
Provider transport and native runtime code remain domain-independent consumers
of its prepared result.

## Composition contract

### Interactive samples

Every non-hidden Agent sample contains these regions in this order:

1. **Repa core:** one program-owned, non-replaceable product contract. It says
   that the model is one component of Repa's terminal-native Learning System;
   names teaching, explanation, demonstration, guided work, independent work,
   review, planning, and practical work as peer moves; makes the learner's
   exact current request immediate steering; forbids treating quizability,
   task completion, or model assertion as mastery or durable truth; and keeps
   coding/repository work as an available capability rather than the default
   ontology.
2. **Program composition inputs:** the bounded environment, accepted local
   instructions, skills, MCP instructions, and later typed Learning-System
   contributions selected by the Session path. These are additive and are not
   exposed to the legacy plugin hook as a replaceable product identity.
3. **Extensible operation guidance:** shared terminal-agent mechanics, an
   optional agent/profile prompt, optional caller system guidance, and plugin
   contributions. A custom agent specializes the model operation; it cannot
   replace the Repa core.

The current user message remains a user message rather than being copied into
the system prompt. The core states its precedence over conditional remembered
purpose. Gate 13 will bind exact durable learning context and command authority;
Gate 4 only provides the native input boundary they will use.

The inherited model-family selector is collapsed unless a provider-specific
requirement is demonstrated. Model transport differences remain in provider
adapters, not in competing product identities.

### Internal samples

A hidden Agent sample receives one non-replaceable internal-operation boundary
plus its narrow task prompt. It does not receive the full interactive product
prompt or generic interactive operation guide. Internal prompts must state the
actual artifact they produce and must not answer the conversation, call tools,
infer durable learning truth, or turn a learning Session into a pull-request
description.

The bounded internal operations in this gate are:

- title generation for later Session retrieval;
- anchored context compaction with a recent verbatim tail retained elsewhere;
- any retained conversation-summary operation;
- agent/profile generation; and
- the read-only exploration subagent, which is delegated but not hidden and
  therefore remains inside the interactive Repa contract.

### Plugin boundary

`experimental.chat.system.transform` remains an extension hook. It may add,
remove, or rewrite extensible operation guidance, but the runtime assembles the
Repa core and program composition inputs after the hook returns. A plugin that
empties its output therefore cannot erase the Repa identity or a selected
Learning-System contribution. No compatibility fallback restores the former
whole-system replacement behavior.

## Bounded implementation slices

1. **Composition spine and carriers:** introduce the two core regions, collapse
   the coding-first provider prompts, make configured agent prompts additive,
   and prove ordinary, OAuth, workflow, and native transport placement.
2. **Profiles and visible context:** make the broad default profile, planning
   profile, exploration profile, environment wording, and accepted instruction
   discovery truthful for a learning workspace without deleting useful coding
   capabilities.
3. **Tools and reminders:** remove coding-product assumptions from generic tool
   descriptions, todo/task delegation guidance, plan transitions, and model
   reminders. Tool names that truthfully describe a local capability may remain;
   no inherited todo or review record is renamed into Agenda or Tutor review.
4. **Internal operations:** replace PR/coding summaries, coding-only title
   examples, coding compaction language, and coding-agent generation with
   narrow Repa-owned contracts.
5. **Gate audit:** deterministically scan every remaining prompt, profile,
   reminder, and hidden call reachable from released v1; classify later Gate 5
   surfaces rather than quietly repairing unreachable Web/Desktop behavior.

Each slice receives focused tests before its production change and can be
reverted independently. Passing one slice does not authorize skipping the
remaining audit.

## Positive evidence

The gate passes only when tests and a source audit show all of the following:

1. Former provider-selector representatives for Meta, GPT-4/o-series, GPT,
   Codex, Gemini, Claude, Trinity, Kimi, and fallback models receive the same
   Repa core and no OpenCode/coding-product identity.
2. A custom agent prompt is additive. A plugin that clears or replaces its
   extension array cannot remove the Repa core or program composition inputs.
3. Ordinary AI SDK messages, OpenAI OAuth instructions, workflow
   `systemPrompt`, and both native ordinary/OAuth lowering carry the core
   exactly once.
4. Hidden title, compaction, and conversation-summary samples receive their
   narrow task contracts and do not receive the interactive core.
5. The default and exploration profiles, environment contribution, local
   instruction text, generic tool descriptions, plan reminders, and agent
   generator no longer say that software engineering, a codebase, a pull
   request, or OpenCode is the ordinary product context.
6. Explicit learner-directed coding work still has file, search, shell, edit,
   patch, LSP, Git, and delegated exploration capabilities subject to the
   existing permission system.

## Failure and recovery evidence

- **Core deletion:** clearing the plugin extension output still produces one
  Repa core. Zero or duplicate core occurrences fail the gate.
- **Agent replacement:** a configured prompt appears after the core and does
  not suppress shared or program-composed context.
- **Carrier loss:** a core present in `Prepared.system` but absent from the
  actual carrier used by OAuth, workflow, or native execution fails the gate.
- **Hidden-role leakage:** an internal title or compaction call that receives
  the interactive Tutor contract, tools, or coding-product instructions fails
  the gate.
- **Ontology residue:** a reachable ordinary branch that identifies itself as
  OpenCode/a coding agent or treats a repository, PR, implementation plan, or
  quiz as the default learning unit keeps the gate red.
- **False authority:** prompt text that claims unsupported learner state,
  mastery, evidence, course structure, or committed writes fails the gate even
  if provider tests pass.

Before Gate 6 there is no production-data migration obligation. Recovery is an
ordinary revert of the failing Gate 4 slice. The implementation must not fall
back to the pre-fork runner, old prompt set, a second executor, or a hidden
coding profile.

## Verification scope

Verification is causal rather than monorepo-wide:

- new request-composition and provider/carrier matrix tests;
- affected Agent, Session system, prompt, compaction, tool-description, and
  reminder tests;
- typechecks for changed production packages;
- a deterministic static audit of released-v1 model-visible text and hidden
  model call sites; and
- one fresh-context review against the contract before the checkpoint commit.

Web/Desktop reachability, account/share/control-plane removal, provider catalog
commercial semantics, and updater deletion remain Gate 5. Preview-v2 code is
changed only where released v1 imports the same implementation.

## Recorded result

Pending.

## Rollback

Revert the Gate 4 checkpoint or the smallest failing slice. A rollback does not
restore old Repa runtime code, read the oracle at runtime, or preserve a changed
prompt behind an alternate profile.
