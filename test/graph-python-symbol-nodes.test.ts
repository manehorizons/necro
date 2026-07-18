import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildPythonSymbolGraph } from "../src/graph/python/symbol-graph.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-symgraph-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<string> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  return path;
}

async function graphFor(files: string[]) {
  const roots = detectImportRoots(dir, files);
  const moduleMap = buildPythonModuleMap(files, roots);
  return buildPythonSymbolGraph(files, moduleMap);
}

function nodeNames(nodes: { name: string }[]): string[] {
  return nodes.map((n) => n.name).sort();
}

describe("buildPythonSymbolGraph — node collection (AC-1)", () => {
  test("collects module-level def, async def, class, and simple assignment", async () => {
    const file = await write(
      "mod.py",
      [
        "def plain():",
        "    pass",
        "",
        "async def coro():",
        "    pass",
        "",
        "class Thing:",
        "    def method(self):",
        "        pass",
        "",
        "x = 1",
      ].join("\n"),
    );
    const { graph } = await graphFor([file]);
    expect(nodeNames(graph.nodes)).toEqual(["Thing", "coro", "plain", "x"]);
  });

  test("a decorated definition is still collected as a module-level node", async () => {
    const file = await write("mod.py", ["@decorator", "def foo():", "    pass"].join("\n"));
    const { graph } = await graphFor([file]);
    expect(nodeNames(graph.nodes)).toEqual(["foo"]);
  });

  test("methods nested inside a class are never nodes (parity with TS)", async () => {
    const file = await write("mod.py", ["class Thing:", "    def method(self):", "        pass"].join("\n"));
    const { graph } = await graphFor([file]);
    expect(nodeNames(graph.nodes)).toEqual(["Thing"]);
  });

  test("a function nested inside another function is never a node", async () => {
    const file = await write(
      "mod.py",
      ["def outer():", "    def inner():", "        pass", "    return inner"].join("\n"),
    );
    const { graph } = await graphFor([file]);
    expect(nodeNames(graph.nodes)).toEqual(["outer"]);
  });
});

describe("buildPythonSymbolGraph — exported semantics (AC-2)", () => {
  test("a private (underscore-prefixed) symbol is not exported", async () => {
    const file = await write("mod.py", "def _helper():\n    pass\n");
    const { graph } = await graphFor([file]);
    expect(graph.nodes.find((n) => n.name === "_helper")?.exported).toBe(false);
  });

  test("a public (no leading underscore) symbol is exported", async () => {
    const file = await write("mod.py", "def public_fn():\n    pass\n");
    const { graph } = await graphFor([file]);
    expect(graph.nodes.find((n) => n.name === "public_fn")?.exported).toBe(true);
  });

  test("a private symbol listed in __all__ is exported", async () => {
    const file = await write("mod.py", ["def _blessed():", "    pass", "", '__all__ = ["_blessed"]'].join("\n"));
    const { graph } = await graphFor([file]);
    expect(graph.nodes.find((n) => n.name === "_blessed")?.exported).toBe(true);
  });

  test("__all__ as a tuple also works, and __all__ itself is not a node", async () => {
    const file = await write("mod.py", ["def _blessed():", "    pass", "", '__all__ = ("_blessed",)'].join("\n"));
    const { graph } = await graphFor([file]);
    expect(graph.nodes.find((n) => n.name === "_blessed")?.exported).toBe(true);
    expect(graph.nodes.find((n) => n.name === "__all__")).toBeUndefined();
  });

  test("a dunder name is exported even though it starts with an underscore", async () => {
    const file = await write("mod.py", '__version__ = "1.0"\n');
    const { graph } = await graphFor([file]);
    expect(graph.nodes.find((n) => n.name === "__version__")?.exported).toBe(true);
  });

  test("a pytest-convention test_ function is exported (exemption)", async () => {
    const file = await write("mod.py", "def test_something():\n    assert True\n");
    const { graph } = await graphFor([file]);
    expect(graph.nodes.find((n) => n.name === "test_something")?.exported).toBe(true);
  });
});
