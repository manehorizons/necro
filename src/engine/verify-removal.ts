import { relative } from "node:path";
import type { NecroConfig } from "../config.js";
import { planRemovalOf } from "../fix/remove.js";
import {
  type FileEdit,
  gitWorktreeRunner,
  type VerifyRunner,
  verifyEdits,
} from "../refactor/verify.js";
import { DEFAULT_CHECKS } from "../refactor/index.js";
import { resolveQuery } from "./explain.js";
import { buildReachabilityModel } from "./model.js";

/** The verdict of verifying one symbol's removal. */
export interface RemovalVerdict {
  /** The original query string, echoed back. */
  symbol: string;
  /**
   * `green` — deleting it kept the build green. `red` — a check failed.
   * `unresolved` — the query matched zero or multiple symbols, or no removable
   * declaration was found (nothing was verified).
   */
  status: "green" | "red" | "unresolved";
  /** The failing check output for `red`; a short reason for `unresolved`. */
  output?: string;
  /** The resolved symbol id, when the query matched exactly one. */
  resolvedId?: string;
}

export interface VerifyRemovalOptions {
  /** Build the worktree runner for a repo root (injected for tests). */
  runnerFactory?: (repoRoot: string) => VerifyRunner;
  /** Checks run in each throwaway worktree (default: typecheck + tests). */
  checks?: string[];
  /**
   * Repo root the worktrees branch off (file edits are relativized to it).
   * Defaults to `targetPath` — pass the git toplevel when the target is a subdir.
   */
  repoRoot?: string;
}

/**
 * For each symbol query, plan its removal with the ts-morph removal engine and
 * verify it **independently** in its own throwaway git worktree: does deleting
 * symbol X keep the build green? Resolution and planning run once over a shared
 * reachability model; verification gets a fresh worktree per symbol so one
 * red verdict never taints another. The user's working tree is never touched.
 */
export async function verifyRemovals(
  targetPath: string,
  config: NecroConfig,
  symbols: string[],
  opts: VerifyRemovalOptions = {},
): Promise<RemovalVerdict[]> {
  const runnerFactory = opts.runnerFactory ?? gitWorktreeRunner;
  const checks = opts.checks ?? DEFAULT_CHECKS;
  const repoRoot = opts.repoRoot ?? targetPath;

  const model = await buildReachabilityModel(targetPath, config);

  const verdicts: RemovalVerdict[] = [];
  for (const symbol of symbols) {
    const matches = resolveQuery(model.graph.nodes, symbol);
    if (matches.length !== 1) {
      verdicts.push({
        symbol,
        status: "unresolved",
        output: matches.length === 0 ? "no matching symbol" : "ambiguous query",
      });
      continue;
    }

    const node = matches[0] as (typeof matches)[number];
    const edits = planRemovalOf([{ file: node.file, name: node.name, line: node.line }]);
    if (edits.length === 0) {
      verdicts.push({ symbol, status: "unresolved", output: "no removable declaration", resolvedId: node.id });
      continue;
    }

    const fileEdits: FileEdit[] = edits.map((e) => ({
      file: relative(repoRoot, e.file),
      content: e.after,
    }));
    const badge = await verifyEdits(fileEdits, checks, runnerFactory(repoRoot));
    verdicts.push(
      badge.status === "green"
        ? { symbol, status: "green", resolvedId: node.id }
        : { symbol, status: "red", output: badge.output, resolvedId: node.id },
    );
  }
  return verdicts;
}
