import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";
import { buildReachabilityModel } from "../src/engine/model.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-engine-"));
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

describe("scan", () => {
  test("returns no findings for an empty directory", async () => {
    const result = await scan(dir, DEFAULT_CONFIG);
    expect(result.findings).toEqual([]);
  });

  test("AC-4: scan still reports the dead orphan after model extraction", async () => {
    await write("src/index.ts", `import { live } from "./util";\nlive();\n`);
    await write(
      "src/util.ts",
      `export function live() {}\nexport function orphan() {}\n`,
    );
    const result = await scan(dir, DEFAULT_CONFIG);
    expect(result.findings.some((f) => f.node.id.endsWith(":orphan"))).toBe(true);
    expect(result.findings.some((f) => f.node.id.endsWith(":live"))).toBe(false);
  });
});

describe("buildReachabilityModel", () => {
  test("AC-4: classifies reachability and exposes graph + prod entries", async () => {
    const index = await write(
      "src/index.ts",
      `import { live } from "./util";\nlive();\n`,
    );
    await write(
      "src/util.ts",
      `export function live() {}\nexport function orphan() {}\n`,
    );

    const model = await buildReachabilityModel(dir, DEFAULT_CONFIG);

    const verdict = (name: string) =>
      model.reachability.find((r) => r.id.endsWith(`:${name}`))?.reachability;
    expect(verdict("live")).toBe("alive");
    expect(verdict("orphan")).toBe("dead");
    expect(model.prodEntries.has(index)).toBe(true);
    expect(model.graph.nodes.some((n) => n.id.endsWith(":live"))).toBe(true);
  });
});
