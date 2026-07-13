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
- The model may also manage lightweight durable workspace memory and initiate
  writes into a system-provided file surface: directory conventions,
  expression and collaboration preferences, resource paths, working notes, and
  decision summaries. These are editable advisory sources, not merely prompt
  memory and not automatically Learning authority.
- Strongly typed state is reserved for meanings whose real consumers need
  deterministic calculation, legal transitions, conflict detection,
  permissions, or stable learning consequences. A soft file becomes Course,
  Agenda, Learner Record, or Tutor-policy input only through an explicit,
  source-linked domain operation; no universal preference or memory schema is
  implied.
- Ordinary Assignment behavior is advance planning for substantial work over
  days. The program owns accepted workload/capacity/deadline arithmetic,
  allocation, and recomputation; the learner or model may propose estimates,
  interpret and decompose the work, and advise on meaning-sensitive choices.
  Last-minute rescue of a task already inside a minute-scale deadline window is
  not a Repa product behavior.
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
- ADR-0014 fixes the production lineage: take a one-time full-history fork of
  OpenCode `v1.17.18`, then evolve an independent Repa product. Repa owns the
  resulting binary, defaults, database, migrations, terminal surface, and
  release direction; it is not an OpenCode overlay or compatibility target.
- The complete local Agent harness is part of the product destination. Mature
  inherited Session, typed-item, provider, tool, permission, MCP, subagent,
  compaction, cancellation, recovery, and terminal mechanics are retained
  unless a demonstrated incompatibility justifies removal. Cloud,
  marketplace, sharing, and other group-product surfaces are excluded.
- ADR-0011 is superseded. Its AI SDK loop and real-provider dogfood remain
  behavioral oracles, but the current one-shot runner is frozen against
  further generic expansion and will be deleted after the fork cutover.
- ADR-0012 fixes the overall architecture: a single-process modular monolith
  centered on learning authorities rather than on the Agent loop. One local
  LearnerHome spans courses, LearningSpaces, and Sessions; one process owns its
  writes, SQLite owns machine state, and no daemon runs while the terminal is
  closed.
- The durable current Course never follows the invocation directory, folder
  layout, Agenda pressure, or model preference automatically. Switching Course
  requires an explicit learner request and then a visible confirmation bound
  to the exact target and current focus revision before the transition commits.
- Current Course is only the default retrieval prior for underspecified future
  input. A request that mentions or requires another Course loads that Course's
  bounded relevant context directly without switching or creating a temporary
  focus entity; the request and immutable context cut already preserve what the
  model saw. Confirmed switching changes the later default, not access.
- Repa boots with global authority and directory routing. One LearnerHome and
  native database apply regardless of the invocation directory; the current
  directory is a candidate LearningSpace locator and permission root, not a
  Course or database identity. A single broad learning tree, several unrelated
  roots, and bounded subtrees are all valid. Unknown directories do not become
  durable LearningSpaces or Courses merely because Repa starts there.
- LearnerHome may retain zero or more explicitly approved content roots. Inside
  one, Repa can discover, read, and search across the approved tree while the
  current directory biases relevance. Outside them, access remains bounded to
  the invocation directory unless the learner grants more. Repa never infers a
  broader approved ancestor from directory contents, and root approval carries
  no Course or LearningSpace semantics.
- Content-root approval includes ordinary bounded use of selected material in
  the configured remote or local model context. Repa does not add a separate
  root-by-provider disclosure permission matrix; provider choice remains
  ordinary harness configuration.
- Approved roots define the maximum readable/searchable universe, not every
  model sample's default scope. Current request, current-Course prior, Material
  Map, and explicit references form the default working set. The Agent may
  visibly widen bounded grep/search to an approved root without asking again;
  it may not implicitly search all LearnerHome roots or the computer. The
  system catalog resolves identity, revision, and scope while the inherited
  search engine remains the single query mechanism.
- Repa-owned database, cache, derived-artifact, and system soft-memory areas are
  freely writable within their fixed boundaries. Mutating user content is a
  separate permission from reading a content root: a request may be allowed
  once, rejected, or permanently allowed for a canonical content-root or
  subtree scope. Permanent rules survive restart, remain inspectable and
  revocable, and govern only future writes.
