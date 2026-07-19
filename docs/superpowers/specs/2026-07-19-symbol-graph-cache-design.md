# Design — Symbol-graph cache v1 (rec-20260701-016)

**Date:** 2026-07-19
**Rec:** `rec-20260701-016` — Incremental symbol-graph cache for large repos
**Milestone:** `mil-rec-rec-20260701-016`
**Status:** approved design, ready for CADENCE draft

## Goal

`buildSymbolGraph` (`src/graph/symbol-graph.ts`) runs one ts-morph
`findReferencesAsNodes()` language-service search per top-level declaration,
single-threaded, with no cross-run persistence. Phase 57's timing harness
(`src/bench/symbol-graph-timing.ts`) measured this directly against two real
checkouts:

| Repo | Files | Decls | Edges | Discover | Build | ms/decl |
|---|---|---|---|---|---|---|
| hono | 378 | 1,387 | 14,165 | 15ms | 4,367ms | 3.15 |
| trpc | 973 | 4,210 | 12,973 | 32ms | 44,661ms | 10.6 |

Discovery is negligible; the cost scales super-linearly with repo size and is
entirely in the reference walk. This design adds a persistent cache so
repeated calls against an unchanged repo skip that walk — targeting the
**repeated local/MCP-session** usage pattern (an agent or developer calling
`scan`/`explain` many times in one session against a mostly-unchanged repo),
not CI (fresh checkout, no cache history) or single-shot speedup (which would
need worker-thread sharding instead — explicitly out of scope here).

## Decisions (settled — do not relitigate)

1. **Persistent content-hash cache, not worker-thread sharding.** The
   evidence and the target scenario (repeated calls in one session, e.g. MCP)
   favor caching; sharding would help every run including the first but
   doesn't fit the chosen scenario and isn't ruled out for a future rec.
