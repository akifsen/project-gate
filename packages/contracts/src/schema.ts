import { EVIDENCE_CLASSES, type EvidenceClass } from "@projectgate/domain";
import { EXIT_CONFIG, ProjectGateError, canonicalJson, sha256Text } from "@projectgate/shared";
import fs from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

const evidenceSchema = z.enum(EVIDENCE_CLASSES);

const stepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), value: z.string().min(1) }).strict(),
  z.object({ action: z.literal("reload") }).strict(),
  z.object({ action: z.literal("click"), selector: z.string().min(1) }).strict(),
  z.object({ action: z.literal("fill"), selector: z.string().min(1), value: z.string() }).strict(),
  z
    .object({
      action: z.literal("upload"),
      selector: z.string().min(1),
      filename: z.string().min(1),
      content_type: z.string().min(1),
      bytes: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z.object({ action: z.literal("assert_visible"), selector: z.string().min(1) }).strict(),
  z.object({ action: z.literal("assert_hidden"), selector: z.string().min(1) }).strict(),
  z.object({ action: z.literal("assert_present"), selector: z.string().min(1) }).strict(),
  z.object({ action: z.literal("assert_text"), selector: z.string().min(1), value: z.string() }).strict(),
  z.object({ action: z.literal("assert_image_loaded"), selector: z.string().min(1) }).strict(),
]);

