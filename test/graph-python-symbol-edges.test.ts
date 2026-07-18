import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildPythonSymbolGraph } from "../src/graph/python/symbol-graph.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-symedges-"));
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

function edgeExists(edges: { from: string; to: string }[], from: string, to: string): boolean {
  return edges.some((e) => e.from === from && e.to === to);
}

describe("buildPythonSymbolGraph — reference edges (AC-3)", () => {
  test("a bare-name reference within the same file edges from the enclosing top-level declaration", async () => {
    const file = await write(
      "mod.py",
      ["def helper():", "    pass", "", "def caller():", "    helper()"].join("\n"),
    );
    const { graph } = await graphFor([file]);
    expect(edgeExists(graph.edges, `${file}:4:caller`, `${file}:1:helper`)).toBe(true);
  });

  test("a reference inside a nested method attributes to the enclosing top-level class", async () => {
    const file = await write(
      "mod.py",
      ["def helper():", "    pass", "", "class Thing:", "    def method(self):", "        return helper()"].join("\n"),
    );
    const { graph } = await graphFor([file]);
    expect(edgeExists(graph.edges, `${file}:4:Thing`, `${file}:1:helper`)).toBe(true);
  });

  test("a module-level reference (not inside any top-level declaration) edges from the file itself", async () => {
    const file = await write("mod.py", ["def helper():", "    pass", "", "helper()"].join("\n"));
    const { graph } = await graphFor([file]);
    expect(edgeExists(graph.edges, file, `${file}:1:helper`)).toBe(true);
  });

  test("cross-file: `from pkg import symbol` resolves to the declaration in pkg's file", async () => {
    const pkgInit = await write("pkg/__init__.py", "def shared():\n    pass\n");
    const app = await write("app.py", ["from pkg import shared", "", "def use():", "    shared()"].join("\n"));
    const { graph } = await graphFor([pkgInit, app]);
    expect(edgeExists(graph.edges, `${app}:3:use`, `${pkgInit}:1:shared`)).toBe(true);
  });

  test("attribute access on a whole-module import resolves the attribute inside the target file", async () => {
    const mod = await write("pkg/mod.py", "def thing():\n    pass\n");
    await write("pkg/__init__.py", "");
    const app = await write("app.py", ["import pkg.mod as m", "", "def use():", "    m.thing()"].join("\n"));
    const { graph } = await graphFor([mod, app]);
    expect(edgeExists(graph.edges, `${app}:3:use`, `${mod}:1:thing`)).toBe(true);
  });

  test("__init__.py re-export pass-through: a symbol actually declared elsewhere is found through the barrel", async () => {
    // pkg/__init__.py does `from .impl import real_fn` (a re-export), so
    // `from pkg import real_fn` from outside must chase through the barrel
    // to impl.py's actual declaration, not stop at __init__.py.
    const impl = await write("pkg/impl.py", "def real_fn():\n    pass\n");
    const pkgInit = await write("pkg/__init__.py", "from .impl import real_fn\n");
    const app = await write("app.py", ["from pkg import real_fn", "", "def use():", "    real_fn()"].join("\n"));
    const { graph } = await graphFor([impl, pkgInit, app]);
    expect(edgeExists(graph.edges, `${app}:3:use`, `${impl}:1:real_fn`)).toBe(true);
  });

  test("a two-hop re-export chain (barrel re-exporting a barrel) still resolves", async () => {
    const impl = await write("pkg/inner/impl.py", "def deep_fn():\n    pass\n");
    const innerInit = await write("pkg/inner/__init__.py", "from .impl import deep_fn\n");
    const pkgInit = await write("pkg/__init__.py", "from .inner import deep_fn\n");
    const app = await write("app.py", ["from pkg import deep_fn", "", "def use():", "    deep_fn()"].join("\n"));
    const { graph } = await graphFor([impl, innerInit, pkgInit, app]);
    expect(edgeExists(graph.edges, `${app}:3:use`, `${impl}:1:deep_fn`)).toBe(true);
  });

  test("a circular re-export resolves to unresolved (no edge), not an infinite loop", async () => {
    const a = await write("a.py", "from b import thing\n");
    const b = await write("b.py", "from a import thing\n");
    const app = await write("app.py", ["from a import thing", "", "def use():", "    thing()"].join("\n"));
    await expect(graphFor([a, b, app])).resolves.toBeDefined();
    const { graph } = await graphFor([a, b, app]);
    // No real declaration of `thing` exists anywhere — the chase must dead-end, not hang or crash.
    expect(graph.edges.some((e) => e.to.includes(":thing"))).toBe(false);
  });

  test("a reference to a name with no matching declaration or binding produces no edge", async () => {
    const file = await write("mod.py", ["def use():", "    os.path.join('a')"].join("\n"));
    const { graph } = await graphFor([file]);
    // No edge to any declared symbol — the only outbound edges from `use` are
    // the always-present self-file edges (phase 48: reaching a declaration
    // means its module's own top level ran too), not a resolved reference.
    expect(graph.edges.filter((e) => e.from === `${file}:1:use` && e.to !== file)).toHaveLength(0);
  });

  test("edges are tagged prod by default and test for test_*.py files", async () => {
    const mod = await write("mod.py", "def helper():\n    pass\n");
    const prodFile = await write("app.py", ["from mod import helper", "", "def use():", "    helper()"].join("\n"));
    const testFile = await write("test_app.py", ["from mod import helper", "", "def test_use():", "    helper()"].join("\n"));
    const { graph } = await graphFor([mod, prodFile, testFile]);
    const prodEdge = graph.edges.find((e) => e.from === `${prodFile}:3:use`);
    const testEdge = graph.edges.find((e) => e.from === `${testFile}:3:test_use`);
    expect(prodEdge?.kind).toBe("prod");
    expect(testEdge?.kind).toBe("test");
  });
});
