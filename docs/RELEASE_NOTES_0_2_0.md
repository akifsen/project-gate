# Project Gate 0.2.0

Project Gate 0.2.0 expands evidence-based release checks from Node and PHP projects to mixed-stack repositories. It adds discovery and impact information for Dart/Flutter, Java/Kotlin with Maven or Gradle and Spring Boot, Python, .NET, Go, Rust, and Android projects.

The CLI reports module-specific technology and baseline information, preserves the source and confidence of detections, and uses manifest changes when deciding whether prior baseline evidence is stale. Native and mobile projects participate in discovery, impact analysis, and available baseline/test orchestration. Configured web apps can use runtime browser UI checks; Project Gate does not automate UI on emulators or physical devices.

Task text with clearly separated requirements can become separate contract criteria without a model provider. Audits do not install dependencies, and discovered commands are subject to tool readiness and known-mutator checks.

```sh
npm install -g @akifsen/project-gate
projectgate --version
projectgate doctor
```

Release hardening adds validation-only Windows and Ubuntu CI lanes, removes repository-only lifecycle scripts from the public package, and resolves CLI/MCP versions from the public manifest. Package tests cover clean local/global installation, repacking, exact versions, CLI behavior, and a real MCP initialization handshake.

Real repository dogfooding confirmed Flutter discovery and impact with passing analysis and 363 tests, and Spring Boot discovery with 25 passing offline Maven tests. A Laravel/React application exposed a Yarn built-in command collision; discovered Yarn/pnpm commands now use explicit `run`. Composer script indirection checks and TypeScript configuration invalidation were also strengthened.

These application baselines do not imply a release verdict for the target projects. See [real-world validation](REAL_WORLD_VALIDATION.md) for complete limitations and [the release record](RELEASE_0_2_0.md) for current platform gate results. Publication remains manual.
