import type { LcovFileCoverage, LcovReport } from "./lcov.js";

const CLASS_BLOCK =
  /<class\b[^>]*\bfilename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g;
const LINE_RECORD = /<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g;

/**
 * Parse Cobertura XML (Python's `coverage xml` output) into the same
 * {@link LcovReport} shape lcov produces, so {@link coverageFor} needs no
 * language-specific branching. `fns` is left empty — Cobertura's `<line>`
 * records already cover a `def`'s own declaration line, so `coverageFor`'s
 * existing line-hits fallback resolves it without function-name matching.
 * Multiple `<class>` blocks naming the same `filename` (nested classes) merge
 * their line records into one file entry.
 */
export function parseCobertura(raw: string): LcovReport {
  const files = new Map<string, LcovFileCoverage>();

  for (const classMatch of raw.matchAll(CLASS_BLOCK)) {
    const filename = classMatch[1] as string;
    const body = classMatch[2] as string;

    let cov = files.get(filename);
    if (!cov) {
      cov = { fns: [], lines: new Map() };
      files.set(filename, cov);
    }

    for (const lineMatch of body.matchAll(LINE_RECORD)) {
      const lineNo = Number.parseInt(lineMatch[1] as string, 10);
      const hits = Number.parseInt(lineMatch[2] as string, 10);
      cov.lines.set(lineNo, hits);
    }
  }

  return { files };
}
