# Status

## Completed

- Domain verdict, evidence classes, findings, and release-packet records
- Schema version 1 project configuration and change contracts
- JSON run index and filesystem artifacts (ADR 0007)
- Git change detection, import and route impact, inferred test proximity
- Conservative evidence invalidation and selective verify
- Shell, API, architecture, Playwright, axe-core, and visual verifiers
- CLI: init, doctor, inspect, contract, plan, audit, verify, report
- MCP tools over the same core functions, plus a stdio server
- Fix packets and a Cursor stop-hook adapter that is not enabled in this repo
- Avatar fixture: broken change is BLOCKED, the fix is PASS, and the untouched mime check is carried
- This repository's `.projectgate` configuration
- Multi-stack adapters, provenance-preserving module profiles, and change-aware baseline discovery
- Flutter/Spring/mixed fixtures installed from the npm tarball; see `MULTISTACK_VALIDATION.md`

## In progress

- Nothing required for the V1 scenario

## Remaining

- Deeper framework parsing beyond bounded static route/import heuristics
- Video and full HAR capture
- CI workflow templates
- Enabling the Cursor hook in a repository that wants it

## Architectural decisions

- npm workspaces (`docs/ADR/0001-npm-workspaces.md`)
- Local JSON run index plus HTML, no dashboard (`docs/ADR/0002-local-storage-and-no-dashboard.md`, `docs/ADR/0007-json-run-index.md`)
- Explicit verdicts and exit codes (`docs/ADR/0003-verdict-and-exit-codes.md`)
- Inference cannot pass a criterion (`docs/ADR/0004-inference-cannot-pass.md`)
- Conservative invalidation (`docs/ADR/0005-conservative-invalidation.md`)
- Verifier and confidence boundaries (`docs/ADR/0006-verifier-boundaries.md`)

## Known limitations

- Import graphs cover relative JS/Dart imports, Dart self-package imports, and ordinary explicit Java/JVM imports; reverse traversal is bounded to eight steps, without external dependency resolution
- PHP analysis covers use statements and call expressions
- Architecture scanning is limited to the diff
- Network evidence is a JSON log, not a HAR
- Browser checks do not record video
- LLM features are off unless all three provider variables are set
- Self-audit typecheck runs only when this repository is audited; the test suite does not call it, so the suite does not recurse

## Current V1 blockers

- The next candidate is prepared in `release/`; this task does not publish it. Contributors use `npm ci`, `npm run build`, and optional `npm link`. Release validation uses isolated temporary installs.
