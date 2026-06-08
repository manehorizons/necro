import type { DuplicationFinding } from "../syntactic/types.js";

/**
 * Render the duplication axis as a labeled section, worst-first. One line per
 * clone group: the matched token length and each location. Returns "" when
 * there are no clones.
 */
export function renderDuplication(findings: DuplicationFinding[]): string {
  if (findings.length === 0) return "";
  const noun = findings.length === 1 ? "clone" : "clones";
  const header = `Duplication (${findings.length} ${noun})`;
  const lines = findings.map((f) => {
    const locs = f.locations.map((l) => `${l.file}:${l.startLine}-${l.endLine}`).join(", ");
    return `  ${f.tokens} tokens duplicated: ${locs}`;
  });
  return [header, ...lines].join("\n");
}
