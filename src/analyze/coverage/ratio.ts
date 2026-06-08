import type { LcovReport } from "./lcov.js";
import { findFileCoverage } from "./lookup.js";

/**
 * Fraction of a function's instrumented lines that were covered, in `[0, 1]`.
 * Approximates method coverage by counting lcov `DA` line-hit records within
 * `[startLine, endLine]` (lcov `FN` records carry no end line). Returns `null`
 * when the file or range has no instrumented lines — "unavailable", not 0.
 */
export function coverageRatio(
  report: LcovReport,
  file: string,
  startLine: number,
  endLine: number,
): number | null {
  const cov = findFileCoverage(report, file);
  if (!cov) return null;

  let instrumented = 0;
  let covered = 0;
  for (const [line, hits] of cov.lines) {
    if (line < startLine || line > endLine) continue;
    instrumented++;
    if (hits > 0) covered++;
  }
  if (instrumented === 0) return null;
  return covered / instrumented;
}
