import { SEVERITIES, type EvidenceClass, type Severity } from "@projectgate/domain";
import type { ArchitecturePolicy, ForbiddenEdge, LayerDef, SourceRule } from "@projectgate/policy-engine";
import { z } from "zod";

const severitySchema = z.enum(SEVERITIES);

export interface ShellCommandConfig {
  id: string;
  title: string;
  command: string;
  args: string[];
  criterionId?: string;
  invalidatesOn: string[];
  evidence: EvidenceClass;
  group: string;
}

export interface EnvironmentPolicy {
  name: string;
  start?: { command: string; args: string[] };
  readyUrl?: string;
  baseUrl?: string;
  portEnv?: string;
}

export interface SecurityPolicy {
  humanReviewWhen: string[];
  redactEvidence: boolean;
}

export interface UiPolicy {
  requiredStates: string[];
  viewports: { width: number; height: number }[];
  accessibility: boolean;
  visualInvalidatesOn: string[];
  minTargetPx: number;
}

export interface ProjectConfig {
  root: string;
  schemaVersion: 1;
  project: { name: string };
  commands: ShellCommandConfig[];
  architecture: ArchitecturePolicy;
  ui: UiPolicy;
  security: SecurityPolicy;
  environment?: EnvironmentPolicy;
  constitution?: string;
  timeouts: { commandMs: number; httpMs: number; browserMs: number };
  discoverBaseline: boolean;
}

export const projectFileSchema = z
  .object({
    schema_version: z.literal(1),
    project: z.object({ name: z.string().min(1) }).strict(),
    discovery: z
      .object({
        package_manager: z.string().nullable().default(null),
        languages: z.array(z.string()).default([]),
        frontend: z.string().nullable().default(null),
        backend: z.string().nullable().default(null),
        browser_app: z.boolean().default(false),
        git: z.boolean().default(false),
        runtime_proposal: z.string().nullable().default(null),
      })
      .strict()
      .optional(),
  })
  .strict();

const sourceRuleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    path_globs: z.array(z.string().min(1)).default([]),
    severity: severitySchema.default("MAJOR"),
    forbidden_imports: z.array(z.string().min(1)).default([]),
    forbidden_calls: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const architectureFileSchema = z
  .object({
    schema_version: z.literal(1),
    layers: z
      .array(
        z
          .object({
            name: z.string().min(1),
            paths: z.array(z.string()).default([]),
            namespaces: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .default([]),
    forbidden_edges: z
      .array(
        z
          .object({
            id: z.string().min(1),
            from: z.string().min(1),
            to: z.string().min(1),
            severity: severitySchema.default("MAJOR"),
            description: z.string().default(""),
          })
          .strict(),
      )
      .default([]),
    rules: z.array(sourceRuleSchema).default([]),
  })
  .strict();

export const uiFileSchema = z
  .object({
    schema_version: z.literal(1),
    required_states: z.array(z.string()).default(["loading", "empty", "error", "success"]),
    responsive: z
      .object({
        widths: z.array(z.number().int().positive()).default([390, 768, 1440]),
        heights: z.array(z.number().int().positive()).default([844, 1024, 900]),
      })
      .strict()
      .default({ widths: [390, 768, 1440], heights: [844, 1024, 900] }),
    accessibility: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
    visual: z
      .object({
        min_target_px: z.number().int().positive().default(24),
        invalidates_on: z.array(z.string()).default(["**/*.css", "**/*.html", "**/*.tsx", "**/*.jsx", "**/*.vue"]),
      })
      .strict()
      .default({
        min_target_px: 24,
        invalidates_on: ["**/*.css", "**/*.html", "**/*.tsx", "**/*.jsx", "**/*.vue"],
      }),
  })
  .strict();

export const verificationFileSchema = z
  .object({
    schema_version: z.literal(1),
    timeouts: z
      .object({
        command_ms: z.number().int().positive().default(300_000),
        http_ms: z.number().int().positive().default(15_000),
        browser_ms: z.number().int().positive().default(30_000),
      })
      .strict()
      .default({ command_ms: 300_000, http_ms: 15_000, browser_ms: 30_000 }),
    discover_baseline: z.boolean().default(true),
    commands: z
      .array(
        z
          .object({
            id: z.string().min(1),
            title: z.string().min(1),
            command: z.string().min(1),
            args: z.array(z.string()).default([]),
            criterion: z.string().min(1).optional(),
            invalidates_on: z.array(z.string().min(1)).default([]),
            evidence: z.enum(["OBSERVED", "RUNTIME", "EXECUTABLE", "STATIC", "INFERRED", "HUMAN"]).default("EXECUTABLE"),
            group: z.string().min(1).optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const securityFileSchema = z
  .object({
    schema_version: z.literal(1),
    human_review_when: z.array(z.string()).default([]),
    redact_evidence: z.boolean().default(true),
  })
  .strict();

export const environmentFileSchema = z
  .object({
    schema_version: z.literal(1),
    local: z
      .object({
        start: z
          .object({
            command: z.string().min(1),
            args: z.array(z.string()).default([]),
          })
          .strict()
          .optional(),
        ready_url: z.string().min(1).optional(),
        base_url: z.string().min(1).optional(),
        port_env: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export function toArchitecturePolicy(file: z.infer<typeof architectureFileSchema>, extraRules: z.infer<typeof sourceRuleSchema>[] = []): ArchitecturePolicy {
  const layers: LayerDef[] = file.layers.map((layer) => ({
    name: layer.name,
    paths: layer.paths,
    namespaces: layer.namespaces,
  }));
  const forbiddenEdges: ForbiddenEdge[] = file.forbidden_edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    severity: edge.severity,
    description: edge.description,
  }));
  const rules: SourceRule[] = [...file.rules, ...extraRules].map((rule) => ({
    id: rule.id,
    description: rule.description,
    pathGlobs: rule.path_globs,
    severity: rule.severity as Severity,
    forbiddenImports: rule.forbidden_imports,
    forbiddenCalls: rule.forbidden_calls,
  }));
  return { layers, forbiddenEdges, rules };
}
