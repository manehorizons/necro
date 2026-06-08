import type { ClassifiedFinding } from "../analyze/classify.js";
import { renderFindings } from "./evidence.js";

/** Render the default human-readable report: a summary line plus evidence chains. */
export function renderTerminal(findings: ClassifiedFinding[]): string {
  if (findings.length === 0) return "no findings";
  return `${summary(findings)}\n\n${renderFindings(findings)}`;
}

function summary(findings: ClassifiedFinding[]): string {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const key = f.verdict === "test-only" ? "test-only" : f.tier;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = ["certain", "likely", "maybe", "test-only"];
  const parts = order
    .filter((k) => counts.has(k))
    .map((k) => `${counts.get(k)} ${k}`);
  const noun = findings.length === 1 ? "finding" : "findings";
  return `${findings.length} ${noun} (${parts.join(", ")})`;
}
