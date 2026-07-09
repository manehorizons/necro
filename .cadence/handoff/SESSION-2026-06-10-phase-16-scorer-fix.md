---
cadence_handoff: 1
generated_at: 2026-06-10T19:35:38.892Z
label: phase-16-scorer-fix
loop_position: BUILD
active_phase: 16-dup-corpus-single-unit
active_draft: 16-16
tier: standard
git_branch: main
git_dirty: true
git_head: c66e3d0
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-10 (phase-16-scorer-fix)

## TL;DR for the next session
- **Phase 15a is DONE + settled + pushed** (AC-1..4 pass, floor 0.5). **Phase 16 is in BUILD**, mid-T1, no commits yet — it pivoted twice this session and is now a **scorer fix**, not the corpus-refinement its folder name (`16-dup-corpus-single-unit`) implies. The DRAFT was rewritten to "Partial-collapse credit for the extract-duplicate eval scorer" (read `16-16-DRAFT.md`).
- **The single next job: implement the edited-site collapse scorer fix (T2) in `src/refactor/eval.ts`.** Change `collapsesDuplication` to measure duplication **among the model's edit replacements** (the edited sites), not the whole spliced files: `largest clone among edits < c.tokens × COLLAPSE_RATIO` with **COLLAPSE_RATIO ≈ 0.5**.
- **Why (evidence, from this session's measurements):** the old check measured *global* file duplication, confounded by near-identical dialect files (residual was LARGER than the target: ratios 1.08/1.55/4.00). Measuring the edited sites instead gives clone-still-shared = 0 (utils-L303, fully deduped → should PASS) vs 115/116 ≈ 87% (count-L24, query-builder-L90 → genuinely NOT deduped, class-structural dup functions can't remove).
- **Hybrid scope agreed in principle:** (a) scorer fix [core], AND (b) **drop `count-L24` + `query-builder-L90`** from the corpus (non-function-dedupable artifacts) + backfill to ≥12/≥2 repos. `utils-L303` STAYS (the scorer fix makes it correctly pass). **A pending question was on the table when we paused: confirm dropping those 2 cases** — resolve it first.
- **T1 is essentially captured:** the 3 model proposals are saved as deterministic fixtures in `test/fixtures/refactor-dup-realrepo/proposals/` (utils-L303 / count-L24 / query-builder-L90) — these calibrate COLLAPSE_RATIO and become the T3 regression tests. **Untracked/uncommitted.**
- **Two billable steps remain:** none needed for T2/T3 (deterministic, use the saved fixtures); T4 re-calibration is ~3 live runs (confirm spend). `evaluateDuplicateProposal` is verified **eval-only** (no production importer) — the fix is low-risk.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `c66e3d0`
- Recent commits:
```
c66e3d0 test(15-extract-duplicate-realrepo-eval): calibrated live real-repo dup gate, floor 0.5 (AC-3)
5402e12 test(15-extract-duplicate-realrepo-eval): live real-repo dup gate scaffold, calibration pending (AC-3)
3bf9af8 test(15-extract-duplicate-realrepo-eval): deterministic dup corpus-integrity guard (AC-2)
210685e feat(15-extract-duplicate-realrepo-eval): real-repo duplicate corpus — 12 cases / 2 repos (AC-1)
42ef8b6 feat(15-extract-duplicate-realrepo-eval): duplicate capture path + provenance on the case schema (AC-1)
e23c3f9 chore(14-refactor-realrepo-eval): settle phase
53182d9 test(14-refactor-realrepo-eval): assert real-repo eval uses the unchanged production prompt (AC-4)
ec555c7 test(14-refactor-realrepo-eval): calibrated live real-repo gate, floor 0.5 (AC-3)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 12 ++++++------
 .cadence/state.json | 19 ++++++++++++-------
 2 files changed, 18 insertions(+), 13 deletions(-)
```
- Loop: BUILD · phase 16-dup-corpus-single-unit · tier standard

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
- **Phase 15a closed:** built T1–T5, calibrated the live dup gate (0.67/0.75/0.67, floor 0.5), settled all 4 ACs, pushed `main` (now at `c66e3d0`, in sync with origin).
- **Phase 16 drafted, approved, rewritten:** started as "refine corpus to single-unit clones"; a diagnostic (capturing the live model's actual proposals) proved the model's extractions are *correct* and fail only `collapsesDuplication`; a static single-unit predicate was prototyped and **rejected** (no static signal separates collapsible from non-collapsible). Re-aimed to a **scorer fix**; DRAFT rewritten + re-passed `cadence draft check`.
- **Measurements that set the approach:** captured 3 proposals; old global-residual ratios 1.08/1.55/4.00 (residual > target → ratio fix impossible); edited-site clone 0 / 115 / 116 → the correct metric. COLLAPSE_RATIO ≈ 0.5 calibrated from these.
- **Memory written:** `dup-eval-collapse-multiunit.md` (+ MEMORY.md index line).

## Carry-forward gotchas
- **Folder name is a misnomer:** `16-dup-corpus-single-unit` but the work is the scorer fix. Don't rename the dir mid-phase; trust `16-16-DRAFT.md`'s title/content.
- **The metric scope is the whole point:** measure clone among the **edit replacements**, NOT the spliced files. Global file duplication is confounded by unrelated near-identical dialect code. Build the edits into pseudo-FileTokens and `findClones(editTokens, c.minTokens)`; collapsed iff largest `< c.tokens × COLLAPSE_RATIO`.
- **`extractsSharedFunction` already catches wrong-edit-count** (edits.length !== locations.length), so the edited-site metric doesn't need to; degenerate "one edit" still fails via that.
- **`evaluateDuplicateProposal`/`collapsesDuplication` are EVAL-ONLY** — verified no production importer (`runExtractDuplicate` has its own verifyRunner). Boundary: do NOT touch the production refactor path or `DUP_SYSTEM_PROMPT`.
- **Proposal fixtures are untracked** (`test/fixtures/refactor-dup-realrepo/proposals/*.json`) — left on disk, uncommitted, for T3. Don't regenerate (costs live $); reuse them.
- **`cadence settle` over MCP takes `{auto:true}` (boolean)**, not the string. Settle AC↔test gate: each AC-N must appear in a test title.
- **Live runs billable** — key in `.env` (not auto-loaded): `set -a; . ./.env; set +a`. T4 = `npx vitest run test/refactor-eval.live.test.ts -t "12-case corpus"` ×3 (update the `-t` title if the case count changes after dropping 2).
- Phase-16 DRAFT's AC-1 still says "largest residual clone among the affected files" — that wording predates the edited-site insight; **implement edited-site measurement** and tighten the AC text to match when you settle.

## Next action
**Action:** Resolve the open question — confirm dropping `count-L24` + `query-builder-L90` from the corpus (non-function-dedupable). Then implement T2: in `src/refactor/eval.ts`, rework `collapsesDuplication` to measure clone among the model's edit replacements (`findClones` over per-edit pseudo-files) with `COLLAPSE_RATIO ≈ 0.5`; add an exported, documented `COLLAPSE_RATIO`. Then T3: deterministic tests scoring the 3 saved proposal fixtures (utils-L303 passes; the 2 to-drop ones fail) + a lazy-extraction-fails case + keep degenerate tests green; update the corpus guard. Then T2-corpus: drop the 2 cases, backfill to ≥12/≥2 repos, re-run the generic-oracle sweep. Then T4 (billable ≥3 live runs, confirm spend) to re-calibrate the floor; T5 regression sweep.
**Verify:** `npx vitest run test/refactor-eval.test.ts test/refactor-dup-realrepo-corpus.test.ts` green with no key/network; the 3 fixtures score as expected; `git diff` confined to `src/refactor/eval.ts` + tests + fixtures (prompt + production refactor path untouched).
**If it fails:** if COLLAPSE_RATIO 0.5 mis-classifies a case, re-measure edited-site clone for the new corpus and pick the ratio that passes fully-deduped extractions (≈0) and fails ~87%-residual ones — document the basis, don't hand-fit. If dropping 2 cases drops below 12, backfill from drizzle/trpc or add a third pinned repo (per 15a SOURCES.md method).
