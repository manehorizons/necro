import { readFile } from "node:fs/promises";
import type { ClassifiedFinding, EvidenceSignal } from "../analyze/classify.js";
import type { TriageClient } from "./client.js";
import type { CaseProvenance } from "./eval-capture.js";
import { buildPrompt, type TriageVerdict } from "./prompt.js";
import type { Snippet } from "./snippet.js";

/** Ground-truth label for a reference case. */
export type GroundTruth = "dead" | "alive";

/** One hand-labeled reference case: a `maybe`-style finding with known truth.
 * The snippet is inline so the harness needs no source files on disk.
 * `provenance` + `rationale` are present on real-repo-derived cases (the
 * captured evidence is verbatim necro output); synthetic cases omit them. */
export interface EvalCase {
  name: string;
  truth: GroundTruth;
  code: string;
  evidence: EvidenceSignal[];
  /** Where a real-repo case came from; absent for synthetic cases. */
  provenance?: CaseProvenance;
  /** Why the ground-truth label was chosen; present on real-repo cases. */
  rationale?: string;
}

export interface EvalResultRow {
  name: string;
  truth: GroundTruth;
  verdict: TriageVerdict;
  /** The prediction disagrees with truth on the positive ("dead") class. */
  misclassified: boolean;
  /** Carried through for diagnosis on real-repo cases. */
  provenance?: CaseProvenance;
  /** The evidence the model saw — surfaced so a miss is diagnosable. */
  evidence: EvidenceSignal[];
}

/** A diagnostic view of an eval run: class balance + every misclassified case,
 * so a failing gate points to which cases / evidence patterns were missed. */
export interface EvalBreakdown {
  byTruth: { dead: number; alive: number };
  misclassified: EvalResultRow[];
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
  breakdown: EvalBreakdown;
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
      const predictedDead = verdict === "likely-dead";
      const misclassified = predictedDead !== (c.truth === "dead");
      rows[idx] = { name: c.name, truth: c.truth, verdict, misclassified, provenance: c.provenance, evidence: c.evidence };
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
  const breakdown: EvalBreakdown = {
    byTruth: {
      dead: rows.filter((r) => r.truth === "dead").length,
      alive: rows.filter((r) => r.truth === "alive").length,
    },
    misclassified: rows.filter((r) => r.misclassified),
  };
  return { total: cases.length, truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, rows, breakdown };
}

/** A compact, human-readable breakdown for eval logs: class balance plus each
 * missed case with its provenance and the evidence the model saw. */
export function formatBreakdown(m: EvalMetrics): string {
  const head = `dead=${m.breakdown.byTruth.dead} alive=${m.breakdown.byTruth.alive}  precision=${m.precision.toFixed(2)} recall=${m.recall.toFixed(2)}`;
  if (m.breakdown.misclassified.length === 0) return `${head}\n  (no misclassifications)`;
  const lines = m.breakdown.misclassified.map((r) => {
    const where = r.provenance ? `${r.provenance.repo}@${r.provenance.sha} ${r.provenance.file}:${r.provenance.line}` : "(synthetic)";
    const ev = r.evidence.map((e) => `${e.ok === true ? "✓" : e.ok === false ? "✗" : "•"} ${e.text}`).join("; ");
    return `  ✗ ${r.name} truth=${r.truth} got=${r.verdict}  [${where}]\n      evidence: ${ev || "(none)"}`;
  });
  return [head, ...lines].join("\n");
}

/** The accuracy gate: both precision and recall must clear `threshold`. */
export function meetsThreshold(m: EvalMetrics, threshold: number): boolean {
  return m.precision >= threshold && m.recall >= threshold;
}
