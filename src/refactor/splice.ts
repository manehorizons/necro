import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import type { DuplicateProposal } from "./prompt.js";

const execFileAsync = promisify(execFile);

/** Replace 1-based lines [startLine, endLine] of `original` with `replacement`.
 * An `endLine < startLine` (e.g. `startLine, startLine-1`) inserts before
 * `startLine` without removing anything. */
export function spliceLines(
  original: string,
  startLine: number,
  endLine: number,
  replacement: string,
): string {
  const lines = original.split("\n");
  const before = lines.slice(0, Math.max(startLine - 1, 0));
  const after = lines.slice(Math.max(endLine, startLine - 1));
  const repl = replacement.replace(/\n$/, "").split("\n");
  return [...before, ...repl, ...after].join("\n");
}

/** Best-effort unified diff between two strings via `git diff --no-index`.
 * Returns "" when identical, the diff text otherwise, or `null` if git failed
 * to produce one. Writes only to a temp dir, which is always removed — never the
 * user's tree. */
export async function computeUnifiedDiff(
  original: string,
  updated: string,
): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "necro-refdiff-"));
  try {
    const a = join(dir, "a");
    const b = join(dir, "b");
    await writeFile(a, original);
    await writeFile(b, updated);
    try {
      // Differing files make git exit 1 with the diff on stdout — that's success here.
      await execFileAsync("git", ["diff", "--no-index", "--", a, b], {
        timeout: 10_000,
      });
      return ""; // identical
    } catch (err) {
      const e = err as { stdout?: string };
      return e.stdout ?? null;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** One affected file after an extract-duplicate splice: its new full content and
 * a necro-computed unified diff for display. */
export interface DuplicateSpliceResult {
  file: string;
  newContent: string;
  diff: string | null;
}

interface Op {
  /** 1-based start line of the range to replace. */
  start: number;
  /** 1-based end line (inclusive); `start - 1` means a pure insertion. */
  end: number;
  text: string;
}

/**
 * Apply an extract-duplicate proposal to the clone-group files and return the
 * new content + diff for each affected file. Pure with respect to the user's
 * tree — it takes original file contents in and writes nothing back (only the
 * diff helper touches a temp dir).
 *
 * For each file it: replaces every clone site with the model's call code;
 * inserts the shared function into `sharedFunctionFile` (after its import
 * block); and, in every other affected file, adds an `import` of the shared
 * function (derived from the exported name + the relative path necro computes).
 * Edits are applied bottom-up so earlier line numbers stay valid; overlapping or
 * out-of-bounds edits throw so the orchestrator can record a failed proposal.
 */
export async function spliceDuplicate(
  files: Map<string, string>,
  proposal: DuplicateProposal,
): Promise<DuplicateSpliceResult[]> {
  const sharedName = exportedName(proposal.sharedFunction);
  const affected = new Set<string>([
    proposal.sharedFunctionFile,
    ...proposal.edits.map((e) => e.file),
  ]);

  const results: DuplicateSpliceResult[] = [];
  for (const file of affected) {
    const original = files.get(file);
    if (original === undefined)
      throw new Error(`spliceDuplicate: missing content for "${file}"`);

    const ops: Op[] = proposal.edits
      .filter((e) => e.file === file)
      .map((e) => ({
        start: e.startLine,
        end: e.endLine,
        text: e.replacement,
      }));

    if (file === proposal.sharedFunctionFile) {
      const at = afterImports(original);
      ops.push({
        start: at,
        end: at - 1,
        text: `\n${proposal.sharedFunction.replace(/\n$/, "")}\n`,
      });
    } else if (sharedName) {
      const spec = importSpecifier(file, proposal.sharedFunctionFile);
      const at = afterImports(original);
      ops.push({
        start: at,
        end: at - 1,
        text: `import { ${sharedName} } from "${spec}";`,
      });
    }

    const newContent = applyOps(original, ops);
    const diff = await computeUnifiedDiff(original, newContent);
    results.push({ file, newContent, diff });
  }

  // Stable, deterministic order: shared-function file first, then the rest by name.
  results.sort((a, b) => {
    if (a.file === proposal.sharedFunctionFile) return -1;
    if (b.file === proposal.sharedFunctionFile) return 1;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });
  return results;
}

/** Apply ops to `content`, bottom-up, rejecting overlaps and out-of-bounds. */
function applyOps(content: string, ops: Op[]): string {
  const lineCount = content.split("\n").length;
  const replacements = ops.filter((o) => o.end >= o.start);
  for (const o of replacements) {
    if (o.start < 1 || o.end > lineCount) {
      throw new Error(
        `extract-duplicate: edit range ${o.start}-${o.end} is out of bounds (1-${lineCount})`,
      );
    }
  }
  // Detect overlap among replacement ranges (insertions can't overlap content).
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start <= sorted[i - 1]!.end) {
      throw new Error(
        `extract-duplicate: overlapping edits ${sorted[i - 1]!.start}-${sorted[i - 1]!.end} and ${sorted[i]!.start}-${sorted[i]!.end}`,
      );
    }
  }
  // Apply highest start first so lower line numbers remain valid.
  let out = content;
  for (const o of [...ops].sort((a, b) => b.start - a.start)) {
    out = spliceLines(out, o.start, o.end, o.text);
  }
  return out;
}

/** 1-based line just past the file's leading import block (1 when none). */
function afterImports(content: string): number {
  const lines = content.split("\n");
  let last = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t.startsWith("import ") && !t.startsWith("import(")) last = i + 1;
  }
  return last + 1;
}

/** The exported symbol name from `export function NAME` / `export const NAME`. */
function exportedName(source: string): string | null {
  const fn = source.match(
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
  );
  if (fn) return fn[1] ?? null;
  const c = source.match(/\bexport\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/);
  return c ? (c[1] ?? null) : null;
}

/** A relative ESM import specifier from `fromFile` to `toFile` (`.ts`→`.js`). */
function importSpecifier(fromFile: string, toFile: string): string {
  let spec = relative(dirname(fromFile), toFile)
    .replace(/\\/g, "/")
    .replace(/\.tsx?$/, ".js");
  if (!spec.startsWith(".")) spec = `./${spec}`;
  return spec;
}
