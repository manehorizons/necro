# SETTLE Summary — 12-12

**Completed:** 2026-06-09T22:44:34.047Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS
- AC-4: PASS
- AC-5: PASS

## Tasks

- T1: DONE — Prompt-content guard added to test/triage-prompt.test.ts, tagged AC-1; watched it fail (RED) before the prompt change.
- T2: DONE — SYSTEM_PROMPT (src/triage/prompt.ts) now instructs the model to discount absence-of-static-refs + unresolvable dynamic-taint as a death signal; AC-1 test GREEN, full prompt suite + typecheck clean. Committed 262bc48.
- T3: DONE — Live real-repo eval, 3 runs after location-weighted refinement (commit 3a83a5e): precision 1.00/1.00/1.00, recall 0.40/0.60/0.40. Zero alive→likely-dead FPs in all runs — RequiredRequestInit and detectResponseType fixed (AC-2). Precision clears the ≥0.70 floor with margin and also the 0.85 aspirational target (AC-3). First (overcorrecting) iteration discarded.
- T4: DONE — Raised PRECISION_GATE 0.4→0.7 in test/triage-eval.live.test.ts; retitled the real-repo gate to (AC-2, AC-3) and added a per-symbol assertion that RequiredRequestInit and detectResponseType are not likely-dead (AC-2). Synthetic gate keeps (AC-4); SDK-isolation invariant stays covered by triage-client.test.ts (AC-5). All five phase-12 ACs now appear in test titles.
- T5: DONE — Verification complete. Synthetic live eval: precision 1.00, recall 1.00 — clears ≥0.8, no regression (AC-4). Full CI suite: 249 passed / 4 skipped (live tests auto-skip without key); typecheck clean (AC-5). Gate/retag committed fcd68e8.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
