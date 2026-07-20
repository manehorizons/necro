import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { computeReachability } from "../src/analyze/reachability.js";
import { buildSymbolGraph } from "../src/graph/symbol-graph.js";
import type { SymbolGraph, SymbolNode } from "../src/graph/types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-graph-"));
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

function nodeByName(graph: SymbolGraph, name: string): SymbolNode {
  const node = graph.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node;
}

function refCount(graph: SymbolGraph, name: string): number {
  const id = nodeByName(graph, name).id;
  return graph.edges.filter((e) => e.to === id).length;
}

describe("buildSymbolGraph", () => {
  test("counts references; unreferenced private symbol has zero", async () => {
    const main = await write(
      "src/main.ts",
      `import { used } from "./lib";\nused();\n`,
    );
    const lib = await write(
      "src/lib.ts",
      `export function used() {}\nfunction unused() {}\n`,
    );

    const graph = buildSymbolGraph([main, lib]);

    expect(refCount(graph, "unused")).toBe(0);
    expect(refCount(graph, "used")).toBeGreaterThanOrEqual(1);
  });

  test("barrel re-export does not count as a terminal reference", async () => {
    const a = await write("src/a.ts", `export function foo() {}\n`);
    const index = await write("src/index.ts", `export { foo } from "./a";\n`);

    const graph = buildSymbolGraph([a, index]);

    expect(refCount(graph, "foo")).toBe(0);
  });

  test("tags edges from test files as test-kind", async () => {
    const lib = await write("src/lib.ts", `export function helper() {}\n`);
    const spec = await write(
      "src/lib.test.ts",
      `import { helper } from "./lib";\nhelper();\n`,
    );

    const graph = buildSymbolGraph([lib, spec]);
    const id = nodeByName(graph, "helper").id;
    const edges = graph.edges.filter((e) => e.to === id);

    expect(edges.length).toBeGreaterThanOrEqual(1);
    expect(edges.every((e) => e.kind === "test")).toBe(true);
  });

  test("AC-1: module top-level reference stays reachable through a non-entry imported file", async () => {
    const entry = await write(
      "src/entry.ts",
      `import { aFunc } from "./moduleA";\naFunc();\n`,
    );
    const moduleA = await write(
      "src/moduleA.ts",
      `import { bFunc } from "./moduleB";\nexport function aFunc() {}\nbFunc();\n`,
    );
    const moduleB = await write(
      "src/moduleB.ts",
      `export function bFunc() {}\n`,
    );

    const graph = buildSymbolGraph([entry, moduleA, moduleB]);
    const aFuncId = nodeByName(graph, "aFunc").id;
    const bFuncId = nodeByName(graph, "bFunc").id;

    const reachability = computeReachability({
      nodes: graph.nodes,
      edges: graph.edges,
      prodEntries: new Set([aFuncId]),
      testEntries: new Set(),
    });

    expect(reachability.find((r) => r.id === bFuncId)?.reachability).toBe(
      "alive",
    );
  });

  test("AC-2: bare side-effect import keeps the imported module's executed contents alive", async () => {
    const entry = await write("src/entry.ts", `import "./register.js";\n`);
    const register = await write(
      "src/register.js",
      `import { plugin } from "./plugin.js";\nplugin();\n`,
    );
    const pluginFile = await write(
      "src/plugin.js",
      `export function plugin() {}\n`,
    );

    const graph = buildSymbolGraph([entry, register, pluginFile]);
    const pluginId = nodeByName(graph, "plugin").id;

    const reachability = computeReachability({
      nodes: graph.nodes,
      edges: graph.edges,
      prodEntries: new Set([entry]),
      testEntries: new Set(),
    });

    expect(reachability.find((r) => r.id === pluginId)?.reachability).toBe(
      "alive",
    );
  });
});
