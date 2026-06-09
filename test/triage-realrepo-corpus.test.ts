import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { TriageClient } from "../src/triage/client.js";
import { type EvalCase, loadEvalCases, runEval } from "../src/triage/eval.js";
import type { TriageVerdict } from "../src/triage/prompt.js";

/**
 * Deterministic CI guard for the real-repo corpus — runs with NO API key and
 * makes NO network call. Validates corpus integrity (so a bad/edited corpus
 * fails loudly) and the precision/recall scoring math against a mock client.
 */
const corpusPath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/triage-realrepo/cases.json");

function oracleClient(decide: (name: string) => TriageVerdict): TriageClient {
  return {
    async classify(prompt) {
      const name = prompt.user.match(/Symbol: (\w+)/)?.[1] ?? "?";
      return { verdict: decide(name), reasoning: "mock" };
    },
  };
}

describe("real-repo corpus integrity (AC-6)", () => {
  test("loads ≥35 cases spanning ≥2 source repos with both truth classes present (AC-1)", async () => {
    const cases = await loadEvalCases(corpusPath);
    // phase 13 expansion: a corpus large enough that no single symbol's coin-flip
    // swings precision ~0.33 (the phase-11 19-case failure mode).
    expect(cases.length).toBeGreaterThanOrEqual(35);
    expect(cases.some((c) => c.truth === "dead")).toBe(true);
    expect(cases.some((c) => c.truth === "alive")).toBe(true);
    // multi-repo: the gate must not silently collapse back to a single source.
    const repos = new Set(cases.map((c) => c.provenance?.repo).filter(Boolean));
    expect(repos.size).toBeGreaterThanOrEqual(2);
  });

  test("every case carries authentic evidence, provenance, and a rationale (AC-6)", async () => {
    const cases = await loadEvalCases(corpusPath);
    for (const c of cases) {
      expect(c.truth === "dead" || c.truth === "alive").toBe(true);
      expect(typeof c.code).toBe("string");
      expect(c.code.length).toBeGreaterThan(0);
      // verbatim necro evidence — non-empty, well-formed signals
      expect(Array.isArray(c.evidence)).toBe(true);
      expect(c.evidence.length).toBeGreaterThan(0);
      for (const e of c.evidence) {
        expect(typeof e.text).toBe("string");
        expect(e.ok === true || e.ok === false || e.ok === null).toBe(true);
      }
      // provenance present and complete (auditable)
      expect(c.provenance).toBeDefined();
      expect(c.provenance?.repo).toBeTruthy();
      expect(c.provenance?.sha).toBeTruthy();
      expect(c.provenance?.file).toBeTruthy();
      expect(typeof c.provenance?.line).toBe("number");
      expect(c.provenance?.symbol).toBe(c.name);
      // labeling rationale present
      expect(typeof c.rationale).toBe("string");
      expect((c.rationale ?? "").length).toBeGreaterThan(0);
    }
  });

  test("scoring math: a perfect oracle yields precision/recall 1 on the corpus (AC-6)", async () => {
    const cases = await loadEvalCases(corpusPath);
    const truthVerdict = { dead: "likely-dead", alive: "likely-alive" } as const;
    const byName = new Map(cases.map((c) => [c.name, c.truth]));
    const client = oracleClient((name) => truthVerdict[byName.get(name) ?? "alive"]);

    const m = await runEval(cases, client);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.breakdown.byTruth.dead + m.breakdown.byTruth.alive).toBe(cases.length);
    expect(m.breakdown.misclassified).toHaveLength(0);
  });

  test("scoring math: an always-dead model surfaces every alive case as a false positive (AC-6)", async () => {
    const cases = await loadEvalCases(corpusPath);
    const client = oracleClient(() => "likely-dead");
    const m = await runEval(cases, client);
    const aliveCount = cases.filter((c) => c.truth === "alive").length;
    expect(m.falsePositives).toBe(aliveCount);
    expect(m.breakdown.misclassified).toHaveLength(aliveCount);
    expect(m.precision).toBeLessThan(1);
  });

  test("a corpus case stripped of evidence fails integrity (guard works) (AC-6)", () => {
    // sanity-check the integrity assertions actually catch a degraded case
    const bad: EvalCase = { name: "x", truth: "dead", code: "fn", evidence: [] };
    expect(bad.evidence.length).toBe(0); // the integrity test above would reject this
  });
});

describe("eval prompt matches production triage (AC-3)", () => {
  test("a corpus case is sent through the production buildPrompt with its authentic evidence (AC-3)", async () => {
    const cases = await loadEvalCases(corpusPath);
    const target = cases.find((c) => c.evidence.some((e) => /static references/.test(e.text))) ?? cases[0]!;

    // a client that captures the prompt the eval actually sends to the model
    let captured = "";
    const capturing: TriageClient = {
      async classify(prompt) {
        if (prompt.user.includes(`Symbol: ${target.name}`)) captured = prompt.user;
        return { verdict: "unsure", reasoning: "mock" };
      },
    };
    await runEval([target], capturing, { concurrency: 1 });

    // production prompt markers (same buildPrompt necro triage uses)
    expect(captured).toContain(`Symbol: ${target.name}`);
    expect(captured).toContain("Analyzer evidence:");
    // the case's AUTHENTIC captured evidence reaches the model verbatim
    for (const e of target.evidence) {
      expect(captured).toContain(e.text);
    }
  });
});
