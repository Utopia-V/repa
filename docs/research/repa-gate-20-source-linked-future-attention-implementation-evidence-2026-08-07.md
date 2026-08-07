# Gate 20 source-linked future attention implementation/evidence record

Status: **implementation/evidence accepted and integrated into local `main`;
direct `origin/main` publication is authorized and pending.** Gate 20's
contract/theory and
implementation/evidence layers are both accepted under whole-Gate review run
`G20-WG-20260806-019fd69a-01`. Retained reviewer task
`019fd773-84c3-7841-9fc5-45f1b18d4a9f` closed `G20-CR-001..010` and
`G20-IR-001..011`, returned final `Accept`, and reported no owner blocker or
material unknown. A separately authorized direct integration subsequently
fast-forwarded the accepted candidate into `main`. Exact implementation commit
`1f92169840559b63eb8f96c31a67985c814a86f0` records the accepted candidate;
local `main` includes it through docs-only integration/status successors. No
release, credentialed provider call, Gate 21 entry, or Gate 21A entry follows.

Date: 2026-08-07
Accepted: 2026-08-08

## Exact authority and candidate binding

- implementation base and acceptance-time `HEAD`, `main`, and `origin/main`:
  `3317525aeb242dfcf3cec49c0dd627cd38ee8144`;
- accepted Gate 20 contract/theory SHA-256:
  `0BE73ABB75D0957273FF5C5F986735491C1EEAF38072B9D7A82020073A318A7F`;
- whole-Gate review run: `G20-WG-20260806-019fd69a-01`;
- retained independent reviewer task:
  `019fd773-84c3-7841-9fc5-45f1b18d4a9f`;
- contract/theory disposition: **Accept**, with `G20-CR-001..010` closed and
  no contract-level owner blocker;
- implementation/evidence disposition: **Accept**, with `G20-IR-001..011`
  closed, no new acceptance-changing finding, and no owner blocker or execution
  failure remaining;
- accepted pre-integration raw working-tree production/test manifest: **71 files / 8,314
  canonical manifest bytes**, SHA-256
  `1507DAF44F5B48A430C2491694C5A4547B9E9B2D5CF3D4D2E1A3190B995C6CB0`;
  this replaces the superseded 71-file / 8,314-byte second closure manifest
  `29338349F95579E70119E726A5145D433E01AAC3F6D04618639C935F1221DC2A`,
  68-file / 7,942-byte first closure manifest
  `4E2ED6F94F8D2DB602FCFD785BEA75578E3DA714F73627F6F7E160925EB6FC5D`
  and 52-file / 6,022-byte first-pass manifest
  `3BB19A5103EBC5F5A4CB1ACEFEFE16933B3B2FF0661666A4E6C6D9851C73A026`;
- committed LF Git-tree/blob production/test manifest at
  `1f92169840559b63eb8f96c31a67985c814a86f0`: **71 files / 8,314 canonical
  manifest bytes**, SHA-256
  `1F185B1944A5B89AFE7A8FBBEEBE2B0165A86AB4D3C3BFF97BF562923AD5D3F6`;
- fresh `core.autocrlf=true` CRLF checkout production/test manifest: **71 files
  / 8,314 canonical manifest bytes**, SHA-256
  `CB5114543DB5419DD5C338D57CEE995FD8D65651843E5322CB1E82C6FDEA5032`;
- accepted review-record SHA-256 for this file before status-only
  reconciliation:
  `E86AA8B386CF613F0AF5E7CEE7D7844ED893944D0B36AE4D63450192FDE3DE00`;
- accepted implementation commit:
  `1f92169840559b63eb8f96c31a67985c814a86f0`;
  and
- excluded pre-existing maintainer change: `AGENTS.md`.

Each production/test manifest contains the same 71 `packages/**` paths and no
documentation or `AGENTS.md` file. Its canonical form sorts repository-relative
forward-slash paths ordinally and emits one
`path<TAB>actual-file-byte-length<TAB>uppercase-file-SHA-256<LF>` line per file,
encoded as UTF-8 without BOM and with a final LF. The retained reviewer
independently reconstructed and accepted the pre-integration raw working-tree
path set, manifest, and pre-reconciliation evidence-record hash.

Integration under the system-owned `core.autocrlf=true` setting stores the LF
Git-tree projection above and expands it to the CRLF checkout projection above.
All 71 checkout files are valid UTF-8; every checkout/blob byte difference is
CRLF versus LF, CRLF-to-LF comparison yields zero content differences, and no
lone CR exists. These are distinct byte identities of one semantically
unchanged source projection. The former claim that commit `1f9216984` was
byte-identical to raw manifest `1507DAF4...` is withdrawn. Retained reviewer
integration finding `G20-INT-001` classified this as a provenance/status repair,
not an acceptance-changing implementation drift; `G20-CR-001..010` and
`G20-IR-001..011` remain closed.

