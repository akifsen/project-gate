import type { Severity } from "@projectgate/domain";
import type { AxeViolation, ExecutionContext, PlanningContext, VerificationCheck, VerificationResult, Verifier } from "@projectgate/verifier-sdk";
import { sourcePatterns, unavailable, viewportLabel } from "@projectgate/verifier-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface AccessibilityInput {
  route: string;
  viewport: { width: number; height: number };
}

const IMPACT: Record<string, Severity> = {
  critical: "CRITICAL",
  serious: "MAJOR",
  moderate: "MINOR",
  minor: "INFO",
};

export class AccessibilityVerifier implements Verifier {
  readonly id = "accessibility";
  readonly version = "1.0.0";

  supports(context: PlanningContext): boolean {
    return context.config.ui.accessibility && routes(context).length > 0;
  }

  plan(context: PlanningContext): VerificationCheck[] {
    return routes(context).flatMap((route) =>
      viewports(context).map((viewport) => ({
        id: `accessibility:${route}:${viewport.width}x${viewport.height}`,
        verifierId: this.id,
        title: `Accessibility ${viewportLabel(viewport.width)}`,
        why: `Run axe-core at ${viewport.width}x${viewport.height} on ${route}.`,
        group: "Accessibility",
        expectedEvidence: "RUNTIME" as const,
        execution: "deterministic" as const,
        severityOnFail: "MAJOR" as const,
        dependencyPatterns: sourcePatterns(context.config.ui.visualInvalidatesOn),
        reproduction: [`Open ${route} at ${viewport.width}x${viewport.height}.`, "Run axe-core."],
        suspects: context.changedFiles.filter((file) => /\.(html|tsx|jsx|vue|php|js|mjs)$/.test(file)),
        input: { route, viewport } satisfies AccessibilityInput,
      })),
    );
  }

  async execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult> {
    if (!context.browser || !context.baseUrl) return unavailable(context.browserUnavailableReason ?? "Browser runtime is not available.");
    const input = check.input as AccessibilityInput;
    const screenshot = path.join(os.tmpdir(), `pg-axe-${check.id.replace(/[^A-Za-z0-9]+/g, "_")}.png`);
    try {
      return await context.browser.withPage(input.viewport, async (page) => {
        await page.goto(new URL(input.route, context.baseUrl).toString());
        const violations = await page.runAxe();
        await page.screenshot(screenshot);
        const findings = violations.map((violation) => toFinding(check, violation, input));
        const blocking = findings.some((finding) => finding.severity === "CRITICAL" || finding.severity === "MAJOR");
        return {
          status: blocking ? "FAILED" : "PASSED",
          evidence: [
            {
              type: "axe-result",
              evidenceClass: "RUNTIME" as const,
              summary: violations.length === 0 ? `axe-core found no violations on ${input.route}.` : `axe-core found ${violations.length} violation(s) on ${input.route}.`,
              artifacts: [
                { filename: "axe.json", mediaType: "application/json", body: JSON.stringify(violations, null, 2) },
                { filename: "page.png", mediaType: "image/png", body: fs.readFileSync(screenshot) },
              ],
            },
          ],
          findings,
        };
      });
    } finally {
      fs.rmSync(screenshot, { force: true });
    }
  }
}

function toFinding(check: VerificationCheck, violation: AxeViolation, input: AccessibilityInput): VerificationResult["findings"][number] {
  const severity = IMPACT[violation.impact ?? "moderate"] ?? "MINOR";
  const target = violation.nodes[0]?.target.join(" ") ?? violation.id;
  return {
    stableKey: `${check.id}:${violation.id}`,
    severity,
    title: `${violation.id} on ${input.route}`,
    observed: violation.nodes[0]?.failureSummary ?? violation.description,
    expected: violation.help,
    actual: `${violation.id} at ${target}`,
    reproduction: [...check.reproduction, `Inspect ${target}.`],
    suspectedLocations: check.suspects,
    evidenceClass: "RUNTIME",
    reproducible: true,
    fingerprint: `${input.route}:${violation.id}`,
  };
}

function routes(context: PlanningContext): string[] {
  if (context.contract.routes.length > 0) return context.contract.routes;
  return [...new Set(context.contract.ui_states.map((state) => state.route.split("?")[0] ?? state.route))];
}

function viewports(context: PlanningContext): { width: number; height: number }[] {
  if (context.contract.responsive.length > 0) return context.contract.responsive;
  return context.config.ui.viewports;
}
