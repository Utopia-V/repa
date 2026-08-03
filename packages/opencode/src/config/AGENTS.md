# Configuration trust boundary

Changes in this subtree must preserve the accepted configuration trust
boundary: origin classification, merge order, and project-origin quarantine.
That boundary is recorded inside
[Gate 10](../../../../docs/research/opencode-fork-gate-10-content-root-authority-2026-07-17.md)
under the [system architecture](../../../../docs/architecture/00-system-architecture.md).
Treat every loader and consumer as part of the conformance audit: successful
parsing or an existing merge path does not grant trust or effect authority.

## Required boundary

Classify a candidate's origin before substitution, path expansion, dependency
installation, dynamic import, process spawn, network access, model/provider
selection, plugin/tool/MCP loading, TUI effects, migration, or any other
side effect. An automatically discovered project main/TUI file and `.repa`
content are untrusted project-origin even when they use a familiar schema or
match a machine-owned value.

In the Gate 10 baseline, only pointwise top-level `permission` denies and
legacy `tools: false` leaves survive project-origin compilation. They become
additional deny rules. Allows, asks, defaults, negative selectors, executable
declarations, presentation choices, substitutions, unknown fields, and all
project TUI values remain inert and diagnosable. Project directories do not
auto-load commands, agents, skills, tools, plugins, or config-declared ambient
instructions. Separately discovered project `AGENTS.md` and skill text may
remain bounded untrusted content under their own harness path; they never gain
configuration authority or permission to run referenced effects.

Explicit global, managed, environment/flag, and other admitted machine-owned
sources retain their own behavior; do not weaken them merely because a
same-named project field is quarantined. Conversely, merge order or fallback
must never let an inert project value select another active model, provider,
Agent, tool, plugin, URL, command, or effect.

Gate 10's accepted implementation assigns `project-layer.ts` as the exhaustive
disposition map. Verify its coverage against every actual main, TUI, and
non-schema discovery owner; the file's existence or a passing schema check does
not prove exhaustiveness. Every new owner must receive an explicit
project-origin disposition and fail closed until classified. Config exposes
runtime policy; it does not create product meaning or resurrect excluded Web,
Console, sharing, remote workspace, updater, marketplace, or preview-v2
execution surfaces.

Focused checks from `packages/opencode`: `bun test
test/config/project-layer.test.ts test/config/config.test.ts
test/cli/tui/project-origin-consumers.test.ts`.
