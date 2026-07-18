---
phase: 50-workspaces-entry-fallback
id: 50-00
tier: standard
status: PENDING
---

# 50-00 — workspaces.ts monorepo entry resolution: dist->src fallback

## Objective

Fix `src/engine/workspaces.ts`'s `resolveWorkspaces` so monorepo-member entry resolution gets the same existence-check + dist→src fallback + conventional-name fallback that `src/engine/prod-entries.ts`'s `resolveProdEntries` already applies for single-package scans, eliminating the near-100%-`maybe` degenerate scan on unbuilt monorepo checkouts (repro: `trpc/trpc` SHA `c7360d4` scanned fresh).

## Acceptance Criteria

### AC-1: Unbuilt monorepo member with a real source entry resolves via fallback, not a nonexistent dist path
Given a workspace member's `package.json` `main` points at a `dist/...` file that doesn't exist on disk, but the member has a conventionally-discoverable entry (e.g. `src/index.ts`) present
When `resolveWorkspaces` runs against that monorepo root
Then the member's contribution to both `entryFiles` and `packagePaths` resolves to the real source file (via the manifest-existence-check → `mapDistToSrc` → conventional-name fallback chain `resolveProdEntries` already has), not the nonexistent dist path

### AC-2: Built members and non-monorepo repos are unaffected (regression guard)
Given (a) a workspace member whose `dist/index.js` genuinely exists on disk, and (b) a non-monorepo repo with no `workspaces` field / `pnpm-workspace.yaml`
When `resolveWorkspaces` runs against each
Then (a) the built member still resolves via its manifest entry exactly as today, and (b) the non-monorepo repo's `resolveWorkspaces` call still returns `EMPTY` exactly as before

### AC-3: A member with no discoverable entry is skipped, not thrown
Given a workspace member whose manifest entry doesn't exist, has no matching tsconfig dist→src mapping, and no conventional entry file present
When `resolveWorkspaces` runs
Then that member contributes nothing to `entryFiles`/`packagePaths` and the call completes without throwing

### AC-4: The trpc/trpc repro no longer degenerates
Given a fresh, unbuilt checkout of `trpc/trpc` pinned at SHA `c7360d4eb3c89c336468809a293e5cda4b302d4b`
When `necro scan --json .` is run from the repo root against the fixed build
Then the findings under `packages/` produce a real, non-degenerate `certain`/`likely`/`maybe` split — substantially below the pre-fix 1999/4207 (~48%) all-`maybe` ratio — confirmed by a manual live check (not a unit-test fixture, since it depends on an external repo checkout)

## Tasks

### T1: Thread `files` into `resolveWorkspaces` and resolve member entries via `resolveProdEntries`
- files: `src/engine/model.ts`, `src/engine/workspaces.ts`
- action: pass the already-discovered `files` list into `resolveWorkspaces(root, files)` at its `model.ts` call site. Rewrite member-entry resolution in `workspaces.ts` to, for each member dir, filter `files` to that dir's prefix and call `resolveProdEntries(memberDir, memberFiles, { conventions: true })` instead of raw `manifestEntry()` string extraction. Build `entryFiles` as the union of all members' resolved entry sets. Build `packagePaths` preferring records with `source === "manifest" || "mapped"` over `"convention"`. Since this reuses `resolveProdEntries`'s `manifestEntries` (which already mines `pkg.bin`), the `bin`-coverage gap noted in the recommendation is closed for free — no separate task needed.
- verify: `npm run build` and a TS type-check pass clean; existing `test/workspaces.test.ts` happy-path cases (built entries present) still pass unmodified
- done: AC-1, AC-2

### T2: Add regression fixtures pinning the fallback chain
- files: `test/workspaces.test.ts`
- action: add fixtures — (A) unbuilt member with `main` pointing at a nonexistent `dist/index.js` but a real `src/index.ts` on disk, asserting resolution falls back to the real file; (B) member with its own `tsconfig.json` `outDir`/`rootDir` mapping, asserting `mapDistToSrc` resolves via that member's own tsconfig (not the monorepo root's); (C) regression guard — built member with `dist/index.js` actually present, still resolves via manifest as today; (D) member with no discoverable entry (nonexistent dist, no tsconfig mapping, no conventional file) — skipped, `resolveWorkspaces` completes without throwing; (E) non-monorepo repo (no `workspaces`/`pnpm-workspace.yaml`) — `resolveWorkspaces` still returns `EMPTY`
- verify: `npx vitest run test/workspaces.test.ts` — all new and existing cases pass
- done: AC-1, AC-2, AC-3

### T3: Live-verify the trpc/trpc repro is fixed
- files: none (manual verification against an external checkout; no source changes)
- action: rebuild (`npm run build`), scan a fresh unbuilt `trpc/trpc` checkout pinned at SHA `c7360d4eb3c89c336468809a293e5cda4b302d4b` with `necro scan --json .` from the repo root, and compare the `packages/`-scoped `maybe` ratio against the documented pre-fix baseline (1999/4207 total, all `packages/`-scoped findings were `maybe`)
- verify: the `packages/`-scoped `maybe` ratio drops substantially below the pre-fix ~48% (non-degenerate `certain`/`likely`/`maybe` split); record the new ratio in task notes so phase-49's eventual resumption has a fresh baseline
- done: AC-4

## Boundaries

- DO NOT change scan-from-subdirectory behavior (`necro scan --json packages`, i.e. `targetPath !== ` monorepo root) — `resolveWorkspaces` returning `EMPTY` when the workspace manifest isn't at `targetPath` is a separate, explicitly out-of-scope issue (documented in `rec-20260718-002`)
- DO NOT modify `resolveProdEntries`'s existing single-package resolution logic itself — this phase only adds a new caller (per-member), with zero behavior change for non-monorepo scans
- DO NOT resume phase 49 (`49-triage-corpus-variance`) corpus work in this phase — that resumes as its own draft once this fix lands
- DO NOT commit any trpc/hono clone artifacts, scratch scan JSON, or other verification byproducts from T3 — those stay in the scratchpad, not the repo
