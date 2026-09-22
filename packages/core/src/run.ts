import { discoverRepository, loadProject, type ProjectConfig } from "@projectgate/config";
import { loadContract, type ChangeContract } from "@projectgate/contracts";
import { requireActiveContract } from "./contract-flow.js";
import type { Finding, ImpactSummary, ReleasePacket } from "@projectgate/domain";
import { dependencySnapshotChanged } from "@projectgate/domain";
import { openStore } from "@projectgate/evidence";
import { analyzeImpact, collectChange, inferImpactEdges, type ChangeSet } from "@projectgate/impact-engine";
import type { LanguageModel } from "@projectgate/model";
import { modelFromEnv } from "@projectgate/model";
import { renderHtml } from "@projectgate/report";
import { createRunId, expandPatterns, matchAnyGlob, product, ProjectGateError } from "@projectgate/shared";
import type { BrowserPool, VerifierRegistry } from "@projectgate/verifier-sdk";
import fs from "node:fs";
import path from "node:path";
import { toFixPacket } from "@projectgate/agent-adapter";
import { startEnvironment } from "./environment.js";
import { executeChecks } from "./execute.js";
import { assemblePacket, reconcileFindings } from "./packet.js";
import { createDefaultRegistry } from "./registry.js";
import { openBrowserPool } from "@projectgate/browser";

export interface RunOptions {
  root: string;
  against?: string;
  contractPath?: string;
  registry?: VerifierRegistry;
  infer?: boolean;
  model?: LanguageModel | null;
}

export async function audit(options: RunOptions): Promise<ReleasePacket> {
  return runPipeline({ ...options, kind: "audit" });
}

export async function verify(options: RunOptions): Promise<ReleasePacket> {
  return runPipeline({ ...options, kind: "verify" });
}

