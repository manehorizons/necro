---
cadence_handoff: 1
generated_at: 2026-07-17T23:41:54.159Z
label: phase-43-python-syntactic-axis-shipped
loop_position: IDLE
active_phase: 43
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 17f2868
git_ahead: 2
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-17 (phase-43-python-syntactic-axis-shipped)

## TL;DR for the next session
- Resumed from the `phase-40-mcp-hardening-shipped` handoff, which turned out stale — phase 41 (rec-010) had already shipped in a session that ended without writing a handoff. Cross-checked `cadence_status` against the replayed doc before trusting it (see `[[cadence-resume-stale-handoff-gap]]` in memory).
- Shipped two phases this session, both committed locally, **neither pushed**: phase 42 (`0ba24b8`, JS/JSX/MTS/CTS auto-include + a real JSX-parser bug fix) and phase 43 (`17f2868`, Python syntactic axis — complexity/duplication/hotspots, opt-in only).
- A Fable-model brainstorm produced the full Python rollout plan: `.cadence/intelligence/python-support-design.md` — 5 phases (A shipped, B–E queued). Key finding: the syntactic axis is a real "adapter seam," but the *reachability/dead-code* axis is not — it's `ts-morph`/TS-compiler-semantics end to end, with no Python equivalent, so Phases B–C are genuinely new engineering, not adapter registration.
- Mid-session detour into a **different repo** (`/home/thomas/projects/cadence`): found and fixed a real bug where 5 of 6 CADENCE verifier families silently fell back to `mock` when configured for `host-cli`. Fixed, PR'd (#223), CI green, **merged to cadence's `main`** — but not yet in a published npm release, so necro's own gates aren't benefiting yet.
- Nothing is blocked. Next action is either: push necro's 2 pending commits, start Python Phase B (module resolver), or pick up PHP (queued after Python per the user's original 3-part directive).

