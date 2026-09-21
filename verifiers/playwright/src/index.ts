import type { BrowserStep } from "@projectgate/contracts";
import { brief } from "@projectgate/shared";
import type { ExecutionContext, ManagedPage, PlanningContext, VerificationCheck, VerificationResult, Verifier } from "@projectgate/verifier-sdk";
import { sourcePatterns, unavailable } from "@projectgate/verifier-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface BrowserCheckInput {
  steps: BrowserStep[];
  viewport: { width: number; height: number };
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export class PlaywrightVerifier implements Verifier {
  readonly id = "playwright";
  readonly version = "1.0.0";

  supports(context: PlanningContext): boolean {
    return browserChecks(context).length > 0;
  }

  plan(context: PlanningContext): VerificationCheck[] {
    return browserChecks(context);
  }

  async execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult> {
    if (!context.browser || !context.baseUrl) return unavailable(context.browserUnavailableReason ?? "Browser runtime is not available.");
    const input = check.input as BrowserCheckInput;
    const screenshot = path.join(os.tmpdir(), `pg-pw-${check.id.replace(/[^A-Za-z0-9]+/g, "_")}.png`);
    try {
      return await context.browser.withPage(input.viewport, async (page) => {
        try {
          for (const step of input.steps) await runStep(page, step, context.baseUrl ?? "", context.timeouts.browserMs);
          await page.screenshot(screenshot);
          const evidence = evidenceFor(page, screenshot, `Completed ${check.title}.`);
          if (page.pageErrors().length > 0) {
            return {
              status: "FAILED",
              evidence,
              findings: [
                finding(check, "Page error", page.pageErrors().join("\n"), "No uncaught page errors.", page.pageErrors()[0] ?? "page error"),
              ],
            };
          }
          return { status: "PASSED", evidence, findings: [] };
        } catch (error) {
          await page.screenshot(screenshot).catch(() => undefined);
          const message = error instanceof Error ? error.message : String(error);
          return {
            status: "FAILED",
            evidence: evidenceFor(page, screenshot, message),
            findings: [finding(check, check.title, message, check.requirement ?? check.title, message)],
          };
        }
      });
    } finally {
      fs.rmSync(screenshot, { force: true });
    }
  }
}

async function runStep(page: ManagedPage, step: BrowserStep, baseUrl: string, timeoutMs: number): Promise<void> {
  switch (step.action) {
    case "goto":
      await page.goto(new URL(step.value, baseUrl).toString());
      return;
    case "reload":
      await page.reload();
      return;
    case "click":
      await page.click(step.selector);
      return;
    case "fill":
      await page.fill(step.selector, step.value);
      return;
    case "upload":
      await page.setInputFiles(step.selector, {
        name: step.filename,
        mimeType: step.content_type,
        buffer: step.bytes ? Buffer.alloc(step.bytes, 1) : TINY_PNG,
      });
      return;
    case "assert_visible":
      await page.waitForVisible(step.selector, timeoutMs);
      return;
    case "assert_hidden":
      if (await page.isVisible(step.selector)) throw new Error(`${step.selector} is visible.`);
      return;
    case "assert_present":
      if ((await page.count(step.selector)) < 1) throw new Error(`${step.selector} is not in the document.`);
      return;
    case "assert_text": {
      const text = (await page.textContent(step.selector)) ?? "";
      if (!text.includes(step.value)) throw new Error(`${step.selector} text did not include ${step.value}. Actual: ${text}`);
      return;
    }
    case "assert_image_loaded":
      if (!(await page.imageLoaded(step.selector))) throw new Error(`${step.selector} did not load a persisted image.`);
      return;
    default: {
      const unknown: never = step;
      throw new Error(`Unsupported browser step ${JSON.stringify(unknown)}`);
    }
  }
}

