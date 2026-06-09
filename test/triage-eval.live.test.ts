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
 * MEASURED BASELINE (claude-opus-4-8, two live runs): precision 0.50–0.75,
 * recall 0.40–0.60 — a mediocre, variable baseline that the synthetic eval
 * (near-perfect) completely masked. This is the milestone's payoff: on real
 * findings the model trusts misleading "0 static references" evidence and flags
 * live code dead (e.g. RequiredRequestInit, detectResponseType — the
 * trust-killer). Raising accuracy is a separate TUNING phase (out of scope here
 * per the phase boundary: this phase measures triage, it does not tune it).
 *
 * The gate below is a REGRESSION FLOOR set under the observed minima (not a
 * pass-cherry-picked target): it catches a collapse without flaking on the
 * model's run-to-run variance. PRECISION is the headline — the alive class (14)
 * is solid and precision is the trust-critical metric; RECALL is floored loosely
 * because the dead class (5) is small and its "production-dead" labels are
 * definitionally debatable (test-local helpers). The aspirational target is
 * precision ≥ 0.85.
 */
const PRECISION_GATE = 0.4;
const RECALL_GATE = 0.3;

describe("live triage eval — real-repo accuracy gate (AC-4)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "real model clears the precision/recall gate on the real-repo corpus (AC-4)",
    async () => {
      const cases = await loadEvalCases(realRepo);
      const client = createTriageClient(DEFAULT_LLM);
      const m = await runEval(cases, client, { concurrency: 4 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(`live real-repo eval\n${formatBreakdown(m)}`);
      expect(m.precision).toBeGreaterThanOrEqual(PRECISION_GATE);
      expect(m.recall).toBeGreaterThanOrEqual(RECALL_GATE);
    },
    180_000,
  );
});
