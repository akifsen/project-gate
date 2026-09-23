# Project Gate v0.2.0

## Highlights

- Multi-stack repository and module discovery, including Dart/Flutter, Java/Kotlin, Spring Boot, Maven/Gradle, Python, .NET, Go, Rust, and Android, alongside Node and PHP.
- Improved application/test classification, detection provenance, product surfaces, and manifest-based evidence invalidation. Unknown files remain accounted for.
- Clearly separated task requirements become separate contract criteria without a model provider.
- Windows and Ubuntu / Node 22 hosted release validation, clean tarball installation/repacking, exact CLI/MCP versions, and an actual MCP initialization handshake.
- Public package lifecycle/version hardening, explicit Yarn/pnpm script dispatch, and stronger Composer script safety checks.

Real repository validation passed Flutter analysis and 363 tests, and 25 offline Spring Boot/Maven tests. A Laravel/React build and TypeScript check passed; its PHPStan failures correctly blocked the application audit. Hosted platform evidence is recorded for commit `9c3b6ce9e300eea56faa5682910ac42d5c987c52` ([workflow run](https://github.com/akifsen/project-gate/actions/runs/35841504166)).

## Installation

```sh
npm install -g @akifsen/project-gate@0.2.0
```

## Verification

```sh
projectgate --version
projectgate doctor
```

## Known limitations

Native device UI automation is not provided. Static route extraction is partial, and dependencies must be prepared outside audit. Custom scripts and wrappers require repository trust. Passing baselines alone do not prove application acceptance criteria: the real web application was correctly blocked by its PHPStan failures.

See [real-world validation](REAL_WORLD_VALIDATION.md) and [the release record](RELEASE_0_2_0.md) for the complete evidence. Publication remains a human action.
