# Gate 18 learning context and Session continuation implementation/evidence record

Status: **exact current action-complete implementation/evidence successor
accepted by the retained reviewer under `G22-CR-002` and integrated with Gate
22 at implementation commit `ada0a04c19847ce62ae490c90838c88c51a65d72`.** Independent review
returned an initial **Revise** on 2026-08-04 with `G18-IR-001..005`; corrective passes by
the same reviewer closed those findings. The maintainer then explicitly
authorized a bounded credential/cost-bearing released-model qualification. On
2026-08-05 an isolated `openai/gpt-5.6-luna` run completed the accepted matrix
with 62 captured provider attempts, 57 durable interactive model operations,
22 learner scenarios, and exact TUI/direct-run/ACP carrier evidence. The live
run also exposed two deterministic production defects—provider-illegal
projection of stable internal tool IDs and an embedded direct-run
lifetime/input projection error—which were repaired and requalified rather
than excluded from the evidence.

The same independent reviewer accepted that exact live bundle and closed
`G18-IR-005`, then used successive corrective passes to close
`G18-IR-006..008`, including exact one-use AI SDK repair provenance for the
unadvertised program fallback and pre-catalog rejection of colliding raw MCP
origins. The reviewer returned **Accept** for the exact rebound candidate on
2026-08-05 with `G18-IR-001..008` closed, no new acceptance-changing finding,
and no material unknown. Together with the accepted contract/theory layer, the
whole-Gate review is complete. The maintainer separately authorized local
integration; the reviewed production/test projection plus post-verdict status
records are committed at `284d2a4ae440fb01f0f5a32eca58a5948464cc5e` and
integrated into `main` through a docs-only closure/status successor. No push,
release, or later Gate is authorized or claimed.

Current disposition notice (2026-08-13): this record remains exact evidence for
the implementation at `284d2a4ae440fb01f0f5a32eca58a5948464cc5e` and every
unaffected Gate 18 invariant. It does not evidence the later learner-selected
minimal-audit mode. That Session-deletion/retention subsection is bounded-
reopened by the contract/theory-accepted
[Gates 5/8/12/18 deletion-choice and local-restore correction](repa-gate-05-08-12-18-session-deletion-choice-correction-2026-08-13.md).
Its separate
[implementation/evidence record](repa-gate-05-08-12-18-session-deletion-choice-correction-implementation-evidence-2026-08-14.md)
is independently accepted under Whole-Gate run
`G22-WG-20260813-019ff8e2-01` and is integrated with Gate 22 at implementation
commit `ada0a04c19847ce62ae490c90838c88c51a65d72`. This accepted
snapshot likewise does not evidence that correction's new sealed
administrative-history classification, imported-history Session frontier, or
fresh Context ordering after exact restore/copy. In particular, it does not
evidence active imported-revert refusal, imported Patch/revert non-executability,
or the shared presentation frontier for direct shell/admin and every other
non-Turn transcript writer.

Current disposition notice (2026-08-22): Gate 22 contract review found that
`learning_material_query`'s displayed production values and Gate 18's recursive
exact-read projector did not agree. Artifact, exact Artifact Revision,
Representation, and Map reads could produce no relation; flat alignment could
be captured as selector. Therefore this record no longer proves that every
registered material action produced the correct exact lineage, although all
other recorded Gate 18 behavior and the closed catalog remain accepted. The
working-tree successor uses an action-complete material projection version,
passes its trusted lineage value separately from displayed/supplemental data,
keeps historical version-1 results immutable, and fails unknown future actions
closed. The retained Whole-Gate reviewer reproduced its focused evidence and
exact 90-path manifest, closed `G22-CR-002`, and accepted it as the current
bounded Gate 18/prerequisite implementation/evidence successor.

## Exact authority and candidate binding

- implementation base:
  `862f6b7a2318f0ccce4e98dd5ea6fab136739628`;
- accepted Gate 18 contract semantic candidate SHA-256:
  `2DDAA56396621CA04FBDE320F2B221CFCD8F844797F5C33B9E7AFF81CA46FB26`;
- whole-Gate independent reviewer task:
  `019fc874-72ee-75b3-92e9-0b923b85efb2`;
- contract/theory review run:
  `G18-WG-20260804-019fc837-01`, with `G18-CR-001..004` closed;
- review-bound implementation manifest SHA-256:
  `733137B901BD476B59AAF4C48760E1127CF1613D115D581D24B8B935BCE8C078`;
- review-bound tracked binary-diff SHA-256:
  `FD4854C9AFD74516FB27CA894FDC935910F3515D31EBDABC7E3DD9E24746E61F`;
- review checkout state: detached at the implementation base, with no commit,
  staging, push, merge, or integration performed before acceptance;
- implementation/evidence disposition: **Accept**, with `G18-IR-001..008`
  closed by the same reviewer and no acceptance-changing finding or material
  unknown remaining. This post-verdict status reconciliation changes only the
  owning status documents; production code and tests remain the exact reviewed
  candidate; and
- local integration: implementation commit
  `284d2a4ae440fb01f0f5a32eca58a5948464cc5e` contains that reviewed
  production/test projection plus the post-verdict status records, and `main`
  includes it through a docs-only closure/status successor. No push occurred.

The released-model run used Repa's ordinary model catalog and retained OpenAI
OAuth discovery. `openai/gpt-5.6-luna` was present in that catalog and in the
ordinary `repa models openai` output; no production model-name special case was
added. The qualification runner selects that exact maintainer-authorized model
so the evidence target is reproducible, not to repair model discovery.

Candidate-integrity correction: a final formatter pass after the first
implementation review mechanically changed Markdown layout in the accepted
Gate 18 contract/status file and the Gate 17 status record. It changed no
contract term or Gate 17 status meaning, but their previously recorded file
hashes are no longer claimed as current. The same-reviewer callback therefore
binds their new hashes and explicitly requests semantic-drift inspection and
current-candidate rebinding; “formatting only” is not used to bypass that
review responsibility.

The contract acceptance authorized only the implementation described by the
accepted Gate 18 boundary. It did not accept this code, its tests, this evidence
record, a real-provider qualification, integration, or any later Gate.

## Implemented production boundary

### One V18 Interaction-owned cut and optional capacity record

Migration `20260803182615_gate18_learning_context` advances the native database
from V17 to V18. It adds exactly one immutable `turn_learning_context_cut` per
admitted interactive model operation and zero or one immutable
`turn_model_capacity` row. A capacity row becomes mandatory only for a
successfully finalized transport candidate and is committed before provider
I/O. Both records are owned through the existing Assistant/model-operation
identity; they are not a second context database and they add no
learner-record, attention, planning, or Tutor-move state.

The checked-in migration registry, generated schema, `schema.json`, V18 schema
extras, and strict versioned constraint decoder agree. Fresh install and frozen
V17 upgrade create the same tables, foreign keys, uniqueness, immutable-update
triggers, and structural checks. Frozen V12, V15, and V16 migration fixtures use
their historical model-admission shape rather than pretending that pre-V18
rows already carried a Gate 18 cut. Migration fabricates no context or capacity
row for old work.

