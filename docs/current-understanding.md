# Current understanding

Date: 2026-07-13

Status: Navigation and phase-boundary record. This document separates settled
decisions from hypotheses and abandoned directions. It does not override the
product foundation or accepted ADRs.

## Settled product intent

- The product serves a cooperative learner who wants to make steady progress.
  It does not spend its effort detecting deliberate self-deception. Honest
  reports can still differ from observed performance.
- The main interface is a local terminal Tutor. The Tutor handles much of the
  surrounding work: course orientation, material selection, teaching,
  demonstration, practice, review, gap repair, planning, assignments, and
  deadlines.
- The Tutor is the whole Learning System, not an LLM persona. Program-owned
  state and feedback preserve durable continuity and authority; models provide
  flexible semantic interpretation, generation, and interaction and may
  participate in choices that no accepted deterministic policy settles. This
  neither fixes the exact control split nor makes pedagogy a program script.
- Explanation, demonstration, guided work, independent work, practice, review,
  and planning are peer actions. No action is the required continuation of
  every interaction.
- A central product outcome is to make currently difficult material more
  tractable and then help the resulting knowledge remain available and usable.
  Difficulty depends on goal, material, prior interaction, representation, and
  constraints; it is not a stable learner label. Scientific teaching and
  review therefore mean purpose-sensitive selection and feedback, not one
  mandatory method or scheduler.
- A course has a broad route. The Tutor needs enough of that route to orient
  teaching, while detailed material can be retrieved when it becomes relevant.
- A pre-authored course is not required. When the learner only names a subject,
  ordinary Agent research and semantic capabilities may create a coarse,
  provisional, correctable route and begin helping immediately.
- A local difficulty can add review or alter the near-term sequence. One error
  does not normally rewrite the course route.
- "Read" or "explained" may be useful progress facts. They do not imply
  mastery, and they do not require an immediate quiz or a detailed learner
  model.
- Raw local Sessions remain available. Small summaries and source references
  exist to improve later help, not to replace the original interaction.
- Learning is first-class only when course position, goals, due review,
  specific pending revisits, assignments, deadlines, and learning history
  alter the agent's normal context and actions without the learner having to
  restate them.

## Settled engineering decisions

- The implementation uses TypeScript and Bun.
- This project owns harness composition and learning semantics. Mature
  libraries may supply provider calls, streaming, tool continuation,
  cancellation, rendering, and other generic mechanics.
- ADR-0011 fixes the production runtime direction: one single-process,
  model-led Tutor loop; AI SDK owns provider/stream/tool transport mechanics;
  Repa owns Turn composition, per-sample learning context, durable learning
  command authority, and truthful continuation. Its runnable terminal dogfood
  milestone is complete.
- ADR-0012 fixes the overall architecture: a single-process modular monolith
  centered on learning authorities rather than on the Agent loop. One local
  LearnerHome spans courses, LearningSpaces, and Sessions; one process owns its
  writes, SQLite owns machine state, and no daemon runs while the terminal is
  closed.
- ADR-0013 fixes the demonstrated state-to-model control topology: no mandatory
  selector model. Tutor composition filters program-known legality and may
  bind one legal Agenda concern as an exact, Turn-scoped conditional default;
  the exact current request remains higher priority, and selection remains
  separate from service, evidence, and durable activity.
- Roadmap 06 has now supplied ADR-0012's first complete vertical consumer.
  Source-grounded Markdown and no-material provisional starts share one
  versioned Course View; bounded material, route position, inspection,
  correction/supersession, explicit material realignment, and fresh-Session
  continuation run through the production Tutor loop. Route position remains
  navigation continuity, not mastery or a substitute for learner history.
- Roadmap 07 supplies the first production Agenda consumer. A model can create
  one source-linked future-attention concern for the sampled Course View item;
  bounded meaning reaches a fresh Session, cold source detail stays lazy, and
  a later aligned learner occurrence can address it without creating evidence
  or mastery. Terminal dispositions remain inspectable and can be reopened from
  explicit learner correction. This proves one durable return boundary, not a
  generic task system, review scheduler, or complete teach-adapt-return policy.
- One immutable model context may initiate at most one durable learning-state
  mutation. Local Tutor tools settle through one per-Turn FIFO lane, and a
  second mutation waits for a new context cut. This is a causal consistency
  rule for model/tool concurrency, not a learning workflow or separate runtime.
