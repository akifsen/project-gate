import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "@projectgate/cli";

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/avatar-profile");

describe("avatar fixture", () => {
  it("blocks the broken change, then verifies only the stale checks after the fix", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-avatar-"));
    fs.cpSync(fixture, root, { recursive: true });
    git(root, ["init", "-b", "main"]);
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "base"]);
    const blockedIo = capture();
    const blockedCode = await runCli(["audit", "--cwd", root], blockedIo);
    expect(blockedCode).toBe(1);
    expect(blockedIo.out).toContain("BLOCKED");
    expect(blockedIo.out).toContain("✗ Mobile");
    expect(blockedIo.out).toContain("✗ Refresh");
    expect(blockedIo.out).toContain("✗ API authorization");
    expect(blockedIo.out).toContain("✗ Server error");

    for (const relative of ["auth.mjs", "store.mjs", "public/styles.css", "public/main.js"]) {
      fs.copyFileSync(path.join(root, "fixed", relative), path.join(root, relative));
    }
    const passedIo = capture();
    const passedCode = await runCli(["verify", "--cwd", root], passedIo);
    expect(passedCode).toBe(0);
    expect(passedIo.out).toContain("PASS");
    expect(passedIo.out).toContain("✓ Mobile");
    expect(passedIo.out).toContain("✓ Refresh");
    const packetIo = capture();
    await runCli(["report", "--cwd", root, "--format", "json"], packetIo);
    const packet = JSON.parse(packetIo.out) as { checks: { id: string; status: string }[]; verdict: { state: string }; resolvedFindings: unknown[] };
    expect(packet.verdict.state).toBe("PASS");
    expect(packet.checks.find((check) => check.id === "shell:mime-unit")?.status).toBe("CARRIED");
    expect(packet.resolvedFindings.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, ".projectgate", "runtime", "runs"))).toBe(true);
  }, 180_000);
});

function capture(): { stdout: (text: string) => void; stderr: (text: string) => void; out: string; err: string } {
  return {
    out: "",
    err: "",
    stdout(text: string) {
      this.out += text;
    },
    stderr(text: string) {
      this.err += text;
    },
  };
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=Project Gate Test", "-c", "user.email=test@projectgate.local", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
}
