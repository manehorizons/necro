import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-pytest-scan-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

describe("necro scan — pytest entries resolve test-only (AC-4)", () => {
  test("AC-4: a zero-prod-ref pytest test function is test-only, not a likely-tier dead finding", async () => {
    await write("pyproject.toml", '[project]\ndependencies = ["pytest"]\n');
    await write("test_things.py", "def test_something():\n    assert True\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const { findings } = await scan(dir, config);
    const finding = findings.find((f) => f.node.name === "test_something");
    expect(finding).toBeDefined();
    expect(finding?.verdict).toBe("test-only");
  });

  test("AC-4: without pytest detected, the same file falls back to phase 45's exported exemption (likely, not test-only)", async () => {
    // A prod entry (phase 46's `app.py` convention) keeps entryResolution from
    // collapsing, so the assertion below isolates the `test_` exemption's own
    // tier choice rather than the unrelated zero-entries "maybe" override.
    await write("app.py", "def main():\n    pass\n");
    await write("test_things.py", "def test_something():\n    assert True\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const { findings } = await scan(dir, config);
    const finding = findings.find((f) => f.node.name === "test_something");
    expect(finding).toBeDefined();
    expect(finding?.verdict).toBe("dead");
    expect(finding?.tier).toBe("likely");
  });
});
