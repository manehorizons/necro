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

describe("live triage eval — synthetic smoke set (AC-4)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "real model clears the precision/recall gate on the synthetic set (AC-4)",
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
 * The real accuracy gate: hono-derived `maybe` findings with authentic evidence
 * and hand-verified truth (see fixtures/triage-realrepo/SOURCES.md).
 *
 * PRE-TUNING BASELINE (claude-opus-4-8): precision 0.50–0.75, recall 0.40–0.60 —
 * the model trusted misleading "0 static references" evidence and flagged live
 * production code dead (RequiredRequestInit, detectResponseType — the trust-killer).
 *
 * POST-TUNING (phase 12, location-weighted SYSTEM_PROMPT, 3 live runs):
 * precision 1.00/1.00/1.00, recall 0.40/0.60/0.40 — zero alive→likely-dead FPs.
 *
 * The gates below are REGRESSION FLOORS set under the observed post-tuning minima
 * (not pass-cherry-picked): they catch a collapse without flaking on the model's
 * run-to-run variance. PRECISION is the headline — the alive class (14) is solid
 * and precision is the trust-critical metric; the floor is raised to 0.70 (the
 * tuned baseline; aspirational ≥ 0.85). RECALL is floored loosely because the
 * dead class (5) is small and its "production-dead" labels are definitionally
 * debatable (test-local helpers).
 */
const PRECISION_GATE = 0.7;
const RECALL_GATE = 0.3;

/** The two production-source symbols the tuning targeted: genuinely alive, but
 * called `likely-dead` pre-tuning on misleading "0 static references" evidence. */
const TUNED_FALSE_POSITIVES = ["RequiredRequestInit", "detectResponseType"];

describe("live triage eval — real-repo accuracy gate (AC-2, AC-3)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "tuned prompt clears the raised precision floor and no longer calls the two FPs dead (AC-2, AC-3)",
    async () => {
      const cases = await loadEvalCases(realRepo);
      const client = createTriageClient(DEFAULT_LLM);
      const m = await runEval(cases, client, { concurrency: 4 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(`live real-repo eval\n${formatBreakdown(m)}`);
      // AC-3: precision clears the raised floor (tuned baseline ≥ 0.70).
      expect(m.precision).toBeGreaterThanOrEqual(PRECISION_GATE);
      expect(m.recall).toBeGreaterThanOrEqual(RECALL_GATE);
      // AC-2: the two persistent production-source false positives are no longer dead.
      const verdictByName = new Map(m.rows.map((r) => [r.name, r.verdict]));
      for (const name of TUNED_FALSE_POSITIVES) {
        expect(verdictByName.get(name), `${name} should not be likely-dead`).not.toBe("likely-dead");
      }
    },
    180_000,
  );
});
