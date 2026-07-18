import { describe, expect, test } from "vitest";
import { parsePythonImports } from "../src/graph/python/import-parser.js";

describe("parsePythonImports (AC-2, AC-3, AC-5 parsing half)", () => {
  test("plain absolute import binds the top-level segment", async () => {
    const imports = await parsePythonImports("mod.py", "import a.b.c\n");
    expect(imports).toEqual([
      {
        kind: "import",
        line: 1,
        modules: [{ segments: ["a", "b", "c"], alias: null, binding: "a" }],
      },
    ]);
  });

  test("aliased absolute import binds the alias", async () => {
    const imports = await parsePythonImports("mod.py", "import a.b as x\n");
    expect(imports).toEqual([
      {
        kind: "import",
        line: 1,
        modules: [{ segments: ["a", "b"], alias: "x", binding: "x" }],
      },
    ]);
  });

  test("comma-separated import statement yields multiple independent modules", async () => {
    const imports = await parsePythonImports("mod.py", "import a.b, c.d as e\n");
    expect(imports).toEqual([
      {
        kind: "import",
        line: 1,
        modules: [
          { segments: ["a", "b"], alias: null, binding: "a" },
          { segments: ["c", "d"], alias: "e", binding: "e" },
        ],
      },
    ]);
  });

  test("from-import with mixed plain and aliased names", async () => {
    const imports = await parsePythonImports("mod.py", "from x.y import a, b as c\n");
    expect(imports).toEqual([
      {
        kind: "from",
        line: 1,
        relativeDots: 0,
        moduleSegments: ["x", "y"],
        isStar: false,
        names: [
          { name: "a", alias: null, binding: "a" },
          { name: "b", alias: "c", binding: "c" },
        ],
      },
    ]);
  });

  test("parenthesized multi-line from-import", async () => {
    const imports = await parsePythonImports("mod.py", "from x import (\n    a,\n    b,\n)\n");
    expect(imports).toEqual([
      {
        kind: "from",
        line: 1,
        relativeDots: 0,
        moduleSegments: ["x"],
        isStar: false,
        names: [
          { name: "a", alias: null, binding: "a" },
          { name: "b", alias: null, binding: "b" },
        ],
      },
    ]);
  });

  test("single-dot relative import with no trailing module", async () => {
    const imports = await parsePythonImports("mod.py", "from . import x\n");
    expect(imports).toEqual([
      {
        kind: "from",
        line: 1,
        relativeDots: 1,
        moduleSegments: [],
        isStar: false,
        names: [{ name: "x", alias: null, binding: "x" }],
      },
    ]);
  });

  test("multi-dot relative import with a trailing package", async () => {
    const imports = await parsePythonImports("mod.py", "from ..pkg import y\n");
    expect(imports).toEqual([
      {
        kind: "from",
        line: 1,
        relativeDots: 2,
        moduleSegments: ["pkg"],
        isStar: false,
        names: [{ name: "y", alias: null, binding: "y" }],
      },
    ]);
  });

  test("deep relative import with dotted trailing package and alias", async () => {
    const imports = await parsePythonImports("mod.py", "from ...deep.pkg import w as ww\n");
    expect(imports).toEqual([
      {
        kind: "from",
        line: 1,
        relativeDots: 3,
        moduleSegments: ["deep", "pkg"],
        isStar: false,
        names: [{ name: "w", alias: "ww", binding: "ww" }],
      },
    ]);
  });

  test("star import sets isStar and yields no names", async () => {
    const imports = await parsePythonImports("mod.py", "from x import *\n");
    expect(imports).toEqual([
      {
        kind: "from",
        line: 1,
        relativeDots: 0,
        moduleSegments: ["x"],
        isStar: true,
        names: [],
      },
    ]);
  });

  test("multiple import statements report correct 1-based lines", async () => {
    const imports = await parsePythonImports("mod.py", "import a\n\nfrom b import c\n");
    expect(imports.map((i) => i.line)).toEqual([1, 3]);
  });

  test("non-import statements are ignored", async () => {
    const imports = await parsePythonImports("mod.py", "x = 1\ndef f():\n    import a\n");
    expect(imports).toHaveLength(1);
    expect(imports[0]?.line).toBe(3);
  });
});
