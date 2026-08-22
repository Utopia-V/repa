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

The ordinary interactive Agent is the default engine for open-language
interpretation, contextual reference, semantic comparison, and local teaching
choice. Repa gives it bounded trustworthy state and tools, including explicit
omission or truncation, and lets it read more or ask a learning-level question
when needed. The program does not duplicate those judgments with phrase lists,
deterministic semantic parsers, exhaustive-candidate proofs, or a second
selector merely because a model can be wrong. Reliability comes from trusted
identity and versions, capability bounds, legal transitions, atomic settlement,
visible results, and correction. A separate deterministic or model-control
mechanism is earned only by an invariant or observed failure that the ordinary
Agent plus those boundaries cannot satisfy.

Long-term Tutor memory follows the same division. The model and learner may
form a fuzzy, correctable judgment about what has been learned, what remains
unstable, or which prerequisite appears missing. The program preserves the
judgment's semantic scope, author, sources, uncertainty, immutable revisions,
and correction lineage; durable admission does not prove the judgment true or
turn it into a global mastery score. Evidence, inference, and the later action
that consumes the inference remain distinct.

Context uses a bounded current index plus lazy exact reads. Eagerly loading all
learner history, plans, deadlines, courses, and evidence would waste model
capacity, expose unrelated personal state, and make old detail compete with the
current request. Exposing no index and requiring blind lazy search would leave
the Agent unable to know what is worth retrieving. Repa therefore gives the
ordinary Agent a small, omission-truthful view of potentially relevant current
state and lets it expand only the detail the current move needs. This resembles
the resource discipline of greedy or dynamic-programming techniques—consume
the useful frontier first and reuse exact subresults when expansion is
needed—but it does not install a deterministic relevance score, hidden
pedagogical selector, or universal cache as product meaning.

This machinery stays below the learner's normal control surface. The learner
speaks naturally; the Agent performs relevant reads and tool calls itself. When
a consequential learner-owned choice is genuinely unresolved, the same Agent
asks in the conversation before writing. Repa does not presume a domain-specific
confirmation ritual, command grammar, internal-ID exchange, or state-management
Turn merely to compensate for ordinary semantic uncertainty.

For cross-day learning, Repa advises rather than acts as a scheduler. The
ordinary Tutor may proactively or responsively propose a scoped learning plan
from the current request, fuzzy learner-state judgments, Goals, Assignments,
deadlines, evidence, and model reasoning. The learner evaluates the suggestion
in the same natural conversation and can ask the Tutor to change it just as a
programmer asks an Agent to revise unsuitable code. This is a continuing
dialogue, not a proposal/approval ceremony or a claim that silence means
acceptance.

A durable learning-plan suggestion is a model- or learner-authored working
document, not a program verdict, learner promise, activity ledger, global
portfolio, or evidence that scheduled learning happened. It normally keeps a
coarse, revisable longer-term direction and makes only the near-term learning
move concrete. Its open semantic body may include rationale, approximate time
pressure, uncertainty, and alternatives; the program owns identity, exact
references, source, revision, lifecycle, permission, settlement, recovery, and
bounded later delivery. Goal and Assignment remain optional referenced owners,
not required containers or merged identities.

Repa must remain truthful when it is used intermittently or alongside learning
outside the program. Trusted time may change a Goal/Assignment deadline
relation or make an old suggestion less useful, but elapsed suggestions,
silence, and absence cannot imply learning, zero progress, adherence, breach,
completion, rejection, or abandonment. On re-entry the Tutor retrieves only
the current learner memory, deadline pressure, and suggestions relevant to the
present move, then revises them through ordinary dialogue when needed. A pure
calculator may assist obvious date or quantity arithmetic if a demonstrated
model failure earns it; no deterministic feasibility, allocation, or planning
authority is pre-authorized.

An Assignment is the separate durable meaning that a substantial
**learning-relevant** obligation exists. It enters the Learning System only
when its subject, source, or pressure can change later teaching, guided work,
review, or a learning-plan suggestion; Repa does not import every
administrative obligation merely because it has a deadline. Its bounded
obligation and learning context, source, optional due boundary, correction, and
explicit lifecycle belong to Assignment authority. Due or overdue relation may
be derived from the trusted clock, but time, a suggestion or its failure, Tutor
narration, and learner silence cannot fulfill or cancel the obligation. A
source-bearing learner report or exact source observation may support an
explicit lifecycle transition without making Repa an external submission
system, independent certifier, homework-completion robot, or metric tracker.

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
       preserve what matters for future context and learning advice
                            |
                            +---------------------------> repeat
