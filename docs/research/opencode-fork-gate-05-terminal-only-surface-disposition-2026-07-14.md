# OpenCode fork Gate 5: terminal-only surface disposition

Historical result: Passed on 2026-07-14 at
`25e51861effbddbdb04ae8fe88c4107d34ab91b2`, then corrected and historically
closed on 2026-07-15. Independent top-level reviewer task
`019f6599-2914-7f02-849d-412862338271` accepted both the corrected contract and
implementation/evidence after one `Revise` round.

Current status: Closed again at corrective integration commit
`9e91d43c629b66d65c8741e342bca7cf05de5667`. The 2026-07-27
first-principles audit had scoped-reopened the active build, outward-identity,
permission, and product-surface boundaries. Runtime Web routes remain
disconnected and the hibernated client source need not be deleted. The
corrective snapshot below makes the ordinary build terminal-only, corrects
reachable schema/network identity, and closes the accepted permission
counterexamples. Current disposition is owned by
[the documentation index](../README.md).

Date: 2026-07-14

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decisions: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md)
and [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Starting fork commit: `6fd9f6449b1b90c12c12ac1ed03fb009fceeafe4`

## Parent uncertainty

Can Repa make the first terminal-only local product truthful by disconnecting
ordinary paths to inherited account, group, hosted, marketplace, sharing,
commercial-provider, updater, Web, and Desktop product behavior while
preserving both useful local Agent capabilities and harmless hibernated source?

This gate is about product reachability, startup, current release composition,
and truthful configuration. It does not impose a source-deletion quota, add
learning authorities, migrate nonexistent user data, rename every internal
symbol, or make an excluded feature appear absent by leaving a broken command,
menu item, route, background call, or fallback endpoint behind.

## Accepted product boundary

The first accepted client is the local terminal product. Local TUI, direct
`run`, `attach`, `serve`, ACP, MCP, provider/model selection, Sessions, agents,
tools, explicit local plugins, and generic explicitly configured custom
providers remain. File, shell, Git, LSP, patch, worktree, code review, and
repository initialization remain available as explicit local capabilities
when their behavior is truthful; they do not define Repa's ordinary ontology.

The following inherited product semantics are excluded:

| Surface                                                 | First-baseline disposition                                                                                                        | Preserved reduction                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| OpenCode account, organization, and Console             | disconnect registration, startup, network, and visible configuration; hibernate harmless source                                   | local provider credentials and neutral custom endpoints                                   |
| public sharing and share import                         | disconnect public/automatic paths and share-link import; hibernate implementation and direct tests                                | independently meaningful local Session/file import                                        |
| sync, remote workspace, installation, and control plane | disconnect remote registration, selectors, startup, and network; hibernate unused remote implementation                           | local directory routing and Instance context                                              |
| hosted Web and Desktop clients                          | remove public launch, proxy, automatic build, and current release reachability; hibernate clients                                 | terminal `serve` only where it supports retained local clients/protocols                  |
| marketplace browsing or installation                    | unregister and hibernate                                                                                                          | local plugin discovery and enable/disable behavior                                        |
| hosted GitHub Action and release integration            | unregister and hibernate; restore local `pr` without share-link import                                                            | ordinary local Git, PR checkout, Repa launch, and explicit review capability              |
| inherited GitHub repository workflows                   | unregister the upstream-owned definitions and hibernate their source                                                              | a future Repa-owned CI/release design is a separate engineering decision                  |
| first-class OpenCode Zen/Go products                    | remove catalog identity and all ID-specific behavior                                                                              | neutral generic custom-provider configuration                                             |
| inherited updater and upgrade UX                        | disconnect route, configuration, startup, background work, and current release surface; hibernate implementation and direct tests | no active updater until Repa owns release provenance, integrity, rollback, and migrations |

A mixed command or module is classified by behavior before disposition. The name
`import`, `plugin`, `workspace`, or `serve` is not sufficient evidence that all
of its behavior is excluded. Conversely, unregistration does not prove that
source must be retained forever: physical deletion remains available when a
concrete conflict, maintenance cost, security risk, or explicit product
rejection is established.

## Parent correction and current classification

The earlier contract silently strengthened “outside the first baseline” into
“no dormant implementation may remain,” then used dependency closure as its
proof. That inference is invalid. Commit `5edbd8638` implemented it,
`0d393ec27` recorded it as success, and `04a2d91a0` extended it to providers and
the updater. No further physical deletion is authorized by those records.

A 2026-07-15 post-Gate-7 audit and the following Gate 5 grill also invalidated
the later completion claim without reviving that deletion policy:

- production still exposes the preview-v2 execution family—`active`, `prompt`,
  `compact`, `wait`, and `interrupt`—and installs its live local runner. Only
  `prompt` admits durable input and normally wakes model execution; the other
  four either expose that same coordinator or advertise unavailable execution
  operations. Gate 5 must remove this family from the production protocol,
  handler composition, OpenAPI, and generated current clients, and bind the
  retained v2 data services to the non-executing layer. The v2 execution
  implementation, declarations, runner, and direct tests remain hibernated
  source rather than being physically deleted;
- `opencode*` provider IDs still receive request headers and native-runtime
  eligibility, while released provider discovery bypasses the filtered
  projection and provider login, `models`, and the run mini picker still
  recommend, prioritize, or label the commercial provider specially; and
- the server still automatically trusts inherited hosted and dormant-client
  origins—`https://*.opencode.ai`, `oc://renderer`, and Tauri origins—despite
  those products being outside ordinary baseline reachability.

An explicitly configured provider named `opencode` may remain, but it must use
the same generic behavior as any other custom provider. Localhost, same-host,
and explicitly configured CORS remain independently valid. A deliberately
launched dormant Desktop client may supply its required origin explicitly; it
does not need a global implicit grant.

| Classification           | Current Gate 5 disposition                                                                                                                                                                                                                                                                                                                   | Controlling reason                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep                     | Correct account/share/sync startup and network disconnection; hosted UI proxy and remote-route removal; retained v2 data/read transitions; local `pr`, Git/project-copy, directory, provider, MCP, plugin, Session, and terminal harness behavior                                                                                            | These changes establish truthful runtime boundaries or retain independently useful local behavior.                                                                                                                              |
| Repair                   | Decision authority; `PrCommand` and hosted GitHub Action classification; Gate 5D5 activation/hydration scope; updater reachability; inherited workflow registration; production v2 execution registration/composition; remaining provider-ID request/native/CLI presentation and discovery projection; inherited implicit client-origin CORS | The earlier classification and scope repairs remain complete. The post-Gate-7 v2, provider, and CORS residues are the bounded open work recorded above.                                                                         |
| Hibernate                | Preview-v2 execution implementation, declarations, runner, and direct tests; Web/Desktop and marketplace source; hosted GitHub Action source; the direct OpenCode provider plugin/tests; updater implementation/tests; dormant commercial retry dialog/art                                                                                   | These are outside current runtime reachability and support promises, but their source has no demonstrated conflict or continuing cost.                                                                                          |
| Delete or remain deleted | Share-link import; automatic/public share owners that would require restoring removed account/config/Console authority; first-party provider magic branches; updater routes/config/events and other misleading public registrations                                                                                                          | These specific branches either conflict with the accepted runtime boundary or cannot be restored without a false compatibility shell. This is evidence for those branches, not a precedent for deleting whole dormant products. |

Gate 5D5's `00061ce34` local-directory invariant is accepted after the
`af506b635` necessity repair. The active view needs one atomic directory
publication and generation-safe hydration, but it does not need `Project.sync`
as a second activation authority, all-or-nothing cache commit, automatic retry,
or a general concurrency framework. `Sync.bootstrap` is the single publisher;
successful caches commit independently and failures leave truthful partial
state.

## Native owners

Reachability is owned by the registry that ordinary execution actually
consults:

- root CLI command and option registration;
- released HTTP API group and handler composition;
- local directory/workspace routing middleware;
- config schema, config loading, bootstrap nodes, and startup effects;
- terminal command, keybinding, dialog, tip, and action registration;
- provider catalogs, built-in provider plugins, and ID-specific transforms;
- package scripts, client generation, release composition, and physical module
  dependencies; and
- GitHub's exact `.github/workflows` registration directory.

Tests that only instantiate an implementation directly do not prove public
reachability. Search residue alone does not prove reachability either. Each
slice must show both the absence of its public route and survival of the
retained local behavior at the owning registry.

## Implementation history and Gate 5 closure

Gate 5 is one product Gate. The 5A–5F labels below are retained only as
historical locators for existing commits; they are not a continuing ladder of
user-visible micro-Gates. Atomic commits remain useful rollback units without
creating new product contracts.

The earlier parent correction resolved three questions; those results remain
valid but do not close the later audit findings:

1. Runtime registries, startup/config/network owners, provider policy, and
   updater reachability now exclude the inherited product behavior while
   retained local behavior remains truthful.
2. Local `pr` and the hosted/share branch are classified by their independent
   effects rather than by a last-caller closure.
3. Gate 5D5 now contains the state needed for one local-directory boundary
   without its duplicate authority or speculative retry framework.

The final parent question concerned all 26 inherited GitHub workflow
definitions in GitHub's active registration directory. They covered not only
deploy, publish, Desktop, hosted-action, extension, container, and UI builds,
but also upstream community-governance bots, hosted Agent/review entry points,
repository-writing generation jobs, and inherited CI. A few jobs guarded
themselves to an upstream repository; most did not, and a job guard did not
make the workflow an unregistered Repa definition. The inherited CI was not a
truthful exception: it assumed upstream branches and Blacksmith runners and ran
package scope that includes deferred clients. Commit `25e51861e` moved every
inherited definition out of `.github/workflows` without changing its content.
Designing a new Repa-owned CI remains explicitly outside Gate 5 and awaits a
real repository, branch, runner, and verification contract.

## Gate 5A locked contract: CLI front door

### Subquestion

Can the ordinary root CLI stop exposing clearly excluded hosted product
behavior without removing offline backup/restore, explicit local or npm plugin
installation, local statistics, `serve`, or any other retained local harness
capability?

### Owning changes

- `packages/opencode/src/index.ts` unregisters `ConsoleCommand`, `WebCommand`,
  and the hosted `GithubCommand`. It retains `ServeCommand`, `ImportCommand`,
  `PluginCommand`, the local database `StatsCommand`, and the other local
  Agent/MCP/provider/Session/database/export commands. `PrCommand` is restored
  after reducing away OpenCode share-link import.
- `packages/opencode/src/cli/cmd/run.ts` and
  `packages/opencode/src/cli/cmd/run/runtime.ts` remove the `--share` option and
  every CLI-owned direct-run share callback. This closes the explicit CLI
  trigger; automatic sharing reached through Session HTTP creation and
  startup synchronization remains owned by Gate 5B/5C rather than being
  silently counted as part of this slice.
- the import command is narrowed to local JSON. It retains offline
  export/import and current project/directory rebinding, while removing share
  URL parsing, authenticated network fetch, old/new share API fallback, and
  `ShareNext` dependencies. An HTTP(S) input fails immediately with a clear
  local-file-only error rather than falling through to a vague missing-file
  error.
- `PluginCommand` remains intact. Local paths, `file://`, explicit npm package
  specs, server/TUI targets, workspace or machine-user configuration,
  `--global`, and `--force` are explicit package distribution and local
  configuration; no account, organization, marketplace discovery, or control
  plane participates.
- root package shortcuts for Console, hosted statistics/SSO, and the deferred
  Web/Desktop/Storybook/translation clients are removed. Their workspaces and
  implementations may remain hibernated.

The original Gate 5A classification of `PrCommand` was wrong. Its `gh pr
checkout` plus local Repa launch is independently useful and truthfully
explicit; only the branch that parses and imports OpenCode share links from
pull-request text is excluded. The correction restores the local command
without restoring hosted sharing behavior.

### Evidence

- root help and help snapshots expose no `web` or hosted `github` command;
  the hidden Console command is also unreachable by direct invocation. They do
  expose the reduced local `pr` command.
- `run --help` has no share option, and supplying `--share` is rejected before
  Session execution. Source and focused tests show that no direct-run share
  callback remains.
- a local JSON `import -> export -> delete -> import -> export` round trip
  preserves Session, message, part, and current project/directory rebinding.
  HTTP(S) import fails locally without a network call, account header, or
  share API fallback.
- `plugin`, `serve`, local `stats`, and the other retained root commands remain
  registered and keep their help contracts.
- only the CLI help/snapshot tests, import tests, direct-run process tests, and
  the OpenCode typecheck are causal for this historical slice. HTTP, TUI,
  provider, and broad monorepo tests belong to later owners.

Because the default command accepts a project argument, a removed word such as
`web` may be interpreted as a local project path. The negative contract is that
the old command handler and hosted effect are unreachable, not that every
former command word must produce exit code 1.

### Exclusions and rollback

Gate 5A does not decide HTTP/TUI share paths, hosted UI proxying, config keys,
provider semantics, generated clients, or physical implementation
disposition. Its correction is selective: restore reduced local `pr` behavior
without restoring share-link import, Console/Web/GitHub registration, or the
removed `run --share` and HTTP(S)-import paths. No schema or user-data rollback
is involved.

## Gate 5B locked execution boundary: HTTP and routing

Gate 5B is not one route-deletion patch. Typed Console, share, workspace,
sync, and control-plane endpoints still have released TUI consumers; deleting
their schemas and regenerating the SDK first would either break the terminal
product or force a compatibility shell. Gate 5B therefore begins with two
schema-neutral slices, then pauses for the owning Gate 5D consumer cutover
before typed route removal and SDK regeneration.

### Gate 5B1 — remove the hosted Web catch-all

`packages/opencode/src/server/routes/instance/httpapi/server.ts` removes the
raw `uiRoute`, its `serveUIEffect` import, and its merge into the production
route tree. The helper implementation remains dormant; any later physical
source decision requires separate conflict, cost, risk, or product evidence.
This slice changes public reachability, not the typed API.

Evidence requires:

- `/`, `/site.webmanifest`, and an arbitrary unknown path return direct 404
  responses from the production route tree and make no hosted Web request;
- `/doc` and `/global/health` remain reachable; and
- no SDK or generated artifact changes, because the catch-all was never in
  the typed API.

This slice must land before typed route deletion so a removed API path cannot
fall through to a hosted UI proxy. Reverting its implementation commit is its
complete rollback; it changes no schema or user data.

### Gate 5B2 — make HTTP Session creation locally complete

The Session HTTP handler creates a Session through `Session.Service` directly
rather than `SessionShare.create`. With legacy `share: "auto"` or the runtime
auto-share flag enabled, an HTTP create still succeeds but makes no share
upstream request and persists no share as a side effect.

At this slice, the explicit typed share/unshare endpoints and `SessionShare`
service remained temporarily because the TUI still consumed them. Their public
removal belonged to the later typed-route slice after Gate 5D removed those
consumers. Instance bootstrap still initializes `ShareNext`; Gate 5C owns that
startup/background path. Thus Gate 5B2 closes only the HTTP-create trigger and
does not claim the gate-wide no-share invariant.

Evidence requires a production HTTP Session-create request under automatic
share configuration, a successfully readable created Session, and a bounded
fake upstream proving zero requests. The focused Session route test and
OpenCode package typecheck are causal. Reverting the implementation commit
restores the trigger; no schema or user data migration is involved.

### Gate 5B3 — retire remote routes and request selectors

After the relevant Gate 5D TUI consumers were removed, Gate 5B3 removed the
Console endpoints inside `ExperimentalApi`, the Session share/unshare
endpoints, and the complete `ControlPlaneApi`, `SyncApi`, and `WorkspaceApi`.
It then reduced current routing to local directory and
persisted-Session-directory selection, proved the removed paths and remote
selectors unreachable, and regenerated current SDK artifacts from the typed
API owner.

The frozen legacy `packages/sdk/js/src/gen/` tree is not hand-edited to mimic
generation. Its retirement or recovered source-of-truth remains a separate
evidence-driven source decision rather than an automatic dependency closure.
Local provider integration routes are not a marketplace surface and remain
unless separate evidence shows an excluded control-plane dependency.

## Gate 5C locked execution boundary: config and startup

Gate 5C asks whether an ordinary local startup can become complete without
consulting inherited account, organization, Console, or sharing services,
even when old account rows, share rows, environment variables, or excluded
config keys are present. It does not prohibit network chosen explicitly by a
retained provider, remote MCP server, plugin, Git reference, or well-known
custom-provider authentication flow.

The dependency order is two reversible slices:

1. **5C1 — remove automatic account/Console config composition.** `Config`
   stops consulting the active OpenCode account, refreshing its token,
   fetching `/api/config`, injecting a Console token, or publishing derived
   Console state. Local/global/project/managed config, explicit well-known
   provider config, plugin provenance, and environment/file substitution
   remain. HTTP layer composition no longer registers the now-unconsumed
   Account node. An inert implementation may remain hibernated when
   constructing or importing it performs no network work and imposes no
   concrete build or maintenance burden.
2. **5C2 — remove sharing configuration and startup synchronization.** The
   released and current config schemas reject or ignore `share`, `autoshare`,
   and the top-level sharing `enterprise` field rather than migrating them
   into behavior. `REPA_AUTO_SHARE` is no longer a runtime flag, Session
   creation has no automatic-share branch, and instance bootstrap initializes
   only retained local services. Instance bootstrap, the unused bootstrap-only
   runtime, HTTP composition, and aggregate CLI runtime do not register
   `ShareNext` or `SessionShare`. Their source and direct tests may remain
   hibernated; hosted GitHub automation remains unregistered.

Evidence for 5C1 must make an active-account double fail if config asks it for
identity, token, or organization config, while retained local config and an
explicit well-known provider config still load. Evidence for 5C2 must make a
sharing-init double observable and prove ordinary Instance bootstrap never
calls it while the retained plugin config hook still runs. Schema tests cover
both released-v1 and current config projections; exact residue scans cover
the active composition owners. Only focused config/bootstrap/runtime tests,
affected package typechecks, and `git diff --check` are causal.

Revert either slice to restore only that registration/config behavior. No
data migration or compatibility reader is added: the baseline has no user-data
contract, and passive historical Session/share columns remain explicitly
deferred to a later native-database/schema closure.

## Gate 5D locked prerequisite boundary: released terminal consumers

Gate 5D classifies effects rather than deleting every inherited use of a word.
The local terminal debug console, local provider credentials, Session cache
hydration, current directory, project copies, and Git worktrees remain. The
excluded meanings are public sharing, OpenCode Console/account organization
control, remote workspace placement and synchronization, and control-plane
Session movement.

These five slices are independently reversible and precede Gate 5B3.

### Gate 5D1 — remove active sharing affordances

Remove the Session share/unshare commands, slash names, bindings, keybindings,
confirmation flow, tips, default sidebar URL display, dedicated plugin
`share_url` slot property, and legacy `session_share` bridge alias. Do not
leave disabled commands or unknown aliases that publish an undefined command.

Historical Session `share` fields and an old `share_consent` local KV value do
not require migration. They are passive data after the default display and
dedicated extension point are gone. The public TUI-event suggestion and
generated client methods remain owned by Gate 5B3; generated files are not
edited manually.

Evidence must prove the real TUI registry has no share/unshare command or
slash alias, a Session carrying an old share URL does not render it, retained
Session rename/export or transcript behavior remains, the sidebar plugin slot
still receives Session identity and title, unknown legacy aliases publish no
event, and TUI, plugin, and bridge owner typechecks pass.

### Gate 5D2 — remove Console/account organization affordances

Remove the organization dialog and commands, their keybinding, startup
`experimental.console` request and state, Console-managed-provider display and
selection branches, their helper, and the test fixture fallback that could
hide a residual request. Do not replace the startup call with a swallowed 404.

Retain the local `app.console` debug command, provider connect/auth hydration,
ordinary API-key and OAuth flows, generic custom providers, and local provider
credential help. Evidence must show the command registry and slash aliases
exclude organization switching, startup makes no Console request, retained
provider and debug commands remain, and the TUI typecheck has no deleted SDK
consumer.

### Gate 5D3 — separate local Session start location from control-plane move

Remove movement of an existing Session through
`experimental.controlPlane.moveSession`. Retain starting a new Session in an
existing local directory or a newly created local project copy/worktree, and
name that action truthfully as a start-location/directory choice rather than a
remote workspace move. Remove the old `session_move` binding without a
compatibility alias.

Deleting the active local project copy must first return the TUI to its main
directory before removing that copy. Evidence must cover project-copy creation
with `strategy: "git_worktree"`, subsequent local Session creation in the
returned directory, zero control-plane/workspace/sync requests, and safe
fallback before active-copy deletion.

### Gate 5D4 — remove remote Workspace surfaces

Delete remote Workspace dialogs, commands, `/warp`, status blocking and
labels, Session-create workspace placement, restore/delete recovery branches,
and the `workspace_set` binding. Remove dependency-closed leaf components and
their obsolete tests rather than adapting dormant files to the later SDK.

Ordinary local Session deletion, Home/Session navigation, and local project
copy management remain. `DialogWorkspaceFileChanges` still protects deletion
of a locally changed project copy despite its inherited name and is not
deleted by vocabulary match.

### Gate 5D5 — reduce active Workspace routing to a local directory

Replace the TUI's active remote Workspace selector with an active local
directory selector. Retained requests and events use `{ directory }`; entering
a Session selects its persisted directory. Remove only the remote
`sdk.sync.start()` call and remote sync-event form. `SyncProvider`, bootstrap,
and `session.sync()` remain as local cache hydration.

Directory filtering must still prevent another active directory's VCS/LSP and
TUI events from contaminating the view, while allowing valid same-project
Session navigation. Permission responses keep their own Session directory
rather than borrowing a global current directory. Local editor
`workspaceFolders` and Zed's internal `workspace_id` are unrelated vocabulary
and remain.

Evidence must prove directory-only locations in retained requests, correct
event isolation, a directory switch followed by local hydration, no
`experimental.workspace`, `experimental.controlPlane.moveSession`, or
`sdk.sync.start` consumer, and the focused TUI tests and typecheck. The retained
local `experimental.projectCopy.generateName` and v2 project-copy operations
must survive; Gate 5B3 converts their routing middleware to directory-only
rather than deleting their API group.

## Reopened production-composition boundary: hibernate preview-v2 execution

The released-v1 Session loop remains Repa's only production model runtime.
Preview-v2 is retained as source for future evidence-based comparison with
OpenCode v2, not maintained as a second product path and not physically deleted
merely because it is outside the current baseline.

The public v2 `active`, `prompt`, `compact`, `wait`, and `interrupt` operations
form one execution-facing family. Removing only `prompt` would leave public
coordinator state and control endpoints, two operations that always report
unavailable, and a live second runner in production composition. The stable
boundary therefore:

- excludes all five operations from the production Protocol group and Server
  handler composition, so current OpenAPI and generated clients do not promise
  them;
- removes the live local v2 execution layer from both production server
  assemblies and gives retained v2 data services the existing non-executing
  layer;
- treats the default Location service collection and
  `buildLocationServiceMap()` as an independent production composition owner.
  The Location composition used by production must omit `SessionRunnerModel`
  and `SessionRunnerLLM` before service-map compilation. A runner-enabled
  Location composition may remain only under a non-production owner and direct
  tests; a successful no-op, fixed-error, or empty runner service is not
  hibernation;
- retains independently useful v2 reads and durable non-executing state
  transitions when they have real consumers; and
- retains the v2 prompt, execution, runner, protocol/handler declarations, and
  direct tests as compile-checked hibernated source outside production
  registration. A source declaration may move behind a non-production owner to
  keep the production API truthful; that is not physical capability deletion.

Released-v1 prompt, status, abort, and compaction behavior remain unchanged.
No host flag, false compatibility endpoint, alternate runtime selector, or
OpenAPI-only filter is introduced. Released-v1 production modules also retain
no import edge to the local v2 execution or runner composition. If retained v2
source later produces a concrete compatibility or continuing maintenance cost,
that evidence reopens its physical disposition; hibernation alone does not
authorize deletion.

## Resolved reachability work: provider policy and self-update

The correction now covers three independent behavior boundaries: retaining a
complete generic local provider harness without OpenCode's first-party Zen/Go
product policy, making inherited client-origin trust explicit, and keeping
self-update absent until Repa owns a real release channel. Inactive source may
hibernate, but none of these behaviors may remain reachable through a no-op
compatibility surface or false configuration.

### Make first-party provider IDs ordinary

`opencode` remains a legal explicit provider ID, but it receives no built-in
catalog entry, anonymous/public credential, provider plugin, request header,
request-body option, native-runtime eligibility, tool, model-selection
priority, price presentation, ACP preference, retry action, or subscription
copy. `opencode-go` is likewise excluded from the shared ModelsDev outward
catalog. A user who explicitly configures an `opencode` endpoint, models, and
credentials receives the same generic custom-provider path as any other ID.
The raw models.dev cache is not a product registry and need not be rewritten;
the shared outward projection owns the exclusion. Released provider discovery,
provider login, model listing, and the run picker consume that same projection:
first filter the exact inherited built-ins `opencode` and `opencode-go`, then
overlay explicitly connected or configured providers. This makes an explicit
custom provider named `opencode` visible through ordinary configuration without
restoring the inherited commercial product.

Provider credential management is mixed local behavior and remains available.
`providers list` and `providers logout` must not use raw exact built-ins to
restore commercial names, discover their environment variables, or match a
credential by an inherited product name. An old credential with no explicit
provider configuration remains visible and removable under its literal stored
provider ID. Explicitly configured `opencode`, `opencode-local`, and ordinary
control providers use the same custom projection, including an explicit custom
name when one exists. Raw catalog metadata does not own local credential
identity.

The active baseline therefore omits the v1 magic provider loader and v2
built-in OpenCode provider registration, exact-ID branches in LLM
request/transform/native runtime/tool and selection code, CLI/TUI recommendation
or “Free/Go” presentation, and the closed retry-upsell producer/schema/consumer
graph. Current OpenAPI and SDK artifacts are regenerated from their schema
owners. Source and direct tests for dormant provider policy may remain when
they are outside current composition and impose no demonstrated cost.

Generic provider configuration, explicit provider/model headers, API-key and
OAuth auth, external provider plugins, plugin tools, MCP tools, AI-SDK
fallback, usage accounting, and actual catalog costs remain. GitHub Copilot's
provider-local enterprise authentication remains because it is an explicit
provider capability, not OpenCode Console or sharing state. Zenmux is an
unrelated provider and remains. At the time of this close,
OpenCode-branded attribution headers on other retained transports were deferred
to a later product-identity audit unless coupled to the exact first-party ID
branch. The 2026-07-27 first-principles correction below rejects that deferral
for reachable outward identity.

Negative evidence requires a catalog containing `opencode`, `opencode-go`,
and an ordinary control provider to expose only the control through released
and current discovery surfaces. An explicitly configured provider named
`opencode` must load without any public credential or ID-only request/tool/
selection behavior. A custom ID such as `opencode-local` is not excluded or
privileged merely because of its prefix. Limit-shaped errors retain generic retry information but
produce no commercial URL or action, and current schemas/clients contain no
retry action. Positive evidence covers generic custom providers and auth,
explicit request headers, plugin/MCP tools, AI-SDK fallback, normal catalog
costs, and GitHub Copilot enterprise auth.

### Make client-origin trust explicit

The baseline server grants no implicit origin merely because it identifies an
inherited hosted or dormant client. Remove the automatic
`https://*.opencode.ai`, `oc://renderer`, `tauri://localhost`,
`http://tauri.localhost`, and `https://tauri.localhost` branches. Requests with
no Origin, localhost and `127.0.0.1`, same-host requests, and exact origins
supplied through the server's explicit CORS configuration retain their
independent rules.

This is a reachability correction, not Desktop source deletion. The dormant
Desktop sidecar already supplies `oc://renderer` explicitly when deliberately
launched, so it can continue to work in that non-baseline composition without
granting every local server an ambient Desktop or OpenCode-hosted trust edge.
No new origin registry, client-detection layer, or compatibility flag is added.

### Hibernate self-update by absence

The unregistered upgrade/uninstall commands stay absent. The active fixed-error
`POST /global/upgrade` route, `autoupdate` configuration and migration output,
updater flags, installation-update events in the current public manifest,
updater startup composition, and TUI updater tip are disconnected from the
baseline. A direct request to the retired path returns ordinary not found;
Repa does not advertise a permanently unavailable operation. Old configuration
keys become ignored excess data, and transient installation events require no
recovery or data migration. The `Installation` implementation, package-manager
probe code, and direct updater tests may remain hibernated and are not part of
unrelated default verification.

Build identity is not updater policy. `InstallationVersion`,
`InstallationChannel`, `InstallationLocal`, CLI `--version`, database channel
isolation, user-agent/plugin compatibility uses, and the launcher's platform-
package resolution remain. Ordinary server health and startup remain. The
current OpenAPI and v2 SDK are regenerated; the frozen legacy SDK is not
hand-edited. Initial installers, Nix/release identity, Web documentation, and
Desktop's separate Electron updater remain deferred rather than being pulled
into this reachability change. Inherited repository-workflow definitions now
remain only as hibernated source outside GitHub's registration directory.

Negative evidence requires the config schemas/migration, current event
manifest, active route tree, current OpenAPI/SDK, and runtime composition to
expose no updater owner. It does not require production source absence.
Positive evidence covers CLI version,
ordinary server startup and `/global/health`, retained build/channel identity,
and local terminal commands. Focused owner tests, affected package typechecks,
exact dependency scans, and `git diff --check` are causal.

The three behavior changes may use separate revertible commits without becoming
new product Gates. Neither changes user data or adds a fallback endpoint,
compatibility field, empty service, or alternate registry. A future Repa
provider product or updater requires a Repa-owned product contract and release
authority rather than reactivating inherited policy accidentally.

## Corrected sharing and GitHub disposition

The public share routes, automatic Session sharing, share configuration,
startup synchronization, TUI share affordances, and HTTP(S) share import stay
disconnected. Released/current config schemas do not advertise `share`,
`autoshare`, or the top-level sharing `enterprise` field; migration and
`REPA_AUTO_SHARE` do not manufacture them; current generated artifacts follow
those owners. These are product-reachability results and remain valid.

The prior conclusion that `ShareNext`, `SessionShare`, their direct tests, the
hosted GitHub Action, and `PrCommand` must all be physically deleted was not
valid. Their last-caller relationship described implementation shape, not one
product meaning. The correction therefore:

- restores `PrCommand` as an explicit local `gh pr checkout` plus Repa launch
  capability, without OpenCode share-link import;
- restores the hosted GitHub Action as hibernated, unregistered source;
- does not recreate the old sharing engines or their tests because they depend
  on the removed active account/config/Console authority and would require a
  false compatibility shell merely to compile and initialize;
- keeps share nodes out of ordinary aggregate runtime/startup composition; and
- leaves passive historical Session/share columns inert for the later native
  database decision rather than rewriting data for vocabulary cleanup.

Evidence must prove both halves: no active registration, automatic share,
OpenCode share request, enabling config, or generated share selector; and a
working local PR checkout/launch path plus retained local Session lifecycle,
offline import/export, Git/project-copy, and provider/MCP/plugin configuration.
Direct hibernated-feature tests may remain but do not enter verification for
unrelated changes. No fallback endpoint, no-op service, or compatibility field
is introduced.

## Gate-wide positive evidence

- Local TUI, `run`, `attach`, `serve`, ACP, MCP, Sessions, tools, agents,
  providers/models, local plugins, and generic custom providers retain their
  accepted behavior.
- Local directory selection and Instance context work without a workspace,
  account, Console, sync, or share service.
- A Session can be created and run with no excluded outbound request or
  background task.
- Explicit local review, initialization, import, or plugin behavior remains
  only where its effect is independently useful and truthfully named.

## Gate-wide negative and failure evidence

- Root help, direct invocation, TUI registries, keybindings, tips, and HTTP
  OpenAPI expose no excluded surface; direct removed routes return not found.
- `run` has no share flag or implicit share action. No ordinary configuration
  can enable automatic sharing, sync, account/organization lookup, remote
  workspace placement, marketplace installation, or updater work.
- A workspace query, environment variable, or legacy Session field cannot
  proxy a request or select remote placement. `/` and unknown UI paths cannot
  launch or fetch a hosted client.
- Built-in catalogs expose no Zen/Go product identity, and no provider ID
  silently adds headers, tool behavior, pricing priority, retry upsell, or ACP
  preference. An explicit generic endpoint still works without those
  semantics.
- Missing excluded services do not produce a startup error, retry loop, hidden
  network call, dead menu item, compatibility adapter, or fallback to an
  OpenCode endpoint.
- Current runtime composition leaves no registered command,
  startup/background edge, enabling configuration, generated client method, or
  ordinary execution path to the excluded behavior. No inherited GitHub
  workflow remains registered; hibernated source may retain internal imports
  and direct tests outside the runtime graph.

## Post-audit closing evidence

The general Gate-wide checks above previously passed while the reopened v2,
provider, and CORS behavior remained. The following exact oracles therefore own
the correction close rather than inheriting confidence from those checks:

1. **Hibernated v2 execution:** the production protocol and handler
   compositions contain none of the v2 `active`, `prompt`, `compact`, `wait`, or
   `interrupt` operations; current OpenAPI and generated clients expose none of
   their methods; and direct requests to their former paths receive not found.
   The prompt path admits no input and schedules no model execution. Both
   production server assemblies omit the live local v2 execution layer and the
   retained v2 data services use the non-executing layer. The production
   Location service collection and every `buildLocationServiceMap()` path omit
   `SessionRunnerModel` and `SessionRunnerLLM` entirely; obtaining the Location
   layer for retained v2 `get/messages` and state transitions neither registers
   nor substitutes a no-op/error/empty runner. Released-v1 production imports
   contain no execution-local or runner edge. Released-v1 prompt, status, abort,
   and compaction plus retained v2 reads/state transitions still work. A
   separately owned runner-enabled composition, the v2 execution/runner source,
   and its direct tests remain present and compile-checked outside production
   registration.
2. **Provider-ID equivalence:** otherwise identical explicit custom providers
   named `opencode`, `opencode-local`, and an ordinary control ID produce the
   same request headers, project-lookup behavior, and native-runtime
   eligibility. No `x-opencode-*` header or runtime selection is caused by the
   ID alone.
3. **Provider CLI truth:** provider login consumes the accepted filtered
   provider projection and neither injects nor recommends OpenCode by name.
   `models` and the run mini picker do not prioritize `opencode*` or label a
   model `Free` because of its provider ID. An explicitly configured custom
   provider named `opencode` remains usable and appears only through the generic
   path. With raw `opencode`, `opencode-go`, and a control provider in the
   catalog, released and current discovery omit the two exact inherited
   built-ins. Overlaying explicit `opencode` and `opencode-local` configuration
   makes both custom providers and the control provider visible through that
   same projection; no prefix-wide filter may hide `opencode-local`.
   `providers list/logout` do not recover a commercial name, environment
   variable, or name match from either raw exact built-in. A no-config legacy
   credential remains listable and removable by literal provider ID, while
   explicitly configured `opencode`, `opencode-local`, and the control provider
   use their ordinary custom-projection labels and matching rules.
4. **CORS truth:** `https://*.opencode.ai`, `oc://renderer`, and each inherited
   Tauri origin are denied unless that exact origin is explicitly configured.
   No-Origin, localhost, same-host, and explicit user CORS cases remain accepted
   by their independent rules. A deliberately composed dormant Desktop server
   still accepts the origin it supplies explicitly.
5. **Owning-artifact consistency:** the protocol/OpenAPI/client generation
   check, focused provider/request/native/CLI/CORS tests, affected package
   typechecks, exact owner scans, and `git diff --check` pass. No unrelated
   dormant-source test or monorepo-wide suite is required.

Any result that merely hides a CLI label while retaining the request branch,
removes a generated method without changing its protocol owner, blocks only the
v2 prompt while leaving its public execution family, process-global
coordinator, or Location-scoped runners composed, replaces a runner with a
no-op/error/empty compatibility service, lets raw catalog identity leak through
credential commands, or keeps an implicit client-origin grant behind
client-name detection fails this evidence contract.

### 2026-07-15 correction result

The implementation/evidence round passed this contract and the same independent
top-level reviewer accepted it with no P0–P3 finding.

- Production Protocol, handlers, OpenAPI, and current generated clients contain
  none of the five v2 execution operations or paths. Former paths return ordinary
  not-found responses and the former prompt path admits no durable input.
- Both production server assemblies use `SessionExecution.noopLayer`; their
  import and composition graphs contain no local execution or runner edge. The
  production Location owner omits both runner services before compilation. A
  separate explicit non-production owner retains the real runner composition,
  implementation, declarations, handlers, and direct tests.
- Released-v1 prompt execution and retained v2 reads and non-executing state
  transitions passed their direct oracles. The source was hibernated rather than
  physically removed or replaced with a fake runner.
- The shared provider projection, request preparation, native eligibility, HTTP
  discovery, provider login/list/logout, model listing, and run picker satisfy
  the exact-ID and explicit-custom-provider matrix. Ambient hosted/Desktop CORS
  grants are absent while the independent local and explicit-origin rules pass.
- Fresh verification passed typechecks for Core, Protocol, Server, OpenCode,
  Client, sdk-js, and sdk-next; six Location tests with 15 assertions; one direct
  runner and one released-v1 prompt oracle; the retired-route/no-admission
  oracle; 24 public-OpenAPI, 12 current-client, two retained sdk-next, 176
  provider/request/native/CLI, six CORS, and four real credential-command
  subprocess tests. Six focused provider tests remained intentionally skipped.
  Exact owner scans and `git diff --check` passed.

The reviewer also inspected the broader failures that could plausibly weaken
that evidence. Two recorded-native cassette failures track pre-existing system
prompt drift; one broader sdk-next failure is the accepted two-host/one-database
owner refusal; dormant-provider asynchronous-key assertions exercise
unregistered source; and whole-file Prettier findings include existing HEAD
debt. None contradicted a Gate 5 claim, so no unrelated monorepo-wide suite was
promoted into the closing contract.

## Explicit exclusions

This gate does not migrate or clean historical database fields, because no
Repa user-data compatibility contract exists. It does not redesign preview-v2,
delete its implementation, add future Repa cloud behavior, invent Tutor slash
commands, replace local plugin mechanics, or rewrite provider transport that
has no excluded product branch. Preview-v2 changes only where production
registration or composition otherwise creates a second runtime promise; its
hibernated implementation remains available for a later evidence-based
OpenCode-v2 comparison.

## Recorded result

Gate 5 was historically recorded passed at
`25e51861effbddbdb04ae8fe88c4107d34ab91b2`. The post-Gate-7 audit invalidated
that gate-wide close claim. The bounded correction closed again on 2026-07-15
after the same top-level reviewer independently accepted both the revised
contract and the final implementation/evidence. The parent disposition
correction and repository-workflow boundary recorded by these commits remain:

- `03fbb078e` repaired the decision authority and active-status chain;
- `53b41aa0d` restored local `pr` without share-link import and restored the
  hosted GitHub Action only as unregistered, hibernated source;
- `af506b635` accepted Gate 5D5 after narrowing activation and hydration to the
  local-directory invariant;
- `4b2c7229a` hibernated updater implementation behind a truthful current
  runtime/protocol boundary; and
- `825b590b4` removed Zen/Go catalog/plugin composition and several inherited
  first-party branches while preserving the generic custom-provider harness;
  the later audit found the request/native/CLI residues named above.
  `0daeb6de5` removed the commercial retry action from the current status
  contract; and
- `25e51861e` moved all 26 inherited workflow definitions out of GitHub's
  active registration directory while preserving their exact source bytes.

The closure check found zero files beneath `.github/workflows`, 26 inherited
definitions beneath `.github/hibernated-workflows`, and zero content mismatch
against their pre-move Git blobs. No product test could add evidence to that
registration-and-preservation claim, so none was run.

The historical checks below remain evidence for the behaviors they actually
observe, not for the post-audit closing contract. The exact v2, provider, CLI,
and CORS oracles above are the accepted correction evidence.

Gate 5A's earlier reachability work was recorded at
`6503c280762a8cb2cc04e2cd0021498a8f0aa174`, but its whole-command
classification of `PrCommand` is superseded by that correction.

- the excluded Console, Web, and hosted GitHub-agent command handlers are no
  longer registered at the root CLI; `PrCommand` was incorrectly removed with
  them and is now restored by `53b41aa0d` after removal of its share-link
  branch;
- `run` no longer owns a share option or direct share callback;
- import is local-JSON-only, and a native-database
  `import -> export -> delete -> import -> export` round trip preserved the
  Session, message, part, and current project/directory rebinding;
- HTTP(S) import was rejected without reaching a listening test server;
- `bun test test/cli/help/help-snapshots.test.ts test/cli/import.test.ts
test/cli/root-shortcuts.test.ts` passed 5 tests and 27 snapshots;
- `bun test -t "rejects --share before admitting a prompt"
test/cli/run/run-process.test.ts` passed the focused contract without a
  provider request;
- the OpenCode package typecheck and `git diff --check` passed. The independent
  review verified the then-current implementation contract but did not receive
  enough upstream intent to test that contract's PR classification.

At the Gate 5A close, the HTTP Session-create automatic-share path and
instance-bootstrap ShareNext synchronization remained reachable as recorded
Gate 5B/5C blockers, so that result did not claim the gate-wide no-network
invariant or close Gate 5. Gate 5B2 below closes the first path; bootstrap
synchronization remains.

Gate 5B1 passed at `815a6a7c97ff1ad39e07fb8fead31fea61734473`
with the unused route dependency cleaned at
`8e6e64d3ea52cae51f274e9c75289acdaf5fa7bb`. The production route tree now
returns direct 404 responses for `/`, `/site.webmanifest`, and unknown paths,
while `/doc` and `/global/health` remain reachable. The hosted helper is
dormant and may remain hibernated. Its complete focused test file passed 13 tests,
and no SDK artifact changed.

Gate 5B2 passed at `8fc8b44790f7ddeb2b5a40736f6bafdb9e12d9ca`.
Under `share: "auto"`, the production HTTP Session-create route now creates and
re-reads a local Session without contacting the listening local share probe or
persisting a share. The same test first failed against the old call graph with
`POST /api/share` and a stored share URL, then passed after the one production
call changed to `Session.Service.create`. The focused test and package
typecheck passed; an independent fresh-context review found no 5B1/5B2
blocker and confirmed the test server is scoped and released by the Effect
runner.

Instance bootstrap still initializes `ShareNext`; Gate 5C owns that remaining
startup path. The explicit typed share/unshare, Console, workspace, sync, and
control-plane routes no longer remain reachable after Gate 5B3 below. Gate 5
remains open.

Gate 5D1 passed at `54fb79af0565a9d6d87b225e2802ee5e27df1f87`.
The real TUI command registry has no share/unshare command or slash alias, a
legacy share URL is absent from the rendered sidebar, and the retained
`sidebar_title` plugin slot still receives Session identity and title without
a dedicated share property. Legacy bridge input now publishes only own,
retained aliases; removed, unknown, and inherited object-property names emit
no command event. The two focused behavior tests, TUI/plugin/OpenCode package
typechecks, exact production-residue scan, `git diff --check`, and an
independent fresh-context review passed. Passive historical fields and the
typed HTTP/SDK surface were assigned to Gate 5B3/5C rather than being hidden
behind a TUI compatibility command.

Gate 5D2 passed at `ce9299f506a1b1baf1577b3730e4d6124f5ebd3b`.
The released TUI no longer registers organization switching or requests
`experimental.console` during startup. Console-managed-provider presentation
and selection branches are gone; ordinary API-key, OAuth, custom-provider,
`provider.connect`, provider-auth hydration, and the local `app.console` debug
command remain. The full-app behavior test, focused provider-option tests, TUI
typecheck, exact production-residue scan, `git diff --check`, and an independent
fresh-context review passed.

Gate 5D3 passed at `6a9e5a9eda919205fb87e068e41b83010ccbd990`.
The TUI no longer moves an existing Session through the control plane. Its
retained Home action is `session.start_location` with `/directory`: it selects
an existing local directory or creates a local project copy with
`strategy: "git_worktree"` for the next Session. The old command, slash, and
`session_move` binding have no compatibility alias. Deleting the active copy
now synchronizes the main directory before either normal or forced removal;
missing or failed fallback prevents removal, and forced-delete dialog
lifecycles do not update an unmounted instance. The focused action-chain,
deletion-safety, project-directory, config, Sync/Event regression tests, TUI
typecheck, exact residue scan, `git diff --check`, and two-stage independent
fresh-context review passed.

Gate 5D4 passed at `d41fe19755a7611a5742b0d2c8bab50970bdd73b`.
The released TUI has no remote Workspace dialogs, commands, `/warp`,
keybinding, status label or blocking, Session-create placement, recovery, or
remote delete branch. Dependency-closed UI leaves and their obsolete test
were deleted; startup no longer lists or hydrates remote Workspaces, and the
test fixture no longer masks those requests. Ordinary Session deletion,
listing, navigation, and error toasts remain. Local project-copy/worktree
creation, refresh, removal, `/directory`, and `DialogWorkspaceFileChanges`
remain. The focused registry, startup, config, Session-list/sidebar, and Sync
tests, TUI typecheck, exact dependency scan, `git diff --check`, and an
independent fresh-context review passed. Active routing fields remain solely
for Gate 5D5.

Gate 5D5 implementation and behavior evidence were recorded at
`00061ce349e01b9273a40e424f8bb2c3eb01d9c9`. The parent-level necessity audit
accepted its local-directory invariant after the scope repair at `af506b635`:
`Sync.bootstrap` is the single activation publisher, successful caches commit
independently, and the correction introduces neither automatic retry nor a
general concurrency framework.
The TUI now publishes one active local-directory snapshot across Project and
Sync state. Retained non-Session requests carry that directory explicitly;
entering a Session selects its persisted directory before enabling the prompt,
while an unavailable material directory leaves the durable transcript
readable and the prompt unavailable. Same-project sibling Session events
remain navigable, but cross-project events and another directory's VCS, LSP,
Session-list, MCP, Data, and late bootstrap results cannot overwrite the active
view. Manual permission and question requests retain their event directory.
Deleting the active project copy first completes one atomic activation of the
main directory.

Failure before publication preserves the previous complete snapshot. After a
new directory is published, generation-consistent directory-owned caches
commit independently; a failed endpoint leaves only its unavailable data
truthfully empty and the snapshot `partial`, without discarding successful
hydration. Caller cancellation after publication no longer strands the work.
Automatic retry and same-directory ABA freshness remain non-blocking generic-
harness follow-ups, not remote Workspace compatibility. The original 17-file
causal suite passed 65 tests, TUI typecheck and `git diff --check` passed, exact
residue scans found no active remote routing consumer, and one fresh-context
independent reviewer followed the causal chain across repairs and ended green
after its two final concurrency counterexamples were fixed. The later
`af506b635` causal checks cover the narrowed single-publisher and partial-
hydration behavior. Local project-copy operations were the retained reduction
consumed by the directory-only Gate 5B3 route cutover.

Gate 5B3 route registration passed at
`34474649b648efbe8e1cbfcc1d5f07f546e10435`. The released instance router no
longer mounts Session share/unshare, Console, control-plane, sync, or remote
Workspace groups. Legacy URL-shaped directory parameters resolve only to a
local directory and cannot select a remote Workspace. Four local
project-copy/worktree operations remain because they are ordinary local
harness behavior rather than control-plane Workspace behavior.

Gate 5B3 current-protocol and client cutover passed at
`e3375ef08b9c27542cd43f4d6085bd9856443549`. Current protocol inputs,
middleware, OpenAPI, and generated clients are directory-only: workspace
query parameters, headers, create inputs, and configuration selectors are no
longer accepted or emitted. A persisted historical `workspace_id` cannot
restore a remote route; only the Session directory is selected. The 17
retired operations are absent from current generated artifacts, while the
four local project-copy operations remain. The legacy
`packages/sdk/js/src/gen/` tree stays hibernated instead of being
hand-edited. Seventy-one focused tests, all seven affected package typechecks,
exact residue and generation-ownership scans, `git diff --check`, and an
independent fresh-context review passed with no remaining Gate 5B3 finding.

Commit `5edbd86389ddbed59d0fe936a82052da7f09f473` contains two differently
classified results. Its active Gate 5C2 disconnection remains valid: aggregate
runtime/startup no longer registers sharing; released/current config schemas
do not own `share`, `autoshare`, or the top-level sharing `enterprise` field;
migration and `REPA_AUTO_SHARE` no longer manufacture the behavior; and current
OpenAPI/SDK output follows the schema owner. Its physical deletion of
`ShareNext`, `SessionShare`, direct tests, hosted GitHub Action, and local
`PrCommand` followed the invalid last-caller inference. The selective repair at
`53b41aa0d` restored local `pr` and the unregistered hosted Action. It did not
recreate the sharing engines or their tests because those units require the
removed active account/config/Console owners and would otherwise be a false
compatibility shell. Explicit GitHub Copilot enterprise authentication remains
provider-local, and the frozen legacy SDK tree has zero diff.

The causal suite passed 187 tests: both config suites, runtime flags, current
OpenAPI, the retained startup composition, local Session lifecycle, ordinary
provider configuration, CLI command disposition, and the native-database
local import/export round trip plus HTTP(S)-import rejection. Core, OpenCode,
current SDK, and current client typechecks passed; those historical results show
the deletion compiled, not that the deletion contract was reasonable. Passive
historical Session/share columns remain inert for the later native-database/
schema decision. The selective restoration, provider/updater reachability, and
5D5 necessity work and inherited workflow unregistration remain valid. Gate 5
was recorded closed without a broad package or source-deletion campaign, but
the later audit reopened only the active v2, provider, and CORS residues named
above. Repa-owned CI design remains outside this product-surface decision.

## Rollback

Do not revert all Gate 5 work. Preserve correct disconnections and select the
causally complete repair for each misclassified behavior. Regenerate only
artifacts owned by a changed source schema. No current repair requires data
recovery; hibernated implementation is not a compatibility runtime and must
remain outside registration, startup, background work, false configuration,
and current release composition.

## 2026-07-27 first-principles correction

The accepted boundary removes hosted Web from automatic build and current
release participation. `packages/opencode/script/build.ts` nevertheless builds
`packages/app` by default and embeds its generated asset map as an additional
binary entrypoint; only `--skip-embed-web-ui` suppresses it. The production
server no longer exposes a Web fallback, so this is dead shipped composition,
not evidence of a second active runtime. The primary TUI also retains a visible
`Open docs` action that opens `https://opencode.ai/docs`, so upstream product
documentation remains directly presented as Repa help. The retained
`agent create` surface also offers a fixed inherited permission checklist but
writes denies only for omitted listed keys while the runtime default remains
wildcard allow; selecting only `read` can therefore leave newly added
learning/content mutation capabilities enabled.

Reachable outward identity is also wrong. Config loading and TUI-config
migration write `https://opencode.ai/config.json` or
`https://opencode.ai/tui.json` into Repa-owned files. Several retained provider
transports send OpenCode referer, title, source, billing-origin, integration, or
user-agent values. These active file writes and network claims are not
equivalent to harmless internal package namespaces, and the earlier deferral to
a later identity audit conflicts with Repa's already-settled independent
product identity.

Gate 5 is scoped-reopened only at these active build, outward-identity,
permission, and presentation boundaries. The terminal product must be the
default build, while an explicit non-release research target may still request
Web assets. The visible docs action must be removed or point to a Repa-owned
truthful help surface. Repa config must use a Repa-owned version-correct schema
or omit `$schema`. Provider metadata must identify Repa or be removed unless an
exact third-party provider contract demonstrably requires a legacy integration
literal; any such bounded exception is recorded and tested rather than treated
as OpenCode product membership. Restricted custom Agents must compile
default-deny plus explicit allows from one authoritative capability catalog.
The runtime disconnections, internal namespaces, and retained-source
classification remain valid. Dormant publish/install scripts that still name
OpenCode registries are not active release paths, but they are explicit
blockers for any future release-readiness claim and must be quarantined or
rewritten before such a claim.

## 2026-07-28 corrective integration

The corrective snapshot makes terminal-only the ordinary build;
Web assets require the explicit `--research-embed-web-ui` research flag. It
removes the upstream docs action and upstream schema writes, identifies active
provider traffic as Repa or omits the product metadata, keeps ordinary OpenAI
API-key use, and hibernates the unqualified ChatGPT OAuth registration.

Restricted custom Agents now compile default-deny plus explicit allows from the
live permission catalog. Generated Agent identifiers share one constrained
namespace with canonical path containment, live-catalog collision checks, and
non-overwriting writes. Object-form permissions reject exactly ECMAScript
array-index keys that cannot preserve authored order, while explicit ordered
rules retain numeric capability support. Raw JSON/JSONC and legacy compilation
preserve an own `__proto__` deny without changing `Object.prototype`; a real
same-named local tool remains physically discoverable but model-invisible.

The preview-v2 production Location no longer registers the inherited
`customize-opencode` skill by default. This removes an upstream product-help
surface without deleting the generic v2 skill registry, configured/local/URL
skill sources, guidance, or skill tool, and without changing the independent
released-v1 skill mechanism. The hibernated plugin remains directly testable
when explicitly composed for source maintenance.

The original Gate 5 reviewer independently accepted the build, outward
identity, OAuth/API-key, generated-Agent, restricted-permission, array-index,
prototype-key, and registry-visibility corrections. Final shared-tree evidence
included the OpenCode 400-test corrective set, the Core 100-test corrective
set, all four affected package typechecks, the ordinary Windows build and its
packaged smokes, and the explicit research-flag test. Dormant upstream
publish/install source remains a later release-readiness blocker.

A separate fresh reviewer accepted the preview-v2 skill-surface slice after
proving that production locations no longer advertise `customize-opencode`,
generic v2 configured skills still register, the hibernated plugin still
passes its direct test, and released-v1 discovery and invocation remain
independent. The focused Core and released-v1 skill tests passed serially; an
unrelated pre-existing policy-location failure from a wider run does not
establish or weaken this slice.

Commit `9e91d43c629b66d65c8741e342bca7cf05de5667` durably fixes the
independently accepted shared-tree snapshot and closes this scoped reopen. It
does not claim release readiness or authorize execution of hibernated upstream
automation.
