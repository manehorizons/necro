import { readFile } from "node:fs/promises";
import type { RefactorClient } from "./client.js";
import type { RefactorContext } from "./context.js";
import { buildRefactorPrompt, type RefactorProposal } from "./prompt.js";

/** One reference god-function case. The source is inline so the live model can
 * be prompted from it; the structural asserts measure the proposed `replacement`
 * code directly. */
export interface RefactorEvalCase {
  name: string;
  /** Path used for the source and as the parser hint (e.g. `src/svc.ts`). */
  file: string;
  /** Original god-function source. */
  source: string;
  /** Public signature line that must survive the split. */
  signature: string;
  /** LOC threshold the split must bring every function under. */
  threshold: number;
}

/** The three structural criteria a god-function split must clear. */
export interface ProposalCriteria {
  /** ≥2 functions in the rewritten code (the original plus ≥1 helper). */
  splitsIntoMultiple: boolean;
  /** The original public signature line is present verbatim in the replacement. */
  preservesCallSurface: boolean;
  /** Every function in the replacement is under the god-function threshold. */
  reducesComplexity: boolean;
}

export interface EvalRow {
  name: string;
  pass: boolean;
  criteria: ProposalCriteria | null;
  /** Set when the proposal could not be produced/parsed. */
  failure?: string;
}

export interface RefactorEvalMetrics {
  passRate: number;
  rows: EvalRow[];
}

/** All three criteria must hold. */
export function proposalPasses(c: ProposalCriteria): boolean {
  return c.splitsIntoMultiple && c.preservesCallSurface && c.reducesComplexity;
}

/** Load the reference set (a JSON array of {@link RefactorEvalCase}). */
export async function loadEvalCases(path: string): Promise<RefactorEvalCase[]> {
  return JSON.parse(await readFile(path, "utf8")) as RefactorEvalCase[];
}

/**
 * Score one proposal against the three structural criteria. Because the proposal
 * carries the rewritten code (not a diff), this just lowers `replacement` to the
 * syntactic IR and measures it — no patch application, no git.
 */
export async function evaluateProposal(
  c: RefactorEvalCase,
  proposal: RefactorProposal,
): Promise<ProposalCriteria> {
  const { lowerSource } = await import("../syntactic/ir.js");
  const units = await lowerSource(c.file, proposal.replacement);

  const splitsIntoMultiple = units.length >= 2;
  const preservesCallSurface = proposal.replacement.includes(c.signature);
  const reducesComplexity = units.length > 0 && units.every((u) => u.loc < c.threshold);

  return { splitsIntoMultiple, preservesCallSurface, reducesComplexity };
}

/** Build the model prompt for a case from its inline source. */
export function buildCasePrompt(c: RefactorEvalCase) {
  const lines = c.source.split("\n");
  const numbered = lines.map((l, i) => `${i + 1}\t${l}`).join("\n");
  const context: RefactorContext = {
    finding: {
      detector: "god-function",
      file: c.file,
      line: 1,
      name: c.name,
      value: lines.length,
      threshold: c.threshold,
      message: `god function — ${lines.length} lines > ${c.threshold}`,
    },
    snippet: { file: c.file, startLine: 1, endLine: lines.length, code: numbered },
    imports: lines.map((l) => l.trim()).filter((l) => l.startsWith("import ") && !l.startsWith("import(")),
  };
  return buildRefactorPrompt(context);
}

/**
 * Run the refactor over the reference set and score the structural pass-rate.
 * A case passes only when its proposal clears all three criteria; an
 * unparseable response is a failed case (never throws).
 */
export async function runRefactorEval(
  cases: RefactorEvalCase[],
  client: RefactorClient,
  opts: { concurrency?: number } = {},
): Promise<RefactorEvalMetrics> {
  const rows = new Array<EvalRow>(cases.length);
  const limit = Math.min(Math.max(opts.concurrency ?? 3, 1), cases.length || 1);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < cases.length) {
      const idx = next++;
      const c = cases[idx] as RefactorEvalCase;
      const result = await client.propose(buildCasePrompt(c));
      if (!result.ok) {
        rows[idx] = { name: c.name, pass: false, criteria: null, failure: result.reason };
        continue;
      }
      const criteria = await evaluateProposal(c, result.proposal);
      rows[idx] = { name: c.name, pass: proposalPasses(criteria), criteria };
    }
  });
  await Promise.all(workers);

  const passes = rows.filter((r) => r.pass).length;
  const passRate = cases.length === 0 ? 1 : passes / cases.length;
  return { passRate, rows };
}

/** The accuracy gate: the structural pass-rate must clear `threshold`. */
export function meetsThreshold(m: RefactorEvalMetrics, threshold: number): boolean {
  return m.passRate >= threshold;
}
