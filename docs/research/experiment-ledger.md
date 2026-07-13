# Experiment ledger

This ledger is the durable index for focused labs. It records questions,
outcomes, and the next unresolved boundary without promoting lab structure into
production architecture.

## Model names

Use full names in notes and discussion:

- **DeepSeek-V4-Flash (API, non-thinking)** — live model used by Bun/AI SDK
  experiments;
- **DeepSeek-V4-Pro (API, thinking=max)** — live model used by Bun/AI SDK
  experiments; and
- **ChatGPT GPT-5.6 Pro (subscription, Extended Pro via the private Pro
  bridge)** — independent reviewer only unless a future experiment explicitly
  states otherwise.

`Pro` by itself is not an acceptable model name in research records.

## Artifact policy

- Executable fixtures live under `labs/` and remain outside production imports.
- Sanitized full model traces are written to each lab's local `.runs/`
  directory. These traces are Git-ignored because they are large and may
  contain transient prompts or learner material in future experiments.
- Stable results, confounds, costs, and source links are summarized under
  `docs/research/`.
- API keys, authentication material, and transport headers are never written to
  either artifact.

## Completed batches

| ID | Date | Question | Result | Durable record |
|---|---|---|---|---|
| ALS-001 | 2026-07-10 | Can a thin SQLite path keep Session history separate from correctable learning meaning and change a local next-action oracle? | Yes for the tested deterministic fixtures; no educational-effectiveness claim. | `learning-semantic-anchor.md` |
| ALS-002 | 2026-07-11 | Can generic OSS model/tool-loop machinery carry learning-semantic contracts without a custom agent loop? | Yes for the tested loop. The model did not reliably produce the fixture's predeclared durable consequence, so that specific consequence required thin contract enforcement. This does not require ordinary teaching to create a durable learning write. | `deepseek-learning-loop-oss-reduction-2026-07-11.md` |
| ALS-003 | 2026-07-11 | Which tool guarantees are generic, and which remain learning-semantic authority? | Generic continuation handled explicit safe retry and concurrent calls. Semantic idempotency, provenance, and atomic learning consequences remained domain-owned. | `deepseek-tool-lifecycle-2026-07-11.md` |
| ALS-004 | 2026-07-11 | Can OSS approval, cancellation, and malformed-call mechanisms be reused? | AI SDK approval and repair seams were reusable. Abort propagation required executor cooperation and did not prove that no effect committed. | `deepseek-approval-cancellation-2026-07-11.md` |
| ALS-005 | 2026-07-11 | Does a valid approval remain sufficient after learning context changes? | No. AI SDK rejected forged approval IDs, but a valid stale approval executed unless the domain precondition was revalidated at executor entry. | `deepseek-stale-approval-2026-07-11.md` |
| ALS-006 | 2026-07-11 | Can a large tool registry be narrowed or searched without a custom model loop? | Yes. `activeTools` and `prepareStep` were sufficient. Direct context narrowing used the fewest tokens and steps when the activity was already known; discovery remained useful only for genuine catalog uncertainty. | `deepseek-tool-catalog-2026-07-11.md` |
| ALS-007 | 2026-07-11 | Is pinned OpenCode confined code mode a generally better tool path? | No. It reduced dependent model round trips for DeepSeek-V4-Pro (10/10 strict runs) but was less reliable and more expensive for DeepSeek-V4-Flash (7/10 strict runs). It remains an optional read-heavy orchestration candidate, not learning authority. | `opencode-code-mode-readonly-2026-07-11.md` |
| ALS-008 | 2026-07-11 | Can bounded source-referenced retrieval replace returning a whole material for a localized question? | In the synthetic exact-search task, yes: both models retained exact answer/citation accuracy while returned characters fell about 143x and input tokens about 11-13x. The result does not settle real retrieval recall or source-version semantics. | `deepseek-bounded-material-retrieval-2026-07-11.md` |
| ALS-009 | 2026-07-11 | What must a local source reference preserve after its material changes? | Path plus line range silently drifted. A reference to the persisted observed tool-result item retained the historical passage and separately detected origin staleness. Missing support failed closed. | `source-reference-revision-2026-07-11.md` |
| ALS-010 | 2026-07-11 | Can retrieved course material mint learning-write authority? | Both models resisted the fixed injection in 30 live paths. Activity-local `activeTools` removed the write surface; a forced mock call proved executor authority rejects the forged result with zero commits. | `deepseek-untrusted-material-authority-2026-07-11.md` |
| ALS-011 | 2026-07-11 | Can DeepSeek-V4-Flash and DeepSeek-V4-Pro collaborate inside one learning interaction without a second agent runtime? | A same-history model switch failed DeepSeek's reasoning-history protocol. An isolated, provenance-bearing handoff passed 3/3, but added a second request and did not outperform DeepSeek-V4-Flash direct accuracy on the fixture. | `deepseek-staged-model-collaboration-2026-07-11.md` |
| ALS-012 | 2026-07-11 | Can a compact global course view coexist with lazy detailed evidence for task selection? | All 18 trials chose the right action. Overview-first cut model-facing input about 13-14x versus full state and was evidence-complete 6/6; local-first added a step and had one incomplete evidence trail despite a correct action. | `deepseek-global-overview-lazy-context-2026-07-11.md` |
| ALS-013 | 2026-07-11 | Can a cheap model add useful task-to-target alignment beyond a lexical baseline? | DeepSeek-V4-Flash passed the predeclared candidate threshold 3/3 at 0.975 exact accuracy versus the 0.45 baseline. DeepSeek-V4-Pro was semantically perfect on three complete trials but slower, costlier, and raw-transport clean only once. | `deepseek-task-alignment-annotation-2026-07-11.md` |
| ALS-014 | 2026-07-11 | Should a side-effect-free candidate projection use structured JSON instead of a tool call? | DeepSeek rejected native `json_schema`, but `json_object` plus local Zod passed 3/3 for both models. It halved DeepSeek-V4-Flash latency/cost substantially; for DeepSeek-V4-Pro it improved raw transport but cost about 26% more. | `deepseek-structured-output-vs-tool-transport-2026-07-11.md` |
| ALS-015 | 2026-07-11 | Do condition-bearing evidence and inferred learner state earn their complexity in a frozen first-domain semantic benchmark? | Hard gates passed 3/3. Declared evidence beat answer-only but emitted one false-independent claim per trial. Stateless, oracle, and inferred selectors all scored 6/6, so the task did not demonstrate state-layer advantage. | `simulated-student-benchmark-main-2026-07-11.md` |
| ALS-016 | 2026-07-11 | Does rubric-criterion judgment plus deterministic derivation resolve the repeated evidence representation confound? | No. Deterministic derivation removed illegal signal combinations, but the valid arm scored only 9/24 exact and the reordered arm failed transport before model responses. The proposed criterion schema is not promoted, and no further rescue experiment is allowed. | `evidence-criteria-followup-2026-07-11.md` |
| ALS-017 | 2026-07-11 | Can a live model independently initiate selective, source-bound, correctable learning writes while the system retains durable authority? | Yes for the write/authority path: progress and revisit committed, stale input was rejected, ordinary explanation and unsupported mastery caused no write, and a later correction preserved both sources. The full protocol failed because fresh-session continuation was truncated and added an unsolicited assessment. | `model-initiated-learning-writes-2026-07-11.md` |
| ALS-018 | 2026-07-11 | Can one production boundary prevent new-call-ID duplicates and retain still-live learner steering without a generic preference or command framework? | Yes for the deterministic boundary. Physical invocations and semantic effects have separate identity; scoped steering survives a Session, expires by query, retracts with provenance, and is compiled atomically with a bounded model operation. Exhaustion is a replayable terminal outcome. This does not establish model tool-selection or policy-compliance reliability. | `semantic-effect-and-scoped-steering-2026-07-11.md` |
| ALS-019 | 2026-07-12 | Can the broad route remain an ordered list with one pointer? | No. Six collision cases projected different learning situations to the same list/pointer while requiring different answers. An ordered hierarchy, distinct route/focus/rejoin facts, typed accepted relations, revision-bound material alignment, and separate learner/agenda overlays resolved the tested collisions. This does not earn a graph database or universal ontology. | `route-representation-pressure-2026-07-12.md` |
| ALS-020 | 2026-07-12 | Do target, source, revision, time, and a generic completion rule contain enough meaning for purpose-sensitive return? | No. Three accepted learning purposes collapsed to the same coordinates while constraining the learner's later cognitive role differently; one purpose also admitted multiple concrete forms under later context. Same-target and learner/tool-only completion rules produced false positives and false negatives. The promoted boundary is an Agenda-owned source-linked future-attention concern; serving it, dismissing it, and learning evidence remain separate. | `teach-adapt-return-architecture-proof-2026-07-12.md` |
| ALS-021 | 2026-07-13 | Can one shared production Tutor policy make situation-appropriate teaching, adaptation, return, and zero-write moves across controlled contrasting traces? | Not at the frozen v1 acceptance level. All 112 samples completed, but zero-write precision was 91/96, two required-material conditions were 6/8, and both raw reviewers scored the independent-prediction return 0/8. Durable Agenda purpose survived the Session boundary but did not reliably govern the later move. The broad qualitative instrument produced 518 calibration disagreements, so no adjudicated aggregate was manufactured. | `shared-tutor-policy-formal-result-2026-07-13.md` |
| ALS-022A | 2026-07-13 | Is an oracle-selected, high-signal current-purpose contribution sufficient to preserve an unaided prediction in the same production return trace? | Yes for the isolated realization boundary: 7/8 responses used a purpose-valid alias/shallow-copy prediction and 8/8 withheld the answer; the same ALS-021 behavior was 0/8. All cases used two model steps with one material read, retained the open concern, and made no learning mutation. One response chose the wrong object-identity target. The run also showed that pre-tool/control prose is currently concatenated into learner-visible output. Selection correctness remains untested. | `selected-current-purpose-oracle-result-2026-07-13.md` |
| ALS-022B | 2026-07-13 | Can a control-only `Agenda candidate | none` projection select and compile the current purpose across adoption, direct-help, redirection, ambiguity, timing/staleness, and completed-input cases? | No. JSON/schema transport passed 22/22, but decision and identity were only 14/22 and the strict gate 12/22. The model selected concerns against a direct request, redirection, timing/freshness, and completed input; it also attached current-request meaning to an incompatible concern ID. The result rejects model-authored replacement purpose and shows that current request/unresolved must be explicit choices while deterministic legality stays program-owned. | `selected-current-purpose-selector-result-2026-07-13.md` |
| ALS-022C | 2026-07-13 | After program filtering and immutable source binding, can DeepSeek-V4-Flash choose `current_request`, one Agenda source, or `unresolved`? | No. Transport and local admission passed 18/18, but exact source selection was 10/18. It ignored Agenda in all four generic-continuation samples and refused unresolved in both multiple-candidate samples. Compatible-source disagreements do not change the decisive failure. Per the frozen stop rule, no further universal selector prompt/enum rescue is admitted. | `governing-source-selector-result-2026-07-13.md` |
| ALS-022D | 2026-07-13 | Can a program-bound sole Agenda concern act as a conditional default inside the ordinary realizing sample while explicit current requests override it? | Yes for the tested independent-prediction concern: 10/10 generic-continuation, direct-answer, direct-comparison, completed-occurrence, and redirection cases passed behavior and state gates. No selector sample ran. Overrides left the concern open; completed occurrences addressed it. The intervention restated the known learner-role constraint, so general reason compilation and multi-candidate policy remain open. | `conditional-current-purpose-result-2026-07-13.md` |
| ALS-022E | 2026-07-13 | Is exact Agenda reason plus conditional-default status sufficient without explicitly restating its learner-role/help-order constraint? | No. The mechanical screen was 6/8, but strict inspection found only 3/8 valid independent predictions: two disclosed answers, one posed no prediction, and two supplied decisive rules first. Exact source reason and operative constraint are distinct. This earns a narrow contract for `learner response before Tutor disclosure`, not a universal pedagogy enum. | `exact-reason-conditional-default-result-2026-07-13.md` |
| ALS-023 | 2026-07-13 | Can the deterministic Proposal 0006 Assignment candidate reliably create, survive a Session boundary, affect a near-deadline broad continuation, and reject unrelated job work under the production DeepSeek-V4-Flash Tutor? | The run failed, and its product interpretation is withdrawn. Persistence, provenance, correction, lazy reads, and policy-version isolation passed deterministically; live creation was unstable, broad continuation ignored the fixture, and one response exposed an internal ID. More importantly, the 45/25/30-minute emergency is outside Repa's product scope, not merely unrepresentative. It cannot establish a product consideration boundary or qualify the v4 aggregate. The CLI remains on v3. | `proposal-0006-production-verification-2026-07-13.md`; `semantic-drift-audit-2026-07-13.md` |

