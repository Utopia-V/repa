# Learning-semantic anchor lab

## Question

Can the foundation contracts carry one committed learning occurrence through a
rebuildable learner projection, context assembly, and a changed next action
without treating Session text or a failed tool call as learning evidence?

## Semantic checksum

Product-loop purpose:

```text
learning activity -> accepted occurrence -> revised state -> next action
```

Owned durable fact:

```text
an accepted occurrence is committed once under a stable runtime operation ID
```

Representative behavior:

```text
independent delayed success -> context supports advancing
repeated independent failure with a related prerequisite -> context supports repair
```

Counterexample:

```text
assistant text saying “mastered” and a failed learning-tool invocation do not
change the learner projection
```

Failure and correction behavior:

```text
an exact operation retry is idempotent
a conflicting reuse of the operation ID is rejected
the current projection can be deleted and rebuilt from committed occurrences
```

## Scope

This is a contract fixture, not an MVP and not a proposed course ontology. The
names `target`, `relatedTarget`, `stable`, and `needs_repair` are deliberately
lab-local. They test separation and data flow; they are not production schema
decisions.

The deterministic Tutor policy is an oracle for wiring:

```text
same goal + different committed evidence -> materially different next action
```

It does not claim that these three states are a sufficient learner model or
that the selected action improves human learning.

## Deletion condition

Delete this lab after production tests cover all of the following with accepted
runtime and learning-domain contracts:

- operation-idempotent occurrence commit;
- projection rebuild from committed facts;
- context provenance through source occurrence IDs and revision;
- Session non-evidence excluded from learner state;
- different committed evidence changes the Tutor's next action.

Production code must not import this directory.
