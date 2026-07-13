# Proposal: post-benchmark production contract slice

Date: 2026-07-11

Status: Archived; not a current roadmap. Paused after maintainer review. The deterministic task path below may
remain useful as a runtime mechanism test, but it overweights gradable practice
and is not accepted as the first product path. Full Tutor behavior must be
restored before implementation sequencing resumes. See
[`../foundation/02-what-the-tutor-does.md`](../foundation/02-what-the-tutor-does.md).
The active path is
[`03-learning-native-behavior-baseline.md`](./03-learning-native-behavior-baseline.md).

## Why the earlier slice is paused

ALS-015 and ALS-016 validated safety and authority boundaries but did not
validate a general evidence candidate, learner projection, or inferred-state
selector. Implementing the earlier plan literally would turn a failed lab
representation into production architecture.

The accepted runtime ADRs remain valid. The learning-domain implementation
scope must become smaller without turning the system into a generic chat
harness.

## Historical proposed path

The paused proposal used a task whose grading was deterministic and deliberately
binary:

```text
durable user Turn
-> source-linked formal task with declared purpose and target
-> learner response under recorded assistance conditions
-> deterministic task-local grader returns correct or incorrect
-> one atomic SQLite transaction records result, narrow interpretation,
   local obligation, and tool settlement
-> correction can retract the interpretation without deleting the source
-> next context exposes the active obligation and provenance
```

This can test a bounded persistence and recovery mechanism. It does not cover
teaching, explanation changes, guided work, learner questions, or the Tutor's
choice among different ways to learn.

## What the slice owns

- Session, Turn, logical model operation, tool invocation, and finite
  continuation according to ADR-0005 and ADR-0007;
- formal task identity, educational purpose, declared targets, source revision,
  response reference, and observed assistance;
- one task-local deterministic grader revision;
- an active/retracted interpretation whose meaning is limited to that grader;
- a local verification or targeted-review obligation derived mechanically from
  the admitted result; and
- atomic tool settlement plus learning write according to ADR-0006.

## What it deliberately does not own

- a universal `partial`, mastery, claim, or justification ontology;
- LLM admission of arbitrary educational meaning;
- a generalized learner projection;
- task-ranking weights or a model selector;
- retention/FSRS parameters;
- curriculum generation or mutation; or
- TUI, provider fleet, Anki, Obsidian, MCP, PDF, or external effects.

## Required counterexamples

1. Ordinary clarification changes Session history and no learning record.
2. A hinted correct result creates verification, never independent evidence.
3. An incorrect exact-rule result creates a local review obligation without
   changing curricular relations.
4. A forged source, target, assistance condition, or operation ID is rejected
   before commit.
5. Correction retracts the interpretation and rebuilds obligations from active
   records.
6. Time changes due pressure without inserting a result.
7. Tool settlement and local learning state either commit together or not at
   all.

## Later falsifier for durable state value

A future selector experiment is justified only when the correct action depends
on accumulated history absent from the current interaction. The stateless
baseline must not receive a prose summary from which it can reconstruct that
history. Until such a test discriminates, selection remains a policy hypothesis
and does not deserve a production framework.

## Re-entry condition

Do not implement this document as the first product slice. Reconsider any of its
mechanisms only after several complete Tutor interactions have been traced and
the mechanism has a clear role in those interactions.