const apiVerificationSchema = z
  .object({
    verifier: z.literal("api"),
    title: z.string().min(1),
    group: z.string().min(1).optional(),
    request: z
      .object({
        method: z.string().min(1),
        path: z.string().min(1),
        headers: z.record(z.string(), z.string()).optional(),
        multipart: z
          .object({
            field: z.string().min(1),
            filename: z.string().min(1),
            content_type: z.string().min(1),
            bytes: z.number().int().nonnegative().optional(),
            text: z.string().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    expect: z
      .object({
        status: z.number().int().optional(),
        status_in: z.array(z.number().int()).optional(),
      })
      .strict(),
    dependencies: z.array(z.string().min(1)).default([]),
    suspects: z.array(z.string()).default([]),
  })
  .strict();

const browserVerificationSchema = z
  .object({
    verifier: z.literal("playwright"),
    title: z.string().min(1),
    group: z.string().min(1).optional(),
    viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
    steps: z.array(stepSchema).min(1),
    dependencies: z.array(z.string().min(1)).default([]),
    suspects: z.array(z.string()).default([]),
  })
  .strict();

export const contractSchema = z
  .object({
    schema_version: z.literal(1),
    change: z.object({ id: z.string().min(1), title: z.string().min(1) }).strict(),
    intent: z
      .object({
        summary: z.string().min(1),
        users_can: z.array(z.string()).default([]),
      })
      .strict(),
    acceptance: z
      .array(
        z
          .object({
            id: z.string().min(1),
            description: z.string().min(1),
            required: z.boolean().default(true),
            evidence: evidenceSchema.default("RUNTIME"),
            origin: z.enum(["USER_SUPPLIED", "FILE_SUPPLIED", "INFERRED"]).default("USER_SUPPLIED"),
            verification: z.union([apiVerificationSchema, browserVerificationSchema]).optional(),
          })
          .strict(),
      )
      .default([]),
    ui_states: z
      .array(
        z
          .object({
            id: z.string().min(1),
            description: z.string().default(""),
            route: z.string().min(1),
            viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
            steps: z.array(stepSchema).min(1),
            dependencies: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .default([]),
    responsive: z
      .array(z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict())
      .default([]),
    routes: z.array(z.string().min(1)).default([]),
    invariants: z
      .array(
        z
          .object({
            id: z.string().min(1),
            description: z.string().min(1),
            required: z.boolean().default(false),
            evidence: evidenceSchema.default("STATIC"),
          })
          .strict(),
      )
      .default([]),
    fields: z
      .array(
        z
          .object({
            name: z.string().min(1),
            type: z.enum(["file", "string"]),
            max_bytes: z.number().int().positive().optional(),
            accept: z.array(z.string()).default([]),
            covers: z
              .object({
                accept: z.string().optional(),
                reject_oversize: z.string().optional(),
                reject_type: z.string().optional(),
                reject_empty: z.string().optional(),
              })
              .strict()
              .default({}),
            request: z
              .object({
                method: z.string().min(1),
                path: z.string().min(1),
                headers: z.record(z.string(), z.string()).optional(),
                multipart_field: z.string().min(1),
              })
              .strict(),
            dependencies: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type ContractFile = z.infer<typeof contractSchema>;
export type BrowserStep = z.infer<typeof stepSchema>;
export type ApiVerification = z.infer<typeof apiVerificationSchema>;
export type BrowserVerification = z.infer<typeof browserVerificationSchema>;

export interface ChangeContract extends ContractFile {
  filePath: string;
  hash: string;
}

export function loadContract(filePath: string): ChangeContract {
  if (!fs.existsSync(filePath)) {
    throw new ProjectGateError(missingContractMessage(filePath), "CONTRACT", EXIT_CONFIG);
  }
  let raw: unknown;
  try {
    raw = parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new ProjectGateError(`Could not parse contract ${filePath}: ${error instanceof Error ? error.message : String(error)}`, "CONTRACT", 64);
  }
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProjectGateError(`Invalid change contract ${filePath}: ${parsed.error.message}`, "CONTRACT", 64);
  }
  assertUnique(parsed.data.acceptance.map((item) => item.id), "acceptance criteria");
  assertUnique(parsed.data.invariants.map((item) => item.id), "invariants");
  assertUnique(parsed.data.ui_states.map((item) => item.id), "UI states");
  return {
    ...parsed.data,
    filePath,
    hash: sha256Text(canonicalJson(parsed.data)),
  };
}

export function contractHash(contract: ContractFile): string {
  return sha256Text(canonicalJson(contract));
}

export function missingContractMessage(filePath: string): string {
  return [
    "NO ACTIVE CHANGE CONTRACT",
    "",
    "Project Gate can see the repository, but it does not yet know what the change is supposed to accomplish.",
    `Expected an active contract at ${filePath}.`,
    "",
    "Create one:",
    "",
    "projectgate contract --task \"Describe the change\"",
    "",
    "projectgate contract --from-file TASK.md",
    "",
    "projectgate contract --from-diff",
  ].join("\n");
}

export function placeholderProblems(contract: ContractFile): string[] {
  const problems: string[] = [];
  if (PLACEHOLDER_TITLES.some((pattern) => pattern.test(contract.change.title))) problems.push(`Title "${contract.change.title}" is placeholder text.`);
  if (PLACEHOLDER_SUMMARIES.some((pattern) => pattern.test(contract.intent.summary))) problems.push("The intent summary is still the template text.");
  for (const criterion of contract.acceptance) {
    if (PLACEHOLDER_CRITERIA.some((pattern) => pattern.test(criterion.description.trim()))) {
      problems.push(`${criterion.id} description is placeholder text: ${criterion.description.trim()}`);
    }
  }
  return problems;
}

export function invalidContractMessage(problems: readonly string[]): string {
  return [
    "INVALID CHANGE CONTRACT",
    "",
    "The active contract appears to contain example or placeholder content.",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "Create a real contract:",
    "",
    "projectgate contract --task \"Describe the change\"",
  ].join("\n");
}

const PLACEHOLDER_TITLES = [/^example change$/i, /^example feature$/i, /^sample change$/i, /^sample$/i];
const PLACEHOLDER_SUMMARIES = [/^describe what the change is supposed to accomplish\.?$/i];
const PLACEHOLDER_CRITERIA = [
  /^replace this with a real acceptance criterion\.?$/i,
  /^replace me\.?$/i,
  /^todo$/i,
  /^sample$/i,
  /^example acceptance criterion\.?$/i,
];

function assertUnique(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new ProjectGateError(`Duplicate ${label} id ${id}.`, "CONTRACT", 64);
    seen.add(id);
  }
}

export function evidenceOf(value: EvidenceClass): EvidenceClass {
  return value;
}
