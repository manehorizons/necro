import { describe, expect, test } from "vitest";
import { detect } from "../src/syntactic/detectors.js";
import type { ControlNode, FunctionUnit } from "../src/syntactic/ir.js";
import type { ComplexityThresholds } from "../src/syntactic/types.js";

const T: ComplexityThresholds = {
  nesting: 3,
  cyclomatic: 10,
  cognitive: 15,
  godFunctionLoc: 50,
  godFunctionParams: 5,
};

function unit(over: Partial<FunctionUnit>, controlNodes: ControlNode[] = []): FunctionUnit {
  return { name: "f", file: "/f.ts", line: 1, loc: 5, params: 1, controlNodes, ...over };
}

function nest(depth: number): ControlNode {
  return { category: "branch", depth, nests: true };
}

const byDetector = (us: FunctionUnit) => detect(us, T).map((f) => f.detector);

describe("detect", () => {
  test("flags nesting deeper than the threshold, not at it (AC-2)", () => {
    expect(byDetector(unit({}, [nest(0), nest(1), nest(2), nest(3)]))).toContain("nesting"); // level 4
    expect(byDetector(unit({}, [nest(0), nest(1), nest(2)]))).not.toContain("nesting"); // level 3
  });

  test("flags cyclomatic complexity above the threshold (AC-3)", () => {
    const eleven = Array.from({ length: 11 }, () => nest(0)); // 1 + 11 = 12 > 10
    expect(byDetector(unit({}, eleven))).toContain("cyclomatic");
    const nine = Array.from({ length: 9 }, () => nest(0)); // 1 + 9 = 10, not > 10
    expect(byDetector(unit({}, nine))).not.toContain("cyclomatic");
  });

  test("cognitive penalizes nesting harder than flat — nested > flat for equal branches (AC-4)", () => {
    const flat = [nest(0), nest(0), nest(0), nest(0)];
    const nested = [nest(0), nest(1), nest(2), nest(3)];
    // Disable the other detectors so we can read the cognitive value directly.
    const cog = (cs: ControlNode[]) =>
      detect(unit({}, cs), { ...T, nesting: 99, cyclomatic: 99, cognitive: 0 }).find(
        (d) => d.detector === "cognitive",
      )?.value ?? 0;
    expect(cog(nested)).toBeGreaterThan(cog(flat));
  });

  test("flags god-function by LOC or by params (AC-5)", () => {
    expect(byDetector(unit({ loc: 60 }))).toContain("god-function");
    expect(byDetector(unit({ params: 6 }))).toContain("god-function");
    expect(byDetector(unit({ loc: 40, params: 3 }))).not.toContain("god-function");
  });

  test("a simple function yields no findings", () => {
    expect(detect(unit({}, [nest(0)]), T)).toEqual([]);
  });
});
