---
cadence_handoff: 1
generated_at: 2026-06-08T23:46:53.600Z
label: phase-09-llm-refactor-shipped
loop_position: IDLE
active_phase: 09-llm-refactor
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 7cc2a19
git_ahead: 11
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-08 (phase-09-llm-refactor-shipped)

## TL;DR for the next session
- Phase **09-llm-refactor shipped, settled & live-validated** (all 7 ACs PASS; live refactor eval **10/10**). necro now has its second AI tier: opt-in `necro refactor` — LLM god-function split, **suggest-only**, scratch-worktree verified. This completes the design spec §8 MVP build order **through step 13** (the last step) — the MVP is feature-complete.
- Loop is **IDLE**. `196 tests pass / 2 skipped` (both opt-in live evals); typecheck clean; build 74.5kb (SDK dynamic-import only).
- **`main` is 11 ahead / 0 behind origin — the whole phase is unpushed.** Single next action: **push**, then scope the next milestone (MVP build order is done, so this is new-milestone territory — see Next action).
- **Load-bearing gotcha (also saved to memory):** any LLM-edit feature must return **code, not a diff** — LLM diffs fail `git apply`. necro owns diff computation + application. This was *the* defect fixed this session.
- No blockers. The phase-09 redesign + fixture expansion landed **after** `cadence settle` as fix-forward commits — SUMMARY shows the pre-redesign task records but all ACs still PASS; re-run `cadence settle run --auto` if you want it refreshed.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 11 ahead / 0 behind origin
- HEAD `7cc2a19`
- Recent commits:
```
7cc2a19 chore(09-llm-refactor): settle phase
7e865af test(09-llm-refactor): expand refactor eval to 10 fixtures + size nudge
d299650 fix(09-llm-refactor): proposal returns code, necro computes the diff
de10607 feat(09-llm-refactor): reference fixtures + structural eval gate (T7)
acec6c2 feat(09-llm-refactor): necro refactor command + suggest-only reporting (T6)
7a3baaa feat(09-llm-refactor): orchestration — god-function-only, suggest-only (T5)
6f659e3 feat(09-llm-refactor): scratch-worktree verifier (T4)
0810904 feat(09-llm-refactor): refactor client + offline guard (T4->T3)
c56a9bf feat(09-llm-refactor): split prompt contract + proposal schema (T2)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 09-llm-refactor · tier (none)

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
- Validated **phase 08 triage** against the live model — precision/recall **1.00** over the 6 fixtures (gate 0.80).
- Built **phase 09 `necro refactor`** through the full CADENCE loop (SPEC → DRAFT → BUILD → settle), TDD, 7 tasks T1–T7, all ACs PASS: context builder, prompt+schema, lazy-SDK client, scratch-worktree verifier, orchestration, CLI+reporting, eval gate.
- **Found + fixed a root-cause defect during live validation:** LLM unified diffs fail strict `git apply`, so the verifier would have skipped *every* real proposal (live eval scored 0.00). Switched the proposal contract to return **rewritten code (`replacement`)**; necro splices it, computes the diff for display, and verifies by writing full file content into a throwaway worktree. Live passRate **0.00 → 1.00**.
- Expanded the refactor eval to **10 god-function fixtures** + a prompt size-nudge so the 0.80 live gate is stable under model variance (was flaky at 0.75–1.00 on 4 cases).
- Added `.env.example` + `.gitignore` rules for local secrets (`.env`, `dumpfile`).
- Saved a project memory: **refactor-proposal-is-code-not-diff**.

## Carry-forward gotchas
- **LLM-edit features return CODE, not diffs.** LLM unified diffs fail `git apply` (miscounted `@@` headers → "corrupt patch"; even `--recount` hits context mismatches). The model returns `replacement` code; necro splices + computes/owns the diff. Apply this to any future refactor type or assisted fix. (See memory `refactor-proposal-is-code-not-diff`.)
- **`git_dirty: true` is only CADENCE bookkeeping** (`STATE.md`/`state.json` + untracked `handoff/`, `intelligence/`) plus the gitignored local `.env`. **No WIP code, no stash** — nothing to restore.
- **Redesign landed post-settle.** The phase SUMMARY reflects the pre-redesign T1–T7 records; the `fix:`/`test:` commits after it are the real implementation. ACs all still PASS. Re-run `cadence settle run --auto` only if you want the SUMMARY regenerated.
- **The verifier never touches your tree.** It writes full file content into a detached `git worktree` (node_modules symlinked so `tsc`/`vitest` resolve), runs checks, always cleans up. `necro refactor` is suggest-only — it prints a diff; the human applies it.
- **SDK isolation invariant holds:** `@anthropic-ai/sdk` is dynamic-`import()` only, reachable from `src/triage/` + `src/refactor/`; `cli`/`engine`/`fix` have no static import (asserted by tests). Keep any new LLM code on the same lazy path.
- **Live evals need a key and a sourced `.env`** — the test runner does NOT auto-load it: `set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts` (likewise `test/triage-eval.live.test.ts`). `.env` is gitignored; `.env.example` is the template.
- **Two Node versions:** CLI ≥ 20; `website/` docs need ≥ 22 (`nvm use 22`). **Headless CADENCE gates:** `draft approve … --no-approve`; `settle run --auto`; `spec approve` has no `--no-approve`. `cadence draft check <path-to-DRAFT.md>` takes a file path.
- **11 unpushed commits on `main`.**

## Next action
**Action:** **Push the phase** — `git push origin main` (11 commits ahead, the entire phase 09 + `.env.example` chore are unpushed). Then, since the design spec §8 MVP build order is now complete through step 13, **scope the next milestone** with `cadence` (new-milestone territory, not a phase within the current roadmap). Strongest candidates, in rough priority: (1) **more refactor types** beyond god-function split (extract-duplicate → shared function is the natural next, reusing the exact `replacement`→splice→verify machinery); (2) **expand triage + refactor evals toward real-repo output** (both live sets are synthetic smoke tests, not accuracy measurements); (3) **response caching by code-hash** (deferred in both phase 08 and 09 — design spec §7).

**Verify:** `git push` then `git rev-list --left-right --count origin/main...HEAD` shows `0  0`. `cadence status` shows IDLE. `npx vitest run` green + `npm run typecheck` clean before any new commit.

**If it fails:** if you start a new refactor type, keep the **code-not-diff** contract and the lazy-SDK + worktree-only-verify boundaries (tests AC-4/AC-5/AC-6 enforce them). Tag new tests `(AC-N)` up front (settle gate). For any `website/` command on a Node-version error, `nvm use 22`. Read the `claude-api` skill before touching model/API code.