```

The loop has no mandatory starting action. A learner may need an overview,
worked examples, repeated operation, conceptual explanation, independent work,
or review. The Tutor chooses and combines these moves while the learner can
steer at any time.

The Learning System, rather than the learner, normally owns turning the current
learning situation into a useful next move. An exact learner request governs
what it specifies. Otherwise Repa may take a transparent, reversible local
choice; it asks when materially different interpretations require a
learner-owned value or commitment, or when authorization and failure
consequences make a default unsafe. The learner may redirect or override at any
time. This is a low-management product responsibility, not a promise that every
ambiguity can be inferred and not a requirement for one fixed selector,
classifier, scheduler, or workflow.

After a correction, interruption, provider failure, restart, or material
change in time or state, the next admitted interaction rebuilds the relevant
situation and chooses again. It preserves already committed effects and does
not blindly replay ambiguous work. The learner is not the application's manual
synchronization mechanism or the routine arbiter among Course, Goal, review,
plan, and recent-Interaction records.

Returning after a gap is the same product boundary, not an exceptional recovery
mode. Repa does not assume that it observed the interval, reconstruct a daily
history from an old suggestion, or require the learner to account for every
missed day before continuing. It distinguishes the last source-bearing learner
judgment and suggestion, what the clock alone can derive, what is now stale or
unknown, and what the current learning move actually needs to clarify.

The system must be able to distinguish at least these categories conceptually, even if their final data model is not yet settled:

- What happened: observed or reported learning activity.
- What the evidence supports: a fallible inference about current ability or retention.
- What is intended or owed: Goals, Assignments, advisory plan suggestions, and
  any separately earned commitments. These are not interchangeable, and a
  suggestion is neither an obligation nor learner assent.
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
- A cross-day learning concern can earn a scoped, advisory plan before it
  becomes urgent. It may arise from the current conversation, an Assignment,
  or a Goal such as preparing for an exam; those sources remain distinct. The
  Tutor combines fuzzy learner-state judgment, learning purpose, deadline
  pressure, uncertainty, and the learner's correction into a rolling suggestion
  whose near term is more concrete than its distant outline. Passage of a
  suggested day or absence from Repa does not create learning, failure, or
  adherence evidence. Re-entry loads only the relevant index and exact detail,
  then revises the future suggestion conversationally when useful.
  Last-minute rescue after a task has collapsed to a minute-scale deadline
  window is outside Repa's product scope.
- When a Session produces a relevant durable change, the learner can inspect
  what was recorded, what was inferred, and the exact operational lineage that
  remains available. Context inclusion, an exact read, a typed citation, and a
  completed Tutor answer do not identify which record caused the answer. A
  routine explanation does not require an expanded end-of-session audit.

An interaction can be educationally valuable while leaving only Session history,
source references, and a modest future reminder. Structured evidence exists to
improve later teaching and advice; it is not a form that every explanation
must fill.

### Learner-chosen Session deletion

Deleting a Session is a learner-controlled choice over the exact current root
and descendant tree, with one uniform mode for that whole scope. The learner may
delete the conversation bodies, Context, read/citation/action associations, and
every optional inspection trace; later inspection can then
report only deleted, unavailable, or unknown source truth that independently
owned learning records still preserve. Or the learner may delete all bodies
while retaining a minimal structured audit containing only exact record
identity/revision, whether it did not enter Context or entered as semantic/full
versus locator-only content, exact read or typed-citation occurrence, the
corresponding operation's `completed | failed | interrupted` terminal state,
deletion time, and body-deleted status.

The choice is explicit and has no silent default. The minimal audit retains no
transcript, learner input, Assistant answer, Context body, Tool input/output,
task result, excerpt, or summary. It records operational lineage only and
cannot explain why a model produced an answer. The learner may later delete
the minimal audit completely; it cannot be recreated after full deletion. A
minimum body-free destructive-operation receipt may survive solely to make the
chosen deletion/purge, replay, and conflict truthful; it is not inspection
lineage and cannot reconstruct any deleted relation or body. While that receipt
survives, a new root, child, or forked Session cannot reuse its exact root ID and
impersonate the deleted Session; the ID remains retired within that local
LearnerHome.

A learner-managed local export file is outside the LearnerHome database, so
Session deletion neither finds nor destroys that backup. Deletion is still
final at the original Session address inside that LearnerHome. An exact
identity-preserving restore is legal only into another LearnerHome/database
where the imported identities are unoccupied. Importing the same material back
into the original LearnerHome is an explicit **new-copy** action: it receives a
fresh Session, Message, Part, Turn, and learner-occurrence identity graph, and
the imported presentations do not regain the deleted Session's Context, Tool,
command, domain, or operational lineage. Repa never silently converts a failed
exact restore into a copy or invents a deleted-to-live incarnation transition.

An import cannot create an empty or ambiguous Session. Every admitted imported
Message and Part belongs to one complete durable administrative-history seal,
is read-only and non-executable, and remains outside Turn, pending-work,
recovery, Context-lineage, and learning-effect truth. Empty, non-renderable, or
executable-looking unfinished bundles and every imported live
`Session.revert`/snapshot/diff state are refused rather than cleared or run.
Imported Message/Part/Patch presentations cannot later be used to revert the
target worktree or delete the sealed history; only a fresh local post-import
suffix may acquire ordinary local revert/unrevert/cleanup meaning.

Exact restore preserves the supported source presentation times and seeds the
restored Session's ordering frontier; a new copy normalizes a fresh presentation
order. Every later transcript writer—including direct shell/admin and other
non-Turn utilities—reserves strict-successor presentation order through the same
Session boundary before an external effect. The first local learner Message and
Turn follow the current frontier, so clock regression or a future backup
timestamp cannot place any new utility or Turn before imported history. Import
alone does not prove learner activity or advance shared learning state.

Independently owned learning records and the minimum body-free receipts needed
to keep their already-committed meaning resolvable retain their own lifecycles.
This Session choice does not silently deep-delete Course, Goal, Assignment,
learner-state, suggestion, policy, or other learning authority state.

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
does not become a Course, Goal, future-attention concern, Assignment, plan,
learner observation, or Tutor policy by renaming it.

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

For open semantic work, the first reduction target is the inherited interactive
Agent loop itself: model context plus model-visible reads and typed tools.
Custom resolvers, classifiers, workflow engines, and semantic state machines
are later hypotheses, not the default meaning of making learning native.

## Deliberately unresolved

The following decisions remain open because source research and focused
experiments are still required. Gates 8 and 12 have already settled the native
occurrence, invocation, Turn, model-operation, tool-membership, and terminal
outcome boundary; those decisions are not reopened here.

- Richer shapes whose first-boundary consumer has not earned them: broader
  material acquisition and search, richer learner history and evidence,
  additional agenda-family meanings, and long-horizon review authorities.
  Ownership and separation are settled; future consumers still decide these
  unproved local shapes.
- The exact selection rules and budgets within the accepted compact-current-
  view plus lazy-detail context architecture.
- The exact first physical schema, bounded scope identity, and retrieval budget
  for model/learner-authored learner-state judgments. Their meaning, separation
  from evidence, fuzzy and correctable authorship, and on-demand Tutor consumer
  are settled; a global mastery scalar and deterministic inference engine are
  not admitted.
- The exact task-selection policy and its explanation contract, including the
  mechanism for representative multiple-candidate conflicts. The
  Learning-System responsibility to provide a low-management default and
  truthful re-entry is settled; whether a case uses the ordinary Tutor LLM, a
  program rule, a bounded control sample, a mixture, or another evidenced
  mechanism remains open.
- Persistence and correction shapes for learning authorities not yet
  implemented. Course/View, Artifact, ContentRoot, readable Representation,
  Material Map/alignment, navigation continuity, retained steering, Goal,
  first learner record, and source-linked future attention are already native;
  Assignment is now native; learner-state judgment memory and advisory
  learning-plan suggestions remain consumer-earned contract candidates.
- The exact learning-native context projection and inspect/correct interaction
  design over the inherited Agent mechanics.

Unresolved does not mean "let AI choose during implementation" or "omit this
from the record." These are explicit, owned future decisions whose first real
consumer and evidence determine their shape.
