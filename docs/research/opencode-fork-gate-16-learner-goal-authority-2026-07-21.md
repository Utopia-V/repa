# OpenCode fork Gate 16: learner Goal authority

Status: Agent-native Goal query/write contract accepted by fresh reviewer
`019fb2a3-c902-7882-8134-1bf33f1eb04d`. `G16-AN-001..003` are closed, and the
same reviewer accepted the mechanical V15-to-V16 predecessor correction after
Gate 8 advanced the current native database at
`19d0fe933fd8db96c6f22e509294cb93c28ec38c`. Scoped Gate 16 implementation
authority was available for the contract below. The same reviewer returned
`Revise` on the first implementation/evidence candidate with
`G16-AN-IMP-001..003`. The top-level executor has repaired those exact seams;
the superseding candidate is complete and unstaged, and exact-diff closure by
the same reviewer is pending. It is not accepted or integrated. Gate 17
remains unauthorized.

The decisions under **Accepted maintainer decisions**, the structural Goal
identity/revision/lifecycle result, and corrective TUI integration
`9e91d43c629b66d65c8741e342bca7cf05de5667` remain retained inputs. Its exact
post-commit result surface and generic configured-`ask` projection remain
accepted; the Gate-specific proposal/confirmation path is part of the reopened
semantic seam. Review task `019fa8a5-eea1-79f0-abd8-50df4f3cdaa0`, historical
run `gate16-whole-20260721-01`, and commit
`69433fc78d383bade1d92319eb3153a2cd7c68bd` remain provenance for their
historical candidates, not acceptance of the contract below.