- One state-changing terminal process owns a LearnerHome through a separate
  SQLite `BEGIN IMMEDIATE` ownership file. This leaves the main state database
  free to commit each Turn/domain transition and releases ownership on process
  exit without a daemon or guessed stale-lock timeout.
- Interaction, sources/artifacts, optional domain foundations, Course Views,
  Material Maps, learner records, Agenda, and Tutor policy retain separate
  authority. They use typed references; they do not become one universal
  graph, event, fact, or mastery model.
- ALS-020 now establishes the first Agenda meaning boundary: a revisit is a
  correctable, source-linked future-attention concern, not the review activity
  or learning evidence. It preserves enough bounded reason to distinguish why
  later attention matters; current context still helps choose the concrete
  form. Due status only makes it a candidate. Beginning, serving, dismissing,
  and evidencing learning remain separate meanings.
- ALS-022A-E establish the next, narrower composition boundary for one tested
  behavior. Explicit purpose binding repaired realization, but two mandatory
  model selectors failed (12/22 and 10/18). Removing that classifier and
  binding the sole legal concern as a conditional default inside the ordinary
  realizing sample passed 10/10 generic, direct-help, requested-form,
  completed-occurrence, and redirection contrasts. Exact reason plus default
  status alone then passed only 3/8 under strict review, earning one explicit
  `learner response before Tutor disclosure` constraint. Candidate concern,
  conditional selected purpose, operative constraint, exact current request,
  model realization, service occurrence, and evidence remain separate. This
  does not earn a durable activity, general constraint vocabulary, or
  multi-candidate scheduler.
- Tutor context is a bounded, immutable observation over those authorities.
  Routine context carries a small relevant view and references; exact
  materials, old Sessions, attempts, and full maps remain lazy reads.
- Course Views use a versioned ordered hierarchy plus only the sparse,
  module-owned, typed, provenance-bearing relations that real queries earn.
  Material alignment, learner progress, and Agenda remain separate. SQLite is
  selected, not a graph database.
- Session order, local commit order, mutable entity versions, Course View
  revisions, artifact content revisions, policy revisions, and context cuts
  have distinct meanings. A global revision may be an audit watermark but is
  not the universal precondition for unrelated domain commands.
- A model-created no-material route commits as a working provisional Course
  View. It may guide teaching, but unsupported assertions cannot silently
  become hard curricular blockers or verified learner state.
- Model-callable write transport is ordinary Agent machinery. It is not a
  product subsystem worth designing on its own. Repa owns only the domain
  meaning and authorization of durable learning-state transitions carried by
  that transport.
- OpenCode is the primary pinned reference and Codex is a secondary pinned
  comparison reference. Neither is currently a production dependency or an
  adopted fork. A downstream OpenCode fork remains a falsifiable substrate
  candidate, not the default hidden by ADR-0001.
- One agent loop serves different policy profiles. Plan, study, review, and
  similar labels do not create separate runtimes.
- A durable Turn groups one admitted user request and the resulting model and
  tool work. Provider completion, tool settlement, and Turn completion remain
  distinct.
- Compaction may show the model an existing recent user item again. Only a new
  admitted input identity begins another Turn or creates another occurrence;
  repeated text is context, not a new command or new learning evidence.
- Coordination that has no restart consumer remains process-local. Every Turn
  has finite code-enforced continuation limits.
- SQLite is the authoritative machine store for the first implementation.
  Markdown may be a material or an artifact; it is not the learning-state
  authority.
- When one Repa-owned local command commits related learning facts and its own
  local receipt, those writes cannot contradict each other. Local effects use
  one SQLite transaction; future external connectors own their own permission,
  idempotency, and reconciliation. This rule does not require every teaching
  interaction to produce a learning write.
- A model may directly initiate and semantically author a durable learning
  command. The runtime binds trusted source, identity, time, revision, and
  permission; the domain validates and commits. Legal admission does not turn
  a report or inference into stronger evidence. See ADR-0008.
- Physical tool invocation, command-defined semantic effect, durable causal
  occurrence, and provenance have separate identities. A new call ID cannot
  duplicate an existing effect, while a genuinely new occurrence remains
  recordable. See ADR-0009.
