# SETTLE Summary — 14-14

**Completed:** 2026-06-10T15:05:59.644Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS
- AC-4: PASS

## Tasks

- T1: DONE — Added src/refactor/eval-capture.ts (captureRefactorSkeletons) + optional provenance on RefactorEvalCase. TDD: 4 new tests (test/refactor-eval-capture.test.ts) green; existing refactor-eval.test.ts 14/14 green; tsc + biome clean.
- T2: DONE — Built test/fixtures/refactor-realrepo/cases.json (14 cases: 3 honojs/hono @ e50df01, 11 trpc/trpc @ c7360d4; 54-169 loc, named top-level, diverse packages, verbatim source verified against checkouts) + SOURCES.md. Selected from 188 production loc-over god functions; excluded anonymous/vendored/test. Hardened capture for absolute scan paths.
- T3: DONE — Added test/refactor-realrepo-corpus.test.ts (5 tests, no key/no network): corpus integrity (>=12 cases, >=2 repos, raw verbatim source, signature=first line, loc>threshold, complete provenance) + structural scoring math on real case getKeyAlgorithm (good split passRate 1; single/sigChanged/unparseable fail). Verified assertions bite on degraded corpora. tsc + biome clean.
- T4: DONE — Added real-repo live block to refactor-eval.live.test.ts (auto-skips without key). Calibrated over 3 live runs (opus-4-8): 0.86/0.64/0.57, min 0.57. Set REALREPO_PASS_RATE_GATE=0.5 (below min, margin for non-determinism). Per-run numbers + streaming/batching weakness documented in SOURCES.md. httpBatchLink failed all 3 runs — genuine finding the synthetic eval hid.
- T5: DONE — Regression sweep clean: full suite 259 passed / 5 live skipped (no CI network); git diff of src/refactor/prompt.ts + client.ts since ef65cf1 is empty (byte-for-byte unchanged); eval-capture.ts imports no Anthropic SDK (lazy isolation held). Added deterministic AC-4 test asserting every real-repo case is scored through the unchanged production SYSTEM_PROMPT.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
