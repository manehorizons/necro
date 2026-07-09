---
cadence_handoff: 1
generated_at: 2026-06-10T23:52:25.869Z
label: phase-19-mcp-docs-recs
loop_position: IDLE
active_phase: 19-necro-mcp
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: d0b1aa7
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-10 (phase-19-mcp-docs-recs)

## TL;DR for the next session
- **Loop is IDLE, working tree clean of code — nothing in progress, nothing unpushed.** Two phases shipped + settled this session (18 detector fix, 19 MCP server) and all work is on `origin/main` (HEAD `d0b1aa7`). Only `.cadence/` bookkeeping is uncommitted (leave it).
- **This session was half build, half strategy.** Phase 18 fixed the duplication detector root cause; phase 19 shipped the `necro mcp` server (the agent/MCP entry point); then docs were fully synced to reality; then a competitive re-assessment produced a 5-item ranked recommendation backlog (rec-004…008).
- **The next move is a decision, not an in-flight task:** which of the banked recs to pursue, or push deeper into strategy. The natural #1 is **rec-20260610-004 (publish `@necrotool/necro` to npm)** — it's the gate on everything else (the MCP server is unreachable by agents while unpublished; `npm view` 404s, version still `0.0.0`).
- **Recommended sequencing** (from the re-assessment): 004 publish → 005 SARIF+Action+`--fail-on` → 006 accuracy benchmark + 008 FP-reduction plugins in parallel → 007 deepen the agent wedge. Several are milestone-sized (`cadence milestone propose`); 004+005 ≈ a "ship & adopt" milestone, 006+008 ≈ an "accuracy" milestone.
- No blockers. Full non-live suite green (288 passed / 6 live-skipped); `astro` docs site builds clean with all internal links valid.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `d0b1aa7`
- Recent commits:
```
d0b1aa7 docs: synchronize README + docs site with shipped surface (phases 12-19)
a533d4c docs(19-necro-mcp): document `necro mcp` agent/MCP entry point (AC-4)
d3c302a feat(19-necro-mcp): necro_scan + necro_verify read-only tools (AC-1, AC-2, AC-3, AC-4)
acc3646 feat(19-necro-mcp): stdio MCP server scaffold + `necro mcp` command (AC-1)
e28bdce feat(18-dup-detector-unit-windows): thread function units through engine duplication path (AC-1)
5cb2fb7 feat(18-dup-detector-unit-windows): clamp findClones windows to FunctionUnit boundaries (AC-1, AC-2, AC-4)
4d52ff9 test(17-dup-corpus-retire-multiunit): live-validate backfills, raise floor 0.5->0.7 (AC-3, AC-4)
54e8ab4 test(17-dup-corpus-retire-multiunit): retire 3 multi-unit windows, backfill single-unit clones (AC-1)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 19-necro-mcp · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260610-004 — Publish @necrotool/necro to npm + agent-install story (unblocks the MCP server) (candidate/needs-decision)
  - rec-20260610-005 — CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating (candidate/needs-decision)
  - rec-20260610-006 — Public measured-accuracy benchmark (necro bench) — weaponize the eval harness (candidate/needs-decision)
  - rec-20260610-008 — False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges (candidate/needs-decision)
  - rec-20260610-007 — Deepen the agent wedge: necro_verify enhancements + necro explain (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `package.json` — affected by rec-20260610-004 Publish @necrotool/necro to npm + agent-install story (unblocks the MCP server)
  - `.github/workflows/release.yml` — affected by rec-20260610-004 Publish @necrotool/necro to npm + agent-install story (unblocks the MCP server)
  - `README.md` — affected by rec-20260610-004 Publish @necrotool/necro to npm + agent-install story (unblocks the MCP server)
  - `website/src/content/docs/guide/installation.md` — affected by rec-20260610-004 Publish @necrotool/necro to npm + agent-install story (unblocks the MCP server)
  - `src/cli.ts` — affected by rec-20260610-004 Publish @necrotool/necro to npm + agent-install story (unblocks the MCP server)
  - `src/report/sarif.ts` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `.github/actions/necro/action.yml` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `website/src/content/docs/guide/ci-integration.md` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `test/fixtures/refactor-dup-realrepo/` — affected by rec-20260610-006 Public measured-accuracy benchmark (necro bench) — weaponize the eval harness
  - `src/bench/` — affected by rec-20260610-006 Public measured-accuracy benchmark (necro bench) — weaponize the eval harness
  - `website/src/content/docs/guide/accuracy.md` — affected by rec-20260610-006 Public measured-accuracy benchmark (necro bench) — weaponize the eval harness
  - `src/plugins/` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/engine/index.ts` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/graph/` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/plugins/registry.ts` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/mcp/tools/verify.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/mcp/tools/explain.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/refactor/verify.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/analyze/` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain

## What landed this session
- **Phase 18 (settled, AC-1..4 pass)** — `findClones` now clamps clone windows to `FunctionUnit` boundaries: optional per-file `units` on `FileTokens`, innermost-unit assignment + `runEnd`, window indexing + greedy extension both stop at a boundary. `engine/index.ts` threads the already-computed units in. Resolved the rec-002 detector root cause behind phases 16–17's curation. Commits `5cb2fb7`, `e28bdce`.
- **Phase 19 (settled, AC-1..4 pass)** — shipped the `necro mcp` read-only stdio MCP server (`@modelcontextprotocol/sdk` + zod). Two tools: `necro_scan` (golden-equal to `scan --json`, a test forbids a logic fork) and `necro_verify` (applies `{file,content}` edits in a throwaway worktree via `verifyEdits`/`gitWorktreeRunner`, always tears down, never touches the user tree). 8 new tests, all RED-first. Commits `acc3646`, `d3c302a`, `a533d4c`.
- **Docs fully synced** (`d0b1aa7`) — README status/quickstart/how-it-works/roadmap/layout/License(MIT) + the docs site (roadmap, landing, introduction, architecture, CLI ref for triage/refactor/mcp, `llm` config key, CRAP/glossary fixes) reconciled to the actually-shipped surface. `astro build` clean, links validated.
- **Strategy** — two competitive assessments (initial + post-update re-score) and a 5-rec backlog banked: 004 publish, 005 CI citizen, 006 accuracy benchmark, 007 deepen agent wedge, 008 FP-reduction plugins.

## Carry-forward gotchas
- **`.cadence/` is uncommitted by design.** Feature/docs commits exclude it; phase dirs `15–19` are untracked and `STATE.md`/`state.json` are modified. Matches the repo pattern — do NOT commit `.cadence/` unless asked.
- **The docs site needs Node ≥ 22** (Astro 6); the repo CLI builds/tests under Node ≥ 20. This shell defaults to Node 20.20.2 — `astro build` fails until you `nvm use 22` (nvm is available: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`).
- **rec-004 is the gate, and it's empirically true:** `npm view @necrotool/necro version` → 404, `package.json` version `0.0.0`. The phase-19 MCP server works but no agent can install it yet. Don't start 005/007 (which assume an installable package/Action) before publishing.
- **Live dup eval (AC-3) is insensitive to detector changes by construction** — the dup corpus is a static fixture (`test/fixtures/refactor-dup-realrepo/cases.json`) and the only live-path `findClones` call is the unit-less residual scorer. Phase 18's AC-3 was passed-by-construction (no billable run). Live eval is still billable (gate 0.7, key in `.env`, NOT auto-loaded: `set -a; . ./.env; set +a`).
- **The MCP verify runner is dependency-injected** — `createNecroServer({ runnerFactory })` swaps `gitWorktreeRunner` for a fake in tests; don't "simplify" it away. `DEFAULT_CHECKS` (`npm run typecheck`, `npx vitest run`) is reused from `src/refactor/index.ts`.
- **CADENCE quirks** (still apply): settle over MCP takes `{auto:true}`; the AC↔test gate needs each AC-N in a test title; `--allowStaleDraft` if you edit a DRAFT after approve.
- An earlier same-day SESSION doc exists (`SESSION-2026-06-10-phase-17-complete-detector-rec.md`, already consumed at this session's start) — this doc is the fresher one and `lastHandoff` points here.

## Next action
**Action:** No in-flight task — the loop is IDLE and all work is pushed. The genuine next step is a decision on the banked backlog. The recommended move is to start **rec-20260610-004 (publish the package)**, the gate on the MCP work being adoptable: `cadence draft new 20-publish-npm 20 --fromRec=rec-20260610-004` (then fill the DRAFT, `cadence draft approve`, build). Alternatively, since several recs are milestone-sized, group them: `cadence milestone propose` for a "ship & adopt" milestone (004 publish + 005 SARIF/Action/`--fail-on`). Confirm direction with the user before scaffolding — they may want strategy over building.
**Verify:** `cadence status` shows IDLE; `cadence recommend` lists 004–008 (004/005/006/008 high, 007 medium); `git log origin/main..HEAD` is empty (all pushed); `npx vitest run` green (288 passed / 6 skipped).
**If it fails:** if `npm publish` work surfaces a name/scope conflict, the package is scoped `@necrotool/necro` (unpublished, bin `necro`→dist/cli.js, `files:["dist"]`, `private:false`) — decide scoped-only vs an unscoped alias before publishing. If a docs change is needed, remember the Node-22 requirement for `astro build`.
