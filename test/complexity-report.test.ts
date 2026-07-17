import { describe, expect, test } from "vitest";
import { renderComplexity } from "../src/report/complexity.js";
import type { ComplexityFinding } from "../src/syntactic/types.js";

const f: ComplexityFinding = {
  detector: "cyclomatic",
  file: "/src/big.ts",
  line: 12,
  name: "handle",
  value: 14,
  threshold: 10,
  message: "cyclomatic complexity 14 > 10",
};

describe("renderComplexity (AC-6)", () => {
  test("renders a labeled section with detector, location, and message", () => {
    const out = renderComplexity([f], "/");
    expect(out).toContain("Complexity (1 issue)");
    expect(out).toContain("handle");
    expect(out).toContain("src/big.ts:12");
    expect(out).toContain("[cyclomatic]");
    expect(out).toContain("14 > 10");
  });

  test("empty when there are no complexity findings", () => {
    expect(renderComplexity([], "/")).toBe("");
  });
});
