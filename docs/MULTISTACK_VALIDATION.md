# Multi-stack discovery validation — 0.2.0 candidate record

Validation date: 2026-09-23. No package was published.

## Root causes and starting state

The supplied Flutter failure describes the earlier Node/PHP-oriented implementation: no Dart manifest/toolchain discovery, missing Dart source classification, and therefore no canonical Flutter baselines. Contract text was treated as one criterion instead of separate requirements. This historical output came from the request; it was not reproduced against an installed 0.1.0 package in this task.

The checkout already contained eight adapters, partial Flutter/Spring support, semicolon/bullet contract splitting, and a 0.2.0 release manifest. This work extended that implementation rather than replacing it. The initial suite passed 53 tests, but inspection and additional regression tests exposed gaps:

- Generic `.ts` files remained unknown, while files with unrelated extensions under `services/` could be misclassified as Node application code.
- Flattening detection objects discarded source, adapter, and confidence. Manifest changes were omitted from baseline invalidation patterns.
- Node/PHP command readiness was unconditional. Flutter folder layout could be treated as confirmed framework evidence. Native `lib/pages` directories could imply a browser application.
- Runtime source files inside `.projectgate` could enter surface extraction; deleted unknown files disappeared from the unresolved list.
- Reverse imports were not followed to unchanged controllers/screens. Nested Next routes could collapse to `/`; Laravel methods sharing a URI were indistinguishable.
- Shell cancellation/deadlines and package smoke isolation needed stronger handling.

## Architecture

`packages/config/src/stacks` remains the adapter registry. Adapters own file classification, technology/tool discovery, and static route extraction. Module ownership supports mixed repositories without choosing one exclusive stack. Existing public string arrays remain, with additive `detections`, `manifests`, `routes`, and `productSurfaces` carrying provenance.

CLI and MCP share `discoverRepository` and `inspectProject`. Existing release packets retain module technology data; schema version 1 is preserved. Invalidation includes source patterns and manifests. User commands take precedence; repeated init preserves verification comments, existing command values, and `discover_baseline: false`.

Impact records every changed file in a broad category. Resolved Java and Dart imports can connect changed implementation code to unchanged routes/screens; propagated impact is explicitly inferred. A parsed endpoint is static evidence, not runtime proof. Naming a class does not prove a product surface.

## Supported technology matrix

“Baseline” below describes discovery/planning, conditional on tooling and setup. It does not mean that ecosystem's SDK tests were run during this task.

| Technology | Discovery | Classification | Baseline | Runtime UI | Surfaces / boundaries |
|---|---|---|---|---|---|
| Node / JS / TS | Yes; npm/pnpm/yarn/bun | Yes | Existing recognized scripts; readiness and known-mutator checks | Configured browser checks for a web app | Static HTTP and router patterns |
| React / Vite / Next / Vue / Nuxt / Svelte / Angular | Manifest/config signals | Yes, including Svelte | Existing scripts only | Configured browser checks for web UI | Partial; React/Next route patterns, inferred UI components |
| PHP / Laravel | Yes | Yes | Composer, Artisan, existing PHPUnit/Pest | Configured browser checks for a web app | Literal routes with distinct HTTP verbs; dynamic groups limited |
| Dart / Flutter | Confirmed Flutter SDK dependency | Yes; generated/test/screen files | Flutter analyze/test with `--no-pub`; Dart analyze | Mobile discovery/impact/baseline/test orchestration; no device UI automation | Inferred mobile screens and literal navigation paths |
| Java / Kotlin / Spring Boot | Maven/Gradle manifests, wrappers, Spring signals | Yes | Offline test; verify/check surfaced as optional capabilities | Configured browser checks for a web app; no Android device UI automation | Literal Spring mappings; explicit import relationships; dynamic mappings unresolved |
| Android | Android Gradle plugin/manifest signals | Yes | Unit test discovery; instrumentation is not auto-started | Mobile discovery/impact/baseline/test orchestration; no emulator/device UI automation | No emulator/device surface verification |
| Python / Django / FastAPI / Flask | Common manifests/configuration | Yes | Configured pytest/Django/unittest and available lint tools | Configured browser checks for a web app | Partial literal decorators/URL patterns |
| .NET / C# / F# / ASP.NET | Project/solution metadata | Yes | Build or test with `--no-restore` | Configured browser checks for a web app | Partial controller/minimal API mappings |
| Go | Module/source detection | Yes | Test/vet using cached or vendored modules; downloads disabled | Configured browser checks when it hosts a web app | Common literal HTTP mappings; inferred CLI entry |
| Rust | Cargo/source detection | Yes | Offline/locked test; lockfile required; optional capability reporting | No runtime UI discovery claim | Inferred CLI entry in profile; no Rust HTTP/public API parser |
| Unsupported source | Explicit unknown | Preserved, including deletions | Explicit configured commands remain usable | No invented runtime UI support | No invented mapping |
| Project Gate internals | Explicit internal category | Preserved separately | Not application evidence | Not application evidence | No product surfaces |

