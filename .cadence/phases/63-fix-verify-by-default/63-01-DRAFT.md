---
phase: 63-fix-verify-by-default
id: 63-01
tier: standard
status: PENDING
---

# 63-01 — fix --write verifies by default; --no-verify escape hatch

## Objective

`necro fix --write` deletes on the dirty-tree guard alone today — the empirical build-green check (`verifyFindings`) exists but is opt-in (`--verify`), so the CLI's destructive default path is ungated. Flip the CLI default to verified, with a plain `--no-verify` escape hatch.

## Decision (made this session, not re-litigated)

- Default verify check set: **typecheck-only** (`["npm run typecheck"]`) — fast, distinct from `verify-removal`'s own `DEFAULT_CHECKS` (typecheck+tests), which is untouched.
- Escape hatch: **plain `--no-verify`**, no separate confirmation flag — `fix --write` already requires an explicit `--write` and refuses on a dirty tree, which is friction enough.
- Scope: the CLI's own default only. `runFix`'s library-level `opts.verify` keeps today's semantics (`undefined` → unverified) — existing library callers/tests are unaffected; only the CLI command's option default changes.

## Acceptance Criteria

### AC-1: `necro fix --write` with no flags verifies each removal before writing
Given a certain-dead symbol whose removal would break the build (a typecheck-breaking removal)
When `necro fix --write` runs with no `--verify`/`--no-verify`/`--checks` flags
Then that symbol is skipped (reported in a skipped list), not deleted — the same outcome `--verify` produces today

### AC-2: `--no-verify` restores the old unverified immediate-delete behavior
Given the same typecheck-breaking removal
When `necro fix --write --no-verify` runs
Then the symbol is deleted unconditionally, exactly as `fix --write` (no verify) behaves today

### AC-3: the default verify check set is typecheck-only, not verify-removal's typecheck+tests
Given no `--checks` flag
When the default-verified `fix --write` path runs
Then only a typecheck command is run per candidate (not also a test-suite run) — overridable via `--checks`

### AC-4: README accurately describes the new default
Given the `fix` usage section and the `fix` roadmap bullet
When read straight through
Then they state that `--write` verifies each removal (typecheck) before applying it by default, and that `--no-verify` skips this

## Tasks

### T1: CLI default flip
- files: `src/cli.ts`
- action: Replace the `--verify` option with `.option("--no-verify", "skip the empirical build-green gate before deleting (on by default, typecheck only)")` on the `fix` command. Commander's `--no-` convention defaults the underlying `verify` property to `true` with no separate `--verify` flag needed. Update the `--checks` option's description ("check command for the verify gate (repeatable; default: typecheck)"). The `.action()` body's `verify: opts.verify` line is unchanged — it now carries `true` by default instead of `undefined`.
- verify: `npm run build && npm test -- cli-fix.test.ts`
- done: AC-1, AC-2

### T2: typecheck-only default check set for fix's verify gate
- files: `src/fix/index.ts`
- action: Export `FIX_VERIFY_DEFAULT_CHECKS = ["npm run typecheck"]`. In `runVerifiedFix`, pass `checks: opts.checks ?? FIX_VERIFY_DEFAULT_CHECKS` to `verifyFindings` (today it passes `opts.checks` straight through, letting `verifyRemovals`'s own `DEFAULT_CHECKS` — typecheck+tests — apply). Do not touch `DEFAULT_CHECKS` in `refactor/index.ts` or its other two call sites (`verify-removal`, `refactor`).
- verify: `npm test -- fix.test.ts`
- done: AC-3

### T3: README alignment
- files: `README.md`
- action: Update the `necro fix src/ --write` usage line (~L116) and the `fix` roadmap bullet (~L356) to state the verify-by-default behavior and the `--no-verify` escape hatch.
- verify: manual read-through
- done: AC-4

### T4: tests for AC-1/AC-2/AC-3
- files: `test/cli-fix.test.ts`, `test/fix.test.ts`
- action: Update the two existing `cli-fix.test.ts` cases to drop the now-redundant `--verify` flag (it's the default). Add a CLI case proving no-flags `fix --write` skips a build-breaking removal (AC-1) and one proving `--no-verify` deletes it anyway (AC-2). Add a `fix.test.ts` case proving the default verify check set is typecheck-only when `runFix` is called with `verify: true` and no `checks` (AC-3). Confirm red against pre-T1/T2 code, then green after.
- verify: `npm run build && npm test -- cli-fix.test.ts fix.test.ts`
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT change `DEFAULT_CHECKS` in `refactor/index.ts` — it's shared by `verify-removal` and `refactor`, both untouched by this phase.
- DO NOT change `runFix`'s own library-level default for `opts.verify` (stays `undefined` → unverified for direct library callers) — only the CLI command's option default changes.
- DO NOT add a confirmation flag for `--no-verify` — decided against above.
