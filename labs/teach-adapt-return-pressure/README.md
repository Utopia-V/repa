# Teach, adapt, and return pressure lab

Ledger ID: ALS-020

## Question

Does the already demonstrated revisit shape—target, source, due time, and a
generic completed state—contain enough meaning for purpose-sensitive return?

## Scope

This is a deterministic architecture-pressure lab. It does not test a model,
simulate a learner, estimate educational effectiveness, or propose production
types. The fixture labels name counterexamples only.

The lab deliberately reuses what earlier work already established instead of
retesting it:

- B1 demonstrated scheduling, clock-derived due state, source binding,
  correction, reopen/reschedule, atomic settlement, and restart survival.
- B2 Trace 6 demonstrated that a fresh Session can see a compact due revisit,
  select it, and lazily retrieve its old source without completing it merely by
  starting.
- production course continuity demonstrated revision-bound material and
  cross-Session route continuity.

The remaining question is semantic: why is the system returning, and what
later occurrence may honestly count as serving that reason?

## Counterexample construction

Three alternative accepted concerns share the same course target, target
revision, source attempt, and eligible time:

1. repair the learner's causal model after an explanation failed;
2. check independent prediction after a delay; and
3. exercise discrimination between aliasing and copying.

They constrain the learner's cognitive role differently. Therefore those
shared coordinates cannot be the complete durable meaning. The first purpose
deliberately permits either a memory diagram or contrasting concrete cases,
depending on later learner context; the stored reason does not prescribe one
review form.

The lab then applies two tempting universal completion rules:

- any later occurrence on the same target; and
- any later learner/tool item.

Both fail. Topic overlap closes an unrelated concern, an unsupported “done”
claim closes too much, and a Tutor explanation cannot close anything even when
the stored concern was specifically to provide another representation.

A complete learner-facing assistant explanation can serve an explanation-
purpose concern, while a partial provider delta from an interrupted Turn
cannot. Direct deadline help also has a complete zero-Agenda-write case.

## Demonstrated boundary

For the tested cases:

- same-Turn adaptation can remain entirely in Session history;
- a cross-Session revisit must preserve a bounded, source-linked reason for
  future attention, not only a target and time;
- time makes the concern eligible but does not select a review form;
- a later occurrence serves the concern only through target, revision, and
  purpose alignment;
- Agenda closure or cancellation is not evidence of understanding, retention,
  or transfer; and
- the conditions of a later activity, such as independent versus guided work,
  may matter without becoming fields on the Agenda concern itself.

This does **not** imply a purpose enum, universal alignment engine, evidence
ontology, review workflow, or final status vocabulary. Those shapes remain
deferred until a production consumer requires them.

## Run

```powershell
bun test labs/teach-adapt-return-pressure/pressure.test.ts
```

The committed fixture has eleven deterministic checks covering coordinate and
purpose/form separation, false completion, durable occurrence visibility,
action/evidence separation, assistance, cancellation, source revision, and
the teaching/direct-work zero-write paths.

## Deletion condition

Delete this lab after production Agenda contract tests cover the same collision
and negative cases without importing this fixture vocabulary.

Status on 2026-07-12: the first Agenda production slice now covers source-linked
reason, eligibility, explicit disposition, correction, zero-write teaching and
deadline paths, and several false-completion cases. Keep this lab for now: the
production runtime still lacks a same-Turn completed-assistant application
seam, and the full assistance-sensitive/cross-authority collision set is not
yet represented by production tests. Promote missing invariants, not these
fixture labels.
