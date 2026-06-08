import type { ClassifiedFinding } from "../analyze/classify.js";
import type { HotspotEntry } from "../analyze/hotspots.js";
import type { ComplexityFinding } from "../syntactic/types.js";

export interface JsonInput {
  findings: ClassifiedFinding[];
  complexity: ComplexityFinding[];
  hotspots: HotspotEntry[];
}

/**
 * Serialize a scan to a stable, multi-axis JSON shape for CI / SARIF-adjacent
 * tooling: `{ findings: [...dead code...], complexity: [...], hotspots: [...] }`.
 */
export function toJson(input: JsonInput): string {
  const findings = input.findings.map((f) => ({
    name: f.node.name,
    file: f.node.file,
    line: f.node.line,
    tier: f.tier,
    verdict: f.verdict,
    autoFixEligible: f.autoFixEligible,
    evidence: f.evidence,
  }));
  return JSON.stringify(
    { findings, complexity: input.complexity, hotspots: input.hotspots },
    null,
    2,
  );
}
