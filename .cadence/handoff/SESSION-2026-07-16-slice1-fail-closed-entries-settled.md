---
cadence_handoff: 1
generated_at: 2026-07-16T02:27:25.303Z
label: slice1-fail-closed-entries-settled
loop_position: IDLE
active_phase: 28-fail-closed-entry-resolution
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 9741c78
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-16 (slice1-fail-closed-entries-settled)

## TL;DR for the next session
- Slice 1 of `docs/slice1-handoffs/necro-slice1-handoff.md` (Fail-Closed Entry Resolution) is **fully implemented and settled** as CADENCE phase `28-fail-closed-entry-resolution` — all 8 ACs PASS, loop is IDLE.
- Corpus-first discipline followed throughout: 10-case fixture corpus authored and baselined against `main` *before* any implementation (T1), matching the handoff's predicted red/green split exactly.
- Necro's own `fix --write` no longer mass-deletes correct code — verified end-to-end against the real built CLI, not just unit tests.
- Nothing is blocked. Working tree is dirty with the settled changes (not yet committed — this session never commits without asking, per policy).
- Also switched CADENCE's verification providers from `mock` to `host-cli` for all 6 seams (verifier, perTaskVerifier, codeReview, planReview, securityAudit, specReview) at the user's request, mid-session, *after* phase 28 settled under `mock`.
- Next action: decide whether to commit phase 28's changes, then pick the next unit of work — either a P0 item from the Praxis recommendations queue (rec-20260701-001/002/003/004) or Slice 2 of the handoff (`publicApiIds` wiring / export evidence truthfulness), which is explicitly out-of-scope for phase 28 and not yet started.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `9741c78`
- Recent commits:
```
9741c78 chore: stop blanket-ignoring .cadence/handoff/
8b78cdf test(27): explain --narrate coverage — prompt, client, engine, CLI, MCP (AC-1..4)
3167f6b feat(27): explain --narrate — additive LLM narrative over the deterministic verdict (T1-T5)
4b0aa27 test(26): verify-removal coverage — planner, engine, CLI, MCP (AC-1..5)
02ba2f5 feat(26): necro verify-removal — per-symbol removal safety in isolated worktrees (T1-T4)
fd94740 test(25): explain coverage — tracePath, model, engine, CLI, MCP (AC-1/2/3/4)
1e056b7 feat(25): necro explain — reachability trace explainer (CLI + MCP) (T1-T5)
931fa85 test(24): synthesized monorepo corpus + AC-1/2/3 tests (T4)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md          |  10 ++--
 .cadence/config.json       |  36 ++++++++++---
 .cadence/state.json        |  15 +++---
 CHANGELOG.md               |  26 ++++++++++
 README.md                  |  48 +++++++++++++++++-
 src/analyze/classify.ts    |  21 ++++++--
 src/cli.ts                 |  18 +++++--
 src/config.ts              |   5 ++
 src/engine/index.ts        |  24 +++++++--
 src/engine/model.ts        |  88 ++++++++++++++++++++++++++++++--
 src/engine/prod-entries.ts | 123 +++++++++++++++++++++++++++++++++++++++++----
 src/fix/index.ts           |  26 +++++++++-
 src/report/json.ts         |   5 ++
 src/report/sarif.ts        |   4 ++
 src/report/terminal.ts     |  17 +++++++
 test/classify.test.ts      |  59 ++++++++++++++++++++++
 test/config.test.ts        |   9 ++++
 test/fix.test.ts           |  42 +++++++++++++++-
 test/release-shape.test.ts |  47 +++++++++++++++++
 test/report.test.ts        |  37 +++++++++++++-
 test/sarif.test.ts         |  18 +++++++
 test/scan.test.ts          |  10 ++++
 22 files changed, 638 insertions(+), 50 deletions(-)
```
- Loop: IDLE · phase 28-fail-closed-entry-resolution · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260612-001 — Verified auto-removal loop: gate fix on verify-removal (accepted/ready-for-milestone)
  - rec-20260701-001 — Add ci.yml: typecheck + build + test on every push/PR (candidate/ready-for-milestone)
  - rec-20260701-002 — Fix verify-removal exit code: non-zero on unsafe/error verdicts (candidate/ready-for-milestone)
  - rec-20260701-003 — Fix --checks parsing: repeatable flag or JSON array instead of comma-split (candidate/ready-for-milestone)
  - rec-20260701-004 — Sync every doc surface to HEAD (phases 22-27) (candidate/ready-for-milestone)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `src/fix` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `src/explain` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `src/cli.ts` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `src/mcp` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `.github/workflows/` — affected by rec-20260701-001 Add ci.yml: typecheck + build + test on every push/PR
  - `README.md` — affected by rec-20260701-004 Sync every doc surface to HEAD (phases 22-27)
  - `CHANGELOG.md` — affected by rec-20260701-004 Sync every doc surface to HEAD (phases 22-27)
  - `website/src/content/docs/` — affected by rec-20260701-004 Sync every doc surface to HEAD (phases 22-27)

