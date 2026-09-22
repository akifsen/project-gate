import { listProjectFiles } from "@projectgate/shared";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { discoverProfile, type DiscoveredModule } from "./stacks/index.js";
import type { StackCapability, StackCommand } from "./stacks/types.js";

export interface DiscoveredCommand {
  id: string;
  title: string;
  command: string;
  args: string[];
  group: string;
  invalidatesOn: string[];
  cwd?: string;
  ready: boolean;
}

export interface DiscoveryModule {
  path: string;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  sourceRoots: string[];
  testRoots: string[];
  capabilities: StackCapability[];
  commands: DiscoveredCommand[];
  adapterIds: string[];
}

export interface Discovery {
  languages: string[];
  packageManager: string | null;
  frontend: string | null;
  backend: string | null;
  browserApp: boolean;
  git: boolean;
  defaultBranch: string | null;
  testFileCount: number;
  playwrightConfig: boolean;
  cypressConfig: boolean;
  commands: DiscoveredCommand[];
  runtimeProposal: string | null;
  modules: DiscoveryModule[];
}

export function discoverRepository(root: string): Discovery {
  const files = safeList(root);
  const profile = discoverProfile(root);
  const modules = profile.modules.map(toModule);
  const languages = unique(modules.flatMap((module) => module.languages));
  const frameworks = unique(modules.flatMap((module) => module.frameworks));
  const packageManagers = unique(modules.flatMap((module) => module.packageManagers));
  const frontend = join(frameworks.filter(isFrontend));
  const backend = join(preferBackend(frameworks.filter(isBackend)));
  return {
    languages,
    packageManager: join(packageManagers),
    frontend,
    backend,
    browserApp: frameworks.some(isWeb) || files.some((file) => file === "index.html" || file.startsWith("public/") || file.includes("/pages/") || (file.startsWith("app/") && /\.(tsx|jsx|vue|html)$/.test(file))),
    git: fs.existsSync(path.join(root, ".git")),
    defaultBranch: defaultBranch(root),
    testFileCount: files.filter(isTestFile).length,
    playwrightConfig: files.some((file) => /^playwright\.config\.[cm]?[jt]s$/.test(file)),
    cypressConfig: files.some((file) => file === "cypress.config.js" || file === "cypress.config.ts" || file.startsWith("cypress/")),
    commands: modules.flatMap((module) => module.commands.filter((command) => command.ready)),
    runtimeProposal: profile.runtimeProposal,
    modules,
  };
}

export function discoverCommands(root: string): DiscoveredCommand[] {
  return discoverRepository(root).commands;
}

function toModule(module: DiscoveredModule): DiscoveryModule {
  return {
    path: module.path,
    languages: module.languages,
    frameworks: module.frameworks,
    packageManagers: module.packageManagers,
    sourceRoots: module.sourceRoots,
    testRoots: module.testRoots,
    capabilities: module.capabilities,
    commands: module.commands.map(toCommand),
    adapterIds: module.adapterIds,
  };
}

function toCommand(command: StackCommand): DiscoveredCommand {
  return {
    id: command.id,
    title: command.title,
    command: command.command,
    args: command.args,
    group: command.group,
    invalidatesOn: command.invalidatesOn,
    ready: command.ready,
    ...(command.cwd ? { cwd: command.cwd } : {}),
  };
}

function isWeb(name: string): boolean {
  return /React|Next\.js|Vue|Nuxt|Svelte|Angular|Vite/.test(name);
}

function isFrontend(name: string): boolean {
  return isWeb(name) || name === "Flutter" || name === "Android";
}

function isBackend(name: string): boolean {
  return /Laravel|^PHP$|Express|Fastify|NestJS|Spring Boot|Django|FastAPI|Flask|ASP\.NET Core|^\.NET$/.test(name);
}

function preferBackend(names: string[]): string[] {
  if (names.includes("ASP.NET Core")) return names.filter((name) => name !== ".NET");
  if (names.includes("Laravel")) return names.filter((name) => name !== "PHP");
  return names;
}

function join(values: string[]): string | null {
  return values.length > 0 ? values.join(", ") : null;
}

function isTestFile(file: string): boolean {
  const base = file.split("/").pop() ?? file;
  return /(?:^|\/)(?:__tests__|tests?|integration_test)\//.test(file) || /\.(test|spec)\./i.test(base) || /(?:^|\/)test_/.test(file) || /_test\.(go|py)$/.test(base) || /Tests?\.(java|kt|cs)$/.test(base);
}

function defaultBranch(root: string): string | null {
  if (!fs.existsSync(path.join(root, ".git"))) return null;
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return null;
  const text = result.stdout.trim();
  return text.length > 0 && text !== "HEAD" ? text : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safeList(root: string): string[] {
  try {
    return listProjectFiles(root);
  } catch {
    return [];
  }
}
