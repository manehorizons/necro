---
cadence_handoff: 1
generated_at: 2026-06-10T15:59:58.016Z
label: phase-15a-live-calibration-pending
loop_position: BUILD
active_phase: 15-extract-duplicate-realrepo-eval
active_draft: 15-15
tier: standard
git_branch: main
git_dirty: true
git_head: 5402e12
git_ahead: 4
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-10 (phase-15a-live-calibration-pending)

## TL;DR for the next session
- **Phase 15a (extract-duplicate real-repo eval) is ~80% done, in BUILD.** T1, T2, T3 are committed and verified; T4 is BLOCKED on the user's spend approval for live runs; T5's non-live half is verified (DONE_WITH_CONCERNS).
- **The single next job: run the billable live calibration (T4), then finish T5's live check, then settle.** The user chose "skip live runs for now" on 2026-06-10 — re-confirm spend before running.
- **T4 = calibrate `DUP_REALREPO_PASS_RATE_GATE`.** The AC-3 live block is already written + committed (auto-skips without a key). Run the 12-case real-repo dup eval ≥3× against claude-opus-4-8, set the floor below the observed minimum, fill the calibration table in `test/refactor-eval.live.test.ts` AND `test/fixtures/refactor-dup-realrepo/SOURCES.md` (both have `__`/`_pending_` placeholders).
- **T5's remaining check:** confirm the synthetic refactor + synthetic extract-duplicate live evals still clear ≥0.8 (same live run) — AC-4's only unverified part. The non-live half (prompt byte-for-byte unchanged, suite green, SDK isolation) already passed.
- **Then `cadence settle run --auto`** (MCP: `{auto:true}` boolean, NOT the string). AC-1/AC-2 verified offline; AC-3 needs the live floor to land; AC-4 needs the synthetic-live confirmation.
- **No WIP code uncommitted** — only derived `.cadence/STATE.md`/`state.json`. Corpus, capture path, guard, and live scaffold are all committed (HEAD `5402e12`).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 4 ahead / 0 behind origin
- HEAD `5402e12`
- Recent commits:
```
5402e12 test(15-extract-duplicate-realrepo-eval): live real-repo dup gate scaffold, calibration pending (AC-3)
3bf9af8 test(15-extract-duplicate-realrepo-eval): deterministic dup corpus-integrity guard (AC-2)
210685e feat(15-extract-duplicate-realrepo-eval): real-repo duplicate corpus — 12 cases / 2 repos (AC-1)
42ef8b6 feat(15-extract-duplicate-realrepo-eval): duplicate capture path + provenance on the case schema (AC-1)
e23c3f9 chore(14-refactor-realrepo-eval): settle phase
53182d9 test(14-refactor-realrepo-eval): assert real-repo eval uses the unchanged production prompt (AC-4)
ec555c7 test(14-refactor-realrepo-eval): calibrated live real-repo gate, floor 0.5 (AC-3)
28d893b test(14-refactor-realrepo-eval): deterministic corpus-integrity guard (AC-2)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 16 ++++++++++------
 .cadence/state.json | 25 +++++++++++++++++--------
 2 files changed, 27 insertions(+), 14 deletions(-)
```
- Loop: BUILD · phase 15-extract-duplicate-realrepo-eval · tier standard

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - (none)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - (none)

## What landed this session
- **T1 (AC-1, `42ef8b6`):** `captureDuplicateSkeletons` + `DuplicateCaptureOptions` in `src/refactor/eval-capture.ts`; optional `provenance` on `DuplicateEvalCase`. 9 capture unit tests (same-file, cross-file, absolute paths, empty). Synthetic cases still load (backward-compatible).
- **T2 (AC-1, `210685e`):** `test/fixtures/refactor-dup-realrepo/cases.json` — 12 oracle-validated cases (4 trpc @ `c7360d4`, 8 drizzle-orm @ `48e5406`). `SOURCES.md` records repos/SHAs/scan commands/selection criteria. hono + kysely evaluated and rejected (type-level/JSDoc dup only).
- **T3 (AC-2, `3bf9af8`):** `test/refactor-dup-realrepo-corpus.test.ts` — deterministic, network-free guard (7 tests): ≥12/≥2-repo, full integrity, generic-oracle sweep `passRate=1`, degenerate failures, unchanged `DUP_SYSTEM_PROMPT` (AC-4).
- **T4 scaffold (AC-3, `5402e12`):** live `runDuplicateEval` block in `test/refactor-eval.live.test.ts`, `test.runIf(ANTHROPIC_API_KEY)`, provisional gate `0.5`. Verified to skip with no key (no CI network).
- **T5 non-live (AC-4):** prompt.ts 0-diff vs `e23c3f9`; no SDK import in capture path; full suite 271 passed / 6 skipped.

## Carry-forward gotchas
- **Live evals are billable + non-deterministic; the user explicitly paused them this session.** Re-confirm spend before running. Key is in `.env` (gitignored; runner does NOT auto-load): `set -a; . ./.env; set +a`.
- **Run ONLY the dup real-repo block** to minimize spend: `set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts -t "12-case corpus"`. (`-t "extract-duplicate"` also pulls the synthetic dup block; `-t "real-repo"` also pulls the phase-14 refactor block.)
- **`cadence settle` over MCP takes `{auto:true}` (boolean), NOT the string `"--auto"`** — the string is silently ignored and settles WITHOUT deriving AC verdicts (phase-14 lesson).
- **Settle AC↔test gate:** every `AC-N` must appear in a test title. AC-1/AC-2/AC-4 already tagged; AC-3 is tagged in the live block title ("...real-repo floor on the 12-case corpus (AC-3)").
- **Calibration placeholders to fill after the runs:** the `CALIBRATION (phase 15a ...)` comment block + `DUP_REALREPO_PASS_RATE_GATE` constant in `test/refactor-eval.live.test.ts`, and the `### Phase 15a calibration` table in `SOURCES.md` (currently `_pending_`).
- **External checkouts on disk:** trpc `/tmp/necro-corpus/trpc` (@ `c7360d4`), drizzle `/tmp/necro-corpus/drizzle` (@ `48e5406`), plus their `*-scan.json`. Not needed for the live run (the corpus is self-contained in cases.json) — only if re-capturing.
- **Invariants:** prompt `DUP_SYSTEM_PROMPT`/`buildDuplicatePrompt` byte-for-byte unchanged (15a measures; 15b would tune); lazy `import()` SDK isolation; synthetic dup live ≥0.8 must not regress.

## Next action
**Action:** Re-confirm billable-spend with the user, then run the live duplicate eval ≥3×: `set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts -t "12-case corpus"`. Record each run's passRate + failures, set `DUP_REALREPO_PASS_RATE_GATE` below the observed minimum (with non-determinism margin), and fill the calibration comment in the test + the table in `SOURCES.md`. Then run the synthetic live evals once to confirm both still clear ≥0.8 (T5/AC-4). Commit (AC-3 calibration), record T4 DONE + T5 DONE, then `cadence settle run` (MCP `{auto:true}`).
**Verify:** the live dup gate passes at the calibrated floor across the runs; synthetic gates still ≥0.8; `cadence settle` derives AC-1..AC-4 verdicts (non-empty acResults) and returns to IDLE.
**If it fails:** if the live dup pass-rate is very low (e.g. <0.3), that's an honest real-difficulty baseline — set the floor below it and record it (do not cherry-pick); a follow-up phase 15b would tune `DUP_SYSTEM_PROMPT`. If a case looks impossible to extract (not just hard), re-inspect it against the SOURCES.md selection criteria before lowering the floor.
