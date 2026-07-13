# Controlled semantic-contract and one-step policy-execution benchmark

Date: 2026-07-11

Status: v1 was frozen after the excluded pilot and before any main-run result;
three formal trials then completed without changing the contract. Results are
in `simulated-student-benchmark-main-2026-07-11.md`.
Semantic contract SHA-256:
`cb4612d55a543853ee500c12857e0ebc254e63d459f6e0de207a6a62e3dde12e`.
Executed-file hashes are in
`labs/deepseek-learning-loop/simulated-student-benchmark.v1.json`. Pilot changes
are recorded in `simulated-student-pilot-2026-07-11.md`.

## Decision this benchmark serves

The benchmark asks whether a learning-native evidence and task-selection path
earns its complexity over two simpler alternatives:

```text
real source material
-> formal task under known conditions
-> observable learner response
-> correctable evidence interpretation
-> learner projection and candidate reasons
-> selected next action
```

It does not ask whether an LLM can imitate a human mind or whether the product
improves real human learning. It uses controlled hidden truth to test whether
the proposed semantics and policies are coherent, diagnostically separable,
and useful under noisy natural-language responses.

## Primary hypotheses

### H1: condition-bearing evidence is safer than transcript-only inference

Given the same task and response, an interpreter that receives source-linked
task purpose, rubric, target alignment, and observed assistance conditions will
produce fewer false strong-evidence claims than one that receives only the raw
task and response.

### H2: a model can execute the frozen one-step policy from evidence-backed state

Given competing ready work, review, remediation, verification, and deadline
candidates, a selector with a compact learner projection and inspectable reason
set will execute the predeclared policy more often than a stateless model and a
fixed queue baseline. This does not establish that the policy is optimal.

### H3: inference and selection failures can be localized

A selector receiving oracle hidden state establishes an upper bound. If that
selector succeeds while the end-to-end path fails, the bottleneck is evidence
interpretation or projection rather than task-selection theory.

### H4: the semantic contract is not JavaScript-specific

After the first material slice is stable, the same benchmark contract must run
against one structurally different domain without changing the meanings of
task result, evidence interpretation, projection, correction, or candidate
reason. Domain tasks, rubrics, and policy parameters may change.

## Experimental layers

The main result reports four layers separately. One end-to-end score is not
sufficient evidence.

1. **Material and task alignment** — the task, rubric, targets, and source
   revision are resolvable and correct.
2. **Evidence interpretation** — the candidate interpretation is compared with
   hidden learner truth and observable conditions.
3. **Oracle-state selection** — the selector receives the simulator's hidden
   state, isolating task-selection behavior from inference error.
4. **End-to-end selection** — the selector receives only admitted evidence and
   derived projections.

## First real-material slice

The first slice uses selected tasks and explanations from The Modern JavaScript
Tutorial (`javascript.info`), including object-method `this`, detached
callbacks, and binding. Material is fetched at run time from the public source
repository at Git commit
`52c1e61915bc8970a950a3f59bd845827e49b4bf`. Every fetched item records its URL, byte hash,
and license attribution. Full third-party material remains in ignored local run
artifacts rather than the repository.

The content license is CC-BY-NC based. The benchmark is non-commercial research
and must preserve attribution. A future redistributable or commercial Domain
Pack requires a separate license decision.

JavaScript is an experimental material instance, not the product's supported
domain boundary. A second domain is selected only after the first benchmark
mechanics are frozen.

## Hybrid learner simulator

The simulator separates hidden state from natural-language rendering.

```text
seeded hidden learner state + virtual clock
                 |
                 v
program-selected response contract
                 |
                 v
isolated learner LLM renders a natural answer
                 |
                 v
Tutor sees task, answer, and observable conditions only
```

The learner LLM never receives the expected Tutor action, benchmark score, or
selector context. The Tutor never receives hidden mastery, misconception, or
retention state.

The program, not the learner LLM, chooses whether the response contract is
correct, incorrect under a named misconception, partial, hinted, self-corrected,
or genuinely unresolved. Deterministic validators reject a rendered answer
that violates its assigned response contract.

Virtual time advances in the simulator. Hidden retrieval outcomes are generated
from seeded scenario families rather than from the scheduler under test. The
same retention formula must not generate hidden truth and rank reviews.

Initial simulator families cover:

- stable independent knowledge;
- fast decay;
- hint-dependent performance;
- stable misconception;
- noisy retrieval; and
- interference between confusable claims.

## Compared systems

### Evidence interpreters

- `answer_only` — raw task, expected answer/rubric, and learner response;
- `declared_contract` — adds task purpose, source revision, target alignment,
  and authoritative assistance conditions.

Both produce untrusted structured candidates. Deterministic domain validation
owns admission, exact target coverage, and legal outcome/signal/obligation
combinations. Each case is a separate model call; variants of the same task
never share a prompt.

### Task selectors

- `fixed_queue` — a documented non-LLM priority baseline with no inferred
  learner model;
- `stateless_model` — current situation and candidate tasks, but no durable
  learner projection;
- `oracle_state_model` — compact hidden truth, used only as a diagnostic upper
  bound; and
- `inferred_state_model` — admitted evidence, learner projection, obligations,
  and candidate reasons.

All model variants receive the same candidate task set and time budget. The
oracle action and disallowed actions are fixed before model calls.
Each scenario is a separate model call. The six oracle actions occupy candidate
positions one, two, and three exactly twice each.

Three scenarios consume admitted evidence and three exercise hand-authored
policy state. Their scores are reported separately; only the former support an
end-to-end evidence-to-selection statement.

