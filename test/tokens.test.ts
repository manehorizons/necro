import { describe, expect, test } from "vitest";
import { tokenize } from "../src/syntactic/tokens.js";

describe("tokenize (AC-1)", () => {
  test("renamed identifiers and changed literals normalize to the same stream", async () => {
    const a = await tokenize("/a.ts", "const total = price * 2;\n");
    const b = await tokenize("/b.ts", "const sum = cost * 99;\n");
    expect(a.map((t) => t.norm)).toEqual(b.map((t) => t.norm));
    expect(a.map((t) => t.norm)).toContain("ID");
    expect(a.map((t) => t.norm)).toContain("LIT");
  });

  test("comments produce no tokens", async () => {
    const withComment = await tokenize("/c.ts", "// a comment\nconst x = 1;\n");
    const without = await tokenize("/d.ts", "const x = 1;\n");
    expect(withComment.map((t) => t.norm)).toEqual(without.map((t) => t.norm));
  });

  test("keywords and punctuation are preserved by kind", async () => {
    const toks = (await tokenize("/e.ts", "if (x) {}\n")).map((t) => t.norm);
    expect(toks).toContain("if");
    expect(toks).toContain("{");
  });

  test("structurally different code yields different streams", async () => {
    const a = (await tokenize("/f.ts", "const x = 1;\n")).map((t) => t.norm);
    const b = (await tokenize("/g.ts", "function f() { return 1; }\n")).map((t) => t.norm);
    expect(a).not.toEqual(b);
  });
});
