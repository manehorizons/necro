import { readFile } from "node:fs/promises";
import type { ClassifiedFinding } from "../analyze/classify.js";

/** A bounded slice of source around a finding, with 1-based line numbers. */
export interface Snippet {
  file: string;
  startLine: number;
  endLine: number;
  /** The slice, each line prefixed with its 1-based number and a tab. */
  code: string;
}

/** Hard ceiling on snippet length so a pathological god-function can't blow up
 * the prompt; the enclosing block is captured up to this many lines. */
const MAX_SPAN = 200;

/**
 * Extract a bounded snippet around a 1-based declaration `line` in `text`.
 *
 * Captures `radius` lines of leading context, then the enclosing declaration's
 * body by brace-matching forward from the declaration line; when no brace block
 * is found it falls back to a `±radius` window. Brace matching is naive (it does
 * not skip braces inside strings/comments) — this is context for an LLM, not a
 * parse, so approximate boundaries are fine. The span is clamped to {@link MAX_SPAN}.
 */
export function extractSnippet(text: string, line: number, radius: number): Omit<Snippet, "file"> {
  const lines = text.split("\n");
  const total = lines.length;
  if (total === 0) return { startLine: 1, endLine: 1, code: "" };

  const decl = Math.min(Math.max(line, 1), total);
  const startLine = Math.max(1, decl - radius);
  const endLine = Math.min(total, decl + spanBelow(lines, decl, radius));

  const code = lines
    .slice(startLine - 1, endLine)
    .map((l, i) => `${startLine + i}\t${l}`)
    .join("\n");
  return { startLine, endLine, code };
}

/**
 * Extract an exact 1-based line range `[startLine, endLine]` from `text`, each
 * line prefixed with its 1-based number and a tab (same shape as
 * {@link extractSnippet}). Unlike `extractSnippet` this does no brace matching —
 * it slices precisely the requested range, which is what a clone location gives
 * us. The range is clamped into the file and to {@link MAX_SPAN} lines.
 */
export function extractRange(text: string, startLine: number, endLine: number): Omit<Snippet, "file"> {
  const lines = text.split("\n");
  const total = lines.length;
  if (total === 0) return { startLine: 1, endLine: 1, code: "" };

  const start = Math.min(Math.max(startLine, 1), total);
  const end = Math.min(Math.max(endLine, start), Math.min(total, start + MAX_SPAN - 1));
  const code = lines
    .slice(start - 1, end)
    .map((l, i) => `${start + i}\t${l}`)
    .join("\n");
  return { startLine: start, endLine: end, code };
}

/**
 * Lines below the declaration to include: the enclosing block's extent via
 * brace matching, else `radius`. Returns an offset from `decl`.
 */
function spanBelow(lines: string[], decl: number, radius: number): number {
  let depth = 0;
  let opened = false;
  for (let i = decl - 1; i < lines.length && i < decl - 1 + MAX_SPAN; i++) {
    for (const ch of lines[i] ?? "") {
      if (ch === "{") {
        depth++;
        opened = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    if (opened && depth <= 0) return i - (decl - 1);
  }
  // No balanced block found near the declaration → plain window.
  return radius;
}

/** Re-read a finding's source file and extract its context snippet. */
export async function snippetForFinding(
  finding: ClassifiedFinding,
  radius: number,
): Promise<Snippet> {
  const { file, line } = finding.node;
  const text = await readFile(file, "utf8");
  return { file, ...extractSnippet(text, line, radius) };
}
