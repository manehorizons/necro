import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import {
  computeReachability,
  findTaintedFiles,
  type ReachabilityResult,
} from "../analyze/reachability.js";
import type { NecroConfig } from "../config.js";
import { discoverFiles } from "../discover.js";
import { globMatcher } from "../glob.js";
import { buildSymbolGraph } from "../graph/symbol-graph.js";
import type { SymbolEdge, SymbolGraph } from "../graph/types.js";
import { resolveEntries } from "../plugins/entry-resolver.js";
import { createNextjsPlugin } from "../plugins/nextjs/index.js";
import { createRepoContext, detectPlugins } from "../plugins/registry.js";
import { createTestRunnerPlugin } from "../plugins/test-runner/index.js";
import type { FrameworkPlugin } from "../plugins/types.js";
import { resolveProdEntries } from "./prod-entries.js";
import { resolveWorkspaces } from "./workspaces.js";

const PLUGINS: FrameworkPlugin[] = [createTestRunnerPlugin(), createNextjsPlugin()];

/**
 * The shared reachability substrate: the symbol graph, the entry seeds, the
 * exact edge set fed to the two-color sweep (graph edges + plugin synthetic
 * edges), and the per-node verdicts. `scan` classifies findings from it;
 * `explain` traces witness chains through the same edges so a trace always
 * matches the verdict.
 */
export interface ReachabilityModel {
  /** Source files discovered under the target. */
  files: string[];
  /** Raw symbol graph (graph.edges does NOT include synthetic plugin edges). */
  graph: SymbolGraph;
  /** Edge set the sweep actually traversed: `graph.edges` + synthetic edges. */
  edges: SymbolEdge[];
  prodEntries: Set<string>;
  testEntries: Set<string>;
  taintedFiles: Set<string>;
  reachability: ReachabilityResult[];
  /** File contents (read once; reused by the complexity axis). */
  sources: Array<{ file: string; text: string }>;
}

/**
 * Discover files, build the symbol graph, resolve prod + plugin/test entries,
 * and run two-color reachability — the deterministic prelude shared by `scan`
 * and `explain`. Returns an empty-but-valid model when no source files exist.
 */
export async function buildReachabilityModel(
  targetPath: string,
  _config: NecroConfig,
): Promise<ReachabilityModel> {
  const files = await discoverFiles(targetPath, _config);
  if (files.length === 0) {
    return {
      files,
      graph: { nodes: [], edges: [] },
      edges: [],
      prodEntries: new Set(),
      testEntries: new Set(),
      taintedFiles: new Set(),
      reachability: [],
      sources: [],
    };
  }

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

  const edges = [...graph.edges, ...syntheticEdges];
  const reachability = computeReachability({
    nodes: graph.nodes,
    edges,
    prodEntries,
    testEntries,
    taintedFiles,
  });

  return { files, graph, edges, prodEntries, testEntries, taintedFiles, reachability, sources };
}

async function readSources(
  files: string[],
): Promise<Array<{ file: string; text: string }>> {
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
  );
}
