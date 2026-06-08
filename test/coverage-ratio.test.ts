import { describe, expect, test } from "vitest";
import { parseLcov } from "../src/analyze/coverage/lcov.js";
import { coverageRatio } from "../src/analyze/coverage/ratio.js";

const report = parseLcov(
  [
    "SF:/src/util.ts",
    "DA:10,5", // covered
    "DA:11,0", // not
    "DA:12,3", // covered
    "DA:13,0", // not
    "end_of_record",
  ].join("\n"),
);

describe("coverageRatio (AC-2)", () => {
  test("fully covered range → 1", () => {
    expect(coverageRatio(report, "/src/util.ts", 10, 10)).toBe(1);
  });

  test("half covered range → 0.5", () => {
    expect(coverageRatio(report, "/src/util.ts", 10, 13)).toBe(0.5);
  });

  test("range with no instrumented lines → null", () => {
    expect(coverageRatio(report, "/src/util.ts", 100, 200)).toBeNull();
  });

  test("file absent from report → null", () => {
    expect(coverageRatio(report, "/src/other.ts", 1, 10)).toBeNull();
  });

  test("matches a relative SF path against an absolute file", () => {
    const rel = parseLcov(["SF:src/util.ts", "DA:1,1", "DA:2,0", "end_of_record"].join("\n"));
    expect(coverageRatio(rel, "/repo/src/util.ts", 1, 2)).toBe(0.5);
  });
});
