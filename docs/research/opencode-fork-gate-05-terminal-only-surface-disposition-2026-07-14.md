# OpenCode fork Gate 5: terminal-only surface disposition

Status: In progress — parent contract locked before production changes

Date: 2026-07-14

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decisions: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md)
and [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Starting fork commit: `6fd9f6449b1b90c12c12ac1ed03fb009fceeafe4`

## Parent uncertainty

Can Repa make the first terminal-only local product truthful by removing every
ordinary path to inherited account, group, hosted, marketplace, sharing,
commercial-provider, updater, Web, and Desktop product behavior while
preserving the mature local Agent capabilities that reduce honestly into a
learning system?

This gate is about product reachability and dependency-closed disposition. It
does not add learning authorities, migrate nonexistent user data, rename every
internal symbol, or make an excluded feature appear absent by leaving a broken
command, menu item, route, background call, or fallback endpoint behind.

## Accepted product boundary

The first accepted client is the local terminal product. Local TUI, direct
`run`, `attach`, `serve`, ACP, MCP, provider/model selection, Sessions, agents,
tools, explicit local plugins, and generic explicitly configured custom
providers remain. File, shell, Git, LSP, patch, worktree, code review, and
repository initialization remain available as explicit local capabilities
when their behavior is truthful; they do not define Repa's ordinary ontology.

The following inherited product semantics are excluded:

| Surface | Gate 5 disposition | Preserved reduction |
| --- | --- | --- |
| OpenCode account, organization, and Console | unregister, then delete | local provider credentials and neutral custom endpoints |
| public sharing and share import | unregister, then delete | independently meaningful local Session/file import, if the mixed command contains it |
| sync, remote workspace, installation, and control plane | unregister, then delete | local directory routing and Instance context |
| hosted Web and Desktop clients | remove public launch and proxy reachability, then delete baseline packaging | terminal `serve` only where it supports retained local clients/protocols |
| marketplace browsing or installation | unregister, then delete | local plugin discovery and enable/disable behavior |
| hosted GitHub Action, PR automation, and release integration | unregister, then delete | ordinary local Git and explicit review capability |
| first-class OpenCode Zen/Go products | remove catalog identity and all ID-specific behavior | neutral generic custom-provider configuration |
| inherited updater and upgrade UX | unregister, then delete | no updater until Repa owns release provenance, integrity, rollback, and migrations |

A mixed command or module is classified by behavior before removal. The name
`import`, `plugin`, `workspace`, or `serve` is not sufficient evidence that all
of its behavior is excluded. Conversely, an implementation is not retained
merely because its public registration was removed.

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
  dependencies.

Tests that only instantiate an implementation directly do not prove public
reachability. Search residue alone does not prove reachability either. Each
slice must show both the absence of its public route and survival of the
retained local behavior at the owning registry.

## Sequential evidence boundaries

Gate 5 is one product gate but not one implementation patch. It advances
through these independently reversible subgates:

1. **5A — root CLI front door:** remove clearly excluded root commands and
   flags. Classify mixed local/import/plugin behavior before changing it.
2. **5B — HTTP and routing:** unregister excluded API groups and handlers,
   remove hosted UI proxying and remote workspace selection, retain local
   directory and Instance routing, then regenerate typed clients from the
   source schema.
3. **5C — config and startup:** remove excluded config keys, migrations that
   only manufacture those keys, bootstrap nodes, automatic sharing, sync, and
   account/Console network work. Startup and Session creation become locally
   complete without those services.
4. **5D — terminal surface:** remove excluded commands, bindings, dialogs,
   tips, workspace/share actions, marketplace actions, and commercial upsell
   paths while retaining local plugin and provider operation.
5. **5E — provider and updater semantics:** remove first-class Zen/Go catalog
   entries, built-in provider plugins, ID-specific headers/tools/pricing/retry
   behavior, and updater registration. Generic custom providers remain.
6. **5F — dependency-closed deletion:** delete implementations, Web/Desktop
   baseline packages and assets, hosted integrations, release workflows, and
   now-unused dependencies after callers are gone. Generated artifacts are
   regenerated from their owner rather than edited by hand.

Every subgate records its narrower parent question, exact positive and negative
evidence, and rollback before code changes. Passing an early reachability
slice does not authorize leaving the corresponding implementation dormant at
Gate 5 completion. A typed-reference failure after unregistration is evidence
for the next dependency-closed slice, not permission to add a compatibility
stub.

## Gate 5A locked contract: CLI front door

### Subquestion

Can the ordinary root CLI stop exposing clearly excluded hosted product
behavior without removing offline backup/restore, explicit local or npm plugin
installation, local statistics, `serve`, or any other retained local harness
capability?

### Owning changes

- `packages/opencode/src/index.ts` unregisters `ConsoleCommand`, `WebCommand`,
  `GithubCommand`, and `PrCommand`. It retains `ServeCommand`, `ImportCommand`,
  `PluginCommand`, the local database `StatsCommand`, and the other local
  Agent/MCP/provider/Session/database/export commands.
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
  implementations remain for later dependency-closed deletion.

The `PrCommand` is excluded rather than reduced to generic Git: it wraps
`gh pr checkout` in coding-product assumptions and imports OpenCode share links
from pull-request text. Ordinary Git and explicit local review remain
available through retained terminal capabilities.

### Evidence

- root help and help snapshots expose no `web`, `github`, or `pr` command;
  the hidden Console command is also unreachable by direct invocation.
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
  the OpenCode typecheck are causal for this subgate. HTTP, TUI, provider, and
  broad monorepo tests belong to later owners.

Because the default command accepts a project argument, a removed word such as
`web` may be interpreted as a local project path. The negative contract is that
the old command handler and hosted effect are unreachable, not that every
former command word must produce exit code 1.

### Exclusions and rollback

Gate 5A does not remove HTTP/TUI share paths, hosted UI proxying, config keys,
provider semantics, generated clients, or implementation files. In
particular, Session creation can still reach automatic sharing through the
HTTP handler and `ShareNext`, and instance bootstrap can still synchronize
already-shared Sessions; those are explicit blockers for Gate 5B/5C, not a
Gate 5A success claim. Gate 5A therefore does not claim that Gate 5 has passed.
Revert the Gate 5A implementation commit to restore its registrations and
callbacks; no schema or user data changes.

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
route tree. The helper implementation remains dormant until Gate 5F; this
slice changes public reachability, not the typed API.

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

The explicit typed share/unshare endpoints and `SessionShare` service remain
temporarily because the TUI still consumes them. Their public removal belongs
to the later typed-route slice after Gate 5D removes those consumers. Instance
bootstrap still initializes `ShareNext`; Gate 5C owns that startup/background
path. Thus Gate 5B2 closes only the HTTP-create trigger and does not claim the
gate-wide no-share invariant.

Evidence requires a production HTTP Session-create request under automatic
share configuration, a successfully readable created Session, and a bounded
fake upstream proving zero requests. The focused Session route test and
OpenCode package typecheck are causal. Reverting the implementation commit
restores the trigger; no schema or user data migration is involved.

### Remaining Gate 5B route cutover

After the relevant Gate 5D TUI consumers are removed, a separately locked
Gate 5B3 contract will remove the Console endpoints inside `ExperimentalApi`,
the Session share/unshare endpoints, and the complete `ControlPlaneApi`,
`SyncApi`, and `WorkspaceApi`. It will also reduce workspace routing to local
directory and persisted-Session-directory selection, prove the removed paths
and remote selectors unreachable, and regenerate current SDK artifacts from
the typed API owner.

The frozen legacy `packages/sdk/js/src/gen/` tree is not hand-edited to mimic
generation. Its retirement or recovered source-of-truth is a Gate 5F
dependency-closure decision. Local provider integration routes are not a
marketplace surface and remain unless separate evidence shows an excluded
control-plane dependency.

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
- Deletion leaves no production import, package dependency, generated client
  method, release job, or ordinary runtime path to the excluded behavior.

## Explicit exclusions

This gate does not migrate or clean historical database fields, because no
Repa user-data compatibility contract exists. It does not redesign preview-v2,
add future Repa cloud behavior, invent Tutor slash commands, replace local
plugin mechanics, or rewrite provider transport that has no excluded product
branch. Preview-v2 changes only when a shared released registration otherwise
keeps an excluded surface public.

## Recorded result

Gate 5 remains active. Gate 5A passed at
`6503c280762a8cb2cc04e2cd0021498a8f0aa174`.

- the excluded Console, Web, GitHub-agent, and PR command handlers are no
  longer registered at the root CLI; retained local commands remain visible;
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
- the OpenCode package typecheck and `git diff --check` passed, and an
  independent fresh-context review found no remaining Gate 5A blocker.

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
dormant for Gate 5F deletion. Its complete focused test file passed 13 tests,
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

Explicit typed share/unshare, Console, workspace, sync, and control-plane
routes remain reachable, and instance bootstrap still initializes
`ShareNext`. The next dependency boundary is the relevant Gate 5D TUI
consumer cutover; Gate 5B3 then removes those typed routes and regenerates the
owned current SDK artifacts. Gate 5 remains open.

## Rollback

Revert the smallest failing subgate and regenerate only artifacts owned by a
changed source schema. Before 5F, rollback does not require data recovery.
After dependency deletion, the subgate commit remains the rollback unit; no
compatibility implementation or disabled alternate registry is kept in the
product tree.