- Filesystem discovery is program-bounded while semantic organization is
  primarily model-led. Code enumerates authorized paths, revisions, media
  types, ignore rules and budgets; deterministic parsers recover mechanical
  structure. The LLM selectively reads a bounded manifest and may propose
  groupings, LearningSpaces, Course Views, or Material Map relations. Only a
  validated source- and revision-bound domain command makes such a proposal
  durable, normally with provisional or source-grounded status.
- Content-root discovery is lazy. Root approval may create a cheap bounded
  deterministic inventory, but it does not trigger full LLM classification.
  Semantic inspection follows a current goal/request or an explicit budgeted
  whole-root organization action. With no daemon, relevant traversal,
  application wake, or explicit refresh discovers drift; exact revisions bind
  only when content is observed or accepted.
- Translation of inconvenient learning materials is learner-optional and
  format-general. Canonical generated representations live in Repa's owned
  artifact area with exact original, representation, tool, and translator
  revisions; no sidecar is written into a content root by default. Source
  drift preserves the old result and marks its relationship stale. The learner
  may decline translation, lazily retranslate, or confirm continued use of the
  explicitly old revision without pretending that it represents the changed
  source. An explicit export is a separate user-owned artifact.
- Accepted representations and retained snapshots are never automatically
  evicted. Deletion is learner-explicit. Direct filesystem deletion or loss is
  detected on access and recorded as unavailable while identity, lineage,
  receipts, and historical references remain. Exact same-digest bytes may be
  relinked; different bytes create a new artifact revision.
- Representation quality is a learner-owned cost trade-off, not one global
  verification policy. The learner may spend more model/tool budget, provide
  or correct readable text manually, proceed with recorded ambiguity, or stop
  using the source. Translation only derives a readable form of one exact
  source revision; it does not admit local-RAG ingestion, chunking, embeddings,
  vector search, or automatic prompt injection. Current retrieval remains
  bounded manifest/search/read plus lazy context selection.
- For mutable remote material, Repa defaults to retaining the smallest exact
  content snapshot actually used by a learning move, with locator, time,
  selector, revision/digest, acquisition provenance, and reproducibility
  status. The learner may request supported full-page capture; URL-only
  observations that cannot be retained stay explicitly non-reproducible.
  Acquisition or normalization may come from an ordinary Skill/MCP capability;
  no Repa-specific web-reader subsystem is admitted.
- No dedicated memory subsystem is currently justified. Future ordinary Agent
  file capabilities may support scoped read/write/search, optimistic content
  revision checks, a bounded ambient entry, and at most a rebuildable thin
  index. The LLM may own the note semantics; the host still owns root
  confinement, source/version identity, loading bounds, safety, and receipts.
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
- One state-changing process owns a LearnerHome. The current separate SQLite
  ownership file proves the single-writer behavior but is not a compatibility
  mechanism for the fork; the native runtime may use its mature local lock as
  long as second-writer failure and recovery remain truthful.
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
- Read authorization, system-visible course resources, model-visible retrieval,
  and learner-visible disclosure are separate boundaries. The LLM lazily
  inspects ordinary resources from a composed working set and may explicitly
  broaden search within approved roots. Answer-like roles are soft or
  source-grounded material meaning, not special file types. Independent-work
  policy normally constrains Tutor disclosure rather than making the Tutor
  ignorant of the answer. Explicit model-blind work may narrow one sample's
  content/tools through ordinary context and permission mechanics.
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
- `.reference/opencode` remains a pinned read-only audit source, while the
  production lineage is a separate full-history OpenCode v1 fork. The released
  v1 path is the sole initial runner; preview v2 is design evidence only. Codex
  remains a secondary comparison reference.
- One agent loop serves different policy profiles. Plan, study, review, and
  similar labels do not create separate runtimes.
- Interactive launch is sessionless. It shows a deterministic current view,
  and the first ordinary learner input creates a fresh Session and first Turn.
  Before that, an explicit slash command or CLI option may continue/select an
  old Session. The UI does not mock suggested learner prompts inside the input
  box. Deterministic navigation, inspection, and harness controls use the
  inherited discoverable slash-command/command-palette mechanism and create no
  model input unless explicitly defined as a visible learner request.
