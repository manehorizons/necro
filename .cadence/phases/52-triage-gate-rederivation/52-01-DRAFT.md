---
phase: 52-triage-gate-rederivation
id: 52-01
tier: standard
status: PENDING
---

# 52-01 — Re-derive phase 49 triage gates via host-cli live run; fix bench partial-corpus overwrite

## Objective

Complete phase 49's blocked AC-3 (re-derive `PRECISION_GATE`/`RECALL_GATE` from a real live run, now unblocked by phase 51's host-cli backend) and fix a latent bug the live run exposed — `npm run bench -- --corpus triage` silently drops the `dup` corpus from `bench/results.json` instead of preserving it.

## Acceptance Criteria

### AC-1: Regression floors re-derived from the phase-49 63-case corpus, live data
Given the user ran `npm run bench -- --provider host-cli --corpus triage` in their own terminal (outside this session, so the self-invocation guard didn't apply) and it produced a live 3-run snapshot (`methodologyVersion: 2`, n=63, precision 1.00/1.00/1.00, recall 0.80/0.80/0.80, 24 TP / 0 FP / 6 FN)
When `test/triage-eval.live.test.ts`'s `PRECISION_GATE`/`RECALL_GATE` constants and their provenance comment are updated to reflect this data
Then `PRECISION_GATE` stays `0.85` (still justified — the phase-49 data confirms 1.00 again, no basis to tighten the trust-critical metric's margin) and `RECALL_GATE` rises from `0.40` to `0.70` (comfortably under the new 0.80 minimum), the comment documents the phase-49 measurement alongside phase-11/13's history, and the test titles carry `(AC-3)`

### AC-2: A partial `--corpus` bench run no longer drops the other corpus from the snapshot
Given the live run above used `--corpus triage` and it overwrote `bench/results.json` wholesale, silently dropping the previously-committed `dup` corpus entry and breaking `test/bench-page-contract.test.ts`'s expectation that both corpora are present
When `src/bench/cli-bench.ts`'s `main()` writes a non-`"all"` corpus selection
Then it reads the existing snapshot at `--out` (if any) first and merges the fresh corpus/corpora over it by `id`, carrying forward any corpus not re-run this time — a full `--corpus all` run is unaffected (no existing file to merge, or replaces everything as before)

## Tasks

### T1: Update `PRECISION_GATE`/`RECALL_GATE` and the provenance comment
- files: `test/triage-eval.live.test.ts`
- action: add a "POST-CORPUS-GROWTH (phase 51/52)" section to the existing phase-11/13 provenance comment documenting the 63-case/2-repo corpus and the 3-run live host-cli measurement (precision 1.00/1.00/1.00, recall 0.80/0.80/0.80, 24 TP/0 FP/6 FN); raise `RECALL_GATE` to `0.7`; keep `PRECISION_GATE` at `0.85`; add `(AC-3)` to the real-repo gate test's title alongside the existing `(AC-2)`
- verify: `npx tsc --noEmit` clean; the live test file still compiles and its (unchanged-condition) `test.runIf(ANTHROPIC_API_KEY)` skips cleanly with no key present
- done: AC-1

### T2: Fix the bench snapshot partial-corpus overwrite bug
- files: `src/bench/cli-bench.ts`, `test/bench-cli.test.ts`
- action: add `readExisting`/`mergeCorpora` helpers; `main()` merges a non-`"all"` run's fresh corpora over the existing on-disk snapshot (by `id`) instead of overwriting wholesale; export `mergeCorpora` for direct unit testing
- verify: new `mergeCorpora` unit tests (no-existing-file passthrough, partial-run carries the other corpus forward, re-running the same id replaces rather than duplicates, top-level metadata comes from the fresh run) pass
- done: AC-2

### T3: Repair the already-corrupted `bench/results.json` and confirm the full suite is green
- files: `bench/results.json`
- action: restore the `dup` corpus entry (from the last commit before the live run) alongside the fresh `triage` entry the live run produced, so the committed snapshot has both corpora again
- verify: `test/bench-page-contract.test.ts` passes; full suite green
- done: AC-2

## Boundaries

- DO NOT re-run the live `dup`/duplication corpus — restore its last-known-good entry from git history instead of spending more live-model quota to regenerate it.
- DO NOT touch phase 49's AC-1 (corpus diversity, still blocked at 2/3 repos) — out of scope here, unrelated to gate re-derivation.
- DO NOT change `test.runIf(process.env.ANTHROPIC_API_KEY)` gating on the live test file — CI must stay a zero-network skip (same boundary phase 49 set).
- DO NOT make the `--corpus all` path behave differently — the merge-on-partial-run fix only changes behavior when `--corpus` is `"triage"` or `"dup"` alone.
