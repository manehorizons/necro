import type {
  ClassifiedFinding,
  EvidenceSignal,
  Tier,
} from "../analyze/classify.js";
import { dim, green, red, yellow } from "./color.js";
import { toRelativePath } from "./paths.js";

/**
 * Render a single finding as a §5 evidence chain: a header line (symbol, location,
 * tier), one line per checked signal (✓/✗/•), and a verdict line. This is the
 * trust artifact — the user audits the reasoning instead of trusting blind.
 */
export function renderEvidenceChain(finding: ClassifiedFinding, root: string, color: boolean): string {
  const { node, tier } = finding;
  const header = `${node.name}  ${toRelativePath(node.file, root)}:${node.line}   tier: ${tierColor(tier, color)}`;
  const signals = finding.evidence.map((s) => `  ${glyph(s.ok, color)} ${s.text}`);
  const verdict = `  → ${verdictLine(finding)}`;
  return [header, ...signals, verdict].join("\n");
}

/** Render multiple findings as separate evidence boxes. */
export function renderFindings(findings: ClassifiedFinding[], root: string, color: boolean): string {
  return findings.map((f) => renderEvidenceChain(f, root, color)).join("\n\n");
}

function tierColor(tier: Tier, color: boolean): string {
  switch (tier) {
    case "certain":
      return red(tier, color);
    case "likely":
      return yellow(tier, color);
    case "maybe":
      return dim(tier, color);
  }
}

function glyph(ok: EvidenceSignal["ok"], color: boolean): string {
  if (ok === true) return green("✓", color);
  if (ok === false) return red("✗", color);
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
