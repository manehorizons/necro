import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { buildReachabilityModel } from "../src/engine/model.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-library-"));
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

describe("buildReachabilityModel — Python library publicApiIds (AC-5, AC-6)", () => {
  test("AC-5, AC-6: [project] + [build-system] both present -> every exported Python symbol quarantines", async () => {
    await write("pyproject.toml", '[project]\nname = "pkg"\n\n[build-system]\nrequires = ["setuptools"]\n');
    await write("pkg/core.py", "def public_fn():\n    pass\n\ndef _private_fn():\n    pass\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    const publicNode = model.graph.nodes.find((n) => n.name === "public_fn");
    const privateNode = model.graph.nodes.find((n) => n.name === "_private_fn");
    expect(publicNode).toBeDefined();
    expect(model.publicApiIds.has(publicNode?.id ?? "")).toBe(true);
    expect(model.publicApiIds.has(privateNode?.id ?? "")).toBe(false);
  });

  test("AC-5: only [project] present (no build-system) -> not a library, publicApiIds empty", async () => {
    await write("pyproject.toml", '[project]\nname = "pkg"\n');
    await write("pkg/core.py", "def public_fn():\n    pass\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    expect(model.publicApiIds.size).toBe(0);
  });

  test("AC-5: only [build-system] present (no project table) -> not a library, publicApiIds empty", async () => {
    await write("pyproject.toml", '[build-system]\nrequires = ["setuptools"]\n');
    await write("pkg/core.py", "def public_fn():\n    pass\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };

    const model = await buildReachabilityModel(dir, config);
    expect(model.publicApiIds.size).toBe(0);
  });

  test("AC-7: a TS-only repo is unaffected — publicApiIds stays empty", async () => {
    await write("src/index.ts", "export function tsFn() { return 1; }\n");
    const config = { ...DEFAULT_CONFIG, include: ["**/*.ts"] };

    const model = await buildReachabilityModel(dir, config);
    expect(model.publicApiIds.size).toBe(0);
  });
});
