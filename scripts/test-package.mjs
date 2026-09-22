import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { clearTimeout, setTimeout } from "node:timers";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "release");
const forbidden = ["node_modules/", ".git/", ".github/", "coverage/", ".projectgate/runtime", "/src/", "fixtures/", ".tgz"];

function quote(value) {
  if (value.length === 0) return "\"\"";
  if (!/[\s"&|<>^%]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function run(command, args, options = {}) {
  const cwd = options.cwd ?? root;
  const windowsShim = process.platform === "win32" && ["npm", "npx", "projectgate", "projectgate-mcp"].includes(command);
  const executable = windowsShim ? process.env.ComSpec ?? "cmd.exe" : command;
  const commandArgs = windowsShim ? ["/d", "/s", "/c", [command, ...args].map(quote).join(" ")] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}) in ${cwd}\n${output}`);
  return { status: result.status, output, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function pack(dryRun) {
  const args = ["pack", "--json"];
  if (dryRun) args.push("--dry-run");
  const result = run("npm", args, { cwd: releaseDir });
  const start = result.stdout.indexOf("[");
  const end = result.stdout.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error(`npm pack did not return JSON:\n${result.stdout}`);
  const parsed = JSON.parse(result.stdout.slice(start, end + 1));
  const info = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!info?.filename) throw new Error(`npm pack did not return a filename:\n${result.stdout}`);
  return info;
}

function assertContents(info) {
  const names = info.files.map((file) => String(file.path).replaceAll("\\", "/").replace(/^package\//, ""));
  const required = [
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "bin/projectgate.js",
    "bin/projectgate-mcp.js",
    "dist/cli.js",
    "dist/mcp.js",
  ];
  for (const file of required) {
    if (!names.includes(file)) throw new Error(`Tarball is missing ${file}`);
  }
  for (const file of names) {
    if (forbidden.some((part) => file.includes(part))) throw new Error(`Tarball includes ${file}`);
  }
  return names;
}

function assertNoWorkspaceImports(directory) {
  for (const name of ["cli.js", "mcp.js"]) {
    const file = path.join(directory, "dist", name);
    const text = fs.readFileSync(file, "utf8");
    const leaked = text.match(/from\s*["']@projectgate\/|import\s*\(\s*["']@projectgate\/|require\(\s*["']@projectgate\//g);
    if (leaked) throw new Error(`${file} still imports ${[...new Set(leaked)].join(", ")}`);
    if (!text.includes("playwright") && name === "cli.js") throw new Error("CLI bundle does not reference playwright");
  }
}

function installedBin(prefix) {
  return path.join(prefix, "node_modules", "@akifsen", "project-gate", "bin", "projectgate.js");
}

function gate(prefix, args, cwd) {
  const result = spawnSync(process.execPath, [installedBin(prefix), ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  const stderr = result.stderr ?? "";
  if (stderr.includes("ExperimentalWarning")) throw new Error(stderr);
  if (result.status !== 0) throw new Error(`projectgate ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${stderr}`);
  return result.stdout ?? "";
}

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "user.name=Project Gate Test", "-c", "user.email=test@projectgate.local", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
}

function writeFixture(directory) {
  fs.mkdirSync(path.join(directory, "src", "components"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({
      name: "package-smoke",
      private: true,
      scripts: { test: "node -e \"process.exit(0)\"" },
      dependencies: { react: "19.0.0", vite: "6.0.0" },
    }),
  );
  fs.writeFileSync(path.join(directory, "vite.config.js"), "export default {};\n");
  fs.writeFileSync(path.join(directory, "src", "components", "ProfileCard.tsx"), "export function ProfileCard() { return \"profile\"; }\n");
  fs.writeFileSync(path.join(directory, "README.md"), "fixture\n");
  git(directory, ["init", "-b", "main"]);
  git(directory, ["add", "README.md"]);
  git(directory, ["commit", "-m", "base"]);
}

async function mcpHandshake(prefix) {
  const bin = path.join(prefix, "node_modules", "@akifsen", "project-gate", "bin", "projectgate-mcp.js");
  const child = spawn(process.execPath, [bin], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "projectgate-package-smoke", version: "0.1.0" },
    },
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  child.stdin.write(`${body}\n`);
  const response = await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP server did not answer initialize.\n${text}\n${stderr}`));
    }, 8000);
    child.stdout.on("data", (chunk) => {
      text += chunk.toString("utf8");
      if (text.includes("\"id\":1") || text.includes("\"id\": 1")) {
        clearTimeout(timer);
        resolve(text);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`MCP server exited ${code} before initialize completed.\n${text}`));
    });
  });
  child.kill();
  if (!response.includes("project-gate")) throw new Error(`Unexpected MCP response:\n${response}`);
}

