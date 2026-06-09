import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { TriageClient } from "../src/triage/client.js";
import {
  type EvalCase,
  formatBreakdown,
  loadEvalCases,
  meetsThreshold,
  runEval,
  type GroundTruth,
} from "../src/triage/eval.js";
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

describe("EvalCase carries optional provenance + rationale (AC-2)", () => {
  test("a real-repo case (provenance + rationale) scores identically to a bare case (AC-2)", async () => {
    const bare = { name: "bareDead", truth: "dead" as const, code: "function bareDead() {}", evidence: [] };
    const enriched: EvalCase = {
      name: "richDead",
      truth: "dead",
      code: "function richDead() {}",
      evidence: [{ ok: true, text: "0 static references" }],
      provenance: { repo: "acme/widgets", sha: "abc1234", file: "src/x.ts", line: 9, symbol: "richDead" },
      rationale: "no references anywhere in the repo; not a public export",
    };
    const cases: EvalCase[] = [bare, enriched];
    const byName = new Map(cases.map((c) => [c.name, c.truth]));
    const client = oracleClient((name) => truthVerdict[byName.get(name) ?? "alive"]);

    const m = await runEval(cases, client);
    // the enriched case participates in scoring exactly like the bare one
    expect(m.total).toBe(2);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
  });
});

describe("diagnostic breakdown (AC-5)", () => {
  const corpus = (): EvalCase[] => [
    {
      name: "actuallyDead",
      truth: "dead",
      code: "function actuallyDead() {}",
      evidence: [{ ok: true, text: "0 static references" }],
      provenance: { repo: "acme/widgets", sha: "abc1234", file: "src/a.ts", line: 5, symbol: "actuallyDead" },
      rationale: "no references in repo",
    },
    {
      name: "actuallyAlive",
      truth: "alive",
      code: "function actuallyAlive() {}",
      evidence: [{ ok: false, text: "referenced by src/main.ts" }],
      provenance: { repo: "acme/widgets", sha: "abc1234", file: "src/b.ts", line: 9, symbol: "actuallyAlive" },
      rationale: "called from main",
    },
  ];

  test("surfaces exactly the misclassified cases with provenance + evidence (AC-5)", async () => {
    // model wrongly calls the alive symbol dead → one false positive
    const client = oracleClient((name) => (name === "actuallyAlive" ? "likely-dead" : "likely-dead"));
    const m = await runEval(corpus(), client);

    expect(m.breakdown.byTruth).toEqual({ dead: 1, alive: 1 });
    expect(m.breakdown.misclassified).toHaveLength(1);
    const missed = m.breakdown.misclassified[0]!;
    expect(missed.name).toBe("actuallyAlive");
    expect(missed.provenance?.file).toBe("src/b.ts");
    expect(missed.evidence[0]?.text).toContain("referenced by src/main.ts");
    expect(m.rows.find((r) => r.name === "actuallyDead")?.misclassified).toBe(false);
  });

  test("a perfect oracle yields an empty misclassified list (AC-5)", async () => {
    const byName = new Map(corpus().map((c) => [c.name, c.truth]));
    const client = oracleClient((name) => truthVerdict[byName.get(name) ?? "alive"]);
    const m = await runEval(corpus(), client);
    expect(m.breakdown.misclassified).toHaveLength(0);
    expect(formatBreakdown(m)).toMatch(/no misclassifications/);
  });

  test("formatBreakdown renders each miss with where + evidence (AC-5)", async () => {
    const client = oracleClient(() => "likely-dead");
    const m = await runEval(corpus(), client);
    const out = formatBreakdown(m);
    expect(out).toContain("actuallyAlive");
    expect(out).toContain("acme/widgets@abc1234 src/b.ts:9");
    expect(out).toContain("referenced by src/main.ts");
  });
});