## State on handoff   ·  pre-filled — verify, don't retype

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 2 ahead / 0 behind origin
- HEAD `17f2868`
- Recent commits:
```
17f2868 feat(43): Python syntactic axis — complexity, duplication, hotspots
0ba24b8 feat(42): auto-include .js/.jsx/.mts/.cts by default; fix JSX mis-parse (rec-20260701-014)
6a8e28c feat(41): extract src/llm/ — shared client plumbing + structuredCall helper + usage reporting (rec-20260701-010)
3e62513 chore(cadence): stamp session handoff — phase-40-mcp-hardening-shipped
8d5708d feat(40): MCP hardening — progress notifications, target-relative config, tool docs (rec-20260701-009)
b5607e9 feat(39): coverage in CI + scheduled live-accuracy gate (rec-20260701-008)
ee9088d chore(cadence): stamp session handoff — phase-38-terminal-polish-shipped
caa4f26 feat(38): terminal polish — relative paths, TTY color, stderr progress, merged clone windows (rec-20260701-007)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 43 · tier (none)

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
- **Phase 42** (`0ba24b8`): `DEFAULT_CONFIG.include` widened to `.ts/.tsx/.js/.jsx/.mts/.cts`; found and fixed a pre-existing bug along the way — `getParser()` used the plain `typescript` tree-sitter grammar for every file, mis-parsing JSX in `.tsx`/`.jsx` as a TS type-assertion (`hasError: true`); now dispatches to the `tsx` grammar (already bundled, no new dependency). README/CHANGELOG updated. 508 tests green.
- **Python design doc** (`.cadence/intelligence/python-support-design.md`): Fable-model brainstorm, independently fact-checked (DEFAULT_CHECKS, TAINT_PATTERNS, publicApiIds all verified against real source). 5-phase plan, corpus-measurement plan (pip + httpie, precision ≥0.85/recall ≥0.5), 6 open questions for later phases.
- **Phase 43** (`17f2868`): Python syntactic axis. `parse.ts` grammar dispatch extended to `.py` (3rd cached parser: typescript/tsx/python); `ir.ts` maps Python control flow into the existing language-agnostic IR (`function_definition`/`lambda`, `elif_clause`/`if_clause`→branch, `for_in_clause`/`while_statement`→loop, `case_clause`→case, `except_clause`→catch, `conditional_expression`→ternary, `boolean_operator` and/or→boolean); `tokens.ts` normalizes Python literals. Discovery: `.pyi` skipped like `.d.ts`, `__pycache__`/`.venv`/`venv`/`.tox`/`.eggs` added to `SKIP_DIRS`. **Python stays opt-in** — `DEFAULT_CONFIG.include` was deliberately NOT touched (dead-code detection has no Python support yet; claiming default support would be premature). 527 tests green (19 new). Two real grammar-structure surprises caught and corrected mid-TDD (see gotchas below) rather than forced into wrong assertions.
- **Cadence host-cli fix** (separate repo, `/home/thomas/projects/cadence`): `HostCliSpecReviewVerifier`, `HostCliPlanReviewVerifier`, `HostCliCodeReviewVerifier`, `HostCliSecurityAuditVerifier`, `HostCliVerifier` added, mirroring the existing `HostCliPerTaskVerifier` pattern. TDD, full monorepo suite green (2828 tests). PR #223 merged to cadence `main` (squash `eecc525`) after a rebase to resolve a conflict with a concurrently-merged phase 190 PR (conflict was confined to derived `.cadence/STATE.md`/`state.json` bookkeeping, not real code). Worktree + feature branch cleaned up after merge.
- Memory updated: `necro-full-audit-2026-07`, new `cadence-resume-stale-handoff-gap`, new `cadence-host-cli-verifier-gap`.

## Carry-forward gotchas
- **necro is 2 commits ahead of origin/main, neither pushed** (`0ba24b8` phase 42, `17f2868` phase 43) — user explicitly chose "commit only" both times. Ask before pushing.
- **Python's `elif` does NOT nest progressively deeper like JS's `else if`.** Verified empirically (not assumed): JS's `if/else if/else if` chain produces depths `[0,1,2]` because the JS grammar nests each subsequent `if` inside the previous one's `alternative`. Python's grammar instead holds every `elif_clause` as a direct sibling child of the *same* `if_statement` — depths come out `[0,1,1]`. This is a correct reflection of the real AST, not a bug; if you're adding more Python control-flow mapping later, don't assume JS's nesting intuitions carry over — verify against the actual parse tree first (a throwaway probe script, not documentation) the way this session did twice (elif depth, then comprehension for/if depth — both wrong on first guess, both fixed by checking real output before locking the assertion).
- **A Python comprehension's `for`/`if` clauses are siblings, not nested** (both direct children of the comprehension node) — `[i for i in range(a) if i > 5]` has nesting depth 1, not 2. Same lesson as above.
- **ts-morph gracefully no-ops on `.py` files** — `buildSymbolGraph` treats them as zero-declaration source rather than throwing, confirmed via a direct test. This is *why* phase 43 could ship the syntactic axis without touching the reachability engine at all — dead-code detection just silently finds nothing for Python symbols today, no crash, no wrong answers, just no coverage yet.
- **Cadence fix is merged but not released.** `origin/main` in `/home/thomas/projects/cadence` has the host-cli fix (`eecc525`), but the last published `@manehorizons/cadence-core` on npm was `1.45.0` (pre-fix) as of this session. Don't assume necro's own `cadence spec approve`/`draft approve` gates are doing real host-cli verification until a new cadence release ships and necro's global `cadence` install is upgraded — check `cadence --version` and watch for the "falling back to mock provider" warning disappearing.
- The primary `/home/thomas/projects/cadence` checkout (not the now-deleted worktree) was left 1 commit behind `origin/main` with its own pre-existing uncommitted `.cadence/STATE.md`/`state.json`/`.claude/scheduled_tasks.lock` drift blocking a plain `git pull --ff-only`. Not touched (that's live session telemetry per cadence's own CLAUDE.md convention) — if you work in that repo next, reconcile it before pulling.
- `necro.config.json` at necro's own repo root is still empty/absent — necro doesn't dogfood Python scanning on itself (there's no Python in this repo anyway, so this is moot, just noting no self-scan signal exists for the new axis).

## Next action

**Action:** Ask the user which of three queued threads to pick up (don't assume): (a) push the 2 pending necro commits (`0ba24b8`, `17f2868`) to `origin/main`, (b) start Python Phase B — the module resolver (dotted-path↔file mapping, relative imports, `__init__.py` packages, src-layout; scope in `.cadence/intelligence/python-support-design.md` §4 "Phase B"), or (c) skip ahead to PHP support (task #3 in this session's task list — same brainstorm-with-Fable-then-plan approach used for Python, per the user's original 3-part directive; `tree-sitter-php.wasm` is already bundled, no new dependency). If starting Phase B: read `python-support-design.md` §4 Phase B's scope first, then run the same pipeline as phases 42/43 (`cadence recommendation promote`/`milestone propose`/`spec new` — or a plain `cadence spec new <phase> <num>` without `--from-rec` since Phase B isn't tied to an existing audit rec, matching how phase 43 was scoped).

**Verify:** After whichever action, `npm run build && npm run typecheck && npm test` should stay green; `cadence status` should show `loopPosition: IDLE` when done.

**If it fails:** If `cadence settle --auto` refuses on a pending AC, check whether every AC id appears in some task's `done:` field in the DRAFT — a missing tag has caused this before, not a real failure. If a Python grammar-structure assumption turns out wrong mid-TDD (very likely for Phase B's import/dotted-path logic — Python's `import`/`from...import` grammar has real edge cases), verify against the actual parse tree with a throwaway probe script before writing the assertion, the same way this session caught two wrong nesting-depth assumptions — don't guess and move on.
