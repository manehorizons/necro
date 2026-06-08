import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ComplexityThresholds } from "./syntactic/types.js";

/** User-facing scan configuration. */
export interface NecroConfig {
  /** Globs of files to analyze. */
  include: string[];
  /** Globs to exclude from analysis. */
  ignore: string[];
  /** Path to an lcov coverage report (relative to scan target or absolute). */
  coveragePath?: string;
  /** Syntactic-detector thresholds (always resolved; defaults applied per key). */
  complexity: ComplexityThresholds;
}

/** §4 default detector thresholds. */
export const DEFAULT_COMPLEXITY: ComplexityThresholds = {
  nesting: 3,
  cyclomatic: 10,
  cognitive: 15,
  godFunctionLoc: 50,
  godFunctionParams: 5,
};

export const DEFAULT_CONFIG: NecroConfig = {
  include: ["**/*.ts", "**/*.tsx"],
  ignore: ["**/node_modules/**", "**/dist/**"],
  complexity: DEFAULT_COMPLEXITY,
};

/** The on-disk shape: every field optional, `complexity` a partial override. */
interface RawConfig {
  include?: string[];
  ignore?: string[];
  coveragePath?: string;
  complexity?: Partial<ComplexityThresholds>;
}

/**
 * Load `necro.config.json` from `cwd`, merged over {@link DEFAULT_CONFIG}.
 * Top-level keys replace their default; the `complexity` block is merged
 * per-threshold so a partial override keeps the other defaults.
 */
export async function loadConfig(cwd: string): Promise<NecroConfig> {
  const user = await readJsonConfig(join(cwd, "necro.config.json"));
  return {
    include: user.include ?? DEFAULT_CONFIG.include,
    ignore: user.ignore ?? DEFAULT_CONFIG.ignore,
    coveragePath: user.coveragePath,
    complexity: { ...DEFAULT_COMPLEXITY, ...(user.complexity ?? {}) },
  };
}

async function readJsonConfig(path: string): Promise<RawConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  return JSON.parse(raw) as RawConfig;
}
