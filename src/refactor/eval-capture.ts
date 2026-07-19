import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { type FunctionUnit, lowerSource } from "../syntactic/ir.js";
import type {
  CloneLocation,
  ComplexityFinding,
  DuplicationFinding,
} from "../syntactic/types.js";
import type { CaseProvenance } from "../triage/eval-capture.js";
import type { DuplicateEvalCase, RefactorEvalCase } from "./eval.js";

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
  const gods = (doc.complexity ?? []).filter(
    (f) => f.detector === "god-function",
  );

  const textCache = new Map<string, string>();
  const unitsCache = new Map<string, FunctionUnit[]>();
  const readOnce = async (absPath: string): Promise<string> => {
    const cached = textCache.get(absPath);
    if (cached !== undefined) return cached;
    const text = await readFile(absPath, "utf8");
    textCache.set(absPath, text);
    return text;
  };
  const lowerOnce = async (
    rel: string,
    absPath: string,
    text: string,
  ): Promise<FunctionUnit[]> => {
    const cached = unitsCache.get(absPath);
    if (cached !== undefined) return cached;
    const units = await lowerSource(rel, text); // `rel` keeps the extension hint clean
    unitsCache.set(absPath, units);
    return units;
  };

  const cases: RefactorEvalCase[] = [];
  for (const f of gods) {
    // necro scan emits absolute paths; tolerate relative too. Read absolute, store repo-relative.
    const absPath = isAbsolute(f.file) ? f.file : join(opts.sourceRoot, f.file);
    const rel = isAbsolute(f.file) ? relative(opts.sourceRoot, f.file) : f.file;
    const text = await readOnce(absPath);
    const units = await lowerOnce(rel, absPath, text);
    // Match the finding back to its lowered unit for an exact, robust span — the
    // finding's `value` is the param count when flagged on params, not the LOC.
    const unit = units.find((u) => u.name === f.name && u.line === f.line);
    if (!unit || unit.loc <= threshold) continue; // loc-over only — short params-god functions aren't split targets

    const lines = text.split("\n");
    const source = lines
      .slice(unit.line - 1, unit.line - 1 + unit.loc)
      .join("\n");
    const signature = lines[unit.line - 1] ?? "";
    const provenance: CaseProvenance = {
      repo: opts.repo,
      sha: opts.sha,
      file: rel,
      line: unit.line,
      symbol: unit.name,
    };
    cases.push({
      name: unit.name,
      file: rel,
      source,
      signature,
      threshold,
      provenance,
    });
  }
  return cases;
}

/** Where the scan's duplication findings came from. */
export interface DuplicateCaptureOptions {
  /** Source repository identifier recorded in provenance (e.g. `owner/name`). */
  repo: string;
  /** Pinned commit SHA recorded in provenance. */
  sha: string;
  /** Local checkout root the scan's relative file paths resolve against. */
  sourceRoot: string;
  /** The detector `minTokens` the scan was run with — recorded on each case so the
   * post-splice re-check uses the same window. Defaults to the scan default (50). */
  minTokens?: number;
}

/** A `necro scan --json` document — only the duplication findings are read. */
interface ScanJsonDuplication {
  duplication?: DuplicationFinding[];
}

/** The nearest non-blank line strictly above the clone block — the enclosing
 * call surface (function/test declaration) that must survive the extraction.
 * Falls back to the clone's first line when the block sits at the top of the file.
 * Verbatim (matches the synthetic-corpus convention of `startLine - 1`). */
function callSurfaceLine(lines: string[], startLine: number): string {
  for (let i = startLine - 2; i >= 0; i--) {
    if ((lines[i] ?? "").trim() !== "") return lines[i] ?? "";
  }
  return lines[startLine - 1] ?? "";
}

/**
 * Turn a `necro scan --json` document into extract-duplicate eval cases — one per
 * **`duplication`** clone group. Each case carries every file the group touches
 * (re-read **verbatim** from the pinned checkout, inline as `files[]` with
 * repo-relative paths), the group's `locations` (relativized), its matched
 * `tokens`, the detector `minTokens`, the `signatures[]` (the enclosing call
 * surface at each clone location, which must survive the extraction), and
 * provenance. Deterministic: no LLM, no network. Like the god-function corpus,
 * no human label is needed — `evaluateDuplicateProposal` judges the model's
 * extraction structurally, so the captured cases ARE the corpus (selection is the
 * only human step). Files are read once even when a group references one twice.
 */
export async function captureDuplicateSkeletons(
  scanJson: string,
  opts: DuplicateCaptureOptions,
): Promise<DuplicateEvalCase[]> {
  const minTokens = opts.minTokens ?? 50;
  const doc = JSON.parse(scanJson) as ScanJsonDuplication;
  const groups = doc.duplication ?? [];

  const textCache = new Map<string, string>();
  const readOnce = async (absPath: string): Promise<string> => {
    const cached = textCache.get(absPath);
    if (cached !== undefined) return cached;
    const text = await readFile(absPath, "utf8");
    textCache.set(absPath, text);
    return text;
  };

  const cases: DuplicateEvalCase[] = [];
  for (const g of groups) {
    if (g.locations.length === 0) continue;
    // necro scan emits absolute paths; tolerate relative too. Read absolute, store repo-relative.
    const sourceByRel = new Map<string, string>();
    const relOf = (file: string) =>
      isAbsolute(file) ? relative(opts.sourceRoot, file) : file;
    for (const loc of g.locations) {
      const rel = relOf(loc.file);
      if (sourceByRel.has(rel)) continue;
      const absPath = isAbsolute(loc.file)
        ? loc.file
        : join(opts.sourceRoot, loc.file);
      sourceByRel.set(rel, await readOnce(absPath));
    }

    const locations: CloneLocation[] = g.locations.map((loc) => ({
      file: relOf(loc.file),
      startLine: loc.startLine,
      endLine: loc.endLine,
    }));
    const files = [...sourceByRel].map(([path, source]) => ({ path, source }));
    const signatures = locations.map((loc) =>
      callSurfaceLine(
        (sourceByRel.get(loc.file) ?? "").split("\n"),
        loc.startLine,
      ),
    );

    const anchor = locations[0] as CloneLocation;
    const name = `${basename(anchor.file, extname(anchor.file))}-L${anchor.startLine}`;
    const provenance: CaseProvenance = {
      repo: opts.repo,
      sha: opts.sha,
      file: anchor.file,
      line: anchor.startLine,
      symbol: name,
    };
    cases.push({
      name,
      files,
      locations,
      tokens: g.tokens,
      minTokens,
      signatures,
      provenance,
    });
  }
  return cases;
}
