const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github-token", re: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { name: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "openai-key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  {
    name: "assignment",
    re: /\b(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\b\s*[:=]\s*["']?[^\s"',}]+/gi,
  },
];

const SECRET_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
]);

export function redactText(input: string): { text: string; redactions: number } {
  let text = input;
  let redactions = 0;
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    text = text.replace(pattern.re, () => {
      redactions += 1;
      return `[REDACTED:${pattern.name}]`;
    });
  }
  return { text, redactions };
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SECRET_HEADERS.has(key.toLowerCase()) ? "[REDACTED]" : redactText(value).text;
  }
  return redacted;
}

export function isSensitivePath(filePath: string): boolean {
  const base = filePath.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
  return (
    base === ".env" ||
    base.startsWith(".env.") ||
    base === "credentials.json" ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx")
  );
}

export function brief(text: string, max = 500): string {
  const clean = redactText(text).text.replaceAll(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}
