import type { AxeViolation, BrowserPool, LayoutMetrics, ManagedPage, NetworkEvent } from "@projectgate/verifier-sdk";
import { AxeBuilder } from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

export async function openBrowserPool(): Promise<BrowserPool> {
  const browser = await chromium.launch({ headless: true });
  return new PlaywrightPool(browser);
}

class PlaywrightPool implements BrowserPool {
  constructor(private readonly browser: Browser) {}

  async withPage<T>(viewport: { width: number; height: number }, run: (page: ManagedPage) => Promise<T>): Promise<T> {
    const context = await this.browser.newContext({ viewport, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const sensors = listen(page);
    try {
      return await run(new PlaywrightPage(page, sensors));
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

const LAYOUT_METRICS_SOURCE = `(() => {
  const doc = document.documentElement;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const interactive = [];
  for (const element of document.querySelectorAll("button, a, [role='button']")) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    interactive.push({
      tag: element.tagName.toLowerCase(),
      testId: element.getAttribute("data-testid"),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }
  const textOverflow = [];
  for (const element of document.querySelectorAll("p, h1, h2, h3, label, button, a, span")) {
    const style = getComputedStyle(element);
    const clipped = style.overflowX === "hidden" || style.textOverflow === "ellipsis";
    if (clipped && element.scrollWidth > element.clientWidth + 2 && element.clientWidth > 0) {
      textOverflow.push({ testId: element.getAttribute("data-testid"), text: (element.textContent || "").trim().slice(0, 80) });
    }
  }
  const dialogs = [];
  for (const element of document.querySelectorAll("[role='dialog']")) {
    const rect = element.getBoundingClientRect();
    dialogs.push({
      testId: element.getAttribute("data-testid"),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      off: rect.x < -1 || rect.y < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1,
    });
  }
  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    scrollHeight: doc.scrollHeight,
    clientHeight: doc.clientHeight,
    viewport,
    interactive,
    textOverflow,
    dialogs,
  };
})()`;

function listen(page: Page): { consoleMessages: { type: string; text: string }[]; pageErrors: string[]; network: NetworkEvent[] } {
  const sensors = {
    consoleMessages: [] as { type: string; text: string }[],
    pageErrors: [] as string[],
    network: [] as NetworkEvent[],
  };
  page.on("console", (message) => {
    sensors.consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    sensors.pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    sensors.network.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) sensors.network.push({ url: response.url(), status: response.status() });
  });
  return sensors;
}

class PlaywrightPage implements ManagedPage {
  constructor(
    private readonly page: Page,
    private readonly sensors: { consoleMessages: { type: string; text: string }[]; pageErrors: string[]; network: NetworkEvent[] },
  ) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "load" });
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: "load" });
  }

  async click(selector: string): Promise<void> {
    await this.page.locator(selector).click();
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).fill(value);
  }

  async setInputFiles(selector: string, file: { name: string; mimeType: string; buffer: Uint8Array }): Promise<void> {
    await this.page.locator(selector).setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: Buffer.from(file.buffer) });
  }

  async waitForVisible(selector: string, timeoutMs: number): Promise<void> {
    await this.page.locator(selector).waitFor({ state: "visible", timeout: timeoutMs });
  }

  async isVisible(selector: string): Promise<boolean> {
    return this.page.locator(selector).isVisible();
  }

  async count(selector: string): Promise<number> {
    return this.page.locator(selector).count();
  }

  async textContent(selector: string): Promise<string | null> {
    return this.page.locator(selector).first().textContent();
  }

  async imageLoaded(selector: string): Promise<boolean> {
    const locator = this.page.locator(selector) as unknown as {
      evaluate: (fn: (element: { tagName: string; hidden: boolean; naturalWidth: number; currentSrc: string }) => boolean) => Promise<boolean>;
    };
    return locator.evaluate((element) => element.tagName === "IMG" && !element.hidden && element.naturalWidth > 0 && !element.currentSrc.startsWith("blob:"));
  }

  async screenshot(absolutePath: string): Promise<void> {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    await this.page.screenshot({ path: absolutePath, fullPage: true });
  }

  async content(): Promise<string> {
    return this.page.content();
  }

  async runAxe(): Promise<AxeViolation[]> {
    const results = await new AxeBuilder({ page: this.page }).analyze();
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact === "minor" || violation.impact === "moderate" || violation.impact === "serious" || violation.impact === "critical" ? violation.impact : null,
      description: violation.description,
      help: violation.help,
      nodes: violation.nodes.slice(0, 5).map((node) => {
        const mapped: AxeViolation["nodes"][number] = {
          target: node.target.map((target) => String(target)),
          html: node.html.slice(0, 300),
        };
        if (node.failureSummary) mapped.failureSummary = node.failureSummary;
        return mapped;
      }),
    }));
  }

  async layoutMetrics(): Promise<LayoutMetrics> {
    return this.page.evaluate(LAYOUT_METRICS_SOURCE) as Promise<LayoutMetrics>;
  }

  consoleMessages(): readonly { type: string; text: string }[] {
    return this.sensors.consoleMessages;
  }

  pageErrors(): readonly string[] {
    return this.sensors.pageErrors;
  }

  networkEvents(): readonly NetworkEvent[] {
    return this.sensors.network;
  }
}
