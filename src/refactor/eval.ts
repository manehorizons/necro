import { readFile } from "node:fs/promises";
import type { CloneLocation } from "../syntactic/types.js";
import type { CaseProvenance } from "../triage/eval-capture.js";
import { extractRange } from "../triage/snippet.js";
import type { RefactorClient } from "./client.js";
import type { DuplicateLocationContext, RefactorContext } from "./context.js";
import {
  buildDuplicatePrompt,
  buildRefactorPrompt,
  type DuplicateProposal,
  type RefactorPrompt,
  type RefactorProposal,
} from "./prompt.js";
import { spliceDuplicate } from "./splice.js";

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
  /** Where a real-repo case was captured from — absent on synthetic cases. */
  provenance?: CaseProvenance;
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
export function meetsThreshold(m: { passRate: number }, threshold: number): boolean {
  return m.passRate >= threshold;
}

// ── extract-duplicate ───────────────────────────────────────────────────────

/** One reference extract-duplicate case. The file sources are inline so the
 * live model can be prompted from them; the structural asserts splice the
 * proposal in-memory and measure the result. */
export interface DuplicateEvalCase {
  name: string;
  /** Inline file sources keyed by path; the clone group references these. */
  files: { path: string; source: string }[];
  /** The clone group's locations within the inline sources. */
  locations: CloneLocation[];
  /** The clone group's matched token length. */
  tokens: number;
  /** Detector `minTokens` used when re-checking that the duplication collapsed. */
  minTokens: number;
  /** Call-surface lines that must still appear after the extraction. */
  signatures: string[];
  /** Where a real-repo case was captured from — absent on synthetic cases. */
  provenance?: CaseProvenance;
}

/**
 * Fraction of the original clone-group token length that the largest residual
 * clone **among the model's edit replacements** must fall below for the
 * duplication to count as collapsed. A genuine extraction reduces each clone
 * site to a short call (residual ≈ 0); a non-extraction leaves the site's body
 * near-intact (residual ≈ the full group). `0.5` is the midpoint that credits
 * any extraction reducing the shared logic by more than half while still failing
 * proposals that barely touch it — calibrated from the captured live proposals
 * (`test/fixtures/refactor-dup-realrepo/proposals/`): a fully-deduped extraction
 * leaves a sub-`minTokens` residual (0), whereas a class-structural "extraction"
 * that can't actually lift the body leaves ~87% of the group cloned across its
 * edits. Not hand-fit to one case; see `refactor-eval.test.ts` boundary tests.
 */
export const COLLAPSE_RATIO = 0.5;

/** The three structural criteria an extract-duplicate proposal must clear. */
export interface DuplicateCriteria {
  /** One exported shared function, with one edit per clone location. */
  extractsSharedFunction: boolean;
  /** The model's edit replacements no longer share a clone approaching the
   * original group's token length — i.e. the duplicated logic was actually
   * lifted out of the sites, not merely reshuffled. Measured on the edited
   * sites, not the whole spliced files (see {@link evaluateDuplicateProposal}). */
  collapsesDuplication: boolean;
  /** Every site's call-surface signature still appears post-splice. */
  preservesCallSurface: boolean;
}

export interface DuplicateEvalRow {
  name: string;
  pass: boolean;
  criteria: DuplicateCriteria | null;
  failure?: string;
}

export interface DuplicateEvalMetrics {
  passRate: number;
  rows: DuplicateEvalRow[];
}

/** All three criteria must hold. */
export function duplicatePasses(c: DuplicateCriteria): boolean {
  return c.extractsSharedFunction && c.collapsesDuplication && c.preservesCallSurface;
}

/** Load the duplicate reference set (a JSON array of {@link DuplicateEvalCase}). */
export async function loadDuplicateEvalCases(path: string): Promise<DuplicateEvalCase[]> {
  return JSON.parse(await readFile(path, "utf8")) as DuplicateEvalCase[];
}

/** Build the model prompt for a duplicate case from its inline file sources. */
export function buildDuplicateCasePrompt(c: DuplicateEvalCase): RefactorPrompt {
  const sourceByPath = new Map(c.files.map((f) => [f.path, f.source]));
  const locations: DuplicateLocationContext[] = c.locations.map((location) => {
    const text = sourceByPath.get(location.file) ?? "";
    return {
      location,
      snippet: { file: location.file, ...extractRange(text, location.startLine, location.endLine) },
      imports: text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("import ") && !l.startsWith("import(")),
    };
  });
  return buildDuplicatePrompt({ finding: { tokens: c.tokens, locations: c.locations }, locations });
}

