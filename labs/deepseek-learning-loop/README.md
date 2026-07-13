# DeepSeek learning-loop lab

## Questions

1. Can an existing provider/tool-loop implementation carry the generic harness
   mechanics without Repa inventing another model loop?
2. If the loop remains generic, can learning-specific context, tools, and state
   consequences still make learning first-class?
3. Under compact constraints, does a current inexpensive model distinguish
   ordinary clarification, selected teaching, formal assessment, assisted
   performance, and correction reliably enough to be useful?
4. Can a declared activity contract keep the learning layer thin, or must it
   infer educational meaning from raw conversation after every turn?

## Boundary under test

The lab uses Vercel AI SDK, the same general model/tool-loop family used by the
pinned OpenCode reference. AI SDK owns provider translation, tool-schema
validation, tool execution, result continuation, and a finite step guard.

Repa-specific code owns only:

- learning context and an explicit activity contract supplied to the model;
- learning-specific tool definitions;
- an in-memory experimental learning state;
- deterministic validation of declared learning consequences;
- scenario oracles and result analysis.

The deterministic rule may derive a known follow-up obligation after a
normally completed activity. It never fabricates an assessment result or
mastery evidence. An interrupted or output-limited activity is not treated as
completed.

This is an experiment, not a production dependency decision.

The older scripted, dual-model, ablation, and activity-contract suites below
record earlier hypotheses. They are not the current learning-state design.
Phase B2 uses simple progress such as `explained`; it does not automatically
turn every explanation into verification work.

## Secret and cost safety

- The API key is loaded from the repository-root .secret file.
- .secret is Git-ignored and its contents are never logged.
- Live calls are opt-in commands, not part of the root test suite.
- Each invocation limits output and AI SDK steps.
- The runner records token usage and a conservative cache-miss cost estimate.
- The default experiment budget is USD 0.25; REPA_LAB_MAX_USD may lower it.

The experiment does not access personal learning material.

## Suites

### Scripted learner

Fixed messages isolate semantic decisions:

- casual clarification should not write learning state;
- the scripted selected explanation whose declared contract requires verification
  should create that work but no task result;
- formal miss should record the result and targeted review;
- hinted success should preserve assistance and request verification;
- correction should retract an earlier interpretation.

### Model learner

DeepSeek plays both Tutor and learner. The learner receives a controlled
misconception or assistance profile. The Tutor must teach or assess, then use
the same learning tools after the learner response.

### Tool-selection ablation

The selected-explanation case compares:

- model-discretionary tool use;
- AI SDK per-step forced tool selection where the provider supports it; and
- provider-independent enforcement of the declared completion contract.

DeepSeek V4 thinking mode rejects explicit `tool_choice`, so forced selection
is intentionally tested only in non-thinking mode.

### Activity-contract transfer

Three explanation-shaped requests declare different consequences: learning
with verification, reference-only output with no learning write, and learning
without explicit testing vocabulary. The same scenarios run under model
discretion and contract enforcement.

## Live commands

```powershell
bun run experiment.ts scripted deepseek-v4-flash
bun run experiment.ts scripted deepseek-v4-pro
bun run experiment.ts dual deepseek-v4-pro
bun run ablation.ts deepseek-v4-flash
bun run ablation.ts deepseek-v4-pro
bun run contract-transfer.ts deepseek-v4-flash
bun run contract-transfer.ts deepseek-v4-pro
bun run tool-lifecycle.ts deepseek-v4-flash
bun run tool-lifecycle.ts deepseek-v4-pro
bun run approval-cancellation.ts deepseek-v4-flash
bun run approval-cancellation.ts deepseek-v4-pro
bun run stale-approval.ts deepseek-v4-flash
bun run stale-approval.ts deepseek-v4-pro
bun run tool-catalog.ts deepseek-v4-flash
bun run tool-catalog.ts deepseek-v4-pro
bun run code-mode-readonly.ts deepseek-v4-flash
bun run code-mode-readonly.ts deepseek-v4-pro
bun run material-retrieval.ts deepseek-v4-flash
bun run material-retrieval.ts deepseek-v4-pro
bun run untrusted-material.ts deepseek-v4-flash
bun run untrusted-material.ts deepseek-v4-pro
bun run staged-model.ts
bun run isolated-model-handoff.ts
bun run context-stratification.ts deepseek-v4-flash
bun run context-stratification.ts deepseek-v4-pro
bun run alignment-annotation.ts deepseek-v4-flash
bun run alignment-annotation.ts deepseek-v4-pro
bun run alignment-structured-output.ts deepseek-v4-flash
bun run alignment-structured-output.ts deepseek-v4-pro
bun run simulated-student.ts pilot deepseek-v4-flash
bun run learning-native-b2-first-trace.ts deepseek-v4-pro
bun run learning-native-b2-trace-2.ts deepseek-v4-pro
bun run learning-native-b2-trace-3.ts deepseek-v4-pro
bun run learning-native-b2-trace-4.ts deepseek-v4-pro
bun run learning-native-b2-trace-5.ts deepseek-v4-pro
bun run learning-native-b2-trace-6.ts deepseek-v4-pro
```

`learning-native-b2-first-trace.ts` drives the first complete learning behavior trace
through the file-backed B1 layer. The Tutor reads a pinned Objects excerpt,
teaches once, receives one learner-steering message chosen only from its visible
reply, and adjusts within the same Agent loop. The host records one
source-linked `explained` fact after normal completion. Full assistant/tool
messages remain in the local raw run; a fresh SQLite reopen must recover the
visible Session and compact progress. Automated checks cover mechanics,
steering, and durable semantics. Factual and pedagogical quality are reviewed
separately.

