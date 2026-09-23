import fs from "node:fs";
import path from "node:path";
import { listProjectFiles } from "@projectgate/shared";
import { dartAdapter, usesFlutter } from "./dart.js";
import { dotnetAdapter } from "./dotnet.js";
import { goAdapter } from "./go.js";
import { javaAdapter } from "./java.js";
import { nodeAdapter, nodeRuntimeProposal } from "./node.js";
import { phpAdapter } from "./php.js";
import { pythonAdapter } from "./python.js";
import { rustAdapter } from "./rust.js";
import type { FileClassification, ModuleContribution, ModuleScan, StackAdapter, StackCommand, StackFact } from "./types.js";
import type { RouteHit } from "./surfaces.js";

export function routesInFile(file: string, text: string): RouteHit[] {
  const seen = new Set<string>();
  return adapters.flatMap((adapter) => adapter.routes?.(file.replaceAll("\\", "/"), text) ?? []).filter((route) => {
    const key = `${route.source}:${route.method ?? ""}:${route.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const adapters: StackAdapter[] = [dartAdapter, javaAdapter, pythonAdapter, dotnetAdapter, goAdapter, rustAdapter, phpAdapter, nodeAdapter];

const SKIP = new Set(["node_modules", ".git", "dist", "coverage", "vendor", "target", ".gradle", ".dart_tool", ".next", "build", ".idea", ".cursor", "obj", ".venv", "venv", "__pycache__"]);
const FLUTTER_PLATFORMS = new Set(["android", "ios", "linux", "macos", "windows", "web"]);

export interface DiscoveredModule {
  path: string;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  sourceRoots: string[];
  testRoots: string[];
  capabilities: ModuleContribution["capabilities"];
  commands: StackCommand[];
  adapterIds: string[];
  detections: { languages: StackFact[]; frameworks: StackFact[]; packageManagers: StackFact[] };
  manifests: StackFact[];
  routes: ProfileSurface[];
  productSurfaces: ProfileSurface[];
}

export interface ProfileSurface extends StackFact {
  file: string;
  type: "API_ENDPOINT" | "WEB_ROUTE" | "MOBILE_SCREEN" | "UI_COMPONENT" | "DATABASE_SCHEMA" | "BACKGROUND_JOB" | "EVENT_HANDLER" | "CLI_COMMAND";
}

export interface RepositoryProfile {
  modules: DiscoveredModule[];
  commands: StackCommand[];
  runtimeProposal: string | null;
}

export function classifyProjectPath(filePath: string): FileClassification {
  const file = filePath.replaceAll("\\", "/");
  const internal = projectGateFile(file);
  if (internal) return internal;
  const base = file.split("/").pop() ?? file;
  if (/migration/i.test(file) && /\.(php|sql|ts|js)$/.test(base) && !isTestFile(file)) {
    return { role: "migration", category: "APPLICATION", subtype: "MIGRATION", adapter: "path", confidence: "observed", source: "path-convention" };
  }
  for (const adapter of adapters) {
    const classified = adapter.classify(file);
    if (!classified) continue;
    if (isTestFile(file) && classified.category !== "CONFIGURATION" && classified.category !== "GENERATED") {
      return { ...classified, role: "test", category: "TEST", subtype: "TEST", confidence: "observed", source: classified.source };
    }
    return classified;
  }
  return fallbackFile(file);
}

export function discoverProfile(root: string): RepositoryProfile {
  const files = safeFiles(root);
  const modulePaths = findModules(root);
  const owned = assignFiles(files, modulePaths);
  const modules: DiscoveredModule[] = [];
  let runtimeProposal: string | null = null;
  for (const modulePath of modulePaths) {
    const scan = withoutFlutterPlatforms(scanOf(root, modulePath, owned.get(modulePath) ?? []));
    const matched = adapters
      .map((adapter) => ({ adapter, contribution: adapter.inspect(scan) }))
      .filter((item): item is { adapter: StackAdapter; contribution: ModuleContribution } => item.contribution !== null);
    if (matched.length === 0) continue;
    const contributions = matched.map((item) => item.contribution);
    const languages = unique(contributions.flatMap((item) => item.languages.map((entry) => entry.name)));
    const manifests = matched.flatMap(({ adapter }) => scan.files
      .filter((file) => adapter.classify(file)?.category === "CONFIGURATION")
      .map((file) => ({ name: file, source: file, confidence: "observed" as const, adapter: adapter.id })));
    const commands = matched.flatMap(({ adapter, contribution }) => contribution.commands.map((command) => ({
      ...command,
      adapter: adapter.id,
      source: command.source ?? contribution.capabilities.find((item) => item.name.toLowerCase() === command.title.toLowerCase())?.source ?? contribution.packageManagers[0]?.source ?? adapter.id,
      confidence: command.confidence ?? "observed" as const,
      invalidatesOn: unique([...command.invalidatesOn, ...manifests.filter((item) => item.adapter === adapter.id).map((item) => item.name)]),
    })));
    const productSurfaces = discoverSurfaces(scan, matched.map((item) => item.adapter));
    modules.push({
      path: modulePath,
      languages,
      frameworks: unique(contributions.flatMap((item) => item.frameworks.map((entry) => entry.name))),
      packageManagers: unique(contributions.flatMap((item) => item.packageManagers.map((entry) => entry.name))),
      sourceRoots: unique(contributions.flatMap((item) => item.sourceRoots)),
      testRoots: unique(contributions.flatMap((item) => item.testRoots)),
      capabilities: contributions.flatMap((item) => item.capabilities),
      commands,
      adapterIds: matched.map((item) => item.adapter.id),
      detections: {
        languages: contributions.flatMap((item) => item.languages),
        frameworks: contributions.flatMap((item) => item.frameworks),
        packageManagers: contributions.flatMap((item) => item.packageManagers),
      },
      manifests,
      routes: productSurfaces.filter((item) => item.type === "API_ENDPOINT" || item.type === "WEB_ROUTE"),
      productSurfaces,
    });
    if (!runtimeProposal && modulePath === ".") runtimeProposal = nodeRuntimeProposal(scan);
  }
  const commands = dedupe(modules.flatMap((module) => module.commands).filter((item) => item.ready));
  return { modules, commands, runtimeProposal };
}

function discoverSurfaces(scan: ModuleScan, selected: StackAdapter[]): ProfileSurface[] {
  const surfaces: ProfileSurface[] = [];
  for (const file of scan.files) {
    const classification = classifyProjectPath(file);
    if (classification.category !== "APPLICATION") continue;
    const text = scan.read(file);
    if (text === null) continue;
    for (const adapter of selected) {
      for (const route of adapter.routes?.(file, text) ?? []) {
        surfaces.push({ name: route.method ? `${route.method} ${route.path}` : route.path, file, type: route.method || /^[A-Z]+ /.test(route.path) ? "API_ENDPOINT" : "WEB_ROUTE", source: route.source, adapter: adapter.id, confidence: "observed" });
      }
    }
    const types: Record<string, ProfileSurface["type"]> = { SCREEN: "MOBILE_SCREEN", PAGE: "UI_COMPONENT", COMPONENT: "UI_COMPONENT", MIGRATION: "DATABASE_SCHEMA", JOB: "BACKGROUND_JOB", EVENT: "EVENT_HANDLER", COMMAND: "CLI_COMMAND" };
    const type = classification.surface ?? types[classification.subtype];
    if (type) surfaces.push({ name: file.split("/").pop() ?? file, file, type, source: classification.source, adapter: classification.adapter, confidence: "inferred" });
  }
  return surfaces;
}

function withoutFlutterPlatforms(scan: ModuleScan): ModuleScan {
  const pubspecName = scan.path === "." ? "pubspec.yaml" : `${scan.path}/pubspec.yaml`;
  const pubspec = scan.read(pubspecName);
  if (pubspec === null || !usesFlutter(pubspec)) return scan;
  const prefix = scan.path === "." ? "" : `${scan.path}/`;
  return {
    ...scan,
    files: scan.files.filter((file) => {
      const relative = file.startsWith(prefix) ? file.slice(prefix.length) : file;
      const top = relative.split("/")[0] ?? "";
      return !FLUTTER_PLATFORMS.has(top);
    }),
  };
}

function scanOf(root: string, modulePath: string, files: string[]): ModuleScan {
  return {
    repoRoot: root,
    path: modulePath,
    files,
    exists(name: string) {
      return fs.existsSync(path.join(root, modulePath === "." ? "" : modulePath, name));
    },
    read(relativeToRepo: string) {
      const absolute = path.join(root, relativeToRepo);
      if (!fs.existsSync(absolute)) return null;
      try {
        if (!fs.statSync(absolute).isFile() || fs.statSync(absolute).size > 200_000) return null;
        return fs.readFileSync(absolute, "utf8");
      } catch {
        return null;
      }
    },
  };
}

function findModules(root: string): string[] {
  const found: string[] = [];
  walk(root, "", false, found);
  if (!found.includes(".")) found.unshift(".");
  found.sort((left, right) => (left === "." ? -1 : right === "." ? 1 : left.localeCompare(right)));
  return found;
}

function walk(dir: string, relative: string, flutterPlatform: boolean, found: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const names = new Set(entries.map((entry) => entry.name));
  const pubspec = names.has("pubspec.yaml");
  let flutter = false;
  if (pubspec) {
    try { flutter = usesFlutter(fs.readFileSync(path.join(dir, "pubspec.yaml"), "utf8")); } catch { /* Keep scanning the remaining manifests. */ }
  }
  const manifest = !flutterPlatform && isManifest(names);
  if (manifest) found.push(relative || ".");
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP.has(entry.name) || entry.name === ".projectgate") continue;
    if (entry.name === "runtime" && path.basename(dir) === ".projectgate") continue;
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    const childPlatform = flutterPlatform || (flutter && FLUTTER_PLATFORMS.has(entry.name));
    walk(path.join(dir, entry.name), next, childPlatform, found);
  }
}

function isManifest(names: Set<string>): boolean {
  if (["package.json", "pubspec.yaml", "pom.xml", "composer.json", "pyproject.toml", "requirements.txt", "requirements-dev.txt", "Pipfile", "setup.py", "setup.cfg", "manage.py", "go.mod", "Cargo.toml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"].some((name) => names.has(name))) return true;
  for (const name of names) {
    if (name.endsWith(".csproj") || name.endsWith(".fsproj") || name.endsWith(".sln")) return true;
  }
  return false;
}

function assignFiles(files: readonly string[], modules: readonly string[]): Map<string, string[]> {
  const nested = modules.filter((modulePath) => modulePath !== ".").sort((left, right) => right.length - left.length);
  const map = new Map<string, string[]>(modules.map((modulePath) => [modulePath, []]));
  for (const file of files) {
    const owner = nested.find((modulePath) => file === modulePath || file.startsWith(`${modulePath}/`)) ?? (modules.includes(".") ? "." : nested[0]);
    if (!owner) continue;
    map.get(owner)?.push(file);
  }
  return map;
}

function isTestFile(file: string): boolean {
  const base = file.split("/").pop() ?? file;
  return /(?:^|\/)(?:__tests__|tests?|integration_test)\//.test(file) || /[\\/.](?:test|spec)\./i.test(base) || /(?:^|\/)test_[^/]+\.py$/.test(file) || /_test\.(go|py)$/.test(base);
}

function projectGateFile(file: string): FileClassification | null {
  if (!/(?:^|\/)\.projectgate(?:\/|$)/.test(file)) return null;
  const generated = /(?:^|\/)\.projectgate\/runtime\//.test(file) || /\.(db|log)$/.test(file) || file.includes("/screenshots/") || file.includes("/network/");
  return {
    role: "config",
    category: "PROJECT_GATE_INTERNAL",
    subtype: generated ? "GENERATED" : "CONFIG",
    adapter: "project-gate",
    confidence: "observed",
    source: generated ? "project-gate-runtime" : "project-gate-config",
  };
}

function fallbackFile(file: string): FileClassification {
  const base = file.split("/").pop() ?? file;
  if (/(^|\/)(?:__tests__|tests?)\//.test(file) || /[\\/.](?:test|spec)\./i.test(base)) {
    return { role: "test", category: "TEST", subtype: "TEST", adapter: "path", confidence: "observed", source: "path-convention" };
  }
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|ttf|woff2?)$/i.test(base)) {
    return { role: "static", category: "ASSET", subtype: "ASSET", adapter: "path", confidence: "observed", source: "extension" };
  }
  if (/\.(md|mdx|txt)$/i.test(base)) {
    return { role: "documentation", category: "DOCUMENTATION", subtype: "DOCUMENTATION", adapter: "path", confidence: "observed", source: "extension" };
  }
  if (base === ".gitignore" || /\.(yml|yaml|json|toml|ini|env\.example)$/i.test(base)) {
    return { role: "config", category: "CONFIGURATION", subtype: "CONFIG", adapter: "path", confidence: "observed", source: "extension" };
  }
  return { role: "unknown", category: "UNKNOWN", subtype: "UNKNOWN", adapter: "path", confidence: "inferred", source: "unrecognized" };
}

function safeFiles(root: string): string[] {
  try {
    return listProjectFiles(root);
  } catch {
    return [];
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupe(commands: StackCommand[]): StackCommand[] {
  const seen = new Set<string>();
  return commands.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
