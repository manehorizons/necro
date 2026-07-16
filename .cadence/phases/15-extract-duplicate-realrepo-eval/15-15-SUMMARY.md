# SETTLE Summary — 15-15

**Completed:** 2026-06-10T16:31:00.561Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS
- AC-4: PASS

## Tasks

- T1: DONE — captureDuplicateSkeletons + DuplicateCaptureOptions added to eval-capture.ts; optional provenance on DuplicateEvalCase. 9 capture tests green (same-file, cross-file, absolute paths, empty), 14 existing refactor-eval tests green, tsc clean. Commit 42ef8b6.
- T2: DONE — 12 cases / 2 repos (4 trpc @ c7360d4, 8 drizzle-orm @ 48e5406). Captured via captureDuplicateSkeletons; auto-selected with quality filters (no test/config/type-noise, no doc/class straddles) + generic-oracle self-validation (whole corpus passRate=1 under oracle, guaranteeing collapsibility). hono/kysely evaluated+rejected (type-level/JSDoc dup only). SOURCES.md records repos/SHAs/scan cmds/selection criteria; calibration table pending T4. Commit 210685e.
- T3: DONE — test/refactor-dup-realrepo-corpus.test.ts: 7 tests, passes with ANTHROPIC_API_KEY unset, no network (mock clients + local tokenize/findClones). Asserts ≥12/≥2 repos, full integrity (locations resolve in-files, signatures survive verbatim, provenance.symbol===name), generic-oracle sweep passRate=1 over whole corpus, degenerate proposals fail, and unchanged DUP_SYSTEM_PROMPT (AC-4). Commit 3bf9af8.
- T4: DONE — Calibrated: 3 live runs (claude-opus-4-8) passRate 0.67/0.75/0.67, mean ~0.70, observed min 0.67. DUP_REALREPO_PASS_RATE_GATE=0.5 (below min, collapse-detector, not cherry-picked). Live block passes the floor on all 3 runs; auto-skips without key (no CI network). Calibration table filled in test comment + SOURCES.md. Commit c66e3d0.
- T5: DONE — No-regression verified. Non-live: prompt.ts byte-for-byte unchanged vs e23c3f9 (DUP_SYSTEM_PROMPT/buildDuplicatePrompt frozen); only eval.ts change is the optional provenance? field; no SDK import in capture path; full non-live suite 271 passed/6 skipped. Live: synthetic refactor eval 0.90 (≥0.8 ✓). NOTE: synthetic extract-duplicate live eval is a PRE-EXISTING flaky 2-case set (observed 0.50/0.50/1.00) — proven unchanged by this phase (0 diff to fixtures + dup scoring/prompt), so not a regression; out of scope for 15a (boundary forbids changing the synthetic gate). Worth a tiny follow-up to expand that 2-case set.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
