import { describe, expect, test } from "vitest";
import { parseLcov } from "../src/analyze/coverage/lcov.js";
import { crapScore, rankHotspots } from "../src/analyze/hotspots.js";
import type { ControlNode, FunctionUnit } from "../src/syntactic/ir.js";

const branch = (depth: number): ControlNode => ({ category: "branch", depth, nests: true });

/** A function with `branches` control nodes (cyclomatic = branches + 1). */
function fn(name: string, file: string, line: number, loc: number, branches: number): FunctionUnit {
  return {
    name,
    file,
    line,
    loc,
    params: 1,
    controlNodes: Array.from({ length: branches }, () => branch(0)),
  };
}

describe("crapScore (AC-3)", () => {
  test("matches complexity² × (1−cov)³ + complexity", () => {
    expect(crapScore(10, 0)).toBe(110); // 100*1 + 10
    expect(crapScore(10, 1)).toBe(10); // fully covered → just complexity
    expect(crapScore(4, 0.5)).toBe(4 * 4 * 0.125 + 4); // 6
  });
});

describe("rankHotspots (AC-5)", () => {
  const complex = fn("complex", "/a.ts", 1, 20, 9); // cyclomatic 10
  const simple = fn("simple", "/b.ts", 1, 5, 1); // cyclomatic 2

  test("complex + uncovered ranks above simple + covered", () => {
    const cov = parseLcov(
      ["SF:/a.ts", "DA:1,0", "end_of_record", "SF:/b.ts", "DA:1,5", "end_of_record"].join("\n"),
    );
    const [top] = rankHotspots([simple, complex], cov, null, 10);
    expect(top?.name).toBe("complex");
    expect(top?.crap).toBe(crapScore(10, 0));
  });

  test("no coverage report → CRAP null, risk falls back to complexity × churn", () => {
    const churn = new Map([["/a.ts", 3]]);
    const [top] = rankHotspots([complex], null, churn, 10);
    expect(top?.crap).toBeNull();
    expect(top?.risk).toBe(10 * 3);
  });

  test("no git → churn null, risk uses CRAP/complexity alone", () => {
    const ranked = rankHotspots([complex], null, null, 10);
    expect(ranked[0]?.churn).toBeNull();
    expect(ranked[0]?.risk).toBe(10); // complexity × 1
  });

  test("caps the list at topN", () => {
    const many = Array.from({ length: 5 }, (_, i) => fn(`f${i}`, `/f${i}.ts`, 1, 5, i + 1));
    expect(rankHotspots(many, null, null, 3)).toHaveLength(3);
  });
});
