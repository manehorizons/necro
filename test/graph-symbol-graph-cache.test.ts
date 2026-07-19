import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { SymbolGraph } from "../src/graph/types.js";
import {
  buildSymbolGraphCached,
  defaultCachePath,
  loadCachedSymbolGraph,
  writeSymbolGraphCache,
} from "../src/graph/symbol-graph-cache.js";
import { buildSymbolGraph } from "../src/graph/symbol-graph.js";
import { VERSION } from "../src/version.js";

let dir: string;
let cachePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-symbol-graph-cache-"));
  cachePath = defaultCachePath(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const FINGERPRINT = "fp-a";

const SAMPLE_GRAPH: SymbolGraph = {
  nodes: [{ id: "a.ts:1:foo", name: "foo", file: "a.ts", line: 1, exported: true }],
  edges: [],
};

describe("loadCachedSymbolGraph / writeSymbolGraphCache (AC-1)", () => {
  test("returns undefined when no cache file exists", async () => {
    const result = await loadCachedSymbolGraph(cachePath, dir, [], FINGERPRINT);
    expect(result).toBeUndefined();
  });

  test("returns undefined when the cache file is corrupt JSON", async () => {
    await mkdir(join(dir, ".necro-cache"), { recursive: true });
    await writeFile(cachePath, "{not valid json");
    const result = await loadCachedSymbolGraph(cachePath, dir, [], FINGERPRINT);
    expect(result).toBeUndefined();
  });

  test("round-trips: write then load returns the same graph when nothing changed", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() {}\n");

    await writeSymbolGraphCache(cachePath, dir, [fileA], FINGERPRINT, SAMPLE_GRAPH);
    const result = await loadCachedSymbolGraph(cachePath, dir, [fileA], FINGERPRINT);

    expect(result).toEqual(SAMPLE_GRAPH);
  });

  test("returns undefined when a tracked file's content changed", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() {}\n");
    await writeSymbolGraphCache(cachePath, dir, [fileA], FINGERPRINT, SAMPLE_GRAPH);

    await writeFile(fileA, "export function foo() { return 1; }\n");
    const result = await loadCachedSymbolGraph(cachePath, dir, [fileA], FINGERPRINT);

    expect(result).toBeUndefined();
  });

  test("returns undefined when a file was added to the tracked set", async () => {
    const fileA = join(dir, "a.ts");
    const fileB = join(dir, "b.ts");
    await writeFile(fileA, "export function foo() {}\n");
    await writeFile(fileB, "export function bar() {}\n");
    await writeSymbolGraphCache(cachePath, dir, [fileA], FINGERPRINT, SAMPLE_GRAPH);

    const result = await loadCachedSymbolGraph(cachePath, dir, [fileA, fileB], FINGERPRINT);

    expect(result).toBeUndefined();
  });

  test("returns undefined when a file was removed from the tracked set", async () => {
    const fileA = join(dir, "a.ts");
    const fileB = join(dir, "b.ts");
    await writeFile(fileA, "export function foo() {}\n");
    await writeFile(fileB, "export function bar() {}\n");
    await writeSymbolGraphCache(cachePath, dir, [fileA, fileB], FINGERPRINT, SAMPLE_GRAPH);

    const result = await loadCachedSymbolGraph(cachePath, dir, [fileA], FINGERPRINT);

    expect(result).toBeUndefined();
  });

  test("returns undefined when necroVersion doesn't match", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() {}\n");
    await writeSymbolGraphCache(cachePath, dir, [fileA], FINGERPRINT, SAMPLE_GRAPH);

    const raw = JSON.parse(await readFile(cachePath, "utf8"));
    raw.necroVersion = "0.0.0-not-real";
    await writeFile(cachePath, JSON.stringify(raw));

    const result = await loadCachedSymbolGraph(cachePath, dir, [fileA], FINGERPRINT);

    expect(result).toBeUndefined();
  });

  test("returns undefined when configFingerprint doesn't match", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() {}\n");
    await writeSymbolGraphCache(cachePath, dir, [fileA], FINGERPRINT, SAMPLE_GRAPH);

    const result = await loadCachedSymbolGraph(cachePath, dir, [fileA], "fp-b");

    expect(result).toBeUndefined();
  });

  test("writes a cache file stamped with the running necroVersion", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() {}\n");
    await writeSymbolGraphCache(cachePath, dir, [fileA], FINGERPRINT, SAMPLE_GRAPH);

    const raw = JSON.parse(await readFile(cachePath, "utf8"));
    expect(raw.necroVersion).toBe(VERSION);
    expect(raw.schemaVersion).toBe(1);
  });
});

describe("buildSymbolGraphCached (AC-1, AC-2)", () => {
  test("computes and caches the real graph on first call", async () => {
    const fileA = join(dir, "a.ts");
    const fileB = join(dir, "b.ts");
    await writeFile(fileA, "export function foo() { return 1; }\n");
    await writeFile(
      fileB,
      "import { foo } from './a.js';\nexport function bar() { return foo(); }\n",
    );

    const result = await buildSymbolGraphCached(dir, [fileA, fileB]);
    const expected = buildSymbolGraph([fileA, fileB]);

    expect(result).toEqual(expected);

    const cacheRaw = await readFile(defaultCachePath(dir), "utf8");
    expect(JSON.parse(cacheRaw).necroVersion).toBe(VERSION);
  });

  test("serves the cached graph on a second call with no changes, without recomputing", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() { return 1; }\n");

    await buildSymbolGraphCached(dir, [fileA]);

    const entry = JSON.parse(await readFile(cachePath, "utf8"));
    const sentinel: SymbolGraph = {
      nodes: [
        { id: "SENTINEL", name: "SENTINEL", file: "sentinel.ts", line: 1, exported: true },
      ],
      edges: [],
    };
    entry.graph = sentinel;
    await writeFile(cachePath, JSON.stringify(entry));

    const result = await buildSymbolGraphCached(dir, [fileA]);

    expect(result).toEqual(sentinel);
  });

  test("recomputes when a file changes between calls", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() { return 1; }\n");
    const first = await buildSymbolGraphCached(dir, [fileA]);
    expect(first.nodes.map((n) => n.name)).toEqual(["foo"]);

    await writeFile(
      fileA,
      "export function foo() { return 1; }\nexport function extra() { return 2; }\n",
    );
    const second = await buildSymbolGraphCached(dir, [fileA]);

    expect(second.nodes.map((n) => n.name).sort()).toEqual(["extra", "foo"]);
  });

  test("recomputes when packagePaths (config fingerprint) changes even though files are unchanged", async () => {
    const fileA = join(dir, "a.ts");
    await writeFile(fileA, "export function foo() { return 1; }\n");

    await buildSymbolGraphCached(dir, [fileA], {
      packagePaths: new Map([["@scope/pkg", fileA]]),
    });
    const fingerprintAfterFirst = JSON.parse(
      await readFile(cachePath, "utf8"),
    ).configFingerprint;

    await buildSymbolGraphCached(dir, [fileA], {
      packagePaths: new Map([["@scope/other", fileA]]),
    });
    const fingerprintAfterSecond = JSON.parse(
      await readFile(cachePath, "utf8"),
    ).configFingerprint;

    expect(fingerprintAfterSecond).not.toBe(fingerprintAfterFirst);
  });
});
