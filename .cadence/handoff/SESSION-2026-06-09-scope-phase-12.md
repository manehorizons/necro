---
cadence_handoff: 1
generated_at: 2026-06-09T05:02:31.849Z
label: scope-phase-12
loop_position: IDLE
active_phase: 11-real-repo-triage-eval
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 25b306d
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-09 (scope-phase-12)

## TL;DR for the next session
- **Short session: resume + scope only — no code landed, no draft scaffolded.** Resumed from `SESSION-2026-06-09.md` (no drift, env-check clean), then scoped the next milestone. Loop still **IDLE**, `origin/main` @ `25b306d`, 0/0.
- **Decided next milestone: triage tuning (phase 12).** Goal: raise `necro triage` precision on the real hono corpus from the **0.50–0.75** baseline toward **≥0.85**, by revising the triage `SYSTEM_PROMPT` so it stops over-trusting "0 static references" + dynamic-taint evidence. (Alternative deferred: refactor real-repo eval.)
- **A complete proposed DRAFT (Objective / 5 ACs / Tasks / Boundaries) is in `## Next action` below** — ready to scaffold verbatim. It was presented to the user but **not yet approved**; the user invoked `/handoff` at that decision point.
- **Single next action:** scaffold `cadence draft new 12-triage-prompt-tuning 12`, fill it from the proposal below, get user sign-off, approve into BUILD.
- **No blockers, no WIP code.** Dirty tree = CADENCE bookkeeping only (`STATE.md`/`state.json` + untracked `handoff/`, `intelligence/`). Nothing to stash. `247 tests pass / 4 skipped`; typecheck clean (unchanged from prior session).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `25b306d`
- Recent commits:
```
25b306d chore(11-real-repo-triage-eval): settle phase
0ee3235 test(11-real-repo-triage-eval): prompt-parity check — authentic evidence reaches the model (AC-3)
ae3ac6e feat(11-real-repo-triage-eval): live accuracy gate on real corpus (T5)
7d73cb4 test(11-real-repo-triage-eval): CI corpus-integrity + scoring guard (T6)
e7791c8 feat(11-real-repo-triage-eval): add Runtime case; document 19-case deviation
edf25d0 feat(11-real-repo-triage-eval): real-repo labeled corpus from hono (T3)
a02fd86 feat(11-real-repo-triage-eval): diagnostic reporting + breakdown (T4)
8092fdc feat(11-real-repo-triage-eval): EvalCase gains provenance + rationale (T2)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 2 +-
 .cadence/state.json | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- Loop: IDLE · phase 11-real-repo-triage-eval · tier (none)

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
- Nothing committed. This was a resume → milestone-scoping session, paused before drafting.
- Read & analyzed the tuning levers: `src/triage/prompt.ts` (`SYSTEM_PROMPT` @ line 34), `src/triage/eval.ts` (`runEval`/`formatBreakdown`/`meetsThreshold`), `test/triage-eval.live.test.ts` (gates: synthetic 0.8; real-repo floor precision≥0.4 / recall≥0.3; aspirational precision≥0.85), and the 19-case corpus (`test/fixtures/triage-realrepo/cases.json` — 5 dead / 14 alive).

## Carry-forward gotchas
- **The lever is prompt text only.** `SYSTEM_PROMPT` (`src/triage/prompt.ts:34`) currently lists "zero static references" merely as a *reason* a symbol lands in `maybe`; it gives the model no instruction that this signal is **non-discriminating** on real repos. The fix: tell the model to discount absence-of-static-references + an unresolvable dynamic-import taint (that taint is *why* necro was uncertain, not evidence of death). Don't touch scan/classify/fix.
- **Precision math is tight.** Positive class = "dead". Corpus = 5 dead / 14 alive. Every alive symbol wrongly called dead is a false positive, so precision ≥0.85 needs **≤1 false positive across all 14 alive cases**. Fix the two persistent FPs first: `RequiredRequestInit`, `detectResponseType` (alive code the model calls dead).
- **Model is non-deterministic** (`thinking: adaptive`) — run the live eval **2–3×**; precision ranged 0.50–0.75 across runs. Don't gate CI on a single live run.
- **Settle AC↔test gate:** every `AC-N` must appear in a test title up front (memory: `cadence-settle-ac-test-gate`). Note ACs that can only be measured live (AC-2/3/4 in the proposal) still need their tag in a (live, auto-skipping) test title — settle checks the title, not a live pass.
- **Invariants that must survive tuning:** synthetic live eval stays ≥0.8 (no regression); lazy-`import()` SDK isolation (memory: keep new LLM code off static import paths); LLM-edit features return CODE not diffs (memory: `refactor-proposal-is-code-not-diff`). The real-repo gate must stay an **auto-skipping live test** — never a network call in CI.
- **Live evals need a sourced key** (runner does NOT auto-load): `set -a; . ./.env; set +a; npx vitest run test/triage-eval.live.test.ts -t "real-repo"`.
- **Read the `claude-api` skill before editing model/prompt code.** For a `website/` command on a Node-version error: `nvm use 22`.
- Dirty tree is CADENCE bookkeeping only — no WIP, no stash to restore.

## Next action
**Action:** Scaffold and fill the phase 12 draft below, get user sign-off, approve into BUILD.

```
cadence draft new 12-triage-prompt-tuning 12 --title="Triage prompt tuning — raise real-repo precision toward ≥0.85"
```

Proposed DRAFT content (presented to the user last session; **not yet approved** — re-confirm before approving):

- **Objective:** Revise the triage `SYSTEM_PROMPT` so the model stops treating "0 static references" + an unresolvable dynamic-import taint as evidence of death (it's the reason for the `maybe` quarantine, not a death signal). Raise real-repo precision from the 0.50–0.75 baseline toward ≥0.85, fixing the two persistent false positives (`RequiredRequestInit`, `detectResponseType`) first — without regressing the synthetic eval or changing scan/fix.
- **AC-1** — The triage prompt explicitly instructs the model to discount absence-of-static-references / dynamic-taint evidence for a `maybe` finding (prompt-content unit test).
- **AC-2** — On the live real-repo corpus, `RequiredRequestInit` and `detectResponseType` are no longer classified `likely-dead` (live test, auto-skips without key).
- **AC-3** — Live real-repo precision clears a raised gate (≥0.70 floor, aspirational ≥0.85); lift the floor in `test/triage-eval.live.test.ts` from 0.4 to the tuned baseline.
- **AC-4** — The synthetic live eval still clears 0.8 (no regression).
- **AC-5** — Scan/fix behavior, the lazy-SDK isolation invariant, and code-not-diff are unchanged (existing CI tests stay green).
- **Tasks (sketch):** T1 prompt-content unit test (AC-1, red) → T2 revise SYSTEM_PROMPT → T3 live-measure the two FPs + precision, iterate prompt → T4 raise the live regression floor + retag gates → T5 confirm synthetic + full CI + typecheck green.
- **Boundaries:** prompt text only — no changes to scan, classify, fix, corpus labels, or the SDK call path; no new dependencies; the real-repo gate stays an auto-skipping live test.

> Open decision the user may revisit before approving: the **AC-3 floor of 0.70** (vs keeping ≥0.85 strictly aspirational), and whether 19 cases / 5-dead is enough to gate precision meaningfully.

**Verify:** `cadence status` shows IDLE before drafting; after `draft new`, `cadence draft check <path-to-DRAFT.md>` passes. Post-tuning, run the live real-repo eval 2–3× (`set -a; . ./.env; set +a; npx vitest run test/triage-eval.live.test.ts -t "real-repo"`) — precision above the 0.50–0.75 baseline; `npx vitest run` green + `npm run typecheck` clean before any commit.

**If it fails:** triage tuning must NOT regress the synthetic eval, change scan/fix, or break the code-not-diff / lazy-SDK invariants. Tag each `AC-N` into a test title up front (settle gate). Read the `claude-api` skill before touching model/prompt code.
