# Claude Code v2.1.88 research-material provenance

Status: verified public exposure; proprietary research material; not an open-source dependency

## What this material is

Claude Code `v2.1.88` was briefly published in the official
`@anthropic-ai/claude-code` npm package with a `cli.js.map` file containing
original TypeScript in `sourcesContent`. The npm version was subsequently
removed. Anthropic's public `anthropics/claude-code` repository does not publish
the CLI core under an open-source license.

The recovered tree is therefore useful for architecture archaeology, but public
availability does not make it open source and does not grant this project a
right to copy or redistribute its implementation.

## Independent archives checked

Two independently maintained GitHub archives were fetched outside this
repository and compared:

1. [`chauncygu/collection-claude-code-source-code`](https://github.com/chauncygu/collection-claude-code-source-code)
   - commit: `b934603b2800374b315b25061bbeffb40ab6ab26`
   - compared subtree: `original-source-code/src`
2. [`Exhen/claude-code-2.1.88`](https://github.com/Exhen/claude-code-2.1.88)
   - commit: `c8cd253554319f32ff64ff7000636199f720c9bc`
   - compared subtree: `source/src`
   - retains the published package manifest and documents the direct
     `cli.js.map` extraction procedure

Both trees contain:

- 1,902 files total;
- 1,884 TypeScript or TSX files;
- 30,895,517 bytes;
- zero relative-path or per-file SHA-256 differences.

The retained package manifest identifies the artifact as
`@anthropic-ai/claude-code` version `2.1.88`, authored by Anthropic, with the
license field `SEE LICENSE IN README.md`.

This establishes that the two checked repositories preserve the same extracted
artifact. It does not independently reconstruct the now-removed npm tarball or
prove that the sourcemap contained every module in Anthropic's source tree.

## Known limitations

- The snapshot represents one release, not current Claude Code.
- Compile-time feature elimination means internal or disabled modules may be
  absent from the published bundle and therefore unrecoverable from its map.
- Original build configuration and development dependencies are incomplete.
- Community annotations, renamed symbols, rebuild projects, and architectural
  essays are secondary material and must not be treated as source evidence.
- Behavior that differs from current official documentation must be described
  as historical `v2.1.88` behavior.

## Research boundary

- Keep the recovered source outside the Git repository in a read-only cache.
- Never import it from production code or vendor it into this repository.
- Do not copy implementation text, prompts, comments, or private constants.
- Extract behavioral contracts, state transitions, ownership boundaries, and
  failure modes, then reimplement independently for the problems Repa actually
  has.
- Cite file paths and the pinned archive commit in research notes so conclusions
  remain auditable.
- Use OpenCode's MIT-licensed source as the primary executable reference when an
  equivalent mechanism is available there.

## Appropriate comparison targets

Claude Code `v2.1.88` and OpenCode `v1.17.18` should be traced through the same
questions:

1. Who owns the agent loop and its legal stop/continue transitions?
2. When does a user input become durable and model-visible?
3. How are provider events normalized and projected into session state?
4. How are tool calls authorized, started, settled, interrupted, and replayed?
5. Which state belongs to the TUI, process runtime, transcript, or durable store?
6. How are context construction, compaction, retries, and recovery separated?
7. Which mechanisms are coding-product behavior rather than general harness
   invariants?
8. Which ideas survive translation into a learning-native session?

The comparison should produce design constraints, not a hybrid of either source
tree.
