# OpenCode fork Gate 4: learning-first composition boundary

Historical result: Passed at `9c7b74f41` and `17e25eab2`. Current disposition
is owned by [the documentation index](../README.md).

Correction result: Closed on 2026-07-16. Independent review run
`gate4-20260715-authority-01` accepted the contract/theory layer after five
findings were closed, including propagation into owning ADR-0014, and accepted
the implementation/evidence layer after five implementation findings were
closed.

Date: 2026-07-14

Correction closed: 2026-07-16

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

## Post-close audit correction

The 2026-07-15 post-Gate-7 audit found that the released-v1 implementation used
the presentation property `agent.hidden` as internal-call authority. Ordinary
public admission could name a hidden Agent, after which request preparation
selected the narrow internal core and omitted the interactive Repa composition.
The original Gate 4 contract itself authorized that mistake by equating every
hidden sample with an internal operation, and its tests repeated the same
premise rather than testing the caller's authority.

Gate 4 was therefore reopened only to establish the real trust boundary:

- `hidden` controls discovery and default presentation, not composition or
  authority. An explicitly named hidden Agent remains an ordinary interactive
  Repa operation;
- a persisted user-selected Agent also remains interactive. A missing or
  disabled Agent fails before sampling rather than changing identity or
  acquiring an internal contract; and
- title generation, compaction, project-copy naming, and any later retained
  released-v1 stream auxiliary enter a narrow contract only through a
  program-owned operation purpose at the real call site. The dedicated
  `Agent.generate` method remains its own fixed structured-output owner rather
  than pretending to be another member of that purpose union.

The public preview-v2 prompt path is not another carrier to make learning-first.
ADR-0014 denies it production authority. Its public admission and the model
execution it scheduled were Gate 5 product-reachability defects. Gate 5 has now
removed them from production, so the matrix below is the final Gate 4 carrier
set rather than a provisional inventory.

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

## Post-Gate-5 carrier and trust matrix

Gate 5 removed preview-v2 model admission and stabilized the production set.
The remaining released-v1 owners and their required composition are:

| Model-call owner                         | Current authority input                                          | Required Gate 4 disposition                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Public HTTP prompt and async prompt      | Caller-supplied Agent name, then `hidden` in request preparation | Always interactive after the Agent resolves; public payload has no internal-purpose field.                                |
| `repa run`, attach, TUI, and ACP         | CLI/UI selection or recovered Agent name                         | Discovery and default selection may omit hidden Agents; any admitted or recovered call is interactive.                    |
| Command execution                        | Command or caller Agent name                                     | Interactive when it produces an ordinary Session turn; a name cannot select internal composition.                         |
| Task and subtask execution               | Delegated Agent name                                             | Interactive Repa composition even for a legitimately hidden subagent.                                                     |
| Session continuation and ACP resume/fork | Agent name persisted on a user message                           | Interactive when the Agent still resolves; explicit failure rather than silent replacement when it does not.              |
| Automatic title generation               | Program-owned title call site                                    | Exact `title` purpose and fixed title contract; no executable Agent/domain tools.                                         |
| Context compaction                       | Program-owned compaction transition and marker                   | Exact `compaction` purpose and fixed continuation contract; no executable Agent/domain tools.                             |
| Project-copy naming                      | Dedicated naming handler                                         | Exact `project-copy-name` purpose and fixed naming contract; no executable Agent/domain tools.                            |
| Agent/profile generation                 | Dedicated `Agent.generate` structured-output method              | Preserve its fixed generation system and schema as the call-origin owner; it is not a member of the stream-purpose union. |
| Explicitly named `summary` profile       | Caller-selected registered hidden primary Agent                  | Ordinary interactive composition. There is no automatic/program-owned internal summary caller or `summary` purpose.       |
| Preview v2 and hosted GitHub source      | Hibernated and absent from production composition                | Outside the Gate 4 carrier set.                                                                                           |

Shell operations may persist messages containing an Agent name, but do not
sample a model themselves. Their only relevant edge is later Session recovery,
which is covered above.

## Source adaptation record

The inherited mechanism comes from OpenCode `v1.17.18` at
`b1fc8113948b518835c2a39ece49553cffe9b30c`, principally:

