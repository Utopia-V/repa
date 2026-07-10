# ADR-0001: Use OpenCode as a pinned read-only reference

Status: Accepted
Date: 2026-07-10

## Context

The project needs a reliable engineering reference because the maintainer is still building experience with production agent harnesses and unrestricted AI-generated architecture would be difficult to audit. Directly forking OpenCode would remove blank-page uncertainty but inherit a large, fast-moving coding-agent product and its unrelated subsystems.

## Decision

OpenCode `v1.17.18` at commit `b1fc8113948b518835c2a39ece49553cffe9b30c` is kept as a local, ignored, read-only checkout under `.reference/opencode`.

The project may study behavior, data flow, failure handling, and tests from this checkout. Production code must not import it. Any adapted design must record the source and the differences. Substantial copied source must retain MIT license obligations; behavior-oriented reimplementation is preferred.

## Consequences

- The reference remains executable and searchable without becoming an upstream dependency.
- Repa can deliberately omit coding-specific and product-scale architecture.
- Upstream changes do not silently alter the project's design.
- Updating the reference requires an explicit change to `references.lock.json` and a renewed source review.
- Blank-page risk is reduced, but architectural understanding is still required before implementation.
