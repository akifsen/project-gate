# Project Gate

Project Gate decides whether a software change is actually done. A coding agent saying “done” is not evidence. The auditor does not certify the implementation, and a criterion passes only when the required evidence exists.

Install dependencies with `npm install`. Do not copy a `node_modules` folder between machines. Native addons and Playwright browsers are platform-specific.

The product name and command live in `packages/shared/src/product.ts`.

## Requirements

- Node.js 22.18 or newer
- Git
- Windows PowerShell and other shells are both supported

Playwright’s Chromium build is required only for browser, visual, and accessibility checks:

```powershell
npx playwright install chromium
```

Skip that command when you only want baseline build, test, lint, and typecheck checks.

## Installation

From a clone of this repository, in PowerShell:

```powershell
npm install
npm run build
npm link

projectgate --help
```

`npm install` does not put this package’s own `projectgate` command on your PATH. `npm link` does. After the link, `projectgate` works from any repository.

Without a global link, from this repository:

```powershell
npm run projectgate -- --help
```

That script runs `node packages/cli/dist/main.js`, which exists only after `npm run build`.

Confirm the setup:

```powershell
projectgate doctor
```

## First use

In the repository you want to audit:

```powershell
cd C:\path\to\my-project

projectgate init
projectgate doctor
projectgate inspect

projectgate contract --task "Add profile avatar upload with 5 MB validation."

projectgate audit
```

`init` discovers the stack and writes long-lived configuration under `.projectgate/`. It does not create an active change contract, and you do not copy a template into `contract.yml`.

`contract --task` writes `.projectgate/contract.yml`. The supplied text becomes criterion `AC-001` with evidence class `EXECUTABLE`, and Project Gate links the discovered test command to that criterion when one exists. That proves the test ran. It does not prove browser behavior. Edit the contract and set `evidence: RUNTIME`, plus routes or UI states, when the change has to be observed in the running app. Set `local.start` and `local.ready_url` in `.projectgate/environments.yml` before runtime checks can start the app. A proposed `dev` or `start` script is reported by `inspect` and is not launched automatically.

If the audit is blocked:

```powershell
projectgate report --format fix
```

After the implementation is fixed:

```powershell
projectgate verify
projectgate report
```

`verify` re-runs failed, errored, and stale checks. Passing checks whose dependency hashes are unchanged are carried forward.

Other ways to create the contract:

```powershell
projectgate contract --from-file TASK.md
projectgate contract --from-diff
projectgate contract
```

`--from-diff` marks criteria `INFERRED`. Review them before treating them as requirements. `projectgate contract` with no arguments summarizes the active contract, or prints these commands when there is none.

`projectgate plan` prints the verification plan without running it. `projectgate audit --verbose` and `projectgate inspect --verbose` add classification and check rationale.

## What an audit looks like

```text
Task:
Add avatar upload.

1. projectgate init
2. projectgate contract --task "Users can upload JPEG, PNG and WebP avatars up to 5 MB."
3. projectgate audit
```

A blocked result names the failed checks and the reason any criterion is still unknown. Give the fix packet to the implementation agent:

```powershell
projectgate report --format fix
```

Then `projectgate verify`. A pass means every required criterion has sufficient evidence and no blocking finding is open. Unknown is not turned into a pass.

The avatar fixture in `fixtures/avatar-profile` is a full runtime example: desktop works, mobile overflows, authorization is wrong, and refresh loses the avatar. `npm run demo` copies it, audits the broken tree, applies `fixed/`, and verifies. That demo expects a built CLI.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | PASS |
| 1 | BLOCKED |
| 2 | INCOMPLETE_EVIDENCE |
| 3 | Internal error |
| 4 | PASS_WITH_HUMAN_REVIEW |
| 5 | Configuration error, including no active contract or a placeholder contract |
| 64 | Usage error |

## Checks this repository runs

```powershell
npm run check
```

That typechecks, lints, tests, and builds. `npm test` includes the avatar end-to-end test and the lifecycle test.

## Agents

After a build, the MCP server is:

```powershell
node packages/mcp/dist/server.js
```

Its tools call the same core functions as the CLI. See `docs/MCP.md`.

`integrations/agents/cursor/hooks.example.json` is a Cursor stop hook. It is not installed here. Copy it to `.cursor/hooks.json` when an agent stop should audit the worktree.

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
- `docs/USABILITY_FINDINGS.md`
- `docs/ADR/`
