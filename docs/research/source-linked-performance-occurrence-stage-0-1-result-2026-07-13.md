# ALS-024 Stage 0/1 baseline result

Date: 2026-07-13

Status: completed paper and production-code-path proof. No lab, provider call,
production change, schema, harness, or new test was used.

## Result

The current baseline has a decisive fresh-Session collision.

Correct-independent and incorrect-independent histories both leave the same
Agenda concern addressed. The production context compiler excludes addressed
concerns from routine context, exposes no response or outcome projection, and
offers no bounded lazy read of the service occurrence. With the old transcript
absent, both histories therefore produce the same meaningful model-visible
state even though the required next Tutor move differs.

The same-answer-assisted history is distinguishable from those two only because
its independent-response concern remains open. That Agenda distinction is
enough to preserve “obtain an independent response,” but it does not expose the
assisted response or assistance history itself.

Stage 1 therefore rejects “Course View plus Agenda disposition plus current
lazy Interaction reads are sufficient.” It admits Stage 2 minimum-meaning
ablation, not a production record or general evidence model.

## Stage 0 fixture

### Real Course item

The reversible working assumption treats an existing normative repository
document as source-grounded course material:

| Property | Frozen value |
| --- | --- |
| Markdown source | [Repa system architecture](../architecture/00-system-architecture.md) |
| Artifact revision | sha256:725da3eea16694a1a87546a4efaca0ceece0120644ad95a4d2e5502b66a29582 |
| Parser revision | markdown-atx-outline-v1 |
| Course ID | course:d882dc15f8da556ab531f5232ca3bcd2 |
| Course View revision | course-view:e039cef9266243b4705f9fb95790c526 |
| Course item | course-item:4cdb2b9877c653f47e4b6d1af64aece2 |
| Item title | Teaching and review are feedback behavior, not persisted stages |
| Material selector | lines 492–539 |

This is not a synthetic benchmark article. The item states actual accepted Repa
architecture. Lines 499–525 separate Session dialogue, learner response and
conditions, Agenda purpose, assistance/result/evidence, and the fact that
serving a concern does not imply correctness, retention, or mastery.

Production parsing makes each ATX heading one revision-bound Course View item.
The selected heading and range were obtained with the current
observeMarkdownArtifact, deriveMarkdownCourseIdentity, and
planMarkdownCourseView functions; no database or repository state was changed.

### Criterion-backed delayed question

Frozen Tutor question:

> 请不回看材料，判断四类持久含义分别由谁持有：完整解释和即时对话；供后续决策使用的实际回答及 assistance conditions；稍后返回的目的是否已被服务；以及 learner 是否 correct/mastered。最后说明 addressed 不代表什么。

The answer is mechanically correct only if it contains all four meanings:

1. Session/Interaction retains the complete explanation and immediate dialogue.
2. Learner history/evidence owns the actual response and conditions needed by a
   later decision.
3. Agenda owns the reason to return and whether that purpose was served.
4. Addressed means intended future attention occurred; it does not mean the
   answer was correct, retained, or mastered.

This criterion is quoted from the frozen material meaning. No model grader is
needed.

### Common setup

All histories use isolated LearnerHomes but alpha-equivalent opaque identities,
timestamps, active Course item, material revision, Agenda creation source, and
Session C input. Correct-independent and incorrect-independent also have the
same domain-transition count; the assisted history differs only through the
required open Agenda disposition.

Session A learner source:

> 稍后请在不提示答案的情况下，让我独立判断这四类含义的归属。

The resulting concern has:

- reason: “After a delay, independently assign the actual response/conditions
  and Agenda disposition to their owning authorities, and state what served
  does not imply”;
- target: the frozen Course item above; and
- learner-role constraint: learner response before Tutor disclosure.

Session C is fresh and contains only the learner input “继续”.

### Three frozen Session B histories

| History | Tutor/learner occurrence | Agenda disposition | Required Session C move family |
| --- | --- | --- | --- |
| Correct-independent | Tutor asks the frozen question without disclosing the mapping. Learner answers: “完整解释和即时对话由 Session/Interaction 保存；实际回答及后续决策需要的 assistance conditions 属于 learner history/evidence；是否完成稍后返回的目的由 Agenda disposition 持有；addressed 只表示预期关注发生，不表示回答正确、保留或掌握。” | addressed | Do not repeat the same novice ownership check merely because it was due. Continue, deepen, or apply the separation without asserting mastery. |
| Incorrect-independent | Tutor asks the same question without disclosure. Learner answers: “Agenda 应同时保存回答、帮助条件和能力结论；一旦 addressed 就表示回答正确且已掌握。” | addressed | Correct the authority collapse before progressing; use feedback or a changed representation. |
| Same-answer-assisted | Tutor first discloses the exact correct mapping, then asks the same question. Learner sends the byte-identical correct-independent answer. | open | Do not credit independent performance. Preserve or offer an answer-hidden independent opportunity, subject to the current request. |

Both independent responses address the concern because the requested
independent occurrence happened; correctness is not Agenda disposition. The
assisted response leaves it open because the operative learner role was not
served.

## Stage 1 baseline visibility

### Fresh Session transcript boundary

The production runner constructs model messages by reading session items for
the current Session ID only. Session C therefore contains only “继续”; no
Session A or B assistant question, disclosure, or learner answer enters its
message history.

Arbitrary old Session IDs are not exposed as a Tutor capability. The complete
old transcript remains durable under Interaction but is not current context.

### Routine context and tools

