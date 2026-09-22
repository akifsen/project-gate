import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "release");
const distDir = path.join(releaseDir, "dist");

const external = /^(playwright|@axe-core\/playwright|@modelcontextprotocol\/sdk(?:\/.*)?|zod|typescript|php-parser|yaml|commander)$/;

const tsc = path.join(root, "node_modules", "typescript", "lib", "tsc.js");
const compiled = spawnSync(process.execPath, [tsc, "-b", "tsconfig.build.json"], { cwd: root, stdio: "inherit", windowsHide: true });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
fs.mkdirSync(distDir, { recursive: true });

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  plugins: [
    {
      name: "external-runtime",
      setup(build) {
        build.onResolve({ filter: external }, (args) => ({ path: args.path, external: true }));
      },
    },
  ],
};

await esbuild.build({
  ...shared,
  entryPoints: [path.join(root, "packages/cli/dist/main.js")],
  outfile: path.join(distDir, "cli.js"),
});
await esbuild.build({
  ...shared,
  entryPoints: [path.join(root, "packages/mcp/dist/server.js")],
  outfile: path.join(distDir, "mcp.js"),
});

for (const name of ["README.md", "LICENSE", "CHANGELOG.md"]) {
  fs.copyFileSync(path.join(root, name), path.join(releaseDir, name));
}

for (const file of ["cli.js", "mcp.js"]) {
  const text = fs.readFileSync(path.join(distDir, file), "utf8");
  const leaked = text.match(/from\s*["']@projectgate\/|import\s*\(\s*["']@projectgate\/|require\(\s*["']@projectgate\//g);
  if (leaked) {
    console.error(`${file} still imports workspace packages: ${leaked.join(", ")}`);
    process.exit(1);
  }
}

console.log("Release bundle written to release/dist");
