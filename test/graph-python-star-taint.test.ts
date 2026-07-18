import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildPythonSymbolGraph } from "../src/graph/python/symbol-graph.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-startaint-"));
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

describe("buildPythonSymbolGraph — star-import taint (AC-4)", () => {
  test("a file with `from x import *` is added to starTaintedFiles", async () => {
    const mod = await write("mod.py", "def helper():\n    pass\n");
    const app = await write("app.py", "from mod import *\n");
    const files = [mod, app];
    const roots = detectImportRoots(dir, files);
    const moduleMap = buildPythonModuleMap(files, roots);
    const { starTaintedFiles } = await buildPythonSymbolGraph(files, moduleMap);
    expect(starTaintedFiles.has(app)).toBe(true);
    expect(starTaintedFiles.has(mod)).toBe(false);
  });

  test("a file with only ordinary imports is not star-tainted", async () => {
    const mod = await write("mod.py", "def helper():\n    pass\n");
    const app = await write("app.py", "from mod import helper\n");
    const files = [mod, app];
    const roots = detectImportRoots(dir, files);
    const moduleMap = buildPythonModuleMap(files, roots);
    const { starTaintedFiles } = await buildPythonSymbolGraph(files, moduleMap);
    expect(starTaintedFiles.size).toBe(0);
  });
});
