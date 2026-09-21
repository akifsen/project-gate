import { loadProject } from "@projectgate/config";
import type { ChangeContract } from "@projectgate/contracts";
import { loadContract } from "@projectgate/contracts";
import { analyzeImpact, collectChange, type ChangeSet } from "@projectgate/impact-engine";
import { product } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";

export interface InspectResult {
  projectName: string;
  root: string;
  stack: string[];
  contract?: { id: string; title: string; criteria: number; hash: string };
  change?: ChangeSet;
  surfaces: number;
  gitError?: string;
}

export async function inspectProject(root: string, against?: string): Promise<InspectResult> {
  const config = loadProject(root);
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
    stack: detectStack(root),
    ...(contract ? { contract: summarizeContract(contract) } : {}),
    ...(change ? { change } : {}),
    surfaces: impact?.surfaces.length ?? 0,
    ...(gitError ? { gitError } : {}),
  };
}

function summarizeContract(contract: ChangeContract): NonNullable<InspectResult["contract"]> {
  return {
    id: contract.change.id,
    title: contract.change.title,
    criteria: contract.acceptance.length,
    hash: contract.hash,
  };
}

export function detectStack(root: string): string[] {
  const stack: string[] = [];
  const exists = (file: string) => fs.existsSync(path.join(root, file));
  if (exists("package.json")) stack.push("node");
  if (exists("composer.json")) stack.push("php");
  if (exists("artisan")) stack.push("laravel");
  if (exists("next.config.ts") || exists("next.config.js") || exists("next.config.mjs")) stack.push("next");
  if (exists("vite.config.ts") || exists("vite.config.js")) stack.push("vite");
  return stack.length > 0 ? stack : ["unknown"];
}

export function formatInspect(result: InspectResult): string {
  const lines = [
    product.name,
    "",
    `Project: ${result.projectName}`,
    `Stack: ${result.stack.join(", ")}`,
    result.contract ? `Contract: ${result.contract.id} — ${result.contract.title} (${result.contract.criteria} criteria)` : "Contract: none",
  ];
  if (result.gitError) lines.push(`Git: ${result.gitError}`);
  else if (result.change) {
    lines.push(`Base: ${result.change.baseRef}`, `Head: ${result.change.headSha}`, `Files changed: ${result.change.files.length}`, `Surfaces: ${result.surfaces}`);
    for (const file of result.change.files.slice(0, 30)) lines.push(`  ${file.status} ${file.path}`);
  }
  return lines.join("\n");
}
