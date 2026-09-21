export interface RouteHit {
  path: string;
  source: string;
}

export function routesInFile(file: string, text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const normalized = file.replaceAll("\\", "/");
  const next = /^(?:src\/)?app\/(.*)\/page\.tsx$/.exec(normalized) ?? /^app\/(.*)\/page\.tsx$/.exec(normalized);
  if (normalized.endsWith("/page.tsx") || normalized === "app/page.tsx" || normalized.endsWith("app/page.tsx")) {
    const body = next?.[1] ?? "";
    const route = `/${body}`.replace(/\/\([^/]+\)/g, "").replace(/\/+/g, "/") || "/";
    hits.push({ path: route === "/" ? "/" : route.replace(/\/$/, ""), source: "next-app-router" });
  }
  collect(text, /Route::(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g, "laravel-route", hits, 1);
  collect(text, /<Route[^>]*\spath=["']([^"']+)["']/g, "react-router", hits, 1);
  collect(text, /\bpath\s*:\s*["'](\/[^"']*)["']/g, "react-router", hits, 1);
  return dedupe(hits);
}

function collect(text: string, expression: RegExp, source: string, hits: RouteHit[], group: number): void {
  for (const match of text.matchAll(expression)) {
    const value = match[group];
    if (value) hits.push({ path: value, source });
  }
}

function dedupe(hits: RouteHit[]): RouteHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.source}:${hit.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
