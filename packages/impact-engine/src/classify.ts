import type { Confidence } from "@projectgate/domain";

export interface FileClassification {
  role: "ui" | "style" | "api-client" | "api-server" | "test" | "migration" | "config" | "documentation" | "static" | "unknown";
  confidence: Confidence;
  source: string;
}

export function classifyFile(filePath: string): FileClassification {
  const file = filePath.replaceAll("\\", "/");
  const base = file.split("/").pop() ?? file;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base) || file.includes("/tests/") || file.includes("/__tests__/")) {
    return { role: "test", confidence: "observed", source: "path-convention" };
  }
  if (/migration/i.test(file) && /\.(php|sql|ts)$/.test(base)) {
    return { role: "migration", confidence: "observed", source: "path-convention" };
  }
  if (/\.(css|scss|sass|less)$/.test(base)) return { role: "style", confidence: "observed", source: "extension" };
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(base)) return { role: "static", confidence: "observed", source: "extension" };
  if (/\.(md|mdx)$/.test(base)) return { role: "documentation", confidence: "observed", source: "extension" };
  if (/\.(yml|yaml|json|toml|env\.example)$/.test(base) || /(^|\/)(package\.json|composer\.json|tsconfig.*\.json)$/.test(file)) {
    return { role: "config", confidence: "observed", source: "extension" };
  }
  if (file.startsWith("public/") && /\.(html|js|mjs)$/.test(base)) {
    return { role: "ui", confidence: "observed", source: "path-convention" };
  }
  if (/\.(tsx|jsx|vue|html|blade\.php)$/.test(base) || file.includes("/components/") || file.includes("/pages/") || file.includes("/app/")) {
    return { role: "ui", confidence: "observed", source: "path-convention" };
  }
  if (/Controller\.php$/.test(base) || file.includes("/Http/") || file.includes("/routes/") || /^server\.[cm]?js$/.test(base) || base === "server.mjs") {
    return { role: "api-server", confidence: file.includes("/routes/") || /Controller\.php$/.test(base) ? "observed" : "inferred", source: "path-convention" };
  }
  if (/\.(php|ts|js|mjs)$/.test(base)) return { role: "api-server", confidence: "inferred", source: "extension" };
  return { role: "unknown", confidence: "inferred", source: "extension" };
}
