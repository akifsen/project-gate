import { describe, expect, it } from "vitest";
import type { ExecutionContext, PlanningContext, VerificationCheck } from "@projectgate/verifier-sdk";
import { ShellVerifier } from "./index.js";

describe("shell verifier", () => {
  const verifier = new ShellVerifier();

  it("passes and fails real commands", async () => {
    const passed = await verifier.execute(check(["-e", "process.exit(0)"]), context());
    expect(passed.status).toBe("PASSED");
    expect(passed.evidence[0]?.evidenceClass).toBe("EXECUTABLE");
    const failed = await verifier.execute(check(["-e", "process.exit(2)"]), context());
    expect(failed.status).toBe("FAILED");
    expect(failed.findings[0]?.severity).toBe("MAJOR");
    expect(failed.findings[0]?.observed).not.toMatch(/AKIA/);
  });

  it("plans one check per configured command", () => {
    const checks = verifier.plan({
      root: process.cwd(),
      changedFiles: [],
      contract: { acceptance: [] } as unknown as PlanningContext["contract"],
      config: {
        commands: [
          {
            id: "unit",
            title: "Unit tests",
            command: "node",
            args: ["--test"],
            invalidatesOn: ["src/**"],
            evidence: "EXECUTABLE",
            group: "Unit tests",
          },
        ],
      } as PlanningContext["config"],
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]?.dependencyPatterns).toEqual(["src/**"]);
  });
});

function check(args: string[]): VerificationCheck {
  return {
    id: "shell:node",
    verifierId: "shell",
    title: "node",
    why: "test",
    group: "node",
    expectedEvidence: "EXECUTABLE",
    execution: "deterministic",
    severityOnFail: "MAJOR",
    dependencyPatterns: ["package.json"],
    reproduction: ["node"],
    suspects: [],
    input: { command: process.execPath, args },
  };
}

function context(): ExecutionContext {
  return {
    root: process.cwd(),
    runDir: process.cwd(),
    config: { architecture: { layers: [], forbiddenEdges: [], rules: [] } } as unknown as ExecutionContext["config"],
    environmentName: "test",
    changeId: "C",
    now: () => new Date(0),
    browser: null,
    timeouts: { commandMs: 15_000, httpMs: 5_000, browserMs: 5_000 },
    redact: true,
  };
}
