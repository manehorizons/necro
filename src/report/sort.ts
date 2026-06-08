import type { ClassifiedFinding } from "../analyze/classify.js";

/** Lower rank = shown first (most actionable). test-only sorts after dead tiers. */
function rank(finding: ClassifiedFinding): number {
  if (finding.verdict === "test-only") return 3;
  switch (finding.tier) {
    case "certain":
      return 0;
    case "likely":
      return 1;
    case "maybe":
      return 2;
  }
}

/** Sort findings worst-first: by tier severity, then file, then line. */
export function sortWorstFirst(findings: ClassifiedFinding[]): ClassifiedFinding[] {
  return [...findings].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const byFile = a.node.file.localeCompare(b.node.file);
    if (byFile !== 0) return byFile;
    return a.node.line - b.node.line;
  });
}
