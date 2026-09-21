import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repo, "packages/cli/dist/main.js");
const fixture = path.join(repo, "fixtures/avatar-profile");

if (!fs.existsSync(cli)) {
  console.error("Build Project Gate first: npm run build");
  process.exit(3);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-demo-"));
fs.cpSync(fixture, root, { recursive: true });
git(root, ["init", "-b", "main"]);
git(root, ["add", "README.md"]);
git(root, ["commit", "-m", "base"]);

console.log(`Demo repository: ${root}\n`);
const blocked = run(root, ["audit", "--cwd", root]);
if (blocked !== 1) {
  console.error(`Expected the broken avatar change to be BLOCKED (exit 1). Got ${blocked}.`);
  process.exit(1);
}

for (const relative of ["auth.mjs", "store.mjs", "public/styles.css", "public/main.js"]) {
  fs.copyFileSync(path.join(root, "fixed", relative), path.join(root, relative));
}

const passed = run(root, ["verify", "--cwd", root]);
if (passed !== 0) {
  console.error(`Expected the fixed avatar change to PASS (exit 0). Got ${passed}.`);
  process.exit(passed === null ? 3 : 1);
}

console.log(`\nRelease packet: ${path.join(root, ".projectgate", "runtime", "latest.json")}`);

function run(cwd, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, stdio: "inherit" });
  return result.status;
}

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "user.name=Project Gate Demo", "-c", "user.email=demo@projectgate.local", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
    process.exit(3);
  }
}
