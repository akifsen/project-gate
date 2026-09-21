# Product

Project Gate is a local Definition-of-Done and release-evidence engine for AI-built web software. It answers whether a change is actually complete.

It is not a coding agent, a test generator, a Playwright replacement, a SonarQube clone, a review chatbot, or a numeric quality score.

## Pipeline

```text
requirement
  → change contract
  → code change
  → impact
  → verification plan
  → verifiers
  → evidence
  → findings
  → verdict
```

The verdict is one of `PASS`, `PASS_WITH_HUMAN_REVIEW`, `BLOCKED`, or `INCOMPLETE_EVIDENCE`.

## Principles that the implementation enforces

- A required criterion passes only when a linked check passed and its evidence class is strong enough.
- `INFERRED` evidence never satisfies a stronger requirement. An LLM result cannot become a pass by itself.
- `UNKNOWN` is a real outcome. A missing browser, a failed application start, or a criterion with no check becomes incomplete evidence rather than a pass.
- The auditor does not edit `contract.yml`. Contract proposals are written to `contract.proposed.yml` and stay inactive.
- Verifiers do not modify application source.
- A file change invalidates evidence whose recorded dependency hashes changed. An empty dependency snapshot is always stale.
- Failures carry reproduction steps, expected and actual behavior, evidence paths, and suspected files.

## V1 scope

Web applications. First useful targets are React, Next.js, Laravel, shell commands, HTTP APIs, and browser apps. Those stacks are adapters and path heuristics, not a hardcoded core.

V1 does not include hosted runners, billing, SSO, organization administration, native mobile or desktop testing, autonomous code repair, a custom browser, a custom accessibility engine, or a dashboard application. The human-readable review surface is the HTML release report.
