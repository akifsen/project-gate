# MCP

`packages/mcp` exposes the core operations as structured tools. The handlers in `handlers.ts` call `inspectProject`, `planVerification`, `audit`, `verify`, and `latestPacket`. They do not reimplement verdict or execution.

Start the stdio server after a build:

```bash
node packages/mcp/dist/server.js
```

The workspace bin name is `projectgate-mcp`.

## Tools

| Tool | Behavior |
| --- | --- |
| `projectgate.inspect_project` | Project, contract, and change. |
| `projectgate.inspect_change` | Change and impact surfaces. |
| `projectgate.create_contract` | Reads `contract.yml`, or writes `contract.proposed.yml` when `description` is set and an LLM provider is configured. |
| `projectgate.plan_verification` | Returns the plan. Does not execute it. |
| `projectgate.run_verification` | Audits and returns the verdict plus the fix packet. |
| `projectgate.reverify` | Runs stale and failed checks. |
| `projectgate.get_findings` | Fix packet for the latest run. |
| `projectgate.get_evidence` | Evidence summaries and artifact paths. |
| `projectgate.get_verdict` | Latest verdict. |
| `projectgate.get_release_packet` | Latest packet. |

Every tool accepts `cwd`. Planning, audit, and contract reads accept `contractPath` where that input exists. `run_verification` accepts `infer`.

Tool arguments are Zod objects. Results are JSON text. A `ProjectGateError` is returned as an MCP tool error so the session stays up.

## Cursor

`integrations/agents/cursor/on-stop.mjs` shells out to the CLI. On `PASS` or `PASS_WITH_HUMAN_REVIEW` it prints `{}`. Otherwise it prints a `followup_message` containing the fix packet so the agent can continue. Copy `hooks.example.json` to `.cursor/hooks.json` to enable it. The example sets `loop_limit` to 3. The hook is an adapter: the domain has no Cursor types.
