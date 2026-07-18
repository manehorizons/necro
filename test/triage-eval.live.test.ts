import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { createTriageClient } from "../src/triage/client.js";
import { formatBreakdown, loadEvalCases, meetsThreshold, runEval } from "../src/triage/eval.js";

/**
 * LIVE accuracy gate — calls the real Anthropic API. Skipped automatically when
 * ANTHROPIC_API_KEY is absent, so CI never makes a network call. Run it
 * deliberately against the live model with:
 *
 *   set -a; . ./.env; set +a; npx vitest run test/triage-eval.live.test.ts
 */
const here = dirname(fileURLToPath(import.meta.url));
const synthetic = join(here, "fixtures/triage/cases.json");
const realRepo = join(here, "fixtures/triage-realrepo/cases.json");

describe("live triage eval — synthetic smoke set (AC-3, AC-4)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "no regression: real model still clears the synthetic ≥0.8 gate (AC-3, AC-4)",
    async () => {
      const cases = await loadEvalCases(synthetic);
      const client = createTriageClient(DEFAULT_LLM);
      const m = await runEval(cases, client, { concurrency: 3 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(`live synthetic eval — precision ${m.precision.toFixed(2)}, recall ${m.recall.toFixed(2)}`);
      expect(meetsThreshold(m, 0.8)).toBe(true);
    },
    120_000,
  );
});

/**
 * The real accuracy gate: real-repo `maybe` findings with authentic evidence and
 * hand-verified truth (see fixtures/triage-realrepo/SOURCES.md). Phase 13 grew the
 * corpus to **48 cases across 2 repos** (honojs/hono 19 + trpc/trpc 29; 33 alive /
 * 15 dead) so a single symbol's coin-flip can no longer swing precision ~0.33.
 * Phase 49 grew the dead class further to **63 cases, still 2 repos** (honojs/hono
 * 19 + trpc/trpc 44; 33 alive / 30 dead, mined via `testOnlyEvidence` — see
 * `SOURCES.md`'s "Attempted 3rd repos" section for why a 3rd repo didn't land).
 *
 * PRE-TUNING BASELINE (phase 11, hono-only, claude-opus-4-8): precision 0.50–0.75 —
 * the model trusted misleading "0 static references" evidence and flagged live
 * production code dead (RequiredRequestInit, detectResponseType — the trust-killer).
 *
 * POST-EXPANSION (phase 13, location-weighted SYSTEM_PROMPT, 48 cases, 3 live runs):
 *   precision 1.00 / 1.00 / 1.00   ·   recall 0.47 / 0.47 / 0.53
 * Zero alive→likely-dead FPs across all 33 alive cases — including the 19 trpc
 * trust-killers from a second codebase, confirming the tuning generalizes.
 *
 * POST-CORPUS-GROWTH (phase 51, same prompt, 63 cases / 30 dead, 3 live runs via
 * the host-cli backend, `bench/results.json` methodologyVersion 2):
 *   precision 1.00 / 1.00 / 1.00   ·   recall 0.80 / 0.80 / 0.80   (24 TP, 0 FP, 6 FN)
 * Zero variance across all 3 runs and still zero alive→likely-dead FPs on the
 * doubled dead class — recall's real floor moved meaningfully with more data.
 *
 * The gates below are REGRESSION FLOORS set under the observed run-to-run minima
 * (not pass-cherry-picked): they catch a collapse without flaking on the model's
 * non-determinism. PRECISION stays at **0.85** — still the aspirational target
 * with margin for one borderline FP; the phase-49 data confirms 1.00 again but
 * doesn't justify tightening the trust-critical metric's buffer. RECALL is
 * raised from 0.40 to **0.70** — comfortably under the new 0.80 minimum (a
 * margin similar in proportion to phase 13's), reflecting the real recall gain
 * from doubling the dead class while still tolerating some of the "definitionally
 * debatable" test-local-helper labels.
 */
const PRECISION_GATE = 0.85;
const RECALL_GATE = 0.7;

/** The two production-source symbols the tuning targeted: genuinely alive, but
 * called `likely-dead` pre-tuning on misleading "0 static references" evidence. */
const TUNED_FALSE_POSITIVES = ["RequiredRequestInit", "detectResponseType"];

describe("live triage eval — real-repo accuracy gate (AC-2, AC-3)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "clears the precision floor (≥0.85) and the re-derived recall floor (≥0.70) on the expanded 63-case corpus, and keeps the two FPs alive (AC-2, AC-3)",
    async () => {
      const cases = await loadEvalCases(realRepo);
      const client = createTriageClient(DEFAULT_LLM);
      const m = await runEval(cases, client, { concurrency: 4 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(`live real-repo eval\n${formatBreakdown(m)}`);
      // AC-2: precision clears the floor (0.85). AC-3: recall re-derived to 0.70 on the phase-49 63-case corpus.
      expect(m.precision).toBeGreaterThanOrEqual(PRECISION_GATE);
      expect(m.recall).toBeGreaterThanOrEqual(RECALL_GATE);
      // the two persistent production-source false positives are no longer dead.
      const verdictByName = new Map(m.rows.map((r) => [r.name, r.verdict]));
      for (const name of TUNED_FALSE_POSITIVES) {
        expect(verdictByName.get(name), `${name} should not be likely-dead`).not.toBe("likely-dead");
      }
    },
    180_000,
  );
});
