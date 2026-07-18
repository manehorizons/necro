---
phase: 44-python-module-resolver
id: 44-00
tier: standard
status: PENDING
---

# 44-00 — Python module resolver — dotted-path/file mapping

## Objective

Build a deterministic, dependency-free Python module resolver — dotted-path ↔ file mapping, `import`/`from...import` resolution (absolute, relative, aliased), and src-layout root detection — as Phase B of the 5-phase Python plan in `.cadence/intelligence/python-support-design.md`; internal-only (not wired into `necro scan`, discovery, or any user-visible output), preparing the ground for Phase C's symbol graph.

## Acceptance Criteria

### AC-1: Dotted-path ↔ file mapping for regular packages
Given a directory tree of `.py` files, some in regular packages (containing `__init__.py`) and some as plain top-level modules
When `buildPythonModuleMap(files, importRoots)` walks the file set
Then it returns a bidirectional map where `pkg/sub/mod.py` → dotted path `pkg.sub.mod`, `pkg/sub/__init__.py` → dotted path `pkg.sub` (the package itself, not `pkg.sub.__init__`), and each dotted path resolves back to its originating file path.

### AC-2: Absolute import resolution (`import x.y.z`, `from x.y import z`)
Given parsed absolute-form import statements
When resolved against the module map
Then `import pkg.sub.mod` resolves to the file for `pkg.sub.mod`; `from pkg.sub import z` first tries `z` as a submodule of `pkg.sub` (resolves to `pkg/sub/z.py` or `pkg/sub/z/__init__.py` if it exists) and otherwise resolves to `pkg/sub/__init__.py` with `z` left as an unresolved symbol name (symbol-level resolution is Phase C's job — Phase B only needs to return "which file, if any, does this import land in").

### AC-3: Relative import resolution (`from . import x`, `from ..pkg import y`)
Given a file's own dotted module path and relative-import statements at varying dot-levels
When resolved
Then dot-level semantics follow Python's actual rule (verify against real CPython behavior, don't assume): a single dot (`from . import x`) means "from my own containing package," where a module's containing package is its parent directory's package and a package's (`__init__.py`) own containing package is itself — i.e. `from . import x` in both `pkg/sub/mod.py` and `pkg/sub/__init__.py` resolves relative to `pkg.sub`; each additional dot walks one more package level up (`from .. import y` in `pkg/sub/mod.py` resolves relative to `pkg`). A relative import walking above the topmost known package returns unresolved (null), not a crash or a resolved-outside-root path.

### AC-4: src-layout / import-root detection
Given a repo using `src/` layout (`src/pkg/mod.py`, no `__init__.py` at repo root) vs a flat layout (`pkg/mod.py` at repo root)
When import roots are detected via directory heuristics alone (presence/absence of `__init__.py` chains, `src/` directory conventions — no TOML parsing, no new dependency)
Then dotted paths are computed relative to the correct root in both layouts (`src/pkg/mod.py` → `pkg.mod`, not `src.pkg.mod`), and mixed/ambiguous layouts degrade to best-effort (repo-relative dotted path) rather than throwing.

### AC-5: Alias handling carries through to the resolved result
Given imports using `as` aliases (`import pkg.mod as m`, `from pkg import mod as m`)
When resolved
Then the result carries both the resolved file (or null) and the local binding name introduced into the importing module's namespace (the alias if present, else the natural name) — unused by Phase B itself but required shape for Phase C's reference walk.

### AC-6: Exhaustive fixture-tree unit suite
Given hand-built fixture directory trees covering: regular packages, deeply nested relative imports, src-layout, aliasing, and an import target that does not exist on disk
When the unit suite runs
Then every fixture's expected resolution (file path or null) matches the actual result, including the negative case (nonexistent target → `null`, no throw).