`TurnLifecycle.admitModel` prepares the retained Gate 15 cut, the Gate 18 cut,
the exact rendered block, model operation, and presentation against one
transaction snapshot. A fresh admission commits that complete set or none.
Admission replay decodes and verifies the stored Gate 15/Gate 18 canonical and
rendered bytes rather than re-projecting owners, advancing the clock, or
re-running a renderer. Changed operation identity, retained cut, capability
basis, provider-surface binding, canonical bytes, or rendered bytes conflicts
instead of overwriting history.

Capacity is deliberately a second stage after exact request finalization, not
part of the admission transaction. The processor commits the prepared
assessment in its own immutable, idempotent/conflict-checked transaction
immediately before provider open. A fault or crash after admission but before
that commit therefore leaves the exact cuts durable and capacity `not_found`;
it cannot open the provider, and startup recovery terminalizes the orphaned
Turn without redispatch. A repeated capacity commit may return the one exact
stored row, but a changed assessment conflicts. Admission replay makes no
claim that capacity already exists.

### Bounded automatic projection without a host-side semantic selector

The V1 cut has fixed canonical, rendered, per-entry, per-family, candidate, and
lazy-read ceilings. Canonical JSON uses ordinal key ordering and UTF-8 byte
accounting. Entry overflow becomes an exact locator/fingerprint record; family
and whole-cut overflow use deterministic omission counts and reasons. Every
admitted owner family receives its structural allowance before remaining
capacity is shared, so a large Course or Goal family cannot silently starve the
other producer families.

Automatic projection is closed over Gate 17 state and the existing Interaction
owner:

- Course supplies current eligible Courses, exact current View revisions,
  mappings, working selection, authorship, and disposition tuples;
- Learner Navigation supplies the current default-Course relation and exact
  per-Course anchor head/target/usability under the trusted sample time;
- Learner Goal supplies exact current Goal revision, lifecycle, scope,
  condition, target-time relation, and the time/dependency basis of derived
  relation fields;
- Material Map supplies exact Artifact/Representation target identity, Map
  revision/disposition, selector coordinate/witness, lineage, attribution,
  availability, source/provenance locator, and current-use dependencies; and
- Interaction supplies bounded terminal root-Turn locators outside the current
  Session, exact input/occurrence and presentation provenance, and exact
  Message/Part ranges without bodies.

All database-backed projection happens inside model admission. A subsequent
owner correction therefore affects a new operation but cannot create a mixed
old cut or rewrite an admitted one. The shared frontier and sample time remain
provenance/dependency inputs, not a universal snapshot version or a selected
Tutor move.

Withheld automatic-context capability still commits a bounded, explicit
no-read cut. Restricted and delegated Agents receive only the intersection of
current policy, delegated authority, and the actually provider-visible lazy
tools. Unknown or newly registered capability IDs do not inherit wildcard
access.

### Owner-private lazy reads preserve current authority

The ordinary Agent registry exposes six bounded read capabilities:
`course_query`, `learning_navigation_query`, `learner_goal_query`,
`learning_material_query`, `learning_material_read`, and
`learning_interaction_read`. The first four reuse or extend owner projections;
the latter two implement exact pinned byte/range reads. Every result is bounded
to 32,768 UTF-8 bytes and 64 typed items, returns a typed failure or omission,
and never applies generic string truncation to an owner value.

Material metadata inspection and Tutor byte disclosure are separate. The
Tutor reader cannot call Gate 13's `HistoricalReader`. It preserves current-use
admission while suppressing observation/availability writes: it revalidates
the current Artifact ordinary-use snapshot; exact Representation revision,
source proof, lineage, attribution, availability and retained backing; any
active continued-use grant identity/version/disposition and old/current pair;
the active Map disposition; selector coordinate and witness; and final
owner/backing state after reading. A changed Map, grant, Artifact,
Representation, selector, backing object, or physical bytes fails closed with
no historical fallback and no partial disclosure.

Stored Gate 10 evidence is provenance only. A durable ContentRoot locator is
usable across a later operation only after fresh current root binding, grant,
capability, and operation checks. Active-workspace provenance independently
requires the same exact current workspace/profile authority. A stored
one-operation receipt never becomes a token: the read requires a newly issued
approval for the exact current invocation. The three arms remain disjoint.

Interaction range reads bind Session, Turn, input/occurrence, terminal state,
presentation provenance, exact Message/Part IDs, range fingerprint, and source
availability. They never search by Session title, retarget to a similar/latest
Turn, or import the returned range into the current Session transcript.
Individual over-budget bodies become locator-only items; a deleted source
returns an explicit unavailable locator.

### One canonical provider surface for binding, capacity, and dispatch

Interactive request planning now derives one final route-visible tool surface
after user/tool permission filtering and route transformation. The complete
surface covers the exact non-secret transport identity (method, protocol,
host, path, and allowlisted noncredential query values), tool choice, ordered
IDs/names, complete descriptions, transformed input schemas, sent output
schemas, strictness, cache/native/provider metadata, synthetic compatibility
state, parallel/max-tool controls, and every other non-prompt semantic or
size-bearing JSON field actually sent.

The 32-KiB learning cut stores only route/tool-choice, ordered per-definition
and combined fingerprints, and exact canonical byte counts. It does not embed
the complete definition bodies. The complete surface remains the single
in-memory value used for whole-envelope capacity and dispatch. A permitted
definition larger than 32 KiB is therefore legal when the selected known model
envelope fits it, while a one-byte definition change still conflicts.

Stable internal tool identity remains domain-owned even when its spelling is
illegal in a provider function-name grammar. Request planning freezes one
deterministic, collision-safe internal-to-provider name projection across the
offered definitions and exact tool-call/result history. Provider definitions,
AI SDK/native lowering, capacity, retry, and raw-request verification all use
the projected names. Provider events reverse-map only through the frozen exact
projection; a name outside it fails before Session tool dispatch. The existing
`invalid` fallback remains a program-owned inert repair target, is reserved
against custom/plugin and MCP registration, and cannot be replaced by duplicate
composition. It is omitted from native and ordinary provider definitions. The
AI SDK may emit it only for the exact call ID and input returned by one
`experimental_repairToolCall` occurrence for an actually offered tool; that
one-use proof is consumed before Session candidate creation. Direct provider
`invalid`/case variants and every tool event under `toolChoice:none` fail
closed. The projection version, complete ordered mapping, and fingerprint are
part of the Gate 18 capability/policy basis, while persisted tool invocation,
permission, settlement, and learning-command identity remain the canonical
internal ID. This preserves `representation.convert` without sending its
provider-illegal dot to OpenAI or renaming the durable command.

MCP canonical IDs remain the retained sanitized wire shape, but catalog
construction is no longer allowed to make that lossy shape appear injective.
`MCP.tools()` retains each raw server/tool origin until insertion and fails on
the first duplicate canonical ID, before returning a catalog or admitting a
Session tool. This covers collisions within one server and across two server
names without minting a second MCP identity scheme.