The working tree retained the pre-existing maintainer-owned `AGENTS.md`
modification throughout implementation and review. The executor did not edit,
revert, stage, or include that path. At acceptance the Git index remained empty
and no branch movement, commit, merge, push, release, credential use, paid call,
or external durable effect had occurred. After separate publication authority,
the accepted candidate was committed at the exact implementation commit above
and then fast-forwarded into local `main` through docs-only integration/status
successors. Direct publication to `origin/main` is authorized and pending;
`AGENTS.md` remains outside every Gate 20 commit.

## First implementation/evidence review disposition

The retained reviewer returned **Revise** for the implementation/evidence
layer. Contract/theory remains accepted; no finding requires a maintainer-owned
product decision or reopens `G20-CR-001..010`. The open implementation and
evidence findings are:

- `G20-IR-001` — a late invalid phase-one member may leave frontier, receipt,
  and preparing change-set residue that consumes the occurrence address;
- `G20-IR-002` — already-dismissed `no_effect` carries a receipt into Gate 8's
  receipt-free `no_change` physical settlement;
- `G20-IR-003` — `explicit_exact` is not restricted to the exact current
  root-learner interpretation that authorizes it;
- `G20-IR-004` — non-learner complete-source order can cite an unrelated
  learner occurrence outside the source's Session/root lineage;
- `G20-IR-005` — empty or internal-control-only Tool output can be accepted as
  a complete service source;
- `G20-IR-006` — live cancellation can bypass or interrupt finalization and
  strand a claim group pending until restart;
- `G20-IR-007` — Session deletion can remove the live model row needed by
  recovery even though the exact model tombstone remains;
- `G20-IR-008` — retained carriers have no durable catch-up path when a
  finalization commits while they are detached;
- `G20-IR-009` — carrier prose says every `not_served` concern remains open,
  which is false for a `stale_head` member;
- `G20-IR-010` — the retained temporal source expression is not checked
  against the normalized instant and tagged temporal basis; and
- `G20-IR-011` — the published maximum-value oracle uses unattainable unsafe
  integers and therefore is not the required schema-generated maximum-valid
  contribution.

The first-pass focused suites reproduced their recorded green results, but they
did not exercise these counterexamples. Those first-pass completion, manifest,
and evidence claims are not relied on for closure. The first repair candidate
below added a regression for every reported impact, but the retained reviewer
falsified its reconnect and temporal-parser coverage. The second repair closed
the parser and most reconnect paths, but the reviewer then found one rejected
TUI owner read could still be abandoned. Only that reviewer can close the
surviving finding and layer.

## First executor repair-closure delta

The executor accepted all eleven findings. The repair changes stay inside the
accepted contract/theory boundary; none requires a product choice or weakens
Gate 8 physical settlement, Gate 18 context limits, occurrence identity, or
the root/delegated authority split.