### AC-7: Import-resolution-rate harness on real repos
Given `pip` (`src/pip/_internal`) and `httpie` checked out at pinned SHAs (per `python-support-design.md` §3's corpus repo choices)
When a harness script parses every import statement in each checkout and attempts resolution via this module
Then it reports a resolution rate (resolved / total import statements) for each repo, and that rate is **≥95%** for both — the number is recorded in PROGRESS/SUMMARY, not asserted from vibes. This mirrors the design doc's Phase B "Done" bar exactly.

## Tasks

### T1: Parse Python import statements via tree-sitter
- files: `src/graph/python/import-parser.ts`, `test/graph-python-import-parser.test.ts`
- action: Add `parsePythonImports(source: string): PythonImport[]` reusing the `python` grammar cached by `getParser` (`src/syntactic/parse.ts`, phase 43) to walk `import_statement` / `import_from_statement` nodes into structured records — `{ kind: "import" | "from", moduleSegments: string[], relativeDots: number, names: { name, alias? }[], isStar: boolean }`. Probe the real grammar's node/field names for these two statement kinds before locking the walk (same discipline phase 43 used for control-flow nodes — don't assume, verify).
- verify: unit tests for `import a.b.c`, `import a.b as x`, `from x import a, b as c`, `from . import x`, `from ..pkg import y`, `from x import *`.
- done: AC-2, AC-3, AC-5 (parsing half — resolution is T3)

### T2: Build the dotted-path/file module map and import-root detection
- files: `src/graph/python/module-resolver.ts`, `test/graph-python-module-resolver.test.ts`
- action: `detectImportRoots(repoRoot, files): string[]` (directory-heuristic src-layout vs flat-layout detection, AC-4) and `buildPythonModuleMap(files, importRoots): PythonModuleMap` (bidirectional dotted-path ↔ file map, `__init__.py` mapping to its package's own dotted path per AC-1).
- verify: fixture-tree unit tests covering AC-1 (regular packages) and AC-4 (src-layout vs flat, mixed/ambiguous degrades to best-effort).
- done: AC-1, AC-4

### T3: Resolve imports (absolute, relative, aliased) against the module map
- files: `src/graph/python/module-resolver.ts` (extend), `test/graph-python-module-resolver.test.ts` (extend)
- action: `resolvePythonImport(fromFile, imp: PythonImport, map: PythonModuleMap): ResolvedImport[]` — absolute resolution with submodule-first-then-package fallback (AC-2), relative dot-level walk from the importing file's *containing package* per the module/`__init__.py` distinction spelled out in AC-3 (verify the dot-level rule against real CPython semantics before coding it, not from memory), and alias/local-binding-name carried in the result (AC-5). Nonexistent targets resolve to `null`, never throw.
- verify: unit tests including the negative case (missing target → `null`) and a ≥2-level relative-import fixture (`from ..pkg import y` from a nested module).
- done: AC-2, AC-3, AC-5

### T4: Exhaustive fixture-tree unit suite
- files: `test/fixtures/python-module-resolver/**` (small hand-built directory trees: regular-package, deep-relative-imports, src-layout, aliasing, missing-target), `test/graph-python-module-resolver.test.ts` (consolidate)
- action: Build the fixture trees enumerated in AC-6 and assert every case's expected resolution (file path or `null`) against the actual result.
- verify: `npm test -- python-module-resolver` green, all fixture cases covered.
- done: AC-6

### T5: Import-resolution-rate harness against pip + httpie
- files: `scripts/python-import-resolution-rate.mjs`, `.cadence/phases/44-python-module-resolver/44-00-PROGRESS.json` (record the measured rates in task notes)
- action: A standalone Node script taking a local repo checkout path — walk all `.py` files, parse every import statement (T1), resolve each (T2/T3), print resolved/total and the rate. Run manually against pinned-SHA local checkouts of `pip` and `httpie` (per `python-support-design.md` §3's corpus repo choices — clone locally for this measurement, do not vendor the repos into necro).
- verify: both `pip` and `httpie` resolution rates are **≥95%**; record both numbers (repo, sha, rate) in this task's `--notes` on completion — this is a one-time recorded measurement (like Phase D's later corpus gate, but not itself a CI-blocking automated test, since pip/httpie aren't vendored into the repo).
- done: AC-7

## Boundaries

- DO NOT wire this module into `necro scan`, discovery/config (`DEFAULT_CONFIG.include`, `SKIP_DIRS`), or `buildReachabilityModel` — that integration is Phase C's job.
- DO NOT add `fix --write` or `verify-removal` support for Python.
- DO NOT add a new npm dependency (no TOML parser, no Python runtime shell-out) — src-layout detection stays heuristic per AC-4.
- DO NOT implement PEP 420 namespace-package resolution — explicitly deferred (Constraints).
- DO NOT vendor the `pip`/`httpie` checkouts into the repo — T5's harness runs against a local clone, not a committed fixture corpus (that pattern is reserved for Phase D's labeled corpus).
