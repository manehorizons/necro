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
