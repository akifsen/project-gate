# ADR 0002: Local SQLite storage and no dashboard

## Status

Accepted

## Decision

Run metadata is a JSON index plus filesystem artifacts. The human review surface is the CLI summary and a self-contained HTML report. See ADR 0007 for why this replaced `node:sqlite`.

A dashboard application would be a second product. V1 reviewers need the verdict, the findings, and the artifact files. Run history stays in the repository's `.projectgate/runtime` directory. See ADR 0007.

Packets are immutable files per run. `latest.json` is the only moving pointer.