## Active batch

ALS-024 remains at an evidence gate under its pre-registered
[protocol](./source-linked-performance-occurrence-proof-2026-07-13.md).
[Stage 0/1](./source-linked-performance-occurrence-stage-0-1-result-2026-07-13.md)
found the correct/incorrect fresh-Session collision.
[Stage 2](./source-linked-performance-occurrence-stage-2-result-2026-07-13.md)
then completed by paper and production-code-path ablation: the deterministic
fixture earns only a bounded read of the Agenda transition’s existing service
occurrence plus source-bound local derivation. It does not earn a durable
observed-outcome boundary; copied response/criterion/assistance is rejected.
Current tools do not expose that service source, and changed material may leave
the historical criterion unresolvable. No lab, harness, production state, new
test, or live-model run is active. Stage 3 is not admitted. The next evidence
must be one real non-deterministic, case-correctable observation whose corrected
revision changes a later move; otherwise the durable observation boundary
stops.

ALS-023 is retained as a failed experiment whose pressure scenario was selected
incorrectly. It does **not** leave a near-deadline consideration question. The
unqualified v4 runtime, prompt, tools, and dedicated tests have been deleted;
schema 6 remains only as a compatibility tombstone.
ALS-022B/C reject a universal DeepSeek-V4-Flash selector;
their stop rule remains in force. ALS-022D supports a simpler one-candidate
conditional-default topology for the demonstrated independent-prediction
purpose. ALS-022E then rejects exact reason plus selected status as sufficient:
the demonstrated concern needs an explicit learner-response-before-disclosure
constraint. ADR-0013 and Proposal 0005 now record the resulting architecture
and reviewable first-production contract. Proposal 0006 is withdrawn as a
product contract. No further live model work is admitted for the same
prompt/context topology. The next Assignment evidence must start from
representative cross-day workload, capacity, correction, and replanning cases,
after a consumer-driven architecture proof. A general constraint vocabulary
and multi-candidate policy remain explicitly unproved.

