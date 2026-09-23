import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "@projectgate/cli";

describe("audit fixtures", () => {
  it("maps a Laravel route change to backend surfaces", async () => {
    const root = repo("pg-laravel-");
    writePackage(root, "node -e \"process.exit(0)\"");
    fs.mkdirSync(path.join(root, "routes"), { recursive: true });
    fs.mkdirSync(path.join(root, "app", "Http", "Controllers"), { recursive: true });
    fs.writeFileSync(path.join(root, "routes", "web.php"), "<?php\nRoute::get('/profile', [ProfileController::class, 'show']);\n");
    fs.writeFileSync(path.join(root, "app", "Http", "Controllers", "ProfileController.php"), "<?php\nclass ProfileController {}\n");
    commitBase(root);

    expect(await runCli(["init", "--cwd", root], capture())).toBe(0);
    expect(await runCli(["contract", "--cwd", root, "--task", "The profile route still responds."], capture())).toBe(0);
    const audit = capture();
    const code = await runCli(["audit", "--cwd", root], audit);
    expect(code === 0 || code === 1 || code === 2).toBe(true);
    const surfaces = Number(/(\d+) product surfaces affected/.exec(audit.out)?.[1] ?? "0");
    expect(surfaces).toBeGreaterThan(0);
    expect(audit.out).not.toContain("No checks ran.");
  });

  it("explains unresolved impact and still runs baseline checks", async () => {
    const root = repo("pg-custom-");
    writePackage(root, "node -e \"process.exit(0)\"");
    fs.mkdirSync(path.join(root, "src", "custom"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "custom", "thing.zig"), "const value = 1;\n");
    commitBase(root);

    expect(await runCli(["init", "--cwd", root], capture())).toBe(0);
    expect(await runCli(["contract", "--cwd", root, "--task", "The custom module still builds."], capture())).toBe(0);
    const audit = capture();
    expect(await runCli(["audit", "--cwd", root], audit)).toBe(0);
    expect(audit.out).toContain("IMPACT ANALYSIS INCOMPLETE");
    expect(audit.out).toContain("thing.zig");
    expect(audit.out).toContain("✓ Test");
    expect(audit.out).not.toContain("No checks ran.");
    expect(audit.out).toContain("PASS");
  });

  it("reports incomplete evidence when a runtime criterion has no environment", async () => {
    const root = repo("pg-runtime-");
    writePackage(root, "node -e \"process.exit(0)\"");
    fs.mkdirSync(path.join(root, "src", "pages"), { recursive: true });
    const page = path.join(root, "src", "pages", "Profile.tsx");
    fs.writeFileSync(page, "export function Profile() { return \"before\"; }\n");
    commitBase(root);
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "app"]);
    fs.writeFileSync(page, "export function Profile() { return \"after\"; }\n");

    expect(await runCli(["init", "--cwd", root], capture())).toBe(0);
    const contracted = capture();
    expect(await runCli(["contract", "--cwd", root, "--from-diff"], contracted)).toBe(0);
    expect(contracted.out).toContain("INFERRED");
    const audit = capture();
    expect(await runCli(["audit", "--cwd", root], audit)).toBe(2);
    expect(audit.out).toContain("INCOMPLETE_EVIDENCE");
    expect(audit.out).toContain("environments.yml");
    expect(audit.out).toContain("Why Project Gate cannot complete verification");
    expect(audit.out).toContain("✓ Test");
    expect(audit.out).not.toContain("No checks ran.");
  });
});

function repo(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(root, ["init", "-b", "main"]);
  return root;
}

function writePackage(root: string, testScript: string): void {
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", private: true, scripts: { test: testScript } }),
  );
}

function commitBase(root: string): void {
  fs.writeFileSync(path.join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "base"]);
}

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
