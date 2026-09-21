# ADR 0002: Local SQLite storage and no dashboard

## Status

Accepted

## Decision

Run metadata is one SQLite `runs` table plus filesystem artifacts. The human review surface is the CLI summary and a self-contained HTML report.

A dashboard application would be a second product. V1 reviewers need the verdict, the findings, and the artifact files. SQLite is used because run history is relational enough to load the latest packet and small enough to avoid a server. `node:sqlite` is experimental in Node 24; the store suppresses that specific warning.

Packets are immutable files per run. `latest.json` is the only moving pointer.
