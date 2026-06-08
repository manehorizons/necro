import { describe, expect, test } from "vitest";
import { classify } from "../src/analyze/classify.js";
import type { ReachabilityResult } from "../src/analyze/reachability.js";
import type { SymbolNode } from "../src/graph/types.js";

function node(id: string, exported: boolean): SymbolNode {
  return { id, name: id, file: `${id}.ts`, line: 1, exported };
}

function reach(
  id: string,
  reachability: ReachabilityResult["reachability"],
  tainted = false,
): ReachabilityResult {
  return { id, reachability, tainted };
}

describe("classify", () => {
  test("private dead symbol → certain, auto-fix eligible", () => {
    const [f] = classify({
      nodes: [node("a", false)],
      reachability: [reach("a", "dead")],
    });
    expect(f?.tier).toBe("certain");
    expect(f?.verdict).toBe("dead");
    expect(f?.autoFixEligible).toBe(true);
  });

  test("exported dead symbol → likely, not auto-fixable", () => {
    const [f] = classify({
      nodes: [node("a", true)],
      reachability: [reach("a", "dead")],
    });
    expect(f?.tier).toBe("likely");
    expect(f?.autoFixEligible).toBe(false);
  });

  test("tainted dead candidate → maybe, never auto-fixed", () => {
    const [f] = classify({
      nodes: [node("a", false)],
      reachability: [reach("a", "dead", true)],
    });
    expect(f?.tier).toBe("maybe");
    expect(f?.autoFixEligible).toBe(false);
  });

  test("public-API dead symbol → maybe", () => {
    const [f] = classify({
      nodes: [node("a", true)],
      reachability: [reach("a", "dead")],
      publicApiIds: new Set(["a"]),
    });
    expect(f?.tier).toBe("maybe");
    expect(f?.autoFixEligible).toBe(false);
  });

  test("test-only symbol → test-only verdict, never auto-fixed", () => {
    const [f] = classify({
      nodes: [node("a", true)],
      reachability: [reach("a", "test-only")],
    });
    expect(f?.verdict).toBe("test-only");
    expect(f?.autoFixEligible).toBe(false);
  });

  test("alive symbols are not reported as findings", () => {
    const findings = classify({
      nodes: [node("a", true)],
      reachability: [reach("a", "alive")],
    });
    expect(findings).toEqual([]);
  });
});

describe("classify with coverage", () => {
  const evidenceText = (f: { evidence: { text: string }[] }) => f.evidence.map((e) => e.text);

  test("coverage miss keeps a private dead candidate certain + auto-fixable (AC-2)", () => {
    const [f] = classify({
      nodes: [node("a", false)],
      reachability: [reach("a", "dead")],
      coverage: () => ({ kind: "miss" }),
    });
    expect(f?.tier).toBe("certain");
    expect(f?.autoFixEligible).toBe(true);
    expect(f?.evidence).toContainEqual({ ok: true, text: "0 coverage hits (lcov)" });
  });

  test("runtime hits force a dead candidate to maybe, never auto-fixed (AC-3)", () => {
    const [f] = classify({
      nodes: [node("a", false)],
      reachability: [reach("a", "dead")],
      coverage: () => ({ kind: "hit", hits: 3 }),
    });
    expect(f?.tier).toBe("maybe");
    expect(f?.autoFixEligible).toBe(false);
    expect(evidenceText(f!)).toContainEqual(
      "executed at runtime (3 hits) despite 0 static refs — reached dynamically",
    );
  });

  test("coverage unavailable for a symbol leaves phase-01 behavior intact (AC-4)", () => {
    const [f] = classify({
      nodes: [node("a", false)],
      reachability: [reach("a", "dead")],
      coverage: () => ({ kind: "unavailable" }),
    });
    expect(f?.tier).toBe("certain");
    expect(f?.evidence).toContainEqual({ ok: null, text: "coverage: not available" });
  });

  test("no coverage fn supplied → byte-identical to phase 01 (coverage: not available) (AC-6)", () => {
    const [withFn] = classify({
      nodes: [node("a", false)],
      reachability: [reach("a", "dead")],
      coverage: () => ({ kind: "unavailable" }),
    });
    const [without] = classify({
      nodes: [node("a", false)],
      reachability: [reach("a", "dead")],
    });
    expect(without).toEqual(withFn);
  });
});
