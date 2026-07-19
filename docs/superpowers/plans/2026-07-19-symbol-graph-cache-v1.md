# Symbol-Graph Cache v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project note:** This repo runs execution through CADENCE (draft → build → settle), not a freeform session — see `/home/thomas/projects/necro/CLAUDE.md`. The 5 tasks below map directly onto a CADENCE `DRAFT.md`'s Tasks (T1–T5), grouped under 2 Acceptance Criteria (AC-1, AC-2). When this plan is executed, it will be transcribed into a CADENCE DRAFT rather than run via the generic execution skills — the task/step breakdown below is what gets transcribed.

**Goal:** Add a whole-repo-unchanged, content-hash-keyed persistent cache in front of `buildSymbolGraph`, so repeated calls against an unchanged repo (the common local/MCP-session pattern) skip the expensive per-declaration reference walk entirely.

**Architecture:** A new module `src/graph/symbol-graph-cache.ts` wraps the existing `buildSymbolGraph`/`discoverFiles` APIs from outside — `symbol-graph.ts` itself is never touched. A cache hit requires the *entire* tracked file set + per-file SHA-256 content hash + a config fingerprint + the running `necroVersion` to all match a previous run exactly (no partial/per-file invalidation in v1). `src/engine/model.ts`'s `buildReachabilityModel` becomes the cache's sole call site, replacing its direct `buildSymbolGraph` call.

**Tech Stack:** TypeScript (Node `node:crypto`, `node:fs/promises`, `node:path`), Vitest.

## Global Constraints

