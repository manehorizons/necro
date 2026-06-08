import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import type { LlmOptions } from "../config.js";
import type { ComplexityFinding } from "../syntactic/types.js";
import type { RefactorClient } from "./client.js";
import { contextForFinding } from "./context.js";
import { buildRefactorPrompt, type RefactorProposal } from "./prompt.js";
import { verifyProposal, type VerifyBadge, type VerifyRunner } from "./verify.js";

const execFileAsync = promisify(execFile);

/** The default checks run against a proposal in the scratch worktree. */
export const DEFAULT_CHECKS = ["npm run typecheck", "npx vitest run"];

/** One god-function finding and the model's suggested split. The original
 * `finding` is carried unchanged — refactor never mutates it. */
export interface RefactorOutcome {
  finding: ComplexityFinding;
  model: string;
  /** The suggested split (incl. `replacement` code), or `null` when unparseable. */
  proposal: RefactorProposal | null;
  /** A necro-computed unified diff for display (always applies); `null` on failure. */
  diff: string | null;
  /** Verification badge; `null` when there was no proposal (or no runner). */
  badge: VerifyBadge | null;
  /** Set when `proposal` is null — why parsing failed. */
  failure?: string;
}

export interface RefactorRunResult {
  outcomes: RefactorOutcome[];
  /** How many god-function findings the scan produced. */
  consideredGodFunctions: number;
}

export interface RefactorRunOptions {
  /** Max god-function findings to propose splits for in one run (default 1). */
  limit?: number;
  /** Checks run in the scratch worktree (default: typecheck + tests). */
  checks?: string[];
  /** Injected verify runner; when omitted, verification is skipped (`badge: null`). */
  verifyRunner?: VerifyRunner;
  /** Repo root, for the worktree-relative edit path (default: cwd). */
  repoRoot?: string;
}

/**
 * Propose god-function splits — **suggest-only**. Selects only `god-function`
 * findings (up to `limit`), asks the injected client for the rewritten function
 * code, splices it into the file to get full new content, computes a clean diff
 * for display, and (with a verify runner) verifies the new content in a throwaway
 * worktree. Nothing here mutates a finding, writes a source file, or changes any
 * tier — the result is advice.
 */
export async function runRefactor(
  complexity: ComplexityFinding[],
  llm: LlmOptions,
  client: RefactorClient,
  opts: RefactorRunOptions = {},
): Promise<RefactorRunResult> {
  const godFunctions = complexity.filter((f) => f.detector === "god-function");
  const limit = opts.limit ?? 1;
  const selected = godFunctions.slice(0, Math.max(limit, 0));

  if (selected.length === 0) {
    return { outcomes: [], consideredGodFunctions: godFunctions.length };
  }

  const checks = opts.checks ?? DEFAULT_CHECKS;
  const repoRoot = opts.repoRoot ?? process.cwd();
  const outcomes: RefactorOutcome[] = [];
  for (const finding of selected) {
    const context = await contextForFinding(finding, llm.snippetRadius);
    const result = await client.propose(buildRefactorPrompt(context));
    if (!result.ok) {
      outcomes.push({ finding, model: llm.model, proposal: null, diff: null, badge: null, failure: result.reason });
      continue;
    }

    const original = await readFile(finding.file, "utf8");
    const newContent = spliceLines(original, finding.line, context.snippet.endLine, result.proposal.replacement);
    const diff = await computeUnifiedDiff(original, newContent);

    const badge = opts.verifyRunner
      ? await verifyProposal({ file: relative(repoRoot, finding.file), content: newContent }, checks, opts.verifyRunner)
      : null;

    outcomes.push({ finding, model: llm.model, proposal: result.proposal, diff, badge });
  }

  return { outcomes, consideredGodFunctions: godFunctions.length };
}

/** Replace 1-based lines [startLine, endLine] of `original` with `replacement`. */
export function spliceLines(original: string, startLine: number, endLine: number, replacement: string): string {
  const lines = original.split("\n");
  const before = lines.slice(0, Math.max(startLine - 1, 0));
  const after = lines.slice(endLine);
  const repl = replacement.replace(/\n$/, "").split("\n");
  return [...before, ...repl, ...after].join("\n");
}

/** Best-effort unified diff between two strings via `git diff --no-index`. */
async function computeUnifiedDiff(original: string, updated: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "necro-refdiff-"));
  try {
    const a = join(dir, "a");
    const b = join(dir, "b");
    await writeFile(a, original);
    await writeFile(b, updated);
    try {
      // Differing files make git exit 1 with the diff on stdout — that's success here.
      await execFileAsync("git", ["diff", "--no-index", "--", a, b], { timeout: 10_000 });
      return ""; // identical
    } catch (err) {
      const e = err as { stdout?: string };
      return e.stdout ?? null;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
