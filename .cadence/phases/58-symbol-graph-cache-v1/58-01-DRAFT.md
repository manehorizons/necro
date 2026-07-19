---
phase: 58-symbol-graph-cache-v1
id: 58-01
tier: standard
status: PENDING
---

# 58-01 — Symbol-graph cache v1 (whole-repo-unchanged)

## Objective

Add a whole-repo-unchanged, content-hash-keyed persistent cache in front of `buildSymbolGraph` so repeated calls against an unchanged repo (the common local/MCP-session pattern) skip the expensive per-declaration reference walk — per the approved design (`docs/superpowers/specs/2026-07-19-symbol-graph-cache-design.md`) and plan (`docs/superpowers/plans/2026-07-19-symbol-graph-cache-v1.md`).

## Acceptance Criteria

### AC-1: Whole-repo-unchanged cache hit/miss is correct
Given a tracked file set, its per-file SHA-256 hashes, a config fingerprint, and the running `necroVersion`
When any of these differs from what's persisted in `.necro-cache/symbol-graph.json` (file added/removed/changed, fingerprint changed, version changed, or the cache file is missing/corrupt)
Then `buildSymbolGraphCached` recomputes via the real `buildSymbolGraph` and rewrites the cache; when none of these differ, it returns the persisted graph without recomputing

### AC-2: Wired into buildReachabilityModel with a measured real-repo speedup
Given `buildReachabilityModel`'s existing call to `buildSymbolGraph(tsFiles, opts)` in `src/engine/model.ts`
When it's replaced with `buildSymbolGraphCached(targetPath, tsFiles, opts)`
Then every existing scan/explain/fix test still passes unchanged (each runs against a fresh `mkdtemp`, so every call is a first-time miss falling through to the real build exactly as before), and a manual two-run measurement against `.bench-cache/trpc__trpc` shows run 2 (cache hit) dramatically faster than run 1 (cache miss, ~44.7s per phase 57's baseline)

## Tasks

### T1: Cache round-trip + config-fingerprinted composition
- files: `src/graph/symbol-graph-cache.ts`, `test/graph-symbol-graph-cache.test.ts`
- action: Implement `SymbolGraphCacheEntry`, `defaultCachePath`, `loadCachedSymbolGraph`, `writeSymbolGraphCache` (Plan Task 1), then `buildSymbolGraphCached` + `fingerprintConfig` (Plan Task 2) exactly per the plan's code blocks. `symbol-graph.ts` is not modified — `DEFAULT_TEST_FILE` is intentionally duplicated, not imported, per the design boundary.
- verify: `npx vitest run test/graph-symbol-graph-cache.test.ts` (13 tests: no-cache-file, corrupt-JSON, round-trip, content-change, file-added, file-removed, version-mismatch, fingerprint-mismatch, necroVersion-stamped, first-call-computes-and-caches, second-call-serves-cache-without-recompute via sentinel-tamper, recomputes-on-file-change, recomputes-on-fingerprint-change) + `npm run typecheck`
- done: AC-1

### T2: Wire into buildReachabilityModel
- files: `src/engine/model.ts`
- action: Replace the `buildSymbolGraph` import and its direct call (line ~136) with `buildSymbolGraphCached(targetPath, tsFiles, { isTestFile, packagePaths: workspaces.packagePaths })`, awaited (per Plan Task 3).
- verify: `npm run typecheck && npx vitest run` — full suite passes with the same pass count as before this task
- done: AC-2

### T3: Extend the timing harness with a `--twice` cached-run mode
- files: `src/bench/symbol-graph-timing.ts`, `test/bench-symbol-graph-timing.test.ts`
- action: Add `MeasureOptions { cached?: boolean }` to `measureSymbolGraphTiming` (routes through `buildSymbolGraphCached` when true), add `twice?: boolean` to `TimingArgs`/`parseArgs`, and have `main()` run two back-to-back cached measurements and print both when `--twice` is passed (per Plan Task 4).
- verify: `npx vitest run test/bench-symbol-graph-timing.test.ts` (9 tests) + `npm run typecheck && npx vitest run` (full suite)
- done: AC-2

### T4: Manual verification against a real large repo
- files: none (manual run; results recorded in this task's completion notes, not committed — mirrors the phase 44/57 precedent for real-repo checkouts not vendored into the repo)
- action: Run `npx tsx src/bench/symbol-graph-timing.ts --repo .bench-cache/trpc__trpc --twice`, confirm run 1's build time is in the same ballpark as phase 57's ~44.7s baseline and run 2 is dramatically faster, sanity-check `.bench-cache/trpc__trpc/.necro-cache/symbol-graph.json` was written, and confirm `git status --short` shows no new untracked paths outside the already-ignored `.bench-cache/`.
- verify: both runs' numbers recorded in `--notes` on task completion
- done: AC-2

## Boundaries

- DO NOT implement per-file/per-declaration incremental invalidation — v1 is whole-repo-unchanged only (a follow-up rec once this is measured).
- DO NOT implement worker-thread sharding — a separate lever, not pursued here.
- DO NOT modify `src/graph/symbol-graph.ts` — the cache wraps its existing public API from outside.
- DO NOT cache the Python graph (`buildPythonSymbolGraph`) or the full `ReachabilityModel` — TS symbol graph only.
- DO NOT auto-edit the target repo's `.gitignore` — document the recommendation instead, matching how necro handles every other derived/local artifact.
- DO NOT wire the `--twice` real-repo run into CI/`npm test` — the `.bench-cache/` checkouts aren't vendored into the repo.
