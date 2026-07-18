import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { discoverFiles } from "../src/discover.js";
import { parsePythonImports } from "../src/graph/python/import-parser.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";
import { resolvePythonImport } from "../src/graph/python/resolve-import.js";

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "python-module-resolver");
const PY_CONFIG = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

/** End-to-end: discover real files on disk, build the module map, parse + resolve every import in `file`. */
async function resolveAllImportsIn(fixtureDir: string, file: string) {
  const root = join(FIXTURES_ROOT, fixtureDir);
  const files = await discoverFiles(root, PY_CONFIG);
  const roots = detectImportRoots(root, files);
  const map = buildPythonModuleMap(files, roots);
  const filePath = join(root, file);
  const source = await readFile(filePath, "utf8");
  const imports = await parsePythonImports(filePath, source);
  return imports.flatMap((imp) => resolvePythonImport(filePath, imp, map));
}

describe("Python module resolver — fixture trees (AC-6)", () => {
  test("regular package: `from pkg.sub import mod` resolves to the submodule file", async () => {
    const resolved = await resolveAllImportsIn("regular-package", "top.py");
    expect(resolved).toEqual([{ file: join(FIXTURES_ROOT, "regular-package", "pkg", "sub", "mod.py"), binding: "mod" }]);
  });

  test("deep relative imports: `from .. import sibling` and `from ... import utils` walk correctly from a 3-level-deep module", async () => {
    const resolved = await resolveAllImportsIn("deep-relative", join("pkg", "sub", "deep", "mod.py"));
    expect(resolved).toEqual([
      { file: join(FIXTURES_ROOT, "deep-relative", "pkg", "sub", "sibling.py"), binding: "sibling" },
      { file: join(FIXTURES_ROOT, "deep-relative", "pkg", "utils.py"), binding: "utils" },
    ]);
  });

  test("src-layout: `import pkg.mod` from src/app.py resolves relative to src/, not the repo root", async () => {
    const resolved = await resolveAllImportsIn("src-layout", join("src", "app.py"));
    expect(resolved).toEqual([{ file: join(FIXTURES_ROOT, "src-layout", "src", "pkg", "mod.py"), binding: "pkg" }]);
  });

  test("aliasing: both `import ... as` and `from ... import ... as` carry the alias as the binding", async () => {
    const resolved = await resolveAllImportsIn("aliasing", "app.py");
    expect(resolved).toEqual([
      { file: join(FIXTURES_ROOT, "aliasing", "pkg", "mod.py"), binding: "m" },
      { file: join(FIXTURES_ROOT, "aliasing", "pkg", "mod.py"), binding: "m2" },
    ]);
  });

  test("missing target: unresolvable imports resolve to null on every entry, no throw", async () => {
    const resolved = await resolveAllImportsIn("missing-target", "app.py");
    expect(resolved).toEqual([
      { file: null, binding: "totally" },
      { file: null, binding: "nothing" },
    ]);
  });
});
