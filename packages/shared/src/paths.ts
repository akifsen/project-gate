import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { matchAnyGlob } from "./glob.js";
import { isSensitivePath } from "./redact.js";

export function toPosix(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

export function relativePosix(root: string, filePath: string): string {
  return toPosix(path.relative(root, filePath));
}

export function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 80) || "artifact";
}

export function createRunId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `run_${stamp}_${randomBytes(4).toString("hex")}`;
}

export function stableId(prefix: string, key: string, length = 8): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, length).toUpperCase();
  return `${prefix}-${hash}`;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(absolutePath: string): string {
  const data = fs.readFileSync(absolutePath);
  return createHash("sha256").update(data).digest("hex");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return Object.fromEntries(entries.map(([key, entry]) => [key, sortValue(entry)]));
  }
  return value;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "vendor",
  "target",
  ".gradle",
  ".dart_tool",
  ".next",
  "build",
  ".idea",
  ".cursor",
  "obj",
  ".venv",
  "venv",
  "__pycache__",
]);

export function listProjectFiles(root: string): string[] {
  const files: string[] = [];
  walk(root, root, files);
  files.sort();
  return files;
}

function walk(root: string, dir: string, files: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "runtime" && path.basename(dir) === ".projectgate") continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, absolute, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const relative = relativePosix(root, absolute);
    if (relative.startsWith(".projectgate/runtime/")) continue;
    if (isSensitivePath(relative)) continue;
    files.push(relative);
  }
}

export function expandPatterns(
  root: string,
  patterns: readonly string[],
  files = listProjectFiles(root),
): { path: string; hash: string }[] {
  if (patterns.length === 0) return [];
  return files
    .filter((file) => matchAnyGlob(patterns, file))
    .map((file) => ({ path: file, hash: sha256File(path.join(root, file)) }));
}
