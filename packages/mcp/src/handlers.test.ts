import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { toolNames } from "./handlers.js";
import { createMcpServer } from "./server.js";

describe("mcp tools", () => {
  it("exposes the verification lifecycle as structured tools", async () => {
    expect(toolNames).toEqual([
      "projectgate.inspect_project",
      "projectgate.inspect_change",
      "projectgate.create_contract",
      "projectgate.plan_verification",
      "projectgate.run_verification",
      "projectgate.get_findings",
      "projectgate.get_evidence",
      "projectgate.reverify",
      "projectgate.get_verdict",
      "projectgate.get_release_packet",
    ]);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "projectgate-test", version: "0.0.0" });
    const server = createMcpServer();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...toolNames].sort());
    await client.close();
  });
});
