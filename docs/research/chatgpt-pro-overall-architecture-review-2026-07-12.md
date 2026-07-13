# ChatGPT Pro overall-architecture adversarial review

Date: 2026-07-12

Status: Independent review evidence for ADR-0012. The reviewer did not decide
product values or architecture authority.

## Execution

- Model: ChatGPT GPT-5.6 Pro (subscription)
- Reported effort: `extended`
- Elapsed: 23.8 seconds
- Web search: not requested or used; the review operated on a self-contained
  architecture packet
- Sources: none supplied by the bridge

The packet separated accepted product intent, maintainer-set boundaries,
experiment findings, accepted runtime invariants, and the proposed
learning-centered modular monolith. The reviewer was asked for contradictions,
failure traces, expensive-to-reverse ambiguity, real alternatives, and required
changes rather than a summary or approval.

## Useful agreement

The review agreed with the main center of gravity and explicit deferrals:

- learning authorities rather than the Agent loop should own durable meaning;
- modular monolith plus SQLite is suitable for the current local product;
- course, material, learner, and agenda meanings should not collapse into a
  universal graph;
- plugin infrastructure, distributed execution, background scheduling, vector
  retrieval, graph storage, full event sourcing, and a workflow engine should
  remain deferred; and
- the main remaining risk is semantic ambiguity rather than provider/tool
  transport.

Agreement is supporting evidence only. The accepted decision follows local
experiments, ADRs, and maintainer intent.

## Adopted corrections

### Provisional course authority

The original candidate said an Agent could create a coarse route but did not
fully state what that route was allowed to mean. ADR-0012 now makes a
model-created route a working, provisional, correctable Course View revision.
It may guide orientation immediately, while unsupported relations cannot become
hard curricular blockers or learner ability.

### Revision kinds

The review correctly identified revision identity as expensive to reverse.
The final architecture separates Session sequence, commit watermark, entity
version, Course View revision, artifact content revision, policy revision, and
context-cut dependencies. A global state revision is not a universal command
precondition.

### Generic-tool import boundary

The final architecture now states explicitly that a file, web, code, or other
generic tool result is an untrusted observation for learning semantics. Only a
domain command may import it into course, material, learner, agenda, or policy
state.

### Capability metadata without a plugin platform

The review noted that dynamic capability assembly can become an undocumented
plugin system. The architecture now requires only the metadata needed for
complete mediation: read-only observation, local reversible learning write,
workspace mutation, or external effect, plus scope/trust/cost where consumed.
Discovery, installation, or third-party plugin machinery remains deferred.

### Causal receipts without event sourcing

The final design requires an immutable causal receipt for successful domain
commands because audit, correction, idempotency, and crash reconciliation are
already real consumers. Domain state does not replay from those receipts, and
domain payload is not forced into one generic event table.

### Local writer ownership

The review's simultaneous-terminal trace exposed an unstated process boundary.
The final architecture gives one process state-changing ownership of a
LearnerHome. Entity preconditions remain the semantic backstop; automatic
last-write-wins merge is rejected.

### Learning-move evaluation

The architecture now allows a meaningful activity to retain purpose, target,
conditions, and outcome references when a later decision will consume them.
It does not introduce a universal effectiveness score or require every
explanation to create an activity record.

## Rejected or qualified suggestions

### Every Tutor move as a domain transition

The review suggested that Tutor composition should produce candidate moves and
that acceptance of a move should remain a domain operation. Applied to every
teaching action, this would conflict with the product: a useful explanation,
answer, or demonstration may remain Session history and needs no structured
learning write. The final boundary is narrower: only durable learning meaning,
commitments, and external effects require commands.

### Missing epistemic separation

The review described evidence/inference/correction semantics as missing. They
were already accepted by ADR-0003 and the product foundation. The architecture
restates their ownership but does not design a confidence model that the
experiments rejected.

### State-machine Learning Kernel

A global transition-centered alternative would make simulation easier but
would over-model open teaching and exploration. Repa retains state machines for
bounded aggregates and legal commands, not for the complete learning process.

### Artifact-centered workspace

Artifacts align well with terminal interaction and remain first-class sources
and outputs. They cannot replace durable goals, course progress, due revisits,
epistemic meaning, or scoped Tutor policy, so they are not the architecture
center.

## Failure traces retained as architecture checks

- a goal changes while the course remains structurally valid;
- a later observation conflicts with an earlier learner inference;
- a material revision invalidates an active range and agenda reference;
- two local terminal processes attempt to change one learner home;
- plausible conversational moves repeatedly fail to improve the intended
  learning situation; and
- a later formal syllabus arrives after an Agent-created coarse route.

These traces now appear in the architecture's authority, correction, version,
process-ownership, activity-history, and route-reconciliation rules. They do not
authorize immediate implementation of a general evaluator or reconciliation
framework.
