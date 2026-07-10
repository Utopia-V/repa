# ADR-0002: Modes are policy profiles over one agent loop

Status: Accepted
Date: 2026-07-10

## Context

Terminal agents expose concepts such as plan mode, build mode, or specialized
agents. A superficial implementation can model each one as a separate executor,
workflow, or agent loop. That duplicates session, streaming, tool, permission,
and persistence behavior and makes mode transitions architectural transitions.

Source study shows that the important behavioral difference is normally the
effective instructions, selected context, visible tools, and permission policy,
not a different model-execution protocol.

Agentic Learning System will need similarly distinct behavior while planning,
teaching, testing, reviewing, handling assignments, or importing material. The
learning process remains open-ended, and these labels must not hard-code it into
separate workflows.

## Decision

The system has one agent loop and one tool-execution lifecycle.

A mode changes the effective policy applied at a provider-turn boundary. Its
possible contributions include:

- instructions and behavioral defaults;
- context sources and selection rules;
- visible or preferred tools;
- permission-policy overlays;
- stopping, continuation, and user-confirmation policy;
- presentation hints for the interaction surface.

A mode does not own:

- an independent message model;
- a separate provider loop;
- a separate tool registry or tool-call state machine;
- a separate persistence format;
- a separate Session identity;
- learning-domain state transitions that bypass normal validation.

Plan behavior is therefore produced by a read-oriented tool set, restrictive
write permissions, planning instructions, and relevant planning context. It is
not implemented as a second agent runtime.

Learning behavior may select or combine policy contributions dynamically. The
architecture must not require every learning activity to fit one exclusive,
long-lived mode enum. A review can contain explanation; an assignment can
produce learning evidence; a study turn can switch into assessment without
restarting the Session.

## Consequences

- Mode changes take effect only at explicit provider-turn boundaries.
- In-flight tool calls retain the authorization and policy under which they
  were issued.
- Session history and tool-call identities remain continuous across a mode
  change.
- The context compiler must expose the provenance of mode-specific additions.
- Permission restrictions are enforced by the execution layer, not merely
  described in a prompt.
- Tests can run the same loop under different policy inputs rather than testing
  multiple implementations.
- Product vocabulary such as plan, study, review, or assignment remains useful
  without dictating runtime topology.

## Rejected alternatives

### One executor per mode

Rejected because it duplicates core mechanics and makes mixed learning activity
unnatural.

### Prompt-only modes

Rejected because a prompt cannot enforce write restrictions or tool authority.
Mode policy must also affect context, tool visibility, and permissions.

### A fixed workflow graph for the whole learning session

Rejected as the default because the next learning action is often selected from
evidence and user intervention at runtime. Deterministic domain operations may
still use explicit workflows behind tools.