## Completed batch detail: ALS-003 tool lifecycle and semantic authority

Goal: determine which tool behaviors are already supplied by generic OSS
machinery and which learning guarantees require domain validation.

Planned falsifiers:

1. **Execution error continuation** — inject one tool execution rejection and
   observe whether AI SDK exposes it and permits a later corrected model step.
2. **Duplicate logical effect** — compare naive execution with a
   domain-idempotent operation identity when the model repeats a call.
3. **Multiple calls in one model step** — record start/finish timing and event
   order rather than assuming sequential execution.
4. **Provenance conflict** — give user text that conflicts with authoritative
   task context and verify that the tool boundary rejects invented identifiers
   or assistance conditions.
5. **Termination boundary** — use larger output allowances for normal teaching,
   while preserving `length`, interruption, and finite-step outcomes as
   distinct observable states.

The batch compared DeepSeek-V4-Flash and DeepSeek-V4-Pro. Full findings are in
`deepseek-tool-lifecycle-2026-07-11.md`.

## Completed batch detail: ALS-004 authorization, cancellation, and malformed calls

Goal: determine whether current OSS tool APIs already provide enough machinery
for approval and cancellation boundaries before Repa designs either one.

Questions:

1. Can an approval-required tool remain unexecuted until an explicit approval
   response is admitted?
