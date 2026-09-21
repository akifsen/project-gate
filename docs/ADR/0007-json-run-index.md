# ADR 0007: JSON run index instead of node:sqlite

## Status

Accepted

## Decision

The run index is `.projectgate/runtime/index.json`. Each release packet remains a file under `.projectgate/runtime/runs/<run-id>/packet.json`. `latest.json` still points at the newest run.

`node:sqlite` emits `ExperimentalWarning: SQLite is an experimental feature` when the module is imported. That happens before any store method runs, so suppressing the warning inside `openStore` never worked, and a process-wide warning filter would hide unrelated warnings. `better-sqlite3` would remove the warning but adds a native addon, which cannot be copied between Windows and Linux `node_modules` trees.

The store interface is unchanged: `save`, `get`, `latest`, `close`. Existing packet files are still readable through `latest.json` when the new index is absent. Old `projectgate.db` files are left on disk and are not opened.
