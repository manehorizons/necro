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
import { resolveProdEntries } from "./prod-entries.js";

/** A single anti-pattern finding (a classified dead/test-only symbol). */
export type Finding = ClassifiedFinding;

export interface ScanResult {
  findings: Finding[];
}

const PLUGINS: FrameworkPlugin[] = [createTestRunnerPlugin()];

/**
 * Analyze the project at `targetPath`: discover files, build the symbol graph,
 * resolve entries (prod + framework-plugin test entries), run two-color
 * reachability, and classify findings worst-first.
 */
export async function scan(
  targetPath: string,
  config: NecroConfig,
): Promise<ScanResult> {
  const files = await discoverFiles(targetPath, config);
  if (files.length === 0) return { findings: [] };

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
  const taintedFiles = findTaintedFiles(await readSources(files));

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
  return { findings };
}

async function readSources(files: string[]): Promise<Array<{ file: string; text: string }>> {
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
  );
}
