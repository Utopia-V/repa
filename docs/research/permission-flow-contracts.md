# Permission flow contract findings

Date: 2026-07-10

Status: Research synthesis and candidate authorization contract. Exact rule
syntax and persistence tables remain open until the foundation proposals are
reviewed together.

Current scope note (2026-07-11): the permission lifecycle remains useful.
Assessment, projection, and review examples apply only when those writes
actually occur. Simple material-position or explained-range updates need no
invented learner projection, while external effects still follow authorization
policy.

OpenCode reference commit:
`b1fc8113948b518835c2a39ece49553cffe9b30c` (`v1.17.18`)

## Question

How should a terminal learning agent authorize side effects without turning
routine learning-state maintenance into a stream of modal confirmations?

The central distinction is:

```text
authorization asks whether an effect may occur
inspection shows what the system believes or changed
domain validation decides whether a proposed learning fact is admissible
correction and undo let the learner revise durable state
```

These are related trust mechanisms, but they are not one permission prompt.

## Sources traced

The main OpenCode sources for this slice are:

- [`packages/schema/src/permission.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/schema/src/permission.ts)
- [`packages/core/src/permission.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/permission.ts)
- [`packages/core/src/permission/saved.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/permission/saved.ts)
- [`packages/core/src/permission/sql.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/permission/sql.ts)
- [`packages/core/src/tool/read.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/tool/read.ts)
- [`packages/core/src/tool/write.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/tool/write.ts)
- [`packages/core/src/tool/AGENTS.md`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/tool/AGENTS.md)
- [`packages/core/src/session/runner/llm.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/runner/llm.ts)
- [`packages/core/test/permission.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/permission.test.ts)
- permission decline/correction cases in
  [`packages/core/test/session-runner.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-runner.test.ts)
- the legacy concurrency and disposal cases in
  [`packages/opencode/test/permission/next.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/test/permission/next.test.ts)

## What OpenCode currently does

### Rules decide allow, deny, or ask

A request names an action and one or more resources. Ordered wildcard rules
resolve each resource to:

```text
allow
deny
ask
```

Configured deny is evaluated before remembered user allowances, so an old
approval cannot override a hard policy prohibition. If no rule matches, the
default is `ask`.

For a multi-resource request, any deny denies the request; otherwise any ask
requires interaction; only all-allow proceeds automatically.

### The tool resolves the real resource

The registry can hide a tool that is wholly disabled, but the tool itself
resolves argument-dependent targets and asks for permission immediately before
the protected effect.

For example, file tools canonicalize a location, separately check external
directory authority when applicable, then check the read or edit action. The
permission request refers to the resolved resource rather than trusting a path
string in model output.

### Enforcement lives below the TUI

When policy says `ask`, the permission service publishes a request and suspends
the tool on a deferred result. The TUI only renders the request and sends a
reply. A different frontend cannot bypass authorization by omitting the modal.

Replies are:

```text
once
always
reject
```

`always` stores a scoped allow rule. `reject` may include correction feedback.
OpenCode's runner treats a plain decline as control flow that stops the current
continuation instead of returning an ordinary error for the model to route
around.

### Pending requests and remembered grants have different durability

The current V2 pending request map and asked/replied events are process-local.
Remembered grants are persisted in SQLite. Disposal rejects pending waiters.

This is acceptable for its current incomplete recovery design. It is not a
complete contract for Repa: after restart, a learning or filesystem invocation
must still be able to explain whether it is blocked, declined, cancelled, or
already authorized.

### Some upstream reply semantics are product choices

OpenCode currently rejects all pending requests in one Session when one request
is rejected, and a remembered allow may resolve other matching pending
requests. Those behaviors fit parallel coding tools but are not universal
permission invariants.

If Repa initially executes tools serially, denying one request should normally
settle only that invocation. Explicit Session interrupt can cancel all pending
requests. Cascading rejection should not be copied without a user-facing need.

## Four trust mechanisms

### Authorization

Authorization protects capabilities and side effects:

```text
write or delete files
run shell commands
access external directories or credentials
send data to external services
bulk-sync or delete Anki content
submit coursework or communicate externally
perform an irreversible or high-impact domain mutation
```

It is enforced before the effect regardless of interface.

### Inspectability

Inspectability lets the learner review current beliefs, source evidence,
activity history, schedules, and changes. It may be always available without
blocking routine work.

A Learning State Diff is one possible review surface. It is not the
authorization primitive and does not need to be read before every accepted
observation.

