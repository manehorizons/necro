import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { parseCobertura } from "./cobertura.js";
import { type LcovReport, parseLcov } from "./lcov.js";

/** Default lcov location written by c8 / nyc / vitest / jest. */
export const DEFAULT_LCOV_PATH = "coverage/lcov.info";
/** Default Cobertura location written by Python's `coverage xml`. */
export const DEFAULT_COBERTURA_PATH = "coverage.xml";

export interface CoverageOptions {
  /** Override path to an lcov report, relative to the scan target or absolute. */
  coveragePath?: string;
  /** Override path to a Cobertura (Python `coverage xml`) report, relative to the scan target or absolute. */
  pythonCoveragePath?: string;
}

/**
 * Discover and parse an lcov report and/or a Cobertura report for the
 * project at `targetPath`, merged into one {@link LcovReport} (the two
 * languages' file paths never collide, so a plain map merge is safe).
 *
 * Path precedence per format: `opts.coveragePath`/`opts.pythonCoveragePath`
 * (from `--coverage` / config) → {@link DEFAULT_LCOV_PATH} /
 * {@link DEFAULT_COBERTURA_PATH}. A missing report (ENOENT) is silently
 * skipped for that format — coverage is optional per language. Any other
 * read/parse failure warns once and skips that format. `null` only when
 * neither format resolved. necro never *runs* the test suite to produce
 * coverage (path-based only).
 */
export async function loadCoverage(
  targetPath: string,
  opts: CoverageOptions,
): Promise<LcovReport | null> {
  const [lcov, cobertura] = await Promise.all([
    loadReport(
      targetPath,
      opts.coveragePath ?? DEFAULT_LCOV_PATH,
      "lcov",
      parseLcov,
    ),
    loadReport(
      targetPath,
      opts.pythonCoveragePath ?? DEFAULT_COBERTURA_PATH,
      "Cobertura",
      parseCobertura,
    ),
  ]);

  if (!lcov && !cobertura) return null;
  if (!cobertura) return lcov as LcovReport;
  if (!lcov) return cobertura;
  return { files: new Map([...lcov.files, ...cobertura.files]) };
}

async function loadReport(
  targetPath: string,
  rel: string,
  label: string,
  parse: (raw: string) => LcovReport,
): Promise<LcovReport | null> {
  const path = isAbsolute(rel) ? rel : resolve(targetPath, rel);

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.warn(
      `${label} report at ${path} unreadable — proceeding without it`,
    );
    return null;
  }

  try {
    return parse(raw);
  } catch {
    console.warn(
      `${label} report at ${path} could not be parsed — proceeding without it`,
    );
    return null;
  }
}
