# SETTLE Summary — 57-01

**Completed:** 2026-07-19T15:00:53.490Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)

## Tasks

- T1: DONE — Added src/bench/symbol-graph-timing.ts (measureSymbolGraphTiming + CLI, mirrors python-import-resolution-rate.ts) and test/bench-symbol-graph-timing.test.ts (5 tests). Full suite: 741 passed, typecheck clean.
- T2: DONE — Ran src/bench/symbol-graph-timing.ts against both already-checked-out .bench-cache repos: honojs/hono@cadff88b — 378 files, 1387 decls, 14165 edges, discover 15ms, build 4367ms (~3.15ms/decl). trpc/trpc@c7360d4eb — 973 files, 4210 decls, 12973 edges, discover 32ms, build 44661ms (~10.6ms/decl). Discovery is negligible in both cases (<35ms); essentially all cost is in buildSymbolGraph's per-declaration findReferencesAsNodes walk. Per-decl cost roughly tripled going from hono to trpc (~2.6x the files), i.e. cost does not scale linearly with repo size — this substantiates rec-20260701-016's premise that reference-walking is the dominant, super-linear cost on larger repos, and that it's worth persisting/caching. Neither repo reaches the rec's stated "5k-file monorepo" scale, so the real-world cost there is plausibly much worse than these numbers suggest. Recommend promoting rec-20260701-016 to ready-for-milestone on the strength of this evidence.

## Gate provenance

- draft-read: skipped — not in the active tier × profile gate set
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
