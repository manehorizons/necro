import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEvalCases } from "../triage/eval.js";
import { runCompetitorBench } from "./competitors/run.js";
import { type BenchResults, parse, serialize, withCompetitors } from "./snapshot.js";

/**
 * Repo-internal competitor benchmark runner (`npm run bench:competitors`).
 * Scores knip and ts-prune against the identical real-repo triage corpus
 * necro's own bench measures, using whichever corpus repos are already
 * checked out under `.bench-cache/` (see `npm run bench:checkout`). No model
 * calls, no `ANTHROPIC_API_KEY` needed — but network-independent only in the
 * sense that the checkout step, not this one, does the cloning.
 */

const DEFAULT_CACHE_DIR = ".bench-cache";
const DEFAULT_OUT = "bench/competitors.json";
const RESULTS_PATH = "bench/results.json";
const CASES_PATH = "test/fixtures/triage-realrepo/cases.json";

async function readResultsSnapshot(path: string): Promise<BenchResults | undefined> {
  try {
    return parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

export interface CompetitorBenchArgs {
  cacheDir: string;
  out: string;
  dryRun: boolean;
}

/** Parse `--cache-dir <path> --out <path> --dry-run`. Pure — no I/O. */
export function parseArgs(argv: string[]): CompetitorBenchArgs {
  const args: CompetitorBenchArgs = { cacheDir: DEFAULT_CACHE_DIR, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cache-dir") {
      const v = argv[++i];
      if (!v) throw new Error("--cache-dir needs a path");
      args.cacheDir = v;
    } else if (a === "--out") {
      const v = argv[++i];
      if (!v) throw new Error("--out needs a path");
      args.out = v;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else {
      throw new Error(`unknown competitor-bench argument: ${a}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadEvalCases(CASES_PATH);
  const result = await runCompetitorBench(cases, { cacheDir: args.cacheDir, now: new Date().toISOString() });

  for (const skipped of result.skippedRepos) {
    process.stderr.write(`skipped ${skipped.repo}@${skipped.sha.slice(0, 7)} (${skipped.cases} cases): ${skipped.reason}\n`);
  }
  for (const tool of result.tools) {
    process.stdout.write(
      `${tool.tool} ${tool.version}: precision=${tool.metrics.precision.toFixed(2)} recall=${tool.metrics.recall.toFixed(2)} f1=${tool.metrics.f1.toFixed(2)} (n=${tool.metrics.total})\n`,
    );
  }

  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (args.dryRun) {
    process.stdout.write(text);
    return;
  }
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, text);
  process.stdout.write(`competitor-bench: wrote ${args.out}\n`);

  const existing = await readResultsSnapshot(RESULTS_PATH);
  if (!existing) {
    process.stdout.write(`competitor-bench: no ${RESULTS_PATH} found — run \`npm run bench\` first to merge into it\n`);
    return;
  }
  await writeFile(RESULTS_PATH, serialize(withCompetitors(existing, result)));
  process.stdout.write(`competitor-bench: merged into ${RESULTS_PATH}\n`);
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
