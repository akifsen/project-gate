import type { CheckStatus, Confidence, EvidenceClass, ExecutionMode, FindingStatus, Freshness, Severity } from "./vocabulary.js";
import type { CriterionEvaluation, Verdict } from "./verdict.js";

export interface FileFingerprint {
  path: string;
  hash: string;
}

export interface CheckRecord {
  id: string;
  verifierId: string;
  criterionId?: string;
  title: string;
  why: string;
  group: string;
  expectedEvidence: EvidenceClass;
  producedEvidence: EvidenceClass | null;
  execution: ExecutionMode;
  status: CheckStatus;
  durationMs: number;
  dependencyPatterns: string[];
  dependencies: FileFingerprint[];
  evidenceIds: string[];
  reproduction: string[];
  suspects: string[];
  error?: string;
  carriedFromRunId?: string;
}

export interface EvidenceArtifact {
  path: string;
  mediaType: string;
  bytes: number;
}

export interface EvidenceRecord {
  id: string;
  type: string;
  evidenceClass: EvidenceClass;
  sourceVerifier: string;
  timestamp: string;
  changeId: string;
  criterionId?: string;
  checkId: string;
  runId: string;
  environment: string;
  artifacts: EvidenceArtifact[];
  freshness: Freshness;
  dependencies: FileFingerprint[];
  summary: string;
  carriedFromRunId?: string;
}

export interface Finding {
  id: string;
  stableKey: string;
  severity: Severity;
  status: FindingStatus;
  criterionId?: string;
  checkId: string;
  verifierId: string;
  title: string;
  requirement?: string;
  observed: string;
  expected?: string;
  actual?: string;
  environment: string;
  reproduction: string[];
  evidenceIds: string[];
  evidencePaths: string[];
  suspectedLocations: string[];
  evidenceClass: EvidenceClass;
  reproducible: boolean;
}

export interface ImpactSummary {
  changedFiles: {
    path: string;
    status: string;
    role: string;
    confidence: Confidence;
    source: string;
  }[];
  surfaces: {
    id: string;
    relationship: string;
    source: string;
    confidence: Confidence;
    files: string[];
  }[];
  edges: {
    from: string;
    to: string;
    relationship: string;
    source: string;
    confidence: Confidence;
  }[];
  unresolvedFiles?: string[];
}

export interface UiStateResult {
  id: string;
  label: string;
  state: "VERIFIED" | "MISSING" | "UNKNOWN";
}

export interface ReleasePacket {
  schemaVersion: 1;
  product: string;
  runId: string;
  kind: "audit" | "verify";
  parentRunId?: string;
  generatedAt: string;
  change: {
    id: string;
    title: string;
    baseRef: string;
    headSha: string;
    dirty: boolean;
    files: string[];
  };
  contractHash: string;
  criteria: {
    total: number;
    verified: number;
    failed: number;
    unknown: number;
    items: CriterionEvaluation[];
  };
  checks: CheckRecord[];
  findings: Finding[];
  resolvedFindings: Finding[];
  findingCounts: Record<Severity, number>;
  evidence: EvidenceRecord[];
  uiStates: UiStateResult[];
  impact: ImpactSummary;
  verdict: Verdict;
  limitations: string[];
  environment: string;
}
