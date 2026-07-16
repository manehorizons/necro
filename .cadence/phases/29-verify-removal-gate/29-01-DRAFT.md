---
phase: 29-verify-removal-gate
id: 29-01
tier: standard
status: PENDING
---

# 29-01 — Gate fix on verify-removal

## Objective

Add an opt-in `--verify` mode to `fix --write` that only deletes a symbol once `verify-removal`'s empirical isolated-worktree check confirms the build stays green, closing the gap where `fix` deletes certain-dead code today without running that check at all.

## Acceptance Criteria

### AC-1: verified write deletes only green symbols
Given a target with two `certain`-dead findings, one whose removal keeps the build green and one whose removal breaks a check
When `necro fix --write --verify` runs
Then only the green symbol's file is edited on disk, and the result reports the red symbol as skipped with its failing check output

### AC-2: unresolved symbols are skipped, not deleted
Given a `certain`-dead finding whose symbol query fails to resolve to exactly one declaration in the reachability model (e.g. an ambiguous/duplicate name)
When `necro fix --write --verify` runs
Then that symbol's edit is not applied and it is reported as skipped with an "unresolved" reason, and any other green symbols in the same run still get written

### AC-3: verified preview reports per-symbol verdicts without mutating
Given the same mixed green/red/unresolved fixture as AC-1/AC-2
When `necro fix --verify` runs without `--write`
Then no files are modified, and the preview output lists each eligible symbol's verdict (would-remove / skip-red / skip-unresolved) instead of the unconditional diff

### AC-4: unverified fix is unchanged (no regression)
Given the same mixed fixture
When `necro fix --write` runs without `--verify` (today's default)
Then behavior is byte-for-byte identical to pre-phase-29 `fix` — all `certain`-dead findings are deleted regardless of verify-removal status, proving `--verify` is strictly additive

## Tasks

### T1: verify-eligible findings before planning their removal
- files: `src/fix/index.ts`, `src/engine/verify-removal.ts`
- action: export a helper off `verify-removal.ts` that takes `ClassifiedFinding[]` (not raw symbol strings) and returns `RemovalVerdict[]` by building `file:name` queries per finding over one shared reachability model — mirroring `verifyRemovals`'s per-symbol isolated-worktree loop. Wire `runFix` to call it when `opts.verify` is set, and partition `findings` into green (proceed) vs red/unresolved (skip) before calling `planRemovals`.
- verify: unit test with an injected mock `runnerFactory` (same pattern as existing `verify-removal` tests) exercising one green + one red symbol
- done: AC-1

### T2: skip unresolved symbols distinctly from red
- files: `src/fix/index.ts`
- action: extend `FixResult`'s `written` variant (and the new verified-preview variant) with a `skipped: { symbol: string; reason: "red" | "unresolved"; output?: string }[]` field so unresolved and failed-check skips are both reported but distinguishable
- verify: unit test asserting an ambiguous-name fixture lands in `skipped` with `reason: "unresolved"`, not silently dropped
- done: AC-2

### T3: `--verify` preview mode
- files: `src/fix/index.ts`, `src/report/*` (wherever `fix` preview is rendered), `src/cli.ts`
- action: when `opts.verify && !opts.write`, run the same verification pass and render a per-symbol verdict list instead of `renderDiff`'s unconditional diff; add `--verify` to the `fix` command's `commander` options and thread it into `runFix`
- verify: manual CLI run (`necro fix --verify` preview only) against the fixture with mixed verdicts; confirm no files change on disk
- done: AC-3

### T4: regression test — unverified path untouched
- files: `test/fix.test.ts`
- action: add a test that runs `runFix` without `opts.verify` against the same mixed fixture used in T1-T3 and asserts every `certain`-dead finding is removed regardless of what `verify-removal` would say, confirming `--verify` changed nothing about the default path
- verify: `npm test` — existing `fix.test.ts` suite plus this new case all green
- done: AC-4

## Boundaries

- Do NOT make `--verify` the default. `verify-removal` spins up a throwaway git worktree and runs the full check suite (typecheck + tests) per symbol — forcing it on by default would silently multiply `fix --write`'s cost by the number of eligible symbols. Opt-in only.
- Do NOT add an MCP tool for `fix` in this phase. `fix` is CLI-only today (`src/mcp/tools/` has no `fix.ts`) — exposing a write-capable removal loop to MCP callers is a separate decision with its own safety questions, out of scope here. The rec's "CLI + MCP" framing is deferred to a follow-up phase once the CLI-side verified gate is proven.
- Do NOT change `verify-removal`'s own engine, CLI command, or MCP tool surface (`src/engine/verify-removal.ts`'s existing `verifyRemovals` export, `necro verify-removal`, `src/mcp/tools/verify-removal.ts`). This phase only adds a new caller into `runFix`; the verification primitive itself stays as shipped in phase 26.
- Do NOT touch `src/refactor/verify.ts` (`verifyEdits`, `gitWorktreeRunner`) — reuse as-is.
