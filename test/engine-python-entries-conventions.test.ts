import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePythonEntries } from "../src/engine/python-entries.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-entries-conventions-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function resolve(files: string[]) {
  const roots = detectImportRoots(dir, files);
  const map = buildPythonModuleMap(files, roots);
  return resolvePythonEntries(dir, files, map);
}

describe("resolvePythonEntries — conventional filenames (AC-5)", () => {
  test.each(["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py"])("AC-5: %s roots as a prod entry, source convention", async (name) => {
    await write(`pkg/${name}`, "x = 1\n");
    const files = [join(dir, "pkg", name)];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", name))).toBe(true);
    expect(result.records).toContainEqual({ file: join(dir, "pkg", name), source: "convention" });
  });

  test("AC-5: conftest.py roots into testEntries, not entries", async () => {
    await write("pkg/conftest.py", "import pytest\n");
    const files = [join(dir, "pkg", "conftest.py")];

    const result = await resolve(files);
    expect(result.testEntries.has(join(dir, "pkg", "conftest.py"))).toBe(true);
    expect(result.entries.has(join(dir, "pkg", "conftest.py"))).toBe(false);
  });

  test("AC-5: an unrelated filename is not rooted by convention matching", async () => {
    await write("pkg/utils.py", "x = 1\n");
    const files = [join(dir, "pkg", "utils.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
    expect(result.testEntries.size).toBe(0);
  });
});
