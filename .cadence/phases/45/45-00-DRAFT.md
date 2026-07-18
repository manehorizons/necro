---
phase: 45
id: 45-00
tier: complex
status: PENDING
---

# 45-00 — Python symbol graph + reachability integration

## Objective

Build `buildPythonSymbolGraph` (hand-rolled reference resolution over Phase B's module resolver — no ts-morph equivalent exists for Python) and integrate it into `buildReachabilityModel` alongside the existing TS graph, so `necro scan`/`explain` produce real dead-code verdicts for Python symbols, capped at `likely` tier with `fix`/`verify-removal` refusing Python symbols outright — Phase C of the 5-phase Python plan in `.cadence/intelligence/python-support-design.md`, scoped to symbol-graph + reachability only (entry-point auto-detection — pyproject scripts, `__main__`, conventions — is explicitly deferred to a later phase per the design doc's own contingency plan for splitting Phase C if it strains the CADENCE grain; this phase relies on the existing generic `NecroConfig.entries` glob escape hatch for roots).

## Acceptance Criteria

### AC-1: Top-level declarations become symbol nodes, mirroring the TS graph's granularity
Given Python source with module-level `def`/`async def`, `class`, and simple assignments (`x = ...`), including ones wrapped in `decorated_definition`
When `buildPythonSymbolGraph` walks a file
Then each becomes a `SymbolNode` (id `${file}:${line}:${name}`) — matching TS's granularity exactly: only module-level declarations are nodes, never methods/functions nested inside a class or another function (TS's `collectDeclarations` doesn't collect methods either, per `src/graph/symbol-graph.ts`).

### AC-2: Exported semantics — underscore convention, `__all__`, dunders, and pytest naming
Given a module-level symbol name
When `exported` is computed
Then it is `true` if the name does not start with `_`, OR the name appears in a module-level `__all__ = [...]` list/tuple of string literals, OR the name matches `^__\w+__$` (dunder exemption — e.g. `__version__`), OR the name starts with `test_` (pytest convention exemption, since necro has no pytest framework plugin yet and a zero-ref `test_foo` would otherwise be a guaranteed false positive); otherwise `false`. This reuses the *existing* `exported` → `likely`-not-`certain` behavior in `deadTier()` (`src/analyze/classify.ts`) — no new classify.ts branch needed for the exemption itself, only for AC-6's hard cap.