The AI SDK path no longer infers this value by subtracting a no-tool baseline.
Provider resolution issues a certificate only for an audited bundled package
at its exact installed version whose final JSON request must traverse the
injected terminal fetch. It constructs a second compiler model from that same
pinned factory with inert authentication and an empty header set; Bedrock
credential providers, Vertex token/ADC callbacks, Gateway OIDC/BYOK state, and
arbitrary configured callbacks cannot run during compilation. An unlisted
dynamic/file/npm provider is rejected before module import or `doStream`.
An effective custom fetch is also rejected unless it is a source-audited,
branded adapter whose pure endpoint rewrite is part of the certificate.

Pure compilation intercepts the compiler's terminal request and returns a
synthetic response without credential resolution or network I/O. Every
terminal attempt is counted before parsing; a second attempt, request mismatch,
or unsupported shape sets a permanent violation even when provider code catches
the immediate exception. Finalization recompiles the complete request, rejects
any surface or route change from admission, freezes the standardized provider
prompt once, and prepares capacity from the normalized nonsecret bytes. At
every open or retry the runtime wrapper compares that semantic request before
send and withholds the provider result stream unless exactly one matching
transport was intercepted.

OpenAI's default HTTP OAuth adapter exposes its `/responses` rewrite as a pure
certified terminal route. The admitted endpoint is therefore the actual Codex
destination. Provider initialization still performs its existing auth-mode
discovery read, but compilation performs no additional auth read; runtime auth
re-read, refresh, and authorization-header installation occur only inside the
post-verification send. Native OpenAI OAuth deliberately declines before
preparing a native request and falls back to this ordinary AI SDK path; the
optional websocket experiment is not silently certified as the HTTP route.
Plugin transforms may add ordinary extensions but cannot delete or replace the
protected retained-steering or Gate 18 blocks. OpenAI OAuth instructions,
ordinary AI SDK system content, and native lowering contain the same protected
Gate 18 bytes exactly once.

The retained native adapter now exposes compile-once `prepareStream`. It
resolves defaults, cache placement, route, auth, protocol body, instructions,
and transport-private request once, verifies that the final prepared surface is
the admitted surface, and returns a re-subscribable stream over that prepared
request. Transport retry therefore reuses one semantic request instead of
re-running context projection, source reads, media materialization, route
lowering, or tool transformation. Local tools remain owned and executed by the
OpenCode Session processor, never by the provider adapter. Startup recovery
does not blindly redispatch an admitted provider operation.

The accepted contract explicitly excludes credentials and HTTP headers from
the Gate 18 canonical provider surface. Raw request comparison remains
ephemeral; its durable/capacity projection replaces certified body credential
carriers with typed nonsecret exclusions and omits credential query values.
It never stores a value-derived credential hash. Gateway call-option headers
and BYOK state are normalized only at their source-audited provider slots.
Hosted-MCP authorization/headers are likewise normalized only on a direct
OpenAI/Azure `tools[]` `type: "mcp"` definition or the direct Gateway
`type: "provider"`, `id: "openai.mcp"` argument slot. The sanitizer never
recurses into arbitrary function/output schema metadata, defaults, examples,
or const values merely because an object contains `type: "mcp"`. The result
binds and counts every admitted non-prompt semantic body field and the exact
non-secret method/protocol/host/path/allowlisted-public-query route while
keeping real credential-bearing transport state private and allowing
credential rotation without operation conflict.

### Honest capacity, Session continuation, and correction

Capacity evidence separates Gate 18's local cut budgets from the complete
provider request. It binds the exact envelope fingerprint; fixed and removable
history estimates; complete provider surface bytes; retained and learning
context bytes; model context/input/output limits; classification; and decision.
Known fixed overflow is rejected before transport. Compactable history overflow
binds the exact tail-start identity, ordered removable-message count, and
fingerprint selected while preparing that request. The same immutable
selection is stored in the capacity-history marker and revalidated against the
capacity row and current Session prefix before one ordinary compaction. That
path summarizes exactly the selected prefix, retains the current learner input
without replaying it, and gives the following operation a new cut and capacity
assessment. The distinct provider-overflow path retains its older explicit
replay semantics. Missing limits remain explicitly uncertain rather than
unlimited. Invalid limits fail closed. Provider-reported overflow is classified
truthfully and is not blindly retried.

A fresh Session receives current long-term owner state plus recent Interaction
locators, but no old Message/Part body or compaction summary. A resumed Session
keeps its own ordinary transcript and obtains corrected owner state only in the
next cut. Explicit fork provenance, delegated child history, root/steer/tool
continuation, and post-compaction admissions retain their existing Gate 12/15
meaning. A retry of one prepared model operation reuses its old cut; a domain
write, correction, fresh-current query, steer, or post-compaction operation
admits a new one.

A fork copies old compaction Parts only as historical presentation. It strips
their `capacity_history` execution binding, excludes every unfinished
historical compaction/subtask Part from the executable/model task projection,
and never clones or invents a capacity row for a new Assistant identity.
Completed summaries may remain as inert transcript anchors, but cannot run
again. The fork's new root input owns its own capacity assessment and any
fork-local compaction; the task loop passes the exact task Message ID rather
than retargeting work through the latest User message. More generally, the
model-context projection may retain every permitted historical or prior-Turn
Message body. Executable work does not reselect from that projection: the
current User is loaded by the exact durable `Turn.current_input_id` and
`TurnInput.message_id`, and must be a nonhistorical User presentation. Current
Assistant/finished state comes only from model-operation rows for that exact
Turn, Session, and input, ordered by operation ordinal; every such Assistant
must be present, nonhistorical, and parented to the exact User. For interactive
provider composition, every exact input and model-operation presentation of
the active Turn is removed from the legacy compacted transcript and appended
once as a causal suffix ordered by durable input ordinal and then model
ordinal. The exact current User therefore survives a legacy compaction cut and
is followed only by its own admitted operations; root operations precede a
promoted steer regardless of timestamp or caller Message ID. Pending
compaction/subtask Parts keep their separate completion binding and execute by
their own exact task Message ID. Thus neither an equal-time historical clone
nor a nonhistorical prior User/Assistant with a lexicographically later caller
ID can terminate, retarget, inherit, reorder, or remove the current operation.

The direct-run carrier keeps the same Turn spine without taking ownership of a
runtime already owned by an embedding caller. `effectCmd` exposes its exact
unwrapped Effect handler for such callers while the ordinary CLI wrapper still
owns startup and disposal. Ordinary `run` text joins the already parsed argv
items without rematerializing shell quotes; slash-command template expansion
retains its distinct grouping syntax, and piped input remains unchanged. The
released carrier oracle therefore binds the exact learner bytes, outer runtime
lifetime, model, Agent, parentage, cut, capacity, and provider request instead
of passing only because a quoted near-equivalent string was accepted.

Session deletion preserves exact unavailable/tombstone receipts while a
surviving fork/child still references them and does not orphan cut/capacity
rows. Compaction summarizes only its selected history prefix, preserves the
recent verbatim tail and durable original transcript, receives no Gate 18
learning block itself, and gives the following interactive operation a fresh
cut. No compaction summary is promoted into learning truth.

## Independent-review corrective disposition

