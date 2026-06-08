import type { SymbolNode } from "../../graph/types.js";
import type { LcovFileCoverage, LcovReport } from "./lcov.js";

/** Coverage outcome for a single symbol. */
export type CoverageStatus =
  | { kind: "hit"; hits: number }
  | { kind: "miss" }
  | { kind: "unavailable" };

/**
 * Resolve a symbol's coverage from an lcov report. Matches the symbol's file
 * against report keys (exact, else path-suffix — tolerant of absolute vs.
 * relative `SF:` paths), then the symbol by `FN` name + declaration line,
 * falling back to the `DA` hit count at the declaration line. A file or symbol
 * with no record is `unavailable` — it never blocks a verdict (AC-4).
 */
export function coverageFor(report: LcovReport, node: SymbolNode): CoverageStatus {
  const cov = findFileCoverage(report, node.file);
  if (!cov) return { kind: "unavailable" };

  const fn = cov.fns.find((f) => f.name === node.name && f.line === node.line);
  const hits = fn ? fn.hits : cov.lines.get(node.line);
  if (hits === undefined) return { kind: "unavailable" };

  return hits > 0 ? { kind: "hit", hits } : { kind: "miss" };
}

/** Find a file's coverage in a report, tolerant of absolute vs. relative `SF:` paths. */
export function findFileCoverage(report: LcovReport, file: string): LcovFileCoverage | undefined {
  const direct = report.files.get(file);
  if (direct) return direct;
  const target = norm(file);
  for (const [key, cov] of report.files) {
    if (pathSuffixMatch(target, norm(key))) return cov;
  }
  return undefined;
}

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** True when one normalized path is a path-segment-aligned suffix of the other. */
function pathSuffixMatch(a: string, b: string): boolean {
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}
