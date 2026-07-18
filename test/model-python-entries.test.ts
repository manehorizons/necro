import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { buildReachabilityModel } from "../src/engine/model.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-model-entries-"));
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

describe("buildReachabilityModel — Python entry-point wiring (AC-6)", () => {
  test("AC-6: a manage.py-only Python repo with zero NecroConfig.entries is not entry-collapsed", async () => {
    const manage = await write("manage.py", "def main(): pass\n\nmain()\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    expect(model.entryResolution.collapsed).toBe(false);
    expect(model.entryResolution.sources).toContainEqual({ file: "manage.py", source: "convention" });
    expect(model.prodEntries.has(manage)).toBe(true);
  });

  test("AC-6: a pyproject.toml script entry surfaces in entryResolution.sources with source pyproject-scripts", async () => {
    await write("pyproject.toml", '[project.scripts]\nmycli = "pkg.cli:main"\n');
    const cli = await write("pkg/cli.py", "def main(): pass\n");
    await write("pkg/__init__.py", "");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    expect(model.entryResolution.sources).toContainEqual({ file: "pkg/cli.py", source: "pyproject-scripts" });
    expect(model.prodEntries.has(cli)).toBe(true);
  });

  test("AC-6: a conftest.py-only repo (no other entry mechanism) is entry-collapsed — conftest roots into testEntries, not prodEntries", async () => {
    await write("conftest.py", "import pytest\n\ndef fixture_helper():\n    pass\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    expect(model.entryResolution.collapsed).toBe(true);
  });
});
