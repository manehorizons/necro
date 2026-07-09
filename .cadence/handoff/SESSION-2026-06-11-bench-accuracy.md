---
cadence_handoff: 1
generated_at: 2026-06-11T19:38:37.088Z
label: bench-accuracy
loop_position: IDLE
active_phase: 22-bench-accuracy
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 02b9196
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-11 (bench-accuracy)

## TL;DR for the next session
- **Phase 22 (rec-006 v1 — public measured-accuracy benchmark) shipped end-to-end this session:** brainstorm → spec → DRAFT → BUILD (TDD) → settle **PASS** (AC-1/2/3). Loop is **IDLE**, nothing in flight.
- **`necro bench` + committed snapshot:** `npm run bench` (repo-internal) writes provenance-stamped `bench/results.json` — triage precision **1.00** / recall **0.47** / F1 **0.64** (N=48, **FP=0**); dup extract-duplicate pass-rate **0.92** (11/12); necro 1.1.0, model claude-opus-4-8.
- **Public Accuracy page is LIVE:** https://manehorizons.github.io/necro/guide/accuracy/ — GitHub Pages was **enabled this session** (was off) and deployed via `docs.yml` `workflow_dispatch`.
- **Docs Pages stack bumped to node24** (configure-pages@v6 · upload-pages-artifact@v5 · deploy-pages@v5) — clears the 2026-06-16 Node-20 deprecation; re-deployed **green, no annotations**.
- **Everything pushed** (HEAD `02b9196`, 0 ahead). Full suite **325 passed**. Only `.cadence/` loop state is uncommitted (convention).
- **Next is a strategic pick, not a pending task:** rec-007 (agent wedge), rec-008 (false-positive plugins), or the rec-006 fast-follow (competitor head-to-head accuracy table).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `02b9196`
- Recent commits:
```
02b9196 ci(docs): bump Pages stack to node24 actions (configure-pages v6, upload-pages-artifact v5, deploy-pages v5)
422b835 feat(22-bench-accuracy): Accuracy page + committed snapshot (T3 snapshot, T4, T5)
3c9e6ed feat(22-bench-accuracy): necro bench runner + snapshot (T1-T3)
feab5b8 docs: design spec for necro bench + Accuracy page (rec-006 v1)
8523c15 ci: bump codeql-action/upload-sarif to v4 in the necro Action
b5c4f2b release: @manehorizons/necro@1.1.0 — CI/PR citizen (SARIF + Action + --fail-on)
6b1f89a feat(21-ci-pr-citizen): SARIF + GitHub Action + --fail-on gating (AC-2)
a27b65b chore: gitignore docs/launch (local pre-launch planning docs)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 22-bench-accuracy · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260610-004 — Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server) (accepted/ready-for-milestone)
  - rec-20260610-005 — CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating (accepted/ready-for-milestone)
  - rec-20260610-008 — False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges (candidate/needs-decision)
  - rec-20260610-007 — Deepen the agent wedge: necro_verify enhancements + necro explain (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `package.json` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `.github/workflows/release.yml` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `README.md` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `website/src/content/docs/guide/installation.md` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `src/cli.ts` — affected by rec-20260610-004 Publish @manehorizons/necro to npm + agent-install story (unblocks the MCP server)
  - `src/report/sarif.ts` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `.github/actions/necro/action.yml` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `website/src/content/docs/guide/ci-integration.md` — affected by rec-20260610-005 CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating
  - `src/plugins/` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/engine/index.ts` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/graph/` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/plugins/registry.ts` — affected by rec-20260610-008 False-positive reduction: Next.js/NestJS plugins + monorepo workspace edges
  - `src/mcp/tools/verify.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/mcp/tools/explain.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/refactor/verify.ts` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain
  - `src/analyze/` — affected by rec-20260610-007 Deepen the agent wedge: necro_verify enhancements + necro explain

## What landed this session
- Phase 22 settled **PASS** (AC-1/2/3): bench runner + provenance snapshot + Accuracy page + page↔snapshot contract test.
- `src/bench/{snapshot,run,cli-bench}.ts` — pure snapshot module, injected-dep orchestrator over existing `runEval`/`runDuplicateEval`, thin CLI. `npm run bench` script via `tsx` (new devDep).
- `bench/results.json` — live-measured, committed (the published numbers' single source of truth).
- `website/src/content/docs/guide/accuracy.mdx` — renders metrics FROM the snapshot; `astro.config.mjs` got `vite.server.fs.allow: ['..']` for the cross-root import. Auto-added to Guide nav (order 4.5).
- 15 new tests (snapshot/run/cli units + page-contract guard, proven to bite); full suite 325 passed, typecheck clean.
- GitHub Pages enabled on the public repo (build_type=workflow) + first deploy → site live.
- Pages actions bumped to node24 stack; deploy re-verified green (no Node-20 annotations).
- Commits: `feab5b8` (design spec), `3c9e6ed` (bench T1–T3), `422b835` (page+snapshot+contract), `02b9196` (node24 Pages bump).

## Carry-forward gotchas
- **`.cadence/` is intentionally uncommitted** (STATE.md/state.json modified; phase dirs 15–22 untracked) — repo convention. Do NOT commit it. Nothing was stashed; no WIP source is uncommitted.
- **`npm run bench` is REPO-INTERNAL, not a `necro` CLI subcommand** — the corpus lives in `test/fixtures/`, which ships in no npm tarball (`files:["dist"]`). It needs `ANTHROPIC_API_KEY` + real cost (~60 model calls) and the numbers are **non-deterministic** (model in the loop).
- **Accuracy page numbers only change when someone re-runs `npm run bench` and commits the new `bench/results.json`.** The page reads that committed file at build via a cross-root import enabled by `vite.server.fs.allow: ['..']` in `website/astro.config.mjs`.
- **Docs deploy is MANUAL:** pushing to `main` only *validates* the build; the actual Pages deploy requires `gh workflow run docs.yml` (`workflow_dispatch`). Pages is now enabled (build_type=workflow) for the public repo.
- **Docs site needs Node ≥ 22** (`nvm use 22`); this shell defaults to Node 20.
- **rec-006 was converted to phase 22** (no longer in the candidate list). The page intentionally ships **necro-only** numbers — the knip/ts-prune competitor head-to-head was **explicitly deferred** (the v1 design decision). Design spec: `docs/superpowers/specs/2026-06-11-necro-bench-accuracy-design.md`.
- All four Pages actions are node24 now; the previously-warned 2026-06-16 Node-20 deprecation is fully cleared.

## Next action
**Action:** No work in flight — loop IDLE, phase 22 shipped + settled, docs site live. The next move is the user's strategic pick among the remaining recommendations: **rec-007** (deepen the agent wedge — `necro_verify` enhancements + `necro explain`), **rec-008** (false-positive reduction — Next.js/NestJS plugins + monorepo workspace edges), or the **rec-006 fast-follow** (competitor head-to-head accuracy table; the thin runner + Accuracy page already shipped). Start with `cadence recommend` to re-rank, then `cadence draft new <slug> <n>` (optionally `--from-rec <id>`) — or `cadence milestone propose` to shape one.
**Verify:** `cadence status` → IDLE · phase 22-bench-accuracy; `git log origin/main..HEAD` empty (all pushed); `curl -s -o /dev/null -w '%{http_code}' https://manehorizons.github.io/necro/guide/accuracy/` → `200`; `npm test` → 325 passed.
**If it fails:** nothing is pending to recover — the session ended clean. If the docs deploy ever re-warns about Node 20, note all four Pages actions are already on the node24 majors; any remaining warning would be upstream-only.
