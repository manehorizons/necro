import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import { extractSnippet, snippetForFinding } from "../src/triage/snippet.js";

describe("extractSnippet (AC-2)", () => {
  test("includes the declaration line and captures the whole enclosing block (AC-2)", () => {
    const src = [
      "const before = 1;", // 1
      "function deadFn() {", // 2
      "  const a = 1;", // 3
      "  const b = 2;", // 4
      "  return a + b;", // 5
      "}", // 6
      "const after = 2;", // 7
    ].join("\n");

    const snip = extractSnippet(src, 2, 1);
    expect(snip.code).toContain("function deadFn() {");
    expect(snip.code).toContain("return a + b;");
    expect(snip.code).toContain("}"); // block fully captured, not truncated
    expect(snip.startLine).toBe(1); // one line of leading context (radius 1)
    expect(snip.endLine).toBe(6); // closing brace of the block
    // line-number gutter
    expect(snip.code).toContain("2\tfunction deadFn() {");
  });

  test("a block longer than radius is not truncated mid-body (AC-2)", () => {
    const body = Array.from({ length: 30 }, (_, i) => `  const x${i} = ${i};`);
    const src = ["function big() {", ...body, "}", "after();"].join("\n");

    const snip = extractSnippet(src, 1, 2); // radius 2 << block length
    expect(snip.endLine).toBe(32); // through the closing brace
    expect(snip.code).toContain("const x29 = 29;");
  });

  test("falls back to a ±radius window when there is no brace block (AC-2)", () => {
    const src = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const snip = extractSnippet(src, 10, 3);
    expect(snip.startLine).toBe(7);
    expect(snip.endLine).toBe(13);
  });

  test("clamps the start to line 1 and handles a line past EOF gracefully (AC-2)", () => {
    const src = "a\nb\nc";
    const atTop = extractSnippet(src, 1, 5);
    expect(atTop.startLine).toBe(1);
    const past = extractSnippet(src, 99, 2);
    expect(past.startLine).toBeGreaterThanOrEqual(1);
    expect(past.endLine).toBeLessThanOrEqual(3);
  });
});

describe("snippetForFinding (AC-2)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-snip-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("re-reads the finding's file and slices around its line (AC-2)", async () => {
    const file = join(dir, "u.ts");
    await writeFile(file, "export function liveFn() {}\nfunction deadFn() {\n  return 1;\n}\n");
    const finding = {
      node: { id: `${file}:2:deadFn`, name: "deadFn", file, line: 2, exported: false },
    } as ClassifiedFinding;

    const snip = await snippetForFinding(finding, 1);
    expect(snip.file).toBe(file);
    expect(snip.code).toContain("function deadFn() {");
    expect(snip.code).toContain("return 1;");
  });
});
