import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-lib-scan-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

describe("necro scan — Python library publicApiIds quarantine (AC-6)", () => {
  test("AC-6: an exported symbol in a library package quarantines to maybe, never auto-fix eligible", async () => {
    // pyproject.toml declares both a [project.scripts] entry (so entryResolution
    // isn't collapsed — isolating the assertion to the quarantine mechanism)
    // and [build-system] (making this a detected library, AC-5).
    await write(
      "pyproject.toml",
      ['[project]', "name = \"pkg\"", 'dependencies = []', "", "[project.scripts]", 'mycli = "pkg.cli:main"', "", "[build-system]", 'requires = ["setuptools"]'].join(
        "\n",
      ),
    );
    await write("pkg/cli.py", "def main():\n    pass\n");
    await write("pkg/core.py", "def public_fn():\n    pass\n");

    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };
    const { findings, diagnostics } = await scan(dir, config);

    expect(diagnostics.entryResolution.collapsed).toBe(false);
    const finding = findings.find((f) => f.node.name === "public_fn");
    expect(finding).toBeDefined();
    expect(finding?.tier).toBe("maybe");
    expect(finding?.autoFixEligible).toBe(false);
    expect(finding?.evidence.some((e) => e.text.includes("exports"))).toBe(true);
  });

  test("AC-6: the same exported symbol in a non-library repo is not quarantined by this mechanism", async () => {
    await write("pyproject.toml", '[project]\nname = "pkg"\ndependencies = []\n\n[project.scripts]\nmycli = "pkg.cli:main"\n');
    await write("pkg/cli.py", "def main():\n    pass\n");
    await write("pkg/core.py", "def public_fn():\n    pass\n");

    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };
    const { findings } = await scan(dir, config);

    const finding = findings.find((f) => f.node.name === "public_fn");
    expect(finding).toBeDefined();
    expect(finding?.tier).toBe("likely");
  });
});
