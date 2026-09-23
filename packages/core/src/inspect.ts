import { discoverRepository, loadProject, type Discovery } from "@projectgate/config";
import type { ChangeContract } from "@projectgate/contracts";
import { loadContract, placeholderProblems } from "@projectgate/contracts";
import { analyzeImpact, collectChange, type ChangeSet } from "@projectgate/impact-engine";
import { product } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { createDefaultRegistry } from "./registry.js";

export interface InspectResult {
  projectName: string;
  root: string;
  discovery: Discovery;
  routeCount: number;
  verifiers: string[];
  contract?: { id: string; title: string; criteria: number; required: number; hash: string; placeholder: boolean };
  change?: ChangeSet;
  surfaces: number;
  unresolved: string[];
  classified: { path: string; status: string; role: string; category?: string; subtype?: string; adapter?: string; confidence: string; source: string }[];
  gitError?: string;
}

export async function inspectProject(root: string, against?: string): Promise<InspectResult> {
  const config = loadProject(root);
  const discovery = discoverRepository(root);
  const contractPath = path.join(root, product.configDir, "contract.yml");
  const contract = fs.existsSync(contractPath) ? loadContract(contractPath) : undefined;
  let change: ChangeSet | undefined;
  let gitError: string | undefined;
  try {
    change = await collectChange(root, against);
  } catch (error) {
    gitError = error instanceof Error ? error.message : String(error);
  }
  const impact = change ? analyzeImpact({ root, changed: change.files, ...(contract ? { contract } : {}) }) : undefined;
  return {
    projectName: config.project.name,
    root,
    discovery,
    routeCount: discovery.modules.reduce((count, module) => count + module.routes.length, 0),
    verifiers: createDefaultRegistry().all().map((verifier) => verifier.id),
    ...(contract ? { contract: summarizeContract(contract) } : {}),
    ...(change ? { change } : {}),
    surfaces: impact?.surfaces.length ?? 0,
    unresolved: impact?.unresolvedFiles ?? [],
    classified: impact?.changedFiles ?? [],
    ...(gitError ? { gitError } : {}),
  };
}

function summarizeContract(contract: ChangeContract): NonNullable<InspectResult["contract"]> {
  return {
    id: contract.change.id,
    title: contract.change.title,
    criteria: contract.acceptance.length,
    required: contract.acceptance.filter((item) => item.required).length,
    hash: contract.hash,
    placeholder: placeholderProblems(contract).length > 0,
  };
}

