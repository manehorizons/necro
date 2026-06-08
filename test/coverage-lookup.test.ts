import { describe, expect, test } from "vitest";
import { coverageFor } from "../src/analyze/coverage/lookup.js";
import { parseLcov } from "../src/analyze/coverage/lcov.js";
import type { SymbolNode } from "../src/graph/types.js";

function node(file: string, line: number, name: string): SymbolNode {
  return { id: `${file}:${line}:${name}`, name, file, line, exported: false };
}

const report = parseLcov(
  [
    "SF:/repo/src/util.ts",
    "FN:10,deadFn",
    "FN:20,liveFn",
    "FNDA:0,deadFn",
    "FNDA:7,liveFn",
    "DA:10,0",
    "DA:20,7",
    "DA:30,4", // a non-function line with hits (e.g. a top-level const)
    "end_of_record",
  ].join("\n"),
);

describe("coverageFor", () => {
  test("FN match with 0 hits → miss", () => {
    expect(coverageFor(report, node("/repo/src/util.ts", 10, "deadFn"))).toEqual({ kind: "miss" });
  });

  test("FN match with hits → hit(N)", () => {
    expect(coverageFor(report, node("/repo/src/util.ts", 20, "liveFn"))).toEqual({
      kind: "hit",
      hits: 7,
    });
  });

  test("no FN record → falls back to DA line hits", () => {
    expect(coverageFor(report, node("/repo/src/util.ts", 30, "someConst"))).toEqual({
      kind: "hit",
      hits: 4,
    });
  });

  test("file absent from report → unavailable", () => {
    expect(coverageFor(report, node("/repo/src/other.ts", 1, "x"))).toEqual({ kind: "unavailable" });
  });

  test("symbol with neither FN nor DA record → unavailable", () => {
    expect(coverageFor(report, node("/repo/src/util.ts", 99, "ghost"))).toEqual({
      kind: "unavailable",
    });
  });

  test("matches when report uses a relative SF path", () => {
    const rel = parseLcov(["SF:src/util.ts", "FN:5,f", "FNDA:2,f", "DA:5,2", "end_of_record"].join("\n"));
    expect(coverageFor(rel, node("/repo/src/util.ts", 5, "f"))).toEqual({ kind: "hit", hits: 2 });
  });
});
