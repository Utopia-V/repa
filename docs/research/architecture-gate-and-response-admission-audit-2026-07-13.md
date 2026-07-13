# Architecture gate and learner-visible response admission audit

Status: Completed architecture gate; **go to Proposal 0005 implementation**

Date: 2026-07-13

Scope clarification: this gate established that Proposal 0005 could safely run
on the then-current architecture. It did not establish that the partial
Repa-owned harness should remain the long-term substrate. ADR-0014 now
supersedes that runtime direction while retaining Proposal 0005's learning
behavior as an oracle.

## Plain-language result

The current production architecture does not need to be replaced before the
next product slice. The Tutor loop, Agenda, Course View, Interaction lifecycle,
and SQLite authority have inspectable ownership and executable failure
evidence. Large files are a maintenance signal, but this audit found no second
writer, dependency inversion, or duplicated state authority that would make
Proposal 0005 unsafe by itself.

One existing runtime defect is recorded but does not lead the next slice. The runtime displays
provider text immediately, concatenates text from every model step, and
persists the concatenation as one assistant occurrence. Live ALS-022 traces
therefore flatten tool preambles, useful teaching, and occasional internal
Agenda/control narration into the same answer. This is a presentation and
interaction-item problem, not evidence that the Learning System needs a new
controller or a security-style response approval layer.

The gate is therefore:

```text
existing architecture
-> implement the Agenda constraint, exact legal count, policy gate, and
   conditional context contribution
-> render the new meaning naturally and verify final learner-visible behavior
-> revisit response items only if that evidence still shows a material defect
```

This is not permission for a second runtime, message bus, selector model, or
general presentation framework.

## Evidence inspected

The audit re-read product origin, ADR-0011 through ADR-0013, the system
architecture, Proposal 0005, production source, production and lab tests, and
the ALS-022 result records.

Fresh verification completed successfully:

```text
bun run check
229 tests passed
0 tests failed
1424 assertions
```

The total includes production tests and research labs, so the number is not
used as a claim that 229 distinct product behaviors are complete.

Static dependency inspection found no import from `src/learning/**` to the AI
SDK, a provider, runtime, or terminal code. Runtime imports the AI SDK and Tutor
composition; learning modules use SQLite, source identity, storage primitives,
and Interaction provenance inside the accepted modular-monolith boundary.

Executable coverage includes ordered schema migration and rollback, process
write ownership, stale context rejection, atomic tool/domain settlement,
runtime recovery, and fresh-Session Course and Agenda continuity. No finding
below weakens those results.

## Deferred runtime finding: response items are flattened

`src/runtime/run-tutor-turn.ts` currently performs this sequence:

1. persist an immutable context cut before each model operation;
2. receive `text-delta` parts from `fullStream`;
3. append every delta to one Turn-wide string and immediately call
   `onTextDelta`;
4. let the CLI write that callback directly to stdout; and
5. after successful completion, persist the same concatenation as one
   assistant Session item and return it as `outcome.text`.

At delta time, the runner does not yet know the complete step result. A tool
call or failure may follow. Dropping all pre-tool text is also wrong: an
existing valid Course fixture teaches and then advances the route in one
tool-calling step. The missing invariant is not “approve one safe string.” It
is “do not erase the item boundaries that tell presentation and history what
kind of model output occurred.”

Partial text followed by failure remains a truthful-lifecycle case worth
covering. It does not by itself require hiding all live output; an explicitly
interim item may be visible without being misrepresented as a completed Tutor
answer.

## Codex and AI SDK comparison

The pinned Codex commit `44918ea10c0f99151c6710411b4322c2f5c96bea`
provides the relevant reference:

- `codex-rs/protocol/src/models.rs` defines optional `Commentary` and
  `FinalAnswer` phases for assistant message items and explicitly notes that
  providers do not emit them consistently.
- `codex-rs/core/src/session/turn.rs` streams deltas for the active assistant
  item; it does not wait for a universal semantic approval pass.
- `codex-rs/core/src/stream_events_utils.rs` finalizes and records response
  items separately. It strips only known host markup such as citations and
  proposed-plan blocks, not arbitrary internal words.

Codex therefore does not guarantee that a model can never paraphrase a system
or developer instruction. Its practical protection is model instruction
following plus typed message/item boundaries, with commentary and final answer
rendered as different phases.

The pinned AI SDK dependency already exposes each `StepResult` and defines
`StreamTextResult.text` as the last step's text. Repa should use the step/item
structure rather than manually treating `fullStream` as one answer. The last
step alone is not sufficient, because an earlier tool-calling step may contain
real teaching; the required adaptation is item preservation, not text loss.

