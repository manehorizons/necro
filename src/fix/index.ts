import { writeFile } from "node:fs/promises";
import type { NecroConfig } from "../config.js";
import { scan } from "../engine/index.js";
import { renderDiff } from "./diff.js";
import { workingTreeState } from "./git-guard.js";
import { planRemovals } from "./remove.js";

export interface FixOptions {
  /** Apply the removals to disk. Without this, `fix` only previews. */
  write?: boolean;
  /** Bypass the dirty-tree guard. */
  force?: boolean;
}

/** The outcome of a {@link runFix} call — drives what the CLI prints. */
export type FixResult =
  | { status: "nothing-to-fix" }
  | { status: "preview"; diff: string; count: number }
  | { status: "refused-dirty" }
  | { status: "refused-no-entries" }
  | { status: "written"; count: number; files: string[] };

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
  const { findings, diagnostics } = await scan(targetPath, config, { complexity: false });

  // Fail-closed (§2): zero prod entries on a non-empty graph means reachability
  // is unseeded — refuse before the nothing-to-fix check (the user must learn
  // *why* nothing is eligible) and before the dirty-tree guard (no-entries wins,
  // so refusal reasons never shadow each other).
  if (diagnostics.entryResolution.collapsed) return { status: "refused-no-entries" };

  const edits = planRemovals(findings);
  if (edits.length === 0) return { status: "nothing-to-fix" };

  const count = findings.filter((f) => f.autoFixEligible).length;

  if (!opts.write) {
    return { status: "preview", diff: renderDiff(edits, targetPath), count };
  }

  const state = await workingTreeState(targetPath);
  if (state === "dirty" && !opts.force) return { status: "refused-dirty" };
  if (state === "unknown") {
    console.warn("necro fix: no git repo detected — there is no undo. Proceeding because --write was given.");
  }

  await Promise.all(edits.map((e) => writeFile(e.file, e.after)));
  return { status: "written", count, files: edits.map((e) => e.file) };
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