- Learner steering that must survive a sampling or Session boundary is retained
  as scoped Tutor policy, not stable preference or learning evidence. Active
  contributions are recomputed for one immutable context cut. See ADR-0010.
- Each model operation owns one immutable context cut; a preview cannot silently
  become the admitted request after its time-sensitive meaning changes. The
  current implementation compiles and admits it inside one SQLite transaction;
  ADR-0012 additionally requires typed dependencies and capabilities as the
  context grows.
- Every Turn has a finite execution boundary, and a rejected over-limit attempt
  is not invented as work that ran. The current candidate uses separate
  model/tool budgets and an exhaustion receipt; exact counters and recovery
  ownership remain open.
- ALS-018 produced executable source for one learning-wide, time-bounded,
  source-grounded learner instruction per admitted source. It has no provider
  loop, complete transcript API, general tool executor, cancellation runner, or
  TUI, so its successful tests do not by themselves establish a production
  agent spine.
- ADR-0011's first dogfood milestone supplied the missing real
  consumer: `bun run repa` executes an AI-SDK model/tool loop, recompiles
  learning context between samples, persists user/tool/assistant history, and
  continues from the same SQLite Session in another process. A separate real
  invocation also proved that a **new Session**, containing only its own new
  user/assistant items, receives still-relevant learning-wide state from the
  shared Learning System. Roadmap 06 has since added real Course View and
  material continuity: a separate provider trace registered local Markdown,
  read exact revision-bound ranges, advanced the route, and resumed the next
  range in a fresh Session without importing the old transcript.

## Directions no longer used as defaults

- A mandatory quiz after every explanation.
- A detailed evidence record for every educational exchange.
- A universal scalar mastery value or a complete learner projection before a
  future action needs it.
- A global `teach -> test -> master` learning state machine.
- A mandatory expanded StateDiff before every routine learning update.
- Treating a deterministic formal exercise as the first complete product path.
- Treating model-generated summaries as original observations.
- Rewriting source-grounded curricular relations after one learner error.
- Making Markdown notes the machine source of truth.
- Adopting a full agent framework as the architectural center merely to avoid
  writing the learning layer.
- A broad multi-condition simulated-student benchmark as the automatic next
  phase.
- Ordering the product roadmap by the next unimplemented authority or table,
  such as activity records before Agenda and review. Engineering dependencies
  remain real, but learner-visible behavior chooses which boundary is pressured
  next.
- A stored universal intervention pipeline, difficulty taxonomy, or
  `FutureAction` that unifies every reason to teach, review, plan, or work.

The formal-task, evidence-interpretation, and learner-projection work remains
useful as research history and as a possible bounded mechanism for future
assessments. It does not define the general Tutor interaction.

## Current working hypotheses

These statements are deliberately weaker than accepted decisions.

1. The exact routine current view still needs pressure from real courses. The
   architecture fixes compact projection plus lazy detail, but not one global
   list of fields or a universal token budget.
2. A minimal progress fact such as "this material range was read" or "this
   range was explained" may help a demonstrated later action avoid needless
   reintroduction. Route position and raw Session history may already be enough
   in other cases, so the fact is not an automatic next production concept.
3. A working provisional route can probably guide useful early teaching before
   it is richly source-grounded, provided its basis remains visible and hard
   constraints require stronger support.
4. Program-filtered legal candidates plus a conditional one-candidate default
   and a source-bound operative constraint may be enough for near-term purpose
   selection while the exact current request retains higher priority. A
   mandatory DeepSeek-V4-Flash selector is rejected. General constraint
   vocabulary and multi-candidate choice remain unproved; a deterministic
   scheduler score has not been earned.
5. Learner inference can remain sparse and consumer-specific until actual
   attempts, review, or open work demonstrate a need for a richer projection.

## Questions still worth resolving

- Which first real course branch needs more than the pairwise alternative used
  in ALS-019, such as an explicit choice group or joint requirement?
- Which route-anchor changes deserve durable progress, and which temporary
  focus/rejoin choices remain Agenda state or one-Turn reasoning?
- How should a later syllabus or curated foundation reconcile stable item
  lineage with an earlier Agent-created provisional route?
- Which difficulty in a real explanation requires durable state at all, and
  which can be handled from the current request, recent Session interaction,
  and lazy source detail?
