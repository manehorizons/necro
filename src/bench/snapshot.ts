/**
 * The published benchmark snapshot: the single, provenance-stamped artifact the
 * `npm run bench` runner writes and the Accuracy docs page reads. Every number on
 * the page traces to a field here, so the page can never drift from a hand-typed
 * metric. This module is pure — no I/O, no clock, no model calls — so the shape and
 * the derivations are fully unit-testable.
 */

// Type-only: erased at compile time, so this doesn't create a runtime import
// cycle even though competitors/score.ts imports `f1` from this module.
import type { CompetitorBenchResult } from "./competitors/report.js";

/** One source repo a corpus was captured from, with the case count it contributed. */
export interface BenchSource {
  repo: string;
  sha: string;
  cases: number;
}

/** A metric's spread across N runs of the same eval. */
export interface MinMeanMax {
  min: number;
  mean: number;
  max: number;
}

/** Dead-code triage metrics (positive class = "dead"). Top-level precision/recall/f1
 * are the mean across runs (single-run when only one was captured); `variance` is
 * present from methodologyVersion 2 onward, when N > 1 runs were aggregated. */
export interface TriageMetrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  variance?: {
    precision: MinMeanMax;
    recall: MinMeanMax;
    f1: MinMeanMax;
  };
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
  /** 1: single-run snapshot. 2: triage corpus runs N times; `TriageMetrics.variance`
   * is populated (additive — every methodologyVersion-1 field is still present). */
  methodologyVersion: 1 | 2;
  /** ISO timestamp; injected by the runner (kept out of this pure module). */
  generatedAt: string;
  /** necro version the run was measured against. */
  necroVersion: string;
  /** Model id the run used (the numbers are model-specific). */
  model: string;
  corpora: BenchCorpusResult[];
  /** Knip/ts-prune scored on the identical triage corpus (`npm run
   * bench:competitors`). Absent until that's been run at least once; a
   * pre-existing snapshot merged with a fresh competitor run keeps this. */
  competitors?: CompetitorBenchResult;
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
export function f1(precision: number, recall: number): number {
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

function minMeanMax(values: number[]): MinMeanMax {
  return {
    min: Math.min(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    max: Math.max(...values),
  };
}

/**
 * Map one or more triage eval runs into a corpus result, deriving F1 per run.
 * A single run produces the methodologyVersion-1 shape (no `variance`); N > 1
 * runs additionally aggregate min/mean/max across runs into `variance`, and the
 * top-level precision/recall/f1/TP/FP/FN become the mean (rounded to the nearest
 * whole count for TP/FP/FN, which are additive per-run counts, not rates).
 */
export function summarizeTriage(runs: TriageEvalLike | TriageEvalLike[], sources: BenchSource[]): BenchCorpusResult {
  const list = Array.isArray(runs) ? runs : [runs];
  const f1s = list.map((r) => f1(r.precision, r.recall));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  const metrics: TriageMetrics = {
    precision: mean(list.map((r) => r.precision)),
    recall: mean(list.map((r) => r.recall)),
    f1: mean(f1s),
    truePositives: Math.round(mean(list.map((r) => r.truePositives))),
    falsePositives: Math.round(mean(list.map((r) => r.falsePositives))),
    falseNegatives: Math.round(mean(list.map((r) => r.falseNegatives))),
  };
  if (list.length > 1) {
    metrics.variance = {
      precision: minMeanMax(list.map((r) => r.precision)),
      recall: minMeanMax(list.map((r) => r.recall)),
      f1: minMeanMax(f1s),
    };
  }

  return {
    id: "triage",
    metricKind: "precision-recall",
    sources,
    n: list[0]!.total,
    metrics,
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

/** Merge a fresh competitor-bench report into a snapshot's `competitors`
 * field, replacing any prior one. Pure. */
export function withCompetitors(results: BenchResults, competitors: CompetitorBenchResult): BenchResults {
  return { ...results, competitors };
}

/** Serialize to canonical JSON (2-space indent, trailing newline). */
export function serialize(results: BenchResults): string {
  return `${JSON.stringify(results, null, 2)}\n`;
}

/** Parse a snapshot back into the typed shape. */
export function parse(text: string): BenchResults {
  return JSON.parse(text) as BenchResults;
}
