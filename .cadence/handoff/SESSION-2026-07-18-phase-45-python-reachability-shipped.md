---
cadence_handoff: 1
generated_at: 2026-07-18T00:56:04.484Z
label: phase-45-python-reachability-shipped
loop_position: IDLE
active_phase: 45
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 8a57f40
git_ahead: 2
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (phase-45-python-reachability-shipped)

## TL;DR for the next session
- Resumed from the `phase-43-python-syntactic-axis-shipped` handoff (clean, no drift), pushed necro's 3 pending commits to `origin/main`, then shipped two more Python phases per the design doc `.cadence/intelligence/python-support-design.md`: phase 44 (`c587cc2`, Phase B — module resolver) and phase 45 (`8a57f40`, Phase C — symbol graph + reachability integration). Both committed locally, **neither pushed**.
- necro's Python support now does real dead-code detection: `necro scan`/`explain` produce verdicts for Python symbols via a hand-rolled `buildPythonSymbolGraph` (no ts-morph equivalent exists for Python) merged into `buildReachabilityModel` alongside the TS graph. Python findings are hard-capped at `likely` tier (never `certain`/auto-fix-eligible) until Phase D's accuracy corpus justifies lifting it; `fix`/`verify-removal` explicitly refuse Python symbols.
- **Deliberately split entry-point auto-detection out of Phase C** (pyproject `[project.scripts]`, `__main__.py`, `manage.py`-style conventions, test-glob auto-detection) to keep phase 45 CADENCE-sized — per the design doc's own contingency plan for splitting Phase C if it strained the grain. Phase 45 relies entirely on the existing generic `NecroConfig.entries` glob escape hatch for roots. **This auto-detection work is the natural next phase** before Phase D (the accuracy corpus needs real repos scanned end-to-end, which needs entry points to actually work without hand-written config).
- Found and logged (not fixed — out of scope for phase 44's boundaries) `rec-20260718-001`: `src/discover.ts`'s `SKIP_DIRS` blanket-skips any directory literally named `build` (added for JS/TS build output), which silently drops pip's real `pip/_internal/operations/build/` subpackage from discovery. Not blocking (99.4% resolution rate already clears the 95% floor without it), but worth fixing before Phase D's corpus work touches pip again.
- Nothing is blocked. 606/606 tests green, typecheck clean, zero TS/JS behavior change across both phases.
- User explicitly asked: after this handoff, resume in a **new session** and continue the Python rollout (entry-point detection next, per the design doc's phase order, unless the user redirects).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 2 ahead / 0 behind origin
- HEAD `8a57f40`
- Recent commits:
```
8a57f40 feat(45): Python symbol graph + reachability integration (rec-20260701-014, Phase C)
c587cc2 feat(44): Python module resolver — dotted-path/file mapping (rec-20260701-014, Phase B)
d24347d chore(cadence): stamp session handoff — phase-43-python-syntactic-axis-shipped
17f2868 feat(43): Python syntactic axis — complexity, duplication, hotspots
0ba24b8 feat(42): auto-include .js/.jsx/.mts/.cts by default; fix JSX mis-parse (rec-20260701-014)
6a8e28c feat(41): extract src/llm/ — shared client plumbing + structuredCall helper + usage reporting (rec-20260701-010)
3e62513 chore(cadence): stamp session handoff — phase-40-mcp-hardening-shipped
8d5708d feat(40): MCP hardening — progress notifications, target-relative config, tool docs (rec-20260701-009)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 7 ++++---
 2 files changed, 6 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 45 · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260701-011 — Grow triage corpus (dead-positives) + track run-to-run variance (candidate/ready-for-milestone)
  - rec-20260701-012 — Competitor head-to-head accuracy table (knip, ts-prune) (candidate/ready-for-milestone)
  - rec-20260701-015 — Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate (candidate/ready-for-milestone)
  - rec-20260701-013 — Library export surface (exports map + type declarations) (candidate/needs-decision)
  - rec-20260701-016 — Incremental symbol-graph cache for large repos (candidate/needs-evidence)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `test/fixtures/triage-realrepo/` — affected by rec-20260701-011 Grow triage corpus (dead-positives) + track run-to-run variance
  - `src/bench/snapshot.ts` — affected by rec-20260701-011 Grow triage corpus (dead-positives) + track run-to-run variance
  - `src/bench/` — affected by rec-20260701-012 Competitor head-to-head accuracy table (knip, ts-prune)
  - `website/src/content/docs/guide/accuracy.mdx` — affected by rec-20260701-012 Competitor head-to-head accuracy table (knip, ts-prune)
  - `.github/workflows/` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `.github/dependabot.yml` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `package.json` — affected by rec-20260701-015 Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate
  - `tsconfig.json` — affected by rec-20260701-013 Library export surface (exports map + type declarations)
  - `src/graph/symbol-graph.ts` — affected by rec-20260701-016 Incremental symbol-graph cache for large repos

## What landed this session
- Pushed 3 pending commits from the prior session (phases 42, 43, handoff stamp) to `origin/main`.
- Phase 44 (`c587cc2`): `src/graph/python/{import-parser,module-resolver,resolve-import}.ts` — dotted-path/file mapping, absolute/relative/aliased import resolution, src-layout detection. Measured 99.4% (pip) / 100.0% (httpie) local-import resolution rate against real pinned checkouts (`src/bench/python-import-resolution-rate.ts`), clearing the design doc's ≥95% floor. 36 new tests.
- Phase 45 (`8a57f40`): `src/graph/python/symbol-graph.ts` (`buildPythonSymbolGraph` — module-level declaration collection, `__all__`/dunder/pytest exported-semantics exemptions, recursive reference-edge resolution chasing `__init__.py` re-export barrels, star-import + content-based Python taint patterns), `src/engine/model.ts` (language partition + graph merge), `src/analyze/classify.ts` (Python tier cap), `src/engine/verify-removal.ts` (Python refusal). 43 new/extended tests, full existing suite (606 tests) stayed green throughout.
- Recorded `rec-20260718-001` (SKIP_DIRS/`build`-directory collision, found while measuring phase 44's resolution rate against pip).
- Updated memory `necro-full-audit-2026-07.md` with the Phase B/C shipped status.

## Carry-forward gotchas
- **necro is 2 commits ahead of `origin/main`, neither pushed** (`c587cc2` phase 44, `8a57f40` phase 45) — user chose "commit only" this session, same as prior sessions. Ask before pushing (and this handoff-stamp commit will make it 3 ahead once committed in step 6).
- **Phase 45's reference-edge resolution is a deliberate simplification**, documented in `45-00-SPEC.md` Constraints and in code comments: only single-hop attribute access resolves (`m.attr`); a bare unaliased `import a.b.c` followed by deep-chain usage (`a.b.c.foo()`) is NOT resolved (aliased `import a.b.c as m` + `m.foo()` IS resolved fine, and so is `from a.b import c` + `c.foo()`). This is a conservative-recall gap, not a bug — don't "fix" it without re-reading the SPEC's Constraints section first, it was a considered tradeoff.
- **`resolveFromBase` was exported from `src/graph/python/resolve-import.ts`** (phase 44's module) during phase 45 — an additive, low-risk visibility change (function unchanged, just no longer private) needed so phase 45's binding-table builder could distinguish a whole-module import binding from a package-fallback symbol binding. If touching Phase B code, know that Phase C now depends on this export.
- **Phase C intentionally has no Python entry-point auto-detection.** Any Python fixture/test/real-repo scan needs an explicit `necro.config.json` `entries: [...]` glob to seed prod roots, or `necro scan`/`fix` will report `refused-no-entries` (the fail-closed `entryResolution.collapsed` guard) — this is expected today, not a bug, until the entry-point-detection phase ships.
- **`rec-20260718-001`** (SKIP_DIRS silently drops any dir named `build`, confirmed on pip's `pip/_internal/operations/build/`) is logged but unfixed. It's a pre-existing bug (not introduced this session) that also silently affects any TS/JS repo with a legitimately-named `build/` source directory (not just build-output dirs) — worth scoping as its own small fix independent of the Python rollout, whenever picked up.
- **CADENCE's `build-test-must-pass` gate is not enforcing** (`no test command configured` — known gap, see `[[cadence-host-cli-verifier-gap]]` memory) — settle relies on manually-run `npm test`/`npm run typecheck` being actually green before calling settle, which this session did both times (606/606, typecheck clean) but the gate itself can't verify it. Don't trust a green settle alone as proof tests passed — check the transcript or rerun.
- Phase numbering in this project has drifted between `<num>-<slug>` (e.g. `24-monorepo-fp`) and bare `<num>` (phases 39-43) conventions historically; phases 44 and 45 both used `<num>-<slug>` (`44-python-module-resolver`, plain `45`) — mixed, not a bug, just don't assume a fixed convention when looking up `.cadence/phases/`.

## Next action

**Action:** The user asked to "keep going" with the Python rollout after this handoff. Start the next phase: **Python entry-point resolution** — the piece deliberately deferred out of phase 45 (see Carry-forward gotchas). Scope per `.cadence/intelligence/python-support-design.md` §2.3: pyproject.toml `[project.scripts]`/`[project.gui-scripts]`/`[project.entry-points.*]` (needs a minimal TOML reader — `smol-toml` or hand-rolled table scan, first new-dependency decision of the Python rollout), `setup.py`/`setup.cfg` `console_scripts` (parse literal cases statically via tree-sitter, skip dynamic setups honestly), `__main__.py` files and `if __name__ == "__main__":` modules, conventional names (`main.py`, `app.py`, `manage.py`, `wsgi.py`, `asgi.py`, `conftest.py`), test-glob conventions (`test_*.py`/`*_test.py`/`tests/`), and the library-quarantine semantics (`publicApiIds`-style quarantine for installable-library public symbols — note `publicApiIds` exists in `classify.ts` but isn't wired into `scan()`'s live call today, so wiring it up for Python is new plumbing, not just reuse). Start with `cadence spec new 46 00 --title "..."` (or check `cadence progress` for the CLI's own suggested next phase number first — phase numbers aren't hand-picked, cadence derives them). Read `python-support-design.md` §2.3 in full before scoping the SPEC's ACs, the way phases 44/45 did.

**Verify:** After scoping, `npm run build && npm run typecheck && npm test` should stay green through each task; `cadence status` should show `loopPosition: IDLE` when the phase settles.

**If it fails:** If `cadence settle --auto` refuses on a pending AC, check whether every AC id appears in a test's `test(...)` title (not just a `describe(...)` block or a code comment) — phase 45 hit this twice for AC-7 and AC-9, both fixed by moving the `AC-N:` tag into the actual `test(...)` string. If the phase feels too large once scoped (entry-point resolution touches TOML parsing + tree-sitter setup.py parsing + conventions + test globs + library quarantine — genuinely more surface than it looks), split it the same way phase 45 was split out of the original "Phase C" — smaller, still-shippable units beat one oversized draft.
