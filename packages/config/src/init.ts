import { product } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { discoverRepository, type Discovery, type DiscoveredCommand } from "./discover.js";
import { verificationFileSchema } from "./schema.js";

export interface InitResult {
  created: string[];
  discovery: Discovery;
  contractActive: boolean;
}

export function initProject(root: string, projectName: string): InitResult {
  const dir = path.join(root, product.configDir);
  fs.mkdirSync(path.join(dir, "rules"), { recursive: true });
  const discovery = discoverRepository(root);
  const created: string[] = [];
  const files: Record<string, string> = {
    "constitution.md": constitution(projectName),
    "project.yml": projectYaml(projectName, discovery),
    "architecture.yml": `schema_version: 1\nlayers: []\nforbidden_edges: []\nrules: []\n`,
    "ui.yml": `schema_version: 1\nrequired_states:\n  - loading\n  - empty\n  - error\n  - success\nresponsive:\n  widths: [390, 768, 1440]\n  heights: [844, 1024, 900]\naccessibility:\n  enabled: true\nvisual:\n  min_target_px: 24\n  invalidates_on:\n    - "**/*.css"\n    - "**/*.html"\n    - "**/*.tsx"\n    - "**/*.jsx"\n    - "**/*.vue"\n`,
    "security.yml": `schema_version: 1\nhuman_review_when: []\nredact_evidence: true\n`,
    "environments.yml": `schema_version: 1\nlocal: {}\n`,
    "contract.template.yml": contractTemplate(),
  };
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) continue;
    fs.writeFileSync(target, contents);
    created.push(`${product.configDir}/${name}`);
  }
  mergeVerification(dir, discovery, created);
  const ignore = path.join(root, ".gitignore");
  const line = `${product.configDir}/runtime/`;
  const existing = fs.existsSync(ignore) ? fs.readFileSync(ignore, "utf8") : "";
  if (!existing.includes(line)) {
    fs.appendFileSync(ignore, `${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${line}\n`);
    created.push(".gitignore");
  }
  return {
    created,
    discovery,
    contractActive: fs.existsSync(path.join(dir, "contract.yml")),
  };
}

function projectYaml(projectName: string, discovery: Discovery): string {
  return stringify({
    schema_version: 1,
    project: { name: projectName },
    discovery: {
      package_manager: discovery.packageManager,
      languages: discovery.languages,
      frontend: discovery.frontend,
      backend: discovery.backend,
      browser_app: discovery.browserApp,
      git: discovery.git,
      runtime_proposal: discovery.runtimeProposal,
      modules: discovery.modules
        .filter((module) => module.languages.length > 0 || module.frameworks.length > 0 || module.commands.length > 0)
        .map((module) => ({
          path: module.path,
          languages: module.languages,
          frameworks: module.frameworks,
          package_managers: module.packageManagers,
          source_roots: module.sourceRoots,
          test_roots: module.testRoots,
          capabilities: module.capabilities.map((item) => item.name),
          commands: module.commands.filter((command) => command.ready).map((command) => command.id),
        })),
    },
  });
}

function verificationYaml(discovery: Discovery): string {
  return stringify({
    schema_version: 1,
    timeouts: { command_ms: 300000, http_ms: 15000, browser_ms: 30000 },
    discover_baseline: true,
    commands: discovery.commands.map(commandRecord),
  });
}

function commandRecord(command: DiscoveredCommand): {
  id: string;
  title: string;
  command: string;
  args: string[];
  evidence: "EXECUTABLE";
  group: string;
  invalidates_on: string[];
  cwd?: string;
} {
  return {
    id: command.id,
    title: command.title,
    command: command.command,
    args: command.args,
    evidence: "EXECUTABLE",
    group: command.group,
    invalidates_on: command.invalidatesOn.length > 0 ? command.invalidatesOn : ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.php", "**/*.vue", "**/*.css", "**/*.html"],
    ...(command.cwd ? { cwd: command.cwd } : {}),
  };
}

function mergeVerification(dir: string, discovery: Discovery, created: string[]): void {
  const target = path.join(dir, "verification.yml");
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, verificationYaml(discovery));
    created.push(`${product.configDir}/verification.yml`);
    return;
  }
  const parsed = verificationFileSchema.safeParse(parse(fs.readFileSync(target, "utf8")));
  if (!parsed.success) return;
  const known = new Set(parsed.data.commands.map((command) => command.id));
  const additions = discovery.commands.filter((command) => !known.has(command.id)).map(commandRecord);
  if (additions.length === 0) return;
  parsed.data.commands.push(...additions);
  fs.writeFileSync(target, stringify(parsed.data));
  created.push(`${product.configDir}/verification.yml`);
}

function constitution(projectName: string): string {
  return `# ${projectName} constitution\n\nLong-lived rules for this repository live here in prose.\nMachine-checked rules belong in architecture.yml, ui.yml, verification.yml, and security.yml.\n\nThe auditing process must not change acceptance criteria to make a change pass.\n`;
}

function contractTemplate(): string {
  return `# This file is a template. It is not an active Change Contract.\n# Create the active contract with:\n#   projectgate contract --task "Describe the change"\n#\n# schema_version: 1\n# change:\n#   id: CHANGE-1\n#   title: Example change\n# acceptance:\n#   - id: AC-001\n#     description: Replace this with a real acceptance criterion.\n`;
}
