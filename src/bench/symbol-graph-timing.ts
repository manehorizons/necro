import { pathToFileURL } from "node:url";
import { DEFAULT_CONFIG, type NecroConfig } from "../config.js";
import { discoverFiles } from "../discover.js";
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

export async function measureSymbolGraphTiming(
  repoPath: string,
  config: NecroConfig = DEFAULT_CONFIG,
): Promise<TimingResult> {
  const discoverStart = performance.now();
  const files = await discoverFiles(repoPath, config);
  const discoverMs = performance.now() - discoverStart;

  const buildStart = performance.now();
  const graph = buildSymbolGraph(files);
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
}

/** Parse `--repo <path>` (required) and `--include <comma-separated-globs>` (optional). Pure — no I/O. */
export function parseArgs(argv: string[]): TimingArgs {
  const args: Partial<TimingArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") args.repo = argv[++i];
    if (argv[i] === "--include") args.include = argv[++i]?.split(",");
  }
  if (!args.repo) throw new Error("--repo <path> is required");
  return { repo: args.repo, include: args.include };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = args.include
    ? { ...DEFAULT_CONFIG, include: args.include }
    : DEFAULT_CONFIG;
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
