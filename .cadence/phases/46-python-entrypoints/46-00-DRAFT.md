---
phase: 46-python-entrypoints
id: 46-00
tier: standard
status: PENDING
---

# 46-00 — Python entry-point resolution — pyproject scripts, setup.py, dunder-main, conventions

## Objective

Give Python repos real production-entry roots — `pyproject.toml` `[project.scripts]`/`[project.gui-scripts]`/`[project.entry-points.*]`, `setup.cfg`/`setup.py` console-script declarations, `__main__.py`/`if __name__ == "__main__":` modules, and conventional filenames (`main.py`, `app.py`, `manage.py`, `wsgi.py`, `asgi.py`, `conftest.py`) — mirroring `resolveProdEntries`'s manifest/convention/scripts shape (`src/engine/prod-entries.ts`) with a parallel Python-specific resolver, so a Python repo with no hand-written `NecroConfig.entries` glob stops hitting `refused-no-entries` on the common cases. Half of the design doc's §2.3 scope: test-glob entries (needing a `RepoContext` Python-manifest extension) and library `publicApiIds` quarantine are explicitly deferred to the next phase (47) to keep this phase at the project's established ~9-task grain.

## Acceptance Criteria

### AC-1: `pyproject.toml` script tables resolve to entry files
Given a `pyproject.toml` with `[project.scripts]`, `[project.gui-scripts]`, and/or `[project.entry-points.*]` tables, each mapping a name to a `"pkg.module:func"` or `"pkg.module"` string value
When Python entries are resolved
Then a hand-rolled scanner (no new TOML-parsing dependency — limited to these known table headers and simple single-line `key = "value"` entries; multiline strings/nested arrays are out of scope and simply not matched, a false negative not a crash) extracts each dotted module path, resolves it to a file via Phase B's `resolvePythonImport`/module-map machinery, and roots that file as a prod entry.

### AC-2: `setup.cfg` `[options.entry_points]` resolves the same way as AC-1
Given a `setup.cfg` with an `[options.entry_points]` section containing an INI-style `console_scripts = name = pkg.module:func` block (one or more lines)
When Python entries are resolved
Then the same dotted-module-path extraction and rooting from AC-1 applies via a small hand-rolled INI-section reader (no new dependency).

### AC-3: `setup.py` literal `console_scripts` resolve; dynamic setups are skipped honestly
Given a `setup.py` containing a `setup(...)` call with an `entry_points={"console_scripts": [...]}` keyword argument whose value is a literal list of `"name=pkg.module:func"` strings
When Python entries are resolved
Then a tree-sitter query over `setup.py` extracts the literal strings and resolves/roots them the same way as AC-1; if `entry_points` is anything other than a literal dict-of-literal-list (a variable, a function call, a file read, string concatenation), it is skipped without error — no attempt to evaluate Python.

### AC-4: `__main__.py` files and `if __name__ == "__main__":` modules root themselves
Given a Python file named `__main__.py`, or any Python file containing a module-level `if __name__ == "__main__":` block (tree-sitter query, not string matching — must be an actual `if` statement comparing `__name__` to the literal `"__main__"`)
When Python entries are resolved
Then that file is rooted as a prod entry, independent of any dotted-path resolution (it's the file itself that's invoked).

