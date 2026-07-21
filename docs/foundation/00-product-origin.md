# Product origin and invariant thesis

## Purpose

The system is a local-first learning agent whose primary interface resembles a
native terminal agent such as Claude Code, Codex, or OpenCode. A user describes
a real learning situation in natural language; the system reads the local
learning workspace, uses tools, teaches, guides learning activities, remembers
what matters, and adjusts later help.

The Tutor must be able to explain concepts, demonstrate procedures, choose
examples, answer questions, and change its teaching approach. Mature agents
already supply many of the underlying model and tool capabilities. This product
connects those capabilities to the learner's goals, history, materials, time,
practice, review, and future learning.

The continuity floor is knowing the relevant course, material, history, and
constraints without asking the learner to restate them. The product payoff is
higher: make content that is currently difficult more tractable, then help the
resulting knowledge remain available and useful. Good explanation and
scientific review are therefore product behaviors, not optional tools layered
over progress tracking.

`Scientific review` means choosing timing and form according to the intended
learning change and available evidence. Retrieval, spacing, comparison,
interleaving, relearning, explanation, application, and real work may all be
useful under different conditions. No one of them is the architecture or the
mandatory continuation of teaching.

## Where the Tutor lives

`Tutor` names the behavior of the integrated Learning System, not the role
played by whichever model answers the current request. The program preserves
the long-running learning loop: goals, course and material position, durable
facts, real constraints, feedback, correction, and future attention. Models
supply flexible semantic capabilities inside that loop: understanding open
material, proposing structure, explaining, demonstrating, generating examples
or tasks, interpreting responses, and adapting the current interaction.

This distinction does not require a code-authored script for every learning
move or prescribe a fixed program/model control ratio. The system may ask a
model to choose, compare, or propose actions when no accepted deterministic
rule exists. The invariant is that durable meaning, authority, correction, and
continuity do not collapse into a prompt or a model assertion. The learner
remains able to steer the immediate activity.

A model may initiate a real, correctable durable write through a system-owned
learning command. The runtime supplies trusted source, identity, revision,
time, permission, and persistence; the model may supply the open semantic
content and decide to write. Legal commitment makes the record part of the
system, but it does not upgrade a report or inference into stronger evidence.

For ordinary substantial planning demands, including assignments and
Goal-driven work such as exam preparation, the program also owns the closed
arithmetic of planning: deadlines, estimated remaining work, known available
capacity, feasibility, allocation across days, completion feedback, and
recomputation after change. A model or learner may propose the estimate,
interpret the work, decompose it semantically, or advise on an exception; those
open judgments become useful inputs only after the Learning System retains
their source and permits correction. The planning demand references but does
not merge the Goal or Assignment that gives it meaning. This is not a fixed
program/model percentage. It prevents a language model from becoming the only
place where five hours of work and six days of capacity are compared.

## Core loop

```text
goal, time, material, history, review pressure, deadlines
                            |
                            v
                 choose next learning move
                            |
                            v
       orient / explain / demonstrate / explore / practice
                  / recall / review / repair / work
                            |
                            v
        observe questions, responses, work, help, and outcome
                            |
                            v
       preserve what matters for future context and planning
                            |
                            +---------------------------> repeat
```

The loop has no mandatory starting action. A learner may need an overview,
worked examples, repeated operation, conceptual explanation, independent work,
or review. The Tutor chooses and combines these moves while the learner can
steer at any time.

The system must be able to distinguish at least these categories conceptually, even if their final data model is not yet settled:

- What happened: observed or reported learning activity.
- What the evidence supports: a fallible inference about current ability or retention.
- What is intended: goals, deadlines, plans, and commitments.
- What was produced: notes, cards, code, reports, and other artifacts.

These categories must not collapse into a single `mastery` field or an undifferentiated chat transcript.

## Native learning behavior

Learning is native when it changes the agent's normal behavior rather than appearing only as optional tools. Examples include:

- Context assembly includes relevant course state, recent evidence, due review, goals, and constraints.
- Teaching uses the course overview and retrieves detail as needed. It does not
  require a complete lesson script or a fully populated knowledge graph before
  the interaction begins.
- Explanation, demonstration, guided work, independent work, and review are
  peer learning moves. Practice is not the required continuation of every
  explanation.
