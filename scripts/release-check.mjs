import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function npm(args) {
  const onWindows = process.platform === "win32";
  const result = spawnSync(onWindows ? process.env.ComSpec ?? "cmd.exe" : "npm", onWindows ? ["/d", "/s", "/c", ["npm", ...args].join(" ")] : args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv.includes("publish")) {
  console.error("release:check does not publish. Run npm publish yourself from release/ after this command passes.");
  process.exit(1);
}

for (const script of ["typecheck", "lint", "test", "test:package"]) npm(["run", script]);
console.log("Release check passed. This command did not publish.");
