import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ModuleScan, StackCommand } from "./types.js";

export function toolOnPath(name: string): boolean {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [name], { encoding: "utf8", windowsHide: true, timeout: 3000 });
  return result.status === 0;
}

// Script names are not proof of read-only behavior. Reject known source-writing
// modes and setup commands; repository scripts still require repository trust.
export function readOnlyScript(script: string): boolean {
  if (/(?:^|[;&|]\s*)\s*(?:rm|rmdir|del|erase|mv|cp|copy|move|git\s+(?:reset|clean|checkout)|Remove-Item|Set-Content)\b|\bsed\s+-i\b/.test(script)) return false;
  if (/--(?:fix|write)(?:[=\s]|$)|\b(?:npm|pnpm|yarn|bun|composer|pip)\s+(?:install|add|update)\b|\b(?:flutter|dart)\s+pub\s+get\b|\bdotnet\s+restore\b/.test(script)) return false;
  if (/\bblack\b/.test(script) && !/--check\b/.test(script)) return false;
  if (/\b(?:pint|prettier)\b/.test(script) && !/--(?:test|check|list-different)\b/.test(script)) return false;
  if (/\bphp-cs-fixer\s+fix\b/.test(script) && !/--dry-run\b/.test(script)) return false;
  if (/\bdart\s+format\b/.test(script) && !/--output[= ]none\b/.test(script)) return false;
  if (/\bcargo\s+fmt\b/.test(script) && !/--check\b/.test(script)) return false;
  return true;
}

export function safeManifestScript(scripts: Record<string, string>, name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false;
  const next = new Set(seen).add(name);
  for (const key of [name, `pre${name}`, `post${name}`]) {
    const body = scripts[key];
    if (!body) continue;
    if (!readOnlyScript(body)) return false;
    for (const match of body.matchAll(/\b(?:(?:npm|pnpm|yarn|bun)\s+run\s+|(?:pnpm|yarn|bun)\s+)([\w:.-]+)/g)) {
      const referenced = match[1];
      if (referenced && scripts[referenced] && !safeManifestScript(scripts, referenced, next)) return false;
    }
  }
  return true;
}

// Composer scripts can be strings or ordered arrays and can call other named
// scripts with @name. Check the hooks Composer runs around the requested script
// as well, and fail closed for malformed bodies, unresolved references, or cycles.
// @composer and direct Composer commands can dispatch arbitrary scripts, so a
// possible false positive is safer than trying to infer their behavior here.
export function safeComposerScript(scripts: Record<string, unknown>, name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false;
  const next = new Set(seen).add(name);
  for (const key of [`pre-${name}`, name, `post-${name}`]) {
    if (!(key in scripts)) continue;
    const body = scripts[key];
    const commands = typeof body === "string" ? [body] : Array.isArray(body) && body.every((item) => typeof item === "string") ? body as string[] : null;
    if (!commands || commands.some((script) => !readOnlyComposerCommand(scripts, script, next))) return false;
  }
  return name in scripts;
}

function readOnlyComposerCommand(scripts: Record<string, unknown>, script: string, seen: Set<string>): boolean {
  if (!script.trim() || /(?:^|[\s;&|])@?composer(?:\.phar)?(?:\s|$)/i.test(script) || !readOnlyScript(script)) return false;
  for (const match of script.matchAll(/@([\w:.-]+)/g)) {
    const referenced = match[1];
    if (!referenced) return false;
    if (referenced === "composer") return false;
    if (["php", "putenv", "no_additional_args", "additional_args"].includes(referenced)) continue;
    if (!(referenced in scripts) || !safeComposerScript(scripts, referenced, seen)) return false;
  }
  return true;
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
  const moduleDir = path.resolve(scan.repoRoot, scan.path);
  const root = path.resolve(scan.repoRoot);
  let directory = moduleDir;
  while (!fs.existsSync(path.join(directory, file))) {
    if (directory === root) return null;
    const parent = path.dirname(directory);
    if (parent === directory || path.relative(root, parent).startsWith("..")) return null;
    directory = parent;
  }
  const absolute = path.join(directory, file);
  let executable = true;
  try { fs.accessSync(absolute, win ? fs.constants.F_OK : fs.constants.X_OK); } catch { executable = false; }
  const relative = path.relative(moduleDir, absolute).replaceAll("\\", "/");
  const javaHome = process.env.JAVA_HOME;
  const javaReady = toolOnPath("java") || Boolean(javaHome && fs.existsSync(path.join(javaHome, "bin", win ? "java.exe" : "java")));
  return { command: win || relative.startsWith(".") ? relative : `./${relative}`, ready: executable && javaReady };
}
