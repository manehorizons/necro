import type { ClassifiedFinding } from "../analyze/classify.js";
import type { LlmOptions } from "../config.js";
import type { TriageClient } from "./client.js";
import { buildPrompt, type TriageVerdict } from "./prompt.js";
import { snippetForFinding } from "./snippet.js";

/** One `maybe` finding plus its advisory verdict. The original `finding` is
 * carried unchanged — its `tier`/`autoFixEligible` are never mutated. */
export interface TriagedFinding {
  finding: ClassifiedFinding;
  verdict: TriageVerdict;
  reasoning: string;
  /** The model that produced the verdict (for the report/JSON). */
  model: string;
}

export interface TriageRunResult {
  triaged: TriagedFinding[];
  /** How many `maybe` findings the scan produced. */
  consideredMaybe: number;
  /** How many were skipped by the `maxFindings` cap. */
  dropped: number;
}

export interface TriageRunOptions {
  /** Max concurrent in-flight requests. */
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 4;

/**
 * Triage the `maybe`-tier findings only: re-read each one's source snippet,
 * ask the (injected) client for an advisory verdict, and return the results.
 * Findings of any other tier are never sent, and the verdict is advisory —
 * nothing here mutates `tier` or `autoFixEligible`.
 */
export async function runTriage(
  findings: ClassifiedFinding[],
  llm: LlmOptions,
  client: TriageClient,
  opts: TriageRunOptions = {},
): Promise<TriageRunResult> {
  const maybe = findings.filter((f) => f.tier === "maybe");
  const cap = llm.maxFindings;
  const selected = cap !== undefined && cap >= 0 ? maybe.slice(0, cap) : maybe;
  const dropped = maybe.length - selected.length;
  if (dropped > 0) {
    console.warn(`necro triage: ${maybe.length} maybe findings, triaging ${selected.length} (llm.maxFindings=${cap}).`);
  }

  if (selected.length === 0) {
    return { triaged: [], consideredMaybe: maybe.length, dropped };
  }

  const triaged = await mapPool(
    selected,
    opts.concurrency ?? DEFAULT_CONCURRENCY,
    async (finding): Promise<TriagedFinding> => {
      const snippet = await snippetForFinding(finding, llm.snippetRadius);
      const result = await client.classify(buildPrompt(finding, snippet));
      return { finding, verdict: result.verdict, reasoning: result.reasoning, model: llm.model };
    },
  );

  return { triaged, consideredMaybe: maybe.length, dropped };
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx] as T);
    }
  });
  await Promise.all(workers);
  return results;
}
