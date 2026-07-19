import type { CloneLocation, DuplicationFinding } from "../syntactic/types.js";
import { toRelativePath } from "./paths.js";

/**
 * Merge same-file locations whose line ranges overlap or touch (one clone
 * group can legitimately list many near-identical positions in one file —
 * audit ev-20260701-007 observed 8 overlapping `util.ts:31-33` entries from a
 * single group). Locations in different files are never merged. Order of
 * first appearance (by file) is preserved.
 */
function mergeOverlapping(locations: CloneLocation[]): CloneLocation[] {
  const order: string[] = [];
  const byFile = new Map<string, CloneLocation[]>();
  for (const loc of locations) {
    if (!byFile.has(loc.file)) {
      byFile.set(loc.file, []);
      order.push(loc.file);
    }
    byFile.get(loc.file)!.push(loc);
  }

  const merged: CloneLocation[] = [];
  for (const file of order) {
    const sorted = byFile
      .get(file)!
      .slice()
      .sort((a, b) => a.startLine - b.startLine);
    let current = sorted[0]!;
    for (const next of sorted.slice(1)) {
      if (next.startLine <= current.endLine + 1) {
        current = {
          file,
          startLine: current.startLine,
          endLine: Math.max(current.endLine, next.endLine),
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
  }
  return merged;
}

/**
 * Render the duplication axis as a labeled section, worst-first. One line per
 * clone group: the matched token length and each merged location. Returns ""
 * when there are no clones.
 */
export function renderDuplication(
  findings: DuplicationFinding[],
  root: string,
): string {
  if (findings.length === 0) return "";
  const noun = findings.length === 1 ? "clone" : "clones";
  const header = `Duplication (${findings.length} ${noun})`;
  const lines = findings.map((f) => {
    const locs = mergeOverlapping(f.locations)
      .map((l) => `${toRelativePath(l.file, root)}:${l.startLine}-${l.endLine}`)
      .join(", ");
    return `  ${f.tokens} tokens duplicated: ${locs}`;
  });
  return [header, ...lines].join("\n");
}
