import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { buildReachabilityModel } from "../src/engine/model.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-pytest-entries-"));
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

describe("buildReachabilityModel — test-entry-file symbol rooting (AC-3)", () => {
  test("AC-3: a pytest test_*.py file's top-level exported function is rooted in testEntries", async () => {
    await write("pyproject.toml", '[project]\ndependencies = ["pytest"]\n');
    const testFn = await write("test_things.py", "def test_something():\n    assert True\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    const node = model.graph.nodes.find((n) => n.name === "test_something");
    expect(node).toBeDefined();
    expect(model.testEntries.has(node?.id ?? "")).toBe(true);
    expect(testFn).toBeTruthy();
  });

  test("AC-3: a JS test file's top-level exported helper is also rooted (language-neutral fix)", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { vitest: "^2.0.0" } }));
    await write("src/util.spec.ts", "export function unusedHelper() { return 1; }\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.ts"] };

    const model = await buildReachabilityModel(dir, config);
    const node = model.graph.nodes.find((n) => n.name === "unusedHelper");
    expect(node).toBeDefined();
    expect(model.testEntries.has(node?.id ?? "")).toBe(true);
  });
});
