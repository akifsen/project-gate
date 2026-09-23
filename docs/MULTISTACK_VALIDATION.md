# Multi-stack discovery validation — 0.2.0 candidate

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

| Technology | Discovery | Classification | Baseline | Surfaces / boundaries |
|---|---|---|---|---|
| Node / JS / TS | Yes; npm/pnpm/yarn/bun | Yes | Existing recognized scripts; readiness and known-mutator checks | Static HTTP and router patterns |
| React / Vite / Next / Vue / Nuxt / Svelte / Angular | Manifest/config signals | Yes, including Svelte | Existing scripts only | Partial; React/Next route patterns, inferred UI components |
| PHP / Laravel | Yes | Yes | Composer, Artisan, existing PHPUnit/Pest | Literal routes with distinct HTTP verbs; dynamic groups limited |
| Dart / Flutter | Confirmed Flutter SDK dependency | Yes; generated/test/screen files | Flutter analyze/test with `--no-pub`; Dart analyze | Inferred mobile screens and literal navigation paths; no native UI automation |
| Java / Kotlin / Spring Boot | Maven/Gradle manifests, wrappers, Spring signals | Yes | Offline test; verify/check surfaced as optional capabilities | Literal Spring mappings; explicit import relationships; dynamic mappings unresolved |
| Android | Android Gradle plugin/manifest signals | Yes | Unit test discovery; instrumentation is not auto-started | No emulator/device surface verification |
| Python / Django / FastAPI / Flask | Common manifests/configuration | Yes | Configured pytest/Django/unittest and available lint tools | Partial literal decorators/URL patterns |
| .NET / C# / F# / ASP.NET | Project/solution metadata | Yes | Build or test with `--no-restore` | Partial controller/minimal API mappings |
| Go | Module/source detection | Yes | Test/vet using cached or vendored modules; downloads disabled | Common literal HTTP mappings; inferred CLI entry |
| Rust | Cargo/source detection | Yes | Offline/locked test; lockfile required; optional capability reporting | Inferred CLI entry in profile; no Rust HTTP/public API parser |
| Unsupported source | Explicit unknown | Preserved, including deletions | Explicit configured commands remain usable | No invented mapping |
| Project Gate internals | Explicit internal category | Preserved separately | Not application evidence | No product surfaces |

## Validation and results

`npm run release:check` passed: typecheck, lint, **25 test files / 74 tests**, and package smoke. `npm run build` also passed. Package smoke includes `npm pack --dry-run`, real `npm pack`, tarball-content checks, a clean local install, isolated global-prefix install, CLI help/version/doctor/inspect/audit, and an MCP initialize handshake. The expected missing-runtime audit returns `INCOMPLETE_EVIDENCE` rather than a fake pass.

The test fixtures cover React/Vite, Next, Laravel, Flutter, Maven/Spring, Gradle/Kotlin/Spring, FastAPI, Django, ASP.NET, Go, Rust, Android, unknown files, internal files, and mixed modules. Regressions cover provenance, unavailable tools, mutating script modes, Go vendoring, Cargo prerequisites, repeated init, reverse imports, deadlines, cancellation, contract splitting, and selective re-verification. Browser avatar lifecycle coverage remains passing.

| Scenario | Before / reported failure | Validated result |
|---|---|---|
| Flutter | Supplied report: no language/framework/manager, no application files or baselines | Installed-package fixture: Dart, Flutter, Flutter Pub; two application files, one test; screen classification; analyze/test capabilities retained even when SDK unavailable |
| Spring | Existing heuristics needed stronger dependency and route handling | Installed-package fixture: Java/Spring/Maven; two application files, one test, literal `/api/profile` route; Maven baseline capability |
| Mixed | Exclusive-stack detection risk | Installed-package fixture: two modules, Flutter + Spring; unit fixture additionally covers React/Vite + Flutter + Spring with mobile-only baseline selection |
| Requirements | Supplied report: one criterion for multiple clauses | Four supplied clauses become four user-supplied criteria; bullets, numbered statements, and clear newline statements are tested without an LLM |

Local evidence is stored under `.projectgate/runtime/multistack-release-check.log`; the final package-only rerun is recorded in `.projectgate/runtime/multistack-package-check.log`. Runtime logs are gitignored.

## JEV review

JEV was used with explicit permission to send limited code/test evidence. Its initial selected-diff review requested escalation due to low confidence and broad scope; this was not presented as approval. A separate focused code review identified concrete issues in Windows termination, Go vendoring, Rust lockfiles, Laravel method identity, reverse-scan reads, Dart self-package imports, and indirect script checks. Those issues were corrected and covered by subsequent checks.

JEV verified the recorded test/package/module/version claims against the release log. The evidence explicitly does **not** prove native Flutter widget execution or real Spring/Maven execution. JEV was not added as a runtime dependency, and no LLM is required for discovery or baseline planning.

## Known limitations

- Validation ran on Windows/Node 22.20.0. Linux/macOS command generation is implemented; execution on those operating systems was not performed here.
- Flutter, Maven, Gradle, Python, .NET, Go, and Cargo application suites were not executed against production repositories. This task validates realistic discovery fixtures and Project Gate's orchestration, not native SDK correctness.
- Route extraction is bounded static parsing. Dynamic expressions, composed prefixes, framework-specific routing DSLs, annotations outside recognized patterns, and external dependencies can remain unresolved. Source snippets are limited to 200 KB; reverse traversal is bounded to eight steps.
- Executable presence is not proof that packages, Java distributions, test libraries, devices, or cached dependencies are installed. Failures require setup outside audit. Wrapper bootstrap scripts/custom plugins are trusted repository code and can exceed lifecycle offline guarantees.
- Manifest script inspection rejects known mutations and common indirection, but does not sandbox arbitrary executable scripts. Explicit commands and wrappers require repository trust.
- Pure Dart tests require explicit configuration because `dart test` lacks Flutter's `--no-pub` flag. No platform build, native runtime verifier, emulator, device farm, or automatic dependency installer was added.
- Tests supplied as source/configuration are detected; quality-plugin execution is not claimed merely from a dependency name. No architecture rules are imposed by adapters.

## Release recommendation

The registry reported `@akifsen/project-gate` **0.1.0** during validation. The checkout already prepared **0.2.0**; retain that minor release candidate for this feature expansion. No additional version bump or publication was performed.

## Verdict

READY FOR NEXT RELEASE