| Finding      | Executor repair and falsifying evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Remaining disposition                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `G18-IR-001` | Durable/capacity evidence derives from one normalized nonsecret semantic request while exact raw comparison stays ephemeral. Gateway headers/BYOK and real hosted-MCP credentials are excluded only at source-audited provider-level slots; the path/route-shape-aware sanitizer cannot redact arbitrary function/output-schema defaults, examples, const values, or same-named nested objects. The 40-KiB nested-schema oracle stays present in canonical bytes and capacity, changes the per-definition/combined fingerprints, and rejects changed open before send. Real OpenAI/Gateway hosted-MCP secret rotation remains value-independent. Public query values and the pure default OAuth rewrite stay exact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **Closed by the same reviewer** on the latest corrective pass.                           |
| `G18-IR-002` | A separately instantiated compiler uses the same pinned package/factory/model with inert auth, empty headers, and no configured callbacks. Bedrock credential-provider and Vertex token/ADC oracles prove zero callback and zero send during compile; after the existing OAuth mode-discovery read, the default HTTP OAuth oracle proves compilation performs no additional auth read and verified admission permits exactly one local request. Capture/verify count every attempt and preserve a permanent violation across provider catches. Unlisted dynamic providers, zero-interception streams, post-certificate runtime changes, and unbranded custom transports fail closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Closed by the same reviewer** on the next corrective pass.                             |
| `G18-IR-003` | The exact A+B removable prefix remains shared by capacity assessment and ordinary compaction, with C+D retained and no second marker. Fork cloning strips `capacity_history`, clones no capacity row, and excludes historical tasks from execution. Executable User identity comes only from the exact durable Turn/Input/Message binding; Assistant/finished candidates come only from exact current-input model-operation identities and ordinals and must parent that User. Interactive provider messages now remove every active-Turn input/operation identity from the legacy compacted transcript, append the complete active Turn once in durable input/model ordinal order, and fail integrity on a missing, duplicate, historical, cross-input, or misparented presentation. Separate pending task completion and exact task-Message routing remain intact. Red-first same-time resumed-root, promoted-steer, and completed-compaction oracles failed under legacy ordering, then prove the exact current input is the final executable suffix while permitted prior bodies remain context only. The same reviewer reproduced the five decisive prompt cases with 61 assertions, passed the equal-time fork case, and passed the real parent-capacity-row fork case standalone with 17 assertions; one paired pre-product database-initialization failure did not recur in the exact standalone case. | **Closed by the same reviewer** on the final deterministic corrective pass.              |
| `G18-IR-004` | The record states the accepted two-stage boundary: one cut per admitted operation; zero or one capacity row; a row mandatory for a finalized transport candidate and committed before provider I/O. Admission replay verifies G15/G18, not capacity. The injected post-admission/pre-capacity database fault preserves cuts, leaves capacity `not_found`, opens no provider, and startup-recovers once without redispatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Closed by the same reviewer** on the corrective pass.                                  |
| `G18-IR-005` | The maintainer separately authorized credential/cost use. One isolated, secret-redacted `openai/gpt-5.6-luna` released-v1 run covers fresh/out-of-page Course and Goal state, generic continue and exact Interaction reads, correction and same-Turn durable-tool continuation, material adoption/drift/correction/fresh-current use, restricted/delegated capabilities, retry, explicit bounded compaction, restart, and TUI/direct-run/ACP parity. Every finalized interactive operation is rebound to stored Gate 15/Gate 18/capacity bytes and the captured final provider request. The run exposed and retained failed snapshots for provider-illegal tool names and direct-run lifetime/input defects; their production repairs passed both focused deterministic tests and the repeated real carrier paths. Exact artifact hashes and redaction checks are recorded below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **Closed by the same reviewer** against the exact immutable live bundle.                 |
| `G18-IR-006` | Unknown provider tool names no longer map to the ordinary string `invalid`; reverse projection fails before Session event/tool dispatch on AI SDK and native paths. `invalid` is one program-owned inert fallback ID and is rejected by both custom/plugin and MCP registration. Registry, Session, and structured-output composition reject duplicate IDs rather than allowing a later external implementation to overwrite an earlier tool. Red-first registration/projection tests reproduced the original acceptance impact; focused AI SDK/native oracles then keep external invocation counts at zero, while the full transport tests retain the positive collision-safe `representation.convert` reverse map and execution under its canonical ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Closed by the same reviewer; successor provenance/composition findings are separate.** |
| `G18-IR-007` | The hidden program fallback is absent from native and ordinary provider definitions. The AI SDK adapter admits it only when `experimental_repairToolCall` has issued an exact call-ID/original-provider-name/repaired-input proof for an actually offered tool, consumes that proof once, and carries an in-process non-provider-forgeable marker into Processor reservation repair. Direct provider `invalid`/case variants, `toolChoice:none`, repeated proof use, and native fallback calls fail before Session candidate creation. Malformed JSON for an offered `read` call still produces exactly one inert program-owned repair, while legal `representation.convert` projection remains executable under its canonical ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Closed by the same reviewer on the final corrective pass.**                            |
| `G18-IR-008` | `MCP.tools()` keeps the raw server and tool names beside each sanitized canonical ID and rejects the first duplicate before assignment can overwrite an earlier implementation or return a catalog. Same-server `x.y`/`x_y` and cross-server `a.b`/`a_b` oracles both fail with the two exact raw origins and zero remote invocation. Later Registry/Session non-replaceable composition remains defense in depth rather than the first place a collision becomes observable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Closed by the same reviewer on the final corrective pass.**                            |

## Contract decision/evidence mapping

