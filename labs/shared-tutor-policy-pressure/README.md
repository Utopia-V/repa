# Shared Tutor policy pressure lab

Ledger ID: ALS-021

This lab asks whether the unchanged production Tutor loop can use the same
course material, policy prompt, tool definitions, and state-derived capability
rule to make different learning moves for different learning situations. It
covers direct teaching, representation repair after failed prose, independent
prediction, discrimination, explicit future return, cross-Session Agenda
purposes, current-form selection, and independent-versus-guided Agenda
disposition.

The model is the flexible semantic component; production code remains the
authority for durable state, source binding, chronology, and legal writes. The
lab therefore calls the real `runTutorTurn`, production prompt, production
tools, production DeepSeek adapter, and public domain commands. It does not
carry a scenario-specific Tutor prompt or import lab types into `src/`.

The excluded pilot may repair impossible fixtures or missing observations.
After that repair, `frozen-v1.json` pins scenarios, orders, material, relevant
production sources, review/aggregation rules, and model settings. Eight
precomputed complete blocks make model variability visible without pretending
that DeepSeek exposes a reliable seed.

Mechanical checks cover provider tool-attempt/durable-invocation agreement,
failed or extra mutation attempts, each scenario's material-read requirement,
Agenda disposition, route stability, transport failures, and persisted Turn
state. Agenda-source reads remain diagnostic rather than a universal gate.
Qualitative review separately judges whether the teaching move actually fits
the situation. Keyword matching is diagnostic only and cannot pass a sample.

Every completed non-infrastructure condition remains in the formal denominator.
If it has no reviewable assistant sample, the hidden review map records an
automatic primary-criterion failure; it is not silently discarded.

Formal review is a four-step artifact workflow: export opaque individual and
contrast packets; obtain two independent JSONL reviews; lock reviewer files,
all 112 completed results, mappings, instructions, and executable rules; then
diff, adjudicate the exact categorical disagreement queue, and aggregate. A
post-lock byte change fails closed. `formal-verdict.json` links its summary to
the full per-sample decisions and their SHA-256 hashes so a maintainer can
recompute the outcome without this conversation.

This lab does not measure human learning, retention, transfer, optimal
pedagogy, or cross-subject generality. A simulated transcript controls the
input; it is not a learner outcome.

Post-run status (2026-07-13): the main campaign completed 112/112 samples on
their first selected attempts. Predeclared mechanical gates make v1 acceptance
impossible, and both raw reviewers gave the independent-prediction return 0/8.
The locked reviews produced 518 categorical disagreements dominated by
applicability calibration, so adjudication and aggregation were deliberately
not run. `review-analysis-stop.json` records that boundary beside the ignored
raw artifacts. This lab is closed; do not extend the grading machinery to
rescue a fine-grained score.

Raw bundles live under the ignored `.runs/` directory. Live runs have no AI SDK
transport retry, use a 90-second condition timeout, retain append-only attempt
journals, validate completed-case identity before resume, and require a hard
campaign budget. The passive observer drops sensitive containers without
globally redacting ordinary header counters from the archived model boundary.

The repaired second pilot is also preserved as a secret-free, self-contained
provider-input replay oracle. It feeds the 14 selected model streams through
the current production loop without network access and requires all 29 current
provider requests to match. Only production-generated Agenda concern/effect
UUIDs receive trace-consistent alpha-renaming. This is an input-equivalence
waiver for omitting a third paid pilot, not a policy-quality result.

```powershell
bun test labs/shared-tutor-policy-pressure
bun run typecheck
bun run labs/shared-tutor-policy-pressure/provider-input-equivalence.ts verify

$env:REPA_LAB_MAX_USD="0.20"
bun run lab:shared-policy -- pilot deepseek-v4-flash

# Only after the excluded pilot is audited and frozen-v1.json exists:
$env:REPA_LAB_MAX_USD="0.60"
bun run lab:shared-policy -- main all deepseek-v4-flash

# After all 112 cases complete:
bun run labs/shared-tutor-policy-pressure/review.ts export <campaign-directory>
bun run labs/shared-tutor-policy-pressure/formal-review.ts prepare <campaign-directory>
bun run labs/shared-tutor-policy-pressure/formal-review.ts lock <campaign-directory> <submissions.json>
bun run labs/shared-tutor-policy-pressure/formal-review.ts disagreements <campaign-directory>
bun run labs/shared-tutor-policy-pressure/formal-review.ts aggregate <campaign-directory> <adjudication.jsonl>
```

An infrastructure retry is explicit and limited to one:

```powershell
bun run lab:shared-policy -- main all deepseek-v4-flash --retry-infrastructure
```

See the pre-run protocol at
`docs/research/shared-tutor-policy-contrasting-traces-protocol-2026-07-12.md`
and the completed result at
`docs/research/shared-tutor-policy-formal-result-2026-07-13.md`.