| Visible or lazy path in Session C | Correct-independent | Incorrect-independent | Same-answer-assisted |
| --- | --- | --- | --- |
| Current Session messages | only “继续” | only “继续” | only “继续” |
| Active Course View and material selector | identical frozen item | identical frozen item | identical frozen item |
| Current material lazy read | same lines 492–539 | same lines 492–539 | same lines 492–539 |
| Routine futureAttention | zero open concerns | zero open concerns | one open concern |
| conditionalCurrentPurpose | null | null | independent-response purpose present |
| inspect recent Agenda | same addressed reason/status/version; no response, assistance, outcome, rationale, or service source | same | open reason/status; still no Session B response or assistance |
| read Agenda creation source | not an active tool when no open concern exists | not an active tool when no open concern exists | available, but returns the Session A creation source and at most its preceding assistant item, not the Session B task/response |
| Other learner-performance projection | none | none | none |

The context revision number is not outcome meaning. Under the frozen histories,
correct-independent and incorrect-independent perform the same number of
domain transitions and can hold equal sampled times, so revision/time cannot
break their collision. Opaque IDs are held alpha-equivalent and encode no
answer content.

### Why inspection cannot recover the distinction

The Agenda address transition internally cites a service occurrence item, but
the accepted current consumer does not expose that transition in routine
context:

1. address validation checks only that the occurrence is later, non-tool, and
   complete when required; it does not inspect correctness or assistance;
2. routine Agenda context and the conditional candidate query only open
   concerns;
3. recent-Agenda inspection returns target, reason, constraint, status, and
   timing, but not the service occurrence, response text, assistance, or
   outcome;
4. read-future-attention-source is activated only when routine open concerns
   exist; and
5. that read resolves the concern’s creation source, not the later service
   occurrence.

Reading the current Course material can recover the answer criterion but cannot
reveal which old answer the learner gave. Thus every currently allowed bounded
read is equal for the two addressed histories.

## Exact collision

| Pair | Current durable projection | Allowed lazy detail | Required later decision | Verdict |
| --- | --- | --- | --- | --- |
| Correct-independent vs incorrect-independent | equal after opaque identity normalization | equal; neither exposes the old answer or outcome | different | decisive collision |
| Correct-independent vs same-answer-assisted | addressed vs open | open concern exposes only its creation source | different | distinguished by Agenda disposition |
| Incorrect-independent vs same-answer-assisted | addressed vs open | same limitation | different | distinguished by Agenda disposition |

In compact form:

**projection(correct-independent) = projection(incorrect-independent), while
move(correct-independent) ≠ move(incorrect-independent).**

No additional deterministic fixture can add evidence to this code-path fact.
Creating a lab merely to restate the SQL predicates and exported tool surface
would violate the protocol’s stop rule.

## Source and line evidence

| Claim | Production or accepted source |
| --- | --- |
| The real item supplies the criterion | [system architecture](../architecture/00-system-architecture.md), lines 492–525 |
| Markdown headings and revision-bound ranges form items | [markdown-artifact.ts](../../src/sources/markdown-artifact.ts), lines 29–47 and 81–140; [course-view-revisions.ts](../../src/learning/curriculum/course-view-revisions.ts), lines 17–36 |
| A fresh Session imports only its own transcript | [run-tutor-turn.ts](../../src/runtime/run-tutor-turn.ts), lines 73–103 and 217–222 |
| The context cut contains Course, open Agenda, conditional purpose, and no performance contribution | [compile-context.ts](../../src/tutor/compile-context.ts), lines 52–60 and 153–193 |
| Routine and conditional Agenda queries exclude addressed concerns | [future-attention.ts](../../src/learning/agenda/future-attention.ts), lines 825–979 |
| Address records service, not correctness or assistance | [future-attention.ts](../../src/learning/agenda/future-attention.ts), lines 233–346 and 1562–1607 |
| Bounded inspection omits service occurrence and outcome | [future-attention.ts](../../src/learning/agenda/future-attention.ts), lines 982–1059 |
| Agenda source read returns the creation source | [future-attention.ts](../../src/learning/agenda/future-attention.ts), lines 1062–1092 |
| Addressed-only context does not activate the source-read tool | [tutor-tools.ts](../../src/runtime/tutor-tools.ts), lines 287–315 |
| Existing tests establish fresh-Session compactness and addressed-without-evidence | [tutor-agenda-continuity.test.ts](../../test/tutor-agenda-continuity.test.ts), lines 131–201; [agenda-future-attention.test.ts](../../test/agenda-future-attention.test.ts), lines 439–477 |

## Conclusion and next boundary

**Claim:** current production context cannot distinguish a correct independent
response from an incorrect independent response after both serve the Agenda
purpose and the old transcript is absent.

**Evidence:** open-only context SQL, current-Session-only message history,
bounded tool activation, and inspection/source projections collapse the two
addressed histories while the frozen material criterion requires different
Tutor moves.

**Decision:** ALS-024 Stage 1 is positive. Proceed only to Stage 2
minimum-meaning ablation. The first candidate must at least make the complete
response source and criterion-backed observed outcome available to the later
consumer while preserving its eliciting purpose/material basis. This result
does not choose storage, commands, types, or an outcome vocabulary.

**Remaining boundary:** the three-case matrix does not by itself earn a durable
assistance field. Agenda disposition already separates the assisted case from
the two independent cases. Stage 2 must test whether exact lazy Interaction
sources are enough for assistance audit/correction and for avoiding reuse of an
already disclosed task; otherwise the extra assistance observation is removed.

**Stop:** do not add a lab for the established collision, do not call a
provider, and do not implement production state. Stop Stage 2 if it expands
into a generic attempt/evidence/mastery ontology or if an existing bounded
source path proves sufficient after the minimum outcome distinction is added.