| Finding | Production repair | Causal closure oracle |
| --- | --- | --- |
| `G20-IR-001` | Phase-one domain materialization now runs in a nested database transaction. A late `InvalidCommandError` rolls back frontier advance, receipt, preparing change set, concerns, transitions, service receipts, and claims before the outer transaction terminally settles only the physical invocation error. | The delayed-service counterexample reaches the late `too_early` validation after admission and policy allow, then proves the frontier is unchanged, all three domain/receipt counts are zero, and exact physical replay returns the stored error. The broader stale/multi-operation case still proves no losing successor or partial change. |
| `G20-IR-002` | An exact redundant dismiss is decided before domain materialization and returns a receipt-free `no_change` settlement. `no_change` carries neither `receiptID` nor `effectID`, matching the Gate 8 ledger invariant. | The lifecycle test dismisses an already-dismissed exact head, asserts `no_effect`, absence of both IDs and any LearningCommand receipt, and byte/shape-identical physical replay. |
| `G20-IR-003` | `explicit_exact` is legal only when a root invocation's exact current `interpreted_learner_request` source selects that endpoint. Tutor-initiated and delegated creation must use the Course working-selection arm; delegated correction cannot manufacture exact learner selection. | The Core authority test rejects Tutor-authored `explicit_exact` before invocation insertion. Runtime fixtures prove the root learner arm and delegated `observed_working` arm separately. |
| `G20-IR-004` | A learner-first witness for Assistant, Tool, or ChildResult service is now checked against the complete source's exact root model cut: Session, Turn, causal learner occurrence, admission chronology, and delegated return lineage where applicable. | The complete-source test retains same-lineage positives; a focused witness test rejects a chronologically plausible occurrence from another root lineage and accepts only the exact current learner occurrence for that service opportunity. |
| `G20-IR-005` | Every admitted tool candidate now has a program-owned `learner_usable | internal_control` service-source classification. V20 defaults historical candidates to `internal_control`; constraints reject out-of-domain values. Tool service additionally requires a completed Part with non-empty learner-usable output and excludes FutureAttention/finalization/interrupt control tools. | Core tests reject empty output, explicit internal-control output, and an out-of-domain persisted classification, while the ordinary completed learner-usable Tool result remains accepted. V20 migration trigger tests reject illegal classifications on fresh and upgraded schemas. |
| `G20-IR-006` | Exact-A1 claim finalization is an uninterruptible `ensuring` action around the provider-loop operation. It runs after interruption cleanup has terminalized the same Assistant and Parts, so cancellation cannot bypass or interrupt the terminal `not_served` write. | A released-v1 prompt trace blocks the post-commit `ToolSettled` listener after the claim Tool Part is durable, issues a live learner interrupt before normal finalization, and proves—in the same running process, without restart—one `presentation_uncommitted` receipt, positive eligible Text bytes, no pending group, and an open concern. |
| `G20-IR-007` | Completion observation falls back from a missing live model/tool/source row to the exact `TurnUnavailable` model/tool/source tombstones retained by supported Session deletion. Both observation and finalization revalidate the same bound identities. | The deletion regression admits a pending claim, terminalizes its exact model/tool facts, deletes the Session tree, proves `TurnLifecycle.lookup` returns the exact source-unavailable tombstones, and finalizes once as `presentation_unavailable`; the concern remains open and pending groups become empty. |
| `G20-IR-008` | A public paged owner endpoint reads the append-only `future_attention.finalized.1` durable aggregate without requiring a still-live Session. TUI initial sync, ACP load/resume, direct interactive run, noninteractive run, and attach/local-server catch up from sequence `-1` in bounded pages and share receipt-ID dedupe with live delivery. No path rewrites the original Tool Part. | Real generated-SDK → HttpApi → SQLite evidence proves two-page detached history. TUI and ACP tests exercise pagination plus live/history overlap and dedupe; ACP load/resume tests prove both wiring points; direct interactive transport checks exact cursors; a real noninteractive attach subprocess pages 101 detached receipts and emits each once before the new Turn begins. This first delta did not yet prove catch-up after every physical reconnect or retry after an ACP client-update failure. |
| `G20-IR-009` | All retained carriers use one Core finalization presenter. `stale_head` now says the claimed head changed and directs the learner to current FutureAttention state; it never asserts that the superseded concern remains open. | A Core owner-local pure oracle fixes the exact truthful wording. Direct-run session data proves the typed receipt is appended once, the original Tool commit is unchanged, raw IDs/reasons stay hidden from prose, and the categorical old sentence is absent; other carriers only test shared-result wiring. |
| `G20-IR-010` | Civil-time normalization parses canonical exact offset/Z source expressions and requires their denoted instant and offset to equal the independently normalized fixed-offset value. Descriptive or named-zone expressions stay legal under their tagged basis; recognized contradictory exact expressions fail admission. | The temporal suite accepts the exact `+05:30` fixed-offset case, rejects the same expression paired with offset zero, retains IANA release provenance, and covers source-zone unavailable, ambiguous, nonexistent, early-service, and the then-recognized malformed-expression branches. This first delta did not recognize arbitrary fractional precision or preserve the unknown meaning of `-00:00`. |
| `G20-IR-011` | The bound oracle now creates its maximum through real schema/domain admission using `Number.MAX_SAFE_INTEGER`, a 768-byte purpose, maximum excerpt and IANA name, maximum legal versions, and optional order. It deletes the exact source before Context compilation so the actual maximum full semantic value includes `source_unavailable`; no forged object participates. | The admitted maximum is exactly the sole Context semantic value at **1,877 bytes**, with **171 bytes** headroom under 2,048. Removing optional order measures 1,815 bytes; one-byte-over purpose is rejected. Whole-cut zero/minimum/maximum/multiple costs are measured from real prepared cuts. |

The V20 migration repair deliberately uses additive columns plus versioned
insert/update triggers for candidate classification and unavailable-model
terminal shape. It does not rebuild referenced Turn tables. Fresh schema,
frozen V16/V17/V18/V19 upgrades, and the staged V13→V14→V15→V16 constructors
all converge on the same current manifest. Full Drizzle generation required a
larger Node stack at the current schema size; the checked migration script now
invokes the pinned generator with `--stack-size=8192`, and both generation and
`--check` complete without source drift.

## Retained closure disposition and second executor delta

The retained reviewer independently closed `G20-IR-001..007`, `G20-IR-009`,
and `G20-IR-011`. It kept two High findings open:

- `G20-IR-008`: TUI and ACP caught up on initial attach/load/resume but not on
  every physical SSE reconnect. ACP also marked a receipt seen before its two
  client updates were acknowledged, so either update failure could permanently
  suppress a durable receipt or strand a pending ACP tool call.
- `G20-IR-010`: exact RFC-3339-shaped expressions with arbitrary fractional
  precision could fall through as descriptive, and `-00:00` was collapsed into
  a known fixed offset of zero.

