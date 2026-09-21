import { brief } from "@projectgate/shared";
import type { ExecutionContext, PlanningContext, VerificationCheck, VerificationResult, Verifier } from "@projectgate/verifier-sdk";
import { sourcePatterns, unavailable, viewportLabel } from "@projectgate/verifier-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { issuesFromMetrics } from "./issues.js";

interface VisualInput {
  route: string;
  viewport: { width: number; height: number };
  minTargetPx: number;
}

export class VisualVerifier implements Verifier {
  readonly id = "visual";
  readonly version = "1.0.0";

  supports(context: PlanningContext): boolean {
    return routes(context).length > 0 && viewports(context).length > 0;
  }

  plan(context: PlanningContext): VerificationCheck[] {
    const checks: VerificationCheck[] = [];
    for (const route of routes(context)) {
      for (const viewport of viewports(context)) {
        checks.push({
          id: `visual:${route}:${viewport.width}x${viewport.height}`,
          verifierId: this.id,
          title: `${viewportLabel(viewport.width)} ${route}`,
          why: `Measure layout at ${viewport.width}x${viewport.height} for overflow, clipping, and off-screen controls.`,
          group: viewportLabel(viewport.width),
          expectedEvidence: "OBSERVED",
          execution: "deterministic",
          severityOnFail: "MAJOR",
          dependencyPatterns: sourcePatterns(context.config.ui.visualInvalidatesOn),
          reproduction: [`Open ${route} at ${viewport.width}x${viewport.height}.`, "Check for horizontal overflow and controls outside the viewport."],
          suspects: context.changedFiles.filter((file) => /\.(css|scss|html|tsx|jsx|vue|js|mjs)$/.test(file)),
          input: { route, viewport, minTargetPx: context.config.ui.minTargetPx } satisfies VisualInput,
        });
      }
    }
    return checks;
  }

  async execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult> {
    if (!context.browser || !context.baseUrl) return unavailable(context.browserUnavailableReason ?? "Browser runtime is not available.");
    const input = check.input as VisualInput;
    const screenshot = path.join(os.tmpdir(), `pg-visual-${check.id.replace(/[^A-Za-z0-9]+/g, "_")}.png`);
    try {
      return await context.browser.withPage(input.viewport, async (page) => {
        await page.goto(new URL(input.route, context.baseUrl).toString());
        const metrics = await page.layoutMetrics();
        await page.screenshot(screenshot);
        const shot = fs.readFileSync(screenshot);
        const issues = issuesFromMetrics(metrics, input.minTargetPx);
        const evidence = [
          {
            type: "screenshot",
            evidenceClass: "OBSERVED" as const,
            summary: issues.length === 0 ? `No objective layout issues at ${input.viewport.width}x${input.viewport.height}.` : issues.map((issue) => issue.detail).join(" "),
            artifacts: [
              { filename: "page.png", mediaType: "image/png", body: shot },
              { filename: "metrics.json", mediaType: "application/json", body: JSON.stringify({ metrics, issues }, null, 2) },
            ],
          },
        ];
        if (issues.length === 0) return { status: "PASSED" as const, evidence, findings: [] };
        const blocking = issues.some((issue) => issue.severity === "CRITICAL" || issue.severity === "MAJOR");
        return {
          status: blocking ? "FAILED" : "PASSED",
          evidence,
          findings: issues.map((issue) => ({
            stableKey: `${check.id}:${issue.code}`,
            severity: issue.severity,
            title: `${issue.code} at ${input.viewport.width}x${input.viewport.height}`,
            observed: brief(issue.detail),
            expected: "The page fits the viewport without clipped or off-screen interactive content.",
            actual: issue.detail,
            reproduction: check.reproduction,
            suspectedLocations: check.suspects,
            evidenceClass: "OBSERVED" as const,
            reproducible: true,
            fingerprint: `${input.route}:${input.viewport.width}:${issue.code}`,
          })),
        };
      });
    } finally {
      fs.rmSync(screenshot, { force: true });
    }
  }
}

function routes(context: PlanningContext): string[] {
  if (context.contract.routes.length > 0) return context.contract.routes;
  return [...new Set(context.contract.ui_states.map((state) => state.route.split("?")[0] ?? state.route))];
}

function viewports(context: PlanningContext): { width: number; height: number }[] {
  if (context.contract.responsive.length > 0) return context.contract.responsive;
  return context.config.ui.viewports;
}

export { issuesFromMetrics } from "./issues.js";
