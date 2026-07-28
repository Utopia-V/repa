# Inherited and non-current documentation

Status: Classification aid only. This index does not own Repa product meaning,
Gate status, runtime selection, roadmap, release commitments, or source-removal
decisions. Use the [Repa documentation map](../README.md) for current status and
authority.

This directory holds material moved out of high-priority discovery locations
because it remains useful as evidence or source-maintenance context but must
not read as current Repa guidance.

## Material classes

| Material | Classification | Permitted interpretation |
| --- | --- | --- |
| [Preview-v2 Session runtime](opencode-preview-v2-session-runtime.md) | Relocated inherited OpenCode preview-v2 design evidence | May explain the corresponding hibernated source. It is not Repa product, roadmap, Gate-contract, released-v1 runtime, or implementation authority. |
| Root `README.<locale>.md` files and `STATS.md` | Archived-upstream tombstones | Preserve stable historical filenames and direct readers to current Repa documents. Original translations and statistics remain in Git history; they are not Repa localization or adoption claims. |
| Former tracked `.opencode/**` workspace controls | Retired upstream live-control surface, recoverable from Git history | Repa discovers `.repa`, while external OpenCode would auto-discover and execute `.opencode` commands, agents, tools, skills, and plugins despite any prose classification. The controls were evacuated rather than retained as a second authority: explicit TUI maintenance fixtures now live under `packages/opencode/specs/fixtures/tui-plugins`, and source-maintenance translation glossaries live under `script/translate-app-glossary`. |
| `specs/v2/**`, `packages/opencode/specs/v2/**`, `packages/**/v2/**` documentation, and `packages/sdk-next/README.md` | Hibernated preview-v2 source-maintenance material | May guide maintenance of the retained preview-v2 source. It does not authorize a second production runtime or supersede the released-v1 baseline. |
| `.github/hibernated-workflows/**` and its retained support | Inactive upstream automation and deployment evidence | Files outside `.github/workflows` do not define Repa CI, governance, ownership, deployment, or release behavior. Former root actions, installer, SST configuration/infra, release scripts, and container support live only beside these workflows. Executable entrypoints fail closed unless an investigator explicitly sets the recorded hibernation escape hatch; that does not authorize upstream mutation or deployment. Re-admission requires a Repa-owned automation contract. |
| Documentation under deferred Web, Desktop, Console, Stats, Slack, GitHub Action, and similar package surfaces | Source-local maintenance material for retained or deferred source | A package path, workspace entry, build command, or implementation does not establish baseline membership, ordinary reachability, release support, or a product commitment. Every retained page in the directly renderable OpenCode Web corpus carries its own first-screen inherited-source notice and authority link. `packages/app` is excluded from the registered default binary build; only the explicit `--research-embed-web-ui` opt-in may build and embed it for isolated research, without admitting a Web product or release surface. |
| `docs/research/opencode-fork-gate-*.md` | Deliberate Gate contracts and evidence records | Read each record's status and the documentation map. Historical evidence is not stale pollution merely because later Gates exist. |
| Immutable `repa-prefork-oracle` tag and its external read-only materializations | Historical product and research oracle | Evidence only: not a runtime dependency, compatibility target, migration source, or current-tree documentation owner. See the [fork ledger](../fork-ledger.md). |

## Reading rule

OpenCode names may remain in implementation namespaces, package identities,
license/provenance text, source-local comments, and descriptions of inherited
mechanics. The name alone does not make a file stale. Interpret a document from
its declared status, current reachability, and owning Repa authority; do not
promote detail, build participation, or a search match into product policy.

When an inherited document must be retained in the working tree, give it a
first-screen status statement and a link to its current authority owner.
Recover superseded upstream prose from Git history instead of duplicating it
under another current-looking filename.
