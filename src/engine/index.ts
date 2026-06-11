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
import { createNextjsPlugin } from "../plugins/nextjs/index.js";
import { createTestRunnerPlugin } from "../plugins/test-runner/index.js";
import type { FrameworkPlugin } from "../plugins/types.js";
import { sortWorstFirst } from "../report/sort.js";
import type { LcovReport } from "../analyze/coverage/lcov.js";
import type { HotspotEntry } from "../analyze/hotspots.js";
import type { ComplexityFinding, DuplicationFinding } from "../syntactic/types.js";
import { resolveProdEntries } from "./prod-entries.js";
import { resolveWorkspaces } from "./workspaces.js";

/** A single anti-pattern finding (a classified dead/test-only symbol). */
export type Finding = ClassifiedFinding;

export interface ScanResult {
  findings: Finding[];
  /** Syntactic-detector findings (the complexity axis), worst-first. */
  complexity: ComplexityFinding[];
  /** Risk-ranked function hotspots (CRAP × churn), worst-first. */
  hotspots: HotspotEntry[];
  /** Copy-paste clone groups, worst-first by token length. */
  duplication: DuplicationFinding[];
}

export interface ScanOptions {
  /** Run the syntactic-detector (complexity) axis. Default true; `fix` sets
   * false so the dead-code path never pays tree-sitter's init cost. */
  complexity?: boolean;
}

const PLUGINS: FrameworkPlugin[] = [createTestRunnerPlugin(), createNextjsPlugin()];

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
  if (files.length === 0) return { findings: [], complexity: [], hotspots: [], duplication: [] };

  const ctx = await createRepoContext(targetPath);
  const detected = detectPlugins(PLUGINS, ctx);

  // Workspace members: alias map (so cross-package refs resolve) + entry files
  // (so executed member entries are rooted). Empty for single-package repos.
  const workspaces = await resolveWorkspaces(targetPath);

  // Plugin entries are split by kind: `test` globs seed test roots; `prod` globs
  // (e.g. Next.js file-routing) seed prod roots.
  const entrySpecs = resolveEntries(detected, ctx);
  const relToRoot = (abs: string) => relative(targetPath, abs);

  const testGlobs = entrySpecs.filter((e) => e.kind === "test").map((e) => e.glob);
  const matchesTestGlob = globMatcher(testGlobs);
  const isTestFile = (abs: string) => matchesTestGlob(relToRoot(abs));
  const testEntries = new Set(files.filter(isTestFile));

  const prodGlobs = entrySpecs.filter((e) => e.kind === "prod").map((e) => e.glob);
  const matchesProdGlob = globMatcher(prodGlobs);
  const pluginProdEntryFiles = new Set(files.filter((abs) => matchesProdGlob(relToRoot(abs))));

  const graph = buildSymbolGraph(files, { isTestFile, packagePaths: workspaces.packagePaths });

  const syntheticEdges: SymbolEdge[] = detected.flatMap((p) =>
    p.resolveEdges(ctx, graph).map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  );

  const prodEntries = resolveProdEntries(targetPath, files);
  // A framework entry file is invoked by convention, not imported — so root the
  // symbols it *exports* (a file-path seed alone only roots module-top-level
  // references, not the declared-but-unreferenced exports). Genuinely-dead
  // non-entry symbols are untouched.
  for (const file of pluginProdEntryFiles) prodEntries.add(file);
  for (const node of graph.nodes) {
    if (node.exported && pluginProdEntryFiles.has(node.file)) prodEntries.add(node.id);
  }
  // Workspace member entry files are prod roots (file-path semantics, matching
  // the root package): keeps executed member entries alive. Cross-package
  // *consumed* symbols stay alive via resolved references, not by rooting — so
  // genuinely-unused member exports are still reported.
  for (const entry of workspaces.entryFiles) prodEntries.add(entry);
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
      ? { complexity: [], hotspots: [], duplication: [] }
      : await analyzeHeavy(sources, config, coverageReport, targetPath);
  return {
    findings,
    complexity: heavy.complexity,
    hotspots: heavy.hotspots,
    duplication: heavy.duplication,
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

  // Group the already-computed function units by file as line ranges, so the
  // duplication detector never reports a clone window straddling a function
  // boundary (the cross-function windows phases 16–17 curated around).
  const unitsByFile = new Map<string, { startLine: number; endLine: number }[]>();
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

async function readSources(files: string[]): Promise<Array<{ file: string; text: string }>> {
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
  );
}
