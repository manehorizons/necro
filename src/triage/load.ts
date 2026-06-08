import { readFile } from "node:fs/promises";
import type { ClassifiedFinding, EvidenceSignal, Tier, Verdict } from "../analyze/classify.js";

/** A finding as serialized by `necro scan --json` (the flattened shape). */
interface ScanJsonFinding {
  name: string;
  file: string;
  line: number;
  tier: Tier;
  verdict: Verdict;
  autoFixEligible: boolean;
  evidence: EvidenceSignal[];
}

/**
 * Reconstruct `ClassifiedFinding`s from a prior `necro scan --json` document so
 * `necro triage --input` can run without re-scanning. The JSON flattens the
 * node, so `id` is rebuilt and `exported` (unused by triage) defaults to false.
 */
export function findingsFromScanJson(text: string): ClassifiedFinding[] {
  const doc = JSON.parse(text) as { findings?: ScanJsonFinding[] };
  const findings = doc.findings ?? [];
  return findings.map((f) => ({
    node: {
      id: `${f.file}:${f.line}:${f.name}`,
      name: f.name,
      file: f.file,
      line: f.line,
      exported: false,
    },
    verdict: f.verdict,
    tier: f.tier,
    autoFixEligible: f.autoFixEligible,
    evidence: f.evidence ?? [],
  }));
}

/** Read and parse a scan-JSON file into findings. */
export async function loadScanJson(path: string): Promise<ClassifiedFinding[]> {
  return findingsFromScanJson(await readFile(path, "utf8"));
}
