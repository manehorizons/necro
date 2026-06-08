import { describe, expect, test } from "vitest";
import { renderDuplication } from "../src/report/duplication.js";
import type { DuplicationFinding } from "../src/syntactic/types.js";

const finding: DuplicationFinding = {
  tokens: 60,
  locations: [
    { file: "/src/a.ts", startLine: 1, endLine: 9 },
    { file: "/src/b.ts", startLine: 20, endLine: 28 },
  ],
};

describe("renderDuplication (AC-6)", () => {
  test("renders the token count and both locations", () => {
    const out = renderDuplication([finding]);
    expect(out).toContain("Duplication (1 clone)");
    expect(out).toContain("60 tokens duplicated");
    expect(out).toContain("/src/a.ts:1-9");
    expect(out).toContain("/src/b.ts:20-28");
  });

  test("empty when there are no clones", () => {
    expect(renderDuplication([])).toBe("");
  });
});
