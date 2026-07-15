# Repository guidance

## Product origin

This repository implements a terminal-native agentic learning system. The agent works in a local learning workspace and continuously connects learning goals, course material, teaching, examples, learner questions, practice, review, prerequisite gaps, assignments, deadlines, and time budgets.

Good explanation and demonstration are core Tutor behaviors. The product must also decide when and how to teach, connect teaching to the learner's history and goals, notice gaps, revisit material, and handle the surrounding work. Its full loop is:

```text
learning situation -> selected teaching or learning move -> learner interaction
-> durable facts when useful -> revised context and plan -> next move
```

A learning activity does not have to produce a quiz result or a detailed state
update. Do not let the measurability of practice make practice the center of the
product.

The Tutor is the product-level behavior of the whole Learning System, not a
persona assigned to one LLM call. Program-owned state, rules, and feedback keep
the long-running learning loop coherent. Models contribute open-ended semantic
work such as interpreting materials, proposing structure, explaining,
generating examples or tasks, and selecting, comparing, or adapting moves where
fixed policy would be false precision. This is an ownership boundary, not a
fixed control-flow split or a requirement to script every teaching step in
code; the learner can steer and genuinely ambiguous local judgment may remain
model-assisted.

Models may also initiate and semantically author real durable writes through
capability-scoped learning commands. Program-owned authority means the runtime
binds trusted identity, source, revision, time, permission, transaction, and
correction semantics; it does not mean that only deterministic code may decide
or write. A successful write preserves its epistemic basis and does not make an
unsupported model assertion true.

Do not reduce the product to a one-shot chat teacher, note generator, Anki skin,
todo application, rigid command-line planner, or generic agent with a few
learning tools.

## Project decision ownership

- Product foundation documents, accepted ADRs, and the active roadmap own Repa
  product meaning. Gate contracts, plans, implementation slices, tests, and
  reviews derive from them and do not gain authority through detail or
  completion.
- For inherited capability disposition, separately decide baseline membership,
  ordinary reachability, startup/build/release participation, and physical
  source removal. Classify independently useful behavior before following the
  dependency graph; a last reference is implementation evidence, not product
  semantics.
- A lower fork layer may make an accepted decision concrete but may not turn
  optional, deferred, unsupported, or default-off behavior into prohibited,
  permanently removed, or physically deleted behavior without new product or
  engineering evidence.
- Apply maintainer corrections to the owning document and all affected durable
  dependents before resuming implementation. Choose the scope that establishes
  the intended stable product boundary without absorbing an adjacent objective.

## Settled constraints

- The main interaction is a natural-language terminal agent.
- The implementation language/runtime is TypeScript/Bun.
- Repa is an independent product created from a one-time full-history fork of
  OpenCode `v1.17.18`. The project owns the resulting harness composition,
  product semantics, database, migrations, and release direction; OpenCode is
  not a runtime dependency, overlay host, or compatibility target.
- The complete local Agent harness is part of the product destination. Reuse
  the fork's mature Session, typed-item, provider, tool, permission, MCP,
  subagent, compaction, cancellation, recovery, and terminal mechanics rather
  than selectively rebuilding them. Cloud, account, sharing, marketplace, and
  other group-product surfaces are not part of the baseline.
- Learning behavior is first-class: it shapes default Agent behavior, context,
  durable Session meaning, database authorities, tools, terminal surfaces, and
  task selection. Generic harness mechanics remain domain-independent and do
  not become the architectural center merely because they were inherited.
- Before creating new Repa machinery, try to reduce the required learning
  behavior to an inherited or mature mechanism in the computational sense.
  Reuse is valid only when ownership, identity, lifecycle, correction, and
  failure behavior are preserved; it does not imply that an OpenCode coding
  concept and a Repa learning concept are the same thing.