function registryStatus() {
  const result = run("npm", ["view", "@akifsen/project-gate", "version", "--json"], { cwd: root });
  return result.stdout.trim();
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "projectgate-package-test-"));
let tarball = "";
try {
  const dry = pack(true);
  assertContents(dry);
  console.log(`dry-run ${dry.filename} files=${dry.files.length} unpacked=${dry.unpackedSize}`);
  const packed = pack(false);
  assertContents(packed);
  tarball = path.join(releaseDir, packed.filename);
  console.log(`pack ${packed.filename} size=${packed.size} unpacked=${packed.unpackedSize} files=${packed.files.length}`);
  const listed = run("tar", ["-tf", tarball], { cwd: releaseDir }).stdout;
  for (const entry of ["package/package.json", "package/README.md", "package/LICENSE", "package/bin/projectgate.js", "package/bin/projectgate-mcp.js", "package/dist/cli.js", "package/dist/mcp.js"]) {
    if (!listed.includes(entry)) throw new Error(`tar listing is missing ${entry}`);
  }
  assertNoWorkspaceImports(releaseDir);

  const app = path.join(temp, "app");
  fs.mkdirSync(app);
  run("npm", ["init", "-y"], { cwd: app });
  run("npm", ["install", tarball], { cwd: app });
  const help = run("npx", ["--no-install", "projectgate", "--help"], { cwd: app });
  if (!help.stdout.includes("audit")) throw new Error(help.stdout);
  const version = run("npx", ["--no-install", "projectgate", "--version"], { cwd: app });
  if (!version.stdout.includes("0.1.0")) throw new Error(version.stdout);
  if (version.stderr.includes("ExperimentalWarning")) throw new Error(version.stderr);
  const doctor = gate(app, ["doctor"], app);
  if (!doctor.includes("Storage") || !doctor.includes("healthy")) throw new Error(doctor);
  if (!doctor.includes("shell verifier")) throw new Error(doctor);
  const shim = path.join(app, "node_modules", ".bin", process.platform === "win32" ? "projectgate.cmd" : "projectgate");
  if (!fs.existsSync(shim)) throw new Error(`npm did not create ${shim}`);

  const fixture = path.join(temp, "fixture");
  fs.mkdirSync(fixture);
  writeFixture(fixture);
  const init = gate(app, ["init"], fixture);
  if (init.includes("contract.example.yml") || init.includes("Copy-Item")) throw new Error(init);
  if (fs.existsSync(path.join(fixture, ".projectgate", "contract.yml"))) throw new Error("init created an active contract");
  gate(app, ["doctor"], fixture);
  const inspected = gate(app, ["inspect"], fixture);
  if (!inspected.includes("React + Vite")) throw new Error(inspected);
  gate(app, ["contract", "--task", "Add a responsive user profile card with loading and error states."], fixture);
  const audit = gate(app, ["audit"], fixture);
  if (audit.includes("No checks ran.")) throw new Error(audit);
  if (!audit.includes("PASS") && !audit.includes("BLOCKED") && !audit.includes("INCOMPLETE_EVIDENCE")) throw new Error(audit);
  await mcpHandshake(app);

  // --force replaces the development `npm link` shim. The finally block restores it.
  run("npm", ["install", "-g", "--force", tarball]);
  const globalHelp = run("projectgate", ["--help"], { cwd: temp });
  if (!globalHelp.stdout.includes("audit")) throw new Error(globalHelp.output);
  const globalVersion = run("projectgate", ["--version"], { cwd: temp });
  if (!globalVersion.stdout.includes("0.1.0")) throw new Error(globalVersion.output);
  const globalDoctor = run("projectgate", ["doctor"], { cwd: temp });
  if (!globalDoctor.stdout.includes("healthy")) throw new Error(globalDoctor.output);
  if (globalDoctor.stderr.includes("ExperimentalWarning")) throw new Error(globalDoctor.stderr);

  try {
    const view = registryStatus();
    console.log(`registry @akifsen/project-gate version: ${view || "(empty)"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("E404") || message.includes("404")) console.log("registry @akifsen/project-gate: not published");
    else console.log(`registry lookup unavailable: ${message.split("\n")[0]}`);
  }
  console.log("Package smoke tests passed");
} finally {
  const uninstall = spawnSync(process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm uninstall -g @akifsen/project-gate"] : ["uninstall", "-g", "@akifsen/project-gate"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (uninstall.status !== 0) console.error(uninstall.stdout, uninstall.stderr);
  const relink = spawnSync(process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm link"] : ["link"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (relink.status !== 0) console.error(relink.stdout, relink.stderr);
  fs.rmSync(temp, { recursive: true, force: true });
  if (tarball && fs.existsSync(tarball)) fs.rmSync(tarball, { force: true });
}
