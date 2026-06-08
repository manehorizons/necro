import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { classify, type ClassifiedFinding } from "../analyze/classify.js";
import { loadCoverage } from "../analyze/coverage/load.js";
import { coverageFor } from "../analyze/coverage/lookup.js";
import { computeReachability, findTaintedFiles } from "../analyze/reachability.js";
import type { NecroConfig } from "../config.js";
import { discoverFiles } from "../discover.js";
import { globMatcher } from "../glob.js";
import { buildSymbolGraph } from "../graph/symbol-graph.js";
import type { SymbolEdge, SymbolNode } from "../graph/types.js";
import { resolveEntries } from "../plugins/entry-resolver.js";
import { createRepoContext, detectPlugins } from "../plugins/registry.js";
import { createTestRunnerPlugin } from "../plugins/test-runner/index.js";
import type { FrameworkPlugin } from "../plugins/types.js";
import { sortWorstFirst } from "../report/sort.js";
import type { LcovReport } from "../analyze/coverage/lcov.js";
import type { HotspotEntry } from "../analyze/hotspots.js";
import type { ComplexityFinding } from "../syntactic/types.js";
import { resolveProdEntries } from "./prod-entries.js";

/** A single anti-pattern finding (a classified dead/test-only symbol). */
export type Finding = ClassifiedFinding;

export interface ScanResult {
  findings: Finding[];
  /** Syntactic-detector findings (the complexity axis), worst-first. */
  complexity: ComplexityFinding[];
  /** Risk-ranked function hotspots (CRAP × churn), worst-first. */
  hotspots: HotspotEntry[];
}

export interface ScanOptions {
  /** Run the syntactic-detector (complexity) axis. Default true; `fix` sets
   * false so the dead-code path never pays tree-sitter's init cost. */
  complexity?: boolean;
}

const PLUGINS: FrameworkPlugin[] = [createTestRunnerPlugin()];

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
  const files = await discoverFiles(targetPath, config);
  if (files.length === 0) return { findings: [], complexity: [], hotspots: [] };

  const ctx = await createRepoContext(targetPath);
  const detected = detectPlugins(PLUGINS, ctx);

  // Test entries (globs) → matcher → which scanned files are test roots.
  const testGlobs = resolveEntries(detected, ctx).map((e) => e.glob);
  const matchesTestGlob = globMatcher(testGlobs);
  const relToRoot = (abs: string) => relative(targetPath, abs);
  const isTestFile = (abs: string) => matchesTestGlob(relToRoot(abs));
  const testEntries = new Set(files.filter(isTestFile));

  const graph = buildSymbolGraph(files, { isTestFile });

  const syntheticEdges: SymbolEdge[] = detected.flatMap((p) =>
    p.resolveEdges(ctx, graph).map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  );

  const prodEntries = resolveProdEntries(targetPath, files);
  const sources = await readSources(files);
  const taintedFiles = findTaintedFiles(sources);

  const reachability = computeReachability({
    nodes: graph.nodes,
    edges: [...graph.edges, ...syntheticEdges],
    prodEntries,
    testEntries,
    taintedFiles,
  });

  // Coverage is an optional, path-based signal (never runs the test suite).
  const coverageReport = await loadCoverage(targetPath, config);
  const coverage = coverageReport
    ? (node: SymbolNode) => coverageFor(coverageReport, node)
    : undefined;

  const findings = sortWorstFirst(
    classify({ nodes: graph.nodes, reachability, coverage }),
  );

  const heavy =
    opts.complexity === false
      ? { complexity: [], hotspots: [] }
      : await analyzeHeavy(sources, config, coverageReport, targetPath);
  return { findings, complexity: heavy.complexity, hotspots: heavy.hotspots };
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
): Promise<{ complexity: ComplexityFinding[]; hotspots: HotspotEntry[] }> {
  const { lowerSource } = await import("../syntactic/ir.js");
  const { detect } = await import("../syntactic/detectors.js");
  const { rankHotspots } = await import("../analyze/hotspots.js");
  const { fileChurn } = await import("../analyze/churn.js");

  const units = (await Promise.all(sources.map(({ file, text }) => lowerSource(file, text)))).flat();

  const complexity = units.flatMap((u) => detect(u, config.complexity)).sort((a, b) => {
    // Worst-first: largest overshoot ratio, then file/line for stability.
    const byRatio = b.value / b.threshold - a.value / a.threshold;
    if (byRatio !== 0) return byRatio;
    const byFile = a.file.localeCompare(b.file);
    return byFile !== 0 ? byFile : a.line - b.line;
  });

  const churn = await fileChurn(targetPath);
  const hotspots = rankHotspots(units, coverageReport, churn, config.hotspots.top);
  return { complexity, hotspots };
}

async function readSources(files: string[]): Promise<Array<{ file: string; text: string }>> {
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
  );
}
