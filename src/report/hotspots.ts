import type { HotspotEntry } from "../analyze/hotspots.js";

/**
 * Render the risk-hotspot ranking as a labeled section, worst-first. Each row
 * shows the auditable inputs (complexity, coverage, CRAP, churn). Returns ""
 * when there is nothing to rank, so the caller can omit the section.
 */
export function renderHotspots(entries: HotspotEntry[]): string {
  if (entries.length === 0) return "";
  const header = `Risk hotspots (top ${entries.length})`;
  const lines = entries.map((e) => {
    const cov = e.coverage === null ? "n/a" : `${Math.round(e.coverage * 100)}%`;
    const crap = e.crap === null ? "n/a" : round(e.crap);
    const churn = e.churn === null ? "n/a" : String(e.churn);
    return `  ${e.name}  ${e.file}:${e.line}   cx=${e.complexity} cov=${cov} crap=${crap} churn=${churn}`;
  });
  return [header, ...lines].join("\n");
}

function round(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}