| Contract decision  | Causally decisive implementation and executable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `G18-CTX-001`      | V18 stores one immutable observer cut per interactive model operation. Cut compilation writes no Course, Goal, Material, navigation, learner-record, planning, attention, or move-selection state. Core cut tests compare owner/frontier tables before and after projection/read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `G18-SURFACE-001`  | One trusted composition predicate admits fresh/resumed root, steer, tool continuation, post-compaction, fork, child, hidden/custom, and structured-output interactive samples. Fixed-purpose title, compaction, Representation, Agent generation, workflow callback, deterministic, disabled MCP sampling, and preview-v2 paths receive no Gate 18 block. Request/workflow tests enforce the separation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `G18-CUT-001`      | Canonical ordering, strict decoding, UTF-8 bounds, multibyte boundary, one-byte overflow, deterministic locator conversion, capability catalog, provider-surface seal, immutable schema triggers, exact replay, and atomic rollback are covered by `learning-context`, migration, and Turn tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `G18-PRODUCER-001` | Course, Navigation, Goal, Material Map, Artifact/Representation, and Interaction owner tests cover current/corrected/withdrawn/unavailable/stale/over-budget shapes and complete identity/dependency tuples. Projection uses only Gate 17 producers plus Interaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `G18-VIEW-001`     | The compiler allocates a deterministic allowance to every admitted family before shared capacity. Course and Goal pressure tests prove non-starvation; omission reasons/counts and `complete/truncated/locator_only/empty/unavailable/not_authorized` states remain explicit. No host-language relevance ranking was added.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `G18-LAZY-001`     | Registry/read tests enforce default-deny capability intersection and typed bounds. Gate 10 tests cover ContentRoot/workspace/one-operation positive, negative, restart, and current-operation binding. Gate 13/Material tests cover metadata versus Tutor current-use, grant/Map/Artifact/Representation ABA, final revalidation, retained backing, physical drift, and zero writes; historical bytes are unreachable. Interaction tests cover exact range, duplicate title, deletion, fork, and compaction provenance with no fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `G18-SESSION-001`  | Prompt, Session, HTTP, Turn, recovery, and compaction tests distinguish fresh, resumed, fork, child, root, steer, tool continuation, retry, deletion, and post-compaction operations. Fresh projection contains body-free cross-Session locators; exact lazy read does not mutate current history. A real parent-capacity-row fork proves unfinished historical markers are inert and carry no cloned capacity authority. Equal-time fork, resumed-root, promoted-steer, and completed-compaction oracles prove that exact durable Turn inputs plus their model-operation ordinals—not historical provenance, wall-clock/caller-ID order, or a compacted legacy stop point—own the complete provider suffix, executable identity, Assistant/finished state, Agent/model, parentage, and admission while permitted prior bodies remain context only. Real TUI, embedded direct-run, and ACP traces bind the same exact input and Turn spine; the direct-run fault snapshots prove outer runtime lifetime and argv bytes rather than accepting a carrier-specific approximation.                                                                         |
| `G18-STEER-001`    | The existing Gate 15 cut is prepared first and bound by Assistant ID, `cutAsOf`, and fingerprint into the Gate 18 cut and final protected request. Exact replay and stale-cut tests reject a competing or reinterpreted steering cut.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `G18-CAP-001`      | AI SDK/native wire tests bind one normalized nonsecret semantic request for conflict, whole-envelope accounting, and dispatch while retaining ephemeral exact raw verification. Description/schema/route/strict/synthetic/metadata/toolChoice changes—including MCP-shaped nested defaults/examples/const values—alter fingerprints and exact capacity; credential/header rotation at audited provider slots does not. Public query values and pure terminal rewrites remain exact. The oversized-tool oracle sends the full body while the compact cut remains below 32 KiB. Provider-illegal stable tool IDs use one frozen, policy-bound, collision-safe wire-name projection for definitions, history, capacity, retry, dispatch, and reverse-mapped events without changing their internal command identity. Unknown or unoffered names fail before Session candidate creation; the unadvertised inert fallback requires one exact SDK-repair proof and is absent from native definitions. External registration/duplicate composition cannot replace it, and MCP catalog construction rejects two raw origins that collapse to one sanitized ID. |
| `G18-BUDGET-001`   | Boundary tests cover canonical/rendered/entry/lazy limits, multibyte input, one-byte overflow, invalid/unknown/known capacity, removable versus fixed overflow, complete tool-surface bytes, and frozen prompt retry. The integrated A/B/C/D oracle records A+B as one exact removable prefix, summarizes exactly those IDs once, keeps C+D verbatim without replaying D, and proves the following admission fits without a second compaction marker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `G18-FAIL-001`     | Fault tests cover owner projection, atomic Gate 15/Gate 18 cut admission rollback, the separate post-admission/pre-capacity fault, provider verification/dispatch, overflow, cancellation, Session/source deletion, restart, and recovery. The capacity fault leaves both cuts exact, capacity `not_found`, and provider-open count zero; startup recovery terminalizes once and never redispatches. No case rebuilds an admitted cut, leaks a partial owner write, or mutates a learning owner during read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Deterministic closing evidence

All commands below ran from the named package on this exact uncommitted
candidate. Package tests were deliberately run by owning file or in a bounded
same-owner set. The repository rejects root-level test execution, and Bun test
files with process-global database/registry state are not assumed to be safe in
one combined process.

