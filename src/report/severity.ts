import type { Tier, Verdict } from "../analyze/classify.js";
import type { JsonInput } from "./json.js";

/**
 * One unified severity scale across all four finding categories, driving both
 * the SARIF `level` and `--fail-on` gating. Decided 2026-06-11 ("Conservative"):
 *
 *   high   (error)   — dead-code `certain`
 *   medium (warning) — dead-code `likely`; complexity (all detectors)
 *   low    (note)    — dead-code `maybe`/`test-only`; duplication; hotspots
 */
export type Severity = "high" | "medium" | "low";

/** Higher rank = more severe. */
const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export const SEVERITIES: readonly Severity[] = ["high", "medium", "low"];

/** Narrow an arbitrary string to a `Severity` (validates `--fail-on` input). */
export function isSeverity(s: string): s is Severity {
  return s === "high" || s === "medium" || s === "low";
}

/** True iff `sev` is at least as severe as `threshold` (high ⊂ medium ⊂ low). */
export function meetsThreshold(sev: Severity, threshold: Severity): boolean {
  return RANK[sev] >= RANK[threshold];
}

/** Dead-code finding → severity. `test-only` is always low, else by tier. */
export function deadCodeSeverity(tier: Tier, verdict: Verdict): Severity {
  if (verdict === "test-only") return "low";
  switch (tier) {
    case "certain":
      return "high";
    case "likely":
      return "medium";
    case "maybe":
      return "low";
  }
}

/** Complexity threshold exceedance — all detectors are medium. */
export function complexitySeverity(): Severity {
  return "medium";
}

/** Copy-paste clones — advisory, low. */
export function duplicationSeverity(): Severity {
  return "low";
}

/** Risk-ranking hotspots — prioritization aid, low. */
export function hotspotSeverity(): Severity {
  return "low";
}

/** The severity of every finding across all four categories. */
export function severitiesOf(input: JsonInput): Severity[] {
  return [
    ...input.findings.map((f) => deadCodeSeverity(f.tier, f.verdict)),
    ...input.complexity.map(() => complexitySeverity()),
    ...input.duplication.map(() => duplicationSeverity()),
    ...input.hotspots.map(() => hotspotSeverity()),
  ];
}

/** True iff any finding is at or above `threshold` — the `--fail-on` predicate. */
export function gate(input: JsonInput, threshold: Severity): boolean {
  return severitiesOf(input).some((s) => meetsThreshold(s, threshold));
}
