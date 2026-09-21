import { ProjectGateError, runProcess, toPosix } from "@projectgate/shared";
import type { ChangedFile } from "./analyze.js";

export interface ChangeSet {
  baseRef: string;
  headSha: string;
  dirty: boolean;
  files: ChangedFile[];
}

export async function collectChange(root: string, against?: string): Promise<ChangeSet> {
  await assertGit(root);
  const head = await git(root, ["rev-parse", "HEAD"]);
  const status = await git(root, ["status", "--porcelain"]);
  const dirty = status.stdout.trim().length > 0;
  const baseRef = against ?? (dirty ? "HEAD" : await defaultBase(root));
  const diff = await git(root, ["diff", "--name-status", "--find-renames", baseRef]);
  const untracked = await git(root, ["ls-files", "--others", "--exclude-standard"]);
  const files = parseNameStatus(diff.stdout);
  for (const line of untracked.stdout.split(/\r?\n/)) {
    const relative = toPosix(line.trim());
    if (!relative || relative.startsWith(".projectgate/runtime/")) continue;
    if (!files.some((file) => file.path === relative)) files.push({ path: relative, status: "added" });
  }
  return {
    baseRef,
    headSha: head.stdout.trim(),
    dirty,
    files: files.filter((file) => !file.path.startsWith(".projectgate/runtime/")),
  };
}

async function defaultBase(root: string): Promise<string> {
  if (await refExists(root, "main")) return "main";
  if (await refExists(root, "master")) return "master";
  return "HEAD";
}

async function refExists(root: string, ref: string): Promise<boolean> {
  const result = await runProcess({ command: "git", args: ["rev-parse", "--verify", "--quiet", ref], cwd: root, timeoutMs: 15_000 });
  return result.exitCode === 0;
}

function parseNameStatus(stdout: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      const from = toPosix(parts[1] ?? "");
      const to = toPosix(parts[2] ?? "");
      if (to) files.push({ path: to, status: "renamed", previousPath: from });
      continue;
    }
    const file = toPosix(parts[1] ?? "");
    if (!file) continue;
    if (status.startsWith("A")) files.push({ path: file, status: "added" });
    else if (status.startsWith("D")) files.push({ path: file, status: "deleted" });
    else files.push({ path: file, status: "modified" });
  }
  return files;
}

async function assertGit(root: string): Promise<void> {
  const result = await runProcess({ command: "git", args: ["rev-parse", "--is-inside-work-tree"], cwd: root, timeoutMs: 15_000 });
  if (result.exitCode !== 0) {
    throw new ProjectGateError("This directory is not a git repository. Project Gate change detection uses git.", "GIT", 64);
  }
}

async function git(root: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await runProcess({ command: "git", args, cwd: root, timeoutMs: 30_000 });
  if (result.exitCode !== 0) {
    throw new ProjectGateError(result.stderr || result.spawnError || `git ${args.join(" ")} failed`, "GIT");
  }
  return result;
}
