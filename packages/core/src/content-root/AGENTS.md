# ContentRoot authority

Changes in this subtree must preserve the durable-root and bounded-observation
contract recorded by
[Gate 10](../../../../docs/research/opencode-fork-gate-10-content-root-authority-2026-07-17.md).

## Required boundary

- Bind an explicitly approved canonical path to the actual directory object;
  own stable binding identity, append-only grant episodes, revoke/rebind
  history, versions, and bounded queries.
- Keep observation permission separate from workspace/computer access and from
  independently anchored mediated mutation grants.
- The NTFS adapter proves only its stated Windows/NTFS path-object and no-reparse
  contract. Unsupported or ambiguous platforms fail with typed refusal; never
  fall back to lexical containment.

A ContentRoot is not a Course, LearningSpace, Artifact admission, hidden scan,
or write/shell grant. This Core authority does not import Session, provider,
terminal, Course, Material Map, learner, or Agenda semantics. Outer adapters
own confirmation, traversal, tool integration, and exact byte observation;
Gate 9 alone admits the resulting Artifact/Revision truth.

Focused check: `bun test test/content-root-authority.test.ts` from
`packages/core`; changes to manifest preparation or tool behavior also run the
matching `packages/opencode/test/content-root/manifest.test.ts` and
`packages/opencode/test/tool/content-root.test.ts` tests.
