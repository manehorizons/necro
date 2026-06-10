import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type FunctionUnit, lowerSource } from "../syntactic/ir.js";
import type { ComplexityFinding } from "../syntactic/types.js";
import type { CaseProvenance } from "../triage/eval-capture.js";
import type { RefactorEvalCase } from "./eval.js";

/** Where the scan's god-function findings came from. */
export interface RefactorCaptureOptions {
  /** Source repository identifier recorded in provenance (e.g. `owner/name`). */
  repo: string;
  /** Pinned commit SHA recorded in provenance. */
  sha: string;
  /** Local checkout root the scan's relative file paths resolve against. */
  sourceRoot: string;
  /** The LOC threshold the captured split must bring every unit under — the
   * scan's `godFunctionLoc` (default 50). Only functions whose `loc` exceeds it
   * are captured (a params-only god function is too short to be a split target). */
  threshold?: number;
}

/** A `necro scan --json` document — only the complexity findings are read. */
interface ScanJsonComplexity {
  complexity?: ComplexityFinding[];
}

/**
 * Turn a `necro scan --json` document into refactor eval cases — one per
 * **loc-over** god-function finding. Each case carries the function's **verbatim**
 * source (re-read from the pinned checkout, raw — `buildCasePrompt` numbers it),
 * its declaration line as the signature that must survive the split, the LOC
 * threshold, and provenance. Deterministic: no LLM, no network. Unlike the triage
 * corpus, no human label is needed — `evaluateProposal` judges the model's split
 * structurally, so the captured cases ARE the corpus (selection is the only human
 * step). Files are read and lowered once even when they host several god functions.
 */
export async function captureRefactorSkeletons(
  scanJson: string,
  opts: RefactorCaptureOptions,
): Promise<RefactorEvalCase[]> {
  const threshold = opts.threshold ?? 50;
  const doc = JSON.parse(scanJson) as ScanJsonComplexity;
  const gods = (doc.complexity ?? []).filter((f) => f.detector === "god-function");

  const textCache = new Map<string, string>();
  const unitsCache = new Map<string, FunctionUnit[]>();
  const readOnce = async (file: string): Promise<string> => {
    const cached = textCache.get(file);
    if (cached !== undefined) return cached;
    const text = await readFile(join(opts.sourceRoot, file), "utf8");
    textCache.set(file, text);
    return text;
  };
  const lowerOnce = async (file: string, text: string): Promise<FunctionUnit[]> => {
    const cached = unitsCache.get(file);
    if (cached !== undefined) return cached;
    const units = await lowerSource(file, text);
    unitsCache.set(file, units);
    return units;
  };

  const cases: RefactorEvalCase[] = [];
  for (const f of gods) {
    const text = await readOnce(f.file);
    const units = await lowerOnce(f.file, text);
    // Match the finding back to its lowered unit for an exact, robust span — the
    // finding's `value` is the param count when flagged on params, not the LOC.
    const unit = units.find((u) => u.name === f.name && u.line === f.line);
    if (!unit || unit.loc <= threshold) continue; // loc-over only — short params-god functions aren't split targets

    const lines = text.split("\n");
    const source = lines.slice(unit.line - 1, unit.line - 1 + unit.loc).join("\n");
    const signature = lines[unit.line - 1] ?? "";
    const provenance: CaseProvenance = { repo: opts.repo, sha: opts.sha, file: f.file, line: unit.line, symbol: unit.name };
    cases.push({ name: unit.name, file: f.file, source, signature, threshold, provenance });
  }
  return cases;
}
