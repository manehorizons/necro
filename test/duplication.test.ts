import { describe, expect, test } from "vitest";
import { findClones, type FileTokens } from "../src/syntactic/duplication.js";
import { tokenize } from "../src/syntactic/tokens.js";
import type { Token } from "../src/syntactic/tokens.js";

/** Build a token stream from norm strings, one per line. */
function toks(...norms: string[]): Token[] {
  return norms.map((norm, idx) => ({ norm, line: idx + 1 }));
}

describe("findClones (AC-2, AC-3, AC-4, AC-5)", () => {
  test("identical block in two files → one clone group, two locations", () => {
    const files: FileTokens[] = [
      { file: "/a.ts", tokens: toks("a", "b", "c", "d", "e") },
      { file: "/b.ts", tokens: toks("a", "b", "c", "d", "e") },
    ];
    const clones = findClones(files, 4);
    expect(clones).toHaveLength(1);
    expect(clones[0]?.tokens).toBe(5); // extended to the maximal match
    expect(clones[0]?.locations.map((l) => l.file).sort()).toEqual(["/a.ts", "/b.ts"]);
  });

  test("a match shorter than minTokens is not reported (AC-4)", () => {
    const files: FileTokens[] = [
      { file: "/a.ts", tokens: toks("a", "b", "c") },
      { file: "/b.ts", tokens: toks("a", "b", "c") },
    ];
    expect(findClones(files, 4)).toEqual([]);
  });

  test("a block duplicated within one file is detected (AC-4)", () => {
    const t = toks("x", "a", "b", "c", "d", "y", "a", "b", "c", "d", "z");
    const clones = findClones([{ file: "/a.ts", tokens: t }], 4);
    expect(clones).toHaveLength(1);
    expect(clones[0]?.locations).toHaveLength(2);
    expect(clones[0]?.locations.every((l) => l.file === "/a.ts")).toBe(true);
  });

  test("a long clone is reported once, maximally — not as overlapping sub-windows (AC-5)", () => {
    const block = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const files: FileTokens[] = [
      { file: "/a.ts", tokens: toks(...block) },
      { file: "/b.ts", tokens: toks(...block) },
    ];
    const clones = findClones(files, 4);
    expect(clones).toHaveLength(1);
    expect(clones[0]?.tokens).toBe(8);
  });

  test("structurally different code of equal length is not a clone", () => {
    const files: FileTokens[] = [
      { file: "/a.ts", tokens: toks("a", "b", "c", "d") },
      { file: "/b.ts", tokens: toks("a", "b", "x", "d") },
    ];
    expect(findClones(files, 4)).toEqual([]);
  });

  test("Type-2: renamed copies match after normalization (AC-3)", async () => {
    const f1 = "function add(a: number, b: number) { const sum = a + b; return sum; }\n";
    const f2 = "function plus(x: number, y: number) { const total = x + y; return total; }\n";
    const files: FileTokens[] = [
      { file: "/add.ts", tokens: await tokenize("/add.ts", f1) },
      { file: "/plus.ts", tokens: await tokenize("/plus.ts", f2) },
    ];
    const clones = findClones(files, 8);
    expect(clones.length).toBeGreaterThanOrEqual(1);
    expect(clones[0]?.locations.map((l) => l.file).sort()).toEqual(["/add.ts", "/plus.ts"]);
  });
});
