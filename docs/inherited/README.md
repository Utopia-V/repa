# Inherited and non-current material

Status: Classification aid only. This index does not own Repa product meaning,
Gate status, runtime selection, roadmap, or release commitments. Use the
[Repa documentation map](../README.md) for current status and authority.

Repa keeps the inherited implementation mechanisms needed by the terminal
Agent harness, but it does not keep a second upstream product manual beside
current Repa documentation. The pre-cleanup tree is recoverable at commit
`022c8cb21aaf24dad254b654464f59b771acaee8`, and the immutable
`repa-prefork-oracle` tag remains the pre-fork product and research oracle.

## Material classes

| Material                                                                                                                                                                                                                | Current disposition                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product foundations, accepted ADRs, architecture, the active roadmap, Gate records, and the fork ledger                                                                                                                 | Current Repa authority or deliberate decision/evidence provenance. Read each record's own status.                                                                                                                        |
| Root localized READMEs, `STATS.md`, the inherited Web documentation site, old root plans, preview-v2 prose, inactive upstream workflow/support files, retired Nix/release packaging, and the App translation automation | Removed from the current tree. Recover an exact file with `git show 022c8cb21aaf24dad254b654464f59b771acaee8:<path>` when historical inspection is necessary.                                                            |
| Retained App, Desktop, Console, Enterprise, Stats, Slack, GitHub Action, VS Code, and preview-v2 source                                                                                                                 | Hibernated implementation material, not baseline membership, ordinary reachability, release support, or product commitment. Source-local `AGENTS.md` may add maintenance constraints but cannot admit a product surface. |
| `docs/research/opencode-fork-gate-*.md`, ADR-0014, and fork-ledger references to OpenCode                                                                                                                               | Deliberate fork provenance and Gate evidence, not stale branding. Historical Gate filenames remain stable so their links and review provenance stay exact.                                                               |
| MIT notices, third-party headers, internal `@opencode-ai/*` package names, `packages/opencode`, provider protocol literals, and compatibility keys                                                                      | Retained where they carry legal attribution or an actual implementation/package/wire contract. They must not be presented as Repa product identity. See the root [fork notice](../../FORK-NOTICE.md).                    |

## Reading rule

An OpenCode name alone neither makes a file current nor makes it removable.
Interpret it from legal meaning, current reachability, contract ownership, and
the Repa authority map. Recover superseded upstream prose from Git history
instead of reintroducing it under a current-looking filename.
