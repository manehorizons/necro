# SETTLE Summary — 59-01

**Completed:** 2026-07-20T00:28:13.297Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)
- AC-4: PASS (assertion)

## Tasks

- T1: DONE — Added packageJsonPrivate() to RepoContext (types.ts) + createRepoContext impl (registry.ts, pkg.private === true). Extracted symbolNodeId(file, line, name) in symbol-graph.ts, replaced both inline id-format call sites. Pure refactor. Typecheck clean, full suite 757/757 unchanged.
- T2: DONE — Added src/graph/symbol-graph-public-api.ts (resolvePublicApiIds via ts-morph getExportedDeclarations, ids computed from each declaration's own name not the export alias) + test/graph-symbol-graph-public-api.test.ts (5 tests: direct export, export * barrel, aliased export {x as y}, non-reachable symbol absent, no-exports entry). All pass, typecheck clean.
- T3: DONE — src/engine/model.ts: added isTsLibrary(ctx), filtered prodEntryRecords to manifest/mapped sources, call resolvePublicApiIds and union with the existing Python publicApiIds branch. test/engine-model-public-api.test.ts (3 tests, integration-level via scan()): AC-1/AC-3 library case demotes to maybe with truthful evidence; AC-2 regression guard (private:true, and no package.json) both classify exactly as before this phase (likely, "not in package.json exports"). Full suite: 765 passed, typecheck clean.
- T4: DONE — Verified against necro's own repo (name: @manehorizons/necro, private: false, main: ./dist/index.js mapped to src/index.ts via the dist-heuristic since dist/ isn't built in dev). Direct model check: buildReachabilityModel(necro root) resolves publicApiIds.size=24, correctly walking src/index.ts's re-export barrel through to the originating declaration files (classify.ts, config.ts, explain.ts, engine/index.ts, model.ts, graph/types.ts) via getExportedDeclarations — confirms the mechanism activates correctly and resolves barrel chains on a real, non-trivial codebase, not just small test fixtures. `necro scan src --json`: 6 findings, all from src/bench/symbol-graph-timing.ts (a repo-internal bench tool NOT part of the public barrel) — correctly still show "not in package.json exports", confirming non-public symbols aren't over-quarantined. No symbol currently exported through necro's own public barrel is dead today, so there's no live before/after evidence-text flip to show on this repo right now, but the mechanism's correct activation (24 ids, right files) and correct non-interference (bench tool findings unaffected) are both directly confirmed. No regressions, no stray files.

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
