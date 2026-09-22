import type { ReleasePacket } from "@projectgate/domain";
import { describe, expect, it } from "vitest";
import { formatSummary } from "./summary.js";

describe("summary classification counts", () => {
  it("shows Project Gate files separately from application files", () => {
    const text = formatSummary(packet([
      file(".projectgate/contract.yml", "PROJECT_GATE_INTERNAL", "config"),
      file(".projectgate/verification.yml", "PROJECT_GATE_INTERNAL", "config"),
    ]));
    expect(text).toContain("0 application files");
    expect(text).toContain("2 Project Gate configuration files");
    expect(text).not.toContain("unknown source files");
  });

  it("keeps an unrecognized source file visible", () => {
    const text = formatSummary(packet([file("src/main.zig", "UNKNOWN", "unknown")], ["src/main.zig"]));
    expect(text).toContain("0 application files");
    expect(text).toContain("1 unknown source files");
    expect(text).toContain("1 unresolved files");
  });
});

function file(path: string, category: string, role: string): ReleasePacket["impact"]["changedFiles"][number] {
  return { path, status: "modified", role, category, confidence: "observed", source: "test" };
}

function packet(changedFiles: ReleasePacket["impact"]["changedFiles"], unresolvedFiles: string[] = []): ReleasePacket {
  return {
    schemaVersion: 1,
    product: "Project Gate",
    runId: "run-summary",
    kind: "audit",
    generatedAt: new Date(0).toISOString(),
    change: { id: "C", title: "Change", baseRef: "HEAD", headSha: "abc", dirty: true, files: changedFiles.map((item) => item.path) },
    contractHash: "hash",
    criteria: { total: 0, verified: 0, failed: 0, unknown: 0, items: [] },
    checks: [],
    findings: [],
    resolvedFindings: [],
    findingCounts: { CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 },
    evidence: [],
    uiStates: [],
    impact: { changedFiles, surfaces: [], edges: [], unresolvedFiles },
    verdict: { state: "INCOMPLETE_EVIDENCE", verified: 0, failed: 0, unknown: 0, total: 0, reasons: [] },
    limitations: [],
    environment: "local",
  };
}