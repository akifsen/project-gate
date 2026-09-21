import { describe, expect, it } from "vitest";
import type { LayoutMetrics } from "@projectgate/verifier-sdk";
import { issuesFromMetrics } from "./issues.js";

describe("visual issues", () => {
  it("flags horizontal overflow and ignores a comfortable target", () => {
    const issues = issuesFromMetrics(metrics({ scrollWidth: 980, clientWidth: 390 }), 24);
    expect(issues.map((issue) => issue.code)).toContain("horizontal-overflow");
    expect(issues.find((issue) => issue.code === "horizontal-overflow")?.severity).toBe("MAJOR");
  });

  it("does not invent a score when the layout fits", () => {
    expect(issuesFromMetrics(metrics({ scrollWidth: 390, clientWidth: 390 }), 24)).toEqual([]);
  });
});

function metrics(partial: Partial<LayoutMetrics>): LayoutMetrics {
  return {
    scrollWidth: 390,
    clientWidth: 390,
    scrollHeight: 800,
    clientHeight: 800,
    viewport: { width: 390, height: 844 },
    interactive: [{ tag: "button", testId: "save", x: 16, y: 16, width: 120, height: 44 }],
    textOverflow: [],
    dialogs: [],
    ...partial,
  };
}
