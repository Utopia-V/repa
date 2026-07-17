# OpenCode fork Gate 10: content-root authority and bounded observation

Status: Contract/theory accepted by the required whole-Gate independent reviewer
on the fifth pass after four `Revise` rounds. The first implementation/evidence
round returned `Revise`; its first closure pass kept `G10-I01` open because
`content_write` still ignored provider cancellation. The second closure pass
accepted that bounded repair and the implementation/evidence layer. All Gate 10
review findings are closed. The accepted working tree awaits separately
authorized integration; Gate 11 remains unauthorized.

Date: 2026-07-17

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Predecessor: [Passed Gate 9 source and Artifact authority](opencode-fork-gate-09-source-artifact-authority-2026-07-16.md)

Decisions: [ADR-0002](../decisions/0002-modes-are-policy-profiles.md),
[ADR-0003](../decisions/0003-learning-state-follows-evidence.md),
[ADR-0007](../decisions/0007-process-local-coordination-and-finite-turns.md),
[ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md), and
[ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record owns the accepted Gate 10 engineering contract and indexes its
accepted implementation/evidence snapshot. The maintainer
decisions recorded below are product authority and have been promoted to the
architecture owner. The identity, transition, implementation, and evidence
sections remain reviewable against production behavior. Contract acceptance
authorized Gate 10 implementation under the maintainer's explicit instruction;
implementation/evidence acceptance establishes review readiness but does not
authorize an integration commit, Gate 11 work, or a broader permission rewrite.

## Why this Gate exists

Gate 9 established logical Artifact identity, immutable raw-byte Revisions,
source-binding history, exact Observations, availability, and provenance, but
deliberately performs no filesystem access. Its caller must supply a trusted
canonical location and a mutation-safe exact observation. Without Gate 10,
Repa can describe source truth but cannot safely acquire it from a learner's
real files.

The current fork has mature local-Agent mechanics—directory/worktree routing,
typed permission requests, file tools, shell parsing, ripgrep, cancellation,
and terminal approval UI—but no Repa-owned durable ContentRoot authority.
`external_directory` is a path-pattern permission, “always” answers are
process-local, project-local configuration can currently widen permissions,
and Shell launches an ordinary host child process after best-effort parsing.
Those mechanics are useful integration substrate, not proof of root identity,
bounded observation, or an operating-system sandbox.

Gate 10 serves the source-acquisition step of the learning loop:

```text
learning situation
-> authorized bounded discovery/read
-> exact source observation
-> Gate 9 Artifact/Revision truth
-> later optional representation and Material Map work
```

Its owned invariant is:

> Every discovery and source observation is reached through an exact effective
> read authority bound to both an authorized path scope and the actual directory
> object; only an active ContentRoot may be reused across operations to widen
> beyond the current workspace. Every accepted `present` Observation describes
> exact stable bytes actually read within that authority. A path, marker, model
> assertion, stale inventory entry, or unrelated inherited tool permission
> cannot manufacture this authority. Observation authority never supplies
> mutation authority; every mediated file write has its own exact grant.

## Accepted maintainer decisions

### ContentRoot binds a directory object and an explicit path

A ContentRoot is not a free path slot. Approval binds the displayed canonical
path and the concrete directory object found there. If the object moves, the
path is replaced, or either identity can no longer be verified, use fails
closed. A different directory at the same spelling never inherits the old
approval. Explicit learner rebind or reapproval may append a new binding while
preserving the old audit history.

The current invocation directory, inherited Git worktree/project root, a Repa
marker/config directory, and an approved ContentRoot may coincide, but they are
not the same concept. A marker or launch location may suggest a candidate; it
never grants authority.

### Model initiation uses a system-owned confirmation

The learner may request approval through natural language. A model may identify
and propose the candidate, but the runtime resolves the actual path and object
and owns a clear confirmation before durable authority changes. A deterministic
slash/command-palette/CLI-equivalent operation must offer the same control
without depending on model interpretation.

If model-initiated entry later proves materially dangerous and cannot be made
reliable without weakening the boundary, Repa disables that entry only. The
deterministic control and underlying ContentRoot authority remain.

### ContentRoot access is mediated and observation-only

An approved ContentRoot authorizes bounded list, inventory, search, read, and
exact observation by the configured Agent/model, including delegated
subagents, through capability-scoped tools. It does not export ambient
filesystem credentials or implicitly expand Shell, MCP, connectors, network,
browser actions, file mutation, Artifact admission, or semantic learning
authority.

A subagent receives no more than the parent's effective capability snapshot. It
may report that broader access is needed so the parent/runtime can surface the
ordinary system-owned request, but it cannot activate or persist a broader root
on the parent's behalf. More-specific deny rules continue to apply inside an
approved root.

### Permission meaning is scope × right × duration × approval

Repa distinguishes:

1. a durable ContentRoot observation grant;
2. workspace full control over exact displayed local roots; and
3. computer full access to local files and local commands available to the
   current operating-system account.

These meanings do not imply one another. Computer full access does not include
network, MCP/connectors, browser actions, remote services, or other external
writes. Those remain separately authorized. No filesystem profile, including
computer full access, authorizes computer-wide indexing, hidden scanning,
automatic Artifact import, or learning classification.

Gate 10 records this vocabulary so ContentRoot semantics cannot later be
collapsed into a `full_access` boolean. It does not implement workspace or
computer full-access profiles. A later owner must assign that broader runtime
work and prove the advertised platform enforcement before Repa exposes those
labels as real containment claims. User-facing controls never say only “full
access”; they use the scope-qualified names and show exact roots and duration.

### Durable authority comes only from a machine-user-owned source

ContentRoot approval persists in LearnerHome until revoked. Workspace full
control and computer full access are temporary by default. A learner may make a
broad profile durable only through machine-user-owned global configuration or
a global permission store.

Project-local `repa.json`/`repa.jsonc`, `tui.json`/`tui.jsonc`, `.repa`
content, markers, source material, and model output are untrusted inputs. Source
material and explicitly retained prompt files may supply untrusted content
through an accepted content boundary. Automatically discovered project config
may contribute only the pointwise permission denials defined below; no project
TUI or other presentation config reaches effective config. Project origin
cannot grant or widen host capability. This rule applies before variable/file
substitution, directory bootstrap, migration, dependency installation, package
resolution, dynamic import, config hooks, merge, or consumer startup—not only
while merging permission fields.

Every config input carries one runtime-owned trust origin before parsing:
machine-user global/managed, explicit machine-invocation, delegated remote
provider metadata, or automatically discovered project. Delegated remote
metadata may describe only the already machine-authorized provider namespace;
it is not generic config authority. Path location alone cannot promote a
project-discovered source. The first Gate 10 implementation compiles each
project layer through an explicit deny-by-default field disposition before it
may join effective config:

- files in the Repa global config directory and operating-system managed
  preferences are machine-global/managed;
- `REPA_CONFIG`, `REPA_CONFIG_DIR`, and `REPA_CONFIG_CONTENT` are
  machine-invocation inputs only because the operating-system process launch
  supplied them, not because their path happens to sit outside a worktree;
- authenticated well-known/fetched config is delegated provider metadata and
  cannot contribute plugins, commands, filesystem/process effects, or another
  provider namespace; and
- files/directories found automatically through the current directory,
  worktree, `ConfigPaths`, or `.repa` walk are project-origin even when a
  symlink, relative locator, or equal value points elsewhere.

Within the project class:

- the only authority-bearing projection is a top-level `permission` leaf whose
  literal action is exactly `deny`, or a legacy top-level `tools` entry whose
  value is exactly `false`; the compiler normalizes both to added deny rules in
  the same permission evaluator after machine-owned selection is fixed;
- every other negative-looking value—including `disable`, `disabled: true`,
  candidate removal, added ignores, `snapshot: false`, nested agent permission,
  and TUI effect disables—is inert. Syntactic negation is not evidence of
  semantic narrowing when it can change candidate identity, order, default
  selection, fallback, or the effect eventually performed; and
- every other project config value is inert, including every main-config
  presentation value and all 12 TUI fields. Executable, loader, process,
  network, filesystem-scope, mutation, external-effect, provider/model-selection,
  tool-authority, input-routing, and unclassified declarations are quarantined
  with an origin-aware diagnostic.

An exact machine-user global declaration remains effective from its own layer;
a matching project repetition contributes no authorization and is unnecessary.
The project layer may only add the pointwise deny rules above; it cannot filter
candidate/default registries or replace a machine-owned declaration. A denied
operation may be omitted only as the direct permission-evaluator result defined
below. This covers all current config and auto-discovery consumers, not only
tools/plugins/MCP. The first Gate 10 implementation adds no broad trusted-project
toggle or project-owned approval response. Repa retains the current JSON/JSONC
configuration lineage; Codex's TOML spelling is reference evidence, not a new
Repa configuration format.

Project `AGENTS.md` and other explicitly retained prompt/source content may
still enter the model as visibly untrusted content through its accepted read
boundary. It cannot choose a provider, add a tool, change permission, execute a
command, install a dependency, or otherwise serve as config authority merely
because the model can read it.

A durable global choice is itself explicit authorization and need not reopen an
identical dialog on every launch. An active computer-full-access profile must
still be conspicuous at startup and directly revocable. Gate 10 implements only
the ContentRoot portion of this policy and the configuration-origin rule needed
to keep local content from self-authorizing.

### Revocation is not retroactive erasure

Revoking a ContentRoot ends future discovery/read/observation authority. It
does not retract bytes already disclosed to a model, erase Session history,
delete Artifact/Revision/Observation/provenance records, undo completed writes,
or delete source or Repa-owned bytes.

Artifact withdrawal separately stops ordinary material discovery and use.
Deleting retained source bytes, deleting an accepted representation, and
deleting the learner's original file remain distinct explicit operations.
In-flight calls retain the authorization snapshot under which they were issued
unless cancellation wins; pending approvals and unfinished scans are never
reconstructed after restart.

## Current evidence

### Accepted Repa authority

- The architecture makes the invocation directory a permission anchor rather
  than LearnerHome, Course, or LearningSpace identity; permits several approved
  roots; forbids implicit parent widening; and separates root approval from
  mutation.
- The architecture already requires bounded inventory/search, visible widening,
  deterministic path/revision capture, lazy semantic inspection, and no
  background daemon.
- Gate 9 makes permission revocation and unreadability separate from Artifact
  byte availability. It accepts a prepared exact observation but imports no
  filesystem or permission service.
- Gate 9 also separates root approval, Artifact admission, withdrawal,
  retained bytes, readable representations, and learner-source deletion. Gate
  10 may call those transitions but cannot reinterpret them.
- ADR-0002 preserves the authorization snapshot of an in-flight tool call.
  ADR-0007 cancels pending process-local approval and unfinished coordination on
  restart. ADR-0008 allows model initiative only behind program-owned durable
  authority.

### Current fork and inherited OpenCode mechanism

The current production fork confirms:

- `packages/opencode/src/project/instance-context.ts` treats the current
  directory or non-global worktree as an inherited project boundary.
- `packages/opencode/src/tool/external-directory.ts` turns an outside path into
  an `external_directory` permission request.
- `packages/opencode/src/permission/index.ts` provides typed
  `allow`/`ask`/`deny` evaluation and approval events, but “always” grants live
  only in process memory.
- `packages/opencode/src/config/config.ts` loads global and project-local
  `repa.json`/`repa.jsonc` and `.repa` layers, and current merged permission
  values do not by themselves preserve the trust origin needed for broad
  grants.
- `packages/opencode/src/config/paths.ts` includes project `.repa` directories;
  `packages/opencode/src/tool/registry.ts` dynamically imports project tool
  modules; `packages/opencode/src/plugin/index.ts` initializes project plugins
  with in-process capabilities before their mutable config hook; and
  `packages/opencode/src/mcp/index.ts` can spawn a project-declared local MCP
  command with the host environment. Permission-field origin tracking alone
  therefore cannot prevent project content from executing or widening its
  effective host capability.
- The bypass is broader than extension loading. `config/variable.ts` performs
  `{env:...}`/`{file:...}` substitution before schema parsing; `config/config.ts`
  writes `.gitignore` and starts detached package installation for discovered
  project `.repa` directories; `config/tui-migrate.ts` may create, back up, and
  rewrite project config during TUI startup; and `config/tui.ts` independently
  installs project plugin dependencies.
- Project LSP commands are spawned on an ordinary file read through
  `tool/read.ts` and `lsp/lsp.ts`. Project formatter commands run after an
  independently authorized edit through `format/index.ts`. `provider/provider.ts`
  can install/import a project-selected provider package and use its configured
  default model on an ordinary sample. `session/prompt.ts` executes shell
  substitutions embedded in a custom command template without routing that
  substitution through the ordinary Shell permission.
- `skill/index.ts`, `session/instruction.ts`, config references, server options,
  and experimental telemetry expose additional project-controlled path, Git,
  network, listener, or external-effect inputs. The separate TUI schema also
  carries plugins, effectful keybindings, notifications, and sound paths. A
  causally complete boundary therefore has to govern the whole project-origin
  load/discovery pipeline before the first side effect.
- `packages/opencode/src/tool/shell.ts` parses likely paths and command
  patterns before launching an ordinary child process. It is useful preflight,
  not a complete containment boundary.
- The inherited ripgrep, cancellation, tool-result, permission-dialog, and
  Session mechanics are mature candidates for bounded Gate 10 operations once
  the Repa authority wraps them.

### Project-origin field and discovery disposition

The current released-v1 main and TUI schemas are exhaustively classified below.
“Inert” means the project value is not present in effective config and cannot
reach its current consumer. A same-named machine-owned value may remain active
from its own source; the project value does not authorize it.

| Current project-origin surface | Current possible first effect | Gate 10 first-implementation disposition |
| --- | --- | --- |
| Config text `{env:...}` / `{file:...}` substitution | Reads process secrets or arbitrary files before schema classification | Reject substitution tokens in project layers before expansion; parsing may read only the bounded no-link config file itself |
| `$schema`, `logLevel`, `username`, `layout` | Schema is metadata; logging can change disclosure or suppress diagnostics; `username` is sent as provider user metadata; layout is deprecated | `$schema` remains inert metadata; `logLevel`, `username`, and deprecated `layout` are inert. Main config has no authority-bearing presentation exception in this row |
| `shell` and `server` | Selects an executable shell or changes listener, mDNS, and CORS exposure | Entire project value inert; only machine-owned/invocation config may supply it |
| `plugin`, auto-discovered tool/plugin modules, provider `npm`/module locators, and TUI plugins | Package install, dynamic import, top-level in-process code, mutable hooks | Entire project declaration and auto-discovery inert before install/resolve/import, including project disable forms |
| `lsp`, `formatter`, and local `mcp` | Starts child processes, sometimes after an unrelated read or edit; filtering may substitute another configured implementation | Entire project value is inert, including `false` and `disabled: true`; only machine-owned/invocation config may supply or disable it |
| Remote `mcp`, `provider`, `model`, `small_model`, `disabled_providers`, `enabled_providers`, and provider/model/agent options | Chooses or indirectly changes a data recipient, endpoint, headers/credentials, package, model, fallback, or remote transport | Entire project value is inert. A project allow/deny list cannot force fallback from the machine/user-selected recipient to another provider |
| `skills.paths`/`skills.urls`, `references`/`reference`, and `instructions` | Expands readable paths, clones/fetches remote content, or injects ambient instructions | Entire project-config value inert. Retained project `AGENTS.md` is untrusted prompt content read only inside the workspace boundary; it is not config authority |
| `command`, `.repa` command markdown, command model/agent selectors, shell substitutions, and file attachments | Registers project actions, selects execution context, starts shell, or reads named files when invoked | Project commands are not registered in the first implementation. Global commands remain; their own file/Shell effects still use the matching authority |
| `agent`, deprecated `mode`, `default_agent`, and `.repa` agent markdown | Changes default prompt, model/options, tool set, permission, loop budget, or fallback candidate | The entire project value is inert, including `agent.disable: true` and nested permission/tool values. Machine-owned selection is computed without project candidate deletion, so project content cannot force another agent/model/capability |
| top-level `permission`, legacy top-level `tools`, `watcher.ignore`, `snapshot`, and every formatter/LSP/MCP/agent/TUI disable form | Changes tool/filesystem authority, candidate sets, background observation, snapshot writes, or fallback | Extract only `permission` leaves whose literal action is `deny` and `tools` entries equal to `false`, normalizing both to pointwise deny rules. All allow/ask values and every ignore, snapshot, disable, deletion, reorder, or filter form are inert |
| `attachment`, `tool_output`, `compaction`, and remaining `experimental` fields including batch tools, primary tools, provider policies, telemetry, and timeouts | Changes resource/output bounds, tool exposure, provider access, retries, telemetry, or external work | Entire project value is inert for Gate 10, including negative or disable spellings; no generic deep merge is allowed |
| TUI `$schema`, `theme`, `keybinds`, `plugin`, `plugin_enabled`, `leader_timeout`, `attention`, `prompt`, `scroll_speed`, `scroll_acceleration`, `diff_style`, and `mouse` | May load code/files, install packages, route input to commands/permission controls, change capture or timed key dispatch, or emit OS notifications/audio | The entire automatically discovered project TUI layer is inert, whether read from `tui.json[c]` or normalized from nested project `repa.json[c]`. `$schema` may remain source metadata for diagnostics but no field reaches effective TUI config. Machine-global/invocation TUI config remains independently effective |
| Project `.repa` bootstrap, `package.json`, `.gitignore`, config/TUI migration, and auto-discovered command/agent/skill/tool/plugin directories | Writes project files, installs dependencies, or scans/loads content at startup | Directory discovery is metadata only. No project write, migration, package install, or auto-discovery runs. Global config directories retain their machine-owned behavior |

Default project `AGENTS.md`/`CLAUDE.md` and project `.agents`/`.claude`
`SKILL.md` discovery are a separate untrusted-content path, not config. They may
remain only as bounded no-link text reads inside the workspace; frontmatter and
referenced scripts grant nothing, and no dependency or script runs during
discovery. Any later model-selected effect still uses its ordinary independent
tool permission.

The disposition is encoded as an exhaustive static map over the current main
and TUI schemas plus explicit non-schema discovery entry points. Adding a field,
nested effect container, or auto-discovery path without a disposition fails the
owning test and is rejected at runtime. Project layers are compiled before the
ordinary merge; consumers never receive raw project config or infer trust from
a matching string after a side effect has already occurred.

This corrects reachability rather than reclassifying or deleting Gate 5's
retained local harness. Machine-owned global config directories and explicit
machine-invocation sources continue to support custom agents, commands, skills,
plugins, providers, MCP, LSP, formatters, and TUI facilities. Automatically
discovered checked-in project declarations no longer activate those mechanisms
by themselves; a later explicit trusted-project design would require its own
owner decision and review.

The pinned OpenCode source audit at tag `v1.17.18`, commit
`b1fc8113948b518835c2a39ece49553cffe9b30c`, shows the same computational
mechanisms. Repa inherits and transforms those mechanisms inside the one-time
fork; it does not add OpenCode as a dependency or preserve OpenCode product
semantics.

### Codex and mature permission models

The pinned Codex comparison checkout at tag `rust-v0.144.1`, commit
`44918ea10c0f99151c6710411b4322c2f5c96bea`, separates:

- filesystem `read`, `write`, and `deny` with deny precedence;
- workspace-root-relative scopes and additional explicit roots;
- filesystem and network sandbox policies; and
- named profiles from approval behavior.

Relevant evidence is in `codex-rs/protocol/src/permissions.rs` and
`codex-rs/core/src/config/permissions.rs`. Codex additionally has
platform-specific sandbox backends, so its workspace/full-access labels make a
stronger execution claim than the current Repa fork can make.

Gate 10 adapts the established capability-rooted model: authority starts from a
verified root object, traversal is relative and contained, more-specific deny
wins, and exact byte use is bound to an opened object rather than trusted from
a path string. It deliberately does not copy Codex's Rust package topology,
TOML configuration, legacy sandbox compatibility stack, or the older
`danger-full-access` coupling of filesystem and network.

### Windows primitive probe and support boundary

An isolated temporary-directory probe on the current Windows baseline used Bun
`1.3.14` over local NTFS. Bigint `stat` and an opened directory `FileHandle`
reported matching nonzero device/object identities. An opened file handle kept
its identity after the path was renamed and replaced, while the replacement
path reported a different object identity. A Windows junction was visible to
`lstat` as a symbolic link and `realpath` resolved its outside target. This is
enough to justify a conservative no-reparse NTFS adapter and focused failure
tests; it is not evidence for ReFS, network filesystems, every reparse tag, or
adversarial race resistance.

Microsoft's [`CreateFileW`](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew),
[`GetFinalPathNameByHandleW`](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew),
and [`BY_HANDLE_FILE_INFORMATION`](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information)
documentation establishes the directory-handle, final-path, volume/object
identity, sharing, and eventual file-ID-reuse constraints that the adapter must
respect. Bun supports stable native dependencies through
[`Node-API`](https://bun.sh/docs/runtime/node-api), while its
[`bun:ffi`](https://bun.sh/docs/runtime/ffi) documentation marks FFI
experimental and recommends Node-API for production-grade native integration.

## Proposed Gate result

After Gate 10:

- LearnerHome durably records ContentRoot identities, globally unique exact
  path/object bindings, and append-only observation-grant episodes
  independently of Session, Project, LearningSpace, Course, and Artifact.
- The runtime can propose, approve, inspect, revoke, and explicitly rebind a
  root without giving a marker, model, project config, or stale path authority.
- The configured Agent and its subagents can use bounded inventory, search,
  read, and exact-observation capabilities over an approved root without a
  repeated prompt for each read, while every widening remains visible.
- Root approval never changes write, Shell, MCP, connector, network, Artifact
  admission, or semantic-classification permission.
- Mediated file mutation uses a separate exact operation grant or durable
  path/subtree grant anchored to its own verified directory path/object
  binding. A ContentRoot may be recorded as provenance but is not the mutation
  anchor; root revoke/rebind therefore neither revokes nor transfers write
  authority. A durable grant is inspectable, versioned, and revocable; neither
  form grants Shell or any broader permission profile.
- The current execution workspace and an exact one-operation learner grant may
  also supply read authority without becoming durable ContentRoots. An exact
  local-file operation under any of these authorities can safely prepare
  `present` or `missing` input for Gate 9. Only a stable authorized read may
  become `present`; only proven absence at the still-bound authorized location
  may become `missing`.
- A learner-selected bounded initialization manifest may be applied by a
  deterministic system/terminal controller. It invokes Gate 9 separately for
  each member, reports exact per-member outcomes, and opens no long
  filesystem/database transaction. It is not one model-visible durable command
  and has no durable batch settlement record.
- Model-visible operations that may commit Artifact state reuse Gate 8's causal
  and physical settlement and commit at most one new Artifact mutation per
  admitted model operation. Pure list/search/read results remain ordinary
  read-only tools.
- Every automatically discovered project config/discovery layer is compiled
  before substitution, merge, install, import, spawn, connect, migration, or
  consumer startup. Only added top-level pointwise permission denies survive;
  every TUI value, presentation value, configuration candidate filter,
  fallback-affecting disable, host-effect-selecting value, and unclassified
  project declaration remains inert while a machine-owned declaration continues
  independently from its own origin.

Gate 10 is a real filesystem-authority and source-observation boundary. It is
not a complete learning loop and does not need to create a Course, Material
Map, readable representation, learner record, or Agenda item.

## Identity and state vocabulary

The contract keeps these meanings distinct:

1. **Execution workspace.** The current harness directory/worktree root set
   used for routing and generic permission evaluation. Its effective profile
   may authorize bounded operations there, but it is not durable ContentRoot
   identity.
2. **Effective read authority.** One immutable operation input derived from an
   active ContentRoot observation grant, the active workspace/profile boundary,
   or an exact operation-scoped learner approval. Only the ContentRoot form is
   a cross-Session discovery grant.
3. **ContentRoot.** Stable LearnerHome identity for one inspectable root
   binding and authorization history. It owns no Course, LearningSpace,
   Artifact, or Session. The identity itself grants nothing.
4. **Exact root binding and binding episode.** An exact binding is the stable
   registry identity for one canonical absolute directory path plus one
   platform-verifiable directory object. It belongs to at most one ContentRoot
   identity across all history. A separate append-only binding episode makes
   that exact binding current for the root; returning explicitly to an older
   exact binding appends an episode that references the same registry identity.
   Legitimate nested roots have different exact bindings.
5. **Observation-grant episode.** One append-only learner authorization to
   perform only bounded discovery/read/observation under one exact binding. A
   root has at most one active episode; revocation closes it, and later approval
   appends a new episode rather than reopening history.
6. **Mediated mutation grant.** An exact once-only invocation grant or durable,
   versioned path/subtree grant for direct file create/modify/delete/rename
   capabilities. A durable grant owns an independent immutable directory
   path/object anchor plus relative scope. It grants no local command execution
   and is never inferred from or lifecycle-bound to observation authority.
7. **Binding verification.** A fresh operational result such as `verified`,
   `unavailable`, `unreadable`, or `identity_mismatch`. It is not a second
   durable root lifecycle.
8. **Authorization snapshot.** The exact effective read authority, including
   root/binding/grant version where applicable and narrower deny rules, captured
   when one operation is admitted. It does not become a transferable token.
9. **Bounded inventory or search result.** A deterministic projection produced
   under one authorization snapshot and explicit budget. It is not source
   truth, Artifact admission, or a durable semantic index.
10. **Candidate manifest.** A bounded immutable result naming only candidates
   returned by one inventory operation. Selection from it authorizes those
   selected import attempts, not unlisted files or future path contents.
11. **Exact file observation.** A mutation-safe prepared result for one
    canonical file under one authorization snapshot. Gate 9 remains the owner of
    the accepted Revision, Source Observation, and current source projection.
12. **Project-origin layer.** Automatically discovered project JSON/JSONC,
    `.repa` directory content, TUI config, or non-schema discovery candidate. It
    is untrusted declaration/content, not machine-user authorization.
13. **Host-effect declaration.** Any config or discovery value, other than the
    exact pointwise-deny projection above, that can select executable code,
    package/dependency work, child process, network/listener,
    provider/model/data recipient, filesystem scope/read/write, external UI
    effect, tool authority, or a broader resource policy. Its first side effect
    is the security boundary; permission evaluation after that point is too
    late.
14. **Project-layer compiler.** The runtime-owned, deny-by-default static
    disposition that extracts only top-level pointwise permission-deny config
    from one parsed project source before ordinary merge. It never projects TUI,
    presentation, candidate-filter, or fallback-affecting values. It is not a
    second config format, policy language, or transferable capability token.

## Owned durable records

Exact SQL and TypeScript names remain implementation choices, but Gate 10 needs
the following durable meanings:

1. **ContentRoot identity.** Generated stable ID and trusted creation time. Its
   current active/revoked disposition is derived from binding and grant-episode
   history rather than stored as an overwriteable authorization fact.
2. **Exact root-binding registry.** Generated stable ID, owning ContentRoot ID,
   canonical absolute path, tagged platform identity descriptor, and identity-
   verifier capability/version. The effective key—canonical path plus the
   stable platform/volume/object identity namespace—is durably unique and cannot
   be assigned to another ContentRoot. A verifier upgrade does not create a new
   key for the same object; an old descriptor that cannot be compared requires a
   typed identity migration/reapproval rather than a duplicate root. Identity
   reuse that cannot be distinguished from an old key is likewise a typed
   ambiguity, not a new grant.
3. **Root-binding episodes.** Generated stable ID, ContentRoot and exact-binding
   IDs, monotonic binding ordinal, start time, optional end time/reason, and
   exact learner approval basis for a rebind. At most one episode is current per
   ContentRoot; returning to an older binding appends a new episode referencing
   its existing registry row rather than reopening history.
4. **Observation-grant episodes.** Generated stable ID, ContentRoot, binding-
   episode, and exact-binding IDs, monotonic grant ordinal/version, immutable
   learner authorization basis, approval time, optional close basis/time, and
   trusted update time. At most one episode is active per ContentRoot.
5. **Current root projection.** ContentRoot ID, exact current binding and
   binding episode, active grant episode/version if any, and derived
   disposition. Verification health is derived when Repa wakes or uses the
   root; an old successful verification is not a live guarantee.
6. **Durable mediated-mutation grant.** Generated stable ID, exact rights,
   independent canonical directory-anchor path and tagged object descriptor,
   verifier capability/version, normalized relative path/subtree scope,
   monotonic version, active or revoked disposition, immutable learner approval
   basis, approval time, optional revocation basis/time, and trusted update
   time. An optional ContentRoot/binding ID is provenance only. Reapproval after
   revoke or anchor replacement creates a new grant rather than retargeting the
   old one. A once-only reply is tied to one exact invocation and remains
   process-local rather than creating this record.

No generic event store, universal capability ontology, provider matrix,
filesystem mirror, candidate-file table, or persisted directory graph is
admitted. A manifest may remain in the exact Interaction/tool result that needs
later selection; it does not become a second source authority.

Durable ContentRoot state lives in the native LearnerHome database and survives
Sessions. Pending approval dialogs, current scans, cancellation signals, open
handles, and operation snapshots remain process-local.

## Authority and lifecycle

### Propose and approve

Proposal is non-authoritative. The runtime:

1. receives a learner command or model-initiated request;
2. resolves the candidate without climbing to an unrequested parent;
3. verifies that it is an accessible directory and derives its canonical path
   and object identity;
4. presents a system-owned confirmation containing the exact path, observation
   rights, durable-until-revoked lifetime, configured-model use, and explicit
   statement that write/Shell/network/external effects are not granted; and
5. after acceptance, serializes one transaction against the globally unique
   exact-binding key. A new key creates one ContentRoot, exact-binding registry
   row, binding episode, and active grant episode. An already active exact key
   returns its existing ContentRoot and episodes. Explicit approval of the same
   revoked exact key appends a new grant episode to that same ContentRoot.

An exact retry against the same current binding and active grant episode is
therefore idempotent even when two first approvals race: the unique-key winner
creates the identity and the loser reads and returns it. The same exact binding
is never assigned to two ContentRoot IDs, so revoking one identity cannot leave
a duplicate grant active.
A candidate that resolves to a conflicting object, a stale confirmation, or an
ambiguous reused platform identity fails rather than accepting whichever object
now occupies the path. User rejection, cancellation, terminal loss, or restart
creates no grant. Nested approved roots remain legal because their canonical
path/object keys differ.

### Verify, suspend, rebind, and revoke

Every operation freshly verifies the current binding and active grant episode.
Temporary absence or unreadability makes the operation unavailable without
closing the episode or changing Artifact availability. An object/path mismatch
suspends effective use.

An explicit rebind/reapproval checks the exact expected root and grant-episode
version, closes any active grant and current binding episode, resolves or
creates the target exact-binding registry row, appends a new binding episode and
grant episode, and advances their ordinals in one transaction. A target exact
binding already owned by the same ContentRoot is reused through the new episode;
one owned by another ContentRoot conflicts rather than merging identities.
Neither a move, matching digest, marker, path recreation, nor model suggestion
can perform this transition.

Revocation checks the exact expected grant-episode version, closes that episode,
and prevents new operations. It leaves the stable root, current binding,
episode history, and completed observations intact. Explicit approval of the
same still-verified binding appends a new episode on the same ContentRoot;
approval of a different binding is the explicit rebind transition above. No
history row is reopened or overwritten as an unversioned toggle.

Concurrent approvals, rebinds, and revocations use exact optimistic
preconditions. There is no last-write-wins merge.

### Separate mutation grants

A direct learner request or system-owned permission dialog may approve one
exact mediated file mutation, reject it, or persist an exact path/subtree grant.
The request shows the independent canonical directory anchor, relative scope,
operations covered, and lifetime. Model prose, ContentRoot approval, a marker,
and project-local configuration cannot supply the approval.

An unambiguous learner instruction to perform one exact ordinary mutation is
itself the once-only authorization and receives no redundant confirmation. A
model-initiated mutation not already covered by current learner intent or an
active durable grant must use the system-owned permission dialog. High-impact
source deletion and broader mutation workflows remain separately scoped.

A once-only grant is bound to the exact physical invocation and expires on its
terminal result, cancellation that wins before mutation admission, or restart.
A permanent grant commits only after learner acceptance, survives restart,
checks its exact version on change, and remains inspectable and revocable.
Revocation affects future mutations and does not undo a completed write.

The durable grant copies and owns its anchor path/object descriptor at approval
time. A ContentRoot/binding used to propose it may be retained as provenance,
but ContentRoot revoke, rebind, deletion, or later reapproval neither closes nor
retargets the mutation grant. Every use reopens and verifies the independent
anchor. Temporary absence is unavailable; movement, replacement, or
unverifiable identity suspends use, and authority over a new anchor requires a
new explicit mutation grant. A grant never follows a ContentRoot to a new
binding.

A relative path or subtree grant intentionally covers future entries created at
those names under the still-bound anchor; it does not grant sibling or parent
paths. One-shot modify/delete operations additionally bind the expected current
target identity. Rename/move checks the source entry and destination parent/name
as separate authorization questions. One grant may satisfy both only when both
relative paths and both required rights are actually in its scope; otherwise
distinct grants are required.

This right is consumed by direct mediated file mutation tools. It does not
authorize Shell, arbitrary child processes, source-file deletion as a learning
workflow, or workspace/computer full control. Those capabilities require their
own rights and enforcement.

### Effective permission

A ContentRoot grants only the Gate 10 observation capability. It is never
compiled into a broad inherited `external_directory = allow` rule. Existing
workspace or separately granted write authority may independently permit a
mutation, but the root grant contributes nothing to that decision.

The active execution workspace may supply an operation-scoped read authority
under its effective profile, and the ordinary permission flow may approve one
exact outside path without creating a durable root. Neither form permits
cross-directory discovery after its scope/lifetime ends, appears in the durable
ContentRoot list, or inherits ContentRoot widening behavior. Gate 10 still binds
the operation to an exact root object/path scope before it may observe Gate 9
source state.

Project-local config can affect authority only through the pointwise deny
projection. Let `M(q)` be the exact permission result for operation query `q`
after machine-owned/invocation agent, model, provider, extension, transport,
defaults, and registered operation identities have been selected. The compiled
project projection is legal only when, for every `q`, its result is either
`M(q)` or `deny`; it cannot select a replacement identity, reorder the remaining
candidates, or trigger an alternate default/fallback. A denied tool may be
omitted from the permission-visible tool set, but that set must be the exact
order-preserving subset of machine-registered tools produced by those deny
results—no substitute may appear. The compiler therefore extracts only top-level
`permission` actions equal to `deny` and legacy top-level `tools: false`; it
does not merge `allow`, `ask`, nested agent permission, `disable`, ignore,
deletion, reorder, or filtering forms. A model or subagent receives a mediated
operation interface and an authorization snapshot selected by the runtime; it
never receives a forgeable grant ID as proof of permission.
For direct file mutation, the evaluator uses the exact once-only invocation
grant or matching active durable mutation grant; observation and command rights
are not fallback matches.

Project source classification occurs before any effect named in the inventory.
Reading the bounded config file itself uses the execution-workspace bootstrap
read authority, rejects links/reparse transitions and size overflow, and does
not authorize a second file read. Project `{env:...}`/`{file:...}` substitution,
directory writes/migration, package installation, auto-discovery, module import,
hook execution, process spawn, transport connection, remote fetch, provider
selection, and external UI effect cannot occur while the source is still raw.

The compiler quarantines every non-deny project config field, including known
presentation/TUI fields, and emits a diagnostic from trusted runtime code. It
then merges only the pointwise deny projection with deny precedence, after
machine-owned selection is fixed. A machine-owned shell, provider, plugin,
command, MCP,
formatter, LSP, or other capability remains active because its own trusted
layer supplied it; project equality is not a grant. Conversely, an ordinary
startup, read, edit, sample, or TUI launch cannot activate a quarantined project
value as a delayed side effect. No consumer may inspect the raw layer or
reconstruct an effectful value from a project-origin diagnostic.

## Path and containment boundary

All Gate 10 operations take an effective read authority plus an authority-
relative path or runtime-generated candidate handle. A durable cross-directory
operation names its ContentRoot; a current-workspace or one-off operation names
the exact runtime scope that authorized it. Raw model-provided absolute paths
are requests to resolve, not authority.

For every path use, the runtime must:

- reject NULs, ambiguous encodings, parent traversal, and platform-invalid
  components before access;
- resolve against the current verified root binding rather than process CWD;
- prove that every followed link/reparse transition and final object remains
  within the same bound root;
- treat unsupported symlink, junction, mount, alias, or reparse behavior as a
  typed refusal rather than falling back to lexical containment;
- bind the opened file's platform identity and metadata to the expected path;
  and
- revalidate the path-to-object and root binding before accepting an
  observation.

Every adapter rejects a link/reparse form it cannot prove safe. Gate 10's first
NTFS adapter rejects all such transitions. A later accepted adapter may follow
an internal link only when containment and object identity remain verifiable. A
lexical prefix, normalized string, `realpath` result captured before opening, or
parsed Shell command is insufficient by itself.

The threat boundary is ordinary concurrent local mutation and accidental or
content-driven escape, not a hostile same-account kernel adversary. The
contract still fails closed whenever the supported platform primitives cannot
justify the claimed result.

### Baseline platform and primitive matrix

Gate 10's required first implementation supports local NTFS volumes on the
accepted Windows baseline. It uses a narrow platform adapter over opened Bun/
Node-compatible `FileHandle`s, bigint `stat`/`lstat` metadata, canonical-path
resolution, and component/reparse inspection. The adapter must positively
classify the volume and produce a tagged directory/file identity that remains
stable while a handle is held. The acceptance probe on Windows NTFS must show
that a held directory/file handle retains its identity while replacement at the
same path receives a different identity.

The NTFS adapter rejects every symlink, junction, mount, or other reparse
transition in a Gate 10 authority-relative path; Gate 10 does not initially
claim safe internal-link following. UNC/SMB and other network filesystems,
ReFS, FAT/exFAT, removable or virtual filesystems, and any volume whose identity
or reparse semantics cannot be positively classified are typed
`unsupported_filesystem`. macOS and Linux continue to run the inherited Repa
harness, but Gate 10 ContentRoot approval is typed unsupported there until a
separate adapter demonstrates equivalent local-filesystem identity, path, link,
and mutation evidence. This narrows one new capability; it does not advertise a
false cross-platform security guarantee or add another runtime.

If Bun's exposed handles cannot implement the positive NTFS classification or
reparse inspection, the adapter may use a mature stable Node-API dependency. It
must not add new non-TypeScript production source without revising the settled
language decision, use experimental `bun:ffi`, parse Shell output as identity,
or fall back to `realpath`/lexical prefix alone. If no allowed primitive can
prove the claim, Gate 10 remains unimplemented rather than weakening it.

### Exact stable-read guarantee

An accepted `present` observation means exactly this: one opened file object was
held for the whole byte stream; the hash and byte length describe only bytes
read from that handle; its tagged identity, size, change/write metadata, and the
held root identity matched before and after the read; and a fresh contained
reopen after the read still resolved the authorized relative path to that same
file identity. Root, component, or file mismatch; size/change drift; unsupported
metadata; short or overlong read; or reparse ambiguity rejects the prepared
observation. A bounded retry starts the whole preparation again and never
reuses bytes from a failed attempt.

The guarantee is an optimistic, detect-and-reject snapshot for ordinary local
concurrency. It does not freeze the file after Gate 9 commits, defeat a hostile
same-account process that can deliberately forge metadata and schedule an
ABA path attack between every check, or treat a Windows file ID as globally
unique forever. Durable descriptors therefore combine the platform/volume tag,
object ID, canonical path, creation/change metadata available to the adapter,
and verifier version, and every operation reopens and revalidates them. Any
possible historical ID reuse that the adapter cannot disambiguate fails closed.

Proven `missing` similarly requires a still-verified root and parent, two
contained absence checks around binding revalidation, and no reparse or
filesystem ambiguity. Permission denial, transient I/O failure, or one failed
lookup is never `missing`.

## Bounded inventory, search, and manifest behavior

Inventory is deterministic metadata work, not model classification. Every
operation has explicit limits for at least:

- directory depth and visited directory/file count;
- elapsed time and cancellation;
- per-entry/path metadata size and total returned bytes;
- supported candidate types and per-file observation size;
- search match count and returned context bytes; and
- link/reparse traversal.

Production defaults are engineering constants/configuration, not product
ontology. Tests must be able to lower each relevant limit and prove termination.
The result states the effective root/binding/grant version, requested scope,
budgets, ignored/protected paths, deterministic ordering, truncation reason,
and whether any frontier remains. Hitting a limit is a successful bounded
result or typed budget outcome, never silent completeness.

Ordinary search begins from the current request's logical working set. A model
may explicitly widen to another approved ContentRoot without another learner
prompt, but the tool record names the widened root and bounded result. No
operation silently unions all LearnerHome roots.

A candidate manifest contains only the bounded entries actually returned. The
learner may select exact files, bounded subtrees represented in that manifest,
or all supported returned candidates. Selection does not cover ignored,
truncated, newly created, or unlisted entries. Before each admission, Gate 10
resolves and observes the current exact file again; stale or failed members
report individually.

A multi-member selection is executed only by a deterministic system/terminal
controller outside a provider-visible Tool invocation. The controller iterates
the immutable selected member keys in deterministic order and performs one
fresh Gate 10 preparation plus one Gate 9 application transaction per member.
It may commit some members before cancellation, failure, or process loss. It
opens no batch-wide SQLite transaction, creates no durable batch coordinator or
terminal Tool Part, and makes no all-or-nothing promise. Each committed member
is already truthful Gate 9 state; unattempted members have no effect. Restart
does not reconstruct the manifest or a pending final batch result, and rerun
begins from a fresh inventory/selection while Gate 9 handles exact existing
state.

Search hits, inventory entries, file reads, and root approval do not admit
Artifacts. A model may interpret bounded candidates and propose a selection,
but only the learner's unambiguous instruction/selection supplies Gate 9's
admission basis.

## Exact file observation and Gate 9 integration

### Prepare outside the database transaction

For a candidate file, Gate 10:

1. captures the active effective-read authorization snapshot;
2. verifies root and contained path identity;
3. opens the concrete file through the safe traversal boundary;
4. records handle/object identity and pre-read metadata;
5. streams the exact raw bytes while computing Gate 9's tagged SHA-256
   fingerprint and exact byte length;
6. derives media type through a trusted deterministic detector rather than
   model assertion;
7. verifies post-read handle metadata, root binding, and path-to-object
   identity; and
8. returns a prepared result only if the byte stream and binding remained
   stable.

No database transaction remains open during traversal, hashing, model work,
permission waiting, or learner confirmation.

Ordinary concurrent mutation, replacement, truncation, growth, link retargeting,
or root rebinding during the read yields a typed stale/mutation result and no
Gate 9 transition. The implementation may use a platform handle, stable
metadata comparison, bounded retry, or a stronger native primitive, but may not
claim exact current bytes from a one-time path check.

### Commit through Gate 9

For an existing active Artifact binding:

- stable bytes prepare `present` with the exact fingerprint, media type,
  observation time, and Gate 10 capability identity/version;
- proven absence at the still-authorized, still-bound location may prepare
  `missing`; and
- permission denial, revoked/suspended root, unreadability, unsupported link
  handling, budget exhaustion, cancellation, or an incomplete/mutated read is
  operational failure and must not masquerade as `missing`.

Gate 9 checks the exact expected Artifact disposition/source/lineage state and
owns the final transaction. Same bytes while already available remain Gate 9's
semantic no-op; changed bytes, missing, and restoration follow Gate 9's accepted
transition algebra.

For initialization admission, a missing or failed member creates no placeholder
Artifact. For an explicit rebind or learner-requested move, the destination
must independently satisfy Gate 10 authority and exact-observation rules before
Gate 9 changes the active source binding.

An external read followed by database failure leaves no false Gate 9 record.
The next attempt re-resolves and rereads; a prepared result is not a replay
authority after its operation lifetime.

### Model-visible settlement

Pure inventory/search/read tools may return ordinary bounded results. If one
model-visible invocation can commit an Artifact admission, source Observation,
or rebind, it must reuse Gate 8's trusted causal occurrence, physical invocation
identity, exact replay/conflict behavior, atomic domain/result settlement, and
recovery rules. One admitted model operation may commit at most one new
Artifact mutation, matching Gate 8's database constraint. A provider-visible
tool result cannot report success before that one Gate 9 transition and terminal
Tool Part settle truthfully.

A model may inventory, explain candidates, or request that the system present a
deterministic batch control, but one provider Tool invocation never performs a
partially committed multi-member manifest. Multiple model-owned admissions
require multiple fresh admitted model operations, each with its own Gate 8
settlement. The deterministic batch controller is not represented as a fake
Assistant Message, Tool Part, or recovered model invocation; its per-member
Gate 9 transactions are system/terminal applications of already explicit
learner selection.

System-owned root approval/revocation is a permission transition accepted in a
system confirmation or deterministic terminal control. It is not authorized by
model prose and does not require inventing a fake Session message when invoked
from the sessionless shell.

## Concurrency, cancellation, and recovery

- An admitted operation captures one immutable authorization snapshot. Later
  policy changes affect new operations. Revocation should request cancellation
  of active root operations, but an already admitted operation may finish under
  its old snapshot if cancellation loses the race; its observation records the
  old capability version truthfully.
- Root lifecycle transitions use exact grant-episode/binding-episode versions.
  Artifact transitions separately use Gate 9's exact preconditions. Neither
  authority silently retries a semantic conflict.
- Inventory/search/read loops cooperate with cancellation and budgets. No
  detached traversal continues after the owning tool/command has terminally
  failed or been cancelled.
- `content_write` has one explicit mutation-admission linearization point. A
  durable-grant invocation checks provider cancellation before entering the
  grant-backed mutation. A one-shot invocation keeps proposal resolution and
  its permission wait cancellable, then checks cancellation again after
  confirmation and before admission. A signal already aborted before proposal
  opens no prompt; cancellation that has won by the admission check performs no
  write. Once the check admits the native mutation, the write is uninterruptible
  and awaited to its real success or failure; a later provider abort cannot
  report terminal cancellation while an irreversible Win32 write continues
  detached.
- Restart reloads only durable root/binding history and Gate 9 state. Pending
  confirmations, open handles, prepared observations, manifest work, and
  partial scans are cancelled and not reconstructed.
- A committed deterministic-batch member remains committed when a later member
  fails or the batch is cancelled. While the controller remains live, its
  system-owned result reports exact completed, skipped, stale, failed, and
  unattempted members. Process loss may remove that ephemeral summary but cannot
  create a nonterminal model invocation or roll back already truthful Gate 9
  state.
- With no background daemon, root verification and inventory drift are observed
  only on application wake, explicit inspection/refresh, or relevant use.

## Learner and model surfaces

Gate 10 requires one deterministic terminal path to:

- propose/approve an exact ContentRoot;
- list active, revoked, unavailable, and identity-mismatched roots with their
  bindings and rights;
- revoke or explicitly rebind/reapprove a root; and
- request a bounded inventory or refresh; and
- inspect and revoke durable mediated-mutation grants; and
- inspect origin-aware diagnostics naming each quarantined project config field
  or discovery owner, its source, and whether an independent machine-owned
  value remained active or a pointwise project permission deny was applied.

Exact command names and dialog layout remain terminal implementation choices.
The system-owned approval must communicate at least:

> Allow Repa to list, search, read, and observe learning content under
> `<canonical path>` until you revoke it. The configured model may receive
> selected content. This does not allow file changes, local commands, network
> access, connectors, or automatic import.

The learner sees truncation, widening, suspended identity, and revocation
outcomes. A model may request these controls and receive their exact result but
cannot emit the approval response itself or hide the scope behind prose.

Workspace full control and computer full access need correspondingly explicit
root sets, rights, duration, and risk language when a later gate implements
them. Their minimum meaning is retained here even though Gate 10 adds no
placeholder toggle:

> **Workspace full control:** Allow Repa to read, create, modify, and delete
> files and run local commands inside `<exact displayed roots>` for `<duration>`.
> Paths outside those roots and network, connectors, browser actions, and remote
> writes remain separately controlled.

> **Computer full access:** Allow Repa, as your current operating-system
> account, to read, create, modify, and delete any local file that account can
> access and to run arbitrary local commands for `<duration>`. This can expose
> sensitive information or cause unrecoverable data loss. Network,
> MCP/connectors, browser actions, and remote writes remain separately
> controlled.

## Implementation ownership

- Native ContentRoot identity, globally unique binding history, append-only
  observation-grant episodes, independently anchored local mediated-mutation
  grants, version checks, and bounded query shapes belong in the Core learning/
  source side of the modular monolith and the native Repa database. They do not
  depend on Session, providers, terminal rendering, Course, Material Map,
  learner state, or Agenda.
- Platform path identity and safe observation use a narrow filesystem adapter
  whose output the ContentRoot authority validates. The first adapter owns only
  the contracted local-Windows-NTFS matrix and typed refusal elsewhere;
  platform-specific stable primitives are required where one cross-platform
  string algorithm would make a false guarantee.
- `packages/opencode` adapts the inherited permission events, terminal
  confirmation, config/TUI source loading, project discovery, tool registry,
  cancellation, Session/Tool Part integration, and ripgrep execution. It does
  not become the durable root owner.
- Gate 9 remains the sole Artifact/Revision/Observation authority. It does not
  import filesystem traversal, permission UI, or ContentRoot semantics. A
  narrow transaction/API adaptation is allowed only when required to preserve
  its accepted preconditions and settlement.
- Gate 8 remains the owner of model-issued durable command settlement. A
  provider-visible operation applies at most one new Artifact mutation. The
  deterministic terminal manifest loop is not a model invocation and creates
  no durable batch coordinator, second runner, invocation ledger, or replay
  system.
- The Repa migration generator owns one forward migration from the accepted
  Gate 9 schema and regenerated fresh-database schema.
- Main-config, TUI-config, delegated-remote, and non-schema discovery origin is
  attached at source enumeration and remains available through diagnostics.
  Project JSON/JSONC is read and parsed without variable/file substitution, then
  compiled through the exhaustive current-schema disposition before merge.
  Project `.repa`/TUI directory enumeration performs no `ensureGitignore`,
  migration, dependency install, command/agent/skill/tool/plugin discovery, or
  other side effect. Machine-owned global directories keep their existing
  separately sourced behavior. The implementation may transform the current
  load/merge/discovery path; it must not add a second JSON/TOML configuration or
  plugin runtime.
- The field/discovery disposition is maintained beside the current ConfigV1 and
  TUI schemas with an exhaustive audit test. New keys are not implicitly pure;
  an unknown top-level key, unknown nested key inside an effect container, or
  new project auto-discovery owner is quarantined until classified. Consumers
  receive only the compiled effective config, never raw project documents.
- The current `external_directory`, generic file tools, and Shell parser may be
  reused behind the accepted boundary, but no compatibility layer may translate
  root approval into ambient outside-directory or Shell access.

Package names are placement, not product ontology. Do not add a generic
`manager`, universal authorization service, filesystem mirror, watcher, index
daemon, or capability framework beyond the concrete root/operation consumers.

## Failure behavior

- A missing, non-directory, inaccessible, platform-unsupported, or
  identity-ambiguous approval candidate fails before a grant is committed.
- Concurrent duplicate first approvals return one ContentRoot identity and one
  active episode. Reapproval after revoke appends an episode to that identity;
  a conflicting exact binding never creates or merges a second root.
- A stale confirmation, grant version, binding version, rebind destination, or
  revocation target fails with the current exact state; no last-write-wins
  update occurs.
- A replaced or moved root suspends effective use. Same path spelling,
  matching contents, marker presence, or model confidence cannot reactivate it.
- Parent traversal, link/junction/reparse escape, unsupported alias behavior,
  and path/object mismatch fail visibly and create no Gate 9 Observation.
- Budget limits and cancellation terminate work with explicit partial/truncated
  status. They never claim a complete inventory or a missing file.
- Permission denial, unreadability, mutation during read, and database failure
  never become Gate 9 `missing`.
- A root grant never makes an edit or Shell command allowed. Any independent
  write authority is evaluated separately and remains visible in its own
  permission result.
- A stale, revoked, outside-scope, wrong-operation, or wrong-invocation mutation
  grant fails before direct file mutation. It never falls back to a ContentRoot
  or Shell permission.
- ContentRoot revoke/rebind does not revoke or transfer an independent mutation
  grant. A stale/replaced mutation anchor suspends that grant, and a move/rename
  lacking either source or destination authority fails before mutation.
- Project config containing `{env:...}`/`{file:...}` fails before substitution;
  it cannot read a secret or outside file merely so the compiler can later
  discard the resulting field.
- Every project config field/container other than an extracted pointwise deny is
  quarantined with a visible source/path diagnostic before merge. Deny leaves in
  the document may still compile, but no raw or partial non-deny container
  reaches a consumer.
- Project `.repa`/TUI discovery never writes `.gitignore`, migrates config,
  installs dependencies, scans auto command/agent/skill/tool/plugin entries, or
  loads or applies any project TUI value as a startup precondition.
- Ordinary startup, read, authorized edit, model sample, custom-command lookup,
  and TUI launch cannot activate a project shell, server, LSP, formatter, MCP,
  provider/package/model, plugin/tool, URL/reference/instruction/skill source,
  telemetry, keybinding, notification, or sound declaration. Only extracted
  pointwise permission denies remain effective; merge order cannot convert one
  to allow or use any other project disable to select a fallback.
- If machine-global config offers a non-default primary agent such as
  `elevated` with a distinct model or broader permission set, project
  `agent.repa.disable: true` and `agent.plan.disable: true` are quarantined. An
  ordinary sample retains the machine-selected default and never falls through
  to `elevated`; machine-owned selection failure remains a failure rather than
  a project-directed substitute.
- Project `leader_timeout` cannot extend or shorten a machine-owned/default
  timed leader sequence. With the default `ctrl+x` leader and
  `messages_undo = <leader>u`, waiting three seconds before `u` cannot dispatch
  `session.undo` merely because project `tui.json` requests 10 seconds.
- Project `mouse` cannot enable or disable renderer mouse capture or change
  whether a click reaches permission controls. In particular, project input
  config cannot make a click reach `onMouseUp` and select `Allow once`/`Allow
  always`, and cannot suppress a machine-owned mouse policy; the entire project
  TUI layer is absent from the renderer's resolved config.
- A model/provider/media limitation changes what can be interpreted or sent,
  not root identity, Artifact availability, or filesystem truth.
- Restart never resumes a confirmation, scan, hash, batch member, or prepared
  observation whose terminal result was not durably settled.

## Explicit non-goals

- no implementation of workspace full control, computer full access, or a
  general operating-system sandbox;
- no broad trusted-project profile, interactive project-effect trust store,
  permission prompt emitted by project code, or automatic promotion/copy of a
  quarantined project value into global config. Effectful project declarations
  stay inert; an independently authored machine-owned declaration is the enable
  path;
- no physical deletion of retained project config, agent, command, skill,
  plugin, provider, LSP, formatter, MCP, or TUI mechanisms merely because their
  automatically discovered project reachability is disabled in this baseline;
- no network, MCP/connector, browser, remote-service, or external-write
  permission profile;
- no computer-wide or all-LearnerHome hidden scan, watcher, daemon, vector
  index, semantic index, or mandatory cache;
- no automatic Artifact import, Course/LearningSpace creation, classification,
  grouping, Material Map, alignment, learner record, or Tutor-policy inference;
- no readable representation, converter, OCR, model translation, canonical
  derived bytes, or selector work (Gate 11 and Gate 12);
- no retained source snapshot writer, blob store, garbage collector, or
  learning-semantic source-file deletion/move workflow; a representative direct
  file tool may consume the separate mediated-mutation grant only to prove that
  permission boundary;
- no remote URL acquisition, website mirror, cloud drive, or multi-user root
  sharing;
- no second Agent runtime, permission runtime, database, configuration format,
  transaction coordinator, or generic event/capability ontology; and
- no Gate 11 implementation or review.

## Closing evidence required

The accepted contract does not let Gate 10 close without focused evidence for
at least:

1. **Schema and restart.** Fresh database and Gate 9 upgrade paths contain the
   root/binding/grant-episode constraints and globally unique exact-binding key;
   active, revoked, reapproved, and rebound history survives restart without
   process-local truth.
2. **Approval authority.** Invocation directory and Repa marker only propose;
   model initiation cannot self-approve; deterministic terminal approval works;
   rejection/cancellation/restart commits nothing. The current workspace and an
   exact one-off approval can authorize bounded use without silently creating a
   durable ContentRoot or widening to a parent. Concurrent duplicate first
   approvals return one identity; revoking it leaves no duplicate path; explicit
   same-binding reapproval appends one new grant episode on the same identity.
3. **Path/object binding.** Same path with a replacement directory, moved same
   object, temporarily absent root, explicit rebind, stale rebind, and exact
   retry all produce the contracted outcomes.
4. **Revocation.** Revoke prevents new operations, remains inspectable across
   restart, preserves prior Artifact history, and handles an in-flight
   operation/cancellation race with truthful capability versioning.
5. **Permission and project-origin separation.** Root approval enables only
   mediated observation; representative direct file mutation remains blocked
   until an exact once or permanent independently anchored mutation grant.
   Permanent grant/revoke survives restart; ContentRoot revoke/rebind neither
   revokes nor transfers it; anchor replacement suspends it; rename/move
   requires source and destination authority; and Shell inherits neither root
   nor mutation authority. No full-access profile is implemented.

   The project-origin boundary additionally requires all of the following
   focused evidence:

   - an exhaustive assertion covers every current ConfigV1 and TUI top-level
      field, each nested effect container, and every `.repa`/TUI non-schema
      discovery owner; adding an unclassified field/path makes the check fail and
      runtime treatment remains fail-closed. The only authority-bearing project
      survivors are top-level `permission` leaves equal to `deny` and legacy
      top-level `tools` entries equal to `false`; every one of the 12 project TUI
      fields is absent from effective config whether acquired from `tui.json[c]`
      or nested project `repa.json[c]`;
   - a canary project document populates every effectful inventory row, both
     substitution tokens, project package metadata, legacy TUI migration data,
     auto command/agent/skill/tool/plugin files, project `.agents`/`.claude`
     skill text with a canary script, an unknown field, and symlinked config/
     discovery entries. Startup performs only the authorized bounded read
     of the config candidate: no secret/outside read, project write/migration,
     dependency install, dynamic import/hook, process spawn, network/listener,
     Git/reference fetch, telemetry, provider/model change, notification/audio,
     or tool/permission widening occurs; retained external skill text is visible
     only as untrusted content and its script is not executed;
   - an ordinary file read cannot start the project LSP; an independently
     authorized edit cannot start its formatter; an ordinary sample cannot
     install/import/select its provider or endpoint; command lookup/invocation
     cannot run project shell/file expansion; and TUI startup cannot install a
     plugin, migrate config, or activate project keybindings/attention effects;
   - machine-owned global declarations for representative plugin/tool, local and
      remote MCP, LSP, formatter, provider/model, server/network, and TUI effects
      remain reachable from their own origin. A project top-level permission
      deny or legacy `tools: false` changes only the same exact permission query
      to `deny`; project replacement, enable, ignore, snapshot, and every
      candidate-filtering disable remain inert and fail visibly;
   - a machine-global non-default primary `elevated` has a distinct model and
      broader permissions while the built-in `repa` remains the machine-selected
      default. Project `agent.repa.disable: true` and `agent.plan.disable: true`
      leave the ordinary sample on `repa` and never select `elevated`. An
      exhaustive semantic-monotonicity assertion applies every surviving
      project field: each permitted deny changes only matching exact queries to
      `deny`. Agent/model/provider/default/fallback selection remains unchanged;
      any permission-visible tool set is the exact order-preserving subset that
      removes only denied tools and introduces no substitute;
   - with machine/default `leader_timeout = 2000`, default `ctrl+x` leader, and
      default `<leader>u` undo binding, project `leader_timeout = 10000` followed
      by `ctrl+x`, a three-second pause, and `u` does not dispatch
      `sdk.client.session.revert`. Symmetric project timeout changes cannot alter
      a machine-global timed-leader policy;
   - project `mouse: true` cannot override machine-global mouse-off and project
      `mouse: false` cannot override machine-global/default mouse-on. Renderer
      capture and permission-prompt `onMouseUp` behavior remain exactly the
      machine-owned result, so project TUI cannot activate or suppress `Allow
      once`/`Allow always`; and
   - delegated well-known config may update only the already authorized provider
     namespace. Canary plugin, command, LSP/formatter/MCP, filesystem, server,
     telemetry, or second-provider fields from that response remain inert before
     their first effect.
6. **Containment and supported matrix.** On a positively identified local NTFS
   volume, held root/file handle identity, same-path replacement, relative
   traversal, absolute-path injection, symlink and Windows junction/reparse
   escape, root replacement during traversal, and A/B/A mutation fail or succeed
   exactly as claimed. UNC/network, ReFS, FAT/exFAT, unsupported Windows storage,
   macOS, and Linux return the typed unsupported result rather than a lexical or
   `realpath` fallback.
7. **Bounded inventory/search.** Deterministic order, every limit, truncation
   frontier, explicit widening, ignored/protected paths, cancellation, and no
   implicit union of roots are executable at small test budgets.
8. **Manifest admission.** Exact file/subtree/all-returned selection cannot
   include unlisted or post-manifest files; stale/missing/failed members report
   independently. Failure injection and process loss between members preserve
   committed Gate 9 state, create no effect for unattempted members, create no
   pending/final Tool Part, and reconstruct no durable batch.
9. **Mutation-safe observation.** Same-path new bytes, A→B→A, missing,
   restoration, file growth/truncation/replacement during read, unreadable
   source, cancellation, and database failure feed Gate 9 without false
   `present` or `missing` claims.
10. **Gate 8 settlement.** Any model-visible state-changing source command has
    exactly one possible new Artifact mutation with exact replay/conflict and
    atomic terminal Tool Part/domain settlement. A model-visible multi-member
    attempt is rejected/decomposed before effect; read-only tools and the
    deterministic system/terminal batch create no fake learning command.
11. **Boundary audit.** No startup scan, watcher, ContentRoot-to-Course owner,
    automatic semantic import, readable representation, full-access claim,
    second config runtime, preview-v2 execution, or Gate 11 code becomes
    reachable.
12. **Package evidence.** Focused tests run from their owning packages with the
    affected package typechecks. Broader build/suite evidence is added only
    where the final dependency reach makes it causally relevant at Gate close.

Tests must exercise real filesystem objects and native SQLite where practical.
Path containment, mutation, and restart claims are not adequately proven by
mocking a string normalizer or duplicating implementation logic in fixtures.
Platform-specific evidence must include Windows for junction/reparse and
identity behavior rather than inferring Windows safety from POSIX symlink tests.

## Accepted implementation/evidence

This section records the production snapshot accepted by the required
implementation/evidence review. It is evidence, not an integration commit or
authority to begin Gate 11.

| Contract boundary | Production owner | Accepted evidence |
| --- | --- | --- |
| Durable root, exact-binding registry, append-only binding/grant episodes, optimistic revoke/rebind, and independently anchored mutation grants | [`packages/core/src/content-root.ts`](../../packages/core/src/content-root.ts), [`packages/core/src/content-root/sql.ts`](../../packages/core/src/content-root/sql.ts), and Gate 10 migration/schema generation | Native-SQLite fresh/upgrade equivalence; concurrent duplicate approval; revoke/reapproval; replacement/rebind/stale-version behavior; active and revoked root/mutation authority across runtime restart; one durable learner approval maps to one grant across exact retries; unknown persisted verifier versions remain unchanged and fail typed; source and destination rename rights are verified separately |
| Conservative local-NTFS containment and exact observation | [`packages/core/src/content-root/ntfs.ts`](../../packages/core/src/content-root/ntfs.ts) | Win32 handles remain open across component traversal and byte reads; `GetFileInformationByHandleEx` supplies volume/file identity and stable metadata; every reparse point and non-NTFS/UNC namespace fails closed; tests cover junction escape, path injection, same-path replacement, concurrent external rewrite, double-checked missing, typed non-Windows refusal, whole-operation inventory/search budgets, provider cancellation, and an in-flight revoke snapshot |
| Machine-user trust origin before project effects | [`packages/opencode/src/config/project-layer.ts`](../../packages/opencode/src/config/project-layer.ts), config/TUI loaders, discovery owners, agent/tool/skill/instruction consumers, and machine-only theme discovery | The compiler exhaustively classifies 31 main-schema fields, 12 TUI fields, and 12 non-schema discovery owners. Only literal top-level permission denies and legacy `tools: false` survive. Project substitution, migration, install/import/spawn/provider/default/TUI input routing and every disable/filter fallback remain inert; global/managed/explicit invocation mechanisms remain independently reachable. Consumer tests drive ordinary read-to-LSP, edit-to-formatter, sample-to-provider, command expansion, delayed-leader undo, and mouse permission controls |
| Learner/model controls and capability separation | [`packages/opencode/src/cli/cmd/content.ts`](../../packages/opencode/src/cli/cmd/content.ts), [`packages/opencode/src/tool/content-root.ts`](../../packages/opencode/src/tool/content-root.ts), and the inherited permission UI projection | Terminal commands approve/list/revoke/rebind/inventory roots, manage separate mutation grants, and display origin diagnostics. Runtime-created approval tokens bind the exact proposal and rebind ID/versions. Model observation tools never create mutation authority; a one-shot mutation confirmation cannot be bypassed by a pre-existing allow or persisted through an `always` reply, while a separately approved durable grant remains independently revocable. Pre-admission provider cancellation performs no mediated write; an admitted native write is awaited and reports its real outcome. ContentRoot grants no Shell/network/full-access authority |
| Immutable manifest selection and Gate 9 application | [`packages/opencode/src/content-root/manifest.ts`](../../packages/opencode/src/content-root/manifest.ts) | The deterministic terminal controller rejects an already-aborted operation before inventory, freezes sorted candidate keys, revalidates each file object against its selected key, and runs one fresh Gate 9 transaction per member. Same-name replacement becomes `stale`; cancellation reports later members unattempted; injected controller loss leaves only truthful committed Artifacts and creates no learning-command invocation or Tool Part |
| Released executable path | [`packages/opencode/script/build.ts`](../../packages/opencode/script/build.ts) | Windows packages include the architecture-matched Koffi 3.1.1 Node-API sidecar and MIT license. The build obtains only the Windows target packages with `--no-save`; compiled startup keeps Bun dotenv/bunfig autoload disabled. The current Windows x64 build smoke creates an isolated database/root, approves it through the real CLI, inventories a stable file through the packaged native module, and removes the fixture |

The repaired same-context evidence run on the accepted Windows x64 baseline
currently includes:

- Core ContentRoot authority and database lineage: 33 tests passed with 194
  assertions. The 11 authority tests use real NTFS objects and native SQLite;
  the 22 migration tests include the Gate 9-to-10 no-fabrication upgrade.
  Core typecheck and generated migration equivalence check passed.
- Gate-scoped OpenCode behavior: 273 project-compiler, main/TUI acquisition,
  instruction, skill, permission, ContentRoot-tool, manifest, and terminal
  permission tests passed with 629 assertions; the one pre-existing
  remote-instruction test remains explicitly `todo`.
- Provider behavior: all 95 provider tests passed with 224 assertions,
  including machine-invocation plugin config lifecycle and provider filtering;
  automatically discovered project plugins remain inert.
- Required consumer chains: four backend tests passed with 14 assertions for
  ordinary read-to-LSP, authorized edit-to-formatter, sample-to-provider, and
  command shell/file expansion. One real TUI integration test passed with eight
  assertions for delayed leader-to-undo and mouse-to-permission-control routing.
- TUI package: 21 theme/config/keymap tests passed with 48 assertions. Core,
  OpenCode, and TUI package typechecks all passed.
- `bun run script/build.ts --single --skip-install --skip-embed-web-ui` passed both
  the existing version smoke and the new compiled ContentRoot native smoke.

No preview-v2 executor, full-access profile, watcher, readable representation,
Course owner, automatic semantic import, or Gate 11 implementation is added.
The generated release artifact under `packages/opencode/dist` is ignored build
output, not durable evidence or a checked-in binary.

## Design evidence provenance

| Source | Pin / status | Preserved invariant | Deliberate difference |
| --- | --- | --- | --- |
| Repa architecture and Gate 9 | Current normative production-fork documents; Gate 9 passed at `41db7c292` | ContentRoot is capability, not learning identity; exact observations remain Gate 9-owned | Gate 10 adds real filesystem authority without moving Artifact semantics |
| Current Repa fork | Current branch at contract derivation | Directory/worktree routing, permission events, terminal UI, tools, ripgrep, cancellation | Existing permission/config semantics are transformed and cannot claim sandbox enforcement |
| OpenCode | `v1.17.18` / `b1fc8113948b518835c2a39ece49553cffe9b30c` | Mature local harness and outside-directory permission mechanics | No runtime dependency, compatibility target, or inherited workspace product meaning |
| Codex | `rust-v0.144.1` / `44918ea10c0f99151c6710411b4322c2f5c96bea` | Scope/right separation, deny precedence, explicit workspace roots, independent filesystem/network policy, platform enforcement | Repa retains JSON config, separates local full access from network, and does not copy Codex's runtime or legacy mode stack |
| Capability-rooted filesystem model | Established security model plus Microsoft handle/file-identity and Bun Node-API evidence above | Start from an authorized directory object, traverse relatively, bind use to opened objects, fail closed on unverifiable escape | Gate 10 first proves a conservative no-reparse local-NTFS adapter and types other filesystems unsupported; no package topology is prescribed |

The local reference materialization remains read-only and outside this Git tree.
Production imports no code from it.

## Independent review handoff

The maintainer explicitly invoked the current whole-Gate independent-review
loop for contract/theory and later implementation/evidence. Review run
`gate10-whole-7d33ad2f934d4a01a459e0f7c741de4f` returned `Revise` on four contract
passes. The second pass closed `G10-C02`, `G10-C03`, and `G10-C04`; `G10-C01`
remained open because the first repair covered only tools/plugins/MCP while
project LSP, formatter, provider loading, dependency installation, and other
config/discovery consumers still produced effects. The third pass found that
the broadened inventory still treated syntactically negative `agent.disable`
as narrowing even though candidate deletion could redirect an ordinary sample
to another machine-global agent, model, and permission set. The fourth pass
confirmed that repair but proved project `leader_timeout` could keep a timed
leader armed long enough to dispatch `session.undo`, while project `mouse` could
change renderer capture and permission-control activation.

The current `G10-C01` repair moves the boundary before project substitution and
discovery, inventories every current main/TUI field and non-schema owner, keeps
all project TUI, presentation, host-effect-selecting, and unclassified values
inert, and permits only top-level pointwise permission denies. Every disable,
ignore, snapshot, candidate deletion, fallback-affecting value, and input-routing
control is inert regardless of spelling. The repair also prevents project
bootstrap, migration, installation, and auto-discovery side effects and makes
the inventory fail closed when schemas or discovery owners grow. This is a
technical completion of the accepted machine-user trust-origin decision, not a
new maintainer-owned product choice.

The same original top-level reviewer accepted contract/theory on the fifth pass.
`G10-C01`, `G10-C02`, `G10-C03`, and `G10-C04` are closed with no new
acceptance-changing finding. Under the maintainer's explicit standing
authorization, implementation proceeded against this contract.

The first implementation/evidence pass from that reviewer returned `Revise`:

- `G10-I01` found that search started a second effective budget after inventory,
  did not check time or cancellation while scanning prepared files, model tools
  ignored the provider abort signal, and manifest checked cancellation only
  after inventory.
- `G10-I02` found that a preconfigured permission `allow` could bypass the fresh
  exact one-shot mutation dialog.
- `G10-I03` found that replaying one durable learner approval could mint several
  independently active mutation grants.
- `G10-I04` found that persisted unknown verifier versions were silently
  materialized as the current adapter version.
- `G10-E01` found that compiler-level quarantine tests did not exercise the six
  required LSP, formatter, provider, command, timed-leader, and mouse consumers.

The repair gives inventory and search one operation clock, checks deadline and
cancellation across file and line scanning, propagates `Tool.Context.abort`, and
rejects an already-aborted manifest before inventory. Exact one-shot mutation
asks now require a real prompt even in the presence of an allow rule, still
honor denies, and cannot persist. A mutation-grant approval carries one stable
grant identity so exact retry returns the same active or revoked authority.
Persisted verifier versions are preserved and unsupported versions fail typed
for roots and mutation anchors. The six consumer chains above now run through
their real operation boundaries. These are technical repairs under the accepted
contract, not new maintainer-owned decisions.

The first implementation/evidence closure pass closed `G10-I02`, `G10-I03`,
`G10-I04`, and `G10-E01`, but kept `G10-I01` open. The observation tools now
propagated provider cancellation, while both durable and one-shot branches of
`content_write` still executed directly; a signal aborted before invocation
could therefore consume mutation authority and change the file. The bounded
repair makes proposal and permission waiting cancellable, checks the signal at
mutation admission for both write forms, and runs an admitted mutation
uninterruptibly to a truthful terminal result. Direct regressions cover a
pre-aborted durable write, a pre-aborted one-shot write with no prompt, a
cancellation after confirmation but before admission, and cancellation after
admission while a controlled real grant-backed write remains in flight.

The second implementation/evidence closure pass independently replayed both
pre-aborted write counterexamples, varied cancellation while confirmation was
pending and after one-shot admission, and reran the focused production
regressions and typecheck. It closed `G10-I01` and accepted the layer with no new
finding. The whole-run matrix is therefore closed for `G10-C01`–`G10-C04`,
`G10-I01`–`G10-I04`, and `G10-E01`.

Both required Gate 10 review layers are accepted. The working tree is ready for
a separately governed integration step; no integration commit is implied by
review acceptance, and Gate 11 remains outside this record and unauthorized.
