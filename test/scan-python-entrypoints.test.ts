import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-entrypoints-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/**
 * A synthetic Python repo exercising every entry-point mechanism from §2.3 at
 * once, with zero `NecroConfig.entries` configured:
 * - `pkg/cli.py`: rooted via `pyproject.toml` `[project.scripts]`.
 * - `pkg/other.py`: rooted via `setup.cfg` `[options.entry_points]`.
 * - `setup.py` itself declares a *dynamic* `entry_points` (a variable) —
 *   proving the skip-honestly path doesn't crash the rest of resolution
 *   (the literal-extraction path is covered directly in
 *   `engine-python-entries-setup-py.test.ts`; a single `setup.py` can't
 *   exercise both a literal and a dynamic `entry_points` argument at once).
 * - `pkg/__main__.py`: rooted unconditionally by filename.
 * - `runme.py`: rooted via a module-level `if __name__ == "__main__":` guard.
 * - `main.py`/`app.py`/`manage.py`/`wsgi.py`/`asgi.py`: rooted by convention.
 * - `conftest.py`: routed into test reachability, not prod.
 */
async function writeFixture(): Promise<void> {
  await write("pyproject.toml", '[project.scripts]\nmycli = "pkg.cli:main"\n');
  await write("setup.cfg", ["[options.entry_points]", "console_scripts =", "    foo_cli = pkg.other:run"].join("\n"));
  await write("setup.py", ["from setuptools import setup", "", "eps = discover_entry_points()", "", "setup(entry_points=eps)"].join("\n"));

  await write("pkg/__init__.py", "");
  await write("pkg/cli.py", "def main():\n    pass\n");
  await write("pkg/other.py", "def run():\n    pass\n");
  await write("pkg/__main__.py", "from pkg.cli import main\n\nmain()\n");

  await write("runme.py", ['def go():', "    pass", "", 'if __name__ == "__main__":', "    go()"].join("\n"));

  for (const name of ["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py"]) {
    await write(name, "x = 1\n");
  }
  await write("conftest.py", "import pytest\n\ndef fixture_helper():\n    pass\n");
}

describe("necro scan — Python entry-point resolution end-to-end (AC-7)", () => {
  test("AC-7: every mechanism roots its file; conftest.py stays out of prod entries; zero NecroConfig.entries needed", async () => {
    await writeFixture();
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const { diagnostics } = await scan(dir, config);
    const sources = diagnostics.entryResolution.sources;

    expect(diagnostics.entryResolution.collapsed).toBe(false);
    expect(sources).toContainEqual({ file: "pkg/cli.py", source: "pyproject-scripts" });
    expect(sources).toContainEqual({ file: "pkg/other.py", source: "setup-config" });
    expect(sources).toContainEqual({ file: "pkg/__main__.py", source: "dunder-main" });
    expect(sources).toContainEqual({ file: "runme.py", source: "dunder-main" });
    for (const name of ["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py"]) {
      expect(sources).toContainEqual({ file: name, source: "convention" });
    }
    expect(sources.some((s) => s.file === "conftest.py")).toBe(false);
  });
});
