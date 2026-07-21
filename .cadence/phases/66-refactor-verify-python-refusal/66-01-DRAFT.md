---
phase: 66-refactor-verify-python-refusal
id: 66-01
tier: standard
status: PENDING
---

# 66-01 — Skip npm-only default checks for Python edits in refactor verify; refuse with a named reason

## Objective

When a refactor (`god-function`) or extract-duplicate proposal's verify step would fall back to the npm-only `DEFAULT_CHECKS` against an edit set touching a Python file, skip the checks and badge the outcome `skipped` with a named reason instead of running `npm run typecheck`/`npx vitest run` against Python and returning a guaranteed, misleading `red` (rec-20260719-006). An explicit `--checks` override is trusted as-is and still runs, even against Python — refusal applies only to the ambient default.

## Acceptance Criteria

### AC-1: a Python god-function proposal under default checks is skipped, not run
Given `runRefactor` is called with no explicit `checks` (so it would fall back to `DEFAULT_CHECKS`) and a `verifyRunner`
When the finding's `file` is a `.py` file
Then the outcome's `badge` is `{ status: "skipped", reason: <non-empty string> }` and the injected `verifyRunner`'s `runCheck` is never invoked

### AC-2: a TypeScript god-function proposal under default checks is unaffected
Given the same default-checks setup as AC-1
When the finding's `file` is a `.ts` file
Then the outcome's `badge` is `{ status: "green" }` (or `"red"`) exactly as before this phase — regression safety

### AC-3: an extract-duplicate proposal touching any Python location under default checks is skipped
Given `runExtractDuplicate` is called with no explicit `checks` and a `verifyRunner`
When at least one of the clone group's `locations` is a `.py` file (others may be `.ts`)
Then the outcome's `badge` is `{ status: "skipped", reason: <non-empty string> }` and `runCheck` is never invoked

### AC-4: an explicit --checks override against Python still runs as given
Given the caller passes an explicit `checks` array (e.g. `["pytest"]`) to `runRefactor` or `runExtractDuplicate`
When the finding/locations involve a `.py` file
Then the checks run normally through the injected `verifyRunner` — explicit caller intent is never silently overridden

### AC-5: the skip reason renders in the human-readable report
Given an outcome with `badge.status === "skipped"`
When `renderRefactor` or `renderExtractDuplicate` formats it
Then the rendered text includes the skip reason (not a blank/generic line)

## Tasks

### T1: add a `skipped` VerifyBadge variant
- files: `src/refactor/verify.ts`
- action: extend `export type VerifyBadge` with a third member `| { status: "skipped"; reason: string }`. No behavior change to `verifyProposal`/`verifyEdits` themselves — they still only ever return `green`/`red`; `skipped` is only ever constructed by the caller (T2).
- verify: `npx tsc --noEmit` passes (downstream exhaustive `switch` in `report/refactor.ts` will need the new case — see T3)
- done: (foundational; exercised by AC-1/AC-3)

### T2: skip verification for Python edits under default checks
- files: `src/refactor/index.ts`
- action: import `isPythonFile` from `../graph/python/language.js`. In `runRefactor`, compute `usingDefaultChecks = opts.checks === undefined` once (before the per-finding loop). Per finding, when `opts.verifyRunner` is set: if `usingDefaultChecks && isPythonFile(finding.file)`, set `badge = { status: "skipped", reason: "default checks are npm-based (typecheck+tests) and don't apply to Python — pass --checks explicitly (e.g. pytest) to verify" }` instead of calling `verifyProposal`; otherwise verify exactly as today. Mirror the same in `runExtractDuplicate`, using `finding.locations.some((l) => isPythonFile(l.file))` as the Python-involved test instead of a single file.
- verify: `npx vitest run test/refactor.test.ts test/refactor-duplicate.test.ts` — new AC-1..AC-4 tests pass
- done: AC-1, AC-2, AC-3, AC-4

### T3: render the skip reason
- files: `src/report/refactor.ts`
- action: add a `case "skipped":` arm to `badgeLabel`'s switch, returning a line that includes `badge.reason` (e.g. `` `⚠ verification skipped — ${badge.reason}` ``), matching the existing ✓/✗ prefix style.
- verify: `npx vitest run test/refactor.test.ts test/refactor-duplicate.test.ts` — AC-5 passes; `npx tsc --noEmit` confirms the switch is exhaustive again
- done: AC-5

## Boundaries

- DO NOT touch `src/engine/verify-removal.ts` or `src/fix/index.ts`'s own default-checks constants — `verify-removal` already refuses Python symbols by name before ever reaching checks (`isPythonFile` check ~L80), and `fix`'s removal path structurally never reaches Python (Python findings are capped below `certain`, phase 45 AC-6, so they never enter `planRemovals`). Both are already correctly handled; this phase is scoped to `runRefactor`/`runExtractDuplicate` only.
- DO NOT add Python-specific adaptive check commands (pytest/mypy/pyright autodetection) — refusal-with-reason, not adaptive defaults, is the chosen design (cheaper, fail-closed, matches the existing named-refusal idiom already used elsewhere in this codebase).
- DO NOT change the CLI's `--checks` flag parsing or add a new flag — the existing `--checks` escape hatch already covers AC-4.