- Which review purposes need deterministic timing or eligibility, and which
  need model-selected form such as recall, comparison, explanation,
  application, or relearning?
- Which current facts should be loaded on every Turn, and which should be
  retrieved only for the active learning move?
- Which task-selection decisions need deterministic rules, and which can remain
  model judgment with inspectable reasons?
- Which non-time scopes, such as course-, section-, Session-, or
  condition-bounded steering, have a demonstrated future consumer worth a
  durable representation?
- Which durable causal occurrence and domain address belong to each future
  model-writable progress, revisit, assignment, and attempt command?
- Beyond the earned learner-response-before-disclosure boundary, which Agenda
  purposes actually need another explicit operative constraint rather than
  exact reason alone?
- What reversible behavior handles several materially different eligible
  concerns before any ranking policy is earned?
- How should internal Agenda/control rationale and pre-tool prose be kept out
  of learner-visible Tutor dialogue while natural reminders remain possible?
- Which claims about teaching quality require a real learner and cannot be
  established through simulated students?
- Which parts of the current global revision and generic `durable_effect`
  mechanism remain useful receipts after course/material domain records arrive,
  and which should be narrowed or deleted rather than generalized?

Production types and tables remain local to demonstrated consumers. ADR-0012
now fixes authority and dependency direction, while route/material, progress,
revisit, assignment, and attempt shapes remain owned by their behavior slices
rather than by incidental runtime tables.

The current product-capability review draft is
[`proposals/0004-learning-native-capability-contract.md`](./proposals/0004-learning-native-capability-contract.md).
The current conditional-purpose production contract draft is
[`proposals/0005-conditional-purpose-and-learner-role-contract.md`](./proposals/0005-conditional-purpose-and-learner-role-contract.md).
The current route and runtime phase review is
[`research/broad-route-and-runtime-substrate-review-2026-07-12.md`](./research/broad-route-and-runtime-substrate-review-2026-07-12.md).
The completed runtime milestone is
[`roadmap/05-first-dogfood-tutor-loop.md`](./roadmap/05-first-dogfood-tutor-loop.md).
The accepted architecture is
[`architecture/00-system-architecture.md`](./architecture/00-system-architecture.md),
and its implementation sequence is
[`roadmap/architecture-led-build-sequence.md`](./roadmap/architecture-led-build-sequence.md).
The completed course-continuity milestone is
[`roadmap/06-real-course-material-continuity.md`](./roadmap/06-real-course-material-continuity.md).
The completed first Agenda slice is
[`roadmap/07-first-agenda-future-attention.md`](./roadmap/07-first-agenda-future-attention.md).
The completed shared-policy experiment was governed by
[`research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md`](./research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md),
with excluded-run history in
[`research/shared-tutor-policy-pilot-audit-2026-07-12.md`](./research/shared-tutor-policy-pilot-audit-2026-07-12.md).
Its result is
[`research/shared-tutor-policy-formal-result-2026-07-13.md`](./research/shared-tutor-policy-formal-result-2026-07-13.md).
The selected-purpose architecture synthesis is
[`research/selected-current-learning-purpose-control-seam-2026-07-13.md`](./research/selected-current-learning-purpose-control-seam-2026-07-13.md),
and its focused oracle result is
[`research/selected-current-purpose-oracle-result-2026-07-13.md`](./research/selected-current-purpose-oracle-result-2026-07-13.md).
The rejected selector results are
[`research/selected-current-purpose-selector-result-2026-07-13.md`](./research/selected-current-purpose-selector-result-2026-07-13.md)
and
[`research/governing-source-selector-result-2026-07-13.md`](./research/governing-source-selector-result-2026-07-13.md).
The successful conditional-default result is
[`research/conditional-current-purpose-result-2026-07-13.md`](./research/conditional-current-purpose-result-2026-07-13.md).
The exact-reason ablation that earns one operative learner-role constraint is
[`research/exact-reason-conditional-default-result-2026-07-13.md`](./research/exact-reason-conditional-default-result-2026-07-13.md).

## Current build direction

The runtime, overall architecture, and real course/material continuity are
complete boundaries. The earlier entity-linear sequence—activity records,
then Agenda, then evidence and adaptive review—has been withdrawn as the
automatic roadmap.

Work is now selected on two axes:

