# Repository guidance

## Product origin

This repository implements a terminal-native agentic learning system. The agent works in a local learning workspace and continuously connects learning goals, course material, evidence, exercises, review, prerequisite gaps, assignments, deadlines, and time budgets.

The product value is not generic file access or good explanations. It is the closed loop:

```text
learning situation -> selected action -> learning activity -> evidence -> revised state -> next action
```

Do not reduce the product to an AI tutor, note generator, Anki skin, todo application, rigid command-line planner, or generic agent with a few learning tools.

## Settled constraints

- The main interaction is a natural-language terminal agent.
- The implementation language/runtime is TypeScript/Bun.
- The harness is owned by this project; full agent frameworks are not the architectural center.
- OpenCode is a pinned, read-only engineering reference, not a dependency or upstream fork.
- The old Rep HarmonyOS project contributes product history only. Its code and data model are not migration targets.
- Learning semantics must shape context construction, default actions, durable session meaning, review surfaces, and task selection. Low-level provider and rendering code should remain domain-independent.

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

## Global coherence check

Before optimizing a local module, confirm:

1. Which product loop step it serves.
2. Which durable fact or invariant it owns.
3. Whether the same concept already exists elsewhere.
4. Whether the change makes the learning system more native or merely expands generic agent infrastructure.
5. Whether the design is copied from OpenCode because the same problem exists here, or only because OpenCode happens to contain it.

## Commands

```powershell
bun run check:reference
bun run typecheck
bun test
bun run check
```
