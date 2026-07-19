import { basename, join, relative, sep } from "node:path";

export interface PythonModuleMap {
  /** Absolute file path -> dotted module path. */
  fileToModule: Map<string, string>;
  /** Dotted module path -> absolute file path. */
  moduleToFile: Map<string, string>;
  /** Import roots this map was built against, longest first (for containing-package lookups). */
  roots: string[];
}

/**
 * Detect the directory(ies) dotted module paths should be computed relative
 * to. Heuristic-only (no TOML parsing, no new dependency, per AC-4): if every
 * given file lives under a single top-level `src/` directory and nothing is
 * a package/module directly at `repoRoot`, treat `src/` as the sole root
 * (src-layout). Otherwise — including any mixed/ambiguous case — fall back
 * to `repoRoot` itself; this is deliberately the safe "best-effort" default,
 * not a throw.
 */
export function detectImportRoots(repoRoot: string, files: string[]): string[] {
  const rels = files.map((f) => relative(repoRoot, f));
  const topLevelDirs = new Set(rels.map((r) => r.split(sep)[0]));
  const hasRootLevelFile = rels.some((r) => !r.includes(sep));
  const isOnlySrc = topLevelDirs.size === 1 && topLevelDirs.has("src");

  if (isOnlySrc && !hasRootLevelFile) return [join(repoRoot, "src")];
  return [repoRoot];
}

/**
 * Map every `.py` file to its dotted module path and back. A regular
 * package's `__init__.py` maps to the package's own dotted path (its
 * containing directory), not `pkg.__init__`. Files that fall outside every
 * given import root are silently skipped (best-effort, per AC-4) rather than
 * throwing.
 */
export function buildPythonModuleMap(
  files: string[],
  importRoots: string[],
): PythonModuleMap {
  const roots = [...importRoots].sort((a, b) => b.length - a.length);
  const fileToModule = new Map<string, string>();
  const moduleToFile = new Map<string, string>();

  for (const file of files) {
    const root = roots.find((r) => file === r || file.startsWith(r + sep));
    if (!root) continue;

    const rel = relative(root, file);
    const segments = rel.split(sep);
    const last = segments[segments.length - 1] ?? "";
    if (last === "__init__.py") {
      segments.pop();
    } else {
      segments[segments.length - 1] = last.replace(/\.py$/, "");
    }
    if (segments.length === 0) continue;

    const dotted = segments.join(".");
    fileToModule.set(file, dotted);
    moduleToFile.set(dotted, file);
  }

  return { fileToModule, moduleToFile, roots };
}

/**
 * The dotted path of the package a file belongs to, for relative-import
 * resolution: a package's own `__init__.py` is its own containing package;
 * every other module's containing package is its dotted path with the last
 * segment dropped. Returns `""` for a top-level module with no package.
 */
export function containingPackage(file: string, map: PythonModuleMap): string {
  const dotted = map.fileToModule.get(file);
  if (dotted === undefined) return "";
  if (basename(file) === "__init__.py") return dotted;
  const idx = dotted.lastIndexOf(".");
  return idx === -1 ? "" : dotted.slice(0, idx);
}
