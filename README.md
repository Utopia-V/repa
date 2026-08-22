# Repa

Repa is a terminal-native, local-first learning system. Its Tutor helps a
learner work through difficult material, choose a useful next move, connect
learning to real courses and assignments, and continue across days without
reconstructing the whole situation from scratch.

The Tutor emerges from the whole system. Models interpret open language and
materials, explain, demonstrate, research, plan, and adapt to the current
interaction. The program supplies relevant context, executes real tools, and
keeps identity, sources, time, permissions, corrections, transactions, and
recovery coherent across Sessions. The learner provides the goal and steering
and does the work of understanding, recalling, solving, creating, and applying.

## What learning with Repa looks like

A learner can open a local workspace, bring course material or a concrete
problem, and begin in natural language. Repa can orient them, explain a concept,
show a worked example, guide or leave space for an attempt, help with real
coursework, revisit earlier material, and revise its approach when the learner
says that something did not help.

Over time, Repa can draw on courses and materials, goals, assignments, future
attention, learner-state judgments, planning suggestions, and earlier
interactions. It presents a bounded current view to the model and retrieves
detail when the present move needs it.

## Current form

Repa is implemented in TypeScript and Bun. The main interface is a
natural-language terminal TUI. Direct run, attach, local server, and ACP use the
same Session, model, tool, permission, and learning-state runtime for scripts
and integrations.

The repository is an independent product built from a one-time full-history
fork of OpenCode `v1.17.18`. It reuses the mature local Agent harness—providers,
tools, permissions, MCP, subagents, compaction, cancellation, recovery, and
terminal mechanics—while Repa develops its own learning behavior, data,
migrations, interface, and release direction.

## Building Repa

People who want to understand and develop the product should start with
[Building Repa](building/README.md). It follows concrete learning
situations into the project's central questions: model behavior, learning over
time, review, learning data, the current system, and practical development.

Detailed architecture, decisions, research, and engineering evidence remain in
`docs/` for internal maintenance and traceability. They are source material for
the shared account in `building/`, not a prerequisite reading sequence.

## Development

Follow the [development guide](building/development.md) before the first source
run so the worktree uses an isolated LearnerHome database. Contribution scope,
verification, and handoff conventions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Provenance

The fork preserves OpenCode's full upstream history and MIT license. The
[fork notice](FORK-NOTICE.md) records distribution attribution. Exact source
pins and the immutable pre-fork oracle remain available in the internal project
records.