export function formatInspect(result: InspectResult, verbose = false): string {
  const discovery = result.discovery;
  const lines = [
    `${product.name} — Repository Inspection`,
    "",
    "Repository",
    `  Root: ${result.root}`,
    `  Branch: ${discovery.defaultBranch ?? "unknown"}`,
    "",
    "Detected stack",
    `  Languages: ${discovery.languages.join(", ") || "not detected"}`,
    `  Frontend: ${discovery.frontend ?? "not detected"}`,
    `  Backend: ${discovery.backend ?? "not detected"}`,
    `  Package manager: ${discovery.packageManager ?? "not detected"}`,
    ...moduleLines(discovery, verbose),
    "",
    "Commands",
    ...(discovery.commands.length === 0 ? ["  none discovered"] : discovery.commands.map((command) => `  ${command.id.padEnd(16)} ${command.command} ${command.args.join(" ")}`.trim())),
    ...unavailableCommands(discovery),
    "",
    "Browser application",
    `  Detected: ${discovery.browserApp ? "yes" : "no"}`,
    `  Playwright config: ${discovery.playwrightConfig ? "yes" : "no"}`,
    `  Cypress config: ${discovery.cypressConfig ? "yes" : "no"}`,
    discovery.runtimeProposal ? `  Proposed start (not enabled): ${discovery.runtimeProposal}` : "  Proposed start: none",
    "",
    "Routes",
    `  ${result.routeCount} discovered`,
    "",
    "Tests",
    `  ${discovery.testFileCount} discovered`,
    "",
    "Project Gate",
    "  Configuration: valid",
    result.contract
      ? `  Change Contract: ${result.contract.placeholder ? "placeholder" : "active"} ${result.contract.id} — ${result.contract.title} (${result.contract.criteria} criteria, ${result.contract.required} required)`
      : "  Change Contract: not created",
    `  Verifiers ready: ${result.verifiers.length}`,
  ];
  if (result.gitError) lines.push(`  Git: ${result.gitError}`);
  else if (result.change) {
    lines.push("", "Change", `  Base: ${result.change.baseRef}`, `  Head: ${result.change.headSha}`, `  Files changed: ${result.change.files.length}`, `  Product surfaces: ${result.surfaces}`, `  Unresolved files: ${result.unresolved.length}`);
    if (verbose) {
      lines.push("", "Classified files");
      for (const file of result.classified) {
        lines.push(`  ${file.status} ${file.path}`);
        lines.push(`    ${file.category ?? file.role}/${file.subtype ?? file.role} adapter=${file.adapter ?? "path"} confidence=${file.confidence} source=${file.source}`);
      }
      if (result.unresolved.length > 0) {
        lines.push("", "Unresolved", ...result.unresolved.map((file) => `  ${file}`));
      }
    }
  }
  if (!result.contract) {
    lines.push("", "Next:", "", `projectgate contract --task "Describe the change"`);
  } else if (result.contract.placeholder) {
    lines.push("", "Next:", "", `projectgate contract --task "Describe the change" --replace`);
  } else {
    lines.push("", "Next:", "", "projectgate audit");
  }
  return lines.join("\n");
}

function moduleLines(discovery: Discovery, verbose: boolean): string[] {
  const visible = discovery.modules.filter((module) => module.languages.length > 0 || module.frameworks.length > 0);
  if (visible.length === 0) return [];
  const lines = ["", "Modules"];
  for (const module of visible) {
    lines.push("", module.path);
    for (const item of [...module.languages, ...module.frameworks, ...module.packageManagers]) lines.push(`  ${item}`);
    const structure = [...module.sourceRoots, ...module.testRoots];
    if (structure.length > 0) lines.push(`  structure: ${structure.join(", ")}`);
    if (verbose && module.adapterIds.length > 0) lines.push(`  adapters: ${module.adapterIds.join(", ")}`);
    if (verbose) {
      for (const item of [...module.detections.languages, ...module.detections.frameworks, ...module.detections.packageManagers]) {
        lines.push(`  detection: ${item.name} source=${item.source} confidence=${item.confidence} adapter=${item.adapter}`);
      }
      for (const item of module.manifests) lines.push(`  manifest: ${item.name} adapter=${item.adapter}`);
      for (const command of module.commands) lines.push(`  command: ${command.id} source=${command.source} confidence=${command.confidence} adapter=${command.adapter}`);
      for (const surface of module.productSurfaces) lines.push(`  surface: ${surface.type} ${surface.name} file=${surface.file} source=${surface.source} confidence=${surface.confidence} adapter=${surface.adapter}`);
      for (const capability of module.capabilities) {
        lines.push(`  capability: ${capability.name} ready=${capability.ready} source=${capability.source} adapter=${capability.adapter}`);
      }
    }
  }
  return lines;
}

function unavailableCommands(discovery: Discovery): string[] {
  const missing = discovery.modules.flatMap((module) => module.commands.filter((command) => !command.ready));
  if (missing.length === 0) return [];
  return ["", "Commands not executable", ...missing.map((command) => `  ${command.id}: ${command.command} is not ready; check tooling and project setup (${command.source ?? "discovered capability"})`)];
}

export function detectStack(root: string): string[] {
  const discovery = discoverRepository(root);
  return [discovery.frontend, discovery.backend, ...discovery.languages, discovery.packageManager].filter((item): item is string => Boolean(item));
}
