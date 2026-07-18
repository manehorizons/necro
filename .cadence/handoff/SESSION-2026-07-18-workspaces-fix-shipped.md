---
cadence_handoff: 1
generated_at: 2026-07-18T18:28:46.809Z
label: workspaces-fix-shipped
loop_position: IDLE
active_phase: 50-workspaces-entry-fallback
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 88e1b99
git_ahead: 6
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (workspaces-fix-shipped)

## TL;DR for the next session
- Phase 50 (`workspaces.ts` monorepo entry-resolution fallback fix) is fully shipped, settled, and loop is IDLE — but the changes are **uncommitted** on disk (see diff --stat above). Nothing is lost; just needs a commit.
- The fix: `resolveWorkspaces` (monorepo-member entry resolution) had no dist→src fallback, unlike `resolveProdEntries` (single-package path) — on an unbuilt monorepo checkout every member's `main`/`module`/`exports` pointed at a nonexistent `dist/` file, silently seeding zero reachability roots and breaking ts-morph's cross-package alias resolution. Fixed by having `resolveWorkspaces` call `resolveProdEntries` per member dir instead of re-deriving entries inline. Live-verified on a real `trpc/trpc` checkout: 20 findings that were false certain-dead/maybe pre-fix now correctly resolve alive.
- This bug was discovered as a **blocker mid-way through phase 49** (growing the triage accuracy corpus by mining `trpc/trpc`'s ~90 unexplored `maybe` findings for more `dead`-labeled cases) — phase 49 was settled as `blocked`, not abandoned. It's the natural next unit of work now that the blocker is cleared.
- Also settled this session (before the bug was found): `rec-20260701-011` accepted → milestoned → exported → became phase 49; three other top recs (`012` competitor accuracy table, `015` toolchain hygiene bundle) were accepted+milestoned but **not yet exported/drafted** — still sitting as `proposed`/`accepted` milestones, available whenever.
- **Next action:** resume phase 49 corpus-growth work with a fresh draft (`cadence draft new 49-triage-corpus-variance 01 --fromRec ...` or similar) — T1 can now actually mine `trpc/trpc`'s maybe findings, since the engine bug that made those scans untrustworthy is fixed. Not urgent/blocking, operator's call.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 6 ahead / 0 behind origin
- HEAD `88e1b99`
- Recent commits:
```
88e1b99 chore(cadence): stamp session handoff — phase-48-shipped-fork-incident
e6c8ec1 fix(python): replace stray literal null byte with a space in resolveBareName's cache key
51f12ca feat(48): Python accuracy corpus + CI precision/recall gate (rec-20260701-014 Phase D)
2b19448 chore(cadence): stamp session handoff — phase-48-corpus-vendored-labeling-paused
9df4104 WIP: handoff — phase 48 corpus vendoring
50efcd0 chore(cadence): stamp session handoff — phase-47-python-quarantine-shipped
87e8ac3 feat(47): Python pytest test-glob entries + library publicApiIds quarantine (rec-20260701-014)
40732a6 feat(46): Python entry-point resolution — pyproject/setup.cfg/setup.py scripts, dunder-main, conventions (rec-20260701-014)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md        |  6 ++--
 .cadence/state.json      | 10 +++---
 src/engine/model.ts      |  2 +-
 src/engine/workspaces.ts | 53 +++++++++++++++--------------
 test/workspaces.test.ts  | 88 +++++++++++++++++++++++++++++++++++++++++++++---
 5 files changed, 120 insertions(+), 39 deletions(-)
```
- Loop: IDLE · phase 50-workspaces-entry-fallback · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260701-012 — Competitor head-to-head accuracy table (knip, ts-prune) (accepted/ready-for-milestone)
  - rec-20260701-015 — Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate (accepted/ready-for-milestone)
  - rec-20260701-013 — Library export surface (exports map + type declarations) (candidate/needs-decision)
  - rec-20260701-016 — Incremental symbol-graph cache for large repos (candidate/needs-evidence)
  - rec-20260718-001 — SKIP_DIRS silently skips any directory literally named 'build' (candidate/needs-evidence)
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
  - `src/graph/symbol-graph.ts` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos
  - `src/discover.ts` — affected by rec-20260718-001 SKIP_DIRS silently skips any directory literally named 'build'

## What landed this session
- Ran `cadence recommend --top 5`; showed detail on `rec-20260701-011/012/015`; accepted all three.
- Promoted `rec-20260701-011`, milestoned/accepted/exported it, wrote SPEC/DRAFT for phase 49 (`49-triage-corpus-variance/00`, "Grow triage corpus + track run-to-run variance"), approved into BUILD.
- Started T1 (grow dead-positive corpus): scanned `unjs/h3`, `colinhacks/zod`, `fastify/fastify` as 3rd-repo candidates — all rejected (h3: alive-only, zero natural dead cases since tests live outside `src/`; zod: too clean, no dynamic-import taint; fastify: not tried, low odds). Pivoted to mining `trpc/trpc`'s unexplored ~90 `maybe` findings instead (user's call).
- Re-scanning trpc/trpc's monorepo surfaced a real necro engine bug (see TL;DR) — root-caused it (`resolveProdEntries` has a manifest-existence-check + dist→src fallback chain; `resolveWorkspaces` never got the same treatment), had an Opus review agent independently verify the diagnosis (confirmed correct, found `packagePaths` was independently broken too, plus a `pkg.bin` coverage gap).
- Marked phase 49's T1–T4 `BLOCKED`, settled phase 49 honestly (all 3 ACs `fail`, reason = the engine bug) — loop returned to IDLE.
- Filed `rec-20260718-002`, accepted it, wrote SPEC/DRAFT for phase 50 (`50-workspaces-entry-fallback/00`), approved into BUILD.
- Implemented the fix (`src/engine/workspaces.ts`, `src/engine/model.ts`), added 4 new regression fixtures + updated 5 existing test call-sites (`test/workspaces.test.ts`, 9/9 passing), full suite green (690 passed, 0 regressions, `tsc --noEmit` clean).
- Live-verified via an exact pre/post-fix diff on `trpc/trpc` (git-stash the fix, rebuild, rescan, restore, rebuild, rescan, diff finding sets) — precisely itemized the fix's real effect (20 findings flip from misclassified-dead to correctly-alive) rather than accepting a vaguer aggregate-ratio claim.
- Settled phase 50 with all 4 ACs passing (AC-4's note honestly corrects the original speculative wording against the real, more precise evidence). Loop is IDLE.

## Carry-forward gotchas
- **This fix only helps the scan-from-monorepo-root case.** `necro scan --json packages` (scan target = a subdir, not the repo root) still returns `EMPTY` from `resolveWorkspaces` entirely — it only looks for the workspace manifest (`pnpm-workspace.yaml`/`package.json` workspaces field) at `targetPath` itself, so scanning a subdirectory never finds it. This is a separate, deliberately out-of-scope issue, documented in `rec-20260718-002`'s evidence. If phase 49's corpus mining resumes by re-running the *exact* documented SOURCES.md command (`necro scan --json packages` from repo root), it will **still be degenerate** — use `necro scan --json .` (repo root as target) instead.
- **trpc/trpc's dominant ambiguity source is legitimate, not a bug.** Most of its `maybe`-tier findings under `packages/` carry genuine dynamic-import-taint evidence (SOURCES.md's already-documented "trust-killer" pattern) or test-only-reference evidence — this fix does not and should not eliminate those. Don't mistake a flat maybe-ratio for "the fix didn't work" — see phase 50's AC-4 note for the itemized real effect.
- `h3`'s single-package `src` scan (28 `maybe` findings, all trust-killer-pattern alive candidates) is a viable 3rd-repo *diversity* source for the corpus, but contributes **zero** new `dead` cases (its tests live outside `src/`, unlike hono/trpc). If corpus work wants a genuinely new 3rd repo (not just deeper trpc mining), h3 is alive-only; `zod` and (untried) `fastify` were dead ends / unexplored respectively.
- A background fork earlier this project sent a false self-report (see `[[fork-can-report-success-with-zero-tool-calls]]` memory, from a prior session) — unrelated to this session's work but worth remembering: always verify subagent completion claims against ground truth.
- `.cadence/mcp-trust.json` is deliberately untracked (repeated prior-session confirmation) — don't commit it.
- Two other top recommendations (`rec-20260701-012` competitor accuracy table, `rec-20260701-015` toolchain hygiene bundle) are `accepted`+milestoned but not yet exported/drafted — available as next work whenever, no urgency.

## Next action

**Action:** No urgent follow-up required — phase 50 is fully shipped, settled, and the loop is IDLE. The natural next step is resuming phase 49 (triage corpus growth) now that the blocker is cleared: start a fresh draft to mine `trpc/trpc`'s ~90 unexplored `maybe` findings (scan with `necro scan --json .` from the repo root — see Carry-forward gotchas above, NOT `--json packages`) for more hand-verifiable `dead` cases, then continue with the original T2–T4 (bench snapshot variance shape, N-run bench aggregation, regression floor re-derivation). Alternatively, triage `rec-20260701-012`/`015` (already accepted+milestoned) or another open recommendation — operator's call, nothing is blocking.

**Verify:** `cadence status` should show `loopPosition: IDLE`; `git log -1 --oneline` should show the workspaces-fix commit as HEAD once committed (uncommitted as of this handoff — see "State on handoff" diff --stat).

**If it fails:** If `cadence status` shows anything other than IDLE, or the workspaces.ts fix isn't present in `git diff`/working tree, something changed after this handoff was written — run `cadence resume` fresh and treat this doc's "State on handoff" section as stale rather than trusting these notes verbatim.