- `packages/opencode/src/session/llm/request.ts` and
  `packages/opencode/src/session/llm.ts` for request preparation, streaming,
  tool continuation, cancellation, and provider lowering;
- `packages/opencode/src/session/system.ts` for program-composed context;
- `packages/opencode/src/agent/agent.ts` for profile and permission
  composition; and
- `packages/opencode/src/tool/registry.ts` and the existing tool
  implementations for capability registration and settlement.

Repa preserves those mature transport, event, rendering, permission, and tool
mechanics. It deliberately replaces the inherited model-family coding prompts
with one protected Repa product core, makes agent and plugin guidance additive,
gives program-authorized internal operations a separate protected task
boundary, reasserts protected OAuth instructions after parameter hooks, makes
`repa` the broad default profile, and makes Plan and Explore deny-by-default.
This adapts the composition invariant rather than OpenCode's package topology
or product ontology.

## Composition contract

### Interactive samples

Every model sample admitted through a learner-, caller-, command-, delegated-,
or Agent-selected path contains these regions in this order, regardless of
presentation metadata such as `agent.hidden`:

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
purpose. A later product consumer will bind exact durable learning context and
command authority; Gate 4 only provides the native input boundary it will use.
The former Gate 13 label was superseded before implementation by the corrected
product-outcome roadmap.

The inherited model-family selector is collapsed unless a provider-specific
requirement is demonstrated. Model transport differences remain in provider
adapters, not in competing product identities.

Public HTTP prompt admission, `run --agent`, command-driven Agent selection,
Task delegation, and recovered user messages cannot carry an internal purpose.
`hidden` may omit an Agent from discovery, cycling, and default selection, but
explicitly resolving that Agent does not change the sample class. If persisted
state names an Agent that still resolves, the sample is interactive even when
the Agent is now hidden. If it no longer resolves, the runtime fails before
sampling rather than silently selecting another Agent. No Agent name, mode,
prompt, configuration field, or persisted message can manufacture internal
authority.

This Gate does not turn generic Agent eligibility into composition authority.
Top-level versus delegated use may continue to apply the inherited `primary`,
`subagent`, and `all` policy at their owning admission sites, but every admitted
case receives interactive composition. Correcting unrelated mode-admission
inconsistencies is not required to close this trust boundary.

### Internal samples

A released-v1 stream sample is internal only when a named program owner invokes
the model with one member of the closed `title | compaction |
project-copy-name` operation-purpose union. The purpose is a call-origin fact,
not a second runner: it is absent from public payloads and cannot be inferred
from an Agent name, mode, prompt, `hidden`, or persisted message. It selects one
non-replaceable internal-operation boundary plus the exact fixed semantic task
contract and carries no generic interactive operation guide.

An existing Agent profile may still supply operational choices such as model,
temperature, or provider options for an internal call. Those choices do not
select the purpose and its configurable prompt does not replace the fixed task
contract. Plugin hooks may contribute bounded context or operational options,
but cannot erase or substitute that contract. Internal prompts state the exact
artifact they produce and must not answer the conversation, call tools, infer
durable learning truth, or turn a learning Session into a pull-request
description.

The logical tool authority is structurally empty: no Agent, learning, MCP,
plugin, or other executable domain tool is admitted, and no Agent permission,
plugin, or caller field may broaden that set. A provider adapter may emit one
reserved, non-executable wire declaration only when replayed tool history makes
the provider reject a request with no `tools` field. Such a declaration is sent
with `toolChoice: none`, has no executor or permission bridge, is never exposed
as an Agent capability, and must fail truthfully if a provider nevertheless
tries to call it. It does not turn a transport compatibility declaration into
model authority.

The three stream-purpose owners have explicit operational failure semantics:

- **Title:** the automatic title owner resolves the optional `title` profile.
  Missing or disabled means skip before provider sampling, preserve the default
  Session title, and allow a later eligible attempt if the profile returns. It
  never substitutes the default interactive Agent.
- **Compaction:** every fresh or recovered durable compaction marker resolves
  the optional `compaction` profile. Missing or disabled produces an explicit
  availability failure before provider sampling, leaves the marker available
  for truthful recovery after configuration is repaired, and never substitutes
  an interactive/default Agent or silently abandons the marker.
- **Project-copy naming:** the dedicated handler owns its fixed operational
  profile rather than resolving a user-configurable Agent. If no provider model
  is available or sampling fails, it returns the existing local slug fallback;
  no durable marker or alternate model purpose is created.

