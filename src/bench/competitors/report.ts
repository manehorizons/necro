/** The competitor-bench's own output shape (`bench/competitors.json`), before
 * being merged into the main `bench/results.json` snapshot by `snapshot.ts`. */

import type { CompetitorMetrics } from "./score.js";

export interface CompetitorRunResult {
  tool: string;
  version: string;
  metrics: CompetitorMetrics;
}

/** One corpus repo the bench either scored or had to skip (with why). */
export interface RepoCoverage {
  repo: string;
  sha: string;
  cases: number;
}

export interface SkippedRepo extends RepoCoverage {
  reason: string;
}

export interface CompetitorBenchResult {
  generatedAt: string;
  corpusId: "triage";
  /** Repos whose checkout was available and were actually scored. */
  scoredRepos: RepoCoverage[];
  /** Repos the corpus references but couldn't be scored this run (missing
   * checkout, unreachable pinned SHA, etc.) — never silently dropped. */
  skippedRepos: SkippedRepo[];
  /** Case count actually scored (sum of `scoredRepos[].cases`), not the full
   * corpus size when `skippedRepos` is non-empty. */
  n: number;
  tools: CompetitorRunResult[];
}
