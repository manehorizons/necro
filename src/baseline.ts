import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import type { ClassifiedFinding } from "./analyze/classify.js";
import type { ComplexityFinding } from "./syntactic/types.js";

/** Default baseline snapshot filename, written at the scan target root. */
export const DEFAULT_BASELINE_FILE = ".necro-baseline.json";

/** On-disk shape of a baseline snapshot. */
interface BaselineFile {
  version: 1;
  keys: string[];
}

/**
 * Stable key for a dead-code finding: `file:line:name`, with `file` made
 * relative to `root` (the scan target) — a raw absolute-path id would only
 * ever match a baseline written from the exact same machine/checkout path,
 * breaking the moment it's committed and read back in CI from a different
 * absolute path.
 */
export function findingKey(finding: ClassifiedFinding, root: string): string {
  const { file, line, name } = finding.node;
  return `${relative(root, file)}:${line}:${name}`;
}

/** Stable key for a complexity finding: detector-qualified location, `file` relative to `root` (see {@link findingKey}). */
export function complexityKey(
  finding: ComplexityFinding,
  root: string,
): string {
  return `${finding.detector}:${relative(root, finding.file)}:${finding.line}:${finding.name}`;
}

/** Read a baseline snapshot. Returns `undefined` if the file doesn't exist. */
export async function readBaseline(
  path: string,
): Promise<Set<string> | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const parsed = JSON.parse(raw) as BaselineFile;
  return new Set(parsed.keys);
}

/** Write a baseline snapshot as plain, diffable JSON (sorted keys). */
export async function writeBaseline(
  path: string,
  keys: string[],
): Promise<void> {
  const file: BaselineFile = { version: 1, keys: [...keys].sort() };
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
}

const IGNORE_MARKER = /\/\/\s*necro-ignore\b/;

async function sourceLines(
  file: string,
  cache: Map<string, string[]>,
): Promise<string[]> {
  const cached = cache.get(file);
  if (cached) return cached;
  const raw = await readFile(file, "utf8");
  const lines = raw.split("\n");
  cache.set(file, lines);
  return lines;
}

/**
 * True if a `// necro-ignore` comment sits on the declaration line or the
 * line directly above it (1-based `line`, matching `SymbolNode.line`).
 * `cache` is caller-owned so one scan re-reads each source file at most once.
 */
export async function isIgnored(
  file: string,
  line: number,
  cache: Map<string, string[]>,
): Promise<boolean> {
  const lines = await sourceLines(file, cache);
  const decl = lines[line - 1] ?? "";
  const above = lines[line - 2] ?? "";
  return IGNORE_MARKER.test(decl) || IGNORE_MARKER.test(above);
}