Preserved invariant: interim assistant output, tool activity, and the terminal
answer remain distinguishable. Deliberate Repa difference: the first local
shape may derive that distinction from AI SDK step completion because the
current OpenAI-compatible provider does not supply Codex's phase metadata.

## Why the rest of the architecture passes the gate

- `runTutorTurn` remains a 234-line execution spine rather than the owner of
  Agenda or Course transitions. Proposal 0005 can continue to compile context
  through `src/tutor/compile-context.ts` without adding a second controller.
- Agenda create, address, dismiss, reopen, supersede, inspection, source reads,
  replay, and correction remain in one authority. Its large source file should
  be split only when a concrete ownership or change-isolation boundary appears.
- Course and Agenda entity versions are not duplicates of
  `system_state.state_revision`: entity versions guard their own transitions;
  the current global value remains a context/commit watermark.
- Migration, command, and tool-invocation settlement already have atomic and
  replay tests. The new constraint can enter those existing semantic values and
  a conservative nullable migration without replacing persistence.
- Full current-Session replay will eventually create a context-budget problem,
  but cross-Session continuity already uses learning queries rather than old
  transcript injection. Long-Session compaction is not a Proposal 0005 gate.

## Obligations inside Proposal 0005, not predecessor projects

Two other gaps are normal implementation work:

1. `policyProfileRevision` is currently recorded provenance, not a behavior
   switch. The first conditional contribution needs a narrow recognized-policy
   predicate; unknown revisions must fail closed. This does not earn a generic
   mode or profile framework.
2. The routine Agenda projection is bounded to eight concerns and reports total
   open count. Composition needs an exact, untruncated count of legal
   eligible/current/constrained candidates from the Agenda query boundary. It
   must not infer uniqueness from the bounded display list.

Response-item preservation is not a predecessor and is not pre-authorized as
part of the first Proposal 0005 implementation. The semantic slice first uses
natural rendering plus output verification. A repeated material failure, a
partial-recovery requirement, or a TUI consumer may later earn the phase/item
shape.

## Considered alternatives

- **Prompt only while keeping the current flattened runner:** insufficient;
  observed output remains hard to classify or present naturally.
- **Keyword filtering:** rejected because control terms can be paraphrased and
  legitimate learning content can contain the same words.
- **Drop every tool-calling step:** rejected by a real teach-then-advance case.
- **Second review/rewrite model:** adds latency, cost, and another probabilistic
  failure surface without being required by the observed boundary.
- **Codex-style response items/phases:** preserves streaming and the useful
  distinction; Repa needs a fallback because its current provider does not emit
  the same phase metadata.
- **Explicit response-commit tool:** unnecessary unless item/step separation
  later proves insufficient; no such evidence exists now.

The first implementation should not adapt the AI SDK step structure merely
because Codex exposes a richer phase protocol. It should use that reference if
the deferred trigger occurs.

## Independent challenge and authority

Two fresh-context read-only audits independently inspected production source:
one reviewed authority, persistence, recovery, and Proposal 0005 pressure; the
other isolated the streaming/presentation timeline and candidate seams. A
third review considered repository reproducibility as a secondary concern.

A ChatGPT Pro review received the initial evidence packet and returned
`GO WITH INTERNAL BLOCKER`. It correctly rejected a rearchitecture, but the
packet framed display/persistence equality as the candidate invariant before
the pinned Codex item/phase path was inspected. The subsequent source check
narrows the conclusion: preserve response items and test model behavior; do not
invent a universal admission or secrecy mechanism. This correction is why
reviewer output is evidence to challenge, not authority.

## Secondary delivery observation

Most current production source, tests, ADRs, and evidence are still outside the
recorded Git history. That weakens reproducibility for another maintainer or an
external reviewer. It should be corrected through intentional checkpoints and
a concise `works now / not yet / run` entry when the current coherent slice is
ready. It does not change product semantics or outrank the architecture gate.

## Next admissible work

The next production change is Proposal 0005's learning-owned semantic slice.
Its output verification should still inspect these presentation cases:

1. internal pre-tool narration;
2. useful teaching followed by a tool call in the same step;
3. internal narration in a terminal realizing step;
4. partial provider text followed by failure or interruption;
5. legitimate subject prose that happens to use a control-like word; and
6. an unrelated explanation does not acquire a conditional purpose or internal
   control narration.

Implement the Agenda/domain/context obligations first. Do not open a general
UI, approval, message, activity, or constraint subsystem. Reconsider response
items only at the explicit trigger above.
