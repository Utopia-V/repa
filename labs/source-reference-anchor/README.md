# Source-reference semantic anchor

This deterministic lab compares two candidate reference meanings after a
course artifact changes:

- a live path plus line range; and
- a reference to the bounded tool-result item that was actually observed.

It demonstrates only the stale-reference failure and the separation between a
durable item and its compacted model-context projection. The TypeScript types
are fixtures, not a proposed production session schema, content-addressed
store, or source URI standard.

Run from the repository root:

```powershell
bun test labs/source-reference-anchor
```

