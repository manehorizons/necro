import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RefactorClient } from "./client.js";
import type { RefactorContext } from "./context.js";
import { buildRefactorPrompt, type RefactorProposal } from "./prompt.js";

/** One reference god-function case. The source is inline so the live model can
 * be prompted from it; the structural asserts reconstruct the result by applying
 * the proposed diff. */
export interface RefactorEvalCase {
  name: string;
  /** Path used for the source and in the proposed diff (e.g. `src/svc.ts`). */
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
  /** ≥1 helper extracted (so ≥2 functions result). */
  splitsIntoMultiple: boolean;
  /** The original public signature is not changed by the diff. */
  preservesCallSurface: boolean;
  /** Every function in the result is under the god-function threshold. */
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

/** Whether the diff leaves the public signature untouched: not preserved only
 * when the signature is on a removed line and not re-added identically. */
export function signaturePreserved(diff: string, signature: string): boolean {
  const lines = diff.split("\n");
  const removed = lines.some(
    (l) => l.startsWith("-") && !l.startsWith("---") && l.includes(signature),
  );
  const added = lines.some((l) => l.startsWith("+") && !l.startsWith("+++") && l.includes(signature));
  return !removed || added;
}

/** Apply a unified diff to `source` in a scratch dir; return the result, or
 * `null` if it doesn't apply. Uses `git apply` (no repo needed). */
export async function applyDiffToSource(
  source: string,
  file: string,
  diff: string,
): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "necro-eval-apply-"));
  try {
    const dest = join(dir, file);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, source);
    const applied = await new Promise<boolean>((resolve) => {
      const child = execFile("git", ["apply", "--whitespace=nowarn"], { cwd: dir }, (err) =>
        resolve(!err),
      );
      child.stdin?.end(diff);
    });
    if (!applied) return null;
    return await readFile(dest, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Whether every function in `source` is under `threshold` lines. */
async function everyFunctionUnder(file: string, source: string, threshold: number): Promise<boolean> {
  const { lowerSource } = await import("../syntactic/ir.js");
  const units = await lowerSource(file, source);
  if (units.length === 0) return false;
  return units.every((u) => u.loc < threshold);
}

/** Score one proposal against the three structural criteria. */
export async function evaluateProposal(
  c: RefactorEvalCase,
  proposal: RefactorProposal,
): Promise<ProposalCriteria> {
  const splitsIntoMultiple = proposal.newFunctions.length >= 1;
  const preservesCallSurface = signaturePreserved(proposal.diff, c.signature);

  const result = await applyDiffToSource(c.source, c.file, proposal.diff);
  const reducesComplexity = result === null ? false : await everyFunctionUnder(c.file, result, c.threshold);

  return { splitsIntoMultiple, preservesCallSurface, reducesComplexity };
}

/** Build the model prompt for a case from its inline source. */
function casePrompt(c: RefactorEvalCase) {
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
      const result = await client.propose(casePrompt(c));
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
