import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

function installedVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 6; depth += 1) {
      try {
        const pkg = require(path.join(dir, "package.json")) as { name?: string; version?: string };
        const name = pkg.name ?? "";
        if (typeof pkg.version === "string" && (name === "@akifsen/project-gate" || name.startsWith("@projectgate/"))) return pkg.version;
      } catch {
        // This directory has no readable package manifest.
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Fall through to the workspace version below.
  }
  return "0.1.0";
}

export const product = {
  name: "Project Gate",
  command: "projectgate",
  codename: "project-gate",
  version: installedVersion(),
  configDir: ".projectgate",
  schemaVersion: 1,
} as const;
