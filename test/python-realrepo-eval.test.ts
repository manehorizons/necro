import { describe, expect, test } from "vitest";
import type { ClassifiedFinding, Tier, Verdict } from "../src/analyze/classify.js";
import { isPredictedDead, meetsFloors, type RealrepoCase, type RealrepoPair, scoreRealrepoCases } from "../src/python/realrepo-eval.js";

function makeCase(name: string, truth: "dead" | "alive"): RealrepoCase {
  return {
    name,
    truth,
    provenance: { repo: "pypa/pip", sha: "deadbeef", file: `pkg/${name}.py`, line: 1, symbol: name },
    rationale: `test case for ${name}`,
  };
}

function makeFinding(name: string, verdict: Verdict, tier: Tier): ClassifiedFinding {
  return {
    node: { id: `pkg/${name}.py:1:${name}`, name, file: `pkg/${name}.py`, line: 1, exported: false },
    verdict,
    tier,
    autoFixEligible: tier === "certain",
    evidence: [{ ok: true, text: "0 static references" }],
  };
}

describe("isPredictedDead (AC-4)", () => {
  test("dead verdict at likely or certain tier is a positive prediction", () => {
    expect(isPredictedDead(makeFinding("x", "dead", "likely"))).toBe(true);
    expect(isPredictedDead(makeFinding("x", "dead", "certain"))).toBe(true);
  });

  test("dead verdict at maybe tier is NOT a positive prediction (quarantine/recall tension)", () => {
    expect(isPredictedDead(makeFinding("x", "dead", "maybe"))).toBe(false);
  });

  test("test-only verdict is never a positive prediction regardless of tier", () => {
    expect(isPredictedDead(makeFinding("x", "test-only", "certain"))).toBe(false);
  });

  test("no finding at all is a negative (confident-alive) prediction", () => {
    expect(isPredictedDead(null)).toBe(false);
  });
});

describe("scoreRealrepoCases (AC-4)", () => {
  test("a perfect oracle (every finding matches truth) yields precision/recall 1", () => {
    const pairs: RealrepoPair[] = [
      { case: makeCase("deadFn", "dead"), finding: makeFinding("deadFn", "dead", "likely") },
      { case: makeCase("deadFn2", "dead"), finding: makeFinding("deadFn2", "dead", "certain") },
      { case: makeCase("aliveFn", "alive"), finding: null },
      { case: makeCase("aliveFn2", "alive"), finding: makeFinding("aliveFn2", "test-only", "maybe") },
    ];
    const m = scoreRealrepoCases(pairs);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.truePositives).toBe(2);
    expect(m.falsePositives).toBe(0);
    expect(m.falseNegatives).toBe(0);
    expect(m.breakdown.byTruth).toEqual({ dead: 2, alive: 2 });
    expect(m.breakdown.misclassified).toHaveLength(0);
  });

  test("an all-dead-likely model surfaces every alive case as a false positive", () => {
    const pairs: RealrepoPair[] = [
      { case: makeCase("deadFn", "dead"), finding: makeFinding("deadFn", "dead", "likely") },
      { case: makeCase("aliveFn", "alive"), finding: makeFinding("aliveFn", "dead", "likely") },
      { case: makeCase("aliveFn2", "alive"), finding: makeFinding("aliveFn2", "dead", "certain") },
    ];
    const m = scoreRealrepoCases(pairs);
    expect(m.falsePositives).toBe(2);
    expect(m.breakdown.misclassified).toHaveLength(2);
    expect(m.precision).toBeLessThan(1);
    expect(m.recall).toBe(1);
  });

  test("a maybe-tier dead finding on a truly-dead case is a false negative (recall miss)", () => {
    const pairs: RealrepoPair[] = [{ case: makeCase("quarantined", "dead"), finding: makeFinding("quarantined", "dead", "maybe") }];
    const m = scoreRealrepoCases(pairs);
    expect(m.falseNegatives).toBe(1);
    expect(m.recall).toBe(0);
    expect(m.breakdown.misclassified).toHaveLength(1);
  });

  test("meetsFloors checks both precision and recall independently", () => {
    const m = scoreRealrepoCases([{ case: makeCase("a", "dead"), finding: makeFinding("a", "dead", "likely") }]);
    expect(meetsFloors(m, 0.85, 0.5)).toBe(true);
    expect(meetsFloors(m, 1.01, 0.5)).toBe(false);
    expect(meetsFloors(m, 0.85, 1.01)).toBe(false);
  });
});
