# Project Gate

Project Gate is an independent evidence-based release gate for AI-built software.

It connects a Change Contract to impact, verification, evidence, and a verdict. A coding agent saying “done” is not evidence. The author does not certify the implementation. A criterion passes only when the required evidence exists.

## Requirements

- Node.js 22.18 or newer
- Git
- Windows PowerShell and other shells are both supported

`init` and `inspect` read Node, PHP/Laravel, Dart/Flutter, Java/Maven/Gradle/Spring Boot, Python, .NET, Go, Rust, and Android projects. A repository can contain more than one of these. Project Gate discovers native and mobile surfaces, maps change impact, and plans available baselines and tests. Web runtime UI checks are supported; device-level UI automation is not. Audit does not install dependencies or start emulators.

## Quick start

Install the published package. `npm link` is only for people working on this repository.

```powershell
npm install -g @akifsen/project-gate

projectgate --version
projectgate doctor
```

`--version` prints the installed package version.

In the repository you want to audit:

```powershell
cd C:\path\to\my-project

projectgate init
projectgate inspect

projectgate contract --task "Describe the change"

projectgate audit
```

`init` discovers the stack and writes long-lived configuration under `.projectgate/`. It does not create an active change contract. `contract --task` writes `.projectgate/contract.yml`. You do not copy a template into place.

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

`--from-diff` marks criteria `INFERRED`. Review them before treating them as requirements. `projectgate contract` with no arguments summarizes the active contract, or prints the create commands when there is none.

`projectgate plan` prints the verification plan without running it. `projectgate audit --verbose` and `projectgate inspect --verbose` add classification and check rationale.

`contract --task` splits obvious separate requirements (sentences, semicolons, bullets, or numbered lines) into user-supplied criteria. A single sentence stays one criterion. When that one criterion is executable, Project Gate links the discovered test command. That proves the test ran. It does not prove browser behavior unless a runtime UI check is configured and passes. Responsive, mobile, and accessibility clauses are marked `RUNTIME`. Set routes or UI states, and set `local.start` and `local.ready_url` or `local.base_url` in `.projectgate/environments.yml`, before a web runtime check can start the app. A proposed `dev` or `start` script is reported by `inspect` and is not launched automatically. Playwright does not automate Flutter or Android device UI.

## npx

For a one-off check:

```powershell
npx -y @akifsen/project-gate --help
npx -y @akifsen/project-gate --version
npx -y @akifsen/project-gate doctor
```

Install the package globally or in the target project when you will run `init`, `audit`, and `verify` more than once. Those commands store configuration and evidence in that project.

## Playwright

Browser, visual, and accessibility checks need Chromium. Installing the npm package does not download browser binaries.

`projectgate doctor` reports whether the Playwright library is installed and whether Chromium is present. When Chromium is missing:

```powershell
npx playwright install chromium
```

Skip that command when you only want baseline build, test, lint, and typecheck checks.

## MCP

The package provides `projectgate-mcp`, a stdio server. It uses the same application services as the CLI and does not print a human help screen.

```json
{
  "mcpServers": {
    "projectgate": {
      "command": "projectgate-mcp"
    }
  }
}
```

Tool names and arguments are in `docs/MCP.md`. This repository does not claim a specific editor integration beyond that stdio command.

## Versions

`0.1.0` is the first public release. Version numbers are changed by hand in `release/package.json` before a release. There is no automated publisher.

- **Patch:** bug fixes that do not change the CLI, verdicts, or contract schema
- **Minor:** backward-compatible commands, verifiers, or contract fields
- **Major:** breaking changes to the CLI, exit codes, verdicts, or contract schema

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

## Contributing / local development

The source tree is an npm workspace. Internal packages stay private under `@projectgate/*`. The public package is built into `release/` as `@akifsen/project-gate`, with workspace code bundled in. Do not copy `node_modules` between machines.

```powershell
git clone https://github.com/akifsen/project-gate.git
cd project-gate

npm install
npm run build
npm link

projectgate --help
```

`npm link` is for this checkout only. Without a global link:

```powershell
npm run projectgate -- --help
```

That script runs `node packages/cli/dist/main.js` after `npm run build`.

```powershell
npm run check
npm run release:check
```

`npm run check` typechecks, lints, tests, and builds. `npm run release:check` also packs `release/` and installs that tarball outside the workspace. It does not publish.

Publish only after the check passes. `release:check` runs from the repository root. `npm publish` runs from `release/`:

```powershell
npm login
npm whoami
npm run release:check
cd release
npm publish --access public
```

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
- `CHANGELOG.md`
