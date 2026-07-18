---
phase: 47-python-test-entries-and-library-quarantine
id: 47-00
tier: standard
status: PENDING
---

# 47-00 — Python test-glob entries (pytest plugin) + library publicApiIds quarantine

## Objective

Finish design doc §2.3: give Python repos real pytest test-glob entries (a `pytest` `FrameworkPlugin`, gated on a new `RepoContext` Python-manifest awareness so `hasDep`/`pyprojectHas` see `pyproject.toml`/`requirements.txt`) so `test_*.py`/`*_test.py`/`tests/**` files root their own top-level test functions as real test-reachable entries — superseding phase 45's `test_` "exported" tier-bump stopgap with a genuine fix — and wire Python-library `publicApiIds` quarantine (a `pyproject.toml` with both `[project]` and `[build-system]` is a distributable library; its exported symbols are externally consumable and quarantine to `maybe`), the last two items from `.cadence/intelligence/python-support-design.md` §2.3 deferred out of phases 45/46.

## Acceptance Criteria

### AC-1: `RepoContext` gains Python-manifest awareness
Given a `pyproject.toml` with a `[project.dependencies]` array (inline or multi-line) and/or a `requirements.txt`
When `createRepoContext` builds its dependency set
Then `hasDep(names)` also matches bare package names extracted from both sources (version specifiers/extras/comments stripped, hand-rolled — no new dependency), merged into the same dependency set `package.json` already populates; and a new `pyprojectHas(header: string): boolean` method reports whether a `[header]` section (exact top-level match, e.g. `"project"`, `"build-system"`, `"tool.pytest.ini_options"`) is present in `pyproject.toml`.

