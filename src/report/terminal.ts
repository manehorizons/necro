import type { ClassifiedFinding } from "../analyze/classify.js";
import type { EntryResolution } from "../engine/model.js";
import { renderFindings } from "./evidence.js";

/** Render the default human-readable report: a summary line plus evidence chains. */
export function renderTerminal(
  findings: ClassifiedFinding[],
  root: string,
  color: boolean,
): string {
  if (findings.length === 0) return "no findings";
  return `${summary(findings)}\n\n${renderFindings(findings, root, color)}`;
}

/**
 * One prominent, actionable banner when reachability collapsed (§2.1) — zero
 * production entries resolved on a non-empty graph. `null` when not collapsed.
 */
export function renderEntryCollapseBanner(
  entryResolution: EntryResolution,
): string | null {
  if (!entryResolution.collapsed) return null;
  return [
    "⚠ 0 production entry points resolved — reachability is unseeded.",
    'Every dead-code finding below has been demoted to "maybe"; none are auto-fix eligible.',
    "Fix this one of three ways:",
    "  1. Point package.json main/module/bin/exports at your real entry file (with a tsconfig outDir/rootDir, necro maps dist/ back to src/).",
    '  2. Add an "entries" field to necro.config.json listing your entry file(s).',
    "  3. Use a conventional entry filename (index.ts, src/index.ts, main.ts, src/main.ts).",
  ].join("\n");
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
