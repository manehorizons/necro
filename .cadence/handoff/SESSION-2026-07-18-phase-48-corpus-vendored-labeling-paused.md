---
cadence_handoff: 1
generated_at: 2026-07-18T04:58:17.108Z
label: phase-48-corpus-vendored-labeling-paused
loop_position: BUILD
active_phase: 48-python-accuracy-corpus-ci-gate
active_draft: 48-00
tier: complex
git_branch: main
git_dirty: true
git_head: 50efcd0
git_ahead: 1
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (phase-48-corpus-vendored-labeling-paused)

## TL;DR for the next session
- Phase 48 (`.cadence/intelligence/python-support-design.md` §4 Phase D — the corpus + CI accuracy gate) is in BUILD, tier `complex`, SPEC and DRAFT both approved with 8 ACs / 8 tasks (`T1`-`T8`).
- T1 (vendor pip + httpie fixture slices) is functionally done but **not yet recorded** via `cadence build task T1 --status=DONE` — do that first, or re-verify then record.
- A real accuracy gap was discovered mid-T1 and is **unresolved by design** — paused for a human decision, not a blocker bug: pip's `pyproject.toml` has both `[project]`+`[build-system]`, so phase 47's library quarantine pushes 939/974 of pip's findings to `maybe` tier (only 35 `likely`) because exported-detection is per-symbol-name only, not path-aware — `_internal`'s own leading-underscore *directory* name (pip's real privacy signal) isn't recognized. httpie (no `pyproject.toml`) is unaffected: 84 `likely`/22 `maybe`, healthy split.
- Two options were on the table when the session ended (user chose to stop and decide next time, not "Other" text answered — this is a genuinely open choice): (a) label the corpus first with real cases from both repos and measure actual precision/recall before deciding whether the quarantine gap actually breaches the ≥0.5 recall floor, or (b) add a path-based privacy exemption to `classify()`'s exported-detection now (leading-underscore directory component ⇒ non-exported) before labeling. Option (a) was the recommended default.
- Nothing is broken; full suite has not been re-run since T1's changes (they're test-fixture-only, shouldn't affect it, but hasn't been confirmed this session).
- T2 (labeling `cases.json`) through T8 are not started.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 1 ahead / 0 behind origin
- HEAD `50efcd0`
- Recent commits:
```
50efcd0 chore(cadence): stamp session handoff — phase-47-python-quarantine-shipped
87e8ac3 feat(47): Python pytest test-glob entries + library publicApiIds quarantine (rec-20260701-014)
40732a6 feat(46): Python entry-point resolution — pyproject/setup.cfg/setup.py scripts, dunder-main, conventions (rec-20260701-014)
e63411d chore(cadence): stamp session handoff — phase-45-python-reachability-shipped
8a57f40 feat(45): Python symbol graph + reachability integration (rec-20260701-014, Phase C)
c587cc2 feat(44): Python module resolver — dotted-path/file mapping (rec-20260701-014, Phase B)
d24347d chore(cadence): stamp session handoff — phase-43-python-syntactic-axis-shipped
17f2868 feat(43): Python syntactic axis — complexity, duplication, hotspots
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 14 +++++++-------
 .cadence/state.json | 23 ++++++++++++++---------
 2 files changed, 21 insertions(+), 16 deletions(-)
```
- Loop: BUILD · phase 48-python-accuracy-corpus-ci-gate · tier complex

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
- Resumed cleanly from the phase-47 handoff (no drift); ran `cadence progress` → CADENCE assigned phase **48** (`48-python-accuracy-corpus-ci-gate`).
- Wrote and approved `48-00-SPEC.md` (8 ACs) after a research fork confirmed concrete facts: `scan()`/`ClassifiedFinding`/`SymbolNode` shapes (`src/engine/index.ts`, `src/analyze/classify.ts`), the triage corpus's `EvalCase`/`EvalMetrics` shape (`src/triage/eval.ts`) is reusable for its scoring math but not its LLM-call scoring path, the phase-44 import-resolution-rate harness (`src/bench/python-import-resolution-rate.ts`) exists but was deliberately never wired into CI or given vendored fixtures, and phase 44's own DRAFT boundary explicitly reserved vendoring pip/httpie for this phase.
- Wrote and approved `48-00-DRAFT.md` (tier `complex`, matching phase 45's precedent as the other heaviest Python phase) with 8 tasks T1-T8.
- T1: cloned pinned tags locally (not committed as full checkouts) — pip `26.1.2` @ `31d7d168953668aad85154d6121879d07fbeac27`, httpie `3.2.4` @ `2105caa49bae87c5809c274e407619a0de2639d1` — confirmed via `git ls-remote --tags | sort -V` (a first attempt grabbed pip's wrong/oldest tag `9.0.3` from an unsorted `tail`; caught and redone).
- User confirmed vendoring whole packages (not per-case snippet extraction) for guaranteed reachability closure: `test/fixtures/python-realrepo/pip/pip/_internal/**` (148 files) + `pip/pyproject.toml`, and `test/fixtures/python-realrepo/httpie/httpie/**` (78 files) + `setup.cfg`/`setup.py`. Wrote `SOURCES.md` with provenance/license/rationale, mirroring `test/fixtures/triage-realrepo/SOURCES.md`'s style.
- Added a minimal `necro.config.json` (`{"include": ["**/*.py"]}`) in each fixture root — `.py` isn't default-included yet (that's Phase E). Necro's config loads from `process.cwd()`, not the scan target path (`src/config.ts:97`), so scans must `cd` into the fixture root first.
- Hit and fixed a layout bug: pip's `[project.scripts]` entry (`pip._internal.cli.main:main`) is a dotted path relative to a top-level `pip` package directory — my first copy flattened `_internal` directly under the fixture root, which broke that resolution (only the "convention" fallback fired). Renested as `pip/pip/_internal/...` to match the real package layout; re-scan then resolved the entry via `source: "pyproject-scripts"` as expected.
- Verified both slices scan cleanly end-to-end via the built CLI (`npm run build && node dist/cli.js scan .` from within each fixture dir): pip → 974 findings (35 `dead/likely`, 939 `dead/maybe`); httpie → 106 findings (84 `dead/likely`, 22 `dead/maybe`). Diagnostics show real entry resolution (not zero/degenerate) for both.

## Carry-forward gotchas
- **Uncommitted, untracked work not shown in the pre-filled diff-stat above** (that block only covers tracked-file diffs): `test/fixtures/python-realrepo/` (the entire vendored corpus — pip + httpie slices, `SOURCES.md`, two `necro.config.json` files) and `.cadence/phases/48-python-accuracy-corpus-ci-gate/` (SPEC + DRAFT) are both new and untracked. Nothing was committed this session — decide commit timing/granularity next session (e.g. one commit for the vendored fixtures + SOURCES.md, separate from the eventual T2-T8 code commit).
- `.cadence/mcp-trust.json` is still deliberately untracked (per repeated prior-session confirmation — see `[[cadence-mcp-trust-per-tool]]` memory). Don't try to commit it.
- The `necro.config.json` files added to the fixture roots are a real, permanent part of the corpus (needed for every future `necro scan`/test run against these fixtures) — not a scratch artifact to clean up.
- The pip fixture's on-disk layout is deliberately `test/fixtures/python-realrepo/pip/pip/_internal/**` (an outer `pip/` fixture-root dir wrapping an inner `pip/` package dir) — this double-`pip` nesting looks like a mistake but is load-bearing: pip's `[project.scripts]` entry (`pip._internal.cli.main:main`) is a dotted path that requires the real package-name wrapper to resolve via `pyproject-scripts`. Do not "simplify" this nesting away.
- Scans against these fixtures must run with CWD inside the fixture root (`cd test/fixtures/python-realrepo/pip && node <repo>/dist/cli.js scan .`) — `loadConfig` reads `necro.config.json` from `process.cwd()`, not the scan target argument (`src/config.ts:97`). The eventual T3/T5/T6 test files will need to invoke `scan()` (or `discoverFiles`/`loadConfig`) with an explicit target/cwd rather than relying on the test runner's own CWD.
- The library-quarantine/recall tension (TL;DR) is the single open decision blocking T2. Whichever option is picked, re-run both scans and eyeball the tier breakdown again before locking in case labels — a resolver/exemption change would shift which findings land at `likely` vs `maybe` and could invalidate cases already labeled against the old behavior.
- Pinned SHAs are recorded in `SOURCES.md` — don't re-clone at a different tag without updating that file; the local clones themselves live only in the scratchpad dir (`/tmp/claude-1000/.../scratchpad/realrepo-src/`), not the repo, and may not survive to the next session.

## Next action

**Action:** Decide the library-quarantine/recall handling (TL;DR) — recommended default is to proceed with T2 first (seed ~40-60 candidate cases from a prototype scan of both vendored fixtures cross-checked against `vulture`, hand-verify against the real pip/httpie checkouts, write `test/fixtures/python-realrepo/cases.json`), including deliberately labeling some `dead` cases that land in pip's quarantined-`maybe` bucket, then compute actual precision/recall (once T4's eval module exists) before deciding whether the path-based exemption fix is actually necessary to hit the ≥0.5 recall floor. Then record T1 as DONE (`cadence build task T1 --status=DONE`, or `--status=DONE_WITH_CONCERNS` noting the quarantine tension) and continue to T2.

**Verify:** `necro scan` (rebuilt via `npm run build`) against both fixture roots (from within each dir) still shows the same tier breakdown recorded above (pip 974 findings/35 likely/939 maybe; httpie 106 findings/84 likely/22 maybe) before trusting any new case labels against it.

**If it fails:** If the tier breakdown has changed from what's recorded above (e.g. because of an interim code change), don't trust old assumptions about which repo/subtree is "easy" vs "hard" to label — re-derive the breakdown fresh before seeding T2 candidates.