2. **Cache scope: whole-repo-unchanged fast path only, v1.** A cache hit
   requires the *entire* file set + content hashes to exactly match the
   previous run. No per-declaration/per-file incremental invalidation. This
   is the deliberately safe, small-surface-area version — see Correctness
   below. True per-file incremental invalidation (only re-walking a changed
   file's declarations plus their transitive importers) is a distinct,
   harder follow-up rec once this is measured, not part of this phase.
3. **TS-only.** `buildPythonSymbolGraph` is hand-rolled with no
   per-declaration language-service search — not the measured bottleneck,
   out of scope.
4. **What's cached: just `buildSymbolGraph`'s output**, not the whole
   `ReachabilityModel`. Per phase 57's evidence, discovery/entries/plugins/
   the reachability sweep are all sub-40ms — already near-free. Caching only
   the graph keeps the invalidation surface to "did tracked file content
   change," not "did any config that affects entry resolution change."
5. **Cache location: project-local, gitignored — `.necro-cache/symbol-graph.json`
   at the scan target root.** Same footprint pattern as TypeScript's
   `.tsbuildinfo` (derived, disposable) rather than `.necro-baseline.json`
   (meant to be committed). necro does not auto-edit the target repo's
   `.gitignore` anywhere else in the codebase; this follows that precedent —
   document the ignore recommendation, don't automate it.
6. **`symbol-graph.ts` itself is untouched.** The cache wraps the existing
   public `buildSymbolGraph`/`discoverFiles` APIs from outside, mirroring the
   phase 57 boundary discipline.

## What already exists (reused, not rebuilt)

- `src/graph/symbol-graph.ts` — `buildSymbolGraph(filePaths, opts): SymbolGraph`,
  `SymbolGraph { nodes: SymbolNode[]; edges: SymbolEdge[] }`.
- `src/discover.ts` — `discoverFiles(target, config): string[]`.
- `src/engine/model.ts` — `buildReachabilityModel` is the sole current call
  site of `buildSymbolGraph` for TS/JS files (`tsGraph = buildSymbolGraph(tsFiles, { isTestFile, packagePaths })`).
- `src/bench/symbol-graph-timing.ts` (phase 57) — the timing harness, to be
  extended for this phase's manual two-run verification.
- Precedent for a repo-internal, non-CI-wired manual measurement:
  `src/bench/python-import-resolution-rate.ts`.

## Architecture

One new module, one call-site change.

### `src/graph/symbol-graph-cache.ts`

```ts
interface SymbolGraphCacheEntry {
  schemaVersion: 1;
  necroVersion: string;                          // version bump invalidates wholesale
  files: [relPath: string, sha256: string][];     // sorted; every file fed to buildSymbolGraph
  configFingerprint: string;                       // hash of (isTestFile results + packagePaths) over the file set
  graph: SymbolGraph;
}

async function loadCachedSymbolGraph(
  cachePath: string,
  targetPath: string,
  filePaths: string[],
  configFingerprint: string,
): Promise<SymbolGraph | undefined>

async function writeSymbolGraphCache(
  cachePath: string,
  targetPath: string,
  filePaths: string[],
  configFingerprint: string,
  graph: SymbolGraph,
): Promise<void>

async function buildSymbolGraphCached(
  targetPath: string,
  filePaths: string[],
  opts: BuildOptions,
): Promise<SymbolGraph>
```

`buildSymbolGraphCached` is the new call site used by `model.ts` in place of
the direct `buildSymbolGraph(tsFiles, opts)` call. It:

1. Computes `configFingerprint` from `opts` (SHA-256 of the sorted
   `[file, isTestFile(file)]` pairs for the given `filePaths`, plus the
   sorted `packagePaths` entries if present).
2. Calls `loadCachedSymbolGraph`. On a hit, returns the cached graph — the
   44s walk is skipped entirely.
3. On a miss (file added/removed/changed, config changed, version changed,
   or no cache / corrupt cache), calls the real `buildSymbolGraph`, then
   `writeSymbolGraphCache` persists the result. Write failures (e.g.
   read-only filesystem) are caught and logged, never thrown — caching is
   strictly an optimization, never a correctness requirement.

### Cache validity rule

A cache is a **hit** iff all of:
- `schemaVersion` and `necroVersion` match the running necro.
- The recorded file set (relative paths, sorted) is identical to the current
  `filePaths` set — same length, same members.
- Every file's current SHA-256 content hash matches its recorded hash.
- `configFingerprint` matches.

Any mismatch, or any read/parse error on the cache file, is a **miss** —
never an error. A miss always rebuilds from scratch and overwrites the cache
file with the fresh result.

## Correctness

`findReferencesAsNodes()` searches the whole ts-morph `Project`, not just one
file — a per-file cache that only checks *that file's* hash would be unsound,
since a completely different file could gain a brand-new reference to a
declaration without the declaration's own file changing at all.

This design sidesteps that problem entirely by making the granularity
whole-repo: the cache is valid only when **nothing** in the tracked file set
changed, so there is no reverse-import-graph reasoning to get right or wrong.
The only thing that has to be correct is a flat equality check (file set +
per-file content hash + config fingerprint + version), which is small,
deterministic, and exhaustively unit-testable. This is a deliberate
trade-off: a single-file edit still costs a full rebuild (no partial-edit
speedup) in exchange for a v1 with effectively no correctness risk to the
dead-code verdicts that `fix --write` acts on.

## Testing

Unit tests (`test/graph-symbol-graph-cache.test.ts`, tmp-dir fixtures, no
real repo needed):
- Cache miss on the first call (no cache file yet); cache is written.
- Cache hit on an identical second call (same files, same content) — the
  underlying `buildSymbolGraph` is not invoked on a hit (spy/mock or a
  counting wrapper).
- Miss when a tracked file's content changes.
- Miss when a file is added or removed.
- Miss when `necroVersion` in the cache file doesn't match the running
  version.
- Miss (not a throw) when the cache file is corrupt/malformed JSON.
- Miss when `configFingerprint` changes (e.g. different `packagePaths`) even
  though file content is identical.

Manual verification (mirrors phase 57's evidence-recording task): extend
`src/bench/symbol-graph-timing.ts` with a `--twice` flag that runs
`buildSymbolGraphCached` twice back-to-back against a real checkout and
reports both timings. Run against `.bench-cache/trpc__trpc`: first run should
match phase 57's ~44.7s; second run (cache hit, no edits) should be
near-instant. Recorded in the phase's task notes, not asserted in CI (the
checkout isn't vendored into the repo, per the existing precedent).

## Boundaries

- DO NOT implement per-file/per-declaration incremental invalidation — v1 is
  whole-repo-unchanged only. A follow-up rec once this is measured.
- DO NOT implement worker-thread sharding — a separate lever, not pursued
  here.
- DO NOT modify `src/graph/symbol-graph.ts` — the cache wraps its existing
  public API from outside.
- DO NOT cache the Python graph (`buildPythonSymbolGraph`) or the full
  `ReachabilityModel` — TS symbol graph only.
- DO NOT auto-edit the target repo's `.gitignore` — document the
  recommendation instead, matching how necro handles every other
  derived/local artifact.
- DO NOT wire the cache-timing manual run into CI/`npm test` — the
  `.bench-cache/` checkouts aren't vendored into the repo.
