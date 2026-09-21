import type { ReleasePacket } from "@projectgate/domain";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openStore } from "./store.js";

describe("run store", () => {
  it("persists the latest packet and leaves the run file in place", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-store-"));
    const store = openStore(root);
    store.save(sample("run-a", "BLOCKED"));
    store.save(sample("run-b", "PASS"));
    expect(store.latest()?.runId).toBe("run-b");
    store.close();
    const reopened = openStore(root);
    expect(reopened.get("run-a")?.verdict.state).toBe("BLOCKED");
    expect(fs.existsSync(path.join(root, ".projectgate", "runtime", "runs", "run-a", "packet.json"))).toBe(true);
    reopened.close();
  });

  it("does not import the experimental node sqlite module", () => {
    const source = fs.readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    expect(source).not.toContain("node:sqlite");
  });
});

function sample(runId: string, verdict: ReleasePacket["verdict"]["state"]): ReleasePacket {
  return {
    schemaVersion: 1,
    product: "Project Gate",
    runId,
    kind: "audit",
    generatedAt: new Date(0).toISOString(),
    change: { id: "C", title: "Change", baseRef: "HEAD", headSha: "abc", dirty: true, files: [] },
    contractHash: "hash",
    criteria: { total: 0, verified: 0, failed: 0, unknown: 0, items: [] },
    checks: [],
    findings: [],
    resolvedFindings: [],
    findingCounts: { CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 },
    evidence: [],
    uiStates: [],
    impact: { changedFiles: [], surfaces: [], edges: [] },
    verdict: { state: verdict, verified: 0, failed: 0, unknown: 0, total: 0, reasons: [] },
    limitations: [],
    environment: "local",
  };
}
