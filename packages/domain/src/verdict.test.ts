import { describe, expect, it } from "vitest";
import { computeVerdict, evaluateCriterion } from "./verdict.js";
import { dependencySnapshotChanged, evidenceSatisfies } from "./vocabulary.js";

describe("evidence sufficiency", () => {
  it("ranks runtime observation above inference", () => {
    expect(evidenceSatisfies("OBSERVED", "RUNTIME")).toBe(true);
    expect(evidenceSatisfies("RUNTIME", "RUNTIME")).toBe(true);
    expect(evidenceSatisfies("EXECUTABLE", "RUNTIME")).toBe(false);
    expect(evidenceSatisfies("INFERRED", "STATIC")).toBe(false);
    expect(evidenceSatisfies("STATIC", "INFERRED")).toBe(true);
  });
});

describe("criterion evaluation", () => {
  it("does not verify a criterion from inferred evidence", () => {
    const result = evaluateCriterion({
      id: "AC-1",
      required: true,
      requiredEvidence: "RUNTIME",
      checks: [{ status: "PASSED", evidenceClass: "INFERRED" }],
    });
    expect(result.state).toBe("UNKNOWN");
  });

  it("verifies when a runtime check passes", () => {
    const result = evaluateCriterion({
      id: "AC-1",
      required: true,
      requiredEvidence: "RUNTIME",
      checks: [{ status: "PASSED", evidenceClass: "RUNTIME" }],
    });
    expect(result.state).toBe("VERIFIED");
  });

  it("fails when any linked check fails", () => {
    const result = evaluateCriterion({
      id: "AC-1",
      required: true,
      requiredEvidence: "RUNTIME",
      checks: [
        { status: "PASSED", evidenceClass: "RUNTIME" },
        { status: "FAILED", evidenceClass: "RUNTIME" },
      ],
    });
    expect(result.state).toBe("FAILED");
  });
});

describe("verdict", () => {
  it("blocks on major findings and failed criteria", () => {
    const verdict = computeVerdict({
      criteria: [{ id: "AC-1", required: true, state: "FAILED", reason: "failed" }],
      openFindings: [{ severity: "MAJOR" }],
      humanReviewRequired: false,
    });
    expect(verdict.state).toBe("BLOCKED");
  });

  it("returns incomplete evidence when a required criterion is unknown", () => {
    const verdict = computeVerdict({
      criteria: [{ id: "AC-1", required: true, state: "UNKNOWN", reason: "missing" }],
      openFindings: [],
      humanReviewRequired: false,
    });
    expect(verdict.state).toBe("INCOMPLETE_EVIDENCE");
    expect(verdict.unknown).toBe(1);
  });

  it("passes only when required criteria are verified", () => {
    const verdict = computeVerdict({
      criteria: [
        { id: "AC-1", required: true, state: "VERIFIED", reason: "ok" },
        { id: "INV-1", required: false, state: "UNKNOWN", reason: "advisory" },
      ],
      openFindings: [{ severity: "MINOR" }],
      humanReviewRequired: false,
    });
    expect(verdict.state).toBe("PASS");
    expect(verdict.verified).toBe(1);
  });

  it("asks for human review when policy says so and nothing blocks", () => {
    const verdict = computeVerdict({
      criteria: [{ id: "AC-1", required: true, state: "VERIFIED", reason: "ok" }],
      openFindings: [],
      humanReviewRequired: true,
    });
    expect(verdict.state).toBe("PASS_WITH_HUMAN_REVIEW");
  });
});

describe("dependency snapshots", () => {
  it("treats an empty snapshot as stale", () => {
    expect(dependencySnapshotChanged([], [{ path: "a.ts", hash: "1" }])).toBe(true);
  });

  it("detects content changes and ignores identical snapshots", () => {
    const previous = [{ path: "a.ts", hash: "1" }];
    expect(dependencySnapshotChanged(previous, [{ path: "a.ts", hash: "1" }])).toBe(false);
    expect(dependencySnapshotChanged(previous, [{ path: "a.ts", hash: "2" }])).toBe(true);
    expect(dependencySnapshotChanged(previous, [])).toBe(true);
  });
});
