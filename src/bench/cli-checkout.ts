import { pathToFileURL } from "node:url";
import { loadEvalCases } from "../triage/eval.js";
import { checkoutAll } from "./competitors/checkout.js";
import { deriveCorpusRepos } from "./competitors/repos.js";

/**
 * Maintainer-run prerequisite for `npm run bench:competitors`: idempotently
 * checks out every real-repo triage corpus's pinned SHA into `.bench-cache/`
 * (gitignored). Network-dependent; never runs in CI or `npm test`.
 */

const DEFAULT_CACHE_DIR = ".bench-cache";
const CASES_PATH = "test/fixtures/triage-realrepo/cases.json";

async function main(): Promise<void> {
  const cases = await loadEvalCases(CASES_PATH);
  const repos = deriveCorpusRepos(cases);
  const results = await checkoutAll(repos, DEFAULT_CACHE_DIR);

  for (const r of results) {
    process.stdout.write(
      `${r.status === "failed" ? "✗" : "✓"} ${r.repo.repo}@${r.repo.sha.slice(0, 7)} → ${r.status}${r.error ? `: ${r.error}` : ""}\n`,
    );
  }
  if (results.some((r) => r.status === "failed")) {
    process.stderr.write(
      "\nsome checkouts failed — competitor-bench will skip their cases and report them under skippedRepos\n",
    );
    process.exitCode = 1;
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
