import type { FunctionUnit } from "../syntactic/ir.js";
import { metrics } from "../syntactic/metrics.js";
import type { LcovReport } from "./coverage/lcov.js";
import { coverageRatio } from "./coverage/ratio.js";

/** One function ranked by composite risk. */
export interface HotspotEntry {
  name: string;
  file: string;
  line: number;
  complexity: number;
  /** Covered fraction in `[0,1]`, or null when no coverage report covers it. */
  coverage: number | null;
  /** CRAP score, or null when coverage is unavailable. */
  crap: number | null;
  /** Commits touching the file, or null when not a git repo. */
  churn: number | null;
  /** `(crap ?? complexity) × (churn ?? 1)` — the ranking weight. */
  risk: number;
}

/** CRAP = complexity² × (1 − coverage)³ + complexity (§5). */
export function crapScore(complexity: number, coverage: number): number {
  return complexity * complexity * (1 - coverage) ** 3 + complexity;
}

/**
 * Rank functions worst-first by composite risk, capped at `topN`. Coverage and
 * churn are optional: CRAP is computed only with a coverage report, churn only
 * in a git repo, and `risk` degrades to whatever inputs are present.
 */
export function rankHotspots(
  units: FunctionUnit[],
  coverage: LcovReport | null,
  churn: Map<string, number> | null,
  topN: number,
): HotspotEntry[] {
  const entries = units.map((u): HotspotEntry => {
    const complexity = metrics(u).cyclomatic;
    const cov = coverage
      ? coverageRatio(coverage, u.file, u.line, u.line + u.loc - 1)
      : null;
    const crap = cov === null ? null : crapScore(complexity, cov);
    const fileChurn = churn?.get(u.file) ?? null;
    const risk = (crap ?? complexity) * (fileChurn ?? 1);
    return {
      name: u.name,
      file: u.file,
      line: u.line,
      complexity,
      coverage: cov,
      crap,
      churn: fileChurn,
      risk,
    };
  });

  entries.sort((a, b) => {
    if (b.risk !== a.risk) return b.risk - a.risk;
    const byFile = a.file.localeCompare(b.file);
    return byFile !== 0 ? byFile : a.line - b.line;
  });
  return entries.slice(0, topN);
}
