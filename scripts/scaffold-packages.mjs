import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const packages = [
  ["packages/shared", "@projectgate/shared", []],
  ["packages/domain", "@projectgate/domain", ["@projectgate/shared"]],
  ["packages/policy-engine", "@projectgate/policy-engine", ["@projectgate/domain", "@projectgate/shared"]],
  ["packages/config", "@projectgate/config", ["@projectgate/domain", "@projectgate/policy-engine", "@projectgate/shared"]],
  ["packages/contracts", "@projectgate/contracts", ["@projectgate/domain", "@projectgate/model", "@projectgate/shared"]],
  ["packages/model", "@projectgate/model", ["@projectgate/shared"]],
  ["packages/impact-engine", "@projectgate/impact-engine", ["@projectgate/domain", "@projectgate/model", "@projectgate/shared"]],
  ["packages/evidence", "@projectgate/evidence", ["@projectgate/domain", "@projectgate/shared"]],
  ["packages/verifier-sdk", "@projectgate/verifier-sdk", ["@projectgate/config", "@projectgate/contracts", "@projectgate/domain", "@projectgate/shared"]],
  ["packages/report", "@projectgate/report", ["@projectgate/domain", "@projectgate/shared"]],
  ["verifiers/browser", "@projectgate/browser", ["@projectgate/domain", "@projectgate/verifier-sdk"]],
  ["verifiers/shell", "@projectgate/shell-verifier", ["@projectgate/config", "@projectgate/domain", "@projectgate/shared", "@projectgate/verifier-sdk"]],
  ["verifiers/api", "@projectgate/api-verifier", ["@projectgate/contracts", "@projectgate/domain", "@projectgate/shared", "@projectgate/verifier-sdk"]],
  ["verifiers/architecture", "@projectgate/architecture-verifier", ["@projectgate/domain", "@projectgate/policy-engine", "@projectgate/shared", "@projectgate/verifier-sdk"]],
  ["verifiers/playwright", "@projectgate/playwright-verifier", ["@projectgate/contracts", "@projectgate/domain", "@projectgate/shared", "@projectgate/verifier-sdk"]],
  ["verifiers/accessibility", "@projectgate/accessibility-verifier", ["@projectgate/domain", "@projectgate/shared", "@projectgate/verifier-sdk"]],
  ["verifiers/visual", "@projectgate/visual-verifier", ["@projectgate/domain", "@projectgate/shared", "@projectgate/verifier-sdk"]],
  ["integrations/agents", "@projectgate/agent-adapter", ["@projectgate/domain", "@projectgate/shared"]],
  ["packages/core", "@projectgate/core", [
    "@projectgate/accessibility-verifier",
    "@projectgate/agent-adapter",
    "@projectgate/api-verifier",
    "@projectgate/architecture-verifier",
    "@projectgate/browser",
    "@projectgate/config",
    "@projectgate/contracts",
    "@projectgate/domain",
    "@projectgate/evidence",
    "@projectgate/impact-engine",
    "@projectgate/model",
    "@projectgate/playwright-verifier",
    "@projectgate/policy-engine",
    "@projectgate/report",
    "@projectgate/shared",
    "@projectgate/shell-verifier",
    "@projectgate/verifier-sdk",
    "@projectgate/visual-verifier",
  ]],
  ["packages/cli", "@projectgate/cli", ["@projectgate/agent-adapter", "@projectgate/core", "@projectgate/domain", "@projectgate/shared"]],
  ["packages/mcp", "@projectgate/mcp", ["@projectgate/agent-adapter", "@projectgate/core", "@projectgate/domain", "@projectgate/shared"]],
];

const external = {
  "@projectgate/config": { yaml: "^2.8.1", zod: "^3.25.76" },
  "@projectgate/contracts": { yaml: "^2.8.1", zod: "^3.25.76" },
  "@projectgate/policy-engine": { zod: "^3.25.76" },
  "@projectgate/model": { zod: "^3.25.76" },
  "@projectgate/browser": { "@axe-core/playwright": "^4.10.2", playwright: "^1.55.0" },
  "@projectgate/architecture-verifier": { "php-parser": "^3.2.5", typescript: "^5.9.2" },
  "@projectgate/cli": { commander: "^13.1.0" },
  "@projectgate/mcp": { "@modelcontextprotocol/sdk": "^1.17.5", zod: "^3.25.76" },
};

const byName = new Map(packages.map(([dir, name]) => [name, dir]));

for (const [dir, name, deps] of packages) {
  const abs = path.join(root, dir);
  fs.mkdirSync(path.join(abs, "src"), { recursive: true });
  const dependencies = { ...(external[name] ?? {}) };
  for (const dep of deps) dependencies[dep] = "0.1.0";
  const manifest = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    types: "./dist/index.d.ts",
    dependencies,
  };
  fs.writeFileSync(path.join(abs, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const references = deps.map((dep) => {
    const target = byName.get(dep);
    if (!target) throw new Error(`missing ${dep}`);
    return { path: path.relative(abs, path.join(root, target)).replaceAll("\\", "/") };
  });
  const tsconfig = {
    extends: "../../tsconfig.base.json",
    compilerOptions: {
      composite: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts"],
    references,
  };
  fs.writeFileSync(path.join(abs, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);
}

const build = {
  files: [],
  references: [
    { path: "packages/cli" },
    { path: "packages/mcp" },
  ],
};
fs.writeFileSync(path.join(root, "tsconfig.build.json"), `${JSON.stringify(build, null, 2)}\n`);

const aliases = Object.fromEntries(
  packages.map(([dir, name]) => [name, [`${dir}/src/index.ts`]]),
);
const typecheck = {
  extends: "./tsconfig.base.json",
  compilerOptions: {
    noEmit: true,
    composite: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    baseUrl: ".",
    paths: aliases,
    types: ["node"],
  },
  include: [
    "packages/*/src/**/*.ts",
    "verifiers/*/src/**/*.ts",
    "integrations/*/src/**/*.ts",
    "tests/**/*.ts",
  ],
};
fs.writeFileSync(path.join(root, "tsconfig.typecheck.json"), `${JSON.stringify(typecheck, null, 2)}\n`);

const rootPkg = {
  name: "project-gate",
  private: true,
  type: "module",
  workspaces: ["packages/*", "verifiers/*", "integrations/*"],
  scripts: {
    build: "tsc -b tsconfig.build.json",
    typecheck: "tsc -p tsconfig.typecheck.json --noEmit --pretty false",
    test: "vitest run",
    lint: "eslint .",
    check: "npm run typecheck && npm run lint && npm run test && npm run build",
    "browser:install": "playwright install chromium",
    demo: "node scripts/demo-avatar.mjs",
    projectgate: "node packages/cli/dist/main.js",
  },
  devDependencies: {
    "@eslint/js": "^9.36.0",
    "@types/node": "^24.5.2",
    eslint: "^9.36.0",
    typescript: "^5.9.2",
    "typescript-eslint": "^8.44.0",
    vitest: "^3.2.4",
  },
  engines: {
    node: ">=22.18",
  },
};
fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(rootPkg, null, 2)}\n`);
console.log(`scaffolded ${packages.length} packages`);
