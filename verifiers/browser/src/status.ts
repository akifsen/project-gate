import fs from "node:fs";

export interface BrowserInstallStatus {
  playwright: boolean;
  chromiumInstalled: boolean;
  chromiumPath: string | null;
  detail: string | null;
}

export async function browserInstallStatus(): Promise<BrowserInstallStatus> {
  try {
    const playwright = await import("playwright");
    const chromiumPath = playwright.chromium.executablePath();
    const chromiumInstalled = fs.existsSync(chromiumPath);
    return {
      playwright: true,
      chromiumInstalled,
      chromiumPath,
      detail: chromiumInstalled ? null : `Chromium is not installed at ${chromiumPath}. Run npx playwright install chromium.`,
    };
  } catch (error) {
    return {
      playwright: false,
      chromiumInstalled: false,
      chromiumPath: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
