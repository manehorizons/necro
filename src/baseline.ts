import { readFile, writeFile } from "node:fs/promises";
import type { ClassifiedFinding } from "./analyze/classify.js";
import type { ComplexityFinding } from "./syntactic/types.js";

/** Default baseline snapshot filename, written at the scan target root. */
export const DEFAULT_BASELINE_FILE = ".necro-baseline.json";

/** On-disk shape of a baseline snapshot. */
interface BaselineFile {
  version: 1;
  keys: string[];
}

/** Stable key for a dead-code finding: its symbol node's `file:line:name` id. */
export function findingKey(finding: ClassifiedFinding): string {
  return finding.node.id;
}

/** Stable key for a complexity finding: detector-qualified location. */
export function complexityKey(finding: ComplexityFinding): string {
  return `${finding.detector}:${finding.file}:${finding.line}:${finding.name}`;
}

/** Read a baseline snapshot. Returns `undefined` if the file doesn't exist. */
export async function readBaseline(path: string): Promise<Set<string> | undefined> {
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
export async function writeBaseline(path: string, keys: string[]): Promise<void> {
  const file: BaselineFile = { version: 1, keys: [...keys].sort() };
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
}

const IGNORE_MARKER = /\/\/\s*necro-ignore\b/;

async function sourceLines(file: string, cache: Map<string, string[]>): Promise<string[]> {
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
