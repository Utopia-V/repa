# Released-v1 capability and tool registry

Changes in this subtree must preserve the generic capability boundary for the
retained Agent loop. That harness role derives from the
[system architecture](../../../../docs/architecture/00-system-architecture.md);
durable learning writes derive from
[Gate 8](../../../../docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md)
and their later domain owners. Actual registration proves availability only;
it cannot prove admission, permission, or correct product composition.

## Required boundary

Own tool definitions, model-visible schemas and descriptions, built-in/custom
registration, the live permission catalog, and generic execution adapters.
Gate 4 records `registry.ts` as a released-v1 registration seam; audit every
actual built-in/custom registration and any later MCP join against the same
catalog and Session boundary. Registry presence is capability availability,
not permission, product authority, or proof that a tool belongs in every Agent
profile.

Generic file, shell, web, MCP, Task, and artifact tools produce observations,
artifacts, or harness effects. They do not directly create Course, Goal,
learner, navigation, policy, or planning truth. A semantic durable learning
write must use the Repa learning-command preparation/runtime and the owning
Core domain transition. Keep domain SQL, legality, versions, provenance, and
acknowledgement meaning out of tool descriptions and wrapper code.

The runtime, not model-authored arguments, binds Session, Turn, Assistant,
Tool Part/call identity, trusted time, permission, source, and revision facts.
External custom and MCP tools may not collide with reserved Repa learning-write
or owner-query identifiers. Keep those collision checks at registration, and
derive restricted-Agent choices from the live permission catalog so a newly
registered capability does not inherit an old wildcard allow.

Descriptions and prompts may make tools learning-first, but they are not a
substitute for authorization or state transitions. If experimental code-mode
or LSP registration remains, it must be controlled by an explicitly admitted
runtime flag; neither source presence nor the flag may admit a second product
runtime.

Focused checks from `packages/opencode`: `bun test test/tool/registry.test.ts
test/tool/learning-first-descriptions.test.ts
test/learning-command/permission.test.ts`. Add the exact tool and owning Core
domain test when changing one semantic capability.