1. a learner-visible product pressure path; and
2. the engineering gates that keep authority, context, correction, and failure
   behavior sound.

The current pressure path is **teach, adapt, and return**: use real material to
help with one currently difficult part, change the move when the learner's
response calls for it, and later return in a purpose-appropriate form when
there is a real reason. It must use contrasting procedural, conceptual,
discrimination, delayed-return, and direct-real-work cases so no one teaching
method becomes the architecture.

The deterministic pressure proof and Roadmap 07 implementation have now earned
one specific production Agenda revisit: a source-linked future-attention
concern with bounded cross-Session context, lazy detail, explicit disposition,
and learner-bound correction. They have not earned a general alignment engine,
learner-evidence representation, or scheduler.

ALS-021 has now closed the shared-policy pressure. All 112 formal samples
completed under `tutor-default-v2`. The predeclared zero-write gate passed only
91/96, two required-material conditions reached only 6/8, and both raw blind
reviewers gave the independent-prediction return 0/8. The broad qualitative
instrument itself failed calibration with 518 disagreements, so no adjudicated
fine-grained score was manufactured. These limits do not hide the decisive
behavior: the source-linked Agenda reason survived into a fresh Session, but
the Tutor still disclosed the answer before the intended unaided prediction.

The architecture direction is therefore narrower than "add more memory" or
"improve the prompt." ALS-022A showed that explicit binding repairs the tested
realization. ALS-022B/C then showed that a mandatory selector model does not
reliably decide current request versus Agenda versus ambiguity. ALS-022D
removed that classifier: the program bound the sole legal concern as a
conditional default in the ordinary sample, retained exact-current-request
priority, and passed all ten contrasts.

An inspectable selected current-purpose contribution is therefore an accepted
composition invariant when durable state governs a move, but it is not an
unconditional winner or universal preliminary stage. The program owns
legality, candidate count, exact source/version/target/reason, priority, scope,
and durable effects. The model owns the compatible current-request override and
flexible explanation, example, question, research, representation, and tool
use. Multiple material candidates remain unresolved rather than silently
ranked.

Proposal 0005 now implements the first production contribution contract under
`tutor-default-v3`: exact source meaning, the earned
learner-response-before-disclosure constraint,
conditional priority, override outcome, Turn/failure scope, conservative
migration, correction, and full-count promotion. Schema v5 performs no legacy
backfill; zero or multiple legal candidates fail closed. A fresh-Session live
DeepSeek smoke asked for the intended prediction before explanation without
narrating control state. This does not prove any wider constraint vocabulary.
ALS-022A/D/E also showed that
pre-tool and internal control prose can enter the persisted learner-visible
answer. The architecture gate found no architecture blocker. A pinned Codex and
AI SDK comparison narrowed the defect to the current runner's Turn-wide text
flattening: Codex preserves assistant message items and optional
commentary/final phases rather than censoring arbitrary prompt vocabulary.
The implementation renders the operative meaning naturally and tests the
learner-facing result. It does not preemptively add phase metadata or split
assistant items; repeated material leakage, partial recovery, or a real TUI
consumer may earn that later. None of this admits a durable aggregate, mode,
pedagogy enum, second runtime, keyword filter, or model-review pass.

This path still does not preauthorize an activity table, difficulty enum,
intervention state machine, universal future-action model, FSRS integration,
or full learner projection.

Goals, assignments, deadlines, multi-course choice, richer evidence, review
scheduling, domain foundations, retrieval indexes, and TUI work remain peer
horizons. Their order is chosen again from this architecture consequence rather
than being inherited from the newest module.

The source synthesis is
[`research/teaching-and-review-first-principles-2026-07-12.md`](./research/teaching-and-review-first-principles-2026-07-12.md),
the deterministic meaning proof is
[`research/teach-adapt-return-architecture-proof-2026-07-12.md`](./research/teach-adapt-return-architecture-proof-2026-07-12.md),
and the active two-axis build map is
[`roadmap/architecture-led-build-sequence.md`](./roadmap/architecture-led-build-sequence.md).

## Work-selection rule

New research or experiments must name one unresolved claim above and show how
different results would change a design decision. New production concepts must
name the future Tutor behavior that consumes them. Product outcome names,
teaching strategies, and transient diagnoses do not become runtime types merely
because they organize the current analysis.
