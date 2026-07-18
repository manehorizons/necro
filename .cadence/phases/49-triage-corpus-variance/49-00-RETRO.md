# Retro

## Gate bypasses

- WARN test-coverage via --allow-missing-coverage: test-coverage gate bypassed via --allow-missing-coverage

## Rough tasks

- T1: BLOCKED — Blocked on a real necro engine bug found while sourcing new dead-positive cases: src/engine/workspaces.ts resolveWorkspaces has no dist->src fallback for monorepo-member entry resolution (unlike src/engine/prod-entries.ts resolveProdEntries, which existence-checks the manifest entry and falls back through mapDistToSrc -> conventional names -> scripts -> config). On an unbuilt monorepo checkout (fresh git clone, no `pnpm build`), every workspace member's resolved entry points at a nonexistent dist/ file, contributing nothing to reachability rooting and to ts-morph's cross-package path aliasing (packagePaths has the same bug, confirmed harmful there too via workspacePathsOptions in symbol-graph.ts). Repro: trpc/trpc (pinned SHA c7360d4, pnpm monorepo) scanned fresh gives ~100% `maybe` findings (3268/3268 via `packages` from repo root; 1999/4207 including non-maybe via `.`), same degenerate-scan signature as the known necro-self-scan-degenerate case. Opus-reviewed diagnosis confirmed correct; recommended fix is to have resolveWorkspaces call resolveProdEntries per member dir (reuse, not duplicate) and thread the discovered `files` list in. Filed as a new CADENCE recommendation to fix before resuming T1's trpc mining -- see recommendation ledger.
- T2: BLOCKED — Not independently blocked, but closing this unit alongside T1 rather than partially completing out of task order. Will resume with T1 once the workspaces.ts engine bug (see T1 notes) is fixed.
- T3: BLOCKED — Downstream of AC-1's grown corpus (T1) per this draft's task dependency chain. Blocked transitively on the same workspaces.ts engine bug.
- T4: BLOCKED — Downstream of T1/T2/T3. Blocked transitively on the same workspaces.ts engine bug.
