# ChatGPT Pro review: model-initiated learning writes

Date: 2026-07-11

Status: Independent architecture review. This is supporting criticism, not
source evidence or a decision.

## Reviewer

- ChatGPT GPT-5.6 Pro (subscription)
- reported effort: `extended`
- elapsed time: 20.6 seconds
- server-side tools observed: none
- web search was not requested; all repository evidence was supplied in the
  review packet

## Question reviewed

Whether the missing evidence after B1/B2 is a live model independently
initiating a durable learning write through the system-owned executor, and what
the smallest non-oracle experiment must contain.

## Useful criticism

The review agreed that B2 does not cover the disputed link, but warned that a
write-friendly scenario can still hide host control if its harness injects an
expected action. It recommended evaluating selective initiative across write,
no-write, ambiguity/unsupported, and executor-rejection cases under one tool
catalog.

It also separated two claims:

- a model can exercise delegated write authority; and
- the model's default write policy is reliable.

One bounded sequence can support the first. It cannot establish the second or
approve production schemas and APIs.

## Adopted changes

- Added ordinary-question and unsupported-mastery abstention cases.
- Added an executor-rejection case with a stale context revision.
- Made the hard gate selective initiative rather than raw tool-call count.
- Kept case oracles out of model-visible prompts and tool descriptions.
- Limited any successful conclusion to the control boundary, not governance
  quality or production interfaces.

## Rejected expansion

The review suggested a broader write-opportunity permutation as a possible
reliability study. This protocol keeps one frozen sequence with no repeated
trials because its parent question is end-to-end capability and authority, not
policy accuracy estimation.
