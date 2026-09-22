import type { Confidence } from "@projectgate/domain";

export type FileCategory = "APPLICATION" | "TEST" | "CONFIGURATION" | "DOCUMENTATION" | "ASSET" | "GENERATED" | "PROJECT_GATE_INTERNAL" | "UNKNOWN";

export interface FileClassification {
  role: "ui" | "style" | "api-client" | "api-server" | "test" | "migration" | "config" | "documentation" | "static" | "unknown";
  category: FileCategory;
  subtype: string;
  adapter: string;
  confidence: Confidence;
  source: string;
}

export interface StackCommand {
  id: string;
  title: string;
  command: string;
  args: string[];
  group: string;
  invalidatesOn: string[];
  cwd?: string;
  ready: boolean;
}

export interface StackCapability {
  name: string;
  ready: boolean;
  adapter: string;
  source: string;
  confidence: Confidence;
}

export interface StackFact {
  name: string;
  source: string;
  confidence: Confidence;
  adapter: string;
}

export interface ModuleContribution {
  languages: StackFact[];
  frameworks: StackFact[];
  packageManagers: StackFact[];
  commands: StackCommand[];
  capabilities: StackCapability[];
  sourceRoots: string[];
  testRoots: string[];
}

export interface ModuleScan {
  repoRoot: string;
  path: string;
  files: readonly string[];
  exists(relativeToModule: string): boolean;
  read(relativeToRepo: string): string | null;
}

export interface StackAdapter {
  id: string;
  classify(file: string): FileClassification | null;
  inspect(scan: ModuleScan): ModuleContribution | null;
}

export function emptyContribution(): ModuleContribution {
  return { languages: [], frameworks: [], packageManagers: [], commands: [], capabilities: [], sourceRoots: [], testRoots: [] };
}

export function fact(name: string, source: string, adapter: string, confidence: Confidence = "observed"): StackFact {
  return { name, source, confidence, adapter };
}

export function capability(name: string, ready: boolean, adapter: string, source: string): StackCapability {
  return { name, ready, adapter, source, confidence: ready ? "observed" : "inferred" };
}
