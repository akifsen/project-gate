# Real repository validation — 0.2.0

Validation date: 2026-09-23. These are existing developer repositories, not generated fixtures. Names and absolute paths are withheld. Raw evidence is retained only in the gitignored `.projectgate/runtime/dogfood/` directory.

## Method

Windows, Node 22.23.2, Project Gate 0.2.0 candidate. Three clean local repositories were shallow-cloned into controlled directories. Original repositories were checked before and after execution; all remained clean. No source changes, commits, pushes, dependency installations, model calls, or credential copies were made in those repositories.

Each copy ran `projectgate init`, `doctor`, and `inspect --verbose --against <base>`. A local `contract --task` created two deliberately general criteria; `plan --verbose --against <base>` and `audit --against <base>` then exercised available baselines. This does not supply criterion-specific proof for the original developers' requirements. `INCOMPLETE_EVIDENCE` is therefore expected when baselines pass. Initial attempts to combine `--task` with `--from-diff` were correctly rejected; the supported `--task` flow was used.

Init changed only `.gitignore` and generated `.projectgate` configuration in the copies. Audit impact includes those configuration changes separately. Runtime evidence never becomes application code or a product surface. Source files remain accounted for even when their product-level meaning is unknown.

## Flutter application

The originally suggested legacy user directory did not exist. The same application was found under the current developer's project root. Its latest commit changed release metadata; `HEAD~2` was selected to include the preceding real implementation change, rather than testing only generated Project Gate files.

- Discovery: Dart, Flutter, Flutter Pub, `lib`/`test`, unit/widget tests; additional Python utility source was reported separately.
- Impact at audit: **63 files = 23 application + 7 test + 3 configuration + 9 Project Gate configuration + 7 documentation + 14 asset**. Five affected product surfaces; zero unresolved files. Changed Dart implementation remained APPLICATION, including editor code, instead of disappearing into configuration. Kotlin source/tests in the same diff were also classified.
- Plan: `flutter analyze --no-pub` and `flutter test --no-pub`.
- First audit: failed because a clean clone had no Dart dependency-resolution metadata. This is an environment result, not evidence that the application source is broken.
- Prepared audit: copied only the existing `package_config.json` and `package_graph.json` into the controlled clone to reference already cached packages; no `pub get` ran. Analyze passed with no issues; **363 Flutter tests passed**.
- Verdict: `INCOMPLETE_EVIDENCE` (exit 2), with passing baselines and no blocking findings; general criteria were not explicitly mapped to verification checks.
- Limitations: screen surfaces are inferred, not device runtime evidence. The mixed Android/Kotlin change has no separately executed Gradle baseline. No emulator or physical device was used.

The original discovery regression is validated as fixed against real application source. This does not claim that an installed 0.1.0 binary was rerun for a side-by-side comparison.

## Spring Boot service

A genuine local Spring Boot service was found in a nested developer project. `HEAD~1` contains four Java implementation changes and three test changes. No synthetic fallback was needed.

- Discovery: Java, Spring Boot, Maven, `src/main/java`, `src/test/java`; seven literal GET/POST endpoint surfaces and nine test files.
- Impact at audit: **17 files = 4 application + 3 test + 1 configuration + 9 Project Gate configuration**; seven affected surfaces, zero unresolved files.
- Plan/execution: `mvn --offline test`, using the installed Maven and cached dependencies. **25 tests passed**, no failures/errors/skips; Maven reported BUILD SUCCESS.
- Verdict: `INCOMPLETE_EVIDENCE` (exit 2), because baseline success is not automatically proof of the two general criteria.
- Limitations: this repository has no Maven/Gradle wrapper to execute. Wrapper selection is separately tested for Windows and Linux. Static endpoints are not live HTTP verification. Java agent warnings did not fail the test run.

## Laravel / React / Vite application

An existing local full-stack application was selected. `HEAD~1` contains a controller, two React page changes, and a feature-test change.

- Discovery: PHP, TypeScript, Laravel, React + Vite, Composer and Yarn (both npm and Yarn lockfiles exist; the current precedence selects Yarn).
- Impact at audit: **14 files = 3 application + 1 test + 1 configuration + 9 Project Gate configuration**; three affected surfaces, zero unresolved files.
- Initial plan: Artisan test, Vite build, and the package's `check` script.
- Initial execution: missing `vendor/autoload.php` and frontend dependencies prevented baseline success. No dependency installation was attempted.
- Product bug found: `yarn check` invoked Yarn Classic's built-in dependency check instead of the manifest's TypeScript script. Discovery now generates `yarn run check` (and explicit `pnpm run`), with regression coverage. Existing user configuration is preserved; the controlled copy must be refreshed to exercise newly discovered commands.
- Prepared audit: copied the existing `node_modules` and `vendor` directories into the controlled clone, without `.env` or credentials; no installation occurred. Archived only the generated verification config and reran init to exercise current discovery. The plan then contained `composer test`, `yarn run build`, and `yarn run check`.
- Execution: **Vite build passed and TypeScript check passed**. The check log explicitly records `tsc --noEmit`, proving the Yarn collision is fixed. Composer's read-only Pint step passed, then PHPStan reported **282 errors** and stopped the test chain before PHPUnit. These are findings in the target application's prepared snapshot, not a passing application test suite; no target code was changed to suppress them.
- Verdict: `BLOCKED` (exit 1), one failed baseline finding plus unmapped general criteria. This correctly preserves failed executable evidence.
- Limitations: a configured web server/browser environment is required for runtime UI proof. Discovery and source impact are validated independently of application baseline success.

## Result interpretation

Dogfood uncovered a real script-dispatch bug and confirmed the Flutter source-classification regression is fixed. Missing dependencies are reported as failed executable evidence, never a manufactured PASS. After all audits, the only tracked changes inside the copies were init's `.gitignore` additions; all original repositories remained clean. Controlled copies and detailed evidence are intentionally retained under gitignored runtime storage for local reproduction, not publication. Readiness for Project Gate itself is recorded in [RELEASE_0_2_0.md](RELEASE_0_2_0.md); the three target applications are not being certified for release.