- Plan, study, review, and similar modes are policy profiles over one agent loop, not separate runtimes or duplicated executors.
- Trust learner intent while separating reports, observations, evidence, and inference; routine state updates are non-blocking, inspectable, correctable, and reversible.
- When locally materialized, the pinned OpenCode source-audit checkout lives
  beside the pre-fork oracle worktree, not inside either Git tree. Its pin is
  recorded by the oracle provenance ledger and `references.lock.json`. It
  remains read-only evidence; never import from it or recreate it as a
  production dependency. This fork already carries the accepted full upstream
  history, MIT license, and exact provenance.
- The first fork baseline uses OpenCode's released v1 execution path. Preview
  v2 may supply individually reviewed design ideas, but Repa must not ship or
  maintain v1 and v2 as two production runtimes.
- When locally materialized, the pinned Codex comparison checkout likewise
  lives beside the oracle and is identified by its recorded pin. It is
  read-only secondary evidence, does not change the TypeScript/Bun choice, and
  does not create a second product lineage.
- The old Rep HarmonyOS project contributes product history only. Its code and data model are not migration targets.
- Learning semantics must shape context construction, default actions, durable session meaning, review surfaces, and task selection. Low-level provider and rendering code should remain domain-independent.
- ADR-0014 settles the fork and native-database direction. Current work status
  is owned only by `docs/README.md`; exact passed evidence and provenance are
  indexed by `docs/fork-ledger.md`. Do not copy volatile “next Gate” state into
  this file or promote source resemblance into a working invariant.
- Numbered Gates are the maintainer-facing engineering progress and acceptance
  form for this project. First grill the overall engineering direction and
  architecture, then divide the accepted direction into Gates. Before each Gate
  begins, grill its local design and evidence boundary again.
- A Gate may establish a database, identity, transaction, module, recovery, or
  other structural boundary without completing a user-visible product loop.
  Its legitimacy comes from a real owned invariant, sound integration with the
  accepted architecture, and evidence appropriate to its claim—not from being
  minimal, maximal, reversible, learner-visible, or end-to-end. Commits, tests,
  and internal phases do not become extra Gates by default.
- Treat explanation, demonstration, guided work, independent work, review, and
  planning as peer Tutor actions. No one action is the mandatory center or
  continuation of every learning interaction.
- One local LearnerHome spans the learner's courses, LearningSpaces, and
  Sessions. Session history is not the long-term learning-state boundary. A new
  Session receives a bounded relevant view and retrieves detail lazily rather
  than importing every old transcript or state record.
- Within one Session, preserve the conversation as model context while it fits.
  Do not routinely truncate it merely because durable learning state exists.
  Near the model context limit, compact older history while retaining a recent
  verbatim tail and the original durable transcript; a compaction summary is
  continuation context, not learning truth. The exact threshold and projection
  remain a generic harness design decision.
- The baseline has no background daemon. Due, overdue, and expired meaning is
  derived from durable times and the trusted clock when the application wakes.
- Treat ordinary substantial assignments as cross-day planning and feedback
  problems. Last-minute rescue is outside Repa's product scope: do not design,
  schedule, prioritize, or qualify Learning-System behavior around a task that
  has already collapsed to a minute-scale deadline window. The program owns
  accepted workload/capacity/deadline arithmetic, allocation, and recomputation; models
  may help identify, estimate, semantically decompose, research, explain, and
  adapt the work. This settles the responsibility boundary, not the final
  schema or scheduling algorithm.
- A pre-authored course is optional. The same Agent loop may research and
  create a coarse provisional Course View, use it immediately, and later
  correct or supersede it without promoting unsupported relations into hard
  truth.
- ADR-0012 centers a single-process modular monolith on separate learning
  authorities. Interaction, source/artifact, Course View, Material Map,
  learner record, Agenda, and Tutor policy must not collapse into the Agent
  runner, one universal graph/fact table, or prompt memory.

## Decision-record continuity

