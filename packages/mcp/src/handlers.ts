import { toFixPacket } from "@projectgate/agent-adapter";
import { initProject } from "@projectgate/config";
import { loadContract, proposeContract } from "@projectgate/contracts";
import { audit, createChangeContract, inspectProject, latestPacket, planVerification, verify } from "@projectgate/core";
import { modelFromEnv } from "@projectgate/model";
import { product, ProjectGateError } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";

export interface ToolResult {
  ok: true;
  data: unknown;
}

export const toolNames = [
  "projectgate.inspect_project",
  "projectgate.inspect_change",
  "projectgate.create_contract",
  "projectgate.plan_verification",
  "projectgate.run_verification",
  "projectgate.get_findings",
  "projectgate.get_evidence",
  "projectgate.reverify",
  "projectgate.get_verdict",
  "projectgate.get_release_packet",
] as const;

export async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const cwd = typeof args.cwd === "string" ? path.resolve(args.cwd) : process.cwd();
  switch (name) {
    case "projectgate.inspect_project":
      return { ok: true, data: await inspectProject(cwd, stringArg(args.against)) };
    case "projectgate.inspect_change": {
      const inspected = await inspectProject(cwd, stringArg(args.against));
      return { ok: true, data: { change: inspected.change ?? null, surfaces: inspected.surfaces, gitError: inspected.gitError ?? null } };
    }
    case "projectgate.create_contract":
      return { ok: true, data: await createContractTool(cwd, args) };
    case "projectgate.plan_verification":
      return {
        ok: true,
        data: await planVerification({
          root: cwd,
          ...(stringArg(args.against) ? { against: stringArg(args.against) } : {}),
          ...(typeof args.contractPath === "string" ? { contractPath: path.resolve(cwd, args.contractPath) } : {}),
        }),
      };
    case "projectgate.run_verification": {
      const packet = await audit({
        root: cwd,
        ...(stringArg(args.against) ? { against: stringArg(args.against) } : {}),
        ...(typeof args.contractPath === "string" ? { contractPath: path.resolve(cwd, args.contractPath) } : {}),
        ...(args.infer === true ? { infer: true } : {}),
      });
      return { ok: true, data: { runId: packet.runId, verdict: packet.verdict, findings: toFixPacket(packet).findings } };
    }
    case "projectgate.reverify": {
      const packet = await verify({ root: cwd, ...(typeof args.contractPath === "string" ? { contractPath: path.resolve(cwd, args.contractPath) } : {}) });
      return { ok: true, data: { runId: packet.runId, verdict: packet.verdict, findings: toFixPacket(packet).findings } };
    }
    case "projectgate.get_findings":
      return { ok: true, data: toFixPacket(requiredPacket(cwd)) };
    case "projectgate.get_evidence":
      return { ok: true, data: requiredPacket(cwd).evidence.map((item) => ({ id: item.id, type: item.type, evidenceClass: item.evidenceClass, summary: item.summary, artifacts: item.artifacts, freshness: item.freshness, checkId: item.checkId })) };
    case "projectgate.get_verdict":
      return { ok: true, data: requiredPacket(cwd).verdict };
    case "projectgate.get_release_packet":
      return { ok: true, data: requiredPacket(cwd) };
    default:
      throw new ProjectGateError(`Unknown Project Gate tool ${name}.`, "USAGE", 64);
  }
}

async function createContractTool(cwd: string, args: Record<string, unknown>): Promise<unknown> {
  if (!fs.existsSync(path.join(cwd, product.configDir, "project.yml"))) initProject(cwd, path.basename(cwd));
  if (typeof args.description === "string") {
    const model = modelFromEnv();
    if (!model) throw new ProjectGateError("No LLM provider is configured, so a contract cannot be proposed.", "CONFIG", 2);
    const output = path.join(cwd, product.configDir, "contract.proposed.yml");
    return proposeContract({ description: args.description, model, outputPath: output });
  }
  if (typeof args.task === "string" || typeof args.fromFile === "string" || args.fromDiff === true) {
    const draft = await createChangeContract({
      root: cwd,
      ...(typeof args.task === "string" ? { task: args.task } : {}),
      ...(typeof args.fromFile === "string" ? { fromFile: args.fromFile } : {}),
      ...(args.fromDiff === true ? { fromDiff: true } : {}),
      ...(args.replace === true ? { replace: true } : {}),
      ...(typeof args.against === "string" ? { against: args.against } : {}),
    });
    return { id: draft.contract.change.id, title: draft.contract.change.title, hash: draft.contract.hash, criteria: draft.contract.acceptance.map((item) => item.id), warnings: draft.warnings, filePath: draft.filePath };
  }
  const file = path.join(cwd, product.configDir, "contract.yml");
  if (!fs.existsSync(file)) throw new ProjectGateError(`No contract at ${file}. Use task, fromFile, or fromDiff.`, "CONTRACT", 5);
  const contract = loadContract(file);
  return { id: contract.change.id, title: contract.change.title, hash: contract.hash, criteria: contract.acceptance.map((item) => item.id) };
}

function requiredPacket(cwd: string) {
  const packet = latestPacket(cwd);
  if (!packet) throw new ProjectGateError("No Project Gate run exists yet.", "USAGE", 64);
  return packet;
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
