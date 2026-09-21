import type { ReleasePacket } from "@projectgate/domain";
import { product } from "@projectgate/shared";
import path from "node:path";

export function renderHtml(packet: ReleasePacket): string {
  const findings = packet.findings
    .map(
      (finding) => `<article>
        <h3>${escapeHtml(finding.id)} · ${escapeHtml(finding.severity)}</h3>
        <p>${escapeHtml(finding.title)}</p>
        <dl>
          <dt>Requirement</dt><dd>${escapeHtml(finding.requirement ?? "—")}</dd>
          <dt>Expected</dt><dd>${escapeHtml(finding.expected ?? "—")}</dd>
          <dt>Actual</dt><dd>${escapeHtml(finding.actual ?? finding.observed)}</dd>
          <dt>Evidence class</dt><dd>${escapeHtml(finding.evidenceClass)}</dd>
          <dt>Reproducible</dt><dd>${finding.reproducible ? "YES" : "NO"}</dd>
        </dl>
        <ol>${finding.reproduction.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <p>Suspected locations: ${escapeHtml(finding.suspectedLocations.join(", ") || "—")}</p>
        <ul>${finding.evidencePaths.map((item) => `<li><a href="${escapeHtml(relativeArtifact(packet, item))}">${escapeHtml(item)}</a></li>`).join("")}</ul>
      </article>`,
    )
    .join("");
  const checks = packet.checks
    .map((check) => `<tr><td>${escapeHtml(check.id)}</td><td>${escapeHtml(check.verifierId)}</td><td>${escapeHtml(check.status)}</td><td>${escapeHtml(check.group)}</td><td>${check.carriedFromRunId ? "carried" : "executed"}</td></tr>`)
    .join("");
  const surfaces = packet.impact.surfaces
    .map((surface) => `<li><code>${escapeHtml(surface.id)}</code> · ${escapeHtml(surface.relationship)} · ${escapeHtml(surface.source)} · ${escapeHtml(surface.confidence)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(product.name)} ${escapeHtml(packet.verdict.state)} ${escapeHtml(packet.change.id)}</title>
  <style>
    body { margin: 0; font: 16px/1.45 system-ui, sans-serif; color: #1c1917; background: #fafaf9; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 1.6rem; margin-bottom: 0; }
    .verdict { display: inline-block; margin-top: 12px; padding: 6px 10px; font-weight: 700; letter-spacing: 0.04em; background: #111; color: #fff; }
    table { width: 100%; border-collapse: collapse; }
    td, th { text-align: left; border-bottom: 1px solid #d6d3d1; padding: 6px 8px; vertical-align: top; }
    article { background: #fff; border: 1px solid #d6d3d1; padding: 16px; margin: 12px 0; }
    code { font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
<main>
  <p>${escapeHtml(product.name)} release packet</p>
  <h1>${escapeHtml(packet.change.id)} · ${escapeHtml(packet.change.title)}</h1>
  <p class="verdict">${escapeHtml(packet.verdict.state)}</p>
  <p>${packet.criteria.verified} / ${packet.criteria.total} verified · ${packet.criteria.failed} failed · ${packet.criteria.unknown} unknown</p>
  <p>Commit ${escapeHtml(packet.change.headSha)} against ${escapeHtml(packet.change.baseRef)}. Evidence artifacts: ${packet.evidence.length}. Open findings: critical ${packet.findingCounts.CRITICAL}, major ${packet.findingCounts.MAJOR}, minor ${packet.findingCounts.MINOR}.</p>
  <h2>Why</h2>
  <ul>${packet.verdict.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
  <h2>Checks</h2>
  <table><thead><tr><th>Check</th><th>Verifier</th><th>Status</th><th>Group</th><th>Run</th></tr></thead><tbody>${checks}</tbody></table>
  <h2>Findings</h2>
  ${findings || "<p>No open findings.</p>"}
  <h2>Resolved</h2>
  <ul>${packet.resolvedFindings.map((finding) => `<li>${escapeHtml(finding.id)} ${escapeHtml(finding.title)}</li>`).join("") || "<li>None</li>"}</ul>
  <h2>Impact</h2>
  <ul>${surfaces || "<li>No surfaces recorded.</li>"}</ul>
  <h2>UI states</h2>
  <ul>${packet.uiStates.map((state) => `<li>${escapeHtml(state.label)} · ${escapeHtml(state.state)}</li>`).join("") || "<li>None declared.</li>"}</ul>
  ${packet.limitations.length ? `<h2>Limitations</h2><ul>${packet.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
</main>
</body>
</html>
`;
}

function relativeArtifact(packet: ReleasePacket, artifactPath: string): string {
  const from = `.projectgate/runtime/runs/${packet.runId}/report.html`;
  return path.posix.relative(path.posix.dirname(from), artifactPath.replaceAll("\\", "/"));
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
