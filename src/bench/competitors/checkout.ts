/**
 * Idempotently checks out the competitor-bench corpus repos at their pinned
 * SHAs into a local cache dir. Maintainer-run, network-dependent — never part
 * of `npm test` or CI. Each repo is a full clone (GitHub disallows fetching an
 * arbitrary commit by SHA on public repos, so a shallow single-commit fetch
 * isn't reliable) followed by a checkout of the pinned SHA.
 */

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CorpusRepo } from "./repos.js";

const run = promisify(execFile);

export interface CheckoutResult {
  repo: CorpusRepo;
  path: string;
  status: "already-present" | "cloned" | "failed";
  /** Populated when `status === "failed"` — e.g. the pinned SHA is unreachable
   * upstream (rewritten history, deleted branch). Never thrown: the caller
   * decides how to report a per-repo failure without aborting the others. */
  error?: string;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isAtPinnedSha(path: string, sha: string): Promise<boolean> {
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: path });
    return stdout.trim() === sha;
  } catch {
    return false;
  }
}

/** Checkout one repo into `cacheDir/<repo.dirName>`, pinned to `repo.sha`.
 * Idempotent: a checkout already at the pinned SHA is left untouched. */
export async function checkoutRepo(repo: CorpusRepo, cacheDir: string): Promise<CheckoutResult> {
  const path = join(cacheDir, repo.dirName);

  if ((await dirExists(path)) && (await isAtPinnedSha(path, repo.sha))) {
    return { repo, path, status: "already-present" };
  }

  try {
    if (!(await dirExists(path))) {
      await run("git", ["clone", "--quiet", repo.cloneUrl, path]);
    }
    await run("git", ["checkout", "--quiet", repo.sha], { cwd: path });
    return { repo, path, status: "cloned" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      repo,
      path,
      status: "failed",
      error: `could not check out ${repo.repo}@${repo.sha}: ${message.trim()}`,
    };
  }
}

/** Checkout every repo, sequentially (clones are network- and disk-heavy —
 * concurrency isn't worth the contention). Never throws; failures are
 * reported per-repo in the results. */
export async function checkoutAll(repos: CorpusRepo[], cacheDir: string): Promise<CheckoutResult[]> {
  const results: CheckoutResult[] = [];
  for (const repo of repos) {
    results.push(await checkoutRepo(repo, cacheDir));
  }
  return results;
}

/** Look up an already-present checkout without cloning — used by the
 * competitor-bench orchestrator, which treats "no checkout" as a per-repo
 * skip rather than triggering a clone itself (checkout is a separate,
 * explicit maintainer step). */
export async function resolveCheckout(
  repo: CorpusRepo,
  cacheDir: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const path = join(cacheDir, repo.dirName);
  if (!(await dirExists(path))) {
    return { ok: false, reason: `no checkout found at ${path} — run the checkout step first` };
  }
  if (!(await isAtPinnedSha(path, repo.sha))) {
    return { ok: false, reason: `checkout at ${path} is not at the pinned SHA ${repo.sha}` };
  }
  return { ok: true, path };
}
