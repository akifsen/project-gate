import type { Confidence } from "@projectgate/domain";

export interface FileClassification {
  role: "ui" | "style" | "api-client" | "api-server" | "test" | "migration" | "config" | "documentation" | "static" | "unknown";
  confidence: Confidence;
  source: string;
}

export function classifyFile(filePath: string): FileClassification {
  const file = filePath.replaceAll("\\", "/");
  const base = file.split("/").pop() ?? file;
  if (/(?:^|\/)(?:__tests__|tests?)\//.test(file) || /[\\/.](?:test|spec)\./i.test(base)) {
    return { role: "test", confidence: "observed", source: "path-convention" };
  }
  if (/migration/i.test(file) && /\.(php|sql|ts)$/.test(base)) {
    return { role: "migration", confidence: "observed", source: "path-convention" };
  }
  if (/\.(css|scss|sass|less)$/.test(base)) return { role: "style", confidence: "observed", source: "extension" };
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(base)) return { role: "static", confidence: "observed", source: "extension" };
  if (/\.(md|mdx)$/.test(base)) return { role: "documentation", confidence: "observed", source: "extension" };
  if (/\.(yml|yaml|json|toml|env\.example)$/.test(base) || /(^|\/)(package\.json|composer\.json|tsconfig.*\.json)$/.test(file) || /(^|\/)[^/]*\.config\.[cm]?[jt]sx?$/.test(file)) {
    return { role: "config", confidence: "observed", source: "extension" };
  }
  if (file.startsWith("public/") && /\.(html|js|mjs)$/.test(base)) {
    return { role: "ui", confidence: "observed", source: "path-convention" };
  }
  if (/\/pages\/api\/|\/app\/api\//.test(file)) return { role: "api-server", confidence: "observed", source: "framework-route" };
  if (/(^|\/)routes\/.+\.php$/.test(file) || /Controller\.php$/.test(base)) {
    return { role: "api-server", confidence: "observed", source: "framework-route" };
  }
  if (/\/(Requests|Models|Policies|Jobs|Events)\//.test(file) || /(Service|Repository|Policy|Request)\.php$/.test(base)) {
    return { role: "api-server", confidence: "observed", source: "laravel-convention" };
  }
  if (/Api\.[tj]sx?$/.test(base) || file.includes("/services/") || file.includes("/api/")) {
    return { role: "api-client", confidence: "inferred", source: "path-convention" };
  }
  if (/(^|\/)(pages|app|components|features)\//.test(file) && /\.(tsx|jsx|vue|html)$/.test(base)) {
    return { role: "ui", confidence: file.includes("/pages/") || file.includes("/app/") ? "observed" : "inferred", source: "path-convention" };
  }
  if (/\.(tsx|jsx|vue|html|blade\.php)$/.test(base)) {
    return { role: "ui", confidence: "inferred", source: "extension" };
  }
  if (/^server\.[cm]?js$/.test(base) || base === "server.mjs") {
    return { role: "api-server", confidence: "inferred", source: "path-convention" };
  }
  if (/\.(php|ts|js|mjs)$/.test(base)) return { role: "unknown", confidence: "inferred", source: "extension" };
  return { role: "unknown", confidence: "inferred", source: "extension" };
}