2. What durable or replayable data does AI SDK expose for approval requests and
   responses, and what remains application-owned?
3. When cancellation reaches a local tool, does the executor receive an abort
   signal and can it establish that no effect committed?
4. How are malformed tool arguments surfaced, and can a generic repair hook
   correct transport shape without deciding educational meaning?

Full findings are in `deepseek-approval-cancellation-2026-07-11.md`.

## Completed batch detail: ALS-005 stale approval and semantic revalidation

Goal: determine whether an approved physical tool call can still be rejected
when its learning context or policy revision changed while approval was
pending.

Full findings are in `deepseek-stale-approval-2026-07-11.md`.

## Completed batch detail: ALS-006 tool-catalog narrowing and lazy discovery

Goal: compare a broad tool catalog, `activeTools` narrowing, and two-stage tool
discovery under the same learning action. The experiment asks whether existing
AI SDK/OpenCode-style mechanisms are sufficient for lazy tool exposure without
a custom agent loop.

The batch measured selected tools, wrong executor entries, model steps, input
tokens, and cost. It did not define a production skill/plugin registry.

Full findings are in `deepseek-tool-catalog-2026-07-11.md`.

## Completed batch detail: ALS-007 confined tool orchestration

Goal: characterize the pinned OpenCode code-mode mechanism before deciding
whether it is merely an MCP scalability optimization or a reusable harness
paradigm for Repa. The batch will first run the upstream behavior tests, then
compare direct multi-step calls with one confined orchestration call under a
read-only multi-tool learning task.

