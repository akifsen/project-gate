import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ModuleScan, StackCommand } from "./types.js";

const toolCache = new Map<string, boolean>();

export function toolOnPath(name: string): boolean {
  const cached = toolCache.get(name);
  if (cached !== undefined) return cached;
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [name], { encoding: "utf8", windowsHide: true });
  const ready = result.status === 0;
  toolCache.set(name, ready);
  return ready;
}

export function modulePrefix(modulePath: string): string {
  if (modulePath === ".") return "";
  return `${modulePath.replaceAll("/", "-")}-`;
}

export function globs(modulePath: string, extensions: readonly string[]): string[] {
  return extensions.map((extension) => (modulePath === "." ? `**/*${extension}` : `${modulePath}/**/*${extension}`));
}

export function command(input: StackCommand): StackCommand {
  return input;
}

export function readJson(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function recordOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") entries[key] = item;
  }
  return entries;
}

export function moduleFile(scan: ModuleScan, name: string): string {
  return scan.path === "." ? name : `${scan.path}/${name}`;
}

export function abs(scan: ModuleScan, name: string): string {
  return path.join(scan.repoRoot, scan.path === "." ? "" : scan.path, name);
}

export function wrapper(scan: ModuleScan, windowsName: string, unixName: string): { command: string; ready: boolean } | null {
  const win = process.platform === "win32";
  const file = win ? windowsName : unixName;
  if (!fs.existsSync(abs(scan, file))) return null;
  return { command: win ? file : `./${file}`, ready: true };
}