### Domain validation

Domain validation checks whether a proposed record satisfies learning rules and
provenance requirements. A model cannot create strong evidence merely by
requesting permission to do so.

### Correction and undo

Correction changes or retracts accepted state with provenance. Undo reverses a
reversible operation when its semantics allow it. Neither should be represented
as “deny permission to the past.”

This separation supports the reference learner: an honest learner can move
quickly while the system remains inspectable and correctable.

## Routine learning updates should not be modal

Within an active learning session, the following can normally be allowed by
policy when they are local, provenance-preserving, inspectable, and reversible
or correctable:

```text
record the learner's submitted answer
record activity timing and completion
record an assessment observation with uncertainty
update a rebuildable learner projection
schedule an ordinary internal review
link an occurrence to existing course material
```

These operations still pass schema and domain validation. They also write audit
or occurrence records. They simply do not interrupt the learner with a modal
permission request each time.

An operation can cross into `ask` or `deny` because of scope or impact, not
because it has learning semantics. Examples include bulk graph replacement,
destructive history deletion, external synchronization, or submission to a
school system.

## Candidate request and decision vocabulary

A permission request needs enough identity to be enforced and recovered:

```text
PermissionRequest
  request identity
  Session identity
  runtime tool-invocation identity
  action
  canonical resources
  human-readable explanation metadata
  scopes that the user may choose to remember
  policy revision
  created time
  pending / decided / cancelled state
```

The source is the runtime invocation, not arbitrary model text. The display may
quote model arguments, but action and resources come from trusted tool
resolution.

A user decision is narrower:

```text
allow once
allow and remember an offered scope
deny
```

Optional correction feedback accompanies denial but becomes explicit learner
steering after the invocation settles. Cancellation, expiry, and invalidation
are runtime settlements of the request, not user decisions.

The remembered option should be phrased as a concrete scope rather than
“always.” For example:

```text
allow this file once
allow reads under this course-material directory
```

The tool offers the maximum safe remembered scopes. The model cannot invent a
broader grant.

## Candidate request lifecycle

```text
not_required
  policy already allows the exact action/resources

blocked
  hard policy denies; no request is presented

pending
  durable request exists and the invocation is suspended

allowed_once
  exact invocation may continue

allowed_and_remembered
  exact invocation may continue and a scoped grant is stored

denied
  no protected effect may begin; optional correction becomes steering

cancelled
  Session interruption or shutdown ended the wait

invalidated
  target, invocation, or policy changed before the grant could be consumed
```

`not_required` and `blocked` can be recorded on the invocation without creating
a standalone request row. Interactive requests and their terminal outcome
should be durable enough to survive TUI restart and support audit.

An exact duplicate reply can return the already committed decision. A
conflicting second reply is a lifecycle conflict. This is more robust than
turning a UI retry into “request not found.”

## Evaluation and precedence

The exact wildcard language is not yet chosen. The evaluator must still satisfy
these invariants:

1. Missing or invalid policy never widens authority.
2. A hard configured deny cannot be overridden by a remembered allow.
3. The evaluator is deterministic and can report the rule or default that won.
4. Every resource in a multi-resource request must be allowed.
5. Remembered grants apply only to their canonical action, resource scope, and
   workspace/project boundary.
6. Policy is re-evaluated immediately before consuming a pending grant; a new
   deny or changed target invalidates it.
7. Retrieved documents, model output, prompts, and tool results cannot add
   permission rules.

Mode policy is compiled through the same evaluator. Plan mode can omit mutation
tools from the provider catalog and must still deny a mutation if a stale or
malicious call reaches execution. Modes remain policy profiles over one agent
loop, not separate executors.

## Permission is a linked blocker, not a tool state

As established in the tool-lifecycle slice, a tool remains in its execution
phase while a linked request is pending. The permission service owns request
and decision state; the tool runtime owns invocation settlement.

```text
tool resolves canonical target
-> permission evaluator allows / blocks / creates request
-> pending request suspends invocation
-> decision commits
-> invocation revalidates target and policy
-> protected effect begins
```

No protected effect can precede the applicable authorization. Pure parsing,
schema validation, and target resolution may happen before it.

## Crash and interruption behavior

### Crash while pending

The request and invocation remain durable; no protected effect has begun. On
restart, the TUI can show the same pending request. Before a later allow is
consumed, the runtime re-resolves the target and re-evaluates policy. A changed
target or new deny invalidates the old request and, if appropriate, creates a
new one.