The second executor delta binds reconnect recovery to the existing
`server.connected` first frame emitted by every physical global SSE connection.
The server registers its GlobalBus listener eagerly before that epoch, closing
the producer-side page/live gap. TUI retains the exact directory for every
fully synced Session; TUI and ACP run one owner read at a time per exact
directory/Session key and queue a new generation when another reconnect or
load/resume request arrives during an in-flight scan. Each generation restarts
at sequence `-1`; history/live duplicates reconcile by receipt identity. ACP
tracks `absent → pending acknowledged → completed acknowledged` and advances a
phase only after the corresponding `sessionUpdate` Promise resolves. A failed
first update retries both phases; a failed second update retries only completion.
This is stable-identity, acknowledgement-based redelivery, not a claim that an
unacknowledged network transport can provide exactly-once delivery.

The civil-time parser now recognizes lowercase `t/z` and arbitrary nonempty
fractional seconds. Fractions beyond the stored millisecond precision are legal
only when their discarded suffix is all zero; otherwise the expression is
truthfully unrepresentable. Exact offsets must match the independently resolved
instant and basis, malformed compact exact-looking tokens fail closed, and
RFC-3339 `-00:00` is rejected because an unknown offset cannot become a known
fixed-zero basis. Full descriptive expressions remain descriptive rather than
being scanned for embedded tokens.

## Second retained closure disposition and third executor delta

The retained reviewer independently closed `G20-IR-010` and kept every earlier
closure intact. It narrowed the sole remaining High finding, `G20-IR-008`, to
one TUI failure window: reconnect catch-up was generation-queued on success, but
its event handler swallowed a rejected owner read while retaining the Session's
full-sync marker. With no further reconnect epoch, ordinary Session sync then
short-circuited and the durable receipt could remain absent for the rest of the
TUI lifetime. Contract/theory remained accepted and no owner blocker appeared.

The third executor delta gives each retained exact Session/directory a separate
reconnect-recovery generation and one recovery task. A physical reconnect queues
the generation; the task retries a rejected paged owner read after bounded delay
without requiring another SSE epoch. An epoch arriving during the attempt still
queues a fresh scan, and the underlying owner-read task remains single-flight,
so recovery never overlaps itself. The task stops when the exact retained
Session/directory mapping is deleted or rebound, or when the TUI provider is
disposed. Session deletion removes the retained mapping explicitly.

The causal regression fully syncs a Session, emits exactly one
`server.connected`, makes the first reconnect owner read reject, confirms an
ordinary `sync(session)` remains a no-op under the full-sync marker, and then
observes the same recovery task fetch and publish the durable receipt without a
second connection epoch. It asserts two reads of the exact retained directory,
maximum read concurrency one, and one stored receipt. The complete TUI sync file
now passes **17 tests / 65 expectations** and the TUI typecheck remains green.

## Final independent acceptance

On 2026-08-08 the retained reviewer returned **Accept** for the complete
implementation/evidence layer. It independently reproduced the exact
rejected-read recovery regression (**1 test / 5 expectations**) and closed
`G20-IR-008`: after one physical reconnect and one rejected owner read, the
pending recovery generation retried without another connection epoch, retained
the exact Session/directory, kept maximum read concurrency at one, and published
one durable receipt. The reviewer found no neighboring generation,
single-flight, directory, deletion/rebind, provider-disposal, or evidence
regression.

`G20-IR-001..011` are all closed. The reviewer reported no new
acceptance-changing finding, material unknown, owner blocker, contract
contradiction, or checkout drift. It independently reconstructed the exact
accepted 71-file package manifest and confirmed the accepted contract and
pre-reconciliation implementation/evidence record hashes. Both Gate 20 review
layers are therefore accepted. The separately authorized direct mainline
integration is recorded below.

## Implemented production boundary

### One native FutureAttention authority

Core now owns a separate `FutureAttention` authority. It does not reuse the
inherited todo tool, a Session-local checklist, Goal, Assignment, planning,
learner evidence, or one universal Agenda record. A concern stores one bounded
purpose, an Agent-authored fallible creation relation, an exact Course
membership target and selection witness, normalized `notBefore`, tagged civil-
time provenance, service timing, and an optional interaction-order constraint.

The semantic effect address is exactly:

```text
runtime-bound learner occurrence
+ slot "future_attention_change_set"
```

One address admits one canonical one-to-eight-operation change set. Exact
physical replay terminates before semantic interpretation and returns the
stored Gate 8 result. A physically new invocation at the same address returns
`already_applied` only for the identical canonical change set; changed
operations, sources, claims, order, or rationales conflict. Same-target
concerns remain distinct only when created at distinct learner occurrences.

The closed operation union implements:

- create;
- replace with `open`, `dismissed_by_mutation`, `carry_served`,
  `carry_dismissed`, `serve_complete_source`, or
  `serve_current_assistant_when_complete` successor disposition;
- direct serve from one legal complete source or one completion-conditioned
  current Assistant;
- dismiss; and
- reopen.

Payload corrections never mutate a concern in place. Replace atomically
supersedes one exact current head and creates one stable successor. Terminal
carry is explicit: a served or dismissed correction cannot silently reopen a
successor. A replacement may target its program-created successor only through
the two closed service-producing successor arms; there is no general local-ID
language or workflow executor.

