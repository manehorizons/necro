import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { TriageClient } from "../src/triage/client.js";
import { loadEvalCases, meetsThreshold, runEval, type GroundTruth } from "../src/triage/eval.js";
import type { TriageVerdict } from "../src/triage/prompt.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures/triage/cases.json");

/** A mock client whose verdict is chosen per symbol name — a stand-in for the
 * model, so the harness is exercised deterministically with no network. */
function oracleClient(decide: (name: string) => TriageVerdict): TriageClient {
  return {
    async classify(prompt) {
      const name = prompt.user.match(/Symbol: (\w+)/)?.[1] ?? "?";
      return { verdict: decide(name), reasoning: "mock" };
    },
  };
}

const truthVerdict: Record<GroundTruth, TriageVerdict> = {
  dead: "likely-dead",
  alive: "likely-alive",
};

describe("runEval (AC-7)", () => {
  test("the reference set loads and is non-trivial (AC-7)", async () => {
    const cases = await loadEvalCases(fixtures);
    expect(cases.length).toBeGreaterThanOrEqual(4);
    expect(cases.some((c) => c.truth === "dead")).toBe(true);
    expect(cases.some((c) => c.truth === "alive")).toBe(true);
  });

  test("a perfect oracle scores precision/recall 1 and passes the gate (AC-7)", async () => {
    const cases = await loadEvalCases(fixtures);
    const byName = new Map(cases.map((c) => [c.name, c.truth]));
    const client = oracleClient((name) => truthVerdict[byName.get(name) ?? "alive"]);

    const m = await runEval(cases, client);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(meetsThreshold(m, 0.9)).toBe(true);
  });

  test("a model that always says likely-dead tanks precision and fails the gate (AC-7)", async () => {
    const cases = await loadEvalCases(fixtures);
    const client = oracleClient(() => "likely-dead");

    const m = await runEval(cases, client);
    expect(m.falsePositives).toBeGreaterThan(0); // alive cases called dead
    expect(m.precision).toBeLessThan(1);
    expect(meetsThreshold(m, 0.9)).toBe(false);
  });

  test("a model that never says likely-dead tanks recall and fails the gate (AC-7)", async () => {
    const cases = await loadEvalCases(fixtures);
    const client = oracleClient(() => "unsure");

    const m = await runEval(cases, client);
    expect(m.recall).toBe(0); // every real dead missed
    expect(meetsThreshold(m, 0.9)).toBe(false);
  });
});