`Agent.generate` is a fourth internal model operation but not a stream-purpose
member. The dedicated method plus its fixed generation system and structured
schema are its call-origin owner. Public fields and Agent configuration cannot
select or replace that owner; plugin additions remain additive; no Agent tools
are admitted.

The registered hidden `summary` primary profile is not dormant source. When a
caller explicitly names it, it is an ordinary interactive Agent and receives
the complete Repa composition. What does not exist today is an automatic or
program-owned internal conversation-summary caller; Gate 4 neither invents one
nor invents a `summary` purpose. A later real internal summary owner would
require an explicit contract change.

The read-only exploration subagent is delegated but lacks internal-operation
authority and therefore remains inside the interactive Repa contract.

### Plugin boundary

`experimental.chat.system.transform` remains an extension hook. It may add,
remove, or rewrite extensible interactive operation guidance, but the runtime
assembles the Repa core and program composition inputs after the hook returns.
For an internal operation, an applicable hook may add bounded context but
cannot replace the purpose-owned semantic task. A plugin that empties its
output therefore cannot erase the Repa identity, a selected Learning-System
contribution, or the internal operation contract. No compatibility fallback
restores the former whole-system replacement behavior.

For compaction specifically, `experimental.session.compacting` may still add
context or operational guidance, but its `prompt` output is additive beneath
the fixed continuation contract rather than a replacement for it. The generic
system-transform hook and this compaction-specific hook are separate attack
surfaces and closing evidence covers both.

## Correction implementation boundary

The original composition spine, profiles, tools, reminders, and learning-first
prompt work remain accepted. The correction is one coherent implementation
boundary with three internal work areas, not three new Gates:

1. **Composition authority:** replace the `agent.hidden` branch with an explicit
   caller-owned composition kind. Every Agent-driven call is interactive;
   internal purpose is available only to program call sites.
2. **Real internal carriers:** bind exact purposes for title generation,
   compaction, and project-copy naming; preserve `Agent.generate` as its
   dedicated fixed structured-output owner. Define profile absence and recovery
   at each real owner, and keep the registered `summary` profile interactive
   when explicitly named. Do not create another executor or invent an automatic
   summary caller. Preserve useful model and provider tuning while making each
   semantic task non-replaceable.
3. **Final carrier audit:** inspect public prompt, CLI, command, Task, recovered
   Session, direct internal, OAuth, workflow, and native paths against the
   production carrier set stabilized by Gate 5. Correct only reachable
   released-v1 behavior; hibernated v2, Web, and Desktop implementations remain
   outside this Gate.

The implementation may use reviewable commits, but these work areas do not
become additional Gates or mandatory test-first phases. Evidence is selected by
the behavior each change can falsify, and passing one area does not authorize
skipping the final carrier audit.

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
4. Title, compaction, and project-copy naming samples receive their narrow task
   contracts only through the corresponding program-owned stream purpose and do
   not receive the interactive core. `Agent.generate` retains its dedicated
   fixed generation system and structured schema without becoming a purpose
   member. None admits executable Agent/domain tools; any Copilot replay
   declaration is wire-only, non-executable, and paired with `toolChoice: none`.
5. Missing or disabled title profiles skip before sampling, while missing or
   disabled compaction profiles fail explicitly before sampling for both fresh
   and recovered markers and preserve the marker for later recovery. Neither
   path substitutes an interactive/default Agent. Project-copy naming retains
   its local no-model/failure fallback.
6. Explicitly naming the registered hidden `summary` profile produces an
   ordinary interactive sample. No automatic internal summary caller or
   `summary` purpose is created.
7. Public HTTP, `run --agent`, command selection, Task delegation, and recovered
   user messages cannot invoke an internal purpose by supplying an Agent name,
   mode, prompt, or `hidden` value. A resolvable explicitly named hidden Agent
   receives the complete interactive composition; an unresolvable persisted
   Agent fails before sampling.
8. The default and exploration profiles, environment contribution, local
   instruction text, generic tool descriptions, plan reminders, and agent
   generator no longer say that software engineering, a codebase, a pull
   request, or OpenCode is the ordinary product context.