- The one-time fork does not discard Repa's product and engineering history.
  Product foundation documents, accepted ADRs, the active roadmap, gate
  contracts, and passing evidence remain required engineering context and must
  be carried into or made durably reachable from the production fork.
- The active normative map is `docs/README.md`; provenance and passed Gate
  evidence are indexed by `docs/fork-ledger.md`. Full pre-fork evidence remains
  reachable through immutable tag `repa-prefork-oracle`, not through the
  location or current branch of a sibling worktree.
- Old Repa production code, databases, and labs are not migration targets.
  Retain them only as historical evidence, behavioral oracles, or individually
  reviewed carry candidates; never bulk-import them to preserve familiarity.

## Reference boundary

- `.reference/` is an ignored local materialization beside the oracle worktree,
  not content stored by the oracle commit and not part of this tree. If
  consulted there, it is read-only research material excluded from Git.
- Never edit oracle `.reference/` files or import them into production code.
- The production fork has already been obtained from full upstream history at
  the accepted tag/commit. Preserve that history and required MIT notices.
- When adapting a design, record the source file, pinned commit, preserved invariant, and deliberate differences.
- Inherited source may be transformed inside this real fork. Prefer public
  libraries or behavior-level reuse over copying isolated reference files.

## AI engineering rules

- Do not generate the whole repository or scaffold speculative subsystems.
- Do not create an abstraction unless it names a current invariant or has more than one real consumer.
- Do not introduce `manager`, `service`, `repository`, `controller`, or compatibility layers without a concrete boundary they protect.
- Critical contracts require an explanation of ownership, legal state transitions, persistence, recovery, and failure behavior before implementation.
- Prompts are not a substitute for domain rules, authorization, or state transitions.
- Legacy labs remain in the pre-fork oracle and are not copied here. A current
  gate may authorize a new isolated experiment only with an explicit question
  and deletion condition; production code must not import it. Promote
  conclusions, not accidental experiment structure.
- Scope each production change around one coherent boundary so a maintainer can
  explain why every changed file exists and how data crosses it. Complete the
  boundary rather than optimizing diff size or preserving a wrong abstraction.
- Prefer deleting a wrong abstraction over preserving it behind a compatibility shim.
- For consequential or uncertain multi-step work, decompose by parent decision
  and evidence boundary, not by file or layer count. Each subtask must name the
  larger uncertainty it resolves and the evidence that ends it. Afterward,
  return to the parent problem and choose again instead of automatically
  extending the latest local design.
- Match the mechanism to the actual invariant and uncertainty. Implement a
  bounded local problem directly when its owning boundary is sound; rebuild the
  relevant boundary when local patches would preserve the cause, add exceptions,
  or create parallel paths. Do not introduce a framework, ontology, state
  machine, benchmark, or compatibility layer merely to make work look rigorous
  or to reduce the current diff.
- Scope verification to the change and the claim, not to a habitual command
  bundle. Run a check when a plausible outcome can falsify the claim or change
  the next engineering decision, and choose among equally decisive checks by
  cost and dependency reach. Pure documentation or research-record
  changes normally need diff, link, formatting, and worktree checks—not
  typecheck, build, or product tests—unless they alter executable configuration
  or a generated contract. A focused code or test change runs its owning check
  and directly affected suite; broaden only when dependency reach or risk makes
  another result causally relevant. Reserve full applicable suites for actual
  phase boundaries, releases, cross-cutting changes, or evidence invalidated by
  environment/source drift. Do not run unrelated checks merely to perform a
  verification ritual.
- Before inventing consequential reusable machinery for runtime scheduling,
  mode composition, queues, concurrency, caching, recovery, or performance,
  look for a relevant established CS model and inspect mature implementations.
  Use a standard facility directly when it already owns the boundary. Adapt the
  demonstrated invariant, not the reference's package topology or product
  scope.

## Semantic alignment and disagreement