/**
 * Score one extract-duplicate proposal against the three structural criteria.
 * Splices the proposal into the case's inline sources in-memory (no fs, no git),
 * then: confirms a single exported shared function with one edit per location;
 * measures whether the duplication actually collapsed; and checks every
 * call-surface signature survived. A proposal that can't be spliced scores
 * all-false (never throws).
 *
 * **Collapse is measured on the edited sites, not the whole spliced files.** The
 * earlier all-or-nothing check re-tokenized the entire spliced files and demanded
 * *zero* residual clone ≥ the group's tokens — but that is confounded by unrelated
 * near-identical code elsewhere in the same files (e.g. drizzle's parallel dialect
 * modules), so a correct extraction could still "fail" because a different, untouched
 * clone survives globally. Instead, we tokenize each edit's `replacement` as its own
 * pseudo-file and run the clone detector across just those: a real extraction turns
 * every site into a short call (no residual clone reaching `minTokens`), while a
 * proposal that only reshuffles the duplicated body leaves the sites cloning one
 * another. The duplication has collapsed iff the largest residual clone among the
 * edits falls below `c.tokens * COLLAPSE_RATIO`. A dropped/extra edit is already
 * caught by `extractsSharedFunction` (edit count ≠ location count), so the edited-site
 * metric does not need to re-detect that.
 */
export async function evaluateDuplicateProposal(
  c: DuplicateEvalCase,
  proposal: DuplicateProposal,
): Promise<DuplicateCriteria> {
  const extractsSharedFunction =
    /\bexport\s+(?:async\s+)?function\s+[A-Za-z0-9_$]+/.test(proposal.sharedFunction) &&
    proposal.edits.length === c.locations.length;

  let spliced: { file: string; newContent: string }[];
  try {
    const originals = new Map(c.files.map((f) => [f.path, f.source]));
    spliced = await spliceDuplicate(originals, proposal);
  } catch {
    return { extractsSharedFunction, collapsesDuplication: false, preservesCallSurface: false };
  }

  const { tokenize } = await import("../syntactic/tokens.js");
  const { findClones } = await import("../syntactic/duplication.js");
  // Each edit replacement becomes its own pseudo-file (index-tagged so two edits
  // in the same source file are distinct streams). Residual clones across/within
  // these are duplication the model failed to lift out of the sites.
  const editTokens = await Promise.all(
    proposal.edits.map(async (e, i) => ({
      file: `${i}:${e.file}`,
      tokens: await tokenize(e.file, e.replacement),
    })),
  );
  const residual = findClones(editTokens, c.minTokens);
  const largestResidual = residual.length > 0 ? residual[0]!.tokens : 0; // findClones sorts desc
  const collapsesDuplication = largestResidual < c.tokens * COLLAPSE_RATIO;

  const combined = spliced.map((s) => s.newContent).join("\n");
  const preservesCallSurface = c.signatures.every((sig) => combined.includes(sig));

  return { extractsSharedFunction, collapsesDuplication, preservesCallSurface };
}

/**
 * Run the extract-duplicate refactor over the reference set and score the
 * structural pass-rate. A case passes only when its proposal clears all three
 * criteria; an unparseable response is a failed case (never throws).
 */
export async function runDuplicateEval(
  cases: DuplicateEvalCase[],
  client: RefactorClient,
  opts: { concurrency?: number } = {},
): Promise<DuplicateEvalMetrics> {
  const rows = new Array<DuplicateEvalRow>(cases.length);
  const limit = Math.min(Math.max(opts.concurrency ?? 3, 1), cases.length || 1);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < cases.length) {
      const idx = next++;
      const c = cases[idx] as DuplicateEvalCase;
      const finding = { tokens: c.tokens, locations: c.locations };
      const result = await client.proposeDuplicate(buildDuplicateCasePrompt(c), finding);
      if (!result.ok) {
        rows[idx] = { name: c.name, pass: false, criteria: null, failure: result.reason };
        continue;
      }
      const criteria = await evaluateDuplicateProposal(c, result.proposal);
      rows[idx] = { name: c.name, pass: duplicatePasses(criteria), criteria };
    }
  });
  await Promise.all(workers);

  const passes = rows.filter((r) => r.pass).length;
  const passRate = cases.length === 0 ? 1 : passes / cases.length;
  return { passRate, rows };
}
