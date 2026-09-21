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
  });
});

function capture(): { stdout: (text: string) => void; stderr: (text: string) => void; out: string; err: string } {
  const io = { out: "", err: "", stdout(text: string) { this.out += text; }, stderr(text: string) { this.err += text; } };
  return io;
}
