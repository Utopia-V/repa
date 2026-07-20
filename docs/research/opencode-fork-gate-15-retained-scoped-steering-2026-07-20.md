# OpenCode fork Gate 15: retained scoped steering

Status: Maintainer grill complete. The decisions under **Accepted maintainer
decisions** are accepted product meaning. Independent whole-Gate review run
`gate15-whole-20260720-01` returned `Revise` on the first contract/theory pass
with `G15-CT-001` through `G15-CT-007`. Its closure pass closed those seven
findings and returned `Revise` solely with `G15-CT-008`; the retained reviewer
then closed that final repair and returned `Accept`. This complete contract is
implementation authority. The implementation/evidence candidate and its fresh
executor evidence are complete and awaiting the retained reviewer's verdict;
no implementation claim is accepted yet.

Date: 2026-07-20

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Primary authority and predecessors:
[ADR-0010 retained learner steering](../decisions/0010-scoped-learner-steering-is-policy-state.md),
[passed Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
and [passed Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md)

Successor boundaries: Gate 18 composes retained steering with other learning
authorities into bounded model context. Gate 19 may admit a source-linked
learner occurrence, evidence distinction, or correctable hypothesis only after
a demonstrated later-action consumer earns it. Gate 20 owns source-linked
future attention and truthful service. Gate 22 later composes inspection and
correction into the terminal. None of those later meanings belongs to Gate 15.

This record owns the developing Gate 15 engineering contract. Accepted product
meaning comes from the product foundation, accepted ADRs, architecture,
roadmap, and the maintainer decisions below. Later storage, command, projection,
and evidence details are derived proposals that a fresh top-level reviewer may
reject or revise.

## Why this Gate exists

The product payoff is not durable preference storage. Repa must make difficult
content more tractable and help resulting knowledge remain available and
useful. A learner may change the useful means or conditions of that work. If a
bounded instruction is forgotten after compaction or in a later Session, the
Tutor can choose a materially misaligned learning move even though the learner's
constraint still applies.

Gate 15 therefore addresses this part of the product loop:

```text
current learning situation and learner-authored bounded condition
-> later Tutor sample still receives the applicable condition
-> Tutor honors it and chooses a useful compatible learning move
-> correction, expiry, or a more specific current request changes later use
```

Persisting and replaying an instruction string is insufficient. The retained
condition must improve continuity of the learning interaction without becoming
a permanent preference, cancelling an unresolved learning need, or claiming
that the learner's chosen method is evidence of learning effectiveness.

## Accepted maintainer decisions

These decisions were accepted during the Gate 15 grill. They are recorded by
consequence rather than as an interview transcript.

### Learning effect is the parent criterion

Gate 15 retains a learner-authored constraint only as a condition on learning
means or interaction within its accepted scope. When the learner continues the
learning interaction, the Tutor honors that condition and chooses a learning-
valuable move from the remaining compatible space. A condition such as
`do not quiz me today` may redirect the current form toward explanation,
demonstration, comparison, or guided work; it does not by itself cancel or
complete a Goal, future-attention concern, review need, evidence question, or
other learning obligation.

The learner owns the current condition. Repa may make a material learning
trade-off visible and invite correction, but it may not secretly violate the
condition because the model believes another technique is generally better.
Conversely, mechanically suppressing one move without continuing useful
learning when the learner still wants to proceed is not successful Gate 15
behavior.

### Gate 15 handles conflict, not an avoidance diagnosis

One steering occurrence does not prove avoidance. Repeated steering also does
not by itself establish motive, ability, anxiety, or a stable learner trait.
Gate 15 preserves the bounded condition, its exact source, and correction or
supersession history. When a concrete high-value learning move conflicts with
the active condition, Tutor behavior may neutrally expose the trade-off and
offer a compatible alternative while leaving any unresolved learning need
truthful.

Gate 15 introduces no `avoidance` flag, score, diagnosis, or learner
hypothesis. If a later, demonstrated action cannot be chosen honestly without
distinguishing a repeated pattern from its possible explanations, Gate 19 may
consider a source-linked, correctable occurrence/evidence/hypothesis boundary.
That later authority must not infer motive from Gate 15 state alone.

### Learner-stated reasons are optional and never invented

A learner does not have to justify a clear bounded steering instruction before
the Tutor honors or retains it. When the learner voluntarily supplies a reason,
the contribution preserves that exact source-grounded meaning so a later Tutor
can choose a better compatible learning move. The reason remains learner intent,
not evidence of ability, anxiety, avoidance, or the objective effectiveness of
one method.

The Tutor asks for clarification only when materially different compatible
learning moves depend on the missing distinction. It does not routinely demand
a motive, delay an otherwise clear instruction, or manufacture an explanation
from model judgment. A clarification becomes authoritative only through the
new admitted learner occurrence; a model-authored guess cannot fill the source.

### Retention is earned by material learning consequence

A direction qualifies for retained steering only when forgetting it at a
future sampling boundary could materially change the intended learning move,
the learner's role, the useful difficulty, the available help, or the
assessment condition. The direction also needs an applicability scope that the
current command can honestly represent. A time phrase alone is not enough.

Current-request instructions remain in Interaction history when no later
sample needs separate policy state. Unbounded stable preferences and purely
presentational conventions remain outside the first Gate 15 boundary. A
presentational direction may still qualify when its source makes a material
learning role explicit—for example, using a target language as the learning
condition rather than as cosmetic formatting.

Qualification remains open semantic work. Gate 15 does not introduce a closed
enum of explanation, assessment, hint, practice, or other Tutor actions. The
model may propose that an exact learner occurrence has the required future
learning consequence; the runtime binds the source, scope, identity, and legal
transition without pretending to prove pedagogy from keywords.

### Clear bounded steering commits nonblockingly and remains visible

When the exact learner occurrence clearly supplies a qualifying instruction and
the command can represent its scope without broadening the source, the routine
reversible policy write does not require a second confirmation. Successful
admission produces an immediate concise learner-visible acknowledgement of the
operative instruction, normalized scope or expiry, and availability of
correction or cancellation. The acknowledgement reports an accepted effect; it
is not a pre-commit permission ceremony.

If retention requires guessing or materially widening the instruction, the
Tutor asks for clarification before admission. It may not silently turn `for
now` into the rest of the day, current-Course language into learning-wide
policy, or a learner-stated constraint into a stronger model-authored rule.
Hard safety, external effects, and execution permissions remain governed by
their own policy and cannot be granted or bypassed through retained steering.

## Decision provenance and revision authority

| Material decision | Authority and reason | May revise it |
| --- | --- | --- |
| Retained steering serves learning effect by constraining means without cancelling the underlying learning need | Product foundation plus maintainer, 2026-07-20. Good learning requires a useful compatible continuation rather than storage-only obedience or covert override. | Maintainer or an accepted product/architecture revision. |
| Gate 15 exposes concrete conflict but does not diagnose avoidance | ADR-0003's report/evidence/inference separation plus maintainer, 2026-07-20. The same instruction can have several materially different explanations, and Gate 15 has no evidence owner for motive. | Maintainer or a later accepted learner-record decision backed by a demonstrated consumer and correction contract. |
| A reason is optional, retained only when learner-supplied, and requested only when it changes the useful compatible move | Maintainer, 2026-07-20. Mandatory explanation would add friction and coerced disclosure; invented rationale would create false provenance and corrupt later teaching. | Maintainer or an accepted Tutor-policy decision with contrary interaction evidence. |
| Material future learning consequence, not a Tutor-action taxonomy or time phrase alone, qualifies a direction for retention | Maintainer, 2026-07-20. This keeps current-only instructions and cosmetic conventions out of durable policy without hard-coding open teaching behavior. | Maintainer or an accepted Tutor-policy decision backed by a demonstrated missing or over-admitted consumer. |
| A clear qualifying bounded instruction commits without a second confirmation and receives immediate visible acknowledgement; semantic or scope expansion requires prior clarification | Maintainer, 2026-07-20. The learner's instruction already supplies authority for a routine reversible write, while hidden expansion would exceed that authority. | Maintainer or an accepted Tutor-policy/permission revision backed by contrary interaction or consequence evidence. |
| Steering remains distinct from Goal, Agenda future attention, learner evidence, stable defaults, and current-only Interaction intent | ADR-0010, ADR-0012, architecture, and Roadmap 09. These meanings have different ownership and lifecycle consequences. | An accepted product/architecture/roadmap revision; Gate-local implementation cannot merge them. |

## Current falsification pressure

Learning research supplies pressure in both directions. Controlled retrieval
practice can outperform learner-selected study, and learners do not always
choose the strategy with the strongest later retention. At the same time,
anxiety, current load, task form, and prior understanding can change whether a
particular difficulty is useful. These results justify preserving the conflict
without treating the learner as either infallible or adversarial:

- Karpicke, 2009, four experiments on retrieval-practice choice and retention:
  <https://doi.org/10.1037/a0017341>
- Weinstein et al., 1982, test anxiety and depth of processing:
  <https://doi.org/10.1016/0361-476X(82)90036-4>
- Broeren et al., 2021, classroom support for self-regulated retrieval use:
  <https://doi.org/10.1016/j.cedpsych.2020.101939>

These studies do not validate a Repa avoidance detector or prove human learning
outcomes for Gate 15. Native-provider evidence may demonstrate that the
accepted policy changes a later Tutor move as intended; broader educational
efficacy remains separate human-outcome research.

## Boundary exclusions already fixed

Gate 15 does not add:

- a permanent preference database or stable learner-style profile;
- a Goal, future-attention, deferral, commitment, or cancellation lifecycle;
- progress, activity, evidence, mastery, anxiety, or avoidance inference;
- a taxonomy or deterministic optimizer for all Tutor actions;
- a second runtime, durable active mode, or preview-v2 production path; or
- the complete multi-authority context compiler owned by Gate 18.

## Current repository evidence and the missing boundary

The candidate is derived against the released-v1 production path at the Gate
14 closing commit, not against preview-v2 or a reconstructed runner.

- Gate 8 already owns learner-occurrence identity, exact physical invocation,
  one semantic effect arm, receipt settlement, source tombstones, and the
  distinction between physical replay and semantic conflict.
- Gate 12 already owns one formal model-operation admission per provider turn,
  its exact current Turn input, request/context fingerprints, durable
  membership, and consumed database-wide learning frontier.
- Gate 14 demonstrates a separate learning authority whose versioned effect,
  receipt, ToolPart, event, and frontier advance settle atomically without
  moving semantic ownership into the Agent runner.
- `packages/opencode/src/session/prompt.ts` currently reads the shared-learning
  frontier before request assembly, reads it again before model admission, and
  retries when a learning write changed it. This catches a committed-state
  race but cannot catch a pure-time expiry: the database frontier can remain
  identical while the clock crosses `validUntil`.
- `packages/core/src/turn/turn.ts` currently admits a model operation and floors
  its time to Turn and shared-frontier causality, but it owns no retained-policy
  cut, timezone interpretation context, or exact active-contribution
  membership.
- `packages/opencode/src/session/llm/request.ts` is the shared released-v1
  request-preparation seam. It composes protected product prompts and resolves
  provider-visible tools from effective permissions before either the default
  AI SDK carrier or the opt-in native adapter lowers the request.
- Current learner occurrences retain source identity and causal time but no
  database-owned total learner-input order across Sessions. Command settlement
  order and timestamp coincidence therefore cannot honestly implement
  ADR-0010's newer-source precedence.
- The runtime exposes a host-derived date to the model but does not freeze an
  exact trusted instant, IANA timezone, or offset interpretation context on the
  model operation that may propose a time boundary.

The missing boundary is consequently not a prompt paragraph or a preference
row. It is one source-bound policy authority plus a narrow steering-only sample
cut, admitted at the existing model-operation boundary and carried through the
existing released-v1 request seam.

## Proposed Gate result

After Gate 15:

- only an exact admitted learner occurrence with a material future learning
  consequence and honestly representable first scope can create retained
  steering;
- the first accepted scope is one immediately effective, learning-wide,
  finite half-open interval `[effectiveFrom, validUntil)`;
- every real create, correction, replacement, or retraction is one immutable
  source-linked transition in a linear policy lineage, with an exact lineage
  version, database-wide steering revision, shared-learning frontier, trusted
  times, and Gate 8 receipt;
- one admitted learner occurrence can own at most one Gate 15 semantic effect;
  exact physical replay returns that effect, while different reuse conflicts;
- current-request instructions remain ordinary Interaction context unless a
  real later sample earns promotion, and a more specific current request may
  form a one-Turn exception without changing retained state;
- every eligible released-v1 interactive model operation receives one bounded
  immutable steering cut compiled synchronously in the transaction that admits
  that operation;
- the cut freezes its exact as-of time, steering revision, active policy
  revisions, source order, exact resolved-or-unavailable source temporal
  context, and fingerprint;
- the first representation has one real consumer: a protected provider-prompt
  contribution rendered from that stored cut without coupling unchanged tool
  or permission resolution to it;
- if a later accepted structured steering representation earns a deterministic
  execution overlay, that real consumer must use the same immutable cut rather
  than re-reading current policy;
- expiry is derived at cut time and creates no policy transition, evidence,
  timer event, receipt, or shared-learning-frontier advance;
- a fresh Session inside the interval receives the active contribution without
  importing an old transcript, while a sample at or after `validUntil` does
  not;
- successful writes produce a deterministic, concise, learner-visible
  acknowledgement of the operative instruction, normalized expiry, and
  correction path; and
- restart, compaction, fork, source deletion, cancellation, and failure retain
  the exact accepted state and never synthesize policy or silently fall back to
  a sample without a required cut.

This is the first retained Tutor-policy and sampling spine. It is not the Gate
18 compiler for Course, material, navigation, Goal, learner record, Agenda, or
Session-continuation context.

## Terminology

- **Policy lineage**: one stable retained-steering identity whose immutable
  revisions express the original contribution and explicit later correction,
  replacement, retraction, or reinstatement.
- **Policy transition**: one immutable semantic effect sourced by one admitted
  learner occurrence and producing one new lineage revision.
- **Current head**: the unique lineage revision with no successor. Its stored
  state may be operative or retracted; expiry is a query-time relation, not a
  third stored transition state.
- **Steering revision**: the database-wide monotonic revision advanced by each
  real retained-steering transition. It does not advance for reads, expiry,
  exact replay, validation failure, or no-change.
- **Source order**: a database-minted total order assigned when a genuine
  learner occurrence is first admitted. It is neither tool settlement order
  nor wall-clock sorting.
- **Steering cut**: the immutable, bounded set of exact active lineage
  revisions selected for one formal model operation at one trusted as-of time.
- **Source temporal context**: a closed program-bound union frozen when the
  exact learner occurrence is admitted. Its `resolved` arm contains the trusted
  source instant, IANA timezone, and applicable offset information used as the
  sole authoritative basis for interpreting relative language. Its
  `unavailable` arm contains the same trusted source instant and a closed
  runtime-owned reason but no timezone or offset. Neither arm accepts temporal
  authority from model payload, and the unavailable arm never implies a host
  or UTC fallback.
- **Current exception**: a more specific instruction in the exact current Turn
  input that locally outranks an overlapping retained contribution without
  creating a policy transition.

## First scope and temporal semantics

### Learning-wide means Tutor learning interaction, not every model call

The first stored scope has the closed value `learning_wide`. It applies across
Courses and Sessions in the one local LearnerHome, but only to released-v1
interactive Tutor/Agent model operations. It is not injected into title,
summary, compaction, representation-conversion, or other program-owned internal
model operations. A permitted delegated Turn that uses the interactive Agent
composition receives its own cut at its own model-operation boundary; it may
not inherit a mutable host variable or exceed its frozen parent capability.

Gate 15 cannot honestly encode `this section`, one unnamed current Course, one
Session, a future event, or an open-ended condition. Such instructions remain
in current Interaction history unless and until a later accepted scope owner
and demonstrated consumer exist. It also cannot turn `for now`, `usually`, or
`always` into a guessed date.

### Immediate finite interval

For an initial contribution or operative replacement:

- `effectiveFrom` is the trusted admission time of the exact source learner
  occurrence;
- `validUntil` is one finite absolute instant normalized from an ISO-8601
  timestamp carrying an explicit UTC offset;
- the relation is half-open: the contribution is time-applicable exactly when
  `effectiveFrom <= cutAsOf < validUntil`;
- `validUntil` must remain later than the final settlement time. If execution
  reaches or passes the proposed boundary before commit, the command settles
  with no policy effect because no later sample remains to earn retention; and
- a future `effectiveFrom` is invalid. Future activation and a requested later
  return belong to Agenda, not retained steering.

There is no arbitrary host-chosen expiry for an unbounded learner phrase. A
finite but long explicit learner boundary remains finite; Gate 15 does not
invent a universal duration limit or silently reinterpret it as a stable
preference. Unsupported or materially ambiguous scope returns a typed
clarification-required result with no write.

### Source-relative trusted time and timezone binding

Admission of every genuine learner occurrence freezes one closed source
temporal-context arm in the same transaction as its identity and source order.
The `resolved` arm contains the exact trusted source-admission instant, an IANA
timezone identity, and the offsets needed to render and validate the reference
and a proposed boundary. The `unavailable` arm contains the exact trusted
source-admission instant and a closed runtime-owned unavailability reason, with
no timezone or offset fields. The exact arm remains attached to the occurrence
through compaction and historical presentation and participates in its
fingerprints.

Timezone resolution failure does not reject or roll back the learner
occurrence, root or promoted-steer Turn input, formal model operation, or
ordinary Tutor response. For an unavailable arm, the protected interactive
prompt labels source-relative temporal interpretation unavailable and supplies
no host-derived date, UTC-derived date, guessed timezone, or offset. The exact
current learner text remains ordinary Interaction context, so the Tutor can
honor an immediately useful current-only instruction and continue learning
without creating retained policy.

The exact current Turn input binds its source temporal context into each later
model operation. For a resolved arm, the protected interactive prompt presents
that frozen context as the sole authoritative time for interpreting relative
language in the current learner source. The model-operation cut has a
separately labelled `cutAsOf` used only to decide which already-retained
contributions are active; it cannot reinterpret `today` or another relative
phrase in the current source.

The existing host-derived `Today's date` cannot remain an independent
pre-admission prompt fact. Eligible interactive request construction replaces
it with the source-bound context returned by formal admission; static
environment details may still be prepared earlier. A learner source admitted
at 23:59 therefore keeps that date even if the model operation begins after
midnight, and a host-timezone change between source and operation cannot change
the learner's meaning.

When a command proposes `validUntil`, the runtime parses it against that exact
resolved source temporal context, requires an explicit offset, verifies that
the local boundary and offset are valid for the frozen timezone including a
daylight-saving transition, and stores both the normalized absolute instant and
the interpretation context. An unavailable source temporal context cannot
authorize an initial operative contribution, replacement, reinstatement, or
other transition that needs a newly interpreted interval. Such an attempt
returns a typed `temporal_context_unavailable` no-effect result, consumes no
mutation slot, creates no receipt effect or policy revision, and advances no
shared-learning frontier. An authorized retraction or exact/no-change
reconciliation remains legal because it does not interpret a new interval.
A nonexistent local time, offset mismatch, malformed timestamp, or ambiguous
widening likewise fails without a policy write. Falling back to an unlabelled
host date, silently choosing UTC, or re-reading a changed host timezone at
model operation or settlement is forbidden.

Changing the machine timezone after source admission or commit never changes
the interpretation or stored absolute boundary. The captured interpretation
remains inspectable, and a new learner occurrence may correct it through the
ordinary policy lineage.

### Expiry is a read relation

Expiry never mutates a lineage. An operative head can project as active before
its boundary and expired at or after it while retaining the same identity,
version, source, and steering revision. No timer, daemon, midnight job, event,
learning observation, readiness assertion, or evidence row is created.

Cut as-of times are globally nondecreasing across Gate 15 interactive samples.
The admission transaction floors a fresh trusted clock read to Turn causality,
the consumed shared-learning frontier, and the latest prior steering-cut
as-of time. A regressing wall clock therefore cannot reactivate an expired
contribution in a fresh Session. This time watermark is operational sample
truth, not a policy transition or learning observation.

## Qualification, source grounding, and bounded text

The model may perform the open semantic judgment that a learner instruction
has a material future learning consequence. The program does not pretend to
prove that judgment from a time keyword or Tutor-action enum. The capability
description and protected product policy constrain the proposal; exact source,
identity, scope, time, transition, and correction legality remain program
owned.

Every applied transition retains:

- the exact admitted learner occurrence and its source order;
- immutable original Session and User Message identities plus the Gate 8/12
  command and Turn lineage;
- one bounded verbatim source excerpt verified against the still-available
  exact learner presentation before commit;
- one bounded operative instruction that is either that excerpt or an
  explicitly source-linked interpretation;
- an optional bounded learner-reason excerpt only when it is also verified as
  learner-authored source text;
- the fixed scope and complete normalized temporal interpretation; and
- the exact transition, policy-lineage, lineage-version, steering-revision,
  receipt, and shared-frontier identities.

The model cannot supply occurrence identity, source order, effective time,
current time, timezone authority, policy/revision/effect IDs, trusted commit
order, frontier, or receipt identity. The source and operative fields have
fixed program-owned byte ceilings. If the exact meaning cannot fit, admission
fails and asks for a narrower learner instruction; it never truncates text into
a different rule. Escaping and structured rendering treat the contribution as
learner-authored policy below hard product authority, not as an unrestricted
system prompt.

A volunteered reason remains labelled learner intent. Its presence does not
create evidence or a causal explanation, and its absence never blocks a clear
instruction. Model-generated qualification rationale, if retained for
debugging, is explicitly interpretation provenance and never learner speech or
learning truth.

Source availability is required when a new transition commits so the excerpt
can be verified. After commit, whole-Session deletion may make the original
presentation unavailable while the bounded retained excerpt and policy effect
remain. Reads report that distinction rather than inventing transcript text.

## Logical state and legal transitions

### Exact source order and source temporal context

Every genuine learner occurrence admitted after the Gate 15 migration receives
one unique monotonic source-order value and exactly one immutable resolved or
unavailable source temporal-context arm in the same transaction as occurrence
admission. Compaction re-presentation and fork-history cloning reuse the
original occurrence, order, and exact arm. A genuine fork-start learner input
receives a new occurrence, order, and arm. Historical pre-Gate occurrences are
not assigned fabricated order or temporal facts that can authorize a new Gate
15 effect.

This narrow extension belongs to learner-occurrence identity. It does not
advance the shared-learning frontier, create policy, or make every learner
message a retained instruction. It exists because two commands may settle in
the opposite order from their learner inputs, while newer explicit learner
intent must still be rendered later.

### Policy lineage

Absence of a policy lineage means no retained contribution. The first applied
transition creates a stable policy identity at lineage version `1`, has no
predecessor, and produces an operative state. Each later real correction names
the exact current head and version, names that head as predecessor, and creates
exactly `previousVersion + 1` in the same lineage.

Legal resulting states are:

- **operative**: exact bounded instruction plus immediate finite interval; or
- **retracted**: no active instruction or interval, while source and revision
  history remain.

Legal transitions are:

- no lineage -> operative;
- operative or expired operative -> a different operative replacement;
- operative or expired operative -> retracted;
- retracted -> a new operative correction or reinstatement; and
- retracted -> retracted and exact same operative replacement requests are
  typed no-change results when authorized.

A no-change result creates no transition, effect, receipt arm, source-order
change, lineage-version increment, steering-revision increment, mutation-slot
consumption, or shared-frontier advance. Expiry alone is never a legal
transition.

Every scope has one linear predecessor chain. Database constraints reject a
branch, skipped or reused lineage version, cross-lineage predecessor, mutated
or deleted transition, wrong previous head, malformed result arm, non-finite
operative interval, future activation, same-state transition, reused source
occurrence, or dangling owner. SQLite writer serialization is implementation
behavior, not the CAS contract; concurrent corrections to one head have one
winner and one typed stale result.

### One semantic effect per learner occurrence

Gate 15 reserves one semantic effect slot on each qualified admitted learner
occurrence. The exact same physical invocation and normalized command returns
its stored settlement. A different physical invocation that names the same
semantic source and exact normalized effect resolves as already applied; a
different interpretation, target lineage, scope, source excerpt, operative
text, reason, or boundary for that slot is a semantic conflict and requires a
new explicit learner correction occurrence.

One learner message cannot create several independently scoped steering
contributions in the first representation. If it contains several material
directives that cannot truthfully form one instruction, the Tutor asks the
learner to separate or clarify them rather than manufacturing multiple effect
addresses.

### Newer intent and supersession

Explicit correction structurally supersedes the named lineage head. Independent
active lineages are not merged by keyword similarity. A steering cut orders
their exact current revisions by source order from older to newer, making the
newer explicit learner source the later applicable instruction for semantic
conflicts. The model remains responsible for open semantic overlap; the
program does not classify every Tutor action.

If a newer independent contribution expires while an older one remains within
its own interval, the older contribution can again be the latest applicable
one because it was never retracted. If the learner intends the older rule never
to return, the newer occurrence must explicitly correct or retract its lineage.
This preserves source meaning rather than treating ordinary prompt order as an
implicit destructive update.

## Command and settlement contract

Gate 15 adds one reserved versioned learning capability with a closed command
union for:

- creating one new operative lineage;
- correcting/replacing the exact head of one lineage; and
- retracting the exact head of one lineage.

The exact capability and field names remain implementation details, but the
model payload contains only source text proposals, operative interpretation,
the normalized boundary proposal, and—on correction—the exact policy/head
identity exposed by an accepted cut or trusted read. The runtime supplies the
causal envelope, temporal context, IDs, order, authorization basis, and trusted
times.

The learner's exact current occurrence is the authorization basis. Gate 15
adds no mandatory second confirmation. The default Repa profile permits this
routine local reversible capability and emits no Gate-specific confirmation
prompt. An explicit higher/effective deny or a missing delegated capability
still rejects it; an explicitly configured ordinary `ask` policy remains an
external control-plane choice rather than a Gate-imposed ceremony. Steering
can restrict behavior but can never grant a tool, bypass hard safety, or weaken
external-effect permission.

The predecessor order is exact:

1. lookup by physical Part/call identity validates the complete trusted
   envelope and canonical input; exact terminal replay returns its stored
   settlement, while conflicting physical reuse fails;
2. a physically new invocation validates its runtime-bound Turn, current
   learner occurrence, capability, and causal envelope before it can name a
   semantic address;
3. committed semantic duplicate or semantic conflict is then resolved from the
   source occurrence's Gate 15 effect slot; this decision precedes permission,
   cancellation, current source availability, time validity, and live policy
   state; and
4. only a genuinely new semantic effect evaluates effective authority and then
   live source, temporal, head/CAS, no-change, and capacity conditions.

Consequently a later exact retry or semantic duplicate still returns the
original committed result after capability revocation, source deletion, or a
new permission wait; none of those live conditions can rewrite history into a
denial or source-loss result. For a genuinely new effect, permission denial,
correction, cancellation, invalid scope/time/source, stale head, capacity
failure, or source loss produces no domain effect. Effective authority still
precedes any live no-change or current-state projection.

For an applied command, the following commit or roll back together:

- the immutable policy transition and lineage/global revisions;
- exact source-order consumption and temporal interpretation fields;
- Gate 8 invocation settlement and one strict retained-steering receipt/effect
  arm;
- the Assistant Message's one applied-learning-mutation ownership;
- Turn consumed/resulting tool frontier;
- terminal ToolPart and associated Event projection;
- deterministic acknowledgement data; and
- one shared-learning-frontier advance.

The settlement time is floored to command admission, Turn/tool causality, the
current database-wide frontier, the source occurrence, every owner state
consumed, and the latest committed steering-cut as-of watermark. Only after
that floor is known may a genuinely new effect prove `validUntil` remains
strictly later. A delayed command therefore cannot commit an interval already
behind a later sample, even if the wall clock regressed. The transition,
receipt, ToolPart, event, and frontier use the same trusted time wherever
applicable. Exact replay returns those stored values and creates no new
revision or event.

The terminal result contains a program-authored concise acknowledgement with
the exact operative instruction, normalized local/offset expiry, and how to
correct or retract it. Gate 15 also owns one narrow terminal projection for its
reserved capability: the completed ToolPart's typed acknowledgement becomes
the inline title and final command body instead of falling through to the
generic `<tool> completed` renderer or exposing raw settlement JSON. This makes
the accepted write visible even if later assistant prose or the provider fails.
It is not a policy browser, history view, or Gate 22 terminal composition. The
Tutor may then continue with a useful compatible learning move; the
acknowledgement itself is not evidence that such learning occurred.

## Immutable steering cut at model-operation entry

### Eligibility and exact selection

Every new released-v1 interactive model operation, including an eligible
delegated interactive operation, receives exactly one steering-cut header even
when it has zero active items. Program-owned internal operations receive none
and cannot invoke the steering command from an ambient policy prompt.

Inside the SQLite write transaction that formally admits the model operation,
the retained-steering owner:

1. reads a fresh trusted clock and floors it to Turn causality, the current
   shared-learning frontier, and the last committed steering-cut as-of time;
2. reads the exact current database-wide steering revision;
3. resolves the unique head of every policy lineage at that revision;
4. selects only operative heads whose interval contains the exact as-of time;
5. orders them by immutable learner source order;
6. enforces the fixed contribution-count and byte budgets without truncation;
7. writes the cut header and exact item membership, including the active policy
    and revision/effect identities; and
8. admits the Turn model operation with the cut identity and fingerprint.

These are one atomic transition. A database or bound failure admits no model
operation and dispatches no provider request. A previously built policy
preview, dynamic system paragraph, or clock value cannot be submitted as the
cut. Unchanged inherited tool discovery is not a cut input in the first
representation.

The cut fingerprint covers its schema version, cut as-of, source temporal
context, through steering/shared-frontier revisions, exact ordered item
membership, and operative/source fields. The effective model context
fingerprint incorporates that cut fingerprint. Exact replay of an
already admitted model operation returns its stored cut; it never recompiles
against a later correction or time.

### Prompt consumer and conditional execution rule

After admission, the existing released-v1 request-preparation seam renders a
protected, explicitly labelled learner-policy contribution from the stored
cut. It also renders the current source's frozen temporal context and does not
query current steering state or an unfrozen host date. A resolved arm renders
its authoritative source-relative facts; an unavailable arm renders only the
typed unavailability label and never manufactures a date, timezone, or offset.
The request fails closed before dispatch if the cut is missing, malformed,
mismatched to the model operation, over budget, or renders to a different
fingerprint.

The first retained representation is open semantic text and therefore has no
structured Tutor-action or tool-deny overlay. Its real consumer is the
protected interactive prompt. Existing provider-visible tool discovery and
permission resolution remain independent and may run in their inherited order;
Gate 15 neither passes the cut through them nor reorders them to demonstrate a
no-op dependency. Gate 15 does not invent an empty-purpose action enum merely
to demonstrate deterministic filtering.

If a later accepted structured steering kind earns an execution consumer, that
change must extend the cut and request-admission contract so its
deny/restrict-only overlay is compiled from the same immutable cut, used for
the visible tool set, and bound to tool candidates from that model operation.
It may never grant authority or be recomputed from policy current at
tool-execution time. This conditional invariant does not authorize or require
the first implementation to build that carrier.

Hard product/system authority, domain legality, and current external-effect
permissions continue to apply independently and above the frozen learner
policy. A later hard deny may still stop an emitted tool. Because the first
representation asserts no execution overlay, there is no Gate 15 tool policy
with which its prompt can disagree; the cut does not freeze or weaken safety
authority.

### Current request exception

The exact current learner input remains in ordinary Turn context and has the
highest learner-intent specificity for that Turn. Protected Tutor guidance
states that a clearly more specific current request may override an overlapping
retained contribution locally. The cut still includes the retained revision so
the model can explain the relation; it is not deleted or hidden.

No policy write occurs merely because the current request forms an exception.
A later model operation whose current input does not contain that exception
again receives the still-active retained contribution. Only a successful
source-linked correction/retraction command changes later cuts.

### Boundedness and overload

The owner sets fixed implementation constants for per-field bytes, active-item
count, and total rendered cut bytes. A create or operative replacement that
would make a truthful active cut exceed those bounds rejects before effect
commit and asks for correction or consolidation. Retraction remains available.
The compiler never silently drops the oldest or newest contribution, truncates
meaning, substitutes a summary, or sends an unqualified provider request.

Gate 18 may later compose this already-bounded cut with other authority
projections. It cannot reinterpret policy source, version, active time, or
ordering, and Gate 15 does not predefine Gate 18's total token allocation.

## Read, inspection, and correction boundary

The retained-steering owner exposes narrow snapshot reads for:

- the exact current head and version of one policy lineage;
- the current steering revision and all currently active contributions at one
  caller-supplied trusted as-of instant;
- stable cursor-bounded policy history and transition source metadata; and
- one stored model-operation steering cut by exact operation identity while
  that Interaction-owned operation remains available.

Reads distinguish operative-active, operative-expired, and retracted without
turning expiry into a transition. For a resolved arm they return normalized
time/timezone data; for an unavailable arm they return that exact closed state.
Both return exact effect/receipt/source identities and truthful source
availability.
Multi-query projections use one database snapshot, deterministic order, opaque
scope-bound cursors, and bounded nested detail.

A steering cut is model-operation membership, not durable policy or a universal
Interaction audit. Whole-Session deletion removes its header and item
membership with the owning model operation. A later exact cut read returns the
existing Gate 12 typed `source_unavailable`/minimal identity mapping when one
survives for an independent receipt, or `not_found` otherwise; it retains no
cut contents, prompt text, source temporal context, provider details, or policy
membership. The independently owned policy transition and bounded source
excerpt remain available to future fresh cuts until correction or expiry.

Gate 15 registers the write/correction capability and the automatic narrow cut
consumer. It does not add a general model-visible policy browser, full terminal
settings screen, universal learner memory API, or multi-authority Context
endpoint. Gate 22 later composes ordinary inspect/correct terminal behavior
over these owner reads and commands; it does not invent their semantics.

## Failure, cancellation, restart, and destructive lifecycle

- **Invalid, unavailable, or ambiguous interpretation:** unsupported scope,
  unverified source text, missing learner reason that is actually necessary,
  malformed or inconsistent time, expired-before-commit boundary, or hidden
  semantic widening settles with no effect and requests only the needed
  clarification. An unavailable source temporal arm does not block ordinary
  Interaction or model admission; an interval-creating command returns the
  typed no-effect result while the Tutor continues current-only learning.
- **Concurrent writers:** one exact-head correction commits. A loser receives
  typed stale state and never branches history or overwrites a newer learner
  occurrence.
- **Cut versus policy write:** SQLite transaction order is decisive. A
  correction committed before model admission is in the cut; one committed
  after admission is not. The admitted request never mixes the two revisions.
- **Cut versus pure time:** the trusted as-of read occurs inside formal model
  admission. Crossing `validUntil` after a preview but before admission excludes
  the contribution; crossing it after admission does not mutate that request's
  frozen cut.
- **Cut integrity or rendering failure:** no provider request is dispatched and
  no unqualified fallback sample is allowed.
- **Permission denial/correction:** no policy transition, receipt effect,
  mutation-slot use, or frontier advance occurs.
- **Cancellation before commit:** no effect. If the atomic transaction already
  committed, reconciliation returns the exact durable success rather than a
  false cancellation.
- **Failure after commit:** exact effect, receipt, ToolPart, acknowledgement,
  revisions, and frontier remain; inability to reconcile returns typed
  `outcome_unknown`, never claimed no-effect.
- **Process loss before policy commit:** the existing Gate 8/12 recovery owner
  terminates the admitted invocation/Turn truthfully and never redispatches the
  provider or synthesizes policy.
- **Process loss after policy commit:** restart reads the exact transition and
  acknowledgement. A new model operation compiles a fresh current-time cut;
  an old interrupted operation is not resumed against changed policy.
- **Compaction:** re-presentation retains occurrence, source order, effect, and
  policy identity. A summary cannot become a new source or alter scope.
- **Fork:** cloned historical items remain read-only presentations and cannot
  authorize a target-fork command. The genuine fork-start learner input owns a
  new occurrence/source order and may create one new semantic effect.
- **Whole-Session deletion:** applied policy and its bounded excerpt remain;
  the original transcript presentation becomes truthfully unavailable through
  the existing occurrence tombstone, while Interaction-owned model operation,
  cut header, and cut items are removed together. A surviving Gate 12 minimal
  mapping exposes only unavailable identity, never the cut. Active policy use
  continues through newly compiled cuts until correction or expiry.
- **Revert:** a cleanup set containing the applied steering Part or Assistant
  Message rejects atomically. An eligible unrelated or no-effect revert neither
  changes policy nor invents source unavailability.
- **Clock regression or timezone change:** the nondecreasing cut-time floor
  prevents reactivation, while absolute stored boundaries and captured
  interpretation remain unchanged.
- **Invariant corruption:** policy read, model admission, or correction fails
  closed. It never selects a highest version while ignoring a branch, dangling
  receipt, malformed cut, or missing source-order authority.

## Implementation ownership and dependency boundary

The proposed production owner is a separate retained-steering Core authority.
It owns policy identity, source grounding, legal transitions, lineage/global
revision, temporal applicability, active selection, bounded reads, and cut
compilation. It is not a generic preference, policy-manager, memory, graph, or
Agent service.

Dependencies remain one-directional:

- learner occurrence owns exact source identity, presentation availability,
  and the new admission-order value;
- learning command owns trusted physical invocation, current Turn/occurrence
  binding, effective permission, receipt, reconciliation, recovery, terminal
  ToolPart, and event settlement;
- retained steering owns semantic effect/address, scope, correction, policy
  history, temporal validity, steering revision, and cut membership;
- Turn owns formal model-operation identity and atomically hosts the cut header
  and membership at admission without absorbing steering semantics;
- released-v1 request preparation renders the stored cut and applies any real
  same-cut restrictive overlay before provider lowering; and
- later Context and terminal owners receive read-only projections or exact
  commands, never the mutable authority.

The released-v1 tool registry reserves the capability identity against custom
or MCP replacement. Default Agent composition makes the routine capability
available under ordinary effective authority. No HTTP mutation endpoint, MCP
writer, background worker, second model loop, durable mode, preview-v2 path,
provider-specific steering semantics, or compatibility layer is added.

The default AI SDK carrier remains the production baseline. If implementation
touches the shared normalized request carrier used by the opt-in native adapter,
focused parity evidence must show the exact same stored cut is lowered; this
does not promote the experimental adapter or create a second runtime.

## Migration and compatibility boundary

Gate 15 adds one forward migration after the accepted Gate 14 schema and keeps
the generated current schema equivalent to a fresh database.

The migration must:

- add non-fabricated monotonic source-order and a constrained, exhaustive
  resolved-or-unavailable source temporal-context union for genuine learner
  occurrences admitted after the migration, without making timezone
  resolution a prerequisite for ordinary occurrence, Turn, or model-operation
  admission, while leaving historical occurrences ineligible to authorize a
  retroactive Gate 15 effect;
- create empty retained-steering lineage/transition state with exact foreign
  keys, closed result arms, versions, global steering revisions, temporal
  checks, source limits, frontier binding, immutability, and branch guards;
- extend the closed learning-command invocation/receipt/effect union with one
  exact retained-steering arm without changing prior command replay meaning;
- add exact one-operation steering-cut header/membership storage owned by and
  deleted with model-operation Interaction state, and mark historical model
  operations as pre-Gate without pretending they sampled with a timezone or
  policy cut that did not exist;
- preserve every accepted predecessor row and pass foreign-key/integrity checks
  before commit; and
- produce schema-equivalent fresh and Gate-14-upgrade databases apart from
  truthful historical data.

No policy is backfilled from transcript phrases, agent prompts, Session
summaries, configuration instructions, navigation state, most-recent Course,
model guesses, oracle data, or wall-clock heuristics. There is no reverse
migration promise or pre-fork preference compatibility API. Selective physical
deep deletion remains outside the baseline.

## Explicit non-goals

Gate 15 does not establish:

- educational-efficacy proof, an ideal learning-strategy selector, or a right
  for the model to override the learner secretly;
- avoidance, anxiety, motivation, ability, mastery, preference, or personality
  inference;
- Goal completion/cancellation, future attention, reminders, commitments,
  assignments, planning, scheduling, or background wakeups;
- Course-, section-, Session-, event-, condition-, or permanent scopes;
- multiple independently scoped contributions from one learner occurrence;
- a closed Tutor-action taxonomy, quiz detector, practice state machine,
  deterministic pedagogy optimizer, or general policy rule language;
- a permission grant, safety bypass, or replacement for existing external
  effect authority;
- automatic durable writes for every current instruction or cosmetic
  formatting preference;
- a universal learner event/fact/effect table, memory store, context database,
  or prompt-summary truth source;
- Gate 18's multi-authority bounded context and Session continuation;
- Gate 19's learner-record evidence/hypothesis authority;
- Gate 20's future-attention and truthful service loop; or
- Gate 22's composed terminal inspection experience.

## Closing evidence contract

Gate 15 may close only if fresh evidence demonstrates the following against the
exact implementation candidate.

### Schema, migration, and authority invariants

- fresh and Gate-14-upgrade schemas are equivalent and contain no fabricated
  retained policy or qualified historical model cuts;
- every new genuine learner occurrence receives one exact total source order,
  while compaction/fork clones reuse old identity and historical occurrences
  cannot authorize retroactive effects;
- raw SQLite attacks cannot reuse a source order or occurrence effect slot,
  forge owner/source/time/timezone/frontier facts, create a source temporal row
  with both or neither resolved/unavailable arms, branch a lineage, skip or
  reuse versions/revisions, mutate/delete history, create malformed temporal
  or result arms, attach wrong-kind receipts, or leave dangling cuts/effects;
- create, replace, retract, reinstate, authorized no-change, exact replay,
  semantic conflict, stale CAS, and two-writer behavior match the legal state
  machine;
- physical replay/conflict, trusted-envelope validation, committed semantic
  duplicate/conflict, and genuinely-new authority/live checks retain that exact
  precedence after capability revoke, source deletion, permission wait, and
  cancellation; and
- transition, receipt, ToolPart/event, acknowledgement, Turn frontier, policy
  revision, and shared frontier commit atomically under injected failure at
  every new boundary.

### Time, scope, and expiry

- `effectiveFrom`, before-boundary, exact-`validUntil`, and after-boundary
  samples prove the half-open interval without timer or policy/evidence writes;
- a preview created before expiry but formally admitted after expiry excludes
  the contribution, while a request admitted just before expiry retains its
  exact cut after the clock crosses;
- a source admitted before midnight and sampled after midnight interprets
  relative language from its source temporal context, and a host-timezone
  change between those events cannot alter the proposed boundary;
- with timezone resolution unavailable, both a root input and a promoted steer
  still admit their learner occurrence, Turn input, and formal model operation;
  the protected prompt exposes the unavailable arm without a host/UTC date,
  and the Tutor can produce a useful current-only continuation;
- a relative-time retained-policy attempt from that unavailable arm returns the
  typed no-effect result with zero policy transition, receipt effect, mutation
  slot, steering revision, or shared-frontier change; a later ordinary
  zero-write interaction still proceeds, and an authorized retraction of a
  pre-existing policy remains available;
- a regressing clock across Sessions cannot reactivate an expired contribution;
- runtime-owned timezone, offset, daylight-saving boundary, host-timezone
  change, invalid/nonexistent local time, offset mismatch, and unavailable
  timezone cases are exact and never accept model-supplied current time or
  silent UTC;
- future activation, current-only, referential/local, unbounded, cosmetic-only,
  and materially ambiguous inputs create no widened policy;
- an instruction whose boundary passes before settlement produces no retained
  effect or frontier/revision change; and
- a delayed earlier command settling after a later cut, with a regressing wall
  clock and `validUntil` behind that cut watermark, cannot create an
  unobservable policy interval.

### Source, correction, and ordering

- bounded verbatim source and optional learner-reason verification reject
  changed, invented, unavailable, or over-limit text without truncation;
- two learner inputs whose tools settle in reverse order still render by exact
  admitted-input source order;
- explicit correction/retraction creates one linear revision and changes later
  cuts, while a one-Turn current exception changes no retained state;
- after that exception, another Turn inside the interval again receives the
  retained contribution;
- an independent newer contribution does not erase an older one, and expiry of
  the newer one exposes an older still-applicable rule only when no explicit
  correction superseded it; and
- capacity overflow rejects rather than dropping, summarizing, or silently
  evicting an active contribution.

### Exact model-operation cut and released-v1 carriers

- every eligible interactive model operation, including a permitted delegated
  path, atomically owns one exact bounded cut and every internal-purpose sample
  owns none;
- correction-versus-admission and expiry-versus-admission races produce one
  transaction-ordered revision/time cut without mixed prompt state;
- exact operation replay returns the original cut after correction or expiry,
  while a new operation compiles a fresh cut;
- missing, corrupt, over-budget, wrong-operation, wrong-revision, or
  fingerprint-divergent cuts stop before provider dispatch with no unqualified
  fallback;
- the protected prompt and frozen source temporal context consume the stored
  cut, including its exact resolved or unavailable arm, while inherited
  provider-visible tool/permission resolution has no cut dependency or
  Gate-15-induced reordering in the first representation;
- the first open-semantic representation adds no fake deterministic overlay,
  cannot grant capability, and leaves hard/effective permission authoritative;
  and
- focused lowering evidence covers every shared carrier changed by the
  implementation without enabling preview-v2 or claiming two production
  runtimes.

### Learner-visible and native-provider qualification

One bounded real-provider trace through the sole released-v1 production path
must demonstrate, without treating stochastic prose as a deterministic unit
oracle:

1. an explicitly learning-wide learner instruction such as `across all my
   learning today, do not quiz me` is qualified and committed from its exact
   source without a Gate-imposed second confirmation;
2. the deterministic tool result immediately exposes the operative instruction,
   normalized expiry/timezone, and correction path in the terminal's narrow
   Gate 15 projection;
3. the Tutor continues with a useful compatible move rather than merely
   suppressing assessment or claiming the learner avoided it;
4. a fresh Session inside the interval receives the exact policy revision and
   changes the intended sample without old transcript import;
5. a more specific current request for a small assessment forms one-Turn
   exception without erasure;
6. a later Turn before expiry again receives the retained policy;
7. explicit correction or retraction changes the next sample; and
8. at expiry a fresh sample omits it with no evidence or policy-transition
   claim.

A separate negative trace begins in a Course-specific conversation with bare
or Course-local `today do not quiz me` language. It must remain current-only or
request clarification rather than silently creating cross-Course
`learning_wide` policy. A product-surface oracle commits the positive write and
then injects provider failure before any later assistant prose; the terminal
must still render the exact acknowledgement rather than generic
`<tool> completed` output or raw settlement JSON.

Deterministic request capture must prove that the contribution reached the
actual provider payload under the exact model-operation cut. The observed
Tutor response qualifies the model-mediated behavior and can reveal prompt or
tool-design defects; it does not prove general educational efficacy or validate
an avoidance detector.

### Failure, recovery, and negative reachability

- cancellation/commit races, reconciliation failure, process loss before and
  after effect commit, and startup recovery return exact success,
  interruption, or `outcome_unknown` without duplicate policy or provider
  redispatch;
- compaction, fork-history clone, genuine fork-start input, protected-effect
  revert rejection, and eligible unrelated/no-effect revert preserve exact
  occurrence/order/effect and truthful source availability;
- whole-Session deletion preserves policy/effect/receipt and source tombstone,
  removes the Interaction-owned model operation and cut without FK blockage,
  exposes only typed unavailable/minimal identity where still referenced, and
  allows a later fresh operation to compile policy anew;
- restart preserves lineages, revisions, active/expired projection, available
  cut history, acknowledgement, stable pagination, and global nondecreasing
  sample time;
- dependency/reachability checks prove that retained steering owns semantics,
  Turn only hosts atomic cut membership, learning command owns settlement, and
  request preparation only consumes the exact cut; and
- no permanent preference, Goal, Agenda, learner evidence, avoidance state,
  action taxonomy, generic policy manager, second context database, background
  daemon, HTTP/MCP writer, preview-v2 path, or shadow learning runtime becomes
  reachable, and Gate 15 does not become a prerequisite for an ordinary
  learning interaction merely because timezone resolution is unavailable.

Focused Core and OpenCode behavioral suites, migration equivalence/integrity
checks, affected package typechecks, deterministic provider-request capture,
and the bounded real-provider trace are expected. Broader suites or release
builds are required only if dependency reach or the exact candidate changes a
cross-package carrier whose claim remains unresolved. Documentation-only work
uses diff, link, formatting, and worktree checks.

## Design evidence provenance

| Evidence | Stable identity | Preserved conclusion | Deliberate difference |
| --- | --- | --- | --- |
| Product foundation, architecture, ADR-0003, ADR-0008, ADR-0009, ADR-0010, ADR-0012, and Roadmap 09 | Accepted documents linked from `docs/README.md` | Learner intent is trusted but source/evidence/inference remain separate; model-authored reversible writes use program-owned identity and transition; retained steering is scoped Tutor policy compiled at sample time | Makes only the first learning-wide finite interval and steering-only sample spine executable; does not absorb Goal, Agenda, learner record, general Context, or terminal composition. |
| Gates 8, 12, and 14 | Accepted records and implementation commits indexed by `docs/fork-ledger.md` | Exact occurrence and physical/semantic settlement, durable model/tool membership, source tombstones, shared frontier, separate authority, CAS, and atomic ToolPart/event settlement | Extends the closed unions and formal model-entry transaction; does not turn Turn, command settlement, or navigation into a generic policy owner. |
| Released-v1 request path | `packages/opencode/src/session/prompt.ts`, `session/llm/request.ts`, and `session/llm/AGENTS.md` at the contract snapshot | One shared preparation seam can render a protected exact prompt contribution before default AI SDK or opt-in native lowering | Places only the dynamic prompt/time contribution after formal admission while preserving inherited tool/permission ordering; a same-cut restrictive overlay remains conditional on a later real consumer, and the experimental adapter is not promoted. |
| Learning research cited above | Stable DOI records | Learner strategy choice is not automatically optimal, while task/anxiety/context can affect useful difficulty; concrete trade-off deserves visibility | Supplies falsification pressure only. It does not create an avoidance variable, causal diagnosis, or educational-efficacy acceptance claim. |

No oracle source or schema is copied into production. This candidate introduces
no temporary experiment or external runtime dependency.

## Independent review state

The maintainer authorized whole-Gate review automation through contract/theory,
implementation/evidence, and the separately authorized final commit. Review run
`gate15-whole-20260720-01` uses top-level reviewer task
`019f7eb2-d619-7c12-8665-5709efe62594` for both layers.

The first contract/theory pass returned `Revise` with seven
acceptance-changing findings. The same reviewer's closure pass confirmed
`G15-CT-001` through `G15-CT-007` closed and returned `Revise` solely with
`G15-CT-008`. The executor classified the new finding as a valid
derived-contract defect, repaired the owner, and the retained reviewer closed
it with an explicit `Accept` verdict for the complete contract/theory layer.

| Finding | Reviewer state | Original acceptance impact and current resolution |
| --- | --- | --- |
| `G15-CT-001` | Closed | Source order and temporal context now freeze together at learner-occurrence admission; protected prompt time is source-relative, while cut as-of is separately labelled. |
| `G15-CT-002` | Closed | Gate 15 settlement consumes the latest committed cut watermark before validating `validUntil`, with a dedicated delayed-command oracle. |
| `G15-CT-003` | Closed | Physical replay/conflict, trusted envelope, committed semantic duplicate/conflict, and genuinely-new live checks retain the predecessor order. |
| `G15-CT-004` | Closed | The positive provider trace is explicitly learning-wide; a Course-local/bare phrase is a negative current-only or clarification case. |
| `G15-CT-005` | Closed | Gate 15 owns one narrow reserved-capability terminal title/body projection plus a post-commit provider-failure product-surface oracle, without absorbing Gate 22. |
| `G15-CT-006` | Closed | Cut header/items are Interaction-owned and delete with the model operation; later reads are unavailable/not-found while independent policy survives for fresh cuts. |
| `G15-CT-007` | Closed | The first implementation is prompt-only and preserves inherited tool ordering; same-cut execution overlay remains conditional on a later real structured consumer. |
| `G15-CT-008` | Closed | Source temporal context is an exhaustive resolved/unavailable union. Unavailability never blocks ordinary Interaction/model admission, supplies no host/UTC fallback, makes interval-creating policy commands typed no-effect, preserves retraction, and has a focused zero-write continuation oracle. |

The reviewer left the production checkout unmodified throughout contract
review. The contract/theory layer is accepted with no finding open and is now
implementation authority. No implementation/evidence claim is accepted by
that verdict; the same retained reviewer remains reserved for that later layer.

The first implementation/evidence pass returned `Revise` with five
acceptance-changing findings. The executor accepted each finding against the
contract and current repository evidence, repaired the same candidate, and
added the counterexamples that had been missing. The retained reviewer's first
closure pass closed `G15-IE-001` and `G15-IE-003` through `G15-IE-005`, but kept
`G15-IE-002` open: an unsealed correction could suppress a sealed predecessor
while a lower-revision cut was inserted earlier in the same transaction. The
executor accepted that counterexample, made both application and SQLite
membership sealed and revision-bounded, and added the exact correction attack.
That second repair has not yet received a closure verdict.

| Finding | Reviewer state | Repair awaiting closure |
| --- | --- | --- |
| `G15-IE-001` | Closed | The exact `LearnerAdmission` captured before provider/plugin/file/image preparation crosses `SessionPrompt` into occurrence admission unchanged. Delayed root and promoted-steer tests prove neither instant nor resolved/unavailable timezone state is recaptured at persistence or formal operation entry. |
| `G15-IE-002` | Repaired again; awaiting closure | Every transition carries a deferred foreign key to a transaction-final commit seal. State revision can advance only after the exact receipt and applied invocation exist; the seal validates their full identity and settlement and is inserted last. Cut insertion additionally requires every transition through its claimed revision to be sealed, counts only sealed effects, and lets only a sealed successor at or below that cut revision suppress a predecessor. A two-stage direct-SQL oracle rejects both a cut through an unsealed current revision and a lower-revision cut hidden by a later unsealed correction, then completes each surrounding effect transaction legally. |
| `G15-IE-003` | Closed | Compaction, fork, revert, recovery, server, and shared Session fixtures reuse the stored learner-message instant when constructing the admission arm. Focused compaction, fork-history/fork-start, protected-revert, fork-survival, deletion, and restart oracles reach and pass the accepted lifecycle behavior. |
| `G15-IE-004` | Closed | A committed semantic predecessor is exercised across an already-waiting permission, cancellation, capability absence/revocation, source tombstone, explicit interruption, and startup recovery. Duplicate/conflict reconciliation remains before genuinely-new authority and live-state checks. |
| `G15-IE-005` | Closed | Retained-specific fault injection aborts each new transition, acknowledgement, consumed/resulting Turn frontier, shared frontier, receipt, applied settlement, policy revision, commit seal, ToolPart projection, event sequence, and durable Part-event boundary and proves the exact pre-command snapshot remains. |

## Implementation/evidence candidate

This section records the exact repaired candidate resubmitted to the retained
reviewer. It is executor evidence, not an accepted implementation claim, until
that reviewer returns an implementation/evidence closure verdict.

### Candidate realization

- `packages/core/src/retained-steering.ts` owns policy identity, the linear
  transition state machine, source-grounded preparation, bounded reads,
  temporal applicability, global steering revision, active selection, exact
  cut compilation, cut integrity, and protected rendering. Its adjacent
  `retained-steering/` modules own the closed schema, stable history cursor,
  physical tables, and SQLite constraints. It is neither a generic policy
  manager nor a Session-memory abstraction.
- Every new genuine learner occurrence allocates one immutable total source
  order and stores exactly one program-owned temporal arm: resolved source
  instant/IANA timezone/offset, or typed `timezone_unavailable`. Admission and
  ordinary Tutor continuation remain legal in the unavailable arm. Historical
  predecessor occurrences migrate to unavailable temporal state without
  fabricating a timezone or retroactive steering authority. Interactive root
  and steer requests capture this arm once before fallible preparation and
  carry that exact admission object and instant through Session persistence,
  occurrence admission, Turn input, and formal model operation.
- The Gate 8 learning-command substrate gains only the reserved
  `update_retained_learning_steering` capability. Physical replay/conflict and
  trusted-envelope checks precede committed semantic duplicate/conflict;
  permission, cancellation, current source, temporal availability, and live
  head checks run only for a genuinely new effect. Create, replace, retract,
  reinstate, exact no-change, stale, conflict, failure reconciliation, and the
  learner-visible acknowledgement settle through the existing atomic
  invocation/receipt/ToolPart/event boundary. A transition-to-seal deferred
  foreign key makes a missing final seal fail the transaction at commit; state
  revision advances only after the exact receipt and applied invocation exist,
  and the final immutable seal validates their complete effect identity and
  settlement. Cut insertion separately requires a complete sealed prefix
  through its claimed steering revision and validates exact semantic membership
  over only sealed transitions. A successor suppresses its predecessor only
  when that successor is sealed and its revision is within the cut, so a later
  in-transaction correction cannot rewrite an earlier cut.
- Released-v1 formal model admission reads a fresh trusted clock inside its
  database transaction and compiles the cut there; callers cannot submit a
  preview or substitute clock. The cut is stored on the Interaction-owned model
  operation, ordered by immutable learner source order, fingerprinted into the
  effective context identity, replayed exactly, and deleted with that operation
  while its independent policy effect survives. The global nondecreasing cut
  watermark also floors later retained-command settlement.
- The protected request contribution consumes only the stored cut. It renders
  a resolved source-relative temporal context or a typed unavailable arm,
  never the removed pre-admission host date. First-representation tool
  discovery and permission ordering remain unchanged; internal-purpose model
  operations receive no contribution, and no structured execution overlay or
  second runtime is introduced.
- The released-v1 terminal renderer gives this one reserved capability a narrow
  acknowledgement title/body projection. Provider failure after a committed
  write is persisted as an error finish while the already rendered
  acknowledgement and exact policy effect remain visible and recoverable.
- The real provider trace exposed one genuine carrier defect: OpenAI attaches
  top-level observation metadata to a pending ToolPart. Invocation admission
  had compared that provider metadata with the program-owned physical identity
  and incorrectly rejected the tool before reservation. The repaired runtime
  projects only the trusted invocation fields for identity comparison while
  retaining exact message, Session, part, call, tool, and pending-state checks;
  a focused regression covers that boundary.
- Migration `20260720113159_gate15_retained_steering` upgrades the accepted Gate
  14 graph in one step, rebuilds affected occurrence, invocation, receipt, and
  model-operation tables with the new closed arms, creates the commit-seal
  authority, and installs the same constraint set as a fresh database. It
  creates no policy, effect, source claim, or historical model cut during
  upgrade.

### Executor evidence

| Claim boundary | Fresh evidence against this candidate |
| --- | --- |
| Source temporal union, immutable source order, legal transition graph, transaction-final effect integrity, exact intervals, cut ordering/fingerprints, concurrency, raw-SQL defenses, deletion, restart, and nondecreasing time | From `packages/core`, `bun test test/turn.test.ts` passed **28 tests, 0 failures, 269 assertions**. It includes root and promoted-steer resolved/unavailable admission, midnight and timezone-change interpretation, unavailable zero-write continuation and retraction, create/replace/retract/reinstate/no-change/replay/conflict/stale/two-writer behavior, reverse settlement/source order, delayed settlement after a later cut with a regressing clock, cut corruption fail-closed behavior, whole-Session deletion, file-backed restart, expiry, pagination, and raw owner/source/time/result/history attacks. Its direct-SQL oracle proves a transition/revision cannot commit without its receipt, applied invocation, and final seal; rejects a cut through an unsealed current revision with `turn_model_retained_steering_cut_snapshot_invalid`; then begins from a sealed operative head, writes its exact unsealed correction receipt/applied invocation while state remains at the predecessor revision, and proves a correctly hashed empty cut through that predecessor fails with `turn_model_retained_steering_cut_item_invalid` before the correction is advanced, sealed, and legally committed. |
| Fresh versus Gate-14-upgrade schema equivalence and migration integrity | From `packages/core`, `bun test test/database-migration.test.ts` passed **28 tests, 0 failures, 173 assertions**; `bun script/migration.ts --check` reported no schema changes and generated the full schema successfully in an isolated temporary directory. The Gate 15 case compares the upgraded and fresh schemas, verifies the commit-seal and other foreign keys, checks the exhaustive source-time arm, and proves no fabricated policy or cut. |
| Settlement-floor composition with the accepted learning-command substrate | From `packages/core`, `bun test test/learning-command-settlement.test.ts` passed **2 tests, 0 failures, 50 assertions**. The retained-specific Turn suite separately proves that the latest committed cut watermark participates in final `validUntil` validation. |
| Physical/semantic reconciliation order, permission and cancellation races, capability revocation, source loss, exact terminal state, provider metadata, recovery, and retained atomicity | From `packages/opencode`, `bun test test/learning-command/runtime.test.ts` passed **18 tests, 0 failures, 240 assertions**. One oracle holds a real duplicate in permission wait, commits its predecessor, cancels and releases the waiter, then proves `already_applied` also survives a missing/revoked capability, source tombstone, explicit interruption, and startup recovery without another permission request or transition. The provider-observation-metadata regression proves that untrusted top-level metadata cannot alter or collide with trusted invocation identity. Twelve retained-specific injected aborts prove rollback at every new effect, acknowledgement, frontier, receipt, settlement, revision, seal, Part, and event boundary. |
| Actual released-v1 cut carrier and provider request | From `packages/opencode`, `bun test test/session/llm.test.ts` passed **30 tests, 0 failures, 96 assertions** and `bun test test/session/llm-request.test.ts` passed **15 tests, 0 failures, 80 assertions**. The captured OpenAI Responses payload contains the exact protected cut once; the unavailable arm contains no host/UTC-derived date, and changed cuts do not alter inherited tool visibility. |
| Formal admission timing, root/steer source freezing, unavailable continuation, post-commit failure, and useful continuation | From `packages/opencode`, `bun test test/session/prompt.test.ts` passed **9 tests, 0 failures, 88 assertions**. A fallible MCP preparation hook advances time by five seconds before persistence and proves the occurrence retains the original instant and timezone. A second integrated root/promoted-steer case crosses midnight, changes host timezone, captures an unavailable steer arm before later resolution recovers, and proves ordinary formal admission/provider continuation with no fallback. The suite also verifies the actual next payload after a retained write and injects a later provider failure without losing the acknowledgement or effect. |
| Compaction, fork, revert, deletion, and restart lifecycle | Focused `packages/opencode` runs passed the exact Gate 15 seams: the relevant compaction case passed **1 test, 0 failures, 8 assertions**; three protected/no-effect/fork-survival revert cases passed **3 tests, 0 failures, 12 assertions**; and the fork-history clone and genuine fork-start cases each passed separately with **1 test, 0 failures, 8 assertions**. Their helpers now construct admission from the stored source-message instant. Whole-Session deletion plus fresh recompilation and file-backed restart remain covered by the passing Core Turn suite; restart reconciliation remains covered by the passing runtime suite. These focused claims do not misclassify unrelated whole-suite observations: the full compaction run had one 272 ms versus 250 ms abort-timing failure, the full revert run later hit two existing five-second database-ownership timeouts, and the separate source-lifecycle-lock fork case timed out without a Gate 15 assertion failure. Discarded parallel runs in which two Bun processes shared one temporary `LearnerHome`, including one attempted repaired-candidate runtime/prompt rerun, are not evidence; both suites then passed separately in serial. |
| Failure persistence, protected prompt support, and terminal projection | From `packages/opencode`, `bun test test/session/processor-effect.test.ts` passed **27 tests, 0 failures, 140 assertions**; `bun test test/session/system.test.ts` passed **6 tests, 0 failures, 38 assertions**; and `bun test test/cli/run/entry.body.test.ts` passed **15 tests, 0 failures, 29 assertions**. |
| Affected TypeScript boundaries | `bun run typecheck` passed independently from both `packages/core` and `packages/opencode`. |

### Bounded real-provider qualification

Maintainer-authorized run `gate15-openai-oauth-real-model-01` passed on
2026-07-20 through the inherited OpenAI OAuth provider and
`openai/gpt-5.5`. The guarded runner at
`packages/opencode/script/gate15-real-model.ts` used isolated database and XDG
state, a 512-output-token ceiling, 60-second per-sample timeout, and eleven
bounded samples. It made no credential copy and removed the isolated state on
completion.

The negative Course-local request made zero retained-command calls, created no
policy, and continued useful algebra teaching. An explicitly learning-wide
request committed one finite policy at the exact five-minute source-relative
boundary and produced the exact inline and final acknowledgement. Fresh
Sessions received the same transition through new operation-owned cuts; one
more-specific current-Turn request allowed exactly one small check without a
policy write. A later explicit correction kept the same policy lineage,
advanced it from version 1 to version 2 with the exact predecessor, and changed
the following compatible Tutor move. At exact expiry and in a fresh later
Session, active membership was empty and history projected the head as
`operative_expired` without a timer or write.

The secret-free 6,500-byte result projection has SHA-256
`81753B3E4597EB5721AB666D23D851C289C0DC1824E22C6D085EFEBB6EB5F897`.
Stderr was empty with SHA-256
`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`;
access- and refresh-credential canaries were absent. The trace qualifies the
specific prompt/tool/product carriers and observed compatible behavior. It
does not establish general educational efficacy or an avoidance diagnosis.
This trace predates the implementation-review repairs and is not represented as
a rerun against the repaired checkout. Those repairs preserve its provider/tool
semantics; their changed admission and atomicity seams are instead qualified by
the fresh deterministic evidence above. The hash and summary do not replace
the deleted isolated run state or independently reconstruct its external
timeout wrapper.

No root-level suite, unrelated package suite, release build, packaged binary,
HTTP/MCP writer, preview-v2 path, or background runtime is claimed. The
remaining candidate checks are documentation links/whitespace, exact checkout
binding, and the retained reviewer's implementation/evidence closure pass.
