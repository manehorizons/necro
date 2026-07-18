---
phase: 49-triage-corpus-variance
id: 49-00
tier: standard
status: PENDING
---

# 49-00 — Grow triage corpus (dead-positives) + track run-to-run variance

## Objective

Audit P2-12. Recall is 0.467 measured on only 15 positive cases — it moves in 6.7% steps, so recall work isn't even measurable until the corpus grows. Capture tooling (eval-capture.ts) and SHA-pinning exist; add more dead-positives and more repos. Also run bench N times and store min/mean/max (methodologyVersion bump) so the single-run LLM-in-the-loop snapshot becomes quantitatively honest.

## Acceptance Criteria

### AC-1: Grow the dead-positive corpus so recall moves in finer, multi-repo steps
Given `test/fixtures/triage-realrepo/cases.json` currently has 15 `truth: "dead"` cases across 2 repos (honojs/hono, trpc/trpc), so recall can only move in ~6.7pp steps and a single case's outcome swings it by that much
When the corpus is grown to at least 30 hand-verified `dead` cases spanning at least 3 repos, each entry SHA-pinned and documented in `SOURCES.md` following the existing provenance convention
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

### T1: Capture + hand-verify new dead-positive cases from a 3rd repo
- files: `test/fixtures/triage-realrepo/cases.json`, `test/fixtures/triage-realrepo/SOURCES.md`
- action: pick a 3rd public, license-compatible TS repo; run `necro scan --json` against a pinned SHA, feed it through `captureEvalSkeletons` (`src/triage/eval-capture.ts`) to produce skeletons, hand-label `truth`/`rationale` for enough symbols to reach ≥30 total `dead` cases across ≥3 repos, append to `cases.json`, and document repo/SHA/counts in `SOURCES.md`
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
