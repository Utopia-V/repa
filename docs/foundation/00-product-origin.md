# Product origin and invariant thesis

## Purpose

The system is a local-first learning agent whose primary interface resembles a native terminal agent such as Claude Code, Codex, or OpenCode. A user describes a real learning situation in natural language; the system reads the local learning workspace, uses tools, conducts learning activities, gathers evidence, updates an inspectable learning state, and changes the next action accordingly.

The system is not defined by whether it can explain a concept, edit Markdown, search the web, run code, parse PDFs, or call Anki. Mature agents already supply those general capabilities. The product is defined by the learning control loop they participate in.

## Core loop

```text
goal, time, material, history, review pressure, deadlines
                            |
                            v
                     choose next action
                            |
                            v
              learn / recall / drill / repair / work
                            |
                            v
             observe answer, process, help, and outcome
                            |
                            v
                 revise inspectable learning state
                            |
                            +---------------------------> repeat
```

The system must be able to distinguish at least these categories conceptually, even if their final data model is not yet settled:

- What happened: observed or reported learning activity.
- What the evidence supports: a fallible inference about current ability or retention.
- What is intended: goals, deadlines, plans, and commitments.
- What was produced: notes, cards, code, reports, and other artifacts.

These categories must not collapse into a single `mastery` field or an undifferentiated chat transcript.

## Native learning behavior

Learning is native when it changes the agent's normal behavior rather than appearing only as optional tools. Examples include:

- Context assembly includes relevant course state, recent evidence, due review, goals, and constraints.
- Explanation does not silently count as mastery.
- Assessment and active recall are normal continuations of teaching.
- Errors may redirect the session toward a prerequisite rather than merely producing another explanation.
- Assignment urgency and learning value can change the session plan.
- The end of a session exposes what was observed, what was inferred, and what future action changed.

## Product boundaries

The project must not drift into:

- a generic terminal agent with learning tools installed;
- a chat tutor whose state is conversation memory;
- a note organizer whose output is mistaken for learning evidence;
- an SRS application that flattens every skill into a card;
- a todo planner that cannot reason about knowledge and evidence;
- a course platform that requires all material to live in a closed curriculum.

## Relationship to earlier work

Rep was a small HarmonyOS course project used to explore planning, knowledge dependencies, FSRS, course import, exercises, and local state. It is not a code-quality baseline, architecture template, compatibility target, or data-migration source. The relevant product ideas have been restated here and must be reconsidered independently.

## Current technical decision

The main implementation uses TypeScript and Bun. OpenCode is the primary engineering reference because it demonstrates a production terminal agent, not because its coding-specific architecture should be inherited. The harness will be implemented in this repository after its mechanisms are understood.

## Deliberately unresolved

The following decisions remain open because source research and focused experiments are still required:

- The durable message/session event model.
- The exact boundary between the generic runtime and learning application layer.
- Learner-state representation and confidence/calibration.
- The task-selection policy and its explanation contract.
- Persistence layout and correction/retraction semantics.
- TUI framework and the point at which a richer interface is justified.

Unresolved does not mean "let AI choose during implementation." These are explicit design decisions to settle with evidence.
