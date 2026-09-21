import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

const packages = [
  ["@projectgate/shared", "packages/shared"],
  ["@projectgate/domain", "packages/domain"],
  ["@projectgate/policy-engine", "packages/policy-engine"],
  ["@projectgate/config", "packages/config"],
  ["@projectgate/contracts", "packages/contracts"],
  ["@projectgate/model", "packages/model"],
  ["@projectgate/impact-engine", "packages/impact-engine"],
  ["@projectgate/evidence", "packages/evidence"],
  ["@projectgate/verifier-sdk", "packages/verifier-sdk"],
  ["@projectgate/report", "packages/report"],
  ["@projectgate/browser", "verifiers/browser"],
  ["@projectgate/shell-verifier", "verifiers/shell"],
  ["@projectgate/api-verifier", "verifiers/api"],
  ["@projectgate/architecture-verifier", "verifiers/architecture"],
  ["@projectgate/playwright-verifier", "verifiers/playwright"],
  ["@projectgate/accessibility-verifier", "verifiers/accessibility"],
  ["@projectgate/visual-verifier", "verifiers/visual"],
  ["@projectgate/agent-adapter", "integrations/agents"],
  ["@projectgate/core", "packages/core"],
  ["@projectgate/cli", "packages/cli"],
  ["@projectgate/mcp", "packages/mcp"],
];

export default defineConfig({
  resolve: {
    alias: packages.map(([name, dir]) => ({
      find: name,
      replacement: path.join(root, dir, "src", "index.ts"),
    })),
  },
  plugins: [
    {
      name: "typescript-js-specifier",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return null;
        const importerPath = importer.startsWith("file:") ? fileURLToPath(importer) : importer;
        const candidate = path.resolve(path.dirname(importerPath), source.slice(0, -3) + ".ts");
        return fs.existsSync(candidate) ? candidate : null;
      },
    },
  ],
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "verifiers/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