Browser runtime checks require an explicitly configured application and UI states/routes. Native and mobile projects receive discovery, impact analysis, and baseline/test orchestration, but Project Gate does not automate UI on emulators or physical devices.

## Validation and results

The previous Windows local candidate check recorded typecheck, lint, **25 test files / 74 tests**, build, and package smoke. The package smoke included `npm pack --dry-run`, real `npm pack`, tarball-content checks, a clean local install, isolated global-prefix install, CLI help/version/doctor/inspect/audit, and an MCP initialize handshake. Treat that as historical candidate evidence; current release readiness is tracked in [the 0.2.0 release record](RELEASE_0_2_0.md). No Ubuntu or remote CI pass is claimed here.

The test fixtures cover React/Vite, Next, Laravel, Flutter, Maven/Spring, Gradle/Kotlin/Spring, FastAPI, Django, ASP.NET, Go, Rust, Android, unknown files, internal files, and mixed modules. Regressions cover provenance, unavailable tools, mutating script modes, Go vendoring, Cargo prerequisites, repeated init, reverse imports, deadlines, cancellation, contract splitting, and selective re-verification. Browser avatar lifecycle coverage remains passing.

| Scenario | Before / reported failure | Validated result |
|---|---|---|
| Flutter | Supplied report: no language/framework/manager, no application files or baselines | Installed-package fixture: Dart, Flutter, Flutter Pub; two application files, one test; screen classification; analyze/test capabilities retained even when SDK unavailable |
| Spring | Existing heuristics needed stronger dependency and route handling | Installed-package fixture: Java/Spring/Maven; two application files, one test, literal `/api/profile` route; Maven baseline capability |
| Mixed | Exclusive-stack detection risk | Installed-package fixture: two modules, Flutter + Spring; unit fixture additionally covers React/Vite + Flutter + Spring with mobile-only baseline selection |
| Requirements | Supplied report: one criterion for multiple clauses | Four supplied clauses become four user-supplied criteria; bullets, numbered statements, and clear newline statements are tested without an LLM |

Local evidence is stored under `.projectgate/runtime/multistack-release-check.log`; the final package-only rerun is recorded in `.projectgate/runtime/multistack-package-check.log`. Runtime logs are gitignored.

## Known limitations

- Earlier validation ran on Windows/Node 22.20.0. Linux/macOS command generation is implemented; execution on those operating systems was not performed in that validation.
- That earlier validation did not execute ecosystem application suites against real repositories. Subsequent Flutter, Spring, and web dogfooding is recorded separately in [REAL_WORLD_VALIDATION.md](REAL_WORLD_VALIDATION.md).
- Route extraction is bounded static parsing. Dynamic expressions, composed prefixes, framework-specific routing DSLs, annotations outside recognized patterns, and external dependencies can remain unresolved. Source snippets are limited to 200 KB; reverse traversal is bounded to eight steps.
- Executable presence is not proof that packages, Java distributions, test libraries, devices, or cached dependencies are installed. Failures require setup outside audit. Wrapper bootstrap scripts/custom plugins are trusted repository code and can exceed lifecycle offline guarantees.
- Manifest script inspection rejects known mutations and common indirection, but does not sandbox arbitrary executable scripts. Explicit commands and wrappers require repository trust.
- Pure Dart tests require explicit configuration because `dart test` lacks Flutter's `--no-pub` flag. No platform build, native runtime verifier, emulator, device farm, or automatic dependency installer was added.
- Tests supplied as source/configuration are detected; quality-plugin execution is not claimed merely from a dependency name. No architecture rules are imposed by adapters.

## Release status

This candidate record does not determine current release readiness. See [the 0.2.0 release record](RELEASE_0_2_0.md), which supersedes the old readiness verdict. No publication is claimed here.
