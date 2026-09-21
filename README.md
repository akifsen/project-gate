# Project Gate

Project Gate decides whether a software change is actually done. A coding agent saying “done” is not evidence. The auditor is separate from the implementation, and a criterion passes only when the required evidence exists.

The product name lives in `packages/shared/src/product.ts`.

## Requirements

- Node.js 22.18 or newer
- Git
- Chromium for browser verifiers: `npx playwright install chromium`

## Setup

```bash
npm install
npx playwright install chromium
npm run check
```

`npm run check` typechecks, lints, tests, and builds. The CLI entry is `packages/cli/bin/projectgate.js`, which loads the built `dist` output.

## Commands

```bash
node packages/cli/dist/main.js init
node packages/cli/dist/main.js inspect
node packages/cli/dist/main.js contract
node packages/cli/dist/main.js audit
node packages/cli/dist/main.js audit --against main
node packages/cli/dist/main.js verify
node packages/cli/dist/main.js report
node packages/cli/dist/main.js report --format fix
```

`init` writes `.projectgate/` and does not overwrite existing files. It writes `contract.example.yml`, not an active contract. `audit` refuses to run until `contract.yml` exists, and it does not rewrite that file.

`verify` re-runs checks that failed, errored, or whose dependency hashes changed. Passing checks with unchanged dependencies are carried forward.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | PASS |
| 1 | BLOCKED |
| 2 | INCOMPLETE_EVIDENCE, or a missing contract or provider configuration |
| 3 | Internal error |
| 4 | PASS_WITH_HUMAN_REVIEW |
| 64 | Usage error |

## Avatar proof

`fixtures/avatar-profile` is a profile page that works on desktop and fails on mobile, allows another user to replace an avatar, drops the avatar on refresh, and hides the server-error state. `fixed/` contains the corrected files.

```bash
npm run build
npm run demo
```

The demo copies the fixture to a temporary git repository, audits the broken change, copies the fix, and runs `verify`. The expected path is exit 1, then exit 0, with the mime unit check carried forward. The same scenario is `tests/e2e/avatar.e2e.test.ts`.

## Agents

The MCP server is `node packages/mcp/dist/server.js` after a build, or `projectgate-mcp` once the workspace bin is linked. Tool handlers call the same core functions as the CLI. See `docs/MCP.md`.

`integrations/agents/cursor/hooks.example.json` is a Cursor stop hook. It is not installed in this repository. Copy it to `.cursor/hooks.json` when you want an agent stop to audit the worktree and, on a block, return the fix packet as a follow-up.

## Documentation

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/VERIFICATION_MODEL.md`
- `docs/EVIDENCE_MODEL.md`
- `docs/VERIFIER_SDK.md`
- `docs/MCP.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
- `docs/STATUS.md`
- `docs/ADR/`
