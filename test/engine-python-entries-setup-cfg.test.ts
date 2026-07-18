import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePythonEntries } from "../src/engine/python-entries.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-entries-setupcfg-"));
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

describe("resolvePythonEntries — setup.cfg [options.entry_points] (AC-2)", () => {
  test("AC-2: multi-line indented console_scripts block resolves each entry", async () => {
    await write(
      "setup.cfg",
      ["[options.entry_points]", "console_scripts =", "    foo_cli = pkg.cli:main", "    bar_cli = pkg.other:run"].join("\n"),
    );
    await write("pkg/cli.py", "def main(): pass\n");
    await write("pkg/other.py", "def run(): pass\n");
    const files = [join(dir, "pkg", "cli.py"), join(dir, "pkg", "other.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "cli.py"))).toBe(true);
    expect(result.entries.has(join(dir, "pkg", "other.py"))).toBe(true);
    expect(result.records).toContainEqual({ file: join(dir, "pkg", "cli.py"), source: "setup-config" });
  });

  test("AC-2: single-line console_scripts = name = pkg.mod:func also resolves", async () => {
    await write("setup.cfg", ["[options.entry_points]", "console_scripts ="].join("\n") + "\n    solo = pkg.solo:main\n");
    await write("pkg/solo.py", "def main(): pass\n");
    const files = [join(dir, "pkg", "solo.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "solo.py"))).toBe(true);
  });

  test("AC-2: a key=value pair outside [options.entry_points] is ignored", async () => {
    await write("setup.cfg", ["[metadata]", "name = pkg.cli:main"].join("\n"));
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });

  test("groundwork (T1): no setup.cfg present is a no-op, not an error", async () => {
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });
});