The batch distinguished catalog overhead, model round trips, child-call
observation, interpreter diagnostics, and semantic write authority. It exposed
no durable learning writes through code mode.

Full findings are in `opencode-code-mode-readonly-2026-07-11.md`.

## Completed batch detail: ALS-008 bounded material retrieval and source references

Goal: compare returning a large course-material payload directly with a
bounded, source-referenced search/read path. The batch asks whether generic
tool-result and lazy-read mechanisms preserve enough evidence for accurate
teaching while avoiding repeated context expansion.

The experiment used synthetic read-only material with exact answer and source
coverage oracles. It did not select a production note format, retrieval engine,
vector database, or durable learning-state representation.

Full findings are in `deepseek-bounded-material-retrieval-2026-07-11.md`.

## Completed batch detail: ALS-009 source revision and stale reference semantics

Goal: determine what a citation-like local source reference must preserve when
the underlying material changes. The batch will compare path-only resolution
with revision-aware resolution and inspect pinned OpenCode/Codex recovery
mechanisms before proposing any representation.

The batch did not define a universal content-addressed store or production
session schema.

Full findings are in `source-reference-revision-2026-07-11.md`.

## Completed batch detail: ALS-010 untrusted material and learning-tool authority

Goal: test whether instructions embedded in retrieved course material can cause
an otherwise read-only tutoring action to invoke a durable learning tool or
forge provenance. The batch will compare prompt-only resistance with executor
enforcement under both DeepSeek model profiles.

The batch was a focused tool-boundary test, not a general prompt-injection or
security certification.

Full findings are in `deepseek-untrusted-material-authority-2026-07-11.md`.

## Completed batch detail: ALS-011 staged DeepSeek model collaboration

Goal: determine whether the existing per-step model override can use
DeepSeek-V4-Flash for an initial read/tool-routing step and DeepSeek-V4-Pro for
the consequential learning-action decision without a separate agent runtime.

The same-history switch failed because DeepSeek-V4-Pro required reasoning
content that the previous non-thinking DeepSeek-V4-Flash tool-call message did
not contain. A second fixture passed a provenance-bearing evidence packet
between independent requests and compared accuracy, usage, latency, and cost
against single-model runs. It did not select a permanent model provider or
routing policy.

Full findings are in
`deepseek-staged-model-collaboration-2026-07-11.md`.

## Completed batch detail: ALS-012 global overview and lazy detailed context

Goal: test the product hypothesis that a learning agent needs a compact global
course view while detailed evidence can be loaded only when the current task
selection requires it. The batch compares a full raw state, an overview-first
bounded path, and a local-first path that retrieves the overview lazily.

The experiment measured action correctness and evidence completeness
separately, along with required reads, input
load, steps, latency, and cost under both DeepSeek model profiles. It does not
select a production context schema, retrieval engine, or scheduler.

