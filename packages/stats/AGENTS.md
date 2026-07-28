# Inherited OpenCode Stats Site Guidance

> **Scope — retained auxiliary source, not a Repa product surface.** This instruction applies only when maintenance of `packages/stats` has been explicitly admitted. It does not make the stats site part of Repa's TUI baseline, startup, build, release, or roadmap; root [AGENTS.md](../../AGENTS.md) routes the work, while accepted Repa ADRs and the owners indexed by the [documentation map](../../docs/README.md) govern those decisions.

The root package currently has no `dev:stats` script, and this subtree has no
package manifest. Do not advertise it as directly runnable; any admitted
maintenance must first identify the actual local entrypoints and dependencies.
