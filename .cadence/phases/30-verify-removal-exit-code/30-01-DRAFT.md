---
phase: 30-verify-removal-exit-code
id: 30-01
tier: standard
status: PENDING
---

# 30-01 — Fix verify-removal exit code on unsafe/error verdicts

## Objective

Make `necro verify-removal` set a non-zero exit code when any symbol's removal verdict is `red` (the build breaks), so its headline CI-gating use case — "fail the build if this symbol turns out unsafe to remove" — actually works; today the CLI never touches `process.exitCode`, so the process exits 0 regardless of verdicts (confirmed live in the 2026-07-01 audit, `ev-20260701-002`).

## Acceptance Criteria

### AC-1: a red verdict exits non-zero
Given a symbol whose removal fails a check (`--checks false`)
When `necro verify-removal <symbol> --checks false` runs
Then the process exits non-zero (1), matching the printed "✗ ... removal breaks the build" verdict

### AC-2: an all-green run still exits 0
Given only symbols whose removal keeps every check passing
When `necro verify-removal <symbols...>` runs
Then the process exits 0, unchanged from today

### AC-3: unresolved symbols alone don't fail the run
Given a symbol query that doesn't resolve to exactly one declaration (no red verdicts present)
When `necro verify-removal <symbol>` runs
Then the process still exits 0 — unresolved is "couldn't determine", not "unsafe", and this preserves the existing phase-26 test's locked-in behavior

### AC-4: mixed red + unresolved in one run still exits non-zero
Given one symbol that resolves and badges red and one that's unresolved, verified together
When `necro verify-removal <redSymbol> <unresolvedSymbol> --checks false` runs
Then the process exits non-zero — a red verdict anywhere in the run must not be masked by an unresolved one

## Tasks

### T1: set process.exitCode from the verdict array
- files: `src/cli.ts`
- action: in the `verify-removal` command's action handler, after computing `results`, set `process.exitCode = 1` when `results.some(r => r.status === "red")`. Mirrors the existing `explain` command's pattern (`if (result.status !== "resolved") process.exitCode = 1`) already in this file.
- verify: `npm run build && npm test -- test/cli-verify-removal.test.ts`
- done: AC-1, AC-2, AC-3, AC-4

### T2: update the phase-26 test that documents the bug as correct behavior
- files: `test/cli-verify-removal.test.ts`
- action: the existing test "AC-4: renders a per-symbol red verdict when a check fails" currently asserts `code === 0` for a red verdict — that's the bug being fixed here. Flip that expectation to `code !== 0` (or the specific value 1). Leave the "unresolvable symbol ... exit stays 0" test as-is (still true per AC-3).
- verify: `npm test -- test/cli-verify-removal.test.ts`
- done: AC-1

### T3: mixed red+unresolved regression test
- files: `test/cli-verify-removal.test.ts`
- action: add a test running `verify-removal` with two symbols in one invocation — one that resolves and badges red, one that doesn't resolve at all — asserting the process still exits non-zero despite the unresolved entry being present
- verify: `npm test -- test/cli-verify-removal.test.ts`
- done: AC-4

## Boundaries

- Do NOT change `RemovalVerdict`, `verifyRemovals`, or `verifyFindings` (`src/engine/verify-removal.ts`) — the engine already distinguishes `green`/`red`/`unresolved`; this phase only fixes the CLI's failure to act on that information. No engine changes needed.
- Do NOT change `VerifyBadge`/`VerifyRunner` (`src/refactor/verify.ts`) to add a distinct "check failed to run" vs "build broke" status — the audit evidence mentions this as a nice-to-have, but it's out of this rec's stated scope (`affectedFiles: ["src/cli.ts"]`) and would ripple into `refactor`'s other consumers (extract-duplicate, refactor propose). A future rec if wanted.
- Do NOT change `fix --verify`'s exit-code behavior (phase 29) — it already has its own taxonomy (`skipped[]` with `reason`) and doesn't rely on `process.exitCode` for the red/unresolved distinction.
- Do NOT touch the `--json` output shape — `results` is unchanged; only `process.exitCode` is added.