| Package and command                                                                           | Result                                                                   | Claim exercised                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`: `bun run typecheck`                                                          | pass                                                                     | V18 public/owner types, strict union handling, migration/test fixture types.                                                                                                                              |
| `packages/core`: `bun test test/database-migration.test.ts`                                   | 43 pass, 0 fail, 393 assertions                                          | Fresh V18, frozen V17/V16/V15/V12 upgrades, exact parity, non-fabrication, constraint/trigger drift, rollback, reopen.                                                                                    |
| `packages/core`: nine-file Gate 18 owner/Turn set in two bounded processes                    | 108 pass, 0 fail, 923 assertions                                         | Cut/capacity, all admitted producers, Gate 10, Gate 13, Interaction, atomic Turn/replay/deletion, Gate 15 regression.                                                                                     |
| `packages/llm`: `bun run typecheck`                                                           | pass                                                                     | Compile-once route client and prepared-stream interface.                                                                                                                                                  |
| `packages/llm`: `bun test test/prepare.test.ts test/executor.test.ts test/route.test.ts`      | 21 pass, 0 fail, 75 assertions                                           | Request/default resolution, route lowering, overflow classification, redaction, transport retry.                                                                                                          |
| `packages/client`: `bun run generate` twice, then `bun run typecheck`                         | pass; 9 generated files byte-stable on second generation                 | Public Session capacity fields are generated from the authoritative schema and compile in both generated clients.                                                                                         |
| `packages/opencode`: `bun run typecheck`                                                      | pass                                                                     | Interactive composition, provider surfaces, tools, carriers, tests.                                                                                                                                       |
| `packages/opencode`: `bun test --timeout 60000 test/session/llm.test.ts`                      | 39 pass, 0 fail, 174 assertions                                          | AI SDK/native selection, full provider surface, exact capacity/retry, positive projected identities, absent native fallback definitions, and pre-candidate rejection of unoffered/native fallback events. |
| `packages/opencode`: `bun test --timeout 60000 test/session/llm-tool-name-projection.test.ts` | 7 pass, 0 fail, 24 assertions                                            | Frozen one-to-one provider names, exact reverse mapping, direct/case/none fallback denial, and exact one-use AI SDK repair provenance.                                                                    |
| `packages/opencode`: `bun test test/session/llm-native.test.ts`                               | 17 pass, 0 fail, 49 assertions                                           | Native compile-once route, exact prepared endpoint/baseURL, and deliberate OAuth fallback to AI SDK.                                                                                                      |
| `packages/opencode`: `bun test test/session/llm-request.test.ts`                              | 16 pass, 0 fail, 81 assertions                                           | Protected Gate 15/Gate 18 content, OAuth/native lowering, plugin replacement resistance, internal-purpose exclusion.                                                                                      |
| `packages/opencode`: `bun test test/provider/wire.test.ts`                                    | 11 pass, 0 fail, 67 assertions                                           | Path/route-shaped hosted-MCP redaction, exact nested-schema binding, secret-free projection, exact public route, inert compilers, permanent attempt failure, and verified open.                           |
| `packages/opencode`: `bun test test/plugin/codex.test.ts`                                     | 17 pass, 0 fail, 40 assertions                                           | Pure default OAuth rewrite, no additional compiler-time auth read/send, one post-admission loopback send, and refresh serialization.                                                                      |
| `packages/opencode`: `bun test test/provider/provider.test.ts`                                | 98 pass, 0 fail, 246 assertions                                          | Dynamic provider rejection occurs before import/I/O; regular Vertex compiles its exact ADC route without resolving ADC.                                                                                   |
| `packages/opencode`: `bun test test/session/llm-workflow-authority.test.ts`                   | 1 pass, 0 fail, 12 assertions                                            | Unsupported workflow callback fails before provider I/O.                                                                                                                                                  |
| `packages/opencode`: `bun test test/tool/learning-context-read.test.ts`                       | 5 pass, 0 fail, 17 assertions                                            | Exact lazy byte/item ceilings and typed material failures.                                                                                                                                                |
| `packages/opencode`: `bun test test/tool/registry.test.ts`                                    | 34 pass, 0 fail, 201 assertions                                          | Built-in collision, default/restricted/delegated catalogs, bounded zero-write owner reads, reserved fallback, and custom/MCP/duplicate registration denial with zero external invocation.                 |
| `packages/opencode`: `bun test test/mcp/lifecycle.test.ts`                                    | 23 pass, 0 fail, 56 assertions                                           | MCP lifecycle plus same-server and cross-server sanitized-ID collisions rejected with both raw origins before catalog return and with zero remote invocation.                                             |
| `packages/opencode`: `bun test --timeout 60000 test/session/prompt.test.ts`                   | 22 pass, 0 fail, 184 assertions                                          | Root/steer/tool/child/interrupt admission, exact provider suffixes, provider-origin fallback denial, and one inert repair for malformed arguments to an offered AI SDK tool.                              |
| `packages/opencode`: `bun test test/session/structured-output.test.ts`                        | 22 pass, 0 fail, 49 assertions                                           | Program structured-output injection retains non-replaceable composition without changing result-schema behavior.                                                                                          |
| `packages/opencode`: `bun test test/session/message-v2.test.ts`                               | 37 pass, 0 fail, 63 assertions                                           | Chronological compacted projection, task selection, model conversion, and error classification remain intact around provenance-aware current work.                                                        |
| `packages/opencode`: `bun test test/session/processor-effect.test.ts`                         | 33 pass, 0 fail, 214 assertions                                          | Exact capacity prefix/one compaction, post-admission capacity fault, zero provider open/redispatch, retry, tool ordering, settlement.                                                                     |
| `packages/opencode`: `bun test test/session/compaction.test.ts`                               | 57 pass, 1 existing disabled-v2 skip, 0 fail, 180 assertions             | Prefix ownership, recent verbatim tail, repeated compaction, fresh admission, cancellation, no tool call in summary.                                                                                      |
| `packages/opencode`: `bun test test/session/messages-pagination.test.ts`                      | 52 pass, 0 fail, 128 assertions                                          | Exact compaction tail plus inert historical fork markers with stripped capacity authority and no executable task.                                                                                         |
| `packages/opencode`: `bun test test/session/session.test.ts`                                  | 34 pass, 0 fail, 237 assertions                                          | Fresh/fork/child/deletion/owner handoff and immutable admitted presentation.                                                                                                                              |
| `packages/opencode`: `bun test test/session/turn-recovery.test.ts`                            | 2 pass, 0 fail, 24 assertions                                            | Orphan recovery from durable truth without provider redispatch.                                                                                                                                           |
| `packages/opencode`: `bun test test/server/httpapi-session.test.ts`                           | 27 pass, 0 fail, 144 assertions                                          | HTTP/local-server carrier reaches the same atomic root/steer/fork/await spine.                                                                                                                            |
| `packages/opencode`: `bun test test/session/llm-native-recorded.test.ts`                      | 1 pass, 2 explicit skips, 0 fail, 8 assertions                           | Anthropic native cassette remains executable; missing OpenAI API-key evidence and historical native OAuth cassette are explicit skips.                                                                    |
| `packages/opencode`: `bun test test/learning-command/representation-runtime.test.ts`          | 3 pass, 0 fail, 26 assertions                                            | Internal Representation operation stays narrow and recovery-safe.                                                                                                                                         |
| `packages/opencode`: `bun test test/learning-command/runtime.test.ts`                         | 50 active pass, 13 retired historical-V1 skips, 0 fail, 1,044 assertions | Gate 14/15/16/17 semantic settlement, permission, recovery, migration, and bootstrap remain intact.                                                                                                       |
| `packages/opencode`: `bun test --timeout 60000 test/cli/run/input.test.ts`                    | 3 pass, 0 fail, 6 assertions                                             | Ordinary argv text remains exact, slash-command grouping remains distinct, and piped input is not reinterpreted.                                                                                          |
| `packages/opencode`: `bun test --timeout 60000 test/cli/effect-cmd-instance-als.test.ts`      | 3 pass, 0 fail, 3 assertions                                             | The exact unwrapped handler is available to an embedding runtime owner while ordinary Instance context remains stable across awaits.                                                                      |
| `packages/tui`: `bun run typecheck`                                                           | pass                                                                     | The headless production Prompt adapter used by the live primary-TUI carrier compiles against the exact TUI surface.                                                                                       |

`git diff --check` and documentation link/structure checks are rerun after this
record and status map are finalized, because their decisive input includes the
final documentation bytes.

### Non-authoritative failed aggregate runs

The following results are preserved as environment/runner evidence and are not
counted as passing proof:

- one multi-file OpenCode Bun process reached about 0.95 GiB RSS and crashed in
  Bun 1.3.14 before a product assertion failed. It also demonstrated
  process-global registry/recovery contamination. Every affected owning file
  was rerun in a fresh process and passed;
- one ten-file Core aggregate passed 149 assertions-bearing tests but failed
  two migration cases after another file held the migration temp directory
  (`EBUSY`) and contaminated shared `:memory:` initialization. The migration
  file then passed 43/43 alone, and the other nine files passed 108/108 without
  migration;
- a fresh nine-file Core owner aggregate reached its third file with no failed
  product assertion, then Bun 1.3.14 terminated with a segmentation fault at
  about 0.42 GiB RSS. The same nine files were therefore rerun in clean bounded
  processes and passed 108/108 with 923 assertions;
- a fresh four-file OpenCode Session aggregate passed 100 tests but inherited
  one running Turn across file fixtures, which made one deletion case and one
  recovery enumeration observe an extra row. The affected `session` and
  `turn-recovery` files passed 34/34 and 2/2 respectively in clean processes;
  `prompt` and `messages-pagination` also passed independently;
- two compaction full runs measured the same cancellation check at 296 ms and
  315 ms against a `<250 ms` wall-clock oracle. In each case a clean rerun
  passed all 57 active tests without a source change; the latest rerun includes
  180 passing assertions. The timing failures did not alter the interruption
  cause, the cancellation assertion, or production code; and
- the HTTP root-Turn test completed every pre-release assertion but exceeded
  Bun's default five-second whole-test timeout after Gate 18 added real request
  planning/admission. With a diagnostic 15-second runner budget it completed
  normally in about 5.2 seconds and reached all terminal assertions. The test
  now uses the same explicit 15-second class of budget already present for
  neighboring HTTP lifecycle tests; the full file passes 27/27;
- an initial combined tool-name/LLM Bun process did not complete cleanly during
  process-global teardown. The projection file and complete LLM file were then
  run in separate fresh processes with an explicit 60-second per-test ceiling
  and passed 4/4 and 38/38 respectively; and
- a broader CLI-neighbor run included one pre-existing keymap assertion that
  expected `ctrl+return` in a configuration where it was absent. It does not
  exercise direct-run input or embedded runtime ownership. The exact affected
  input and Effect-command files pass in isolated fresh processes and the real
  direct-run carrier subsequently passes. A later two-file invocation of those
  exact tests also produced no result for more than 60 seconds and was
  terminated; the immediately following isolated runs passed 3/3 and 3/3 with
  3 and 6 assertions respectively.

These runs are disclosed so a reviewer can distinguish a green rerun from a
hidden product failure and can reject the isolation explanation if repository
evidence contradicts it.

## Live released-model qualification candidate

The maintainer separately authorized use of an existing provider credential
and a cost ceiling wider than USD 5, and selected the exact released model
`openai/gpt-5.6-luna` with Luna preferred over the also-authorized Terra/Sol
alternatives. Repa's ordinary local model catalog already discovered that exact
model and the retained OpenAI OAuth route accepted it; neither production
discovery nor provider selection was hard-coded for Luna. The qualification
runner names the authorized target explicitly so a later reader can identify
which released model produced the evidence. The subscription/provider did not
expose a reliable dollar charge for this run, so this record makes no cost
claim beyond the authorization and bounded request ceiling.

The isolated run root is
`C:\Users\Discordance\.codex\campaigns\repa-gate18\evidence\qualification\repa-g18-luna-20260805-07`.
It contains its own workspace, LearnerHome database, material fixtures, copied
model catalog, 14 phase records, final aggregate, and passed/failed database
snapshots. The final bound artifacts are:

- `evidence.json`: SHA-256
  `E63A11BD43215DF61010CF9981F7547CE94B9AEBE68CCADFB535FC52E810F0CB`;
- `trace.db` and `snapshots/final.db`: identical SHA-256
  `4773B8C17D8198AAE9B77FA80157CC44BC93ACF2165BED30BCAFCC399749A222`;
- `models.json`: SHA-256
  `A5D5DF2DBF443EDC56AF460FFC3F95D761EED7DD450720ADB4B5F20D34E91FA1`;
  and
- deterministic manifest over relative path, byte length, and SHA-256 for the
  three root artifacts, 14 phase JSON files, and 24 database snapshots:
  41 files, SHA-256
  `D84C088368E4F982C2CACBCDC89AAE6DA6F0510F82B51512CFB715F97DE8D98D`.

The final aggregate is `passed`: 22 learner scenarios produced 57 durable
interactive model operations and 62 captured provider attempts under a hard
ceiling of 96. The database contains 23 completed Turns, 57 exact Gate 18 cuts,
57 immutable capacity rows, no foreign-key violation, and SQLite
`quick_check=ok`. The extra provider attempts relative to interactive
operations are contract-excluded internal carrier/compaction requests plus the
deliberately injected exact retry; the count is a transport-evidence count, not
an assertion about account billing.
The final matrix includes:

- a fresh LearnerHome and out-of-page Course/Goal target, followed by generic
  continue and exact Interaction lazy reads in a fresh Session without old
  transcript import;
- correction/resume and same-Turn durable material adoption plus exact read;
- physical material drift, failed old-current use, corrective conversion, and
  fresh-current exact bytes under Gate 10/13 authority;
- restricted automatic context and delegated-capability intersection;
- one frozen-request provider retry, process restart, and a bounded explicit
  qualification compaction that summarizes one old prefix, retains the recent
  verbatim tail, gives its internal summary no Gate 18 cut, and gives the next
  interactive operation a fresh cut/capacity row; and
- primary TUI, direct-run, and ACP invocations through their production carrier
  adapters, each with exact input/Turn identity and the same stored-cut,
  capacity, provider-surface, and final-request verification.

For every finalized interactive operation the aggregator decodes the stored
Gate 15/Gate 18/capacity bytes, reconstructs no owner state, and verifies the
captured final normalized provider request with `ProviderWire`. Actual final
OpenAI request headers are archived only as projections: all 62 authorization
values are `credential` plus byte length, all 62 account identifiers are
`account_identity` plus byte length, and ordinary nonsecret headers retain
their values. An independent recursive scan compared the three sensitive
values present in the authorized local credential record against the final
aggregate, all 14 phase JSON files, and raw SQLite bytes: zero of 15 JSON files
and zero database values matched. No credential value, account identifier, or
value-derived credential hash is in the evidence bundle.

The qualification did not pass on its first carrier attempt. The failed states
remain reviewable rather than being overwritten:

- `snapshots/carrier-tui-provider-failed.db`, SHA-256
  `8A201CBAE081CDB211371C08FB9167DA36077821DCC3BE378BF9B66AD2D61390`,
  records OpenAI's HTTP 400 rejection of the stable internal
  `representation.convert` ID because `.` is illegal in the provider function
  grammar. The request-local frozen name projection described above repaired
  the provider boundary; the repeated TUI trace sent the legal projected name
  while durable permission/invocation/settlement retained the internal ID;
- `snapshots/carrier-direct-run-interrupted.db`, SHA-256
  `83ADC03B066A4905420B4CE51EB6724CA6F340DDED9323679A63589B2A584742`,
  records a completed Turn whose embedded CLI wrapper then disposed the outer
  qualification runtime. `effectHandler` separates the embedded call from CLI
  lifetime ownership; and
- `snapshots/carrier-direct-run-input-mismatch.db`, SHA-256
  `A58AFFF73A813F205AC9D359CAB4EB0B747923008E74B6ED1D8307753B4CA8D8`,
  records the next attempt persisting literal quotes around an ordinary spaced
  argv input. The raw-argv projection repair then passed with the exact learner
  bytes and one provider call.

Earlier qualification iterations also retain model-following and harness-
oracle failures for material drift/correction, retry injection, and compaction.
They are not counted as passing evidence: two model runs exhausted their
bounded tool budget, one attempted an invalid empty conversion, one stopped
before the demanded unavailable-locator read, the first retry injector used a
non-retryable local `TypeError`, and the first compaction oracle asserted the
wrong rendered boundary. Each subsequent phase reran from its last passed
database snapshot. Those failures changed qualification prompts/oracles or
exposed the two production defects above; they were not deleted, interpreted
as pedagogy scores, or used to weaken the accepted Gate 18 invariants.

The retained deterministic OpenAI OAuth loopback and native cassettes remain
useful failure-localization evidence, but they are no longer substitutes for
`G18-IR-005`: the real released-model trace exists and the same reviewer has
accepted its exact immutable bundle. The same reviewer separately retested and
closed the post-run `G18-IR-006..008` fallback-provenance, non-replacement, and
MCP-collision paths without rerunning credentials or the external provider.

## 2026-08-22 bounded material exact-read producer correction candidate

Gate 22 contract finding `G22-CR-002` supplied a concrete counterexample to the
accepted exact-read producer claim. `learning_material_query` passed its
displayed result recursively into `TurnLineage.readProjection`, while the
projector expected different field names and inspected selector shape before
flat alignment identity. The current candidate corrects that narrow boundary:

- `learningContextReadResult` accepts a separate trusted `lineageValue`; output
  bytes and supplemental inspection objects are never recursively promoted to
  exact-read identity;
- `learning_material_query` derives identities for every registered action:
  current/exact Artifact Revision, Representation, Map/list/successor/
  disposition, outline node, selector, alignment/list/successor/disposition,
  and pinned multi-record Artifact/Representation metadata;
- `TurnLineage` decodes those tagged identities as material projection version
  2, accepts version 2 through candidate and operation coverage, and preserves
  version 1 as immutable historical producer truth; a completed material
  version-1 candidate refuses minimal-audit sealing because the retained audit
  cannot safely label its absent/wrong relation; and
- alignment projection is tested with a simultaneously displayed selector ID
  and must retain the alignment ID; disposition events combine their admitted
  exact parent scope with returned version; pinned results retain every exact
  alignment/Map/selector/target record; and an unknown future action fails
  closed instead of sealing no-positive coverage.

The review-bound prerequisite successor contains 90 package paths, totals
5,424,504 bytes, and has ordinal path/byte-length/file-SHA-256 manifest
`334CDCAEEA573A8257E8F3B67A8A4AE9550F06522B3E85645B974CE126C4CBE6`.
It is now subsumed by the integrated Gate 22 implementation above.
The five files changed from accepted predecessor manifest
`C18F06F7D10DD2C183AAD13036EA772B3D28DFE976DC4D852CEEF898D7C93474`
are:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `packages/core/src/turn-lineage.ts` | 45,294 | `D3563365F58F918BAE3FDDD5D9CD160B63D2725DA2AA011ED3CF743F97447719` |
| `packages/core/test/turn.test.ts` | 231,161 | `D2483A28193C98A1785EAA7042F9B53AD0327464EF19A754C0A0194C73A87403` |
| `packages/opencode/src/tool/learning-context-read.ts` | 1,800 | `F47BB84418CDD5E12AC3FFFD76A3F815B6BF1FD1C676FA5309F168A7301D6923` |
| `packages/opencode/src/tool/learning-material-query.ts` | 26,944 | `0EEEACC47420C10EA5A82337997FDA6B6D7FEE1FCF7F73FC3CAB4416FC96C0BE` |
| `packages/opencode/test/tool/learning-context-read.test.ts` | 11,949 | `61C242972712E88BD70C36A9757A50F57F83BBE2D2F015E26838C3783CB6589C` |

Focused candidate evidence on Windows/Bun 1.3.14:

| Check | Result | Distinct claim |
| --- | --- | --- |
| `packages/core`: `bun test test/turn.test.ts` | 36 pass, 323 assertions | The corrected producer/version rules preserve the complete owning Turn, coverage, deletion, recovery, constraint, and retained-steering suite. |
| `packages/core`: `bun test test/turn.test.ts -t "decodes each action-specific learning-material exact-read identity"` | 1 pass, 6 assertions | Core distinguishes Artifact Revision, Representation, Map, outline node, selector, and alignment identities. |
| `packages/opencode`: `bun test test/tool/learning-context-read.test.ts` | 6 pass, 44 assertions | All 19 registered action arms, Artifact/Representation pinned multi-record results, future-action fail-closed behavior, and supplemental fencing pass. |
| `packages/core`: `bun test test/turn.test.ts -t "projects exact lazy-read lineage into the purgeable body-free deletion audit"` | 1 pass, 16 assertions | Historical material version 1 refuses a false minimal audit; version 2 seals candidate/operation coverage and survives only through the allowed audit. |
| `packages/core`: `bun run typecheck` | pass | Core projector/version changes typecheck. |
| `packages/opencode`: `bun run typecheck` | pass | Tool producer/fencing changes typecheck. |

These began as executor-produced regression and integration observations. The
same retained Whole-Gate reviewer reproduced the action-union/fencing and
candidate→operation→minimal-audit cases, independently matched all five file
hashes plus the complete package manifest, closed `G22-CR-002`, and returned
`Accept` for this bounded producer/evidence successor. No broader Gate 18 or
deletion/restore claim was re-run or changed.

## Fixed exclusions and review questions

This implementation adds no learner record, attention state, scheduler,
planning state, task-priority policy, Tutor move selection, natural-language
host parser, embedding retrieval, vector store, soft memory, background daemon,
second database, alternate Session runtime, or preview-v2 execution path. It
does not make an old transcript, compaction summary, historical material bytes,
stored Gate 10 receipt, or current source observation into learning truth.

The same reviewer evaluated the candidate against these rejection questions:

1. Does every interactive released-v1 sampling route atomically admit one exact
   Gate 15/Gate 18 cut set, then commit zero or one matching capacity row—with a
   row mandatory for a finalized transport candidate—before provider I/O, and
   fail with no provider open if that second stage cannot commit?
2. Does each owner locator bind every mutable revision/disposition/dependency
   needed to prevent retargeting, especially Gate 10 authority and Gate 13
   current-use/continued-use races?
3. Does one normalized nonsecret semantic request really drive admission,
   whole-envelope capacity, AI SDK/native dispatch, and transport retry while
   ephemeral raw verification excludes credentials from durable evidence,
   compiler auth callbacks remain dormant, a certified OAuth rewrite binds the
   actual final endpoint, and hosted-MCP redaction is confined to audited
   provider slots without collapsing arbitrary nested schema bytes?
4. Do fresh, resumed, forked, child, steered, tool-continuation, retry, deleted,
   and compacted Sessions retain their accepted meanings without importing an
   old transcript, rebuilding an admitted cut, or executing a cloned historical
   capacity marker under a new Session/input identity—and does durable
   historical provenance, rather than equal-time ID order, own fork scheduling?
5. Does the bound live `openai/gpt-5.6-luna` bundle close the accepted released-
   model matrix without treating model compliance or pedagogy quality as a Gate
   18 invariant, and do its retained failed snapshots plus resulting provider-
   name/direct-run repairs leave any acceptance-changing counterexample?
6. Can a direct provider `invalid`/case variant, a `toolChoice:none` event, a
   repeated proof, or any native fallback call create a Session candidate; and
   does malformed input for an actually offered AI SDK tool still yield exactly
   one inert program-owned repair while known projected
   `representation.convert` retains its canonical internal identity?
7. Can two raw MCP origins collapse to one sanitized canonical ID and replace
   each other before the Registry/Session boundary, or does the catalog fail
   while both exact origins remain available and before any remote invocation?

The same reviewer answered this complete boundary with **Accept** after
reproducing the final AI SDK/native projection and MCP collision oracles. All
`G18-IR-001..008` findings are closed. No implementation/evidence blocker or
material unknown remains. The separately authorized local commit/integration is
complete; push, release, and later-Gate work remain outside this record.
