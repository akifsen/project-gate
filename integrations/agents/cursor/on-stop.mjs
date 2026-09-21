#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/cli/dist/main.js");

function respond(message) {
  process.stdout.write(message ? `${JSON.stringify({ followup_message: message })}\n` : "{}\n");
}

await new Promise((resolve) => {
  if (process.stdin.isTTY) {
    resolve();
    return;
  }
  process.stdin.resume();
  process.stdin.on("end", resolve);
  process.stdin.on("error", resolve);
});

if (!fs.existsSync(cli)) {
  respond("Project Gate CLI is not built. Run npm run build, then projectgate audit.");
  process.exit(0);
}

const audit = spawnSync(process.execPath, [cli, "audit", "--cwd", root], { encoding: "utf8" });
const code = audit.status ?? 3;
if (code === 0 || code === 4) {
  respond();
  process.exit(0);
}

const fix = spawnSync(process.execPath, [cli, "report", "--cwd", root, "--format", "fix"], { encoding: "utf8" });
const body = (fix.stdout || audit.stderr || audit.stdout || "Project Gate could not complete the audit.").trim();
respond(`Project Gate did not pass (exit ${code}). Fix the findings, then run projectgate verify.\n\n${body}`);
process.exit(0);