### AC-3: Reference edges resolve through Phase B's import map, including `__init__.py` re-export pass-through
Given a bare-name reference (`foo`) or attribute access (`m.foo`) anywhere in a file's body
When edges are built
Then the reference resolves via a recursive binding chase: if `foo` is declared locally, edge to that node; else if `foo` (or `m`) is a local binding introduced by an import (Phase B's `resolvePythonImport`), recurse into the resolved target file looking for `foo` there — chasing through arbitrarily many hops of `__init__.py` barrel re-exports (mirroring `isReExport`'s pass-through intent for TS) until a real declaration is found or a cycle/dead-end returns unresolved (no edge, not a crash). Edges are tagged `prod`/`test` by the *referencing* file via an injected `isTestFile` predicate (default: TS's existing regex OR a Python `test_*.py`/`*_test.py` filename match).

### AC-4: Star-imports taint the importing file; new Python dynamic-dispatch patterns extend the existing taint mechanism
Given `from x import *` anywhere in a file
When the graph is built
Then that file is added to a taint set (star-import taint — the resolver cannot know what names it pulled in). Separately, `findTaintedFiles`'s content-based `TAINT_PATTERNS` (`src/analyze/reachability.ts`) gains Python-specific patterns (`getattr(`, `importlib`, `globals()[`, `__getattr__`, `eval(`, `exec(`) alongside the existing JS ones — the mechanism is already language-agnostic (plain content regexes over `sources`), only the pattern list grows.

### AC-5: `buildReachabilityModel` partitions by language and merges both graphs
Given a target with both `.py` and `.ts`/`.js` files
When `buildReachabilityModel` runs
Then it builds the TS graph (`buildSymbolGraph`, ts-morph) over non-`.py` files and the Python graph (`buildPythonSymbolGraph`) over `.py` files, concatenates `nodes`/`edges` (node ids are file-path-based — no cross-language collision), unions both taint sets (content-based + Python star-import) into the existing `taintedFiles`, and leaves `computeReachability`/`tracePath` (`src/analyze/reachability.ts`) completely untouched — they already operate on language-neutral `SymbolNode`/`SymbolEdge` shapes.

### AC-6: Python dead-code findings are hard-capped at `likely`, never auto-fix eligible
Given any Python symbol classified as `dead`
When `classify()` (`src/analyze/classify.ts`) assigns a tier
Then the tier is never `certain` regardless of the underlying signals (private + zero refs would otherwise earn `certain`) — capped to `likely` — and `autoFixEligible` is `false`, unconditionally, until a future phase's corpus gate (Phase D) justifies lifting the cap.

### AC-7: `fix`/`verify-removal` refuse Python symbols with a clear message
Given a `verify-removal` query (standalone CLI or `fix --verify`) that resolves to exactly one Python symbol
When `verifyRemovals` (`src/engine/verify-removal.ts`) would otherwise plan and verify its removal
Then it instead returns `{ status: "unresolved", output: "<clear Python-not-supported message>" }` without calling `planRemovalOf` on the `.py` file — a plain (non-`--verify`) `fix --write` already cannot select Python symbols by construction (AC-6's cap means they never satisfy `autoFixEligible`), so no separate change is needed on that path.

### AC-8: `explain` traces work for Python symbols with zero new code
Given a resolved Python symbol query
When `necro explain` runs
Then it renders a correct witness chain (alive/dead/test-only) exactly as it does for TS — `resolveQuery`/`tracePath` already operate on the language-neutral graph, so this AC is a proof (end-to-end test), not new implementation.

### AC-9: End-to-end scan of a synthetic Python fixture repo produces correct verdicts; TS/JS suite is untouched
Given a hand-built Python fixture repo covering: a certain-dead private symbol, a `likely` exported-but-unreferenced symbol, a pytest-convention `test_*` function with zero refs, a symbol alive only via a direct import chain, a symbol alive only via `__init__.py` re-export pass-through, and a symbol in a star-imported file
When `necro scan` runs on it (using `NecroConfig.entries` for roots, per the Objective's deferral)
Then every symbol's verdict/tier matches the fixture's truth table, and the full existing TS/JS test suite (571 tests as of phase 44) remains green with zero behavior change.

## Tasks

### T1: Shared Python-language helper
- files: `src/graph/python/language.ts`, `test/graph-python-language.test.ts`
- action: `isPythonFile(file: string): boolean` — the single shared `.py` check reused by the tier cap (T6) and the fix/verify-removal refusal (T7), so the two never drift.
- verify: unit tests for `.py` / non-`.py` paths.
- done: groundwork for AC-6, AC-7

### T2: Symbol-node collection — declarations + exported semantics
- files: `src/graph/python/symbol-graph.ts`, `test/graph-python-symbol-nodes.test.ts`
- action: `buildPythonSymbolGraph(files, moduleMap, opts): Promise<{ graph: SymbolGraph; starTaintedFiles: Set<string> }>` (T4 fills in `starTaintedFiles`, stub empty here). Walk each file's tree-sitter AST for module-level `function_definition` (incl. `async def`, decorated via `decorated_definition`), `class_definition`, and simple top-level assignments (`identifier = expr`) — never descending into class/function bodies for node collection (AC-1 parity with `collectDeclarations`). Compute `exported` per AC-2: not `_`-prefixed, OR listed in a parsed `__all__ = [...]` list/tuple of string literals, OR matches `^__\w+__$`, OR starts with `test_`.
- verify: unit tests covering every AC-2 exemption branch plus the non-exempt (private, `certain`-eligible) case, and decorated/async defs still detected.
- done: AC-1, AC-2

### T3: Reference-edge resolution — bare names, attribute access, re-export chase
- files: `src/graph/python/symbol-graph.ts` (extend)
- action: Per file, build a binding table from Phase B's `parsePythonImports` + `resolvePythonImport` (local name → `{ targetFile, importedName }`). Walk each file's body collecting bare-identifier and `X.attr` attribute-access usages. Resolve each via the recursive chase in AC-3: local declaration → else follow the binding table into the target file (looking for `importedName` there) → recurse (cycle-guarded) through `__init__.py` re-export pass-through until a real node or a dead end. Emit edges tagged `prod`/`test` via an injected `isTestFile` (default: existing TS regex OR `test_*.py`/`*_test.py`).
- verify: unit tests for direct reference, attribute access on a whole-module import, multi-hop `__init__.py` re-export chase, and a cycle (two `__init__.py`s re-exporting each other) resolving to unresolved rather than hanging.
- done: AC-3

### T4: Star-import taint + Python taint patterns
- files: `src/graph/python/symbol-graph.ts` (extend — populate `starTaintedFiles`), `src/analyze/reachability.ts` (extend `TAINT_PATTERNS`), `test/graph-python-symbol-nodes.test.ts` or a new `test/reachability-python-taint.test.ts`
- action: Any file containing `from x import *` is added to `starTaintedFiles`. Add Python dynamic-dispatch content patterns (`getattr(`, `importlib`, `globals()[`, `__getattr__`, `eval(`, `exec(`) to the existing `TAINT_PATTERNS` array.
- verify: unit test that a star-importing file is returned in `starTaintedFiles`; unit test that `findTaintedFiles` flags a `.py` source containing each new pattern.
- done: AC-4

### T5: `buildReachabilityModel` language partition + graph merge
- files: `src/engine/model.ts`
- action: Partition `files` into Python vs everything else. Build the TS graph over non-`.py` files (existing call, unchanged) and `buildPythonSymbolGraph` over `.py` files; concatenate `nodes`/`edges` into one `SymbolGraph`; union `starTaintedFiles` into the existing `taintedFiles` computation. Everything downstream (`computeReachability`, entry resolution, `sources`) is untouched.
- verify: unit test with a mixed `.py` + `.ts` fixture confirming both languages' nodes appear in `model.graph.nodes` with no id collision.
- done: AC-5

### T6: Tier cap for Python dead-code findings
- files: `src/analyze/classify.ts`
- action: In `classify()`, after computing `deadTier(...)`, if `isPythonFile(node.file)` (T1) cap the result at `"likely"` (never `"certain"`) before it flows into `autoFixEligible: tier === "certain"` — no separate `autoFixEligible` branch needed since capping the tier alone makes that expression false.
- verify: unit test — a private, zero-ref Python symbol that would earn `certain` under TS rules gets `likely` + `autoFixEligible: false` instead; a TS symbol in the same run is unaffected (still reaches `certain`).
- done: AC-6

### T7: `verify-removal` refuses Python symbols
- files: `src/engine/verify-removal.ts`
- action: In `verifyRemovals`, right after a query resolves to exactly one node, if `isPythonFile(node.file)` push `{ symbol, status: "unresolved", output: "Python removal is not supported yet — necro's Python support is report/explain/triage only", resolvedId: node.id }` and `continue` — never call `planRemovalOf` on it. `fix --verify` inherits this for free (it calls `verifyFindings` → `verifyRemovals`); plain `fix --write` already can't select Python symbols (T6).
- verify: unit test — `verify-removal` on a Python symbol query returns the refusal message, plans nothing, spins up no worktree.
- done: AC-7

### T8: End-to-end fixture repo — full truth table, explain traces, and a regression run
- files: `test/fixtures/python-reachability/**` (a synthetic repo: certain-dead private symbol, likely exported-but-unreferenced symbol, zero-ref `test_*` function, import-chain-alive symbol, `__init__.py`-re-export-alive symbol, a star-imported file), `test/scan-python-reachability.test.ts`, `test/explain-python.test.ts`
- action: Build the fixture repo with an explicit `necro.config.json` `entries` glob (per the Objective's entry-point deferral) and `include: ["**/*.py"]`. Assert `necro scan`'s findings match the truth table exactly (verdict + tier per symbol). Assert `necro explain <python-symbol>` renders a correct witness chain for both an alive and a dead Python symbol.
- verify: the two new test files pass; `npm test` (full suite) and `npm run typecheck` stay green — confirms zero TS/JS regression.
- done: AC-8, AC-9

## Boundaries

- DO NOT implement entry-point auto-detection (pyproject scripts, `__main__.py`, conventions, test-glob auto-detection) — rely entirely on the existing `NecroConfig.entries` escape hatch for fixture roots (Objective).
- DO NOT touch `computeReachability`, `tracePath`, or `bfs` in `src/analyze/reachability.ts` — they are already language-neutral (AC-5).
- DO NOT implement Python `fix --write`/auto-removal — refusal only (AC-7).
- DO NOT attempt `getattr`/`globals()[...]`/`importlib.import_module`/decorator-registration resolution — those are taint signals (AC-4), not resolved edges (Constraints).
- DO NOT start the Phase D accuracy corpus or touch the `likely` tier-cap threshold.
- DO NOT change any TS/JS-only code path's *behavior* — only additive changes (new Python modules, a partition + merge in `model.ts`, a capping guard in `classify.ts`, a refusal guard in `verify-removal.ts`).
