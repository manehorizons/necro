---
cadence_handoff: 1
generated_at: 2026-06-12T00:22:42.218Z
label: necro-explain-shipped
loop_position: IDLE
active_phase: 25-necro-explain
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: fd94740
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-12 (necro-explain-shipped)

## TL;DR for the next session
- **Phase 25 `necro explain` shipped + settled this session** (AC-1/2/3/4 all PASS). Loop **IDLE**, nothing in flight.
- **Everything pushed** — HEAD `fd94740`, **0 ahead** of origin/main. Full suite **357 passed** (was 340, +17), `tsc --noEmit` clean.
- **Big reconciliation happened first:** 8 of 9 recommendations were already shipped but still marked active (corrupting `cadence recommend`); all 8 promoted to `status=shipped` with phase provenance refs and archived. rec-007 was the only real open item → became phase 25.
- **Only one active rec left: `rec-20260611-001`** — `necro_verify` enhancements (rec-007 half (a), deferred). It's the sole `cadence recommend` candidate.
- **Watch:** that new rec's id **collides** with the archived/shipped "Monorepo workspace FP" rec (also `rec-20260611-001`) — cadence sequences ids only over active recs. Functionally safe (all ops resolve to the active one), cosmetically a wart. User chose to leave it.
- **Nothing blocking.** `.cadence/` intentionally uncommitted (convention); no source WIP, nothing stashed.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `fd94740`
- Recent commits:
```
fd94740 test(25): explain coverage — tracePath, model, engine, CLI, MCP (AC-1/2/3/4)
1e056b7 feat(25): necro explain — reachability trace explainer (CLI + MCP) (T1-T5)
931fa85 test(24): synthesized monorepo corpus + AC-1/2/3 tests (T4)
7a1e00e feat(24): cross-package alias edges + member entry rooting (T2, T3)
c7f37cc feat(24): workspace discovery + pkgName->entry map (T1)
6cbb799 feat(23): Next.js framework plugin + engine prod-entry export-rooting (T2, T3)
986b10d test(23): SHA-pinned Next.js FP corpus + tsconfig fixtures exclude (T1)
d0b6ce9 docs(23): narrow to Next.js-only; split monorepo to phase 24
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 25-necro-explain · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260611-001 — necro_verify enhancements: verify-a-removal + verify-N-candidates (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `src/refactor/verify.ts` — affected by rec-20260611-001 necro_verify enhancements: verify-a-removal + verify-N-candidates
  - `src/mcp/tools/verify.ts` — affected by rec-20260611-001 necro_verify enhancements: verify-a-removal + verify-N-candidates
  - `src/cli.ts` — affected by rec-20260611-001 necro_verify enhancements: verify-a-removal + verify-N-candidates

## What landed this session
- `necro explain <symbol>` CLI (+ `--json`) and `necro_explain` read-only MCP tool — deterministic reachability-trace explainer (no LLM).
- `tracePath` (BFS-with-parent shortest witness chain) added to `src/analyze/reachability.ts`, kept separate from the mark-and-sweep so the scan hot path is untouched.
- Extracted `buildReachabilityModel()` (`src/engine/model.ts`) — graph-build + entry-resolution + reachability prelude now shared by `scan` and `explain`; scan behavior unchanged.
- `explain()` engine fn (`src/engine/explain.ts`): symbol resolution (name / file:name / file:line:name, ambiguous→candidates, unknown→not-found), alive/test-only witness chains, dead → inbound referrers annotated by verdict.
- 2 commits pushed to `main`: `1e056b7 feat(25)` + `fd94740 test(25)`. +17 tests.
- Reconciled the rec ledger (8 recs → shipped+archived w/ phase refs) and filed `rec-20260611-001` for the deferred verify half.

## Carry-forward gotchas
- **Duplicate rec id:** active `rec-20260611-001` (necro_verify enhancements) shares its id with the archived/shipped "Monorepo workspace FP" rec. `cadence recommendation add` sequences ids only over *active* recs, so the archived 001 wasn't counted. `show`/`recommend`/`--from-rec` all resolve to the **active** one; the archived one is terminal. Don't unarchive the monorepo rec without expecting ambiguity. User opted to leave it (not hand-edit the JSON, which has derived caches in `.cadence/intelligence/`).
- **`.cadence/` is intentionally uncommitted** (STATE.md/state.json modified; phase dirs + handoff untracked) — repo convention. No source WIP; nothing stashed.
- **`necro explain` is deterministic/static** — it realizes the *static* half of the design-spec's `--explain`. The spec also imagined an LLM narrative layer; that was explicitly scoped OUT and is a future phase. Don't conflate.
- **explain entry seeds render as `(entry)` with `file: null`** — a witness chain's first node is a module file path (the prod/test entry), not a declared symbol, so its `file`/`line` are null by design. Tests assert on `.id` (the file path) for that step, not `.file`.
- **CLI/MCP test fixtures need a vitest/jest dep** in `package.json` for the test-runner plugin to recognize `*.test.ts` as test entries — otherwise test-only symbols read as dead (see `test/explain.test.ts` AC-3).
- **Push to `main` needs explicit per-action authorization** — the auto-classifier blocks direct default-branch pushes even after a generic "yes." This session's push was user-authorized.

## Next action
**Action:** No work in flight — loop IDLE, phase 25 shipped/settled/pushed. Next is the user's strategic pick. Run `cadence recommend` (re-ranks clean now); the sole active candidate is **`rec-20260611-001`** — `necro_verify` enhancements (verify-a-removal: "does deleting symbol X keep the build green?" — pairs with the new `necro explain` dead verdict; + verify-N-candidates). It's `needs-decision`, so start with `cadence draft new <slug> <n> --from-rec rec-20260611-001` after a brief scope discussion. Builds on the existing throwaway-worktree harness in `src/refactor/verify.ts` (`verifyEdits`/`gitWorktreeRunner`) and the `necro_verify` MCP tool.
**Verify:** `cadence status` → IDLE · phase 25-necro-explain; `git log origin/main..HEAD` empty (all pushed); `npm test` → 357 passed; `npx tsc --noEmit` clean.
**If it fails:** nothing is pending to recover — the session ended clean. If `necro explain` ever returns an empty witness for a symbol the scan calls alive, suspect a synthetic plugin edge not threaded into `model.edges` (explain traces `model.edges` = graph edges + synthetic edges; they must match what `computeReachability` saw).