9. Explicit learner-directed coding work still has file, search, shell, edit,
   patch, LSP, Git, and delegated exploration capabilities subject to the
   existing permission system.

## Failure and recovery evidence

- **Core deletion:** clearing the plugin extension output still produces one
  Repa core. Zero or duplicate core occurrences fail the gate.
- **Agent replacement:** a configured prompt appears after the core and does
  not suppress shared or program-composed context.
- **Carrier loss:** a core present in `Prepared.system` but absent from the
  actual carrier used by OAuth, workflow, or native execution fails the gate.
- **Public authority forgery:** an ordinary HTTP, CLI, command, Task, or
  recovered selection that obtains the internal contract from an Agent name,
  mode, prompt, `hidden`, or other caller-controlled metadata fails the gate.
- **Presentation promoted to policy:** rejecting an explicitly named Agent only
  because it is hidden, or silently changing a recovered Agent selection,
  fails the gate even when no internal prompt leaks.
- **Summary misclassification:** treating an explicitly named registered
  `summary` profile as dormant/internal, or inventing an automatic summary
  caller merely to satisfy the matrix, fails the gate.
- **Operation-purpose leakage:** a program-owned title, compaction, or
  project-copy naming call without its exact internal purpose—or one whose
  fixed semantic task can be replaced by Agent configuration or a plugin—fails
  the gate. Making `Agent.generate` depend on that union instead of its
  dedicated method and fixed generation system also fails.
- **Profile-loss ambiguity:** sampling, silent fallback, marker abandonment, or
  substitution with an interactive/default Agent after a required internal
  profile is missing or disabled fails the gate. Recovered compaction markers
  must follow the same explicit pre-sampling failure and retry semantics as
  fresh markers.
- **Transport promoted to authority:** exposing any executable Agent/domain
  tool to an internal operation fails the gate. A provider-only replay
  declaration that has an executor, is selectable, lacks `toolChoice: none`, or
  can report synthetic success also fails.
- **Ontology residue:** a reachable ordinary branch that identifies itself as
  OpenCode/a coding agent or treats a repository, PR, implementation plan, or
  quiz as the default learning unit keeps the gate red.
- **False authority:** prompt text that claims unsupported learner state,
  mastery, evidence, course structure, or committed writes fails the gate even
  if provider tests pass.

This correction changes no Repa database schema or durable Agent identity. A
persisted selection that cannot be resolved fails before provider sampling and
remains inspectable; the correction neither rewrites it nor silently selects a
replacement. Recovery is an ordinary revert of the failing Gate 4 correction,
but rollback must not restore `hidden` as authority, the pre-fork runner, the
old prompt set, a second executor, or a hidden coding profile.

## Verification scope

Verification is causal rather than monorepo-wide:

- new request-composition and provider/carrier matrix tests;
- public HTTP, `run --agent`, command-selection, Task-delegation, and persisted
  Agent-selection tests, including the registered hidden `summary` profile and
  missing Agents;
- exact operation-purpose tests for title, compaction, and project-copy naming,
  including configuration and plugin replacement attempts and attempts to forge
  purpose through public input;
- dedicated `Agent.generate` tests proving its fixed generation system,
  structured schema, additive plugin boundary, absence of Agent tools, and
  unselectability through Agent/config/public fields;
- title-skip and fresh/recovered compaction-profile failure tests, including
  marker preservation and later recovery with no provider sample or default
  Agent substitution;
- prepared-request and real compaction evidence for Copilot history containing
  tool records, proving that the only permitted wire declaration is
  non-executable, paired with `toolChoice: none`, and fails truthfully if called;
- affected Agent, Session system, prompt, tool-description, and reminder tests;
- typechecks for changed production packages;
- a deterministic static audit of every released-v1 model-call owner, public
  Agent selector, internal operation-purpose call site, and final carrier; and
- an independent implementation/evidence review against the accepted contract
  before the checkpoint commit.

Before any production change, this materially revised contract must separately
close its contract/theory round in a fresh top-level reviewer task. Author-team
preflight and the carrier-audit worker do not satisfy that transition.

Web/Desktop reachability, account/share/control-plane behavior, provider
commercial semantics, updater hibernation, and preview-v2 production
reachability are settled by Gate 5. Gate 4 neither reopens those dispositions
nor edits hibernated implementations merely because they contain model code.

## Accepted correction implementation and evidence

