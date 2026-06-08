import { describe, expect, test } from "vitest";
import type { ControlNode, FunctionUnit } from "../src/syntactic/ir.js";
import { metrics } from "../src/syntactic/metrics.js";

function unit(controlNodes: ControlNode[], over: Partial<FunctionUnit> = {}): FunctionUnit {
  return { name: "f", file: "/f.ts", line: 1, loc: 10, params: 2, controlNodes, ...over };
}
const nest = (depth: number): ControlNode => ({ category: "branch", depth, nests: true });
const bool = (): ControlNode => ({ category: "boolean", depth: 0, nests: false });

describe("metrics (AC-1)", () => {
  test("cyclomatic = 1 + control nodes", () => {
    expect(metrics(unit([nest(0), nest(0), bool()])).cyclomatic).toBe(4);
    expect(metrics(unit([])).cyclomatic).toBe(1);
  });

  test("nesting = deepest nesting level", () => {
    expect(metrics(unit([nest(0), nest(1), nest(2)])).nesting).toBe(3);
    expect(metrics(unit([bool()])).nesting).toBe(0);
  });

  test("cognitive penalizes depth; boolean ops cost a flat 1", () => {
    expect(metrics(unit([nest(0), nest(1), nest(2)])).cognitive).toBe(1 + 2 + 3);
    expect(metrics(unit([bool(), bool()])).cognitive).toBe(2);
  });

  test("passes loc and params through", () => {
    const m = metrics(unit([], { loc: 42, params: 5 }));
    expect(m.loc).toBe(42);
    expect(m.params).toBe(5);
  });
});
