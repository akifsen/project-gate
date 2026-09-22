import { linkCommandCriterion } from "@projectgate/config";
import {
  buildDiffContract,
  buildTaskContract,
  invalidContractMessage,
  loadContract,
  placeholderProblems,
  writeActiveContract,
  type ChangeContract,
} from "@projectgate/contracts";
import { classifyFile, collectChange } from "@projectgate/impact-engine";
import type { LanguageModel } from "@projectgate/model";
import { EXIT_CONFIG, product, ProjectGateError } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";

export interface ContractDraft {
  filePath: string;
  contract: ChangeContract;
  inferred: number;
  linkedTest: boolean;
  warnings: string[];
}

export function requireActiveContract(root: string, contractPath?: string): ChangeContract {
  const file = contractPath ?? path.join(root, product.configDir, "contract.yml");
  const contract = loadContract(file);
  const problems = placeholderProblems(contract);
  if (problems.length > 0) throw new ProjectGateError(invalidContractMessage(problems), "CONTRACT", EXIT_CONFIG);
  return contract;
}

export async function createChangeContract(options: {
  root: string;
  task?: string;
  fromFile?: string;
  fromDiff?: boolean;
  replace?: boolean;
  against?: string;
}): Promise<ContractDraft> {
  const selected = [options.task, options.fromFile, options.fromDiff ? "diff" : undefined].filter(Boolean);
  if (selected.length !== 1) {
    throw new ProjectGateError("Choose one of --task, --from-file, or --from-diff.", "USAGE", 64);
  }
  const warnings: string[] = [];
  let inferred = 0;
  let contractFile;
  if (options.task) contractFile = buildTaskContract(options.task, "USER_SUPPLIED");
  else if (options.fromFile) {
    const absolute = path.resolve(options.root, options.fromFile);
    if (!fs.existsSync(absolute)) throw new ProjectGateError(`Requirement file not found: ${absolute}`, "CONTRACT", EXIT_CONFIG);
    contractFile = buildTaskContract(fs.readFileSync(absolute, "utf8"), "FILE_SUPPLIED");
  } else {
    const change = await collectChange(options.root, options.against);
    if (change.files.length === 0) throw new ProjectGateError("No git change was found to infer a contract from.", "GIT", EXIT_CONFIG);
    const criteria = criteriaFromChange(change.files.map((file) => file.path));
    inferred = criteria.length;
    contractFile = buildDiffContract({
      summary: `Inferred from ${change.files.length} changed file(s) against ${change.baseRef}. These criteria are not authoritative requirements.`,
      criteria,
    });
    warnings.push(`${inferred} criteria inferred from the implementation. Review them before treating them as authoritative requirements.`);
  }
  const filePath = writeActiveContract(options.root, contractFile, options.replace ?? false);
  const singleExecutable = contractFile.acceptance.length === 1 && contractFile.acceptance[0]?.evidence === "EXECUTABLE";
  const linkedTest = singleExecutable ? linkBaselineTest(options.root, contractFile.acceptance[0]?.id ?? "AC-001") : false;
  if (contractFile.acceptance.some((item) => item.origin === "INFERRED")) {
    warnings.push("Inferred criteria are marked origin INFERRED. They do not become proof.");
  }
  if (singleExecutable && !linkedTest) {
    warnings.push("No discovered test command was linked. Add one under .projectgate/verification.yml or run projectgate init after the test script exists.");
  }
  if (contractFile.acceptance.length > 1) {
    warnings.push("Separated requirements stay independent. One test command is not treated as proof for every criterion.");
  }
  return { filePath, contract: loadContract(filePath), inferred, linkedTest, warnings };
}

export function contractGuidance(): string {
  return [
    "No active Change Contract.",
    "",
    "Create one with:",
    "",
    "projectgate contract --task \"Describe the change\"",
    "",
    "projectgate contract --from-file TASK.md",
    "",
    "projectgate contract --from-diff",
  ].join("\n");
}

const BASELINE_COMMANDS = ["test", "composer-test", "artisan-test", "flutter-test", "dart-test", "maven-test", "gradle-test", "android-test", "pytest", "django-test", "unittest", "dotnet-test", "go-test", "cargo-test"];

function linkBaselineTest(root: string, criterionId: string): boolean {
  return BASELINE_COMMANDS.some((id) => linkCommandCriterion(root, id, criterionId));
}

function criteriaFromChange(files: string[]): { description: string; evidence: "RUNTIME" | "EXECUTABLE" | "STATIC" }[] {
  const roles = new Set(files.map((file) => classifyFile(file).role));
  const criteria: { description: string; evidence: "RUNTIME" | "EXECUTABLE" | "STATIC" }[] = [];
  if (roles.has("ui") || roles.has("style")) {
    criteria.push({ description: "Changed UI still renders without overflow or a broken state on the affected screens.", evidence: "RUNTIME" });
  }
  if (roles.has("api-server") || roles.has("api-client")) {
    criteria.push({ description: "Changed API behavior still rejects unauthorized or invalid requests.", evidence: "RUNTIME" });
  }
  if (roles.has("migration")) {
    criteria.push({ description: "The migration applies without changing unrelated stored data.", evidence: "RUNTIME" });
  }
  if (criteria.length === 0 && roles.has("test")) {
    criteria.push({ description: "The changed tests pass.", evidence: "EXECUTABLE" });
  }
  if (criteria.length === 0) {
    criteria.push({ description: "The changed files do not break the repository's baseline build and tests.", evidence: "EXECUTABLE" });
  }
  return criteria;
}

export function modelNote(model: LanguageModel | null): string | null {
  return model ? `Model ${model.id} is configured. Contract text above is still not runtime evidence.` : null;
}
