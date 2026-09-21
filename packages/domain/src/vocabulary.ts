export const SCHEMA_VERSION = 1;

export const VERDICT_STATES = ["PASS", "PASS_WITH_HUMAN_REVIEW", "BLOCKED", "INCOMPLETE_EVIDENCE"] as const;
export type VerdictState = (typeof VERDICT_STATES)[number];

export const SEVERITIES = ["CRITICAL", "MAJOR", "MINOR", "INFO"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EVIDENCE_CLASSES = ["OBSERVED", "RUNTIME", "EXECUTABLE", "STATIC", "INFERRED", "HUMAN"] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const CONFIDENCE_LEVELS = ["observed", "declared", "inferred"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const CHECK_STATUSES = ["PASSED", "FAILED", "UNKNOWN", "ERROR", "CARRIED"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export type ExecutionMode = "deterministic" | "inferred";
export type Freshness = "FRESH" | "STALE";
export type FindingStatus = "OPEN" | "RESOLVED";

const EVIDENCE_RANK: Record<EvidenceClass, number> = {
  INFERRED: 0,
  HUMAN: 1,
  STATIC: 2,
  EXECUTABLE: 3,
  RUNTIME: 4,
  OBSERVED: 5,
};

export function evidenceSatisfies(produced: EvidenceClass, required: EvidenceClass): boolean {
  if (required === "INFERRED") return true;
  if (produced === "INFERRED") return false;
  if (required === "HUMAN") return produced === "HUMAN" || produced === "OBSERVED";
  if (produced === "HUMAN") return false;
  return EVIDENCE_RANK[produced] >= EVIDENCE_RANK[required];
}

export function strongestEvidence(classes: readonly EvidenceClass[]): EvidenceClass | null {
  let best: EvidenceClass | null = null;
  for (const evidenceClass of classes) {
    if (!best || EVIDENCE_RANK[evidenceClass] > EVIDENCE_RANK[best]) best = evidenceClass;
  }
  return best;
}

export function dependencySnapshotChanged(
  previous: readonly { path: string; hash: string }[],
  current: readonly { path: string; hash: string }[],
): boolean {
  if (previous.length === 0) return true;
  if (previous.length !== current.length) return true;
  const currentHashes = new Map(current.map((file) => [file.path, file.hash]));
  return previous.some((file) => currentHashes.get(file.path) !== file.hash);
}
