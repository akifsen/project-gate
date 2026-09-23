import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { clearTimeout, setTimeout } from "node:timers";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "release");
const expectedVersion = JSON.parse(fs.readFileSync(path.join(releaseDir, "package.json"), "utf8")).version;
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
    env: options.env ?? process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}) in ${cwd}\n${output}`);
  return { status: result.status, output, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function pack(dryRun, cwd = releaseDir) {
  const args = ["pack", "--json"];
  if (dryRun) args.push("--dry-run");
  const result = run("npm", args, { cwd });
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

function gate(prefix, args, cwd, expectedExitCodes = [0]) {
  const result = spawnSync(process.execPath, [installedBin(prefix), ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  const stderr = result.stderr ?? "";
  if (stderr.includes("ExperimentalWarning")) throw new Error(stderr);
  if (!expectedExitCodes.includes(result.status)) throw new Error(`projectgate ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${stderr}`);
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

function assertPublicManifest(manifest) {
  if (manifest.name !== "@akifsen/project-gate" || manifest.version !== expectedVersion) {
    throw new Error(`Unexpected public package identity: ${manifest.name}@${manifest.version}`);
  }
  if (Object.keys(manifest.scripts ?? {}).length > 0) {
    throw new Error(`Public package must not contain repository lifecycle scripts: ${Object.keys(manifest.scripts).join(", ")}`);
  }
}

function assertPackedManifest(tarball) {
  const manifest = JSON.parse(run("tar", ["-xOf", tarball, "package/package.json"]).stdout);
  assertPublicManifest(manifest);
}

function writeGitBase(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "README.md"), "package smoke fixture\n");
  git(directory, ["init", "-b", "main"]);
  git(directory, ["add", "README.md"]);
  git(directory, ["commit", "-m", "base"]);
}

function writeFiles(directory, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(directory, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
}

function cleanupTempDirectory(directory, prefix) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedOsTemp = path.resolve(os.tmpdir());
  if (path.dirname(resolvedDirectory) !== resolvedOsTemp || !path.basename(resolvedDirectory).startsWith(prefix)) {
    throw new Error(`Refusing to remove unexpected package smoke temp path: ${resolvedDirectory}`);
  }
  fs.rmSync(resolvedDirectory, { recursive: true, force: true });
}

function inspectFixture(app, directory, name, files, expected, expectedModules) {
  writeGitBase(directory);
  writeFiles(directory, files);
  const init = gate(app, ["init"], directory);
  if (init.includes("contract.example.yml") || init.includes("Copy-Item")) throw new Error(init);
  if (fs.existsSync(path.join(directory, ".projectgate", "contract.yml"))) throw new Error("init created an active contract");
  const inspected = gate(app, ["inspect", "--verbose"], directory);
  for (const text of expected) {
    if (!inspected.includes(text)) throw new Error(`Expected inspect output to include ${JSON.stringify(text)}:\n${inspected}`);
  }
  const modulesSection = inspected.split("\nModules\n")[1]?.split("\n\nCommands")[0] ?? "";
  const moduleCount = modulesSection.split(/\r?\n/).filter((line) => line.trim().length > 0 && !line.startsWith("  ")).length;
  if (moduleCount !== expectedModules) throw new Error(`${name} fixture expected ${expectedModules} modules, found ${moduleCount}:\n${inspected}`);
  const classifiedSection = inspected.split("\nClassified files\n")[1]?.split("\n\nNext:")[0] ?? "";
  const classifiedCount = classifiedSection.split(/\r?\n/).filter((line) => /^ {2}(?:added|modified|deleted|renamed) /.test(line)).length;
  const applicationCount = (classifiedSection.match(/APPLICATION\//g) ?? []).length;
  const testCount = (classifiedSection.match(/TEST\/TEST/g) ?? []).length;
  console.log(`fixture ${name}: modules=${moduleCount} application_files=${applicationCount} tests=${testCount} classified_files=${classifiedCount}`);
  return inspected;
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
    }, 20000);
    child.stdout.on("data", (chunk) => {
      text += chunk.toString("utf8");
      const response = text.split(/\r?\n/).find((line) => {
        try {
          return JSON.parse(line).id === 1;
        } catch {
          return false;
        }
      });
      if (response) {
        clearTimeout(timer);
        resolve(response);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`MCP server exited ${code} before initialize completed.\n${text}`));
    });
  });
  child.kill();
  const serverInfo = JSON.parse(response).result?.serverInfo;
  if (serverInfo?.name !== "project-gate" || serverInfo.version !== expectedVersion) {
    throw new Error(`Unexpected MCP response:\n${response}`);
  }
}

function registryStatus() {
  const result = run("npm", ["view", "@akifsen/project-gate", "version", "--json"], { cwd: root });
  return result.stdout.trim();
}

const tempPrefix = "projectgate-package-test-";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));
let tarball = "";
try {
  assertPublicManifest(JSON.parse(fs.readFileSync(path.join(releaseDir, "package.json"), "utf8")));
  run("npm", ["run", "build"]);
  const dry = pack(true);
  assertContents(dry);
  console.log(`dry-run ${dry.filename} files=${dry.files.length} unpacked=${dry.unpackedSize}`);
  const packed = pack(false);
  assertContents(packed);
  tarball = path.join(releaseDir, packed.filename);
  assertPackedManifest(tarball);
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
  const installedDir = path.join(app, "node_modules", "@akifsen", "project-gate");
  assertPublicManifest(JSON.parse(fs.readFileSync(path.join(installedDir, "package.json"), "utf8")));
  const repacked = pack(false, installedDir);
  assertContents(repacked);
  assertPackedManifest(path.join(installedDir, repacked.filename));
  console.log(`repack installed package ${repacked.filename} files=${repacked.files.length}`);
  const help = run("npx", ["--no-install", "projectgate", "--help"], { cwd: app });
  if (!help.stdout.includes("audit")) throw new Error(help.stdout);
  const version = run("npx", ["--no-install", "projectgate", "--version"], { cwd: app });
  if (version.stdout.trim() !== expectedVersion) throw new Error(`Expected ${expectedVersion}, got ${version.stdout}`);
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
  const inspected = gate(app, ["inspect", "--verbose"], fixture);
  if (!inspected.includes("React + Vite")) throw new Error(inspected);
  gate(app, ["contract", "--task", "Add a responsive user profile card with loading and error states."], fixture);
  const audit = gate(app, ["audit"], fixture, [0, 1, 2]);
  if (audit.includes("No checks ran.")) throw new Error(audit);
  if (!audit.includes("PASS") && !audit.includes("BLOCKED") && !audit.includes("INCOMPLETE_EVIDENCE")) throw new Error(audit);
  await mcpHandshake(app);

  const flutterFixture = path.join(temp, "flutter-fixture");
  inspectFixture(app, flutterFixture, "Flutter", {
    "pubspec.yaml": "name: profile_app\ndescription: Package smoke fixture\nenvironment:\n  sdk: '>=3.3.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n",
    "lib/main.dart": "import 'package:flutter/material.dart';\nimport 'features/profile/profile_screen.dart';\n\nvoid main() => runApp(const ProfileApp());\n\nclass ProfileApp extends StatelessWidget {\n  const ProfileApp({super.key});\n  @override\n  Widget build(BuildContext context) => const MaterialApp(home: ProfileScreen());\n}\n",
    "lib/features/profile/profile_screen.dart": "import 'package:flutter/material.dart';\n\nclass ProfileScreen extends StatelessWidget {\n  const ProfileScreen({super.key});\n  @override\n  Widget build(BuildContext context) => const Scaffold(body: Text('Profile'));\n}\n",
    "test/features/profile/profile_screen_test.dart": "import 'package:flutter/material.dart';\nimport 'package:flutter_test/flutter_test.dart';\nimport 'package:profile_app/features/profile/profile_screen.dart';\n\nvoid main() { testWidgets('shows profile', (tester) async { await tester.pumpWidget(const MaterialApp(home: ProfileScreen())); }); }\n",
  }, ["Flutter", "Dart", "Flutter Pub", "lib/features/profile/profile_screen.dart", "APPLICATION/SCREEN adapter=dart", "test/features/profile/profile_screen_test.dart", "TEST/TEST adapter=dart"], 1);

  const springFiles = {
    "pom.xml": "<project xmlns=\"http://maven.apache.org/POM/4.0.0\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd\"><modelVersion>4.0.0</modelVersion><groupId>com.example</groupId><artifactId>profile-api</artifactId><version>1.0.0</version><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.3.0</version></parent><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency></dependencies></project>\n",
    "src/main/java/com/example/profile/UserController.java": "package com.example.profile;\n\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.RestController;\n\n@RestController\npublic class UserController {\n  @GetMapping(\"/api/profile\")\n  public String profile() { return \"profile\"; }\n}\n",
    "src/main/java/com/example/profile/UserService.java": "package com.example.profile;\n\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class UserService { public String profile() { return \"profile\"; } }\n",
    "src/test/java/com/example/profile/UserControllerTest.java": "package com.example.profile;\n\nimport org.junit.jupiter.api.Test;\nclass UserControllerTest { @Test void loadsProfile() {} }\n",
  };
  const springFixture = path.join(temp, "spring-fixture");
  inspectFixture(app, springFixture, "Spring", springFiles, ["Spring Boot", "Java", "Maven", "src/main/java/com/example/profile/UserController.java", "APPLICATION/CONTROLLER adapter=java", "src/test/java/com/example/profile/UserControllerTest.java", "TEST/TEST adapter=java"], 1);

  const mixedFixture = path.join(temp, "mixed-fixture");
  inspectFixture(app, mixedFixture, "mixed", {
    "apps/mobile/pubspec.yaml": "name: mixed_mobile\ndependencies:\n  flutter:\n    sdk: flutter\n",
    "apps/mobile/lib/features/profile/profile_screen.dart": "import 'package:flutter/material.dart';\nclass ProfileScreen extends StatelessWidget { const ProfileScreen({super.key}); @override Widget build(BuildContext context) => const Text('Profile'); }\n",
    "services/api/pom.xml": springFiles["pom.xml"],
    "services/api/src/main/java/com/example/profile/UserController.java": springFiles["src/main/java/com/example/profile/UserController.java"],
  }, ["apps/mobile", "Flutter", "services/api", "Spring Boot", "apps/mobile/lib/features/profile/profile_screen.dart", "APPLICATION/SCREEN adapter=dart", "services/api/src/main/java/com/example/profile/UserController.java", "APPLICATION/CONTROLLER adapter=java"], 2);

  const globalPrefix = path.join(temp, "isolated-global");
  run("npm", ["install", "--global", "--prefix", globalPrefix, tarball]);
  const globalBinDir = process.platform === "win32" ? globalPrefix : path.join(globalPrefix, "bin");
  const globalShim = path.join(globalBinDir, process.platform === "win32" ? "projectgate.cmd" : "projectgate");
  if (!fs.existsSync(globalShim)) throw new Error(`npm did not create isolated global shim ${globalShim}`);
  const pathVariable = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const isolatedEnv = { ...process.env, [pathVariable]: `${globalBinDir}${path.delimiter}${process.env[pathVariable] ?? ""}` };
  const globalHelp = run("projectgate", ["--help"], { cwd: temp, env: isolatedEnv });
  if (!globalHelp.stdout.includes("audit")) throw new Error(globalHelp.output);
  const globalVersion = run("projectgate", ["--version"], { cwd: temp, env: isolatedEnv });
  if (globalVersion.stdout.trim() !== expectedVersion) throw new Error(`Expected ${expectedVersion}, got ${globalVersion.output}`);
  const globalDoctor = run("projectgate", ["doctor"], { cwd: temp, env: isolatedEnv });
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
  cleanupTempDirectory(temp, tempPrefix);
  if (tarball && fs.existsSync(tarball)) fs.rmSync(tarball, { force: true });
}
