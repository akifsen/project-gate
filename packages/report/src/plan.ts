import type { EvidenceClass } from "@projectgate/domain";
import { product } from "@projectgate/shared";

export interface PlanCheck {
  id: string;
  verifierId: string;
  title: string;
  why: string;
  group: string;
  expectedEvidence: string;
  criterionId?: string | null;
}

export function formatPlan(checks: readonly PlanCheck[], verbose = false): string {
  const sections: { title: string; lines: string[] }[] = [
    { title: "Baseline", lines: [] },
    { title: "Change-specific", lines: [] },
    { title: "Runtime", lines: [] },
    { title: "Architecture", lines: [] },
    { title: "Other", lines: [] },
  ];
  for (const check of checks) {
    const section = sections.find((item) => item.title === categoryOf(check)) ?? sections[4];
    section?.lines.push(`  ${check.title}${verbose ? ` — ${check.why}` : ""}`);
  }
  const lines = [`${product.name}`, "", "Verification Plan", ""];
  for (const section of sections) {
    if (section.lines.length === 0) continue;
    lines.push(section.title, ...section.lines, "");
  }
  if (checks.length === 0) lines.push("No checks planned.", "");
  lines.push(`Total checks: ${checks.length}`);
  return lines.join("\n");
}

function categoryOf(check: PlanCheck): string {
  if (check.verifierId === "architecture") return "Architecture";
  if (check.verifierId === "playwright" || check.verifierId === "visual" || check.verifierId === "accessibility") return "Runtime";
  if (check.verifierId === "api" || check.criterionId) return "Change-specific";
  if (check.verifierId === "shell") return "Baseline";
  if (check.expectedEvidence === ("RUNTIME" satisfies EvidenceClass)) return "Runtime";
  return "Other";
}
