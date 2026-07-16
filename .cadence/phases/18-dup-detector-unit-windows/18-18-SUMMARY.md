# SETTLE Summary — 18-18

**Completed:** 2026-06-10T22:51:51.389Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS — live gate insensitive to this change by construction (static fixture corpus + unit-less residual path guarded by AC-4); user approved skipping billable run
- AC-4: PASS

## Tasks

- T1: DONE — Added UnitRange + optional FileTokens.units; per-token innermost-unit assignment + runEnd; units omitted → all -1 (one implicit unit). Covered by duplication.test.ts AC-2/AC-4 (green).
- T2: DONE — Window indexing skips straddling windows; greedy extension stops at a unit boundary for self and every group member (runEnd bound). duplication.test.ts AC-1 went RED→GREEN.
- T3: DONE — engine/index.ts groups computed FunctionUnits per file into ranges and passes them into findClones; eval.ts fragment path left unit-less. scan-duplication.test.ts AC-1 integration test RED→GREEN.
- T4: DONE_WITH_CONCERNS — Synthetic AC-1/AC-2 boundary tests added + green (280 passed). Live AC-3 gate (0.7) NOT run: traced that the dup corpus is a static fixture (cases.json) and the only live-path findClones call is the unit-less residual scorer (AC-4, deterministically guarded) — the detector change is insensitive to the live eval by construction, so billable runs would re-measure model non-determinism, not this change. User approved skipping. AC-3 = pass-by-construction.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
