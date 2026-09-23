import { EXIT_CONFIG, product, ProjectGateError, stableId } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { ContractFile } from "./schema.js";

export type CriterionOrigin = "USER_SUPPLIED" | "FILE_SUPPLIED" | "INFERRED";

const RUNTIME_PATTERN = /mobile|overflow|responsive|viewport|accessible|accessibility|taşma|erişilebilir|ekran|mobil|layout/iu;

export function splitRequirements(task: string): string[] {
  const text = task.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const marker = /^([-*•]|\d+[.)])\s+(.+)$/;
  const blocks = lines.length > 1 && lines.every((line) => marker.test(line))
    ? lines.map((line) => line.replace(marker, "$2").trim())
    : mergeWrapped(lines);
  const clauses = blocks.flatMap((block) => splitClauses(block));
  const unique = [...new Set(clauses.map(cleanClause).filter((clause) => clause.length > 0))];
  return unique.length > 0 ? unique : [text];
}

export function evidenceForRequirement(description: string): "RUNTIME" | "EXECUTABLE" {
  return RUNTIME_PATTERN.test(description) ? "RUNTIME" : "EXECUTABLE";
}

export function buildTaskContract(task: string, origin: CriterionOrigin): ContractFile {
  const text = task.trim();
  if (!text) throw new ProjectGateError("The change description is empty.", "CONTRACT", EXIT_CONFIG);
  const title = text.split("\n")[0]?.slice(0, 80) || "Change";
  const acceptance = splitRequirements(text).map((description, index) => ({
    id: `AC-${String(index + 1).padStart(3, "0")}`,
    description,
    required: true,
    evidence: evidenceForRequirement(description),
    origin,
  }));
  return {
    schema_version: 1,
    change: { id: stableId("CHG", text), title },
    intent: { summary: text, users_can: [] },
    acceptance,
    ui_states: [],
    responsive: [],
    routes: [],
    invariants: [],
    fields: [],
  };
}

function mergeWrapped(lines: string[]): string[] {
  const blocks: string[] = [];
  let current = "";
  for (const line of lines) {
    const stripped = line.replace(/^([-*•]|\d+[.)])\s+/, "").trim();
    const starts = /^([-*•]|\d+[.)])\s+/.test(line) || /[.!?;]$/.test(current) || /^(?:verify|ensure|keep|must|should|the\b|[\p{Lu}])/u.test(line);
    if (!current || starts) {
      if (current) blocks.push(current);
      current = stripped;
    } else {
      current = `${current} ${stripped}`;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function splitClauses(block: string): string[] {
  const pieces = block.split(";").map((piece) => piece.trim()).filter((piece) => piece.length > 0);
  if (pieces.length > 1) return pieces;
  return block
    .split(/(?<=[.!?])\s+(?=\p{Lu})/u)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

function cleanClause(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildDiffContract(input: { summary: string; criteria: { description: string; evidence: ContractFile["acceptance"][number]["evidence"] }[] }): ContractFile {
  const acceptance = input.criteria.map((criterion, index) => ({
    id: `AC-${String(index + 1).padStart(3, "0")}`,
    description: criterion.description,
    required: true,
    evidence: criterion.evidence,
    origin: "INFERRED" as const,
  }));
  if (acceptance.length === 0) {
    acceptance.push({
      id: "AC-001",
      description: "Review the diff. Project Gate could not infer a product behavior from the changed files.",
      required: true,
      evidence: "STATIC",
      origin: "INFERRED",
    });
  }
  return {
    schema_version: 1,
    change: { id: stableId("CHG", input.summary), title: "Inferred from diff" },
    intent: { summary: input.summary, users_can: [] },
    acceptance,
    ui_states: [],
    responsive: [],
    routes: [],
    invariants: [],
    fields: [],
  };
}

export function writeActiveContract(root: string, contract: ContractFile, replace: boolean): string {
  const target = path.join(root, product.configDir, "contract.yml");
  if (fs.existsSync(target) && !replace) {
    throw new ProjectGateError(
      `An active contract already exists at ${target}. Review it, or re-run with --replace to overwrite it.`,
      "CONTRACT",
      EXIT_CONFIG,
    );
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = `# Active change contract. Project Gate will not rewrite acceptance criteria during an audit.\n${stringify(contract)}`;
  fs.writeFileSync(target, body.endsWith("\n") ? body : `${body}\n`);
  return target;
}