function evidenceFor(page: ManagedPage, screenshot: string, summary: string): VerificationResult["evidence"] {
  const artifacts: VerificationResult["evidence"][number]["artifacts"] = [
    { filename: "console.json", mediaType: "application/json", body: JSON.stringify(page.consoleMessages(), null, 2) },
    { filename: "network.json", mediaType: "application/json", body: JSON.stringify(page.networkEvents(), null, 2) },
  ];
  if (fs.existsSync(screenshot)) artifacts.unshift({ filename: "page.png", mediaType: "image/png", body: fs.readFileSync(screenshot) });
  return [{ type: "browser-observation", evidenceClass: "RUNTIME", summary: brief(summary, 300), artifacts }];
}

function finding(check: VerificationCheck, title: string, observed: string, expected: string, actual: string): VerificationResult["findings"][number] {
  return {
    stableKey: `${check.id}:${actual.slice(0, 120)}`,
    severity: check.severityOnFail,
    title,
    ...(check.requirement ? { requirement: check.requirement } : {}),
    observed: brief(observed),
    expected,
    actual: brief(actual),
    reproduction: check.reproduction,
    suspectedLocations: check.suspects,
    evidenceClass: "RUNTIME",
    reproducible: true,
    fingerprint: `${check.id}:${actual.slice(0, 80)}`,
  };
}

function browserChecks(context: PlanningContext): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  const viewport = context.contract.responsive[0] ?? context.config.ui.viewports[0] ?? { width: 1440, height: 900 };
  for (const criterion of context.contract.acceptance) {
    if (criterion.verification?.verifier !== "playwright") continue;
    const verification = criterion.verification;
    checks.push({
      id: `playwright:${criterion.id}`,
      verifierId: "playwright",
      criterionId: criterion.id,
      requirement: criterion.description,
      title: verification.title,
      why: `Browser flow for ${criterion.id}: ${criterion.description}`,
      group: verification.group ?? verification.title,
      expectedEvidence: criterion.evidence === "STATIC" ? "RUNTIME" : criterion.evidence,
      execution: "deterministic",
      severityOnFail: "MAJOR",
      dependencyPatterns: sourcePatterns(verification.dependencies),
      reproduction: verification.steps.map(stepText),
      suspects: verification.suspects,
      input: { steps: verification.steps, viewport: verification.viewport ?? viewport } satisfies BrowserCheckInput,
    });
  }
  for (const state of context.contract.ui_states) {
    checks.push({
      id: `ui:${state.id}`,
      verifierId: "playwright",
      title: state.description || state.id,
      why: `The change contract requires the ${state.id} UI state to be observable.`,
      group: state.description || state.id,
      expectedEvidence: "RUNTIME",
      execution: "deterministic",
      severityOnFail: "MAJOR",
      dependencyPatterns: sourcePatterns(state.dependencies),
      reproduction: state.steps.map(stepText),
      suspects: context.changedFiles.filter((file) => /\.(html|css|js|mjs|tsx|jsx|vue)$/.test(file)),
      input: { steps: state.steps, viewport: state.viewport ?? viewport } satisfies BrowserCheckInput,
    });
  }
  return checks;
}

function stepText(step: BrowserStep): string {
  switch (step.action) {
    case "goto":
      return `Open ${step.value}`;
    case "reload":
      return "Hard refresh";
    case "click":
      return `Click ${step.selector}`;
    case "fill":
      return `Fill ${step.selector}`;
    case "upload":
      return `Upload ${step.filename} using ${step.selector}`;
    case "assert_visible":
      return `Confirm ${step.selector} is visible`;
    case "assert_hidden":
      return `Confirm ${step.selector} is hidden`;
    case "assert_present":
      return `Confirm ${step.selector} exists`;
    case "assert_text":
      return `Confirm ${step.selector} contains ${step.value}`;
    case "assert_image_loaded":
      return `Confirm ${step.selector} loaded a persisted image`;
    default: {
      const unknown: never = step;
      return JSON.stringify(unknown);
    }
  }
}
