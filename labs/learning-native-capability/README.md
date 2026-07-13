# Learning-native capability lab

## Question

Can a bounded, executable learning layer preserve the facts required by the
review-draft capability contract without importing the earlier evidence,
projection, or selector architecture?

Phase B1 now tests deterministic mechanics only:

- course route and current position;
- simple read, explained, demonstrated, and followed progress;
- actual attempts without automatic mastery claims;
- pending revisits and time-derived due state;
- assignments, overdue state, and resolution;
- compact context in which progress is only a small set of verbs and attempt
  detail remains on demand;
- correction, idempotency, stale-write rejection, monotonic virtual time, and
  fresh reopen;
- runtime-owned source, version, and operation identity for model-facing
  writes; and
- atomic settlement of a learning effect and its model-visible tool result.

Phase B1 does not test teaching or action quality. Phase B2 is the next step:
bounded model calls over the six behavior traces.

## Boundary

This directory is an isolated lab. It may use SQLite and TypeScript types that
serve the experiment. Production code must not import it, and its schema is not
a production proposal.

The lab must not import `labs/learning-semantic-anchor`. That lab's formal-task,
evidence-interpretation, learner-projection, and obligation vocabulary is a
historical experiment rather than the current learning model.

`learning-layer.apply` is a deterministic lab/setup seam. A Phase B2 model
driver must not receive it. Model-generated writes go through
`executeRecordedLearningTool`, which rejects runtime-owned fields in model
input and binds the call to the current Session item.

The first slice assumes one process-local writer, consistent with ADR-0007.
It does not claim a multi-process writer protocol. A recorded call with no
SQLite settlement is never auto-executed during recovery; only an existing
settlement may be reprojected into Session history.

## Deletion condition

Delete or replace this lab after either:

- the capability hypothesis fails and its learning-owned mechanisms are
  rejected; or
- accepted production contracts cover the demonstrated capabilities with
  equivalent tests.

## Run

```powershell
bun test labs/learning-native-capability
```
