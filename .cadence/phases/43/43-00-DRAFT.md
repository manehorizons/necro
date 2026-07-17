---
phase: 43
id: 43-00
tier: standard
status: PENDING
---

# 43-00 — Python syntactic axis: complexity, duplication, hotspots

## Objective

Ship Python support for necro's syntactic axis (complexity, duplication, hotspots — everything downstream of `lowerSource`/`tokenize`) as Phase A of the 5-phase Python plan in `.cadence/intelligence/python-support-design.md`; opt-in via config (not the default include) since the reachability/dead-code axis (Phases B-D) isn't built yet and necro must not claim Python dead-code support before it exists.

## Acceptance Criteria

### AC-1: Parser dispatches the python grammar for `.py` files
Given a `.py` file
When `getParser(file)` (`src/syntactic/parse.ts`) is called
Then it loads and caches a third grammar (`python`, alongside the existing `typescript`/`tsx`) from `tree-sitter-wasms`'s bundled `tree-sitter-python.wasm` (no new dependency) and `tree.rootNode.hasError` is `false` on real Python source covering `def`/`async def`, `if`/`elif`/`else`, `for`/`while`, `try`/`except`, ternary (`a if b else c`), `and`/`or`, comprehensions, `match`/`case`, classes, and lambdas — all verified present in the grammar by direct probe this session (see Constraints).

