# Agent policy profiles

Changes in this subtree must keep Agent policy and capability profiles over the
single released-v1 Agent loop. That role derives from
[Gate 4](../../../../docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md),
[Gate 5](../../../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md),
and the repository [product baseline](../../../../docs/foundation/00-product-origin.md).
Existing profiles, defaults, and generation behavior remain implementation
evidence to check against those owners, not authority to enlarge the role.

## Required boundary

Own built-in and configured Agent discovery, profile metadata, model/options
selection, capability policy, generated-Agent identifiers/files, and the
dedicated structured `Agent.generate` operation. The `repa` profile is the
ordinary learning-first default. Plan, explore, and future study/review-like
profiles are policies over the same loop, not separate Tutor runtimes or
durable learning authorities.

An Agent name, `hidden` flag, mode, prompt, or restored historical selection
never selects internal model composition. Ordinary primary and subagent calls
remain interactive. Program-owned internal operations use their explicit call
sites and fixed task contracts; `Agent.generate` remains its own narrow
structured-output owner.

The Repa product prompt and trusted runtime context are not replaceable Agent
text. Admitted machine-owned Agent prompts and plugin transforms are additive
extensions at the request-preparation boundary. They do not own Course, Goal,
learner, permission-settlement, or Tutor truth.

When a surface promises a restricted custom Agent, compile default-deny plus
explicit allows from the live capability catalog. Omitted and later-registered
capabilities stay denied. Preserve authored permission order, reject
unrepresentable object keys, constrain generated identifiers and target paths,
check collisions against the live catalog, and never overwrite an existing
Agent file.

Focused checks from `packages/opencode`: `bun test test/agent/agent.test.ts
test/agent/generate-workflow-authority.test.ts
test/agent/restricted-permission.test.ts
test/agent/generated-agent-file.test.ts`.
