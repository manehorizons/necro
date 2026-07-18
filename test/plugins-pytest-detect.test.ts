import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createRepoContext } from "../src/plugins/registry.js";
import { createPytestPlugin } from "../src/plugins/pytest/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-pytest-plugin-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

const ctxFor = () => createRepoContext(dir);

describe("createPytestPlugin — detect (AC-2)", () => {
  test("AC-2: detected via pyproject.toml [project.dependencies]", async () => {
    await write("pyproject.toml", '[project]\ndependencies = ["pytest"]\n');
    expect(createPytestPlugin().detect(await ctxFor())).toBe(true);
  });

  test("AC-2: detected via requirements.txt", async () => {
    await write("requirements.txt", "pytest>=7.0\n");
    expect(createPytestPlugin().detect(await ctxFor())).toBe(true);
  });

  test("AC-2: detected via a root-level pytest.ini", async () => {
    await write("pytest.ini", "[pytest]\n");
    expect(createPytestPlugin().detect(await ctxFor())).toBe(true);
  });

  test("AC-2: detected via [tool.pytest.ini_options] in pyproject.toml", async () => {
    await write("pyproject.toml", '[tool.pytest.ini_options]\naddopts = "-v"\n');
    expect(createPytestPlugin().detect(await ctxFor())).toBe(true);
  });

  test("AC-2: not detected without any pytest signal", async () => {
    await write("pyproject.toml", '[project]\ndependencies = ["click"]\n');
    expect(createPytestPlugin().detect(await ctxFor())).toBe(false);
  });
});

describe("createPytestPlugin — entryPatterns (AC-2)", () => {
  test("AC-2: contributes test_*.py, *_test.py, and tests/** as test-kind globs", async () => {
    const patterns = createPytestPlugin().entryPatterns(await ctxFor());
    expect(patterns).toContainEqual({ glob: "**/test_*.py", kind: "test" });
    expect(patterns).toContainEqual({ glob: "**/*_test.py", kind: "test" });
    expect(patterns).toContainEqual({ glob: "**/tests/**", kind: "test" });
  });
});
