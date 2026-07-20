---
phase: 61-fix-python-skip-accounting
id: 61-01
tier: standard
status: PENDING
---

# 61-01 — fix: explicitly count-and-skip Python certain findings

## Objective

`necro fix` (unverified path) silently no-ops on Python `certain` findings instead of reporting them as skipped, and its printed count can include findings that were never actually removed.

## Acceptance Criteria

### AC-1: Python-only certain findings are reported skipped, not "nothing to fix"
Given a scan whose only `certain`-dead findings are Python symbols
When `necro fix` (no `--write`) runs
Then the result reports 1 (or more) skipped Python symbol(s) with the "Python removal is not supported yet" reason, not a bare "nothing to fix"

### AC-2: mixed TS+Python certain findings report an accurate count and skip list
Given a scan with both TS and Python `certain`-dead findings
When `necro fix` (no `--write`) runs
Then the reported removal count reflects only the TS findings actually planned, and the Python findings appear in a skipped list — mirroring `verify-removal`'s existing named refusal (`engine/verify-removal.ts` ~L80)

## Tasks

### T1: filter Python findings out of the unverified fix path; count only what's planned
- files: `src/fix/index.ts`
- action: In `runFix`, split `findings.filter(f => f.autoFixEligible)` into Python (`isPythonFile(f.node.file)`) and non-Python. Build a `SkippedSymbol[]` from the Python ones (`reason: "unresolved"`, shared `PYTHON_REMOVAL_UNSUPPORTED` message). Plan removals only from the non-Python set; set `count` to that set's length (not the combined eligible count). Add `skipped: SkippedSymbol[]` to the `"nothing-to-fix"`, `"preview"`, and `"written"` `FixResult` variants and thread it through both return points.
- verify: `npm test -- fix.test.ts`
- done: AC-1, AC-2

### T2: share the Python-unsupported message; render skipped in the CLI
- files: `src/engine/verify-removal.ts`, `src/fix/index.ts`, `src/cli.ts`
- action: Export `PYTHON_REMOVAL_UNSUPPORTED` as a constant from `verify-removal.ts` (replacing its inline string) and import it in `fix/index.ts`. In `cli.ts`'s fix action, render the skipped list for `"nothing-to-fix"` and `"preview"` the same way `"written"` already does (factor a small shared print helper rather than tripling the loop).
- verify: `npm test -- cli-fix.test.ts`
- done: AC-1, AC-2

### T3: tests for both ACs
- files: `test/fix.test.ts`, `test/cli-fix.test.ts`
- action: Add a case titled with AC-1 (Python-only certain findings → skipped, not nothing-to-fix) and one titled with AC-2 (mixed TS+Python → accurate count + skip list). Confirm red against the pre-T1/T2 code, then green after.
- verify: `npm test -- fix.test.ts cli-fix.test.ts`
- done: AC-1, AC-2

## Boundaries

- DO NOT change the `--verify` path (`runVerifiedFix`) — it already reports Python findings correctly via `verifyRemovals`'s existing `isPythonFile` refusal; only share its message string, don't change its control flow.
- DO NOT change `planRemovalOf`'s ts-morph removal mechanics.
- DO NOT change the `SkippedSymbol` reason taxonomy (`"red" | "unresolved"`) — Python-unsupported reuses `"unresolved"`, same as the verify path already does.
