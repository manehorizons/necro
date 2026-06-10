import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import { createRefactorClient } from "../src/refactor/client.js";
import {
  loadDuplicateEvalCases,
  loadEvalCases,
  meetsThreshold,
  runDuplicateEval,
  runRefactorEval,
} from "../src/refactor/eval.js";

/**
 * LIVE structural gate — calls the real Anthropic API. Skipped automatically
 * when ANTHROPIC_API_KEY is absent, so CI never makes a network call. Run it
 * deliberately against the live model with:
 *
 *   ANTHROPIC_API_KEY=sk-... npx vitest run test/refactor-eval.live.test.ts
 */
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures/refactor/cases.json");
const dupFixtures = join(here, "fixtures/refactor-duplicate/cases.json");
const realRepo = join(here, "fixtures/refactor-realrepo/cases.json");
const dupRealRepo = join(here, "fixtures/refactor-dup-realrepo/cases.json");
const THRESHOLD = 0.8;

/**
 * The REAL accuracy gate: 14 authentically-sized god functions captured verbatim
 * from real repos (honojs/hono + trpc/trpc — see fixtures/refactor-realrepo/SOURCES.md),
 * scored structurally by the same `evaluateProposal` (split into ≥2 / preserve the
 * public signature / every unit under the LOC threshold). Real god functions are
 * materially harder to split correctly than the synthetic reference set (≈1.0), so
 * this floor sits below the synthetic 0.8.
 *
 * CALIBRATION (phase 14, claude-opus-4-8, 3 deliberate live runs):
 *   passRate 0.86 / 0.64 / 0.57   (mean ~0.69, observed minimum 0.57)
 * The split quality is genuinely variable on real god functions: `httpBatchLink`
 * failed all 3 runs and the streaming/batching functions (`sseStreamProducer`,
 * `dataLoader`, `jsonlStreamConsumer`, `mergeAsyncIterables`) fail intermittently —
 * hard to break up while preserving the signature AND bringing every unit under 50
 * LOC. That weakness is exactly what this gate exists to surface; a future tuning
 * phase (mirroring triage phase 12) could lift it.
 *
 * REALREPO_PASS_RATE_GATE is a REGRESSION FLOOR set BELOW the observed run-to-run
 * minimum (0.57) with margin for the model's non-determinism — a collapse-detector,
 * not a target cherry-picked to pass. The per-run numbers are recorded in
 * fixtures/refactor-realrepo/SOURCES.md.
 */
const REALREPO_PASS_RATE_GATE = 0.5;

/**
 * The REAL extract-duplicate accuracy gate: 12 authentically-sized clone groups
 * captured verbatim from real repos (trpc/trpc + drizzle-team/drizzle-orm — see
 * fixtures/refactor-dup-realrepo/SOURCES.md), scored structurally by the same
 * `evaluateDuplicateProposal` (one shared exported function / one edit per clone
 * location collapsing the duplication below `minTokens` / every call surface
 * preserved). Real clone groups are materially harder to collapse correctly than
 * the synthetic reference set (≈1.0), so this floor sits below the synthetic 0.8.
 *
 * CALIBRATION — PENDING RE-MEASURE (phase 16, T4). The phase-15a numbers
 * (passRate 0.67 / 0.75 / 0.67, old min 0.67) were measured under the OLD all-or-nothing
 * whole-file collapse scorer and the OLD corpus. Phase 16 reworked collapse to the
 * edited-site metric and refined the corpus (dropped the class-structural `count-L24` /
 * `query-builder-L90`, added `dialect-L948` / `session-L69`), so those numbers no longer
 * describe this gate. The floor is held conservatively at 0.5 until T4 re-runs the live
 * eval >=3x and re-sets it below the fresh observed minimum (expected to rise materially
 * now that genuine extractions are credited). See fixtures/refactor-dup-realrepo/SOURCES.md.
 *
 * DUP_REALREPO_PASS_RATE_GATE is a REGRESSION FLOOR (a collapse-detector, not a target
 * cherry-picked to pass), set below the observed run-to-run minimum with margin for the
 * model's non-determinism.
 */
const DUP_REALREPO_PASS_RATE_GATE = 0.5;

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

describe("live extract-duplicate eval (AC-7)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "real model's extractions clear the structural pass-rate gate on the reference set (AC-7)",
    async () => {
      const cases = await loadDuplicateEvalCases(dupFixtures);
      const client = createRefactorClient(DEFAULT_LLM);
      const m = await runDuplicateEval(cases, client, { concurrency: 3 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(`live extract-duplicate eval — passRate ${m.passRate.toFixed(2)}`, m.rows);
      expect(meetsThreshold(m, THRESHOLD)).toBe(true);
    },
    180_000,
  );
});

describe("live refactor eval — real-repo accuracy gate (AC-3)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "real model's splits clear the calibrated real-repo floor on the 14-case corpus (AC-3)",
    async () => {
      const cases = await loadEvalCases(realRepo);
      const client = createRefactorClient(DEFAULT_LLM);
      const m = await runRefactorEval(cases, client, { concurrency: 4 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(
        `live real-repo refactor eval — passRate ${m.passRate.toFixed(2)} (${m.rows.filter((r) => r.pass).length}/${m.rows.length})\n` +
          m.rows.map((r) => `  ${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.failure ? ` — ${r.failure}` : ""}`).join("\n"),
      );
      expect(meetsThreshold(m, REALREPO_PASS_RATE_GATE)).toBe(true);
    },
    240_000,
  );
});

describe("live extract-duplicate eval — real-repo accuracy gate (AC-3)", () => {
  test.runIf(process.env.ANTHROPIC_API_KEY)(
    "real model's extractions clear the calibrated real-repo floor on the 12-case corpus (AC-3)",
    async () => {
      const cases = await loadDuplicateEvalCases(dupRealRepo);
      const client = createRefactorClient(DEFAULT_LLM);
      const m = await runDuplicateEval(cases, client, { concurrency: 4 });
      // biome-ignore lint/suspicious/noConsole: eval output is the point of the live run
      console.log(
        `live real-repo extract-duplicate eval — passRate ${m.passRate.toFixed(2)} (${m.rows.filter((r) => r.pass).length}/${m.rows.length})\n` +
          m.rows.map((r) => `  ${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.failure ? ` — ${r.failure}` : ""}`).join("\n"),
      );
      expect(meetsThreshold(m, DUP_REALREPO_PASS_RATE_GATE)).toBe(true);
    },
    240_000,
  );
});
