import type { LlmOptions } from "../config.js";
import type { ComplexityFinding } from "../syntactic/types.js";
import type { RefactorClient } from "./client.js";
import { contextForFinding } from "./context.js";
import { buildRefactorPrompt, type RefactorProposal } from "./prompt.js";
import { verifyProposal, type VerifyBadge, type VerifyRunner } from "./verify.js";

/** The default checks run against a proposal in the scratch worktree. */
export const DEFAULT_CHECKS = ["npm run typecheck", "npx vitest run"];

/** One god-function finding and the model's suggested split. The original
 * `finding` is carried unchanged — refactor never mutates it. */
export interface RefactorOutcome {
  finding: ComplexityFinding;
  model: string;
  /** The suggested split, or `null` when the model response couldn't be parsed. */
  proposal: RefactorProposal | null;
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
}

/**
 * Propose god-function splits — **suggest-only**. Selects only `god-function`
 * findings (up to `limit`), asks the injected client for a split, and (when a
 * verify runner is supplied) verifies it in a throwaway worktree. Nothing here
 * mutates a finding, writes a file, or changes any tier — the result is advice.
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
  const outcomes: RefactorOutcome[] = [];
  for (const finding of selected) {
    const context = await contextForFinding(finding, llm.snippetRadius);
    const result = await client.propose(buildRefactorPrompt(context));
    if (!result.ok) {
      outcomes.push({ finding, model: llm.model, proposal: null, badge: null, failure: result.reason });
      continue;
    }
    const badge = opts.verifyRunner
      ? await verifyProposal(result.proposal.diff, checks, opts.verifyRunner)
      : null;
    outcomes.push({ finding, model: llm.model, proposal: result.proposal, badge });
  }

  return { outcomes, consideredGodFunctions: godFunctions.length };
}