- Existing OpenCode local control commands are retained when their behavior
  does not contradict Repa's Session, Interaction, permission, source, or
  learning-authority semantics. Undo/fork/compact and similar commands require
  invariant-level review rather than nominal preservation; cloud/share
  commands remain excluded. No Repa Tutor slash-command catalog is designed in
  the fork baseline—new commands wait for actual repeated consumers.
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
- The superseded ADR-0011 dogfood milestone supplied a real behavioral oracle:
  `bun run repa` executes an AI-SDK model/tool loop, recompiles
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
- Turning every workspace convention or user preference into typed database
  state, or treating a model-written note as hard policy or learning evidence.
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
- Extending the current one-shot AI SDK runner into a complete private harness.
- Continuing ALS-024 or recruiting the maintainer as a learner merely because
  the latest local result exposed another possible state distinction.

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
6. The optional source-to-readable-representation boundary is accepted, but
   the fork trace must still decide its smallest native schema and prove
   failure/drift behavior. It does not earn a PDF type hierarchy or
   conversion-pipeline subsystem.

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
- Which later consumer first requires an Assignment-to-Course, Goal, Artifact,
  LMS, or calendar relation rather than lazy source detail?
- What is the smallest correctable representation of estimated remaining work,
  known capacity, allocation, and progress that lets the program plan and
  replan substantial work across days without becoming a generic todo system?
- What external identity and reconciliation rule should replace model-authored
  new-versus-existing Assignment admission when an LMS connector exists?
- Beyond the earned learner-response-before-disclosure boundary, which Agenda
  purposes actually need another explicit operative constraint rather than
  exact reason alone?
- What reversible behavior handles several materially different eligible
  concerns before any ranking policy is earned?
- How should internal Agenda/control rationale and pre-tool prose be kept out
  of learner-visible Tutor dialogue while natural reminders remain possible?
- Which claims about teaching quality require a real learner and cannot be
  established through simulated students?
- Which inherited Session/message/part identities can directly carry the
  accepted Turn, model-operation, tool-invocation, and context-cut meanings,
  and which need one narrow native Repa record during the fork cutover?

Production types and tables remain local to demonstrated consumers. ADR-0012
now fixes authority and dependency direction, while route/material, progress,
revisit, assignment, and attempt shapes remain owned by their behavior slices
rather than by incidental runtime tables.

The current product-capability review draft is
[`proposals/0004-learning-native-capability-contract.md`](./proposals/0004-learning-native-capability-contract.md).
The implemented conditional-purpose production contract is
[`proposals/0005-conditional-purpose-and-learner-role-contract.md`](./proposals/0005-conditional-purpose-and-learner-role-contract.md).
The withdrawn historical Assignment contract is
[`proposals/0006-deadline-sensitive-real-work-contract.md`](./proposals/0006-deadline-sensitive-real-work-contract.md),
with its deleted deterministic candidate, failed live gate, and semantic-drift
correction recorded in
[`roadmap/08-first-deadline-sensitive-assignment.md`](./roadmap/08-first-deadline-sensitive-assignment.md)
and
[`research/proposal-0006-production-verification-2026-07-13.md`](./research/proposal-0006-production-verification-2026-07-13.md).
The governing correction is
[`research/semantic-drift-audit-2026-07-13.md`](./research/semantic-drift-audit-2026-07-13.md).
The historical route and runtime phase review that preceded ADR-0011 is
[`research/broad-route-and-runtime-substrate-review-2026-07-12.md`](./research/broad-route-and-runtime-substrate-review-2026-07-12.md).
The completed pre-fork runtime milestone is
[`roadmap/05-first-dogfood-tutor-loop.md`](./roadmap/05-first-dogfood-tutor-loop.md).
The accepted architecture is
[`architecture/00-system-architecture.md`](./architecture/00-system-architecture.md).
The current substrate decision and implementation sequence are
[`decisions/0014-one-time-opencode-fork.md`](./decisions/0014-one-time-opencode-fork.md)
and
[`roadmap/09-one-time-opencode-fork-baseline.md`](./roadmap/09-one-time-opencode-fork-baseline.md).
The earlier product-pressure map remains historical guidance in
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

The current implementation phase is the **one-time OpenCode fork and native
Repa baseline** governed by ADR-0014 and
[`roadmap/09-one-time-opencode-fork-baseline.md`](./roadmap/09-one-time-opencode-fork-baseline.md).
The pre-fork runner proved learning semantics but did not establish a complete
or trustworthy generic harness. It receives no further generic features.

