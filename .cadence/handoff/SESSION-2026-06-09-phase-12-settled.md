---
cadence_handoff: 1
generated_at: 2026-06-09T22:58:17.248Z
label: phase-12-settled
loop_position: IDLE
active_phase: 12-triage-prompt-tuning
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: fcd68e8
git_ahead: 3
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-09 (phase-12-settled)

## TL;DR for the next session
- **Phase 12 (triage prompt tuning) is BUILT and SETTLED — all 5 ACs pass.** Loop is **IDLE**. Real-repo triage precision went from the 0.50–0.75 baseline to **1.00** (3 live runs), zero false positives, no synthetic regression. Single prompt-text lever, exactly as scoped.
- **The win came on the *second* prompt attempt.** The first ("discount the combination; call dead only on a positive no-reach signal") overcorrected — pushed everything to `unsure`, recall collapsed, precision mean ~0.33. The fix was **location-weighting** (production-source → lean alive; test-file → dead is fine). Don't reintroduce the blanket-discount framing.
- **Single next action: decide phase 13 (scope/decide work).** Two candidates already surfaced — (a) **refactor real-repo eval** (long-pending, see [[refactor-proposal-is-code-not-diff]]), (b) **expand the triage corpus** (the live gate is coarse: 19 cases / 5 dead, one symbol swings precision ~0.33). No phase is drafted yet.
- **Housekeeping before/with scoping:** 3 phase-12 commits are **unpushed** on `main`; the phase-12 settle bookkeeping (STATE/state.json + untracked `.cadence/phases/12-.../`) is **uncommitted** — the prior phase's pattern was a `chore(12-...): settle phase` commit. The user has not yet asked to push or commit these.
- **No blockers, no WIP code.** Dirty tree is CADENCE bookkeeping only — nothing to stash.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 3 ahead / 0 behind origin
- HEAD `fcd68e8`
- Recent commits:
```
fcd68e8 test(12-triage-prompt-tuning): raise real-repo precision floor to 0.70, retag gates (AC-2, AC-3)
3a83a5e feat(12-triage-prompt-tuning): location-weight the maybe verdict (AC-2, AC-3)
262bc48 feat(12-triage-prompt-tuning): discount static-absence + dynamic-taint as a death signal (AC-1)
25b306d chore(11-real-repo-triage-eval): settle phase
0ee3235 test(11-real-repo-triage-eval): prompt-parity check — authentic evidence reaches the model (AC-3)
ae3ac6e feat(11-real-repo-triage-eval): live accuracy gate on real corpus (T5)
7d73cb4 test(11-real-repo-triage-eval): CI corpus-integrity + scoring guard (T6)
e7791c8 feat(11-real-repo-triage-eval): add Runtime case; document 19-case deviation
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 12-triage-prompt-tuning · tier (none)

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
- Resumed from `SESSION-2026-06-09-scope-phase-12.md` (no drift, clean env-check); scaffolded + approved phase 12 into BUILD with the proposed 0.70 AC-3 floor.
- `262bc48` — AC-1 prompt-content guard (red→green) + first discount instruction in `SYSTEM_PROMPT`.
- First live eval (3 runs) exposed the overcorrection: precision 0.00/0.33/0.67, recall collapsed; surfaced to user instead of silently iterating.
- `3a83a5e` — location-weighted `SYSTEM_PROMPT` rewrite (AC-2, AC-3). Re-measured: precision 1.00/1.00/1.00, recall 0.40/0.60/0.40, zero FPs.
- `fcd68e8` — raised `PRECISION_GATE` 0.4→0.70, retitled real-repo gate to (AC-2, AC-3) with per-symbol FP assertions; synthetic gate keeps (AC-4).
- Live synthetic eval confirmed no regression (1.00/1.00, AC-4); full CI 249 passed / 4 skipped; typecheck clean (AC-5).
- Settled phase 12 — all 5 ACs pass. Updated memory [[triage-realrepo-accuracy-baseline]] (now records the tuned 1.00 result + coarse-gate caveat).

## Carry-forward gotchas
- **The lever that worked is LOCATION, not blanket discounting.** `SYSTEM_PROMPT` (`src/triage/prompt.ts`) now tells the model: production-source symbol with only "zero references" evidence → likely consumed structurally out of the snippet's view → lean alive/unsure; test-file symbol with no refs → plausible dead test-local helper. The discriminating signal the model can see is the file path (all 5 corpus dead cases are `*.test.ts`; both alive FPs are `src/*.ts`). The earlier "discount that combination, call dead only on a positive signal" framing tanked recall — do not revert to it.
- **The live gate is coarse.** 19 cases / 5 dead → one symbol's coin-flip swings precision ~0.33 (seen in the failed first iteration). The 0.70 floor in `test/triage-eval.live.test.ts` is a collapse-detector, not a fine measure. **Expand the corpus before tightening the floor toward 0.85.**
- **Model is non-deterministic** (`thinking: adaptive`) — always run the live eval 2–3×, never gate a decision on a single run.
- **Live evals are billable + need a sourced key** (runner does NOT auto-load): `set -a; . ./.env; set +a; npx vitest run test/triage-eval.live.test.ts -t "real-repo"` (or `-t "synthetic"`). They auto-skip in CI — keep them a deliberate, never a network call in CI.
- **Settle AC↔test gate:** every `AC-N` must appear in a test title ([[cadence-settle-ac-test-gate]]). Phase-12 AC-5 rests on the *pre-existing* `SDK isolation (AC-5)` test in `test/triage-client.test.ts` (same invariant, same number) — fine here, but be deliberate if a future phase also needs AC-5.
- **Invariants still in force:** lazy-`import()` SDK isolation; LLM-edit features return CODE not diffs ([[refactor-proposal-is-code-not-diff]]); synthetic eval ≥0.8.
- **Read the `claude-api` skill before editing model/prompt code.** Dirty tree is CADENCE bookkeeping only — no WIP, no stash.

## Next action
**Action:** Decide and scope phase 13. Run `cadence progress` / `cadence recommend`, then pick between (a) refactor real-repo eval and (b) expand the triage corpus (raising the precision gate toward ≥0.85 only once the corpus is larger). Confirm the choice with the user before drafting. Optionally first commit the phase-12 settle bookkeeping (`chore(12-triage-prompt-tuning): settle phase`) and push the 3 unpushed commits — ask the user.
**Verify:** `cadence status` shows IDLE before drafting; after `cadence draft new 13-… 13`, `cadence draft check <path>` passes.
**If it fails:** if scope is unclear, present the two candidates with trade-offs and let the user choose — do not draft unilaterally. Any corpus-expansion work must keep the live gate auto-skipping and not regress the synthetic eval.
