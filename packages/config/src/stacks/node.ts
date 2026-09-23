import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { nodeRoutes } from "./surfaces.js";
import { abs, command, globs, moduleFile, modulePrefix, readJson, recordOf, toolOnPath, safeManifestScript } from "./tools.js";

const SCRIPTS = [
  { id: "build", title: "Build", script: "build", group: "Build" },
  { id: "test", title: "Test", script: "test", group: "Test" },
  { id: "lint", title: "Lint", script: "lint", group: "Lint" },
  { id: "typecheck", title: "Typecheck", script: "typecheck", group: "Typecheck" },
  { id: "check", title: "Check", script: "check", group: "Check" },
  { id: "e2e", title: "End to end", script: "e2e", group: "E2E" },
  { id: "integration", title: "Integration", script: "integration", group: "Integration" },
] as const;

export const nodeAdapter: StackAdapter = {
  id: "node",
  routes: (file, text) => /\.[cm]?[jt]sx?$/.test(file) ? nodeRoutes(file, text) : [],
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (/(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|bun\.lockb)$/.test(file)) {
      return classified("config", "CONFIGURATION", "CONFIG", "observed", "node-manifest");
    }
    if (/(^|\/)[^/]*\.config\.[cm]?[jt]sx?$/.test(file)) return classified("config", "CONFIGURATION", "CONFIG", "observed", "node-config");
    if (!/\.(?:[cm]?[jt]sx?|vue|svelte|html|css|scss|sass|less)$/.test(base)) return null;
    if (file.startsWith("public/") && /\.(html|js|mjs)$/.test(base)) return classified("ui", "APPLICATION", "PAGE", "observed", "node-public");
    if (/(?:^|\/)(?:pages|app)\/api\//.test(file)) return classified("api-server", "APPLICATION", "ROUTE", "inferred", "node-api-route");
    if (/Api\.[tj]sx?$/.test(base) || file.includes("/services/") || file.includes("/api/")) {
      return classified("api-client", "APPLICATION", "SERVICE", "inferred", "node-path");
    }
    if (/(^|\/)(pages|app|components|features)\//.test(file) && /\.(tsx|jsx|vue|html)$/.test(base)) {
      const page = file.includes("/pages/") || file.includes("/app/");
      return classified("ui", "APPLICATION", page ? "PAGE" : "COMPONENT", page ? "observed" : "inferred", "node-path");
    }
    if (/\.(tsx|jsx|vue|svelte|html)$/.test(base)) return classified("ui", "APPLICATION", "COMPONENT", "inferred", "node-extension");
    if (/^server\.[cm]?js$/.test(base) || base === "server.mjs") return classified("api-server", "APPLICATION", "ROUTE", "inferred", "node-server");
    if (/\.(css|scss|sass|less)$/.test(base)) return classified("style", "APPLICATION", "STYLE", "observed", "node-style");
    if (/\.[cm]?[jt]s$/.test(base)) return classified("unknown", "APPLICATION", "OTHER", "observed", "node-source");
    return null;
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    const manifest = moduleFile(scan, "package.json");
    const pkg = readJson(abs(scan, "package.json"));
    if (!pkg) return null;
    const scripts = recordOf(pkg.scripts);
    const dependencies = { ...recordOf(pkg.dependencies), ...recordOf(pkg.devDependencies) };
    const manager = packageManager(scan, pkg);
    const result = emptyContribution();
    const hasTs = scan.files.some((file) => file.endsWith(".ts") || file.endsWith(".tsx")) || scan.exists("tsconfig.json");
    result.languages.push(fact(hasTs ? "TypeScript" : "JavaScript", manifest, "node"));
    const frontend = frontendName(scan, dependencies);
    if (frontend) result.frameworks.push(fact(frontend, manifest, "node"));
    const backend = backendName(dependencies);
    if (backend) result.frameworks.push(fact(backend, manifest, "node"));
    if (manager) result.packageManagers.push(fact(manager, manifest, "node"));
    const ready = toolOnPath(manager ?? "npm");
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".css", ".scss", ".html"]);
    for (const script of SCRIPTS) {
      if (typeof scripts[script.script] !== "string") continue;
      if (!safeManifestScript(scripts, script.script)) {
        result.capabilities.push({ name: script.title, ready: false, adapter: "node", source: `package.json scripts.${script.script}: mutating command; requires explicit configuration`, confidence: "observed" });
        continue;
      }
      const invocation = scriptInvocation(manager ?? "npm", script.script);
      result.commands.push(command({
        id: `${prefix}${script.id}`,
        title: scan.path === "." ? script.title : `${script.title} (${scan.path})`,
        ...invocation,
        group: script.title,
        invalidatesOn: patterns,
        ...(scan.path === "." ? {} : { cwd: scan.path }),
        ready,
        source: `${manifest} scripts.${script.script}`,
      }));
      result.capabilities.push({ name: script.title, ready, adapter: "node", source: `package.json scripts.${script.script}`, confidence: "observed" });
    }
    const runtime = ["dev", "start", "serve", "preview"].find((name) => typeof scripts[name] === "string");
    if (runtime) result.capabilities.push({ name: `runtime ${runtime}`, ready: false, adapter: "node", source: "package.json script is not started automatically", confidence: "inferred" });
    if (scan.files.some((file) => file.includes("/components/") || file.includes("/pages/"))) result.sourceRoots.push(scan.path === "." ? "src" : scan.path);
    return result;
  },
};

