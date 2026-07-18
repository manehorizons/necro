import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePythonEntries } from "../src/engine/python-entries.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-entries-setuppy-"));
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

describe("resolvePythonEntries — setup.py literal console_scripts (AC-3)", () => {
  test("AC-3: a literal entry_points={\"console_scripts\": [...]} list resolves each entry", async () => {
    await write(
      "setup.py",
      ['from setuptools import setup', "", "setup(", "    name='pkg',", "    entry_points={", '        "console_scripts": [', '            "foo_cli=pkg.cli:main",', "        ],", "    },", ")"].join(
        "\n",
      ),
    );
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "setup.py"), join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "cli.py"))).toBe(true);
    expect(result.records).toContainEqual({ file: join(dir, "pkg", "cli.py"), source: "setup-config" });
  });

  test("AC-3: setuptools.setup(...) attribute-call form is also recognized", async () => {
    await write(
      "setup.py",
      [
        "import setuptools",
        "",
        "setuptools.setup(",
        "    entry_points={",
        '        "console_scripts": ["foo_cli=pkg.cli:main"],',
        "    },",
        ")",
      ].join("\n"),
    );
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "setup.py"), join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "cli.py"))).toBe(true);
  });

  test("AC-3: a dynamic entry_points value (a variable) is skipped honestly, not evaluated or crashed on", async () => {
    await write(
      "setup.py",
      ["from setuptools import setup", "", "eps = compute_entry_points()", "", "setup(", "    entry_points=eps,", ")"].join("\n"),
    );
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "setup.py"), join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });

  test("AC-3: a non-console_scripts key in entry_points is ignored", async () => {
    await write(
      "setup.py",
      ["from setuptools import setup", "", "setup(", "    entry_points={", '        "other_group": ["foo=pkg.cli:main"],', "    },", ")"].join(
        "\n",
      ),
    );
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "setup.py"), join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });

  test("groundwork (T1): no setup.py present is a no-op, not an error", async () => {
    await write("pkg/cli.py", "def main(): pass\n");
    const files = [join(dir, "pkg", "cli.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });
});