### Agent-authored relations and program-owned facts

The stored source/mutation relation union separates:

- `interpreted_learner_request`;
- `tutor_initiated`;
- `interpreted_learner_direction`; and
- `agent_correction`.

The ordinary Agent authors those fallible semantic relations. Runtime code
proves only the exact occurrence, excerpt bytes/hash, current owner-read head,
root/delegated lineage, capability membership, permission settlement, target
status, chronology, and legal transition. Quoted, hypothetical, negated, or
redirected language is not mechanically upgraded into learner assent.

Learner-direction, learner-attributed creation, direct service, and every
service-producing successor arm are root-only. A delegated Agent may create a
Tutor-initiated concern and may correct its own interpretation only through an
exact delegated `update_future_attention` capability. It cannot borrow the
root learner source, claim learner direction, or self-serve. A conflicting
current learner direction must be honored or clarified rather than silently
overridden by delegated correction.

### Tagged civil-time computation

The shared civil-time module extracts the mature Goal computation without
merging Goal and FutureAttention identity. Exact normalized time provenance is
a tagged union:

- `iana(name, releaseID)` for a named IANA zone resolved against the pinned
  release; or
- `fixed_offset(offsetMinutes)` for an exact offset with no fabricated IANA
  identity or tzdb release.

FutureAttention owns its own temporal input and stored value. Source-zone,
explicit named-zone, fixed-offset, unavailable-source-zone, ambiguous local
time, nonexistent local time, and both service-timing variants pass through
the same closed computation. The tested IANA release is
`iana-tzdb-2026c`; an exact `+05:30` source remains fixed offset rather than
being relabelled as a named zone.

### Version 20 schema and immutable history

Migration `20260806181133_gate20_future_attention` advances the native schema
from V19 to V20. It adds ten domain tables:

- `future_attention_disposition`;
- `future_attention_capability_issue`;
- `future_attention_capability_settlement`;
- `future_attention_change_set`;
- `future_attention_concern`;
- `future_attention_transition`;
- `future_attention_service_receipt`;
- `future_attention_claim_group`;
- `future_attention_claim_member`; and
- `future_attention_claim_finalization`.

It also adds the program-owned Tool service-source classification and the
terminal state/time fields required on unavailable model tombstones. Existing
rows receive conservative historical defaults. Versioned insert/update
triggers enforce the new finite unions and terminal model shape without
rebuilding referenced Turn tables or manufacturing semantic qualification.

The generated schema, `schema.json`, migration registry, V20 schema extras,
and strict trigger decoder derive from one generated definition. Constraints
and triggers cover branded identity shape, one semantic slot per occurrence,
one current concern head, contiguous immutable transitions, predecessor/
successor symmetry, applied Gate 8 receipt linkage, source/target chronology,
claim-group/member binding, one terminal group finalization, and exact
transition/service-receipt correspondence. Natural-language interpretation
remains outside triggers.

Fresh install and frozen Gate 19 upgrade converge on the current manifest.
Frozen Gate 18 and Gate 19 Learning Context cuts remain byte-decodable; the
migration creates no concern from historical Session text and rewrites no old
cut. The manual frozen-v12/v13 current-parity paths and the frozen-v16/v17
upgrade paths now advance through V20 rather than stopping at an earlier
current schema.

### Truthful complete service

Service accepts only one exact complete source from the closed union:

- current complete learner occurrence;
- committed eligible output from a complete root Assistant presentation;
- completed tool result; or
- complete child result returned to the root boundary.

Each service stores an immutable source locator, completion time/order where
applicable, content or presentation fingerprint, and an Agent-authored
purpose-specific alignment rationale. Optional learner-first order requires an
exact current learner-response witness. A partial provider delta, reasoning,
tool-control text, incomplete Part, interrupted Assistant, failed child,
uncommitted presentation, cross-lineage source, stale target, or chronology-
invalid old source cannot serve.

For Tool results, completion alone is insufficient: the bound candidate must
be classified `learner_usable`, its terminal output must be non-empty, and it
must not be a FutureAttention, finalization, interrupt, or other internal
control operation. The classification is runtime-owned and persists with the
exact candidate; the model cannot promote an internal Tool into service.

Creation source availability and service-receipt source availability are
separate owner-read facts. Session deletion leaves the independently useful
concern and its terminal disposition intact. A learner occurrence or Turn
tombstone changes the corresponding projection to
`source_unavailable/source_deleted`; no transcript, explanation, tool result,
or unrelated body is reconstructed. A `carry_served` correction validates the
exact prior service receipt. It may carry a deleted source only through that
immutable receipt and continues to display it as unavailable; a live but
mismatched/unreproducible presentation is rejected rather than silently
reinterpreted.

### Immutable admission and append-only completion finalization

A `current_assistant_when_complete` operation has two fixed atomic phases:

