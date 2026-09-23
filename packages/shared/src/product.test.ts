import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { product, resolveProductVersion } from "./product.js";

describe("product version", () => {
  it("uses the public release version in the source workspace", () => {
    const releaseManifest = JSON.parse(fs.readFileSync(new URL("../../../release/package.json", import.meta.url), "utf8")) as { version: string };
    expect(product.version).toBe(releaseManifest.version);
  });

  it("ignores private workspace versions and resolves an installed public manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-version-"));
    try {
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "project-gate", private: true }));
      const sharedDir = path.join(root, "packages", "shared");
      fs.mkdirSync(path.join(sharedDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(sharedDir, "package.json"), JSON.stringify({ name: "@projectgate/shared", private: true, version: "0.1.0" }));
      const sourceUrl = pathToFileURL(path.join(sharedDir, "src", "product.ts")).href;
      expect(resolveProductVersion(sourceUrl)).toBe("0.0.0-dev");

      const releaseDir = path.join(root, "release");
      fs.mkdirSync(releaseDir);
      fs.writeFileSync(path.join(releaseDir, "package.json"), JSON.stringify({ name: "@akifsen/project-gate", version: "0.2.0" }));
      expect(resolveProductVersion(sourceUrl)).toBe("0.2.0");

      const installedDir = path.join(root, "node_modules", "@akifsen", "project-gate");
      fs.mkdirSync(path.join(installedDir, "dist"), { recursive: true });
      fs.writeFileSync(path.join(installedDir, "package.json"), JSON.stringify({ name: "@akifsen/project-gate", version: "9.8.7" }));
      expect(resolveProductVersion(pathToFileURL(path.join(installedDir, "dist", "cli.js")).href)).toBe("9.8.7");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
