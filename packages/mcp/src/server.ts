import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { product, ProjectGateError } from "@projectgate/shared";
import { z, type ZodTypeAny } from "zod";
import { callTool, type toolNames, type ToolResult } from "./handlers.js";

const cwd = z.string().optional().describe("Repository root. Defaults to the current working directory.");
const contractPath = z.string().optional().describe("Change contract path, relative to the repository root.");
const against = z.string().optional().describe("Git ref to compare. Defaults to the repository base detection.");

const tools: { name: (typeof toolNames)[number]; description: string; inputSchema: Record<string, ZodTypeAny> }[] = [
  {
    name: "projectgate.inspect_project",
    description: "Read the project configuration, change contract, and current git change.",
    inputSchema: { cwd, against },
  },
  {
    name: "projectgate.inspect_change",
    description: "Return the current change and its impact surfaces.",
    inputSchema: { cwd, against },
  },
  {
    name: "projectgate.create_contract",
    description: "Create or read the active change contract. task, fromFile, and fromDiff write contract.yml. description writes an inactive proposal when a model is configured.",
    inputSchema: {
      cwd,
      description: z.string().optional().describe("Requirement text for an inactive proposal. Requires an LLM provider."),
      task: z.string().optional().describe("Create the active contract from this description."),
      fromFile: z.string().optional().describe("Create the active contract from a requirement file."),
      fromDiff: z.boolean().optional().describe("Infer an active contract from the git diff. Criteria are marked INFERRED."),
      replace: z.boolean().optional().describe("Overwrite an existing active contract."),
      against: z.string().optional().describe("Git ref used with fromDiff."),
    },
  },
  {
    name: "projectgate.plan_verification",
    description: "Build a verification plan for the current change. Does not execute checks or start the application.",
    inputSchema: { cwd, against, contractPath },
  },
  {
    name: "projectgate.run_verification",
    description: "Audit the current change and return the verdict plus a concise fix packet.",
    inputSchema: { cwd, against, contractPath, infer: z.boolean().optional().describe("Add inferred impact edges when an LLM provider is configured.") },
  },
  {
    name: "projectgate.get_findings",
    description: "Return the concise fix packet for the latest run.",
    inputSchema: { cwd },
  },
  {
    name: "projectgate.get_evidence",
    description: "Return evidence summaries and artifact locations for the latest run.",
    inputSchema: { cwd },
  },
  {
    name: "projectgate.reverify",
    description: "Re-run stale or previously failed checks from the latest run.",
    inputSchema: { cwd, contractPath },
  },
  {
    name: "projectgate.get_verdict",
    description: "Return the verdict of the latest run.",
    inputSchema: { cwd },
  },
  {
    name: "projectgate.get_release_packet",
    description: "Return the latest release packet.",
    inputSchema: { cwd },
  },
];

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: product.codename, version: product.version });
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args) => {
      try {
        const result: ToolResult = await callTool(tool.name, args as Record<string, unknown>);
        return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
      } catch (error) {
        const message = error instanceof ProjectGateError || error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    });
  }
  return server;
}

export async function serveStdio(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
