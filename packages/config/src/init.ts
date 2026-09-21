import { product } from "@projectgate/shared";
import fs from "node:fs";
import path from "node:path";

export function initProject(root: string, projectName: string): string[] {
  const dir = path.join(root, product.configDir);
  fs.mkdirSync(path.join(dir, "rules"), { recursive: true });
  const created: string[] = [];
  const files: Record<string, string> = {
    "constitution.md": constitution(projectName),
    "project.yml": `schema_version: 1\nproject:\n  name: ${yamlString(projectName)}\n`,
    "architecture.yml": `schema_version: 1\nlayers: []\nforbidden_edges: []\nrules: []\n`,
    "ui.yml": `schema_version: 1\nrequired_states:\n  - loading\n  - empty\n  - error\n  - success\nresponsive:\n  widths: [390, 768, 1440]\n  heights: [844, 1024, 900]\naccessibility:\n  enabled: true\nvisual:\n  min_target_px: 24\n  invalidates_on:\n    - "**/*.css"\n    - "**/*.html"\n    - "**/*.tsx"\n    - "**/*.jsx"\n    - "**/*.vue"\n`,
    "verification.yml": `schema_version: 1\ntimeouts:\n  command_ms: 300000\n  http_ms: 15000\n  browser_ms: 30000\ncommands: []\n`,
    "security.yml": `schema_version: 1\nhuman_review_when: []\nredact_evidence: true\n`,
    "environments.yml": `schema_version: 1\nlocal: {}\n`,
    "contract.example.yml": exampleContract(),
  };
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) continue;
    fs.writeFileSync(target, contents);
    created.push(`${product.configDir}/${name}`);
  }
  const ignore = path.join(root, ".gitignore");
  const line = `${product.configDir}/runtime/`;
  const existing = fs.existsSync(ignore) ? fs.readFileSync(ignore, "utf8") : "";
  if (!existing.includes(line)) {
    fs.appendFileSync(ignore, `${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${line}\n`);
    created.push(".gitignore");
  }
  return created;
}

function yamlString(value: string): string {
  if (/^[A-Za-z0-9._-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function constitution(projectName: string): string {
  return `# ${projectName} constitution\n\nLong-lived rules for this repository live here in prose.\nMachine-checked rules belong in architecture.yml, ui.yml, verification.yml, and security.yml.\n\nThe auditing process must not change acceptance criteria to make a change pass.\n`;
}

function exampleContract(): string {
  return `schema_version: 1\nchange:\n  id: CHANGE-1\n  title: Example change\nintent:\n  summary: Describe what the change is supposed to accomplish.\n  users_can:\n    - complete_the_task\nacceptance:\n  - id: AC-001\n    description: Replace this with a real acceptance criterion.\n    required: true\n    evidence: RUNTIME\nui_states: []\nresponsive:\n  - width: 1440\n    height: 900\nroutes: []\ninvariants: []\nfields: []\n`;
}
