# ADR 0001: npm workspaces

## Status

Accepted

## Decision

The repository uses npm workspaces and `tsc -b` project references.

pnpm through corepack failed on this machine with `EPERM` while opening `C:\Program Files\nodejs\yarnpkg`. npm was already available and is enough for a single-process V1. Package boundaries stay as workspace packages so a later package-manager change does not require a redesign.

Vitest resolves workspace packages to TypeScript source. The production CLI and MCP server run the compiled `dist` output.