function classified(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "node", confidence, source };
}

function packageManager(scan: ModuleScan, pkg: Record<string, unknown>): string | null {
  const field = pkg.packageManager;
  if (typeof field === "string") {
    if (field.startsWith("pnpm")) return "pnpm";
    if (field.startsWith("yarn")) return "yarn";
    if (field.startsWith("bun")) return "bun";
    if (field.startsWith("npm")) return "npm";
  }
  if (scan.exists("pnpm-lock.yaml")) return "pnpm";
  if (scan.exists("yarn.lock")) return "yarn";
  if (scan.exists("bun.lock") || scan.exists("bun.lockb")) return "bun";
  if (scan.exists("package-lock.json") || scan.exists("package.json")) return "npm";
  return "npm";
}

function scriptInvocation(manager: string, script: string): { command: string; args: string[] } {
  if (manager === "yarn") return { command: "yarn", args: [script] };
  if (manager === "pnpm") return { command: "pnpm", args: script === "test" ? ["test"] : ["run", script] };
  if (manager === "bun") return { command: "bun", args: ["run", script] };
  if (script === "test") return { command: "npm", args: ["test"] };
  return { command: "npm", args: ["run", script] };
}

function frontendName(scan: ModuleScan, dependencies: Record<string, string>): string | null {
  const has = (name: string) => typeof dependencies[name] === "string";
  const vite = has("vite") || scan.exists("vite.config.ts") || scan.exists("vite.config.js") || scan.exists("vite.config.mjs");
  if (has("next") || scan.exists("next.config.ts") || scan.exists("next.config.js") || scan.exists("next.config.mjs")) return vite ? "Next.js + Vite" : "Next.js";
  if (has("@angular/core")) return "Angular";
  if (has("nuxt") || scan.exists("nuxt.config.ts") || scan.exists("nuxt.config.js")) return "Nuxt";
  if (has("@sveltejs/kit")) return "SvelteKit";
  if (has("svelte")) return "Svelte";
  if (has("react")) return vite ? "React + Vite" : "React";
  if (has("vue")) return vite ? "Vue + Vite" : "Vue";
  if (vite) return "Vite";
  return null;
}

function backendName(dependencies: Record<string, string>): string | null {
  if (typeof dependencies["@nestjs/core"] === "string") return "NestJS";
  if (typeof dependencies["fastify"] === "string") return "Fastify";
  if (typeof dependencies["express"] === "string") return "Express";
  return null;
}

export function nodeRuntimeProposal(scan: ModuleScan): string | null {
  const pkg = readJson(abs(scan, "package.json"));
  if (!pkg) return null;
  const scripts = recordOf(pkg.scripts);
  const manager = packageManager(scan, pkg) ?? "npm";
  const script = ["dev", "start", "serve", "preview"].find((name) => typeof scripts[name] === "string");
  if (!script) return null;
  const invocation = scriptInvocation(manager, script);
  return [invocation.command, ...invocation.args].join(" ");
}
