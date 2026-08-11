# Repa Gate 20B: learner-state judgment memory

Status: **Contract/theory and implementation/evidence accepted; Gate 20B is
integrated into `origin/main` and fixed at implementation commit
`b040518591a2f065aec9b82214496a113c81ed35` plus its docs-only
publication/status successor.** Whole-Gate review run
`G20B-WG-20260809-019fe065-01`, retained reviewer task
`019fe6da-d33f-71f1-b405-1cf240c7862a`, accepted exact semantic candidate
SHA-256 `FF6EAB7002C26338E0344060646B440D2D9EE5DE704C9F75620ABFEFA10BCC54`
with no acceptance-changing finding, owner blocker, or contract reopen
condition. The exact accepted implementation/evidence candidate is bound in
[`repa-gate-20b-learner-state-judgment-memory-implementation-evidence-2026-08-10.md`](repa-gate-20b-learner-state-judgment-memory-implementation-evidence-2026-08-10.md);
its acceptance did not itself authorize integration, publication, release, a
credentialed provider, or Gate 21 merits. Feature-branch publication, local
mainline integration, and direct `origin/main` publication were separately
authorized and completed afterward; release and later-Gate dispositions remain
separately governed.

Date: 2026-08-09

Exact derivation base: feature branch
`codex/gate-20a-assignment-authority` at
`28f045eb6d51375f69da080685a394de65903f9a`, containing accepted Gate 20A
implementation commit `5099ecc642390cf7bae0f980098edd5267a75874` and its
docs-only closure/status successor. `main` and `origin/main` remained
`c100b431fe174d1993b2baa89a7d1b133300b579` at derivation opening. Existing
maintainer edits in `AGENTS.md` are preserved. The accepted semantic candidate
changed no production package; the separate implementation/evidence candidate
is governed by the binding above.

Review run: **`G20B-WG-20260809-019fe065-01`**. Retained independent reviewer:
**`019fe6da-d33f-71f1-b405-1cf240c7862a`**. The reviewer accepted the
contract/theory layer, returned `G20B-IE-001..004` on the first
implementation/evidence pass, and then accepted the exact 42-file / 4,791-byte
first-repair package candidate after closing all four findings. It is now
retired and must not be reused for Gate 21. Same-context derivation, the local grill, executor
evidence, and read-only evidence scouts do not replace that independent
acceptance.

The accepted review binding used exact working-tree bytes. Git's existing
Windows clean filter normalized CRLF to LF in 18 of the 42 package files during
integration and changed no other byte. The accepted working-tree manifest
remains `1F5CCB66B82D258C7689846FBD839907C5CC42CF8FA70138BF2B6064D052146A`;
the exact 42-file / 4,791-byte commit-tree manifest at `b0405185...` is
`601F4C6497A853047CF7F5807AA4D3A05023E276A2750C878E739A724CCA304F`.
This is an integration-provenance distinction, not a new semantic or executable
candidate.

Implementation precision adopted from the non-blocking review advisory: the
first physical contract treats `judgmentBody` plus `exactBasisRefs` as one
indivisible, revision-level fallible judgment. The basis set supports the
authored value as a whole; neither storage nor Context claims that one basis
independently entails every clause. Gate 20B does not add a clause ontology or
per-clause mastery relation. If a later real consumer needs independently
correctable clause/basis meaning, that evidence must reopen this physical
encoding rather than being inferred from prose punctuation.

