---
phase: 42
id: 42-00
tier: standard
status: PENDING
---

# 42-00 — Auto-include .js/.jsx/.mts/.cts by default

## Objective

Make necro's default file discovery cover the whole JS/TS extension family (`.js`/`.jsx`/`.mts`/`.cts`, not just `.ts`/`.tsx`) and fix the parser to use tree-sitter's `tsx` grammar (not the plain `typescript` grammar) for any file that can contain JSX, closing a pre-existing mis-parse bug in the process.

## Acceptance Criteria

### AC-1: Default include covers the JS/TS extension family
Given a scan target with only `.js`, `.jsx`, `.mts`, and `.cts` source files and no `necro.config.json`
When `necro scan` runs
Then all four files are discovered and produce complexity/duplication/dead-code findings of the same shape as `.ts` files today (verified manually this session: `discoverFiles`/`lowerSource` already handle `.js`/`.jsx` content correctly once included — this AC is about widening `DEFAULT_CONFIG.include` in `src/config.ts`, not new parsing logic).

### AC-2: Parser dispatches grammar by extension; JSX parses without error
Given a `.tsx` or `.jsx` file containing real JSX syntax (e.g. `return <div className="x">{name}</div>;`)
When `getParser()` (`src/syntactic/parse.ts`) parses it
Then it uses the `tsx` tree-sitter grammar (already bundled via `tree-sitter-wasms`, no new dependency) and `tree.rootNode.hasError` is `false` — fixing the current bug where the plain `typescript` grammar mis-parses JSX as a type-assertion (confirmed via direct test this session: `hasError: true`, JSX read as `type_assertion` + `MISSING` tokens). `.ts`/`.mts`/`.cts`/`.js` files continue to use the plain `typescript` grammar.

### AC-3: Declaration files for new extensions are still skipped
Given a scan target containing `.d.mts` and `.d.cts` ambient declaration files
When `discoverFiles` (`src/discover.ts`) walks it
Then those files are excluded from the discovered set, the same way `.d.ts` is excluded today (the current skip check is hardcoded to `.d.ts` only and must be widened alongside the new extensions, or `.d.mts`/`.d.cts` would start being parsed as source once `**/*.mts`/`**/*.cts` join the default include).

### AC-4: Explicit user `include` config is untouched
Given a `necro.config.json` with a user-specified `include` array
When `loadConfig` resolves the effective config
Then the user's array is used verbatim (full override, no merge with the new wider default) — unchanged from current behavior, regression-guarded by a test.

### AC-5: Docs reflect the new default
Given the shipped change
When a reader checks `README.md`'s documented default `include` example and `CHANGELOG.md`
Then both show the widened extension list under `[Unreleased]` (or the next version section) — closing part of audit P2-15 (docs currently show only `["**/*.ts", "**/*.tsx"]` as the default).

## Tasks

### T1: Parser dispatches grammar by extension (typescript vs tsx)
- files: `src/syntactic/parse.ts`, `src/syntactic/ir.ts`, `src/syntactic/tokens.ts`, `test/syntactic-ir.test.ts` or a new `test/parse.test.ts`
- action: replace the single module-level `parserPromise` in `parse.ts` with two cached parser promises (one per grammar: `typescript`, `tsx`). Change `getParser()`'s signature to take the file extension (or a `isJsx: boolean` flag) and return the right cached parser, loading `tree-sitter-tsx.wasm` for `.tsx`/`.jsx` and `tree-sitter-typescript.wasm` for everything else. Update `lowerSource` (`ir.ts`) and `tokenize` (`tokens.ts`) call sites to pass the file's extension through.
- verify: red test first — parse a `.tsx`/`.jsx` snippet containing `return <div className="x">{name}</div>;` via the new dispatch and assert `tree.rootNode.hasError === false` (fails today with the plain typescript grammar, confirmed `hasError: true` in manual testing). Then `npx tsc --noEmit` clean, existing `syntactic-ir.test.ts`/`tokens.test.ts` still green.
- done: AC-2

### T2: Widen default include to the JS/TS extension family
- files: `src/config.ts`, `test/config.test.ts`
- action: add `"**/*.js"`, `"**/*.jsx"`, `"**/*.mts"`, `"**/*.cts"` to `DEFAULT_CONFIG.include` alongside the existing `"**/*.ts"`, `"**/*.tsx"`.
- verify: red test first in `config.test.ts` asserting `DEFAULT_CONFIG.include` contains all six globs; existing "merges... per key" and "user include fully overrides default" tests (AC-4) still pass unchanged — add an explicit override test if one doesn't already exist that pins full-replace (not merge) semantics for `include`.
- done: AC-1, AC-4

### T3: Skip .d.mts/.d.cts declaration files alongside .d.ts
- files: `src/discover.ts`, new `test/discover.test.ts`
- action: widen the hardcoded `entry.name.endsWith(".d.ts")` skip in `discoverFiles` to also match `.d.mts` and `.d.cts`.
- verify: red test first — a target with `foo.d.mts`/`foo.d.cts`/`foo.d.ts` plus real `.mts`/`.cts`/`.ts` siblings; assert only the non-declaration files are discovered.
- done: AC-3

### T4: End-to-end regression — JSX scan produces correct findings
- files: new fixture under `test/` (or extend `test/scan-complexity.test.ts`-style integration test)
- action: write an integration test that runs the scan pipeline (discover → lowerSource → complexity) against a `.jsx` file with conditional JSX (e.g. `{cond && <X/>}` inside an `if`) and asserts the reported nesting/complexity matches hand-counted expectations — guards against the pre-fix silent mis-parse regressing.
- verify: test fails against the pre-T1 parser (mis-parse produces wrong/garbage structure), passes after T1+T2 land.
- done: AC-1, AC-2

### T5: Sync docs to the new default
- files: `README.md` (default `include` example, ~line 231), `CHANGELOG.md` (`[Unreleased]` section)
- action: update the shown default `include` array to the six-glob list; add a CHANGELOG entry describing the widened default and the JSX parse-grammar fix.
- verify: `grep` the updated glob list appears in both files; no other doc references to the old two-glob default remain (`grep -n '"\*\*/\*\.ts", "\*\*/\*\.tsx"' README.md` returns nothing outside intentional history/changelog mentions).
- done: AC-5

## Boundaries

- Do not touch `src/cli.ts`'s `loadConfig(process.cwd())` call sites — that convention is settled (phase 40) and out of scope here.
- Do not rewrite the "polyglot" marketing claim in `package.json`/`README.md` intro copy — only the default-include example changes. Python/PHP language-family work is deferred to separate future phases.
- Do not change `DuplicationOptions`/`ComplexityThresholds` defaults — only `include` changes in `config.ts`.
- Keep `getParser()`'s external call sites minimal-diff: prefer passing an extension/flag over restructuring `ir.ts`/`tokens.ts` beyond what's needed to thread it through.
