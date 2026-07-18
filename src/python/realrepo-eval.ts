import type { ClassifiedFinding } from "../analyze/classify.js";
import type { CaseProvenance } from "../triage/eval-capture.js";

/** Ground-truth label for a Python real-repo reference case. */
export type GroundTruth = "dead" | "alive";

/** One hand-labeled case from `test/fixtures/python-realrepo/cases.json`. */
export interface RealrepoCase {
  name: string;
  truth: GroundTruth;
  provenance: CaseProvenance;
  rationale: string;
}

/** A case matched against necro's own scan output. `finding` is `null` when
 * the symbol produced no finding at all — necro's scan pipeline only emits a
 * `ClassifiedFinding` for symbols it suspects; no finding is itself a
 * (confident) "alive" prediction, not an absence of data. */
export interface RealrepoPair {
  case: RealrepoCase;
  finding: ClassifiedFinding | null;
}

export interface RealrepoResultRow {
  name: string;
  truth: GroundTruth;
  finding: ClassifiedFinding | null;
  /** The prediction disagrees with truth on the positive ("dead") class. */
  misclassified: boolean;
  provenance: CaseProvenance;
}

/** A diagnostic view of a scoring run: class balance + every misclassified
 * case, so a failing gate points to which cases/patterns were missed. */
export interface EvalBreakdown {
  byTruth: { dead: number; alive: number };
  misclassified: RealrepoResultRow[];
}

export interface EvalMetrics {
  total: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Precision/recall for the positive ("dead") class. */
  precision: number;
  recall: number;
  rows: RealrepoResultRow[];
  breakdown: EvalBreakdown;
}

/** A case is a predicted "dead" positive when necro's own matched finding
 * says `verdict === "dead"` at `tier` `"likely"` or `"certain"` — per design
 * doc §3's "dead findings at `likely` tier" floor wording. `tier === "maybe"`
 * (or no finding's `dead` verdict at all) is a negative prediction: necro
 * wasn't confident enough to count it. No finding at all is also negative
 * (necro found no reason to suspect the symbol — a confident "alive"). */
export function isPredictedDead(finding: ClassifiedFinding | null): boolean {
  if (finding === null) return false;
  return finding.verdict === "dead" && (finding.tier === "likely" || finding.tier === "certain");
}

/**
 * Score a set of `{case, finding}` pairs against the same tp/fp/fn math as
 * `src/triage/eval.ts`'s harness, but keyed on necro's own `ClassifiedFinding`
 * rather than an LLM verdict string — no client call, fully deterministic.
 */
export function scoreRealrepoCases(pairs: RealrepoPair[]): EvalMetrics {
  const rows: RealrepoResultRow[] = pairs.map(({ case: c, finding }) => {
    const predictedDead = isPredictedDead(finding);
    const misclassified = predictedDead !== (c.truth === "dead");
    return { name: c.name, truth: c.truth, finding, misclassified, provenance: c.provenance };
  });

  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const r of rows) {
    const predictedDead = isPredictedDead(r.finding);
    if (predictedDead && r.truth === "dead") tp++;
    else if (predictedDead && r.truth === "alive") fp++;
    else if (!predictedDead && r.truth === "dead") fn++;
  }
  // No positive predictions ⇒ no false positives ⇒ precision 1; no actual
  // positives ⇒ recall 1. Avoids 0/0.
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const breakdown: EvalBreakdown = {
    byTruth: {
      dead: rows.filter((r) => r.truth === "dead").length,
      alive: rows.filter((r) => r.truth === "alive").length,
    },
    misclassified: rows.filter((r) => r.misclassified),
  };
  return { total: rows.length, truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, rows, breakdown };
}

/** The accuracy gate: both precision and recall must clear their own floor. */
export function meetsFloors(m: EvalMetrics, precisionFloor: number, recallFloor: number): boolean {
  return m.precision >= precisionFloor && m.recall >= recallFloor;
}
