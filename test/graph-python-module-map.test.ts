import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

const ROOT = "/repo";

describe("detectImportRoots (AC-4)", () => {
  test("flat layout: files directly under repo root -> root is repo root", () => {
    const files = [join(ROOT, "pkg", "__init__.py"), join(ROOT, "pkg", "mod.py")];
    expect(detectImportRoots(ROOT, files)).toEqual([ROOT]);
  });

  test("src layout: all files under a lone top-level src/ dir, nothing at repo root -> root is src", () => {
    const files = [join(ROOT, "src", "pkg", "__init__.py"), join(ROOT, "src", "pkg", "mod.py")];
    expect(detectImportRoots(ROOT, files)).toEqual([join(ROOT, "src")]);
  });

  test("mixed/ambiguous layout (files both at root and under src/) degrades to repo root", () => {
    const files = [join(ROOT, "top.py"), join(ROOT, "src", "pkg", "mod.py")];
    expect(detectImportRoots(ROOT, files)).toEqual([ROOT]);
  });
});

describe("buildPythonModuleMap (AC-1, AC-4)", () => {
  test("regular package: __init__.py maps to the package's own dotted path", () => {
    const files = [join(ROOT, "pkg", "sub", "__init__.py"), join(ROOT, "pkg", "sub", "mod.py")];
    const map = buildPythonModuleMap(files, [ROOT]);
    expect(map.fileToModule.get(join(ROOT, "pkg", "sub", "__init__.py"))).toBe("pkg.sub");
    expect(map.fileToModule.get(join(ROOT, "pkg", "sub", "mod.py"))).toBe("pkg.sub.mod");
  });

  test("dotted path resolves back to its originating file (bidirectional)", () => {
    const files = [join(ROOT, "pkg", "sub", "mod.py")];
    const map = buildPythonModuleMap(files, [ROOT]);
    expect(map.moduleToFile.get("pkg.sub.mod")).toBe(join(ROOT, "pkg", "sub", "mod.py"));
  });

  test("top-level plain module (no package)", () => {
    const files = [join(ROOT, "app.py")];
    const map = buildPythonModuleMap(files, [ROOT]);
    expect(map.fileToModule.get(join(ROOT, "app.py"))).toBe("app");
    expect(map.moduleToFile.get("app")).toBe(join(ROOT, "app.py"));
  });

  test("src-layout: dotted path is relative to src/, not repo root", () => {
    const files = [join(ROOT, "src", "pkg", "mod.py")];
    const roots = detectImportRoots(ROOT, files);
    const map = buildPythonModuleMap(files, roots);
    expect(map.fileToModule.get(join(ROOT, "src", "pkg", "mod.py"))).toBe("pkg.mod");
    expect(map.moduleToFile.has("src.pkg.mod")).toBe(false);
  });

  test("file outside every import root is skipped, not thrown", () => {
    const files = [join(ROOT, "pkg", "mod.py"), "/elsewhere/stray.py"];
    const map = buildPythonModuleMap(files, [ROOT]);
    expect(map.fileToModule.has("/elsewhere/stray.py")).toBe(false);
    expect(map.fileToModule.get(join(ROOT, "pkg", "mod.py"))).toBe("pkg.mod");
  });
});
