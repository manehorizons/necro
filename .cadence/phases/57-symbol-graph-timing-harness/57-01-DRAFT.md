---
phase: 57-symbol-graph-timing-harness
id: 57-01
tier: quick-fix
status: PENDING
---

# 57-01 — Timing harness for buildSymbolGraph (evidence for rec-20260701-016)

## Objective

Build a repo-internal timing harness for `buildSymbolGraph` (mirroring `src/bench/python-import-resolution-rate.ts`'s manual, non-CI precedent) and run it against real large-repo checkouts to produce the timing evidence `rec-20260701-016` (incremental symbol-graph cache) explicitly names as its own prerequisite — this phase gathers evidence only, it does not build the cache.

## Acceptance Criteria

### AC-1: Timing harness measures buildSymbolGraph as a black box
Given a repo checkout path and a `NecroConfig`
When the harness discovers files (`discoverFiles`) and times a `buildSymbolGraph` call
Then it reports file count, declaration count (`graph.nodes.length`), reference-edge count (`graph.edges.length`), and separate wall-clock ms for the discover phase and the build phase — computed from `buildSymbolGraph`'s existing public return shape, with no changes to `src/graph/symbol-graph.ts` itself

### AC-2: Real-repo measurement recorded as evidence
Given the two repos already checked out in `.bench-cache/` (`trpc__trpc`, `honojs__hono` — from the existing triage corpus, no new checkout needed)
When the harness is run manually against each
Then the resulting numbers (file/decl/edge counts, discover ms, build ms) are recorded in this task's completion notes and the phase SUMMARY, documenting whether they substantiate the rec's premise that reference-walking is "the dominant cost on a large repo" — this is a one-time recorded measurement, not a CI-blocking automated test, since the checkouts aren't vendored into the repo

## Tasks

### T1: Implement the timing harness
- files: `src/bench/symbol-graph-timing.ts`, `test/bench-symbol-graph-timing.test.ts`
- action: Add a pure `measureSymbolGraphTiming(repoPath, config): Promise<TimingResult>` (`{ fileCount, declCount, edgeCount, discoverMs, buildMs }`) that calls `discoverFiles` then `buildSymbolGraph` from the existing public APIs, timing each with `performance.now()`, plus a `parseArgs`/`main()` CLI entrypoint guarded by the `import.meta.url` check — mirror `src/bench/python-import-resolution-rate.ts`'s structure and its JSDoc explaining it's a manual, repo-internal measurement tool, not part of the published CLI.
- verify: unit test against a small fixture dir (a handful of files with a known declaration/reference shape) asserting `declCount`/`edgeCount`/`fileCount` match and both timing fields are non-negative numbers.
- done: AC-1

### T2: Run the harness against real checkouts and record the evidence
- files: none (manual run; results recorded in this task's completion notes)
- action: Run `npx tsx src/bench/symbol-graph-timing.ts --repo .bench-cache/trpc__trpc` and `--repo .bench-cache/honojs__hono`, record each repo's numbers, and note whether they support building the incremental cache (`rec-20260701-016`) or suggest deferring it.
- verify: both repos' numbers recorded in `--notes` on task completion.
- done: AC-2

## Boundaries

- DO NOT implement the incremental symbol-graph cache itself (content-hash persistence, worker-thread sharding) — `rec-20260701-016` stays a separate, later phase; this phase only produces the evidence to justify or reject it.
- DO NOT modify `src/graph/symbol-graph.ts` — measure the existing public `buildSymbolGraph`/`discoverFiles` APIs as a black box; `SymbolGraph.nodes`/`.edges` already expose the counts needed.
- DO NOT vendor the `.bench-cache/` checkouts into the repo or wire this harness into CI/`npm test` — repo-internal, manual-run only, per the `python-import-resolution-rate.ts` precedent.
- DO NOT promote or demote `rec-20260701-016`'s status/readiness as part of this phase — that's a follow-up decision made from the recorded evidence, not bundled into this build.