async function runPipeline(options: RunOptions & { kind: "audit" | "verify" }): Promise<ReleasePacket> {
  const config = loadProject(options.root);
  const contractPath = options.contractPath ?? path.join(options.root, product.configDir, "contract.yml");
  const contract = requireActiveContract(options.root, contractPath);
  const before = fs.readFileSync(contractPath);
  const change = await collectChange(options.root, options.against);
  const registry = options.registry ?? createDefaultRegistry();
  const store = openStore(options.root);
  try {
    const previous = options.kind === "verify" ? store.latest() : null;
    if (options.kind === "verify" && !previous) {
      throw new ProjectGateError("No previous Project Gate run exists. Run an audit before verify.", "USAGE", 64);
    }
    const limitations: string[] = [];
    let impact = analyzeImpact({ root: options.root, changed: change.files, contract });
    if (options.infer) {
      const model = options.model === undefined ? modelFromEnv() : options.model;
      if (!model) limitations.push("Impact inference was requested, but no LLM provider is configured. Only deterministic impact was recorded.");
      else {
        const inferred = await inferImpactEdges({ model, changed: change.files, root: options.root });
        impact = { ...impact, edges: [...impact.edges, ...inferred.edges] };
        if (inferred.warning) limitations.push(inferred.warning);
      }
    }
    const unresolved = impact.unresolvedFiles ?? [];
    if (unresolved.length > 0 && impact.surfaces.length === 0) {
      limitations.push(
        [
          "IMPACT ANALYSIS INCOMPLETE",
          `${change.files.length} files changed`,
          `${unresolved.length} application files`,
          "0 resolved product surfaces",
          "Unable to confidently map:",
          ...unresolved.slice(0, 20).map((file) => `- ${file}`),
          "Fallback verification still runs any discovered or configured baseline commands.",
          "Run projectgate inspect --verbose for mapping diagnostics.",
        ].join("\n"),
      );
    } else if (unresolved.length > 0) {
      limitations.push(`Unresolved files (${unresolved.length}): ${unresolved.slice(0, 12).join(", ")}. Baseline checks still run. Use projectgate inspect --verbose for the classification of each file.`);
    }
    if (change.files.length === 0) {
      const packet = assemblePacket({
        runId: createRunId(),
        kind: options.kind,
        ...(previous ? { parentRunId: previous.runId } : {}),
        generatedAt: new Date().toISOString(),
        change,
        contract,
        checks: [],
        evidence: [],
        findings: [],
        resolvedFindings: [],
        impact,
        humanReviewRequired: false,
        limitations: ["No change detected.", ...limitations],
        environment: "local",
      });
      packet.verdict = {
        state: "INCOMPLETE_EVIDENCE",
        verified: 0,
        failed: 0,
        unknown: packet.criteria.total,
        total: packet.criteria.total,
        reasons: [`No change detected against ${change.baseRef}.`],
      };
      packet.criteria.unknown = packet.criteria.total;
      packet.criteria.verified = 0;
      return persist(options.root, store, packet);
    }
    const planning = {
      root: options.root,
      contract,
      config,
      changedFiles: change.files.map((file) => file.path),
    };
    const planned = registry
      .all()
      .filter((verifier) => verifier.supports(planning))
      .flatMap((verifier) => verifier.plan(planning));
    const runtimePlanned = planned.some((check) => check.verifierId === "playwright" || check.verifierId === "visual" || check.verifierId === "accessibility" || check.verifierId === "api");
    if (!runtimePlanned && (contract.routes.length > 0 || contract.ui_states.length > 0 || contract.acceptance.some((item) => item.evidence === "RUNTIME"))) {
      if (!config.environment?.start && !config.environment?.baseUrl) {
        limitations.push("Browser and API runtime checks were not all available. Reason: no application start command or base URL is configured. Set local.start and local.ready_url or local.base_url in .projectgate/environments.yml, then run projectgate verify.");
      } else if (contract.routes.length === 0 && contract.ui_states.length === 0 && !contract.acceptance.some((item) => item.verification)) {
        limitations.push("No browser route checks were planned because the contract does not name routes or UI states. Baseline commands still run.");
      }
    }
    explainPlanningGaps(limitations, impact, config, change, planned);
    if (planned.length === 0) {
      limitations.push("No checks were planned. Project Gate did not find a ready command whose files overlap this change. Run projectgate inspect --verbose. Configured commands and toolchain baselines are used only when they apply; Project Gate does not install dependencies during audit.");
    }
    const ids = new Set<string>();
    for (const check of planned) {
      if (ids.has(check.id)) throw new ProjectGateError(`Duplicate check id ${check.id}.`, "INTERNAL");
      ids.add(check.id);
    }
    const contractChanged = previous ? previous.contractHash !== contract.hash : false;
    const carried = [];
    const pending = [];
    for (const check of planned) {
      const prior = previous?.checks.find((item) => item.id === check.id);
      const fresh =
        !contractChanged &&
        prior &&
        prior.dependencyPatterns.join("\0") === check.dependencyPatterns.join("\0") &&
        (prior.status === "PASSED" || prior.status === "CARRIED") &&
        !dependencySnapshotChanged(prior.dependencies, expandPatterns(options.root, prior.dependencyPatterns));
      if (fresh && prior && previous) {
        carried.push({ check: prior, evidence: previous.evidence.filter((item) => item.checkId === prior.id) });
      } else pending.push(check);
    }
    const needsBrowser = pending.some((check) => ["playwright", "visual", "accessibility"].includes(check.verifierId));
    const needsApp = pending.some((check) => ["playwright", "visual", "accessibility", "api"].includes(check.verifierId));
    const environment = needsApp ? await startEnvironment(config) : { stop: async () => {}, baseUrl: config.environment?.baseUrl };
    if (environment.startError) limitations.push(`Application did not start: ${environment.startError}`);
    let browser: BrowserPool | null = null;
    let browserUnavailableReason = environment.startError;
    if (needsBrowser && !environment.startError) {
      try {
        browser = await openBrowserPool();
      } catch (error) {
        browserUnavailableReason = error instanceof Error ? error.message : String(error);
        limitations.push(`Browser runtime is unavailable: ${browserUnavailableReason}`);
      }
    }
    const runId = createRunId();
    try {
      const executed = await executeChecks({
        runId,
        checks: pending,
        carried,
        registry,
        context: {
          root: options.root,
          runDir: path.join(options.root, product.configDir, "runtime", "runs", runId),
          config,
          ...(environment.baseUrl ? { baseUrl: environment.baseUrl } : {}),
          environmentName: "local",
          changeId: contract.change.id,
          now: () => new Date(),
          browser,
          ...(browserUnavailableReason ? { browserUnavailableReason } : {}),
          timeouts: config.timeouts,
          redact: config.security.redactEvidence,
        },
      });
      const reconciled = previous
        ? reconcileFindings({ previous: previous.findings, next: executed.findings, checks: executed.checks, plannedIds: ids })
        : { open: executed.findings, resolved: [] as Finding[], limitations: [] as string[] };
      const packet = assemblePacket({
        runId,
        kind: options.kind,
        ...(previous ? { parentRunId: previous.runId } : {}),
        generatedAt: new Date().toISOString(),
        change,
        contract,
        checks: executed.checks,
        evidence: executed.evidence,
        findings: reconciled.open,
        resolvedFindings: reconciled.resolved,
        impact,
        humanReviewRequired: humanReview(config.security.humanReviewWhen, change),
        limitations: [...limitations, ...reconciled.limitations],
        environment: environment.baseUrl ?? "local",
      });
      if (!fs.readFileSync(contractPath).equals(before)) {
        throw new ProjectGateError("The audit modified the change contract. This is a product defect.", "INTERNAL");
      }
      return persist(options.root, store, packet);
    } finally {
      await browser?.close();
      await environment.stop();
    }
  } finally {
    store.close();
  }
}

