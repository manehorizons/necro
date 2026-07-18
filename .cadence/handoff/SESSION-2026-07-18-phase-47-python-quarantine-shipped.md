---
cadence_handoff: 1
generated_at: 2026-07-18T04:18:14.967Z
label: phase-47-python-quarantine-shipped
loop_position: IDLE
active_phase: 47-python-test-entries-and-library-quarantine
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 87e8ac3
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (phase-47-python-quarantine-shipped)

## TL;DR for the next session
- Resumed from the `phase-45-python-reachability-shipped` handoff (clean, no drift) and shipped two more Python phases per `.cadence/intelligence/python-support-design.md`: phase 46 (`40732a6`, entry-point resolution) and phase 47 (`87e8ac3`, pytest test-glob entries + library `publicApiIds` quarantine). Both committed and **pushed to origin/main** this session — `git_ahead`/`git_behind` are both 0.
- This closes design doc **§2.3 entirely**. Every mechanism it specified — pyproject/setup.cfg/setup.py entry points, `__main__`/conventions, pytest test-glob entries, library quarantine — is now shipped.
- **Next planned phase is Phase D**: the 40–60 case accuracy corpus (pip + httpie, pinned SHAs) with a precision ≥0.85 / recall ≥0.5 gate enforced in CI — the "measured" half of the rec-20260701-014 rollout. Phase E (ecosystem polish + flip `.py` default-on in discovery) follows after.
- Nothing is blocked. Full suite is 666/666 green as of phase 47; build/typecheck clean.
- Two operational notes from this session worth knowing before touching CADENCE MCP tools: (1) MCP trust grants are per-tool-name and version-bound — a CADENCE npm bump (1.45.0→1.46.0, mid-session) invalidated existing grants, requiring a one-time re-grant per tool; (2) the host-cli verifier-family fix (5 of 6 families that were silently mock-falling-back) is confirmed resolved and live as of 1.46.0, but `build-test-must-pass` is a *separate* gate that still reports "no test command configured" — don't conflate the two; keep verifying test runs manually (`npm test`) until/unless that gate gets its own config fix.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `87e8ac3`
- Recent commits:
```
87e8ac3 feat(47): Python pytest test-glob entries + library publicApiIds quarantine (rec-20260701-014)
40732a6 feat(46): Python entry-point resolution — pyproject/setup.cfg/setup.py scripts, dunder-main, conventions (rec-20260701-014)
e63411d chore(cadence): stamp session handoff — phase-45-python-reachability-shipped
8a57f40 feat(45): Python symbol graph + reachability integration (rec-20260701-014, Phase C)
c587cc2 feat(44): Python module resolver — dotted-path/file mapping (rec-20260701-014, Phase B)
d24347d chore(cadence): stamp session handoff — phase-43-python-syntactic-axis-shipped
17f2868 feat(43): Python syntactic axis — complexity, duplication, hotspots
0ba24b8 feat(42): auto-include .js/.jsx/.mts/.cts by default; fix JSX mis-parse (rec-20260701-014)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 47-python-test-entries-and-library-quarantine · tier (none)

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
- Phase 46 (`40732a6`): `src/engine/python-entries.ts` — `pyproject.toml` `[project.scripts]`/`[gui-scripts]`/`[entry-points.*]` (hand-rolled scanner, no new dependency), `setup.cfg`/`setup.py` `console_scripts` (INI scan + tree-sitter literal-dict extraction; dynamic setups skipped honestly), `__main__.py`/`if __name__ == "__main__":` modules, conventional filenames (`main.py`/`app.py`/`manage.py`/`wsgi.py`/`asgi.py` as prod entries, `conftest.py` as a test entry). Wired into `buildReachabilityModel`. 31 new tests (606 → 637).
- Phase 47 (`87e8ac3`): `src/plugins/pytest/` (new `FrameworkPlugin`, detects pytest via `hasDep`/`hasConfig`/`pyprojectHas`, contributes `test_*.py`/`*_test.py`/`tests/**` as test-kind entry globs), `src/plugins/python-manifest.ts` (new — `RepoContext` Python-manifest awareness: `hasDep` now also reads `pyproject.toml` `[project.dependencies]`/`requirements.txt`; new `pyprojectHas(header)` section check). Added a language-neutral fix so test-entry files root their own exported top-level symbols (mirrors the existing prod-entry-file pattern — benefits JS test files too, not just Python). Wired `classify()`'s `publicApiIds` parameter for the first time ever (any language): a `pyproject.toml` with both `[project]` and `[build-system]` is a distributable library, and its exported Python symbols now quarantine to `maybe` tier. 29 new tests (637 → 666).
- Both phases went through the full spec→draft→build→settle CADENCE loop; all 14 ACs (7+7) passed via `cadence settle --auto`.
- Updated 3 memory files: `necro-full-audit-2026-07` (rec-20260701-014 progress), `cadence-host-cli-verifier-gap` (confirmed resolved), and a new `cadence-mcp-trust-per-tool` (operational note on trust-grant scoping).

## Carry-forward gotchas
- **`.cadence/mcp-trust.json` is deliberately untracked** (confirmed with the user both times it came up) — it's machine-local, version-bound MCP trust-grant state, not project logic. It currently holds grants for `cadence_spec_approve` and `cadence_draft_approve` on this machine (re-granted once already this session after a CADENCE version bump invalidated the originals). Don't try to commit it without asking first — this was an explicit, repeated user choice, not an oversight.
- **Phase 45's `test_` "exported" tier-bump exemption in `buildPythonSymbolGraph` is still in place, unremoved, by design** (phase 47's Constraints) — it's the fallback for pytest-convention files when no `pytest` `FrameworkPlugin` detects (e.g. no `pytest` dependency declared anywhere in the repo). Don't "clean it up" as now-redundant; it isn't, for that case.
- **The general TS-side `publicApiIds` wiring gap is still open and untouched** — `classify()`'s `isPublicApi` branch existed before this session but had *zero* callers for any language until phase 47 wired it for Python only. TS/JS repos still see the exact same (always-empty) behavior as before. This has no tracked recommendation; if picked up later, don't confuse it with `rec-20260701-013` ("Library export surface"), which is about exposing *necro's own* library API (package.json exports map for `scan()`/`buildReachabilityModel()`/`explain`), a completely different concern — this session mis-attributed the two once before catching it.
- **CADENCE's `build-test-must-pass` gate still reports "no test command configured"** on both phase 46 and 47's settles, even after the host-cli verifier-family fix landed (1.46.0) — that fix was for the 6 *verifier-family* providers (spec-review, deep-verify, per-task-verify, code-review, plan-review, security-audit), a separate mechanism from this specific gate. `cadence config get verification.testCommand` reports "Unknown key" in 1.46.0's schema, so don't try to fix this by setting that key — the correct fix (if any) is unclear; just keep manually running `npm test`/`npm run typecheck` before trusting a green settle, same as prior sessions.
- Both phase SPECs (46, 47) explicitly scoped what's deferred: phase 46 deferred test-glob entries + library quarantine to 47 (now done); phase 47's own Constraints list what's still out of scope for the whole Python rollout (namespace packages, uv-workspace monorepos, Python `fix --write`/auto-removal — all explicitly post-v1 per the design doc §4).
- Phase numbering convention is still mixed between `<num>-<slug>` and bare `<num>` across `.cadence/phases/` (44, 46, 47 used slugs; 45 was bare) — not a bug, just don't assume a fixed pattern when looking things up.

## Next action

**Action:** Start Phase D of `.cadence/intelligence/python-support-design.md` §4 — the accuracy corpus + CI gate. Scope: build a 40–60-case corpus on pinned pip + httpie checkouts (provenance + rationale recorded, mirroring how the existing TS/JS triage corpus in `test/fixtures/triage-realrepo/` is structured — see `[[triage-realrepo-accuracy-baseline]]` memory for that precedent), an integrity test for the corpus itself, and a deterministic precision/recall gate wired into normal CI (not just a manual bench script) — target precision ≥0.85, recall ≥0.5, per the design doc's own floors. This is explicitly "where the real iteration happens" per §4 — budget for tuning the resolver/taint-pattern/exemption list against real findings, not just a first-pass implementation. Start with `cadence progress` to confirm the next phase number CADENCE assigns (don't hand-pick it), then `cadence spec new <n> 00 --title "..."` and read design doc §3 (Corpus-slice measurement plan) and §4's Phase D bullet in full before scoping ACs — the same discipline phases 44-47 used.

**Verify:** After scoping, `npm run build && npm run typecheck && npm test` should stay green through each task; the new CI gate itself should be demonstrated failing on a deliberately-bad precision/recall number in at least one test, not just passing on the real corpus (prove the gate actually gates).

**If it fails:** If `cadence settle --auto` refuses on a pending AC, check whether every AC id appears inside an actual `test(...)` title string (not a `describe(...)` block or comment) — this bit phase 45 twice (AC-7, AC-9) and is now a known pattern (`[[cadence-settle-ac-test-gate]]` memory). If corpus curation research would benefit from an isolated deep-dive (e.g. picking real dead-code cases from pip/httpie and writing rationale), consider forking or spawning a research agent for that legwork rather than doing it all inline — this phase is described as the heaviest remaining one in the plan.
