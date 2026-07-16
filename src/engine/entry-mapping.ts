import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The subset of tsconfig `compilerOptions` this module cares about. */
export interface TsconfigMapping {
  outDir?: string;
  rootDir?: string;
}

/** Extension swaps tried in order for a given compiled-output extension. */
const EXT_SWAPS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx", ".ts"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};
const FALLBACK_EXTS = [".ts", ".tsx"];

/**
 * Read `tsconfig.json` at `root` and extract `outDir`/`rootDir`, resolving one
 * level of a local `extends` chain (deeper chains are out of scope — §2.3).
 * Never throws: missing or unparseable tsconfig yields `{}`.
 */
export async function readTsconfigMapping(root: string): Promise<TsconfigMapping> {
  const own = await readTsconfigFile(join(root, "tsconfig.json"));
  if (!own) return {};

  let outDir = own.compilerOptions?.outDir;
  let rootDir = own.compilerOptions?.rootDir;

  if ((outDir === undefined || rootDir === undefined) && typeof own.extends === "string") {
    const parent = await readTsconfigFile(join(root, own.extends));
    if (parent) {
      outDir = outDir ?? parent.compilerOptions?.outDir;
      rootDir = rootDir ?? parent.compilerOptions?.rootDir;
    }
  }

  return { outDir, rootDir };
}

/**
 * Map a compiled-output path (relative to `root`, e.g. `dist/cli.js`) to a
 * source path that actually exists among `fileSet` — trying the tsconfig
 * `outDir`/`rootDir` swap first, then a `dist|build|out → src` heuristic.
 * Returns `undefined` rather than guessing into a path that wasn't discovered.
 */
export function mapDistToSrc(
  relOutputPath: string,
  mapping: TsconfigMapping,
  root: string,
  fileSet: Set<string>,
): string | undefined {
  if (mapping.outDir !== undefined) {
    const base = stripPrefix(relOutputPath, trimSlashes(mapping.outDir));
    if (base !== undefined) {
      const withRoot = mapping.rootDir ? joinRel(trimSlashes(mapping.rootDir), base) : base;
      const found = tryExtensions(withRoot, root, fileSet);
      if (found) return found;
    }
  }

  const heuristic = replaceLeadingBuildDir(relOutputPath);
  if (heuristic) {
    const found = tryExtensions(heuristic, root, fileSet);
    if (found) return found;
  }

  return undefined;
}

function tryExtensions(relPath: string, root: string, fileSet: Set<string>): string | undefined {
  const dot = relPath.lastIndexOf(".");
  const ext = dot === -1 ? "" : relPath.slice(dot);
  const base = dot === -1 ? relPath : relPath.slice(0, dot);
  const candidates = [...(EXT_SWAPS[ext] ?? []), ...FALLBACK_EXTS];

  const tried = new Set<string>();
  for (const candidateExt of candidates) {
    const candidate = `${base}${candidateExt}`;
    if (tried.has(candidate)) continue;
    tried.add(candidate);
    if (fileSet.has(join(root, candidate))) return candidate;
  }
  return undefined;
}

/** Replace a leading `dist/`, `build/`, or `out/` path segment with `src/`. */
function replaceLeadingBuildDir(relPath: string): string | undefined {
  const m = /^(dist|build|out)\/(.+)$/.exec(relPath);
  return m ? `src/${m[2]}` : undefined;
}

function stripPrefix(relPath: string, prefix: string): string | undefined {
  if (prefix === "" || prefix === ".") return relPath;
  const withSlash = `${prefix}/`;
  return relPath.startsWith(withSlash) ? relPath.slice(withSlash.length) : undefined;
}

function trimSlashes(p: string): string {
  return p.replace(/^\.\/?/, "").replace(/\/+$/, "");
}

function joinRel(a: string, b: string): string {
  return a === "" ? b : `${a}/${b}`;
}

interface RawTsconfig {
  compilerOptions?: { outDir?: string; rootDir?: string };
  extends?: string;
}

async function readTsconfigFile(path: string): Promise<RawTsconfig | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as RawTsconfig;
  } catch {
    return undefined;
  }
}
