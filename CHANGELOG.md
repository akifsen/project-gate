# Changelog

## 0.2.0

Discovery is now a set of technology adapters instead of a Node/PHP-only scan. A repository can contain more than one stack, and Project Gate reports each module separately.

- Dart/Flutter, Java with Maven or Gradle, Spring Boot, Python, .NET, Go, Rust, and Android are detected from their own manifests
- Changed source files stay in one category: application, test, configuration, documentation, asset, generated, Project Gate internal, or unknown
- Flutter baseline planning is `flutter analyze` and `flutter test` when the SDK is available. Platform builds are not started automatically
- Spring mappings, Laravel routes, and the existing Node route extractors become product surfaces. A class is not a surface by itself
- Clearly separated task text becomes multiple user-supplied criteria. One sentence stays one criterion. No model provider is required
- Module commands run only when the change overlaps that module. Audit does not install dependencies

## 0.1.0

First public release of `@akifsen/project-gate`.

- CLI for init, doctor, inspect, change contracts, verification planning, audit, selective verify, and reports
- Evidence-based verdicts: pass only when the required evidence exists
- Shell, API, architecture, Playwright, accessibility, and visual verifiers
- Local JSON run history and release packets, including an agent fix packet
- stdio MCP server (`projectgate-mcp`) using the same application services as the CLI
- Windows and other Node.js 22.18+ environments