Date: 2026-07-21

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Primary predecessors:
[passed Gate 7 Course and Course View authority](opencode-fork-gate-07-course-view-authority-2026-07-15.md),
[passed Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[passed Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
and [passed Gate 15 retained scoped steering](opencode-fork-gate-15-retained-scoped-steering-2026-07-20.md)

Successor boundaries: Gate 17 must remain usable without a Goal. Gate 18 may
project a bounded, exact Goal revision into model context. Gate 21 may consume
an exact Goal revision as one typed substantial planning demand. Gate 22 later
composes Goal inspection and correction into the terminal. Gate 23 proves the
integrated loop, including Goal-driven cross-day replanning. None of those
consumer behaviors belongs to Gate 16.

## 2026-07-30 Agent-native semantic correction

The invalid prior interpretation was that model fallibility required the host
to prove that one natural-language interpretation was uniquely justified. The
historical implementation attempted that with English/Chinese phrase lists and
internal Goal IDs. The 2026-07-28 corrective amendment removed those parsers
but still required an immutable complete, untruncated candidate universe before
a contextual reference could use direct authority. Both designs duplicate the
ordinary Agent's semantic work and make the learner-facing path depend on an
internal proof protocol.

The current production surface confirms the mismatch:

- the Goal tool description and default Repa prompt require internal Goal IDs
  to occur in learner wording for direct update/replacement;
- Core contains fixed create, cadence, negation, condition, target, lifecycle,
  correction, and replacement phrase tests; and
- the same Gate contract denies the Agent a model-visible Goal query while
  expecting it to resolve contextual Goal references.

The rederived Gate boundary must instead preserve this simple flow:

```text
learner natural language
-> ordinary Agent interprets the intent
-> Agent reads exact Goal/Course owner state lazily when needed
-> Agent asks only for a materially unresolved learner-owned choice
-> typed Goal command validates and atomically commits exact current state
-> TUI shows the durable, correctable result
```

The model-visible owner query returns exact Goal/Course identities, current
versions and semantic snapshots, stable cursors, and explicit omission or
truncation. Those are trustworthy facts for the Agent, not mechanical proof of
linguistic uniqueness. The Agent decides whether to read more, make a
transparent reversible choice, or clarify. A typed write binds the exact
admitted learner occurrence and selected current heads; the runtime validates
shape, source availability, owner/version/CAS, permission, legal lifecycle,
atomicity, replay, and correction without requiring the learner to utter an
internal ID.

Clear learner-authored intent may still commit as a routine visible,
correctable local write. If a materially different outcome, condition, scope,
target, identity/lifecycle relation, or replacement meaning remains unresolved,
the Agent asks in ordinary conversation before issuing the same typed command.
Gate 16 does not presume a separate proposal/confirmation state machine for
that clarification. The command binds the resulting exact source occurrence,
and the visible result and correction path contain model error without a phrase
parser or exhaustive candidate proof.

This owner query is not automatic Gate 18 context injection and not Gate 22's
learner-facing browser. It is the ordinary tool access needed for Gate 16's own
natural-reference write path. The new contract must simplify the model-facing
query/write surface, remove semantic phrase forensics from application code and
SQLite, preserve the retained structural Goal invariants that still earn their
cost, and receive fresh separate contract/theory review before implementation.

## Current Agent-native Goal contract candidate

This section is the only current contract for the reopened query/write seam.
The accepted maintainer decisions and retained structural Goal sections below
remain current. Later source-authorization, dependency-prompt,
proposal/confirmation, migration, and closing-evidence clauses labelled
historical or superseded are provenance only where they conflict with this
section.

### Learner behavior and owner reads

The ordinary interaction is:

```text
learner natural language
-> Agent optionally discovers and reads exact Goal/Course state
-> Agent interprets identity and meaning or clarifies only as needed
-> Agent issues one bounded typed Goal change set
-> configured capability policy and atomic settlement
-> exact visible, correctable result
```

Gate 16 exposes thin read-only Agent tools over existing owner APIs:

- Goal discovery returns bounded current Goal summaries under an optional
  owner-defined filter and an opaque revision-fenced continuation cursor;
- exact Goal read returns one current complete revision, and history read pages
  immutable revisions when identity/lifecycle context is needed;
- Course list/get is the same Course-owner read introduced by Gate 14 rather
  than a Goal-owned copy; and
- trusted runtime time supplies each Goal read's `asOf` value. The model cannot
  forge the clock used for target-time relations.

Every result includes the exact identities, current versions, semantic
snapshot, disposition, source availability, and pagination state owned by that
query. A cursor says more owner rows remain; no cursor says only that the exact
query completed. Reads create no Goal command, candidate, confirmation,
authorization, or durable query snapshot and never advance the learning
frontier. The Agent decides whether to page, read exact history, select a
referent, or clarify. The learner never needs to know a Goal or Course ID.

The default Tutor Agent can call these reads. A restricted or delegated Agent
sees them only through the authoritative capability/permission intersection;
read authority never implies Goal write authority. Their built-in identifiers
are reserved against custom, plugin, and MCP collision, and a read creates no
write-policy, permission-request, or settlement row.

### One Agent-issued Goal command

Gate 16 retains one reserved versioned capability whose canonical command is
one nonempty bounded ordered change set over the existing `create`, `update`,
and `replace` meanings. Its model-visible payload contains only delegated
semantic choices:

- `create` supplies a required outcome and may supply conditions, a complete
  LearnerHome-or-Course-ID scope, the structured V2 target intent defined
  below, and an initial
  disposition;
- `update` names one Goal and exact head Revision selected from owner reads,
  then supplies a nonempty patch over outcome, conditions, scope, target,
  and non-superseded disposition. Omitting disposition preserves the exact
  current disposition/relation; explicitly choosing active, achieved, or
  abandoned clears a current supersession. `update` cannot establish or
  retarget supersession;
- `replace` names one source Goal and exact head Revision, may include a
  semantic patch for that source successor, then identifies either one existing
  target Goal/head Revision or the semantic fields for one runtime-created
  target. Only `replace` establishes or retargets supersession; and
- omission in an update means carry the exact predecessor field, while explicit
  empty/null arms perform the field's legal clear. The runtime materializes the
  complete resulting snapshot before permission or commit.

The payload contains no numeric owner versions, model-invented or newly
generated Goal/Revision identities, effect/receipt/permission/time/order
identities, field-basis declarations, source excerpts, candidate universe,
confirmation snapshot, or authorization label. Exact existing Goal, head
Revision, and Course references come only from owner reads or protected
context.
New or changed Course membership supplies only exact Course IDs; the runtime
captures and validates current Course owner state.

#### Closed V2 target intent and normalized projection

The current command has one closed target field. Its model-visible arms are:

```text
TimeZoneIntentV2 =
  { type: "source" }
  | { type: "iana", name: IANAZoneName }
  | { type: "fixed_offset", offsetMinutes: Integer[-840, 840] }

TargetIntentV2 =
  { type: "absent" }
  | {
      type: "instant"
      localDateTime: YYYY-MM-DDTHH:mm:ss[.SSS]
      timeZone: TimeZoneIntentV2
    }
  | {
      type: "local_date"
      date: YYYY-MM-DD
      timeZone: TimeZoneIntentV2
    }
```

`source` means the exact time zone already captured on the admitted learner
occurrence; it is not a model-supplied clock or a later process default.
`iana` names the semantic civil-time zone chosen by the Agent. `fixed_offset`
is an exact signed minute offset in `[-840, 840]`. The Agent selects the target
kind, civil date or local date-time, and zone selector when it changes target
meaning. It never supplies an epoch, tzdb release, derived UTC offset,
normalization basis, source expression, normalized display string, or `asOf`.

The runtime validates the closed calendar syntax and zone name, binds the
exact trusted source zone or current installed tzdb release, and derives the
epoch millisecond and effective offset for an instant. A nonexistent or
ambiguous IANA local time at a free semantic address is unrepresentable and
creates no candidate; the Agent may clarify and issue an exact fixed-offset
intent. An already occupied address still settles from its immutable canonical
intent before this live binding. Display formatting is derived from the stored
value and is never semantic authority.

Create and runtime-created replacement-target omission canonicalize to
`absent`. In an update or the source patch of `replace`, omission canonicalizes
to the distinct typed intent `carry`; explicit `absent` clears the target.
These canonical arms, not spelling variants, enter the semantic fingerprint.

A current V2 revision stores only one normalized target value:

```text
ResolvedZoneV2 =
  { type: "iana", name: IANAZoneName, releaseID: TimeZoneReleaseID }
  | { type: "fixed_offset", offsetMinutes: Integer[-840, 840] }

TargetValueV2 =
  { type: "absent" }
  | {
      type: "instant"
      instant: EpochMilliseconds
      utcOffsetMinutes: Integer[-840, 840]
      resolvedZone: ResolvedZoneV2
    }
  | {
      type: "local_date"
      date: YYYY-MM-DD
      resolvedZone: ResolvedZoneV2
    }
```

The command/effect additionally retains the exact canonical target intent and
the complete versioned before/after snapshots. Reads expose a discriminated V1
historical target or this V2 normalized target; they never flatten the two
shapes or present display text as stored semantics.

When a V2 update omits target over a V1 predecessor, the owner projects only
the predecessor's immutable target value into V2: absent remains absent; an
instant retains its exact epoch and offset as a fixed-offset resolved value;
and a local date retains its exact date plus recorded IANA zone/release. The
V1 predecessor keeps its `sourceExpression`, `normalized`,
`normalizationBasis`, raw bytes, and historical field basis. None is copied,
discarded, or reclassified as current V2 semantic proof. The ordinary revision
predecessor link and the V2 effect's versioned before/after snapshots make the
carry truthful without reintroducing a per-field authorization map.

The trusted runtime supplies the admitted learner occurrence,
Session/Turn/model-operation, Assistant/tool-call identity, source temporal
context, capability version, physical invocation, and generated effect/receipt
identities, current heads/versions, current Course descriptors, and trusted
calendar facts. It materializes the complete resulting revision from the
semantic intent and exact current head. The applied effect preserves the
canonical typed intent and exact owner-resolved before/after snapshots; the
revision preserves its causal occurrence. Omitted fields and initial defaults
are therefore reconstructable without a second model-supplied or durable
per-field proof map.

The shared learning-command `agent_action` basis is Agent
issuance/admission provenance, not capability authorization, learner assent, or
semantic proof. It records the actual issuing root or delegated Agent operation
and, for a child, the exact Gate 12 parent task/delegated-capability chain and
causal root occurrence. It does not claim that source prose literally entailed
every structured field. Capability policy and settlement remain separate.
`agent_action_v2` is the Goal command's versioned foreign-key projection to
that accepted shared record, not another authorization relation: its `root`
arm binds the exact model operation and causal root learner occurrence; its
`delegated` arm additionally binds the exact child task, parent task, and
non-escalating delegated-capability chain back to that same root occurrence.

Historical `learner_request`/`learner_acceptance`, per-field bases, authored
excerpts, and confirmation snapshots remain readable for old effects but are
not current write inputs. When a materially different outcome, condition, scope,
target, identity/lifecycle relation, or replacement remains unresolved, the
Agent asks in ordinary conversation, waits for the answer, and then issues the
same Goal command. A short answer such as “对，就这样” does not require a
host-prepared candidate or another approval under effective `allow`.

### Semantic choices versus program invariants

The Agent owns open interpretation:

- whether an utterance creates durable intent at all;
- which existing Goal a contextual reference denotes;
- whether a changed expression continues, corrects, resumes, supersedes, or
  begins a distinct Goal;
- which outcome/conditions/scope/target meaning the learner authored or
  accepted; and
- whether ambiguity materially changes durable history and therefore needs
  clarification.

The program owns:

- closed semantic-intent and resolved snapshot shapes, bounded sizes, exact current
  occurrence and owner references, generated identities, capability policy,
  and one-mutation admission;
- linear Goal revisions, complete snapshots, exact CAS, Course admission for
  newly added scope members, immutable history, legal lifecycle tags,
  one-to-one acyclic current supersession, and atomic multi-operation effects;
- calendar/zone validity and arithmetic over the Agent-selected target arm,
  while preserving the causal occurrence, structured target, and trusted
  temporal context without parsing language to prove the interpretation;
- physical replay, semantic duplicate/conflict, permission, cancellation,
  recovery, commit sealing, source tombstones, and exact terminal
  presentation; and
- exact causal occurrence and immutable intent/before/after provenance without
  source-language forensics or a separate per-field proof protocol.

The previous dependency-complete carry rules are not current prompt-forcing
policy. Omitted update fields carry mechanically from the exact predecessor;
supplied fields replace them. The full runtime-materialized snapshot and any
retained disposition/relation remain visible before configured `ask` and after
settlement. Whether an omitted meaning should continue is an Agent judgment,
which clarifies when the choice is consequential. Text similarity, elapsed
time, evidence, current ability, Course progress, and Tutor prose still never
alter identity or lifecycle automatically.

### Admission, permission, settlement, and recovery

The retained semantic address is
`(admitted learner occurrence, Goal change-set slot)`. Exact physical replay and
a committed same-address `already_applied` or `semantic_conflict` settle before
live Goal/Course/source state, cancellation, delegated-capability membership,
or capability-policy checks.

Goal persistence has one closed disposition projection:

- `legacy_v1` preserves each historical direct/accepted command,
  authorization/confirmation shape, physical state, and terminal replay
  exactly;
- `semantic_terminal_v2` is a physically new invocation whose semantic address
  was already committed. It stores the physical identity, semantic address,
  canonical incoming typed-intent fingerprint, immutable existing
  effect/address evidence, and `already_applied` or `semantic_conflict`. It has
  no current Agent-issuance row, capability evaluation/request/reply/outcome,
  live Goal/Course snapshot, new before/after locator, candidate effect, or
  fabricated target facts; and
- `candidate_v2` is a genuinely free semantic address admitted only after the
  issuing root/child operation and its Goal-write membership are valid. It
  stores the physical/semantic identity, canonical typed intent, exact
  `agent_action_v2` root or delegated issuance chain, runtime-bound
  source/Goal/Course/temporal input snapshot, capability lifecycle, and later
  no-effect or effect settlement.

The universal Gate 8 physical ledger remains outside this Goal disposition
union. A structurally malformed or forged root/child causal envelope fails
physical validation. An authentic delegated operation whose admitted
capability set omits Goal write can still name a pre-existing semantic address,
so duplicate/conflict wins without inventing Agent provenance; when the
address is free it receives a truthful physical no-effect denial but no Goal
candidate or `agent_action_v2` row. This pre-admission denial is distinct from
effective policy `deny` after a valid candidate admission.

The semantic fingerprint is the canonical typed Goal change-set intent,
including exact protected Goal/Revision/Course references and the target arms
above. It excludes root-versus-child identity, Agent-action lineage, capability
policy/outcome, permission request/reply, and live materialized owner state.
Changing who issued an otherwise identical command therefore cannot turn a
duplicate into a conflict, while changing the typed Goal meaning must.

Admission and settlement use this order:

1. Exact physical replay returns its stored result; physical identity reuse
   with a different trusted envelope or canonical typed intent is conflict.
2. A physically new authentic invocation computes the immutable semantic
   address and canonical intent fingerprint without consulting live
   Goal/Course/source state.
3. An occupied address atomically records and settles
   `semantic_terminal_v2` as duplicate/conflict.
4. Only a free address evaluates exact root/delegated Goal-write membership,
   then atomically reserves `candidate_v2`, its truthful Agent issuance, and
   runtime-bound current command state.
5. The admitted candidate uses the common capability lifecycle:
   - effective `deny` settles denied with no Goal effect while retaining
     truthful candidate issuance and capability history;
   - effective `allow` adds no Gate-specific proposal or confirmation;
   - effective `ask` uses the ordinary typed permission projection for the
     exact complete change set; and
   - rejection, correction feedback, cancellation, or lost prompt settlement
     is a truthful no-effect result.

Final settlement rechecks semantic replay/conflict first, then source
availability, one-mutation ownership, all runtime-bound Goal/Course heads,
the exact materialized result, legal final supersession projection, and Turn/tool
frontier in one transaction. Invalid, stale, over-limit, or unauthorized
operations reject the whole change set. Authorized no-change operations remain
visible but create no revision; an all-no-change set creates no effect,
mutation-slot use, or frontier advance. A real set atomically commits Goal
identities/revisions, effect, receipt, commit seal, physical Tool settlement,
and exact result.

A `candidate_v2` that loses the semantic address during capability wait or
recovery settles `already_applied`/`semantic_conflict` first, keeps its already
truthful Agent-issuance and capability history, and creates no losing effect.
Startup recovery and live abort derive or replay the exact durable capability
outcome and then run that same semantic-first final check. With no winner they
settle the applicable interrupted/no-effect result; even a durable allow never
applies an uncommitted Goal change. Session or source deletion preserves Goal
history and truthful source tombstones.

### Persistence and forward migration

After the accepted Gate 14 V13-to-V14 migration and Gate 8 V14-to-V15
per-message projection migration, Gate 16 requires one V15-to-V16 forward
migration from a frozen exact then-current database and matching fresh-schema
generation. It must:

- remove fixed English/Chinese phrase, internal-ID-in-source,
  keyword/cadence, source-entailment, and dependency-prompt checks from current
  application validators. Preserve the frozen V11 DDL/fixture that proves the
  old rows, while ensuring the current V16 manifest does not reinstall those
  already-retired phrase triggers;
- make old confirmation snapshots, prepared confirmations, accepted-candidate
  bindings, and resolution bases historical-read fields only, with no current
  producer, tool path, or new-row requirement;
- preserve every historical Goal identity, revision, field basis, Course
  membership, target, disposition, supersession, effect, receipt, source,
  confirmation, and raw command byte-for-byte in meaning, without upgrading old
  evidence or inventing defaults;
- admit exactly the new semantic-intent command version for current writes and
  store the closed `legacy_v1 | semantic_terminal_v2 | candidate_v2`
  disposition. `semantic_terminal_v2` stores only immutable existing-effect
  evidence; `candidate_v2` stores exact Agent issuance, runtime-bound state,
  capability history, and owner-resolved before/after result. Legacy
  basis-input/confirmation/resolution fields are absent from both V2 arms;
- version Goal revision targets and command/effect/read projections explicitly:
  V1 retains its exact source/proof-bearing absent/instant/local-date shapes,
  while V2 uses only the normalized target value defined above. A V2 omitted
  carry from V1 projects the predecessor value into V2 inside candidate
  materialization without rewriting the V1 row or copying its proof fields;
- make historical per-field-basis rows and constraints read/replay-only for old
  revisions rather than requiring them for current revisions;
- reuse the shared `agent_action` learning-command basis introduced by Gate 14
  while preserving historical basis bytes and replay projections;
- replace the current V1-only Goal basis/confirmation constraints with the
  closed versioned disposition and target unions through the migration rather
  than mutating a predecessor artifact;
- retain only structural database checks reachable through supported
  transitions: closed JSON/row shapes, foreign keys, version chains, immutable
  rows, bounds, exact historical-basis references, unique heads,
  one-to-one/cycle protection, effect/receipt/commit-seal completeness, and
  legal settlement;
  and
- prove fresh/upgrade parity plus restart recovery from the frozen V15 fixture:
  terminal V1 direct/accepted effects retain exact replay, while every admitted
  nonterminal V1 row—including old confirmation and permission states—settles
  interrupted/no-effect without re-prompting, applying, or fabricating facts;
  V2 semantic terminals remain lifecycle-free, and V2 candidates recover
  semantic-first across absent policy, issued/no-reply, and every durable
  capability outcome.

Legacy rows remain readable and replayable through explicit historical
projections. They do not keep the old semantic parser or confirmation producer
reachable. Removing a wrong current path while retaining immutable historical
truth is not a second runtime.

### Closing evidence for this correction

Implementation/evidence may close only if fresh causal checks establish:

- Goal discover/current/history and reused Course reads are bounded,
  cursor-truthful, exact, and zero-write. Registry/policy tests prove their
  default availability, restricted default-deny plus explicit allow behavior,
  delegated capability intersection, and that read visibility never implies
  Goal write. Goal read identifiers remain reserved against built-in,
  custom/plugin, and MCP collision;
- clear natural-language creation and contextual update work without `/goal`,
  learner-entered IDs, fixed phrases, exhaustive pages, or a Gate-specific
  confirmation under effective `allow`;
- the public current-write schema rejects model-supplied versions, generated
  identities, field bases, excerpts, candidate/proposal, confirmation, and
  authorization fields;
- the closed V2 target schema accepts only absent, civil instant plus exact zone
  selector, or local date plus exact zone selector; runtime tests own calendar,
  tzdb-release, offset/epoch, ambiguous/nonexistent local-time, trusted-source-
  zone, and display derivation. Versioned storage/read tests prove exact V1
  history, exact V2 normalization, and every V1→V2 omitted-target carry arm
  without copied or fabricated proof fields;
- a same-purpose correction, changed standard, renewed pursuit, existing/new
  replacement, multi-Course scope change, target-time interpretation, ordinary
  short acceptance, and atomic multi-Goal utterance preserve exact identities,
  runtime-bound owner facts, versions, and visible results;
- real ambiguity causes ordinary conversational clarification only as needed
  and no prior Goal write, while a truncated read is contextual input that may
  invite paging or clarification rather than runtime authorization failure;
- ordinary discussion, a hypothetical/quoted/negated aspiration, Tutor
  suggestion without learner acceptance, elapsed time, evidence, task
  execution, and Course progress create no Goal or lifecycle transition in the
  bounded released-Agent qualification;
- intent materialization, omitted-field carry/default behavior, stale state,
  no-change, duplicate/conflict, allow/ask/deny, cancellation, provider failure,
  Session deletion, revert, restart, and recovery retain deterministic
  no-fabrication behavior;
- exact root and delegated issuance tests preserve the causal root occurrence
  and complete parent-task/delegated-capability chain. A forged chain fails
  physical validation; an authentic child without Goal-write membership
  produces no Goal candidate or Agent-issuance row at a free address; an
  effective policy deny after valid admission retains exact candidate issuance
  and capability-deny history but no effect;
- table-driven replay/race tests distinguish `semantic_terminal_v2` from
  `candidate_v2`: a pre-existing same-address duplicate/conflict wins before
  stale owners, missing Goal delegation, cancellation, and policy with no
  Agent/capability/current-target facts; a candidate losing at final settlement
  returns duplicate/conflict while retaining its prior issuance/capability
  history and creating no effect. Root-versus-child provenance never changes
  semantic equality;
- fault-injected recovery covers candidate admission before capability
  evaluation, atomic effective-`ask` selection plus durable request issue,
  issued/no-reply, durable allow/deny or prompt reply before final settlement,
  and a capability-wait semantic loser. Each branch runs the same
  semantic-first final check, and an otherwise uncommitted allow with no winner
  recovers interrupted/no-effect;
- frozen-current migration and fresh installation agree, historical rows replay
  exactly, admitted nonterminal V1 direct/accepted rows recover
  interrupted/no-effect without re-prompt or application, new rows cannot use
  legacy semantic/confirmation shapes, and SQLite contains no source-language
  interpretation; and
- the V1 field-basis, complete-candidate, prepared-confirmation, and once-only
  confirmation producers, registry entries, TUI controls, and current command
  branches are unreachable after V16, while their identifiers/discriminators
  remain reserved where collision safety requires and historical V1
  read/replay remains exact; and
- the primary TUI and retained carriers show the exact configured permission
  when asked and the exact committed/already-applied/no-effect/failed result
  afterward.

Provider evidence is one bounded qualification of ordinary Agent tool use and
ambiguity behavior, not a language benchmark or proof of every phrasing.
Deterministic suites remain authoritative for schema, transaction, replay,
permission, migration, and recovery.

This candidate does not authorize Gate 17, Gate 18 context injection, Goal
planning, learner-state inference, a learner-facing Goal browser, a generic
semantic resolver, or another Agent runtime.

## Historical 2026-07-27 reopen finding

The accepted contract says entry is not restricted to `/goal`, any other
command, or a fixed interaction shape; a clear fully learner-authored Goal may
commit without redundant confirmation, and the runtime cannot prove full
natural-language semantics. The implementation nevertheless installs
`learner_goal_commit_seal_direct_validate`, which:

- accepts direct creation only when learner text begins with one of a fixed
  English or Chinese command patterns;
- treats a fixed list of words such as `daily`, `every day`, and `每天` as
  cadence evidence regardless of their semantic role;
- scans for fixed negation, scope, target, condition, disposition, correction,
  and replacement phrases; and
- requires direct update/replacement text to contain the internal Goal ID and,
  in several cases, a prescribed rendering of the intended operation.

For example, `请记住我这学期要通过微积分` is a clear learner-authored durable
outcome but does not match the direct-create whitelist. `读懂小说 Every Day`
contains a title that the trigger treats as cadence vocabulary. The existing
tests overwhelmingly use forms such as `/goal ... active LearnerHome goal with
no conditions and no target`, so they do not falsify this boundary.

This is not merely missing internationalization. A database integrity layer
has become an unversioned natural-language parser and interaction protocol,
while an arbitrary out-of-band SQL writer could still drop or bypass the
triggers. The repair must retain structural ownership, foreign-key, uniqueness,
version, append-only, atomic-settlement, and application fault-injection
invariants while removing semantic interpretation and acknowledgement
rendering from SQLite. The direct and accepted-candidate behaviors then require
focused natural-language counterexamples before Gate 16 may close again.

### Superseded 2026-07-28 corrective amendment

This amendment is retained as review provenance. Its rejection of fixed phrase
parsing remains valid, but its complete-candidate resolution proof and resulting
implementation authority were superseded by the 2026-07-30 maintainer
correction above.

The reopen finding exposes one missing provenance arm in addition to the
invalid parsers. The first corrective review found that the proposal let a
selected Goal or Course merely appear in a bounded view without proving that
the view was complete enough to exclude another reasonable referent. Because
Goal discovery is cursor-bounded and context cuts may omit state, a cropped
view could otherwise manufacture apparent uniqueness and let an ambiguous
`learner_request` commit directly. The executor independently verified that
counterexample against the owner-read and context-cut contracts and accepted
it as `G16-RC-001`.

The same fresh, separate top-level reviewer retested the following revised
amendment and returned `Accept`. At that historical point it became
implementation authority for the reopened natural-language boundary. The
2026-07-30 correction above supersedes that authority; this list now records
the reviewed candidate rather than authorizing Gate 16 or Gate 17:

- open-language Goal recognition and contextual reference resolution belong to
  the model-assisted command-authoring boundary; neither application code nor
  SQLite may decide them from a fixed phrase, locale-specific keyword list, or
  learner-visible internal Goal ID;
- the direct `learner_request` arm still binds one exact admitted learner
  occurrence, exact authored excerpts for every changed learner-supplied
  meaning, trusted current Goal/Course identities and versions, a closed
  command, effective permission, and a visible correctable result;
- a model may resolve a natural reference such as “我的微积分目标” to an
  exact trusted Goal head without requiring that the learner repeat its
  internal ID when the learner occurrence plus current context gives it one
  sufficiently determinate referent. That resolution remains an inspectable
  model claim, not a mechanically proved linguistic fact;
- every such natural Goal or Course reference binds an immutable typed
  resolution basis assembled by the runtime from the relevant interaction and
  Goal/Course owners rather than from a model-supplied candidate list. The
  basis preserves the exact learner excerpt, source occurrence and context cut,
  declared owner-query scope, all candidates in that scope with the trusted
  identities, versions, and dispositions relevant to the operation, explicit
  completeness or truncation, and the selected identity/version. The bounded
  scope need not load all LearnerHome state, but it must be causally sufficient
  for the claimed reference. The model still semantically compares candidates
  inside that complete scope; a model-supplied structural/query narrowing that
  excludes owner records, rather than one established by the learner occurrence
  or trusted context, is itself a consequential interpretation;
- `learner_request` may use that resolution only when the exact
  operation-relevant candidate view is complete and untruncated and the model
  judges that it leaves one sufficiently determinate referent. An incomplete
  view, a truncated page or context contribution, more than one reasonable
  referent, or an unauthorized narrowing cannot manufacture direct authority:
  the Tutor must widen through owner reads, clarify without writing, or use the
  existing complete `learner_acceptance` candidate arm. The same arm remains
  required when the operation supplies meaning or a relation not authorized by
  the learner wording;
- final settlement revalidates the selected heads and every declared owner
  scope whose change could alter that candidate universe. A stale or no-longer
  complete basis creates no new effect. A successful first effect binds the
  exact resolution basis atomically to its effect, receipt, and settlement as
  provenance rather than effect identity; physical and semantic replay return
  that first stored basis and cannot replace it with a later model view. Later
  owner changes do not rewrite committed history and instead participate in
  ordinary correction;
- a new Goal needs a fourth field-basis arm,
  `{ type: "defaulted" }`, so omitted initial values are not falsely recorded
  as learner-authored. It is legal only for a direct version-1 new Goal,
  whether introduced by a create operation or as the new target of a replace
  operation: empty conditions, LearnerHome scope, absent target, and active
  disposition. It is illegal for the outcome, accepted candidates, revisions
  of an existing Goal, clearing or changing a field, and every non-default
  value. An explicit learner statement equal to a default remains `authored`;
  migration must not reinterpret historical authored rows;
- language-independent mechanical checks remain program-owned: authored
  excerpts must occur in the exact source, changed values must match their
  bases, a resolution basis must be host-bound and complete for its declared
  scope, selected Goal/Course heads and relevant owner cuts must remain current,
  explicit target normalization must be mechanically reproducible, carried
  fields must match their exact predecessor, and all existing structural,
  transaction, replay, and dependency-closure rules continue to apply. These
  checks do not certify that a phrase semantically entailed the selected
  referent; the stored model-resolution basis and ordinary correction path keep
  that epistemic limit truthful;
- deterministic evidence must prove resolution-basis host binding,
  completeness/truncation and stale-scope behavior, legal `defaulted` shapes,
  transaction/replay, Session deletion, and truthful TUI settlement. Bounded
  provider evidence proves only the open semantic behavior: clear non-command
  wording and a title containing `Every Day` can commit directly; an
  unambiguous contextual update needs no internal ID; a view hiding another
  reasonable referent and other ambiguous wording do not write directly;
  no-write teaching remains usable; and model-expanded meaning reaches the
  complete accepted-candidate surface; and
- this command-specific resolution provenance does not authorize automatic
  Gate 18 context injection, a general semantic resolver, a universal command
  bus or activity owner, another mode/runtime, or Gate 17 bootstrap behavior.

This record retains the historical Gate 16 contract and closing evidence.
Accepted product meaning comes from the product foundation, accepted ADRs,
architecture, Roadmap 09, and the maintainer decisions below. The historical
storage, command, projection, failure, and evidence details are inputs to the
new derivation rather than current implementation authority. Review run
`gate16-whole-20260721-01` challenged, repaired, and accepted the historical
contract recorded below. Corrective review task
`019fa8a5-eea1-79f0-abd8-50df4f3cdaa0` independently challenged, revised, and
accepted the amendment above.

## Why this Gate exists

Repa needs to remember what the learner is trying to achieve after the current
request or Session ends. A Goal is durable learner intent used by later context,
teaching, and planning; it is not a transcript summary, Tutor inference, todo,
mastery claim, or execution target.

The intended product loop contribution is:

```text
learner states or accepts an intended outcome
-> Repa preserves the exact learner-owned Goal revision
-> later context, teaching, or planning uses that revision when relevant
-> learner correction or an explicit lifecycle decision changes later use
```

Persisting any sentence that resembles an aspiration is insufficient. The
system must distinguish learner-owned commitment from conversational material,
preserve what the learner actually accepted when a model helps clarify it, and
avoid inventing achievement from time, evidence, Tutor prose, or Agent work.

## Terminology

A **Goal** is one learner-recognized learning purpose under the interpretation
accepted by the learner at the time. Its stable identity is not the wording of
one utterance, one numeric threshold, or an objective system claim about the
learner's whole history.

The **intended outcome** is the nonempty learner-owned expression of what the
learner wants to reach. Every Goal has one.

An **attainment condition** is an optional learner-owned condition that makes
the intended outcome more discriminating. A Goal may have none or several.
Conditions are not evidence, program-owned scores, mastery state, or
program-owned completion rules.

A **target time** is an optional structured time or time boundary associated
with the Goal. Time passing may make the target reached or passed at query time;
it does not change Goal lifecycle by itself.

A **Goal revision** is one learner-authorized complete state of the expression,
optional conditions, target time, scope, and lifecycle disposition under the
same accepted identity. A new Goal may represent a distinct purpose, a distinct
outcome occurrence, or a pursuit the learner explicitly wants to keep separate;
replacing an old purpose may also supersede the former Goal. Elapsed time,
current ability, or later evidence does not decide that relation by itself.

## Accepted maintainer decisions

These decisions were accepted during the Gate 16 grill. They are recorded by
consequence rather than as an interview transcript. Examples explain the
boundary but do not become universal schemas or algorithms.

### Durable admission requires a learner-rooted Agent action

A Goal may be persisted only from an ordinary interactive Agent operation
rooted in the learner's current request, correction, or conversational
acceptance. Entry is not restricted to `/goal`, another direct command, or any
fixed interaction shape. Agent clarification may iterate until a consequential
learner-owned ambiguity is resolved.

A clear request may be structured, committed, and surfaced visibly without a
redundant confirmation round. Ordinary discussion or an unaccepted Tutor
suggestion may not be silently promoted merely because a model detects an
aspiration. If a different outcome, condition, target, scope, identity,
lifecycle, or replacement choice remains materially unresolved, the Agent asks
in ordinary conversation before issuing the write. Program code does not
classify prose as learner-authored versus model-supplied or require a special
candidate protocol to prove that judgment.

The direct-command and model-clarification paths are possible mechanisms, not
separate Goal meanings and not mandatory product flows.

### Outcome is required; attainment conditions are optional

Every Goal has a nonempty intended outcome. Attainment conditions are optional,
may contain several learner-owned distinctions, and may be revised. The model
asks for a missing distinction only when different answers would materially
change later teaching, context, or planning. Gate 16 does not impose SMART
goals, a deadline, a score, a metric, or a mandatory clarification ritual.

A valid Goal with no attainment condition remains usable. Later `achieved`
still requires an explicit learner lifecycle decision; absence of a stored
criterion does not authorize model inference.

### Identity follows the continuing learning purpose

Wording and thresholds do not by themselves define Goal identity. For example,
`pass the data-structures final` and `score at least 85` will usually be two
expressions or condition revisions of one exam-oriented purpose rather than two
Goals. When that relationship is ambiguous at creation, the Agent should ask
before the first durable commit. Later changes that retain the purpose append a
revision under the same identity.

That is a common interpretation, not an exhaustive identity rule. A learner may
resume the same purpose after real abandonment, may treat a repeated target
occurrence as a new Goal, or may explicitly want a renewed pursuit recorded
separately. The Agent clarifies when the choice changes history or later
behavior, then records the resolved relation in the same typed command. Program
code may not infer it from a time gap, forgetting, current performance, or
wording similarity alone.

### Closure declarations are explicit but do not settle later learning history

`achieved` means the learner explicitly considers the Goal attained. It does
not create mastery, assessment evidence, or proof that an external result
occurred. `abandoned` means the learner has stopped pursuing it without claiming
attainment. `superseded` means a new Goal has replaced its underlying purpose.

Only a learner-rooted Agent command interpreting the current learner request or
ordinary conversational acceptance may cause those transitions. Tutor
behavior, background Agent execution, Course progress, elapsed time, a
deadline, or learning evidence cannot automatically achieve, abandon,
supersede, or fail a Goal.

Each declaration preserves the exact source-linked Agent interpretation
recorded at that time. It does not erase history or force every later situation
into a permanent terminal interpretation. A later interaction may correct a
mistaken achievement, resume an abandoned pursuit after substantial forgetting,
retain a once-true achievement while acknowledging later decay, raise the
attainment standard, or begin a distinct purpose or outcome occurrence. Those
readings can overlap and none is inferred merely from the observable facts.

### Learning-history ambiguity is handled where it becomes consequential

Real learning situations do not form an exhaustive set of mutually exclusive
Goal cases. Abandonment, forgetting, shallow understanding, mistaken confidence,
later decay, a higher standard, a renewed attempt, and a changed purpose may
co-occur. Gate 16 therefore preserves the source-linked Goal interpretation
rather than claiming the system has discovered the one true classification of
the learner's history.

The program owns the legal identity, revision, correction, and lifecycle
effects and the provenance of the recorded choice. The Agent may interpret the
situation, compare plausible readings, and clarify only when their difference
would materially change durable history, context, teaching, or planning. Gate
16 does not earn an exhaustive learning-history enum or a mandatory durable
pursuit-episode entity merely to remove semantic ambiguity.

Forgetting, current depth, observed performance, learner report, evidence, and
model inference remain distinct learner-state meanings. They may later inform a
Goal decision or plan, but they neither become Goal identity nor automatically
rewrite Goal lifecycle. When a consequential relation remains unresolved, the
Agent clarifies before writing; no host-side acceptance protocol proves the
interpretation. A later consumer must earn any durable learner-state
representation outside Gate 16.

### Target time is optional and is not a schedule

A Goal may carry an optional structured target time or boundary. When the Agent
interprets a learner's natural-language time expression, the normalized meaning
must be visible and correctable; it asks before writing only when different
plausible readings materially matter. Reaching or passing that time is a
query-time fact only.

Frequency, cadence, daily allocation, and a study schedule do not belong to the
Goal. They may later be planning inputs or outputs, but they are not silently
encoded as Goal lifecycle or static Goal priority.

### Final examinations are a representative stress case, not the product center

Final-exam preparation is used to pressure-test admission, conditions, target
time, multiple concurrent Goals, and later planning because it exposes most of
those problems compactly. It is not the only supported Goal form and does not
authorize an exam-specific schema. Long-lived skill development and interview
preparation remain counterexamples against overfitting.

### Cross-day planning consumes Goal or Assignment without merging them

The initial Gate 21 roadmap wording incorrectly required an admitted Assignment
before cross-day planning. That derived restriction contradicted the product
foundation's broader requirement for ordinary substantial real work and failed
the accepted exam case, where two learner Goals create real deadline pressure
without any Assignment.

Goal and Assignment remain separate authorities. Gate 16 hands later consumers
an exact Goal identity and revision, intended outcome, optional conditions,
optional target time, and scope. Gate 21 may reference that exact revision or an
exact Assignment revision as a typed substantial planning demand. Gate 21 owns
the plan and the planning-side acceptance and use of remaining-work, capacity,
progress, feasibility, cross-day allocation, learner override, feedback, and
recomputation. Gate 16 owns neither a static priority field nor a scheduler.

The exact source authority for current ability or marginal-return judgments is
not settled here. Gate 19 may later earn a reusable learner-record distinction,
or Gate 21 may accept a plan-specific source-bearing estimate. Gate 21's
experiment and grill must settle that boundary before its contract can claim it.

The maintainer accepted keeping Gate 21's number while broadening its boundary.
A later Gate 21 experiment may still show that Assignment lifecycle and
cross-authority planning need different implementation or evidence slices; that
would require a later owning roadmap decision rather than an implicit split now.

## Decision provenance and revision authority

| Decision                                                                                                                                                                             | Basis                                                                                                                  | May be revised by                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `G16-MD-001` a learner-rooted Agent action is required; interaction shape is not fixed and program code does not prove the prose                                                     | 2026-07-21 maintainer grill as corrected by the 2026-07-30 Agent-native product boundary                               | maintainer or owning product decision                      |
| `G16-MD-002` outcome required; conditions optional and consequentially clarified                                                                                                     | 2026-07-21 maintainer grill                                                                                            | maintainer or owning product decision                      |
| `G16-MD-003` identity follows the Agent-interpreted learner context; unresolved consequential choice is clarified, while time, ability, evidence, and wording alone do not decide it | 2026-07-21 maintainer grill as corrected by the Agent-native semantic boundary                                         | maintainer or owning product decision                      |
| `G16-MD-004` achievement, abandonment, and supersession require a learner-rooted Agent command, create no evidence, and do not erase later interpretive ambiguity                    | 2026-07-21 maintainer grill plus accepted no-automatic-attainment roadmap boundary and 2026-07-30 correction           | maintainer or owning product decision                      |
| `G16-MD-005` target time optional; passage has query-time meaning only                                                                                                               | 2026-07-21 maintainer grill plus no-background-daemon architecture                                                     | maintainer or owning product decision                      |
| `G16-MD-006` exam is a representative stress case, not a universal Goal model                                                                                                        | 2026-07-21 maintainer grill                                                                                            | maintainer or owning product decision                      |
| `G16-MD-007` Gate 21 consumes typed Goal or Assignment planning demands                                                                                                              | 2026-07-21 maintainer correction of an Assignment-only roadmap derivation                                              | maintainer or owning product/architecture/roadmap decision |
| `G16-MD-008` overlapping learning histories remain Agent-interpreted and clarifiable rather than becoming one deterministic identity taxonomy                                        | 2026-07-21 maintainer correction using abandonment, forgetting, shallow understanding, and later-depth counterexamples | maintainer or owning product decision                      |

The Gate 16 contract may make these decisions concrete but may not turn
optional conditions, model assistance, or one exemplar entry path into a
requirement. A reviewer may reject an engineering derivation without changing
the accepted decisions above.

## Retained structural Gate result

After Gate 16:

- one LearnerHome may contain no Goals or several independent Goal identities;
- each Goal has one immutable linear revision history and one exact current
  head, while semantically similar Goals remain distinct unless a learner-rooted
  Agent command records an explicit replacement relation;
- every revision contains one nonempty intended outcome, zero or more ordered
  optional attainment conditions, one exact LearnerHome/Course/multi-Course
  scope, one optional normalized target boundary, and one learner-rooted
  lifecycle disposition;
- `achieved` and `abandoned` remain learner declarations attached to exact
  revisions rather than mastery or evidence, while `superseded` preserves one
  explicit relation to a distinct new or already-existing Goal and the exact
  target revision on which the Agent bound that relation;
- an unrelated semantic correction preserves the exact accepted lifecycle
  disposition unless the learner explicitly changes it; it cannot silently
  achieve, abandon, restore, retarget, or unsupersede a Goal;
- a later accepted revision may correct, resume, deepen, or otherwise reinterpret
  the same Goal without erasing the earlier declaration or encoding a taxonomy
  of why the learner's situation changed;
- one exact learner occurrence may causally anchor one bounded atomic Goal change set
  containing several Goal operations, so a natural request with two exam Goals
  does not require invented extra learner occurrences or partial commits;
- a learner-rooted Agent change set can commit visibly without a Gate-imposed
  confirmation; unresolved consequential meaning is clarified in ordinary
  conversation before the same command is issued;
- every applied change set reuses Gate 8/12 physical invocation, Turn,
  permission, receipt, ToolPart, frontier, cancellation, and recovery mechanics;
- exact physical replay and semantic duplicate return stored results, conflicting
  reuse fails, and concurrent corrections cannot branch a Goal history;
- bounded snapshot reads expose exact current revisions, lifecycle and target
  relations, scope availability, history, and truthful source provenance to
  later Context, planning, and terminal consumers;
- time passage, Course withdrawal, Session deletion, compaction, fork, restart,
  model prose, and learner evidence never synthesize a Goal transition; and
- a concise durable terminal acknowledgement makes each committed Goal change
  visible even if later assistant prose or the provider fails.

This establishes Goal authority and its truthful command/read boundary. It does
not inject Goal state into model context, allocate study time, infer learner
ability, or complete a user-visible multi-Session learning loop.

## Owned logical records

Exact SQL and TypeScript names remain implementation details. The physical
schema must nevertheless keep these meanings distinct and database-enforced.

1. **Goal identity.** A LearnerHome-owned generated Goal ID and trusted creation
   time. It contains no mutable current payload, Course owner, score, or global
   active flag.
2. **Goal revision.** A generated revision ID, owning Goal ID, positive lineage
   version, exact predecessor when noninitial, complete semantic snapshot,
   stored lifecycle disposition, causal learner occurrence, source order,
   trusted commit time/order, shared-learning frontier, and the applied Goal
   change-set effect that produced it. Revisions are immutable.
3. **Attainment-condition membership.** Zero or more ordered, bounded nonempty
   learner-owned condition strings attached to one immutable revision. Ordinals
   preserve accepted presentation order but are not stable criterion identities,
   evidence slots, program-owned score records, or decomposition nodes.
4. **Goal scope membership.** One closed scope arm on each revision: either
   LearnerHome-wide with no Course rows, or a nonempty bounded set of exact
   Course IDs. One Course is the ordinary Course-scoped case; several Courses
   form one multi-Course scope. Each resulting Course membership is sealed as
   either newly bound from an exact active Course-owner snapshot or carried
   from the identical membership of the exact predecessor Goal revision.
   Omitted predecessor memberships are removals represented by the complete
   before/after scope basis; they do not require a live Course row in the new
   revision. Scope membership never names a View, Revision, item, material,
   directory, or LearningSpace.
5. **Optional target boundary.** One closed absent, exact-instant, or local-date
   arm with the versioned normalized value and exact runtime-bound zone/release
   or fixed-offset facts needed to interpret it without consulting future host
   defaults. Display is derived. Its causal occurrence and exact typed Agent
   intent remain available without treating a model-supplied excerpt as proof.
   A local date remains a civil date; the system does not invent an exam time
   or silently convert it to end of day.
6. **Explicit supersession membership.** A `superseded` revision names exactly
   one distinct target Goal and the exact target revision that the learner saw
   when accepting the relation. The target may already exist or may be created
   atomically by the same replacement operation. A later source revision may
   preserve that exact relation independently of semantic correction, or may
   explicitly clear/retarget it. Immutable historical memberships never rewrite
   either Goal. Database-enforced current projection permits at most one outgoing
   target per source and one incoming supersession per target, and rejects a
   current cycle.
7. **Goal change-set effect.** A generated Goal-owned effect ID, one admitted
   learner occurrence, canonical semantic fingerprint, current command version,
   bounded ordered semantic intents with exact owner-resolved before/after
   snapshots, exact changed/no-change results, trusted settlement values, and
   deterministic acknowledgement. It is one domain effect for Gate 8's
   mutation slot even when several Goal revisions commit.
8. **Learning-command receipt/disposition arm.** The Gate 8 receipt and
   physical invocation link the exact occurrence, Turn/input, Tool Part,
   provider call, command version, and terminal settlement. A current
   `candidate_v2` additionally links exact Agent-issuance provenance,
   capability lifecycle/request when present, runtime-bound command state, and
   any Goal effect. A current `semantic_terminal_v2` has only immutable
   existing-effect/address evidence. Historical V1 retains its exact recorded
   authorization/confirmation projection. Goal content stays Goal-owned rather
   than being embedded in a universal receipt payload.

Receipt, effect, Goal identity, revisions, conditions, scopes, and the first
applied settlement do not use Session, Message, or Part rows as cascade-owning
parents. Interaction records may become unavailable while accepted Goal meaning
and minimal source truth remain.

No mutable `current_goal` row, universal Agenda item, JSON fact bag, content
fingerprint identity, or model-authored external ID may replace these
relationships. A commit seal or an equivalent database-enforced construction
must prevent a revision or batch member from becoming visible without its exact
effect, receipt, and terminal settlement.

## Goal semantic snapshot

### Intended outcome and optional conditions

Every revision stores one bounded nonempty intended outcome. The Agent supplies
that semantic field from the learner-rooted operation; the runtime applies only
closed mechanical normalization such as line endings and Unicode validation.
It does not compare the outcome with source prose or route a paraphrase through
a second acceptance path.

Attainment conditions are an ordered optional list. Empty, duplicate after
canonical equality, over-count, over-byte, malformed, or silently truncated
conditions are rejected. The program does not require conditions merely to make
the Goal measurable. Conditions may preserve learner-authored scores,
thresholds, or quantities when the learner means them as part of attainment.
They do not become program-owned weights, mastery state, work estimates,
scheduled tasks, allocation, completion evidence, or automatic lifecycle
rules.

A mixed learner utterance may include Goal meaning plus cadence, planned work,
or another authority's meaning. Gate 16 may commit only the exact Goal portion
the Agent selects; if that separation remains consequentially ambiguous, it
clarifies before writing. Dropping `daily`, inventing a broader outcome, or
turning schedule language into an attainment condition may be a model error,
which the visible result and correction path must expose. The absence of Gate
21 does not authorize Goal to absorb deferred planning work.

### LearnerHome, Course, and multi-Course scope

LearnerHome-wide is an explicit scope arm, not a null that means unknown. A
Course-scoped or multi-Course revision stores a canonical unique set of stable
Course IDs. Order is presentation metadata only and cannot imply priority,
allocation, prerequisite order, or decomposition.

On creation, an otherwise clear learner Goal with no learner-authored or
accepted Course restriction uses LearnerHome-wide scope. That records the
absence of Course scoping rather than inferring that every Course is a target.
An ambient directory, default Course, current route, or model guess cannot
silently narrow it. Explicit language such as “this Course” may resolve through
one exact trusted current Course identity selected from the Course-owner read;
if the Agent cannot resolve the referent safely, it clarifies in ordinary
conversation before issuing a command.

On initial scoped creation, every Course membership is newly bound. On a later
revision, a Course ID absent from the exact predecessor scope and present in
the result is newly bound; an identical predecessor/result membership is
carried; and a predecessor member absent from the result is removed. Each newly
bound member is resolved by ID to a runtime-captured exact Course-owner snapshot
and must still be active in the final transaction. A carried member instead
proves the exact sealed
predecessor membership and remains preservable when that Course is withdrawn
or otherwise unavailable. A removal likewise requires no current Course
eligibility. Technical carry permission does not manufacture learner intent;
the Agent decides whether an omitted scope should carry and clarifies when that
choice materially matters.

These rules apply per member. In a multi-Course correction, retained withdrawn
members may be carried, any member may be removed, and only additions require
current active-Course proof. Withdrawal or owner-state drift between candidate
preflight and settlement, including a configured permission wait, stales a
newly bound member, but does not stale an
exact carried member or removal. Course withdrawal after commit leaves Goal
history intact and makes only that Course's current scope-availability
projection unavailable. Restoration of the same Course identity may make it
available again without a Goal write.

An explicit correction may remove, add, or replace Course membership while
consuming the exact Goal head. It may preserve a withdrawn Course restriction,
remove one withdrawn member, or clear an unusable Course scope to
LearnerHome-wide without requiring the old Course to be active. No scope change
follows automatically from a working-View change, route anchor, current
directory, active conversation, material alignment, Course withdrawal or
restoration, or model guess.

### Optional target boundary

The current V2 temporal intent and normalized value are exactly the closed
unions defined in the Agent-native contract above. Their three semantic arms
are:

- **absent:** no target boundary;
- **exact instant:** one civil local date-time plus a source-zone,
  named-IANA-zone, or fixed-offset selector, resolved by the runtime to one
  absolute instant and exact zone/offset facts; or
- **local date:** one ISO civil date plus the same closed zone selector, without
  an invented time of day.

Relative or local language is interpreted from the exact learner occurrence's
source temporal context. The model cannot supply trusted current time, host
timezone, tzdb release, epoch, or derived offset; it may select an explicit
fixed offset when that is the intended semantic zone. If required temporal
authority is unavailable, an IANA civil time is nonexistent/ambiguous, or the
learner's meaning is materially unresolved, the Agent clarifies until it can
issue an exact representable meaning or remove the target; the runtime never
silently drops it. Historical V1 source expressions and normalization bases
remain versioned replay facts, not V2 input or state.

Reads derive before/on-or-reached/after relations from the stored arm and a
runtime-supplied trusted as-of time. Exact vocabulary may differ by arm, but
passage creates no Goal revision, lifecycle disposition, evidence, event,
receipt, timer, or frontier advance. Host-timezone changes cannot reinterpret a
stored boundary.

## Revision, lifecycle, and replacement semantics

### Linear revision identity

The first revision has version `1`, no predecessor, and an absent previous
snapshot. Every later revision names the exact current head and version, names
that head as predecessor, and commits exactly `previousVersion + 1`. One head
may be consumed only once by one successor revision. Database constraints reject
branches, skipped/reused versions, cross-Goal predecessors, mutable/deleted
revisions, dangling batch membership, malformed disposition membership, or an
unsealed revision/effect/receipt construction.

Each revision carries a complete outcome, conditions, scope, target, and
lifecycle disposition rather than a patch. That makes every historical state
independently readable and prevents later defaults from reinterpreting an old
write. A later wording or threshold change remains the same Goal only because
the Agent interprets the learner-rooted operation that way, not because a
similarity function matches it.

The producing effect preserves the exact typed semantic intent plus the
owner-resolved complete before/after snapshots and causal occurrence. That is
enough to distinguish an explicitly changed field, an omitted carried field,
and an initial default without a separate current per-field basis map. The
complete revision remains the state authority; omission is not program proof
that the field's semantic meaning survived the conversation.

### Stored lifecycle disposition

Every revision has exactly one closed disposition arm:

- **active:** the learner currently presents this Goal identity as pursued;
- **achieved:** the learner explicitly declares this exact Goal meaning attained;
- **abandoned:** the learner explicitly declares pursuit of this exact Goal
  meaning stopped without an attainment claim; or
- **superseded:** the learner explicitly says one distinct Goal has replaced
  this Goal's underlying purpose, naming the target Goal and the exact target
  basis revision accepted for that relation.

Initial ordinary creation is active. Initial achieved or abandoned meaning is
legal only when the Agent interprets the learner-rooted operation as making
that declaration. Initial creation does not use the superseded arm;
establishing that relation uses `replace` against an exact source head. A model
may never derive any arm merely from time passage, Course or task completion,
evidence, performance, wording similarity, or its confidence.

An update may preserve or explicitly change the complete disposition. An exact
same complete snapshot is a typed no-change. Changing only disposition is a real
revision. Updating other Goal meaning does not implicitly clear, restore,
retarget, or create supersession: the resulting revision must preserve the exact
bound relation or explicitly change it in the Agent-issued patch.
Earlier revisions and dispositions remain immutable.

The causal learner occurrence may remain inspectable, but Gate 16 neither
requires a separate reason nor invents one. Later
learner-state authorities may record report, evidence, or inference separately;
none of those records rewrites this disposition.

### Historical dependency-complete semantic authorization (superseded)

The current runtime still materializes every omitted update field exactly from
the bound predecessor. It does not require a separate current field-basis row.
The following prompt-forcing and source-language rules are superseded by the
current Agent-native contract above.

A direct update is legal only when the current learner presentation authorizes
the exact resulting Goal identity, complete semantic meaning, and disposition.
The runtime records which fields are newly authored and which are carried, but
it cannot equate byte equality with semantic preservation. The minimum closed
dependency policy is:

- changing the outcome requires explicit authorization of identity continuity
  and of every carried condition, scope, target, and non-active disposition;
- changing scope requires explicit authorization of every carried outcome,
  condition, and target;
- carrying achieved or abandoned across any semantic-field change requires the
  learner to reauthorize that declaration for the complete revised meaning;
- carrying, clearing, or retargeting supersession across any semantic-field
  change requires explicit preservation or change of that exact relation; and
- a narrow active condition-only or target-only correction may carry the stable
  outcome, scope, other fields, and active disposition only when the learner's
  current wording unambiguously identifies the same Goal and the bounded change.

These are minimum prompt-forcing rules, not semantic proof. If the exact current
wording does not establish every dependency, the whole resulting candidate uses
the accepted-candidate arm. Implementations may conservatively route more cases
to acceptance but may not weaken the dependency closure. Thus changing `>=85`
to `>=90` cannot silently carry achieved, changing one exam outcome cannot
silently reuse another exam's target/scope/conditions, and correcting a typo in
a superseded Goal cannot silently unsupersede it.

### Supersession is an independently preservable one-to-one relation

A replacement consumes the exact current source head and appends a successor
whose disposition is `superseded`. Its target arm is closed:

- **existing target:** name a distinct Goal in the same LearnerHome and its
  exact current basis revision; or
- **new target:** atomically generate one distinct Goal with a complete initial
  non-superseded revision and use that generated revision as the basis.

The source successor may carry its semantic fields for a pure replacement or
apply the explicit source patch in the same command, but the supersession
meaning is explicit. A carried source Course membership does not become a new binding
merely because `replace` appends the superseded successor. A generated target
revision evaluates its own initial scope independently, so each of its scoped
members is newly bound and needs runtime-captured active Course state. An
existing target is not mutated by the relation. It must still have the exact
bound head when the final transaction validates its pre-apply snapshot; another
operation in the same change set may then consume that head as already
represented in the materialized command. Later target revisions do not
invalidate the relation or rewrite its recorded basis. Reads may show the
target's current head separately but never substitute it for the recorded basis.

At final settlement the complete projected current relations have at most one
outgoing target per source, at most one incoming supersession per target, and no
cycle. Historical incoming relations do not block a new current relation. A
bounded change set may explicitly clear an old relation and establish another
in one atomic final projection. The target may also receive an explicit update
operation in that same change set; its pre-change head remains the exact
relation basis, and the final graph is validated after all operations.

A later source update can preserve the exact target relation while correcting
outcome, conditions, scope, or target time. It clears supersession only when the
Agent-issued patch explicitly chooses a non-superseded disposition, and it
changes the target only through another `replace`. Current reads report only the
direct recorded target; they do not infer transitive replacement, merge
identities, or create decomposition topology. Unsupported one-to-many, many-to-one,
split/decomposition, or cyclic meaning requires clarification rather than a
fabricated relation.

## Bounded atomic Goal change set

### Closed operation union

Gate 16 adds one reserved versioned Goal capability whose canonical command is
one nonempty bounded ordered change set. Its operations form a closed union:

- **create:** generate one new Goal identity and initial complete
  non-superseded revision;
- **update:** name one exact existing Goal head Revision and a semantic patch;
  the owner consumes that current head and appends one complete next revision,
  preserving omitted fields and changing only explicit fields; or
- **replace:** name one exact source Goal head Revision, append one complete
  superseded successor, and bind it either to an exact eligible existing Goal
  head Revision or to one new Goal generated from supplied semantic fields
  inside that operation.

Runtime-generated Goal, revision, effect, receipt, permission, time, and order
identities and numeric owner versions are not model input. Existing Goal
updates name exact Goal/head-Revision identities obtained from an owner read or
protected context projection. An existing replacement target likewise names
its exact head Revision. At preflight the owner atomically captures current
heads and Course descriptors, materializes complete before/after snapshots,
and records that resolved command through any permission wait; final settlement
revalidates them. A new replacement target's identities are internal results of
that operation rather than cross-operation model labels.

The change set has implementation-fixed operation, Course-membership,
condition-count, per-string, and aggregate-byte limits. Overflow rejects the
whole candidate; it never drops, truncates, summarizes, or commits a prefix.
Within one set, an existing Goal head may be consumed at most once and generated
identities cannot be cross-referenced by another operation. An exact consumed
head may additionally serve as a replacement target basis for an independent
operation in the same admitted set; the relation retains that pre-change basis
and the final one-to-one acyclic projection is validated after all operations.

### Why the change set is one effect

One learner utterance may explicitly establish several independent Goals, such
as operating-systems and data-structures exam outcomes. Treating that as one
Goal would merge meanings; requiring fabricated learner messages would corrupt
source identity; letting several independent domain commits race would make one
accepted candidate partially durable.

The bounded change set is therefore one Goal-owned semantic effect at address
`(admitted learner occurrence, Goal change-set slot)`. It consumes Gate 8's one
applied-learning-mutation slot once and may produce several Goal-owned rows in
one final transaction. This is not a generic command bus, transaction language,
Agenda batch, or authorization to group unrelated authorities.

All operations preflight against one database snapshot. If any real operation
is invalid, stale, unauthorized, over limit, has a newly bound Course member
whose exact target is no longer active, or produces an invalid final
supersession projection, the whole set settles with no Goal effect. A carried
or removed Course member is not made ineligible by current withdrawal.
Authorized no-change operations may coexist with real changes and are reported,
but create no revision of their own. If every operation is no-change, no effect,
receipt arm, mutation-slot use, or shared-frontier advance occurs.

## Historical learner source, clarification, and authorization

### Historical direct learner-request arm

A clear fully learner-authored change set uses the trusted current occurrence
under `learner_request`. The default Repa profile treats this as a routine local,
inspectable, reversible learning command and adds no Gate-imposed confirmation.
An explicit effective deny, missing delegated capability, or configured
ordinary `ask` policy still controls execution.

This arm is deliberately conservative. The runtime verifies each bounded source
excerpt against the exact current learner presentation and accepts only
mechanical normalization plus owner-validated exact identities. Outcome and
condition prose that changes must remain current learner wording. A carried
field must name the exact predecessor basis and pass the dependency policy;
textual equality alone is insufficient. Course resolution and target-time
normalization must be exact and unambiguous under the accepted owner/time
context. Existing-target replacement requires exact current source and target
identities plus learner wording that establishes the relation. A paraphrase,
new condition, widened or narrowed scope, inferred identity continuity,
unreauthorized achieved/abandoned meaning, silently preserved/cleared/retargeted
supersession, ambiguous relative date, or omitted mixed-intent clause is not
direct merely because the model labels it so.

The runtime cannot prove the full semantics of natural language. Its closed
checks bound what the model may claim, while the exact source, model-authored
invocation, canonical payload, result, and correction path remain inspectable.
A bounded native-provider qualification must still test that the default model
uses this arm only for a clearly explicit learner Goal.

### Historical model-assisted accepted-candidate arm

If the model supplies or changes any consequential outcome, condition, scope,
target interpretation, Goal identity relation, lifecycle disposition,
field-carry dependency, or replacement relation, the whole canonical change set uses
`learner_acceptance`. The runtime mints one stable once-only permission request
and visibly presents the complete bounded candidate, including:

- every create/update/replace operation and affected current Goal;
- intended outcome and ordered conditions;
- LearnerHome/Course/multi-Course scope with exact Course labels/IDs, current
  availability, and each resulting membership's new-binding or carry basis;
- normalized target boundary or explicit absence;
- each carried field and its exact predecessor basis when semantic dependency
  makes that preservation consequential;
- resulting disposition, including an exact supersession target and accepted
  target basis, whether that target already exists or will be created, and any
  relation preserved, cleared, or retargeted; and
- the fact that this is durable, correctable Goal state rather than evidence or
  a schedule.

Effective deny prevents the prompt. Otherwise the exact prompt is required even
under a wildcard allow or prior `always`; the baseline offers only one-time
approval and stores no reusable Goal-acceptance rule. Approve commits only that
request after final revalidation. Reject, correction, prompt disposal,
cancellation, or owner loss creates no Goal effect. Substantive correction must
enter ordinary learner Interaction as a new admitted occurrence before a
different candidate can commit; a permission outcome alone cannot become an
unrecorded semantic source.

The confirmation snapshot and permission request ID remain in the exact receipt
arm. The authorization basis truthfully says `learner_acceptance`; it does not
rewrite model-proposed prose into learner-authored source. The terminal
acknowledgement repeats the committed interpretation and correction path.

The intended model flow after iterative clarification is to call this exact
candidate surface rather than ask for an unstructured `yes` and then request a
second identical confirmation. Gate 16 does not require a `/goal` parser or
prohibit future direct surfaces that reuse the same domain and settlement
contract.

### Unresolved ambiguity remains no durable effect

When identity, correction versus later change, scope, target, or mixed intent
would materially change durable history and the learner neither supplies nor
accepts an interpretation, the command returns a typed no-effect result. The
Tutor may continue useful current learning from ordinary conversation context;
it may not block all teaching, silently choose a Goal identity, persist a draft
as accepted truth, or treat a model summary as the Goal.

Gate 16 adds no durable proposal/draft state. Pending permission is
process-local; accepted Goal state begins only in the atomic final settlement.
The durable transcript remains available under its existing owner, and a later
learner occurrence may form a new candidate.

## Historical authorization and retained command settlement

Semantic replay/conflict, atomic transaction, receipt, recovery, and exact
post-commit result clauses in this section remain retained. Any separate
accepted-candidate confirmation or source-language proof is superseded by the
current Agent-native contract.

### Replay and conflict precedence

The Goal capability reuses the shared learning-command preparation and final
settlement path. Both phases preserve this order; the final transaction is
authoritative:

1. Exact terminal physical Part/call replay validates the complete trusted
   envelope, versioned disposition, and canonical input, then returns the
   stored result without a new time, event, permission request, domain read, or
   Goal effect. Historical V1 additionally validates its exact recorded
   authorization/confirmation bytes for physical replay only.
2. Reusing the Part ID or `(Assistant Message ID, provider call ID)` with a
   different tool, envelope, command version, or canonical typed change set is
   a physical conflict and cannot alter the old result.
3. A physically new V2 invocation validates only the authentic immutable causal
   envelope needed to name the semantic slot—frozen
   Turn/input/message/tool-operation membership and learner-occurrence
   identity—and the closed structural shape of the canonical typed input. This
   step does **not** evaluate current source availability, Goal-write
   delegation, policy, permission, cancellation, Goal/Course heads, or
   materialized carry.
4. If the occurrence's Goal change-set slot already has the exact same canonical
   typed-intent fingerprint, settle `semantic_terminal_v2/already_applied` with
   immutable existing-effect/address evidence. A different typed intent is
   `semantic_terminal_v2/semantic_conflict`. Root/child issuance and capability
   state do not participate in this equality.
5. Only a free address checks exact Goal-write membership, enforces the
   Assistant Message mutation slot, and reserves `candidate_v2` with truthful
   Agent issuance and runtime-bound state. It then evaluates ordinary
   capability policy/permission. Final settlement repeats semantic identity
   before live source, boundedness, source/target heads, supersession,
   no-change, target normalization, Course membership, and frontier checks.

This is one total order. Authentic immutable envelope/input validation precedes
the semantic address, while committed duplicate/conflict precedes Goal-write
membership, policy, permission, cancellation, source availability, newly bound
Course admission state, Goal-head checks, or carry validity. Historical V1
authorization remains part of exact V1 replay but never participates in V2
semantic identity. Later live state therefore cannot rewrite history.

### Historical V1 reservation/confirmation and retained atomicity

The following pseudocode is V1 provenance. Its once-only acceptance, field
bases, confirmation snapshot, and acceptance vocabulary do not govern V2.
Current V2 uses the disposition and total order defined above; only the
short-transaction/no-open-transaction atomicity remains shared.

```text
register the physical call in the Session/Turn FIFO lane
-> reserve/admit the invocation and settle any replay/conflict
-> if a candidate remains, run ordinary permission or exact once-only acceptance outside SQLite
-> enter one final IMMEDIATE transaction
   -> repeat physical and semantic decisions
   -> consume permission/acceptance, then revalidate live source, field bases,
      limits, exact source/target heads, final supersession projection, Course
      membership bases, active-owner proofs for new bindings, and target interpretation
   -> derive all generated identities and the complete Goal change-set result
   -> atomically apply every real Goal operation
   -> write effect, receipt, confirmation snapshot when required, frontier, ToolPart, and event
-> commit and return the stored exact result
```

No SQLite transaction remains open while configured capability `ask` waits.
The final transaction does not trust reservation-time Goal state or a newly
bound Course-owner snapshot. A concurrent Goal writer, changed head, or
withdrawal/owner drift of a newly bound Course after permission issue yields
typed stale/no-effect rather than applying a command against changed state.
Withdrawal or restoration of an exact carried or removed Course member does
not stale the Goal operation because availability was not its admission basis.
Target-time passage alone is not stale because it does not change the exact
stored target value.

For an applied change set, these values commit or roll back together:

- every generated Goal identity and immutable revision;
- condition and Course-scope memberships with their sealed admission bases;
- exact head consumption, lifecycle dispositions, and supersession memberships;
- Goal change-set effect and operation results;
- Gate 8 invocation, receipt, and closed Goal disposition: current candidates
  carry `agent_action` issuance and capability settlement, current semantic
  terminals carry neither, and V1 replay retains its exact historical
  authorization/confirmation projection;
- the Assistant Message's applied-learning-mutation ownership;
- Turn consumed/resulting tool frontier;
- deterministic terminal acknowledgement, ToolPart, and Event projection; and
- one shared-learning-frontier advance.

All domain rows and the terminal settlement use one trusted settlement time
floored by command admission, source occurrence/order/time, Turn/tool causality,
the database-wide shared-learning frontier, every consumed Goal head, and every
Course owner snapshot. Exact replay retains the stored time and does not advance
anything.

### Exact result and terminal visibility

An applied or already-applied result contains at least:

- exact receipt and Goal change-set effect IDs;
- versioned Goal disposition and, only when the invocation was an admitted
  candidate, exact Agent-issuance provenance plus the ordinary capability
  permission-request ID when configured `ask` durably issued one;
- ordered per-operation outcome with generated/existing Goal and revision IDs,
  resulting lineage versions, complete lifecycle disposition, normalized
  scope and target summary, and no-change status where applicable; and
- trusted settlement time/order and shared-frontier sequence.

The result is bounded and contains no transcript attachment or raw permission
payload. A concise program-authored terminal projection becomes the ToolPart
title/body instead of generic `<tool> completed` output or raw settlement JSON.
It tells the learner what Goal meaning was stored, which items were unchanged,
the normalized target/scope, and how to correct it. This narrow acknowledgement
is not Gate 22's browser and does not claim that learning or planning occurred.

Once the terminal Part is durably settled, later provider hooks, truncation,
assistant prose, or provider failure cannot rewrite it. Post-commit observers
may observe but have no authority to turn committed success into an error.

## Retained Goal owner reads and current Agent exposure

The Goal authority exposes bounded stable-snapshot reads for:

- one Goal identity's exact current head, lineage version, complete semantic
  snapshot, lifecycle disposition and exact supersession basis when present, scope
  availability, target relation at a runtime-supplied trusted as-of time, and
  source receipt;
- stable cursor-bounded revision history for one Goal, including historical
  dispositions, supersession targets/bases, V2 effect typed-intent and
  versioned before/after provenance plus candidate Agent issuance when present,
  or V1 historical field bases, and exact source availability;
- stable cursor-bounded discovery of Goal identities and current heads with
  optional exact disposition and Course-ID filters; and
- exact change-set effect/receipt inspection by effect or Goal revision identity.

Current status is a closed projection of `active`, `achieved`, `abandoned`, or
`superseded` from the exact current revision's stored disposition. A superseded
read returns its bound target Goal/basis revision and may separately show the
target's current head; it never substitutes the later head for the recorded
basis or follows wording similarity. Target-time relation and Course
availability are separately reported and cannot overwrite disposition.

All multi-row reads use one database snapshot, deterministic non-priority
ordering, opaque scope-bound cursors, and bounds on rows and nested conditions,
Courses, history, and source details. Reads fail closed on a branch, missing
commit seal, malformed disposition/temporal arm, dangling effect/receipt,
invalid current one-to-one/cycle projection, or incomplete scope union. They
never repair state by choosing the highest version.

Gate 16 must expose the bounded model-visible Goal owner query needed for its
own contextual-reference command path. This query is lazy tool access, not
automatic prompt/context injection and not a learner-facing Goal browser. Gate
18 later chooses a bounded automatic Goal projection for a model sample; Gate
21 consumes exact revisions as planning demands; Gate 22 composes
learner-facing inspect/correct. A fresh Session can query the same LearnerHome
owner state without importing an old transcript.

## Failure, cancellation, restart, and destructive lifecycle

- **Invalid current command:** malformed or over-limit input, non-current owner
  identity/head Revision, illegal patch or clear, unrepresentable target arm,
  or illegal lifecycle/supersession projection settles with no Goal effect. The
  runtime does not reject or approve based on source-language interpretation.
- **Unresolved learner-owned ambiguity:** the Agent asks before issuing a
  command. Until a command exists, there is no Goal identity, revision,
  disposition/supersession membership, effect, receipt arm, mutation-slot use,
  or frontier advance.
- **Stale Goal head:** update or replace after another revision/replacement
  commits fails the whole change set. One exact head has one atomic winner and
  history never branches.
- **Stale or ineligible existing replacement target:** a changed target head,
  cross-LearnerHome/self target, duplicate current incoming relation, or cyclic
  final projection rejects the whole change set; later target revisions after a
  successful commit do not rewrite the accepted relation basis.
- **Stale newly bound Course membership:** withdrawal or changed owner state of
  an added Course before final commit rejects the whole admitted command. Current
  unavailability of an exact carried or removed predecessor membership does
  not reject correction, lifecycle change, or replacement. Later withdrawal
  changes only read availability.
- **Concurrent duplicate:** the same occurrence/fingerprint produces one
  effect and exact duplicate results. A different interpretation for the same
  semantic slot conflicts rather than partially coexisting.
- **Transaction failure:** injected failure at every Goal identity, revision,
  condition, scope, disposition/supersession membership, resolved intent/effect,
  receipt, frontier, ToolPart, or event boundary rolls the complete change set
  back.
- **Cancellation before commit:** no effect unless the uninterruptible final
  transaction already committed; durable reconciliation then returns exact
  success rather than false cancellation.
- **Failure after possible commit:** the runtime performs one uninterruptible
  physical/semantic reconciliation. If it cannot determine the durable result,
  it returns typed `outcome_unknown`, never a claimed no-effect or a retry that
  could duplicate Goals.
- **Process loss before commit:** admitted nonterminal work settles interrupted
  under the Gate 8/12 startup owner. It is not redispatched, re-prompted, or
  reconstructed as a durable Goal draft.
- **Process loss after commit:** restart exposes the exact effect, revisions,
  acknowledgement, and source. A new command uses fresh heads; an interrupted
  provider operation is not resumed against changed Goal state.
- **Compaction:** re-presentation retains the original occurrence and cannot
  create another Goal effect or turn a summary into source.
- **Fork:** cloned history remains a read-only presentation and cannot authorize
  a target-fork Goal write. The genuine fork-start learner input receives a new
  Turn/input/occurrence and may create one new change-set effect.
- **Whole-Session deletion:** applied Goals, revisions, dispositions,
  supersession memberships, current typed intents/before-after snapshots,
  historical field bases and confirmation snapshots when present, effects,
  receipts, acknowledgements, and bounded semantic content remain. The origin
  becomes truthfully unavailable through the existing occurrence tombstone;
  failed/no-effect invocation rows are removed under Gate 8 ownership.
- **Revert:** a cleanup set containing an applied Goal Part or its Assistant
  Message rejects atomically. Eligible unrelated/no-effect revert cleanup does
  not change Goal state or invent source loss.
- **Course withdrawal and target passage:** neither creates a Goal transition,
  auto-achievement, abandonment, failure, retarget, or replacement. Withdrawal
  also cannot prevent a later learner-rooted Agent correction, disposition
  change, or replacement that carries or removes the exact existing membership.
- **Invariant corruption:** writes and reads fail closed. No prompt, model, or
  terminal projection may synthesize a head, condition, scope, target, effect,
  or receipt to continue.

## Implementation ownership and dependency direction

The production owner is a separate learner-Goal Core authority. It owns Goal
identity, immutable revision semantics, complete snapshots, lifecycle
dispositions, supersession relation, bounded change sets, semantic
duplicate/conflict, exact Course-scope relation, target representation and
calendar validity, acknowledgement data, and bounded reads. Open target-language
interpretation belongs to the Agent. Goal is not a Goal manager, generic Agenda
service, learner-state store, planner, graph, or Agent memory.

Dependencies remain one-directional:

- learner occurrence and Turn own exact causal source, source order/temporal
  context, current input membership, presentation availability, and fork/
  compaction identity;
- learning command owns physical invocation, trusted envelope, effective
  permission and ordinary configured prompt, receipt union, mutation slot,
  terminal ToolPart/event settlement, reconciliation, and startup recovery;
- Goal owns semantic address/effect, identities, revisions, conditions, scope,
  target, lifecycle/replacement legality, acknowledgement content, and reads;
- Course exposes an exact active-Course descriptor and transaction revalidator
  for scope targets without giving Goal its mutable service or View semantics;
- trusted clock/source temporal context supplies time facts and calendar
  arithmetic without treating the Agent's interpretation of learner wording as
  trusted time;
- later Context, planning, and terminal owners receive read-only Goal
  projections or exact commands, never the mutable authority; and
- the released-v1 application layer composes the reserved tool with the shared
  runtime and cannot move Goal meaning into the generic Agent runner.

The reserved capability identity cannot be replaced by custom or MCP tools.
Default Tutor Agent composition exposes it under effective permission;
delegated Turns require explicit non-escalating Goal capability and the exact
causal learner occurrence. Internal title, compaction, project-copy, recovery,
and other noninteractive model operations receive no Goal writer.

No HTTP mutation route, background worker, daemon, provider-specific Goal path,
preview-v2 runner, slash-command-only executor, universal command bus, or
compatibility adapter is added. Existing generic slash expansion is only
interaction-mechanism evidence; Gate 16 neither requires nor forbids a later
direct terminal syntax that obeys the same authority.

## Historical first implementation migration and compatibility boundary

Gate 16 adds one Repa-owned forward migration after the accepted Gate 15 schema
and keeps the generated current schema equivalent to a fresh database.

The migration must:

- create empty Goal identity/revision/condition/scope/disposition/supersession/
  field-basis/effect state for fresh and upgraded LearnerHomes;
- install exact foreign keys, closed unions, unique successor/head-consumption
  guards, immutable history, version/CAS checks, exact existing/new replacement
  target membership, current one-to-one/acyclic supersession, field-basis and
  target-arm checks, bounded membership, effect/receipt ownership, and
  commit-seal integrity required by this contract;
- extend the closed learning-command invocation, settlement, effect, and receipt
  unions with one exact Goal change-set arm without changing replay meaning for
  Course, Representation, navigation, or retained-steering commands;
- preserve every predecessor row and pass foreign-key/integrity checks before
  commit; and
- produce schema-equivalent fresh and Gate-15-upgrade databases apart from
  truthful historical data.

No Goal, lifecycle disposition, scope, target, condition, supersession,
field-basis, or learner-state meaning is backfilled from old transcripts,
Session summaries, retained steering, navigation, Course titles, assignments,
todo state, oracle data, or model guesses. Historical learner occurrences
cannot be re-presented as new causal authority. There is no migration from the
old HarmonyOS project, OpenCode todos, Codex execution Goals, or pre-fork lab
tables and no reverse migration promise. Selective cross-authority physical
deep deletion remains a post-baseline Data Lifecycle concern.

## Current falsification pressure

The principal multi-Goal case is deliberately outside Gate 16's arithmetic:

- the learner starts from zero on the 16th;
- the operating-systems exam is on the 18th;
- the data-structures exam is on the 20th; and
- no Assignment record exists.

Giving the first two available days to operating systems and the following two
to data structures is a plausible consequence of those inputs. Starting ten
days earlier must permit a materially different allocation based on accepted
ability, targets, remaining work, capacity, and source-bearing marginal-return
judgments. Those example allocations are not hard-coded policy. Their purpose
is to falsify static Goal priority and Assignment-only planning.

Gate 16 must preserve enough exact Goal meaning for Gate 21 to distinguish the
demands without owning the allocation. Gate 21's bounded experiment must prove
that accepted input changes cause reproducible recomputation. Gate 23 must later
exercise that Goal-driven path through the single released-v1 production
model/Turn spine, including the primary TUI and representative retained
interactive carriers.

## Fixed non-implications

Gate 16 does not imply:

- an OpenCode todo or Codex execution Goal;
- a mandatory Course, Course View, LearningSpace, deadline, score, or attainment
  condition;
- mastery, assessment evidence, automatic attainment, or a failed state derived
  from elapsed time;
- an exhaustive taxonomy or mandatory durable episode record for abandonment,
  forgetting, decay, shallow understanding, renewed pursuit, or raised standards;
- Goal decomposition, work estimates, capacity, allocation, scheduling, or a
  universal priority scalar;
- a required `/goal` command or a required model interview;
- persistence of every aspiration-like conversational sentence; or
- completion of Gate 18 context, Gate 21 planning, Gate 22 terminal projection,
  or Gate 23 product-loop work.

## Historical closing evidence contract

Gate 16 may close only if fresh evidence demonstrates the following against the
exact implementation candidate. Passing a plan or implementing the schema is
not evidence by itself.

### Schema, migration, and authority invariants

- fresh and Gate-15-upgrade schemas are equivalent and contain no fabricated
  Goal, revision, condition, scope, target, disposition, supersession,
  field-basis, effect, or receipt;
- raw SQLite attacks cannot forge Goal/change-set/receipt ownership, mutate or
  delete history, branch a lineage, skip/reuse a version, give one head multiple
  successors, attach a cross-Goal predecessor, forge an existing/new
  supersession target, field basis, or Course-membership admission basis outside
  its sealed operation, misclassify a newly added Course as carried from a
  predecessor that did not contain it, create a second current incoming/outgoing
  relation or current cycle, create a malformed disposition/target/scope union,
  duplicate condition ordinals or Course membership, or expose an unsealed
  partial batch;
- Goal IDs, revision IDs, effect IDs, receipts, trusted occurrence/Turn/time,
  source order, authorization basis, confirmation request, and generated
  create/replace identities remain program-owned;
- LearnerHome-wide scope has no Course memberships, Course scope has one, and
  multi-Course scope has a bounded unique nonempty set without View/item links;
  every resulting Course member is exactly a newly bound active-owner proof or
  an identical exact-predecessor carry, while removals cannot require a current
  Course row or be reclassified as additions;
- absent, exact-instant, and local-date target arms are exhaustive and cannot
  silently carry both, neither, an invented local time, or host-default timezone;
- each existing Goal head is consumed at most once in a change set and has one
  atomic winner across update and replacement, while an exact pre-change head
  may separately remain the accepted basis of a relation targeting that Goal;
  and
- migration preserves all Gate 8–15 rows, replay semantics, foreign keys, and
  current generated-schema parity.

### Goal identity, revision, and lifecycle behavior

- zero Goals is valid; independent create operations produce independent stable
  identities even when wording overlaps;
- one learner occurrence can atomically create the distinct OS and
  data-structures exam Goals in one bounded change set without merging them or
  consuming several Gate 8 mutation slots;
- create/update, replacement to a new Goal, replacement to an already-existing
  exact Goal, exact same-snapshot no-change, explicit disposition change,
  concurrent stale writers, and bounded mixed change/no-change batches follow
  the contract with no partial commit;
- active, achieved, abandoned, and superseded are exact learner-authorized
  dispositions, and no Tutor prose, Agent completion, Course progress, deadline
  passage, assessment result, evidence, or learner-state inference changes them
  automatically;
- after one scoped Course is withdrawn, explicit correction, achievement,
  abandonment, restoration to active, and replacement remain legal when the
  resulting complete revision carries or removes that exact membership;
- a mistaken achievement can be explicitly corrected under the same identity;
  an abandoned Goal can be explicitly resumed after substantial forgetting;
  a once-true achievement can remain historical while a later active revision
  reflects decay or a higher standard; and a learner-accepted distinct outcome
  can create a separate Goal, without any case becoming the universal default;
- if independent Goals A and B already exist, an explicit `B replaces A`
  operation records B's exact current basis without creating a third Goal;
- a semantic correction to superseded A can preserve its exact relation to B,
  while explicit restoration clears it and explicit retargeting uses another
  replacement; no ordinary correction changes relation state implicitly;
- stale existing-target heads, self/cross-LearnerHome targets, a second current
  incoming relation, and cycles fail atomically, while later B revisions preserve
  A's accepted relation basis and are shown separately on reads;
- semantically similar independent Goals are never merged, replaced, achieved,
  or reactivated by keyword, embedding, score, or model confidence; and
- unsupported merge/split/decomposition meaning requests clarification or a
  representable independent change rather than manufacturing Goal topology.

### Outcome, condition, scope, and target behavior

- every revision has one bounded nonempty outcome and a complete immutable
  snapshot; optional zero/multiple ordered conditions survive restart and exact
  history reads without becoming criterion identities or evidence;
- an accepted score/threshold/quantity condition remains learner-owned Goal
  meaning while producing no mastery, evidence, schedule, or automatic
  lifecycle transition;
- every update records exact authored/accepted/carried field bases; a narrow
  active target-only or condition-only correction may carry stable fields when
  the learner explicitly identifies that bounded change, without converting the
  complete revision into a patch;
- changing achieved `score >=85` to `score >=90` cannot carry achievement
  without exact reauthorization, and changing one exam outcome cannot reuse
  byte-equal conditions, scope, or target whose referent may have changed;
- outcome/scope changes and all non-active disposition carry exercise the
  dependency closure and route to the accepted-candidate arm whenever current
  learner wording is incomplete;
- condition and aggregate limits reject without truncation, summary, dropped
  items, or prefix commit;
- LearnerHome, one-Course, and multi-Course revisions can be created and
  corrected; initial and added Course memberships require exact active-owner
  proof at settlement, while exact predecessor memberships can be carried or
  removed after withdrawal and report availability separately;
- deterministic one-Course and multi-Course oracles withdraw one member, then
  preserve the exact source scope through wording and target correction,
  explicitly achieve and abandon the Goal, and replace it with both an existing
  and a new Goal while the superseded source successor still carries that
  scope; each target keeps its independently accepted eligible scope. Separate
  cases remove the withdrawn member, retain other members, and reject only an
  unavailable new addition;
- an otherwise explicit creation with no Course restriction is LearnerHome-wide,
  while a default Course, route, directory, or ambiguous “this Course” cannot
  silently narrow its scope;
- View/working-selection/route/material changes neither stale nor retarget an
  already committed Course scope;
- absent target, exact offset-bearing instant, explicit local date, and relative
  date interpreted from resolved source temporal context are exact;
- an unavailable temporal context blocks only a target interpretation that
  needs it, never invents UTC/host time, and does not block ordinary zero-write
  teaching or a later accepted target-free Goal;
- before/on/reached/after target reads create no transition, evidence, event,
  receipt, or frontier write, including after restart; and
- the mixed input `for the next two months, learn one data structure/algorithm
every day` cannot silently store cadence as Goal meaning or drop it while
  claiming the whole learner request was persisted.

### Direct source and model-assisted acceptance

- a clearly explicit learner-authored Goal change uses the exact current
  occurrence, verified source excerpts, conservative normalization, and no
  Gate-imposed second confirmation under default allow;
- direct mode rejects a model paraphrase, invented condition, inferred
  achievement/abandonment, equality-only field carry, unpreserved supersession,
  semantic scope/outcome dependency, ambiguous date, or omitted material clause
  rather than trusting a model-selected basis label;
- a model-assisted candidate displays every consequential operation, outcome,
  condition, scope, target, lifecycle disposition, field basis, and existing/new
  supersession relation in one bounded stable once-only confirmation;
- effective deny prevents that prompt; approve commits only the exact candidate;
  reject/correct/cancel/dispose/owner loss commits nothing and stores no reusable
  acceptance rule or Goal draft;
- a correction returned through permission cannot become unrecorded new Goal
  source; a substantively changed candidate requires a new admitted learner
  occurrence;
- an unstructured aspiration, hypothetical example, quoted third-party goal,
  model suggestion, Tutor summary, or conversation about what goals generally
  mean creates no Goal without explicit initiation or acceptance;
- materially unresolved correction/resumption/new-purpose ambiguity creates no
  durable effect while the current learning interaction remains usable; and
- compaction text or an old fork-history clone cannot serve as the exact current
  learner authorization basis.

### Shared command settlement and failure behavior

- exact physical replay, conflicting Part/call reuse, semantic
  already-applied/conflict, effective authority, no-change, stale CAS, and
  genuinely-new live checks retain the specified precedence;
- a physically new exact semantic duplicate/conflict after source deletion,
  capability revocation, permission-policy change, cancellation, or target-head
  change still settles from committed history after immutable envelope/arm-shape
  validation and before every live check;
- one occurrence owns at most one applied Goal change-set effect, while one
  Assistant Message still owns at most one applied learning mutation across all
  Gate 8–16 command kinds;
- reverse-order physical execution cannot bypass the common FIFO lane or produce
  causally inverted source/settlement truth;
- failure injection at every new identity, revision, disposition/supersession/
  field-basis membership, effect, receipt, confirmation, frontier, ToolPart, and
  Event boundary leaves either the whole exact change set or no Goal-domain
  change;
- same-head writers and same-occurrence invocations produce one winner plus
  exact duplicate/conflict/stale results without a branch or partial batch;
- commit-versus-cancel, final reconciliation, and withdrawal of a newly bound
  Course race return exact success, typed no-effect, or `outcome_unknown`, never
  false cancellation or duplicate Goals; withdrawal racing an exact carry or
  removal does not stale that Goal operation solely because availability changed;
- crash recovery interrupts admitted nonterminal work without provider
  redispatch, Goal draft reconstruction, or confirmation replay; and
- a committed result remains exact after process failure, capability revoke,
  source deletion, later Goal revision, target passage, or Course withdrawal.

### Reads, terminal visibility, and destructive lifecycle

- current, by-ID, filtered discovery, per-Goal history, and effect/receipt reads
  use one snapshot, bounded nested detail, deterministic non-priority order, and
  opaque scope-bound cursors;
- current reads distinguish stored active/achieved/abandoned/superseded
  disposition, accepted supersession target basis, that target Goal's separately
  current head, target-time relation, per-member Course availability and
  admission basis, and source availability without collapsing them;
- a fresh Session reads the same LearnerHome Goal identities and exact revisions
  without importing prior transcript text or mutating default Course state;
- successful direct and confirmed writes render a concise deterministic
  acknowledgement even when provider failure prevents later assistant prose;
- no-change and typed failures remain visible without claiming a Goal changed;
- whole-Session deletion preserves applied Goal meaning, first settlement,
  receipt, confirmation basis, acknowledgement, and exact source tombstone while
  removing transcript-owned no-effect invocations;
- protected-effect revert rejects atomically; eligible unrelated/no-effect
  revert, compaction, fork-history clone, and genuine fork-start input preserve
  their distinct accepted behaviors; and
- restart preserves Goal heads, history, dispositions, supersession bases,
  field provenance, target/scope projection, source truth, acknowledgements, and
  stable pagination.

### Production-path and model qualification

Deterministic suites own identity, state, permission, settlement, and negative
oracles. One bounded real-provider qualification through the sole released-v1
production path must additionally demonstrate that model-facing semantics are
usable without treating stochastic prose as a unit-test oracle:

1. a clear fully learner-authored Goal is recognized as explicit, committed
   through the direct arm, and immediately acknowledged without an extra
   Gate-imposed confirmation;
2. ordinary discussion or a hypothetical aspiration does not silently write;
3. a genuinely ambiguous or model-expanded candidate is clarified and shown in
   the exact accepted-candidate surface before commit;
4. one accepted multi-Goal exam candidate creates two independent Goals with
   exact Course/target meaning and no Assignment or static priority;
5. deterministic capture proves the command used the exact current occurrence
   and the terminal result reached the actual provider/tool path; and
6. a later explicit correction changes the Goal owner read while no mastery,
   evidence, schedule, or automatic lifecycle claim appears.

Deterministic negative oracles—not stochastic provider prose—must prove the
field-dependency rules, including achieved-threshold change, cross-exam referent
change, supersession preservation during correction, existing-target
replacement, and duplicate/conflict precedence after live source/authority
changes. The provider qualification proves only that the model-facing surfaces
are usable and that captured tool input remains inside those enforced bounds.

A separate deterministic product-surface oracle commits a Goal change and then
injects provider failure before later prose; the terminal must retain the exact
acknowledgement rather than generic completion text or raw settlement JSON.
Focused carrier evidence covers every shared released-v1 path changed by the
implementation without enabling preview-v2 or claiming two runtimes.

### Ownership and negative reachability

- import/dependency checks prove Goal owns semantics, Course owns target
  validity, learning command owns settlement, Interaction/Turn owns source, and
  later consumers receive no mutable Goal service;
- the reserved capability cannot be shadowed by custom/MCP registration and an
  unpermitted delegated Turn cannot escalate to Goal writes;
- internal title, compaction, recovery, project-copy, preview-v2, HTTP, MCP,
  background, and provider-special paths cannot create Goal state; and
- no OpenCode todo, Codex execution Goal, universal Agenda item, general graph,
  learner activity/mastery store, pursuit taxonomy, scheduler, priority scalar,
  work estimate, capacity allocation, Goal decomposition, context injection, or
  shadow learning runtime becomes reachable.

Focused Core and OpenCode behavior suites, migration equivalence/integrity
checks, affected package typechecks, deterministic product/request capture, and
the bounded real-provider qualification are expected. Broader suites, packaged
oracles, or release builds are required only if the exact implementation changes
their carrier or leaves a cross-package claim unresolved. Documentation-only
contract work uses diff, link, formatting, and worktree checks.

## Historical design evidence provenance

This contract was derived against the accepted product and
architecture documents, Roadmap 09, and the closed Gate 8, Gate 12, Gate 14, and
Gate 15 contracts. The implementation audit used the production fork at base
HEAD `4fa0263e7` with the accepted Gate 15 implementation fixed by `03ea74ec4`.

| Evidence                                                                                       | Preserved invariant                                                                                                                  | Deliberate Gate 16 difference                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/learning-command/*` and `packages/opencode/src/learning-command/runtime.ts` | trusted occurrence/Turn/invocation envelope, one mutation slot, physical replay, receipt, atomic ToolPart/event settlement, recovery | extend the closed command/effect/receipt union for one Goal-owned bounded change-set effect; do not add another runner                                                                                                  |
| `packages/core/src/retained-steering*`                                                         | immutable owner lineage, exact source order/time, strict CAS, bounded source, deterministic acknowledgement, no fabricated backfill  | Goal has no expiry policy/cut; one accepted occurrence may produce several Goal operations in one bounded effect                                                                                                        |
| `packages/core/src/learner-navigation*`                                                        | exact owner target proof, one-time confirmation when learner acceptance is required, source projection, stale/read behavior          | Course membership is Goal scope rather than navigation; new bindings require an active owner proof, exact predecessor carries survive withdrawal, and model-assisted Goal meaning confirms the whole semantic candidate |
| `packages/core/src/turn/learning-command-registration.ts` and released-v1 tool registry        | only frozen current learner input and permitted tool membership authorize a write; copied history is read-only                       | add one reserved Goal capability without giving internal samples, custom tools, or MCP an alternate writer                                                                                                              |
| `packages/opencode/src/cli/cmd/run/stream.transport.ts`                                        | current slash commands may still enter the ordinary model path                                                                       | no `/goal` syntax or deterministic parser is required by the contract                                                                                                                                                   |

No external scheduler, goal-management package, or preview-v2 runtime was used
as product authority. The inherited local mechanisms already own the
computational settlement and lineage problems; the new derivation is limited to
Goal meaning, bounded multi-Goal atomicity, and direct-versus-accepted semantic
authorization.

## Historical 2026-07-21 independent review state

Fresh top-level reviewer task `019f80b5-58a4-74a1-8530-1405a1e57a25` opened
whole-Gate run `gate16-whole-20260721-01`. It did not dispute `G16-MD-001`
through `G16-MD-008`, the bounded multi-Goal effect, successor-Gate exclusions,
or the propagated planning correction. Its first contract/theory pass returned
`Revise` with four acceptance-changing executor-derived defects. The closure
pass retested and closed all four, then returned `Revise` with one new
acceptance-changing Course/Goal separation defect. The next closure pass
retested that repair and returned `Accept`:

| Finding      | Reviewer result                                                                                                                                                              | Current contract state                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G16-CT-001` | closed: replacement had been unable to target an already-existing Goal                                                                                                       | exact existing-target and generated-new-target arms, same-LearnerHome/distinct-head proof, and final one-to-one/acyclic validation remain in the candidate                                                                          |
| `G16-CT-002` | closed: source-head coupling had let ordinary correction silently clear supersession                                                                                         | supersession remains the complete revision's independently preservable disposition, with explicit preserve, clear, and retarget rules                                                                                               |
| `G16-CT-003` | closed: byte equality had been treated as enough authority to carry terminal or referent-sensitive meaning                                                                   | per-field basis and minimum dependency closure continue to require exact reauthorization or whole-candidate acceptance                                                                                                              |
| `G16-CT-004` | closed: replay precedence had contradicted the passed duplicate/conflict-before-live-state invariant                                                                         | the single total order continues to resolve immutable envelope/shape and committed history before live checks for a new effect                                                                                                      |
| `G16-CT-005` | closed: requiring every Course in every successor revision to remain active had let reversible Course withdrawal block learner-owned Goal correction and lifecycle authority | active proof applies only to initial or newly added membership; an identical sealed predecessor membership may be preserved or removed while unavailable, per member in a multi-Course scope, with availability reported separately |

The reviewer retested one-Course and multi-Course wording/target correction,
active/achieved/abandoned disposition changes, existing/new replacement,
removal/addition, and withdrawal races. It found no new acceptance-changing
contract defect and reported every pass left the production checkout and Git
state unmodified.

The complete contract/theory candidate became implementation authority. The
accepted contract snapshot before this final status/evidence append had
SHA-256
`F5FEB90F65700CA830CE188628BFA332A08DB49365310B836974040BB5016469`;
the append does not revise its meaning. The
user-authorized whole-Gate loop retained the same reviewer for every later
implementation/evidence closure pass. It closed `G16-IE-001` through
`G16-IE-013`, including command/snapshot settlement, occurrence consumption,
direct-arm completeness, exact confirmation bases and immutable proof-owned
settlement, temporal and identifier integrity, state-frontier protection,
provider-shadow rejection, closed result shapes, raw database construction,
Course-withdrawal behavior, and migration preservation. No deterministic
implementation finding remains open.

The final accepted deterministic evidence included:

- Core learner-Goal behavior: `22 pass / 241 expects`, including the exact
  carried-Course `toJSON`/TOCTOU attack and recursively frozen released
  confirmation tree;
- Core database migration: `29 pass / 192 expects`, and Course authority:
  `8 pass / 67 expects`;
- released-v1 OpenCode learning-command runtime: `33 pass / 420 expects`,
  including once-only permission and the production prompt carrier;
- Core and OpenCode package typechecks, schema/migration parity, and final diff
  checks.

The separately authorized real-provider qualification then closed
`G16-IE-U01`. The guarded script used exact `openai/gpt-5.5`, denied every
non-Goal tool, and drove the production released-v1 Session, Turn, permission,
learning-command, receipt, effect, and terminal acknowledgement path. Across
three Sessions and five normally completed Turns, eight model operations
produced three applied Goal invocations, three Goals, four revisions, and three
Goal effects/receipts. The accepted observations proved a direct Goal write,
useful quoted/hypothetical discussion with no write, clarification across
outcome/conditions/Course/target, exact once-only acceptance and atomic creation
of two Course-scoped exam Goals, causal provider/tool linkage, and later exact
predecessor-CAS correction without automatic lifecycle or foreign state.

The qualification script SHA-256 is
`938654CD3864D0AA67C4F6245F8F4662A49AC9D77E9C3B780993B0C21E509D1B`.
The pinned provider catalog SHA-256 is
`F71C7EF836ADE8B32C6F629230B05AB593FF2F39C502F2348964AECD79C3D1BD`.
The secret-free 41,272-byte evidence JSON SHA-256 is
`46B59E8CA04A8EFD3502743B2DB1B2112E69E2417846CE907CA92960F09F5601`;
empty stderr SHA-256 is
`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
SQLite integrity and foreign-key checks passed, the isolated root contained no
credential file, and the reviewer found no warning/error in the eight captured
OpenAI runtime selections. The hash-bound raw artifacts were transient review
evidence and were removed after acceptance rather than becoming a project or
runtime dependency.

This bounded stochastic run proves model-facing usability and captured
production-path conformance only. The deterministic suites remain the authority
for state, authorization, dependency, replay, recovery, and negative behavior.
The same reviewer returned final `Accept`; no material unknown remains for the
Gate 16 boundary.

## 2026-07-27 first-principles correction

The last sentence above is historical review provenance, not the current
disposition. The reopened defect is not confined to SQLite. Application-layer
direct admission uses a fixed English/Chinese initiation whitelist and keyword
tests, update/replacement prompts demand that learner wording include an
internal Goal ID, and closure fixtures predominantly use machine-shaped
`/goal ...` prose. The SQL trigger then duplicates and strengthens those
heuristics. Adding more phrases would preserve the false boundary.

Repair must retain structural Goal ownership and transaction invariants while
moving open semantic interpretation out of SQL, allowing ordinary contextual
reference without exposing internal IDs, and testing natural counterexamples.
The primary TUI must also show the exact proposed Goal meaning at approval and
the durable applied/already-applied/no-effect result after settlement. Trigger
DDL and predecessor fixtures are governed by the cross-Gate migration repair.

## 2026-07-28 TUI corrective integration

The corrective shared presenter now displays every supported create, update, and
replace operation from the exact owner-produced Goal meaning, Course titles and
availability, lifecycle, conditions, target, and relations.
Opaque Goal and Revision identities remain binding data rather than learner
copy. The result is generated from the committed Goal revision and settlement
operations inside the transaction, stored once, and remains visible in TUI and
direct-run after later provider failure. The maximum legal Goal proposal is
scrollable without hiding the once-only permission controls.

That sentence describes the historical V1 proposal carrier. The current path
retains complete semantic display, ID opacity, scrolling, generic configured
`ask`, committed readback, and durable results. V1 field-basis presentation and
once-only Goal confirmation are historical projections, not current V2 input or
controls; an effective `allow` has no Goal-specific prompt.

The original TUI reviewer independently accepted the envelope, semantic
completeness, ID-opacity, scrolling, committed-readback, replay, and
provider-failure counterexamples. Commit
`9e91d43c629b66d65c8741e342bca7cf05de5667` closes only the TUI part
of Gate 16's reopen.

The natural-language implementation/evidence defect remains open. Fresh
separate top-level corrective review task
`019fa8a5-eea1-79f0-abd8-50df4f3cdaa0` first returned `Revise` with
`G16-RC-001`, then accepted the revised amendment above as implementation
authority at that historical point. The 2026-07-30 maintainer correction now
supersedes its exhaustive resolution-proof boundary. SQL and application phrase
forensics, missing model-visible owner reads, natural-reference handling, and
the model-facing mutation surface were rederived together in the current
Agent-native candidate above. Fresh reviewer
`019fb2a3-c902-7882-8134-1bf33f1eb04d` returned `Revise` with
`G16-AN-001..003`; the current text repairs the Goal disposition/semantic-
identity boundary, exact V2 target/carry projection, and causal closing
evidence. The same reviewer then closed all three findings and accepted the
Agent-native semantic contract. After Gate 8 advanced the database predecessor
to V15, that reviewer also accepted the exact mechanical V15-to-V16 correction
without reopening Goal semantics. Scoped Gate 16 implementation authority is
available; Gate 17 remains paused.

## 2026-07-31 initial Agent-native implementation/evidence candidate

The top-level executor implemented the accepted V15-to-V16 contract without
starting Gate 17 or changing the retained Gate 5, Gate 8, Gate 12, Gate 14, or
Gate 15 boundaries. The candidate is deliberately ordinary-Agent native:

- `learner_goal_query` exposes bounded, cursor-scoped, zero-write Goal owner
  reads, while the retained Course query supplies exact Course identities;
- `update_learner_goals` publishes one closed V2 create/update/replace semantic
  intent shape. It contains no caller-selected versions, generated IDs, source
  excerpts, field bases, proposal, or Goal-specific confirmation protocol;
- Core binds current heads, generated identities, source occurrence, temporal
  facts, exact before/after revisions, root or delegated Agent-issuance
  provenance, capability policy, transaction, replay, recovery, correction,
  and durable typed result;
- the durable Goal disposition is exactly `legacy_v1 | semantic_terminal_v2 |
candidate_v2`. Semantic terminals settle before live owner/capability checks;
  admitted candidates retain truthful issuance/capability history when they
  later lose the semantic address; and invalid child Goal-write membership
  creates no candidate or fabricated Agent provenance;
- V15-to-V16 preserves exact V1 rows for replay, recovery, and target carry
  while making the V1 producer/confirmation surface unreachable from current
  package exports, runtime dispatch, registry, and TUI controls; and
- the generic configured capability `ask` and existing typed terminal carrier
  remain the only approval/result surfaces.

Against base HEAD `beebbc5d333109a6fdc301aab49995c223104f71`, the exact
package candidate contains 31 tracked and eight untracked paths. Its raw binary
tracked diff is 713,644 bytes with SHA-256
`38f9a3dac395ba426c9055bc317b1ceb15ea8b7a959a4a5a767dc7fb99d7f5fb`.
The 39-path JavaScript-default/ordinal UTF-8/LF content manifest is 3,466 bytes
with one final LF and SHA-256
`eacb9ac968b8557c9c3b7d0fbc434caddc2b473829cb85bdd5c75315657f47a7`.
Each manifest line is `<40-hex git hash-object --no-filters output><two
spaces><path>`. There are no staged paths and no implementation commit.

Fresh deterministic evidence on the final package candidate includes:

- Core Agent-native Goal behavior: 5 pass / 33 assertions; full database
  migration: 41 pass / 366 assertions; migration drift check and Core typecheck:
  pass;
- OpenCode learning-command runtime: 46 pass / 881 assertions, with 13
  explicitly historical V1 producer tests skipped; semantic presentation: 7 /
  63; registry/read discovery: 29 / 134; production prompt carrier: 14 / 111;
- Schema wire: 4 / 11; primary-TUI permission/result carrier: 1 / 12; Schema and
  TUI typechecks: pass; and
- exact-path Prettier and `git diff --check`: pass. The full OpenCode typecheck
  still reports only the unchanged
  `specs/fixtures/tui-plugins/tui-smoke.tsx` implicit-`any` and obsolete
  `workspaceID`/`workspace_id` diagnostics; no Gate 16 path diagnostic remains.

The old Core V1 producer suite is preserved as historical source but is skipped
on V16 because current V16 constraints intentionally reject production of new
V1 states. Exact historical behavior is instead exercised by the frozen-V15
migration, admitted-state recovery, terminal replay, and absent/instant/
local-date carry oracles. Current external deep import of that producer module
is explicitly blocked, and the current aggregate API exposes only narrow
historical lookup/reopen/recovery functions plus the V2 writer.

The final bounded released-v1 qualification used the inherited Repa OpenAI
OAuth credential—no API key—and exact `openai/gpt-5.5` in a fresh isolated
workspace, database, XDG data/cache/config/state, and test-home root. Six of six
Turns completed normally through 12 model operations and six tool invocations.
The run produced three V2 candidate dispositions, three `policy_allow`
settlements, three effects, and three V2 revisions, with zero permission issues
and zero historical V1 command rows. It demonstrated useful quoted,
hypothetical, and progress discussion without a write; natural Course-scoped
creation without learner-entered IDs; a contextual update in a fresh Session
through Goal owner reads; a Tutor suggestion without a write followed by a
short ordinary acceptance through the same typed command; and ordinary
clarification for material ambiguity without a write.

The exact formatted qualification script is 29,693 bytes with SHA-256
`7088a72995108f9e69617d08bbd3b4c2c3170e95586ff159b98e1459a30c6fe0`.
The secret-free evidence JSON is 19,281 bytes with SHA-256
`66faec3cb0aefa6a49047cfdac9f00cec4d69d8178335355219a51030ef42ddf`;
the 3,399,680-byte database hashes to
`5091549a7f565f6e5ca34588c6a7cea9b99c237c68b56efdefe2aa972b264eb5`;
and the 12,408-byte runtime log hashes to
`e9c0ca7fcc6f0fb4dfc784286651510f18a82d201e650fed6722b6cb9adc804d`.
The read-only provider catalog hashes to
`a5d5df2dbf443edc56af460ffc3f95d761eed7dd450720adb4b5f20d34e91fa1`.
SQLite integrity returned `ok`, foreign-key check returned no row, the isolated
workspace remained empty, the log contained no warning/error line, and secret
canary scanning found zero credential value in the evidence or log. The exact
transient review root is
`C:\Users\Discordance\AppData\Local\Temp\repa-gate16-real-c015cf1bf4d1436991befc376f11e4e2`;
it remains available only for independent review and is not a project/runtime
dependency.

Earlier diagnostic attempts are excluded from acceptance evidence: one lacked
the isolated provider catalog, one exposed an over-strict Course-provenance
oracle, one used the repository as the workspace, and one otherwise-passing run
logged a background catalog-refresh timeout. Each caused either no product
write or only an isolated temporary database; none is part of the bound final
candidate.

This initial candidate was not a closure claim. Original fresh reviewer task
`019fb2a3-c902-7882-8134-1bf33f1eb04d` independently reproduced its bindings
and returned `Revise` with `G16-AN-IMP-001..003`. Those bindings remain rejected
provenance only and are superseded by the repair below. Gate 17 remains
unauthorized.

## 2026-08-01 implementation/evidence review repair candidate

The original reviewer found three concrete implementation defects without
reopening the accepted Goal contract:

- `G16-AN-IMP-001`: a mixed V2 change set wrote no new revision for a
  `no_change` update but the effect-operation trigger required every result to
  reference a revision owned by the new effect, so the whole atomic command
  rolled back;
- `G16-AN-IMP-002`: the aggregate writer hid the V1 producer, but the wildcard
  package export still exposed `prepareConfirmation`, `prepareChangeSet`, and
  `applyChangeSet` through the current `LearnerGoal` namespace; and
- `G16-AN-IMP-003`: syntactically valid pre-epoch civil instants reached a V2
  candidate with a negative epoch even though the stored V2 target domain is
  nonnegative, turning an input error into a database defect.

The repaired candidate closes those boundaries directly. The V16
effect-operation trigger now has a closed changed/no-change union: changed
results reference a source revision written by the current effect, while a
no-change update references the exact unchanged predecessor recorded in the
same effect's immutable materialized operation. One real mixed command proves
both visible results commit atomically, only the changed Goal gains a revision,
and foreign keys remain clean. The public `@opencode-ai/core/learner-goal`
specifier now resolves to a narrow current facade containing schema, bounded
reads, and the historical terminal-result projector only. The internal V1
implementation remains available to replay/recovery code and historical tests,
while both its producer subpath and the facade implementation filename are
blocked package specifiers. The public namespace and runtime resolver oracles
prove the retired producer functions and modules are unreachable. Finally,
both fixed-offset and IANA pre-epoch instants fail as typed `validation_error`
physical no-effects before any Goal disposition/candidate exists.

Against unchanged base HEAD
`beebbc5d333109a6fdc301aab49995c223104f71`, the superseding package candidate
contains 31 tracked and nine untracked paths. Its raw binary tracked diff is
715,362 bytes with SHA-256
`86e336d855392ec9e6f0135e45e3ad308cfdafeae5b92aa7170fb42d6b3fe409`.
The 40-path JavaScript-default/ordinal UTF-8/LF content manifest is 3,550 bytes
with one final LF and SHA-256
`dd8e90817944f42ba7a841455f09edb7630f8c55038ac3d26070ea09fe5c50d9`.
It uses the manifest convention defined above. The rejected
`38f9a3dac395ba426c9055bc317b1ceb15ea8b7a959a4a5a767dc7fb99d7f5fb`
and `eacb9ac968b8557c9c3b7d0fbc434caddc2b473829cb85bdd5c75315657f47a7`
bindings remain provenance only.

Red-first focused execution reproduced both behavioral defects before the
repair. Fresh final evidence is Core Agent-native Goal 6 pass / 43 assertions,
full database migration 41 / 366, OpenCode learning-command runtime 46 / 881,
and registry/current-package reachability 29 / 142. Migration `--check` and
Core typecheck pass. OpenCode typechecking remains non-green only for the same
unchanged `specs/fixtures/tui-plugins/tui-smoke.tsx` diagnostics and reports no
candidate-path error. The previously bound presentation, prompt, Schema, TUI,
and released-model evidence remains causally valid because none of these three
repairs changes those carriers, the model-visible command, or provider path.

This superseding candidate remains unstaged, uncommitted, and unaccepted.
Original reviewer task `019fb2a3-c902-7882-8134-1bf33f1eb04d` must close this
exact diff before integration or any current Gate 16 acceptance. No Gate 17
authority follows.
