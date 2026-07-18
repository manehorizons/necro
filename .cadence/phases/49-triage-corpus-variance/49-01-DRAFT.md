---
phase: 49-triage-corpus-variance
id: 49-01
tier: standard
status: PENDING
---

# 49-01 — Resume trpc/trpc maybe-finding corpus mining now that workspaces.ts fallback is fixed

## Objective

Resume 49-00's blocked work (grow the triage dead-positive corpus to ≥30 cases across ≥3 repos, then add run-to-run bench variance and re-derive regression floors) now that phase 50 has fixed the `resolveWorkspaces` dist→src fallback bug that made trpc/trpc monorepo scans degenerate.

## Acceptance Criteria

### AC-1: Grow the dead-positive corpus so recall moves in finer, multi-repo steps
Given `test/fixtures/triage-realrepo/cases.json` currently has 15 `truth: "dead"` cases across 2 repos (honojs/hono, trpc/trpc), so recall can only move in ~6.7pp steps and a single case's outcome swings it by that much, and `trpc/trpc` (pinned SHA c7360d4) now scans non-degenerately with `necro scan --json .` from the repo root (per rec-20260718-002 / phase 50 — NOT `necro scan --json packages`, which still returns EMPTY for the subdir-target case)
When the corpus is grown to at least 30 hand-verified `dead` cases spanning at least 3 repos — mining trpc/trpc's ~90 unexplored `maybe` findings first, adding a genuinely new 3rd repo only if trpc mining doesn't reach the target (h3 is alive-only/no new `dead` cases per the phase-50 handoff notes; zod was a dead end, fastify unexplored) — each entry SHA-pinned and documented in `SOURCES.md` following the existing provenance convention
Then a single case's outcome swings recall by no more than ~3.3pp, `test/fixtures/triage-realrepo/cases.json` and `SOURCES.md` reflect the new counts/repos, and `test/triage-eval-capture.test.ts` passes against the expanded fixture

### AC-2: Track run-to-run variance instead of a single-run snapshot
Given `src/bench/snapshot.ts` / `bench/results.json` currently record one run's metrics under `methodologyVersion: 1`, and the live gate comment block in `test/triage-eval.live.test.ts` only documents 3 manually-run precision/recall samples rather than a stored artifact
When the bench runner (`src/bench/run.ts`) is changed to execute the live triage eval N times (N=3, matching the phase-13 precedent) and aggregate results
Then `BenchCorpusResult.metrics` (or a new field) records min/mean/max for precision, recall, and f1 across the N runs, `methodologyVersion` is bumped to 2, and `npm run bench` writes this multi-run artifact instead of a single-shot number

### AC-3: Regression floors are re-derived from the grown corpus + measured variance
Given `PRECISION_GATE` (0.85) and `RECALL_GATE` (0.4) in `test/triage-eval.live.test.ts` were set as floors under the old 48-case corpus's observed minima
When AC-1's expanded corpus and AC-2's multi-run variance data are available
Then the gate constants and their explanatory comment block are updated to the new observed minima (same documentation style as the existing phase-13 provenance comment), and the live gate test still passes with `ANTHROPIC_API_KEY` set

## Tasks

### T1: Capture + hand-verify new dead-positive cases, primarily by mining trpc/trpc
- files: `test/fixtures/triage-realrepo/cases.json`, `test/fixtures/triage-realrepo/SOURCES.md`
- action: run `necro scan --json .` (repo root as target — not `--json packages`) against trpc/trpc pinned at SHA c7360d4, feed the ~90 unexplored `maybe` findings through `captureEvalSkeletons` (`src/triage/eval-capture.ts`), hand-label `truth`/`rationale` for enough symbols to reach ≥30 total `dead` cases across ≥3 repos; if trpc mining alone doesn't reach the target, add a genuinely new 3rd repo (not h3 — alive-only) and repeat; append to `cases.json`, document repo/SHA/counts in `SOURCES.md`
- verify: `test/triage-eval-capture.test.ts` passes; `cases.json` has ≥30 `truth: "dead"` entries spanning ≥3 distinct `provenance.repo` values
- done: AC-1

### T2: Extend the bench snapshot shape to carry multi-run variance
- files: `src/bench/snapshot.ts`
- action: add min/mean/max fields to `TriageMetrics` (or a sibling `TriageMetricsVariance` type) for precision/recall/f1; bump `methodologyVersion` to `2`; update `summarizeTriage` to accept an array of per-run metrics and derive the aggregate
- verify: existing `src/bench/snapshot.ts` unit tests updated and passing; type-checks clean
- done: AC-2

### T3: Run the triage live eval N=3 times and aggregate in the bench runner
- files: `src/bench/run.ts`, `src/bench/cli-bench.ts`
- action: change `runBench` to invoke `runEval` against the triage corpus 3 times (sequential or bounded-concurrency), pass the 3 results into the updated `summarizeTriage`, and write the resulting multi-run `BenchResults` via the existing `npm run bench` path
- verify: `npm run bench -- --corpus triage` (or equivalent) writes `bench/results.json` with `methodologyVersion: 2` and min/mean/max populated
- done: AC-2

### T4: Re-derive and update the regression gate floors
- files: `test/triage-eval.live.test.ts`
- action: with `ANTHROPIC_API_KEY` set, run the live gate against the AC-1 corpus via the AC-2/AC-3 multi-run bench path, observe the new precision/recall minima, and update `PRECISION_GATE`/`RECALL_GATE` plus the explanatory comment block (matching the existing phase-13 provenance-comment style) to reflect the new corpus size and observed minima
- verify: `test.runIf(process.env.ANTHROPIC_API_KEY)` live gate test passes against the new floors; `TUNED_FALSE_POSITIVES` assertions still hold
- done: AC-3

## Boundaries

- DO NOT touch the `dup` (duplication-refactor) corpus or `test/refactor-eval.live.test.ts` floors — this phase is triage-only
- DO NOT make CI invoke the live API — `test.runIf(process.env.ANTHROPIC_API_KEY)` gating must remain, so CI stays a zero-network skip
- DO NOT fabricate or LLM-generate case labels — every new case must be hand-verified and SHA-pinned per the existing `SOURCES.md` convention
- DO NOT break `bench/results.json` backward compatibility for `website/src/content/docs/guide/accuracy.mdx` — the schema/methodologyVersion change must be additive, not a breaking rewrite
- DO NOT use `necro scan --json packages` for the trpc/trpc mining pass — that subdir-target path still returns EMPTY from `resolveWorkspaces` (rec-20260718-002's documented out-of-scope caveat); scan from the repo root with `necro scan --json .` instead
