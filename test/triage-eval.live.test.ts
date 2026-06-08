import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { createTriageClient } from "../src/triage/client.js";
import { loadEvalCases, meetsThreshold, runEval } from "../src/triage/eval.js";

/**
 * LIVE accuracy gate — calls the real Anthropic API. Skipped automatically when
 * ANTHROPIC_API_KEY is absent, so CI never makes a network call. Run it
 * deliberately against the live model with:
 *
 *   ANTHROPIC_API_KEY=sk-... npx vitest run test/triage-eval.live.test.ts
 */
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures/triage/cases.json");
const THRESHOLD = 0.8;

describe("live triage eval (AC-7)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "real model clears the precision/recall gate on the reference set (AC-7)",
    async () => {
      const cases = await loadEvalCases(fixtures);
      const client = createTriageClient(DEFAULT_LLM);
      const m = await runEval(cases, client, { concurrency: 3 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(`live eval — precision ${m.precision.toFixed(2)}, recall ${m.recall.toFixed(2)}`, m.rows);
      expect(meetsThreshold(m, THRESHOLD)).toBe(true);
    },
    120_000,
  );
});