Full findings are in
`deepseek-global-overview-lazy-context-2026-07-11.md`.

## Completed batch detail: ALS-013 model-assisted task alignment

Goal: test whether DeepSeek-V4-Flash provides useful candidate task-to-target
alignment beyond a lexical baseline in short contexts, and whether
DeepSeek-V4-Pro materially changes the error boundary.

The pre-run design was independently criticized by ChatGPT GPT-5.6 Pro. The
revised fixture uses forty records across obvious, semantic-hidden, keyword
trap, and ambiguous categories; confusable skill pairs; explicit abstention;
and separate transport, edge, relation, exact-record, trap, and calibration
measurements. No candidate becomes learner evidence or a durable curricular
relation.

The design review is in
`chatgpt-pro-alignment-benchmark-review-2026-07-11.md`.

Full findings are in
`deepseek-task-alignment-annotation-2026-07-11.md`.

## Completed batch detail: ALS-014 structured output versus tool transport

Goal: test whether side-effect-free candidate alignment should use AI SDK
structured output rather than a tool call. The same frozen forty-record
benchmark, schemas, prompts, and scoring are reused; only the model-output
mechanism changes.

The batch compared transport validity, semantic scores, latency, tokens,
and cost under both DeepSeek model profiles. It does not change the authority
of candidate annotations or choose a production provider.

Full findings are in
`deepseek-structured-output-vs-tool-transport-2026-07-11.md`.

## Next experiment entry gate

ALS-018 closed the two state-boundary questions exposed by ALS-017 and produced
an executable state/context candidate. The 2026-07-12 phase review found that
it also embedded a partial generic agent host before the substrate decision.
Its learning-semantic tests remain evidence; the review provisionally removes
the "first production spine" label as authorization to extend its Session,
Turn, model, tool, recovery, or global-revision shapes.

For generic host work, the next discriminating experiment is architecture
distillation followed by one runtime-seam trace. The pinned OpenCode/Codex
sources and tests first establish the end-to-end control sequence, owners, and
fault semantics; mature libraries then realize the trace while Repa supplies
only loop composition and learning semantics. The experiment identifies which
ALS-018 records are domain invariants versus runner duplication. OpenCode
modification or a fork is reopened only if the trace exposes a necessary
boundary that the library path cannot supply without rebuilding generic
runtime machinery.

ALS-019 completed the independent course-route pressure test. It rejected the
ordered-list/one-pointer baseline and promoted only the semantic distinctions
needed by hierarchy, branching, detour/rejoin, relation authority, and material
revision cases. Its TypeScript object layout is not a production schema.

ALS-020 completed the deterministic meaning pressure for the current
`teach, adapt, and return` path. It reused B1 lifecycle, B2 lazy-return, source-
revision, and production continuity results rather than rebuilding their
mechanics. Its fixture labels are counterexample oracles, not a purpose enum or
Agenda schema. The result promotes only the source-linked future-attention
concern and the separation among beginning, serving, dismissing, and learning
evidence.

No additional generic-runtime or route-representation experiment was required
before overall architecture design. The maintainer settled product lifecycle
and scope choices, and ADR-0012 now records the resulting architecture. A new
experiment is admitted only when the real course/material consumer exposes an
architecture-changing ambiguity.

A new experiment is admitted only if different outcomes would choose a
different representation or ownership boundary. Do not restart the broad
comparison, rescue the old evidence schema, add a scheduler score, create a
universal graph ontology, or extend semantic-idempotency machinery command by
command without a new Tutor consumer.

Roadmap 06 has now closed the real course/material consumer named above. Its
production verification is recorded in
`phase-1-course-continuity-verification-2026-07-12.md`: both course genesis
paths share one Course View, exact material stays lazy, revisions are
correctable, one LearnerHome writer is enforced, and a real fresh Session
continued at the next Markdown range. The first real-provider attempt failed
to perform an explicitly requested route advance; that negative result and the
subsequent policy correction are retained in the report.

