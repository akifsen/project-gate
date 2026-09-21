import { initProject } from "@projectgate/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ExecutionContext, PlanningContext, VerificationCheck, Verifier } from "@projectgate/verifier-sdk";
import { VerifierRegistry } from "@projectgate/verifier-sdk";
import { audit, verify } from "./run.js";

describe("selective re-verification", () => {
  it("reruns a failed check after the fix and carries an unrelated passing check", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-run-"));
    git(root, ["init", "-b", "main"]);
    fs.writeFileSync(path.join(root, "README.md"), "base\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "base"]);
    initProject(root, "sample");
    fs.writeFileSync(
      path.join(root, ".projectgate", "contract.yml"),
      `schema_version: 1
change:
  id: C-1
  title: Marker
intent:
  summary: The marker file must say ok.
  users_can: []
acceptance:
  - id: AC-001
    description: Marker says ok.
    required: true
    evidence: RUNTIME
ui_states: []
responsive: []
routes: []
invariants: []
fields: []
`,
    );
    fs.writeFileSync(path.join(root, "marker.txt"), "broken\n");
    const contractBefore = fs.readFileSync(path.join(root, ".projectgate", "contract.yml"));
    const verifier = new MarkerVerifier();
    const registry = new VerifierRegistry([verifier]);
    const blocked = await audit({ root, registry });
    expect(blocked.verdict.state).toBe("BLOCKED");
    expect(fs.readFileSync(path.join(root, ".projectgate", "contract.yml")).equals(contractBefore)).toBe(true);
    expect(verifier.executions).toBe(1);

    fs.writeFileSync(path.join(root, "marker.txt"), "ok\n");
    const passed = await verify({ root, registry });
    expect(passed.verdict.state).toBe("PASS");
    expect(passed.resolvedFindings.length).toBeGreaterThan(0);
    expect(verifier.executions).toBe(2);
    expect(passed.parentRunId).toBe(blocked.runId);

    fs.writeFileSync(path.join(root, "notes.txt"), "unrelated\n");
    const carried = await verify({ root, registry });
    expect(carried.verdict.state).toBe("PASS");
    expect(carried.checks[0]?.status).toBe("CARRIED");
    expect(verifier.executions).toBe(2);
  });
});

class MarkerVerifier implements Verifier {
  readonly id = "marker";
  readonly version = "1";
  executions = 0;

  supports(): boolean {
    return true;
  }

  plan(context: PlanningContext): VerificationCheck[] {
    const criterion = context.contract.acceptance[0];
    return [
      {
        id: "marker:file",
        verifierId: this.id,
        ...(criterion ? { criterionId: criterion.id, requirement: criterion.description } : {}),
        title: "Marker",
        why: "Read marker.txt.",
        group: "Marker",
        expectedEvidence: "RUNTIME",
        execution: "deterministic",
        severityOnFail: "MAJOR",
        dependencyPatterns: ["marker.txt"],
        reproduction: ["Open marker.txt"],
        suspects: ["marker.txt"],
        input: {},
      },
    ];
  }

  async execute(check: VerificationCheck, context: ExecutionContext) {
    this.executions += 1;
    const text = fs.readFileSync(path.join(context.root, "marker.txt"), "utf8");
    const ok = text.trim() === "ok";
    const evidence = [{ type: "file", evidenceClass: "RUNTIME" as const, summary: text.trim(), artifacts: [{ filename: "marker.txt", mediaType: "text/plain", body: text }] }];
    if (ok) return { status: "PASSED" as const, evidence, findings: [] };
    return {
      status: "FAILED" as const,
      evidence,
      findings: [
        {
          stableKey: "marker:broken",
          severity: "MAJOR" as const,
          title: "Marker is broken",
          requirement: check.requirement,
          observed: text.trim(),
          expected: "ok",
          actual: text.trim(),
          reproduction: check.reproduction,
          suspectedLocations: ["marker.txt"],
          evidenceClass: "RUNTIME" as const,
          reproducible: true,
          fingerprint: "marker",
        },
      ],
    };
  }
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=Project Gate Test", "-c", "user.email=test@projectgate.local", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
}
