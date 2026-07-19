import { type ClassifiedFinding, classify } from "../analyze/classify.js";
import type { LcovReport } from "../analyze/coverage/lcov.js";
import { loadCoverage } from "../analyze/coverage/load.js";
import { coverageFor } from "../analyze/coverage/lookup.js";
import type { HotspotEntry } from "../analyze/hotspots.js";
import type { NecroConfig } from "../config.js";
import type { SymbolNode } from "../graph/types.js";
import { sortWorstFirst } from "../report/sort.js";
import type {
  ComplexityFinding,
  DuplicationFinding,
} from "../syntactic/types.js";
import { buildReachabilityModel, type EntryResolution } from "./model.js";

/** A single anti-pattern finding (a classified dead/test-only symbol). */
export type Finding = ClassifiedFinding;

/** Fail-closed entry-resolution diagnostics (§2.1), surfaced in terminal/JSON/SARIF. */
export interface ScanDiagnostics {
  entryResolution: EntryResolution;
}

export interface ScanResult {
  findings: Finding[];
  /** Syntactic-detector findings (the complexity axis), worst-first. */
  complexity: ComplexityFinding[];
  /** Risk-ranked function hotspots (CRAP × churn), worst-first. */
  hotspots: HotspotEntry[];
  /** Copy-paste clone groups, worst-first by token length. */
  duplication: DuplicationFinding[];
  diagnostics: ScanDiagnostics;
}

export interface ScanOptions {
  /** Run the syntactic-detector (complexity) axis. Default true; `fix` sets
   * false so the dead-code path never pays tree-sitter's init cost. */
  complexity?: boolean;
  /** Called once per major scan phase (e.g. for CLI stderr progress on large
   * repos). Omit for today's silent behavior — this is opt-in, not ambient. */
  onProgress?: (message: string) => void;
}

/**
 * Analyze the project at `targetPath`: discover files, build the symbol graph,
 * resolve entries (prod + framework-plugin test entries), run two-color
 * reachability, and classify findings worst-first. Also runs the complexity
 * axis unless disabled.
 */
export async function scan(
  targetPath: string,
  config: NecroConfig,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  opts.onProgress?.("resolving reachability...");
  const model = await buildReachabilityModel(targetPath, config);
  if (model.files.length === 0)
    return {
      findings: [],
      complexity: [],
      hotspots: [],
      duplication: [],
      diagnostics: { entryResolution: model.entryResolution },
    };
  const { graph, reachability, sources } = model;

  // Coverage is an optional, path-based signal (never runs the test suite).
  const coverageReport = await loadCoverage(targetPath, config);
  const coverage = coverageReport
    ? (node: SymbolNode) => coverageFor(coverageReport, node)
    : undefined;

  const findings = sortWorstFirst(
    classify({
      nodes: graph.nodes,
      reachability,
      coverage,
      entryCollapse: model.entryResolution.collapsed,
      publicApiIds: model.publicApiIds,
    }),
  );

  let heavy: {
    complexity: ComplexityFinding[];
    hotspots: HotspotEntry[];
    duplication: DuplicationFinding[];
  };
  if (opts.complexity === false) {
    heavy = { complexity: [], hotspots: [], duplication: [] };
  } else {
    opts.onProgress?.("analyzing complexity + duplication...");
    heavy = await analyzeHeavy(sources, config, coverageReport, targetPath);
  }
  return {
    findings,
    complexity: heavy.complexity,
    hotspots: heavy.hotspots,
    duplication: heavy.duplication,
    diagnostics: { entryResolution: model.entryResolution },
  };
}

/**
 * The tree-sitter axis: lower every source to the syntactic IR **once**, then
 * derive both the complexity findings and the risk hotspots from those units.
 * Heavy (tree-sitter + git), so the modules are imported lazily — the dead-code
 * and `fix` paths never trigger this.
 */
async function analyzeHeavy(
  sources: Array<{ file: string; text: string }>,
  config: NecroConfig,
  coverageReport: LcovReport | null,
  targetPath: string,
): Promise<{
  complexity: ComplexityFinding[];
  hotspots: HotspotEntry[];
  duplication: DuplicationFinding[];
}> {
  const { lowerSource } = await import("../syntactic/ir.js");
  const { detect } = await import("../syntactic/detectors.js");
  const { rankHotspots } = await import("../analyze/hotspots.js");
  const { fileChurn } = await import("../analyze/churn.js");
  const { tokenize } = await import("../syntactic/tokens.js");
  const { findClones } = await import("../syntactic/duplication.js");

  const units = (
    await Promise.all(sources.map(({ file, text }) => lowerSource(file, text)))
  ).flat();

  const complexity = units
    .flatMap((u) => detect(u, config.complexity))
    .sort((a, b) => {
      // Worst-first: largest overshoot ratio, then file/line for stability.
      const byRatio = b.value / b.threshold - a.value / a.threshold;
      if (byRatio !== 0) return byRatio;
      const byFile = a.file.localeCompare(b.file);
      return byFile !== 0 ? byFile : a.line - b.line;
    });

  const churn = await fileChurn(targetPath);
  const hotspots = rankHotspots(
    units,
    coverageReport,
    churn,
    config.hotspots.top,
  );

  // Group the already-computed function units by file as line ranges, so the
  // duplication detector never reports a clone window straddling a function
  // boundary (the cross-function windows phases 16–17 curated around).
  const unitsByFile = new Map<
    string,
    { startLine: number; endLine: number }[]
  >();
  for (const u of units) {
    const range = { startLine: u.line, endLine: u.line + u.loc - 1 };
    const arr = unitsByFile.get(u.file);
    if (arr) arr.push(range);
    else unitsByFile.set(u.file, [range]);
  }
  const fileTokens = await Promise.all(
    sources.map(async ({ file, text }) => ({
      file,
      tokens: await tokenize(file, text),
      units: unitsByFile.get(file) ?? [],
    })),
  );
  const duplication = findClones(fileTokens, config.duplication.minTokens);

  return { complexity, hotspots, duplication };
}
