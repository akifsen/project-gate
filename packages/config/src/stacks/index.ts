import fs from "node:fs";
import path from "node:path";
import { listProjectFiles } from "@projectgate/shared";
import { dartAdapter } from "./dart.js";
import { dotnetAdapter } from "./dotnet.js";
import { goAdapter } from "./go.js";
import { javaAdapter } from "./java.js";
import { nodeAdapter, nodeRuntimeProposal } from "./node.js";
import { phpAdapter } from "./php.js";
import { pythonAdapter } from "./python.js";
import { rustAdapter } from "./rust.js";
import { globs } from "./tools.js";
import type { FileClassification, ModuleContribution, ModuleScan, StackAdapter, StackCommand } from "./types.js";

const adapters: StackAdapter[] = [dartAdapter, javaAdapter, pythonAdapter, dotnetAdapter, goAdapter, rustAdapter, phpAdapter, nodeAdapter];

const SKIP = new Set(["node_modules", ".git", "dist", "coverage", "vendor", "target", ".gradle", ".dart_tool", ".next", "build", ".idea", ".cursor", "obj"]);
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
    if (matched.length === 0 && modulePath !== ".") continue;
    const contributions = matched.map((item) => item.contribution);
    const languages = unique(contributions.flatMap((item) => item.languages.map((entry) => entry.name)));
    const scope = languageGlobs(modulePath, languages);
    const commands = contributions.flatMap((item) => item.commands).map((command) => ({
      ...command,
      invalidatesOn: scope.length > 0 ? scope : command.invalidatesOn,
    }));
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
    });
    if (!runtimeProposal && modulePath === ".") runtimeProposal = nodeRuntimeProposal(scan);
  }
  const commands = dedupe(modules.flatMap((module) => module.commands).filter((item) => item.ready));
  return { modules, commands, runtimeProposal };
}

function languageGlobs(modulePath: string, languages: readonly string[]): string[] {
  const extensions: string[] = [];
  if (languages.some((language) => language === "TypeScript" || language === "JavaScript")) extensions.push(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".css", ".html");
  if (languages.includes("PHP")) extensions.push(".php");
  if (languages.includes("Dart")) extensions.push(".dart");
  if (languages.includes("Java")) extensions.push(".java");
  if (languages.includes("Kotlin")) extensions.push(".kt", ".kts");
  if (languages.includes("Python")) extensions.push(".py");
  if (languages.includes("C#")) extensions.push(".cs");
  if (languages.includes("F#")) extensions.push(".fs");
  if (languages.includes("Go")) extensions.push(".go");
  if (languages.includes("Rust")) extensions.push(".rs");
  return globs(modulePath, extensions);
}

function withoutFlutterPlatforms(scan: ModuleScan): ModuleScan {
  const pubspecName = scan.path === "." ? "pubspec.yaml" : `${scan.path}/pubspec.yaml`;
  const pubspec = scan.read(pubspecName);
  if (pubspec === null || !pubspec.includes("flutter:")) return scan;
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
  const manifest = !flutterPlatform && isManifest(names);
  if (manifest) found.push(relative || ".");
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP.has(entry.name) || entry.name === ".projectgate") continue;
    if (entry.name === "runtime" && path.basename(dir) === ".projectgate") continue;
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    const childPlatform = flutterPlatform || (pubspec && FLUTTER_PLATFORMS.has(entry.name));
    walk(path.join(dir, entry.name), next, childPlatform, found);
  }
}

function isManifest(names: Set<string>): boolean {
  if (["package.json", "pubspec.yaml", "pom.xml", "composer.json", "pyproject.toml", "requirements.txt", "Pipfile", "setup.py", "manage.py", "go.mod", "Cargo.toml", "build.gradle", "build.gradle.kts"].some((name) => names.has(name))) return true;
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
  if (file !== ".projectgate" && !file.startsWith(".projectgate/")) return null;
  const generated = file.startsWith(".projectgate/runtime/") || /\.(db|log)$/.test(file) || file.includes("/screenshots/") || file.includes("/network/");
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
