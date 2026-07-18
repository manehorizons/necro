import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePythonEntries } from "../src/engine/python-entries.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-entries-pyproject-"));
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

describe("resolvePythonEntries — pyproject.toml script tables (AC-1)", () => {
  test("AC-1: [project.scripts] resolves a pkg.module:func spec to its file", async () => {
    await write("pyproject.toml", '[project.scripts]\nmycli = "pkg.cli:main"\n');
    await write("pkg/cli.py", "def main(): pass\n");
    await write("pkg/__init__.py", "");
    const files = [join(dir, "pkg", "cli.py"), join(dir, "pkg", "__init__.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "cli.py"))).toBe(true);
    expect(result.records).toContainEqual({ file: join(dir, "pkg", "cli.py"), source: "pyproject-scripts" });
  });

  test("AC-1: [project.gui-scripts] resolves the same way as [project.scripts]", async () => {
    await write("pyproject.toml", '[project.gui-scripts]\nmygui = "pkg.gui:launch"\n');
    await write("pkg/gui.py", "def launch(): pass\n");
    const files = [join(dir, "pkg", "gui.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "gui.py"))).toBe(true);
  });

  test('AC-1: a quoted-subkey [project.entry-points."group.name"] table resolves', async () => {
    await write("pyproject.toml", '[project.entry-points."flake8.extension"]\nX1 = "pkg.plugin:Checker"\n');
    await write("pkg/plugin.py", "class Checker: pass\n");
    const files = [join(dir, "pkg", "plugin.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "plugin.py"))).toBe(true);
    expect(result.records).toContainEqual({ file: join(dir, "pkg", "plugin.py"), source: "pyproject-scripts" });
  });

  test("AC-1: a spec with no matching file in the scanned tree is silently skipped, not an error", async () => {
    await write("pyproject.toml", '[project.scripts]\nmycli = "pkg.missing:main"\n');
    const files: string[] = [];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });

  test("groundwork (T1): an unrelated multiline array elsewhere in the file does not break extraction", async () => {
    await write(
      "pyproject.toml",
      [
        "[project]",
        'dependencies = [',
        '  "requests",',
        '  "click",',
        "]",
        "",
        "[project.scripts]",
        'mycli = "pkg.cli:main"',
      ].join("\n"),
    );
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "cli.py"))).toBe(true);
  });

  test("groundwork (T1): no pyproject.toml present is a no-op, not an error", async () => {
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });
});
