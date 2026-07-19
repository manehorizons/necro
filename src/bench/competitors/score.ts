/**
 * Maps corpus cases to a competitor tool's predictions and scores them on the
 * "dead" class with the identical math necro's own `runEval` uses (same
 * precision/recall/F1 derivation, same 0/0 edge-case handling), so the
 * head-to-head is a genuine apples-to-apples comparison. Pure — no I/O.
 */

import { f1 } from "../snapshot.js";
import type { EvalCase } from "../../triage/eval.js";
import type { RawUnusedExport } from "./types.js";

export interface CompetitorMetrics {
  total: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

/** One case's prediction from a tool, for diagnosis. */
export interface CompetitorPrediction {
  name: string;
  truth: EvalCase["truth"];
  predictedDead: boolean;
}

function key(file: string, symbol: string): string {
  return `${file}::${symbol}`;
}

/** Predict each case "dead" iff the tool's raw findings include that case's
 * exact provenance file+symbol. Cases without provenance (synthetic corpus
 * entries) are skipped — the competitor bench only scores real-repo cases. */
export function predictCases(cases: EvalCase[], unused: RawUnusedExport[]): CompetitorPrediction[] {
  const unusedSet = new Set(unused.map((u) => key(u.file, u.symbol)));
  const out: CompetitorPrediction[] = [];
  for (const c of cases) {
    if (!c.provenance) continue;
    const predictedDead = unusedSet.has(key(c.provenance.file, c.provenance.symbol));
    out.push({ name: c.name, truth: c.truth, predictedDead });
  }
  return out;
}

/** Score predictions on the "dead" positive class — identical derivation to
 * `runEval`: no positive predictions ⇒ precision 1; no actual positives ⇒
 * recall 1 (avoids 0/0). */
export function scorePredictions(predictions: CompetitorPrediction[]): CompetitorMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const p of predictions) {
    if (p.predictedDead && p.truth === "dead") tp++;
    else if (p.predictedDead && p.truth === "alive") fp++;
    else if (!p.predictedDead && p.truth === "dead") fn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return {
    total: predictions.length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1: f1(precision, recall),
  };
}

/** Convenience: predict + score in one call. */
export function scoreTool(cases: EvalCase[], unused: RawUnusedExport[]): CompetitorMetrics {
  return scorePredictions(predictCases(cases, unused));
}
