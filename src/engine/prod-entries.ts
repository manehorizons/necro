import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONVENTIONAL = [
  "index.ts", "index.tsx", "src/index.ts", "src/index.tsx",
  "main.ts", "src/main.ts",
];

/**
 * Resolve production entry files: package.json `main`/`module`/`bin`/`exports`
 * plus conventional source entries, kept only when they exist among scanned files.
 * These are the roots for prod-color reachability (§5 step 1).
 */
export function resolveProdEntries(root: string, files: string[]): Set<string> {
  const fileSet = new Set(files);
  const candidates = [...manifestEntries(root), ...CONVENTIONAL];
  const entries = new Set<string>();

  for (const rel of candidates) {
    const abs = join(root, rel);
    if (fileSet.has(abs)) entries.add(abs);
  }
  return entries;
}

function manifestEntries(root: string): string[] {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }

  const out: string[] = [];
  collectStrings(pkg.main, out);
  collectStrings(pkg.module, out);
  collectStrings(pkg.bin, out);
  collectStrings(pkg.exports, out);
  return out.map((p) => p.replace(/^\.\//, ""));
}

/** Recursively collect string leaves from a manifest field (string | array | object). */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) collectStrings(v, out);
}
