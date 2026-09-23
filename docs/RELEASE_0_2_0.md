# 0.2.0 release readiness

Date: 2026-09-23. Candidate: `@akifsen/project-gate@0.2.0`. Nothing was published, tagged, pushed, or changed in remote repository metadata.

## Implemented

- Validation-only Node 22 matrix for `ubuntu-latest` and `windows-latest`, with `fail-fast: false`. Both lanes run `npm ci`, Chromium setup, then canonical `npm run release:check`. Ubuntu also installs Playwright system dependencies.
- Public package lifecycle leakage removed. Source `test:package` explicitly builds before packing; public `package.json` has no scripts. A clean installed package is repacked during smoke validation.
- Public manifest is the single version authority for source, bundled CLI, and MCP; unresolved development versions report `0.0.0-dev`. Exact version checks cover clean local and isolated global installations.
- Real dogfood fixed Yarn/pnpm script dispatch and exposed a TypeScript configuration invalidation gap. Composer alias/array/indirect script safety has regression coverage.
- Product documentation now describes software-wide discovery and honest native runtime limits. Public claims no longer depend on an external review tool's brand.

The adapter registry and normalized profile remain the extension boundary; no framework-specific discovery was added to core. Production workspace dependency review found no cycle. Another ecosystem can implement the adapter interface and register it with tests; additional runtime proof still needs an appropriate verifier.

## Platform validation

| Gate | Result |
|---|---|
| Windows, Node 22.23.2: clean `npm ci` | Passed |
| Windows canonical release check | Passed: typecheck, lint, 27 files / 82 tests, build, tarball smoke |
| Ubuntu 24.04.3 WSL, Linux Node 22.23.2 | Passed: clean `npm ci`, typecheck, lint, 27 files / 82 tests, build, tarball smoke |
| Linux Node provenance | Official Linux tarball checked against published SHA256 sums |
| Chromium setup | Windows browser checks passed; Linux required Chromium plus OS dependencies, matching the workflow |
| GitHub-hosted Ubuntu / Node 22 | PASS: `release-check`, commit `9c3b6ce9e300eea56faa5682910ac42d5c987c52` |
| GitHub-hosted Windows / Node 22 | PASS: same workflow and commit |