Authority and correction routing:
[product origin](../foundation/00-product-origin.md),
[ADR-0003](../decisions/0003-learning-state-follows-evidence.md),
[ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md),
[ADR-0009](../decisions/0009-separate-invocation-and-semantic-effect-identity.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[system architecture](../architecture/00-system-architecture.md),
[native learning data model](../architecture/01-native-learning-data-model.md),
and [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md).

Material predecessors:
[Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
[Gate 18 LearningContext](repa-gate-18-learning-context-session-continuation-2026-08-03.md),
[Gate 19 learner-response evidence](repa-gate-19-first-learner-record-adaptation-2026-08-05.md),
and the accepted Goal, FutureAttention, and Assignment owners.

## Parent learning outcome

The Tutor should be able to remember, across Sessions, what the learner and the
Tutor currently believe the learner has learned, roughly understands, can do,
or still finds difficult. That memory should help a later explanation,
demonstration, guided attempt, practice choice, review, or planning suggestion
without forcing the learner to reconstruct old conversations.

This is not a request for Repa to calculate mastery. The judgment is fuzzy
because the underlying question is fuzzy. A capable model may interpret the
current interaction and exact available evidence; the learner may naturally
correct it later, just as a programmer asks a coding model to revise an
unsuitable solution. The program preserves who said or inferred what, the
scope and sources, the exact revision, and the correction history. It does not
certify the pedagogical judgment as objective truth.

## Gate claim

Within one LearnerHome, Gate 20B owns stable identities and immutable revisions
for reusable, scoped learner-state judgments. Each current revision preserves:

- the learning subject and its exact scope anchors;
- one bounded, open-language judgment about current understanding, capability,
  uncertainty, strength, gap, or relevant prior learning;
- the authoring model operation or learner occurrence;
- exact cited reports, evidence, interactions, source selectors, Goals,
  Assignments, Courses, or other owner revisions when used;
- uncertainty and limits stated by the author rather than invented by the
  runtime; and
- predecessor, correction, disposition, and settlement truth.

The owner exposes a bounded current directory through the existing
LearningContext cut and authorized lazy exact/current/history reads through the
existing tool and capability composition. A natural-language correction appends
a successor. A later Tutor model operation can therefore retrieve the relevant
detail when useful without eagerly importing all prior judgments or transcripts.

Gate 20B is causally complete when a fresh-Session Tutor actually consumes an
exact judgment and adapts a learning move, while a source-bearing correction
changes a later move and zero-write teaching remains legal.

## Why this is an independent Gate

Learner-state memory has useful consumers even when no plan suggestion exists.
It can prevent a Tutor from repeating basics, reveal that an application gap
remains after conceptual understanding, or make a review revisit an uncertain
area. It also has its own correction, source, Context, recovery, and failure
semantics.

Gate 21 may cite an exact learner-state judgment, but Gate 21 failure cannot
discard it and a plan suggestion is not required to create it. Combining the
two would make learner-state truth contingent on an optional advisory artifact
and would pressure every useful judgment into planning vocabulary.

## Closed vocabulary and non-equations

The following distinctions are contract invariants:

```text
learner report != observed performance != evidence != model inference
learner-state judgment != objective mastery truth
learner-state judgment != global mastery score
learner-state judgment != task completion or Assignment disposition
learner-state judgment != time spent, activity, adherence, or effort
learner-state judgment != Goal progress
learner-state judgment != plan suggestion or Tutor move
Gate 19 supports/does_not_support evidence != learned amount
absence of a judgment != no learning
silence or elapsed time != state change
```

Gate 19 remains an evidence owner. It may say that one exact occurrence supports
or does not support one selector-bound proposition under recorded conditions.
Gate 20B may cite that exact revision as one basis for a broader fallible
judgment, but the runtime never aggregates Gate 19 rows into mastery, decays
them, averages them, or translates them into a score.

## Logical identity and complete revisions

The physical schema and package names are implementation choices. The logical
contract is equivalent to:

```text
LearningStateJudgment {
  judgmentID
  learnerHomeID
  createdBy
  headRevisionID
}

LearningStateJudgmentRevision {
  judgmentID
  revisionID
  version
  predecessorRevisionID?
  disposition: active | retired
  subject
  judgmentBody
  authorAndCause
  exactBasisRefs[]
  uncertaintyAndLimits?
  recordedAt
  correctionOf?
}
```

`judgmentBody` is a bounded, versioned semantic value authored in ordinary
language. The runtime validates encoding, size, identity, and source shape, not
whether the wording is pedagogically correct. It must not require a numeric
mastery value, fixed proficiency taxonomy, confidence percentage, prerequisite
graph, or task-progress unit.

`subject` is also source-bearing and bounded. It contains a learner-visible
label plus a closed set of exact structural anchors when available, such as an
exact Course/View/item, MaterialMap selector, Goal revision, Assignment
revision, or other accepted owner reference. A genuinely cross-cutting subject
may be explicitly LearnerHome-wide. Free prose is not silently resolved to an
owner identity by keyword matching.

One identity continues only while revisions concern the same intended learning
subject. Wording, uncertainty, or the judgment itself can change under that
identity. A materially different subject creates a new identity and may cite
the old one as superseded context; the runtime does not decide fuzzy semantic
identity. The ordinary Agent proposes the distinction, and the learner can
correct it naturally.

Every revision is a complete immutable snapshot. Correction never mutates an
old revision, silently retargets its sources, or rewrites what a prior Context
cut saw. Retiring a judgment means only that it should not be offered as current
learner-state memory; it does not mean the learner forgot, regressed, mastered
the subject, abandoned a Goal, or completed an Assignment. Restoring it appends
a new active revision.

## Authorship and source arms

A new judgment or correction must have one admitted semantic cause:

1. **interpreted learner report** — an exact learner occurrence and bounded
   excerpt support what the learner said about their own state;
2. **Tutor/model judgment** — an exact root interactive model operation, its
   exact LearningContext cut, and the specific Interaction/outcome/source facts
   actually used support a fallible inference;
3. **exact owner observation** — one or more exact accepted owner revisions,
   such as Gate 19 evidence or an exact material selector and response outcome,
   support the interpretation; or
4. **learner correction of a current judgment** — a new exact learner
   occurrence identifies what should change, while unchanged exact sources are
   carried with their original provenance.

These arms may be composed in one complete basis when the judgment genuinely
depends on several facts. Merely appearing in model context does not make a
fact a cited source. Generic prose, a todo row, token statistics, clock passage,
Assignment completion, or plan wording cannot become learner-state truth
without an admitted author and source-bearing judgment.

The root Agent may author a judgment after useful teaching, but a judgment
write is never mandatory. The command description and default Tutor prompt must
make clear that explanation, demonstration, and guided work are valuable even
when no durable learner-state update is warranted.

## Natural correction rather than approval ceremony

The learner does not manage internal IDs or approve a state proposal through a
special workflow. Normal dialogue is sufficient:

```text
Tutor: You seem comfortable with the definition but not yet with applying it.
Learner: Actually the definition is the part I still do not understand.
Tutor: ...revises the exact current judgment and teaches from the correction...
```

The write still uses the ordinary capability/permission policy and typed
settlement. “No special approval ritual” does not mean bypassing permissions,
concealing a durable write, or losing replay truth. The retained terminal
carrier shows a bounded committed/already-applied/no-change/conflict/failure
result, and the learner can inspect or correct it later.

## Commands, settlement, recovery, and authority

Gate 20B reuses the Gate 8 learning-command path, Gate 12 Turn/Session
identities, current capability/permission catalog, and startup recovery. It does
not create a second executor, queue, database, provider loop, or prompt-only
write path.

The logical mutations are:

- create one judgment with a generated stable identity;
- revise or directly correct one exact current head;
- retire one exact current head; and
- restore one exact retired head.

An implementation may express these as a closed change set when the existing
command substrate already owns atomic multi-intent settlement. Operation names
are not separate product concepts unless they protect different legal
transitions.

Every mutation binds the exact causal occurrence/model operation, physical tool
invocation, semantic effect address, expected current head, capability,
permission outcome, author/source basis, and durable terminal settlement. Exact
physical replay returns stored truth. Identical semantic reuse is already
applied or no-change according to the settled effect; changed reuse conflicts.
A current-head race rejects without partial revision. A crash cannot leave a
current revision without its effect/receipt/Tool settlement or a terminal Tool
settlement that names a nonexistent revision.

Initial write authority is the ordinary interactive root Tutor Agent. Child,
delegated, or restricted Agents are default-deny for mutation unless a later
accepted contract earns a narrower capability. Read authority follows the
existing Gate 18 operation-specific capability projection; withholding the
owner reveals neither identity nor count.

## Bounded Context index and lazy exact reads

This Gate adopts Gate 18's existing computational pattern rather than creating
a memory runtime:

```text
owner snapshot + exact dependency cut
-> bounded automatic directory/index
-> provider-visible authorized lazy-read capability
-> exact current or pinned revision read when the Tutor needs detail
```

The automatic contribution is a directory, not an eager replay of every
judgment body or old Session. Its eligible set contains active current heads
whose exact structural anchors intersect exact owners already present in the
operation's LearningContext, plus explicitly LearnerHome-wide heads. It does
not use request keywords, embeddings, a hidden model call, pedagogical ranking,
or plan priority.

Within the current Gate 18 owner-contribution limit, at most eight compact index
entries are included in stable identity-creation order. Each entry contains a
learner-visible subject label, judgment/revision locator, disposition/currentness,
author class, exact anchor kinds, and enough uncertainty/source indication to
decide whether a lazy read is worthwhile. Multiple entries do not promote the
first as the Tutor move. The cut binds the pre-truncation count, retained count,
byte-budget omission, candidate-limit omission, owner dependencies, and
authorized lazy-read capability. A complete semantic entry stays within Gate
18's existing 2,048-byte per-entry ceiling; detailed body, sources, and history
remain lazy.

If more current heads exist, the model sees honest omission and can use a
bounded cursor-stable discover read. This is not blind search: the automatic
section exposes that learner-state memory exists, its exact counts and
omissions, the visible subject directory, and the authorized query capability.
It is also not eager loading. The model chooses which details to retrieve for
the current learning move.

The design follows the resource discipline associated with greedy or dynamic
programming techniques: retain a small sufficient frontier and expand only the
state that can affect the current decision. This analogy does not install a
deterministic relevance function or pedagogical optimizer.

Reads distinguish:

- exact pinned revision;
- current head by stable identity;
- bounded discovery at one exact `asOf` and owner-dependency cut; and
- bounded revision history.

All reads are zero-write. Cursor resume preserves the original cut or returns a
typed stale result; it never joins later source-owner state into an old page.
Provider retry and an already-admitted model operation keep the same exact cut.
A fresh operation may see a newer judgment revision. Withheld or unavailable
read capability is explicit and does not leak hidden identities or counts.

## Intermittent use and time

No background daemon exists. Clock passage, a missed Session, silence, and
absence from Repa create no learner-state revision and imply neither learning
nor lack of learning. An old judgment may become less useful, but age is a
read-time fact, not automatic decay or regression.

On re-entry, the ordinary Tutor may use an old judgment conditionally, ask one
outcome-relevant question, inspect newer exact evidence, or proceed with a
teaching move that does not require certainty. If a correction is useful, it
appends a successor. The learner is not required to reconstruct daily activity
or confirm every remembered judgment before teaching can continue.

## Earned consumers and causal evidence

Gate 20B needs actual product consumption, not database visibility alone.

### Fresh-Session adaptation trace

1. In Session A, the learner attempts an exact concept/application task.
2. The ordinary Tutor explains or guides first; it then records a bounded
   source-bearing judgment such as “definition understood; applying the
   invariant remains uncertain,” tied to the exact interaction and any cited
   evidence.
3. Session A ends. Transcript replay is not imported into Session B.
4. Session B's exact LearningContext contains the compact judgment index.
5. Under a request to continue learning the same subject, the ordinary Tutor
   lazy-reads the exact revision and starts an application-focused explanation
   or guided attempt rather than mechanically repeating the definition.

### Natural correction trace

Hold the request and unrelated owner state fixed. The learner says that the
definition, not merely its application, is still confusing. The ordinary Agent
commits one source-bearing successor. A fresh exact cut points to that revision;
the later Tutor reads it and begins a definition-level explanation. Evidence
must link correction occurrence -> settled successor -> exact Context/index or
lazy read -> changed teaching move.

### Zero-write trace

A useful explanation or demonstration completes with no learner-state command
because no durable judgment is useful. The Gate fails if the provider prompt,
tool description, or host logic makes a state write the center of every
interaction.

## Failure and correction matrix

| Situation | Truth-preserving result |
| --- | --- |
| model proposes an unsupported certainty | runtime may store only the source-bearing authored judgment; it does not certify it, and the learner/Tutor can correct it |
| learner corrects wording or meaning | append one complete successor against the exact head; preserve old revision and unchanged sources |
| subject is materially different | create a new identity; do not overwrite an unrelated learning subject |
| cited evidence/source later changes or disappears | exact old revision remains; fresh projection reports dependency drift/unavailability separately |
| permission denied or prompt aborted | no judgment/effect; terminal settlement is exact |
| crash after admission | recovery reconciles effect/receipt/domain/Tool truth without blind redispatch |
| provider fails after commit | committed revision remains; later operation sees exact current state |
| Session is deleted | independent learner-state revision and minimum durable cause survive according to existing learning-command rules |
| learner is absent for weeks | no automatic decay, regression, learning, or retirement |
| more candidates exist than fit | exact count and omission plus bounded discovery; never silent dropping or first-row priority |

## Reuse audit: retain, adapt, retire

This Gate follows the maintainer's audit correction that a drifted period is not
accepted or rejected wholesale.

**Directly reuse:**

- the single Repa SQLite lineage and forward migrations;
- Gate 8 physical invocation, semantic effect, receipt, capability, permission,
  terminal settlement, replay, and recovery;
- Gate 12 Turn/Session/model-operation identity and cancellation;
- Gate 18 immutable operation-exact cuts, owner sections, omission truth,
  provider-tool binding, capability withholding, and lazy owner reads;
- Gate 19's exact evidence identity and its strict non-implications; and
- the current ordinary released-v1 Agent, TUI carriers, registry, and tool
  presentation path.

**Adapt:**

- the owner-specific compact Context entries used by Goal, FutureAttention,
  evidence, and Assignment become a directory of learner-state subjects whose
  detailed semantic bodies are lazy;
- the existing semantic-command pattern gains a new domain meaning but no new
  executor; and
- existing exact-source projections are cited as basis without being absorbed
  into a universal fact table.

**Retire or refuse:**

- using Gate 19 binary evidence as mastery;
- a global mastery scalar, deterministic learner estimator, automatic evidence
  aggregation/decay, or mandatory post-interaction state write;
- eager history/transcript injection, blind unindexed search, prompt-only
  memory, or a second memory service; and
- any inherited coding todo, plan-mode file, token-capacity field, or generic
  task construct relabeled as learner state.

Before implementation, the executor must inspect the current Gate 18 and
OpenCode/Repa registry/read mechanisms and demonstrate why each reused seam
preserves identity, authorization, correction, failure, and exact-cut behavior.
Source resemblance or a convenient helper name is not sufficient.

The opening read-only reuse audit found the concrete seams already present:

- `packages/core/src/learning-context/schema.ts` and
  `packages/core/src/learning-context.ts` own the current 32-KiB canonical,
  16-KiB rendered, 2-KiB per-semantic-value, eight-entry family, exact omission,
  locator-only, owner-capability, and versioned cut behavior;
- `packages/core/src/turn/turn.ts` owns atomic model-operation/cut admission and
  exact replay rather than query-time reprojection;
- `packages/opencode/src/session/llm.ts`, `prompt.ts`, and `processor.ts` bind the
  actual provider-visible tool surface, freeze provider retry, and continue the
  ordinary Agent after a lazy Tool Part;
- `packages/opencode/src/tool/registry.ts` and
  `packages/opencode/src/session/tools.ts` already own registry collision,
  permission, exact Turn/tool context, and lazy-read dispatch; and
- current Goal, learner-response-evidence, FutureAttention, and Assignment reads
  demonstrate different owner-specific cursor/dependency contracts. Gate 20B
  may reuse their common accounting and transport, but must define its own
  current/exact/history/discovery semantics instead of inventing a universal
  cursor or copying Assignment's strongest guarantees by analogy.

The current Core owner lists, renderer, validator, and fit tiers are explicit
rather than plugin-registered. Extending them directly in a versioned Context
generation is the evidenced first implementation shape. A generic owner plugin
framework has no second proven consumer and is not authorized by this Gate.

## Nonclaims

Gate 20B does not establish:

- objective mastery, retention, grade, score, probability, or educational
  efficacy;
- a universal ontology of concepts, prerequisites, misconceptions, or skills;
- automatic inference from every response, tool use, elapsed time, or completed
  Assignment;
- spaced repetition, decay, review scheduling, or priority;
- a learner activity/adherence ledger;
- plan suggestions, Tutor move selection, or Gate 21A arbitration;
- external LMS, calendar, assessment, or credential truth;
- background processing, full-history search, or eager transcript memory; or
- delegated mutation, deep deletion, release readiness, or a second runtime.

## Contract falsifiers and reopen conditions

The contract must reopen if any of the following is demonstrated:

1. A representative later teaching move cannot use an open-language judgment
   without a fixed numeric or categorical state that the program must own.
2. Exact subject identity cannot remain stable enough for correction without a
   new concept/prerequisite authority.
3. Gate 18's bounded directory plus lazy exact reads cannot find relevant state
   without either eager history injection or an independently justified search
   index/semantic retrieval authority.
4. A real consumer requires automatic aggregation, decay, or evidence-derived
   confidence and cannot tolerate honest fuzzy/unknown judgment.
5. The ordinary Agent repeatedly fabricates or overstates learner state even
   with exact sources, visible non-implications, and natural correction; a
   surviving causal trace would justify a narrower semantic control, not an
   immediate universal estimator.
6. A useful learner-state judgment has no independent teaching/review consumer
   and exists only to populate a plan suggestion; Gate 20B would then be the
   wrong acceptance unit.

## Required implementation/evidence boundary after review

The accepted contract/theory layer requires Gate 20B implementation/evidence
to cover:

- a normal forward migration from a frozen exact Gate 20A predecessor and fresh
  versus upgraded schema/behavior parity;
- immutable complete revision, current-head, source, effect/receipt/settlement,
  and maximum-value structural invariants;
- learner report, exact evidence, exact Interaction/model judgment, and natural
  correction source arms;
- create/revise/retire/restore, stale head, exact replay, semantic duplicate,
  changed conflict, permission allow/ask/deny/abort, cancellation, crash, and
  restart;
- root write, restricted/delegated default-deny mutation, authorized read, and
  withheld-context non-disclosure;
- exact/current/history/discover reads, cursor staleness, source drift, old-cut
  retry, truncation, and maximum-value Context fit;
- the fresh-Session adaptation, natural correction, and zero-write traces above;
  and
- one ordinary released-v1 qualification showing a real teaching move rather
  than a state-management conversation.

The exact physical table names, package names, numerical database bounds, and
tool spelling are implementation choices only after they preserve this
contract and reuse the mature substrate.

## Review questions

The fresh reviewer should try to reject this candidate by asking:

1. Does the Gate own one independently useful fact, or merely duplicate Gate 19
   evidence, current transcript context, or Gate 21 advice?
2. Can every judgment identify its subject, author, exact sources, uncertainty,
   and correction lineage without the runtime claiming epistemic truth?
3. Can the ordinary Tutor and learner revise the judgment naturally without a
   hidden approval workflow or unsupported unanchored write?
4. Does the bounded directory plus lazy reads provide useful discovery without
   eager history, silent omission, hidden semantic selection, or identity leak
   to unauthorized operations?
5. Are old revisions and old Context cuts exact after source, Course, Goal,
   Assignment, evidence, Session, or clock state changes?
6. Do real explanation/practice/review consumers use the judgment while
   zero-write teaching remains first-class?
7. Has the candidate reused Gate 8/12/18 mechanisms because they own the same
   computational boundary, or copied their surface while changing identity or
   failure semantics?
8. Can any all-green implementation still turn a fuzzy model opinion into a
   program-certified mastery claim?

## Current boundary

The retained reviewer accepted the exact implementation/evidence candidate and
closed `G20B-IE-001..004`; both Gate layers are accepted. Feature-branch
publication and local mainline integration completed afterward at exact
implementation commit `b040518591a2f065aec9b82214496a113c81ed35` through Gate
21 closure/status commit `4b85c24bb448f97649a4453c2608f74cf9ddda92`.
`origin/main` contains the accepted implementation through Gate 21
integration/status commit `972f0f7256c438ad06f8bfcc211442f81b2b46b2`.
Release, credentialed-provider qualification, and later-Gate dispositions
remain separately governed.
