import type { LayoutMetrics } from "@projectgate/verifier-sdk";
import type { Severity } from "@projectgate/domain";

export interface LayoutIssue {
  code: "horizontal-overflow" | "off-screen-interactive" | "tiny-target" | "text-overflow" | "broken-modal-bounds";
  severity: Severity;
  detail: string;
}

export function issuesFromMetrics(metrics: LayoutMetrics, minTargetPx: number): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  if (metrics.scrollWidth > metrics.clientWidth + 1) {
    issues.push({
      code: "horizontal-overflow",
      severity: "MAJOR",
      detail: `Document scrollWidth ${metrics.scrollWidth}px exceeds clientWidth ${metrics.clientWidth}px.`,
    });
  }
  for (const element of metrics.interactive) {
    if (element.width === 0 || element.height === 0) continue;
    const label = element.testId ?? element.tag;
    const offscreen =
      element.x + element.width < 0 ||
      element.y + element.height < 0 ||
      element.x > metrics.viewport.width ||
      element.y > metrics.viewport.height;
    if (offscreen) {
      issues.push({
        code: "off-screen-interactive",
        severity: "MAJOR",
        detail: `${label} is outside the ${metrics.viewport.width}x${metrics.viewport.height} viewport at ${Math.round(element.x)},${Math.round(element.y)}.`,
      });
      continue;
    }
    if (element.width < minTargetPx || element.height < minTargetPx) {
      issues.push({
        code: "tiny-target",
        severity: "MINOR",
        detail: `${label} is ${Math.round(element.width)}x${Math.round(element.height)}px, below ${minTargetPx}px.`,
      });
    }
  }
  for (const text of metrics.textOverflow) {
    issues.push({ code: "text-overflow", severity: "MINOR", detail: `Clipped text${text.testId ? ` in ${text.testId}` : ""}: ${text.text}` });
  }
  for (const dialog of metrics.dialogs) {
    if (!dialog.off) continue;
    issues.push({
      code: "broken-modal-bounds",
      severity: "MAJOR",
      detail: `Dialog ${dialog.testId ?? ""} is outside the viewport.`,
    });
  }
  return issues;
}
