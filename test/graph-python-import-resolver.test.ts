import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildPythonModuleMap } from "../src/graph/python/module-resolver.js";
import { resolvePythonImport } from "../src/graph/python/resolve-import.js";
import type { PythonImport } from "../src/graph/python/import-parser.js";

const ROOT = "/repo";
const F = {
  pkgInit: join(ROOT, "pkg", "__init__.py"),
  subInit: join(ROOT, "pkg", "sub", "__init__.py"),
  mod: join(ROOT, "pkg", "sub", "mod.py"),
  sibling: join(ROOT, "pkg", "sub", "sibling.py"),
  utils: join(ROOT, "pkg", "utils.py"),
  otherThing: join(ROOT, "pkg", "other", "thing.py"),
  top: join(ROOT, "top.py"),
};

function map() {
  return buildPythonModuleMap(Object.values(F), [ROOT]);
}

describe("resolvePythonImport — import statements (AC-2)", () => {
  test("absolute import resolves directly by full dotted path", () => {
    const imp: PythonImport = { kind: "import", line: 1, modules: [{ segments: ["pkg", "sub", "mod"], alias: null, binding: "pkg" }] };
    const result = resolvePythonImport(F.top, imp, map());
    expect(result).toEqual([{ file: F.mod, binding: "pkg" }]);
  });

  test("nonexistent absolute import resolves to null, not a throw", () => {
    const imp: PythonImport = { kind: "import", line: 1, modules: [{ segments: ["nope", "here"], alias: null, binding: "nope" }] };
    const result = resolvePythonImport(F.top, imp, map());
    expect(result).toEqual([{ file: null, binding: "nope" }]);
  });
});

describe("resolvePythonImport — from-import, absolute (AC-2)", () => {
  test("submodule-first: name resolves to the submodule file when it exists", () => {
    const imp: PythonImport = {
      kind: "from",
      line: 1,
      relativeDots: 0,
      moduleSegments: ["pkg", "sub"],
      isStar: false,
      names: [{ name: "mod", alias: null, binding: "mod" }],
    };
    const result = resolvePythonImport(F.top, imp, map());
    expect(result).toEqual([{ file: F.mod, binding: "mod" }]);
  });

  test("package fallback: name that isn't a submodule resolves to the package's __init__.py", () => {
    const imp: PythonImport = {
      kind: "from",
      line: 1,
      relativeDots: 0,
      moduleSegments: ["pkg", "sub"],
      isStar: false,
      names: [{ name: "some_symbol", alias: null, binding: "some_symbol" }],
    };
    const result = resolvePythonImport(F.top, imp, map());
    expect(result).toEqual([{ file: F.subInit, binding: "some_symbol" }]);
  });

  test("unresolvable base module resolves every name to null", () => {
    const imp: PythonImport = {
      kind: "from",
      line: 1,
      relativeDots: 0,
      moduleSegments: ["ghost"],
      isStar: false,
      names: [{ name: "x", alias: null, binding: "x" }],
    };
    expect(resolvePythonImport(F.top, imp, map())).toEqual([{ file: null, binding: "x" }]);
  });
});

describe("resolvePythonImport — from-import, relative (AC-3)", () => {
  test("single dot from a plain module resolves relative to its own containing package", () => {
    const imp: PythonImport = { kind: "from", line: 1, relativeDots: 1, moduleSegments: [], isStar: false, names: [{ name: "sibling", alias: null, binding: "sibling" }] };
    const result = resolvePythonImport(F.mod, imp, map());
    expect(result).toEqual([{ file: F.sibling, binding: "sibling" }]);
  });

  test("single dot from __init__.py resolves relative to the same package (not its parent)", () => {
    const imp: PythonImport = { kind: "from", line: 1, relativeDots: 1, moduleSegments: [], isStar: false, names: [{ name: "mod", alias: null, binding: "mod" }] };
    const result = resolvePythonImport(F.subInit, imp, map());
    expect(result).toEqual([{ file: F.mod, binding: "mod" }]);
  });

  test("double dot walks one package level above the importing module's own package", () => {
    const imp: PythonImport = { kind: "from", line: 1, relativeDots: 2, moduleSegments: [], isStar: false, names: [{ name: "utils", alias: null, binding: "utils" }] };
    const result = resolvePythonImport(F.mod, imp, map());
    expect(result).toEqual([{ file: F.utils, binding: "utils" }]);
  });

  test("dots plus a trailing package name (`from ..other import thing`)", () => {
    const imp: PythonImport = { kind: "from", line: 1, relativeDots: 2, moduleSegments: ["other"], isStar: false, names: [{ name: "thing", alias: null, binding: "thing" }] };
    const result = resolvePythonImport(F.mod, imp, map());
    expect(result).toEqual([{ file: F.otherThing, binding: "thing" }]);
  });

  test("relative import walking above the topmost known package resolves to null, not a crash", () => {
    const imp: PythonImport = { kind: "from", line: 1, relativeDots: 5, moduleSegments: [], isStar: false, names: [{ name: "x", alias: null, binding: "x" }] };
    expect(() => resolvePythonImport(F.mod, imp, map())).not.toThrow();
    expect(resolvePythonImport(F.mod, imp, map())).toEqual([{ file: null, binding: "x" }]);
  });
});

describe("resolvePythonImport — aliasing (AC-5)", () => {
  test("aliased from-import name carries the alias as the binding", () => {
    const imp: PythonImport = {
      kind: "from",
      line: 1,
      relativeDots: 0,
      moduleSegments: ["pkg", "sub"],
      isStar: false,
      names: [{ name: "mod", alias: "m", binding: "m" }],
    };
    const result = resolvePythonImport(F.top, imp, map());
    expect(result).toEqual([{ file: F.mod, binding: "m" }]);
  });
});

describe("resolvePythonImport — star imports", () => {
  test("`from x import *` resolves the module itself with a `*` binding", () => {
    const imp: PythonImport = { kind: "from", line: 1, relativeDots: 0, moduleSegments: ["pkg", "sub"], isStar: true, names: [] };
    const result = resolvePythonImport(F.top, imp, map());
    expect(result).toEqual([{ file: F.subInit, binding: "*" }]);
  });
});