The accepted correction implements the contract as follows:

- request preparation receives an explicit interactive-or-purpose composition
  value and no longer inspects `Agent.hidden` for authority;
- the only production internal-purpose call sites are title generation,
  compaction, and project-copy naming, while the ordinary Session processor is
  explicitly interactive;
- each internal purpose owns a fixed task, rejects executable domain tools, and
  forces logical `toolChoice: none`; Copilot replay may retain only a
  declaration without an executor, and a real provider attempt to call it
  fails the stream;
- title skips before sampling when its profile is disabled; fresh and reread
  compaction markers fail before sampling and remain present; plugin compaction
  guidance is additive beneath the fixed continuation template;
- `Agent.get` now expresses possible absence in its type, recovered missing
  selections remain unchanged and fail before sampling, and the explicitly
  named hidden `summary` profile reaches the ordinary interactive carrier; and
- `Agent.generate` remains on its fixed structured-output owner, and
  project-copy naming retains its local fallback.

The first implementation/evidence review returned `Revise` with four concrete
counterexamples. The repaired implementation now rejects GitLab Workflow models for
the three stream purposes before installing any executor, approval, preapproval,
or sampling path, and rejects them independently in the dedicated
`Agent.generate` owner before structured-output sampling; keeps hidden primary
Agents out of TUI/ACP discovery while admitting their exact names; resolves an
ordinary recovered Agent before title or any other ordinary sample while
leaving a recovered compaction marker under its own owner; and retries title
generation once on a later turn when the profile returns, guarded by
default-title state and one in-flight attempt per Session.

The implementation/evidence closure pass closed those four findings and found
one further race: both title eligibility and the final write still used a stale
run-start Session snapshot. The repaired owner now reads persisted Session state
before scheduling and again when the asynchronous job begins. The Session
authority serializes ordinary and conditional title writes by Session ID, and a
generated title commits only while the persisted title remains default. A
newer manual title therefore defeats the conditional write, and removal of the
in-flight guard cannot make a stale loop snapshot eligible again.

Re-review confirmed that path but found that the inherited `session.updated`
transition projects a complete Session row. `touch`, metadata, permission, and
the other non-title patch callers could therefore restore the stale title even
though the two explicit title APIs were serialized. The current repair moves
the per-Session lock to the common patch owner, covering the entire read,
snapshot construction, and event publication transition. The conditional title
operation performs its default check and calls the unlocked internal patch only
while holding that same lock, so it does not recursively acquire it.

Closing evidence includes passing OpenCode, Plugin, and TUI
typechecks; 54 passing compaction tests with one intentional v2 skip; 39 passing
ACP directory/session tests; three passing local-context TUI tests; and focused
request, carrier, title, summary, recovery, Agent-resolution, Task, real Copilot
replay, and real GitLab Workflow-class refusal oracles for both stream-purpose
and dedicated generation owners. The workflow oracles observe zero network,
Permission ask, executor, and file-write activity before truthful failure. A
six-test prompt counterexample set now also holds one title sample across a
completed ordinary loop, admits another loop and a manual rename, waits for the
conditional write to discard the generated value, and proves that a later loop
neither samples again nor overwrites the learner title. Its second controlled
barrier stops `touch` after it has built a default-title snapshot, proves the
conditional writer cannot escape the common patch lock, then releases both and
confirms the non-default title survives without a later title sample. A
deterministic production-source audit confirms the closed carrier set. At review
time, a broader `session/llm.test.ts` run passed 24 tests while four custom
nested-runtime cases competed with the outer fixture for its Gate 6-owned
database and stopped before their LLM assertions; that run was not claimed
green. A 2026-07-16 post-close test-only correction made those four nested
runtimes use the explicit process-private `Database.layerFromPath(":memory:")`
injection while the ordinary outer runtime retained the real file database. The
complete file then passed 28 tests with 81 assertions. This corrected test
ownership only and did not reopen Gate 4 or change Gate 6 runtime behavior.

The retained reviewer re-read the whole Gate 4 horizon after the common Session
patch repair, found no new P0–P3 issue, and accepted the implementation/evidence
layer in review run `gate4-20260715-authority-01`. The six focused prompt
counterexamples passed with 28 assertions; the complete Session test file
passed seven tests with 25 assertions; OpenCode typecheck and `git diff --check`
passed; and a source audit found one production full-row Session-update owner
with no bypassing patch publisher. No unrelated monorepo-wide suite or live
external-provider traffic was represented as closing evidence.

