# SETTLE Summary — 53-01

**Completed:** 2026-07-19T00:24:41.482Z

## Acceptance Criteria

- AC-1: FAIL (assertion) — hono corpus SHA (61d6d66d27911001b9b4d57ab93139f9ad61384b) unreachable upstream (confirmed via full multi-branch clone + GitHub API 422) — live competitor run currently covers 44/63 cases (trpc only), not all 63. Mechanism is correct and fully tested (pure scoring logic + orchestrator handle the full 63-case shape); the gap is an external blocker, not a bug. Documented in SOURCES.md and the Accuracy page's Partial corpus note. User explicitly chose ship-partial-and-document over blocking.
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)

## Tasks

- T1: DONE_WITH_CONCERNS — src/bench/competitors/checkout.ts + cli-checkout.ts (npm run bench:checkout) ship and work correctly — idempotent full-clone+checkout, per-repo failure isolation. Concern (not a script bug): the pinned hono SHA (61d6d66d...) is no longer reachable in the real honojs/hono repo (confirmed via full multi-branch clone + GitHub API 422). trpc checks out fine. Documented in SOURCES.md's new "Open gap (phase 53)" note.
- T2: DONE — knip@6.27.0 + ts-prune@0.10.3 pinned as devDependencies. src/bench/competitors/{knip-runner,ts-prune-runner,tool-paths}.ts invoke the exact pinned bin via necro's own node_modules/.bin (never npx-inside-checkout, which could silently resolve a corpus repo's own copy). Verified live against a real trpc checkout: knip found 735 issues, ts-prune 305 lines.
- T3: DONE — src/bench/competitors/score.ts — predictCases (file+symbol exact match) + scorePredictions (identical TP/FP/FN/precision/recall/F1 derivation to runEval, including the 0/0 edge-case handling). Pure, reuses snapshot.ts's f1(). Discovered during live validation: 28/30 corpus "dead" cases are non-exported local declarations, structurally invisible to knip/ts-prune (they only see exports) — real finding, documented on the Accuracy page and in SOURCES.md, not a scoring bug.
- T4: DONE_WITH_CONCERNS — src/bench/competitors/run.ts + cli-competitors.ts (npm run bench:competitors) wire checkout resolution → runners → scorer, scoring each repo's predictions separately before summing (avoids cross-repo filename collisions). Skipped repos are reported in skippedRepos, never silently dropped. Concern: AC-1 asked for all 63 cases scored; live run currently covers only 44 (trpc) because of the T1 hono-checkout gap — user explicitly chose "ship trpc-only live numbers + document gap" over blocking. Real live output committed to bench/competitors.json and merged into bench/results.json.
- T5: DONE — BenchResults gained an optional `competitors` field (type-only import, no runtime cycle despite score.ts importing f1 from snapshot.ts) + withCompetitors() merge helper. Accuracy page ("Head-to-head — knip, ts-prune" section) renders the live table sourced from bench/results.json, with a prominent caution Aside on the export-only scope gap and a conditional "Partial corpus" note. Also fixed a pre-existing bug found while building this: all 3 tables on the page (including the 2 pre-existing ones) were rendering as literal pipe-text, not real HTML tables — Starlight's MDX pipeline doesn't run GFM table transform inside this page's mix of JSX/markdown; converted all 3 to raw HTML <table> markup. Verified with a real `astro build` (Node 22 via nvm) — output inspected, tables + Asides render correctly with live numbers.
- T6: DONE — test/bench-competitors-score.test.ts (14 tests, all titled AC-1/AC-3) covers deriveCorpusRepos, predictCases, scorePredictions (incl. 0/0 edge cases), and parseKnipJson/parseTsPruneOutput against committed fixtures (test/fixtures/bench-competitors/) that are trimmed excerpts of real captured tool output. Zero network/live-tool calls. Full suite: 118 files / 729 tests pass, tsc --noEmit clean.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
