import type { ChangeContract } from "@projectgate/contracts";
import type { Confidence, ImpactSummary } from "@projectgate/domain";
import type { LanguageModel } from "@projectgate/model";
import { isSensitivePath } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { classifyFile } from "./classify.js";
import { readImports } from "./imports.js";
import { routesInFile, type RouteHit } from "./routes.js";

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  previousPath?: string;
}

const inferenceSchema = z.array(
  z
    .object({
      from: z.string().min(1),
      to: z.string().min(1),
      relationship: z.string().min(1),
    })
    .strict(),
);

export function analyzeImpact(input: {
  root: string;
  changed: readonly ChangedFile[];
  contract?: ChangeContract;
}): ImpactSummary {
  const changedFiles = input.changed.map((file) => {
    const classification = classifyFile(file.path);
    return {
      path: file.path,
      status: file.status,
      role: classification.role,
      confidence: classification.confidence,
      source: classification.source,
    };
  });
  const edges: ImpactSummary["edges"] = [];
  const surfaces = new Map<string, ImpactSummary["surfaces"][number]>();
  const present = input.changed.filter((file) => file.status !== "deleted");

  for (const file of present) {
    if (!isTextSource(file.path)) continue;
    const base = path.basename(file.path).replace(/\.[^.]+$/, "");
    for (const candidate of input.changed) {
      if (candidate.path === file.path || !isTestPath(candidate.path)) continue;
      if (base.length > 1 && path.basename(candidate.path).includes(base)) {
        edges.push({
          from: file.path,
          to: candidate.path,
          relationship: "test-proximity",
          source: "test-proximity",
          confidence: "inferred",
        });
      }
    }
    const absolute = path.join(input.root, file.path);
    if (!fs.existsSync(absolute) || isSensitivePath(file.path)) continue;
    const text = fs.readFileSync(absolute, "utf8");
    for (const imported of readImports(input.root, file.path, text)) {
      if (!imported.resolvedPath) continue;
      edges.push({
        from: file.path,
        to: imported.resolvedPath,
        relationship: "import",
        source: "import-statement",
        confidence: "observed",
      });
    }
    for (const route of routesInFile(file.path, text)) addRoute(surfaces, route, file.path);
    addFileSurface(surfaces, file.path);
  }

  if (input.contract) {
    const related = present.map((file) => file.path);
    for (const route of input.contract.routes) {
      addSurface(surfaces, {
        id: `route:${route}`,
        relationship: "declared",
        source: "change-contract",
        confidence: "declared",
        files: related.filter((file) => classifyFile(file).role === "ui" || classifyFile(file).role === "style" || classifyFile(file).role === "api-server"),
      });
    }
    for (const criterion of input.contract.acceptance) {
      const request = criterion.verification?.verifier === "api" ? criterion.verification.request : undefined;
      if (!request) continue;
      addSurface(surfaces, {
        id: `endpoint:${request.method.toUpperCase()} ${request.path}`,
        relationship: "declared",
        source: "change-contract",
        confidence: "declared",
        files: related.filter((file) => classifyFile(file).role === "api-server"),
      });
    }
  }

  const unresolvedFiles = changedFiles
    .filter((file) => file.status !== "deleted" && isApplicationSource(file.path) && file.role === "unknown")
    .map((file) => file.path);
  return { changedFiles, surfaces: [...surfaces.values()], edges, unresolvedFiles };
}

export async function inferImpactEdges(input: {
  model: LanguageModel;
  changed: readonly ChangedFile[];
  root: string;
}): Promise<{ edges: ImpactSummary["edges"]; warning?: string }> {
  const excerpts = input.changed
    .filter((file) => file.status !== "deleted" && isTextSource(file.path) && !isSensitivePath(file.path))
    .slice(0, 20)
    .map((file) => {
      const absolute = path.join(input.root, file.path);
      const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8").slice(0, 1500) : "";
      return `${file.path}\n${text}`;
    });
  const completion = await input.model.complete({
    system: "Return a JSON array of impact edges {from,to,relationship}. No markdown. Do not claim runtime proof.",
    prompt: excerpts.join("\n---\n"),
  });
  try {
    const parsed = inferenceSchema.parse(JSON.parse(stripFence(completion.text)));
    return {
      edges: parsed.map((edge) => ({
        from: edge.from,
        to: edge.to,
        relationship: "inferred-impact",
        source: "llm",
        confidence: "inferred" as const,
      })),
    };
  } catch {
    return { edges: [], warning: "LLM impact inference returned data that did not match the edge schema. It was ignored." };
  }
}

function addFileSurface(surfaces: Map<string, ImpactSummary["surfaces"][number]>, file: string): void {
  const classification = classifyFile(file);
  if (classification.role !== "ui" && classification.role !== "api-server" && classification.role !== "api-client" && classification.role !== "migration") return;
  const kind = classification.role === "ui" ? "component" : classification.role === "migration" ? "migration" : "backend";
  addSurface(surfaces, {
    id: `${kind}:${file}`,
    relationship: "changed-file",
    source: classification.source,
    confidence: classification.confidence,
    files: [file],
  });
}

function addRoute(surfaces: Map<string, ImpactSummary["surfaces"][number]>, route: RouteHit, file: string): void {
  addSurface(surfaces, {
    id: `route:${route.path}`,
    relationship: "runtime-route",
    source: route.source,
    confidence: "observed",
    files: [file],
  });
}

function addSurface(
  surfaces: Map<string, ImpactSummary["surfaces"][number]>,
  surface: ImpactSummary["surfaces"][number],
): void {
  const existing = surfaces.get(surface.id);
  if (!existing) {
    surfaces.set(surface.id, { ...surface, files: unique(surface.files) });
    return;
  }
  if (rank(surface.confidence) > rank(existing.confidence)) {
    existing.confidence = surface.confidence;
    existing.source = surface.source;
    existing.relationship = surface.relationship;
  }
  existing.files = unique([...existing.files, ...surface.files]);
}

function rank(confidence: Confidence): number {
  if (confidence === "observed") return 3;
  if (confidence === "declared") return 2;
  return 1;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isTextSource(file: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|php|vue|css|html)$/i.test(file);
}

function isApplicationSource(file: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|php|vue)$/i.test(file);
}

function isTestPath(file: string): boolean {
  return /(?:^|[\\/])(?:__tests__|tests?)[\\/]|[\\/.](?:test|spec)\./i.test(file);
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}
