---
phase: 24-monorepo-fp
id: 24-01
tier: complex
---

# 24-01 — Monorepo workspace FP reduction: cross-package alias edges + member rooting

> Follow-on to phase 23 (split out with evidence). The valuable monorepo false
> positive is the **cross-package** case: a symbol consumed by another workspace
> package via its `@scope/pkg` alias reads dead because ts-morph can't resolve
> the alias, so `findReferencesAsNodes()` never sees the cross-package use. The
> fix must **preserve genuine dead code** (a member export that nothing imports
> stays dead).

## Objective

Eliminate necro's monorepo false-"dead" findings by (a) resolving workspace
package aliases so cross-package references connect in the symbol graph, and (b)
rooting each workspace member's entry files — validated on a SHA-pinned real
monorepo slice, while genuinely-unused member exports are still reported and
single-package repos are unchanged.

## Key mechanic (from phase-23 evidence)

`buildSymbolGraph` builds edges from `decl.nameNode.findReferencesAsNodes()`
(the TS language service). A cross-package import `import { x } from "@ws/core"`
is unresolved (no `node_modules` symlink, no `paths`), so the reference is never
found → no edge → `x` reads dead. Feeding the ts-morph `Project` a `paths` map
(`@ws/core` → the member's entry file) makes the existing reference walk span
packages **with correct provenance** — and `trulyUnused` stays dead because
nothing references it. No synthetic edges or separate import parsing needed.

## Acceptance Criteria

### AC-1: Cross-package-consumed symbols are alive; unused member exports stay dead
Given a workspace repo slice where `@scope/app` imports and uses symbol `X` from
`@scope/core` via the package alias, and `@scope/core` also exports an
unreferenced symbol `Y`
When `scan` runs
Then `X` is alive (the cross-package reference resolves) and `Y` is still
reported dead (genuine dead code preserved).

### AC-2: Executed member entry symbols are alive
Given a workspace member whose own entry file executes a symbol at module top
level (e.g. `main()` in `packages/app/src/index.ts`)
When `scan` resolves prod entries
Then the member's entry files are prod roots and that executed symbol is alive
(it reads dead today because only the *root* package.json is rooted).

### AC-3: No regression on single-package / non-workspace repos and existing corpora
Given a repo with no workspaces declared
When `scan` runs
Then symbol-graph construction and prod-entry resolution are unchanged from
current behavior, the triage/dup/Next.js corpora hold, and the full suite stays
green.

## Tasks

### T1: Workspace discovery + package map
- files: `src/engine/workspaces.ts` (new), `test/workspaces.test.ts`
- action: detect workspace layout — `workspaces` field (npm/yarn) in the root
  `package.json` and `pnpm-workspace.yaml` (pnpm) — enumerate member dirs from
  their globs, and build a `Map<pkgName, entryFileAbs>` from each member's
  `package.json` `name` + `main`/`module`/`exports`. Defensive against
  malformed/missing manifests (reuse the `try/catch → []` discipline).
- verify: unit test builds the expected map for a 2-member pnpm and a yarn slice.
- done: AC-1, AC-2

### T2: Resolve aliases in the symbol graph (cross-package edges)
- files: `src/graph/symbol-graph.ts`, `src/engine/index.ts`
- action: thread the workspace package map into `buildSymbolGraph` as a new
  `BuildOptions.packagePaths`; when present, set the ts-morph `Project`
  `compilerOptions.paths`/`baseUrl` so `@scope/pkg` resolves to the member entry
  file. Existing reference walk then produces the cross-package edges.
- verify: AC-1 test — `X` alive, `Y` dead on the slice.
- done: AC-1

### T3: Member entry-file rooting
- files: `src/engine/prod-entries.ts`, `src/engine/index.ts`
- action: when workspaces are declared, add each member's entry files (from the
  T1 map) to `prodEntries` (file-path seeding, matching root-package semantics).
  No-op when no workspaces are declared.
- verify: AC-2 test — executed member entry symbol alive.
- done: AC-2

### T4: SHA-pinned monorepo corpus + regression guard
- files: `test/fixtures/fp-realrepo/monorepo-*/`,
  `test/fixtures/fp-realrepo/SOURCES.md`, `test/fp-realrepo.test.ts`
- action: vendor a SHA-pinned slice from a real pnpm/yarn monorepo (e.g. `trpc`)
  exercising a cross-package consumed symbol + a genuinely-dead member export;
  assert AC-1/AC-2 on it and add the AC-3 regression assertion.
- verify: full suite green (≥332); single-package behavior unchanged.
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT export-root all member public APIs (that would suppress genuine dead
  code like `Y`/`trulyUnused`) — aliveness must come from a real cross-package
  reference or an executed entry.
- DO NOT change symbol-graph or prod-entry behavior when no workspaces are
  declared (single-package repos identical to today).
- DO NOT add framework plugins (phase 23) or competitor tables here.
- DO NOT require an API key or network at test time — the corpus is vendored and
  deterministic.

## Open questions (resolve in build)

- Does feeding ts-morph `paths` reliably resolve `@scope/pkg` **and**
  `@scope/pkg/subpath` for the common `exports` shapes? A short spike in T2 (real
  slice) confirms before committing the mechanism; the synthetic-edge fallback
  (resolve imports manually → `SyntheticEdge`) is the contingency if `paths`
  resolution proves unreliable.
