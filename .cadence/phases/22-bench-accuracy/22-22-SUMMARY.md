# SETTLE Summary — 22-22

**Completed:** 2026-06-11T18:59:49.709Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS

## Tasks

- T1: DONE — src/bench/snapshot.ts: pure types + deriveSources/summarizeTriage/summarizeDup/serialize/parse. 6 unit tests (test/bench-snapshot.test.ts), tagged AC-1/AC-3, green.
- T2: DONE — src/bench/run.ts: runBench orchestrates runEval + runDuplicateEval, injected clients+clock+loaders. 3 unit tests (test/bench-run.test.ts) with stub clients over real corpora, tagged AC-1/AC-3, green.
- T3: DONE — RESOLVED: live run executed (user's key), bench/results.json generated + committed. Triage precision 1.00/recall 0.47/F1 0.64 (N=48); dup pass-rate 0.92 (11/12). Provenance complete.
- T4: DONE — website/src/content/docs/guide/accuracy.mdx renders headline triage precision/recall/F1 + dup pass-rate FROM the committed snapshot (MDX import; vite fs.allow ['..']). Provenance caption, methodology, non-determinism caveat, reproduce block, limitations. Auto-added to sidebar (order 4.5). astro build green, all links valid, numbers verified in dist HTML.
- T5: DONE — test/bench-page-contract.test.ts guards page↔snapshot contract (AC-2/AC-3); proven to bite (RED on f1-removed copy, GREEN on real). Plus snapshot/run/cli units. Full suite 325 passed, typecheck clean.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
