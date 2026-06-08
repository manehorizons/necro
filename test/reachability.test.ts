import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildSymbolGraph } from "../src/graph/symbol-graph.js";
import {
  computeReachability,
  findTaintedFiles,
} from "../src/analyze/reachability.js";
import type { ReachabilityResult } from "../src/analyze/reachability.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-reach-"));
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

function verdictOf(results: ReachabilityResult[], name: string): string {
  const r = results.find((x) => x.id.endsWith(`:${name}`));
  if (!r) throw new Error(`no result for ${name}`);
  return r.reachability;
}

describe("computeReachability (two-color)", () => {
  test("classifies alive, test-only, and dead", async () => {
    const index = await write(
      "src/index.ts",
      `import { liveUtil } from "./util";\nliveUtil();\n`,
    );
    const util = await write(
      "src/util.ts",
      `export function liveUtil() {}\nexport function testUtil() {}\n`,
    );
    const spec = await write(
      "src/util.test.ts",
      `import { testUtil } from "./util";\ntestUtil();\n`,
    );
    await write("src/orphan.ts", `export function orphan() {}\n`);

    const graph = buildSymbolGraph([
      index,
      util,
      spec,
      join(dir, "src/orphan.ts"),
    ]);

    const results = computeReachability({
      nodes: graph.nodes,
      edges: graph.edges,
      prodEntries: new Set([index]),
      testEntries: new Set([spec]),
    });

    expect(verdictOf(results, "liveUtil")).toBe("alive");
    expect(verdictOf(results, "testUtil")).toBe("test-only");
    expect(verdictOf(results, "orphan")).toBe("dead");
  });

  test("marks nodes in tainted files", () => {
    const results = computeReachability({
      nodes: [
        { id: "x.ts:1:a", name: "a", file: "x.ts", line: 1, exported: false },
      ],
      edges: [],
      prodEntries: new Set(),
      testEntries: new Set(),
      taintedFiles: new Set(["x.ts"]),
    });
    expect(results[0]?.tainted).toBe(true);
  });
});

describe("findTaintedFiles", () => {
  test("flags files with a non-literal dynamic import", () => {
    const tainted = findTaintedFiles([
      { file: "dyn.ts", text: "const m = await import(`./${name}`);" },
      { file: "clean.ts", text: 'import { x } from "./x";' },
    ]);
    expect(tainted.has("dyn.ts")).toBe(true);
    expect(tainted.has("clean.ts")).toBe(false);
  });
});
