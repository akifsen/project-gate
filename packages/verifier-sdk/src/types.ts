import type { ProjectConfig } from "@projectgate/config";
import type { ChangeContract } from "@projectgate/contracts";
import type { EvidenceClass, ExecutionMode, Severity } from "@projectgate/domain";

export interface PlanningContext {
  root: string;
  contract: ChangeContract;
  config: ProjectConfig;
  changedFiles: readonly string[];
}

export interface ConsoleMessage {
  type: string;
  text: string;
}

export interface NetworkEvent {
  url: string;
  status?: number;
  error?: string;
}

export interface LayoutBox {
  tag: string;
  testId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutMetrics {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  viewport: { width: number; height: number };
  interactive: LayoutBox[];
  textOverflow: { testId: string | null; text: string }[];
  dialogs: { testId: string | null; x: number; y: number; width: number; height: number; off: boolean }[];
}

export interface AxeNode {
  target: string[];
  html: string;
  failureSummary?: string;
}

export interface AxeViolation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  help: string;
  nodes: AxeNode[];
}

export interface ManagedPage {
  goto(url: string): Promise<void>;
  reload(): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  setInputFiles(selector: string, file: { name: string; mimeType: string; buffer: Uint8Array }): Promise<void>;
  waitForVisible(selector: string, timeoutMs: number): Promise<void>;
  isVisible(selector: string): Promise<boolean>;
  count(selector: string): Promise<number>;
  textContent(selector: string): Promise<string | null>;
  imageLoaded(selector: string): Promise<boolean>;
  screenshot(absolutePath: string): Promise<void>;
  content(): Promise<string>;
  runAxe(): Promise<AxeViolation[]>;
  layoutMetrics(): Promise<LayoutMetrics>;
  consoleMessages(): readonly ConsoleMessage[];
  pageErrors(): readonly string[];
  networkEvents(): readonly NetworkEvent[];
}

export interface BrowserPool {
  withPage<T>(viewport: { width: number; height: number }, run: (page: ManagedPage) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface ExecutionContext {
  root: string;
  runDir: string;
  config: ProjectConfig;
  baseUrl?: string;
  environmentName: string;
  changeId: string;
  now: () => Date;
  browser: BrowserPool | null;
  browserUnavailableReason?: string;
  timeouts: { commandMs: number; httpMs: number; browserMs: number };
  redact: boolean;
}

export interface VerificationCheck {
  id: string;
  verifierId: string;
  criterionId?: string;
  requirement?: string;
  title: string;
  why: string;
  group: string;
  expectedEvidence: EvidenceClass;
  execution: ExecutionMode;
  severityOnFail: Severity;
  dependencyPatterns: string[];
  reproduction: string[];
  suspects: string[];
  input: unknown;
}

export interface EvidenceDraft {
  type: string;
  evidenceClass: EvidenceClass;
  summary: string;
  artifacts: { filename: string; mediaType: string; body: string | Uint8Array }[];
}

export interface FindingDraft {
  stableKey: string;
  severity: Severity;
  title: string;
  requirement?: string;
  observed: string;
  expected?: string;
  actual?: string;
  reproduction?: string[];
  suspectedLocations?: string[];
  evidenceClass: EvidenceClass;
  reproducible: boolean;
  fingerprint: string;
}

export interface VerificationResult {
  status: "PASSED" | "FAILED" | "UNKNOWN" | "ERROR";
  evidence: EvidenceDraft[];
  findings: FindingDraft[];
  error?: string;
}

export interface Verifier {
  readonly id: string;
  readonly version: string;
  supports(context: PlanningContext): boolean;
  plan(context: PlanningContext): VerificationCheck[];
  execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult>;
}

export function viewportLabel(width: number): string {
  if (width < 600) return "Mobile";
  if (width < 1100) return "Tablet";
  return "Desktop";
}

export function sourcePatterns(patterns: readonly string[]): string[] {
  if (patterns.length > 0) return [...patterns];
  return ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.php", "**/*.css", "**/*.html", "**/*.vue"];
}

export function unavailable(reason: string): VerificationResult {
  return { status: "UNKNOWN", evidence: [], findings: [], error: reason };
}
