import type { ComplexityFinding } from "../syntactic/types.js";
import { toRelativePath } from "./paths.js";

/**
 * Render the complexity axis as a labeled section, worst-first. Returns "" when
 * there are no complexity findings, so the caller can omit the section.
 */
export function renderComplexity(
  findings: ComplexityFinding[],
  root: string,
): string {
  if (findings.length === 0) return "";
  const noun = findings.length === 1 ? "issue" : "issues";
  const header = `Complexity (${findings.length} ${noun})`;
  const lines = findings.map(
    (f) =>
      `  ${f.name}  ${toRelativePath(f.file, root)}:${f.line}   [${f.detector}] ${f.message}`,
  );
  return [header, ...lines].join("\n");
}
