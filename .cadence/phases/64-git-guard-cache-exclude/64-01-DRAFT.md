---
phase: 64-git-guard-cache-exclude
id: 64-01
tier: standard
status: PENDING
---

# 64-01 — dirty-tree guard ignores necro's own .necro-cache artifact

## Objective

`fix --write`'s dirty-tree guard refuses on a repo that was clean before the command ran, because the scan it just performed wrote `.necro-cache/` into the target — teach the guard to ignore necro's own cache artifact.

## Decision (made this session)

Exclude `.necro-cache` from the guard's own `git status` call via a pathspec magic exclude — cache location/semantics from phase 58 are untouched; only `workingTreeState`'s definition of "dirty" changes.

## Acceptance Criteria

### AC-1: a repo whose only "change" is `.necro-cache/` reads as clean
Given a freshly committed, otherwise-clean repo containing an untracked `.necro-cache/` directory
When `workingTreeState` runs
Then it returns `"clean"`, not `"dirty"`

### AC-2: a genuine untracked/modified file elsewhere still reads as dirty
Given the same repo, plus an untracked file outside `.necro-cache/`
When `workingTreeState` runs
Then it returns `"dirty"` — the exclude is scoped to the cache directory only, not a blanket pass

### AC-3: `necro fix --write` on a freshly committed repo no longer refuses on its own scan's cache write
Given a freshly git-init+commit'd fixture with one certain-dead symbol whose removal doesn't break typecheck
When `necro fix --write` (verify-by-default, phase 63) runs with no prior scan
Then it removes the symbol (status `written`), not `refused-dirty`

## Tasks

### T1: export `CACHE_DIR` from `symbol-graph-cache.ts`; exclude it in `workingTreeState`
- files: `src/graph/symbol-graph-cache.ts`, `src/fix/git-guard.ts`
- action: `export const CACHE_DIR = ".necro-cache";` (single source of truth — no duplicated literal). In `workingTreeState`, add a pathspec exclude to the `git status --porcelain` call: `["status", "--porcelain", "--", ".", \`:(exclude)**/${CACHE_DIR}\`]`.
- verify: `npm test -- fix-git-guard.test.ts`
- done: AC-1, AC-2

### T2: end-to-end regression via the built CLI
- files: `test/cli-fix.test.ts`
- action: Add a case: fresh git-init+commit fixture (no prior scan), `necro fix . --write` with no flags, assert `status` "written" / the symbol is gone from disk — proving the phase-63 default-verify path (which already dodges this incidentally) AND the unverified `--no-verify` path both actually succeed now without `--force`.
- verify: `npm run build && npm test -- cli-fix.test.ts`
- done: AC-3

### T3: unit tests for AC-1/AC-2
- files: `test/fix-git-guard.test.ts`
- action: Add a case with only an untracked `.necro-cache/` dir → `"clean"` (AC-1), and a case with `.necro-cache/` plus a genuinely untracked file elsewhere → `"dirty"` (AC-2). Confirm red against pre-T1 code, then green after.
- verify: `npm test -- fix-git-guard.test.ts`
- done: AC-1, AC-2

## Boundaries

- DO NOT change where `.necro-cache` is written (`defaultCachePath` in `symbol-graph-cache.ts` stays `join(targetPath, CACHE_DIR, CACHE_FILE)`) — this phase only changes the dirty-tree guard's own check, not the cache's location.
- DO NOT change `runVerifiedFix`'s incidental early-return behavior (zero green edits) — it already dodges this bug for unrelated reasons; leave it alone.
- DO NOT touch the AC-2/AC-2-style test in `test/cli-fix.test.ts` that already uses `--force` (phase 63) — it stays as-is; this phase adds a new case, not a rewrite of that one.