- Cache file: `.necro-cache/symbol-graph.json` at the scan target root (project-local, gitignored by convention — necro does not auto-edit the target repo's `.gitignore`).
- v1 scope is whole-repo-unchanged only — no per-file/per-declaration incremental invalidation (that's a separate follow-up rec).
- TS-only — do not touch `buildPythonSymbolGraph` or the Python graph path.
- `src/graph/symbol-graph.ts` must not be modified.
- Cache write failures must never throw — caching is strictly an optimization.
- A corrupt/malformed cache file must be treated as a miss, never an error.
- Design doc of record: `docs/superpowers/specs/2026-07-19-symbol-graph-cache-design.md`.

---

## Task 1: Cache round-trip — `loadCachedSymbolGraph` / `writeSymbolGraphCache`

**Files:**
- Create: `src/graph/symbol-graph-cache.ts`
- Test: `test/graph-symbol-graph-cache.test.ts`

**Interfaces:**
- Consumes: `SymbolGraph` from `../graph/types.js` (`{ nodes: SymbolNode[]; edges: SymbolEdge[] }`); `VERSION` from `../version.js`.
- Produces:
  - `export interface SymbolGraphCacheEntry { schemaVersion: 1; necroVersion: string; files: [string, string][]; configFingerprint: string; graph: SymbolGraph }`
  - `export function defaultCachePath(targetPath: string): string`
  - `export async function loadCachedSymbolGraph(cachePath: string, targetPath: string, filePaths: string[], configFingerprint: string): Promise<SymbolGraph | undefined>`
  - `export async function writeSymbolGraphCache(cachePath: string, targetPath: string, filePaths: string[], configFingerprint: string, graph: SymbolGraph): Promise<void>`
  - (internal, not exported) `hashFile(path: string): Promise<string>`

- [ ] **Step 1: Write the failing tests**

Create `test/graph-symbol-graph-cache.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { VERSION } from "../src/version.js";
import type { SymbolGraph } from "../src/graph/types.js";
import {
  defaultCachePath,
  loadCachedSymbolGraph,
  writeSymbolGraphCache,
} from "../src/graph/symbol-graph-cache.js";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/graph-symbol-graph-cache.test.ts`
Expected: FAIL — `Cannot find module '../src/graph/symbol-graph-cache.js'`

- [ ] **Step 3: Write the implementation**

Create `src/graph/symbol-graph-cache.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { SymbolGraph } from "./types.js";
import { VERSION } from "../version.js";

const CACHE_DIR = ".necro-cache";
const CACHE_FILE = "symbol-graph.json";

/** On-disk shape of a persisted symbol-graph cache entry. */
export interface SymbolGraphCacheEntry {
  schemaVersion: 1;
  necroVersion: string;
  /** Sorted `[relative path, sha256 content hash]` for every file fed to `buildSymbolGraph`. */
  files: [string, string][];
  configFingerprint: string;
  graph: SymbolGraph;
}

export function defaultCachePath(targetPath: string): string {
  return join(targetPath, CACHE_DIR, CACHE_FILE);
}

async function hashFile(path: string): Promise<string> {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Whole-repo-unchanged cache lookup (§ symbol-graph-cache-design.md). A hit
 * requires the exact tracked file set, every file's current content hash,
 * `configFingerprint`, and `necroVersion` to all match the persisted entry.
 * Any mismatch, or any read/parse error, is a miss — never an error.
 */
export async function loadCachedSymbolGraph(
  cachePath: string,
  targetPath: string,
  filePaths: string[],
  configFingerprint: string,
): Promise<SymbolGraph | undefined> {
  let raw: string;
  try {
    raw = await readFile(cachePath, "utf8");
  } catch {
    return undefined;
  }

  let entry: SymbolGraphCacheEntry;
  try {
    entry = JSON.parse(raw) as SymbolGraphCacheEntry;
  } catch {
    return undefined;
  }

  if (entry.schemaVersion !== 1 || entry.necroVersion !== VERSION) {
    return undefined;
  }
  if (entry.configFingerprint !== configFingerprint) {
    return undefined;
  }

  const currentRelPaths = filePaths.map((f) => relative(targetPath, f)).sort();
  const recordedRelPaths = entry.files.map(([relPath]) => relPath).sort();
  if (currentRelPaths.length !== recordedRelPaths.length) return undefined;
  for (let i = 0; i < currentRelPaths.length; i++) {
    if (currentRelPaths[i] !== recordedRelPaths[i]) return undefined;
  }

  const recordedHashes = new Map(entry.files);
  for (const file of filePaths) {
    const relPath = relative(targetPath, file);
    const recorded = recordedHashes.get(relPath);
    if (!recorded) return undefined;
    let current: string;
    try {
      current = await hashFile(file);
    } catch {
      return undefined;
    }
    if (current !== recorded) return undefined;
  }

  return entry.graph;
}

/**
 * Persist a symbol graph keyed by the exact tracked file set's content
 * hashes. Never throws — a write failure (e.g. read-only filesystem) is
 * logged and swallowed, since caching is strictly an optimization.
 */
export async function writeSymbolGraphCache(
  cachePath: string,
  targetPath: string,
  filePaths: string[],
  configFingerprint: string,
  graph: SymbolGraph,
): Promise<void> {
  try {
    const files: [string, string][] = await Promise.all(
      filePaths.map(
        async (file) =>
          [relative(targetPath, file), await hashFile(file)] as [
            string,
            string,
          ],
      ),
    );
    files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const entry: SymbolGraphCacheEntry = {
      schemaVersion: 1,
      necroVersion: VERSION,
      files,
      configFingerprint,
      graph,
    };

    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(entry));
  } catch (err) {
    console.error(
      `necro: failed to write symbol-graph cache: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/graph-symbol-graph-cache.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/graph/symbol-graph-cache.ts test/graph-symbol-graph-cache.test.ts
git commit -m "feat: symbol-graph cache round-trip (load/write)"
```

---

## Task 2: `buildSymbolGraphCached` — composition + config fingerprint

**Files:**
- Modify: `src/graph/symbol-graph-cache.ts`
- Test: `test/graph-symbol-graph-cache.test.ts` (extend)

**Interfaces:**
- Consumes: `buildSymbolGraph`, `BuildOptions` from `./symbol-graph.js`; everything from Task 1.
- Produces: `export async function buildSymbolGraphCached(targetPath: string, filePaths: string[], opts?: BuildOptions): Promise<SymbolGraph>`

- [ ] **Step 1: Write the failing tests**

Append to `test/graph-symbol-graph-cache.test.ts` (add imports `mkdir` already present; add `buildSymbolGraphCached` and `readFile` already imported):

```ts
import { buildSymbolGraphCached } from "../src/graph/symbol-graph-cache.js";
import { buildSymbolGraph } from "../src/graph/symbol-graph.js";

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

    // Tamper the persisted graph with a sentinel value while keeping the
    // metadata (hashes/fingerprint/version) valid, so a second call can only
    // return this exact sentinel if it actually read from the cache.
    const cachePath = defaultCachePath(dir);
    const entry = JSON.parse(await readFile(cachePath, "utf8"));
    const sentinel: SymbolGraph = {
      nodes: [{ id: "SENTINEL", name: "SENTINEL", file: "sentinel.ts", line: 1, exported: true }],
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
    const cachePath = defaultCachePath(dir);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/graph-symbol-graph-cache.test.ts`
Expected: FAIL — `buildSymbolGraphCached is not a function` (or `undefined`)

- [ ] **Step 3: Write the implementation**

Append to `src/graph/symbol-graph-cache.ts` (add these imports at the top alongside the existing ones: `import { buildSymbolGraph, type BuildOptions } from "./symbol-graph.js";`):

```ts
/**
 * Duplicated from `symbol-graph.ts`'s private `DEFAULT_TEST_FILE` regex —
 * intentional: the design boundary forbids modifying/exporting from
 * `symbol-graph.ts`, so the default is mirrored here rather than imported.
 * Keep in sync if the original ever changes.
 */
const DEFAULT_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function fingerprintConfig(
  targetPath: string,
  filePaths: string[],
  opts: BuildOptions,
): string {
  const isTestFile = opts.isTestFile ?? ((p) => DEFAULT_TEST_FILE.test(p));
  const testFlags = filePaths
    .map((f) => [relative(targetPath, f), isTestFile(f)] as [string, boolean])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const packageEntries = opts.packagePaths
    ? [...opts.packagePaths.entries()].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      )
    : [];
  return createHash("sha256")
    .update(JSON.stringify({ testFlags, packageEntries }))
    .digest("hex");
}

/**
 * Cached front-end for `buildSymbolGraph`. Returns the persisted graph on a
 * whole-repo-unchanged hit (see `loadCachedSymbolGraph`); otherwise builds
 * the real graph and persists it for next time.
 */
export async function buildSymbolGraphCached(
  targetPath: string,
  filePaths: string[],
  opts: BuildOptions = {},
): Promise<SymbolGraph> {
  const cachePath = defaultCachePath(targetPath);
  const configFingerprint = fingerprintConfig(targetPath, filePaths, opts);

  const cached = await loadCachedSymbolGraph(
    cachePath,
    targetPath,
    filePaths,
    configFingerprint,
  );
  if (cached) return cached;

  const graph = buildSymbolGraph(filePaths, opts);
  await writeSymbolGraphCache(
    cachePath,
    targetPath,
    filePaths,
    configFingerprint,
    graph,
  );
  return graph;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/graph-symbol-graph-cache.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/graph/symbol-graph-cache.ts test/graph-symbol-graph-cache.test.ts
git commit -m "feat: buildSymbolGraphCached — config-fingerprinted cache front-end"
```

---

## Task 3: Wire the cache into `buildReachabilityModel`

**Files:**
- Modify: `src/engine/model.ts:17` (import), `src/engine/model.ts:136-139` (call site)

**Interfaces:**
- Consumes: `buildSymbolGraphCached` from `../graph/symbol-graph-cache.js` (Task 2).
- Produces: no new exports — `buildReachabilityModel`'s existing signature and return shape (`ReachabilityModel`) are unchanged.

- [ ] **Step 1: Make the change**

In `src/engine/model.ts`, replace the import on line 17:

```ts
import { buildSymbolGraph } from "../graph/symbol-graph.js";
```

with:

```ts
import { buildSymbolGraphCached } from "../graph/symbol-graph-cache.js";
```

Then replace the call at lines 136-139:

```ts
  const tsGraph = buildSymbolGraph(tsFiles, {
    isTestFile,
    packagePaths: workspaces.packagePaths,
  });
```

with:

```ts
  const tsGraph = await buildSymbolGraphCached(targetPath, tsFiles, {
    isTestFile,
    packagePaths: workspaces.packagePaths,
  });
```

(`buildReachabilityModel` is already an `async function`, so `await` is valid here — no other signature change needed.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (confirms `buildSymbolGraph` has no other remaining import users in this file, and the new async call is valid)

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, same pass count as before this task (this change must not alter `buildReachabilityModel`'s observable output on a cache miss — every existing scan/explain/fix test exercises a fresh temp dir per test, so every call is a first-time cache miss that falls through to the real `buildSymbolGraph` exactly as before)

- [ ] **Step 4: Commit**

```bash
git add src/engine/model.ts
git commit -m "feat: wire symbol-graph cache into buildReachabilityModel"
```

---

## Task 4: Extend the timing harness with a `--twice` cached-run mode

**Files:**
- Modify: `src/bench/symbol-graph-timing.ts`
- Test: `test/bench-symbol-graph-timing.test.ts` (extend)

**Interfaces:**
- Consumes: `buildSymbolGraphCached` from `../graph/symbol-graph-cache.js`.
- Produces: `measureSymbolGraphTiming`'s signature gains an optional 3rd param `opts?: { cached?: boolean }` (default `{}`, preserving all existing call sites/tests unchanged); `TimingArgs` gains `twice?: boolean`; `parseArgs` recognizes `--twice`.

- [ ] **Step 1: Write the failing tests**

Append to `test/bench-symbol-graph-timing.test.ts`:

```ts
describe("measureSymbolGraphTiming with cached: true (AC-2)", () => {
  test("uses the symbol-graph cache and reports a fast second run", async () => {
    await writeFile(
      join(dir, "src", "a.ts"),
      "export function greet() { return 'hi'; }\n",
    );

    const first = await measureSymbolGraphTiming(dir, DEFAULT_CONFIG, { cached: true });
    expect(first.declCount).toBe(1);

    const second = await measureSymbolGraphTiming(dir, DEFAULT_CONFIG, { cached: true });
    expect(second.declCount).toBe(1);
    expect(second.buildMs).toBeLessThanOrEqual(first.buildMs + 1);
  });
});

describe("parseArgs --twice (AC-2)", () => {
  test("parses --twice as a boolean flag", () => {
    expect(parseArgs(["--repo", "/some/path", "--twice"])).toEqual({
      repo: "/some/path",
      include: undefined,
      twice: true,
    });
  });

  test("defaults twice to undefined when absent", () => {
    expect(parseArgs(["--repo", "/some/path"])).toEqual({
      repo: "/some/path",
      include: undefined,
      twice: undefined,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/bench-symbol-graph-timing.test.ts`
Expected: FAIL — `measureSymbolGraphTiming` doesn't accept a 3rd argument / `--twice` unrecognized

- [ ] **Step 3: Write the implementation**

In `src/bench/symbol-graph-timing.ts`, add the import:

```ts
import { buildSymbolGraphCached } from "../graph/symbol-graph-cache.js";
```

Replace the `measureSymbolGraphTiming` function with:

```ts
export interface MeasureOptions {
  /** Route the build through the symbol-graph cache instead of a raw uncached build. */
  cached?: boolean;
}

export async function measureSymbolGraphTiming(
  repoPath: string,
  config: NecroConfig = DEFAULT_CONFIG,
  opts: MeasureOptions = {},
): Promise<TimingResult> {
  const discoverStart = performance.now();
  const files = await discoverFiles(repoPath, config);
  const discoverMs = performance.now() - discoverStart;

  const buildStart = performance.now();
  const graph = opts.cached
    ? await buildSymbolGraphCached(repoPath, files)
    : buildSymbolGraph(files);
  const buildMs = performance.now() - buildStart;

  return {
    fileCount: files.length,
    declCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    discoverMs,
    buildMs,
  };
}
```

Update `TimingArgs` and `parseArgs`:

```ts
export interface TimingArgs {
  repo: string;
  include?: string[];
  twice?: boolean;
}

export function parseArgs(argv: string[]): TimingArgs {
  const args: Partial<TimingArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") args.repo = argv[++i];
    if (argv[i] === "--include") args.include = argv[++i]?.split(",");
    if (argv[i] === "--twice") args.twice = true;
  }
  if (!args.repo) throw new Error("--repo <path> is required");
  return { repo: args.repo, include: args.include, twice: args.twice };
}
```

Update `main()` to honor `--twice`:

```ts
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = args.include
    ? { ...DEFAULT_CONFIG, include: args.include }
    : DEFAULT_CONFIG;

  if (args.twice) {
    const run1 = await measureSymbolGraphTiming(args.repo, config, { cached: true });
    console.log(
      `${args.repo} [run 1, cache miss expected]: ${run1.fileCount} files, ${run1.declCount} decls, ${run1.edgeCount} edges — ` +
        `discover ${run1.discoverMs.toFixed(0)}ms, build ${run1.buildMs.toFixed(0)}ms`,
    );
    const run2 = await measureSymbolGraphTiming(args.repo, config, { cached: true });
    console.log(
      `${args.repo} [run 2, cache hit expected]: ${run2.fileCount} files, ${run2.declCount} decls, ${run2.edgeCount} edges — ` +
        `discover ${run2.discoverMs.toFixed(0)}ms, build ${run2.buildMs.toFixed(0)}ms`,
    );
    return;
  }

  const result = await measureSymbolGraphTiming(args.repo, config);
  console.log(
    `${args.repo}: ${result.fileCount} files, ${result.declCount} decls, ${result.edgeCount} edges — ` +
      `discover ${result.discoverMs.toFixed(0)}ms, build ${result.buildMs.toFixed(0)}ms`,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/bench-symbol-graph-timing.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npx vitest run`
Expected: no errors, all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/bench/symbol-graph-timing.ts test/bench-symbol-graph-timing.test.ts
git commit -m "feat: --twice cached-run mode for the symbol-graph timing harness"
```

---

## Task 5: Manual verification against a real large repo

**Files:** none (manual run; results recorded in the CADENCE task's completion notes, not committed as a test — mirrors the phase 57/44 precedent for real-repo checkouts not vendored into the repo)

**Interfaces:** none — this task only exercises the CLI built in Task 4.

- [ ] **Step 1: Run the harness twice against `.bench-cache/trpc__trpc`**

Run: `npx tsx src/bench/symbol-graph-timing.ts --repo .bench-cache/trpc__trpc --twice`

- [ ] **Step 2: Record the results**

Note both lines of output (run 1 and run 2 timings) in this task's completion notes when it's recorded in CADENCE (`cadence build task T5 --status=DONE --notes "..."`). Confirm: run 1's `build` ms is in the same ballpark as phase 57's baseline (~44.7s — some variance is expected machine-to-machine), and run 2's `build` ms is dramatically lower (near-instant), demonstrating the cache hit.

- [ ] **Step 3: Sanity-check the cache file was written**

Run: `cat .bench-cache/trpc__trpc/.necro-cache/symbol-graph.json | head -c 200`
Expected: valid JSON starting with `{"schemaVersion":1,"necroVersion":...`

- [ ] **Step 4: Clean up the manual cache artifact**

The `.bench-cache/` directory is already gitignored in full (`.gitignore` has `.bench-cache/`), so the `.necro-cache/` written inside it needs no separate cleanup — confirm with `git status --short` that nothing new is untracked outside `.bench-cache/`.

Run: `git status --short`
Expected: no new untracked paths outside `.bench-cache/` (which is already ignored)

No commit for this task — it produces no file changes, only the recorded evidence in CADENCE task notes and the phase SUMMARY.

---

## Plan Self-Review Notes

- **Spec coverage:** Design doc's Architecture section → Tasks 1–2. Call-site change → Task 3. Testing section's unit tests → Tasks 1–2 (all 7 enumerated cases covered: miss-then-write, hit-without-recompute, content-change, add/remove file, version mismatch, corrupt-cache, fingerprint-change). Manual `--twice` verification → Tasks 4–5. All Boundaries respected (no `symbol-graph.ts` edits, no Python, no worker threads, no full-model caching, no `.gitignore` automation, no CI wiring for the real-repo run).
- **Type consistency checked:** `SymbolGraphCacheEntry`, `defaultCachePath`, `loadCachedSymbolGraph`, `writeSymbolGraphCache`, `buildSymbolGraphCached` signatures are identical everywhere they're referenced across Tasks 1–4. `measureSymbolGraphTiming`'s new 3rd parameter is optional with a default, so Task 4 doesn't break any pre-existing call in `test/bench-symbol-graph-timing.test.ts` from phase 57.
- **No placeholders:** every step has literal, complete code.

## Suggested CADENCE AC mapping (for the DRAFT transcription)

- **AC-1** ("Cache correctness — whole-repo-unchanged hit/miss behavior"): Task 1 + Task 2 → `T1`.
- **AC-2** ("Wired in with a measured real-repo speedup, no behavior change on a miss"): Task 3 + Task 4 + Task 5 → `T2`, `T3`, `T4` (or collapse Task 3 into T2 if the DRAFT wants fewer tasks — Task 3 is a 2-line change with no new tests of its own beyond the full-suite regression run).