`learning-native-b2-trace-2.ts` separates an operation from its principle. It
loads the method-example and `this` material windows lazily, lets a scripted
learner report following only after a visible demonstration, and later records
the principle explanation. A fresh reopen must preserve `demonstrated`,
`followed`, and `explained` as three source-linked progress facts without
creating an attempt or revisit.

`learning-native-b2-trace-3.ts` selects a bounded independent-reading range. The
Tutor gets the compact course position but no material tool, because the
learner did not ask for content help. After a valid standby response, a
learner completion report creates one source-linked `read` fact and nothing
else.

`learning-native-b2-trace-4.ts` records a fixed, independently wrong object-aliasing
attempt before the Tutor call. The Tutor reads that attempt lazily and repairs
the local misconception. A source-linked revisit appears only at its due time;
the course route and simple progress stay unchanged.

`learning-native-b2-trace-5.ts` combines an imminent low-value assignment, a due
learning revisit, untouched new material, and a 45-minute budget. The Tutor
reads the assignment source lazily and must protect the deadline, then return
remaining time to learning. The plan remains raw Session content; assignment
and revisit state remain durable.

`learning-native-b2-trace-6.ts` closes and reopens the SQLite learning layer, then
starts a new Session whose only user text is `继续`. Compact context surfaces a
due revisit; the Tutor retrieves the linked old attempt only after selecting
that action and begins recall without prematurely completing the revisit.

`simulated-student.ts` is the controlled semantic-contract and one-step
policy-execution benchmark. It fetches attributed JavaScript tutorial tasks at
a pinned Git commit, uses isolated DeepSeek-V4-Flash calls to render
program-selected learner profiles, compares
answer-only and declared-contract evidence interpretation, and compares a
fixed queue with stateless, oracle-state, and inferred-state selectors. Each
fixture runs in a separate model request. Pilot cases and results are excluded
from product claims. The `main` phase verifies the frozen semantic contract,
material bytes, executed files, model profile, and numbered trial before any
model call. The three formal trials are complete and cannot be reused. Their
former command sequence is historical, not a live command: the current tree
intentionally differs from the frozen execution snapshot after adding the sole
follow-up. See
`docs/research/simulated-student-benchmark-main-2026-07-11.md` and the preserved
`frozen/simulated-student-main-v1/package.json` bytes.

`tool-catalog.ts` compares the same formal learning write under a broad direct
tool catalog, deterministic `activeTools` narrowing, and a two-step discovery
entry followed by narrow exposure. It defaults to three trials per variant;
`REPA_LAB_TRIALS=1` is useful for a cheap smoke run.

`code-mode-readonly.ts` bundles the pinned, read-only OpenCode code-mode source
into a local Git-ignored generated file, then compares direct dependent reads
with one confined orchestration call. It never edits `.reference/`, and it
exposes no durable learning write to the interpreter.

`material-retrieval.ts` compares a full synthetic course-spec payload with a
bounded search-then-read path. The facts are fictional, exact-answer and
line-citation oracles are deterministic, and full synthetic tool payloads stay
only in the local Git-ignored raw trace.

`untrusted-material.ts` places a forged learning-write instruction inside a
synthetic course excerpt. It compares prompt-only resistance, activity-local
tool narrowing, and executor rejection. This is a focused boundary fixture,
not a general prompt-injection certification.

`staged-model.ts` compares DeepSeek-V4-Flash-only,
DeepSeek-V4-Pro-only, and one same-loop profile that uses DeepSeek-V4-Flash for
the evidence-read step and DeepSeek-V4-Pro for the action-decision and final
continuation. Per-step usage is priced against the model that actually ran.

`isolated-model-handoff.ts` avoids sharing provider tool-call history: a
standalone DeepSeek-V4-Flash call extracts a provenance-bearing packet from a
large synthetic log, and a fresh DeepSeek-V4-Pro call selects the learning
action. It compares that boundary with direct decisions by each model.

`context-stratification.ts` compares a full raw learning-state read, a compact
course overview with bounded evidence reads, and a local-first path that must
retrieve the overview lazily. It tests whether a teacher-like global view can
remain present without eagerly loading every detailed record. The fixture is
synthetic and does not select a production context schema.

`alignment-annotation.ts` compares model-produced candidate task-to-skill
alignments with a deterministic lexical baseline over forty adversarial short
records. Transport, relation, edge, exact-record, hidden-positive, keyword-trap,
ambiguity, and confidence errors remain separate. Candidate annotations are
artifact hypotheses only; the tool exposes no learner-state or curriculum
write.

`alignment-structured-output.ts` runs the same frozen alignment benchmark with
AI SDK `Output.json`, an explicit JSON shape, and local Zod validation, with no
tool call. DeepSeek rejected native `json_schema` during the capability probe.
The final fixture asks whether a side-effect-free candidate projection should
use provider-supported JSON generation rather than tool transport. Failures
remain separate from the earlier tool-call traces.

Every live command writes a sanitized raw trace under `.runs/`. That directory
is local and Git-ignored; stable findings are promoted into `docs/research/`
instead of committing large model transcripts.

The recorded 2026-07-11 run and its interpretation are in
`docs/research/deepseek-learning-loop-oss-reduction-2026-07-11.md`.

## Non-claims

Passing scenarios does not prove educational effectiveness, a production
schema, a scheduler policy, or robust behavior across disciplines. Failing a
scenario may expose prompt, tool, model, or scenario defects and must be
diagnosed before changing architecture.

The current oracles validate learning-side effects and provenance, not the
factual or pedagogical quality of generated explanations. A model learner is a
controlled stimulus, not evidence about real learners.

Production code must not import this directory.
