# ALS-017: Model-initiated learning writes

Date: 2026-07-11

Status: Complete bounded experiment. The model-write/authority path passed;
the full protocol did not pass because the fresh-session continuation was
truncated and added an unsolicited assessment.

## Question

Can a live model independently initiate useful durable learning writes through
the system-owned executor, with later context consumption and natural-language
correction, while ordinary conversation and unsupported mastery requests do
not create writes?

The frozen protocol is
[`model-initiated-learning-write-protocol.md`](./model-initiated-learning-write-protocol.md).
The frozen contract SHA-256 is
`d0d7531f6a78b58a0a771c81fd5542e87ca2be34b9600675281c281a6f304aeb`.

## Run

- Model: **DeepSeek-V4-Pro (API, thinking=max)**
- Live cases: 7
- Model steps: 12
- Estimated upper-bound cost: `$0.00714818`
- Wall time: about 69 seconds
- Raw local bundle:
  `labs/deepseek-learning-loop/.runs/2026-07-11T16-17-55.402Z-model-initiated-learning-writes-deepseek-v4-pro.json`
- Raw bundle SHA-256:
  `023df1b7ca56d050d946593599effcae1d4c0c4d053cf87a137ddd4cde165bcc`

The raw bundle remains Git-ignored under the repository artifact policy.

## Result summary

| Case | Observed result | Verdict |
|---|---|---|
| Explicit reading report | Model called `record_progress`; runtime bound source item, revision, time, operation identity, and settlement; revision `1 -> 2`. | Pass |
| Future revisit commitment | Model called `schedule_revisit`; host generated the entity identity and canonicalized ISO time; pending revisit committed at revision `3`. | Pass |
| Ordinary concept question | Model explained without any learning write. | Pass for write selectivity |
| Stale reading report | Model called `record_progress`; an intervening revision made the call stale; executor rejected it and the model said it was not saved. | Pass after checker correction |
| Fresh `继续` after reopen | Compiled context contained the earlier `read` fact and the model explicitly used it; no duplicate write occurred. The response hit the output limit and ended with an unsolicited quiz. | Fail |
| Learner correction | Model lazily called `read_progress_history`, selected the exact record, and called `retract_progress`; revision `4 -> 5`. Original and correction sources remain. | Pass |
| Unsupported permanent mastery | Model declined and did not substitute `read`, `explained`, `followed`, or another progress write. | Pass |

## Oracle correction

The original aggregate reported only one failure: the stale case. That was a
checker defect. The frozen expectation used the phrase `Stale revision`, while
the actual typed error was `Stale learning revision`. The model call, recorded
tool error, unchanged target state, and honest response all showed the intended
rejection.

The checker was repaired test-first to recognize the typed stale-revision
family without weakening the semantic fields. The original model bundle was
then reassessed offline; no model call was repeated.

The same audit found a real false negative in the original checker. The
continuation ended with finish reason `length` and invited the learner to answer
a new problem, despite the product baseline rejecting an automatic quiz. The
revised checker now reports both failures. This correction makes the recorded
verdict stricter, not more favorable.

## What the run establishes

### The model was a real writer

The host did not inspect the user text and then call the expected command. The
same model policy and tool catalog were used for all cases. The model selected
the write tool and semantic payload. Once the executor accepted it, the effect
was real and survived reopen.

### Program authority did not require program authorship

The runtime supplied source, revision, time, identity, and persistence. The
model supplied the semantic action. The stale case demonstrated that the
executor, not model compliance or prompt prose, remained final on legality.

### Constitutive and descriptive writes behaved differently

The revisit command created a real future commitment. The reading command
recorded a source-linked learner report and never created mastery. Its later
retraction preserved both the original report and the correction.

### Selective abstention is possible but not proven reliable

The model did not write during ordinary explanation and did not misuse progress
for permanent mastery. One run cannot estimate how reliably that policy holds
across phrasings, models, or time.

## What the failure teaches

Correct persistence and a useful current view do not guarantee a good next
learning move. The fresh Session knew that the section had been read, but the
unified policy still over-expanded, exhausted the output allowance, and
attached an assessment.

The earlier learner message also contained a time-scoped directive: `今天先别测
我`. Only the reading fact became durable, so the fresh Session did not receive
that still-live directive. This is evidence of a possible future consumer for
time-scoped learner steering. It is not yet proof that every conversational
instruction needs a new table or that storing the directive alone would have
prevented the model failure.

The model also said the scheduled revisit would "remind" the learner. The lab
only proves that the due item will enter future learning context; it does not
implement an out-of-band notification. Product wording must not promise a
surface that does not exist.

## Architecture consequence

The experiment, the deterministic executor, and the pinned reference behavior
support [ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md):
model authorship and write initiative are separate from durable state
authority.

The following are not promoted:

- the lab's progress enum or SQLite schema;
- the exact five-tool catalog;
- the prompt wording;
- a general write-policy accuracy claim;
- a deterministic Tutor selector;
- automatic persistence of every learner instruction; or
- a production package layout.

## Next parent boundary

Before a production learning-control spine, two related failure properties now
need an explicit decision:

1. Which learner directives or commitments remain relevant beyond the current
   Turn or Session, how they expire, and how they enter a later context cut.
2. How semantic learning effects remain idempotent when compaction or model
   retry exposes the same admitted user item again under a new physical tool
   call ID.

These are not requests for a general preference system or command bus. They are
the smallest reconciliation between the observed continuation failure, the
user's compaction warning, and the accepted model-write boundary.

Follow-up: ALS-018 resolved these two state-boundary questions and started the
formal production state/context spine. See
[`semantic-effect-and-scoped-steering-2026-07-11.md`](./semantic-effect-and-scoped-steering-2026-07-11.md).
