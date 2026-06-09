import { readFile } from "node:fs/promises";
import type { CloneLocation, ComplexityFinding, DuplicationFinding } from "../syntactic/types.js";
import { extractRange, extractSnippet, type Snippet } from "../triage/snippet.js";

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

/** One clone location's duplicated slice plus the in-file context (imports)
 * needed to host a shared function and keep its call surface resolvable. */
export interface DuplicateLocationContext {
  location: CloneLocation;
  /** The duplicated source slice, re-read via the shared range reader. */
  snippet: Snippet;
  /** Top-level `import` lines from the location's file (preservation context). */
  imports: string[];
}

/** The context handed to the LLM for an extract-duplicate refactor: every clone
 * location's slice + its file's imports, so the model can lift the shared code
 * into one function and replace each site with a call. */
export interface DuplicateRefactorContext {
  finding: DuplicationFinding;
  locations: DuplicateLocationContext[];
}

/**
 * Build the extract-duplicate context for a clone group: for each location,
 * re-read its file, slice the duplicated line range, and collect that file's
 * imports. A finding with fewer than two locations is rejected — there is
 * nothing to deduplicate. Files are read once even when a clone group has
 * multiple locations in the same file.
 */
export async function dupContextForFinding(
  finding: DuplicationFinding,
): Promise<DuplicateRefactorContext> {
  if (finding.locations.length < 2) {
    throw new Error(
      `dupContextForFinding expects a clone group with ≥2 locations, got ${finding.locations.length}`,
    );
  }
  const texts = new Map<string, string>();
  const readOnce = async (file: string): Promise<string> => {
    const cached = texts.get(file);
    if (cached !== undefined) return cached;
    const text = await readFile(file, "utf8");
    texts.set(file, text);
    return text;
  };

  const locations: DuplicateLocationContext[] = [];
  for (const location of finding.locations) {
    const text = await readOnce(location.file);
    const snippet: Snippet = {
      file: location.file,
      ...extractRange(text, location.startLine, location.endLine),
    };
    locations.push({ location, snippet, imports: collectImports(text) });
  }
  return { finding, locations };
}

/** Top-of-statement `import …` lines (single-line; enough as an LLM hint). */
function collectImports(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("import ") && !l.startsWith("import("));
}
