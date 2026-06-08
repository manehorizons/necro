import type { ClassifiedFinding } from "../analyze/classify.js";

/** Serialize findings to a flat, stable JSON shape for CI / SARIF-adjacent tooling. */
export function toJson(findings: ClassifiedFinding[]): string {
  const serializable = findings.map((f) => ({
    name: f.node.name,
    file: f.node.file,
    line: f.node.line,
    tier: f.tier,
    verdict: f.verdict,
    autoFixEligible: f.autoFixEligible,
    evidence: f.evidence,
  }));
  return JSON.stringify(serializable, null, 2);
}
