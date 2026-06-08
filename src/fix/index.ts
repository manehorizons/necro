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
  const { findings } = await scan(targetPath, config);
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
