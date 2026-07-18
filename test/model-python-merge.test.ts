import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { buildReachabilityModel } from "../src/engine/model.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-merge-"));
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

describe("buildReachabilityModel — mixed-language merge (AC-5)", () => {
  test("both TS and Python nodes appear in the merged graph with no id collision", async () => {
    const tsFile = await write("src/index.ts", "export function tsFn() { return 1; }\n");
    const pyFile = await write("pkg/mod.py", "def py_fn():\n    pass\n");
    await write("necro.config.json", JSON.stringify({ include: ["**/*.ts", "**/*.py"] }));
    const config = { ...DEFAULT_CONFIG, include: ["**/*.ts", "**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    const names = model.graph.nodes.map((n) => n.name).sort();
    expect(names).toContain("tsFn");
    expect(names).toContain("py_fn");

    const ids = model.graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length); // no collisions

    const tsNode = model.graph.nodes.find((n) => n.name === "tsFn");
    const pyNode = model.graph.nodes.find((n) => n.name === "py_fn");
    expect(tsNode?.file).toBe(tsFile);
    expect(pyNode?.file).toBe(pyFile);
  });

  test("a Python-only target still produces a valid model with no TS files", async () => {
    await write("mod.py", "def only_py():\n    pass\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };
    const model = await buildReachabilityModel(dir, config);
    expect(model.graph.nodes.some((n) => n.name === "only_py")).toBe(true);
  });
});
