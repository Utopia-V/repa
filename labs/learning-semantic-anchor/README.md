# Learning-significance contract lab

## Question

Can one small SQLite-backed contract distinguish ordinary conversation,
selected teaching, formal task results, correction, and time-derived review
pressure while still changing the next Tutor action when learning-significant
evidence changes?

## Semantic checksum

Product-loop purpose:

~~~text
learning activity -> source-linked result -> evidence interpretation
-> rebuildable projection -> candidate reason -> next action
~~~

Owned durable facts:

~~~text
Session owns original interaction text
Learning Domain owns formal task context, source-linked result,
correctable evidence interpretation, and review obligations
Tool runtime owns invocation settlement
~~~

Representative behavior:

~~~text
formal independent miss -> assessment-triggered review candidate
formal independent success -> locally ready-work candidate
~~~

These are deterministic wiring oracles, not accepted educational policy. In
particular, one success does not establish global mastery and one miss does not
rewrite a curriculum route.

Counterexamples:

~~~text
ordinary clarification -> Session history only
completed explanation whose activity contract requires verification
-> verification obligation, not mastery evidence
time passes -> due pressure changes, no evidence is invented
~~~

Failure and correction behavior:

~~~text
learning result plus tool settlement commit atomically
exact operation retry is idempotent
conflicting operation reuse is rejected
correction retracts or supersedes interpretation without deleting source
projection can be rebuilt from active interpretations
~~~

## Scope

This directory remains a lab. Names such as local signal, candidate reason, and
the test selector are not production schema or scheduling decisions. The lab
tests authority boundaries and transaction behavior only.

Production code must not import this directory.

## Deletion condition

Delete this lab after accepted production contracts cover:

- ordinary interaction excluded from learning state by default;
- task context and source-linked result admission;
- atomic local learning write and tool settlement;
- interpretation correction/retraction and projection rebuild;
- time-derived review pressure without invented evidence; and
- materially different admitted evidence changing the next action.