1. Gate 8 admits and terminally settles the physical command. The immutable
   result records the concern or corrected successor, claim-group reference,
   and `pending` as the historical state at that admission cut.
2. FutureAttention later observes the exact bound Assistant presentation and
   appends one `served | not_served` group-finalization receipt/event. All
   member transitions and the group receipt commit together, or no member is
   served and one terminal `not_served` receipt records exact reasons.

Exact physical replay before or after phase two is byte-identical, performs no
domain refresh, and never rewrites the terminal Tool Part. Current truth comes
from the append-only finalization event/receipt, `future_attention_read`, or a
physically new semantic duplicate. The unique group constraint makes repeated
or concurrent finalization return the same domain receipt without a second
service transition or event.

The completion identity is the exact root Assistant message/model operation
that owns the local claim Tool Part. Finalization waits for that model
operation, every local terminal Part, the committed same-message presentation,
and the final Assistant-level structured projection. Eligible output includes
non-synthetic learner-visible Text Parts and the final structured value only;
reasoning, tool results, patches, provider deltas, and later Assistant messages
are excluded.

`SessionPrompt` finalizes at the released-v1 cut after the exact A1
presentation and final prompt-level projection commit but before admitting a
post-tool A2. Startup recovery runs after Turn recovery has reconciled durable
model, tool, message, and Part facts. It serves a durably completed A1 once,
settles an uncommitted/failed A1 `not_served`, and never guesses the Turn's last
Assistant.

The same finalizer is installed as an uninterruptible `ensuring` action around
each exact Assistant operation. A live interrupt therefore first commits the
operation's aborted/uncommitted presentation facts and then terminally
finalizes every admitted local claim before control returns; restart is not
required. If supported Session deletion removes the live model/tool rows before
recovery, the observer and finalizer use the exact retained Turn tombstones and
record `presentation_unavailable` rather than leaving the group pending.

All model operations under one unchanged Turn input inherit the same learner
occurrence and FutureAttention address. If tool-only A1 finalizes
`not_served`, explanatory A2 may answer the learner but cannot mint a second
group or bind itself as service. An identical A2 reissue is `already_applied`;
a changed A2/A3 source, claim, or rationale is `semantic_conflict`. The concern
stays open until a genuinely new runtime-bound learner occurrence. No
fabricated occurrence, mutable group, continuation slot, or service-retry
identity was added.

### Bounded owner read and Learning Context v3

`future_attention_read` supports exact concern, exact claim group, and bounded
list queries. It returns exact count-at-cut, deterministic storage order
labelled non-priority, cursor/omission truth, concern/head/source/target/time,
current source availability, service receipt, current claim projection, and
terminal finalization receipt. It never returns deleted transcript bodies,
changes eligibility, advances the frontier, mutates a physical settlement, or
selects a Tutor move.

Learning Context policy/renderer v3 adds one protected FutureAttention section
and retains exact v1/v2 decoding. Zero eligible concerns render an explicit
empty state. One eligible concern receives a complete semantic contribution
with conditional-default wording. Multiple concerns preserve exact count and
non-priority order while bounded omission remains explicit and lazy owner read
restores detail. Stale/missing targets remain owner-readable but do not enter
the automatic current-target projection.

The valid purpose limit is 768 UTF-8 bytes. The maximum schema-generated and
domain-admitted semantic object is 1,877 bytes, leaving 171 bytes under Gate
18's 2,048-byte semantic-value ceiling; it remains a full value and never
degrades to locator only. It uses only `Number.MAX_SAFE_INTEGER` values and
includes the real source-unavailable projection after supported source
deletion. The same maximum without optional order is 1,815 bytes, fixing the
optional-order cost at 62 bytes. Exact measured whole-cut costs are:

| Case | Canonical bytes | Rendered bytes | Result |
| --- | ---: | ---: | --- |
| zero eligible | 6,394 | 6,160 | explicit empty FutureAttention section |
| one minimum | 7,393 | 7,446 | one complete protected contribution |
| one maximum | 9,048 | 9,073 | complete maximum contribution, no locator-only degradation |
| ten eligible / bounded multiple projection | 14,763 | 14,855 | exact count 10, eight projected, two omitted |

The automatic projection omits the original temporal source expression and
transition/rationale history. Exact owner read remains the lazy detail path. Current
request stays higher priority than the conditional default, and merely showing,
overriding, redirecting, or beginning a concern does not serve or dismiss it.

### Strict command bridge, permission, and carrier truth

OpenCode adds strict `update_future_attention` and
`future_attention_read` tools. The recursive decoder rejects unknown fields,
illegal union combinations, over-limit UTF-8 text, caller-supplied runtime
identity, and unauthorized root/delegated arms before domain mutation. The
active registry and one permission catalog expose the tools only where the
current Agent profile and delegated capability allow them. Reads remain
non-mutating; write permission metadata shows operation count, claim count,
issuance, target scope, and source-relation classes before approval.

One semantic presentation projection distinguishes:

- immutable admission `applied | already_applied | no_change | conflict |
  denied | failed` truth;
