import type { Severity } from "@projectgate/domain";

export interface LayerDef {
  name: string;
  paths: string[];
  namespaces: string[];
}

export interface ForbiddenEdge {
  id: string;
  from: string;
  to: string;
  severity: Severity;
  description: string;
}

export interface SourceRule {
  id: string;
  description: string;
  pathGlobs: string[];
  severity: Severity;
  forbiddenImports: string[];
  forbiddenCalls: string[];
}

export interface ArchitecturePolicy {
  layers: LayerDef[];
  forbiddenEdges: ForbiddenEdge[];
  rules: SourceRule[];
}

export interface ImportRef {
  specifier: string;
  resolvedPath?: string;
}

export interface PolicyViolation {
  ruleId: string;
  severity: Severity;
  file: string;
  message: string;
  source: "typescript-ast" | "php-ast";
}
