import { describe, expect, it } from "vitest";
import { analyzeImpact } from "./analyze.js";
import { classifyFile } from "./classify.js";
import { routesInFile } from "./routes.js";

describe("impact classification", () => {
  it("keeps route extraction observed and test proximity inferred", () => {
    expect(classifyFile("public/main.js").role).toBe("ui");
    expect(classifyFile("app/profile/page.tsx").role).toBe("ui");
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
});
