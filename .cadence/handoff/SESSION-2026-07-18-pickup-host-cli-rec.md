---
cadence_handoff: 1
generated_at: 2026-07-18T19:54:06.162Z
label: pickup-host-cli-rec
loop_position: IDLE
active_phase: 49-triage-corpus-variance
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 351a21a
git_ahead: 11
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (pickup-host-cli-rec)

## TL;DR for the next session
- Phase 49-01 (triage corpus growth + bench multi-run variance) is fully shipped and settled: AC-2 passes (bench snapshot now carries min/mean/max variance across N triage-eval runs), AC-1 and AC-3 are `blocked` — not failed silently, both have a clear documented reason and a path forward.
- AC-1 (trpc dead-case corpus grown 15→30, but still only 2 repos, not the required ≥3) is a closed investigation for now: 4 attempted 3rd repos (zod, fastify, h3 ×2) all dead-ended for mechanistically-traced reasons written up in `test/fixtures/triage-realrepo/SOURCES.md`'s "Attempted 3rd repos" section. Don't re-try those three without a genuinely different angle.
- AC-3 (re-deriving `PRECISION_GATE`/`RECALL_GATE` from live data) is blocked purely on `ANTHROPIC_API_KEY` not being available in-session — the code for T2/T3 (multi-run bench aggregation) is done and unit-tested, only the *live* run + gate re-derivation remains.
- That API-key gap led to filing **rec-20260718-003** — a host-cli LLM backend for necro's triage/refactor clients (shell out to the `claude` CLI headlessly instead of requiring a raw API key), mirroring a pattern this very repo's own `.cadence/config.json` already uses (`"provider": "host-cli"` for verifier/codeReview/etc., implemented in `cadence-core`'s phase `165-host-cli-headless-verifier`).
- **Next action:** pick up rec-20260718-003 as the next unit of work — promote it to `accepted`, convert/mine it into a milestone → phase, and start drafting. This is genuinely new necro capability (new `LlmOptions` provider + `TriageClient`/`RefactorClient` implementations), not something to freelance inline.
- No blockers preventing the pickup — this is an operator-scheduling choice, not a technical block.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 11 ahead / 0 behind origin
- HEAD `351a21a`
- Recent commits:
```
351a21a chore(cadence): settle 49-01 (AC-2 pass, AC-1/AC-3 blocked)
7a470ff feat(49): bench snapshot carries multi-run variance; runBench triages 3x by default (T2-T3)
61e6b24 feat(49): grow trpc dead-case corpus 15→30 via testOnlyEvidence signal (T1, blocked on repo diversity)
795563c chore(cadence): stamp session handoff — workspaces-fix-shipped
759c4ad fix(engine): monorepo workspace-member entry resolution falls back like single-package scans
88e1b99 chore(cadence): stamp session handoff — phase-48-shipped-fork-incident
e6c8ec1 fix(python): replace stray literal null byte with a space in resolveBareName's cache key
51f12ca feat(48): Python accuracy corpus + CI precision/recall gate (rec-20260701-014 Phase D)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 49-triage-corpus-variance · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260701-012 — Competitor head-to-head accuracy table (knip, ts-prune) (accepted/ready-for-milestone)
  - rec-20260701-015 — Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate (accepted/ready-for-milestone)
  - rec-20260701-013 — Library export surface (exports map + type declarations) (candidate/needs-decision)
  - rec-20260718-003 — Add a host-cli LLM backend for necro's triage/refactor clients (unblock live evals without a raw API key) (candidate/needs-decision)
  - rec-20260701-016 — Incremental symbol-graph cache for large repos (candidate/needs-evidence)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `src/bench/` — affected by rec-20260701-012 Competitor head-to-head accuracy table (knip, ts-prune)
  - `website/src/content/docs/guide/accuracy.mdx` — affected by rec-20260701-012 Competitor head-to-head accuracy table (knip, ts-prune)
  - `.github/workflows/` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `.github/dependabot.yml` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `package.json` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `tsconfig.json` — affected by rec-20260701-013 Library export surface (exports map + type declarations)
  - `src/triage/client.ts` — affected by rec-20260718-003 Add a host-cli LLM backend for necro's triage/refactor clients (unblock live evals without a raw API key)
  - `src/refactor/client.ts` — affected by rec-20260718-003 Add a host-cli LLM backend for necro's triage/refactor clients (unblock live evals without a raw API key)
  - `src/config.ts` — affected by rec-20260718-003 Add a host-cli LLM backend for necro's triage/refactor clients (unblock live evals without a raw API key)
  - `src/llm/client.ts` — affected by rec-20260718-003 Add a host-cli LLM backend for necro's triage/refactor clients (unblock live evals without a raw API key)
  - `src/graph/symbol-graph.ts` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos

## What landed this session
- Resumed from the prior phase-50 handoff (workspaces.ts monorepo entry-resolution fix, verified shipped) and started phase 49-01 (`.cadence/phases/49-triage-corpus-variance/49-01-DRAFT.md`).
- T1: grew `test/fixtures/triage-realrepo/cases.json` from 48→63 cases (dead: 15→30) by mining trpc/trpc's unexplored `maybe` findings via necro's `testOnlyEvidence` signal (`necro scan --json .`, filtered to `packages/`, since the phase-13-documented `--json packages` command now returns EMPTY — a separate bug, `rec-20260718-002`, already fixed for the dist→src case but not the subdir-target case). Each of the 15 new cases was independently hand-verified (repo-wide grep), not just trusted from necro's own evidence.
- T1 continued: tried 4 candidate 3rd repos to satisfy AC-1's ≥3-repos clause — all dead-ended, each traced to a specific mechanism (documented in `SOURCES.md`). Notably, the 2nd h3 attempt looked like a necro engine bug at first (430/474 findings all `testOnlyEvidence`, including h3's entire public API) but turned out to be expected library-scanned-against-itself ambiguity (`buildSymbolGraph` treats re-exports as non-terminal by design), not a defect — traced to `src/graph/symbol-graph.ts`.
- T2: added `TriageMetrics.variance` (min/mean/max) to `src/bench/snapshot.ts`, additive under `methodologyVersion: 2`; `summarizeTriage` now accepts a single run or an array of N runs.
- T3: `runBench` (`src/bench/run.ts`) now runs the triage live eval 3× by default (`triageRuns` option) and aggregates through the updated summarizer. No CLI flag changes needed — `npm run bench` picks up the new default automatically.
- Filed `rec-20260718-003` (host-cli LLM backend) after confirming necro's `TriageClient`/`RefactorClient` have no fallback to a locally-authenticated CLI — only a raw `ANTHROPIC_API_KEY` via the Anthropic SDK (`src/triage/client.ts`).
- Settled 49-01: AC-2 pass, AC-1/AC-3 blocked (not failed — both have a clear next step). Loop is IDLE.
- 3 commits: `61e6b24` (T1 corpus growth), `7a470ff` (T2/T3 bench variance), `351a21a` (settle).

## Carry-forward gotchas
- **`cadence milestone propose` only clusters `status=accepted` recommendations** — `rec-20260718-003` is currently `candidate`/`needs-decision`. Promote it first (`cadence_recommendation_promote` or equivalent) or the propose step will silently yield "None" (a known prior gotcha — see `[[cadence-milestone-propose-needs-accepted]]` memory).
- Don't re-attempt `zod`, `fastify`, or `h3` as a 3rd corpus repo without a genuinely different angle — all three are dead-ended and the reasons are mechanistic, not "untried." See `SOURCES.md`'s "Attempted 3rd repos" section before picking a new candidate.
- `necro scan --json packages` (targeting a subdirectory) still returns EMPTY on any monorepo — a separate, still-unfixed bug from `rec-20260718-002`'s scope (only the dist→src fallback was fixed in phase 50). Always scan monorepos with the repo root as target (`necro scan --json .`) and filter afterward if you need a subdirectory's scope.
- The host-cli work (`rec-20260718-003`) is real new capability, not a small tweak: it needs a new `LlmOptions` provider mode plus `TriageClient`/`RefactorClient` implementations that shell out to the `claude` CLI headlessly (e.g. `claude -p ...`), selectable alongside the existing direct-Anthropic-SDK path. `cadence-core`'s own `.cadence/phases/165-host-cli-headless-verifier` (in `/home/thomas/projects/cadence`, a sibling project — Thomas Powers authors cadence-core itself, see `[[user-authors-cadence]]`) is a working precedent worth reading before designing necro's version, though it verifies rather than classifies, so the shape won't map 1:1.
- `.cadence/mcp-trust.json` is deliberately untracked — don't commit it.
- Phase 49-01's AC-1/AC-3 blocked status is intentional and documented, not an oversight — don't try to "fix" them opportunistically while working the host-cli rec; they're separate follow-ups (AC-3 will actually be *unblocked* once host-cli lands, so there's a natural sequencing: host-cli phase first, then return to 49's T3/T4 artifact regen + gate re-derivation).

## Next action

**Action:** Promote `rec-20260718-003` from `candidate` to `accepted`, then run `cadence milestone propose` to cluster it into a milestone, export/convert that milestone into a new phase, and start a draft (`cadence draft new <phase-slug> 00 --fromRec rec-20260718-003` or the milestone-derived equivalent). Before drafting, read `cadence-core`'s `165-host-cli-headless-verifier` phase artifacts (`/home/thomas/projects/cadence/.cadence/phases/165-host-cli-headless-verifier/`) for the precedent, and re-read `src/triage/client.ts` + `src/refactor/client.ts` + `src/config.ts` to scope exactly what a host-cli `LlmOptions` provider needs to plug into (both clients, `resolveApiKey`, `structuredCall`).

**Verify:** `cadence status` shows an active draft under the new phase with AC-1 (or similar) targeting a host-cli provider mode; `rec-20260718-003`'s status has moved off `candidate`.

**If it fails:** If `cadence milestone propose` yields "None" or an empty cluster, the promote step was likely skipped or didn't take — check `cadence recommend` / the recommendation ledger directly (`.cadence/intelligence/recommendations.json`) for `rec-20260718-003`'s current `status` field before retrying.
