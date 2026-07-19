---
cadence_handoff: 1
generated_at: 2026-07-19T00:33:15.562Z
label: competitor-accuracy-shipped
loop_position: IDLE
active_phase: 53-competitor-accuracy-table
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 64c7ae2
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (competitor-accuracy-shipped)

## TL;DR for the next session
- Phase 53 (knip/ts-prune competitor accuracy head-to-head, rec-20260701-012) shipped, settled, committed (`64c7ae2`), and **pushed to origin/main** this session.
- Real, live-measured numbers are on the Accuracy docs page: Necro 100%/80%/0.89 (precision/recall/F1) vs knip 0%/0%/0.00 vs ts-prune 100%/8%/0.15 — with two honest, prominently-documented caveats (not swept under the rug): (1) knip/ts-prune only see **exported** declarations, and 93% of this corpus's dead cases are non-exported locals — structurally invisible to them, caps their recall ceiling at ~7% regardless of tool quality; (2) the comparison currently covers only 44/63 cases (trpc only) because the corpus's pinned `hono` commit no longer exists upstream.
- Settled with **AC-1 = fail** (honest — mechanism is correct/tested, but the 44/63 partial live coverage is real), AC-2 and AC-3 pass.
- Also fixed a pre-existing bug found along the way: all 3 tables on the Accuracy page (2 of which predate this session) were rendering as literal pipe-text, not real HTML tables — converted to raw `<table>` markup.
- Loop is IDLE, no active draft. Next candidate from `cadence recommend`: **rec-20260701-015** (toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate) — was the #2 pick alongside this session's rec, now #1 since 012 is done.
- No blockers for picking up new work; the hono corpus gap is a documented open item, not something blocking other phases.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `64c7ae2`
- Recent commits:
```
64c7ae2 feat(53): knip/ts-prune competitor accuracy head-to-head (rec-20260701-012)
e412ebc chore(cadence): stamp session handoff — host-cli-and-gate-rederivation
7c5d99f feat(52): re-derive triage gates via live host-cli run; fix bench snapshot partial-corpus overwrite
b42ef2d feat(51): host-cli LLM backend for triage/refactor clients (rec-20260718-003)
1a9dfce chore(cadence): stamp session handoff — pickup-host-cli-rec
351a21a chore(cadence): settle 49-01 (AC-2 pass, AC-1/AC-3 blocked)
7a470ff feat(49): bench snapshot carries multi-run variance; runBench triages 3x by default (T2-T3)
61e6b24 feat(49): grow trpc dead-case corpus 15→30 via testOnlyEvidence signal (T1, blocked on repo diversity)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 2 +-
 .cadence/state.json | 4 ++--
 2 files changed, 3 insertions(+), 3 deletions(-)
```
- Loop: IDLE · phase 53-competitor-accuracy-table · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260701-015 — Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate (accepted/ready-for-milestone)
  - rec-20260701-013 — Library export surface (exports map + type declarations) (candidate/needs-decision)
  - rec-20260701-016 — Incremental symbol-graph cache for large repos (candidate/needs-evidence)
  - rec-20260718-001 — SKIP_DIRS silently skips any directory literally named 'build' (candidate/needs-evidence)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `.github/workflows/` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `.github/dependabot.yml` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `package.json` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `tsconfig.json` — affected by rec-20260701-013 Library export surface (exports map + type declarations)
  - `src/graph/symbol-graph.ts` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos
  - `src/bench/` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos
  - `src/discover.ts` — affected by rec-20260718-001 SKIP_DIRS silently skips any directory literally named 'build'

