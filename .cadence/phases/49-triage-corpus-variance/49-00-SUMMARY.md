# SETTLE Summary — 49-00

**Completed:** 2026-07-18T18:09:59.539Z

## Acceptance Criteria

- AC-1: FAIL (assertion) — Blocked by a real necro engine bug (workspaces.ts entry resolution has no dist->src fallback for monorepo members, unlike prod-entries.ts) discovered while sourcing new dead-positive cases from trpc/trpc. Fresh unbuilt monorepo checkouts scan as ~100% maybe (degenerate), making hand-labeling untrustworthy. Filed as a new recommendation to fix before resuming.
- AC-2: FAIL (assertion) — Not attempted -- closing this unit alongside AC-1 rather than partially completing out of the drafted task order (T2/T3/T4 downstream of T1 per this draft).
- AC-3: FAIL (assertion) — Downstream of AC-1/AC-2, blocked transitively on the same engine bug.

## Tasks

- T1: BLOCKED — Blocked on a real necro engine bug found while sourcing new dead-positive cases: src/engine/workspaces.ts resolveWorkspaces has no dist->src fallback for monorepo-member entry resolution (unlike src/engine/prod-entries.ts resolveProdEntries, which existence-checks the manifest entry and falls back through mapDistToSrc -> conventional names -> scripts -> config). On an unbuilt monorepo checkout (fresh git clone, no `pnpm build`), every workspace member's resolved entry points at a nonexistent dist/ file, contributing nothing to reachability rooting and to ts-morph's cross-package path aliasing (packagePaths has the same bug, confirmed harmful there too via workspacePathsOptions in symbol-graph.ts). Repro: trpc/trpc (pinned SHA c7360d4, pnpm monorepo) scanned fresh gives ~100% `maybe` findings (3268/3268 via `packages` from repo root; 1999/4207 including non-maybe via `.`), same degenerate-scan signature as the known necro-self-scan-degenerate case. Opus-reviewed diagnosis confirmed correct; recommended fix is to have resolveWorkspaces call resolveProdEntries per member dir (reuse, not duplicate) and thread the discovered `files` list in. Filed as a new CADENCE recommendation to fix before resuming T1's trpc mining -- see recommendation ledger.
- T2: BLOCKED — Not independently blocked, but closing this unit alongside T1 rather than partially completing out of task order. Will resume with T1 once the workspaces.ts engine bug (see T1 notes) is fixed.
- T3: BLOCKED — Downstream of AC-1's grown corpus (T1) per this draft's task dependency chain. Blocked transitively on the same workspaces.ts engine bug.
- T4: BLOCKED — Downstream of T1/T2/T3. Blocked transitively on the same workspaces.ts engine bug.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: skipped — bypassed via --allow-missing-coverage
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Gate bypasses

- WARN test-coverage via --allow-missing-coverage: test-coverage gate bypassed via --allow-missing-coverage

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
