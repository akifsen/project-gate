import { EXIT_CONFIG, product, ProjectGateError, stableId } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { ContractFile } from "./schema.js";

export type CriterionOrigin = "USER_SUPPLIED" | "FILE_SUPPLIED" | "INFERRED";

export function buildTaskContract(task: string, origin: CriterionOrigin): ContractFile {
  const text = task.trim();
  if (!text) throw new ProjectGateError("The change description is empty.", "CONTRACT", EXIT_CONFIG);
  const title = text.split("\n")[0]?.slice(0, 80) || "Change";
  return {
    schema_version: 1,
    change: { id: stableId("CHG", text), title },
    intent: { summary: text, users_can: [] },
    acceptance: [
      {
        id: "AC-001",
        description: text,
        required: true,
        evidence: "EXECUTABLE",
        origin,
      },
    ],
    ui_states: [],
    responsive: [],
    routes: [],
    invariants: [],
    fields: [],
  };
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
