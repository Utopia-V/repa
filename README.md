# Agentic Learning System

This repository is the independent implementation workspace for a terminal-native, local-first learning agent.

The project is not a note generator, Anki skin, todo application, or desktop port of the earlier Rep course project. Its purpose is to provide a Tutor that can plan, teach, demonstrate, answer, guide practice, arrange review, find gaps, and work with real course constraints inside a native terminal agent.

The repository reset its learning-domain path after a narrow benchmark began
to overemphasize gradable practice. Complete Tutor behavior is recorded, and
the bounded labs established learning context and real model-initiated write
authority. ALS-018 produced useful semantic oracles but not a runnable agent.
ADR-0011 fixes the runtime direction: one Repa-owned TypeScript/Bun Tutor loop
over mature provider, streaming, tool, cancellation, and later rendering
mechanics. ADR-0012 now fixes the overall architecture: a learning-centered
modular monolith whose program-owned state spans Sessions while the Agent loop
provides flexible research, teaching, and action. The first real-provider
terminal loop, architecture gate, and course-continuity milestone are
complete: local Markdown and Agent-created provisional routes now share one
durable, correctable Course View and resume in a fresh Session. The next entry
gate is no longer a generic activity/progress table. The active product
pressure path is to teach one difficult part, adapt to the learner's response,
and later return in a purpose-appropriate form while preserving the accepted
authority and failure boundaries. ALS-020 has now proved the missing meaning
boundary: Agenda may preserve a specific source-linked reason for future
attention, while the later activity, Agenda disposition, and learning evidence
remain separate. The first Agenda slice is now implemented: a source-linked
future-attention concern can
cross Sessions, remain lazily inspectable, be addressed without becoming
evidence, and be corrected without deleting history. ALS-021 has now completed
the shared-policy pressure and did not earn v1 acceptance. Its decisive result
is that the durable reason survived a fresh Session but did not reliably govern
the later teaching move. The next architecture gate is therefore the
state-to-model selection seam for an inspectable current learning purpose, not
another round of Agenda schema growth or prompt patching. ALS-022A-E have now
closed that gate for the demonstrated one-candidate case: explicit binding
repairs realization; two preliminary model selectors fail; and a
program-filtered, one-candidate conditional default inside the ordinary Tutor
sample passes generic continuation plus explicit override contrasts 10/10.
An exact-reason-only ablation then passed only 3/8 strictly, earning one narrow
learner-response-before-disclosure constraint. ADR-0013 accepts that topology
while deferring a general constraint vocabulary and multi-candidate choice.
Proposal 0005 now implements that bounded contract under
`tutor-default-v3`: exactly one legal constrained Agenda concern can shape a
fresh-Session Tutor move, while an explicit current learner request still wins
and older policy inputs remain reproducible.
Start with the
[`documentation map`](docs/README.md), the
[`current understanding`](docs/current-understanding.md), and the
[`system architecture`](docs/architecture/00-system-architecture.md), then the
[`active build map`](docs/roadmap/architecture-led-build-sequence.md) and the
[`conditional-purpose decision`](docs/decisions/0013-conditional-current-purpose-composition.md).

## Current baseline

- Language/runtime: TypeScript on Bun.
- Primary engineering reference: OpenCode `v1.17.18`; secondary comparison
  reference: Codex `rust-v0.144.1`. Both are pinned by
  `references.lock.json`.
- Reference policy: inspect and learn; do not import or depend on the reference checkout.
- Development policy: design critical contracts deliberately, then use AI inside those boundaries.

## Verification

```powershell
bun install
bun run check
```

The local reference checkouts live under `.reference/` and are intentionally
ignored by Git.
