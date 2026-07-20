---
phase: 60-ts-symbol-file-edges
id: 60-01
tier: standard
status: PENDING
---

# 60-01 — TS plane: symbol→file edges for module-level refs and side-effect imports

## Objective

Port the Python plane's symbol→file edge pattern (`symbol-graph.ts:160-163`) to the TS plane so module-level top-level references and side-effect-only imports propagate reachability instead of going invisible.

## Acceptance Criteria

### AC-1: module top-level reference stays reachable through a non-entry imported file
Given an entry file that imports and calls a symbol from moduleA, and moduleA's top-level code (not inside any declaration) references a symbol declared in moduleB
When reachability is computed from the entry
Then moduleB's referenced symbol is reachable (not a false-dead finding)

### AC-2: bare side-effect import keeps the imported module's executed contents alive
Given an entry file with a bare `import "./register.js"` (no import clause) whose target module's top-level code references a symbol declared elsewhere
When reachability is computed from the entry
Then the referenced symbol is reachable via the side-effect import alone, with no named binding required

## Tasks

### T1: symbol→file edges so a reached symbol marks its own file reached
- files: `src/graph/symbol-graph.ts`
- action: In `buildSymbolGraph`, after collecting `nodes`, push `{ from: node.id, to: node.file, kind: "prod" }` and `{ from: node.id, to: node.file, kind: "test" }` for every node — mirrors `python/symbol-graph.ts:160-163`. This lets the BFS treat "any symbol in file F reached" as "file F's module-level code (and thus its top-level references, already attributed `from: file` by `enclosingFrom`'s fallback) reached" too.
- verify: `npm test -- symbol-graph.test.ts`
- done: AC-1

### T2: explicit edges for bare side-effect imports
- files: `src/graph/symbol-graph.ts`
- action: Walk each source file's `ImportDeclaration`s; for one with no import clause (no default/namespace/named bindings — a bare `import "./x.js"`), resolve the target via `getModuleSpecifierSourceFile()` and push an edge `{ from: refFile, to: targetFile, kind }` (kind by `isTestFile(refFile)`), so the target file's pseudo-node is reached even though nothing named is bound.
- verify: `npm test -- symbol-graph.test.ts`
- done: AC-2

### T3: fixture tests for both ACs
- files: `test/symbol-graph.test.ts`
- action: Add a case titled to reference AC-1 with entry→moduleA (top-level call of a moduleB symbol) proving moduleB's symbol is reachable; add a case titled to reference AC-2 with a bare side-effect import fixture proving the imported module's top-level-referenced symbol is reachable. Confirm both are red against the pre-T1/T2 code (temporarily revert or check via `git stash` if needed) before landing the fix, then green after.
- verify: `npm test -- symbol-graph.test.ts` all green; both new tests fail if T1/T2 are reverted
- done: AC-1, AC-2

## Boundaries

- DO NOT touch the Python plane (`src/graph/python/symbol-graph.ts`) — it already has this pattern.
- DO NOT change `SymbolNode`/`SymbolEdge`/`EdgeKind` shapes in `src/graph/types.ts`.
- DO NOT change barrel re-export exclusion (`isReExport`) behavior for named/default imports — this phase only adds edges for symbol→file and bare side-effect imports, it doesn't touch existing reference-edge resolution.
- DO NOT modify the reachability BFS engine itself (`src/analyze/reachability.ts`) — file-path node ids are already valid seeds/targets there (see `src/engine/model.ts`'s existing `prodEntries.add(file)` usage).
