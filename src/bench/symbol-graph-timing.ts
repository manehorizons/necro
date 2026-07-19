import { pathToFileURL } from "node:url";
import { DEFAULT_CONFIG, type NecroConfig } from "../config.js";
import { discoverFiles } from "../discover.js";
import { buildSymbolGraphCached } from "../graph/symbol-graph-cache.js";
import { buildSymbolGraph } from "../graph/symbol-graph.js";

/**
 * Repo-internal measurement tool (Phase 57, evidence for rec-20260701-016),
 * not part of the published `necro` CLI. Run manually against a local
 * checkout of a real repo to record how long `buildSymbolGraph` takes and how
 * big the resulting graph is — the timing corpus rec-20260701-016 (incremental
 * symbol-graph cache) names as its own prerequisite before that cache is
 * worth building. Not wired into CI or `npm test`: it measures wall-clock
 * time, which is inherently machine-dependent and not a meaningful CI gate.
 *
 * Measures `discoverFiles` and `buildSymbolGraph` as a black box — no
 * instrumentation inside `symbol-graph.ts` itself. `SymbolGraph.nodes.length`
 * and `.edges.length` already expose declaration/reference counts via the
 * existing public return shape.
 */

export interface TimingResult {
  fileCount: number;
  declCount: number;
  edgeCount: number;
  discoverMs: number;
  buildMs: number;
}

export interface MeasureOptions {
  /** Route the build through the symbol-graph cache instead of a raw uncached build. */
  cached?: boolean;
}

export async function measureSymbolGraphTiming(
  repoPath: string,
  config: NecroConfig = DEFAULT_CONFIG,
  opts: MeasureOptions = {},
): Promise<TimingResult> {
  const discoverStart = performance.now();
  const files = await discoverFiles(repoPath, config);
  const discoverMs = performance.now() - discoverStart;

  const buildStart = performance.now();
  const graph = opts.cached
    ? await buildSymbolGraphCached(repoPath, files)
    : buildSymbolGraph(files);
  const buildMs = performance.now() - buildStart;

  return {
    fileCount: files.length,
    declCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    discoverMs,
    buildMs,
  };
}

export interface TimingArgs {
  repo: string;
  include?: string[];
  twice?: boolean;
}

/** Parse `--repo <path>` (required), `--include <comma-separated-globs>` (optional), and `--twice` (optional). Pure — no I/O. */
export function parseArgs(argv: string[]): TimingArgs {
  const args: Partial<TimingArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") args.repo = argv[++i];
    if (argv[i] === "--include") args.include = argv[++i]?.split(",");
    if (argv[i] === "--twice") args.twice = true;
  }
  if (!args.repo) throw new Error("--repo <path> is required");
  return { repo: args.repo, include: args.include, twice: args.twice };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = args.include
    ? { ...DEFAULT_CONFIG, include: args.include }
    : DEFAULT_CONFIG;

  if (args.twice) {
    const run1 = await measureSymbolGraphTiming(args.repo, config, { cached: true });
    console.log(
      `${args.repo} [run 1, cache miss expected]: ${run1.fileCount} files, ${run1.declCount} decls, ${run1.edgeCount} edges — ` +
        `discover ${run1.discoverMs.toFixed(0)}ms, build ${run1.buildMs.toFixed(0)}ms`,
    );
    const run2 = await measureSymbolGraphTiming(args.repo, config, { cached: true });
    console.log(
      `${args.repo} [run 2, cache hit expected]: ${run2.fileCount} files, ${run2.declCount} decls, ${run2.edgeCount} edges — ` +
        `discover ${run2.discoverMs.toFixed(0)}ms, build ${run2.buildMs.toFixed(0)}ms`,
    );
    return;
  }

  const result = await measureSymbolGraphTiming(args.repo, config);
  console.log(
    `${args.repo}: ${result.fileCount} files, ${result.declCount} decls, ${result.edgeCount} edges — ` +
      `discover ${result.discoverMs.toFixed(0)}ms, build ${result.buildMs.toFixed(0)}ms`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
