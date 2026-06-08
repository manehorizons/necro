import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { parseLcov, type LcovReport } from "./lcov.js";

/** Default lcov location written by c8 / nyc / vitest / jest. */
export const DEFAULT_LCOV_PATH = "coverage/lcov.info";

export interface CoverageOptions {
  /** Override path to an lcov report, relative to the scan target or absolute. */
  coveragePath?: string;
}

/**
 * Discover and parse an lcov report for the project at `targetPath`.
 *
 * Path precedence: `opts.coveragePath` (from `--coverage` / config) →
 * {@link DEFAULT_LCOV_PATH}. A missing report (ENOENT) returns `null` silently
 * — coverage is optional. Any other read/parse failure returns `null` with a
 * single warning; the scan proceeds without coverage. necro never *runs* the
 * test suite to produce coverage (path-based only).
 */
export async function loadCoverage(
  targetPath: string,
  opts: CoverageOptions,
): Promise<LcovReport | null> {
  const rel = opts.coveragePath ?? DEFAULT_LCOV_PATH;
  const path = isAbsolute(rel) ? rel : resolve(targetPath, rel);

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.warn(`coverage report at ${path} unreadable — proceeding without coverage`);
    return null;
  }

  try {
    return parseLcov(raw);
  } catch {
    console.warn(`coverage report at ${path} could not be parsed — proceeding without coverage`);
    return null;
  }
}
