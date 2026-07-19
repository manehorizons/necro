/**
 * Resolves the exact pinned knip/ts-prune install this repo's `devDependencies`
 * name — by absolute path into necro's own `node_modules`, never via `npx`
 * inside a corpus checkout (which could pick up that repo's own copy of the
 * tool, silently breaking version provenance).
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const NECRO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Absolute path to a pinned tool's bin script under necro's own `node_modules/.bin`. */
export function necroBinPath(bin: string): string {
  return `${NECRO_ROOT}node_modules/.bin/${bin}`;
}

/** The exact resolved version of a pinned devDependency, read from its own
 * `package.json` (not the semver range in necro's `package.json`). */
export async function necroPackageVersion(pkg: string): Promise<string> {
  const text = await readFile(`${NECRO_ROOT}node_modules/${pkg}/package.json`, "utf8");
  return (JSON.parse(text) as { version: string }).version;
}
