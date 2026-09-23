# Changelog

## 0.2.0

### Added

- Dart/Flutter, Java with Maven or Gradle, Spring Boot, Python, .NET, Go, Rust, and Android are detected from their own manifests
- Spring mappings, Laravel routes, and the existing Node route extractors become product surfaces. A class is not a surface by itself
- Clearly separated task text becomes multiple user-supplied criteria. One sentence stays one criterion. No model provider is required
- Discovery retains detection provenance and normalized module routes/surfaces for both CLI and MCP; manifest changes invalidate baseline evidence
- Static reverse imports connect changed Java services and Dart self-package imports to dependent routes/screens, explicitly as inferred impact
- Native and mobile surfaces participate in impact analysis and available baseline/test orchestration. Device-level UI automation is not included.

### Changed

- Discovery uses technology adapters, supports mixed-stack repositories, and reports modules separately
- Changed source files are classified as application, test, configuration, documentation, asset, generated, Project Gate internal, or unknown
- Flutter baseline planning includes `flutter analyze` and `flutter test` when the SDK is available; platform builds are not started automatically
- Module commands run only when the change overlaps that module. Audit does not install dependencies
- Generic Node source and unsupported/deleted files stay visible; Project Gate runtime files cannot become product surfaces
- Tool readiness is checked, source-writing script modes are excluded from automatic discovery, and offline/no-restore baseline modes avoid dependency setup
- Repeated init preserves verification comments and the baseline opt-out

### Fixed

- Shell deadlines terminate process trees; programmatic cancellation produces unknown evidence instead of a product failure
- Package smoke installs are isolated from the user's global npm installation
- Public packages no longer contain a repository-only `prepack` script; clean installed packages can be repacked
- CLI and MCP versions come from the public package manifest, with a `0.0.0-dev` fallback rather than an old release number
- Yarn/pnpm commands use explicit script dispatch; `check` cannot accidentally run Yarn Classic's built-in command
- TypeScript configuration-only changes invalidate Node baselines
- Composer script aliases, arrays, cycles, and indirect dispatch are checked before automatic baseline discovery

### Validation

- A prior Windows local release check recorded typecheck, lint, 25 test files / 74 tests, and package smoke; this is historical candidate evidence, not current release readiness
- Validation-only Windows and Ubuntu CI lanes run Node 22, clean installation, browser setup, and the full release check
- Real Flutter and Spring repositories exercised discovery, impact, and successful SDK test execution; a real Laravel/React repository exposed the Yarn dispatch regression. See [the dogfood report](docs/REAL_WORLD_VALIDATION.md) and [release record](docs/RELEASE_0_2_0.md) for exact outcomes and remaining gates

## 0.1.0

First public release of `@akifsen/project-gate`.

- CLI for init, doctor, inspect, change contracts, verification planning, audit, selective verify, and reports
- Evidence-based verdicts: pass only when the required evidence exists
- Shell, API, architecture, Playwright, accessibility, and visual verifiers
- Local JSON run history and release packets, including an agent fix packet
- stdio MCP server (`projectgate-mcp`) using the same application services as the CLI
- Windows and other Node.js 22.18+ environments