### AC-2: Python control flow lowers to the same language-agnostic IR
Given Python source with the constructs listed in AC-1
When `lowerSource` (`src/syntactic/ir.ts`) processes it
Then `function_definition` and `lambda` are recognized as function units (decorated defs are wrapped in `decorated_definition` but the inner `function_definition` is still found by the existing recursive walk — no special-casing needed for detection); `categoryOf()` maps `if_statement` + `elif_clause` + comprehension `if_clause` → `branch`, `for_statement` + `while_statement` + comprehension `for_in_clause` → `loop`, `case_clause` → `case`, `except_clause` → `catch`, `conditional_expression` → `ternary`, `boolean_operator` (reading its `operator` field, `and`/`or`) → `boolean` (non-nesting); `not_operator` (Python's `not`) is deliberately left unmapped, matching how JS's unary `!` maps to nothing today.

### AC-3: Python tokens normalize into the existing Type-2 duplication stream
Given Python source
When `tokenize` (`src/syntactic/tokens.ts`) processes it
Then `identifier` leaves normalize to `ID`; `integer`, `float`, and string-content leaves normalize to `LIT`; `comment` nodes are dropped (node type name is identical to JS's); duplication detection works on Python source without new detector code.

### AC-4: Discovery is Python-aware but stays opt-in
Given a target with `.py` source
When `necro scan` runs
Then `.py` files are discovered **only when a user explicitly adds `"**/*.py"` to their `necro.config.json` `include`** — `DEFAULT_CONFIG.include` is NOT changed in this phase (per the design doc's phased default-on plan: Python stays opt-in until the Phase D accuracy corpus passes). `.pyi` stub files are always skipped like `.d.ts` when discovered. `__pycache__`, `.venv`, `venv`, `.tox`, and `.eggs` join `SKIP_DIRS` unconditionally (harmless even when Python isn't scanned).

### AC-5: Golden tests match hand-computed complexity on real Python control flow
Given hand-written Python fixtures with a known nesting depth (`elif` chain, nested `for`/`while`/`try`), a known cyclomatic count, and a comprehension with an `if` clause
When the complexity detectors run against them
Then the reported nesting/branch counts match hand-counted expectations — `elif_clause` must count as a branch (a common miss: treating it as a nested `if` would undercount or double-count depth).

### AC-6: End-to-end scan on a Python-only target works and doesn't regress TS/JS
Given a scan target containing only `.py` files with an explicit `necro.config.json` include, and separately the existing TS/JS test suite
When `necro scan` runs on each
Then the Python target produces sane, non-empty complexity/duplication/hotspot output with no crash, and the full existing TS/JS suite (508 tests as of phase 42) remains green with zero behavior change.

## Tasks

### T1: Add python grammar dispatch to the parser
- files: `src/syntactic/parse.ts`, `test/parse.test.ts`
- action: extend the `Grammar` union to `"typescript" | "tsx" | "python"`; extend `grammarFor(file)` so `.py` maps to `"python"`; the existing per-grammar caching (`parserPromises` map) and shared `ensureRuntime()` already generalize to a third entry with no other changes.
- verify: red test first in `parse.test.ts` — parse a Python fixture covering every construct in AC-1 (`def`/`async def`, `if`/`elif`, `for`/`while`, `try`/`except`, ternary, `and`/`or`, comprehension, `match`/`case`, class, lambda) via `getParser("/x.py")` and assert `hasError === false`. Then green.
- done: AC-1

### T2: Map Python control flow into the IR
- files: `src/syntactic/ir.ts`, `test/syntactic-ir.test.ts`
- action: add `"function_definition"` and `"lambda"` to `FUNCTION_KINDS`; extend `categoryOf()` with the Python arm from AC-2 (branch: `if_statement`, `elif_clause`, comprehension `if_clause`; loop: `for_statement`, `while_statement`, comprehension `for_in_clause`; case: `case_clause`; catch: `except_clause`; ternary: `conditional_expression`; boolean: `boolean_operator` reading its `operator` field for `and`/`or`, non-nesting). Do not map `not_operator`.
- verify: red test first — a Python function with an `elif` chain must report a `branch` control node per `if`/`elif` (not silently drop `elif`); a Python `and`/`or` expression must report `boolean` category nodes with `nests: false`; a ternary must report `nests: true`. Then green.
- done: AC-2

### T3: Normalize Python tokens for duplication detection
- files: `src/syntactic/tokens.ts`, `test/tokens.test.ts`
- action: add `"identifier"` to `IDENTIFIER_KINDS` if not already covered by name collision with JS's `"identifier"` (verify — Python's leaf node type is also literally `identifier`, so this may already work with zero changes; confirm empirically before editing); add `"integer"`, `"float"` to `LITERAL_KINDS` (Python's string leaves are `string_content`, distinct from JS's `string_fragment` — add it).
- verify: red test first — two Python functions differing only in variable/literal names must normalize to the same token stream (mirrors the existing renamed-identifier TS test); comments produce no tokens.
- done: AC-3

### T4: Widen discovery for Python without touching the default include
- files: `src/discover.ts`, `test/discover.test.ts`
- action: widen the declaration-file skip regex to also exclude `.pyi` (alongside `.d.ts`/`.d.mts`/`.d.cts`); add `"__pycache__"`, `".venv"`, `"venv"`, `".tox"`, `".eggs"` to `SKIP_DIRS`. Do **not** touch `src/config.ts`'s `DEFAULT_CONFIG.include` (AC-4, Constraints).
- verify: red test first — a target with `.pyi` files and a user-specified `include: ["**/*.py"]` config must discover `.py` but not `.pyi`; a directory tree with `__pycache__`/`.venv` must skip them even when `.py` is user-included. Separately assert `DEFAULT_CONFIG.include` is unchanged from phase 42 (no `.py` in it) — regression guard for AC-4's "opt-in only" requirement.
- done: AC-4

### T5: Golden complexity tests on real Python control flow
- files: new fixture-driven tests, likely extending `test/syntactic-ir.test.ts` or a new `test/python-syntactic.test.ts`
- action: hand-write Python fixtures with a known nesting depth via `elif`/nested `for`/`while`/`try`, a known cyclomatic count, and a comprehension with an `if` clause; assert reported nesting/branch counts match hand-counted expectations. Specifically test that an `if`/`elif`/`elif`/`else` chain counts each `elif_clause` as its own branch (not collapsed, not double-counted as a nested `if`).
- verify: hand-count the expected nesting/branch numbers before writing the assertion (not after — avoids fitting the test to whatever the code happens to produce); test fails if `elif_clause` is left out of `categoryOf()`.
- done: AC-5

### T6: End-to-end Python scan + full regression pass
- files: new integration test (mirrors `test/scan-complexity.test.ts`'s pattern: temp dir, `necro.config.json` with `include: ["**/*.py"]`, real `scan()` call)
- action: write a small Python-only fixture tree (a couple of modules with functions at varying complexity) with an explicit config include, run `scan()`, assert non-empty, sane complexity/duplication/hotspot output and no crash. Then run the full existing suite to confirm zero regression on TS/JS.
- verify: `npx vitest run` (full suite) — all pre-existing tests stay green (508+ as of phase 42), plus the new Python tests; `npx tsc --noEmit` clean; `npm run build` clean.
- done: AC-6

## Boundaries

- Do not touch `src/config.ts`'s `DEFAULT_CONFIG.include` — Python stays opt-in via user config until Phase E (settled decision, AC-4).
- Do not build any reachability/dead-code logic for Python in this phase — no `SymbolGraph` work, no `buildPythonSymbolGraph`, nothing in `src/graph/`. That's Phases B-C.
- Do not touch `fix`/`verify-removal` code paths — Python symbols aren't reachable there yet since there's no Python reachability model to feed them.
- Do not add a Python manifest reader (`pyproject.toml`/`setup.py` parsing) — that's entry-point resolution, Phase C.
- Keep the `self`/`cls` param-count bias undecided in code — no special-casing in `godFunctionParams` logic (Constraints).
