# Course and Course View authority

Changes in this subtree must preserve the Course authority defined by the
[native learning data model](../../../../docs/architecture/01-native-learning-data-model.md)
and concretized by
[Gate 7](../../../../docs/research/opencode-fork-gate-07-course-view-authority-2026-07-15.md).

## Required boundary

- A Course is one stable LearnerHome-owned learning endeavor; it is not a
  directory, LearningSpace, Session, Goal, or the only active subject.
- A Course View is one continuing route strategy. Its revisions are immutable;
  a materially different strategy receives another View identity.
- Course-owned item identity is separate from revision-bound title, parent,
  order, and membership. Cross-revision continuity is explicit and conservative.
- The optional working selection pins one exact eligible revision and has its
  own version. A Course with no View or no selection is valid.
- Withdrawal is reversible discovery/selection disposition, not completion,
  mastery, abandonment, or physical deletion.

## Dependency and transition rules

Course may depend on native database and small identity/schema primitives. It
does not import Session, provider, terminal, material, learner, Goal, or Tutor
policy services. Expose narrow owner reads and opaque transaction revalidators
to consumers; do not hand out the mutable Course service or let another module
write Course tables. Preserve exact CAS, selection-version, eligibility,
mapping, and atomic rollback behavior—never fall back to titles or fuzzy
identity matching.

Focused checks: `bun test test/course-authority.test.ts
test/course-pagination.test.ts` from `packages/core`, plus migration or
cross-owner tests when the schema or transaction seam changes.
