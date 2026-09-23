import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PackageManifest {
  name?: string;
  private?: boolean;
  version?: string;
}

function readManifest(file: string): PackageManifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as PackageManifest;
  } catch {
    return undefined;
  }
}

function publicVersion(file: string): string | undefined {
  const manifest = readManifest(file);
  return manifest?.name === "@akifsen/project-gate" && typeof manifest.version === "string" && manifest.version.trim()
    ? manifest.version
    : undefined;
}

export function resolveProductVersion(moduleUrl: string): string {
  let dir = path.dirname(fileURLToPath(moduleUrl));
  while (true) {
    const installed = publicVersion(path.join(dir, "package.json"));
    if (installed) return installed;

    const manifest = readManifest(path.join(dir, "package.json"));
    if (manifest?.name === "project-gate" && manifest.private === true) {
      return publicVersion(path.join(dir, "release", "package.json")) ?? "0.0.0-dev";
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "0.0.0-dev";
}

export const product = {
  name: "Project Gate",
  command: "projectgate",
  codename: "project-gate",
  version: resolveProductVersion(import.meta.url),
  configDir: ".projectgate",
  schemaVersion: 1,
} as const;