function humanReview(patterns: readonly string[], change: ChangeSet): boolean {
  return change.files.some((file) => matchAnyGlob(patterns, file.path));
}

function persist(root: string, store: ReturnType<typeof openStore>, packet: ReleasePacket): ReleasePacket {
  const profiled = withModules(root, packet);
  store.save(profiled);
  const runDir = path.join(root, product.configDir, "runtime", "runs", packet.runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "report.html"), renderHtml(profiled));
  fs.writeFileSync(path.join(runDir, "fix-packet.json"), `${JSON.stringify(toFixPacket(profiled), null, 2)}\n`);
  return profiled;
}

function withModules(root: string, packet: ReleasePacket): ReleasePacket {
  try {
    const modules = discoverRepository(root).modules
      .filter((module) => module.languages.length > 0 || module.frameworks.length > 0 || module.commands.length > 0)
      .map((module) => ({
        path: module.path,
        languages: module.languages,
        frameworks: module.frameworks,
        packageManagers: module.packageManagers,
        checks: module.commands.filter((command) => command.ready).map((command) => `${command.command} ${command.args.join(" ")}`.trim()),
      }));
    return { ...packet, modules };
  } catch {
    return packet;
  }
}

function explainPlanningGaps(
  limitations: string[],
  impact: ImpactSummary,
  config: ProjectConfig,
  change: ChangeSet,
  planned: { id: string }[],
): void {
  const plannedIds = new Set(planned.map((check) => check.id));
  let skipped = 0;
  for (const command of config.commands) {
    if (plannedIds.has(`shell:${command.id}`) || change.files.length === 0 || command.invalidatesOn.length === 0) continue;
    const matched = change.files.some((file) => matchAnyGlob(command.invalidatesOn, file.path) || (command.cwd !== undefined && (file.path === command.cwd || file.path.startsWith(`${command.cwd}/`))));
    if (matched) continue;
    if (skipped < 8) {
      limitations.push(`${command.title} skipped: changed files do not overlap ${command.cwd ?? "this command"}.`);
    }
    skipped += 1;
  }
  const dartChanged = impact.changedFiles.some((file) => file.adapter === "dart" && (file.category === "APPLICATION" || file.category === "TEST"));
  const flutterReady = config.commands.some((command) => command.command === "flutter" || command.command === "dart");
  if (dartChanged && !flutterReady) {
    limitations.push("Dart or Flutter files changed, but flutter/dart is not available for baseline checks. Install the SDK or add a command in .projectgate/verification.yml. Project Gate does not install packages or run platform builds during audit.");
  }
  if (impact.changedFiles.some((file) => file.adapter === "dart" && (file.subtype === "SCREEN" || file.subtype === "PAGE"))) {
    limitations.push("Native Flutter runtime verifier is unavailable. Playwright does not verify Flutter UI. Widget, golden, or integration coverage has to be configured before a screen change can be proved.");
  }
  const javaChanged = impact.changedFiles.some((file) => file.adapter === "java" && file.category === "APPLICATION");
  const javaReady = config.commands.some((command) => /mvn|mvnw|gradle/.test(command.command));
  if (javaChanged && !javaReady) {
    limitations.push("Java or Kotlin sources changed, but Maven or Gradle is not ready. Prefer the project wrapper. Project Gate does not download dependencies during audit.");
  }
}

export function latestPacket(root: string): ReleasePacket | null {
  const store = openStore(root);
  try {
    return store.latest();
  } finally {
    store.close();
  }
}

export async function planVerification(options: RunOptions): Promise<{
  changeId: string;
  contractHash: string;
  files: string[];
  checks: {
    id: string;
    verifierId: string;
    criterionId: string | null;
    title: string;
    why: string;
    group: string;
    expectedEvidence: string;
    execution: string;
    dependencyPatterns: string[];
  }[];
}> {
  const config = loadProject(options.root);
  const contract = requireActiveContract(options.root, options.contractPath);
  const change = await collectChange(options.root, options.against);
  const registry = options.registry ?? createDefaultRegistry();
  const planning = { root: options.root, contract, config, changedFiles: change.files.map((file) => file.path) };
  const checks = registry
    .all()
    .filter((verifier) => verifier.supports(planning))
    .flatMap((verifier) => verifier.plan(planning));
  return {
    changeId: contract.change.id,
    contractHash: contract.hash,
    files: change.files.map((file) => file.path),
    checks: checks.map((check) => ({
      id: check.id,
      verifierId: check.verifierId,
      criterionId: check.criterionId ?? null,
      title: check.title,
      why: check.why,
      group: check.group,
      expectedEvidence: check.expectedEvidence,
      execution: check.execution,
      dependencyPatterns: check.dependencyPatterns,
    })),
  };
}

export function contractFile(root: string, contractPath?: string): ChangeContract {
  return loadContract(contractPath ?? path.join(root, product.configDir, "contract.yml"));
}
