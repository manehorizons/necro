import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** User-facing scan configuration. */
export interface NecroConfig {
  /** Globs of files to analyze. */
  include: string[];
  /** Globs to exclude from analysis. */
  ignore: string[];
}

export const DEFAULT_CONFIG: NecroConfig = {
  include: ["**/*.ts", "**/*.tsx"],
  ignore: ["**/node_modules/**", "**/dist/**"],
};

/**
 * Load `necro.config.json` from `cwd`, merged over {@link DEFAULT_CONFIG}.
 * Returns the defaults verbatim when no config file is present.
 */
export async function loadConfig(cwd: string): Promise<NecroConfig> {
  const userConfig = await readJsonConfig(join(cwd, "necro.config.json"));
  return { ...DEFAULT_CONFIG, ...userConfig };
}

async function readJsonConfig(path: string): Promise<Partial<NecroConfig>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  return JSON.parse(raw) as Partial<NecroConfig>;
}