### AC-5: Conventional filenames root as prod entries; `conftest.py` roots as a test entry
Given files named (by basename, anywhere in the scanned tree) `main.py`, `app.py`, `manage.py`, `wsgi.py`, or `asgi.py`
When Python entries are resolved
Then each is rooted as a prod entry (source `convention`, reusing the existing `EntrySource` label). Separately, `conftest.py` files root into `testEntries` instead (pytest auto-discovers and imports them implicitly — never via an explicit import edge — so an un-rooted `conftest.py`'s top-level fixtures would otherwise read as dead); this is a rooting-only change and does not alter `buildPythonSymbolGraph`'s existing `DEFAULT_PY_TEST_FILE` edge-tagging regex.

### AC-6: New resolver integrates into `buildReachabilityModel` alongside the existing TS/Python entry mechanisms
Given a Python repo with no `NecroConfig.entries` configured
When `buildReachabilityModel` runs
Then the new `resolvePythonEntries` (mirroring `resolveProdEntries`'s shape: `{ entries, records }` with `EntryResolutionRecord`-compatible sources) is called alongside the existing `resolveProdEntries`/plugin/workspace mechanisms in `src/engine/model.ts`, its records merge into `prodEntryRecords`/`buildEntryResolution`'s diagnostic output as first-class sources (not silently absorbed into `config`), and a synthetic fixture repo using only e.g. a `manage.py` (no explicit config) no longer hits `entryResolution.collapsed`/`refused-no-entries`.

### AC-7: End-to-end proof; TS/JS and existing Python suites are untouched
Given a hand-built Python fixture repo covering: a `pyproject.toml` script entry, a `setup.cfg` console_scripts entry, a literal `setup.py` console_scripts entry, a dynamic (skipped) `setup.py` entry_points, a `__main__.py`, an `if __name__ == "__main__":` module, each conventional filename, and a `conftest.py`
When `necro scan` runs on it with zero `NecroConfig.entries`
Then every listed file is correctly rooted per its mechanism (verified via `entryResolution.sources`, not just absence of `collapsed`), and the full existing test suite (606 tests as of phase 45) remains green with zero behavior change on non-Python and already-covered Python paths.

## Tasks

### T1: Shared sectioned-scanner + dotted-module resolver
- files: `src/engine/python-entries.ts` (new), `test/engine-python-entries-scanner.test.ts`
- action: hand-rolled scanner for `[section.header]` + `key = "value"`/`key = value` line pairs — the shared shape both `pyproject.toml` tables (AC-1) and `setup.cfg` sections (AC-2) reduce to; a `resolveDottedModule(spec: string, map: PythonModuleMap): string | null` helper that strips an optional `:func` suffix and looks up `map.moduleToFile.get(modulePath)` directly (no relative-import walk needed — these are always fully-qualified).
- verify: unit tests for section extraction (single line, multiple keys, unrelated sections ignored), dotted-path stripping with/without `:func`, and malformed/multiline values being skipped rather than throwing.
- done: groundwork for AC-1, AC-2

### T2: `pyproject.toml` script-table extraction
- files: `src/engine/python-entries.ts` (extend), `test/engine-python-entries-pyproject.test.ts`
- action: read `pyproject.toml` if present; scan `[project.scripts]`, `[project.gui-scripts]`, and any `[project.entry-points.*]` subtable with T1's scanner; resolve each value via T1's resolver against the Python module map; emit records with source `pyproject-scripts`.
- verify: unit tests per table kind, plus a fixture containing an unrelated multiline array elsewhere in the file that must not break extraction.
- done: AC-1

### T3: `setup.cfg` `[options.entry_points]` extraction
- files: `src/engine/python-entries.ts` (extend), `test/engine-python-entries-setup-cfg.test.ts`
- action: scan `setup.cfg`'s `[options.entry_points]` section for a `console_scripts` key whose value spans one or more `name = pkg.module:func` lines (INI multi-line-under-key convention); resolve each via T1; emit records with source `setup-config`.
- verify: unit tests for single-line and multi-line `console_scripts` blocks.
- done: AC-2

### T4: `setup.py` literal `console_scripts` via tree-sitter
- files: `src/engine/python-entries.ts` (extend), `test/engine-python-entries-setup-py.test.ts`
- action: tree-sitter query for a `setup(...)` call whose `entry_points` keyword argument is a literal dict containing a `console_scripts` key mapped to a literal list of string literals; extract and resolve each the same way as T2/T3, source `setup-config`. If `entry_points` is a variable, call expression, or anything non-literal, skip without error.
- verify: unit tests for the literal case, plus a dynamic case (`entry_points=get_entry_points()`) that must be skipped, not crash.
- done: AC-3

### T5: `__main__.py` and `if __name__ == "__main__":` detection
- files: `src/engine/python-entries.ts` (extend), `test/engine-python-entries-dunder-main.test.ts`
- action: any file named `__main__.py` is unconditionally an entry (source `dunder-main`); for every other `.py` file, a tree-sitter query for a *module-level* `if` statement whose condition compares `__name__` to the literal `"__main__"` (either operand order) also roots that file, same source.
- verify: unit tests: bare `__main__.py` roots regardless of content; a module-level `if __name__ == "__main__":` roots; the same check nested inside a function/class body does not double-fire outside its intended module-level scope (still roots the file once, not per-occurrence).
- done: AC-4

### T6: Conventional filenames + `conftest.py` test-entry routing
- files: `src/engine/python-entries.ts` (extend — return shape gains a `testEntries: Set<string>` field alongside `entries`/`records`)
- action: basename match against `main.py`, `app.py`, `manage.py`, `wsgi.py`, `asgi.py` anywhere in the scanned tree → prod entry, source `convention`; `conftest.py` basename matches route into the new `testEntries` return field instead of `entries`.
- verify: unit tests per conventional filename; a `conftest.py` fixture appears in `testEntries`, not `entries`.
- done: AC-5

### T7: Wire `resolvePythonEntries` into `buildReachabilityModel`
- files: `src/engine/model.ts` (extend)
- action: call the new `resolvePythonEntries(targetPath, pyFiles, pyModuleMap)` alongside the existing `resolveProdEntries` call; merge its `entries`/`records` into `prodEntries`/`prodEntryRecords` (first-mechanism-wins dedup, same as the existing `add()` semantics) so `buildEntryResolution` surfaces the new sources as first-class diagnostics; union its `testEntries` into the existing `testEntries` set.
- verify: unit test with a synthetic Python-only fixture repo containing only `manage.py` (no `NecroConfig.entries`) asserting `entryResolution.collapsed === false` and a `manage.py` record present in `entryResolution.sources`.
- done: AC-6

### T8: End-to-end entry-point fixture scan
- files: `test/fixtures/python-entrypoints/` (new fixture repo), `test/scan-python-entrypoints.test.ts`
- action: build a fixture repo covering one instance of every AC-1–AC-5 mechanism (including the dynamic `setup.py` case that must be *absent* from results) with zero `NecroConfig.entries`; run `necro scan`; assert `entryResolution.sources` contains a record for each expected mechanism/file and `collapsed` is `false`.
- verify: new test green; full suite (`npm test`) stays green with the existing 606 tests unaffected.
- done: AC-7

## Boundaries

- DO NOT touch test-glob entry conventions (`test_*.py`/`*_test.py`/`tests/` as *entries*) or the `RepoContext` Python-manifest extension — deferred to phase 47 (Objective, Constraints).
- DO NOT implement library `publicApiIds` quarantine wiring — deferred to phase 47 (Constraints).
- DO NOT add a TOML or INI parsing dependency — hand-rolled scanners only (Constraints, T1).
- DO NOT attempt to evaluate or partially interpret dynamic `setup.py` `entry_points` values — skip honestly (AC-3, T4).
- DO NOT change `fix`/`verify-removal` Python refusal behavior (phase 45) — this phase only affects reachability rooting.
- DO NOT change any existing TS/JS or already-shipped Python behavior — only additive changes (`src/engine/python-entries.ts` is new; `model.ts`'s changes are additive merges, not replacements of existing entry mechanisms).
