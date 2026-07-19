/**
 * The corpus source repos, derived from the same real-repo triage corpus the
 * competitor bench scores against — so the checkout list can never drift from
 * `test/fixtures/triage-realrepo/cases.json`'s actual provenance.
 */

import type { EvalCase } from "../../triage/eval.js";

/** One pinned external repo the corpus was captured from. */
export interface CorpusRepo {
  /** GitHub `owner/name`, e.g. `honojs/hono`. */
  repo: string;
  /** Pinned commit SHA the corpus cases were scanned at. */
  sha: string;
  /** Directory name under the checkout cache root (`repo` with `/` replaced). */
  dirName: string;
  cloneUrl: string;
}

/** Derive the unique (repo, sha) pairs a corpus's cases were captured from,
 * in first-appearance order. Pure — no I/O. */
export function deriveCorpusRepos(cases: EvalCase[]): CorpusRepo[] {
  const seen = new Map<string, CorpusRepo>();
  for (const c of cases) {
    const p = c.provenance;
    if (!p) continue;
    const key = `${p.repo}@${p.sha}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      repo: p.repo,
      sha: p.sha,
      dirName: p.repo.replace("/", "__"),
      cloneUrl: `https://github.com/${p.repo}.git`,
    });
  }
  return [...seen.values()];
}
