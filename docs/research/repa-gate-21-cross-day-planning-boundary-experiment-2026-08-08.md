# Repa Gate 21 pre-contract cross-day Planning boundary experiment

Status: **Completed pre-contract experiment and roadmap-topology evidence.**
This record does not accept a Gate contract, authorize production
implementation, or qualify Gate 21A move selection.

Date: 2026-08-08

Exact derivation base:
`c100b431fe174d1993b2baa89a7d1b133300b579` (`HEAD`, `main`, and
`origin/main` at experiment opening). Gate 20 implementation commit
`1f92169840559b63eb8f96c31a67985c814a86f0` and integration/status commit
`228126535619a70d172e17e6f6b56b27cf86fbb6` are ancestors. The only
pre-existing worktree change was the maintainer-owned `AGENTS.md` modification;
it was neither read as product authority nor changed by the experiment.

Authority and correction routing:
[product origin](../foundation/00-product-origin.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[system architecture](../architecture/00-system-architecture.md),
[native learning data model](../architecture/01-native-learning-data-model.md),
[Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md), and the
[Gate 16 planning-correction provenance](../fork-ledger.md#2026-07-21-gate-16-acceptance-and-planning-correction-provenance).

The experiment was required because the then-current Gate 21 candidate joined
two unsettled meanings—Assignment authority and cross-day Planning—and because
the accepted counterexample required the same Goal pair to produce different
results at two start dates. Historical ALS/deadline schemas and the withdrawn
minute-scale rescue design were deliberately excluded.

The experiment treats arithmetic as a constraint on helping the learner, not
as the product objective. It does not optimize completed items, occupied time,
deadline compliance, or a score. A feasible allocation still needs the ordinary
Tutor to choose an appropriate explanation, demonstration, guided attempt,
practice, review, or work-with-the-learner move; Gate 21A and Gate 23 own that
behavioral composition.

## Parent questions

1. What is the narrowest deterministic computational boundary that can decide
   feasibility over exact accepted workload, deadline, and shared-capacity
   facts without inventing learning value or activity?
2. Does Assignment identity/lifecycle share one irreducible acceptance,
   transaction, migration, and recovery boundary with Planning?
3. Can the boundary remain truthful when Repa is used intermittently, the
   learner may work elsewhere, and no progress update arrives?
4. Which counterexample would require widening beyond divisible cross-day work?

Decision ID `G21-EXP-QUESTION-001`.

## Experimental kernel

The local experiment used integer work quanta and a time-expanded
transportation/max-flow feasibility network over one immutable accepted input
snapshot:

```text
source
  -> each demand                 capacity = accepted remaining-work quanta
  -> each eligible civil day    capacity = that demand's work quanta
  -> sink                       capacity = accepted shared capacity for that day
```

A demand is fully feasible exactly when the maximum flow equals the sum of all
accepted remaining work in the declared portfolio. A separate deterministic
proposal validator checked:

- exact demand and input identities;
- integer, non-negative allocation quanta;
- allocation only on days eligible for that demand;
- exact per-demand conservation; and
- the sum across **all** demands against one shared daily capacity.

An independent exhaustive dynamic-programming oracle enumerated daily
allocations for the small fixtures and agreed with every feasibility result.
The flow solver supplied no educational objective, priority, preferred day, or
canonical plan. A source-bearing candidate allocation had to pass the validator
independently. This matters because a flow optimum may be non-unique, and a
library's deterministic tie result is not stable product meaning across solver
versions.

The experiment used 30-minute quanta only to make arithmetic finite and exact.
That unit, divisible work, daily buckets, and every illustrative allocation are
experiment parameters rather than production schema commitments.

Decision ID `G21-EXP-KERNEL-001`.

## Exact fixtures and results

All dates below are civil dates in one already normalized zone. A deadline is
inclusive for this experiment only; Gate 21 must bind its own accepted deadline
boundary explicitly rather than inherit wording from this fixture.

| Fixture | Accepted inputs | Result | Falsified collapse |
| --- | --- | --- | --- |
| Goal-only, earlier start | exact OS Goal revision 7 and DS Goal revision 4; separate accepted Planning inputs: OS remaining work 6 / deadline Aug 18, DS remaining work 8 / deadline Aug 20; Aug 6–20 capacity 3/day | `maxFlow=14`, work `14`, declared capacity `45`, feasible, slack `31`; a spaced source-bearing proposal validated | static Goal order/priority as the plan, or workload hidden inside Goal |
| Same Goals, late start | same exact producer heads and accepted Planning inputs; Aug 16–20 capacity 3/day | `maxFlow=14`, work `14`, capacity `15`, feasible, slack `1`; a tight proposal validated | one plan independent of start time |
| Shared-capacity collision | two per-demand proposals each spend 3 on Aug 16 and 3 on Aug 17 against one capacity of 3/day | each isolated proposal is feasible; the portfolio validator rejects combined use `6 > 3` on both days | independent per-demand feasibility or two plans spending the same capacity |
| Availability correction | late-start fixture, but Aug 17 capacity changes from 3 to 1 | `maxFlow=13`, work `14`, shortfall `1`, infeasible | mutating or narrating the old plan as still feasible |
| Local deadline bottleneck | OS work 10 due Aug 18; DS work 4 due Aug 20; Aug 16–20 capacity 3/day | total capacity `15 > 14`, but `maxFlow=13`; OS can use only 9 before its deadline | total-capacity comparison without demand eligibility |
| Assignment producer arm | OS remains exact Goal revision 7; DS becomes an exact Assignment revision carrying its obligation/source due meaning; separate accepted Planning input still supplies DS remaining work 8 and the exact accepted deadline | `maxFlow=14`, work `14`, feasible | hiding Assignment identity inside Planning, putting workload into Assignment, or requiring every plan to use one producer kind |
| Silent re-entry | the late-start plan ages while Repa is not used; no accepted progress or remaining-work successor exists | historical allocation unchanged; `inferredActivityFacts=[]`; result is `conditional_on_last_accepted_remaining_work` and requires only future-relevant reconciliation | elapsed allocation as work, zero progress, breach, or a daily reconstruction requirement |
| Interval: guaranteed feasible | one demand work `[10,12]`; three days each capacity `[4,5]` | upper work `12` fits lower capacity `12` | choosing an arbitrary point estimate |
| Interval: guaranteed infeasible | one demand work `[13,15]`; three days each capacity `[3,4]` | lower work `13` exceeds upper capacity `12` | presenting uncertainty as merely “probably hard” |
| Interval: indeterminate | one demand work `[10,14]`; three days each capacity `[3,5]` | neither robust bound decides; truthful result is indeterminate | inventing certainty from ranges |
| Indivisible-work falsifier | work 4 must be one contiguous non-preemptive block; two eligible days each have capacity 2 | divisible kernel returns `4/4` feasible; the accepted block is actually infeasible | treating divisible transportation as universal scheduling |

One valid late-start proposal, included only to make shared-capacity conservation
inspectable, was:

| Date | OS | DS | Total / capacity |
| --- | ---: | ---: | ---: |
| Aug 16 | 2 | 1 | 3 / 3 |
| Aug 17 | 2 | 1 | 3 / 3 |
| Aug 18 | 2 | 1 | 3 / 3 |
| Aug 19 | 0 | 3 | 3 / 3 |
| Aug 20 | 0 | 2 | 2 / 3 |

The earlier-start proposal deliberately spread the same work across Aug 6–20.
The exact tie choice is not a product preference; only producer eligibility,
conservation, shared capacity, and deadline legality were validated.

Decision ID `G21-EXP-RESULT-001`.

### Candidate production-bound preflight

After contract derivation proposed a first-boundary maximum of 32 demands and
360 capacity buckets, the same pure Bun max-flow shape was rerun at the dense
cross-product boundary: 11,520 demand-to-bucket arcs, total work/capacity and
maximum flow `129600`. Bun `1.3.14` on the current Windows workspace completed
the single run in approximately `4.52 ms`.

This machine-specific observation is not a production benchmark, latency SLO,
or implementation acceptance. It only falsifies the immediate concern that the
candidate graph bounds are intrinsically impractical. The Gate contract still
requires maximum-value executable tests against the actual Core implementation
and reopens if representative latency or memory evidence contradicts the bound.

Decision ID `G21-EXP-BOUND-001`.

## Mature-model comparison

The computational comparison was bounded to mechanisms that could change the
invariant:

| Model | Preserved invariant | Current disposition |
| --- | --- | --- |
| Time-expanded transportation / max flow | exact conservation, deadline eligibility, one shared capacity, and a decidable feasibility witness over integer quanta | **Admit for the Gate 21 contract kernel and proposal validator.** Keep the algorithm local and objective-free. |
| Interval sensitivity by extremal bounds | truthful guaranteed-feasible, guaranteed-infeasible, or indeterminate result without probabilities | **Admit as a narrow uncertainty oracle**, not as a risk-preference policy. |
| Cumulative/constraint scheduling | indivisible duration, contiguity, precedence, and richer temporal resources | **Defer behind the explicit contiguity falsifier.** Widen only if representative accepted work repeatedly needs these constraints. |
| Resource leveling or weighted optimization | smoothness, lateness cost, priority, utility, or preferred allocation among several feasible plans | **Reject for the opening kernel.** These objectives encode unowned learner/product values. |
| Model-predictive/receding-horizon control | repeated plan/observe/replan loops | **Reject as the authority model.** Repa cannot assume continuous or exclusive observation; re-entry is an event-triggered rebuild from accepted facts. |
| Real-time daemon solver | continual problem changes and warm restart | **Reject for the baseline.** Repa has no daemon, and wake-time derivation must not become hidden mutable truth. |
| Robust/stochastic optimization | risk posture across uncertain scenarios | **Defer.** Probability, conservatism, and protection level are learner/product choices not yet owned by the planning input model. |

Primary implementation/model references were inspected only for the relevant
computational properties:

- Google OR-Tools' pinned
  [`SimpleMaxFlow` interface](https://github.com/google/or-tools/blob/551ad10d94835c99e5e1e684500d3db398c0e345/ortools/graph/max_flow.h)
  documents integer-capacity max flow and warns that a deterministic result may
  change across versions; therefore solver tie output is not product meaning.
- [Timefold real-time planning](https://docs.timefold.ai/timefold-solver/latest/responding-to-change/real-time-planning)
  stops, applies a problem change, and restarts a solver, while daemon solving
  does not return; that lifecycle is wider than Repa's wake-driven baseline.
- Bertsimas and Sim's
  [price-of-robustness paper](https://www.mit.edu/~dbertsim/papers/Robust%20Optimization/The%20price%20of%20Robustness.pdf)
  makes the robustness/conservatism control explicit, confirming that robust
  optimization would introduce an unowned policy rather than merely safer
  arithmetic.

Decision ID `G21-EXP-MODEL-001`.

## Topology result

The experiment returned the exact split condition reserved by Roadmap 09:

- Assignment owns independently valid obligation identity, revision, source,
  correction, optional due meaning, lifecycle, and enough learning context to
  earn a real teaching, guided-work, review, or Planning consumer.
- Planning owns accepted workload/capacity/progress-or-remaining-work inputs,
  declared shared scope, feasibility, working allocation, staleness, override,
  feedback, and recomputation.
- A valid Assignment remains true if Planning is infeasible, unknown, denied,
  interrupted, or fails. Rolling it back would erase useful obligation truth.
- Goal-driven Planning remains first-class and does not need an Assignment.
- Each authority requires a separate forward migration, recovery oracle,
  Context producer/read seam, evidence boundary, and reopen radius.

Roadmap 09 therefore inserts **Gate 20A — Assignment authority** and retains
**Gate 21 — substantial cross-day Planning authority**. Gate 20A is not a child
of Gate 20. Default create-and-plan composition is staged:

```text
Assignment command settles its own exact revision
-> Planning reads that exact revision
-> Planning independently commits feasible / infeasible / qualified-unknown truth
   or fails without erasing the Assignment
```

No current learner-visible invariant requires an atomic composite. A later
application composer may add one only if losing either consequence would make
the other invalid to the learner.

Decision ID `G21-EXP-TOPOLOGY-001`.

## Contract consequences

### Gate 20A

Gate 20A must close Assignment identity/revision/lifecycle, source-bearing
creation and correction, optional civil due meaning, exact current/history
reads, Context projection, exact Planning handoff, permission, replay/conflict,
transaction/restart recovery, source deletion, and a frozen Gate 20 predecessor.
It excludes Planning arithmetic, inferred progress, Goal/FutureAttention
lifecycle, generic commitment, administrative task tracking, completion-as-
product-success, and external submission effects. Its `completed` disposition
exists only to keep closed pressure from misleading later learning decisions.

### Gate 21

The resulting boundary is recorded in the separate
[Gate 21 Planning authority candidate](repa-gate-21-cross-day-planning-authority-2026-08-08.md).

Gate 21 must bind exact producer and accepted-input revisions, one declared
portfolio/shared-capacity scope, omission truth, feasibility/infeasibility/
qualified unknown, working allocation, staleness, override, feedback,
recomputation, intermittent re-entry, and exact later consumption. It must not
infer adherence, mutate producer lifecycles, or silently recompute an old
immutable context cut from the current clock. Feasibility is a hard input to
Tutor judgment, never a replacement for the learning move or an objective to
maximize task closure.

Accepted portfolio input, deterministic assessment, and source-bearing
validated allocation settle in stages under the same Planning owner. An
accepted correction survives assessment/proposal failure; a valid assessment
survives an invalid allocation, and older downstream revisions become visibly
stale rather than current again.

The first production algorithm may use the divisible integer feasibility
kernel only if the contract keeps contiguity/indivisibility visible as an input
it cannot yet represent. A representative demand that materially requires such
constraints reopens the algorithm boundary rather than being flattened into a
false feasible result.

### Successors

- Gate 21A compares exact Assignment and exact working-plan state as separate
  pressures; a plan is a constraint/trade-off, not adherence evidence.
- Gate 22 inspects and corrects Assignment and Planning separately and shows
  stale, unknown, infeasible, and absent-consumption truth.
- Gate 23 adds an intermittent-use trace in which possible off-program learning
  creates no inferred activity; only minimum future-relevant reconciliation is
  requested before an exact recomputed plan changes a later move.

Decision ID `G21-EXP-SUCCESSOR-001`.

## Invalidation and retention

The experiment conclusion must be revisited if:

- every legitimate Assignment creation/lifecycle change is shown to be invalid
  unless it co-settles with exactly one plan;
- a real first-boundary learner case requires an indivisible/contiguous or
  precedence-constrained workload that the divisible kernel would misclassify;
- accepted capacity is not shared across concurrent demands;
- a plan can be useful without exact producer/input identity or historical
  immutability; or
- a later consumer requires an explicit learner commitment rather than a
  correctable working allocation.

The inline experiment implementation was intentionally disposable and is not
retained as production structure. This record preserves the questions,
algorithm, fixtures, independent oracle agreement, exact results, falsifiers,
and topology consequence needed to reproduce or challenge it. Production code
must not import a research runner. Gate 21 implementation evidence must re-run
the accepted oracles against its actual pure Core boundary.

## Review boundary

This document is evidence for deriving Gate contracts. It has not undergone the
required fresh top-level contract/theory review and cannot substitute for one.
The first reviewable candidate after the split is the Gate 20A Assignment
contract. The separate Gate 21 Planning candidate exists, but its Assignment
arm and final review binding wait for Gate 20A acceptance and reconciliation;
the two contracts require separate fresh top-level reviews.