- a completion-conditioned claim that was pending at its exact admission cut;
- current claim truth obtained by a new observation; and
- the separately typed append-only `served | not_served` finalization.

Learner-visible prose explains the purpose, interpreted relation, target,
timing, disposition, and correction path without exposing concern, group,
receipt, or transition IDs by default. Typed metadata retains the exact IDs for
correlation. It does not claim learner assent, evidence, correctness, mastery,
or retention. The original completed Tool Part remains unchanged when a later
finalization arrives.

The public event manifest, generated SDK v2 types, direct-run session data,
stream transport, ACP event routing, local-server/attach event flow, and TUI
sync all carry the same separately typed FutureAttention finalization. Carrier
deduplication is by finalization receipt identity, never by rewriting the claim
Tool Part.

Detached delivery is an owner read, not a second mutable event truth. The
generated Session endpoint pages the durable finalization aggregate by sequence
even after supported Session deletion. TUI sync, ACP load/resume, direct
interactive bootstrap, noninteractive direct/attach run, and local-server
reconnect load every page before relying only on future live delivery. History
and live paths enter the same receipt-ID set, so overlap is idempotent and a
reconnect cannot lose a receipt that committed while the carrier was absent.
TUI keeps a reconnect recovery generation pending across transient owner-read
failure and retries while the exact retained Session/directory remains live;
the failed attempt is not converted into a completed epoch.

## Causal evidence

All commands ran from the affected package, matching the repository rule that
rejects root-level test execution. Bun version was `1.3.14 (0d9b296a)`.

### Domain, context, and migration

| Command | Result | Claim bounded by the result |
| --- | --- | --- |
| `packages/core: bun test test/future-attention.test.ts` | 20 passed, 0 failed, 183 expectations | rollback after late domain failure, receipt-free no-effect, exact-target authority, root-lineage witnesses, complete Tool eligibility/classification, tombstone completion, lifecycle/service/replay, true maximum bounds, temporal consistency, reads, and truthful finalization prose |
| `packages/core: bun test test/learning-context.test.ts` | 12 passed, 0 failed, 40 expectations | frozen cut compatibility, whole-entry capacity, protected binding, omission, and canonical decoding |
| `packages/core: bun test test/learner-goal-agent-v2.test.ts --test-name-pattern <civil-time cases>` | 3 passed, 0 failed, 33 expectations | the extracted civil-time boundary retains Goal's fixed-offset, IANA, unavailable-source, ambiguous/nonexistent, and malformed-time behavior |
| `packages/core: bun test test/database-migration.test.ts` | 45 passed, 0 failed, 424 expectations | fresh/current schema, staged V13→V16 construction, frozen V12/V13/V16/V17/V18/V19 upgrades, additive V20 columns/triggers, owner decoding, and frozen-cut readability |
| `packages/core: bun run script/migration.ts` and `bun run script/migration.ts --check` | both completed successfully | full pinned generation works at the current schema size and checked-in schema/migration artifacts have no generated drift |

The domain suite additionally proves the source-deletion edge directly: a
served learner occurrence becomes a body-free occurrence tombstone, the
concern remains served, `carry_served` creates one served successor through the
exact prior receipt, and both service projections report
`source_unavailable/source_deleted`. An unrelated learner transcript string is
absent from the concern, semantic value, tombstone projection, and owner read.
It separately proves that a late rejected service cannot advance the frontier,
insert a physical receipt, leave a preparing change set, or consume the semantic
address, and that an already-dismissed no-effect replay remains receipt-free.

### Runtime, recovery, and released-v1 traces

| Command | Result | Claim bounded by the result |
| --- | --- | --- |
| `packages/opencode: bun test test/learning-command/runtime.test.ts --test-name-pattern FutureAttention` | 3 passed, 0 failed, 28 expectations | Gate 20 admission, immutable pending result, exact-Assistant finalization, startup recovery, real root exact selection, delegated working selection, and root-only semantic arms |
| prompt tests filtered to exact A1 success plus live interruption | 2 passed, 0 failed, 35 expectations | real released-v1 full-presentation service and the post-claim/pre-finalizer cancellation window closing live without restart |
| prompt test filtered to the no-output A1/A2 continuation | 1 passed, 0 failed, 14 expectations | same-occurrence `already_applied`/conflict behavior, one immutable terminal group, no A2 substitution, and open concern truth |

The positive prompt trace creates a concern, proves absence before due,
projects one complete conditional default when due, binds service to the exact
tool-calling A1, confirms A2 is a distinct operation, keeps A1's Tool result
immutable, observes one served receipt, and removes the concern from the next
fresh cut. It then deletes A1's Session and proves all four facts together:

- the concern remains `served`;
- the service receipt points to exact A1 but reports `source_deleted`;
- the deleted Turn has a body-free `turn_unavailable_source` tombstone while
  the Session row is gone; and
- the owner read contains none of A1's explanation text.

