import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { DEFAULT_CONFIG } from "../config.js";
import { discoverFiles } from "../discover.js";
import type { PythonImport } from "../graph/python/import-parser.js";
import { parsePythonImports } from "../graph/python/import-parser.js";
import { buildPythonModuleMap, detectImportRoots, type PythonModuleMap } from "../graph/python/module-resolver.js";
import { resolvePythonImport } from "../graph/python/resolve-import.js";

/**
 * Repo-internal measurement tool (Phase 44-00 AC-7), not part of the
 * published `necro` CLI. Run manually against a local checkout of a real
 * Python repo (e.g. `pip`, `httpie`) to record the resolver's import-resolution
 * rate — the Phase B "Done" bar is ≥95% on both corpus repos. Not wired into
 * CI: the checkouts aren't vendored into this repo (see DRAFT boundaries).
 *
 * Measured only over *local* import candidates — relative imports, and
 * absolute imports whose top-level segment is a package/module this repo
 * actually discovered (see `isLocalImportCandidate`). A first run against
 * unfiltered pip/httpie checkouts showed why this matters empirically: the
 * overwhelming majority of "unresolved" imports were stdlib/third-party
 * (`os`, `sys`, `typing`, `collections.abc`, ...) that the resolver correctly
 * cannot and should not resolve to a local file — counting those as failures
 * made the metric measure stdlib import frequency, not resolver accuracy.
 */

const PY_CONFIG = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

export interface ResolutionRateResult {
  total: number;
  resolved: number;
  rate: number;
}

/**
 * Per-resolved-entry (same arity and order as `resolvePythonImport`'s
 * result) whether each entry is plausibly first-party (part of this repo),
 * as opposed to stdlib or a third-party dependency the module map has no
 * knowledge of. Relative imports (`from . import x`) are always local by
 * Python semantics. Absolute imports are local only if their top-level
 * segment matches a top-level package/module this repo's file set actually
 * produced (e.g. `pip` for a `pip` checkout) — `import os` never matches.
 * `import a, b` is judged per module, since an unrelated pair can mix local
 * and external; a single `from` clause is judged once and shared across all
 * its names, since they all resolve against the same base module.
 */
export function isLocalImportCandidate(imp: PythonImport, topLevelPackages: ReadonlySet<string>): boolean[] {
  if (imp.kind === "import") {
    return imp.modules.map((m) => topLevelPackages.has(m.segments[0] ?? ""));
  }
  const local = imp.relativeDots > 0 || topLevelPackages.has(imp.moduleSegments[0] ?? "");
  const count = imp.isStar ? 1 : imp.names.length;
  return Array(count).fill(local);
}

function topLevelPackagesOf(map: PythonModuleMap): Set<string> {
  const out = new Set<string>();
  for (const dotted of map.moduleToFile.keys()) out.add(dotted.split(".")[0] ?? dotted);
  return out;
}

export interface RateArgs {
  repo: string;
}

/** Parse `--repo <path>`. Pure — no I/O. */
export function parseArgs(argv: string[]): RateArgs {
  const args: Partial<RateArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") args.repo = argv[++i];
  }
  if (!args.repo) throw new Error("--repo <path> is required");
  return { repo: args.repo };
}

/**
 * Walk every `.py` file under `repoPath`, parse every import statement, and
 * resolve each *local* candidate (see `isLocalImportCandidate`) against the
 * repo's own module map. Stdlib/third-party imports are excluded from both
 * `total` and `resolved` — they are out of scope by definition, not failures.
 */
export async function computeResolutionRate(repoPath: string): Promise<ResolutionRateResult> {
  const files = await discoverFiles(repoPath, PY_CONFIG);
  const roots = detectImportRoots(repoPath, files);
  const map = buildPythonModuleMap(files, roots);
  const topLevelPackages = topLevelPackagesOf(map);

  let total = 0;
  let resolved = 0;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = await parsePythonImports(file, source);
    for (const imp of imports) {
      const results = resolvePythonImport(file, imp, map);
      const locality = isLocalImportCandidate(imp, topLevelPackages);
      for (let i = 0; i < results.length; i++) {
        if (!locality[i]) continue;
        total++;
        if (results[i]?.file !== null) resolved++;
      }
    }
  }

  return { total, resolved, rate: total === 0 ? 0 : resolved / total };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { total, resolved, rate } = await computeResolutionRate(args.repo);
  console.log(`${args.repo}: ${resolved}/${total} import statements resolved (${(rate * 100).toFixed(1)}%)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
