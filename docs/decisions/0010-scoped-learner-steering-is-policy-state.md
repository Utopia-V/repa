# ADR-0010: Treat retained learner steering as scoped policy state

Status: Accepted
Date: 2026-07-11

## Context

The learner can steer the Tutor with requests such as "show me why now",
"let me practise first", or "today do not test me". Many such instructions are
already present in the current Turn and need no separate durable record. Some,
however, remain relevant after compaction or in a later Session.

ALS-017 retained the learner's reading report but not the accompanying
time-scoped instruction `今天先别测我`. A fresh Session therefore received the
progress fact without the still-live steering and ended with an unsolicited
assessment. Persisting every conversational instruction would be equally
wrong: it would turn raw dialogue into a preference database and make expired
local choices compete forever with current intent.

OpenCode and Codex both rebuild instruction or world-state contributions at
model-sampling boundaries. Repa needs the same consistency property while
owning the learning meaning and provenance of the contribution.

## Decision

A learner instruction is promoted to **retained scoped steering** only when a
future sampling boundary has a concrete reason to receive it. The retained
record is a policy contribution to Tutor behavior, not:

- a stable learner preference;
- evidence about ability or retention;
- a course or material fact; or
- an independent runtime mode.

The contribution preserves:

- the admitted learner source and order;
- the operative instruction text or a source-linked interpretation;
- an applicability interval or other scope that the current command actually
  understands;
- admission/correction provenance; and
- a semantic effect identity under ADR-0009.

At every model-sampling boundary, the context compiler selects the steering
that is active for that immutable context cut and labels it explicitly as
learner policy. Prompt text, visible capabilities, and deterministic permission
overlays that consume the contribution must be compiled from the same cut.
For the first production spine, the formal model-operation entry compiles the
cut synchronously inside the same SQLite write transaction that admits the
operation. A preview compiled before a pure-time boundary cannot later be
submitted as the operation's cut. Once that transaction admits the operation,
the model request owns the immutable cut; it does not change when policy state
later changes or expires.

For the first demonstrated time-bounded case, applicability is learning-wide
and uses a half-open
interval `[effectiveFrom, validUntil)`. The runtime supplies the trusted clock
and timezone context; model-assisted language interpretation proposes an
ISO-8601 boundary with an explicit UTC offset, which the runtime parses into an
absolute instant. The model cannot supply the source identity or current time.
The normalized boundary and interpretation context remain inspectable and correctable. Expiry is computed
when context is assembled. It does not delete history, create evidence, or
require a timer-generated state transition.

For this first interval, `effectiveFrom` is the admitted current instruction;
`validUntil` is only its expiry and cannot be used as a future activation time.
An already-operative constraint such as “do not quiz me today” is steering. A
one-time request or Tutor-authored reason to return to learning work at or
after a later time belongs to the separate future-attention authority. It is
not encoded as steering that happens to expire when the requested work should
begin. ALS-021's first excluded pilot exposed this model-facing ambiguity; the
distinction follows the policy-versus-future-attention boundary rather than
adding an action taxonomy or a universal Agenda owner.

The first implementation may retain one time-bounded steering contribution per
admitted source item. An identical new physical invocation reuses that effect;
a different interpretation for the same effect slot conflicts and requires an
explicit correction. This is a deliberately narrow initial shape, not a claim
that all future directives have one interval or one source slot.

The source-grounded excerpt is bounded so the routine context cannot retain an
arbitrarily large user message. A local or referential instruction such as
"only for this section" stays in current Session history until a stable course
or section scope has a demonstrated future consumer.

The compiler orders retained contributions by durable admitted-input order,
not repeated prompt position or wall-clock coincidence. A more recent explicit
learner instruction can override an overlapping older instruction for the
relevant action. A current, more specific request may create a one-Turn
exception without erasing the earlier contribution. For example, "test me with
two questions now" can override "do not test me today" for that Turn; only a
durable correction such as "testing is fine again today" retracts or supersedes
the retained contribution for later Turns.

Hard safety, domain-legality, and external-effect permission constraints still
apply. Stable learner defaults sit below explicit current and retained steering.

The first representation does not introduce a taxonomy of every Tutor action.
Verbatim or source-grounded steering can remain open semantic input to the
model. A structured action kind or deterministic candidate filter is added only
when a real code consumer must enforce that distinction.

## Consequences

- Routine local steering remains raw Session history when no future context
  needs it.
- Time-scoped steering can survive a Session boundary without becoming a
  permanent preference.
- The context makes its role and expiry visible, so a model summary cannot
  silently turn it into timeless policy.
- A retained instruction can affect natural-language teaching even before the
  system has a structured Tutor-action executor.
- Prompt guidance remains insufficient for hard permissions. If a future
  directive must hide a tool or prohibit an external effect, the same context
  cut also drives the execution-layer policy.
- Session-only, event-until, course-local, and condition-until scopes remain
  future variants. They are not encoded into a speculative scope language.
- Multiple independently scoped directives in one source item are an explicit
  extension boundary for the first implementation.
- The model-facing contribution includes its effect and source identities so a
  later correction can target the durable record rather than relying on a
  hidden host variable.

## Counterexamples

### Temporary steering becomes a stable preference

`今天先别测我` is stored as "the learner dislikes assessment" and suppresses
useful review weeks later. This loses both scope and learner authority.

### Expiry mutates learning evidence

At midnight the system inserts a new event suggesting that the learner became
ready for assessment. No such observation occurred; only a policy contribution
stopped applying.

### Current exception erases the durable instruction

The learner asks for two questions now, then opens another Turn later the same
day. Treating the local exception as a retraction causes the earlier "not
today" instruction to disappear without a durable correction.

### The source quote becomes a complete ontology

The program attempts to determine every teaching action prohibited by arbitrary
learner prose before any deterministic consumer exists. The first boundary only
retains, scopes, orders, and injects the policy contribution.
