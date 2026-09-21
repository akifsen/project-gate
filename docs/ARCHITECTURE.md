# Architecture

Project Gate is one Node.js process. The CLI, MCP server, and Cursor stop hook are adapters over `packages/core`. Verifiers do not import those adapters.

```text
packages/cli  packages/mcp  integrations/agents
                    │
              packages/core
                    │
     config  contracts  impact-engine  evidence  report
                    │
              verifier-sdk
                    │
     shell  api  architecture  playwright  visual  accessibility
                    │
              verifiers/browser
```

`packages/domain` holds verdict rules, evidence classes, and release-packet records. `packages/shared` holds the product name, exit codes, redaction, hashing, and process execution.

## Run lifecycle

1. Load `.projectgate/*.yml` and the change contract.
2. Collect the git diff, including untracked files. Runtime artifacts, dependencies, and secret-like paths are excluded.
3. Classify files, read relative imports, extract routes, and record test-proximity edges as inferred.
4. Ask each supporting verifier for checks. Planning does not start the app.
5. On verify, carry a previous pass only when the contract hash is unchanged, the dependency pattern list is unchanged, the prior status was `PASSED` or `CARRIED`, and the file hashes still match.
6. Start the configured local app only when a pending check needs HTTP or a browser. Start failure is recorded as a limitation; affected checks become `UNKNOWN`.
7. Normalize results. A blocking finding turns a pass into a failure. A failure without a finding gets a synthesized finding. A pass with no evidence becomes `UNKNOWN`.
8. Compute the verdict, reconcile findings against the previous run, and write the packet, HTML report, and fix packet.

## Local storage

SQLite (`node:sqlite`) stores one `runs` table and a latest-run pointer at `.projectgate/runtime/projectgate.db`. Screenshots, logs, and the packet files live under `.projectgate/runtime/runs/<run-id>/`. That directory is gitignored.

## LLM boundary

`packages/model` is an OpenAI-compatible chat client configured by environment variables. It is used only for optional contract proposal and optional impact inference (`--infer`). Invalid model JSON is ignored. Default audit does not call a model.

## Why this shape

npm workspaces are used because corepack could not install pnpm on this machine. See `docs/ADR/0001-npm-workspaces.md`. There is no dashboard app. See `docs/ADR/0002-local-storage-and-no-dashboard.md`.
