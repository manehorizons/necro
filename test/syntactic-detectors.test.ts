import { describe, expect, test } from "vitest";
import { detect } from "../src/syntactic/detectors.js";
import { lowerSource } from "../src/syntactic/ir.js";
import type { ControlNode, FunctionUnit } from "../src/syntactic/ir.js";
import { metrics } from "../src/syntactic/metrics.js";
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

describe("detect — Python golden fixtures (AC-5)", () => {
  test("real Python control flow (if/for/if/while/elif) produces the hand-counted nesting depth and cyclomatic count", async () => {
    // Hand count before asserting:
    //   if a           -> branch @0            nesting candidate: 1
    //     for x         -> loop   @1 (inside if) nesting candidate: 2
    //       if x > 0     -> branch @2 (inside for) nesting candidate: 3
    //         while x>1   -> loop   @3 (inside if x>0) nesting candidate: 4
    //       elif x < 0   -> branch @3 (sibling clause of the same if_statement,
    //                        same depth as `while` — Python's elif is a child
    //                        of its if_statement, not of the if's consequence)
    // 5 control nodes total -> cyclomatic = 1 + 5 = 6
    // max(depth+1) over nesting nodes = max(1,2,3,4,4) = 4
    const src = [
      "def tangled(a, items):",
      "    if a:",
      "        for x in items:",
      "            if x > 0:",
      "                while x > 1:",
      "                    x -= 1",
      "            elif x < 0:",
      "                pass",
      "    return a",
    ].join("\n");

    const [unit] = await lowerSource("/tangled.py", src);
    const m = metrics(unit!);
    expect(m.nesting).toBe(4);
    expect(m.cyclomatic).toBe(6);

    // nesting threshold 3: 4 > 3 -> flagged. cyclomatic threshold 10: 6 not > 10 -> not flagged.
    const detectors = detect(unit!, T).map((f) => f.detector);
    expect(detectors).toContain("nesting");
    expect(detectors).not.toContain("cyclomatic");
  });

  test("a comprehension's for/if-filter clauses are siblings, not nested — well under the nesting threshold", async () => {
    const [unit] = await lowerSource(
      "/comp.py",
      "def f(a):\n    return [i for i in range(a) if i > 5]\n",
    );
    const m = metrics(unit!);
    // for_in_clause and if_clause are both direct children of the
    // list_comprehension node (siblings, both @depth 0) — not nested inside
    // each other, unlike a real `for`/`if` statement pair would be.
    // max(depth+1) over the two nesting nodes = 1.
    expect(m.nesting).toBe(1);
    expect(detect(unit!, T).map((f) => f.detector)).not.toContain("nesting");
  });
});
