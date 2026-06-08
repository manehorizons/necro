import type {
  ClassifiedFinding,
  EvidenceSignal,
} from "../analyze/classify.js";

/**
 * Render a single finding as a §5 evidence chain: a header line (symbol, location,
 * tier), one line per checked signal (✓/✗/•), and a verdict line. This is the
 * trust artifact — the user audits the reasoning instead of trusting blind.
 */
export function renderEvidenceChain(finding: ClassifiedFinding): string {
  const { node, tier } = finding;
  const header = `${node.name}  ${node.file}:${node.line}   tier: ${tier}`;
  const signals = finding.evidence.map((s) => `  ${glyph(s.ok)} ${s.text}`);
  const verdict = `  → ${verdictLine(finding)}`;
  return [header, ...signals, verdict].join("\n");
}

/** Render multiple findings as separate evidence boxes. */
export function renderFindings(findings: ClassifiedFinding[]): string {
  return findings.map(renderEvidenceChain).join("\n\n");
}

function glyph(ok: EvidenceSignal["ok"]): string {
  if (ok === true) return "✓";
  if (ok === false) return "✗";
  return "•";
}

function verdictLine(finding: ClassifiedFinding): string {
  if (finding.verdict === "test-only") {
    return "prod-dead — delete fn + test, or wire into prod";
  }
  switch (finding.tier) {
    case "certain":
      return "safe to remove";
    case "likely":
      return "exported but unused — confirm no external use, then remove";
    case "maybe":
      return "NOT auto-removed — needs human review";
  }
}
