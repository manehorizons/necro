import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LLM } from "../config.js";
import { createRefactorClient } from "../refactor/client.js";
import { createTriageClient } from "../triage/client.js";
import { VERSION } from "../version.js";
import { runBench } from "./run.js";
import { serialize } from "./snapshot.js";

/**
 * Repo-internal benchmark runner (`npm run bench`). NOT part of the published
 * `necro` CLI: the corpus lives in `test/fixtures/` and ships in no npm tarball,
 * so this only runs from a source checkout. Calls the real model (needs
 * `ANTHROPIC_API_KEY`) and writes a provenance-stamped snapshot the Accuracy docs
 * page renders from.
 */

export interface BenchArgs {
  corpus: "triage" | "dup" | "all";
  out: string;
  dryRun: boolean;
}

const CORPORA = new Set(["triage", "dup", "all"]);

/** Parse `--corpus <id> --out <path> --dry-run`. Pure — no I/O. */
export function parseArgs(argv: string[]): BenchArgs {
  const args: BenchArgs = { corpus: "all", out: "bench/results.json", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--corpus") {
      const v = argv[++i];
      if (!v || !CORPORA.has(v)) {
        throw new Error(`--corpus must be one of triage | dup | all (got ${v ?? "nothing"})`);
      }
      args.corpus = v as BenchArgs["corpus"];
    } else if (a === "--out") {
      const v = argv[++i];
      if (!v) throw new Error("--out needs a path");
      args.out = v;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else {
      throw new Error(`unknown bench argument: ${a}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Throws MissingApiKeyError up front (before any network call) if no key.
  const triageClient = createTriageClient(DEFAULT_LLM);
  const refactorClient = createRefactorClient(DEFAULT_LLM);

  const results = await runBench(
    { triageClient, refactorClient },
    {
      corpus: args.corpus,
      now: new Date().toISOString(),
      model: DEFAULT_LLM.model,
      necroVersion: VERSION,
    },
  );

  const text = serialize(results);
  if (args.dryRun) {
    process.stdout.write(text);
    return;
  }
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, text);
  process.stdout.write(`bench: wrote ${args.out} (${args.corpus})\n`);
}

// Only run when invoked directly (`tsx src/bench/cli-bench.ts`), never on import.
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
