import { readFile } from "node:fs/promises";
import type { ComplexityFinding } from "../syntactic/types.js";
import { extractSnippet, type Snippet } from "../triage/snippet.js";

/** The context handed to the LLM for a god-function split: the function body
 * plus the in-file imports needed to keep the proposed split's call surface
 * resolvable. */
export interface RefactorContext {
  finding: ComplexityFinding;
  /** The enclosing function body, re-read via the shared snippet reader. */
  snippet: Snippet;
  /** Top-level `import` lines from the file (preservation context). */
  imports: string[];
}

/**
 * Build the refactor context for a god-function finding: re-read its source
 * file, slice the enclosing function body, and collect the file's import lines.
 * Only `god-function` findings are accepted — any other detector is rejected so
 * the refactor path can't be driven by a complexity finding it can't split.
 */
export async function contextForFinding(
  finding: ComplexityFinding,
  radius: number,
): Promise<RefactorContext> {
  if (finding.detector !== "god-function") {
    throw new Error(
      `contextForFinding expects a god-function finding, got "${finding.detector}"`,
    );
  }
  const text = await readFile(finding.file, "utf8");
  const snippet: Snippet = { file: finding.file, ...extractSnippet(text, finding.line, radius) };
  return { finding, snippet, imports: collectImports(text) };
}

/** Top-of-statement `import …` lines (single-line; enough as an LLM hint). */
function collectImports(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("import ") && !l.startsWith("import("));
}
