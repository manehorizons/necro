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
  /** Risk-hotspot ranking options. */
  hotspots: HotspotOptions;
  /** Duplication-detector options. */
  duplication: DuplicationOptions;
}

/** Risk-hotspot ranking options. */
export interface HotspotOptions {
  /** How many hotspots to show. */
  top: number;
}

/** Duplication-detector options. */
export interface DuplicationOptions {
  /** Minimum normalized-token length for a clone to be reported. */
  minTokens: number;
}

/** §4 default detector thresholds. */
export const DEFAULT_COMPLEXITY: ComplexityThresholds = {
  nesting: 3,
  cyclomatic: 10,
  cognitive: 15,
  godFunctionLoc: 50,
  godFunctionParams: 5,
};

export const DEFAULT_HOTSPOTS: HotspotOptions = { top: 10 };

export const DEFAULT_DUPLICATION: DuplicationOptions = { minTokens: 50 };

export const DEFAULT_CONFIG: NecroConfig = {
  include: ["**/*.ts", "**/*.tsx"],
  ignore: ["**/node_modules/**", "**/dist/**"],
  complexity: DEFAULT_COMPLEXITY,
  hotspots: DEFAULT_HOTSPOTS,
  duplication: DEFAULT_DUPLICATION,
};

/** The on-disk shape: every field optional, nested blocks partial overrides. */
interface RawConfig {
  include?: string[];
  ignore?: string[];
  coveragePath?: string;
  complexity?: Partial<ComplexityThresholds>;
  hotspots?: Partial<HotspotOptions>;
  duplication?: Partial<DuplicationOptions>;
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
    hotspots: { ...DEFAULT_HOTSPOTS, ...(user.hotspots ?? {}) },
    duplication: { ...DEFAULT_DUPLICATION, ...(user.duplication ?? {}) },
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