## Primary measurements

### Evidence

- exact record accuracy;
- outcome accuracy;
- target/error-attribution accuracy;
- assistance preservation;
- false independent-evidence rate;
- abstention precision and recall (deferred from v1 because the formal slice has
  no unresolved case);
- schema/transport failure rate; and
- candidate correction consistency.

### Selection

- exact next-action accuracy;
- hard-invariant violation rate;
- missed remediation and unnecessary-review rates;
- difference between oracle-state and inferred-state selection;
- performance relative to fixed and stateless baselines; and
- latency, tokens, and estimated API cost.

## Hard gates

These gates are not calibrated by the pilot:

1. Hidden learner state is absent from evidence, stateless-selector, and
   inferred-selector requests. It is present only in the explicitly diagnostic
   oracle-state selector.
2. No candidate outside the declared task targets is admitted.
3. Recorded assistance always equals the authoritative observed condition.
4. Passage of virtual time creates no evidence event.
5. Correction/retraction rebuilds the same projection as a clean replay of the
   active interpretations. V1 treats the existing deterministic semantic-anchor
   test as the pre-main gate; it is not a model-run metric.
6. A learner error changes local projection or priority but never accepted
   curricular relations. V1 exposes no curriculum-write surface and makes no
   curriculum-learning claim.
7. Every third-party source reference resolves to the recorded observed bytes
   or fails visibly as stale/missing.
8. Invalid structured output, infrastructure failure, and semantic error remain
   separate result categories.

Any hard-gate failure blocks promotion of the affected learning-domain contract.

## Pilot and freeze rule

The pilot exists only to find benchmark defects: impossible prompts, leaking
hidden state, invalid oracles, inadequate validators, unsupported provider
transport, and unusable metric scales. Pilot cases, prompts, thresholds, and
results are marked excluded and cannot support a product or publicity claim.

After the pilot:

1. fix benchmark defects;
2. freeze fixture version, source hashes, prompts, schemas, models, parameters,
   seeds, primary metrics, practical-effect thresholds, and exclusion rules;
3. record a benchmark manifest hash; and
4. run the main benchmark without changing those values.

The frozen formal plan uses DeepSeek-V4-Flash (API, non-thinking) as both
student renderer and Tutor/selector, temperature 0, one fixture per call, and
three numbered trials. The API does not expose a usable provider seed; hidden
simulator state is fixed by fixture contract, while three trials expose model
nondeterminism.

Soft gates must pass in at least two of three trials. Hard gates must pass in
all three. All comparisons are paired within a trial.

Evidence gates for eight cases:

- declared outcome at least 7/8;
- declared assistance exactly 8/8;
- declared claim-set and exact record at least 6/8;
- zero false-independent claims;
- at least two of three independent-success claims recovered; and
- declared exact accuracy leads answer-only by at least one case in a passing
  trial, is positive in at least two trials, and totals at least three cases
  across all trials.

Selection gates for six scenarios:

- fixed queue remains frozen at 2/6;
- oracle at least 5/6 with zero forbidden actions;
- inferred state at least 4/6 with zero forbidden actions;
- inferred leads fixed by at least 2/6 and stateless by at least 1/6;
- oracle leads inferred by at most 1/6; and
- inferred selects at least two of the three evidence-linked oracle actions.

Infrastructure exclusions are limited to failures before a model response is
available, such as provider outage or TLS failure. Malformed model output,
truncation, and failure to follow the response contract remain counted results.

## Result-to-action policy

| Result | Required action |
|---|---|
| A hard gate fails | Do not implement the affected domain contract. Repair the boundary and rerun only the failed layer. |
| Evidence interpretation fails while oracle-state selection succeeds | Preserve selection as a hypothesis; redesign evidence conditions, abstention, or projection and run one focused evidence follow-up. |
| Evidence is reliable but oracle-state selection does not beat simple baselines | Drop the complex selector. Enter engineering with the simplest surviving scheduling rule. |
| Oracle-state selection succeeds but end-to-end selection fails | Treat inference/projection as the bottleneck; do not tune scheduler weights to hide it. |
| End-to-end advantage appears in only one simulator family or one domain | Promote only shared runtime/evidence boundaries; run one cross-family or cross-domain falsifier before a general selector claim. |
| First-domain evidence and one-step policy execution pass | Run one structurally different domain using the same semantic meanings before promoting a general learning selector. |
| End-to-end behavior is robust across predeclared families and a second domain | Freeze the minimum semantic contracts and enter the headless production contract slice. |
| The main result remains ambiguous after one predeclared targeted follow-up | Choose the simpler design and record the unresolved product claim as deferred. |

There is no open-ended sequence of exploratory rescues. At most one targeted
follow-up may address one identified confound from the main run.

## Claim boundary

Passing may support claims about controlled simulation, mechanism reliability,
relative benchmark behavior, context cost, and reproducibility. It cannot
support claims that real students learn faster, remember longer, transfer
better, or outperform another educational product.

All public summaries must name the simulator, materials, baselines, models,
sample sizes, exclusions, and limitations next to any quantitative result.

## Required artifacts

- executable deterministic fixture tests;
- ignored full raw run bundles without secrets;
- a frozen manifest with material hashes and model configuration;
- aggregate and per-case scores, including failures;
- a pilot note explaining every benchmark change before freeze;
- a main-run report linked from the experiment ledger; and
- an architecture consequence that promotes, simplifies, or rejects each tested
  contract according to the table above.