- Distinguish accepted product intent, accepted architecture decisions, working hypotheses, research observations, and illustrative examples. Do not silently promote an example or research vocabulary into a production requirement.
- Product goals, values, and acceptable trade-offs belong to the maintainer. Technical claims, source behavior, and failure properties are settled by inspectable evidence rather than by either human or model authority alone.
- If a requested implementation conflicts with an accepted invariant or concrete engineering evidence, do not comply silently and do not override the intent silently. State the conflict, show the evidence, and identify a causally complete reconciliation proportional to the conflict.
- Ask for maintainer input only when an unresolved choice materially changes
  product behavior, an accepted trade-off, or an expensive boundary. Otherwise
  make a documented engineering judgment proportional to the evidence,
  uncertainty, and lifecycle cost.
- Preserve meaning with behavioral examples, counterexamples, tests, recorded oracles, and decision provenance. Conversation memory and a model's confident paraphrase are not durable specifications.
- At phase boundaries, re-read the product origin and accepted ADRs, then audit the repository for semantic drift before extending the latest local design.

## Agent collaboration and context economy

- The maintainer gives standing permission to use subagents or delegation in
  this repository when the available harness supports them. Permission is not a
  requirement to delegate. Use a fresh worker context when a bounded,
  preferably read-only investigation will produce much more raw material than
  the conclusion needed by the main agent, or when genuinely independent work
  benefits from parallelism. Keep tightly coupled reasoning in one context.
- At a consequential parent decision boundary, identify the coherent decision
  the main agent still owns, any bounded high-entropy investigation suited to a
  fresh worker, and whether one independent review question could still change
  acceptance. Internal implementation slices and atomic commits do not become
  user-visible Gates unless they introduce a new parent product decision or
  evidence boundary. Do not spawn workers performatively when the work is one
  coupled model.
- Independent review is not a confidence ritual. Use one fresh, preferably
  read-only context only when a concrete decision, design, security,
  data-integrity, implementation, or evidence question can still change the
  result. Give it the relevant authority chain—maintainer intent, accepted
  decisions, the agent's derivation, and recent corrections—and allow it to
  reject an agent-authored contract. The main agent owns evaluation and
  integration; same-context self-checking is not independent review.
- Give a worker its parent question, motivation, scope, exclusions, and a
  bounded evidence contract. It returns conclusions, decisive evidence,
  confidence, and remaining unknowns rather than raw logs or a second project
  narrative.
- After delegating exploration, the main agent does not repeat it. If there is
  no genuinely non-overlapping work, use one task-sized event wait instead of
  short polling, heartbeat narration, premature wrap-up requests, or invented
  "lightweight" duplicate exploration. Spot-check only evidence that can
  change the decision after the worker returns.
- Treat maintainer corrections as control input, not invitations to restate
  the newly accepted concept. Identify the invalid prior claim, audit which
  decisions, documents, code, tests, or plans depended on it, and make the
  causally complete repair before resuming dependent work. If nothing durable
  was affected, say that briefly. Do not fill the response with a tutorial the
  maintainer just gave.
- Before asking a factual question, research it and form a recommendation.
  Ask the maintainer only about unresolved choices that can change product
  behavior, acceptable trade-offs, or expensive-to-reverse boundaries. State
  the live decision, the recommended answer, and the material consequence of
  alternatives so the question never has to be decoded.
- Use an explicit `grill-me` interaction only for a consequential cluster of
  dependent product or architecture choices. Resolve one live dependency at a
  time, stop when remaining uncertainty is cheap or no plausible answer changes
  the plan, and promote accepted durable decisions to the owning document.
  Situational answers do not become timeless user preferences.
- Use “steer-work” only as the parent control layer for a consequential
  contract, semantic correction, deletion, or architecture boundary. Pair it
  with the independently triggered exploration, project-document, planning,
  execution, debugging, testing, verification, review, delegation, or Git
  skill that owns the actual work. Its internal challenge should try to falsify
  the current framing and compare the stable outcomes of narrower and wider
  scopes. Bring only unresolved maintainer-owned trade-offs to “grill-me”.