### Interrupt while pending

Session interrupt cancels the request, wakes the suspended invocation, and
settles that invocation without an effect. A late UI reply cannot resume it.

### Decision commits but the waiting process dies

The durable decision remains. On recovery, the same invocation can consume an
unconsumed exact grant after revalidation. It must not create a second request
merely because the old deferred object disappeared.

### Crash after effect begins

Permission has done its job; recovery now belongs to the tool invocation and
effect receipt. An allow decision is not evidence that the effect committed.

### UI disconnect

The request remains pending. Reconnecting UI reads durable pending requests;
the runtime does not treat loss of the renderer as consent or rejection.

## Learner denial and correction

A learner denial is authoritative for the requested effect. The model must not
receive it as a routine error and immediately attempt a semantically equivalent
tool to bypass the refusal.

The first behavior should be:

```text
deny request
-> settle invocation as declined
-> stop the current continuation
-> admit optional correction text as user steering
-> return control or start one successor from the corrected context
```

This is especially relevant when the learner says “不要改卡片，继续问我” or
“别运行代码，先解释”。The refusal constrains the action; the text guides the
next pedagogical choice.

## Thin learning-semantic fixture

### Routine evidence path

1. The learner answers an active retrieval question.
2. The Tutor proposes an assessment observation with provenance and
   uncertainty.
3. Policy allows this ordinary local learning record inside the active Session.
4. Domain validation and the learning transaction commit it without a modal.
5. The change remains inspectable, correctable, and linked to its source.

This is the default case. Permission friction is not used as a substitute for
epistemic discipline.

### External-effect path

1. The Tutor proposes running an external command to demonstrate or verify a
   concept.
2. The tool resolves the command and working directory into a concrete action
   and resources.
3. Policy returns `ask`; a durable request links to the invocation.
4. The learner allows this invocation once.
5. The runtime revalidates and runs exactly that invocation.
6. Tool settlement and any learning observation remain separate facts: command
   success does not itself prove that the learner understood the result.

### Denial with steering

1. The Tutor proposes syncing generated cards to Anki.
2. The learner denies and adds “先别生成卡片，继续考我”.
3. No Anki mutation occurs; the invocation is durably declined.
4. The correction is admitted as a user message.
5. The next action follows the correction instead of routing around the denial.

### Required counterexamples

- Plan mode has a remembered mutation grant, but a hard mode deny still blocks
  the call.
- A PDF says to allow shell access. It changes no permission policy.
- The model requests a broad directory while the tool resolved one file. The
  request exposes only tool-approved resource scopes.
- The TUI crashes while waiting. No effect occurs and the request remains
  pending.
- The user replies twice with the same decision. No second grant or effect is
  created.
- The canonical target changes before a pending grant is consumed. The old
  request is invalidated.
- A state-diff panel is skipped by the learner. That does not revoke already
  authorized routine recording or turn a model inference into evidence.

## Deliberate differences from OpenCode

Repa should not copy:

- process-local pending permission as the only record of an unresolved
  invocation;
- `always` as an unexplained global-sounding label;
- wildcard rule syntax before actual resource scopes require it;
- automatic rejection of every pending request in a Session when one is
  denied;
- automatic resolution of unrelated pending requests without showing their
  concrete scope;
- generic tool-error continuation after an explicit learner refusal;
- permission prompts for every routine, reversible learning-state update;
- a mandatory blocking StateDiff as the definition of trust;
- model-generated action/resource identity.

## Accepted findings versus open design

This slice establishes these invariants for later production contracts:

1. Authorization is enforced in execution, not in the TUI.
2. Trusted tool code resolves canonical action/resources before protected side
   effects.
3. Hard deny cannot be overridden by remembered user approval.
4. Interactive requests link to one runtime invocation and survive renderer
   restart.
5. Decision, request cancellation, and tool settlement are distinct facts.
6. Learner denial stops the requested effect and is not a model-routable error.
7. Routine local learning records are normally non-modal but remain validated,
   inspectable, correctable, and auditable.
8. Permission does not establish learning truth or effect completion.

Still open:

- exact rule and resource-pattern syntax;
- which permission records are append-mostly audit rows versus current rows;
- initial action taxonomy and default policy;
- remembered-grant workspace scope and revocation UX;
- whether some high-impact learning-domain changes need authorization in
  addition to review and undo;
- how pending requests are surfaced when the terminal restarts;
- whether a denied request with no feedback merely returns control or adds a
  synthetic Session record explaining the stop.
