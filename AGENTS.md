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

## Settled constraints

- The main interaction is a natural-language terminal agent.
- The implementation language/runtime is TypeScript/Bun.
- The harness is owned by this project; full agent frameworks are not the architectural center.
- Harness ownership means owning composition and product semantics, not reimplementing universal agent machinery. Prefer mature open-source interfaces and libraries for provider calls, streaming, tool continuation, cancellation, and rendering unless an observed learning invariant conflicts with them.
- Plan, study, review, and similar modes are policy profiles over one agent loop, not separate runtimes or duplicated executors.
- Trust learner intent while separating reports, observations, evidence, and inference; routine state updates are non-blocking, inspectable, correctable, and reversible.
- OpenCode is a pinned, read-only engineering reference, not a dependency or upstream fork.
- Codex is a pinned, read-only secondary comparison reference; it does not
  change the TypeScript/Bun implementation choice or authorize a fork.
- The old Rep HarmonyOS project contributes product history only. Its code and data model are not migration targets.
- Learning semantics must shape context construction, default actions, durable session meaning, review surfaces, and task selection. Low-level provider and rendering code should remain domain-independent.
- Do not freeze a detailed production architecture from reference study alone. Use isolated labs to expose a concrete semantic or failure boundary first, then promote only the demonstrated invariant.
- Treat explanation, demonstration, guided work, independent work, review, and
  planning as peer Tutor actions. No one action is the mandatory center or
  continuation of every learning interaction.
- One local LearnerHome spans the learner's courses, LearningSpaces, and
  Sessions. Session history is not the long-term learning-state boundary. A new
  Session receives a bounded relevant view and retrieves detail lazily rather
  than importing every old transcript or state record.
- The baseline has no background daemon. Due, overdue, and expired meaning is
  derived from durable times and the trusted clock when the application wakes.
- Treat ordinary substantial assignments as cross-day planning and feedback
  problems, not as last-minute countdown prompts. The program owns accepted
  workload/capacity/deadline arithmetic, allocation, and recomputation; models
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

## Reference boundary

- `.reference/` is read-only research material and is excluded from Git.
- Never edit files under `.reference/`.
- Never import source from `.reference/` into production code.
- When adapting a design, record the source file, pinned commit, preserved invariant, and deliberate differences.
- Preserve required license notices if substantial source is copied. Prefer reimplementation from understood behavior over copying.

## AI engineering rules

- Do not generate the whole repository or scaffold speculative subsystems.
- Do not create an abstraction unless it names a current invariant or has more than one real consumer.
- Do not introduce `manager`, `service`, `repository`, `controller`, or compatibility layers without a concrete boundary they protect.
- Critical contracts require an explanation of ownership, legal state transitions, persistence, recovery, and failure behavior before implementation.
- Prompts are not a substitute for domain rules, authorization, or state transitions.
- Experiments belong under `labs/` and must not be imported by production code. Promote conclusions, not accidental experiment structure.
- Every production change must be small enough that a maintainer can explain why each changed file exists and how data crosses its boundary.
- Prefer deleting a wrong abstraction over preserving it behind a compatibility shim.
- For consequential or uncertain multi-step work, decompose by parent decision
  and evidence boundary, not by file or layer count. Each subtask must name the
  larger uncertainty it resolves and the evidence that ends it. Afterward,
  return to the parent problem and choose again instead of automatically
  extending the latest local design.
- Keep simple problems simple. Do not turn a reversible choice into a general
  framework, ontology, state machine, or benchmark merely to make the work look
  rigorous. A bounded, reversible task with a clear boundary can be implemented
  and verified directly.
- Before inventing consequential reusable machinery for runtime scheduling,
  mode composition, queues, concurrency, caching, recovery, or performance,
  look for a relevant established CS model and inspect mature implementations.
  Use a standard facility directly when it already owns the boundary. Adapt the
  demonstrated invariant, not the reference's package topology or product
  scope.

## Semantic alignment and disagreement

- Distinguish accepted product intent, accepted architecture decisions, working hypotheses, research observations, and illustrative examples. Do not silently promote an example or research vocabulary into a production requirement.
- Product goals, values, and acceptable trade-offs belong to the maintainer. Technical claims, source behavior, and failure properties are settled by inspectable evidence rather than by either human or model authority alone.
- If a requested implementation conflicts with an accepted invariant or concrete engineering evidence, do not comply silently and do not override the intent silently. State the conflict, show the evidence, and identify the smallest reconciliation.
- Ask for maintainer input only when an unresolved choice materially changes product behavior or an expensive-to-reverse boundary. Otherwise use a reversible, documented assumption and continue.
- Preserve meaning with behavioral examples, counterexamples, tests, recorded oracles, and decision provenance. Conversation memory and a model's confident paraphrase are not durable specifications.
- At phase boundaries, re-read the product origin and accepted ADRs, then audit the repository for semantic drift before extending the latest local design.

## Global coherence check

Before optimizing a local module, confirm:

1. Which product loop step it serves.
2. Which durable fact or invariant it owns.
3. Whether the same concept already exists elsewhere.
4. Whether the change makes the learning system more native or merely expands generic agent infrastructure.
5. Whether the design is adapted from a reference because the same problem
   exists here, or only because the reference happens to contain it.

## Commands

```powershell
bun run check:reference
bun run typecheck
bun run test
bun run check
```
