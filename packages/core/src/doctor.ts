import { browserInstallStatus } from "@projectgate/browser";
import { discoverRepository, loadProject } from "@projectgate/config";
import { loadContract, placeholderProblems } from "@projectgate/contracts";
import { openStore } from "@projectgate/evidence";
import { modelFromEnv } from "@projectgate/model";
import { product } from "@projectgate/shared";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createDefaultRegistry } from "./registry.js";

export interface DoctorCheck {
  status: "ok" | "warn" | "fail";
  label: string;
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  next: string[];
}

export async function doctor(root: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const next: string[] = [];
  checks.push({ status: "ok", label: "CLI", detail: product.version });
  const node = process.versions.node;
  checks.push(nodeSupported(node) ? { status: "ok", label: "Node", detail: node } : { status: "fail", label: "Node", detail: `${node} is older than 22.18.0` });
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  checks.push(git.status === 0 ? { status: "ok", label: "Git", detail: "available" } : { status: "fail", label: "Git", detail: "git was not found on PATH" });
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  checks.push(inside.status === 0 && inside.stdout.trim() === "true" ? { status: "ok", label: "Repository", detail: "detected" } : { status: "warn", label: "Repository", detail: "not a git work tree" });
  const discovery = discoverRepository(root);
  checks.push({ status: discovery.packageManager ? "ok" : "warn", label: "Package manager", detail: discovery.packageManager ?? "not detected" });
  for (const module of discovery.modules) {
    if (module.languages.length === 0 && module.frameworks.length === 0 && module.commands.length === 0) continue;
    const prefix = module.path === "." ? "" : `${module.path} `;
    for (const language of module.languages) checks.push({ status: "ok", label: trimLabel(`${prefix}${language}`), detail: "detected" });
    for (const framework of module.frameworks) checks.push({ status: "ok", label: trimLabel(`${prefix}${framework}`), detail: "detected" });
    for (const manager of module.packageManagers) checks.push({ status: "ok", label: trimLabel(`${prefix}${manager}`), detail: "detected" });
    for (const command of module.commands) {
      const available = command.ready && executable(command.command);
      checks.push({
        status: available ? "ok" : "warn",
        label: trimLabel(`${prefix}${command.title}`),
        detail: available ? `${command.command} ${command.args.join(" ")}`.trim() : `${command.command} is not available`,
      });
    }
    for (const capability of module.capabilities) {
      if (capability.ready || capability.source.includes("not configured") || capability.source.includes("not run") || capability.source.includes("not started")) continue;
      if (module.commands.some((command) => capability.name.includes(command.command))) continue;
      checks.push({ status: "warn", label: trimLabel(`${prefix}${capability.name}`), detail: capability.source });
    }
  }
  const projectFile = path.join(root, product.configDir, "project.yml");
  if (!fs.existsSync(projectFile)) {
    checks.push({ status: "warn", label: "Project config", detail: "missing" });
    next.push("projectgate init");
  } else {
    try {
      loadProject(root);
      checks.push({ status: "ok", label: "Project config", detail: "valid" });
    } catch (error) {
      checks.push({ status: "fail", label: "Project config", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  const contractFile = path.join(root, product.configDir, "contract.yml");
  if (!fs.existsSync(contractFile)) {
    checks.push({ status: "warn", label: "Change contract", detail: "not created" });
    next.push("projectgate contract --task \"Describe your change\"");
  } else {
    try {
      const contract = loadContract(contractFile);
      const problems = placeholderProblems(contract);
      checks.push(problems.length === 0 ? { status: "ok", label: "Change contract", detail: `${contract.change.id} (${contract.acceptance.length} criteria)` } : { status: "fail", label: "Change contract", detail: "placeholder content" });
      if (problems.length > 0) next.push("projectgate contract --task \"Describe your change\"");
    } catch (error) {
      checks.push({ status: "fail", label: "Change contract", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  try {
    const store = openStore(root);
    store.close();
    checks.push({ status: "ok", label: "Storage", detail: "healthy" });
  } catch (error) {
    checks.push({ status: "fail", label: "Storage", detail: error instanceof Error ? error.message : String(error) });
  }
  for (const verifier of createDefaultRegistry().all()) {
    checks.push({ status: "ok", label: `${verifier.id} verifier`, detail: `ready ${verifier.version}` });
  }
  const browser = await browserInstallStatus();
  checks.push(browser.playwright ? { status: "ok", label: "Playwright", detail: "ready" } : { status: "warn", label: "Playwright", detail: browser.detail ?? "unavailable" });
  checks.push(browser.chromiumInstalled ? { status: "ok", label: "Chromium", detail: "installed" } : { status: "warn", label: "Chromium", detail: browser.detail ?? "not installed" });
  if (!browser.chromiumInstalled) next.push("npx playwright install chromium");
  const model = modelFromEnv();
  checks.push(model ? { status: "ok", label: "LLM provider", detail: model.id } : { status: "warn", label: "LLM provider", detail: "not configured" });
  if (!next.includes("projectgate init") && !fs.existsSync(contractFile)) next.unshift("projectgate inspect");
  if (fs.existsSync(contractFile) && next.length === 0) next.push("projectgate audit");
  return { checks, next: unique(next) };
}

export function formatDoctor(report: DoctorReport): string {
  const lines = [product.name + " Doctor", ""];
  for (const check of report.checks) {
    const mark = check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✗";
    lines.push(`${mark} ${check.label.padEnd(18)} ${check.detail}`);
  }
  if (report.next.length > 0) {
    lines.push("", "Next:", "");
    for (const step of report.next) lines.push(step);
  }
  return lines.join("\n");
}

function nodeSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number(part));
  return major > 22 || (major === 22 && minor >= 18);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function trimLabel(value: string): string {
  return value.length > 40 ? `${value.slice(0, 37)}...` : value;
}

function executable(command: string): boolean {
  if (command.includes("/") || command.startsWith(".") || /\.(cmd|bat)$/i.test(command)) return true;
  const base = command.split(/[\\/]/).pop() ?? command;
  const finder = process.platform === "win32" ? "where" : "which";
  return spawnSync(finder, [base], { encoding: "utf8", windowsHide: true }).status === 0;
}
