/**
 * Wires checkout resolution → tool runners → scorer into one competitor-bench
 * run. Scores each corpus repo independently (raw unused-export findings are
 * file-relative, so two repos' entries must never be merged before matching —
 * a stray filename collision across repos would silently corrupt scoring),
 * then sums predictions across every repo whose checkout was available.
 * Repos without a usable checkout are skipped, never silently dropped from
 * the report — `skippedRepos` records why.
 */

import type { EvalCase } from "../../triage/eval.js";
import { resolveCheckout } from "./checkout.js";
import { runKnip } from "./knip-runner.js";
import type {
  CompetitorBenchResult,
  CompetitorRunResult,
  RepoCoverage,
  SkippedRepo,
} from "./report.js";
import { deriveCorpusRepos } from "./repos.js";
import {
  type CompetitorPrediction,
  predictCases,
  scorePredictions,
} from "./score.js";
import { runTsPrune } from "./ts-prune-runner.js";

export interface RunCompetitorBenchOpts {
  cacheDir: string;
  now: string;
}

export async function runCompetitorBench(
  cases: EvalCase[],
  opts: RunCompetitorBenchOpts,
): Promise<CompetitorBenchResult> {
  const repos = deriveCorpusRepos(cases);
  const scoredRepos: RepoCoverage[] = [];
  const skippedRepos: SkippedRepo[] = [];
  const knipPredictions: CompetitorPrediction[] = [];
  const tsPrunePredictions: CompetitorPrediction[] = [];
  let knipVersion = "";
  let tsPruneVersion = "";

  for (const repo of repos) {
    const repoCases = cases.filter(
      (c) => c.provenance?.repo === repo.repo && c.provenance.sha === repo.sha,
    );
    const checkout = await resolveCheckout(repo, opts.cacheDir);
    if (!checkout.ok) {
      skippedRepos.push({
        repo: repo.repo,
        sha: repo.sha,
        cases: repoCases.length,
        reason: checkout.reason,
      });
      continue;
    }
    const [knip, tsPrune] = await Promise.all([
      runKnip(checkout.path),
      runTsPrune(checkout.path),
    ]);
    knipVersion = knip.version;
    tsPruneVersion = tsPrune.version;
    knipPredictions.push(...predictCases(repoCases, knip.unused));
    tsPrunePredictions.push(...predictCases(repoCases, tsPrune.unused));
    scoredRepos.push({
      repo: repo.repo,
      sha: repo.sha,
      cases: repoCases.length,
    });
  }

  const tools: CompetitorRunResult[] = [];
  if (knipPredictions.length > 0) {
    tools.push({
      tool: "knip",
      version: knipVersion,
      metrics: scorePredictions(knipPredictions),
    });
  }
  if (tsPrunePredictions.length > 0) {
    tools.push({
      tool: "ts-prune",
      version: tsPruneVersion,
      metrics: scorePredictions(tsPrunePredictions),
    });
  }

  return {
    generatedAt: opts.now,
    corpusId: "triage",
    scoredRepos,
    skippedRepos,
    n: scoredRepos.reduce((sum, r) => sum + r.cases, 0),
    tools,
  };
}
