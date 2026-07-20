---
phase: 59-ts-export-quarantine
id: 59-01
tier: standard
status: PENDING
---

# 59-01 — TS/JS export quarantine + truthful evidence

## Objective

Correctly compute `publicApiIds` for TS/JS library packages — resolving package.json's manifest entry exports through barrel re-export chains — so `classify()`'s existing, already-wired quarantine mechanism (proven on the Python side, phase 45) demotes exported public-API symbols to `maybe` with truthful "in package.json exports" evidence, instead of every TS finding today getting the fabricated "not in package.json exports" line.

## Acceptance Criteria

### AC-1: TS/JS library packages get a non-empty publicApiIds set
Given a scan target with a `package.json` that has a `name` field and `private` is not `true`
When `buildReachabilityModel` runs
Then `publicApiIds` contains the node id of every symbol reachable via `getExportedDeclarations()` from each manifest/mapped entry file (package.json's `main`/`module`/`bin`/`exports`, existence-checked and dist→src mapped exactly as `resolveProdEntries` already does), including symbols reached only through barrel re-export chains (`export * from`, `export { x } from`)

### AC-2: Non-library TS/JS packages still get an empty set — regression guard
Given a scan target with `private: true` in `package.json`, or no `package.json` at all
When `buildReachabilityModel` runs
Then `publicApiIds` is empty for the TS/JS graph exactly as before this phase — no behavior change for app-shaped repos

### AC-3: Public-API symbols demote to maybe with truthful evidence
Given a TS symbol whose id is in the now-correctly-populated `publicApiIds`
When `classify()` runs (unmodified by this phase — `isPublicApi`/`deadTier`/`deadEvidence` already consult `publicApiIds` correctly)
Then the finding's tier is `maybe` (never `certain`, never auto-fix-eligible) and its evidence reads "in package.json exports — external consumers invisible", not the previous "not in package.json exports"

### AC-4: necro's own self-scan reflects the fix
Given necro's own `package.json` (`name: "@manehorizons/necro"`, no `private` field, real `exports`/`main`/`bin` fields)
When `necro scan` runs against this repo
Then every symbol exported from the resolved manifest/mapped entry surface (including through `src/index.ts`'s barrel, per the phase-55 library export surface) is quarantined to `maybe`, addressing the TS side of the "necro self-scan is degenerate" gap

## Tasks

### T1: Shared plumbing — package.json `private` on RepoContext + a shared symbol-id helper
- files: `src/plugins/types.ts`, `src/plugins/registry.ts`, `src/graph/symbol-graph.ts`
- action: Add `packageJsonPrivate(): boolean` to the `RepoContext` interface (`types.ts`) and implement it in `createRepoContext` (`registry.ts`) as `pkg.private === true`, alongside the existing `packageJsonHas`/`pyprojectHas`. In `symbol-graph.ts`, extract the inlined `` `${file}:${line}:${name}` `` id format (currently constructed twice — once for node ids, once for `toId`) into an exported `export function symbolNodeId(file: string, line: number, name: string): string`, and use it at both existing call sites. Pure refactor — byte-identical ids, no behavior change to `buildSymbolGraph`.
- verify: `npx vitest run` — every existing symbol-graph/graph-symbol-graph-cache/discover test passes unchanged (proves the id refactor is behavior-preserving)
- done: AC-1

### T2: `resolvePublicApiIds` — exported-declaration resolution through barrel chains
- files: `src/graph/symbol-graph-public-api.ts` (new), `test/graph-symbol-graph-public-api.test.ts`
- action: Add `export function resolvePublicApiIds(entryFiles: string[], allFilePaths: string[]): Set<string>`. Build a `ts-morph` `Project` over `allFilePaths` with the same options `buildSymbolGraph` uses (`skipAddingFilesFromTsConfig: true`, `allowJs: true`). For each `entryFiles` source file, call `sourceFile.getExportedDeclarations()` — this resolves `export * from`/`export { x } from` barrel chains via the TS compiler, per the Constraints. For each resolved declaration: skip it if its own source file isn't in `allFilePaths` (defensive — stay inside the tracked file set); extract its own declaration-site name node the same way `collectDeclarations` does per kind (`getNameNode()` on functions/classes/interfaces/type aliases/enums/variable declarations) — **use the declaration's own name, not the `getExportedDeclarations()` map key**, since the map key can be an alias (`export { foo as bar }`) and graph node ids are keyed on `foo`'s own declared name, not `bar`. Compute `symbolNodeId(file, line, name)` from T1 and add to the result set. Skip declaration shapes with no extractable name node (e.g. anonymous default-export expressions) rather than throwing.
- verify: `npx vitest run test/graph-symbol-graph-public-api.test.ts` — fixture cases: (a) symbol directly exported from the entry file, (b) `export * from './sub.js'` barrel — sub's symbol resolves, (c) `export { x as y } from './sub.js'` — resolves to `x`'s own id, not `y`, (d) a symbol in a file NOT reachable from any entry file is absent from the result, (e) an entry file with no exports returns an empty set
- done: AC-1

### T3: Wire into `buildReachabilityModel` with the library-detection gate
- files: `src/engine/model.ts`, `test/engine-model-public-api.test.ts` (new)
- action: Add `isTsLibrary(ctx: RepoContext): boolean` mirroring `isPythonLibrary` — `ctx.packageJsonHas("name") && !ctx.packageJsonPrivate()`. After `resolveProdEntries` runs, filter `prodEntryRecords` to `source === "manifest" || source === "mapped"` for the manifest-entry file set. When `isTsLibrary(ctx)` is true and that set is non-empty, call `resolvePublicApiIds(manifestEntryFiles, tsFiles)` (T2) and union the result into `publicApiIds` alongside the existing Python branch (a repo could in principle have both). When not a library, or no manifest/mapped entries resolved, the TS branch contributes nothing — `publicApiIds` stays exactly what the Python branch alone produces (empty for non-Python-library repos), satisfying AC-2.
- verify: `npx vitest run test/engine-model-public-api.test.ts` — fixture repos (tmpdir, package.json + src/index.ts barrel) covering: AC-1 (library package, symbol exported only through the barrel with 0 in-repo refs → `classify()` returns it tier `maybe` with "in package.json exports — external consumers invisible"), AC-2 (`private: true` → same symbol classifies exactly as it did before this phase — `likely`, "not in package.json exports"), AC-2 variant (no `package.json` at all → same as above)
- done: AC-1, AC-2, AC-3

### T4: Verify against necro's own self-scan
- files: none (manual run; results recorded in this task's completion notes)
- action: Run `npx tsx src/cli.ts scan .` against necro's own repo. Identify a real symbol exported only through `src/index.ts`'s barrel (phase 55's library export surface) with 0 in-repo static references, and confirm its evidence now reads "in package.json exports — external consumers invisible" with tier `maybe` — where before this phase (empty `publicApiIds` for TS) it would have read the fabricated "not in package.json exports".
- verify: before/after evidence text for the identified symbol recorded in `--notes` on task completion
- done: AC-4

## Boundaries

- DO NOT modify `classify.ts` (`deadTier`, `deadEvidence`, `isPublicApi` consumption) — it already correctly consumes `publicApiIds`; this phase only fixes what populates that set for TS/JS.
- DO NOT modify the Python `isPythonLibrary`/`publicApiIds` branch in `model.ts` — this phase adds a parallel TS/JS path alongside it, unioning results, not replacing anything.
- DO NOT hand-roll a barrel/re-export AST walk — use `SourceFile.getExportedDeclarations()` per the Constraints.
- DO NOT change `resolveProdEntries`'s own behavior or its `EntrySource` values — T3 only *filters* its existing output (`manifest`/`mapped`), it doesn't alter entry resolution itself.
- DO NOT touch the `pluginProdEntryFiles`-based exported-symbol *rooting* mechanism (the separate `for (const node of graph.nodes) if (node.exported && pluginProdEntryFiles.has(node.file)) prodEntries.add(node.id)` loop) — that's reachability seeding, a different mechanism from `publicApiIds` quarantine, and out of scope for this rec.
