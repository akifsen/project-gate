import { ProjectGateError, product } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { discoverCommands } from "./discover.js";
import {
  architectureFileSchema,
  environmentFileSchema,
  projectFileSchema,
  securityFileSchema,
  toArchitecturePolicy,
  uiFileSchema,
  verificationFileSchema,
  type ProjectConfig,
  type ShellCommandConfig,
} from "./schema.js";

const ruleDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    rules: architectureFileSchema.shape.rules,
  })
  .strict();

export function loadProject(root: string): ProjectConfig {
  const dir = path.join(root, product.configDir);
  const projectFile = readYaml(path.join(dir, "project.yml"), projectFileSchema);
  if (!projectFile) {
    throw new ProjectGateError(
      `No ${product.name} project file at ${product.configDir}/project.yml. Run \`${product.command} init\` in the repository.`,
      "CONFIG",
      64,
    );
  }
  const architectureFile = readYaml(path.join(dir, "architecture.yml"), architectureFileSchema) ?? architectureFileSchema.parse({ schema_version: 1 });
  const extraRules = readRuleFiles(path.join(dir, "rules"));
  const ui = readYaml(path.join(dir, "ui.yml"), uiFileSchema) ?? uiFileSchema.parse({ schema_version: 1 });
  const verification = readYaml(path.join(dir, "verification.yml"), verificationFileSchema) ?? verificationFileSchema.parse({ schema_version: 1 });
  const security = readYaml(path.join(dir, "security.yml"), securityFileSchema) ?? securityFileSchema.parse({ schema_version: 1 });
  const environmentFile = readYaml(path.join(dir, "environments.yml"), environmentFileSchema);
  const constitutionPath = path.join(dir, "constitution.md");
  const constitution = fs.existsSync(constitutionPath) ? fs.readFileSync(constitutionPath, "utf8") : undefined;
  const heights = ui.responsive.heights;
  const local = environmentFile?.local;
  const environment = local
    ? {
        name: "local" as const,
        ...(local.start ? { start: local.start } : {}),
        ...(local.ready_url ? { readyUrl: local.ready_url } : {}),
        ...(local.base_url ? { baseUrl: local.base_url } : {}),
        ...(local.port_env ? { portEnv: local.port_env } : {}),
      }
    : undefined;
  return {
    root,
    schemaVersion: 1,
    project: { name: projectFile.project.name },
    commands: mergeCommands(root, verification.discover_baseline, verification.commands.map((command) => {
      const mapped: ShellCommandConfig = {
        id: command.id,
        title: command.title,
        command: command.command,
        args: command.args,
        invalidatesOn: command.invalidates_on,
        evidence: command.evidence,
        group: command.group ?? command.title,
      };
      if (command.criterion) mapped.criterionId = command.criterion;
      if (command.cwd) mapped.cwd = command.cwd;
      if (command.env) mapped.env = command.env;
      return mapped;
    })),
    discoverBaseline: verification.discover_baseline,
    architecture: toArchitecturePolicy(architectureFile, extraRules),
    ui: {
      requiredStates: ui.required_states,
      viewports: ui.responsive.widths.map((width, index) => ({
        width,
        height: heights[index] ?? heights[heights.length - 1] ?? 900,
      })),
      accessibility: ui.accessibility.enabled,
      visualInvalidatesOn: ui.visual.invalidates_on,
      minTargetPx: ui.visual.min_target_px,
    },
    security: {
      humanReviewWhen: security.human_review_when,
      redactEvidence: security.redact_evidence,
    },
    ...(environment ? { environment } : {}),
    ...(constitution ? { constitution } : {}),
    timeouts: {
      commandMs: verification.timeouts.command_ms,
      httpMs: verification.timeouts.http_ms,
      browserMs: verification.timeouts.browser_ms,
    },
  };
}

function mergeCommands(root: string, discoverBaseline: boolean, configured: ShellCommandConfig[]): ShellCommandConfig[] {
  if (!discoverBaseline) return configured;
  const known = new Set(configured.map((command) => command.id));
  const discovered = discoverCommands(root)
    .filter((command) => !known.has(command.id))
    .map((command) => {
      const mapped: ShellCommandConfig = {
        id: command.id,
        title: command.title,
        command: command.command,
        args: command.args,
        invalidatesOn: command.invalidatesOn,
        evidence: "EXECUTABLE" as const,
        group: command.group,
      };
      if (command.cwd) mapped.cwd = command.cwd;
      if (command.env) mapped.env = command.env;
      return mapped;
    });
  return [...configured, ...discovered];
}

function readRuleFiles(dir: string): z.infer<typeof architectureFileSchema>["rules"] {
  if (!fs.existsSync(dir)) return [];
  const rules: z.infer<typeof architectureFileSchema>["rules"] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const parsed = readYaml(path.join(dir, name), ruleDocumentSchema);
    if (parsed) rules.push(...parsed.rules);
  }
  return rules;
}

function readYaml<S extends z.ZodType>(file: string, schema: S): z.output<S> | undefined {
  if (!fs.existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new ProjectGateError(`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`, "CONFIG", 64);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ProjectGateError(`Invalid configuration in ${file}: ${result.error.message}`, "CONFIG", 64);
  }
  return result.data;
}
