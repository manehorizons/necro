---
cadence_handoff: 1
generated_at: 2026-06-11T04:28:13.917Z
label: phase-20-launch-prep-docs
loop_position: IDLE
active_phase: 20-ship-adopt
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: d0b1aa7
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-11 (phase-20-launch-prep-docs)

## TL;DR for the next session
- **This was a strategy + prep session, no product code.** A "ship & adopt" milestone was shaped, a SPEC approved into the loop, then the user pulled back from publishing to write a full **pre-launch documentation set** first. Loop is **IDLE**.
- **The publish phase is staged but deliberately parked.** Milestone `mil-grp-ship-adopt` (recs 004 publish + 005 SARIF/Action/`--fail-on`) is `exported`; phase `20-ship-adopt` SPEC is **APPROVED** at `.cadence/phases/20-ship-adopt/20-20-SPEC.md`. It is NOT drafted — the user is not ready to publish yet.
- **The real deliverable this session: `docs/launch/` (7 files, untracked).** A complete pre-launch runway — readiness/go-no-go, npm account setup, publish runbook, positioning brief, onboarding review, announcement templates. All grounded in the real repo state.
- **The next move is the user's decision, not an in-flight task.** They must work through the 5 decisions in `docs/launch/00-readiness-go-no-go.md` — the hard blocker is **D2: npm credentials / `@necrotool` scope ownership** (nothing publishes until that's resolved via `docs/launch/01-npm-account-setup.md`).
- **Last open question to the user (unanswered): commit the `docs/launch/` set, or leave untracked?** Default has been leaving `.cadence/` + new dirs untracked per repo pattern.
- No blockers to *resuming*; full suite was green at session start (288 passed / 6 live-skipped).

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
- Loop: IDLE · phase 20-ship-adopt · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260610-004 — Publish @necrotool/necro to npm + agent-install story (unblocks the MCP server) (accepted/ready-for-milestone)
  - rec-20260610-005 — CI/PR citizen: real SARIF output + GitHub Action + --fail-on gating (accepted/ready-for-milestone)
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
- Promoted recs **004** + **005** to `accepted`/`ready-for-milestone` and set a shared `suggestedMilestoneId: "ship-adopt"` in `.cadence/intelligence/recommendations.json` (the only way to group them — no CLI sets that key).
- `cadence milestone propose` → one grouped milestone **`mil-grp-ship-adopt`**; hand-filled the two empty pre-mortem slots (`likelyFailureModes`, `outOfScope`); `cadence milestone accept` then `export --to cadence`.
- `cadence spec new 20-ship-adopt 20` (loop IDLE→SPEC), wrote full Given/When/Then for both ACs, `cadence spec check` OK, `cadence spec approve` (SPEC→IDLE, status APPROVED).
- User pivoted: "not ready to publish — create pre-launch docs first." Wrote **`docs/launch/`** (7 files): `README.md` (index), `00-readiness-go-no-go.md`, `01-npm-account-setup.md`, `02-publish-runbook.md`, `03-agent-adoption-positioning.md`, `04-onboarding-review.md`, `05-announcement-templates.md`.

## Carry-forward gotchas
- **The diff --stat above is misleading — it only shows tracked mods.** This session's real output is **untracked**: `docs/launch/` (the 7 launch docs) and `.cadence/phases/20-ship-adopt/` (the approved SPEC). `git status --short` is the accurate picture, not `diff --stat`.
- **Don't draft phase 20 yet.** The user is deliberately not publishing until they work through the 5 decisions in `docs/launch/00-readiness-go-no-go.md`. The hard blocker is **D2: npm credentials / `@necrotool` scope** — resolve via `docs/launch/01-npm-account-setup.md` before any `npm publish` work.
- **`suggestedMilestoneId` has no CLI setter.** It was hand-edited into `recommendations.json` to group 004+005. Likewise the milestone pre-mortem's `likelyFailureModes`/`outOfScope` were hand-edited into `milestones.json` (no CLI for human pre-mortem slots). The `premortem` command only refreshes the *deterministic* fields — don't run it expecting to keep the hand-written ones unless the milestone is already non-`proposed` (it's `accepted`, so safe).
- **`.cadence/` stays uncommitted by repo convention**; phase dirs 15–20 are untracked and `STATE.md`/`state.json` are modified — matches the existing pattern. Do NOT commit `.cadence/` unless asked.
- **Publish specifics already pinned down** (from the runbook, save re-deriving): scoped pkg `@necrotool/necro`, version `0.0.0` → publish at **`0.1.0`**, needs `npm publish --access public` (scoped = restricted by default), add `prepublishOnly: "npm run build"`, and **verify clean-room** with `npx -y @necrotool/necro mcp` in an empty dir. `npm view @necrotool/necro` is 404 today.
- **Docs site needs Node ≥ 22** (Astro 6); this shell defaults to Node 20.20.2 (`nvm use 22` for `astro build`). Repo CLI builds/tests under Node ≥ 20.
- **Outstanding question to the user:** commit `docs/launch/` or leave untracked (no answer given yet).

## Next action
**Action:** No in-flight build task — the loop is IDLE by design. Resume by orienting the user around `docs/launch/`, starting with the 5 decisions in `docs/launch/00-readiness-go-no-go.md` (especially **D2 npm credentials**, the hard blocker, worked via `docs/launch/01-npm-account-setup.md`). Only once the user resolves those and says "go" do you start the build: `cadence draft new 20-ship-adopt 20` (the SPEC is already APPROVED) and follow `docs/launch/02-publish-runbook.md`. Also resolve the still-open question: commit `docs/launch/` or leave untracked.
**Verify:** `cadence status` shows IDLE · phase 20-ship-adopt; `ls docs/launch/` lists the 7 files; `.cadence/phases/20-ship-adopt/20-20-SPEC.md` frontmatter `status: APPROVED`; `npm view @necrotool/necro version` still 404 (not yet published — expected); `git log origin/main..HEAD` empty (all code pushed).
**If it fails:** if the user wants to skip prep and publish now, jump straight to `docs/launch/02-publish-runbook.md` §0 (it self-checks credentials). If `cadence draft new` complains about a stale/approved spec, the SPEC is already APPROVED — that's expected; drafting proceeds from it. If publish surfaces a name/scope conflict, decision **D1** (scoped-only vs unscoped alias) in doc 00 covers it.
