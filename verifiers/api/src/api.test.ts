import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import type { ExecutionContext, VerificationCheck } from "@projectgate/verifier-sdk";
import { ApiVerifier } from "./index.js";

describe("api verifier", () => {
  it("captures a real HTTP status mismatch", async () => {
    const server = await listen((status) => status);
    const verifier = new ApiVerifier();
    const result = await verifier.execute(apiCheck("/missing", 200), context(server.url));
    expect(result.status).toBe("FAILED");
    expect(result.evidence[0]?.evidenceClass).toBe("RUNTIME");
    expect(result.findings[0]?.actual).toContain("404");
    await server.close();
  });
});

function apiCheck(path: string, status: number): VerificationCheck {
  return {
    id: "api:test",
    verifierId: "api",
    title: "status",
    why: "test",
    group: "API",
    expectedEvidence: "RUNTIME",
    execution: "deterministic",
    severityOnFail: "MAJOR",
    dependencyPatterns: [],
    reproduction: ["GET"],
    suspects: [],
    input: {
      verifier: "api",
      title: "status",
      request: { method: "GET", path },
      expect: { status },
      dependencies: [],
      suspects: [],
    },
  };
}

function context(baseUrl: string): ExecutionContext {
  return {
    root: process.cwd(),
    runDir: process.cwd(),
    config: { architecture: { layers: [], forbiddenEdges: [], rules: [] } } as unknown as ExecutionContext["config"],
    baseUrl,
    environmentName: "test",
    changeId: "C",
    now: () => new Date(0),
    browser: null,
    timeouts: { commandMs: 5_000, httpMs: 5_000, browserMs: 5_000 },
    redact: true,
  };
}

function listen(handler: (status: number) => number): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(handler(404));
    response.end("missing");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