## What landed this session
- Resumed from prior session's handoff (phases 51/52 shipped), ran `cadence recommend`, picked rec-20260701-012 with user confirmation, drafted phase 53, approved into BUILD.
- Built `src/bench/competitors/` — `repos.ts` (derives corpus repos from case provenance), `checkout.ts` + `cli-checkout.ts` (`npm run bench:checkout`, idempotent full-clone+checkout), `tool-paths.ts` (resolves necro's own pinned knip/ts-prune bin, never `npx`-inside-a-checkout), `knip-runner.ts` / `ts-prune-runner.ts` (subprocess wrappers + pure output parsers), `score.ts` (pure file+symbol matching + precision/recall/F1, identical math to `runEval`), `run.ts` + `cli-competitors.ts` (`npm run bench:competitors`, orchestrates + merges into `bench/results.json`).
- Added `knip@6.27.0` and `ts-prune@0.10.3` as devDependencies.
- Cloned `trpc/trpc@c7360d4` for real into `.bench-cache/` (gitignored), filtered `pnpm install` to the 5 corpus-relevant packages, ran both tools live, scored all 44 trpc cases.
- Extended `src/bench/snapshot.ts`'s `BenchResults` with an optional `competitors` field (type-only import to avoid a runtime cycle with `score.ts`, which imports `f1` from the same module).
- Added the "Head-to-head — knip, ts-prune" section to `website/src/content/docs/guide/accuracy.mdx`, with `<Aside>` components for the scope-gap caution and partial-corpus note (learned the hard way that markdown `:::directive` syntax doesn't parse inside `{jsExpression && (...)}` blocks in MDX — Starlight's `Aside` component is the correct tool for conditional callouts).
- Fixed the pre-existing broken-table bug (all 3 tables, not just the new one) by switching to raw HTML `<table>` markup — confirmed via a real `astro build` under Node 22 (via `nvm use 22`; local default is Node 20, which the website's `engines` field requires ≥22.12.0).
- Wrote `test/bench-competitors-score.test.ts` (14 tests, offline, fixtures under `test/fixtures/bench-competitors/` are trimmed excerpts of real captured knip/ts-prune output).
- Documented the hono-SHA gap in `test/fixtures/triage-realrepo/SOURCES.md` (new "Open gap (phase 53)" note, same style as the existing phase-49 3rd-repo gap note).
- Settled phase 53-01, committed (`64c7ae2`), and pushed to `origin/main` on explicit user request.

## Carry-forward gotchas
- **The pinned hono corpus SHA (`61d6d66d27911001b9b4d57ab93139f9ad61384b`) is permanently gone upstream** — confirmed via a full clone of every branch in `honojs/hono` (2867 commits) and via the GitHub commits API (422 "No commit found"). This is NOT the same as the phase-49 "3rd repo" gap — it's the *original 2-repo* corpus's own hono half becoming unreachable for live checkouts. The corpus's frozen JSON data (`test/fixtures/triage-realrepo/cases.json`) is unaffected (doesn't need a live checkout), but anything needing an actual hono checkout (competitor bench, or any future live-tool comparison) can only cover trpc (44/63 cases) until this is resolved. Re-pinning to a different hono commit would mean re-capturing and re-labeling all 19 hono cases from scratch — not a quick SHA swap. Don't retry the same commit expecting a different result.
- **`.bench-cache/` (gitignored) currently has a real `trpc__trpc` checkout with a filtered `pnpm install`** (5 packages: client, react-query, server, tests, upgrade) already done — re-running `npm run bench:competitors` won't need to re-clone or re-install, it's idempotent. `.bench-cache/honojs__hono` also exists but is stuck at the repo's HEAD (not the pinned SHA) since the checkout script correctly refuses to force a mismatched SHA — this is expected, not a bug to "fix" by deleting and retrying.
- **Astro/Starlight's MDX pipeline does not render GFM markdown tables inside `.mdx` files that also use JSX** (confirmed: even the 2 pre-existing tables on this same page were affected, not just new content) — use raw HTML `<table>` markup instead. Root cause wasn't fully diagnosed (Starlight's own gfm wiring looked fine on inspection); the HTML-table workaround is reliable and now the established pattern on this page.
- **MDX doesn't parse markdown `:::directive[...]` admonition syntax inside a `{jsCondition && (<>...</>)}` block** — it fails at the acorn/JS-expression parse step, not at render time (a hard build error, not a silent miss). Use Starlight's `<Aside type="..." title="...">` component instead for anything that needs to be conditionally rendered.
- **The website needs Node ≥22.12.0**; the sandbox's default is Node 20.20.2. Use `source ~/.nvm/nvm.sh && nvm use 22` before `cd website && npm run build` — Node 22.22.3 is already installed via nvm, no fresh install needed.
- `.cadence/mcp-trust.json` stays untracked — don't commit it (already excluded from this session's commit).
- `bench/competitors.json` is a standalone companion artifact (same data as `bench/results.json`'s `.competitors` field, just easier to inspect alone) — intentionally committed, not redundant scratch to clean up.

## Next action

No single forced next step — loop is IDLE with no active draft. The natural continuation is **rec-20260701-015** (toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate), now the top-ranked accepted/ready-for-milestone recommendation.

**Action:** Run `cadence recommend` (or `cadence_recommend` via MCP) to re-rank and confirm with the user which recommendation to pick up next.
**Verify:** A new phase draft exists scoped to whichever recommendation is chosen; `cadence status` shows it active.
**If it fails:** If the toolchain bundle doesn't appeal, the hono corpus gap (see Carry-forward gotchas) is a real, well-documented open item, but has no obvious fix in hand — don't start it without a concrete new angle (e.g. a fork/mirror of hono that still has the old commit). Otherwise fall back to whatever `cadence recommend` ranks next among rec-20260701-013 (library export surface) or rec-20260701-016 (incremental symbol-graph cache).
