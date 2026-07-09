---
cadence_handoff: 1
generated_at: 2026-07-02T00:05:44.304Z
label: audit-recs
loop_position: IDLE
active_phase: 27-explain-narrate
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 8b78cdf
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-02 (audit-recs)

## TL;DR for the next session
- Full application audit completed 2026-07-01 at HEAD 8b78cdf: 32 findings (4 high / 19 medium / 9 low), 2 live-reproduced bugs; report at `audit-report-2026-07-01.html` (repo root, untracked, self-contained dark-mode HTML).
- All 16 audit improvements filed as recommendations rec-20260701-001..016 (scoutId scout-20260701-audit), priority-mapped P0→critical, P1→high, P2→medium; ledger now ranks them exactly in audit order under the pre-existing rec-20260612-001.
- Every new rec is `status: candidate` — `cadence milestone propose` clusters only **accepted** recs, so promote the chosen tier(s) first or propose silently yields "None".
- Single next action: promote the four critical recs (001–004) and run `cadence milestone propose`, or draft a phase directly for rec-20260701-001 (ci.yml).
- No blockers; loop is IDLE, phase 27 settled and pushed, working tree dirty only with derived cadence state.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `8b78cdf`
- Recent commits:
```
8b78cdf test(27): explain --narrate coverage — prompt, client, engine, CLI, MCP (AC-1..4)
3167f6b feat(27): explain --narrate — additive LLM narrative over the deterministic verdict (T1-T5)
4b0aa27 test(26): verify-removal coverage — planner, engine, CLI, MCP (AC-1..5)
02ba2f5 feat(26): necro verify-removal — per-symbol removal safety in isolated worktrees (T1-T4)
fd94740 test(25): explain coverage — tracePath, model, engine, CLI, MCP (AC-1/2/3/4)
1e056b7 feat(25): necro explain — reachability trace explainer (CLI + MCP) (T1-T5)
931fa85 test(24): synthesized monorepo corpus + AC-1/2/3 tests (T4)
7a1e00e feat(24): cross-package alias edges + member entry rooting (T2, T3)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 27-explain-narrate · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260612-001 — Verified auto-removal loop: gate fix on verify-removal (accepted/ready-for-milestone)
  - rec-20260701-001 — Add ci.yml: typecheck + build + test on every push/PR (candidate/ready-for-milestone)
  - rec-20260701-002 — Fix verify-removal exit code: non-zero on unsafe/error verdicts (candidate/ready-for-milestone)
  - rec-20260701-003 — Fix --checks parsing: repeatable flag or JSON array instead of comma-split (candidate/ready-for-milestone)
  - rec-20260701-004 — Sync every doc surface to HEAD (phases 22-27) (candidate/ready-for-milestone)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `src/fix` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `src/explain` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `src/cli.ts` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `src/mcp` — affected by rec-20260612-001 Verified auto-removal loop: gate fix on verify-removal
  - `.github/workflows/` — affected by rec-20260701-001 Add ci.yml: typecheck + build + test on every push/PR
  - `README.md` — affected by rec-20260701-004 Sync every doc surface to HEAD (phases 22-27)
  - `CHANGELOG.md` — affected by rec-20260701-004 Sync every doc surface to HEAD (phases 22-27)
  - `website/src/content/docs/` — affected by rec-20260701-004 Sync every doc surface to HEAD (phases 22-27)
  - `package.json` — affected by rec-20260701-005 Cut and publish v1.2.0
  - `src/report/` — affected by rec-20260701-006 Baseline file + inline suppression (necro baseline / necro-ignore)
  - `src/config.ts` — affected by rec-20260701-006 Baseline file + inline suppression (necro baseline / necro-ignore)
  - `vitest.config.ts` — affected by rec-20260701-008 Coverage in CI + scheduled live-accuracy gate
  - `src/mcp/tools/` — affected by rec-20260701-009 MCP hardening: progress notifications, target-relative config, full tool docs
  - `src/mcp/server.ts` — affected by rec-20260701-009 MCP hardening: progress notifications, target-relative config, full tool docs
  - `src/triage/client.ts` — affected by rec-20260701-010 Extract src/llm/: shared client plumbing + structuredCall helper + usage reporting
  - `src/refactor/client.ts` — affected by rec-20260701-010 Extract src/llm/: shared client plumbing + structuredCall helper + usage reporting
  - `src/explain/client.ts` — affected by rec-20260701-010 Extract src/llm/: shared client plumbing + structuredCall helper + usage reporting
  - `test/fixtures/triage-realrepo/` — affected by rec-20260701-011 Grow triage corpus (dead-positives) + track run-to-run variance
  - `src/bench/snapshot.ts` — affected by rec-20260701-011 Grow triage corpus (dead-positives) + track run-to-run variance
  - `src/bench/` — affected by rec-20260701-012 Competitor head-to-head accuracy table (knip, ts-prune)
  - `website/src/content/docs/guide/accuracy.mdx` — affected by rec-20260701-012 Competitor head-to-head accuracy table (knip, ts-prune)
  - `.github/dependabot.yml` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `tsconfig.json` — affected by rec-20260701-013 Library export surface (exports map + type declarations)
  - `src/syntactic/parse.ts` — affected by rec-20260701-014 Make "polyglot" true — or stop claiming it
  - `src/graph/symbol-graph.ts` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos

## What landed this session
- Six-track parallel audit (onboarding/docs, CLI UX, architecture, tests/CI/release, MCP/LLM, bench/roadmap) with live verification: full vitest run (385 passed / 0 failed / 4.4s), CLI exercised on a planted fixture, MCP server handshaken over stdio, npm/GitHub state queried.
- Two bugs confirmed live: `verify-removal` always exits 0 even on "removal breaks the build" (src/cli.ts:162-178); `--checks` comma-split shreds commands and misreports the failure as unsafe removal (src/cli.ts:166).
- `audit-report-2026-07-01.html` written to repo root — rendered and visually verified; chart palette machine-validated (CVD + contrast, dark surface).
- 16 recommendations added to the intelligence ledger (rec-20260701-001..016) mirroring the audit's P0/P1/P2 ranking; rec-20260612-001 (verified auto-removal loop) intentionally not duplicated.
- Audit summary saved to project memory (`necro-full-audit-2026-07`); user-global `/memory setup` re-verified (no-op, all platforms v1).

## Carry-forward gotchas
- `cadence milestone propose` only clusters `status: accepted` recs — the 16 new ones are all `candidate`; promote first or propose yields "None" with no error.
- The audit report HTML is untracked at repo root; don't commit it accidentally with a broad `git add -A` unless intended (same for `.claude/` and the untracked `.cadence/phases/15-27/` dirs — tracking policy for those is itself audit finding rec-20260701-015 territory / a LOW finding).
- npm 1.1.0 lags HEAD by five features — anything user-facing you verify against the published package will not match HEAD behavior; build locally (`npm run build`) and use `node dist/cli.js`.
- Audit scores/evidence cite file:line at HEAD 8b78cdf; re-verify line numbers after any refactor lands.

## Next action
**Action:** Promote the four critical recs, then propose a milestone:
`cadence recommendation promote rec-20260701-001 rec-20260701-002 rec-20260701-003 rec-20260701-004` (check exact promote syntax with `cadence recommendation --help` if it differs), then `cadence milestone propose`.
**Verify:** `cadence recommend` shows the four recs as `accepted`, and `milestone propose` emits a clustered milestone (not "None").
**If it fails:** If promote syntax differs, use the MCP tool `cadence_recommendation_promote` per rec id. If propose still yields "None", confirm each rec's status field in `.cadence/intelligence/recommendations.json` is `accepted` (see memory note cadence-milestone-propose-needs-accepted).