Hosted evidence was read directly from the GitHub Actions API during final closure: [workflow run](https://github.com/akifsen/project-gate/actions/runs/35841504166), [Ubuntu job](https://github.com/akifsen/project-gate/actions/runs/35841504166/job/107117405165), and [Windows job](https://github.com/akifsen/project-gate/actions/runs/35841504166/job/107117405314). Both jobs completed successfully; remote `main` and local HEAD matched that exact commit when checked. The links identify historical evidence for this commit, not a promise about future commits.

The successful jobs warned that checkout/setup-node v4 target deprecated Node 20. Official stable [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) were confirmed, including their Node 24 action runtimes. Those action references are updated locally; the tested application Node matrix remains 22. This maintenance-only workflow edit has not been pushed or run on hosted CI in this task. The PASS evidence above belongs to the original v4 workflow, and the next normal push must validate the refreshed action references. It is not a new application release blocker.

Initial Linux runs correctly failed without Chromium/system libraries. A 150 ms process-test startup assumption also failed under load; the test now gives Node 1 second to start while retaining the timeout, captured-output, and under-3-second termination assertions. The final complete runs above include all code fixes and no skipped failing tests.

Earlier local logs (gitignored): `.projectgate/runtime/release-020-npm-ci.log`, `release-020-windows-complete.log`, and `ubuntu-release-check-aVkWMd` in the same directory. Final closure reran clean `npm ci` and canonical `npm run release:check` successfully on Windows: typecheck, lint, **27 test files / 82 tests**, build, package-content checks, clean install/repack, CLI and MCP. Final logs are `.projectgate/runtime/closure-npm-ci.log` and `closure-release-check.log`. These local logs supplement the separately verified hosted results above. No product source, manifest, lockfile, or release-script changes were needed for closure.

## Real repository validation

See [REAL_WORLD_VALIDATION.md](REAL_WORLD_VALIDATION.md) for commands, actual diff selection, classifications, and failed as well as successful attempts.

| Repository | Discovery / impact | Executed evidence |
|---|---|---|
| Existing Flutter application | Dart/Flutter/Pub; 23 application files, 7 test changes, 5 surfaces | Analyze clean; 363 tests passed using existing cache, `--no-pub` |
| Existing Spring Boot service | Java/Spring/Maven; 4 application files, 3 test changes, 7 surfaces | Offline Maven: 25 tests passed |
| Existing Laravel/React/Vite application | PHP/TS, Composer/Yarn; 3 application files, 1 test change, 3 surfaces | Vite build and TypeScript check passed; Composer test chain stopped on 282 target PHPStan errors; audit correctly BLOCKED |

General contract criteria intentionally remain unproved by baseline-only results. None of these target applications is being declared release-ready. Original repositories stayed clean; private paths and source evidence are excluded from public artifacts.

## Package and CLI/MCP validation

Retained artifact: `release/akifsen-project-gate-0.2.0.tgz`.

| Field | Value |
|---|---|
| Name / version | `@akifsen/project-gate` / `0.2.0` |
| License / engine | MIT / Node `>=22.18` |
| Packed / unpacked bytes | 119,179 / 490,614 |
| Files | 8 |
| SHA256 | `0823fc8d19759c967b7648e06a9c5cf367110f3998ec2f016b4257173130ba61` |
| Binaries | `bin/projectgate.js`, `bin/projectgate-mcp.js` |

The eight files are the manifest, README, LICENSE, CHANGELOG, two executable shims and two bundles. Runtime dependencies remain external normal npm dependencies; private workspace imports are rejected. Manifest/bin targets, missing lifecycle paths, fixture/source leakage, `node_modules`, credentials/runtime evidence exclusions, clean local/global install, and installed-package repack checks passed on both platforms. The retained artifact above is the final Windows closure build, including the reconciled README and changelog; its full smoke validation passed. It is gitignored and was not published.

Packed `--help`, exact `--version` = `0.2.0`, `doctor`, `init`, `inspect`, `contract --task`, and audit smoke passed. A real stdio MCP initialize request returned server `project-gate` with version `0.2.0`. Lifecycle tests exercise audit followed by selective verify and reports. Real Spring `verify` and JSON `report` both retained exit 2 for incomplete evidence and produced valid packets; this is the expected verdict behavior, not a CLI crash.

## Known limitations

- Native device/emulator UI automation is unavailable; static surfaces and passing tests do not constitute native runtime proof.
- Route parsing is bounded and partial. Custom scripts/wrappers remain trusted repository code; known-mutator inspection is not an execution sandbox.
- Tool availability does not prove dependency readiness. Audits do not install dependencies.
- Source-workspace npm audit reported two moderate development-only Vitest/mocker advisories requiring a major test-tool upgrade. The production-only audit reported zero vulnerabilities at validation time. No forced upgrade was mixed into this release task.
- macOS and live native devices were not exercised.

## Release blockers and verdict

The stale hosted-CI blocker is closed: both hosted jobs passed for the current product-source commit, and final local release validation passed after documentation reconciliation. Package smoke, clean tarball installation, exact CLI version, MCP handshake, and lifecycle/import checks passed. Flutter and Spring baselines passed; the real web audit correctly blocked actual target-project verification failures. No critical/major known product release blocker remains. The local action-version maintenance edit is explicitly distinguished from the hosted evidence above and should be checked by the next normal CI run.

**READY FOR 0.2.0 RELEASE**

## Manual checklist

1. Review the source diff, [release notes](RELEASE_NOTES_0_2_0.md), and anonymized dogfood evidence; commit the intended candidate.
2. Confirm both hosted matrix jobs on the commit to be tagged, including the refreshed action references when this closure diff is committed. Recorded historical evidence must not be represented as a run of a newer commit.
3. Recheck version, clean source state, package contents, and exact packed CLI/MCP identity after any changes. Rerun the release check if code changes.
4. Authenticate and confirm the intended npm account; manually publish from `release/`, never the private workspace root. Tag only the reviewed release commit. Publication, pushing, tagging, and GitHub Release creation were not performed during this task.

## Manual GitHub metadata recommendation

- Description: `Independent evidence-based release gate for AI-built software.`
- Website: `https://www.npmjs.com/package/@akifsen/project-gate`
- Topics: `ai`, `developer-tools`, `coding-agents`, `quality-gate`, `release-gate`, `software-testing`, `mcp`, `playwright`, `cursor`, `codex`, `claude-code`, `ci`

These are recommendations only; remote metadata was not edited.
