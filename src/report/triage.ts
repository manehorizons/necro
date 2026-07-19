import type { TriagedFinding, TriageRunResult } from "../triage/index.js";
import type { TriageVerdict } from "../triage/prompt.js";

/** Worst-first: a confident "dead" call is the most actionable, "alive" the least. */
const VERDICT_RANK: Record<TriageVerdict, number> = {
  "likely-dead": 0,
  unsure: 1,
  "likely-alive": 2,
};

function sortWorstFirst(triaged: TriagedFinding[]): TriagedFinding[] {
  return [...triaged].sort((a, b) => {
    const byVerdict = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    if (byVerdict !== 0) return byVerdict;
    const byFile = a.finding.node.file.localeCompare(b.finding.node.file);
    return byFile !== 0 ? byFile : a.finding.node.line - b.finding.node.line;
  });
}

/** Human-readable triage report, worst-first, with a summary header. */
export function renderTriage(res: TriageRunResult): string {
  if (res.consideredMaybe === 0) return "no maybe findings to triage";
  if (res.triaged.length === 0) return "nothing triaged";

  const counts = new Map<TriageVerdict, number>();
  for (const t of res.triaged)
    counts.set(t.verdict, (counts.get(t.verdict) ?? 0) + 1);
  const order: TriageVerdict[] = ["likely-dead", "unsure", "likely-alive"];
  const parts = order
    .filter((v) => counts.has(v))
    .map((v) => `${counts.get(v)} ${v}`);
  const dropped =
    res.dropped > 0 ? ` — ${res.dropped} skipped (maxFindings)` : "";
  const header = `triaged ${res.triaged.length} maybe finding(s) (${parts.join(", ")})${dropped}`;

  const body = sortWorstFirst(res.triaged)
    .map((t) => {
      const { node } = t.finding;
      return `  ${t.verdict.padEnd(13)} ${node.name}  ${node.file}:${node.line}\n    ${t.reasoning}`;
    })
    .join("\n\n");

  return `${header}\n\n${body}`;
}

/** Triage findings as JSON — the scan finding plus an attached `triage` field.
 * Worst-first to mirror the terminal report. Independent of scan/fix JSON. */
export function toTriageJson(res: TriageRunResult): string {
  const findings = sortWorstFirst(res.triaged).map((t) => ({
    name: t.finding.node.name,
    file: t.finding.node.file,
    line: t.finding.node.line,
    tier: t.finding.tier,
    verdict: t.finding.verdict,
    autoFixEligible: t.finding.autoFixEligible,
    evidence: t.finding.evidence,
    triage: { verdict: t.verdict, reasoning: t.reasoning, model: t.model },
  }));
  return JSON.stringify({ triage: findings }, null, 2);
}
