import { readFile } from "node:fs/promises";
import type { ClassifiedFinding, EvidenceSignal } from "../analyze/classify.js";
import type { TriageClient } from "./client.js";
import { buildPrompt, type TriageVerdict } from "./prompt.js";
import type { Snippet } from "./snippet.js";

/** Ground-truth label for a reference case. */
export type GroundTruth = "dead" | "alive";

/** One hand-labeled reference case: a `maybe`-style finding with known truth.
 * The snippet is inline so the harness needs no source files on disk. */
export interface EvalCase {
  name: string;
  truth: GroundTruth;
  code: string;
  evidence: EvidenceSignal[];
}

export interface EvalResultRow {
  name: string;
  truth: GroundTruth;
  verdict: TriageVerdict;
}

export interface EvalMetrics {
  total: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Precision/recall for the positive ("dead") class — what triage must not get wrong. */
  precision: number;
  recall: number;
  rows: EvalResultRow[];
}

/** Load the labeled reference set (a JSON array of {@link EvalCase}). */
export async function loadEvalCases(path: string): Promise<EvalCase[]> {
  return JSON.parse(await readFile(path, "utf8")) as EvalCase[];
}

function caseToPrompt(c: EvalCase) {
  const file = `${c.name}.ts`;
  const finding: ClassifiedFinding = {
    node: { id: `${file}:1:${c.name}`, name: c.name, file, line: 1, exported: false },
    verdict: "dead",
    tier: "maybe",
    autoFixEligible: false,
    evidence: c.evidence,
  };
  const snippet: Snippet = { file, startLine: 1, endLine: c.code.split("\n").length, code: c.code };
  return buildPrompt(finding, snippet);
}

/**
 * Run triage over the reference set and score it. The positive class is "dead":
 * a `likely-dead` verdict is a positive prediction; `likely-alive`/`unsure` are
 * negative. Precision guards against falsely calling live code dead (the
 * trust-killer); recall measures how much real dead code it catches.
 */
export async function runEval(
  cases: EvalCase[],
  client: TriageClient,
  opts: { concurrency?: number } = {},
): Promise<EvalMetrics> {
  const rows = new Array<EvalResultRow>(cases.length);
  const limit = Math.min(Math.max(opts.concurrency ?? 4, 1), cases.length || 1);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < cases.length) {
      const idx = next++;
      const c = cases[idx] as EvalCase;
      const { verdict } = await client.classify(caseToPrompt(c));
      rows[idx] = { name: c.name, truth: c.truth, verdict };
    }
  });
  await Promise.all(workers);

  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const r of rows) {
    const predictedDead = r.verdict === "likely-dead";
    if (predictedDead && r.truth === "dead") tp++;
    else if (predictedDead && r.truth === "alive") fp++;
    else if (!predictedDead && r.truth === "dead") fn++;
  }
  // No positive predictions ⇒ no false positives ⇒ precision 1; no actual
  // positives ⇒ recall 1. Avoids 0/0.
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { total: cases.length, truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, rows };
}

/** The accuracy gate: both precision and recall must clear `threshold`. */
export function meetsThreshold(m: EvalMetrics, threshold: number): boolean {
  return m.precision >= threshold && m.recall >= threshold;
}
