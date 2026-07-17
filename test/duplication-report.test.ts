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
    const out = renderDuplication([finding], "/");
    expect(out).toContain("Duplication (1 clone)");
    expect(out).toContain("60 tokens duplicated");
    expect(out).toContain("src/a.ts:1-9");
    expect(out).toContain("src/b.ts:20-28");
  });

  test("empty when there are no clones", () => {
    expect(renderDuplication([], "/")).toBe("");
  });
});

describe("renderDuplication merges overlapping same-file locations (AC-4)", () => {
  test("8 overlapping util.ts:31-33-style locations merge into one line (audit ev-20260701-007)", () => {
    const overlapping: DuplicationFinding = {
      tokens: 12,
      locations: Array.from({ length: 8 }, (_, i) => ({
        file: "/src/util.ts",
        startLine: 31 + (i % 3),
        endLine: 33 + (i % 3),
      })),
    };
    const out = renderDuplication([overlapping], "/");
    const occurrences = out.split("util.ts:").length - 1;
    expect(occurrences).toBe(1);
    expect(out).toMatch(/src\/util\.ts:31-3\d/);
  });

  test("locations in different files are never merged", () => {
    const out = renderDuplication([finding], "/");
    expect(out).toContain("src/a.ts:1-9");
    expect(out).toContain("src/b.ts:20-28");
  });

  test("non-overlapping, non-adjacent same-file ranges stay separate", () => {
    const apart: DuplicationFinding = {
      tokens: 10,
      locations: [
        { file: "/src/c.ts", startLine: 1, endLine: 5 },
        { file: "/src/c.ts", startLine: 50, endLine: 55 },
      ],
    };
    const out = renderDuplication([apart], "/");
    expect(out).toContain("src/c.ts:1-5");
    expect(out).toContain("src/c.ts:50-55");
  });

  test("touching (adjacent) same-file ranges merge into one", () => {
    const touching: DuplicationFinding = {
      tokens: 10,
      locations: [
        { file: "/src/d.ts", startLine: 1, endLine: 5 },
        { file: "/src/d.ts", startLine: 6, endLine: 10 },
      ],
    };
    const out = renderDuplication([touching], "/");
    expect(out).toContain("src/d.ts:1-10");
    expect(out).not.toContain("src/d.ts:1-5");
  });
});
