import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { NecroConfig } from "./config.js";
import { globMatcher } from "./glob.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  // Python
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".eggs",
]);

/**
 * `build` is only a build-output dir in JS/TS projects — in Python it's a
 * legitimate subpackage name (e.g. pip's `pip/_internal/operations/build/`).
 * Skip it unless `config.include` targets Python, so Python configs don't
 * silently lose a `build/` package from discovery.
 */
function skipDirsFor(config: NecroConfig): Set<string> {
  const isPython = config.include.some((glob) => glob.includes("*.py"));
  if (isPython) return SKIP_DIRS;
  return new Set(SKIP_DIRS).add("build");
}

/**
 * Walk `target` and return absolute paths of source files matching
 * `config.include` and not `config.ignore`. Declaration files (`*.d.ts`,
 * `*.d.mts`, `*.d.cts`, `*.pyi`) are skipped.
 */
export async function discoverFiles(
  target: string,
  config: NecroConfig,
): Promise<string[]> {
  const include = globMatcher(config.include);
  const ignore = globMatcher(config.ignore);
  const skipDirs = skipDirsFor(config);
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        const rel = relative(target, abs);
        if (ignore(rel)) continue;
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/\.d\.(ts|mts|cts)$/.test(entry.name)) continue;
      if (entry.name.endsWith(".pyi")) continue;
      const rel = relative(target, abs);
      if (include(rel) && !ignore(rel)) out.push(abs);
    }
  }

  await walk(target);
  return out;
}
