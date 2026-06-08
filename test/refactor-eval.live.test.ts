import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { createRefactorClient } from "../src/refactor/client.js";
import { loadEvalCases, meetsThreshold, runRefactorEval } from "../src/refactor/eval.js";

/**
 * LIVE structural gate — calls the real Anthropic API. Skipped automatically
 * when ANTHROPIC_API_KEY is absent, so CI never makes a network call. Run it
 * deliberately against the live model with:
 *
 *   ANTHROPIC_API_KEY=sk-... npx vitest run test/refactor-eval.live.test.ts
 */
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures/refactor/cases.json");
const THRESHOLD = 0.8;

describe("live refactor eval (AC-7)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "real model's splits clear the structural pass-rate gate on the reference set (AC-7)",
    async () => {
      const cases = await loadEvalCases(fixtures);
      const client = createRefactorClient(DEFAULT_LLM);
      const m = await runRefactorEval(cases, client, { concurrency: 3 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(`live refactor eval — passRate ${m.passRate.toFixed(2)}`, m.rows);
      expect(meetsThreshold(m, THRESHOLD)).toBe(true);
    },
    180_000,
  );
});