### AC-2: A `pytest` `FrameworkPlugin` detects pytest and contributes test-glob entries
Given a repo where `hasDep(["pytest"])`, `hasConfig(["pytest.ini"])`, or `pyprojectHas("tool.pytest.ini_options")` is true
When framework plugins are detected
Then the new `pytest` plugin (mirroring `createTestRunnerPlugin`'s shape) is detected and contributes `**/test_*.py`, `**/*_test.py`, and `**/tests/**` as `kind: "test"` entry globs, flowing through the existing `resolveEntries`/`testEntries` machinery unchanged.

### AC-3: Test-entry files root their own exported top-level symbols (language-neutral fix)
Given a file matched by any test-kind entry glob (pytest's new globs, or an existing JS one)
When `buildReachabilityModel` computes `testEntries`
Then every `exported` node declared in that file has its own `id` added to `testEntries` directly — mirroring the existing prod-entry-file pattern (`pluginProdEntryFiles` → root each exported node id, `src/engine/model.ts`) — because a framework-invoked entry file's top-level declarations (e.g. a pytest `def test_foo():`) are never referenced by an explicit edge and were previously only file-level-tagged, not rooted.

### AC-4: pytest test functions resolve `test-only`, not a `likely`-tier dead finding
Given a `test_*.py` file with a zero-prod-reference top-level `def test_foo():` in a repo where the pytest plugin detects
When `necro scan` classifies it
Then the verdict is `test-only` (reached via AC-3's rooting, before tier logic ever runs) rather than `dead`/`likely` — the scenario phase 45's `test_` "exported" exemption could only stopgap-mitigate, not fully fix (that exemption remains as-is, unchanged, and still applies as a fallback when no pytest plugin detects — Constraints).

### AC-5: A Python "library" target is detected via `pyproject.toml`'s own two-table convention
Given a `pyproject.toml` containing both a top-level `[project]` table and a `[build-system]` table
When `buildReachabilityModel` runs
Then the target is classified as a Python library (`ctx.pyprojectHas("project") && ctx.pyprojectHas("build-system")`) — the design doc's stated proxy for "this package is meant to be built/installed and consumed externally" (§2.3).

### AC-6: Library-detected repos quarantine every exported Python symbol via the existing (previously unwired) `publicApiIds` mechanism
Given a Python-library target (AC-5)
When `buildReachabilityModel` builds its result and `scan()` classifies findings
Then every `exported` Python `SymbolNode`'s id is included in a new `publicApiIds: Set<string>` field on the reachability model, which `scan()` (`src/engine/index.ts`) passes into `classify()`'s existing `publicApiIds` parameter (first real caller — `classify()`'s `isPublicApi` branch already exists but no caller has ever populated it) — quarantining those symbols to `maybe` tier, never auto-fix eligible, with the existing "in package.json exports" evidence text (reused as-is; Constraints covers wording).

### AC-7: TS/JS repos and already-shipped Python behavior are unaffected; full end-to-end proof
Given a TS/JS-only repo, and separately a Python repo that is neither pytest-detected nor a library
When the same scan runs
Then `publicApiIds` stays empty exactly as it silently defaulted to before (AC-6 is additive), `hasDep`/`pyprojectHas`'s new Python-manifest reads are no-ops when the relevant files don't exist, and the full existing suite (637 tests as of phase 46) stays green with zero behavior change; a hand-built end-to-end fixture proves AC-2–AC-6 together (pytest plugin detected + test function resolves test-only; library repo's exports quarantine to `maybe`; non-library/non-pytest Python repos are unaffected).

## Tasks

### T1: `RepoContext` Python-manifest awareness
- files: `src/plugins/python-manifest.ts` (new), `src/plugins/types.ts` (extend `RepoContext`), `src/plugins/registry.ts` (extend `createRepoContext`), `test/plugins-python-manifest.test.ts`
- action: hand-rolled `readPythonDependencyNames(root): Set<string>` reading `pyproject.toml`'s `[project.dependencies]` array (inline `[...]` or multi-line, string literals only) and `requirements.txt` lines (strip comments/`-` flag lines/version specifiers/extras, keep the bare leading package name); a `pyprojectHasSection(root, header): boolean` exact-top-level-header check. Wire both into `createRepoContext`: merge dependency names into the existing `allDeps` set `hasDep` checks; add `pyprojectHas` to the returned `RepoContext`.
- verify: unit tests for inline/multi-line dependency arrays, requirements.txt with comments/blank lines/`-e .`/version specifiers, `pyprojectHas` true/false/no-file cases.
- done: AC-1

### T2: `pytest` `FrameworkPlugin`
- files: `src/plugins/pytest/index.ts` (new), `test/plugins-pytest-detect.test.ts`
- action: `createPytestPlugin(): FrameworkPlugin` mirroring `createTestRunnerPlugin`'s shape — `detect(ctx)` = `hasDep(["pytest"]) || hasConfig(["pytest.ini"]) || pyprojectHas("tool.pytest.ini_options")`; `entryPatterns()` returns `**/test_*.py`, `**/*_test.py`, `**/tests/**` as `kind: "test"`; `resolveEdges`/`taintRules` return empty (no synthetic edges or taint rules needed yet).
- verify: unit tests for each detect() branch (dep, config file, pyproject section) and for the entry-glob list.
- done: AC-2

### T3: Wire the plugin in; root test-entry-file exported symbols
- files: `src/engine/model.ts` (extend `PLUGINS` array; add the exported-symbol rooting loop next to the existing prod-entry-file rooting block)
- action: add `createPytestPlugin()` to the `PLUGINS` array. Immediately after the existing `for (const node of graph.nodes) { if (node.exported && pluginProdEntryFiles.has(node.file)) prodEntries.add(node.id); }` block, add the symmetric test-side loop: `for (const node of graph.nodes) { if (node.exported && isTestFile(node.file)) testEntries.add(node.id); }` (language-neutral — applies to any test-glob file, not just Python).
- verify: unit test with a synthetic pytest repo (pytest declared as a dependency) confirming a `test_*.py` file's top-level function id lands in `testEntries`; a second test confirming a JS test file with a top-level exported helper also gets rooted (proving the fix is language-neutral, not a regression risk for existing TS repos).
- done: AC-3

### T4: End-to-end — pytest functions resolve `test-only`
- files: `test/scan-python-pytest-entries.test.ts` (new)
- action: build a fixture with `pytest` as a declared dependency (e.g. `pyproject.toml` `[project.dependencies] = ["pytest"]`) and a `test_*.py` file with a zero-prod-ref `def test_foo(): pass`; run `necro scan`; assert the finding's verdict is `test-only`, not `dead`.
- verify: new test green.
- done: AC-4

### T5: Python-library detection
- files: `src/engine/model.ts` (extend — a small `isPythonLibrary(ctx)` helper using `ctx.pyprojectHas`)
- action: `isPythonLibrary(ctx: RepoContext): boolean` = `ctx.pyprojectHas("project") && ctx.pyprojectHas("build-system")`.
- verify: unit test (can be folded into T6's test file) confirming true only when both sections are present, false when either is missing or `pyproject.toml` is absent.
- done: groundwork for AC-5

### T6: `publicApiIds` computation + wiring
- files: `src/engine/model.ts` (add `publicApiIds: Set<string>` to `ReachabilityModel`, computed from `isPythonLibrary(ctx)` and `pyGraph.nodes` — every `exported` Python node's id when the target is a library, else empty), `src/engine/index.ts` (pass `model.publicApiIds` into the existing `classify({ ... })` call's `publicApiIds` param), `test/model-python-library.test.ts` (new)
- action: wire the field through `buildReachabilityModel`'s return and `scan()`'s `classify()` call.
- verify: unit test with a library fixture (`[project]` + `[build-system]` in `pyproject.toml`) asserting `model.publicApiIds` contains every exported Python node id and is empty for a non-library Python repo and for a TS-only repo.
- done: AC-5, AC-6

### T7: End-to-end — library quarantine
- files: `test/scan-python-library-quarantine.test.ts` (new)
- action: build a library fixture (`pyproject.toml` with `[project]` + `[build-system]`, an exported top-level function with zero refs); run `necro scan`; assert the finding's tier is `maybe` and `autoFixEligible` is `false`, with the "in package.json exports" evidence line present.
- verify: new test green.
- done: AC-6

### T8: Regression proof — TS/JS and non-pytest/non-library Python unaffected
- files: none (verification-only task); may add a small assertion to an existing fixture if a natural gap is found
- action: run the full suite; specifically re-confirm phase 45's `scan-python-reachability.test.ts` fixture (no pytest dependency, no `test_*.py`-glob-matching files) is byte-identical in verdict/tier to before (the `test_` exemption fallback still applies, untouched).
- verify: `npm run build && npm run typecheck && npm test` — full suite green, matching phase 46's 637-test baseline plus this phase's additions.
- done: AC-7

## Boundaries

- DO NOT remove or alter phase 45's `test_` "exported" exemption in `buildPythonSymbolGraph` — it stays as the fallback (Constraints).
- DO NOT gate AC-3's test-entry-file rooting fix to Python files only — it must apply to any test-kind entry glob (Constraints).
- DO NOT implement uv-workspace/namespace-package library semantics — the `[project]`+`[build-system]` proxy is the entire library-detection mechanism this phase (Constraints).
- DO NOT touch the "in package.json exports" evidence string in `src/analyze/classify.ts` (Constraints).
- DO NOT attempt to wire `publicApiIds` for TS/JS repos — this phase only ever populates it with Python entries (Constraints).
- DO NOT add a TOML/INI parsing dependency — hand-rolled readers only, matching phase 46 (Constraints).
- DO NOT change any existing TS/JS or already-shipped Python (phases 42-46) behavior — only additive changes.