- Treat `grill-me` as high-variance decision extraction, not exhaustive
  interviewing. A question is admissible only when repository/reference
  research cannot settle it, the maintainer can actually control the answer,
  at least two plausible answers lead to materially different product behavior
  or an expensive boundary, and deciding now is cheaper than discovering the
  mismatch during implementation. Ask the highest upstream admitted question
  first, include a reasoned recommendation, and derive downstream questions
  from its answer. Do not ask for facts, confirmation of already accepted
  intent, generic preferences without a concrete consequence, implementation
  trivia the agent should own, or hypothetical branches whose answers would
  not change the next plan.

## Global coherence check

Before optimizing a local module, confirm:

1. Which product loop step it serves.
2. Which durable fact or invariant it owns.
3. Whether the same concept already exists elsewhere.
4. Whether the change makes the learning system more native or merely expands generic agent infrastructure.
5. Whether the design is adapted from a reference because the same problem
   exists here, or only because the reference happens to contain it.

## Verification commands

The fork intentionally rejects root-level test execution. Run focused tests and
package typechecks from the affected package, for example:

```powershell
cd packages/opencode
bun test <relevant-test-files>
bun run typecheck
```

Run package builds or broader suites at real phase/release boundaries, not as a
habitual sequence. The pre-fork `check:reference` and `check` command names are
not assumed to exist in the fork.

## Inherited OpenCode engineering conventions

The following conventions describe retained fork implementation details. They
remain useful where the inherited code still owns the mechanism, but the Repa
product, architecture, evidence, and collaboration rules above take precedence.
Upstream repository topology or release-process facts are not automatically
Repa requirements.

- To regenerate the legacy JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.

## Branch names

Use a short descriptive branch tail and the namespace required by the active
harness; Codex-managed branches use the `codex/` prefix. Do not assume the
upstream OpenCode `dev` branch is Repa's integration base.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the affected package or area when helpful, e.g. `core`, `opencode`, `tui`, `app`, `desktop`, `sdk`, or `plugin`.

Examples: `fix(tui): simplify thinking toggle styling`, `docs: update contributing guide`, `chore(sdk): regenerate types`.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.
- In Effect generators, bind services to named variables before calling methods. Do not use nested service yields such as `yield* (yield* Foo.Service).bar()`.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- Never alias imports. Do not use `import { foo as bar } from "..."` or renamed imports like `resolve as pathResolve`.
- Never use star imports. Do not use `import * as Foo from "..."` or `import type * as Foo from "..."`.
- If a namespace-style value is needed, import the module's own exported namespace by name, for example `import { Project } from "@opencode-ai/core/project"`, then reference `Project.ID`.
- Prefer dynamic imports for heavy modules that are only needed in selected code paths, especially in startup-sensitive entrypoints. Destructure dynamic import bindings near the top of the narrowest scope that needs them so they read like normal imports. Avoid inline chains such as `await import("./module").then((mod) => mod.value())` or `(await import("./module")).value()`. Keep branch-specific imports inside the branch that needs them to preserve lazy loading.

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract only when it names a real concept like `requireConfig` or `readMetadata`.
- Do not return `Effect` from helpers unless they actually perform effectful work. Synchronous parsing, validation, and option building should stay synchronous.
- Prefer Effect schema helpers such as `Schema.UnknownFromJsonString` and `Schema.decodeUnknownOption` over manual `JSON.parse` wrapped in `Effect.try` when parsing untrusted JSON strings.
- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or control flow.

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.

## Inherited preview-v2 notes

These rules constrain maintenance of inherited preview-v2 files only. They do
not authorize enabling v2 as Repa's production runtime or maintaining v1 and v2
as parallel product paths; the settled Repa baseline remains the released-v1
execution path until a later accepted gate changes it.

- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
- Keep the System Context algebra, registry, and built-ins in `src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
