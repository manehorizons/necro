import { describe, expect, test } from "vitest";
import { getParser } from "../src/syntactic/parse.js";

const JSX_SNIPPET = `export function Widget({ name }) {
  if (name) {
    return <div className="widget">{name}</div>;
  }
  return null;
}
`;

describe("getParser (AC-2)", () => {
  test("parses JSX in a .tsx file without error", async () => {
    const parser = await getParser("/comp.tsx");
    const tree = parser.parse(JSX_SNIPPET);
    expect(tree?.rootNode.hasError).toBe(false);
  });

  test("parses JSX in a .jsx file without error", async () => {
    const parser = await getParser("/comp.jsx");
    const tree = parser.parse(JSX_SNIPPET);
    expect(tree?.rootNode.hasError).toBe(false);
  });

  test("still parses plain .ts source without error", async () => {
    const parser = await getParser("/plain.ts");
    const tree = parser.parse("export function f(a: number): number { return a + 1; }\n");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  test("still parses plain .js source without error", async () => {
    const parser = await getParser("/plain.js");
    const tree = parser.parse("export function f(a) { return a + 1; }\n");
    expect(tree?.rootNode.hasError).toBe(false);
  });
});
