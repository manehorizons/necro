import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RefactorClient } from "../refactor/client.js";
import {
  loadDuplicateEvalCases,
  runDuplicateEval,
  type DuplicateEvalCase,
} from "../refactor/eval.js";
import type { TriageClient } from "../triage/client.js";
import { loadEvalCases, runEval, type EvalCase } from "../triage/eval.js";
import {
  deriveSources,
  summarizeDup,
  summarizeTriage,
  type BenchCorpusResult,
  type BenchResults,
} from "./snapshot.js";

const here = dirname(fileURLToPath(import.meta.url));
/** The two published corpora live in the repo's test fixtures (not in the npm tarball). */
const TRIAGE_CORPUS = join(here, "../../test/fixtures/triage-realrepo/cases.json");
const DUP_CORPUS = join(here, "../../test/fixtures/refactor-dup-realrepo/cases.json");

/** Model-backed capabilities the benchmark needs — injected so tests use stubs. */
export interface BenchClients {
  triageClient: TriageClient;
  refactorClient: RefactorClient;
}

export interface RunBenchOptions {
  corpus: "triage" | "dup" | "all";
  /** ISO timestamp stamped into the snapshot (injected — keeps this module clock-free). */
  now: string;
  /** Model id the run is measured against. */
  model: string;
  /** necro version the run is measured against. */
  necroVersion: string;
  concurrency?: number;
  /** Override corpus loaders (defaults read the in-repo fixtures). */
  loadTriageCases?: () => Promise<EvalCase[]>;
  loadDupCases?: () => Promise<DuplicateEvalCase[]>;
}

/**
 * Run the selected corpora through the existing eval harnesses once and assemble a
 * provenance-stamped {@link BenchResults}. No scoring lives here — `runEval` /
 * `runDuplicateEval` do that; this only orchestrates, derives sources, and stamps
 * provenance. The model clients and the clock are injected, so it is fully
 * deterministic under test with no network.
 */
export async function runBench(clients: BenchClients, opts: RunBenchOptions): Promise<BenchResults> {
  const corpora: BenchCorpusResult[] = [];

  if (opts.corpus === "triage" || opts.corpus === "all") {
    const cases = await (opts.loadTriageCases?.() ?? loadEvalCases(TRIAGE_CORPUS));
    const metrics = await runEval(cases, clients.triageClient, { concurrency: opts.concurrency });
    corpora.push(summarizeTriage(metrics, deriveSources(cases)));
  }

  if (opts.corpus === "dup" || opts.corpus === "all") {
    const cases = await (opts.loadDupCases?.() ?? loadDuplicateEvalCases(DUP_CORPUS));
    const metrics = await runDuplicateEval(cases, clients.refactorClient, {
      concurrency: opts.concurrency,
    });
    corpora.push(summarizeDup(metrics, deriveSources(cases)));
  }

  return {
    schemaVersion: 1,
    methodologyVersion: 1,
    generatedAt: opts.now,
    necroVersion: opts.necroVersion,
    model: opts.model,
    corpora,
  };
}