- Explanation does not silently count as mastery.
- Ordinary questions and clarifications do not by themselves prove learning or
  require a learning-state update. If an interaction later affects task
  selection, its educational purpose, conditions, and source must remain
  inspectable.
- Assessment and active recall are normal continuations of teaching.
- Formal task results may create review, diagnostic, or prerequisite-remediation
  candidates according to the task's purpose and conditions. A conversational
  difficulty or one isolated error does not by itself rewrite the course route
  or learner state.
- Source-grounded curricular relations are high-inertia when they exist.
  Learner evidence does not silently edit those relations, while the learner's
  current plan and task sequence remain adaptive.
- Time can make a review due without creating a new learning observation or a
  durable claim that the learner has forgotten.
- A substantial planning demand can change the plan before it becomes urgent.
  It may arise from an Assignment or directly from a Goal such as preparing for
  an exam; those authorities remain distinct. Its subject or learning context,
  source/nature, deadline, estimated remaining work, known capacity, and
  relation to learning determine which facts matter. The behavior is advance
  allocation and later replanning over days.
  Last-minute rescue after a task has collapsed to a minute-scale deadline
  window is outside Repa's product scope.
- When a Session produces a relevant durable change, the learner can inspect
  what was recorded, what was inferred, and what future action changed. A
  routine explanation does not require an expanded end-of-session audit.

An interaction can be educationally valuable while leaving only Session history,
source references, and a modest future reminder. Structured evidence exists to
improve later teaching and planning; it is not a form that every explanation
must fill.

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

The implementation uses TypeScript and Bun. ADR-0014 creates Repa from a
one-time full-history fork of OpenCode `v1.17.18`, after which Repa is an
independent product with its own binary, product semantics, database,
migrations, terminal surface, and release direction. OpenCode is not a runtime
host for a Repa overlay and Repa has no obligation to preserve OpenCode data,
configuration, product behavior, or future v2 migration path.

The fork inherits mature local Session, typed-item, provider, tool,
permission, MCP, subagent, compaction, cancellation, recovery, and terminal
mechanics. Cloud, marketplace, account, sharing, and other group-product
surfaces are outside the baseline. Existing local coding capabilities may
remain available when useful, but learning determines the default Agent
behavior, context, durable meanings, tools, and interface. A coding concept
does not become a Course, Agenda item, learner observation, or Tutor policy by
renaming it.

ADR-0012 still centers the application on one local LearnerHome and separate
learning authorities inside one modular monolith. The inherited Agent loop is
the ordinary execution substrate, not the long-term learning-state model. One
Repa-native SQLite database contains the Interaction and separate learning
authorities without collapsing them into a universal event/fact store.

Before adding new machinery, the design attempts to reduce a required learning
behavior to an inherited or mature mechanism. The reduction is valid only when
the learning behavior's ownership, identity, lifecycle, correction, and
failure contract survive. This is mechanism reuse, not semantic equivalence.
Codex remains a secondary comparison reference for convergent behavior and
failure properties.

## Deliberately unresolved

The following decisions remain open because source research and focused experiments are still required:

- The exact native mapping from inherited Session/message/part records to an
  admitted learner Turn, model operation, physical tool invocation, immutable
  context cut, and terminal outcome. Their distinct meanings and roadmap owner
  are settled; the Durable Turn Gate decides the least duplicate
  representation.
- Richer shapes whose first-boundary consumer has not earned them: broader
  material acquisition and search, richer learner history and evidence,
  additional Agenda meanings, and long-horizon review authorities. Ownership
  and separation are settled; future consumers still decide these unproved
  local shapes.
- The exact selection rules and budgets within the accepted compact-current-
  view plus lazy-detail context architecture.
- Learner-state representation when a demonstrated future action needs more
  than simple progress, task results, and revisits.
- The task-selection policy and its explanation contract.
- The domain-specific persistence layout for learning authorities not yet
  implemented and their corrections. SQLite and Course authority are native;
  the first Agenda consumer semantics are accepted, while its production
  persistence remains consumer-earned.
- The exact learning-native projection and interaction design over inherited
  terminal mechanics. The roadmap now has an explicit terminal
  inspect/correct owner; the TUI framework itself is no longer a blank-page
  choice.

Unresolved does not mean "let AI choose during implementation" or "omit this
from the record." These are explicit, owned future decisions whose first real
consumer and evidence determine their shape.
