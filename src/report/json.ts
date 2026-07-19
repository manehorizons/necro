import type { ClassifiedFinding } from "../analyze/classify.js";
import type { HotspotEntry } from "../analyze/hotspots.js";
import type { ScanDiagnostics } from "../engine/index.js";
import type {
  ComplexityFinding,
  DuplicationFinding,
} from "../syntactic/types.js";

export interface JsonInput {
  findings: ClassifiedFinding[];
  complexity: ComplexityFinding[];
  hotspots: HotspotEntry[];
  duplication: DuplicationFinding[];
  /** Fail-closed entry-resolution diagnostics (§2.1). Optional only for
   * call sites (tests) that predate the diagnostic; `scan` always supplies it. */
  diagnostics?: ScanDiagnostics;
}

/**
 * Serialize a scan to a stable, multi-axis JSON shape for CI / SARIF-adjacent
 * tooling: `{ findings, complexity, hotspots, duplication }`.
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
    {
      findings,
      complexity: input.complexity,
      hotspots: input.hotspots,
      duplication: input.duplication,
      ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    },
    null,
    2,
  );
}
