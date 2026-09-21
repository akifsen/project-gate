import { listProjectFiles } from "@projectgate/shared";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface DiscoveredCommand {
  id: string;
  title: string;
  command: string;
  args: string[];
  group: string;
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
}

const NODE_SCRIPTS: { id: string; title: string; script: string }[] = [
  { id: "build", title: "Build", script: "build" },
  { id: "test", title: "Test", script: "test" },
  { id: "lint", title: "Lint", script: "lint" },
  { id: "typecheck", title: "Typecheck", script: "typecheck" },
];

export function discoverRepository(root: string): Discovery {
  const files = safeList(root);
  const packageJson = readJson(path.join(root, "package.json"));
  const composer = readJson(path.join(root, "composer.json"));
  const scripts = record(packageJson?.scripts);
  const dependencies = { ...record(packageJson?.dependencies), ...record(packageJson?.devDependencies) };
  const packageManager = detectPackageManager(root, packageJson);
  const frontend = detectFrontend(root, dependencies);
  const backend = detectBackend(root, dependencies);
  const languages = detectLanguages(root, files, packageJson, composer);
  const commands = [
    ...nodeCommands(packageManager ?? "npm", scripts, packageJson !== null),
    ...phpCommands(root, composer),
  ];
  const runtimeProposal = proposeRuntime(packageManager ?? "npm", scripts, packageJson !== null);
  return {
    languages,
    packageManager,
    frontend,
    backend,
    browserApp: frontend !== null || files.some((file) => file === "index.html" || file.startsWith("public/") || file.includes("/pages/") || file.startsWith("app/")),
    git: fs.existsSync(path.join(root, ".git")),
    defaultBranch: defaultBranch(root),
    testFileCount: files.filter((file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.startsWith("tests/") || file.includes("/tests/")).length,
    playwrightConfig: files.some((file) => /^playwright\.config\.[cm]?[jt]s$/.test(file)),
    cypressConfig: files.some((file) => file === "cypress.config.js" || file === "cypress.config.ts" || file.startsWith("cypress/")),
    commands: dedupeCommands(commands),
    runtimeProposal,
  };
}

export function discoverCommands(root: string): DiscoveredCommand[] {
  return discoverRepository(root).commands;
}

function nodeCommands(packageManager: string, scripts: Record<string, string>, hasPackageJson: boolean): DiscoveredCommand[] {
  if (!hasPackageJson) return [];
  const commands: DiscoveredCommand[] = [];
  for (const script of NODE_SCRIPTS) {
    if (typeof scripts[script.script] !== "string") continue;
    commands.push({
      id: script.id,
      title: script.title,
      ...scriptInvocation(packageManager, script.script),
      group: script.title,
    });
  }
  return commands;
}

function scriptInvocation(packageManager: string, script: string): { command: string; args: string[] } {
  if (packageManager === "yarn") return { command: "yarn", args: [script] };
  if (packageManager === "pnpm") return { command: "pnpm", args: script === "test" ? ["test"] : ["run", script] };
  if (script === "test") return { command: "npm", args: ["test"] };
  return { command: "npm", args: ["run", script] };
}

function phpCommands(root: string, composer: JsonRecord | null): DiscoveredCommand[] {
  const scripts = record(composer?.scripts);
  if (typeof scripts.test === "string") {
    return [{ id: "composer-test", title: "Composer test", command: "composer", args: ["test"], group: "Test" }];
  }
  if (fs.existsSync(path.join(root, "artisan")) && (fs.existsSync(path.join(root, "phpunit.xml")) || fs.existsSync(path.join(root, "phpunit.xml.dist")) || fs.existsSync(path.join(root, "tests")))) {
    return [{ id: "artisan-test", title: "Artisan test", command: "php", args: ["artisan", "test"], group: "Test" }];
  }
  if (fs.existsSync(path.join(root, "vendor", "bin", "phpunit")) || fs.existsSync(path.join(root, "vendor", "bin", "phpunit.bat"))) {
    const binary = process.platform === "win32" && fs.existsSync(path.join(root, "vendor", "bin", "phpunit.bat")) ? "vendor/bin/phpunit.bat" : "vendor/bin/phpunit";
    return [{ id: "phpunit", title: "PHPUnit", command: binary, args: [], group: "Test" }];
  }
  return [];
}

function proposeRuntime(packageManager: string, scripts: Record<string, string>, hasPackageJson: boolean): string | null {
  if (!hasPackageJson) return null;
  const script = ["dev", "start", "serve", "preview"].find((name) => typeof scripts[name] === "string");
  if (!script) return null;
  const invocation = scriptInvocation(packageManager, script);
  return [invocation.command, ...invocation.args].join(" ");
}

function detectPackageManager(root: string, packageJson: JsonRecord | null): string | null {
  if (!packageJson && !fs.existsSync(path.join(root, "composer.json"))) return null;
  const field = packageJson?.packageManager;
  if (typeof field === "string") {
    if (field.startsWith("pnpm")) return "pnpm";
    if (field.startsWith("yarn")) return "yarn";
    if (field.startsWith("npm")) return "npm";
  }
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "package-lock.json")) || packageJson) return "npm";
  if (fs.existsSync(path.join(root, "composer.json"))) return "composer";
  return null;
}

function detectFrontend(root: string, dependencies: Record<string, string>): string | null {
  const has = (name: string) => typeof dependencies[name] === "string";
  const vite = has("vite") || exists(root, "vite.config.ts") || exists(root, "vite.config.js") || exists(root, "vite.config.mjs");
  if (has("next") || exists(root, "next.config.ts") || exists(root, "next.config.js") || exists(root, "next.config.mjs")) return vite ? "Next.js + Vite" : "Next.js";
  if (has("react")) return vite ? "React + Vite" : "React";
  if (has("vue")) return vite ? "Vue + Vite" : "Vue";
  if (vite) return "Vite";
  return null;
}

function detectBackend(root: string, dependencies: Record<string, string>): string | null {
  if (exists(root, "artisan")) return "Laravel";
  if (exists(root, "composer.json")) return "PHP";
  if (typeof dependencies["express"] === "string") return "Express";
  if (typeof dependencies["fastify"] === "string") return "Fastify";
  return null;
}

function detectLanguages(root: string, files: string[], packageJson: JsonRecord | null, composer: JsonRecord | null): string[] {
  const languages: string[] = [];
  if (files.some((file) => file.endsWith(".ts") || file.endsWith(".tsx")) || exists(root, "tsconfig.json")) languages.push("TypeScript");
  if (packageJson && !languages.includes("TypeScript")) languages.push("JavaScript");
  if (files.some((file) => file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".mjs")) && !languages.includes("JavaScript") && !languages.includes("TypeScript")) languages.push("JavaScript");
  if (composer || files.some((file) => file.endsWith(".php"))) languages.push("PHP");
  return languages;
}

function defaultBranch(root: string): string | null {
  if (!fs.existsSync(path.join(root, ".git"))) return null;
  const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return head && head !== "HEAD" ? head : null;
}

function git(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  const text = result.stdout.trim();
  return text.length > 0 ? text : null;
}

function dedupeCommands(commands: DiscoveredCommand[]): DiscoveredCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    if (seen.has(command.id)) return false;
    seen.add(command.id);
    return true;
  });
}

function safeList(root: string): string[] {
  try {
    return listProjectFiles(root);
  } catch {
    return [];
  }
}

type JsonRecord = Record<string, unknown>;

function readJson(file: string): JsonRecord | null {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") entries[key] = item;
  }
  return entries;
}

function exists(root: string, file: string): boolean {
  return fs.existsSync(path.join(root, file));
}