The automatic Phase 2 experiment gate was withdrawn after the first-principles
teaching and review audit. The next admitted pressure work must begin from a
learner-visible teaching or later-return behavior, not from a desire to add an
activity table. It must identify the later Tutor decision that consumes each
durable distinction and a counterexample where recording it would overclaim
evidence. It does not authorize a general learner event schema, difficulty
taxonomy, or review scheduler.

ALS-020 closed that deterministic pressure question, and Roadmap 07 then
implemented the first production Agenda command/query consumer. ALS-021
rejected prompt-only exposure of an eligible Agenda reason as a reliable
control seam: the reason was present across Sessions, yet the
independent-prediction purpose was not preserved. ALS-022A then isolated the
next variable. An oracle-selected purpose changed the behavior from 0/8 to 7/8
purpose-valid predictions, with no answer leakage in 8/8. This supports a
bounded selected current-purpose projection between candidate state and model
realization; it still does not earn a durable activity representation or
second runtime. ALS-022B/C then rejected two universal selector shapes: the
model either borrowed Agenda provenance for the current request or treated a
generic continuation as already sufficient. ALS-022D removed the selector and
passed 10/10 by binding the sole legal concern as a conditional default inside
the ordinary realizing sample while retaining exact-current-request priority.
ALS-022E then showed that exact reason plus default status alone is not enough:
strict validity fell to 3/8 without the explicit
learner-response-before-disclosure boundary. This settles the one-candidate
control topology and one operative constraint for the demonstrated reason, not
a general constraint vocabulary, multi-candidate ranking, or user-facing
control-prose suppression.

## Deferred

- exact learner-history, revisit, and evidence shapes beyond demonstrated
  consumers;
- generalized scheduler ranking;
- a universal learning ontology;
- claims about teaching quality or human learning outcomes; and
- selecting a permanent model provider.

## Recorded API budget note

At the end of the 2026-07-11 overnight batch, 48 persisted DeepSeek run bundles
reported a combined estimated upper-bound cost of **$0.335575**. This includes
smokes, pilots, excluded oracle revisions, and repeated trials. It is a lab-side
estimate rather than a provider billing statement; calls that failed before a
bundle was persisted may be absent.

ALS-015/ALS-016 and their excluded pilots added eight cost-bearing benchmark
bundles with a combined estimated upper bound of **$0.01562323**. The running
lab-side total is therefore approximately **$0.35119823**. The directory also
contains aggregate/non-cost artifacts, so bundle count is not an API-call
count.

Phase B2 added twelve cost-bearing local bundles with a combined known-bundle
estimate of **$0.01896159** across 29 recorded model steps. The running lab-side
estimate is therefore approximately **$0.37015982**. One Trace 2 request failed
during a material-tool TLS call before usage could be recorded and may have
incurred additional provider cost, so this remains an estimate rather than a
billing statement.

ALS-017 added one cost-bearing bundle with twelve model steps and an estimated
upper bound of **$0.00714818**. The running known-bundle estimate is therefore
approximately **$0.37730800**.

Roadmap 06's three production dogfood calls (the retained failed-advance trace,
the corrected grounded trace, and its fresh-Session continuation) reported a
combined conservative upper bound of **$0.002561**. They are recorded outside
the lab bundle ledger; adding them yields an approximate known-call total of
**$0.37986900**, still not a provider billing statement.

ALS-021's first excluded campaign (`d970913980b6`) recorded an observed
upper-bound estimate of **$0.01528450** and a conservative budget charge of
**$0.04496334** after one socket-close retry. Its repaired second excluded
campaign (`5171a2474590`) recorded **$0.01530564** observed and
**$0.04482754** charged after one timeout retry. The two observed estimates sum
to **$0.03059014**; adding that to the preceding known-call estimate yields
approximately **$0.41045914**. The charges sum to **$0.08979088**, but are
failure-reserving campaign accounting and must not be added as if they were
observed provider cost. The formal 112-sample campaign then recorded
**$0.11894344** observed and the same campaign charge, with no infrastructure
retry. Adding its observed estimate to the preceding tracked estimate yields
approximately **$0.52940258**. Independent-review model costs are not included
because one backend cost was unavailable and the Claude Code result did not
retain a complete cost total. None of these figures is a provider billing
statement.