The negative trace gives A1 no eligible output, puts the explanation in A2,
and attempts identical and changed same-input reissues. A1 finalizes once as
`not_served`; A2 gets `already_applied` against the same terminal group; A3
gets `semantic_conflict`; all model operations share one input and occurrence;
there is one group/receipt; and the concern remains open in A2 context.

The interruption trace uses a synchronous post-commit `ToolSettled` listener as
its readiness latch. At that cut, the claim group and completed Tool Part are
durable but the prompt finalizer has not begun. The test then interrupts the
live Turn and proves a single `presentation_uncommitted` receipt with positive
eligible Text bytes, no pending group, and no process restart. No sleep or
provider-stream hang stands in for the causal window.

### Registry, presentation, events, and retained carriers

Fresh focused carrier evidence was split by independent delivery boundary:

- OpenCode tool catalog/registry: **2 passed / 7 expectations**, proving both
  strict tools are reachable only through the intended catalog;
- OpenCode presentation, recursive input hooks, and event manifest: **5 passed
  / 32 expectations**, including the shared truthful `stale_head` projection;
- real server SDK pagination, noninteractive 101-receipt attach subprocess,
  direct-run session data, and interactive stream pagination/dedupe retain their
  earlier **6 passed / 29 expectations**;
- ACP `loadSession` and `resumeSession` catch-up wiring: **2 passed / 7
  expectations**, with exact directory, `after`, and limit inputs;
- current ACP presentation, pagination, queued generation, acknowledged-phase
  failure retry, and same-stream physical reconnect: **5 passed / 19
  expectations**. The reconnect trace observes multiple `server.connected`
  epochs while the outer SDK subscription count remains one;
- TUI two-page history/live-overlap, reconnect-generation sync, and rejected-read
  recovery: **3 passed / 12 expectations**, proving cursors `-1 → 4`, one stored
  item per receipt, non-overlapping owner reads, a queued second generation, use
  of the retained Session directory after the active project directory changes,
  and autonomous retry after one rejected read with no second connection epoch;
- the global HttpApi eager-listener regression: **1 passed / 3 expectations**,
  proving an event published after route admission but before response-body
  consumption is queued behind `server.connected` rather than lost; and
- Schema event-manifest suite: **2 passed / 28 expectations**.

The real HttpApi test uses the generated SDK against the registered route and
SQLite durable aggregate; it is not a handler mock. The noninteractive process
test uses an isolated real Repa database and attach server, inserts 101 valid
detached finalizations, forces a second page, and observes one record per receipt
before the new Turn's `step_start`. ACP, TUI, and interactive stream tests also
inject a live copy of a historical receipt and prove receipt-identity dedupe.
The ACP failure oracle distinguishes acknowledged presentation phases from
unacknowledged attempts. No carrier rewrites the completed claim Tool Part.

Fresh parser and shared-computation evidence is **40 passed / 262 expectations**
across the pure civil-time matrix, the complete FutureAttention suite, and the
Goal consumer suite. The pure matrix contributes **13 passed / 13 expectations**
for arbitrary fractions, lowercase `t/z`, `-00:00`, calendar/clock/offset
limits, malformed compact tokens, and descriptive expressions. The
FutureAttention temporal command trace separately retains **23 expectations**
at the transaction/admission boundary.

### Static and generation checks

Fresh package typechecks passed with `tsgo --noEmit` in:

- `packages/core`;
- `packages/schema`;
- `packages/opencode`;
- `packages/tui`; and
- `packages/sdk/js` after SDK regeneration.

`packages/client: bun run check:generated` and the SDK build/regeneration check
also passed after the public HttpApi and event schemas changed.

`git diff --check -- . ':(exclude)AGENTS.md'` returned no whitespace error.
The candidate remained unstaged, with `HEAD` and `origin/main` unchanged at the
implementation base.

## Accepted and integrated boundary

The accepted deterministic and reviewer-reproduced evidence does not prove
that an arbitrary external model will always notice the right concern, choose
the best teaching move, write the right semantic
relation, or realize a purpose well. Gate 21A retains representative cross-
domain Tutor selection and flow-continuity qualification.

No credentialed or paid provider call was made or needed. The deterministic
scripted-provider traces exercise the real released-v1 prompt, registry,
LearningCommand bridge, database, context compiler, message/Part commit,
finalizer, recovery, event, and carrier spines. A real-provider smoke would
require separate credential/cost authority and would remain model
qualification, not a replacement for these deterministic oracles.

No maintainer-owned product choice, material unknown, or executor blocker
remains inside Gate 20's reviewed boundary. The retained reviewer accepted the
exact 71-file production/test candidate with `G20-IR-001..011` closed, while
contract/theory remains accepted with `G20-CR-001..010` closed. Exact commit
`1f92169840559b63eb8f96c31a67985c814a86f0` records that candidate, and local
`main` includes it through docs-only integration/status successors. Direct
`origin/main` publication is authorized and pending. No release, Gate 21, or
Gate 21A authority exists in this record.
