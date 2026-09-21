# ADR 0006: Verifier boundaries and declared confidence

## Status

Accepted

## Decision

Verifiers plug into `@projectgate/verifier-sdk` and are registered by the core. They do not import the CLI or MCP server. Browser control lives in `@projectgate/browser` so Playwright is an engine, not a product.

Impact confidence has three values: `observed` for facts extracted from the tree, `declared` for facts the contract states, and `inferred` for heuristics and models. Test proximity is inferred even though it is deterministic, because a shared filename is not an observed runtime edge.

Architecture rules apply to changed files only. That misses a violation that a change triggers in an untouched file. Scanning the whole repository on every audit was rejected for V1 because the product question is about the change, and a missed distant file is recorded as a limitation in the roadmap rather than pretended away.
