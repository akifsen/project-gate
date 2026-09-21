import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeImpact } from "./analyze.js";
import { classifyFile } from "./classify.js";
import { routesInFile } from "./routes.js";

describe("impact classification", () => {
  it("keeps route extraction observed and test proximity inferred", () => {
    expect(classifyFile("public/main.js").role).toBe("ui");
    expect(classifyFile("app/profile/page.tsx").role).toBe("ui");
    expect(classifyFile("tests/status.cjs").role).toBe("test");
    expect(classifyFile("vite.config.js").role).toBe("config");
    const routes = routesInFile("routes/web.php", "Route::get('/profile', [ProfileController::class, 'show']);");
    expect(routes[0]).toMatchObject({ path: "/profile", source: "laravel-route" });
    const impact = analyzeImpact({
      root: process.cwd(),
      changed: [
        { path: "public/main.js", status: "modified" },
        { path: "tests/main.test.js", status: "modified" },
      ],
    });
    expect(impact.edges.some((edge) => edge.confidence === "inferred" && edge.relationship === "test-proximity")).toBe(true);
    expect(impact.changedFiles.every((file) => file.confidence === "observed" || file.confidence === "inferred")).toBe(true);
  });

  it("maps framework files to surfaces and leaves unknown source unresolved", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-impact-"));
    write(root, "src/components/Widget.tsx", "export function Widget() { return null; }\n");
    write(root, "routes/web.php", "Route::get('/profile', [ProfileController::class, 'show']);\n");
    write(root, "src/custom/thing.ts", "export const value = 1;\n");
    const impact = analyzeImpact({
      root,
      changed: [
        { path: "src/components/Widget.tsx", status: "modified" },
        { path: "routes/web.php", status: "modified" },
        { path: "src/custom/thing.ts", status: "modified" },
      ],
    });
    expect(impact.surfaces.some((surface) => surface.id === "route:/profile" && surface.confidence === "observed")).toBe(true);
    expect(impact.surfaces.some((surface) => surface.id === "component:src/components/Widget.tsx")).toBe(true);
    expect(impact.surfaces.some((surface) => surface.id === "backend:routes/web.php")).toBe(true);
    expect(impact.unresolvedFiles).toEqual(["src/custom/thing.ts"]);
  });
});

function write(root: string, file: string, text: string): void {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}
