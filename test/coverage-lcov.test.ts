import { describe, expect, test } from "vitest";
import { parseLcov } from "../src/analyze/coverage/lcov.js";

const SAMPLE = [
  "TN:",
  "SF:/repo/src/util.ts",
  "FN:10,deadFn",
  "FN:20,liveFn",
  "FNDA:0,deadFn",
  "FNDA:5,liveFn",
  "DA:10,0",
  "DA:20,5",
  "DA:21,5",
  "end_of_record",
  "SF:/repo/src/other.ts",
  "FN:3,2,onlyOne", // newer 3-field form: start,end,name
  "FNDA:2,onlyOne",
  "DA:3,2",
  "end_of_record",
].join("\n");

describe("parseLcov", () => {
  test("parses SF/FN/FNDA/DA records grouped by file", () => {
    const report = parseLcov(SAMPLE);

    const util = report.files.get("/repo/src/util.ts");
    expect(util).toBeDefined();
    expect(util?.fns).toContainEqual({ name: "deadFn", line: 10, hits: 0 });
    expect(util?.fns).toContainEqual({ name: "liveFn", line: 20, hits: 5 });
    expect(util?.lines.get(10)).toBe(0);
    expect(util?.lines.get(20)).toBe(5);
  });

  test("handles the 3-field FN form (start,end,name)", () => {
    const report = parseLcov(SAMPLE);
    const other = report.files.get("/repo/src/other.ts");
    expect(other?.fns).toContainEqual({ name: "onlyOne", line: 3, hits: 2 });
  });

  test("tolerates unknown record types and blank lines", () => {
    const raw = ["SF:/a.ts", "BRDA:1,0,0,1", "", "LF:1", "DA:1,1", "end_of_record"].join("\n");
    const report = parseLcov(raw);
    expect(report.files.get("/a.ts")?.lines.get(1)).toBe(1);
  });

  test("a function with no FNDA defaults to 0 hits", () => {
    const raw = ["SF:/a.ts", "FN:5,orphan", "end_of_record"].join("\n");
    const report = parseLcov(raw);
    expect(report.files.get("/a.ts")?.fns).toContainEqual({ name: "orphan", line: 5, hits: 0 });
  });
});
