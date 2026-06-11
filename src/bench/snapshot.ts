/**
 * The published benchmark snapshot: the single, provenance-stamped artifact the
 * `npm run bench` runner writes and the Accuracy docs page reads. Every number on
 * the page traces to a field here, so the page can never drift from a hand-typed
 * metric. This module is pure — no I/O, no clock, no model calls — so the shape and
 * the derivations are fully unit-testable.
 */

/** One source repo a corpus was captured from, with the case count it contributed. */
export interface BenchSource {
  repo: string;
  sha: string;
  cases: number;
}

/** Dead-code triage metrics (positive class = "dead"). */
export interface TriageMetrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

/** Duplication-refactor structural metrics. */
export interface DupMetrics {
  passRate: number;
  passed: number;
  total: number;
}

/** One corpus's measured result. */
export interface BenchCorpusResult {
  id: "triage" | "dup";
  metricKind: "precision-recall" | "pass-rate";
  sources: BenchSource[];
  n: number;
  metrics: TriageMetrics | DupMetrics;
}

/** The whole snapshot: provenance header + per-corpus results. */
export interface BenchResults {
  schemaVersion: 1;
  methodologyVersion: 1;
  /** ISO timestamp; injected by the runner (kept out of this pure module). */
  generatedAt: string;
  /** necro version the run was measured against. */
  necroVersion: string;
  /** Model id the run used (the numbers are model-specific). */
  model: string;
  corpora: BenchCorpusResult[];
}

/** Shapes the summarizers read — structural subsets of the eval-module metrics. */
interface CaseWithProvenance {
  provenance?: { repo: string; sha: string };
}
interface TriageEvalLike {
  total: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
}
interface DupEvalLike {
  passRate: number;
  rows: { pass: boolean }[];
}

/** Harmonic mean of precision and recall; 0 when both are 0 (no divide-by-zero). */
function f1(precision: number, recall: number): number {
  const denom = precision + recall;
  return denom === 0 ? 0 : (2 * precision * recall) / denom;
}

/**
 * Aggregate per-case provenance into `{repo, sha, cases}` sources, preserving
 * first-appearance order so the snapshot reads in capture order (e.g. hono then trpc).
 */
export function deriveSources(cases: CaseWithProvenance[]): BenchSource[] {
  const byKey = new Map<string, BenchSource>();
  for (const c of cases) {
    const p = c.provenance;
    if (!p) continue;
    const key = `${p.repo}@${p.sha}`;
    const existing = byKey.get(key);
    if (existing) existing.cases += 1;
    else byKey.set(key, { repo: p.repo, sha: p.sha, cases: 1 });
  }
  return [...byKey.values()];
}

/** Map a triage eval result into a corpus result, deriving F1. */
export function summarizeTriage(m: TriageEvalLike, sources: BenchSource[]): BenchCorpusResult {
  return {
    id: "triage",
    metricKind: "precision-recall",
    sources,
    n: m.total,
    metrics: {
      precision: m.precision,
      recall: m.recall,
      f1: f1(m.precision, m.recall),
      truePositives: m.truePositives,
      falsePositives: m.falsePositives,
      falseNegatives: m.falseNegatives,
    },
  };
}

/** Map a duplication eval result into a corpus result, counting passed/total from rows. */
export function summarizeDup(m: DupEvalLike, sources: BenchSource[]): BenchCorpusResult {
  const total = m.rows.length;
  const passed = m.rows.filter((r) => r.pass).length;
  return {
    id: "dup",
    metricKind: "pass-rate",
    sources,
    n: total,
    metrics: { passRate: m.passRate, passed, total },
  };
}

/** Serialize to canonical JSON (2-space indent, trailing newline). */
export function serialize(results: BenchResults): string {
  return `${JSON.stringify(results, null, 2)}\n`;
}

/** Parse a snapshot back into the typed shape. */
export function parse(text: string): BenchResults {
  return JSON.parse(text) as BenchResults;
}