This is not a one-pass rewrite. Roadmap 09's phases are requirement clusters
implemented through separate reversible evidence gates; a gate includes its
owned exception, restart, replay, and rollback cases before it can pass. The
first authorized engineering move is only the lineage/provenance gate. Later
gates are refined from the immediately preceding evidence rather than
pre-authorized as one large patch.

The pre-fork code remains a live black-box oracle: `bun run check` passed 244
tests with 0 failures on 2026-07-13. Its exact disposition is recorded in
[`research/pre-fork-repa-asset-audit-2026-07-13.md`](./research/pre-fork-repa-asset-audit-2026-07-13.md).
Small pure utilities are only carry candidates; Course, Agenda, Tutor, source,
and interaction behavior is ported as native contracts; the old runner,
database, provider adapter, and runtime-coupled labs are not compatibility
dependencies. Nothing is deleted until its native positive and failure
oracles exist.

OpenCode's built-in prompts and product surfaces are also cutover targets, not
neutral inherited plumbing. The pinned v1 selects several coding-first base
prompts by provider and uses additional coding assumptions in default/hidden
agents, compaction, summaries, titles, exploration, tool descriptions, plan
reminders, and built-in commands. Every interactive provider path must
implement the same Repa product contract and accept the same Learning-System
composition inputs, although provider-specific rendering may differ. The base
prompt is not the Tutor; Tutor behavior emerges as native learning authorities
join that composition. Hidden calls receive narrow Repa-owned prompts for their
actual task. Useful local coding mechanics may remain as explicit capabilities.
Account/share/sync/control-plane and other excluded group surfaces first lose
all registration and reachability, then their implementations are deleted in
dependency-closed slices before cutover.

The active sequence is:

1. obtain and reproduce a full-history OpenCode `v1.17.18` fork on Windows;
2. establish Repa-owned application paths, binary, database identity, and one
   released-v1 Session runner;
3. replace coding-first provider and hidden prompts with one Repa product
   contract and Learning-System composition boundary, then separately remove
   or scope inherited product surfaces by behavior;
4. map learner Turn, model operation, typed item, tool invocation, context cut,
   cancellation, and terminal outcome without shadow lifecycle tables;
5. adapt the inherited EventV2 transaction seam so a local learning transition
   and exact Tool Part settlement commit together;
6. admit learner-optional, general source-to-readable-representation
   translation with exact revision lineage and a canonical Repa-owned artifact
   location, without turning it into a local-RAG pipeline; and
7. run a fixed scripted learner through the real provider/tool loop, then prove
   restart, fresh-Session continuity, compaction, and failure truth before
   deleting the old runner.

The source-grounded Course View, route continuity, Agenda future attention,
conditional learner-response-before-disclosure behavior, model-write
authority, correction, and fresh-Session continuity remain required behavior
oracles. Their current schemas and adapters are not compatibility targets.

ALS-024 is completed and parked. Stage 2 showed that its deterministic fixture
did not earn durable learner-outcome state; no Stage 3, human learner test,
production schema, or new evidence experiment follows from it. The withdrawn
minute-scale Assignment route likewise remains historical only.

The earlier **teach, adapt, and return** pressure path remains the next
learner-visible product horizon after substrate cutover. It does not compete
with the fork phase and cannot be used to justify more state work on the old
runner. Assignment planning, richer learner evidence, review scheduling, and
Course graph expansion remain deferred until the native Repa baseline exists
and a representative behavior needs them.

The fork must not become an OpenCode compatibility project. Local capabilities
are retained when useful, but learning determines defaults and durable meaning.
A capability reduction succeeds only when the learning consumer's identity,
ownership, lifecycle, correction, and failure behavior survive; otherwise a
separate learning-native authority is required.

## Work-selection rule

New research or experiments must name one unresolved claim above and show how
different results would change a design decision. New production concepts must
name the future Tutor behavior that consumes them. Product outcome names,
teaching strategies, and transient diagnoses do not become runtime types merely
because they organize the current analysis.

During Roadmap 09, the next task must close one fork gate: reproducible build,
native identity/migration, atomic tool/domain settlement, material
representation, or the scripted real-provider trace. Do not extend the old
runner, reopen ALS-024, add a compatibility layer, or implement the same
learning behavior in both v1 and preview v2.
