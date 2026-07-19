---
cadence_handoff: 1
generated_at: 2026-07-19T03:18:49.262Z
label: phase-55-library-exports-shipped
loop_position: IDLE
active_phase: 55-library-export-surface
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: e6f99a9
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (phase-55-library-exports-shipped)

## TL;DR for the next session
- Phase 54 (toolchain hygiene: Biome, Dependabot, CI Node/OS matrix, necro-scan self-scan gate) and phase 55 (library export surface) both shipped, settled, and pushed to `origin/main` this session.
- Cut and published `@manehorizons/necro@1.3.0` to npm (JS/JSX extension coverage + JSX mis-parse fix from an earlier phase, plus this session's baseline-portability bugfix). First tag attempt failed CI on a flaky test timeout — fixed, retagged, republished successfully.
- **v1.3.0 does NOT include phase 55's new library entry point** — `package.json`'s version is still `1.3.0` as of this handoff even though the library-export commit (`e6f99a9`) is on `main`. Cutting a v1.4.0 release for it is an open, undecided next step.
- Loop is IDLE, no active draft, no blockers.
- Top-ranked unstarted recommendations (see CADENCE context below): `rec-20260701-016` (incremental symbol-graph cache, needs-evidence) and `rec-20260718-001` (SKIP_DIRS silently skips any dir literally named `build`, needs-evidence).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `e6f99a9`
- Recent commits:
```
e6f99a9 feat(55): library export surface — exports map + type declarations (rec-20260701-013)
05ef48f fix(test): raise timeout for cli-baseline's two-invocation tests
6ef2365 chore: cut v1.3.0 — version bump, CHANGELOG finalized
5e83c3a feat(54): toolchain hygiene bundle — Biome, Dependabot, CI matrix, self-scan gate (rec-20260701-015)
76f8377 chore(cadence): stamp session handoff — competitor-accuracy-shipped
64c7ae2 feat(53): knip/ts-prune competitor accuracy head-to-head (rec-20260701-012)
e412ebc chore(cadence): stamp session handoff — host-cli-and-gate-rederivation
7c5d99f feat(52): re-derive triage gates via live host-cli run; fix bench snapshot partial-corpus overwrite
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 2 +-
 .cadence/state.json | 4 ++--
 2 files changed, 3 insertions(+), 3 deletions(-)
```
- Loop: IDLE · phase 55-library-export-surface · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260701-016 — Incremental symbol-graph cache for large repos (candidate/needs-evidence)
  - rec-20260718-001 — SKIP_DIRS silently skips any directory literally named 'build' (candidate/needs-evidence)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `src/graph/symbol-graph.ts` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos
  - `src/bench/` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos
  - `src/discover.ts` — affected by rec-20260718-001 SKIP_DIRS silently skips any directory literally named 'build'

## What landed this session
- **Phase 54** (`rec-20260701-015`): Biome lint/format (`biome.json`, `npm run lint`, CI step), `.github/dependabot.yml`, CI matrix (Node 20/22/24 × ubuntu/macos, `fail-fast: false`), `necro-scan.yml`'s `fail-on` flipped `"" → "high"` via a `necro.config.json` entries seed + a committed `src/.necro-baseline.json`.
- Found and fixed a real necro bug along the way: `src/baseline.ts`'s `findingKey`/`complexityKey` keyed on the raw absolute-path symbol id, so a baseline committed on one machine would never match on a different CI checkout path — silently defeating the whole gate on the first PR. Fixed to key on paths relative to the scan root; added portability regression tests.
- Cut and published **v1.3.0**: CHANGELOG finalized, `package.json`/`package-lock.json` bumped, tagged, pushed. First tag attempt's release workflow failed at the `Test` step (a pre-existing `cli-baseline.test.ts` test that spawns two child CLI processes timed out at vitest's 5s default — the new 6-way CI matrix's resource contention pushed it over); fixed by bumping that test's timeout to 15s, moved the tag to the fix commit, republished successfully. Nothing was ever published from the failed run (the guard worked as designed).
- **Phase 55** (`rec-20260701-013`): promoted → milestone proposed → draft scaffolded → had a fresh Opus-model agent independently review the draft (not a rubber stamp — it found a real build-breaking blocker: `src/version.ts`'s static `import pkg from "../package.json"` resolves outside `rootDir: "src"` and breaks `tsc`'s declaration emit with `TS6059`; plus real refinements: tighten the exports-map test, exclude `src/bench` from the lib build, use `NodeNext` module resolution). Folded all of it into the draft, got approval, built: `src/index.ts` barrel, `version.ts`'s `createRequire` fix (verified `VERSION`'s observable value is unchanged), `tsconfig.build.json`, `package.json` `main`/`types`/`exports` wiring, `test/library-exports.test.ts`.
- During T5 (the round-trip test), caught a second real gap myself: the test imported `dist/index.js` by a relative path, which completely bypasses the `exports` map — a deliberately corrupted `exports["."].import` path still passed. Fixed to resolve through the bare specifier `@manehorizons/necro` (self-referenced via this repo's own `package.json`) instead; re-verified the same sabotage now fails cleanly, reverted.
- All commits pushed to `origin/main` (`5e83c3a`, `6ef2365`, `05ef48f`, `e6f99a9`).

## Carry-forward gotchas
- **v1.3.0 on npm does not include phase 55's library export surface** — `main`/`types`/`exports`/`src/index.ts` shipped in commit `e6f99a9` on `main` but no release has been cut for it. The next publish would be `v1.4.0` (an `### Added` per this project's own CHANGELOG/semver convention — a new importable library entry point is genuinely user-visible), whenever that's decided. Don't assume npm consumers can `import` from the package yet.
- **The CI matrix (Node 20/22/24 × ubuntu/macos, 6 jobs) increases resource contention on GitHub Actions runners.** This already caused one release-blocking flake this session (a test spawning 2 child CLI processes timed out at vitest's 5s default). Any future test that shells out more than once per test should get a generous explicit timeout, not the default.
- `test/library-exports.test.ts` writes its scratch dir (`.tmp-lib-check-*/`) **inside the repo root**, not the OS tmpdir — required so Node/tsc's package self-reference resolution can walk up and find this repo's own `package.json`. This is intentional (gitignored, cleaned up in `afterEach`), not a leak — don't "fix" it by moving it to `os.tmpdir()`, that would break the test's whole point.
- `tsconfig.build.json`'s `include: ["src"]` ships a full per-module `dist/` mirror (~177 files — engine/graph/report/etc, but not `bench/`) even though only `dist/index.d.ts` is the documented contract. This is intentional per the rec's own framing ("tsc emit alongside the esbuild bundle," not a rolled-up single file) and isn't a semver/surface risk — the `exports` map only exposes `"."`, so Node's package encapsulation blocks any deep import — but it is real tarball bloat if anyone wants to trim it further later.
- `.cadence/mcp-trust.json` stays untracked — don't commit it (excluded from every commit this session).
- No merge/rebase in progress.

## Next action

No single forced next step — loop is IDLE with no active draft, and there are two live, independent decisions rather than one obvious command.

**Action:** Ask the user which to do first: (a) cut a `v1.4.0` npm release for phase 55's library export surface (CHANGELOG needs a new `### Added` entry, `npm version 1.4.0 --no-git-tag-version`, tag + push — same runbook as v1.3.0 this session), or (b) run `cadence recommend` to confirm/pick the next phase from `rec-20260701-016` (incremental symbol-graph cache) or `rec-20260718-001` (SKIP_DIRS build-dir bug) — both currently `needs-evidence`, so expect a research/scoping step before either becomes `ready-for-milestone`.
**Verify:** n/a — this is a decision point, not a command to run blind.
**If it fails:** n/a.
