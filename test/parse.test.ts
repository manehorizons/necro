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

  test("parses Python source covering every construct AC-1 lists, without error (AC-1)", async () => {
    const parser = await getParser("/mod.py");
    const src = `def top(a, b=1, *args, **kwargs):
    if a:
        pass
    elif b:
        pass
    for x in range(10):
        while x > 0:
            x -= 1
    try:
        pass
    except ValueError:
        pass
    y = a if b else b
    z = a and b or not a
    result = [i for i in range(10) if i > 5]
    match a:
        case 1:
            pass
        case _:
            pass

class Foo:
    def method(self, x):
        return x

async def bar():
    pass

lam = lambda x: x + 1
`;
    const tree = parser.parse(src);
    expect(tree?.rootNode.hasError).toBe(false);
  });
});