## What landed this session
- Scaffolded CADENCE phase `28-fail-closed-entry-resolution` (draft `28-01`, tier complex); planning/DRAFT content (Objective, 8 ACs, T1-T8 tasks, Boundaries) was authored via a Fable-model agent per user instruction, grounded in `docs/slice1-handoffs/necro-slice1-handoff.md`.
- **T1**: authored 10-case fixture corpus at `test/entry-resolution/fixtures/<case>/` + `expected.json` per case + harness `test/entry-resolution.test.ts`; ran against `main` first and recorded the baseline (6 red / 4 green, matching the handoff's table exactly) into the DRAFT's Baseline Evidence section before writing any implementation.
- **T2**: new `src/engine/entry-mapping.ts` — tsconfig `outDir`/`rootDir` mapping + `dist|build|out → src` heuristic fallback + one-level `extends` resolution; extended `resolveProdEntries` (`src/engine/prod-entries.ts`) to return `{entries, records}` with per-entry `EntrySource` (`manifest|mapped|convention|scripts|config|plugin|workspace`).
- **T3**: `NecroConfig.entries?: string[]` (`src/config.ts`) + `package.json` `scripts` mining, both wired into `resolveProdEntries`.
- **T4**: `ReachabilityModel.entryResolution` (`prodEntryCount`, `sources`, `collapsed`) computed in `src/engine/model.ts`; threaded through `ScanResult.diagnostics` (`src/engine/index.ts` — see gotcha below), `--json` (`src/report/json.ts`), `--sarif` (`src/report/sarif.ts`, as `runs[0].properties.entryResolution`), and a new terminal warning banner (`renderEntryCollapseBanner` in `src/report/terminal.ts`).
- **T5**: `classify()` (`src/analyze/classify.ts`) gains `entryCollapse` — when true, every `dead` finding is demoted to `maybe`/`autoFixEligible:false` with a prepended truthful evidence signal, born consistent inside `classify()` (not post-hoc mutation).
- **T6**: `runFix` (`src/fix/index.ts`) returns `refused-no-entries` before the nothing-to-fix check and before the dirty-tree guard (no-entries wins precedence); new `fixExitCode()` taxonomy (0 written/preview/nothing-to-fix, 1 unexpected error, 2 refused-dirty — a deliberate contract change, it silently exited 0 before, 3 refused-no-entries), wired into `cli.ts`.
- **T7**: README (`fix` exit codes, `entries` config, banner explanation) + `CHANGELOG.md` `[1.2.0] — Unreleased` entry.
- **T8**: full chain (`build && typecheck && test`) green — 428 passed, 0 failed; self-scan at repo root confirmed `src/cli.ts` resolves via `mapped`; end-to-end CLI smoke test confirmed exit 3 + no-entries-wins-over-dirty via the actual `dist/cli.js` binary, not just `runFix()` unit calls.
- Settled via `cadence settle run --auto --allow-code-review-failure` — the one code-review HIGH finding (`src/cli.ts:100 console.log`) is a false positive (that line is the pre-existing `--json` output printer); overrode rather than removing legitimate output. Had to add two new asserting tests to `test/release-shape.test.ts` to satisfy cadence's AC↔test coverage gate for AC-7 (boundary compliance, checked via a real `git diff --name-only` against baseline sha `9741c78`) and AC-8 (CHANGELOG content).
- Post-settle, at the user's request: `cadence activate --provider host-cli` (deep-verify seam only), then after the user asked what `--all` meant and said "Continue": `cadence activate --provider host-cli --all` — all 6 verification seams now real (host-cli) instead of `mock`.

## Carry-forward gotchas
- `src/engine/index.ts` was touched even though the handoff's own §5.7 allowlist omits it — the handoff's Task-4 file list (§6 step 4) requires it, and `ScanResult`/`scan()` are defined there, so there was no way to add `diagnostics` without it. Flagged to the user mid-build; they approved amending the DRAFT's Boundaries section (see `28-01-DRAFT.md`) rather than reverting. Don't be surprised this file is in the diff — it's covered and intentional, not scope creep.
- The `fix` exit-code change is a **public CLI contract change**, confirmed with the user before implementing: `refused-dirty` used to print to stderr but exit `0` (a latent bug); it's now exit `2`. Anything downstream (CI scripts, docs, the GitHub Action) that assumed `fix` always exits 0 on refusal needs a look — not addressed in this session, out of this slice's file allowlist.
- Necro's own repo resolves `src/cli.ts` via the **heuristic** fallback path (`mapped` source), not the tsconfig-mapping path — necro's `tsconfig.json` has no `outDir`/`rootDir` (it builds via esbuild directly). Don't assume the tsconfig branch is what's exercised on self-scan.
- `test/entry-resolution.test.ts` was deliberately written first against *pre-slice* APIs (bare `Set<string>` from `resolveProdEntries`, no `entryCollapse`, no `refused-no-entries`) to prove the baseline red/green split on `main`, then evolved in place task-by-task as each capability landed. If you need to understand the corpus contract, read `expected.json` per fixture case, not the harness's git history.
- The "State on handoff" block above is a **historical snapshot** taken while the tree was still dirty. Everything shown there (plus `.cadence/config.json`'s provider switch, plus all the pre-existing untracked phase-15..27 directories and `.claude/`/`docs/slice1-handoffs/`/`audit-report-2026-07-01.html` from before this session) was committed together as `5b0148c` ("WIP: handoff — slice1-fail-closed-entries-settled") at the user's explicit request. The tree is clean as of that commit — if you want phase 28's code/tests separated from the config provider-switch or the older untracked cruft, that's a `git reset`/re-split job against `5b0148c`, not a fresh commit.
- All future settle/deep-verify/code-review/plan-review/security-audit/spec-review gates in this project now route through `host-cli` (this CLI) instead of `mock` — expect real judgment calls (and occasional false positives needing `--allow-*-failure` overrides, as happened this session) rather than the deterministic mock heuristics from before.

## Next action
**Action:** Everything is already committed as `5b0148c` ("WIP: handoff — slice1-fail-closed-entries-settled") — a single commit bundling phase 28's implementation, the CADENCE provider-switch config, and some pre-existing untracked cruft (see gotcha above). If that commit message/shape isn't good enough for history, consider `git reset --soft 9741c78` and re-committing in cleaner, separated commits before pushing. Otherwise: run `cadence progress` to confirm the loop is still IDLE, then either pick up a P0 Praxis recommendation (`cadence recommend`) or start Slice 2 of the handoff (`publicApiIds` wiring / export evidence truthfulness) with `cadence draft new --title "..."`.

**Verify:** `git log --oneline -1` should show `5b0148c`; `git status --porcelain` should be empty; `npm run build && npm run typecheck && npm test` should stay green (428 passed) — re-run after any re-commit split to make sure nothing was mis-split.

**If it fails:** if you re-split commits and `npm test` regresses, the likely cause is separating `src/engine/index.ts`'s `diagnostics` field from `src/engine/model.ts`'s `entryResolution` field it depends on — keep phase 28's `src/`/`test/` changes as one atomic commit if you do re-split.
