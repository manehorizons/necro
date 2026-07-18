import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { pyprojectHasSection, readPythonDependencyNames } from "../src/plugins/python-manifest.js";
import { createRepoContext } from "../src/plugins/registry.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-manifest-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

describe("readPythonDependencyNames (AC-1)", () => {
  test("AC-1: inline [project.dependencies] array", async () => {
    await write("pyproject.toml", '[project]\ndependencies = ["pytest>=7.0", "click"]\n');
    const names = readPythonDependencyNames(dir);
    expect(names.has("pytest")).toBe(true);
    expect(names.has("click")).toBe(true);
  });

  test("AC-1: multi-line [project.dependencies] array", async () => {
    await write("pyproject.toml", ["[project]", "dependencies = [", '    "pytest>=7.0",', '    "requests[security]==2.0",', "]"].join("\n"));
    const names = readPythonDependencyNames(dir);
    expect(names.has("pytest")).toBe(true);
    expect(names.has("requests")).toBe(true);
  });

  test("AC-1: dependencies outside [project] are ignored", async () => {
    await write("pyproject.toml", '[tool.other]\ndependencies = ["not-a-real-dep"]\n');
    const names = readPythonDependencyNames(dir);
    expect(names.has("not-a-real-dep")).toBe(false);
  });

  test("AC-1: requirements.txt lines, with comments/blanks/version specifiers stripped", async () => {
    await write("requirements.txt", ["pytest>=7.0", "# a comment", "", "click==8.1.0", "-e .", "-r other.txt"].join("\n"));
    const names = readPythonDependencyNames(dir);
    expect(names.has("pytest")).toBe(true);
    expect(names.has("click")).toBe(true);
    expect(names.size).toBe(2);
  });

  test("AC-1: no pyproject.toml or requirements.txt is a no-op, not an error", async () => {
    const names = readPythonDependencyNames(dir);
    expect(names.size).toBe(0);
  });
});

describe("pyprojectHasSection (AC-1)", () => {
  test("AC-1: an exact top-level [header] match is true", async () => {
    await write("pyproject.toml", "[project]\nname = \"pkg\"\n\n[build-system]\nrequires = []\n");
    expect(pyprojectHasSection(dir, "project")).toBe(true);
    expect(pyprojectHasSection(dir, "build-system")).toBe(true);
  });

  test("AC-1: a dotted subtable does not satisfy its parent header", async () => {
    await write("pyproject.toml", '[project.scripts]\nmycli = "pkg.cli:main"\n');
    expect(pyprojectHasSection(dir, "project")).toBe(false);
  });

  test("AC-1: a nested dotted header matches exactly", async () => {
    await write("pyproject.toml", "[tool.pytest.ini_options]\naddopts = \"-v\"\n");
    expect(pyprojectHasSection(dir, "tool.pytest.ini_options")).toBe(true);
  });

  test("AC-1: no pyproject.toml is false, not an error", async () => {
    expect(pyprojectHasSection(dir, "project")).toBe(false);
  });
});

describe("createRepoContext — Python-manifest wiring (AC-1)", () => {
  test("AC-1: hasDep sees a Python dependency from pyproject.toml", async () => {
    await write("pyproject.toml", '[project]\ndependencies = ["pytest"]\n');
    const ctx = await createRepoContext(dir);
    expect(ctx.hasDep(["pytest"])).toBe(true);
  });

  test("AC-1: hasDep sees a Python dependency from requirements.txt", async () => {
    await write("requirements.txt", "pytest>=7.0\n");
    const ctx = await createRepoContext(dir);
    expect(ctx.hasDep(["pytest"])).toBe(true);
  });

  test("AC-1: pyprojectHas is exposed on the RepoContext", async () => {
    await write("pyproject.toml", "[build-system]\nrequires = []\n");
    const ctx = await createRepoContext(dir);
    expect(ctx.pyprojectHas("build-system")).toBe(true);
    expect(ctx.pyprojectHas("project")).toBe(false);
  });

  test("AC-1: a TS-only repo (no pyproject.toml) is unaffected", async () => {
    await write("package.json", JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    const ctx = await createRepoContext(dir);
    expect(ctx.hasDep(["react"])).toBe(true);
    expect(ctx.hasDep(["pytest"])).toBe(false);
    expect(ctx.pyprojectHas("project")).toBe(false);
  });
});
