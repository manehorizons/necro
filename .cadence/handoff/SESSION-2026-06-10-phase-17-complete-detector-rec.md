---
cadence_handoff: 1
generated_at: 2026-06-10T21:54:47.981Z
label: phase-17-complete-detector-rec
loop_position: IDLE
active_phase: 17-dup-corpus-retire-multiunit
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 4d52ff9
git_ahead: 5
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-10 (phase-17-complete-detector-rec)

## TL;DR for the next session
- **Two phases settled this session, loop is IDLE — no work in progress.** Phase 16 (edited-site collapse scorer, resumed from the prior handoff) and phase 17 (retire multi-unit clone windows) are both DONE + settled, AC-1..4 pass each.
- **5 commits are ahead of origin and UNPUSHED** (the phase 16 + 17 work, HEAD `4d52ff9`). Nothing has been pushed this session. Deciding whether to `git push` is the main open action.
- **The natural next piece of work is `rec-20260610-002`** — fix the duplication *detector* (`findClones`) to stop emitting clone windows that straddle function boundaries (the root cause phases 16–17 curated around). This is **production-scope** (touches the shipped `refactor` feature + detector), bigger than the eval-only phases 16–17. Start it via `cadence draft new` only if you want to pursue it.
- The extract-duplicate eval is in a good state: live dup gate **raised 0.5 → 0.7**, real-repo pass-rate ~0.89 (min 0.83 / 3 runs). No regressions; full non-live suite green (276 passed, 6 live-skipped).
- Only uncommitted changes are `.cadence/STATE.md` + `state.json` (settle/handoff bookkeeping — leave them).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 5 ahead / 0 behind origin
- HEAD `4d52ff9`
- Recent commits:
```
4d52ff9 test(17-dup-corpus-retire-multiunit): live-validate backfills, raise floor 0.5->0.7 (AC-3, AC-4)
54e8ab4 test(17-dup-corpus-retire-multiunit): retire 3 multi-unit windows, backfill single-unit clones (AC-1)
f10b902 test(16-dup-corpus-single-unit): re-calibrate live dup floor on edited-site scorer (AC-3)
4352851 test(16-dup-corpus-single-unit): drop class-structural cases, backfill genuine-logic clones (AC-2)
c3f859c feat(16-dup-corpus-single-unit): edited-site collapse scorer + boundary tests (AC-1, AC-2)
c66e3d0 test(15-extract-duplicate-realrepo-eval): calibrated live real-repo dup gate, floor 0.5 (AC-3)
5402e12 test(15-extract-duplicate-realrepo-eval): live real-repo dup gate scaffold, calibration pending (AC-3)
3bf9af8 test(15-extract-duplicate-realrepo-eval): deterministic dup corpus-integrity guard (AC-2)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 17-dup-corpus-retire-multiunit · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260610-002 — Split clone windows at function boundaries in the duplication detector (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `src/syntactic/duplication.ts` — affected by rec-20260610-002 Split clone windows at function boundaries in the duplication detector
  - `src/syntactic/ir.ts` — affected by rec-20260610-002 Split clone windows at function boundaries in the duplication detector
  - `src/refactor/context.ts` — affected by rec-20260610-002 Split clone windows at function boundaries in the duplication detector

## What landed this session
- **Phase 16 — edited-site collapse scorer** (`c3f859c`, `4352851`, `f10b902`): reworked `collapsesDuplication` to measure residual clone among the model's *edit replacements* (not whole spliced files), collapsed iff `< tokens × COLLAPSE_RATIO` (0.5, exported). Removed the whole-file confound (`utils-L303` recovered). Dropped class-structural `count-L24`/`query-builder-L90`; backfilled `dialect-L948`/`session-L69`. Live floor stayed 0.5 (multi-unit windows offset the recovery — recorded honestly).
- **Phase 17 — retire multi-unit windows** (`54e8ab4`, `4d52ff9`): dropped `select-L685`/`delete-L205`/`driver-L61` (the model extracts correctly but the detector's oversized window keeps scaffolding cloned). Backfilled 3 single-unit clones **live-validated** to collapse: `session-L314` (3/3), `session-L267` (3/3), `session-L112` (2/3). `session-L254` was picked then dropped after failing live 2/2 → swapped. **Floor raised 0.5 → 0.7.**
- Proved a **static single-unit predicate is non-viable** (good cases look more multi-unit than bad); curation is empirical via live runs. Documented in `SOURCES.md` ("Why selection is empirical").
- Filed `rec-20260610-001` (retire multi-unit — done via phase 17) and `rec-20260610-002` (detector window-splitting — open). Updated the `dup-eval-collapse-multiunit` memory.

## Carry-forward gotchas
- **`.cadence/` is left uncommitted by design.** Feature commits exclude `.cadence/`; the phase dirs `15/16/17` are UNTRACKED and `STATE.md`/`state.json` are modified. This matches the repo's existing pattern — do NOT commit `.cadence/` unless the user explicitly asks.
- **5 commits unpushed** (phase 16 + 17, on `main`). No push happened this session.
- **Live dup eval is billable.** Gate is now **0.7** (title still `-t "12-case corpus"`). Key in `.env`, NOT auto-loaded: `set -a; . ./.env; set +a` then `npx vitest run test/refactor-eval.live.test.ts -t "12-case corpus"`.
- **Ephemeral scan artifacts**: the pinned checkouts (`/tmp/necro-corpus/{trpc,drizzle}`, at SHAs `c7360d4`/`48e5406`) and scans/candidates (`/tmp/necro-scan/*.json`) live in `/tmp` and may be gone next session — re-scan with `node dist/cli.js scan --json <checkout>` if doing corpus work.
- **`utils-L303` is flaky** (model non-determinism, passed 2/3 in phase 16, 0/3 in phase 17) — it is single-unit and genuine, NOT a multi-unit artifact. Don't "fix" it by dropping it.
- **CADENCE quirks**: `cadence settle` over MCP takes `{auto:true}` (boolean); the settle stale-draft gate trips if you edit a DRAFT after approve — pass `allowStaleDraft:true` (used in phase 16). The AC↔test gate needs each AC-N in a test title.
- **Scorer is eval-only**: `evaluateDuplicateProposal`/`COLLAPSE_RATIO` have no production importer; `DUP_SYSTEM_PROMPT` + the production `runExtractDuplicate` path are untouched. Keep it that way unless intentionally doing `rec-20260610-002`.

## Next action
**Action:** There is no in-flight task — both phases are settled and the loop is IDLE. The genuine next step is a decision: (1) push the 5 unpushed commits — `git push` (confirm with the user; nothing has been pushed this session); and/or (2) if continuing the thread, start a new phase from `rec-20260610-002` — `cadence draft new 18-dup-detector-unit-windows 18 --tier=complex --fromRec=rec-20260610-002` (clamp `findClones` matches to `FunctionUnit` ranges so the detector — and the shipped `refactor` feature — stop emitting cross-function clone windows). This is production-scope (changes `src/syntactic/duplication.ts` + the refactor input), so verify against the dup detector tests + the real-repo dup eval (gate 0.7).
**Verify:** `cadence status` shows IDLE; `git log origin/main..HEAD --oneline` lists the 5 unpushed commits; `npx vitest run` green (276 passed, 6 live-skipped). If starting phase 18, write the DRAFT, `cadence draft approve`, then build — and remember the detector change is NOT eval-only, so re-run the synthetic + real-repo dup gates.
**If it fails:** if `git push` is rejected (diverged), `git fetch && git log origin/main..HEAD` to inspect before any rebase — do NOT force-push `main`. If phase 18's detector change moves the dup pass-rate, treat the 0.7 gate as the regression check, not a target, and re-calibrate honestly across ≥3 live runs (billable).
