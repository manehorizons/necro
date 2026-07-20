import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { VERSION } from "../version.js";
import { type BuildOptions, buildSymbolGraph } from "./symbol-graph.js";
import type { SymbolGraph } from "./types.js";

/** The cache directory's name, written under the scan target (`defaultCachePath` below) — exported so the dirty-tree guard can exclude it as necro's own artifact, not the user's. */
export const CACHE_DIR = ".necro-cache";
const CACHE_FILE = "symbol-graph.json";

/**
 * Duplicated from `symbol-graph.ts`'s private `DEFAULT_TEST_FILE` regex —
 * intentional: the design boundary forbids modifying/exporting from
 * `symbol-graph.ts`, so the default is mirrored here rather than imported.
 * Keep in sync if the original ever changes.
 */
const DEFAULT_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** On-disk shape of a persisted symbol-graph cache entry. */
export interface SymbolGraphCacheEntry {
  schemaVersion: 1;
  necroVersion: string;
  /** Sorted `[relative path, sha256 content hash]` for every file fed to `buildSymbolGraph`. */
  files: [string, string][];
  configFingerprint: string;
  graph: SymbolGraph;
}

export function defaultCachePath(targetPath: string): string {
  return join(targetPath, CACHE_DIR, CACHE_FILE);
}

async function hashFile(path: string): Promise<string> {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Whole-repo-unchanged cache lookup (§ symbol-graph-cache-design.md). A hit
 * requires the exact tracked file set, every file's current content hash,
 * `configFingerprint`, and `necroVersion` to all match the persisted entry.
 * Any mismatch, or any read/parse error, is a miss — never an error.
 */
export async function loadCachedSymbolGraph(
  cachePath: string,
  targetPath: string,
  filePaths: string[],
  configFingerprint: string,
): Promise<SymbolGraph | undefined> {
  let raw: string;
  try {
    raw = await readFile(cachePath, "utf8");
  } catch {
    return undefined;
  }

  let entry: SymbolGraphCacheEntry;
  try {
    entry = JSON.parse(raw) as SymbolGraphCacheEntry;
  } catch {
    return undefined;
  }

  if (entry.schemaVersion !== 1 || entry.necroVersion !== VERSION) {
    return undefined;
  }
  if (entry.configFingerprint !== configFingerprint) {
    return undefined;
  }

  const currentRelPaths = filePaths.map((f) => relative(targetPath, f)).sort();
  const recordedRelPaths = entry.files.map(([relPath]) => relPath).sort();
  if (currentRelPaths.length !== recordedRelPaths.length) return undefined;
  for (let i = 0; i < currentRelPaths.length; i++) {
    if (currentRelPaths[i] !== recordedRelPaths[i]) return undefined;
  }

  const recordedHashes = new Map(entry.files);
  for (const file of filePaths) {
    const relPath = relative(targetPath, file);
    const recorded = recordedHashes.get(relPath);
    if (!recorded) return undefined;
    let current: string;
    try {
      current = await hashFile(file);
    } catch {
      return undefined;
    }
    if (current !== recorded) return undefined;
  }

  return entry.graph;
}

/**
 * Persist a symbol graph keyed by the exact tracked file set's content
 * hashes. Never throws — a write failure (e.g. read-only filesystem) is
 * logged and swallowed, since caching is strictly an optimization.
 */
export async function writeSymbolGraphCache(
  cachePath: string,
  targetPath: string,
  filePaths: string[],
  configFingerprint: string,
  graph: SymbolGraph,
): Promise<void> {
  try {
    const files: [string, string][] = await Promise.all(
      filePaths.map(
        async (file) =>
          [relative(targetPath, file), await hashFile(file)] as [
            string,
            string,
          ],
      ),
    );
    files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const entry: SymbolGraphCacheEntry = {
      schemaVersion: 1,
      necroVersion: VERSION,
      files,
      configFingerprint,
      graph,
    };

    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(entry));
  } catch (err) {
    console.error(
      `necro: failed to write symbol-graph cache: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function fingerprintConfig(
  targetPath: string,
  filePaths: string[],
  opts: BuildOptions,
): string {
  const isTestFile = opts.isTestFile ?? ((p) => DEFAULT_TEST_FILE.test(p));
  const testFlags = filePaths
    .map((f) => [relative(targetPath, f), isTestFile(f)] as [string, boolean])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const packageEntries = opts.packagePaths
    ? [...opts.packagePaths.entries()].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      )
    : [];
  return createHash("sha256")
    .update(JSON.stringify({ testFlags, packageEntries }))
    .digest("hex");
}

/**
 * Cached front-end for `buildSymbolGraph`. Returns the persisted graph on a
 * whole-repo-unchanged hit (see `loadCachedSymbolGraph`); otherwise builds
 * the real graph and persists it for next time.
 */
export async function buildSymbolGraphCached(
  targetPath: string,
  filePaths: string[],
  opts: BuildOptions = {},
): Promise<SymbolGraph> {
  const cachePath = defaultCachePath(targetPath);
  const configFingerprint = fingerprintConfig(targetPath, filePaths, opts);

  const cached = await loadCachedSymbolGraph(
    cachePath,
    targetPath,
    filePaths,
    configFingerprint,
  );
  if (cached) return cached;

  const graph = buildSymbolGraph(filePaths, opts);
  await writeSymbolGraphCache(
    cachePath,
    targetPath,
    filePaths,
    configFingerprint,
    graph,
  );
  return graph;
}