## Recorded result

The corrected Gate 4 closes the authority error in those historical checkpoints:
every admitted Agent-driven call is interactive regardless of presentation
metadata; title, compaction, and project-copy naming are the only narrow
released-v1 stream purposes; `Agent.generate` retains its dedicated structured
owner; and internal operations have no executable Agent/domain tool authority.
Carrier admission, missing-profile and recovery behavior, provider lowering,
and Session-title concurrency now follow that boundary.

Gate 4 was previously recorded passed at two code checkpoints:

- `9c7b74f41c6090bc0fa0499c4b1345fa438f0ca6` established the protected
  composition spine and ordinary, OAuth, workflow, and native carrier
  contracts, but also introduced the incorrect `hidden = internal` branch.
- `17e25eab2784b8bd71bef7a91effb9ae352bf0ae` made the released-v1 profiles,
  reminders, tools, hidden prompts, terminal labels, and test fixtures
  learning-first.

The historical released-v1 behavior had one protected Repa core plus protected
program context and an extensible guidance region. Passing a hidden Agent makes
request preparation choose the narrow internal core and omit interactive
learner context; the internal prompt text itself was made learning-first. That
mechanism is now known to classify presentation metadata as authority and is
not an accepted trust boundary. The stock Plan profile now denies arbitrary
shell, Session todo writes, general or unknown subagents, and unknown
MCP/plugin tools; it explicitly permits only read-oriented operations, learner
interaction controls, read-only Explore delegation, and the Repa-owned
plan-file exception. Explicit learner configuration still merges last.

Verification evidence:

- 43 Agent permission/profile tests passed, including default identity,
  deny-by-default Plan and Explore behavior, `.env` and external-root asks,
  plan-file access, and explicit user override.
- 29 focused composition, carrier, hidden-operation, reminder, static
  model-visible-text, and generic-tool-description tests passed.
- the released-v1 skill and direct-terminal footer group passed 40 tests with
  five pre-existing skips; it proves that `customize-opencode` is no longer
  advertised and the visible default mode is Repa.
- affected inherited configuration/tool, SessionPrompt, compaction,
  instruction/processor/snapshot, CLI run/replay, Server, core compaction, and
  TUI groups passed. Their recorded totals were respectively 75; 43 with 14
  skips; 77 with one skip and one todo; 70 with one skip; 47; 2; and 30 tests.
- the remaining changed non-shell tool group passed 154 tests. The shell group
  passed 65 tests when the test process mapped its missing `WINDIR` alias to
  the present `SystemRoot`; the initially absent alias was an environment
  observation, not a product-code fallback.
- Core, OpenCode, and TUI typechecks passed. `git diff --check` passed, and a
  released-production source scan found no stock agent/default/mode identity
  named `build`.
- a fresh-context review inspected the full checkpoint-plus-working-tree delta
  and permission execution paths, reported no blocker, and assigned 0.95
  confidence. It did not substitute for the executable evidence above.

Those results remain evidence for the protected released-v1 composition and
learning-first prompt/profile work, but their hidden/non-hidden oracle did not
close the corrected trust contract. The accepted correction and focused
evidence above now cover public admission, persisted selection, exact
operation-purpose ownership, and the final carrier matrix stabilized by Gate 5.

Four unrelated narrow-width TUI wrapping snapshots differed from their stored
baselines during a wider snapshot run. They were not accepted or rewritten;
the causally changed Repa-label snapshot passed independently.

Classified exclusions remain explicit. Preview-v2 execution and its embedded
configuration skill are hibernated outside the production released-v1 carrier
set. Explicit user-invoked coding command templates such as `/init` and
`/review` remain useful local Agent capabilities; they do not define Repa's
default product identity. Gate 5 owns the settled account, share, commercial,
control-plane, CORS, and updater dispositions. No compatibility alias, old
prompt fallback, second executor, or runtime read from the pre-fork oracle is
authorized.

## Rollback

Revert the Gate 4 checkpoint or the smallest failing slice. A rollback does not
restore old Repa runtime code, read the oracle at runtime, or preserve a changed
prompt behind an alternate profile.
