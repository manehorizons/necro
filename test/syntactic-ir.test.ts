import { describe, expect, test } from "vitest";
import { lowerSource } from "../src/syntactic/ir.js";

describe("lowerSource (AC-1)", () => {
  test("lowers a function to name, line, loc, params, and control nodes with depth", async () => {
    const src = [
      "function f(a, b, c) {", // line 1
      "  if (a) {", //            depth 0 branch
      "    for (const x of b) {", // depth 1 loop
      "      while (x) {", //       depth 2 loop
      "        c();", //
      "      }", //
      "    }", //
      "  }", //
      "}", //                    line 9
    ].join("\n");

    const [unit] = await lowerSource("/x.ts", src);

    expect(unit?.name).toBe("f");
    expect(unit?.line).toBe(1);
    expect(unit?.loc).toBe(9);
    expect(unit?.params).toBe(3);

    const depths = unit!.controlNodes.map((c) => c.depth).sort();
    expect(depths).toEqual([0, 1, 2]); // if@0, for@1, while@2
    expect(unit!.controlNodes.every((c) => c.nests)).toBe(true);
  });

  test("records short-circuit operators as non-nesting boolean nodes", async () => {
    const [unit] = await lowerSource("/y.ts", "function g(a, b) {\n  return a && b || a;\n}\n");
    const booleans = unit!.controlNodes.filter((c) => c.category === "boolean");
    expect(booleans.length).toBeGreaterThanOrEqual(2);
    expect(booleans.every((c) => c.nests === false)).toBe(true);
  });

  test("nested functions are separate units, not folded into the parent", async () => {
    const units = await lowerSource("/z.ts", "function outer() {\n  function inner() {}\n}\n");
    expect(units.map((u) => u.name).sort()).toEqual(["inner", "outer"]);
  });

  test("a .jsx file with conditional JSX rendering parses via the tsx grammar and finds both a boolean (&&) and a ternary control node (AC-2)", async () => {
    // Regression guard: the plain `typescript` grammar mis-parses `<span>` as a
    // type assertion and swallows the ternary entirely (confirmed manually —
    // before the tsx-grammar dispatch fix this test found only the `boolean`
    // node, never `ternary`).
    const src = [
      "export function Panel({ show, name }) {", // line 1
      "  return (",
      '    <div className="panel">',
      "      {show && <span>{name}</span>}",
      "      {show ? <strong>{name}</strong> : null}",
      "    </div>",
      "  );",
      "}",
    ].join("\n");

    const [unit] = await lowerSource("/panel.jsx", src);
    const categories = unit!.controlNodes.map((c) => c.category).sort();
    expect(categories).toEqual(["boolean", "ternary"]);
  });
});
