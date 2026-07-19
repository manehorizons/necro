import { writeFile } from "node:fs/promises";
import type { ClassifiedFinding } from "../analyze/classify.js";
import type { NecroConfig } from "../config.js";
import { scan } from "../engine/index.js";
import {
  type RemovalVerdict,
  verifyFindings,
} from "../engine/verify-removal.js";
import type { VerifyRunner } from "../refactor/verify.js";
import { renderDiff } from "./diff.js";
import { workingTreeState } from "./git-guard.js";
import { planRemovals } from "./remove.js";

export interface FixOptions {
  /** Apply the removals to disk. Without this, `fix` only previews. */
  write?: boolean;
  /** Bypass the dirty-tree guard. */
  force?: boolean;
  /**
   * Gate each removal on `verify-removal`'s empirical build-green check
   * (isolated worktree per symbol) before deleting it. Opt-in: verification
   * spins up a throwaway worktree and runs the full check suite per symbol,
   * so it is strictly more expensive than the unverified default.
   */
  verify?: boolean;
  /** Checks run in each throwaway worktree when `verify` is set (default: typecheck + tests). */
  checks?: string[];
  /** Build the worktree runner for a repo root (injected for tests). */
  runnerFactory?: (repoRoot: string) => VerifyRunner;
}

/** A `certain`-dead symbol that `--verify` refused to delete. */
export interface SkippedSymbol {
  symbol: string;
  /** `red` — verify-removal's check failed. `unresolved` — the symbol query didn't resolve to one declaration. */
  reason: "red" | "unresolved";
  output?: string;
}

/** The outcome of a {@link runFix} call — drives what the CLI prints. */
export type FixResult =
  | { status: "nothing-to-fix" }
  | { status: "preview"; diff: string; count: number }
  | { status: "preview-verified"; verdicts: RemovalVerdict[] }
  | { status: "refused-dirty" }
  | { status: "refused-no-entries" }
  | {
      status: "written";
      count: number;
      files: string[];
      skipped: SkippedSymbol[];
    };

/**
 * Remove `certain`-dead code safely. Scans, plans the removals, and either
 * previews the diff (default) or — under `write` — applies them after the
 * dirty-tree guard. Single-pass: it does not re-scan to chase cascading
 * deletions.
 */
export async function runFix(
  targetPath: string,
  config: NecroConfig,
  opts: FixOptions,
): Promise<FixResult> {
  // fix only needs dead-code findings — skip the complexity (tree-sitter) axis.
  const { findings, diagnostics } = await scan(targetPath, config, {
    complexity: false,
  });

  // Fail-closed (§2): zero prod entries on a non-empty graph means reachability
  // is unseeded — refuse before the nothing-to-fix check (the user must learn
  // *why* nothing is eligible) and before the dirty-tree guard (no-entries wins,
  // so refusal reasons never shadow each other).
  if (diagnostics.entryResolution.collapsed)
    return { status: "refused-no-entries" };

  if (opts.verify) return runVerifiedFix(targetPath, config, findings, opts);

  const edits = planRemovals(findings);
  if (edits.length === 0) return { status: "nothing-to-fix" };

  const count = findings.filter((f) => f.autoFixEligible).length;

  if (!opts.write) {
    return { status: "preview", diff: renderDiff(edits, targetPath), count };
  }

  const state = await workingTreeState(targetPath);
  if (state === "dirty" && !opts.force) return { status: "refused-dirty" };
  if (state === "unknown") {
    console.warn(
      "necro fix: no git repo detected — there is no undo. Proceeding because --write was given.",
    );
  }

  await Promise.all(edits.map((e) => writeFile(e.file, e.after)));
  return {
    status: "written",
    count,
    files: edits.map((e) => e.file),
    skipped: [],
  };
}

/**
 * `--verify` path: verify each `certain`-dead finding via `verify-removal`'s
 * per-symbol isolated-worktree check first, then only ever plan/write the
 * removals for symbols that badged green. Red and unresolved symbols are
 * reported in `skipped`, never deleted.
 */
async function runVerifiedFix(
  targetPath: string,
  config: NecroConfig,
  findings: ClassifiedFinding[],
  opts: FixOptions,
): Promise<FixResult> {
  const eligible = findings.filter((f) => f.autoFixEligible);
  if (eligible.length === 0) return { status: "nothing-to-fix" };

  const verdicts = await verifyFindings(targetPath, config, eligible, {
    repoRoot: targetPath,
    checks: opts.checks,
    runnerFactory: opts.runnerFactory,
  });

  if (!opts.write) return { status: "preview-verified", verdicts };

  const bySymbol = new Map(eligible.map((f) => [f.node.id, f]));
  const green: ClassifiedFinding[] = [];
  const skipped: SkippedSymbol[] = [];
  for (const v of verdicts) {
    const finding = bySymbol.get(v.symbol);
    if (!finding) continue; // one verdict per query we sent — always present
    if (v.status === "green") green.push(finding);
    else skipped.push({ symbol: v.symbol, reason: v.status, output: v.output });
  }

  const edits = planRemovals(green);
  if (edits.length === 0) {
    return skipped.length > 0
      ? { status: "written", count: 0, files: [], skipped }
      : { status: "nothing-to-fix" };
  }

  const state = await workingTreeState(targetPath);
  if (state === "dirty" && !opts.force) return { status: "refused-dirty" };
  if (state === "unknown") {
    console.warn(
      "necro fix: no git repo detected — there is no undo. Proceeding because --write was given.",
    );
  }

  await Promise.all(edits.map((e) => writeFile(e.file, e.after)));
  return {
    status: "written",
    count: edits.length,
    files: edits.map((e) => e.file),
    skipped,
  };
}

/**
 * Public CLI exit-code taxonomy for `fix` (§2.5): 0 written/preview/
 * nothing-to-fix, 2 refused-dirty, 3 refused-no-entries. (Exit 1, unexpected
 * error, is set by the CLI's top-level catch — not reachable from a `FixResult`.)
 */
export function fixExitCode(status: FixResult["status"]): number {
  switch (status) {
    case "refused-dirty":
      return 2;
    case "refused-no-entries":
      return 3;
    default:
      return 0;
  }
}
