import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "./main.js";

describe("cli", () => {
  it("initializes a project once and prints help", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-cli-"));
    const io = capture();
    expect(await runCli(["init", "--cwd", root, "--name", "Demo"], io)).toBe(0);
    const project = path.join(root, ".projectgate", "project.yml");
    expect(fs.readFileSync(project, "utf8")).toContain("name: Demo");
    fs.writeFileSync(project, "schema_version: 1\nproject:\n  name: Kept\n");
    expect(await runCli(["init", "--cwd", root], capture())).toBe(0);
    expect(fs.readFileSync(project, "utf8")).toContain("Kept");
    const help = capture();
    expect(await runCli(["--help"], help)).toBe(0);
    expect(help.out).toContain("audit");
    expect(help.out).toContain("doctor");
    expect(fs.existsSync(path.join(root, ".projectgate", "contract.yml"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".projectgate", "contract.template.yml"))).toBe(true);
    expect(io.out).toContain("projectgate contract --task");
    expect(io.out).not.toContain("contract.example.yml");
  });

  it("refuses to audit without a contract and rejects a placeholder contract", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-cli-contract-"));
    git(root);
    initFiles(root);
    const missing = capture();
    expect(await runCli(["audit", "--cwd", root], missing)).toBe(5);
    expect(missing.err + missing.out).toContain("NO ACTIVE CHANGE CONTRACT");
    fs.writeFileSync(
      path.join(root, ".projectgate", "contract.yml"),
      "schema_version: 1\nchange:\n  id: CHANGE-1\n  title: Example change\nintent:\n  summary: Describe what the change is supposed to accomplish.\n  users_can: []\nacceptance:\n  - id: AC-001\n    description: Replace this with a real acceptance criterion.\n    required: true\n    evidence: RUNTIME\n",
    );
    const placeholder = capture();
    expect(await runCli(["audit", "--cwd", root], placeholder)).toBe(5);
    expect(placeholder.err + placeholder.out).toContain("INVALID CHANGE CONTRACT");
  });
});

function git(cwd: string): void {
  const run = (args: string[]) => {
    const result = spawnSync("git", ["-c", "user.name=Project Gate Test", "-c", "user.email=test@projectgate.local", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  };
  run(["init", "-b", "main"]);
  fs.writeFileSync(path.join(cwd, "README.md"), "base\n");
  run(["add", "README.md"]);
  run(["commit", "-m", "base"]);
}

function initFiles(cwd: string): void {
  fs.mkdirSync(path.join(cwd, ".projectgate"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".projectgate", "project.yml"), "schema_version: 1\nproject:\n  name: Demo\n");
  fs.writeFileSync(path.join(cwd, ".projectgate", "verification.yml"), "schema_version: 1\ndiscover_baseline: false\ncommands: []\n");
  fs.writeFileSync(path.join(cwd, ".projectgate", "architecture.yml"), "schema_version: 1\n");
  fs.writeFileSync(path.join(cwd, ".projectgate", "ui.yml"), "schema_version: 1\n");
  fs.writeFileSync(path.join(cwd, ".projectgate", "security.yml"), "schema_version: 1\n");
  fs.writeFileSync(path.join(cwd, ".projectgate", "environments.yml"), "schema_version: 1\nlocal: {}\n");
}

function capture(): { stdout: (text: string) => void; stderr: (text: string) => void; out: string; err: string } {
  const io = { out: "", err: "", stdout(text: string) { this.out += text; }, stderr(text: string) { this.err += text; } };
  return io;
}
